"""Line boxes that swallowed the printed line number.

    python3 -m bonitz_pipeline.margin_guard --reads work/calamari/read107-112 \
                                            --reads work/calamari/read113-117

Bonitz numbers every fifth printed line in the margin. `kraken_corpus` has
known this since the training corpus was cut — it finds the gutter digits as
their own lines and DROPS any numbered line whose digit it cannot account for,
with the comment "kraken merges every one into its text line". That is why
pages 15-106 are clean.

⚠ THE COLD PATH NEVER RAN THAT CHECK, and on 107-117 seventeen numbered lines
came through with the margin number inside them. `Ζμδ5. 682` became `6821`;
`Ζκ11. 704` became `70415`. Three were caught only because the resulting Bekker
page cannot exist; the rest read as ordinary text.

⚠ AND A DIGIT DETECTOR CANNOT FIND THEM. The number is set in smaller type and
the recogniser often reads it as letters — `35` came through as `as`, `55` as
`ς`, `15` as `ιd`, `45` as `4ὸ`. `…τῆς πρώτης as` looks like prose. Nothing in
the text says it is wrong.

⚠ SO THE SIGNAL IS GEOMETRY, NOT TEXT. A line whose box includes the gutter is
WIDER than its neighbours by about the width of the number. Both engines read
whatever is in the image, so this is not a fact about kraken-as-recogniser: it
is where the segmenter drew the box, and it is visible before a single
character is read.

⚠ AND IT ANSWERS AT THE COLUMN, NOT THE LINE. Page 107-L's numbered lines are
just as wide as 109-L's and every one of them is clean — the number is in the
picture and the recogniser skipped it. Width says the gutter was IN FRAME; only
the ink says whether it was read. So the report names the columns whose
numbered lines run wide, and every numbered line in them wants checking. On
107-117 that is 5 columns and 60 lines to hold 17 corruptions, and 60 crops is
a morning where the 17 were three weeks of silent bad citations.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# A two-digit number in the margin is worth roughly this much of the line's
# width. Measured on 107-117, where the five affected columns run +48 and the
# seventeen unaffected ones sit between -2 and +4.
WIDE_BY = 25


def line_widths(read_dir: Path) -> dict[str, list[int]]:
    """{column: [width of each printed line, in order]}."""
    from PIL import Image
    man = read_dir / 'read.json'
    if not man.exists():
        raise SystemExit(f'no read.json in {read_dir}')
    cols = json.loads(man.read_text(encoding='utf-8')).get('columns') or {}
    if not cols:
        raise SystemExit(f'{man} names no columns')
    out: dict[str, list[int]] = {}
    i = 0
    for col, lines in cols.items():
        ws = []
        for _ in lines:
            p = read_dir / 'images' / f'{i:05d}.png'
            if not p.exists():
                raise SystemExit(f'{man} names {i + 1} lines but {p.name} is missing')
            ws.append(Image.open(p).width)
            i += 1
        out[col] = ws
    return out


def suspect_columns(widths: dict[str, list[int]], every: int = 5
                    ) -> list[tuple[str, int, int, list[int]]]:
    """(column, median width, numbered-line median, the lines to check)."""
    out = []
    for col, ws in sorted(widths.items()):
        if len(ws) < every * 2:
            continue
        numbered = [n for n in range(every, len(ws) + 1, every)]
        med = statistics.median(ws)
        nmed = statistics.median([ws[n - 1] for n in numbered])
        if nmed - med >= WIDE_BY:
            out.append((col, int(med), int(nmed), numbered))
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--reads', type=Path, action='append', required=True,
                   help='a read directory holding read.json and images/')
    p.add_argument('--every', type=int, default=5,
                   help='the page numbers every Nth printed line (default 5)')
    p.add_argument('--json', type=Path, help='also write the report here')
    a = p.parse_args(argv)

    widths: dict[str, list[int]] = {}
    for d in a.reads:
        widths.update(line_widths(d))
    if not widths:
        # ⚠ An empty survey is a broken path, never a clean tranche.
        sys.exit('no columns read')

    sus = suspect_columns(widths, a.every)
    print(f'{len(widths)} column(s) measured, {len(sus)} whose numbered lines '
          f'run wide by {WIDE_BY}px or more')
    n_lines = 0
    for col, med, nmed, lines in sus:
        n_lines += len(lines)
        print(f'  {col}  median {med}px, numbered {nmed}px (+{nmed - med})  '
              f'· check lines {lines[0]}-{lines[-1]} every {a.every}')
    if sus:
        print(f'\n{n_lines} numbered line(s) to check against the ink. The '
              f'width says the gutter was in frame; only the ink says whether '
              f'the number was read.')
    else:
        print('\nno column shows the gutter in its line boxes')
    if a.json:
        a.json.write_text(json.dumps(
            {'wide_by': WIDE_BY, 'every': a.every,
             'columns': [{'column': c, 'median': m, 'numbered_median': nm,
                          'lines': ls} for c, m, nm, ls in sus]},
            ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print(f'-> {a.json}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
