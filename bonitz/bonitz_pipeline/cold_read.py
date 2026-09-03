"""Read a tranche Opus has not seen with kraken, column by column.

    python3 -m bonitz_pipeline.cold_read 118-281

Writes ALTO to `work/kraken15-102/alto118-281/`. The per-column TEXT is not
written here — `filter_kraken_lines` writes it, because kraken's stock
segmenter over-splits a Bonitz column and the raw ALTO runs 63-74 lines where
the page has 61. Every phantom line shifts the stream against the other
readers and manufactures disagreements, so the text a panel sees has to come
out of the filter:

    python3 -m bonitz_pipeline.filter_kraken_lines \
        --alto-dir work/kraken15-102/alto118-281 \
        --txt-dir  work/kraken15-102/txt118-281

⚠ ALTO IN ONE PASS, NOT TEXT AND THEN A SECOND SEGMENTATION. The line
polygons are what calamari cuts its line images from and what `margin_guard`
measures line width against, so they have to survive the read — and asking
kraken to segment twice to keep them doubles a job that already runs for an
hour. `-a` carries the geometry out with the text.

⚠ e11 IS ROUND 6. `e11-0.9967.safetensors` — 0.33% character error, the model
of record. The other five checkpoints in `models/` score 0.9961-0.9963 and are
a tie the aggregate cannot break; picking by filename would pick the wrong one.

⚠ THIS IS FOR A HANDFUL OF COLUMNS, NOT A TRANCHE. Four workers took the Mac
down on 2026-08-27 — each kraken process loads a segmentation net AND a
recognition net — after 22 minutes of splitting columns and zero pages read.
A whole tranche goes to the Kaggle GPU: see `cold_read_export`. The default
here is ONE worker for that reason; raising it is a decision, not a default.

⚠ EVERY COLUMN IS SKIPPED IF ITS ALTO ALREADY EXISTS, so an interrupted run
resumes. Kraken takes ~28s a column on this machine and there are two per page.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image

from .split_columns import split_page

ROOT = Path(__file__).resolve().parent.parent
SCANS = ROOT / 'work' / 'scan400'
MODEL = ROOT / 'work' / 'kraken15-102' / 'models' / 'e11-0.9967.safetensors'
KRAKEN = Path.home() / '.local' / 'bin' / 'kraken'


def pages(spec: str) -> list[int]:
    lo, _, hi = spec.partition('-')
    return list(range(int(lo), int(hi or lo) + 1))


def read_column(job) -> tuple[str, str]:
    """Segment and recognise one column into ALTO. Returns (name, '' | error)."""
    col, alto, model = (Path(x) for x in job)
    if alto.exists() and alto.stat().st_size:
        return alto.name, ''
    cmd = [str(KRAKEN), '-a', '-i', str(col), str(alto),
           'segment', '-bl', 'ocr', '-m', str(model)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        return alto.name, (r.stderr.strip().splitlines()[-1]
                           if r.stderr else 'failed')
    try:
        ET.parse(alto)
    except ET.ParseError as e:
        return alto.name, f'unreadable ALTO: {e}'
    return alto.name, ''


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('pages', help='e.g. 118-281')
    ap.add_argument('--cols', type=Path,
                    default=ROOT / 'work' / 'kraken15-102' / 'cols118-281')
    ap.add_argument('--alto', type=Path)
    ap.add_argument('--model', type=Path, default=MODEL)
    ap.add_argument('--workers', type=int, default=1,
                    help='⚠ four of these crashed the Mac; a whole '
                         'tranche belongs on the GPU, not here')
    a = ap.parse_args(argv)
    ns = a.pages
    alto = a.alto or ROOT / 'work' / 'kraken15-102' / f'alto{ns}'
    for d in (a.cols, alto):
        d.mkdir(parents=True, exist_ok=True)

    jobs, missing = [], []
    for n in pages(ns):
        src = SCANS / f'page-{n:03d}.jpg'
        if not src.exists():
            missing.append(n)
            continue
        # ⚠ PNG, BECAUSE THAT IS WHAT `filter_kraken_lines` OPENS. `split_page`
        # writes TIFF and the filter globs for `.png`, so a TIFF column reads
        # as "missing alto or png" and the page is skipped with a message that
        # does not say the column exists in the wrong format.
        if not (a.cols / f'page-{n:03d}-L.png').exists():
            for t in split_page(src, a.cols):
                with Image.open(t) as im:
                    im.save(t.with_suffix('.png'))
                t.unlink()
        for c in 'LR':
            jobs.append((str(a.cols / f'page-{n:03d}-{c}.png'),
                         str(alto / f'page-{n:03d}-{c}.xml'), str(a.model)))
    if missing:
        print(f'no scan for page(s) {missing}', file=sys.stderr)
    todo = sum(1 for j in jobs if not Path(j[1]).exists())
    print(f'{len(jobs)} columns, {todo} still to read, {a.workers} workers')

    done = bad = 0
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        for name, err in ex.map(read_column, jobs):
            done += 1
            if err:
                bad += 1
                print(f'  {name}: {err}', file=sys.stderr)
            if done % 20 == 0:
                print(f'  {done}/{len(jobs)}', flush=True)
    print(f'read {len(jobs) - bad} columns into {alto}'
          + (f' · {bad} FAILED' if bad else ''))
    return 1 if bad else 0


if __name__ == '__main__':
    raise SystemExit(main())
