import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from hand_frame import palm_basis, finger_basis, reference_hand, to_local, from_local


class HandFrameMathTests(unittest.TestCase):
    def test_palm_landmarks_have_exact_affine_coordinates(self):
        points = np.zeros((21, 3))
        points[0] = [3, 4, 5]; points[5] = [4, 8, 5]; points[17] = [1, 7, 6]
        basis = palm_basis(points)
        local = to_local(points[[0, 5, 17]], points[0], basis)
        np.testing.assert_allclose(local, [[0, 0, 0], [1, 0, 0], [0, 1, 0]], atol=1e-12)
        np.testing.assert_allclose(from_local(local, points[0], basis), points[[0, 5, 17]], atol=1e-12)
        self.assertGreater(np.linalg.det(basis), 0)

    def test_finger_endpoints_map_to_unit_x_with_right_handed_axes(self):
        a, b, across = np.array([4., 2., 7.]), np.array([7., 6., 8.]), np.array([1., 0., 0.])
        basis = finger_basis(a, b, across)
        np.testing.assert_allclose(to_local(np.array([a, b]), a, basis), [[0, 0, 0], [1, 0, 0]], atol=1e-12)
        self.assertGreater(np.linalg.det(basis), 0)
        np.testing.assert_allclose(basis.T @ basis, np.eye(3) * np.sum((b-a)**2), atol=1e-12)

    def test_degenerate_axes_fail_instead_of_returning_nan(self):
        with self.assertRaises(ValueError): palm_basis(np.zeros((21, 3)))
        with self.assertRaises(ValueError): finger_basis(np.zeros(3), np.zeros(3), np.ones(3))


class HandSourceTests(unittest.TestCase):
    def test_all_21_reference_points_are_within_3mm_of_the_corresponding_bone_ends(self):
        import trimesh
        from build_body import Atlas
        from hand_frame import raw_mm
        atlas = Atlas()
        points, evidence = reference_hand(atlas)
        self.assertEqual(points.shape, (21, 3))
        self.assertEqual(len(evidence), 21)
        for index, entry in enumerate(evidence):
            # The carpal side of the wrist is one composite joint surface;
            # a central landmark need not touch every constituent carpal bone.
            for names in entry['boneGroups']:
                v, f, _, _ = atlas.combine(names)
                surface = trimesh.Trimesh(vertices=raw_mm(v), faces=f, process=False)
                _, distance, _ = trimesh.proximity.closest_point_naive(surface, points[index:index+1])
                self.assertLessEqual(distance[0], 3., f'landmark {index}, {names}: {distance[0]} mm')
            if 'caps' in entry:
                for cap in entry['caps']:
                    self.assertLessEqual(abs(np.dot(points[index] - cap, entry['axis'])), 3., f'landmark {index} end-face plane')


if __name__ == '__main__': unittest.main()
