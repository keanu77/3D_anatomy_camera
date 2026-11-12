#!/usr/bin/env python3
"""Build source-identified head and palm surfaces without modifying the originals.

tools/.venv/bin/python tools/build_individual_head.py [--verify] [--no-previews]
Each OBJ is simplified independently; its contiguous triangle range retains its
actual FMA identity. Registration never supplies or guesses triangle identities.
"""
from __future__ import annotations

import argparse
import json
import os

import fast_simplification
import numpy as np

from build_body import Atlas, ATTRIBUTION, BASE, CACHE, OUT, PREVIEWS, SOURCES, fetch_sources, sha
from build_nerves import head_geometry
from head_frame import HEAD_ROTATION, HEAD_SCALE, HEAD_TRANSLATION, to_head, verify_registration

MUSCLES = [
    "frontalis", "occipitalis", "orbicularis oculi", "corrugator supercilii",
    "levator labii superioris alaeque nasi", "levator labii superioris",
    "zygomaticus major", "zygomaticus minor", "depressor labii inferioris",
    "levator anguli oris", "mentalis", "depressor anguli oris", "buccinator",
    "risorius", "orbicularis oris", "masseter", "temporalis", "medial pterygoid",
    "lateral pterygoid", "nasalis", "procerus", "temporoparietalis",
]
SKULL = ["frontal bone", "occipital bone", "sphenoid bone", "ethmoid", "vomer"] + [
    side + " " + bone for side in ["left", "right"] for bone in [
        "parietal bone", "temporal bone", "zygomatic bone", "maxilla", "nasal bone",
        "lacrimal bone", "palatine bone", "inferior nasal concha",
    ]
]
from hand_frame import PALM, FINGERS, raw_mm, hand_frame, to_palm

LIMITATIONS = [
    "Source identities describe actual atlas surfaces, not a diagnosis or patient-specific anatomy.",
    "The head uses the fixed approximate global registration already used by the optic bundle. Residuals are nearest-vertex reference-fit measurements, not clinical accuracy.",
    "Muscle heads and subdivisions retain their exact source names. No regional label or nearest-region heuristic determines a clicked triangle identity.",
    "The hand geometry is the source right hand. The existing runtime reuses it with reflection for the left hand; a displayed left hand is not independent left-specimen geometry.",
    "Hand coordinate residuals use normalized rig units. Head residuals use centimetres. These units must not be compared directly.",
    "Teeth are explicitly kind tooth, not bone. The source provides 28 permanent teeth; third molars, deciduous teeth, ear ossicles and hyoid are not added.",
    "The original muscle layer also contains the epicranial aponeurosis; it is retained and explicitly identified as aponeurosis, not muscle.",
    "Both upper and lower gingiva are retained as kind gingiva in the original cranium parent. This inherited static grouping does not articulate the lower gingiva with the jaw.",
    "No intrinsic hand muscles, facial expression deformation, independent muscle contraction or articulating carpal joints are added.",
    "The original finger rigs scale terminal bones to 80 percent at runtime; source-identity verification uses their stored normalized geometry before that runtime scaling.",
]


def source_side(name):
    return "L" if "left" in name.split() else "R" if "right" in name.split() else None


