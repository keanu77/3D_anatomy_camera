#!/usr/bin/env python3
"""Build exact source-element picking geometry without changing regional assets.

Each pinned BodyParts3D OBJ is simplified separately, then concatenated into its
existing parent frame. Triangle ranges retain source identity; no coordinates
are ever welded across different source elements. --verify rebuilds in memory.
"""
from __future__ import annotations

import argparse
import json
import re

import fast_simplification
import numpy as np

from build_body import (
    Atlas, ATTRIBUTION, BASE, CACHE, OUT, SOURCES, fetch_sources,
    make_specifications, reference_points, sha, torso_basis,
)
from build_muscles import EXCLUDED, LIMITATIONS, source_frame, specifications

MAX_BYTES = 3_000_000
MIN_TRIANGLES = 64
COMPANIONS = [f"{bundle}.{ext}" for bundle in ["head", "body", "muscles", "joints", "nerves"] for ext in ["json", "bin"]]


def exact_names(atlas):
    """Use the source spelling, without title-casing or anatomical inference."""
    names = {}
    for line in (CACHE / "v3_parts_list_e.txt").read_text().splitlines()[1:]:
        fields = line.split("\t")
        if len(fields) == 2:
            element, name = fields
            if atlas.names[name.lower()] != element:
                raise ValueError(f"Ambiguous source label: {name}")
            names[element] = name
    return names


def source_side(name):
    sides = [code for word, code in [("left", "L"), ("right", "R")] if word in name.lower().split()]
    if len(sides) > 1:
        raise ValueError(f"Ambiguous anatomical side: {name}")
    return sides[0] if sides else None


def muscle_identity(atlas, element, name, names):
    if name.startswith("set of "):
        return {"identityScope": "source-aggregate"}
    match = re.search(r"(?:head|part) of ((?:left|right) .+)$", name)
    if not match:
        return {"identityScope": "muscle"}
    identity = {"identityScope": "muscle-part"}
    # V3 often has a bilateral family concept but no sided whole-muscle ID.
    # Keep that real ID, and require ID + side when grouping its source heads.
    for label in [match.group(1), match.group(1).split(" ", 1)[1]]:
        parent_id = atlas.names.get(label.lower())
        if not parent_id:
            continue
        try:
            members = atlas.elements(parent_id)
        except ValueError:
            members = set()
        if element in members:
            identity.update(wholeMuscleId=parent_id, wholeMuscleName=names[parent_id],
                            wholeMuscleSide=source_side(name),
                            groupingEvidence="pinned source family hierarchy; side from exact element name")
            break
    return identity


def bone_identity(atlas, element, name, names):
    if name not in ["manubrium", "body of sternum", "xiphoid process"]:
        return {"identityScope": "bone"}
    parent_id = atlas.names["sternum"]
    if element not in atlas.elements(parent_id):
        raise ValueError(f"Sternum part lacks source hierarchy membership: {element}")
    return dict(identityScope="bone-part", wholeBoneId=parent_id, wholeBoneName=names[parent_id])


def allocate_budgets(counts, total):
    """Preserve a minimum per OBJ; distribute the remainder proportionally."""
    counts = np.asarray(counts, dtype=np.int64)
    floor = np.minimum(counts, MIN_TRIANGLES)
    if total < int(floor.sum()):
        raise ValueError("Regional budget cannot preserve every source element")
    remaining = min(total, int(counts.sum())) - int(floor.sum())
    room = counts - floor
    if remaining == 0 or int(room.sum()) == 0:
        return floor.tolist()
    # Integer largest-remainder allocation is stable, including tied weights.
    numerators = room * remaining
    allocation = numerators // int(room.sum())
    remainder = remaining - int(allocation.sum())
    order = np.argsort(-(numerators % int(room.sum())), kind="stable")
    allocation[order[:remainder]] += 1
    return (floor + allocation).tolist()


def parent_specs(atlas, companions):
    body_specs = {item["name"]: item for item in make_specifications(atlas) if item["layer"] in ["spine", "arms", "legs"]}
    muscle_specs = {item["name"]: item for item in specifications(atlas)}
    selected = []
    for bundle, specs in [("body", body_specs), ("muscles", muscle_specs)]:
        parents = {item["name"]: item for item in companions[bundle]["meshes"]}
        for name, spec in specs.items():
            parent = parents[name]
            if bundle == "body":
                elements = sorted({element for label in spec["sources"] for element in atlas.elements(atlas.names[label])})
            else:
                elements = spec["elements"]
            if elements != parent["sourceElements"]:
                raise ValueError(f"Source-element assignment changed: {name}")
            for key in ["frame", "landmarks", "side", "cervical"]:
                if spec.get(key) != parent.get(key):
                    raise ValueError(f"Companion rig changed: {name}.{key}")
            if spec["budget"] != parent["triangleBudget"]:
                raise ValueError(f"Companion budget changed: {name}")
            selected.append((bundle, parent, elements))
    return selected


