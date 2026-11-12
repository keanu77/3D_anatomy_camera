import { AdditiveBlending, Color, DoubleSide, Matrix4, NormalBlending, ShaderMaterial, Vector4 } from 'three';
import { SURFACE } from './render-style.js';

// Local clipping coordinates deliberately remain independent of orbit and camera
// projection: picking.js evaluates the identical published half-space.
const vertex = `
varying vec3 viewSurface;
varying vec3 viewNormal;
varying vec3 cutPosition;
uniform mat4 uToHead;
void main() {
  vec4 cameraVertex = modelViewMatrix * vec4(position, 1.0);
  viewSurface = cameraVertex.xyz;
  viewNormal = normalMatrix * normal;
  cutPosition = (uToHead * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * cameraVertex;
}`;
const fragment = `
varying vec3 viewSurface;
varying vec3 viewNormal;
varying vec3 cutPosition;
uniform vec3 uColor, uSolidColor, uMaskColor;
uniform float uOrtho, uMode, uGain, uOpacity, uFeather, uBase;
uniform float uClipOn, uCutSoft;
uniform vec4 uClip;
uniform float uRimPower, uRimStrength, uFloor, uXrayAlpha, uSoftEdge;
uniform float uAmbient, uDiffuse, uSpecular;
void main() {
  float coverage = uOpacity;
  if (uClipOn > 0.5) {
    float distanceToCut = dot(cutPosition, uClip.xyz) - uClip.w;
    if (distanceToCut < 0.0) discard;
    coverage *= smoothstep(0.0, max(0.0001, uCutSoft), distanceToCut);
  }
  vec3 normal = normalize(viewNormal);
  vec3 towardViewer = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-viewSurface);
  float incidence = abs(dot(normal, towardViewer));
  float rim = pow(1.0 - incidence, uRimPower);
  float edgeCoverage = mix(1.0, smoothstep(0.0, uSoftEdge, incidence), uFeather);
  if (uMode > 1.5) {
    gl_FragColor = vec4(uMaskColor, coverage);
  } else if (uMode > 0.5) {
    float light = abs(dot(normal, normalize(vec3(-0.35, 0.6, 1.0))));
    float specular = pow(incidence, 18.0) * uSpecular;
    gl_FragColor = vec4(uSolidColor * uGain * (uAmbient + uDiffuse * light + specular), coverage);
  } else {
    float luminosity = uFloor + uBase + uRimStrength * rim;
    gl_FragColor = vec4(uColor * uGain * luminosity, coverage * edgeCoverage * uXrayAlpha);
  }
}`;

export function makeMaterial(color, solidColor = color) {
  const scalar = value => ({ value });
  return new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true,
    side: DoubleSide, blending: AdditiveBlending, depthTest: false, depthWrite: false,
    uniforms: {
      uColor: scalar(new Color(color)), uSolidColor: scalar(new Color(solidColor)), uMaskColor: scalar(new Color(SURFACE.mask)),
      uOrtho: scalar(0), uMode: scalar(0), uGain: scalar(1), uOpacity: scalar(1), uFeather: scalar(0), uBase: scalar(0),
      uClipOn: scalar(0), uCutSoft: scalar(0), uClip: scalar(new Vector4()), uToHead: scalar(new Matrix4()),
      uRimPower: scalar(SURFACE.rimPower), uRimStrength: scalar(SURFACE.rimStrength), uFloor: scalar(SURFACE.diffuseFloor),
      uXrayAlpha: scalar(SURFACE.xrayAlpha), uSoftEdge: scalar(SURFACE.softEdge),
      uAmbient: scalar(SURFACE.ambient), uDiffuse: scalar(SURFACE.diffuse), uSpecular: scalar(SURFACE.specular),
    },
  });
}

export function setMaterialMode(material, mode) {
  const solid = mode === 1;
  material.uniforms.uMode.value = mode;
  if (material.userData.mode === mode) return;
  material.userData.mode = mode;
  material.blending = mode === 0 ? AdditiveBlending : NormalBlending;
  material.depthTest = solid;
  material.depthWrite = solid;
  material.needsUpdate = true;
}