def distances(points, reference):
    # Bounded memory, no optional spatial-index package or random sampling.
    result = []
    chunk = max(1, 300_000 // len(reference))
    for start in range(0, len(points), chunk):
        delta = points[start:start + chunk, None] - reference[None]
        result.extend(np.sqrt(np.einsum("ijk,ijk->ij", delta, delta).min(1)))
    return np.asarray(result)


def stride(v, maximum):
    return v[::max(1, int(np.ceil(len(v) / maximum))) ]


def metrics(v, reference, maximum=1200):
    sampled = stride(v, maximum)
    d = distances(sampled, reference)
    return dict(sampleCount=len(d), rms=float(np.sqrt(np.mean(d * d))),
                p95=float(np.quantile(d, .95)), maximum=float(d.max()))


def identity(atlas, element, kind, parent):
    reverse = {i: n for n, i in atlas.names.items()}
    name = reverse[element]
    item = dict(id=element, name=name, kind=kind, side=source_side(name))
    if parent == "hand_palm":
        item.update(sourceSide="R", mirroredForLeft=True,
                    pairedId=atlas.names[name.replace("right", "left")],
                    pairedName=name.replace("right", "left"))
    return item


def specifications(atlas):
    muscle_ids = set().union(*(atlas.elements(atlas.names[n]) for n in MUSCLES))
    skull_ids = {atlas.names[n] for n in SKULL}
    teeth = {i for n, i in atlas.names.items() if i in atlas.files and n.endswith(" tooth")}
    reverse = {i: n for n, i in atlas.names.items()}
    upper = {i for i in teeth if "upper" in reverse[i].split()}
    lower = {i for i in teeth if "lower" in reverse[i].split()}
    if len(muscle_ids) != 49 or len(skull_ids) != 21 or len(upper) != 14 or len(lower) != 14:
        raise ValueError("Pinned source inventory changed")
    return [
        ("muscles", 36000, [(i, "muscle") for i in sorted(muscle_ids)] + [(atlas.names["aponeurosis of epicranius"], "aponeurosis")]),
        ("cranium", 50000, [(i, "bone") for i in sorted(skull_ids)] + [(i, "tooth") for i in sorted(upper)]
         + [(atlas.names[n], "gingiva") for n in ["gingiva of upper jaw", "gingiva of lower jaw"]]),
        ("jaw", 12000, [(atlas.names["mandible"], "bone")] + [(i, "tooth") for i in sorted(lower)]),
        ("hand_palm", 9000, [(atlas.names[n], "bone") for n in PALM]),
    ]


def finger_identities(atlas):
    points, _ = hand_frame()
    lateral = points[17] - points[5]
    lateral /= np.linalg.norm(lateral)
    out = []
    for a, b, name in FINGERS:
        element = atlas.names[name]
        if element not in atlas.files:
            raise ValueError("Finger name is not an actual individual source OBJ")
        v, _ = atlas.load_element(element)
        e1 = points[b] - points[a]
        length = np.linalg.norm(e1)
        e1 /= length
        e2 = lateral - e1 * (lateral @ e1)
        e2 /= np.linalg.norm(e2)
        e3 = np.cross(e1, e2)
        local = (raw_mm(v) - points[a]) @ np.column_stack([e1, e2, e3]) / length
        parent = f"hand_b_{a}_{b}"
        reference, faces = head_geometry(parent)
        item = identity(atlas, element, "bone", "hand_palm")
        item.update(parent=parent, bundle="head", start=0, count=int(faces.size),
                    registrationMetrics=metrics(local, reference, 400),
                    geometry="independently rebuilt individual source mesh in shared hand frame")
        if item["registrationMetrics"]["rms"] > .04 or item["registrationMetrics"]["p95"] > .07:
            raise ValueError(f"Finger source identity registration mismatch: {parent}")
        out.append(item)
    return out


def build():
    verify_registration()
    atlas = Atlas()
    binary, meshes, previews, registration = bytearray(), [], [], {}
    all_ids = []
    for parent, budget, selections in specifications(atlas):
        transform = to_palm if parent == "hand_palm" else to_head
        reference, _ = head_geometry(parent)
        source = [(element, kind, *atlas.load_element(element)) for element, kind in selections]
        weights = np.sqrt([len(f) for _, _, _, f in source])
        weights /= weights.sum()
        vv, ff, parts, original, vertex_offset, index_offset = [], [], [], [], 0, 0
        for (element, kind, v, f), weight in zip(source, weights):
            native_count, native_vertices = len(f), len(v)
            local_original = transform(v)
            original.append(local_original)
            # Each simplifier call sees exactly one source OBJ; it cannot join or
            # reassign triangles across identities, even where surfaces touch.
            target = min(native_count, max(96, int(budget * weight)))
            # Weld duplicate OBJ coordinates only within this individual source.
            # Never weld different structures, even when their surfaces touch.
            v, remap = np.unique(v, axis=0, return_inverse=True)
            f = remap[f].astype(np.int32)
            if target < native_count:
                v, f = fast_simplification.simplify(v, f, target_count=target, agg=7.)
            local = transform(v)
            f = np.asarray(f, dtype=np.int64)
            if not len(f) or f.min() < 0 or f.max() >= len(local) or not np.isfinite(local).all():
                raise ValueError(f"Invalid individual geometry: {element}")
            item = identity(atlas, element, kind, parent)
            item.update(start=index_offset, count=int(f.size), vertexStart=vertex_offset, vertexCount=len(local),
                        sourceTriangles=native_count, sourceVertices=native_vertices,
                        retainedTriangleFraction=len(f) / native_count,
                        registrationMetrics=metrics(local_original, reference, 160))
            # A source-specific identity is valid even when a fit is imperfect;
            # fail a large registration drift instead of silently concealing it.
            limit = .045 if parent == "hand_palm" else .45
            if item["registrationMetrics"]["rms"] > limit:
                raise ValueError(f"Source registration exceeds explicit engineering limit: {element}")
            parts.append(item)
            vv.append(local)
            ff.append(f + vertex_offset)
            vertex_offset += len(local)
            index_offset += int(f.size)
            all_ids.append(element)
        v, f, source_v = np.concatenate(vv), np.concatenate(ff), np.concatenate(original)
        if len(v) > 65535 or len(parts) != len(selections):
            raise ValueError("Uint16 limit or lost source component")
        minimum, size = v.min(0), np.ptp(v, axis=0)
        if np.any(size <= 0):
            raise ValueError("Degenerate mesh bounds")
        q = np.rint((v - minimum) / size * 65535).clip(0, 65535).astype("<u2")
        off_v = len(binary)
        binary += q.tobytes()
        off_i = len(binary)
        binary += f.astype("<u2").tobytes()
        decoded = q.astype(float) / 65535 * size + minimum
        entry = dict(name=parent, parent=parent, bundle="head", nv=len(v), ni=int(f.size),
                     min=minimum.tolist(), size=size.tolist(), offV=off_v, offI=off_i, parts=parts,
                     maxQuantizationError=float(np.linalg.norm(decoded - v, axis=1).max()),
                     coordinateUnit="normalized hand rig units" if parent == "hand_palm" else "cm")
        meshes.append(entry)
        # The reverse fit uses every source vertex and a deterministic sample of
        # immutable target vertices. These metrics do not infer part membership.
        registration[parent] = dict(sourceToOriginal=metrics(source_v, reference),
                                    originalToSource=metrics(reference, source_v),
                                    sourceBounds=[source_v.min(0).tolist(), source_v.max(0).tolist()],
                                    originalBounds=[reference.min(0).tolist(), reference.max(0).tolist()])
        if registration[parent]["originalToSource"]["p95"] > (.05 if parent == "hand_palm" else .4):
            raise ValueError(f"Insufficient source coverage of immutable geometry: {parent}: {registration[parent]}")
        previews.append((parent, v, f, parts))
        print(f"{parent}: {len(parts)} identities, {len(v)} vertices, {len(f)} triangles", flush=True)
    if len(all_ids) != len(set(all_ids)) or len(all_ids) != 114:
        raise ValueError("Source identities overlap or expected component is absent")
    fingers = finger_identities(atlas)
    if set(all_ids) & {p["id"] for p in fingers}:
        raise ValueError("Thumb metacarpal duplicated between palm and finger geometry")
    points, basis = hand_frame()
    metadata = dict(
        schemaVersion=1, format="quantized-uint16-le", meshes=meshes,
        existingParts=[dict(parent=p["parent"], parts=[p]) for p in fingers],
        binaryBytes=len(binary), binarySha256=sha(binary), license="CC-BY-SA-2.1-JP", attribution=ATTRIBUTION,
        source=dict(dataset="BodyParts3D", version="3.0", archiveDate="2011-09-15", elementIds=sorted(all_ids),
                    downloads=[dict(url=BASE + remote, sha256=digest) for remote, digest in SOURCES.values()]),
        coverage=dict(sourceComponents=114, headMuscleComponents=49, aponeuroses=1, gingivae=2, skullBones=22, teeth=28,
                      palmBones=12, existingIndividualHandBones=15, identityCoverage="Every replacement triangle belongs to exactly one actual source element.",
                      excluded=["Third molars", "Deciduous teeth", "Ear ossicles", "Hyoid", "Intrinsic hand muscles"]),
        registration=dict(
            targetHashes={name: sha((OUT / name).read_bytes()) for name in ["head.bin", "head.json"]},
            head=dict(method="Independent shared proper similarity transform from head_frame.py; fit only to BodyParts3D skin and the pinned MediaPipe canonical face. No per-component fitting or identity inference.",
                      transformConvention="head = sourceCm @ rotationRows * scale + translationCm",
                      scale=HEAD_SCALE, rotationRows=HEAD_ROTATION.tolist(), translationCm=HEAD_TRANSLATION.tolist(), units="cm"),
            hand=dict(method="Independent reference derived from right-hand bone joint caps by hand_frame.py; no prototype landmarks or inferred part assignment.",
                      transformConvention="palm = inverse(basisColumnsRawMm) @ (sourceRawMm - originRawMm)",
                      originRawMm=points[0].tolist(), basisColumnsRawMm=basis.T.tolist(), sourceSide="R",
                      axes="e1=index MCP minus wrist; e2=little MCP minus wrist; e3=unit cross(e1,e2) times geometric mean of their lengths",
                      units="normalized hand rig units", mirroredForLeft=True), metrics=registration),
        limitations=LIMITATIONS)
    return bytes(binary), json.dumps(metadata, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n", previews


def make_previews(meshes):
    os.environ.setdefault("MPLCONFIGDIR", str(CACHE / "matplotlib"))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    for parent, v, f, parts in meshes:
        fig, axes = plt.subplots(1, 3, figsize=(12, 5), dpi=130)
        for ax, projection, view in zip(axes, [[0, 1], [2, 1], [0, 2]], ["front", "side", "top"]):
            for k, part in enumerate(parts):
                faces = f[part["start"] // 3:(part["start"] + part["count"]) // 3]
                ax.add_collection(PolyCollection(v[faces][:, :, projection], facecolors=plt.cm.tab20(k % 20), edgecolors="none", alpha=.5, rasterized=True))
            ax.autoscale_view(); ax.set_aspect("equal"); ax.set_title(view)
        fig.suptitle(f"{parent}: independently identified source components")
        fig.savefig(PREVIEWS / f"preview_individual_{parent}.png", bbox_inches="tight")
        plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--no-previews", action="store_true")
    args = parser.parse_args()
    immutable = {p.name: sha(p.read_bytes()) for p in OUT.iterdir() if p.suffix in [".bin", ".json"] and not p.name.startswith("individual-")}
    fetch_sources()
    binary, metadata, meshes = build()
    for name, data in [("individual-head.bin", binary), ("individual-head.json", metadata)]:
        path = OUT / name
        if args.verify:
            if path.read_bytes() != data:
                raise SystemExit(f"Deterministic rebuild differs: {name}")
        else:
            path.write_bytes(data)
    if not args.no_previews:
        make_previews(meshes)
    for name, digest in immutable.items():
        if sha((OUT / name).read_bytes()) != digest:
            raise SystemExit(f"Original asset changed: {name}")
    print(f"{'Verified byte-identical' if args.verify else 'Built'} individual head: {len(binary):,} binary bytes; {len(binary) + len(metadata):,} combined bytes; SHA256 {sha(binary)}")


if __name__ == "__main__":
    main()