def validate(meta, binary, atlas, companions):
    names = exact_names(atlas)
    expected = {(bundle, parent["name"]): set(ids) for bundle, parent, ids in parent_specs(atlas, companions)}
    if meta["schemaVersion"] != 1 or meta["binaryBytes"] != len(binary) or meta["binarySha256"] != sha(binary):
        raise ValueError("Invalid individual bundle checksum/schema")
    if meta["companionAssets"] != {name: sha((OUT / name).read_bytes()) for name in COMPANIONS}:
        raise ValueError("Companion assets changed")
    seen, seen_meshes, cursor = set(), set(), 0
    kind_counts = {"bone": 0, "muscle": 0}
    for mesh in meta["meshes"]:
        key = (mesh["bundle"], mesh["parent"])
        if key not in expected or key in seen_meshes or mesh["name"] != mesh["parent"]:
            raise ValueError(f"Unknown or repeated parent mesh: {key}")
        seen_meshes.add(key)
        parent = next(item for item in companions[mesh["bundle"]]["meshes"] if item["name"] == mesh["parent"])
        for field in ["frame", "landmarks", "side", "cervical", "sourceFrame", "layer"]:
            if mesh.get(field) != parent.get(field):
                raise ValueError(f"Parent frame mismatch: {key}.{field}")
        if not 0 < mesh["nv"] <= 65535 or mesh["ni"] <= 0 or mesh["ni"] % 3:
            raise ValueError(f"Invalid mesh counts: {key}")
        if mesh["ni"] // 3 > mesh["triangleBudget"]:
            raise ValueError(f"Exceeded parent budget: {key}")
        if mesh["offV"] != cursor or mesh["offI"] != cursor + mesh["nv"] * 6:
            raise ValueError(f"Noncontiguous mesh buffers: {key}")
        cursor = mesh["offI"] + mesh["ni"] * 2
        if cursor > len(binary):
            raise ValueError(f"Mesh outside binary: {key}")
        q = np.frombuffer(binary, dtype="<u2", count=mesh["nv"] * 3, offset=mesh["offV"]).reshape((-1, 3))
        indices = np.frombuffer(binary, dtype="<u2", count=mesh["ni"], offset=mesh["offI"])
        local = np.asarray(mesh["min"]) + q / 65535 * np.asarray(mesh["size"])
        if not np.isfinite(local).all() or np.any(np.asarray(mesh["size"]) <= 0) or np.abs(local).max() > 10:
            raise ValueError(f"Unbounded local geometry: {key}")
        face_cursor, vertex_cursor = 0, 0
        mesh_ids = set()
        for part in mesh["parts"]:
            element = part["id"]
            if element in seen or element not in expected[key] or names[element] != part["name"]:
                raise ValueError(f"Invalid/repeated exact source identity: {element}")
            seen.add(element); mesh_ids.add(element)
            kind = "bone" if mesh["bundle"] == "body" else "muscle"
            if part["kind"] != kind or part["side"] != source_side(part["name"]):
                raise ValueError(f"Source kind/side mismatch: {element}")
            kind_counts[kind] += 1
            if part["start"] != face_cursor or part["count"] <= 0 or part["count"] % 3:
                raise ValueError(f"Invalid triangle ownership range: {element}")
            if part["firstVertex"] != vertex_cursor or part["vertexCount"] <= 0:
                raise ValueError(f"Invalid exclusive vertex range: {element}")
            face_cursor += part["count"]; vertex_cursor += part["vertexCount"]
            part_faces = indices[part["start"]:face_cursor].reshape((-1, 3))
            if part_faces.size != part["count"] or part_faces.min() < part["firstVertex"] or part_faces.max() >= vertex_cursor:
                raise ValueError(f"Triangle crosses source-element vertex range: {element}")
            triangles = q[part_faces].astype(np.int64)
            area = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
            if not np.all(np.any(area != 0, axis=1)):
                raise ValueError(f"Degenerate quantized source surface: {element}")
            if part["count"] // 3 > part["triangleBudget"]:
                raise ValueError(f"Exceeded element budget: {element}")
            if kind == "muscle":
                identity = muscle_identity(atlas, element, names[element], names)
                for field in ["identityScope", "wholeMuscleId", "wholeMuscleName", "wholeMuscleSide", "groupingEvidence"]:
                    if part.get(field) != identity.get(field):
                        raise ValueError(f"Invalid muscle hierarchy: {element}.{field}")
            else:
                for field, value in bone_identity(atlas, element, names[element], names).items():
                    if part.get(field) != value:
                        raise ValueError(f"Invalid skeletal hierarchy: {element}.{field}")
        if face_cursor != mesh["ni"] or vertex_cursor != mesh["nv"] or mesh_ids != expected[key]:
            raise ValueError(f"Incomplete source/triangle coverage: {key}")
    if seen_meshes != set(expected) or cursor != len(binary):
        raise ValueError("Incomplete mesh/binary coverage")
    if kind_counts != {"bone": 122, "muscle": 276} or sorted(seen) != meta["source"]["elementIds"]:
        raise ValueError("Source coverage must retain 122 skeletal and 276 muscle components")
    if meta["source"]["elementCount"] != len(seen):
        raise ValueError("Source component count mismatch")


