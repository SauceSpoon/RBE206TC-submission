#!/usr/bin/env python3
"""Train a compact 3-class shape classifier for cube/ball/pyramid."""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from torch import nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms


CLASSES = ["cube", "ball", "pyramid"]
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


@dataclass
class Sample:
  path: str
  label: int


class ShapeDataset(Dataset):
  def __init__(self, samples: list[Sample], transform: transforms.Compose) -> None:
    self.samples = samples
    self.transform = transform

  def __len__(self) -> int:
    return len(self.samples)

  def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
    sample = self.samples[idx]
    with Image.open(sample.path) as img:
      image = img.convert("RGB")
    return self.transform(image), sample.label


class ShapeNet(nn.Module):
  def __init__(self, num_classes: int = 3) -> None:
    super().__init__()
    self.features = nn.Sequential(
      nn.Conv2d(3, 16, kernel_size=3, padding=1, bias=False),
      nn.BatchNorm2d(16),
      nn.ReLU(inplace=True),
      nn.MaxPool2d(2),

      nn.Conv2d(16, 32, kernel_size=3, padding=1, bias=False),
      nn.BatchNorm2d(32),
      nn.ReLU(inplace=True),
      nn.MaxPool2d(2),

      nn.Conv2d(32, 64, kernel_size=3, padding=1, bias=False),
      nn.BatchNorm2d(64),
      nn.ReLU(inplace=True),
      nn.MaxPool2d(2),

      nn.Conv2d(64, 96, kernel_size=3, padding=1, bias=False),
      nn.BatchNorm2d(96),
      nn.ReLU(inplace=True),
      nn.AdaptiveAvgPool2d((1, 1)),
    )
    self.classifier = nn.Sequential(
      nn.Flatten(),
      nn.Dropout(0.2),
      nn.Linear(96, num_classes),
    )

  def forward(self, x: torch.Tensor) -> torch.Tensor:
    return self.classifier(self.features(x))


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument("--data-dir", default="dataset/shape_model_balanced")
  parser.add_argument("--out-dir", default="models/shape_classifier")
  parser.add_argument("--image-size", type=int, default=96)
  parser.add_argument("--epochs", type=int, default=50)
  parser.add_argument("--batch-size", type=int, default=32)
  parser.add_argument("--lr", type=float, default=1e-3)
  parser.add_argument("--val-ratio", type=float, default=0.2)
  parser.add_argument("--seed", type=int, default=42)
  parser.add_argument("--aug-profile", choices=["normal", "hard"], default="normal")
  parser.add_argument("--balanced-sampler", action="store_true")
  parser.add_argument("--class-weighted-loss", action="store_true")
  return parser.parse_args()


def set_seed(seed: int) -> None:
  random.seed(seed)
  np.random.seed(seed)
  torch.manual_seed(seed)
  torch.backends.cudnn.deterministic = True
  torch.backends.cudnn.benchmark = False


def load_samples(data_dir: Path) -> list[Sample]:
  samples: list[Sample] = []
  for label, class_name in enumerate(CLASSES):
    class_dir = data_dir / class_name
    if not class_dir.is_dir():
      raise FileNotFoundError(f"Missing class folder: {class_dir}")
    for path in sorted(class_dir.rglob("*")):
      if path.suffix.lower() in IMAGE_EXTS:
        samples.append(Sample(str(path), label))
  if not samples:
    raise RuntimeError(f"No images found in {data_dir}")
  return samples


def build_transforms(image_size: int, aug_profile: str) -> tuple[transforms.Compose, transforms.Compose]:
  if aug_profile == "hard":
    train_tf = transforms.Compose([
      transforms.RandomResizedCrop(image_size, scale=(0.68, 1.0), ratio=(0.75, 1.35)),
      transforms.RandomApply([transforms.ColorJitter(brightness=0.35, contrast=0.35, saturation=0.25)], p=0.8),
      transforms.RandomPerspective(distortion_scale=0.18, p=0.35),
      transforms.RandomAffine(degrees=18, translate=(0.12, 0.12), scale=(0.82, 1.18)),
      transforms.RandomHorizontalFlip(p=0.5),
      transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 1.0)),
      transforms.ToTensor(),
      transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ])
  else:
    train_tf = transforms.Compose([
      transforms.Resize((image_size, image_size)),
      transforms.RandomApply([transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.2)], p=0.7),
      transforms.RandomAffine(degrees=12, translate=(0.08, 0.08), scale=(0.9, 1.12)),
      transforms.RandomHorizontalFlip(p=0.5),
      transforms.ToTensor(),
      transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ])

  eval_tf = transforms.Compose([
    transforms.Resize((image_size, image_size)),
    transforms.ToTensor(),
    transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
  ])
  return train_tf, eval_tf


def class_counts(samples: list[Sample]) -> list[int]:
  return [sum(1 for sample in samples if sample.label == idx) for idx in range(len(CLASSES))]


def build_balanced_sampler(samples: list[Sample]) -> WeightedRandomSampler:
  counts = class_counts(samples)
  weights = [1.0 / counts[sample.label] for sample in samples]
  return WeightedRandomSampler(weights, num_samples=len(samples), replacement=True)


def build_loss_weights(samples: list[Sample], device: torch.device) -> torch.Tensor:
  counts = class_counts(samples)
  total = sum(counts)
  weights = [total / (len(CLASSES) * count) for count in counts]
  return torch.tensor(weights, dtype=torch.float32, device=device)


def choose_device() -> torch.device:
  if torch.backends.mps.is_available():
    return torch.device("mps")
  if torch.cuda.is_available():
    return torch.device("cuda")
  return torch.device("cpu")


