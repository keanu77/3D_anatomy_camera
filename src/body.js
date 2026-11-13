import * as THREE from 'three';
import {landmarkToPoint,torsoBasis,boneBasis,footBasis,segmentVisible,transformPoint,palmNormal} from './basis.js';
import {createPointFilter} from './one-euro.js';
import { PALETTE as COLORS, ORGAN_COLORS, SOLID, GAINS, BASE_LIGHT, SURFACE, solidGain } from './render-style.js';

const SKELETAL_LAYERS=['spine','organs','arms','legs'];
const NERVE_LAYERS=['nerves','peripheralNerves'];
const BODY_LAYERS=[...SKELETAL_LAYERS,'bodyMuscles','joints',...NERVE_LAYERS];
const HEAD_IDENTITY=new THREE.Matrix4().elements;
export const bodyEnabled=settings=>BODY_LAYERS.some(k=>settings[k]);

// getFocus returns null, or {includes(rig),labels(rig)} while one body region is isolated.
// Frames whose meshes hang under something else than the stage root and so take no part in its bounds.
const OWN_FRAMES=['head','hand'];
// getHandContext() -> { rigs: [{ group, palm, bones, anatomicalSide }], bones: [[from, to], ...] }: the separately tracked hand rigs.
export function createBodyRenderer({settings:S,state,getSize,getHeadContext=()=>null,getHandContext=()=>null,getFocus=()=>null,makeMaterial,decodeGeometry,asset}) {
  const scene=new THREE.Scene();
  // Everything tracked in stage pixels hangs under one root, so a frozen view can be turned as a whole.
  const root=new THREE.Group();root.matrixAutoUpdate=false;scene.add(root);
  let rigs=[],disposed=false;
  const bundles={
    body:{name:'body',layers:SKELETAL_LAYERS,enabled:()=>SKELETAL_LAYERS.some(k=>S[k])},
    muscles:{name:'muscles',layers:['bodyMuscles'],enabled:()=>!!S.bodyMuscles},
    joints:{name:'joints',layers:['joints'],enabled:()=>!!S.joints},
    nerves:{name:'nerves',layers:['nerves'],enabled:()=>!!S.nerves},
    peripheral:{name:'peripheral',layers:['peripheralNerves'],enabled:()=>!!S.peripheralNerves},
  };
  for(const bundle of Object.values(bundles)) Object.assign(bundle,{meta:null,rigs:[],pending:null,controller:null,failure:null,retryAt:0,generation:0});
  let smoothed=null,lastNow=0,lastSeen=0,visibleParts=0,holdVeil=false;
  const poseFilter=createPointFilter(33);
  let veilCanvas=null,veilContext=null,maskPixels=null,lastMaskAt=-Infinity;
  const diagnostics={bodyLoaded:false,bodyError:null,bodySegments:[],muscleSegments:[],jointSegments:[],nerveSegments:[],peripheralSegments:[],visibleParts:0,visibleLayers:{}};

  function cancelLoad(bundle) {
    if(!bundle.pending) return;
    bundle.generation++;bundle.controller?.abort();bundle.controller=null;bundle.pending=null;
  }

  function reconcileLoads({cancelAll=false}={}) {
    for(const bundle of Object.values(bundles)) if(cancelAll||!bundle.enabled()) cancelLoad(bundle);
  }

  async function ensureBundle(bundle) {
    if(!bundle.enabled()||disposed) return false;
    if(bundle.meta) return true;
    if(bundle.pending) return bundle.pending;
    if(performance.now()<bundle.retryAt) return false;
    const generation=++bundle.generation,controller=new AbortController();
    bundle.controller=controller;
    bundle.pending=(async()=>{
      const created=[];
      let geometries=null;
      try {
        const responses=await Promise.all([
          fetch(asset(`anatomy/${bundle.name}.json`),{signal:controller.signal}),
          fetch(asset(`anatomy/${bundle.name}.bin`),{signal:controller.signal}),
        ]);
        if(responses.some(r=>!r.ok)) throw new Error(`Could not load ${bundle.name} anatomy`);
        const [nextMeta,buffer]=await Promise.all([responses[0].json(),responses[1].arrayBuffer()]);
        if(disposed||!bundle.enabled()||generation!==bundle.generation) return false;
        if(!Array.isArray(nextMeta.meshes)||nextMeta.meshes.some(entry=>!bundle.layers.includes(entry.layer)||!['torso','bone','foot','head','hand'].includes(entry.frame))) throw new Error(`Invalid ${bundle.name} layer metadata`);
        if(nextMeta.meshes.some(entry=>entry.frame==='head')&&!getHeadContext()?.group) throw new Error('Head reference is unavailable');
        const handContext=nextMeta.meshes.some(entry=>entry.frame==='hand')?getHandContext():null;
        if(nextMeta.meshes.some(entry=>entry.frame==='hand')&&!handContext?.rigs?.length) throw new Error('Hand reference is unavailable');
        // The piece of a hand rig a hand-frame mesh rides on: the palm block or one finger bone.
        const handParent=(entry,rig)=>{
          if(entry.handParent==='hand_palm') return rig.palm;
          const index=handContext.bones.findIndex(([a,b])=>entry.handParent===`hand_b_${a}_${b}`);
          if(index<0) throw new Error(`Invalid ${bundle.name} hand metadata`);
          return rig.bones[index];
        };
        geometries=decodeGeometry(nextMeta,buffer);
        // A hand-frame mesh is drawn once on each of the two hand rigs; every other mesh once.
        const placements=nextMeta.meshes.flatMap(entry=>entry.frame==='hand'?handContext.rigs.map((rig,hand)=>({entry,hand,parent:handParent(entry,rig)})):[{entry}]);
        for(const {entry,hand,parent} of placements) {
          const muscle=entry.layer==='bodyMuscles';
          const color=ORGAN_COLORS[entry.name]??COLORS[entry.layer]??COLORS.spine;
          const material=makeMaterial(color,muscle?SOLID.muscles:['organs','joints',...NERVE_LAYERS].includes(entry.layer)?color:SOLID.skull);
          material.uniforms.uOrtho.value=entry.frame==='head'?0:1;
          const mesh=new THREE.Mesh(geometries[entry.name],material);
          // A nerve is a tube a few pixels wide: with only its rim glowing it breaks into dots, so light its whole width.
          material.uniforms.uBase.value=BASE_LIGHT[entry.layer]??BASE_LIGHT.body;
          mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;mesh.visible=false;
          mesh.renderOrder=NERVE_LAYERS.includes(entry.layer)?4:muscle?3:entry.layer==='organs'?2:1;
          created.push({entry,mesh,alpha:0,valid:false,bundle:bundle.name,hand,parent});
        }
        // Install atomically so a cancelled or malformed bundle cannot leave partial rigs.
        for(const rig of created) (rig.parent??(rig.entry.frame==='head'?getHeadContext().group:root)).add(rig.mesh);
        bundle.meta=nextMeta;bundle.rigs=created;bundle.failure=null;
        rigs=Object.values(bundles).flatMap(value=>value.rigs);
        return true;
      } catch(error) {
        for(const rig of created) {rig.mesh.removeFromParent();rig.mesh.material.dispose();}
        for(const geometry of Object.values(geometries??{})) geometry.dispose();
        if(error.name!=='AbortError'&&generation===bundle.generation&&!disposed) {
          bundle.failure=error.message;bundle.retryAt=performance.now()+5000;
        }
        return false;
      } finally {
        if(generation===bundle.generation) {bundle.pending=null;bundle.controller=null;}
      }
    })();
    return bundle.pending;
  }

  async function ensureLoaded() {
    if(disposed) return false;
    const selected=Object.values(bundles).filter(bundle=>bundle.enabled());
    reconcileLoads();
    if(!selected.length) return false;
    const loaded=await Promise.all(selected.map(ensureBundle));
    return loaded.every(Boolean);
  }

  function basisFor(entry,points,torso,hands) {
    if (entry.frame==='torso') return torso;
    const ids=entry.landmarks;
    if (!ids?.length) return null;
    if (entry.frame==='foot') return footBasis(points[ids[0]],points[ids[1]],points[ids[2]]);
    let roll=torso?[torso[8],torso[9],torso[10]]:[0,0,1];
    if (entry.name.includes('forearm') && hands?.landmarks?.length) {
      const wristIndex=entry.side==='L'?15:16;
      const wrist=points[wristIndex];
      let best=null,distance=Infinity;
      const {width,height}=getSize();
      for (const hand of hands.landmarks) {
        if (!hand[0] || !hand[5] || !hand[17]) continue;
        const hp=landmarkToPoint(hand[0],width,height);
        const d=Math.hypot(hp[0]-wrist[0],hp[1]-wrist[1]);
        if (d<distance) {distance=d;best=hand;}
      }
      if (best && distance<width*0.12) {
        // Source local e2 is anterior. The transverse knuckle vector would
        // rotate every forearm by a quarter-turn when a hand becomes visible.
        roll=palmNormal(landmarkToPoint(best[0],width,height),landmarkToPoint(best[5],width,height),landmarkToPoint(best[17],width,height),entry.side)??roll;
      }
    }
    return boneBasis(points[ids[0]],points[ids[1]],roll);
  }

  function setClip(uniforms) {
    const {width:W,height:H}=getSize();
    let on=0,x=0,y=0,w=0;
    if(S.reveal==='left') {on=1;x=state.mirror?1:-1;w=state.mirror?S.cut*W:-(1-S.cut)*W;}
    if(S.reveal==='right') {on=1;x=state.mirror?-1:1;w=state.mirror?-(1-S.cut)*W:S.cut*W;}
    if(S.reveal==='top') {on=1;y=1;w=(1-S.cut)*H;}
    if(S.reveal==='bottom') {on=1;y=-1;w=-S.cut*H;}
    uniforms.uClipOn.value=on;uniforms.uClip.value.set(x,y,0,w);
    uniforms.uCutSoft.value=S.feather*Math.min(W,H)*0.06;
  }

  // hold: the picture is frozen. Keep the last smoothed pose and the last veil instead of filtering the same frame again.
  // settle: this pose was inferred from the frozen picture itself. Take it as measured; smoothing would trail the still image.
  function update({now,pose,hands,face,instant=false,hold=false,settle=false}) {
    holdVeil=hold||settle;
    const enabled=bodyEnabled(S),focus=getFocus();
    for(const bundle of Object.values(bundles)) {
      if(!bundle.enabled()) cancelLoad(bundle);
      else if(!bundle.meta) void ensureBundle(bundle);
    }
    const elapsed=lastNow?Math.min(100,Math.max(0,now-lastNow)):16.67;lastNow=now;
    const lms=pose?.landmarks?.[0];
    if(lms?.length===33&&hold&&smoothed) lastSeen=now;
    else if(lms?.length===33) {
      const {width,height}=getSize();
      const fresh=settle||!smoothed||now-lastSeen>250;
      if(fresh) poseFilter.reset();
      const raw=lms.map((p,i)=>{
        const next=landmarkToPoint(p,width,height);
        return next.every(Number.isFinite)?next:smoothed?.[i]??[0,0,0];
      });
      // Tracker noise is a few pixels at any stage size; speeds are compared on a 640-pixel reference.
      smoothed=poseFilter.filter(raw,fresh?0:(now-lastSeen)/1000,640/Math.min(width,height));
      lastSeen=now;
    }
    const fresh=!!lms?.length && now-lastSeen<250;
    const torso=smoothed?torsoBasis(smoothed):null;
    let neckAligned=true;
    const nose=face?.faceLandmarks?.[0]?.[1];
    if(nose&&lms?.[0]) {
      const {width,height}=getSize();
      neckAligned=Math.hypot((nose.x-lms[0].x)*width,(nose.y-lms[0].y)*height)<Math.min(width,height)*0.12;
    }
    visibleParts=0;diagnostics.bodySegments=[];diagnostics.muscleSegments=[];diagnostics.jointSegments=[];diagnostics.nerveSegments=[];diagnostics.peripheralSegments=[];
    diagnostics.visibleLayers=Object.fromEntries(BODY_LAYERS.map(layer=>[layer,0]));
    for(const rig of rigs) {
      const {entry,mesh}=rig;
      const headFrame=entry.frame==='head',headContext=headFrame?getHeadContext():null;
      // A hand-frame mesh is a child of a hand rig piece: it needs no pose, only that hand being shown.
      const handFrame=entry.frame==='hand',ownFrame=headFrame||handFrame;
      const ids=entry.frame==='torso'?[11,12,23,24]:entry.landmarks;
      const selected=enabled&&!!S[entry.layer]&&(!focus||focus.includes(rig))&&(!handFrame||!!S.hands);
      const tracked=selected&&(headFrame?!!headContext?.head.found:handFrame?!!getHandContext()?.rigs[rig.hand]?.group.visible:fresh&&segmentVisible(lms,ids)&&(!entry.cervical||neckAligned));
      const basis=tracked?(ownFrame?HEAD_IDENTITY:basisFor(entry,smoothed,torso,hands)):null;
      const target=basis?1:0;
      rig.alpha=instant?target:target?Math.min(1,rig.alpha+elapsed/100):Math.max(0,rig.alpha-elapsed/150);
      if(basis) {mesh.matrix.fromArray(basis);mesh.matrixWorldNeedsUpdate=true;rig.valid=true;if(!ownFrame) visibleParts++;diagnostics.visibleLayers[entry.layer]++;}
      else if(handFrame) rig.valid=false;
      mesh.visible=selected&&rig.valid&&rig.alpha>0.001;
      const solid=S.style==='solid';
      const material=mesh.material,u=material.uniforms;
      if(material.userData.solid!==solid) {
        material.userData.solid=solid;material.blending=solid?THREE.NormalBlending:THREE.AdditiveBlending;
        material.depthTest=solid;material.depthWrite=solid;material.needsUpdate=true;
      }
      u.uMode.value=solid?1:0;
      u.uGain.value=solid?solidGain(S.bright):S.bright*(GAINS[entry.layer]??GAINS.body);
      u.uOpacity.value=rig.alpha;u.uFeather.value=S.feather*0.75;
      // Like the hand bones they ride on, hand nerves are not cut by the reveal plane.
      u.uToHead.value.copy(mesh.matrix);if(!ownFrame) setClip(u);
      if(basis&&entry.frame==='bone') {
        const anchors=entry.jointAnchors??[[0,0,0],[1,0,0]];
        const segments=entry.layer==='bodyMuscles'?diagnostics.muscleSegments:entry.layer==='joints'?diagnostics.jointSegments:entry.layer==='nerves'?diagnostics.nerveSegments:entry.layer==='peripheralNerves'?diagnostics.peripheralSegments:diagnostics.bodySegments;
        segments.push({name:entry.name,landmarks:ids,proximal:transformPoint(basis,anchors[0]),distal:transformPoint(basis,anchors[1]),expectedProximal:smoothed[ids[0]],expectedDistal:smoothed[ids[1]]});
      }
    }
    diagnostics.visibleParts=visibleParts;
    return visibleParts;
  }

  // Called after the head's current reveal plane has been computed. These
  // surfaces are children of the same perspective head group as the eyeballs.
  function syncHead() {
    const context=getHeadContext();if(!context) return;
    const {clipState}=context;
    for(const rig of rigs) if(rig.entry.frame==='head') {
      const u=rig.mesh.material.uniforms;
      u.uClipOn.value=clipState.on;u.uClip.value.set(clipState.x,clipState.y,0,clipState.w);
      u.uCutSoft.value=S.feather*5;
    }
  }

  function drawVeil(g,mask) {
    if(!bodyEnabled(S)||!visibleParts||state.performance==='lite') return;
    // Keep only a drawn canvas between inference frames; never retain an MPMask.
    if(mask) {
      let data,width,height;
      try {data=mask.data??mask.getAsFloat32Array?.();width=mask.width;height=mask.height;}
      catch {return;}
      if(!data||!width||!height||data.length!==width*height) return;
      if(!veilCanvas) {veilCanvas=document.createElement('canvas');veilContext=veilCanvas.getContext('2d');}
      if(veilCanvas.width!==width||veilCanvas.height!==height) {veilCanvas.width=width;veilCanvas.height=height;maskPixels=veilContext.createImageData(width,height);}
      const pixels=maskPixels.data;
      for(let i=0;i<data.length;i++) {const o=i*4;pixels[o]=SURFACE.maskRgb[0];pixels[o+1]=SURFACE.maskRgb[1];pixels[o+2]=SURFACE.maskRgb[2];pixels[o+3]=Math.round(Math.max(0,Math.min(1,data[i]))*255);}
      veilContext.putImageData(maskPixels,0,0);lastMaskAt=lastNow;
    }
    if(!veilCanvas||!holdVeil&&lastNow-lastMaskAt>350) return;
    const {width:W,height:H}=getSize();
    g.save();g.globalAlpha=1-S.real;
    if(['left','right','top','bottom'].includes(S.reveal)) {
      const u={uClipOn:{value:0},uClip:{value:new THREE.Vector4()},uCutSoft:{value:0}};setClip(u);
      const {x,y,w}=u.uClip.value;g.beginPath();
      if(x===1) g.rect(w,0,W-w,H);
      if(x===-1) g.rect(0,0,-w,H);
      if(y===1) g.rect(0,0,W,H-w);
      if(y===-1) g.rect(0,H+w,W,-w);
      g.clip();
    }
    g.drawImage(veilCanvas,0,0,W,H);g.restore();
  }

  function labels(lens) {
    if(!S.labels) return [];
    const {width:W,height:H}=getSize(),result=[],focus=getFocus();
    const atlasLabels=Object.values(bundles).flatMap(bundle=>bundle.enabled()?(bundle.meta?.labels??[]):[]);
    // A focused region names its individual structures; meshes without parts keep their atlas label.
    const named=new Map();
    if(focus) for(const rig of rigs) {const own=rig.mesh.visible?focus.labels(rig):null;if(own) named.set(rig,own);}
    const wanted=atlasLabels.filter(label=>S[label.layer]).map(label=>({label,rig:rigs.find(r=>r.entry.name===label.mesh)}))
      .filter(({rig})=>rig?.mesh.visible&&!named.has(rig)).map(({label,rig})=>({rig,text:label.t,p:label.pts?.[0]}));
    // A nerve cut at a joint is two parts in two meshes; name it once.
    const once=new Set();
    for(const [rig,own] of named) for(const item of own) {
      if(rig.entry.layer==='peripheralNerves'&&once.has(item.text)) continue;
      once.add(item.text);wanted.push({rig,text:item.text,p:item.point,localized:true});
    }
    for(const {rig,text,p,localized} of wanted) {
      if(!p) continue;
      const v=new THREE.Vector3().fromArray(p).applyMatrix4(rig.mesh.matrix);
      const u=rig.mesh.material.uniforms;
      if(u.uClipOn.value&&u.uClip.value.x*v.x+u.uClip.value.y*v.y<u.uClip.value.w) continue;
      if(rig.entry.frame!=='head') v.applyMatrix4(root.matrix);
      let px=v.x,py=H-v.y;
      if(rig.entry.frame==='head') {
        const context=getHeadContext();if(!context?.head.found||!context.group.visible) continue;
        v.applyMatrix4(context.group.matrix).applyMatrix4(context.camera.projectionMatrix);
        px=(v.x+1)/2*W;py=(1-v.y)/2*H;
      }
      const ax=state.mirror?W-px:px,ay=py;
      if(ax<0||ax>W||ay<0||ay>H||lens&&Math.hypot(ax-lens.x,ay-lens.y)>lens.r) continue;
      result.push({text,localized,color:'#'+new THREE.Color(ORGAN_COLORS[rig.entry.name]??COLORS[rig.entry.layer]??COLORS.spine).getHexString(),ax,ay});
    }
    return result;
  }

  /** Display-space box around the visible focused meshes, or null when nothing is focused or tracked. */
  const corner=new THREE.Vector3();
  function focusBounds() {
    if(!getFocus()) return null;
    const {width:W,height:H}=getSize(),box={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
    for(const {entry,mesh} of rigs) {
      if(!mesh.visible||OWN_FRAMES.includes(entry.frame)) continue;
      if(!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const {min,max}=mesh.geometry.boundingBox;
      for(let i=0;i<8;i++) {
        corner.set(i&1?max.x:min.x,i&2?max.y:min.y,i&4?max.z:min.z).applyMatrix4(mesh.matrix);
        const x=state.mirror?W-corner.x:corner.x,y=H-corner.y;
        box.minX=Math.min(box.minX,x);box.maxX=Math.max(box.maxX,x);box.minY=Math.min(box.minY,y);box.maxY=Math.max(box.maxY,y);
      }
    }
    return box.minX<=box.maxX?box:null;
  }

  /** Centre of the visible stage-space meshes, in stage pixels with depth: what a turned view pivots on. */
  function orbitPivot() {
    const box=new THREE.Box3(),piece=new THREE.Box3();
    for(const {entry,mesh} of rigs) {
      if(!mesh.visible||OWN_FRAMES.includes(entry.frame)) continue;
      if(!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(piece.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrix));
    }
    return box.isEmpty()?null:box.getCenter(new THREE.Vector3());
  }
  function setOrbit(matrix) {root.matrix.copy(matrix);root.matrixWorldNeedsUpdate=true;}

  function reset() {
    smoothed=null;lastSeen=0;lastMaskAt=-Infinity;visibleParts=0;poseFilter.reset();
    diagnostics.visibleParts=0;diagnostics.visibleLayers=Object.fromEntries(BODY_LAYERS.map(layer=>[layer,0]));
    diagnostics.bodySegments=[];diagnostics.muscleSegments=[];diagnostics.jointSegments=[];diagnostics.nerveSegments=[];diagnostics.peripheralSegments=[];
    for(const r of rigs) {r.alpha=0;r.valid=false;r.mesh.visible=false;}
  }
  function dispose() {
    disposed=true;
    for(const bundle of Object.values(bundles)) cancelLoad(bundle);
    for(const {mesh} of rigs) {mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}
    root.clear();rigs=[];
    for(const bundle of Object.values(bundles)) {bundle.meta=null;bundle.rigs=[];}
    reset();
  }
  function getDiagnostics() {
    const body=bundles.body,muscles=bundles.muscles,joints=bundles.joints,nerves=bundles.nerves,peripheral=bundles.peripheral;
    return {...diagnostics,bodyLoaded:!!body.meta,bodyError:body.failure,bodyLoading:!!body.pending,
      musclesLoaded:!!muscles.meta,musclesError:muscles.failure,musclesLoading:!!muscles.pending,
      muscleMeshCount:muscles.rigs.length,musclesVisible:diagnostics.visibleLayers.bodyMuscles??0,
      jointsLoaded:!!joints.meta,jointsLoading:!!joints.pending,jointsError:joints.failure,jointMeshCount:joints.rigs.length,
      nervesLoaded:!!nerves.meta,nervesLoading:!!nerves.pending,nervesError:nerves.failure,nerveMeshCount:nerves.rigs.length,
      peripheralLoaded:!!peripheral.meta,peripheralLoading:!!peripheral.pending,peripheralError:peripheral.failure,peripheralMeshCount:peripheral.rigs.length,
      nerveHeadVisible:nerves.rigs.filter(r=>r.entry.frame==='head'&&r.mesh.visible&&getHeadContext()?.head.found).length,
      nerveBodyVisible:nerves.rigs.filter(r=>r.entry.frame!=='head'&&r.mesh.visible).length,
      anatomyError:Object.values(bundles).find(bundle=>bundle.enabled()&&bundle.failure)?.failure??null,
      poseFound:visibleParts>0};
  }
  const inspectionTargets=()=>rigs.map(r=>({mesh:r.mesh,parent:r.entry.name,bundle:r.bundle,layer:r.entry.layer,frame:r.entry.frame,
    // Peripheral nerves publish their own part ranges; the other layers take theirs from the individual bundle.
    // A hand-frame mesh exists once per hand and takes its anatomical side from the hand it is on.
    instance:r.hand===undefined?`body:${r.entry.name}`:`hand:${r.hand}:${r.entry.name}`,side:r.hand===undefined?undefined:getHandContext()?.rigs[r.hand]?.anatomicalSide,ownParts:r.entry.parts,inspectable:['spine','arms','legs','bodyMuscles','peripheralNerves'].includes(r.entry.layer)}));
  return {scene,ensureLoaded,reconcileLoads,update,syncHead,drawVeil,labels,focusBounds,orbitPivot,setOrbit,reset,dispose,getDiagnostics,inspectionTargets};
}
