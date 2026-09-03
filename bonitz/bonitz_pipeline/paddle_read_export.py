"""Cut the line images a PaddleOCR recogniser needs to read a tranche.

    python3 -m bonitz_pipeline.paddle_read_export --alto work/kraken15-102/alto118-281 \
        --cols work/kraken400/read/cols --spine work/kraken15-102/txt118-281 \
        --out work/paddle-read-lines

⚠ A RECOGNISER DOES NOT SEGMENT. kraken finds its own lines from a page scan,
which is why `cold-read-118-281` ships scans; PaddleOCR's rec model is handed
one cropped line at a time. So the lines have to be cut here, from the SAME
ALTO geometry the panel voted on, or the reader answers about different ink
from everyone else.

⚠ AND THE MANIFEST IS THE WHOLE POINT. Inference returns a pile of predictions
keyed by filename; the panel needs per-column text in printed order. The
manifest records (image, column, line) at cut time, so reassembly is a lookup
rather than a guess about sort order — `page-118-L_9` sorts before
`page-118-L_10` in every language that has ever caused this bug.

⚠ THE LINE COUNT IS GATED AGAINST THE SPINE. If a column yields a different
number of lines than kraken read there, the reader would be keyed to the wrong
text for the rest of that column — silently, and only in that column. That is
the off-by-two this project already found once between kraken and calamari.
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ALTO_NS = '{http://www.loc.gov/standards/alto/ns-v4#}'


def kept_lines(alto: Path, col_png: Path, previous_line: str | None,
               target: int) -> list[dict]:
    """The lines the SPINE kept, with their geometry, in printed order.

    ⚠ THE RAW ALTO IS NOT THE SPINE. kraken's segmenter over-splits these
    columns — 64, 73 boxes where the page has 61 lines — and
    `filter_kraken_lines` drops the phantoms: gutter digits read as their own
    line, empty margin polygons, edge fragments. The spine text is what
    SURVIVED that. Cutting from the raw ALTO keyed 202 of 328 columns to the
    wrong text; this calls the same filter the spine was built with.
    """
    from bonitz_pipeline.filter_kraken_lines import parse_alto_lines, filter_lines
    from PIL import Image
    lines = parse_alto_lines(alto)
    with Image.open(col_png) as im:
        w, _ = im.size
    kept, _ = filter_lines(lines, w, previous_line, target)
    return kept


def main(argv: list[str] | None = None) -> int:
    from PIL import Image

    p = argparse.ArgumentParser()
    p.add_argument('--alto', type=Path, required=True)
    p.add_argument('--cols', type=Path, required=True)
    p.add_argument('--spine', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--height', type=int, default=48)
    p.add_argument('--max-width', type=int, default=1024)
    p.add_argument('--target', type=int, default=61)
    a = p.parse_args(argv)

    (a.out / 'lines').mkdir(parents=True, exist_ok=True)
    manifest, mismatched, missing = [], [], []
    n = 0
    previous_line = None
    for alto in sorted(a.alto.glob('*.xml')):
        key = alto.stem
        png, txt = a.cols / f'{key}.png', a.spine / f'{key}.txt'
        if not png.exists() or not txt.exists():
            missing.append(key)
            previous_line = None
            continue
        spine = txt.read_text(encoding='utf-8').splitlines()
        kept = kept_lines(alto, png, previous_line, a.target)
        previous_line = kept[-1]['content'] if kept else None
        # ⚠ MATCH THE TEXT, NOT THE COUNT. Two different selections can both
        # yield 61 lines; only the content proves the crop belongs to the line
        # the panel voted on.
        if [l['content'] for l in kept] != spine:
            mismatched.append((key, len(kept), len(spine)))
            continue
        im = Image.open(png).convert('RGB')
        for i, l in enumerate(kept, start=1):
            x0, y0 = max(0, l['hpos']), max(0, l['vpos'])
            x1 = min(im.width, l['hpos'] + l['width'])
            y1 = min(im.height, l['vpos'] + l['height'])
            crop = im.crop((x0, y0, x1, y1))
            if not crop.width or not crop.height:
                continue
            w = max(8, min(a.max_width,
                           round(crop.width * a.height / crop.height)))
            name = f'{key}_{i:03d}.png'
            crop.resize((w, a.height), Image.BILINEAR).save(
                a.out / 'lines' / name)
            manifest.append({'image': name, 'col': key, 'line': i})
            n += 1

    (a.out / 'MANIFEST.json').write_text(json.dumps({
        'lines': n,
        'columns': len({m['col'] for m in manifest}),
        'height': a.height,
        'max_width': a.max_width,
        'alto': str(a.alto),
        'cols': str(a.cols),
        'entries': manifest,
    }, ensure_ascii=False), encoding='utf-8')

    print(f'{n} line images from {len({m["col"] for m in manifest})} columns'
          f' -> {a.out}')
    if mismatched:
        print(f'⚠ {len(mismatched)} columns SKIPPED — the filtered lines do '
              f'not match the spine text, so the reader would be keyed to the '
              f'wrong line there:')
        for key, got, want in mismatched[:8]:
            print(f'    {key}: {got} boxes vs {want} spine lines')
    if missing:
        print(f'⚠ {len(missing)} columns have no PNG or no spine text: '
              f'{missing[:6]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
