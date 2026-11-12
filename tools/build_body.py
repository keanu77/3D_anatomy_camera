#!/usr/bin/env python3
"""Build the body atlas from real, pinned BodyParts3D 3.0 OBJ surfaces.

Run with tools/.venv/bin/python tools/build_body.py [--verify] [--no-previews].
The downloaded archive stays in tools/cache. Nothing is extracted to arbitrary paths.
The original head/hand data is never read or modified by this pipeline.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

import numpy as np
import fast_simplification
import trimesh

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tools/cache"
OUT = ROOT / "public/anatomy"
PREVIEWS = ROOT / "tools/out"
BASE = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/"
SOURCES = {
    "BodyParts3D_3.0_obj_99.zip": ("BodyParts3D_3.0_obj_99.zip", "2125f6d761b14ead4ee64f71713f56f3f0f29982693ff20aac63474470cb92f4"),
    "v3_parts_list_e.txt": ("parts_list_e.txt", "824a34ed939a53375037d0d68b88ad2b63b1f0ae15a585632af2a63c2ab2e4af"),
    "v3_composite_parts.txt": ("composite_parts.txt", "17cd3611eb6b46558f983f890273fdb19f93806150ed95f6611acf4b81e90bc2"),
}
ATTRIBUTION = "BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan. Simplified, quantized, and aligned for Anatomy Mirror."
COLORS = {"spine": "#bfdfff", "organs": "#f3a3a6", "arms": "#e8e0c8", "legs": "#c5e6da"}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch_sources() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for local, (remote, expected) in SOURCES.items():
        path = CACHE / local
        if not path.exists():
            temporary = path.with_suffix(path.suffix + ".partial")
            subprocess.run(["curl", "--fail", "--location", "--retry", "2", "--silent", "--show-error", "--output", str(temporary), BASE + remote], check=True)
            if sha(temporary.read_bytes()) != expected:
                raise ValueError(f"Downloaded source checksum mismatch: {remote}")
            temporary.replace(path)
        if sha(path.read_bytes()) != expected:
            raise ValueError(f"Cached source checksum mismatch: {local}; refusing to use changed source")


class Atlas:
    def __init__(self):
        self.zip = zipfile.ZipFile(CACHE / "BodyParts3D_3.0_obj_99.zip")
        self.files = {Path(n.replace("\\", "/")).stem: n for n in self.zip.namelist() if n.endswith(".obj")}
        self.names = {}
        for row in (CACHE / "v3_parts_list_e.txt").read_text().splitlines()[1:]:
            fields = row.split("\t")
            if len(fields) == 2:
                self.names[fields[1].lower()] = fields[0]
        self.children = {}
        for row in (CACHE / "v3_composite_parts.txt").read_text().splitlines()[1:]:
            parent, _, child, _ = row.split("\t")
            self.children.setdefault(parent, set()).add(child)
        self.cache = {}

    def elements(self, concept: str, visited=None) -> set[str]:
        if concept in self.files:
            return {concept}
        visited = set() if visited is None else visited
        if concept in visited:
            raise ValueError(f"Cycle in source composite hierarchy: {concept}")
        out = set()
        for child in sorted(self.children.get(concept, [])):
            out |= self.elements(child, visited | {concept})
        if not out:
            raise ValueError(f"No actual source surface for {concept}")
        return out

    def load_element(self, element: str):
        if element not in self.cache:
            vertices, faces = [], []
            for line in self.zip.read(self.files[element]).decode().splitlines():
                if line.startswith("v "):
                    vertices.append([float(v) for v in line.split()[1:4]])
                elif line.startswith("f "):
                    polygon = [int(p.split("/")[0]) for p in line.split()[1:]]
                    polygon = [p - 1 if p > 0 else len(vertices) + p for p in polygon]
                    faces.extend([polygon[0], polygon[i], polygon[i + 1]] for i in range(1, len(polygon) - 1))
            raw = np.asarray(vertices, dtype=np.float64)
            # Header unit is mm; source +X=subject left, +Z=superior, -Y=anterior.
            # Proper rotation (determinant +1), then mm -> cm.
            verts = raw[:, [0, 2, 1]] * np.array([0.1, 0.1, -0.1])
            faces = np.asarray(faces, dtype=np.int32)
            if not len(verts) or not len(faces) or not np.isfinite(verts).all():
                raise ValueError(f"Invalid OBJ: {element}")
            if faces.min() < 0 or faces.max() >= len(verts):
                raise ValueError(f"Invalid OBJ index: {element}")
            self.cache[element] = (verts, faces)
        return self.cache[element]

    def combine(self, names):
        ids = set()
        concepts = []
        for name in names:
            concept = self.names[name]
            concepts.append({"id": concept, "name": name})
            ids |= self.elements(concept)
        vv, ff, offset = [], [], 0
        for element in sorted(ids):
            vertices, faces = self.load_element(element)
            vv.append(vertices)
            ff.append(faces + offset)
            offset += len(vertices)
        return np.concatenate(vv), np.concatenate(ff), sorted(ids), concepts


def unit(v):
    length = np.linalg.norm(v)
    if length < 1e-9:
        raise ValueError("Degenerate anatomical reference frame")
    return v / length


def cap_center(v, axis, upper, fraction=0.08):
    low, high = v[:, axis].min(), v[:, axis].max()
    threshold = high - (high - low) * fraction if upper else low + (high - low) * fraction
    selected = v[v[:, axis] >= threshold] if upper else v[v[:, axis] <= threshold]
    return (selected.min(0) + selected.max(0)) / 2


def head_center(v, side, bone):
    """Sphere-fit the proximal medial articular head; record method and radius."""
    # Both humeral/femoral heads are medial to their nearby tuberosity/trochanter.
    top = v[v[:, 1] > v[:, 1].max() - (4.0 if bone == "humerus" else 5.5)]
    medial_x = np.quantile(top[:, 0], 0.6 if side == "left" else 0.4)
    sample = top[top[:, 0] <= medial_x] if side == "left" else top[top[:, 0] >= medial_x]
    matrix = np.column_stack((2 * sample, np.ones(len(sample))))
    solution = np.linalg.lstsq(matrix, (sample * sample).sum(1), rcond=None)[0]
    center = solution[:3]
    radius = float(np.sqrt(max(0, solution[3] + center @ center)))
    if not (1.1 < radius < 3.8) or center[1] < top[:, 1].min() - 1:
        center = (sample.min(0) + sample.max(0)) / 2
        return center, {"method": "proximal medial articular region bounding center", "radiusCm": None}
    return center, {"method": "least-squares sphere fit to proximal medial articular region", "radiusCm": round(radius, 5)}


def reference_points(atlas):
    points, methods = {}, {}
    for side, delta in [("left", 0), ("right", 1)]:
        hum = atlas.combine([f"{side} humerus"])[0]
        fem = atlas.combine([f"{side} femur"])[0]
        tib = atlas.combine([f"{side} tibia"])[0]
        forearm = atlas.combine([f"{side} radius", f"{side} ulna"])[0]
        calc = atlas.combine([f"{side} calcaneus"])[0]
        toe = atlas.combine([f"distal phalanx of {side} second toe"])[0]
        points[11 + delta], methods[str(11 + delta)] = head_center(hum, side, "humerus")
        points[13 + delta] = cap_center(hum, 1, False)
        points[15 + delta] = cap_center(forearm, 1, False, 0.035)
        points[23 + delta], methods[str(23 + delta)] = head_center(fem, side, "femur")
        points[25 + delta] = cap_center(fem, 1, False, 0.045)
        points[27 + delta] = cap_center(tib, 1, False, 0.045)
        points[29 + delta] = cap_center(calc, 2, False, 0.12)
        points[31 + delta] = cap_center(toe, 2, True, 0.2)
    # Pose hip landmarks approximate external hip points, while bone frames use the
    # actual fitted articular centers. Store both, so this approximation is explicit.
    torso_points = {k: p.copy() for k, p in points.items()}
    torso_points[23][0] += 2
    torso_points[24][0] -= 2
    for left, right in [(11, 12), (23, 24), (27, 28)]:
        if points[left][0] <= points[right][0]:
            raise ValueError("Source anatomical left/right check failed")
    # Cranial vault extrema are available without incomplete accessory-skull entries.
    skull = atlas.combine(["left parietal bone", "right parietal bone", "frontal bone"])[0]
    feet = atlas.combine(["left calcaneus", "right calcaneus"])[0]
    height = skull[:, 1].max() - feet[:, 1].min()
    if not 140 < height < 210:
        raise ValueError(f"Implausible source unit/axis conversion: body height {height} cm")
    return points, torso_points, methods, float(height), float(feet[:, 1].min()), float(skull[:, 1].max())


def torso_basis(points):
    origin = (points[23] + points[24]) / 2
    e1 = points[11] - points[12]
    e2 = (points[11] + points[12]) / 2 - origin
    e3 = unit(np.cross(e1, e2)) * np.sqrt(np.linalg.norm(e1) * np.linalg.norm(e2))
    return origin, np.column_stack((e1, e2, e3))


def make_specifications(atlas):
    ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"]
    torso = [f"{n} thoracic vertebra" for n in ordinals] + [f"{n} lumbar vertebra" for n in ordinals[:5]]
    torso += ["sacrum", "sternum", "left clavicle", "right clavicle", "left scapula", "right scapula", "left hip bone", "right hip bone"]
    torso += [f"{side} {n} rib" for side in ["left", "right"] for n in ordinals]
    specs = [dict(name="torso_skel", layer="spine", frame="torso", sources=torso, budget=55000, label="Torso skeleton")]
    specs += [dict(name="cervical_skel", layer="spine", frame="torso", sources=[f"{n} cervical vertebra" for n in ordinals[2:7]], budget=5000, cervical=True, label="Cervical spine")]
    for organ, sources, budget, label in [
        ("heart", ["heart"], 8000, "Heart"),
        ("lungs", ["right lung", "left lung"], 12000, "Lungs"),
        ("liver", ["liver"], 8000, "Liver"),
        ("stomach", ["stomach"], 4000, "Stomach"),
        ("intestine", ["small intestine", "large intestine"], 12000, "Intestines"),
        ("kidneys", ["left kidney", "right kidney"], 6000, "Kidneys"),
    ]:
        specs.append(dict(name=f"organs_{organ}", layer="organs", frame="torso", sources=sources, budget=budget, label=label))
    for side, letter, delta in [("left", "L", 0), ("right", "R", 1)]:
        for name, source, layer, pair, budget, label in [
            ("arm_humerus", [f"{side} humerus"], "arms", [11 + delta, 13 + delta], 4000, "Humerus"),
            ("arm_forearm", [f"{side} radius", f"{side} ulna"], "arms", [13 + delta, 15 + delta], 5000, "Radius / ulna"),
            ("leg_femur", [f"{side} femur", f"{side} patella"], "legs", [23 + delta, 25 + delta], 5000, "Femur / patella"),
            ("leg_shin", [f"{side} tibia", f"{side} fibula"], "legs", [25 + delta, 27 + delta], 5000, "Tibia / fibula"),
        ]:
            specs.append(dict(name=f"{name}_{letter}", sources=source, layer=layer, frame="bone", landmarks=pair, side=letter, budget=budget, label=f"{side.title()} {label}"))
        foot = [f"{side} talus", f"{side} calcaneus", f"navicular bone of {side} foot", f"{side} cuboid bone"]
        # The archive explicitly names the cuneiform bones and 19 metatarsal/toe bones.
        foot += [name for name in atlas.names if side in name and (
            ("cuneiform" in name and "bone" in name)
            or "metatarsal bone" in name
            or ("phalanx" in name and "toe" in name)
        )]
        specs.append(dict(name=f"foot_{letter}", sources=sorted(set(foot)), layer="legs", frame="foot", landmarks=[27 + delta, 29 + delta, 31 + delta], side=letter, budget=6000, label=f"{side.title()} foot bones"))
    return specs


def demo_pose(points, floor, ceiling):
    # Source rest pose, in a 4:3 frame, with 8% vertical margins. Runtime may animate it.
    scale = 0.84 / (ceiling - floor)
    center_z = (points[23][2] + points[24][2]) / 2
    pose = [dict(x=0.5, y=0.14, z=0, visibility=1, presence=1) for _ in range(33)]
    for i, p in points.items():
        pose[i] = dict(x=round(0.5 + p[0] * scale * 0.75, 8), y=round(0.92 - (p[1] - floor) * scale, 8), z=round(-(p[2] - center_z) * scale * 0.75, 8), visibility=1, presence=1)
    # Face/hand placeholder landmarks are only used by the illustrative pose demo.
    for side, delta in [("left", 0), ("right", 1)]:
        for i in [17, 19, 21]:
            pose[i + delta] = dict(pose[15 + delta])
            pose[i + delta]["y"] += 0.025
    return pose


def build():
    atlas = Atlas()
    points, torso_points, methods, height, floor, ceiling = reference_points(atlas)
    origin, basis = torso_basis(torso_points)
    specs = make_specifications(atlas)
    binary = bytearray()
    meshes, labels, preview_meshes = [], [], []
    source_count = set()
    for spec in specs:
        vertices, faces, element_ids, concepts = atlas.combine(spec["sources"])
        source_count.update(element_ids)
        source_triangles = len(faces)
        # OBJ stores duplicate positions at normal seams. Weld exact coordinates,
        # in a stable lexicographic order, before surface-preserving decimation.
        vertices, remap = np.unique(vertices, axis=0, return_inverse=True)
        faces = remap[faces].astype(np.int32)
        if len(faces) > spec["budget"]:
            vertices, faces = fast_simplification.simplify(vertices, faces, target_count=spec["budget"], agg=7.0)
        if len(faces) > spec["budget"] or len(vertices) > 65535:
            raise ValueError(f"Mesh budget exceeded: {spec['name']}")
        if spec["frame"] == "torso":
            frame_origin, frame_basis = origin, basis
        elif spec["frame"] == "bone":
            a, b = spec["landmarks"]
            frame_origin = points[a]
            e1 = points[b] - points[a]
            length = np.linalg.norm(e1)
            roll = basis[:, 2] - e1 * (basis[:, 2] @ e1) / (length * length)
            e2 = unit(roll) * length
            e3 = unit(np.cross(e1, e2)) * length
            frame_basis = np.column_stack((e1, e2, e3))
        else:
            ankle, heel, toe = spec["landmarks"]
            frame_origin = points[heel]
            e1, e2 = points[toe] - frame_origin, points[ankle] - frame_origin
            e3 = unit(np.cross(e1, e2)) * np.sqrt(np.linalg.norm(e1) * np.linalg.norm(e2))
            frame_basis = np.column_stack((e1, e2, e3))
        local = np.linalg.solve(frame_basis, (vertices - frame_origin).T).T
        if not np.isfinite(local).all():
            raise ValueError(f"Non-finite normalized vertices: {spec['name']}")
        minimum, maximum = local.min(0), local.max(0)
        size = maximum - minimum
        if np.any(size <= 0):
            raise ValueError(f"Degenerate mesh bounds: {spec['name']}")
        quantized = np.rint((local - minimum) / size * 65535).clip(0, 65535).astype("<u2")
        off_v = len(binary)
        binary += quantized.tobytes()
        off_i = len(binary)
        binary += np.asarray(faces, dtype="<u2").tobytes()
        entry = {k: spec[k] for k in ["name", "layer", "frame", "landmarks", "side", "cervical"] if k in spec}
        entry.update(nv=len(local), ni=int(faces.size), min=minimum.tolist(), size=size.tolist(), offV=off_v, offI=off_i,
                     triangleBudget=spec["budget"], sourceTriangles=source_triangles, sourceElements=element_ids,
                     sourceConcepts=concepts, sourceFrame={"originCm": frame_origin.tolist(), "basisColumnsCm": frame_basis.T.tolist()})
        if spec["frame"] == "bone":
            # These are fitted anatomical joint references, not arbitrary mesh extrema.
            entry["jointAnchors"] = [[0, 0, 0], [1, 0, 0]]
            entry["jointAnchorMethod"] = "source anatomical references transformed by inverse source bone frame"
        meshes.append(entry)
        # Surface-derived anchor remains on actual mesh, including paired organ groups.
        center = local.mean(0)
        point = local[np.argmin(np.linalg.norm(local - center, axis=1))]
        labels.append(dict(t=spec["label"], layer=spec["layer"], mesh=spec["name"], pts=[point.tolist()]))
        preview_meshes.append((spec, trimesh.Trimesh(vertices=vertices, faces=faces, process=False)))
        print(f"{spec['name']}: {source_triangles} -> {len(faces)} triangles, {len(local)} vertices", flush=True)
    if len(binary) > 6_000_000:
        raise ValueError("Body binary exceeds 6 MB")
    meta = dict(schemaVersion=1, format="quantized-uint16-le", meshes=meshes, labels=labels,
                binaryBytes=len(binary), binarySha256=sha(binary), attribution=ATTRIBUTION,
                license="CC-BY-SA-2.1-JP", licenseUrl="https://creativecommons.org/licenses/by-sa/2.1/jp/",
                source=dict(dataset="BodyParts3D", version="3.0", archiveDate="2011-09-15", sourceUnit="mm", outputUnit="cm",
                            transform="[x, z, -y] / 10", downloads=[dict(url=BASE + remote, sha256=expected) for remote, expected in SOURCES.values()],
                            elementCount=len(source_count), officialLicensePage="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html"),
                referencePoseCm={str(k): v.tolist() for k, v in points.items()},
                torsoReferencePoseCm={str(k): v.tolist() for k, v in torso_points.items()},
                referenceMethods=methods, measuredSourceHeightCm=height,
                demoPose=demo_pose(torso_points, floor, ceiling), demoAspect=4 / 3,
                limitations=["An adult reference anatomy, not a scan or patient-specific reconstruction.",
                            "Joint centers are geometry-derived approximations for educational alignment.",
                            "Torso hip reference points are femoral-head centers offset laterally by 2 cm.",
                            "Source rest pose and shared torso affine frame do not model scapulothoracic or spinal articulation."])
    return bytes(binary), json.dumps(meta, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n", preview_meshes


def previews(meshes):
    os.environ.setdefault("MPLCONFIGDIR", str(CACHE / "matplotlib"))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection

    PREVIEWS.mkdir(parents=True, exist_ok=True)
    for view, axes, invert in [("front", (0, 1), False), ("side", (2, 1), False)]:
        fig, ax = plt.subplots(figsize=(7, 12), dpi=150, facecolor="#101522")
        ax.set_facecolor("#101522")
        for spec, mesh in meshes:
            if spec["layer"] == "organs":
                continue
            verts = np.asarray(mesh.vertices)
            tri = verts[np.asarray(mesh.faces)][:, :, axes]
            collection = PolyCollection(tri, facecolors=COLORS[spec["layer"]], edgecolors="none", alpha=0.68, rasterized=True)
            ax.add_collection(collection)
        ax.autoscale_view()
        ax.set_aspect("equal")
        if invert:
            ax.invert_xaxis()
        ax.set_title(f"BodyParts3D 3.0 / {view} / source anatomy (cm)", color="white")
        ax.tick_params(colors="white")
        ax.set_xlabel("Anatomical left +X" if view == "front" else "Anterior +Z", color="white")
        ax.set_ylabel("Superior +Y", color="white")
        fig.savefig(PREVIEWS / f"preview_{view}.png", bbox_inches="tight")
        plt.close(fig)
    fig, ax = plt.subplots(figsize=(9, 9), dpi=150, facecolor="#101522")
    ax.set_facecolor("#101522")
    palette = ["#ed6a73", "#80b7d7", "#b86657", "#e8bb91", "#d5a5a1", "#c68c89"]
    for (spec, mesh), color in zip([m for m in meshes if m[0]["layer"] == "organs"], palette):
        verts = np.asarray(mesh.vertices)
        ax.add_collection(PolyCollection(verts[np.asarray(mesh.faces)][:, :, [0, 1]], facecolors=color, edgecolors="none", alpha=.6, rasterized=True))
        center = verts.mean(0)
        ax.text(center[0], center[1], spec["label"], color="white", fontsize=9, ha="center")
    ax.autoscale_view(); ax.set_aspect("equal")
    ax.set_title("BodyParts3D 3.0 / organs / front view", color="white"); ax.tick_params(colors="white")
    fig.savefig(PREVIEWS / "preview_organs.png", bbox_inches="tight"); plt.close(fig)
    for spec, mesh in meshes:
        fig, panels = plt.subplots(1, 2, figsize=(8, 7), dpi=110, facecolor="#101522")
        vertices, faces = np.asarray(mesh.vertices), np.asarray(mesh.faces)
        for ax, axes, title in zip(panels, [(0, 1), (2, 1)], ["Front: +X = anatomical left", "Side: +Z = anterior"]):
            ax.set_facecolor("#101522")
            ax.add_collection(PolyCollection(vertices[faces][:, :, axes], facecolors=COLORS[spec["layer"]], edgecolors="none", alpha=.7, rasterized=True))
            ax.autoscale_view(); ax.set_aspect("equal"); ax.tick_params(colors="white")
            ax.set_title(title, color="white", fontsize=9)
        fig.suptitle(spec["name"] + " / source cm", color="white")
        fig.savefig(PREVIEWS / f"preview_{spec['name']}.png", bbox_inches="tight"); plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Rebuild in memory and require byte-identical committed outputs")
    parser.add_argument("--no-previews", action="store_true")
    args = parser.parse_args()
    fetch_sources()
    binary, metadata, mesh_list = build()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in [("body.bin", binary), ("body.json", metadata)]:
        path = OUT / name
        if args.verify:
            if path.read_bytes() != data:
                raise SystemExit(f"Deterministic rebuild differs: {name}")
        else:
            path.write_bytes(data)
    if not args.no_previews:
        previews(mesh_list)
    print(f"{'Verified byte-identical' if args.verify else 'Built'}: {len(binary):,} bytes, sha256={sha(binary)}")


if __name__ == "__main__":
    main()
