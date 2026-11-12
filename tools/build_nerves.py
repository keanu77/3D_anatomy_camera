#!/usr/bin/env python3
"""Build real spinal-cord and optic-pathway surfaces, with explicit atlas registration.

tools/.venv/bin/python tools/build_nerves.py [--verify] [--no-previews]
No anatomical primitives are generated; source topology is retained. The cord's
source axial cross sections are scaled and recentered along measured canal holes.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess

import numpy as np
import trimesh

from build_body import Atlas, BASE, CACHE, OUT, PREVIEWS, SOURCES, fetch_sources, reference_points, sha, torso_basis

HRA_FILE = "HRA_VH_M_Spinal_Cord_v1.glb"
HRA_URL = "https://cdn.humanatlas.io/hra-releases/v1.2/models/VH_M_Spinal_Cord.glb"
HRA_SHA = "a7858d88c2237aa7d559c4c1d638923d213d2a9f46c575dea03d6ba67a9975c0"
HRA_METADATA = "https://cdn.humanatlas.io/hra-releases/v2.0/markdown/ref-organs/3d-vh-m-spinal-cord.md"
HRA_ATTRIBUTION = "Browne, Kristen; Schlehlein, Heidi (2022). 3D Reference Organ for Spinal Cord, Male, v1.0. HuBMAP. DOI:10.48539/HBM366.MTJD.685. CC BY 4.0. Adapted to the BodyParts3D vertebral canal and quantized for Anatomy Mirror."
BP_ATTRIBUTION = "BodyParts3D, © The Database Center for Life Science, CC Attribution-Share Alike 2.1 Japan. Optic surfaces registered to the original Anatomy Mirror head and quantized."
ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"]
VERTEBRAE = ["atlas", "axis"] + [n + " cervical vertebra" for n in ORDINALS[2:7]] + [n + " thoracic vertebra" for n in ORDINALS] + ["first lumbar vertebra"]

from head_frame import HEAD_SCALE, HEAD_ROTATION, HEAD_TRANSLATION, to_head, verify_registration

OPTICS = [
    ("optic_nerve_L", "Optic nerve L", "left optic nerve", "L"),
    ("optic_nerve_R", "Optic nerve R", "right optic nerve", "R"),
    ("optic_chiasm", "Optic chiasm", "optic chiasm", "M"),
    ("optic_tract_L", "Optic tract L", "left optic tract", "L"),
    ("optic_tract_R", "Optic tract R", "right optic tract", "R"),
]
LIMITATIONS = [
    "Reference surfaces for education; not patient-specific anatomy or a clinically validated registration.",
    "The HRA cord and BodyParts3D skeleton are different adult specimens. Axial scaling and centerline recentering explicitly adapt the cord to measured vertebral canal sections.",
    "Cord segment names denote spinal cord segments, not the vertebrae at the same ordinal level. Segment positions after cross-atlas registration are approximate.",
    "The cord follows one rigid torso frame during tracking; it does not bend with individual vertebrae.",
    "Optic structures use one approximate global head registration and follow the tracked head, not eye rotation or gaze.",
    "No peripheral limb nerves, nerve roots, cauda equina, separately named coccygeal cord segment, auditory/vestibular organs or retinal layers are present in this bundle.",
    "Existing brain and eyeballs remain separate original head layers; the BodyParts3D spinal-cord alias resolves only a short canal surface and is deliberately not used as the full cord.",
]


def fetch_hra():
    path = CACHE / HRA_FILE
    if not path.exists():
        tmp = path.with_suffix(".partial")
        subprocess.run(["curl", "--fail", "--location", "--retry", "2", "--silent", "--show-error", "--output", str(tmp), HRA_URL], check=True)
        if sha(tmp.read_bytes()) != HRA_SHA: raise ValueError("Changed HRA download; explicit review required")
        tmp.replace(path)
    if sha(path.read_bytes()) != HRA_SHA: raise ValueError("HRA source checksum mismatch")


def section_loops(vertices, faces, y):
    """Closed X/Z polygons cut directly from triangular source surfaces."""
    tri = vertices[faces]
    coords, edges = {}, {}
    d = tri[:, :, 1] - y
    hit = (d.min(1) < 0) & (d.max(1) > 0)
    for t in tri[hit]:
        intersections = []
        for a, b in [(0, 1), (1, 2), (2, 0)]:
            da, db = t[a, 1] - y, t[b, 1] - y
            if da * db < 0:
                p = t[a] + (t[b] - t[a]) * (-da) / (db - da)
                intersections.append(p[[0, 2]])
        if len(intersections) != 2: continue
        a, b = intersections
        ka, kb = tuple(a.round(6)), tuple(b.round(6))
        if ka == kb: continue
        coords[ka], coords[kb] = a, b
        edges.setdefault(ka, set()).add(kb); edges.setdefault(kb, set()).add(ka)
    seen, loops = set(), []
    for start in sorted(edges):
        if start in seen: continue
        current, previous, path = start, None, []
        while current not in seen:
            path.append(coords[current]); seen.add(current)
            choices = sorted(p for p in edges[current] if p != previous)
            if not choices: break
            previous, current = current, choices[0]
            if current == start:
                if len(path) >= 3: loops.append(np.asarray(path))
                break
    return loops


def polygon_area(p):
    return abs(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])) * .5


def section_points(vertices, faces, y):
    """Actual triangle/plane intersections, including open segment boundaries."""
    tri = vertices[faces]; points = []
    for a, b in [(0, 1), (1, 2), (2, 0)]:
        da, db = tri[:, a, 1] - y, tri[:, b, 1] - y
        crossed = da * db < 0
        points.append((tri[crossed, a] + (tri[crossed, b] - tri[crossed, a]) * (-da[crossed] / (db[crossed] - da[crossed]))[:, None])[:, [0, 2]])
    return np.concatenate(points)


def inside(p, polygon):
    x, z = p; a, b = polygon, np.roll(polygon, -1, axis=0)
    crossing = (a[:, 1] > z) != (b[:, 1] > z)
    a, b = a[crossing], b[crossing]
    return bool(np.count_nonzero(x < (b[:, 0] - a[:, 0]) * (z - a[:, 1]) / (b[:, 1] - a[:, 1]) + a[:, 0]) % 2)


def border_distance(p, polygon):
    a, b = polygon, np.roll(polygon, -1, axis=0)
    delta = b - a
    length2 = np.sum(delta * delta, axis=1)
    t = np.divide(np.sum((p - a) * delta, axis=1), length2, out=np.zeros(len(a)), where=length2 > 0).clip(0, 1)
    return float(np.min(np.linalg.norm(a + t[:, None] * delta - p, axis=1)))


def canal_anchors(atlas):
    anchors, missing, vertebral_meshes = [], [], []
    for name in VERTEBRAE:
        v, f, ids, _ = atlas.combine([name]); vertebral_meshes.append((name, v, f))
        found = []
        for t in np.linspace(.1, .9, 81):
            y = v[:, 1].min() + np.ptp(v[:, 1]) * t
            polygons = section_loops(v, f, y)
            for polygon in polygons:
                area = polygon_area(polygon); center = (polygon.min(0) + polygon.max(0)) / 2
                if .5 < area < 12 and abs(center[0]) < .8 and any(polygon_area(q) > area and inside(center, q) for q in polygons if q is not polygon):
                    found.append((area, y, center, polygon))
        if not found:
            missing.append(name); continue
        # Largest enclosed central lumen, not an outer bone contour or side foramen.
        area, y, center, polygon = max(found, key=lambda item: item[0])
        anchors.append(dict(name=name, sourceElements=ids, centerCm=[float(center[0]), float(y), float(center[1])],
                            areaCm2=float(area), sectionPolygonXZCm=polygon.tolist()))
    if len(anchors) < 17 or anchors[0]["name"] != "atlas" or anchors[-1]["name"] != "first lumbar vertebra":
        raise ValueError("Insufficient measured canal landmarks; do not silently fit arbitrary anatomy")
    return anchors, missing, vertebral_meshes


def combine_meshes(meshes):
    vv, ff, offset = [], [], 0
    for v, f in meshes:
        vv.append(v); ff.append(f + offset); offset += len(v)
    return np.concatenate(vv), np.concatenate(ff)


def registered_cord(atlas):
    raw = trimesh.load(CACHE / HRA_FILE, force="scene", process=False)
    if len(raw.geometry) != 30: raise ValueError("Unexpected HRA component count")
    source = []
    for node in sorted(raw.graph.nodes_geometry):
        matrix, geometry_name = raw.graph[node]
        if not np.array_equal(matrix, np.eye(4)): raise ValueError("Changed GLB node transform")
        geometry = raw.geometry[geometry_name]
        source.append((geometry_name, np.asarray(geometry.vertices) * 100, np.asarray(geometry.faces)))
    vertices, faces = combine_meshes([(v, f) for _, v, f in source])
    anchors, missing, vertebral_meshes = canal_anchors(atlas)
    source_min, source_max = vertices.min(0), vertices.max(0)
    source_length = float(source_max[1] - source_min[1])
    if not 40 < source_length < 55: raise ValueError("Source is not a full-length adult reference cord")
    low, high = anchors[-1]["centerCm"][1], anchors[0]["centerCm"][1]
    scale = (high - low) / source_length
    levels = np.linspace(source_min[1], source_max[1], 181)
    centers = []
    for y in levels:
        # End-cap center uses an infinitesimally interior plane, not an invented cap.
        section = section_points(vertices, faces, np.clip(y, source_min[1] + 1e-5, source_max[1] - 1e-5))
        if not len(section): raise ValueError(f"Missing actual cord cross section at {y}")
        centers.append((section.min(0) + section.max(0)) / 2)
    centers = np.asarray(centers)
    target = np.asarray([a["centerCm"] for a in anchors][::-1])

    def transform(v):
        y = low + (v[:, 1] - source_min[1]) * scale
        old = np.column_stack([np.interp(v[:, 1], levels, centers[:, i]) for i in range(2)])
        new = np.column_stack([np.interp(y, target[:, 1], target[:, i]) for i in [0, 2]])
        xz = (v[:, [0, 2]] - old) * scale + new
        return np.column_stack((xz[:, 0], y, xz[:, 1]))

    groups = {key: [] for key in ["cervical", "thoracic", "lumbar", "sacral"]}
    for name, v, f in source:
        region = next((key for key in groups if key in name), None)
        if region is None: raise ValueError(f"Unrecognized real cord component: {name}")
        groups[region].append((name, transform(v), f))
    checks = []
    for anchor in anchors:
        y = anchor["centerCm"][1]
        native_y = source_min[1] + (y - low) / scale
        polygon = section_points(vertices, faces, np.clip(native_y, source_min[1] + 1e-5, source_max[1] - 1e-5))
        points = transform(np.column_stack((polygon[:, 0], np.full(len(polygon), native_y), polygon[:, 1])))[:, [0, 2]]
        canal = np.asarray(anchor["sectionPolygonXZCm"])
        signed = np.asarray([border_distance(p, canal) * (1 if inside(p, canal) else -1) for p in points])
        checks.append(dict(vertebra=anchor["name"], yCm=y, pointCount=len(points), insideCount=int(np.sum(signed >= 0)), minimumClearanceCm=float(signed.min())))
    transformed = transform(vertices)
    registration = dict(
        method="Uniform axial/transverse scale; each original axial cross section recentered onto a piecewise-linear centerline through measured vertebral canal lumens. Original triangle topology retained; no tube or substitute cord generated.",
        sourceBoundsCm=[source_min.tolist(), source_max.tolist()], sourceLengthCm=source_length,
        targetBoundsCm=[transformed.min(0).tolist(), transformed.max(0).tolist()], targetLengthCm=float(high - low), uniformScale=float(scale),
        sourceCenterlineYcm=levels.tolist(), sourceCenterlineXZcm=centers.tolist(), anchors=anchors,
        unmeasuredVertebrae=missing, sectionChecks=checks,
        anchorMethod="81 horizontal sections over the middle 80% of each real vertebral source mesh; largest nested central lumen of area 0.5–12 cm² with center |x|<0.8 cm. Missing levels interpolate neighboring measured anchors.",
        endpointConvention="Most superior HRA cord vertex maps to the measured C1 canal plane; most inferior maps to the measured L1 canal plane. This is an explicit cross-specimen reference fit, not patient calibration.")
    if min(c["minimumClearanceCm"] for c in checks) < -.05:
        raise ValueError("Registered cord intersects measured canal boundary by more than 0.5 mm")
    return groups, registration, vertebral_meshes


def head_geometry(name):
    meta = json.loads((OUT / "head.json").read_text())
    data = (OUT / "head.bin").read_bytes()
    entry = next(m for m in meta["meshes"] if m["name"] == name)
    v = np.frombuffer(data, dtype="<u2", count=entry["nv"] * 3, offset=entry["offV"]).reshape(-1, 3) / 65535 * np.asarray(entry["size"]) + np.asarray(entry["min"])
    f = np.frombuffer(data, dtype="<u2", count=entry["ni"], offset=entry["offI"]).reshape(-1, 3)
    return v, f


def head_fit_metrics(atlas):
    metrics = {}
    for names, target in [(["eyeball"], "eyes"), (["cerebral hemisphere"], "cerebrum"), (["cerebellum", "medulla oblongata", "pons"], "hindbrain")]:
        source, *_ = atlas.combine(names); source = source[::max(1, len(source) // 2200)]
        transformed = to_head(source); vertices, _ = head_geometry(target)
        distances = []
        for batch in np.array_split(transformed, max(1, int(len(transformed) * len(vertices) / 500000))):
            distances.extend(np.sqrt(np.sum((batch[:, None] - vertices[None]) ** 2, axis=2).min(1)))
        distances = np.asarray(distances)
        metrics[target] = dict(sampleCount=len(distances), rms=float(np.sqrt(np.mean(distances ** 2))), p95=float(np.quantile(distances, .95)))
        if metrics[target]["rms"] > .2 or metrics[target]["p95"] > .35: raise ValueError("Head reference registration changed unexpectedly")
    return metrics


def build():
    verify_registration()
    atlas = Atlas(); companion = json.loads((OUT / "body.json").read_text())
    points, torso_points, methods, height, _, _ = reference_points(atlas)
    origin, basis = torso_basis(torso_points)
    if companion["torsoReferencePoseCm"] != {str(k): v.tolist() for k, v in torso_points.items()}: raise ValueError("Companion frame changed")
    groups, cord_registration, vertebrae = registered_cord(atlas)
    entries = []
    for region, components in groups.items():
        v, f = combine_meshes([(v, f) for _, v, f in components])
        elements = ["hra:" + name for name, _, _ in components]
        entries.append((dict(name="cord_" + region, region=region, label=region.capitalize() + " cord", layer="nerves", frame="torso", side="M",
                             cervical=region == "cervical", license="CC-BY-4.0", sourceElements=elements,
                             sourceConcepts=[dict(id="hra:" + name, name=name) for name, _, _ in components]), v, f))
    for name, label, concept, side in OPTICS:
        v, f, elements, _ = atlas.combine([concept])
        entries.append((dict(name=name, region="optic", label=label, layer="nerves", frame="head", side=side, license="CC-BY-SA-2.1-JP",
                             sourceElements=elements, sourceConcepts=[dict(id=e, name=next(n for n, i in atlas.names.items() if i == e)) for e in elements]), to_head(v), f))
    binary = bytearray(); meshes, labels, preview_meshes = [], [], []
    for spec, v, f in entries:
        frame_origin, frame_basis = (origin, basis) if spec["frame"] == "torso" else (np.zeros(3), np.eye(3))
        local = np.linalg.solve(frame_basis, (v - frame_origin).T).T
        minimum, maximum = local.min(0), local.max(0); size = maximum - minimum
        if len(v) > 65535 or not np.isfinite(local).all() or np.any(size <= 0): raise ValueError("Invalid nerve geometry")
        q = np.rint((local - minimum) / size * 65535).clip(0, 65535).astype("<u2")
        off_v = len(binary); binary += q.tobytes(); off_i = len(binary); binary += np.asarray(f, dtype="<u2").tobytes()
        entry = {k: value for k, value in spec.items() if k != "label"}
        entry.update(nv=len(v), ni=int(f.size), min=minimum.tolist(), size=size.tolist(), offV=off_v, offI=off_i,
                     sourceTriangles=len(f), triangleBudget=len(f), sourceFrame=dict(originCm=frame_origin.tolist(), basisColumnsCm=frame_basis.T.tolist()),
                     registration="cord" if spec["frame"] == "torso" else "head")
        center = local.mean(0); anchor = local[np.argmin(np.linalg.norm(local - center, axis=1))]
        labels.append(dict(t=spec["label"], layer="nerves", mesh=spec["name"], pts=[anchor.tolist()]))
        meshes.append(entry); preview_meshes.append((spec, v, f))
        print(f"{spec['name']}: {len(spec['sourceElements'])} actual source components, {len(f)} triangles", flush=True)
    elements = sorted(e for mesh in meshes for e in mesh["sourceElements"])
    if len(elements) != len(set(elements)) or len(elements) != 35: raise ValueError("Unexpected source component coverage")
    meta = dict(schemaVersion=1, format="quantized-uint16-le", layer="nerves", meshes=meshes, labels=labels,
                binaryBytes=len(binary), binarySha256=sha(binary), companionBodyBinarySha256=companion["binarySha256"],
                attribution=HRA_ATTRIBUTION + " " + BP_ATTRIBUTION, license="CC-BY-4.0 AND CC-BY-SA-2.1-JP",
                source=dict(dataset="Human Reference Atlas + BodyParts3D", elementCount=len(elements), elementIds=elements,
                            downloads=[dict(url=HRA_URL, sha256=HRA_SHA)] + [dict(url=BASE + remote, sha256=digest) for remote, digest in SOURCES.values()],
                            datasets=[dict(name="Human Reference Atlas", version="Male spinal cord v1.0", componentCount=30, license="CC-BY-4.0", url=HRA_URL, metadataUrl=HRA_METADATA, doi="10.48539/HBM366.MTJD.685", sha256=HRA_SHA, sourceUnit="m"),
                                      dict(name="BodyParts3D", version="3.0", componentCount=5, license="CC-BY-SA-2.1-JP", sourceUnit="mm")]),
                registration=dict(cord=cord_registration, head=dict(method="Independent fixed BodyParts3D-to-MediaPipe canonical face similarity from head_frame.py; 80 iterations of 98% trimmed ICP; untrimmed frontal gate verified at build time.",
                    scale=HEAD_SCALE, rotationRows=HEAD_ROTATION.tolist(), translationCm=HEAD_TRANSLATION.tolist(), transformConvention="head = sourceCm @ rotationRows * scale + translationCm",
                    fitMetricsCm=head_fit_metrics(atlas), targetHeadBinarySha256=sha((OUT / "head.bin").read_bytes()), targetHeadMetadataSha256=sha((OUT / "head.json").read_bytes()))),
                referencePoseCm=companion["referencePoseCm"], torsoReferencePoseCm=companion["torsoReferencePoseCm"], referenceMethods=methods,
                measuredSourceHeightCm=height, demoPose=companion["demoPose"], demoAspect=companion["demoAspect"],
                coverage=dict(sourceComponents=35, cordSegments=30, opticComponents=5, regionCount=9,
                              regions=["cervical_cord", "thoracic_cord", "lumbar_cord", "sacral_cord", "optic_nerves", "optic_chiasm", "optic_tracts"],
                              excluded=["Peripheral limb nerves", "Spinal nerve roots and cauda equina", "Coccygeal cord segment", "Auditory and vestibular organs", "Retinal layers"]), limitations=LIMITATIONS)
    metadata = json.dumps(meta, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n"
    return bytes(binary), metadata, preview_meshes, vertebrae


def previews(meshes, vertebrae):
    os.environ.setdefault("MPLCONFIGDIR", str(CACHE / "matplotlib"))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    for view, axes in [("front", [0, 1]), ("side", [2, 1])]:
        fig, ax = plt.subplots(figsize=(6, 12), dpi=140, facecolor="#101522")
        for _, v, f in vertebrae:
            ax.add_collection(PolyCollection(v[f][:, :, axes], facecolors="#b8d0e0", edgecolors="none", alpha=.035, rasterized=True))
        for spec, v, f in meshes:
            if spec["frame"] == "torso": ax.add_collection(PolyCollection(v[f][:, :, axes], facecolors="#ffe16a", edgecolors="none", rasterized=True))
        ax.autoscale_view(); ax.set_aspect("equal"); ax.set_facecolor("#101522"); ax.tick_params(colors="white")
        ax.set_title("HRA real cord / BodyParts3D canal / " + view, color="white", fontsize=11)
        ax.set_xlabel("Reference cm", color="white")
        fig.savefig(PREVIEWS / f"preview_nerves_cord_{view}.png", bbox_inches="tight"); plt.close(fig)
    fig, axes = plt.subplots(1, 3, figsize=(13, 6), dpi=130, facecolor="#101522")
    for ax, view, projection in zip(axes, ["front", "side", "top"], [[0, 1], [2, 1], [0, 2]]):
        for name, color, opacity in [("eyes", "#8edbf0", .08), ("cerebrum", "#6a8fbc", .008), ("hindbrain", "#8a9fbc", .016)]:
            v, f = head_geometry(name)
            ax.add_collection(PolyCollection(v[f][:, :, projection], facecolors=color, edgecolors="none", alpha=opacity, rasterized=True))
        for spec, v, f in meshes:
            if spec["frame"] == "head": ax.add_collection(PolyCollection(v[f][:, :, projection], facecolors="#ffe16a", edgecolors="none", rasterized=True))
        ax.autoscale_view(); ax.set_aspect("equal"); ax.set_facecolor("#101522"); ax.tick_params(colors="white", labelsize=8)
        ax.set_title("Registered optic pathway / " + view, color="white", fontsize=10)
    fig.savefig(PREVIEWS / "preview_nerves_optics.png", bbox_inches="tight"); plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--verify", action="store_true"); parser.add_argument("--no-previews", action="store_true")
    args = parser.parse_args()
    immutable = {name: sha((OUT / name).read_bytes()) for name in ["head.bin", "head.json", "body.bin", "body.json", "muscles.bin", "muscles.json", "joints.bin", "joints.json"]}
    fetch_sources(); fetch_hra()
    binary, metadata, meshes, vertebrae = build()
    for name, data in [("nerves.bin", binary), ("nerves.json", metadata)]:
        path = OUT / name
        if args.verify:
            if path.read_bytes() != data: raise SystemExit(f"Deterministic nerve rebuild differs: {name}")
        else: path.write_bytes(data)
    if not args.no_previews: previews(meshes, vertebrae)
    for name, digest in immutable.items():
        if sha((OUT / name).read_bytes()) != digest: raise SystemExit(f"Existing atlas unexpectedly changed: {name}")
    print(f"{'Verified byte-identical' if args.verify else 'Built'} nerves: {len(binary):,} binary bytes; {len(binary) + len(metadata):,} combined bytes; SHA256 {sha(binary)}")


if __name__ == "__main__": main()