def run_epoch(
  model: nn.Module,
  loader: DataLoader,
  criterion: nn.Module,
  device: torch.device,
  optimizer: torch.optim.Optimizer | None = None,
) -> tuple[float, float]:
  is_train = optimizer is not None
  model.train(is_train)
  total_loss = 0.0
  total_correct = 0
  total_count = 0

  for images, labels in loader:
    images = images.to(device)
    labels = labels.to(device)

    with torch.set_grad_enabled(is_train):
      logits = model(images)
      loss = criterion(logits, labels)

      if is_train:
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()

    batch_count = labels.size(0)
    total_loss += float(loss.item()) * batch_count
    total_correct += int((logits.argmax(dim=1) == labels).sum().item())
    total_count += batch_count

  return total_loss / total_count, total_correct / total_count


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[list[int], list[int]]:
  model.eval()
  y_true: list[int] = []
  y_pred: list[int] = []
  with torch.no_grad():
    for images, labels in loader:
      logits = model(images.to(device))
      preds = logits.argmax(dim=1).cpu().tolist()
      y_pred.extend(preds)
      y_true.extend(labels.tolist())
  return y_true, y_pred


def main() -> None:
  args = parse_args()
  set_seed(args.seed)

  data_dir = Path(args.data_dir)
  out_dir = Path(args.out_dir)
  out_dir.mkdir(parents=True, exist_ok=True)

  samples = load_samples(data_dir)
  labels = [sample.label for sample in samples]
  train_samples, val_samples = train_test_split(
    samples,
    test_size=args.val_ratio,
    stratify=labels,
    random_state=args.seed,
  )

  train_tf, eval_tf = build_transforms(args.image_size, args.aug_profile)
  sampler = build_balanced_sampler(train_samples) if args.balanced_sampler else None
  train_loader = DataLoader(
    ShapeDataset(train_samples, train_tf),
    batch_size=args.batch_size,
    shuffle=sampler is None,
    sampler=sampler,
    num_workers=0,
  )
  val_loader = DataLoader(
    ShapeDataset(val_samples, eval_tf),
    batch_size=args.batch_size,
    shuffle=False,
    num_workers=0,
  )

  device = choose_device()
  model = ShapeNet(num_classes=len(CLASSES)).to(device)
  loss_weights = build_loss_weights(train_samples, device) if args.class_weighted_loss else None
  criterion = nn.CrossEntropyLoss(weight=loss_weights)
  optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
  scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

  best_val_acc = -1.0
  best_epoch = 0
  history = []

  for epoch in range(1, args.epochs + 1):
    train_loss, train_acc = run_epoch(model, train_loader, criterion, device, optimizer)
    val_loss, val_acc = run_epoch(model, val_loader, criterion, device)
    scheduler.step()

    row = {
      "epoch": epoch,
      "train_loss": train_loss,
      "train_acc": train_acc,
      "val_loss": val_loss,
      "val_acc": val_acc,
      "lr": scheduler.get_last_lr()[0],
    }
    history.append(row)
    print(
      f"epoch {epoch:03d}/{args.epochs} "
      f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
      f"val_loss={val_loss:.4f} val_acc={val_acc:.4f}"
      , flush=True
    )

    if val_acc > best_val_acc:
      best_val_acc = val_acc
      best_epoch = epoch
      torch.save({
        "model_state": model.state_dict(),
        "classes": CLASSES,
        "image_size": args.image_size,
        "epoch": epoch,
        "val_acc": val_acc,
      }, out_dir / "best.pt")

  checkpoint = torch.load(out_dir / "best.pt", map_location=device, weights_only=False)
  model.load_state_dict(checkpoint["model_state"])
  y_true, y_pred = evaluate(model, val_loader, device)

  report = {
    "data_dir": str(data_dir),
    "classes": CLASSES,
    "class_to_index": {name: idx for idx, name in enumerate(CLASSES)},
    "image_size": args.image_size,
    "train_count": len(train_samples),
    "val_count": len(val_samples),
    "train_class_counts": dict(zip(CLASSES, class_counts(train_samples))),
    "val_class_counts": dict(zip(CLASSES, class_counts(val_samples))),
    "aug_profile": args.aug_profile,
    "balanced_sampler": args.balanced_sampler,
    "class_weighted_loss": args.class_weighted_loss,
    "best_epoch": best_epoch,
    "best_val_acc": best_val_acc,
    "confusion_matrix": confusion_matrix(y_true, y_pred, labels=list(range(len(CLASSES)))).tolist(),
    "classification_report": classification_report(y_true, y_pred, target_names=CLASSES, output_dict=True),
    "history": history,
  }
  (out_dir / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
  (out_dir / "labels.json").write_text(
    json.dumps({idx: name for idx, name in enumerate(CLASSES)}, indent=2),
    encoding="utf-8",
  )

  model_cpu = model.to("cpu").eval()
  example = torch.randn(1, 3, args.image_size, args.image_size)
  traced = torch.jit.trace(model_cpu, example)
  traced.save(str(out_dir / "best_torchscript.pt"))

  torch.save(model_cpu.state_dict(), out_dir / "best_state_dict.pt")

  print("")
  print(f"Best epoch: {best_epoch}")
  print(f"Best val acc: {best_val_acc:.4f}")
  print(f"Saved: {out_dir / 'best.pt'}")
  print(f"Saved: {out_dir / 'best_torchscript.pt'}")
  print(f"Saved: {out_dir / 'metrics.json'}")


if __name__ == "__main__":
  main()
