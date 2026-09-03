"""Turn a PaddleOCR `predicts.txt` back into per-column text the panel can read.

    python3 -m bonitz_pipeline.paddle_read_assemble \
        --predicts work/paddle-infer/predicts.txt \
        --manifest work/paddle-read-lines/MANIFEST.json \
        --out work/paddle-read-118-281

⚠ SORT ORDER IS NOT PRINTED ORDER. `predicts.txt` is keyed by filename, and
`page-118-L_9` sorts after `page-118-L_10` in every language that has ever
caused this bug. The manifest recorded (image, column, line) at cut time, so
this is a lookup — the line number comes from the manifest, never from the name.

⚠ A MISSING PREDICTION IS A HOLE, NOT AN EMPTY LINE. Write a blank where the
reader said nothing and the scorer reads it as a disagreement — a card raised
for nothing, or worse, a correction silently credited. Every gap is counted and
named, and a column with any gap is REFUSED rather than written short.

⚠ AND THE LIGATURES ARE CHECKED HERE, on the real read. Tesseract scored 30% of
holdout lines perfectly and emitted `ȣ` zero times in forty chances; a reader
that spells the ligature out disagrees with the spine on the commonest token
class in the index, which is exactly genie and llama's fault.
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
import unicodedata
from pathlib import Path

LIGATURES = ('ȣ', 'ϗ', 'ϛ')


def parse_predicts(path: Path) -> tuple[dict[str, str], list[str]]:
    """({image filename: text}, [complaints]).

    ⚠ THE SCORE IS THE LAST FIELD, NOT THE THIRD. Grok, 2026-08-31: splitting
    on tab and taking [1] turns `page-118-L_007.png\t0.99` — a line whose text
    is empty — into the reading "0.99", and a confidence number then votes as
    Greek. Split the score off the RIGHT and the rest is text, tabs and all,
    which also stops `foo\tbar` from silently losing `bar`.

    ⚠ AND AN EMPTY PREDICTION IS A HOLE, NOT A READING. Stored as '' it flows
    downstream as the reader disagreeing with everyone — a card raised from a
    line it never read. This repo has ruled the same point in another voice:
    an empty gloss is not a verdict.
    """
    out: dict[str, str] = {}
    complaints: list[str] = []
    for raw in path.read_text(encoding='utf-8').splitlines():
        if not raw.strip():
            continue
        head = raw
        tail = raw.rsplit('\t', 1)
        if len(tail) == 2:
            try:
                float(tail[1])
                head = tail[0]
            except ValueError:
                pass
        name_part, sep, text = head.partition('\t')
        name = Path(name_part).name
        if not sep:
            complaints.append(f'{name}: no text field')
            continue
        # A MultiHead run writes a JSON blob instead of plain text.
        if text.startswith('{'):
            try:
                blob = json.loads(text)
                text = next(iter(blob.values())).get('label', '')
            except Exception:
                complaints.append(f'{name}: unreadable JSON payload')
                continue
        if not text.strip():
            complaints.append(f'{name}: empty prediction')
            continue
        if name in out:
            complaints.append(f'{name}: seen twice')
            continue
        out[name] = unicodedata.normalize('NFC', text)
    return out, complaints


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--predicts', type=Path, required=True)
    p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args(argv)

    man = json.loads(a.manifest.read_text(encoding='utf-8'))
    pred, complaints = parse_predicts(a.predicts)

    cols: dict[str, dict[int, str]] = collections.defaultdict(dict)
    holes: list[str] = []
    for e in man['entries']:
        text = pred.get(e['image'])
        if text is None:
            holes.append(e['image'])
            continue
        cols[e['col']][e['line']] = text

    want = collections.Counter(e['col'] for e in man['entries'])
    a.out.mkdir(parents=True, exist_ok=True)
    written = refused = 0
    short: list[tuple[str, int, int]] = []
    for col, lines in sorted(cols.items()):
        if len(lines) != want[col]:
            short.append((col, len(lines), want[col]))
            refused += 1
            continue
        (a.out / f'{col}.txt').write_text(
            '\n'.join(lines[i] for i in range(1, want[col] + 1)) + '\n',
            encoding='utf-8')
        written += 1

    body = '\n'.join(
        (a.out / f).read_text(encoding='utf-8') for f in
        sorted(x.name for x in a.out.glob('*.txt')))
    counts = {g: body.count(g) for g in LIGATURES}

    print(f'{written} columns written -> {a.out}')
    print(f'  {len(pred)} usable predictions for {len(man["entries"])} '
          f'manifest lines')
    print('  ligatures in the read: ' + '  '.join(
        f'{g}={n}' for g, n in counts.items()))
    if complaints:
        print(f'\n⚠ {len(complaints)} prediction lines were NOT usable, '
              f'and an unusable line is not a reading: {complaints[:6]}')
    if holes:
        print(f'\n⚠ {len(holes)} manifest lines have NO prediction — the reader '
              f'is silent there, which is not agreement: {holes[:6]}')
    if short:
        print(f'\n⚠ {refused} columns REFUSED (written short would key every '
              f'later line to the wrong text):')
        for col, got, wanted in short[:8]:
            print(f'    {col}: {got} of {wanted} lines')
    absent = [g for g, n in counts.items() if not n]
    if absent:
        print(f'\n⚠ THE READ CONTAINS NO {absent!r}. A reader that cannot emit '
              f'the sorts this index turns on is a reject, whatever its CER.')
    return 1 if (holes or short or complaints) else 0


if __name__ == '__main__':
    sys.exit(main())
