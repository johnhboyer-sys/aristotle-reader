"""Drop phantom lines from kraken ALTO before the text stream is used.

Kraken's stock blla segmenter over-splits Bonitz columns. Measured on the
recropped pages 53-62 (20 columns, truth = 61 body lines each):

  raw ALTO median 64, max 74; only 6/20 at 61
  after this filter: 61/20 exact

Where the extra lines come from (paired to a full body line within ~0.4 of
the median inter-line lead, and narrow against either margin):

  left_frag   66   gutter digit / outdent ink read as its own line
  empty       26   empty short polygon on the margin
  digits      15   content is only digits (5, 10, 15…)
  right_frag   2   right-edge junk on L columns that keep the gutter strip
  orphan      11   short stubs not sharing a baseline (signatures, etc.)

The outdent recrop widened the R left edge so hanging headword letters stay
in the crop; that also pulls the gutter number strip further in. The numbers
are segmented as their own short baselines beside the real line (dy 1–7 px).
Every phantom shifts the text stream relative to the Opus spine and
manufactures reader disagreements.

Filter rules (geometry only — no ground-truth length, no content heuristics
beyond empty):

  1. Marginal digit / frag: narrow baseline hard against either edge AND
     sharing a baseline with a longer line. Thresholds from
     kraken_corpus.pair_column (GUTTER_MAX_X1_FRAC / GUTTER_MAX_WIDTH_FRAC).
  2. Empty short polygons (nchars==0, width < 15% of column).
  3. Residual short line still dy-paired with a long body line (wider
     thresholds — catches right-edge frags the edge test misses).
  4. Printer signature / catchword at head or foot: short stub set off by
     a gap > 1.15× median lead (same idea as kraken_corpus, without GT).

Usage:
    python3 -m bonitz_pipeline.filter_kraken_lines \\
        --alto-dir work/kraken400/read/alto \\
        --txt-dir  work/kraken400/read/txt \\
        --cols-dir work/kraken400/read/cols \\
        --pages 53-62

Writes filtered .txt (one body line per printed line) and a JSON report.
Does not modify ALTO. Leaves every change uncommitted by design of the
caller.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html import unescape
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image

# Same calibration as kraken_corpus.pair_column (page 20-R, 600 PPI).
GUTTER_MAX_X1_FRAC = 0.098
GUTTER_MAX_WIDTH_FRAC = 0.073

ALTO_NS = {
    'a': 'http://www.loc.gov/standards/alto/ns-v4#',
}


def _local(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def _f(el, name: str, default: float = 0.0) -> float:
    v = el.get(name)
    return float(v) if v not in (None, '') else default


def parse_alto_lines(path: Path) -> list[dict]:
    """Return TextLines as dicts: by, hpos, width, height, content, n."""
    # ALTO may or may not declare the default ns on every element; parse
    # without requiring the prefix by stripping namespaces and any
    # prefixed attributes (xsi:schemaLocation etc.) that would unbound.
    raw = path.read_text(encoding='utf-8')
    raw = re.sub(r'\sxmlns(?::\w+)?="[^"]*"', '', raw)
    raw = re.sub(r'\s\w+:\w+="[^"]*"', '', raw)
    root = ET.fromstring(raw)
    lines: list[dict] = []
    for el in root.iter():
        if _local(el.tag) != 'TextLine':
            continue
        hpos = int(_f(el, 'HPOS'))
        vpos = int(_f(el, 'VPOS'))
        width = int(_f(el, 'WIDTH'))
        height = int(_f(el, 'HEIGHT'))
        bas = el.get('BASELINE') or ''
        by = None
        if bas:
            parts = [float(x) for x in bas.replace(',', ' ').split()]
            ys = parts[1::2]
            if ys:
                by = sum(ys) / len(ys)
        if by is None:
            by = float(vpos + height)
        strings = []
        for ch in el.iter():
            if _local(ch.tag) == 'String':
                c = ch.get('CONTENT')
                if c:
                    strings.append(unescape(c))
        content = ' '.join(strings)
        lines.append({
            'hpos': hpos,
            'vpos': vpos,
            'width': width,
            'height': height,
            'by': by,
            'content': content,
            'n': len(content.replace(' ', '')),
            'drop': False,
            'drop_reason': '',
        })
    return lines


def _median(xs: list[float]) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    return s[len(s) // 2]


def filter_lines(lines: list[dict], col_width: int) -> tuple[list[dict], list[dict]]:
    """Drop phantoms; return (kept, dropped) both y-sorted."""
    if not lines:
        return [], []
    ordered = sorted(lines, key=lambda l: l['by'])
    for l in ordered:
        l['x0'] = l['hpos']
        l['x1'] = l['hpos'] + l['width']
        l['drop'] = False
        l['drop_reason'] = ''

    dys = [b['by'] - a['by'] for a, b in zip(ordered, ordered[1:])]
    lead = _median(dys) if dys else 55.0
    max_x1 = col_width * GUTTER_MAX_X1_FRAC
    max_w = col_width * GUTTER_MAX_WIDTH_FRAC

    # 1. Marginal digit / frag: narrow + edge + shares baseline with any line.
    for l in ordered:
        narrow = (l['x1'] - l['x0']) < max_w
        edge = l['x1'] < max_x1 or l['x0'] > col_width - max_x1
        beside = any(
            o is not l and abs(o['by'] - l['by']) < lead * 0.4
            for o in ordered
        )
        if narrow and edge and beside:
            l['drop'] = True
            l['drop_reason'] = 'gutter_beside'
            continue
        # 2. Empty short polygon.
        if l['n'] == 0 and l['width'] < col_width * 0.15:
            l['drop'] = True
            l['drop_reason'] = 'empty_short'

    # 3. Residual short still dy-paired with a long body line.
    body = [l for l in ordered if not l['drop']]
    for l in body:
        if l['width'] >= col_width * 0.25 and l['n'] >= 8:
            continue
        for m in body:
            if m is l:
                continue
            if (abs(m['by'] - l['by']) < lead * 0.5
                    and m['width'] > col_width * 0.35):
                l['drop'] = True
                l['drop_reason'] = 'residual_beside'
                break

    # 4. Signature / catchword at head or foot: short stub + large gap.
    body = [l for l in ordered if not l['drop']]
    if len(body) > 3:
        gaps = [b['by'] - a['by'] for a, b in zip(body, body[1:])]
        med_gap = _median(gaps)
        for idx, gap in ((0, gaps[0]), (-1, gaps[-1])):
            end = body[idx]
            stub = (end['x1'] - end['x0']) < col_width * 0.2
            if stub and gap > med_gap * 1.15:
                end['drop'] = True
                end['drop_reason'] = 'end_stub'
        body = [l for l in ordered if not l['drop']]

    # Foot/head short without large gap (F2, G, bare V. when already over).
    if body and body[-1]['width'] < col_width * 0.15 and body[-1]['n'] < 8:
        body[-1]['drop'] = True
        body[-1]['drop_reason'] = 'foot_short'
        body = [l for l in ordered if not l['drop']]
    if body and body[0]['width'] < col_width * 0.15 and body[0]['n'] < 8:
        body[0]['drop'] = True
        body[0]['drop_reason'] = 'head_short'
        body = [l for l in ordered if not l['drop']]

    kept = [l for l in ordered if not l['drop']]
    dropped = [l for l in ordered if l['drop']]
    return kept, dropped


def process_column(
    alto: Path,
    col_png: Path,
    txt_out: Path,
) -> dict:
    lines = parse_alto_lines(alto)
    with Image.open(col_png) as im:
        w, h = im.size
    kept, dropped = filter_lines(lines, w)
    txt_out.parent.mkdir(parents=True, exist_ok=True)
    text = '\n'.join(l['content'] for l in kept)
    if kept:
        text += '\n'
    txt_out.write_text(text, encoding='utf-8')
    reasons: dict[str, int] = {}
    for d in dropped:
        reasons[d['drop_reason']] = reasons.get(d['drop_reason'], 0) + 1
    return {
        'stem': alto.stem,
        'img_w': w,
        'img_h': h,
        'raw': len(lines),
        'kept': len(kept),
        'dropped': len(dropped),
        'reasons': reasons,
        'txt': str(txt_out),
    }


def _parse_pages(spec: str) -> list[int]:
    a, _, b = spec.partition('-')
    lo = int(a)
    hi = int(b or a)
    return list(range(lo, hi + 1))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--alto-dir', type=Path, required=True)
    p.add_argument('--txt-dir', type=Path, required=True)
    p.add_argument('--cols-dir', type=Path, required=True)
    p.add_argument('--pages', default='53-62')
    p.add_argument('--report', type=Path, default=None,
                   help='JSON report path (default: <txt-dir>/filter-lines-report.json)')
    p.add_argument('--target', type=int, default=61,
                   help='expected body lines per column (report only)')
    args = p.parse_args(argv)

    pages = _parse_pages(args.pages)
    report_path = args.report or (args.txt_dir / 'filter-lines-report.json')
    rows = []
    ok = 0
    for page in pages:
        for col in ('L', 'R'):
            stem = f'page-{page:03d}-{col}'
            alto = args.alto_dir / f'{stem}.xml'
            png = args.cols_dir / f'{stem}.png'
            if not alto.exists() or not png.exists():
                print(f'skip {stem}: missing alto or png', file=sys.stderr)
                continue
            out = args.txt_dir / f'{stem}.txt'
            row = process_column(alto, png, out)
            rows.append(row)
            mark = 'OK' if row['kept'] == args.target else f"BAD want {args.target}"
            if row['kept'] == args.target:
                ok += 1
            print(f"{stem}: raw={row['raw']} kept={row['kept']} "
                  f"dropped={row['dropped']} {row['reasons']} {mark}")

    report = {
        'pages': args.pages,
        'target': args.target,
        'n_columns': len(rows),
        'n_at_target': ok,
        'columns': rows,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n',
                           encoding='utf-8')
    print(f'wrote {report_path}: {ok}/{len(rows)} at {args.target} lines')
    return 0 if ok == len(rows) else 1


if __name__ == '__main__':
    sys.exit(main())
