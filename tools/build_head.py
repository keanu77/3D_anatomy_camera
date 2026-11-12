#!/usr/bin/env python3
"""Rebuild independent head surfaces in the pinned MediaPipe canonical frame.

All head and hand geometry is generated from pinned public source geometry.
No prototype HTML, extracted head fit, pivot or head labels enter this builder.
"""
import argparse
import json

import fast_simplification
import numpy as np
from mesh_geometry import clip_above

from build_body import Atlas, ATTRIBUTION, BASE, OUT, SOURCES, fetch_sources, sha
from head_frame import (CANONICAL_COMMIT, CANONICAL_SHA256, CANONICAL_URL,
                        canonical_mesh, to_head, verify_registration)
from build_individual_head import specifications
from hand_frame import PALM, FINGERS, hand_frame, reference_hand, raw_mm, to_palm, finger_basis, to_local

FIT_IDS = [4, 6, 9, 21, 251, 54, 284, 172, 397, 78, 308, 132, 361, 199]


def simplify(vertices, faces, budget):
    vertices, remap = np.unique(vertices, axis=0, return_inverse=True)
    faces = remap[faces].astype(np.int32)
    if len(faces) > budget:
        vertices, faces = fast_simplification.simplify(vertices, faces, target_count=budget, agg=7.)
    return vertices, np.asarray(faces, dtype=np.int64)


def concatenate(pieces):
    vertices, faces, offset = [], [], 0
    for v, f in pieces:
        vertices.append(v); faces.append(f + offset); offset += len(v)
    return np.concatenate(vertices), np.concatenate(faces)


def pack_mesh(binary, name, vertices, faces, sources):
    if len(vertices) > 65535 or not np.isfinite(vertices).all():
        raise ValueError(f'Invalid head geometry: {name}')
    low, size = vertices.min(axis=0), np.ptp(vertices, axis=0)
    quantized = np.rint((vertices - low) / size * 65535).clip(0, 65535).astype('<u2')
    start = len(binary)
    binary.extend(quantized.tobytes())
    indices = len(binary)
    binary.extend(faces.astype('<u2').tobytes())
    return dict(name=name, nv=len(vertices), ni=int(faces.size), min=low.tolist(), size=size.tolist(),
                offV=start, offI=indices, sourceElements=sources, license='CC-BY-SA-2.1-JP')


def jaw_pivot(atlas):
    vertices, _, _, _ = atlas.combine(['mandible'])
    condyles = []
    for sign in [-1, 1]:
        half = vertices[vertices[:, 0] * sign > 3]
        upper = half[half[:, 1] >= np.quantile(half[:, 1], .65)]
        posterior = upper[upper[:, 2] <= np.quantile(upper[:, 2], .35)]
        cap = posterior[posterior[:, 1] >= np.quantile(posterior[:, 1], .8)]
        condyles.append(cap.mean(axis=0))
    return to_head(np.mean(condyles, axis=0)).tolist()


def labels(atlas):
    entries = [
        ('Frontal bone', 'skull', ['frontal bone']),
        ('Parietal bone', 'skull', ['left parietal bone', 'right parietal bone']),
        ('Temporal bone', 'skull', ['left temporal bone', 'right temporal bone']),
        ('Occipital bone', 'skull', ['occipital bone']),
        ('Nasal bone', 'skull', ['left nasal bone', 'right nasal bone']),
        ('Zygomatic bone (cheekbone)', 'skull', ['left zygomatic bone', 'right zygomatic bone']),
        ('Maxilla (upper jaw)', 'skull', ['left maxilla', 'right maxilla']),
        ('Mandible (lower jaw)', 'skull', ['mandible']),
        ('Eyeball', 'eyes', ['eyeball']),
        ('Frontal lobe', 'brain', ['frontal lobe']),
        ('Parietal lobe', 'brain', ['parietal lobe']),
        ('Temporal lobe', 'brain', ['temporal lobe']),
        ('Occipital lobe', 'brain', ['occipital lobe']),
        ('Cerebellum', 'brain', ['cerebellum']),
        ('Pons (brainstem)', 'brain', ['pons']),
        ('Medulla oblongata', 'brain', ['medulla oblongata']),
    ]
    for text in ['Frontalis', 'Temporalis', 'Orbicularis oculi', 'Nasalis', 'Zygomaticus major',
                 'Masseter', 'Orbicularis oris', 'Depressor anguli oris', 'Mentalis']:
        entries.append((text, 'muscles', [text.lower()]))
    teeth = sorted(n for n in atlas.names if n.endswith(' tooth') and atlas.names[n] in atlas.files)
    entries.append(('Teeth', 'skull', teeth))
    result = []
    for text, layer, names in entries:
        vertices, _, _, _ = atlas.combine(names)
        points = []
        for side in [-1, 1]:
            half = vertices[vertices[:, 0] * side > 0]
            if not len(half):
                continue
            center = half.mean(axis=0)
            points.append(to_head(half[np.argmin(np.linalg.norm(half - center, axis=1))]).tolist())
        result.append(dict(t=text, layer=layer, jaw=names == ['mandible'], pts=points))
    return result


