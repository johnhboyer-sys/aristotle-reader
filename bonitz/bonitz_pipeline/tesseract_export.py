"""Lay a Calamari export out as a tesstrain ground-truth directory.

    python3 -m bonitz_pipeline.tesseract_export --export work/calamari-export \
        --out work/tesstrain/tesstrain-repo/data/bonitz-ground-truth

Tesseract is the CONTROL, not the fifth vote. It is LSTM+CTC like kraken and
calamari, so it fails the way they fail — which is useless for finding an error
all three made together, and exactly what is wanted for telling insight from
noise: when PaddleOCR flags a site, Tesseract siding with the spine says Paddle
is noisy there, and Tesseract breaking ranks too says the site is real.

⚠ `grc` HAS 219 CHARACTERS AND NONE OF THEM IS `ȣ`, `ϗ` OR `ϛ`. Measured
2026-08-31 from tessdata_best. So this is a charset EXTENSION fine-tune, and a
run that quietly trained on the stock unicharset would produce a reader that
spells `ȣ` as ου — the failure this whole engine exists to avoid, and the same
one that makes genie and llama noisy.

⚠ THE HOLDOUT IS NOT COPIED. `calamari_export` put it in its own directory
gated on John's ruling; this reads `train/` only.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import unicodedata
from pathlib import Path

LIGATURES = ('ȣ', 'ϗ', 'ϛ')


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--export', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args(argv)

    manifest = a.export / 'MANIFEST.json'
    if not manifest.exists():
        raise SystemExit(f'{manifest} is missing — this must be a '
                         f'calamari_export directory')
    man = json.loads(manifest.read_text(encoding='utf-8'))
    if not man.get('holdout_columns'):
        raise SystemExit('the manifest records no holdout columns')

    src = a.export / 'train'
    a.out.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    n = 0
    for png in sorted(src.glob('*.png')):
        gt = src / (png.stem + '.gt.txt')
        if not gt.exists():
            raise SystemExit(f'no ground truth beside {png}')
        text = unicodedata.normalize(
            'NFC', gt.read_text(encoding='utf-8')).strip('\n')
        if not text.strip():
            continue
        seen.update(text)
        for s, d in ((png, a.out / png.name), (gt, a.out / gt.name)):
            if d.exists():
                d.unlink()
            try:
                os.link(s, d)              # hardlink: no second copy on disk
            except OSError:
                shutil.copy2(s, d)
        # tesstrain reads the text back itself; write it normalised.
        (a.out / gt.name).write_text(text + '\n', encoding='utf-8')
        n += 1

    absent = [g for g in LIGATURES if g not in seen]
    if absent:
        raise SystemExit(f'the ground truth contains no {absent!r} — a model '
                         f'trained without the ligatures cannot read this book')

    print(f'{n} line pairs -> {a.out}')
    print(f'  {len(seen)} characters · ligatures present: '
          + ' '.join(f'{g}=yes' for g in LIGATURES))
    print('  holdout lines copied: 0')
    return 0


if __name__ == '__main__':
    sys.exit(main())
