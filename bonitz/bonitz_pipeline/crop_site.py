"""
Crop the 400 dpi ink at a sweep hit, so the ruling is made on the page.

Every sweep in this project reports `column:line`, and every ruling has to be
made against the photograph rather than against another reader.  This is the
bridge, and it is the tool the whole 2026-08-08 adjudication ran on.

**Line numbers do not carry across.**  `work/reconciled` counts printed lines;
the PageXML counts what kraken segmented, which excludes the marginal line
numbers — so a 61-line column is 49 lines there.  Cropping by index puts you
several lines off, further as you go down.  The line is therefore found by
TEXT: the reconciled line is matched against every TextLine in the column and
the best ratio wins, the same trick `review4.crop` uses.  The reported match
ratio is the check — anything below ~0.6 means the line was not found and the
crop is not evidence of anything.

    python3 -m bonitz_pipeline.crop_site page-033-L:59 page-036-L:48
    python3 -m bonitz_pipeline.crop_site --scale 4 --out /tmp/x page-021-L:57

Writes PNGs and prints, per site, the match ratio, the corpus line and the
paired text — so a bad match is visible before you spend attention on the crop.
"""

from __future__ import annotations
import argparse
import difflib
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NS = '{http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15}'


def _key(s: str) -> str:
    """Accent- and space-free, for matching only."""
    d = unicodedata.normalize('NFD', s)
    return ''.join(c for c in d
                   if not unicodedata.combining(c) and not c.isspace())


def lines_of(col: str) -> list[tuple[int, int, str]]:
    """(y_top, y_bottom, text) per segmented line, from the paired PageXML."""
    f = ROOT / f'work/kraken400/gt/{col}.xml'
    if not f.exists():
        return []
    out = []
    for tl in ET.parse(f).getroot().iter(f'{NS}TextLine'):
        co = tl.find(f'{NS}Coords')
        uni = tl.find(f'{NS}TextEquiv/{NS}Unicode')
        if co is None or uni is None or not (uni.text or '').strip():
            continue
        ys = [int(p.split(',')[1]) for p in co.get('points').split()]
        out.append((min(ys), max(ys), uni.text))
    return sorted(out)


def crop(col: str, lineno: int, out: Path, scale: float = 2.0,
         pad: float = 0.45) -> tuple[Path | None, float]:
    src = ROOT / f'work/kraken400/cols/{col}.png'
    txt = ROOT / f'work/reconciled/{col}.txt'
    if not src.exists() or not txt.exists():
        return None, 0.0
    want = txt.read_text(encoding='utf-8').splitlines()[lineno - 1]
    cand = lines_of(col)
    if not cand:
        return None, 0.0
    y0, y1, got = max(cand, key=lambda t: difflib.SequenceMatcher(
        None, _key(want), _key(t[2]), autojunk=False).ratio())
    score = difflib.SequenceMatcher(None, _key(want), _key(got),
                                    autojunk=False).ratio()
    im = Image.open(src)
    m = int((y1 - y0) * pad)
    c = im.crop((0, max(0, y0 - m), im.width, min(im.height, y1 + m)))
    c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
    out.mkdir(parents=True, exist_ok=True)
    f = out / f'{col}-l{lineno}.png'
    c.save(f)
    print(f'{f.name}  match={score:.2f}')
    print(f'    corpus: {want.strip()}')
    if score < 0.6:
        print('    ⚠ NO MATCH — the crop is not this line; do not rule on it')
    return f, score


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('sites', nargs='+', metavar='COLUMN:LINE',
                   help='e.g. page-033-L:59')
    p.add_argument('--scale', type=float, default=2.0)
    p.add_argument('--out', type=Path, default=ROOT / 'work/sweeps/crops')
    args = p.parse_args(argv)
    bad = 0
    for s in args.sites:
        col, _, ln = s.rpartition(':')
        if not col or not ln.isdigit():
            sys.exit(f'expected COLUMN:LINE, got {s!r}')
        _, score = crop(col, int(ln), args.out, args.scale)
        bad += score < 0.6
    print(f'\n-> {args.out}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
