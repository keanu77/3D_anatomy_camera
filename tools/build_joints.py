#!/usr/bin/env python3
"""Derive selected connective tissues from actual pinned BodyParts3D 3.0 OBJ files.

This is not a complete joint anatomy atlas. The supplied archive contains spinal
disks, costal cartilage, selected membranes, ligaments and Achilles tendons.
"""
from __future__ import annotations

import argparse
import json
import os

import fast_simplification
import numpy as np

from build_body import (
    Atlas, ATTRIBUTION, BASE, CACHE, OUT, PREVIEWS, SOURCES,
    demo_pose, fetch_sources, reference_points, sha, torso_basis,
)
from build_muscles import source_frame


DISKS = {
    "cervical_discs": ["FMA25058", "FMA13896", "FMA13897", "FMA13898", "FMA13899", "FMA13900"],
    "thoracic_discs": ["FMA10458", "FMA13495", "FMA13500", "FMA13501", "FMA13502", "FMA13503", "FMA13504", "FMA13505", "FMA13506", "FMA13507", "FMA13508", "FMA13509"],
    "lumbar_discs": ["FMA16033", "FMA16034", "FMA16035", "FMA16036", "FMA16037"],
}
PAIRS = [
    ("costal_cartilage", "Costal", "torso", 7000,
     ["BP24", "FMA8005", "FMA8031", "FMA8058", "FMA8167", "FMA8112", "FMA8221", "FMA8275"],
     ["BP28", "FMA7875", "FMA7886", "FMA7913", "FMA7976", "FMA8070", "FMA8194", "FMA8248"]),
    ("inguinal_ligament", "Inguinal lig", "torso", 1800, ["FMA21965"], ["FMA21964"]),
    ("forearm_membrane", "Forearm mem", "forearm", 2200, ["FMA23708"], ["FMA23707"]),
    ("leg_membrane", "Leg membrane", "shin", 4000, ["FMA35193"], ["FMA35192"]),
    ("achilles_tendon", "Achilles", "shin", 4000, ["FMA264844"], ["FMA258847"]),
    ("plantar_ligament", "Plantar lig", "foot", 2500, ["FMA44250"], ["FMA44249"]),
]
# Three spinal groups + six bilateral groups = 15 meshes. Each costal group
# includes the eight actual source parts; source IDs are never counted twice.
UNSUPPORTED = [
    "No individually named source OBJ surfaces for knee/shoulder/hip articular cartilage, menisci, labra, cruciate or collateral ligaments were found in the supplied 3.0 inventory.",
    "This layer does not provide complete joint capsules, all ligaments, all tendons or a complete cartilage atlas.",
    "Nasal/thyroid cartilage, intermediate neck tendons, wrist retinacula and the pelvic tendinous arch are outside this torso/limb bundle.",
]
LIMITATIONS = [
    "Reference anatomy for educational visualization, not patient-specific joint anatomy, ligament integrity or tendon pathology.",
    "Rigid torso/limb/foot frames do not simulate joint articulation, ligament tension, tendon sliding or tissue deformation.",
    "Achilles tendons follow the lower-leg frame across the ankle; plantar ligaments follow the foot as one rigid region.",
    "Spinal disks follow the torso; individual vertebral motion and cervical bending are not modeled.",
    "Source surfaces may overlap muscle OBJ tendon portions; this bundle does not imply separate nonoverlapping tissue compartments.",
]


def specifications(atlas):
    reverse = {concept: name for name, concept in atlas.names.items()}
    specs = []
    for region, ids in DISKS.items():
        specs.append(dict(name=f"joint_{region}", region=region, side="M", frame="torso",
                          label={"cervical_discs": "Cerv discs", "thoracic_discs": "Thor discs", "lumbar_discs": "Lumbar discs"}[region],
                          cervical=region == "cervical_discs", budget={"cervical_discs": 3500, "thoracic_discs": 14000, "lumbar_discs": 10000}[region], elements=ids))
    for region, label, rig, budget, left, right in PAIRS:
        for side, delta, ids in [("L", 0, left), ("R", 1, right)]:
            spec = dict(name=f"joint_{region}_{side}", region=region, side=side,
                        frame="torso" if rig == "torso" else "foot" if rig == "foot" else "bone",
                        label=f"{label} {side}", budget=budget, elements=ids)
            if rig == "forearm": spec["landmarks"] = [13 + delta, 15 + delta]
            elif rig == "shin": spec["landmarks"] = [25 + delta, 27 + delta]
            elif rig == "foot": spec["landmarks"] = [27 + delta, 29 + delta, 31 + delta]
            specs.append(spec)
    used = set()
    for spec in specs:
        spec["elements"] = sorted(spec["elements"])
        if used.intersection(spec["elements"]): raise ValueError("Duplicate connective source component")
        used.update(spec["elements"])
        spec["concepts"] = []
        for element in spec["elements"]:
            if element not in atlas.files: raise ValueError(f"Missing actual source OBJ: {element}")
            name = reverse[element]
            if spec["side"] != "M" and ("left" if spec["side"] == "L" else "right") not in name.split():
                raise ValueError(f"Source side contradicts rig side: {element}: {name}")
            spec["concepts"].append(dict(id=element, name=name))
    return specs