def build():
    fetch_sources()
    registration = verify_registration()
    atlas = Atlas()
    meshes, binary = [], bytearray()
    for name, sources, budget in [('eyes', ['eyeball'], 2500),
                                  ('cerebrum', ['cerebral hemisphere'], 70000),
                                  ('hindbrain', ['cerebellum', 'pons', 'medulla oblongata'], 16000)]:
        v, f, ids, _ = atlas.combine(sources)
        v, f = simplify(v, f, budget)
        meshes.append(pack_mesh(binary, name, to_head(v), f, ids))
    # Same source-specific simplification as the detail bundle: coarse rendering
    # and source-identity picking share aligned surfaces without per-part fitting.
    for name, budget, selections in specifications(atlas):
        if name == 'hand_palm':
            continue
        pieces = [(element, *atlas.load_element(element)) for element, _ in selections]
        weights = np.sqrt([len(f) for _, _, f in pieces]); weights /= weights.sum()
        simplified = [simplify(v, f, min(len(f), max(96, int(budget * w)))) for (_, v, f), w in zip(pieces, weights)]
        v, f = concatenate(simplified)
        meshes.append(pack_mesh(binary, name, to_head(v), f, [element for element, _, _ in pieces]))
    v, f, ids, _ = atlas.combine(['skin'])
    v, f = clip_above(v, f, axis=1, level=141.)
    v, f = simplify(v, f, 14000)
    meshes.append(pack_mesh(binary, 'skin', to_head(v), f, ids))
    points, methods = reference_hand(atlas)
    v, f, ids, _ = atlas.combine(PALM)
    v, f = simplify(v, f, 7000)
    meshes.append(pack_mesh(binary, 'hand_palm', to_palm(v), f, ids))
    across = points[17] - points[5]
    for a, b, name in FINGERS:
        v, f, ids, _ = atlas.combine([name])
        budget = 700 if (a, b) == (1, 2) else 450 if b in [4, 8, 12, 16, 20] else 600
        v, f = simplify(v, f, budget)
        basis = finger_basis(points[a], points[b], across)
        local = to_local(raw_mm(v), points[a], basis)
        meshes.append(pack_mesh(binary, f'hand_b_{a}_{b}', local, f, ids))
    canonical, _ = canonical_mesh()
    meta = dict(meshes=meshes, labels=labels(atlas), jawPivot=jaw_pivot(atlas),
                handReference=points.tolist(), handReferenceMethods=methods, fit={str(i): canonical[i].tolist() for i in FIT_IDS},
                source=dict(dataset='BodyParts3D', version='3.0',
                    downloads=[dict(url=BASE + name, sha256=digest) for name, digest in SOURCES.values()],
                    canonicalFace=dict(url=CANONICAL_URL, commit=CANONICAL_COMMIT, sha256=CANONICAL_SHA256, license='Apache-2.0')),
                registration=registration, attribution=ATTRIBUTION,
                binaryBytes=len(binary), binarySha256=sha(binary),
                handFrame=dict(version=1, units='raw atlas mm', sourceSide='R', mirroredForLeft=True,
                    palmBasisColumns=hand_frame()[1].T.tolist(),
                    fingerBasisColumns={f'hand_b_{a}_{b}': finger_basis(points[a], points[b], across).T.tolist() for a,b,_ in FINGERS}))
    return bytes(binary), json.dumps(meta, ensure_ascii=False, sort_keys=True, indent=2).encode() + b'\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    protected = {p: sha(p.read_bytes()) for p in OUT.iterdir() if p.suffix in ['.json', '.bin'] and p.name not in ['head.json', 'head.bin']}
    binary, metadata = build()
    for name, data in [('head.bin', binary), ('head.json', metadata)]:
        target = OUT / name
        if args.verify:
            if target.read_bytes() != data:
                raise SystemExit(f'Deterministic rebuild differs: {name}')
        else:
            target.write_bytes(data)
    for path, digest in protected.items():
        if sha(path.read_bytes()) != digest:
            raise SystemExit(f'Unrelated geometry changed: {path.name}')
    print(f"{'Verified byte-identical' if args.verify else 'Built'} head: {len(binary)} bytes; SHA256 {sha(binary)}")


if __name__ == '__main__':
    main()
