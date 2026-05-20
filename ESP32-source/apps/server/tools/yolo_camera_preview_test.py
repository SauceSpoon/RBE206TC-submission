import unittest
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import yolo_camera_preview as preview


class YoloCameraPreviewTest(unittest.TestCase):
    def test_horizontal_flip_mirrors_frame_left_right(self):
        frame = np.zeros((4, 6, 3), dtype=np.uint8)
        frame[:, 0:2] = (255, 0, 0)

        flipped = preview.transform_frame(frame, flip_horizontal=True)

        self.assertTrue(np.all(flipped[:, 4:6] == (255, 0, 0)))
        self.assertTrue(np.all(flipped[:, 0:2] == (0, 0, 0)))

    def test_rotate_180_matches_opencv_rotation(self):
        frame = np.arange(4 * 6 * 3, dtype=np.uint8).reshape((4, 6, 3))

        rotated = preview.transform_frame(frame, rotate_180=True)

        self.assertTrue(np.array_equal(rotated, cv2.rotate(frame, cv2.ROTATE_180)))

    def test_scale_for_display_enlarges_preview_without_mutating_detection_frame(self):
        frame = np.arange(4 * 6 * 3, dtype=np.uint8).reshape((4, 6, 3))

        scaled = preview.scale_for_display(frame, 3)

        self.assertEqual(scaled.shape, (12, 18, 3))
        self.assertTrue(np.array_equal(frame, np.arange(4 * 6 * 3, dtype=np.uint8).reshape((4, 6, 3))))

    def test_detect_dominant_color_from_center_roi(self):
        frame = np.zeros((80, 100, 3), dtype=np.uint8)
        frame[20:60, 30:70] = (255, 0, 0)

        color = preview.detect_dominant_color(frame, (20, 10, 80, 70))

        self.assertEqual(color, "blue")

    def test_correct_label_keeps_yolo_shape_and_replaces_color(self):
        frame = np.zeros((80, 100, 3), dtype=np.uint8)
        frame[20:60, 30:70] = (255, 0, 0)

        label = preview.correct_label_color(frame, "red_pyramid", (20, 10, 80, 70))

        self.assertEqual(label, "blue_pyramid")

    def test_normalize_camera_url_accepts_ip_for_pc_brain(self):
        self.assertEqual(preview.normalize_camera_url("172.20.10.11"), "http://172.20.10.11/stream")
        self.assertEqual(preview.normalize_camera_url("172.20.10.11:81/stream"), "http://172.20.10.11:81/stream")
        self.assertEqual(preview.normalize_camera_url("http://172.20.10.11/jpg"), "http://172.20.10.11/jpg")

    def test_yolo_result_to_detections_matches_pc_brain_payload(self):
        class FakeTensor:
            def __init__(self, value):
                self.value = value

            def item(self):
                return self.value

        class FakeBox:
            cls = [FakeTensor(0)]
            conf = [FakeTensor(0.91)]
            xyxy = [np.array([10, 20, 50, 80], dtype=float)]

        class FakeResult:
            names = {0: "red_cube"}
            boxes = [FakeBox()]

        detections = preview.result_to_detections(FakeResult(), frame_width=100, frame_height=120)

        self.assertEqual(
            detections,
            [
                {
                    "label": "red_cube",
                    "confidence": 0.91,
                    "cx": 30,
                    "cy": 50,
                    "frameWidth": 100,
                    "frameHeight": 120,
                    "area": 2400,
                    "x": 10,
                    "y": 20,
                    "width": 40,
                    "height": 60,
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