def build():
    atlas = Atlas()
    points, torso_points, methods, height, floor, ceiling = reference_points(atlas)
    origin, torso = torso_basis(torso_points)
    companion = json.loads((OUT / "body.json").read_text())
    for key, expected in [("referencePoseCm", points), ("torsoReferencePoseCm", torso_points)]:
        if companion[key] != {str(k): v.tolist() for k, v in expected.items()}:
            raise ValueError(f"Companion reference changed: {key}")
    pose = demo_pose(torso_points, floor, ceiling)
    if pose != companion["demoPose"]: raise ValueError("Demo pose differs from existing atlas")
    specs = specifications(atlas)
    source_ids = sorted({e for spec in specs for e in spec["elements"]})
    existing = {e for m in companion["meshes"] for e in m["sourceElements"]}
    if existing.intersection(source_ids): raise ValueError("Connective tissue bundle duplicates existing body source OBJ files")
    binary, meshes, labels, views = bytearray(), [], [], []
    for spec in specs:
        vv, ff, offset = [], [], 0
        for element in spec["elements"]:
            v, f = atlas.load_element(element)
            if spec["side"] != "M" and v[:, 0].mean() * (1 if spec["side"] == "L" else -1) <= 0:
                raise ValueError(f"Source geometric side contradicts label: {element}")
            vv.append(v); ff.append(f + offset); offset += len(v)
        v, f = np.concatenate(vv), np.concatenate(ff)
        source_triangles = len(f)
        v, remap = np.unique(v, axis=0, return_inverse=True)
        f = remap[f].astype(np.int32)
        if len(f) > spec["budget"]: v, f = fast_simplification.simplify(v, f, target_count=spec["budget"], agg=7.0)
        if len(v) > 65535 or len(f) > spec["budget"]: raise ValueError("Connective mesh budget exceeded")
        frame_origin, basis = source_frame(spec, points, origin, torso)
        local = np.linalg.solve(basis, (v - frame_origin).T).T
        minimum, size = local.min(0), local.max(0) - local.min(0)
        if not np.isfinite(local).all() or np.any(size <= 0): raise ValueError("Invalid connective geometry")
        q = np.rint((local - minimum) / size * 65535).clip(0, 65535).astype("<u2")
        off_v = len(binary); binary += q.tobytes()
        off_i = len(binary); binary += np.asarray(f, dtype="<u2").tobytes()
        entry = {k: spec[k] for k in ["name", "region", "side", "frame", "landmarks", "cervical"] if k in spec}
        entry.update(layer="joints", nv=len(v), ni=int(f.size), min=minimum.tolist(), size=size.tolist(), offV=off_v, offI=off_i,
                     sourceTriangles=source_triangles, triangleBudget=spec["budget"], sourceElements=spec["elements"],
                     sourceConcepts=spec["concepts"], sourceFrame=dict(originCm=frame_origin.tolist(), basisColumnsCm=basis.T.tolist()))
        if spec["frame"] == "bone":
            entry["jointAnchors"] = [[0, 0, 0], [1, 0, 0]]
            entry["jointAnchorMethod"] = "companion skeletal reference joints; not tissue attachment sites"
        anchor = local[np.argmin(np.linalg.norm(local - local.mean(0), axis=1))]
        labels.append(dict(t=spec["label"], layer="joints", mesh=spec["name"], pts=[anchor.tolist()]))
        meshes.append(entry); views.append((spec, v, f))
        print(f"{spec['name']}: {len(spec['elements'])} source parts; {source_triangles} -> {len(f)} triangles", flush=True)
    meta = dict(schemaVersion=1, format="quantized-uint16-le", layer="joints", meshes=meshes, labels=labels,
                binaryBytes=len(binary), binarySha256=sha(binary), companionBodyBinarySha256=companion["binarySha256"],
                attribution=ATTRIBUTION, license="CC-BY-SA-2.1-JP", licenseUrl="https://creativecommons.org/licenses/by-sa/2.1/jp/",
                source=dict(dataset="BodyParts3D", version="3.0", archiveDate="2011-09-15", sourceUnit="mm", outputUnit="cm",
                            transform="[x, z, -y] / 10", downloads=[dict(url=BASE + remote, sha256=expected) for remote, expected in SOURCES.values()],
                            elementCount=len(source_ids), elementIds=source_ids,
                            officialLicensePage="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html"),
                referencePoseCm=companion["referencePoseCm"], torsoReferencePoseCm=companion["torsoReferencePoseCm"],
                referenceMethods=methods, measuredSourceHeightCm=height, demoPose=pose, demoAspect=companion["demoAspect"],
                coverage=dict(regions=list(DISKS) + [p[0] for p in PAIRS], sourceComponents=len(source_ids), regionCount=len(specs),
                              scope="Selected spinal/cartilage/ligament/tendon/membrane surfaces, not complete joint anatomy", excluded=UNSUPPORTED),
                limitations=LIMITATIONS)
    metadata = json.dumps(meta, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n"
    if len(binary) + len(metadata) > 1_000_000: raise ValueError("Connective tissue bundle exceeds 1 MB budget")
    return bytes(binary), metadata, views


def previews(meshes):
    os.environ.setdefault("MPLCONFIGDIR", str(CACHE / "matplotlib"))
    os.environ.setdefault("XDG_CACHE_HOME", str(CACHE))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    colors = {"cervical_discs": "#9ec5f3", "thoracic_discs": "#8cb2e1", "lumbar_discs": "#b3d6f0", "costal_cartilage": "#abd7d0",
              "inguinal_ligament": "#e8dbaf", "forearm_membrane": "#c3c6e4", "leg_membrane": "#c3c6e4",
              "achilles_tendon": "#eee0bf", "plantar_ligament": "#d9be9a"}
    def paint(ax, items, view):
        axes, depth = ([0, 1], 2) if view in ["front", "back"] else ([2, 1], 0)
        tri, depths, shades = [], [], []
        for spec, v, f in items:
            t = v[f]; tri.append(t[:, :, axes]); depths.append(t[:, :, depth].mean(1)); shades.extend([colors[spec["region"]]] * len(f))
        tri, depths = np.concatenate(tri), np.concatenate(depths)
        order = np.argsort(depths, kind="stable")
        if view == "back": order = order[::-1]
        ax.add_collection(PolyCollection(tri[order], facecolors=np.asarray(shades)[order], edgecolors="none", rasterized=True))
        ax.autoscale_view(); ax.set_aspect("equal"); ax.set_facecolor("#101522"); ax.tick_params(colors="white", labelsize=8)
        if view == "back": ax.invert_xaxis()
        ax.set_title(view.capitalize() + " / source cm", color="white", fontsize=10)
    for view in ["front", "back", "side"]:
        fig, ax = plt.subplots(figsize=(7, 12), dpi=140, facecolor="#101522")
        paint(ax, meshes, view); fig.suptitle("BodyParts3D 3.0 / selected connective tissues", color="white")
        fig.savefig(PREVIEWS / f"preview_joints_{view}.png", bbox_inches="tight"); plt.close(fig)
    for region in list(DISKS) + [p[0] for p in PAIRS]:
        fig, axes = plt.subplots(1, 3, figsize=(11, 7), dpi=110, facecolor="#101522")
        items = [m for m in meshes if m[0]["region"] == region]
        for ax, view in zip(axes, ["front", "back", "side"]): paint(ax, items, view)
        fig.suptitle("Connective tissue / " + region, color="white")
        fig.savefig(PREVIEWS / f"preview_joints_region_{region}.png", bbox_inches="tight"); plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--no-previews", action="store_true")
    args = parser.parse_args()
    immutable = {name: sha((OUT / name).read_bytes()) for name in ["head.bin", "head.json", "body.bin", "body.json", "muscles.bin", "muscles.json"]}
    fetch_sources()
    binary, metadata, meshes = build()
    for name, data in [("joints.bin", binary), ("joints.json", metadata)]:
        path = OUT / name
        if args.verify:
            if path.read_bytes() != data: raise SystemExit(f"Deterministic connective rebuild differs: {name}")
        else: path.write_bytes(data)
    if not args.no_previews: previews(meshes)
    for name, digest in immutable.items():
        if sha((OUT / name).read_bytes()) != digest: raise SystemExit(f"Existing anatomy artifact changed: {name}")
    print(f"{'Verified byte-identical' if args.verify else 'Built'} joints bundle: {len(binary):,} bytes binary; {len(binary)+len(metadata):,} bytes combined; sha256={sha(binary)}")


if __name__ == "__main__": main()
