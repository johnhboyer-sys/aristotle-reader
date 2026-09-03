#!/usr/bin/env python
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path("/teamspace/studios/this_studio")
OUT = ROOT / "oof-results-2026-08-14"
TRAIN = ROOT / "bonitz-data/calamari-export/train"
EXPECTED = set(range(4693))

OUT.mkdir(exist_ok=True)
(OUT / "logs").mkdir(exist_ok=True)
(OUT / "raw").mkdir(exist_ok=True)
(OUT / "fold-maps").mkdir(exist_ok=True)

marker = OUT / "RUN-STARTED"
if marker.exists():
    raise SystemExit(f"Refusing to reuse an existing run: {OUT}")
marker.write_text("OOF run started\n")

def load_val_images(n):
    path = ROOT / f"best_models/{n}.ckpt.json"
    data = json.loads(path.read_text())
    try:
        items = data["gen"]["val"]["images"]
    except KeyError:
        raise SystemExit(f"MODEL {n}: could not find scenario.data.gen.val.images")

    found = []
    for item in items:
        item = str(item)
        matches = glob.glob(item) if any(c in item for c in "*?[") else [item]
        for match in matches:
            p = Path(match)
            if p.parent.name != "train":
                raise SystemExit(
                    f"MODEL {n}: saved validation path is not a train image: {p}"
                )
            found.append((TRAIN / p.name).resolve())
    return found

fold_for_index = {}
image_for_index = {}
fold_indices = {}

print("Checking all five validation sets...", flush=True)

for n in range(5):
    model = ROOT / f"best_models/{n}.ckpt/saved_model.pb"
    settings = ROOT / f"best_models/{n}.ckpt.json"
    if not model.is_file() or not settings.is_file():
        raise SystemExit(f"MODEL {n}: files missing")

    indices = []
    for image in load_val_images(n):
        if not image.is_file():
            raise SystemExit(f"MODEL {n}: missing image: {image}")
        if image.parent != TRAIN.resolve():
            raise SystemExit(f"MODEL {n}: image outside the training directory: {image}")

        match = re.fullmatch(r"(\d{5})\.png", image.name)
        if not match:
            raise SystemExit(f"MODEL {n}: bad image name: {image.name}")

        index = int(match.group(1))
        if index in fold_for_index:
            raise SystemExit(
                f"INDEX {index}: appears in both fold "
                f"{fold_for_index[index]} and fold {n}"
            )

        fold_for_index[index] = n
        image_for_index[index] = image
        indices.append(index)

    indices.sort()
    fold_indices[n] = indices
    map_path = OUT / "fold-maps" / f"fold-{n}-val-indices.txt"
    map_path.write_text("".join(f"{i}\n" for i in indices))
    print(f"FOLD {n}: {len(indices)} held-out training lines", flush=True)

actual = set(fold_for_index)
missing = sorted(EXPECTED - actual)
extra = sorted(actual - EXPECTED)

if missing or extra:
    raise SystemExit(
        f"PARTITION FAILED: missing={missing[:20]} extra={extra[:20]}"
    )

print("PARTITION: EXACT — all indices 0 through 4692 appear once", flush=True)

predict = shutil.which("calamari-predict")
if not predict:
    raise SystemExit("calamari-predict not found in the active environment")

def run_prediction(label, checkpoints, indices):
    raw_dir = OUT / "raw" / label
    raw_dir.mkdir()
    log_path = OUT / "logs" / f"{label}.log"

    command = [
        predict,
        "--checkpoint", *[str(p) for p in checkpoints],
        "--output_dir", str(raw_dir),
        "--data.images", *[str(image_for_index[i]) for i in indices],
    ]

    print(f"\nSTARTING {label}: {len(indices)} lines", flush=True)

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    with log_path.open("wb") as log:
        while True:
            chunk = os.read(process.stdout.fileno(), 4096)
            if not chunk:
                break
            log.write(chunk)
            log.flush()
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()

    status = process.wait()
    if status != 0:
        raise SystemExit(
            f"{label} FAILED with exit status {status}; see {log_path}"
        )

    print(f"{label}: prediction command finished", flush=True)
    return raw_dir

def read_prediction(raw_dir, index):
    matches = list(raw_dir.rglob(f"{index:05d}.pred.txt"))
    if len(matches) == 0:
        return None
    if len(matches) > 1:
        raise SystemExit(f"INDEX {index}: duplicate predictions in {raw_dir}")

    text = matches[0].read_text(encoding="utf-8").rstrip("\r\n")
    text = unicodedata.normalize("NFC", text)

    if "\t" in text or "\n" in text or "\r" in text:
        raise SystemExit(f"INDEX {index}: prediction contains a tab or newline")
    return text

oof_predictions = {}
oof_missing = []

for n in range(5):
    indices = fold_indices[n]
    raw = run_prediction(
        f"fold-{n}",
        [ROOT / f"best_models/{n}.ckpt"],
        indices,
    )

    for index in indices:
        prediction = read_prediction(raw, index)
        if prediction is None:
            prediction = ""
            oof_missing.append(index)
        oof_predictions[index] = prediction

vote_indices = list(range(4693))
vote_raw = run_prediction(
    "vote",
    [ROOT / f"best_models/{n}.ckpt" for n in range(5)],
    vote_indices,
)

vote_predictions = {}
vote_missing = []

for index in vote_indices:
    prediction = read_prediction(vote_raw, index)
    if prediction is None:
        prediction = ""
        vote_missing.append(index)
    vote_predictions[index] = prediction

def write_tsv(path, predictions):
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for index in range(4693):
            f.write(f"{index}\t{predictions[index]}\n")

write_tsv(OUT / "train-oof.tsv", oof_predictions)
write_tsv(OUT / "train-vote.tsv", vote_predictions)

report = [
    "OUT-OF-FOLD PREDICTION REPORT",
    f"Resolved training input directory: {TRAIN.resolve()}",
    "Holdout read: NO",
    "Models retrained, converted, or overwritten: NO",
    f"OOF rows: {len(oof_predictions)}",
    f"Vote rows: {len(vote_predictions)}",
    f"OOF missing predictions: {len(oof_missing)}",
    f"Vote missing predictions: {len(vote_missing)}",
    f"OOF missing indices: {oof_missing}",
    f"Vote missing indices: {vote_missing}",
]
(OUT / "RUN-REPORT.txt").write_text("\n".join(report) + "\n")

print("\nOOF RUN COMPLETE", flush=True)
for line in report:
    print(line, flush=True)
