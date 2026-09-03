"""Convert a Calamari export into PaddleOCR recognition inputs.

    python3 -m bonitz_pipeline.paddle_export --export work/calamari-export \
        --out work/paddle-export [--va-every 10]

PaddleOCR's recogniser reads a label file of `relative/path.png<TAB>text` and a
`dict.txt` of one character per line. Both come out of the SAME export kraken
and Calamari were measured on, so a comparison across engines measures the
engine and not three preprocessing pipelines.

⚠ THE DICT IS THE WHOLE REASON THIS ENGINE CAN READ THE BOOK. No stock model
has `ȣ`, `ϗ` or `ϛ` in its charset; trained against a stock dict it learns to
spell `ȣ` as ου and then disagrees with the spine on the commonest token class
in the index — which is genie and llama's failure, bought at the price of a GPU
run. So the dict is DERIVED FROM THE GROUND TRUTH, and a gate refuses to write
anything if a single character of a label is missing from it.

⚠ HOLDOUT LINES ARE NOT WRITTEN AT ALL. `calamari_export` already put them in
their own directory, gated on John's ruling; this reads only `train/`, and
validation is carved out of that — every Nth line, deterministically. A model
selected on the holdout has spent it (`holdout-spent-by-selection`), and the
holdout here answers one structural question instead: does the trained model
emit the ligatures, or has it silently learned to spell them out?

⚠ AND THE MANIFEST IS CHECKED, not the directory name. A hand-assembled export,
or one made before the ruling moved, is exactly where a held-out column slips
back into training — see the ⚠ notes in `pylaia_export`.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path


def read_pairs(split_dir: Path) -> list[tuple[str, str]]:
    """(image filename, ground-truth text) for every line in a split."""
    out = []
    for png in sorted(split_dir.glob('*.png')):
        gt = png.with_suffix('').with_suffix('.gt.txt')
        if not gt.exists():
            gt = png.parent / (png.stem + '.gt.txt')
        if not gt.exists():
            raise SystemExit(f'no ground truth beside {png}')
        text = unicodedata.normalize(
            'NFC', gt.read_text(encoding='utf-8')).strip('\n')
        if not text.strip():
            continue
        out.append((png.name, text))
    return out


def charset(pairs: list[tuple[str, str]]) -> list[str]:
    """Every character the ground truth uses, in a stable order.

    Sorted by codepoint so two runs of this produce byte-identical dicts — a
    dict that reorders between runs silently invalidates a checkpoint.
    """
    seen: set[str] = set()
    for _, text in pairs:
        seen.update(text)
    seen.discard('\n')
    return sorted(seen)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--export', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--va-every', type=int, default=10)
    a = p.parse_args(argv)

    manifest = a.export / 'MANIFEST.json'
    if not manifest.exists():
        raise SystemExit(
            f'{manifest} is missing — this must be a calamari_export '
            f'directory, whose manifest records the ruling that gated it')
    man = json.loads(manifest.read_text(encoding='utf-8'))
    held = man.get('holdout_columns') or []
    if not held:
        raise SystemExit('the manifest records no holdout columns')

    train = read_pairs(a.export / 'train')
    if not train:
        raise SystemExit(f'no line pairs under {a.export / "train"}')

    chars = charset(train)
    missing = {c for _, t in train for c in t} - set(chars)
    if missing:
        raise SystemExit(f'dict does not cover {sorted(missing)!r}')

    # ⚠ NAME THE LIGATURES IN THE OUTPUT. A dict that has silently lost them is
    # the one failure this whole engine exists to avoid, and it is invisible in
    # a character count.
    ligatures = {'ȣ': 'ou', 'ϗ': 'kai', 'ϛ': 'stigma'}
    absent = [g for g in ligatures if g not in chars]
    if absent:
        raise SystemExit(
            f'the ground truth contains no {absent!r} — a dict without the '
            f'ligatures trains a reader that cannot see them')

    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / 'dict.txt').write_text(
        '\n'.join(chars) + '\n', encoding='utf-8')

    tr, va = [], []
    for i, (name, text) in enumerate(train):
        (va if a.va_every and i % a.va_every == 0 else tr).append(
            f'train/{name}\t{text}')
    # ⚠ NO TRAILING NEWLINE. PaddleOCR's SimpleDataSet does
    # `line.strip('\\n').split(delimiter)` and then indexes [1]; a final empty
    # line raises `list index out of range` while it initialises the dataset,
    # which it logs and swallows.
    (a.out / 'rec_gt_train.txt').write_text('\n'.join(tr), encoding='utf-8')
    (a.out / 'rec_gt_val.txt').write_text('\n'.join(va), encoding='utf-8')
    (a.out / 'MANIFEST.json').write_text(json.dumps({
        'from': str(a.export),
        'holdout_columns': held,
        'holdout_lines_written': 0,
        'train_lines': len(tr),
        'val_lines': len(va),
        'chars': len(chars),
        'ligatures_present': {g: (g in chars) for g in ligatures},
    }, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    print(f'{len(train)} line pairs · {len(chars)} characters in the dict')
    print(f'  train {len(tr)}   val {len(va)}   holdout written 0')
    print('  ligatures in dict: ' + ' '.join(
        f'{g}={"yes" if g in chars else "NO"}' for g in ligatures))
    print(f'-> {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
