from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("prepare_roboflow_yolo_dataset.py")
SPEC = importlib.util.spec_from_file_location("prepare_roboflow_yolo_dataset", MODULE_PATH)
prepare = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(prepare)


def test_copy_split_converts_polygon_labels_to_detection_boxes(tmp_path: Path) -> None:
  source_images = tmp_path / "source" / "images"
  source_labels = tmp_path / "source" / "labels"
  out_dir = tmp_path / "out"
  source_images.mkdir(parents=True)
  source_labels.mkdir(parents=True)

  image = source_images / "sample.jpg"
  image.write_bytes(b"fake image")
  (source_labels / "sample.txt").write_text(
    "2 0.2 0.3 0.6 0.3 0.6 0.7 0.2 0.7\n",
    encoding="utf-8",
  )

  counts = prepare.copy_split([image], source_labels, out_dir, "train")

  label_text = (out_dir / "labels" / "train" / "sample.txt").read_text(encoding="utf-8")
  assert label_text == "2 0.4 0.5 0.4 0.4\n"
  assert counts["black_pyramid"] == 1
