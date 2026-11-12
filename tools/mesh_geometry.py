"""Small deterministic source-mesh operations, without optional spatial packages."""
import numpy as np


def clip_above(vertices, faces, *, axis, level):
    """Clip triangles against an axis plane, retaining winding; leave cut uncapped."""
    distances = vertices[:, axis] - level
    corners = distances[faces]
    inside = (corners >= 0).all(axis=1)
    crossing = (corners.max(axis=1) >= 0) & (corners.min(axis=1) < 0)
    polygons = [vertices[faces[inside]].reshape(-1, 3)]
    for triangle in vertices[faces[crossing]]:
        clipped = []
        for a, b in zip(triangle, np.roll(triangle, -1, axis=0)):
            da, db = a[axis] - level, b[axis] - level
            if da >= 0:
                clipped.append(a)
            if (da >= 0) != (db >= 0):
                point = a + (b - a) * da / (da - db)
                point[axis] = level
                clipped.append(point)
        if len(clipped) >= 3:
            polygons.append(np.array([[clipped[0], clipped[k], clipped[k + 1]] for k in range(1, len(clipped) - 1)]).reshape(-1, 3))
    vertices, inverse = np.unique(np.concatenate(polygons), axis=0, return_inverse=True)
    faces = inverse.reshape(-1, 3)
    area = np.cross(vertices[faces[:, 1]] - vertices[faces[:, 0]], vertices[faces[:, 2]] - vertices[faces[:, 0]])
    return vertices, faces[np.linalg.norm(area, axis=1) > 1e-12]
