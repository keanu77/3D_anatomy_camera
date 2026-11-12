"""Independent BodyParts3D -> MediaPipe canonical-face registration, in cm.

Only public atlas surfaces and the pinned canonical OBJ enter this module.
Row-vector convention: target = source @ rotation * scale + translation.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_COMMIT = 'c85dfbc2506b65ebc9a76340dc1234513b18c215'
CANONICAL_SHA256 = '8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618'
CANONICAL_URL = f'https://raw.githubusercontent.com/google-ai-edge/mediapipe/{CANONICAL_COMMIT}/mediapipe/modules/face_geometry/data/canonical_face_model.obj'
CANONICAL_PATH = ROOT / 'tools/cache/canonical_face_model.obj'

# Frozen after 80 canonical-to-skin ICP iterations, keeping the closest 98%
# (458 / 468) of correspondences at each iteration. These are independent of
# all prior application head data. Full, untrimmed acceptance is checked below.
HEAD_SCALE = 1.1412436275406224
HEAD_ROTATION = np.array([
    [0.9999901461521536, 0.0009756788017103457, 0.004330779314461781],
    [-0.0008513954179849093, 0.9995903635568115, -0.028607345388992227],
    [-0.004356916849896415, 0.028603376290898725, 0.9995813444339209],
])
HEAD_TRANSLATION = np.array([0.30255977233003845, -172.41939509494148, -11.09066792360456])


def to_head(points):
    return apply_similarity(points, (HEAD_SCALE, HEAD_ROTATION, HEAD_TRANSLATION))


def reproduce_registration():
    """Explicit audit only: reproduce the frozen fit from public source geometry."""
    from build_body import Atlas, fetch_sources
    fetch_sources()
    skin, _, _, _ = Atlas().combine(['skin'])
    head = skin[skin[:, 1] > 140]
    canonical, _ = canonical_mesh()
    # Rough eye corners, nose tip, chin and forehead from the atlas's own
    # frontal/sagittal skin profiles. Snap each rough point to a real vertex.
    rough = np.array([[-4.2, 153, 17.8], [-1.6, 153, 18.5], [4.2, 153, 17.8],
                      [1.6, 153, 18.5], [0, 149.55, 21.1], [0, 142.55, 17], [0, 159, 18]])
    _, indices = nearest(rough, head)
    initial = fit_similarity(head[indices], canonical[[33, 133, 263, 362, 4, 152, 10]])
    def inverse(transform):
        scale, rotation, shift = transform
        return 1 / scale, rotation.T, -shift @ rotation.T / scale
    fitted = inverse(trimmed_icp(canonical, head, inverse(initial), iterations=80, keep=.98))
    for actual, expected in zip(fitted, (HEAD_SCALE, HEAD_ROTATION, HEAD_TRANSLATION)):
        if not np.allclose(actual, expected, rtol=0, atol=1e-12):
            raise ValueError('Frozen independent registration is not reproducible')
    return {'iterations': 80, 'keptCorrespondences': 458, 'matchesFrozenCoefficients': True}


def canonical_mesh():
    if not CANONICAL_PATH.exists():
        temporary = CANONICAL_PATH.with_suffix('.partial')
        subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                        '--output', str(temporary), CANONICAL_URL], check=True)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != CANONICAL_SHA256:
            raise ValueError('Canonical face download checksum mismatch')
        temporary.replace(CANONICAL_PATH)
    data = CANONICAL_PATH.read_bytes()
    if hashlib.sha256(data).hexdigest() != CANONICAL_SHA256:
        raise ValueError('Canonical face cache checksum mismatch')
    vertices, triangles = [], []
    for line in data.decode('ascii').splitlines():
        if line.startswith('v '):
            vertices.append([float(n) for n in line.split()[1:4]])
        elif line.startswith('f '):
            indices = [int(n.split('/')[0]) - 1 for n in line.split()[1:]]
            if len(indices) != 3:
                raise ValueError('Expected canonical triangular topology')
            triangles.append(indices)
    if len(vertices) != 468:
        raise ValueError('Expected 468 canonical vertices')
    return np.asarray(vertices), np.asarray(triangles, dtype=np.int32)


def fit_similarity(source, target):
    """Least squares positive-scale, proper-rotation similarity; never reflect."""
    source, target = np.asarray(source, dtype=float), np.asarray(target, dtype=float)
    if source.shape != target.shape or source.ndim != 2 or source.shape[1] != 3 or len(source) < 3:
        raise ValueError('Expected paired N x 3 coordinates')
    if not np.isfinite(source).all() or not np.isfinite(target).all():
        raise ValueError('Nonfinite registration input')
    a, b = source.mean(axis=0), target.mean(axis=0)
    x, y = source - a, target - b
    if np.linalg.matrix_rank(x) < 2 or np.linalg.matrix_rank(y) < 2:
        raise ValueError('Degenerate registration landmarks')
    u, singular, vt = np.linalg.svd(x.T @ y)
    correction = np.ones(3)
    correction[-1] = 1. if np.linalg.det(u @ vt) >= 0 else -1.
    rotation = (u * correction) @ vt
    scale = float(singular @ correction / np.sum(x * x))
    if scale <= 0:
        raise ValueError('Registration scale must be positive')
    return scale, rotation, b - a @ rotation * scale


def apply_similarity(points, transform):
    scale, rotation, translation = transform
    return np.asarray(points) @ rotation * scale + translation


def nearest(query, reference):
    """Exact deterministic nearest vertices, bounded temporary memory."""
    query, reference = np.asarray(query), np.asarray(reference)
    if not len(query) or not len(reference):
        raise ValueError('Empty nearest-neighbor input')
    indices, distances = [], []
    batch = max(1, 500_000 // len(reference))
    for start in range(0, len(query), batch):
        difference = query[start:start + batch, None, :] - reference[None, :, :]
        squared = np.sum(difference * difference, axis=2)
        chosen = np.argmin(squared, axis=1)
        indices.append(chosen)
        distances.append(np.sqrt(squared[np.arange(len(chosen)), chosen]))
    return np.concatenate(distances), np.concatenate(indices)


def trimmed_icp(source, target, initial, *, iterations=80, keep=.8):
    if iterations < 1 or not 0 < keep <= 1:
        raise ValueError('Invalid fixed ICP parameters')
    count = max(3, int(np.floor(len(source) * keep + 1e-9)))
    current = initial
    for _ in range(iterations):
        distance, indices = nearest(apply_similarity(source, current), target)
        selected = np.argsort(distance, kind='stable')[:count]
        current = fit_similarity(source[selected], target[indices[selected]])
    return current


def residuals(distances):
    values = np.asarray(distances)
    return {'sampleCount': len(values), 'rmsCm': float(np.sqrt(np.mean(values ** 2))),
            'p95Cm': float(np.quantile(values, .95)), 'maxCm': float(values.max())}


def front_surface(xy, vertices, faces):
    """Orthographic rays from +Z: most anterior triangle, NaN for uncovered XY."""
    triangles = vertices[faces]
    origin = triangles[:, 0]
    a, b = triangles[:, 1] - origin, triangles[:, 2] - origin
    area = a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]
    valid = np.abs(area) > 1e-12
    origin, a, b, area = origin[valid], a[valid], b[valid], area[valid]
    heights = []
    for point in xy:
        delta = point - origin[:, :2]
        u = (delta[:, 0] * b[:, 1] - delta[:, 1] * b[:, 0]) / area
        v = (a[:, 0] * delta[:, 1] - a[:, 1] * delta[:, 0]) / area
        hit = (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9)
        heights.append(float(np.max(origin[hit, 2] + u[hit] * a[hit, 2] + v[hit] * b[hit, 2])) if hit.any() else np.nan)
    return np.asarray(heights)


def verify_registration():
    """Verify fixed coefficients; never refit, trim, or silently change a gate."""
    import trimesh
    from build_body import Atlas, fetch_sources
    fetch_sources()
    canonical, faces = canonical_mesh()
    skin, skin_faces, _, _ = Atlas().combine(['skin'])
    head_faces = skin_faces[np.all(skin[skin_faces, 1] > 140, axis=1)]
    transformed = to_head(skin)
    vertex_distances, _ = nearest(canonical, transformed[skin[:, 1] > 140])
    target = trimesh.Trimesh(vertices=canonical, faces=faces, process=False)
    x, y = np.meshgrid(np.arange(-7.75, 7.76, .25), np.arange(-9.5, 8.51, .25))
    xy = np.column_stack([x.ravel(), y.ravel()])
    z = front_surface(xy, canonical, faces)
    visible = np.isfinite(z)
    xy, z = xy[visible], z[visible]
    canonical_points = np.column_stack([xy, z])
    triangle_ids = []
    for start in range(0, len(xy), 64):
        _, _, ids = trimesh.proximity.closest_point_naive(target, canonical_points[start:start + 64])
        triangle_ids.extend(ids)
    normals = np.cross(canonical[faces[:, 1]] - canonical[faces[:, 0]], canonical[faces[:, 2]] - canonical[faces[:, 0]])
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    # A frontal surface faces within 60 degrees of the viewing axis. This
    # geometric ROI is defined on the canonical mesh, independently of error.
    xy = xy[np.abs(normals[np.asarray(triangle_ids), 2]) >= .5]
    depths = front_surface(xy, transformed, head_faces)
    coverage = np.isfinite(depths)
    query = np.column_stack([xy[coverage], depths[coverage]])
    distances = []
    for start in range(0, len(query), 64):
        _, d, _ = trimesh.proximity.closest_point_naive(target, query[start:start + 64])
        distances.extend(d)
    metrics = {'canonicalToSkin': residuals(vertex_distances), 'frontalSurface': {
        **residuals(distances), 'totalRays': len(xy), 'uncoveredRayCount': int((~coverage).sum())}}
    front = metrics['frontalSurface']
    if front['uncoveredRayCount'] or front['rmsCm'] >= .35 or front['p95Cm'] >= .7:
        raise ValueError(f'R1 registration gate failed: {json.dumps(metrics)}')
    return metrics


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reproduce', action='store_true')
    args = parser.parse_args()
    print(json.dumps(reproduce_registration() if args.reproduce else verify_registration(), indent=2))
