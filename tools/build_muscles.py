#!/usr/bin/env python3
"""Build an independent, deterministic regional muscle atlas from BodyParts3D.

Uses the same pinned official 3.0 archive and source reference frames as build_body.
Never writes head.bin/json or body.bin/json. Run --verify for a byte-identical check.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh

from build_body import (
    Atlas, ATTRIBUTION, BASE, CACHE, OUT, PREVIEWS, ROOT, SOURCES,
    demo_pose, fetch_sources, reference_points, sha, torso_basis, unit,
)


# Regions contain explicit named concepts, resolved to actual OBJ primitive IDs.
# The source has missing aggregate aliases for rectus abdominis and extensor
# carpi ulnaris; use their actual bilateral/part-specific objects explicitly.
REGIONS = [
    ("neck", "Neck", "torso", 3500, [
        "sternocleidomastoid", "scalenus anterior", "scalenus medius", "scalenus posterior",
    ]),
    ("chest", "Pectorals", "torso", 7000, [
        "pectoralis major", "pectoralis minor", "serratus anterior", "subclavius",
    ]),
    ("back", "Back", "torso", 10000, [
        "trapezius", "latissimus dorsi", "rhomboid major", "rhomboid minor",
        "levator scapulae", "serratus posterior inferior", "serratus posterior superior",
        "iliocostalis", "longissimus", "spinalis", "splenius", "multifidus", "semispinalis",
    ]),
    ("abdomen", "Abdominals", "torso", 6500, [
        "left rectus abdominis", "right rectus abdominis",
        "left external oblique", "right external oblique", "internal oblique",
        "transversus abdominis", "quadratus lumborum",
    ]),
    ("scapular", "Scapular", "torso", 6000, [
        "supraspinatus", "infraspinatus muscle", "teres minor", "teres major", "subscapularis",
    ]),
    ("deltoid", "Deltoid", "upperarm", 3500, ["deltoid"]),
    ("upperarm", "Upper arm", "upperarm", 6000, [
        "biceps brachii", "brachialis", "coracobrachialis", "triceps brachii",
    ]),
    ("forearm", "Forearm", "forearm", 9000, [
        "anconeus", "pronator teres", "flexor carpi radialis", "palmaris longus",
        "flexor carpi ulnaris", "flexor digitorum superficialis", "flexor digitorum profundus",
        "flexor pollicis longus", "pronator quadratus", "brachioradialis",
        "extensor carpi radialis longus", "extensor carpi radialis brevis",
        "extensor digitorum", "extensor digiti minimi",
        "humeral head of left extensor carpi ulnaris", "humeral head of right extensor carpi ulnaris",
        "ulnar head of left extensor carpi ulnaris", "ulnar head of right extensor carpi ulnaris",
        "supinator", "abductor pollicis longus", "extensor pollicis brevis",
        "extensor pollicis longus", "extensor indicis",
    ]),
    ("hip", "Hip/gluteal", "torso", 7000, [
        "gluteus maximus", "gluteus medius", "gluteus minimus", "iliopsoas",
        "piriformis", "obturator internus", "gemellus superior", "gemellus inferior", "quadratus femoris",
    ]),
    ("thigh", "Thigh", "thigh", 10000, [
        "tensor fasciae latae", "sartorius", "quadriceps femoris", "pectineus",
        "adductor longus", "adductor brevis", "adductor magnus", "adductor minimus",
        "gracilis", "obturator externus", "biceps femoris", "semitendinosus", "semimembranosus",
    ]),
    ("shin", "Lower leg", "shin", 8000, [
        "tibialis anterior", "extensor digitorum longus", "fibularis tertius", "extensor hallucis longus",
        "fibularis longus", "fibularis brevis", "gastrocnemius", "soleus", "plantaris", "popliteus",
        "tibialis posterior", "flexor digitorum longus", "flexor hallucis longus",
    ]),
    ("foot", "Foot", "foot", 4000, [
        "extensor hallucis brevis", "extensor digitorum brevis", "abductor hallucis", "flexor hallucis brevis",
        "adductor hallucis", "abductor digiti minimi of foot", "opponens digiti minimi of foot",
        "flexor digiti minimi brevis of foot", "flexor digitorum brevis", "flexor accessorius",
        "set of lumbricals of foot", "set of dorsal interossei of foot", "set of plantar interossei of foot",
    ]),
]

LIMITATIONS = [
    "Reference adult anatomy for education, not patient-specific muscle position, volume, strength, or pathology.",
    "Regional rigid rigs do not simulate contraction, muscle bulging, tendon sliding, skin deformation, or tissue collision.",
    "Multi-joint muscles keep their source shape; they do not stretch independently between moving attachments.",
    "Scapular and hip muscles follow the torso basis; scapulothoracic motion and pelvic-femoral attachments are approximate.",
    "Forearm regions do not independently articulate pronation/supination or finger tendons; foot muscles do not articulate individual toes.",
    "Neck regions follow the torso and do not bend with cervical joints or independently match head pose.",
]
EXCLUDED = [
    "Intrinsic hand muscles (existing hand layer displays bones).",
    "Facial and masticatory muscles in this bundle (existing head muscles remain available separately).",
    "Internal thoracic/intercostal, diaphragm, pelvic-floor and perineal muscles.",
    "Deep suboccipital, suprahyoid/infrahyoid and individual segmental interspinal/intertransverse/rotator muscles.",
    "Separate fascial sheets, retinacula and standalone tendons; source muscle OBJ geometry may already include its tendon portions.",
]


def specifications(atlas):
    reverse = {concept: name for name, concept in atlas.names.items()}
    specs, used = [], set()
    for region, label, rig, budget, families in REGIONS:
        elements, family_ids = set(), []
        for family in families:
            concept = atlas.names[family]
            elements.update(atlas.elements(concept))
            family_ids.append(dict(id=concept, name=family))
        if elements & used:
            raise ValueError(f"A source muscle is assigned to two rig regions: {region}: {elements & used}")
        used.update(elements)
        for side, letter, delta in [("left", "L", 0), ("right", "R", 1)]:
            selected = sorted(e for e in elements if side in reverse[e].split())
            if not selected:
                raise ValueError(f"No source surfaces for {region} {side}")
            # Every primitive must have an explicit source-side name. Never infer
            # or invent the missing side by mirroring a contralateral mesh.
            if any(not any(s in reverse[e].split() for s in ["left", "right"]) for e in elements):
                raise ValueError(f"Unpaired/unlabelled element in bilateral region: {region}")
            spec = dict(name=f"muscle_{region}_{letter}", region=region, label=f"{label} {letter}",
                        layer="bodyMuscles", side=letter, frame="torso" if rig == "torso" else "foot" if rig == "foot" else "bone",
                        budget=budget, elements=selected, families=family_ids,
                        concepts=[dict(id=e, name=reverse[e]) for e in selected])
            if rig == "upperarm": spec["landmarks"] = [11 + delta, 13 + delta]
            elif rig == "forearm": spec["landmarks"] = [13 + delta, 15 + delta]
            elif rig == "thigh": spec["landmarks"] = [23 + delta, 25 + delta]
            elif rig == "shin": spec["landmarks"] = [25 + delta, 27 + delta]
            elif rig == "foot": spec["landmarks"] = [27 + delta, 29 + delta, 31 + delta]
            if region == "neck": spec["cervical"] = True
            specs.append(spec)
    return specs


def combine_elements(atlas, spec):
    vertices, faces, offset = [], [], 0
    for element in spec["elements"]:
        v, f = atlas.load_element(element)
        sign = 1 if spec["side"] == "L" else -1
        if float(v[:, 0].mean()) * sign <= 0:
            raise ValueError(f"Source geometric side contradicts anatomical name: {element}")
        vertices.append(v); faces.append(f + offset); offset += len(v)
    return np.concatenate(vertices), np.concatenate(faces)


def source_frame(spec, points, origin, torso):
    if spec["frame"] == "torso": return origin, torso
    if spec["frame"] == "foot":
        ankle, heel, toe = spec["landmarks"]
        origin = points[heel]
        e1, e2 = points[toe] - origin, points[ankle] - origin
        e3 = unit(np.cross(e1, e2)) * np.sqrt(np.linalg.norm(e1) * np.linalg.norm(e2))
        return origin, np.column_stack((e1, e2, e3))
    a, b = spec["landmarks"]
    e1 = points[b] - points[a]
    length = np.linalg.norm(e1)
    roll = torso[:, 2] - e1 * (torso[:, 2] @ e1) / (length * length)
    e2 = unit(roll) * length
    e3 = unit(np.cross(e1, e2)) * length
    return points[a], np.column_stack((e1, e2, e3))


def build():
    atlas = Atlas()
    points, torso_points, methods, height, floor, ceiling = reference_points(atlas)
    origin, torso = torso_basis(torso_points)
    companion = json.loads((OUT / "body.json").read_text())
    for key, expected in [("referencePoseCm", points), ("torsoReferencePoseCm", torso_points)]:
        if companion[key] != {str(k): v.tolist() for k, v in expected.items()}:
            raise ValueError(f"Companion body atlas {key} changed; explicitly review source-frame alignment")
    pose = demo_pose(torso_points, floor, ceiling)
    if pose != companion["demoPose"]:
        raise ValueError("Muscle demo pose must match the companion body source references")
    specs = specifications(atlas)
    binary = bytearray()
    meshes, labels, preview_meshes = [], [], []
    for spec in specs:
        v, f = combine_elements(atlas, spec)
        source_triangles = len(f)
        v, remap = np.unique(v, axis=0, return_inverse=True)
        f = remap[f].astype(np.int32)
        if len(f) > spec["budget"]:
            v, f = fast_simplification.simplify(v, f, target_count=spec["budget"], agg=7.0)
        if len(v) > 65535 or len(f) > spec["budget"]:
            raise ValueError(f"Mesh budget exceeded: {spec['name']}")
        frame_origin, frame_basis = source_frame(spec, points, origin, torso)
        local = np.linalg.solve(frame_basis, (v - frame_origin).T).T
        minimum, maximum = local.min(0), local.max(0)
        size = maximum - minimum
        if not np.isfinite(local).all() or np.any(size <= 0):
            raise ValueError(f"Invalid normalized muscle surface: {spec['name']}")
        q = np.rint((local - minimum) / size * 65535).clip(0, 65535).astype("<u2")
        off_v = len(binary); binary += q.tobytes()
        off_i = len(binary); binary += np.asarray(f, dtype="<u2").tobytes()
        entry = {k: spec[k] for k in ["name", "region", "layer", "side", "frame", "landmarks", "cervical"] if k in spec}
        entry.update(nv=len(v), ni=int(f.size), min=minimum.tolist(), size=size.tolist(), offV=off_v, offI=off_i,
                     sourceTriangles=source_triangles, triangleBudget=spec["budget"], sourceElements=spec["elements"],
                     sourceConcepts=spec["concepts"], selectedFamilies=spec["families"],
                     sourceFrame=dict(originCm=frame_origin.tolist(), basisColumnsCm=frame_basis.T.tolist()))
        if spec["frame"] == "bone":
            entry["jointAnchors"] = [[0, 0, 0], [1, 0, 0]]
            entry["jointAnchorMethod"] = "companion skeletal joint references; not muscle origins or insertions"
        center = local.mean(0)
        anchor = local[np.argmin(np.linalg.norm(local - center, axis=1))]
        labels.append(dict(t=spec["label"], layer="bodyMuscles", mesh=spec["name"], pts=[anchor.tolist()]))
        meshes.append(entry)
        preview_meshes.append((spec, trimesh.Trimesh(vertices=v, faces=f, process=False)))
        print(f"{spec['name']}: {len(spec['elements'])} source parts; {source_triangles} -> {len(f)} triangles", flush=True)
    source_ids = sorted({e for spec in specs for e in spec["elements"]})
    if sum(len(spec["elements"]) for spec in specs) != len(source_ids):
        raise ValueError("Duplicate source primitive appears in more than one delivered muscle mesh")
    meta = dict(schemaVersion=1, format="quantized-uint16-le", layer="bodyMuscles", meshes=meshes, labels=labels,
                binaryBytes=len(binary), binarySha256=sha(binary), companionBodyBinarySha256=companion["binarySha256"],
                attribution=ATTRIBUTION, license="CC-BY-SA-2.1-JP", licenseUrl="https://creativecommons.org/licenses/by-sa/2.1/jp/",
                source=dict(dataset="BodyParts3D", version="3.0", archiveDate="2011-09-15", sourceUnit="mm", outputUnit="cm",
                            transform="[x, z, -y] / 10", downloads=[dict(url=BASE + remote, sha256=expected) for remote, expected in SOURCES.values()],
                            elementCount=len(source_ids), elementIds=source_ids,
                            officialLicensePage="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html"),
                referencePoseCm=companion["referencePoseCm"], torsoReferencePoseCm=companion["torsoReferencePoseCm"],
                referenceMethods=methods, measuredSourceHeightCm=height, demoPose=pose, demoAspect=companion["demoAspect"],
                coverage=dict(regions=[r[0] for r in REGIONS], bilateral=True, sourceComponents=len(source_ids),
                              regionCount=len(specs), excluded=EXCLUDED), limitations=LIMITATIONS)
    metadata = json.dumps(meta, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n"
    if len(binary) + len(metadata) > 3_000_000:
        raise ValueError("Combined muscle bundle exceeds the 3 MB additional-asset budget")
    return bytes(binary), metadata, preview_meshes


def previews(meshes):
    os.environ.setdefault("MPLCONFIGDIR", str(CACHE / "matplotlib"))
    os.environ.setdefault("XDG_CACHE_HOME", str(CACHE))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection

    PREVIEWS.mkdir(parents=True, exist_ok=True)
    colors = {
        "neck": "#e9a594", "chest": "#c96965", "back": "#b65d65", "abdomen": "#d78472",
        "scapular": "#aa5261", "deltoid": "#e4987f", "upperarm": "#c87569", "forearm": "#dda18a",
        "hip": "#b7616b", "thigh": "#ca746e", "shin": "#d98c80", "foot": "#e5b19b",
    }

    def paint(ax, items, view):
        axes = [0, 1] if view in ["front", "back"] else [2, 1]
        depth = 2 if view in ["front", "back"] else 0
        # Draw individual source triangles back-to-front, so superficial coverage
        # can be inspected without falsely seeing every deep muscle through skin.
        triangles, depths, facecolors = [], [], []
        for spec, mesh in items:
            v, f = np.asarray(mesh.vertices), np.asarray(mesh.faces)
            tri = v[f]
            triangles.append(tri[:, :, axes]); depths.append(tri[:, :, depth].mean(1))
            facecolors.extend([colors[spec["region"]]] * len(f))
        triangles, depths = np.concatenate(triangles), np.concatenate(depths)
        order = np.argsort(depths, kind="stable")
        if view == "back": order = order[::-1]
        collection = PolyCollection(triangles[order], facecolors=np.asarray(facecolors)[order], edgecolors="none", rasterized=True)
        ax.add_collection(collection); ax.autoscale_view(); ax.set_aspect("equal")
        if view == "back": ax.invert_xaxis()
        ax.set_facecolor("#101522"); ax.tick_params(colors="white", labelsize=8)
        ax.set_title(view.capitalize() + " / source cm", color="white", fontsize=10)

    for view in ["front", "back", "side"]:
        fig, ax = plt.subplots(figsize=(7, 12), dpi=140, facecolor="#101522")
        paint(ax, meshes, view)
        fig.suptitle("BodyParts3D 3.0 / regional muscles", color="white")
        fig.savefig(PREVIEWS / f"preview_muscles_{view}.png", bbox_inches="tight"); plt.close(fig)
    for region, *_ in REGIONS:
        items = [item for item in meshes if item[0]["region"] == region]
        fig, axes = plt.subplots(1, 3, figsize=(11, 7), dpi=110, facecolor="#101522")
        for ax, view in zip(axes, ["front", "back", "side"]): paint(ax, items, view)
        fig.suptitle("Muscles / " + region + " / both anatomical sides", color="white")
        fig.savefig(PREVIEWS / f"preview_muscles_region_{region}.png", bbox_inches="tight"); plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--no-previews", action="store_true")
    args = parser.parse_args()
    immutable = {name: sha((OUT / name).read_bytes()) for name in ["head.bin", "head.json", "body.bin", "body.json"]}
    fetch_sources()
    binary, metadata, meshes = build()
    for name, data in [("muscles.bin", binary), ("muscles.json", metadata)]:
        path = OUT / name
        if args.verify:
            if path.read_bytes() != data: raise SystemExit(f"Deterministic muscle rebuild differs: {name}")
        else: path.write_bytes(data)
    if not args.no_previews: previews(meshes)
    for name, digest in immutable.items():
        if sha((OUT / name).read_bytes()) != digest: raise SystemExit(f"Existing anatomical artifact changed unexpectedly: {name}")
    print(f"{'Verified byte-identical' if args.verify else 'Built'} muscle bundle: {len(binary):,} bytes binary; {len(binary)+len(metadata):,} bytes combined; sha256={sha(binary)}")


if __name__ == "__main__": main()
