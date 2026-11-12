import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mesh_geometry import clip_above


class PlaneClipTests(unittest.TestCase):
    def test_clips_exactly_at_plane_preserving_area_and_winding(self):
        v = np.array([[-1., -1., 0.], [1., -1., 0.], [1., 1., 0.], [-1., 1., 0.]])
        f = np.array([[0, 1, 2], [0, 2, 3]])
        points, faces = clip_above(v, f, axis=1, level=0.)
        self.assertEqual(points[:, 1].min(), 0.)
        cross = np.cross(points[faces[:, 1]] - points[faces[:, 0]], points[faces[:, 2]] - points[faces[:, 0]])
        self.assertAlmostEqual(np.linalg.norm(cross, axis=1).sum() / 2, 2.)
        self.assertTrue((cross[:, 2] > 0).all())


if __name__ == '__main__':
    unittest.main()
