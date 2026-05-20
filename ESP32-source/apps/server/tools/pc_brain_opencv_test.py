import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pc_brain_opencv as brain
import numpy as np


class FakeShapeClassifier:
    def classify(self, _frame, _box):
        return "pyramid", 0.87


class PcBrainOpenCvTest(unittest.TestCase):
    def test_normalize_camera_url_accepts_ip_and_existing_paths(self):
        self.assertEqual(brain.normalize_camera_url("172.20.10.11"), "http://172.20.10.11/stream")
        self.assertEqual(brain.normalize_camera_url("172.20.10.11:81/stream"), "http://172.20.10.11:81/stream")
        self.assertEqual(brain.normalize_camera_url("http://172.20.10.11/jpg"), "http://172.20.10.11/jpg")

    def test_saved_hsv_config_overrides_default_color_range(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "pc_brain_hsv.json"
            brain.save_color_ranges(
                config_path,
                {
                    **brain.DEFAULT_COLOR_RANGES,
                    "blue": [((90, 70, 40), (125, 255, 230))],
                },
            )

            loaded = brain.load_color_ranges(config_path)

        self.assertEqual(loaded["blue"], [((90, 70, 40), (125, 255, 230))])
        self.assertEqual(loaded["red"], brain.DEFAULT_COLOR_RANGES["red"])

    def test_update_single_color_range_preserves_other_colors(self):
        ranges = brain.update_single_color_range(
            brain.DEFAULT_COLOR_RANGES,
            "green",
            (41, 50, 60),
            (80, 240, 250),
        )

        self.assertEqual(ranges["green"], [((41, 50, 60), (80, 240, 250))])
        self.assertEqual(ranges["yellow"], brain.DEFAULT_COLOR_RANGES["yellow"])

    def test_rotate_180_rotates_frame_before_detection(self):
        frame = np.zeros((80, 100, 3), dtype=np.uint8)
        frame[8:28, 12:32] = (0, 255, 255)

        original = brain.detect(frame, 20, {"yellow": brain.DEFAULT_COLOR_RANGES["yellow"]})[0]
        rotated = brain.detect(
            brain.apply_frame_rotation(frame, rotate_180=True),
            20,
            {"yellow": brain.DEFAULT_COLOR_RANGES["yellow"]},
        )[0]

        self.assertLess(original["cx"], 35)
        self.assertGreater(rotated["cx"], 65)
        self.assertLess(original["cy"], 30)
        self.assertGreater(rotated["cy"], 50)

    def test_horizontal_flip_corrects_left_right_after_rotation(self):
        frame = np.zeros((80, 100, 3), dtype=np.uint8)
        frame[8:28, 12:32] = (0, 255, 255)

        rotated_and_flipped = brain.detect(
            brain.apply_frame_transform(frame, rotate_180=True, flip_horizontal=True),
            20,
            {"yellow": brain.DEFAULT_COLOR_RANGES["yellow"]},
        )[0]

        self.assertLess(rotated_and_flipped["cx"], 35)
        self.assertGreater(rotated_and_flipped["cy"], 50)

    def test_shape_model_classifier_overrides_contour_shape_for_target_objects(self):
        frame = np.zeros((100, 120, 3), dtype=np.uint8)
        frame[30:70, 35:75] = (0, 0, 255)

        detection = brain.detect(
            frame,
            20,
            {"red": brain.DEFAULT_COLOR_RANGES["red"]},
            shape_classifier=FakeShapeClassifier(),
        )[0]

        self.assertEqual(detection["color"], "red")
        self.assertEqual(detection["shape"], "pyramid")
        self.assertEqual(detection["label"], "red_pyramid")
        self.assertEqual(detection["shapeConfidence"], 0.87)

    def test_contour_shape_source_keeps_geometry_instead_of_model_prediction(self):
        frame = np.zeros((100, 120, 3), dtype=np.uint8)
        frame[30:70, 35:75] = (0, 0, 255)

        detection = brain.detect(
            frame,
            20,
            {"red": brain.DEFAULT_COLOR_RANGES["red"]},
            shape_classifier=FakeShapeClassifier(),
            shape_source="contour",
        )[0]

        self.assertEqual(detection["shape"], "cube")
        self.assertEqual(detection["label"], "red_cube")
        self.assertNotIn("shapeConfidence", detection)

    def test_large_background_and_edge_boxes_can_be_rejected(self):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        frame[:, :55] = (0, 0, 0)
        frame[55:90, 80:115] = (0, 255, 255)

        detections = brain.detect(
            frame,
            20,
            {
                "black": brain.DEFAULT_COLOR_RANGES["black"],
                "yellow": brain.DEFAULT_COLOR_RANGES["yellow"],
            },
            max_area_ratio=0.2,
            reject_edge_boxes=True,
        )

        self.assertEqual([item["label"] for item in detections], ["yellow_cube"])

    def test_column_labels_stay_column_even_when_shape_model_is_enabled(self):
        frame = np.zeros((120, 80, 3), dtype=np.uint8)
        frame[20:100, 25:45] = (0, 255, 255)

        detection = brain.detect(
            frame,
            20,
            {"yellow": brain.DEFAULT_COLOR_RANGES["yellow"]},
            shape_classifier=FakeShapeClassifier(),
        )[0]

        self.assertEqual(detection["shape"], "column")
        self.assertEqual(detection["label"], "yellow_column")


if __name__ == "__main__":
    unittest.main()
