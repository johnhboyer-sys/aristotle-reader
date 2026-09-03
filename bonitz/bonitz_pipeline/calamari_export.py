"""Export the compiled corpus as Calamari line pairs — same lines kraken saw.

    python3 -m bonitz_pipeline.calamari_export --work work/kraken400 \
        --out work/calamari-export

`ketos compile` already cropped every training line to its polygon and stored
the PNG beside its text inside train.arrow / holdout.arrow.  Dumping from there
rather than re-cropping is the whole point: Calamari then reads the SAME pixels
and the SAME strings, so a comparison against kraken measures the engine and
not two different preprocessing pipelines.

⚠ THE EXPORT IS GATED ON `kraken_corpus.stage_verify`.  A second engine trained
somewhere else is exactly where a held-out column would slip back in unnoticed —
a different machine, a zip file, a notebook nobody reviewed.  So the export
refuses unless the arrows still prove themselves against John's ruling, and it
writes the holdout to its own directory that no training command should name.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import unicodedata
from pathlib import Path

from bonitz_pipeline import kraken_corpus as kc


def _rows(path: Path):
    import pyarrow as pa
    import pyarrow.ipc as ipc
    with pa.memory_map(str(path), 'rb') as src:
        try:
            table = ipc.open_file(src).read_all()
        except pa.ArrowInvalid:
            src.seek(0)
            table = ipc.open_stream(src).read_all()
    return table.column('lines').to_pylist()


def dump(name: str, out: Path) -> dict:
    """Write one split as `NNNNN.png` + `NNNNN.gt.txt` pairs."""
    rows = _rows(kc.WORK / f'{name}.arrow')
    d = out / name
    d.mkdir(parents=True, exist_ok=True)
    heights = []
    for i, row in enumerate(rows):
        stem = d / f'{i:05d}'
        stem.with_suffix('.png').write_bytes(row['im'])
        # NFC, matching `ketos train -u NFC`. The mark over the ou-ligature has
        # no precomposed form and survives either way; spelling it one way here
        # keeps the two engines' targets identical.
        stem.with_suffix('.gt.txt').write_text(
            unicodedata.normalize('NFC', row['text']), encoding='utf-8')
        from PIL import Image
        heights.append(Image.open(io.BytesIO(row['im'])).size[1])
    return {'split': name, 'lines': len(rows),
            'median_height_px': sorted(heights)[len(heights) // 2],
            'chars': sum(len(r['text']) for r in rows)}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--work', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    # ⚠ SAME AS `kraken_export`: the guard reads the ruling, so the ruling has
    # to travel with --work. It also lands in the MANIFEST below, and a
    # manifest naming the WRONG ruling is worse than one naming none — it
    # would vouch for this bundle against a holdout that says nothing about
    # these pages.
    p.add_argument('--holdout', type=Path,
                   help='holdout ruling for THIS tree (default '
                        'work/rulings/kraken-holdout.json, which governs '
                        '15-62 and no other range)')
    a = p.parse_args(argv)
    kc.WORK = a.work.resolve()
    if a.holdout:
        kc.HOLDOUT_RULING = a.holdout.resolve()

    # Refuse to export anything the guard cannot vouch for.
    kc.stage_verify()

    report = {'source': str(kc.WORK),
              'holdout_ruling': str(kc.HOLDOUT_RULING),
              'holdout_columns': kc.holdout_columns(),
              'splits': [dump('train', a.out), dump('holdout', a.out)]}
    (a.out / 'MANIFEST.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    for s in report['splits']:
        print(f"{s['split']:8} {s['lines']:>5} lines  {s['chars']:>7} chars  "
              f"median line height {s['median_height_px']}px")
    print(f'→ {a.out}  (holdout/ is the evaluation set: never name it to '
          f'`calamari-train`)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
