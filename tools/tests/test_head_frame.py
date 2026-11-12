"""Independent registration math. Run with unittest, no prototype input."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from head_frame import fit_similarity, apply_similarity, nearest, trimmed_icp, front_surface, to_head, verify_registration


class SimilarityTests(unittest.TestCase):
    def setUp(self):
        self.points = np.array([[0., 0., 0.], [3., 0., 0.], [0., 2., 0.],
                                [0., 0., 1.], [-1., 2., 3.], [2., -3., 1.]])

    def test_recovers_scale_proper_rotation_and_translation(self):
        rotation = np.array([[0., -1., 0.], [1., 0., 0.], [0., 0., 1.]])
        expected = self.points @ rotation * 1.7 + [4., -2., 5.]
        fit = fit_similarity(self.points, expected)
        np.testing.assert_allclose(apply_similarity(self.points, fit), expected, atol=1e-12)
        self.assertAlmostEqual(fit[0], 1.7)
        self.assertAlmostEqual(np.linalg.det(fit[1]), 1.)

    def test_cannot_fit_reflection_as_rotation(self):
        target = self.points * [-1., 1., 1.]
        fit = fit_similarity(self.points, target)
        self.assertGreater(np.linalg.det(fit[1]), .999999)
        self.assertGreater(np.linalg.norm(apply_similarity(self.points, fit) - target), .1)

    def test_rejects_degenerate_and_nonfinite_input(self):
        for source in [np.zeros((6, 3)), np.full((6, 3), np.nan), np.arange(18.).reshape(6, 3)]:
            with self.assertRaises(ValueError):
                fit_similarity(source, self.points)

    def test_nearest_correspondence_and_distance(self):
        distance, indices = nearest(np.array([[1., 0., 0.], [9., 0., 0.]]), np.array([[0., 0., 0.], [10., 0., 0.]]))
        np.testing.assert_array_equal(indices, [0, 1])
        np.testing.assert_allclose(distance, [1, 1])

    def test_fixed_iteration_trimmed_icp_rejects_a_distant_outlier(self):
        source = np.vstack([self.points, [100., 100., 100.]])
        target = self.points + [.1, -.05, .04]
        identity = (1., np.eye(3), np.zeros(3))
        a = trimmed_icp(source, target, identity, iterations=12, keep=6/7)
        b = trimmed_icp(source, target, identity, iterations=12, keep=6/7)
        np.testing.assert_allclose(apply_similarity(self.points, a), target, atol=1e-12)
        for first, second in zip(a, b):
            np.testing.assert_array_equal(first, second)

    def test_frontal_rays_pick_visible_triangle_and_preserve_missing_coverage(self):
        vertices = np.array([[0., 0., 1.], [2., 0., 3.], [0., 2., 5.],
                             [0., 0., -1.], [2., 0., -1.], [0., 2., -1.]])
        z = front_surface(np.array([[.5, .5], [0., 0.], [3., 3.]]), vertices,
                          np.array([[0, 1, 2], [3, 4, 5]]))
        np.testing.assert_allclose(z[:2], [2.5, 1.])
        self.assertTrue(np.isnan(z[2]))


class PinnedAnatomyTests(unittest.TestCase):
    def test_left_eyeball_remains_on_subject_left(self):
        from build_body import Atlas
        eyes, _, _, _ = Atlas().combine(['eyeball'])
        self.assertGreater(to_head(eyes[eyes[:, 0] > 0]).mean(axis=0)[0], 0)
        self.assertLess(to_head(eyes[eyes[:, 0] < 0]).mean(axis=0)[0], 0)

    def test_fixed_transform_meets_untrimmed_frontal_surface_gate(self):
        metrics = verify_registration()
        self.assertEqual(metrics['frontalSurface']['uncoveredRayCount'], 0)
        self.assertLess(metrics['frontalSurface']['rmsCm'], .35)
        self.assertLess(metrics['frontalSurface']['p95Cm'], .7)
        self.assertEqual(metrics['canonicalToSkin']['sampleCount'], 468)


if __name__ == '__main__':
    unittest.main()