def build():
    atlas = Atlas()
    names = exact_names(atlas)
    companions = {name: json.loads((OUT / f"{name}.json").read_text()) for name in ["body", "muscles"]}
    points, torso_points, *_ = reference_points(atlas)
    origin, torso = torso_basis(torso_points)
    for key, expected in [("referencePoseCm", points), ("torsoReferencePoseCm", torso_points)]:
        for companion in companions.values():
            if companion[key] != {str(k): v.tolist() for k, v in expected.items()}:
                raise ValueError(f"Source reference frame changed: {key}")
    binary, meshes = bytearray(), []
    for bundle, parent, elements in parent_specs(atlas, companions):
        frame_origin, frame_basis = source_frame(parent, points, origin, torso)
        frame = dict(originCm=frame_origin.tolist(), basisColumnsCm=frame_basis.T.tolist())
        if frame != parent["sourceFrame"]:
            raise ValueError(f"Source-frame formula drift: {parent['name']}")
        raw = [atlas.load_element(element) for element in elements]
        budgets = allocate_budgets([len(f) for _, f in raw], parent["triangleBudget"])
        vv, ff, parts, vertex_offset, index_offset = [], [], [], 0, 0
        for element, (vertices, faces), budget in zip(elements, raw, budgets):
            source_triangles = len(faces)
            side = source_side(names[element])
            if side and (1 if side == "L" else -1) * float(vertices[:, 0].mean()) <= 0:
                raise ValueError(f"Source-side geometry contradicts label: {element}")
            # Deduplicate normal seams inside this source OBJ only.
            vertices, remap = np.unique(vertices, axis=0, return_inverse=True)
            faces = remap[faces].astype(np.int32)
            if len(faces) > budget:
                vertices, faces = fast_simplification.simplify(vertices, faces, target_count=budget, agg=7.0)
            if len(faces) == 0 or len(faces) > budget:
                raise ValueError(f"Source surface lost or over budget: {element}")
            used, remap = np.unique(faces, return_inverse=True)
            vertices, faces = vertices[used], remap.reshape((-1, 3))
            local = np.linalg.solve(frame_basis, (vertices - frame_origin).T).T
            vv.append(local); ff.append(faces + vertex_offset)
            part = dict(id=element, name=names[element], kind="bone" if bundle == "body" else "muscle",
                        side=side, start=index_offset, count=int(faces.size), firstVertex=vertex_offset,
                        vertexCount=len(vertices), sourceTriangles=source_triangles, triangleBudget=budget)
            if bundle == "muscles":
                part.update(muscle_identity(atlas, element, names[element], names))
            else:
                part.update(bone_identity(atlas, element, names[element], names))
            parts.append(part)
            vertex_offset += len(vertices); index_offset += int(faces.size)
        local, indices = np.concatenate(vv), np.concatenate(ff)
        if len(local) > 65535:
            raise ValueError(f"Uint16 vertex limit exceeded: {parent['name']}")
        minimum, maximum = local.min(0), local.max(0)
        size = maximum - minimum
        if np.any(size <= 0) or not np.isfinite(local).all():
            raise ValueError(f"Invalid parent-local bounds: {parent['name']}")
        quantized = np.rint((local - minimum) / size * 65535).clip(0, 65535).astype("<u2")
        # Quantization can collapse very thin source triangles. Remove only those
        # faces, then compact each element's exclusive vertices independently.
        packed_vertices, packed_faces, vertex_offset, index_offset = [], [], 0, 0
        for part in parts:
            faces = indices.reshape(-1)[part["start"]:part["start"] + part["count"]].reshape((-1, 3))
            triangles = quantized[faces].astype(np.int64)
            area = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
            keep = np.any(area != 0, axis=1)
            faces = faces[keep]
            if not len(faces):
                raise ValueError(f"Quantization removed an entire source element: {part['id']}")
            used, remap = np.unique(faces, return_inverse=True)
            packed_vertices.append(quantized[used])
            packed_faces.append(remap.reshape((-1, 3)) + vertex_offset)
            part.update(start=index_offset, count=int(faces.size), firstVertex=vertex_offset, vertexCount=len(used),
                        droppedDegenerateTriangles=int((~keep).sum()))
            vertex_offset += len(used); index_offset += int(faces.size)
        quantized, indices = np.concatenate(packed_vertices), np.concatenate(packed_faces)
        off_v = len(binary); binary += quantized.tobytes()
        off_i = len(binary); binary += indices.astype("<u2").tobytes()
        entry = {key: parent[key] for key in ["name", "frame", "landmarks", "side", "cervical", "layer", "sourceFrame"] if key in parent}
        entry.update(parent=parent["name"], bundle=bundle, nv=len(quantized), ni=int(indices.size),
                     min=minimum.tolist(), size=size.tolist(), offV=off_v, offI=off_i,
                     parts=parts, triangleBudget=parent["triangleBudget"])
        meshes.append(entry)
        print(f"{parent['name']}: {len(parts)} exact source elements, {len(indices):,} triangles", flush=True)
    parts = [part for mesh in meshes for part in mesh["parts"]]
    source_ids = sorted(part["id"] for part in parts)
    meta = dict(schemaVersion=1, format="quantized-uint16-le", meshes=meshes,
                binaryBytes=len(binary), binarySha256=sha(binary),
                companionAssets={name: sha((OUT / name).read_bytes()) for name in COMPANIONS},
                attribution=ATTRIBUTION, license="CC-BY-SA-2.1-JP",
                licenseUrl="https://creativecommons.org/licenses/by-sa/2.1/jp/",
                source=dict(dataset="BodyParts3D", version="3.0", archiveDate="2011-09-15", sourceUnit="mm", outputUnit="cm",
                            transform="[x, z, -y] / 10", elementCount=len(source_ids), elementIds=source_ids,
                            downloads=[dict(url=BASE + remote, sha256=digest) for remote, digest in SOURCES.values()]),
                coverage=dict(sourceComponents=len(parts), boneComponents=122, muscleComponents=276, parentMeshes=len(meshes),
                              scope="Exact source OBJ identity for existing body skeletal and regional muscle coverage; not every anatomical muscle/bone in the human body.",
                              aggregateElements=[part["id"] for part in parts if part["identityScope"] == "source-aggregate"],
                              musclePartsWithoutValidatedWhole=[part["id"] for part in parts if part["identityScope"] == "muscle-part" and "wholeMuscleId" not in part],
                              excluded=["Organs; original head and hand geometry; atlas C1/C2 outside the existing body bundle.", *EXCLUDED]),
                simplification=dict(method="Independent source-OBJ simplification, followed by concatenation; never cross-weld source elements.",
                                    minimumAllocatedTriangles=MIN_TRIANGLES,
                                    budgets="Existing regional triangle budgets; proportional source triangle allocation with stable integer remainders."),
                limitations=["Exact source identity does not imply geometric or clinical accuracy after simplification and rigid pose registration.",
                             "A source element can be a muscle head, subdivision, bone part or an indivisible named aggregate; retain its exact source label.",
                             "Dorsal interossei in each foot share one source OBJ and cannot be picked as separate muscles in this dataset.",
                             "Whole-muscle fields group source heads/parts only when both the pinned name and hierarchy validate that relation; source element IDs remain primary.",
                             "Whole-muscle concepts may be bilateral: group by wholeMuscleId plus wholeMuscleSide, never by wholeMuscleId alone.", *LIMITATIONS])
    validate(meta, binary, atlas, companions)
    metadata = json.dumps(meta, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n"
    if len(binary) + len(metadata) > MAX_BYTES:
        raise ValueError(f"Combined individual body bundle exceeds {MAX_BYTES:,} bytes")
    return bytes(binary), metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="rebuild and require byte-identical JSON/binary without writing")
    args = parser.parse_args()
    immutable = {name: sha((OUT / name).read_bytes()) for name in COMPANIONS}
    fetch_sources()
    binary, metadata = build()
    for name, content in [("individual-body.bin", binary), ("individual-body.json", metadata)]:
        path = OUT / name
        if args.verify:
            if path.read_bytes() != content:
                raise SystemExit(f"Deterministic individual body rebuild differs: {name}")
        else:
            path.write_bytes(content)
    for name, digest in immutable.items():
        if sha((OUT / name).read_bytes()) != digest:
            raise SystemExit(f"Existing anatomy artifact changed: {name}")
    print(f"{'Verified byte-identical' if args.verify else 'Built'} individual body: {len(binary):,} binary bytes; "
          f"{len(metadata):,} JSON bytes; {len(binary) + len(metadata):,} combined; sha256={sha(binary)}")


if __name__ == "__main__":
    main()
