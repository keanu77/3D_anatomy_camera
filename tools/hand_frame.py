"""Geometry-derived right hand reference, raw atlas millimetres; no output input."""
from functools import lru_cache
import numpy as np

PALM = ['right ' + name for name in ['scaphoid', 'lunate', 'triquetral', 'pisiform',
        'trapezium', 'trapezoid', 'capitate', 'hamate']] + [
        f'right {ordinal} metacarpal bone' for ordinal in ['second', 'third', 'fourth', 'fifth']]
FINGERS = [(1, 2, 'right first metacarpal bone'), (2, 3, 'proximal phalanx of right thumb'),
           (3, 4, 'distal phalanx of right thumb')]
for start, name in [(5, 'index'), (9, 'middle'), (13, 'ring'), (17, 'little')]:
    FINGERS.extend((start + k, start + k + 1, f'{part} phalanx of right {name} finger')
                   for k, part in enumerate(['proximal', 'middle', 'distal']))


def raw_mm(points):
    return np.asarray(points)[..., [0, 2, 1]] * [10., -10., 10.]


def unit(vector):
    length = np.linalg.norm(vector)
    if not np.isfinite(length) or length < 1e-9:
        raise ValueError('Degenerate hand frame axis')
    return vector / length


def palm_basis(points):
    radial = points[5] - points[0]
    ulnar = points[17] - points[0]
    normal = unit(np.cross(radial, ulnar))
    depth = np.sqrt(np.linalg.norm(radial) * np.linalg.norm(ulnar))
    return np.column_stack([radial, ulnar, normal * depth])


def finger_basis(start, end, across):
    longitudinal = unit(end - start)
    lateral = unit(across - longitudinal * np.dot(longitudinal, across))
    return np.column_stack([longitudinal, lateral, np.cross(longitudinal, lateral)]) * np.linalg.norm(end - start)


def to_local(points, origin, basis):
    return np.linalg.solve(basis, (points - origin).T).T


def from_local(points, origin, basis):
    return np.asarray(points) @ basis.T + origin


def end_cap(vertices, direction):
    """Centroid of vertices in the terminal 2 mm (at most 10% length) slab."""
    projection = vertices @ unit(direction)
    thickness = min(2., .1 * np.ptp(projection))
    cap = vertices[projection >= projection.max() - thickness]
    return cap.mean(axis=0)


def reference_hand(atlas):
    points = np.empty((21, 3))
    evidence = [None] * 21
    def bone(name):
        return raw_mm(atlas.combine([name])[0])
    def joint(index, a_name, b_name):
        a, b = bone(a_name), bone(b_name)
        direction = b.mean(axis=0) - a.mean(axis=0)
        caps = [end_cap(a, direction), end_cap(b, -direction)]
        points[index] = np.mean(caps, axis=0)
        evidence[index] = dict(bones=[a_name, b_name], boneGroups=[[a_name], [b_name]],
            method='midpoint of adjacent terminal-cap centroids', caps=[p.tolist() for p in caps], axis=unit(direction).tolist())
    radius = bone('right radius')
    from head_frame import nearest
    radial_patches, carpal_patches = [], []
    carpal_names = ['right scaphoid', 'right lunate']
    # The radius's distal extreme is its styloid, not the joint surface centre.
    # Locate both opposing facets geometrically, using a fixed 0.5 mm band
    # around each pair's minimum gap. Weight the two facets equally.
    for name in carpal_names:
        carpal = bone(name)
        radial_distance, _ = nearest(radius, carpal)
        carpal_distance, _ = nearest(carpal, radius)
        threshold = min(radial_distance.min(), carpal_distance.min()) + .5
        radial_patches.append(radius[radial_distance <= threshold].mean(axis=0))
        carpal_patches.append(carpal[carpal_distance <= threshold].mean(axis=0))
    caps = [np.mean(radial_patches, axis=0), np.mean(carpal_patches, axis=0)]
    points[0] = np.mean(caps, axis=0)
    evidence[0] = dict(bones=['right radius', 'right scaphoid', 'right lunate'],
                       boneGroups=[['right radius'], carpal_names],
                       method='midpoint of opposing radiocarpal surface centroids; equal scaphoid/lunate facet weighting',
                       caps=[p.tolist() for p in caps], axis=unit(caps[1] - caps[0]).tolist())
    joint(1, 'right trapezium', 'right first metacarpal bone')
    joint(2, 'right first metacarpal bone', 'proximal phalanx of right thumb')
    joint(3, 'proximal phalanx of right thumb', 'distal phalanx of right thumb')
    for start, finger, ordinal in [(5, 'index', 'second'), (9, 'middle', 'third'),
                                    (13, 'ring', 'fourth'), (17, 'little', 'fifth')]:
        proximal = f'proximal phalanx of right {finger} finger'
        middle = f'middle phalanx of right {finger} finger'
        distal = f'distal phalanx of right {finger} finger'
        joint(start, f'right {ordinal} metacarpal bone', proximal)
        joint(start + 1, proximal, middle)
        joint(start + 2, middle, distal)
    for index, name, previous in [(4, 'distal phalanx of right thumb', 'proximal phalanx of right thumb')] + [
        (start + 3, f'distal phalanx of right {finger} finger', f'middle phalanx of right {finger} finger')
        for start, finger in [(5, 'index'), (9, 'middle'), (13, 'ring'), (17, 'little')]]:
        v, parent = bone(name), bone(previous)
        direction = unit(v.mean(axis=0) - parent.mean(axis=0))
        points[index] = v[np.argmax(v @ direction)]
        evidence[index] = dict(bones=[name], boneGroups=[[name]], method='furthest distal source vertex along the adjacent-bone direction')
    return points, evidence


@lru_cache(maxsize=1)
def hand_frame():
    from build_body import Atlas
    points, _ = reference_hand(Atlas())
    return points, palm_basis(points)


def to_palm(points):
    reference, basis = hand_frame()
    return to_local(raw_mm(points), reference[0], basis)


def hand_frames():
    points, _ = hand_frame()
    across = points[17] - points[5]
    return {f'hand_b_{a}_{b}': (points[a], finger_basis(points[a], points[b], across) / np.linalg.norm(points[b] - points[a]),
                              np.linalg.norm(points[b] - points[a])) for a, b, _ in FINGERS}
