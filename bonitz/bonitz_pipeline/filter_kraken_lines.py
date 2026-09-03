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
  4. Printer signature / catchword at the foot: short stub set off by a gap
     > 1.15× median lead (same idea as kraken_corpus, without GT). A matching
     head stub is reported but kept because it may continue the prior column.

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
            'warn_reason': '',
        })
    return lines


def _median(xs: list[float]) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    return s[len(s) // 2]


def _continues_previous(previous_line: str, head: str) -> bool:
    """True only when the two column-edge shapes prove a continuation."""
    previous = previous_line.rstrip()
    current = head.strip()
    if not previous or not current:
        return False
    if previous.endswith('-'):
        return True
    # Bonitz can split a citation after its work/chapter siglum: `μβ6.` at
    # the foot, then the Bekker address `364a29.` at the next head.
    return bool(
        re.search(r'[^\W\d_]+\d+\.$', previous)
        and re.match(r'^\d{2,4}[ab]\d+\.?$', current)
    )


# ⚠ ONE RULE MAY BE PUT BACK, AND IT IS THE ONLY ONE CAUGHT DELETING TEXT.
# Letting every rule yield to the line count reached 61 on more columns and
# made them worse: on 144-R it restored `5`, `κ` and an empty box — gutter
# numbers, correctly identified — so the column read 61 with three junk lines
# in it, which downstream is indistinguishable from a clean column. A count
# that is right for the wrong reason is the failure this filter exists to
# prevent, not a smaller version of it.
#
# `gutter_beside` is geometric and sure of itself: a narrow box hard against
# the margin, sharing a baseline with a longer line, is a marginal line number.
# `end_stub` has a gap test behind it and on 223-R it correctly caught the
# signature `Π6d2`. Only `foot_short` — width and length, no gap — has been
# found taking real text, and it fires at most once per column.
RESTORABLE = ('foot_short',)


def restore_to_target(ordered: list[dict], target: int) -> list[dict]:
    """Put back drops that took the column BELOW its line count.

    ⚠ THE FILTER REMOVES PHANTOM LINES, SO A DROP THAT ENDS BELOW TARGET DID
    NOT REMOVE ONE. Seven columns of 118-281 lost the tail of a citation this
    way — `544b26.`, `b36).`, `990b97.`, each the last few characters of a
    Bekker number wrapped to the foot of the column, each read as a printer's
    gathering mark because it was short and at the bottom. The real marks in
    the same tranche are `P`, `Bb`, `C c2`, `Ii`, `Kk` — and `b12` is one while
    `b12.` is a citation, so no content test separates them. The line count
    does: every one of the seven was the last cut made to a column that had
    already reached 61.

    ⚠ AND IT REPORTS. A restoration is the filter saying it does not trust its
    own rule here, which is a thing the operator has to be able to see. A
    column short because the SEGMENTER missed lines has no `foot_short` drop to
    put back, so it stays short and stays visible — which is the point.
    """
    restored = []
    kept = sum(1 for l in ordered if not l['drop'])
    if kept >= target:
        return restored
    for reason in RESTORABLE:
        for l in reversed(ordered):
            if kept >= target:
                return restored
            if l['drop'] and l['drop_reason'] == reason:
                l['drop'] = False
                l['restored_from'] = reason
                l['drop_reason'] = ''
                restored.append(l)
                kept += 1
    return restored


def filter_lines(
    lines: list[dict],
    col_width: int,
    previous_line: str | None = None,
    target: int | None = None,
) -> tuple[list[dict], list[dict]]:
    """Drop phantoms; return (kept, dropped) both y-sorted.

    With `target` set, a drop that would take the column below that many lines
    is put back — see `restore_to_target`.
    """
    if not lines:
        return [], []
    ordered = sorted(lines, key=lambda l: l['by'])
    for l in ordered:
        l['x0'] = l['hpos']
        l['x1'] = l['hpos'] + l['width']
        l['drop'] = False
        l['drop_reason'] = ''
        l['warn_reason'] = ''

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

    # 3b. THE RUNNING HEAD. Guide word and page number are ONE printed line
    # that kraken segments as two boxes, and on 127-R it survived all three
    # rules above by nine pixels: the number is 110 wide against a
    # GUTTER_MAX_WIDTH_FRAC of 100, so `gutter_beside` called it not narrow;
    # neither box pairs with a long line, so `residual_beside` had nothing to
    # pair against; and the guide word is 208 wide against a `head_short`
    # threshold of 207, with a 2px gap where that rule wants 1.15x the lead.
    #
    # ⚠ AND RULE 4 WOULD HAVE KEPT IT ANYWAY. It deliberately spares a short
    # stub at the head, "because it may continue the prior column" — which is
    # load-bearing: 21 other columns on 118-281 open with a short line and
    # every one is an entry's tail carrying over (`f 37. 1481a1.` before
    # `αὔρα.` on 135-R). Widening any threshold to catch this would eat those.
    #
    # So the test is the thing no continuation tail ever has: a BARE PAGE
    # NUMBER sharing its baseline. John, 2026-09-01, on finding the guide word
    # carded as index text — "running head shouldn't be in there should it".
    # It fires once in 328 columns.
    body = [l for l in ordered if not l['drop']]
    if len(body) > 2:
        a, b = body[0], body[1]
        same_line = abs(b['by'] - a['by']) < lead * 0.4
        short = max(a['width'], b['width']) < col_width * 0.35
        numbered = any(re.fullmatch(r'\d{1,3}', (l['content'] or '').strip())
                       for l in (a, b))
        if same_line and short and numbered:
            for l in (a, b):
                l['drop'] = True
                l['drop_reason'] = 'running_head'

    # 4. Signature / catchword at the foot: short stub + large gap. A head
    # stub is kept when the prior foot proves a join. With no prior column,
    # report and keep it: this run has no evidence that deletion is safe.
    body = [l for l in ordered if not l['drop']]
    if len(body) > 3:
        gaps = [b['by'] - a['by'] for a, b in zip(body, body[1:])]
        med_gap = _median(gaps)
        foot = body[-1]
        if ((foot['x1'] - foot['x0']) < col_width * 0.2
                and gaps[-1] > med_gap * 1.15):
            foot['drop'] = True
            foot['drop_reason'] = 'end_stub'
        body = [l for l in ordered if not l['drop']]

    # Foot/head short without large gap (F2, G, bare V. when already over).
    if body and body[-1]['width'] < col_width * 0.15 and body[-1]['n'] < 8:
        body[-1]['drop'] = True
        body[-1]['drop_reason'] = 'foot_short'
        body = [l for l in ordered if not l['drop']]
    if body:
        head = body[0]
        gaps = [b['by'] - a['by'] for a, b in zip(body, body[1:])]
        med_gap = _median(gaps)
        head_short = (
            head['width'] < col_width * 0.15 and head['n'] < 8
        ) or (
            bool(gaps) and head['width'] < col_width * 0.2
            and gaps[0] > med_gap * 1.15
        )
        if head_short:
            if previous_line is None or _continues_previous(
                    previous_line, head['content']):
                head['warn_reason'] = 'head_short'
            else:
                head['drop'] = True
                head['drop_reason'] = 'head_short'

    if target is not None:
        restore_to_target(ordered, target)
    kept = [l for l in ordered if not l['drop']]
    dropped = [l for l in ordered if l['drop']]
    return kept, dropped


def alto_size(alto: Path) -> tuple[int | None, int | None]:
    """The column's pixel size, read off the ALTO instead of the image.

    ⚠ THE ONLY THING THE PNG WAS OPENED FOR WAS ONE INTEGER, and kraken writes
    it into `<Page WIDTH=...>` already. Requiring the images meant keeping 2 GB
    of columns beside a 40 MB read, or re-splitting 164 scans to recover a
    number the ALTO carries.
    """
    for _, el in ET.iterparse(alto, events=('start',)):
        if el.tag.endswith('Page'):
            w, h = el.get('WIDTH'), el.get('HEIGHT')
            return (int(w) if w else None, int(h) if h else None)
    return None, None


def process_column(
    alto: Path,
    col_png: Path | None,
    txt_out: Path,
    previous_line: str | None = None,
    target: int | None = None,
) -> dict:
    lines = parse_alto_lines(alto)
    if col_png is not None and col_png.exists():
        with Image.open(col_png) as im:
            w, h = im.size
    else:
        w, h = alto_size(alto)
        if w is None:
            raise ValueError(f'{alto.name}: no column image and no Page WIDTH '
                             f'in the ALTO — nothing says how wide the column '
                             f'is, and every margin test measures against it')
    kept, dropped = filter_lines(lines, w, previous_line, target)
    txt_out.parent.mkdir(parents=True, exist_ok=True)
    text = '\n'.join(l['content'] for l in kept)
    if kept:
        text += '\n'
    txt_out.write_text(text, encoding='utf-8')
    reasons: dict[str, int] = {}
    for d in dropped:
        reasons[d['drop_reason']] = reasons.get(d['drop_reason'], 0) + 1
    warnings: dict[str, int] = {}
    for line in kept:
        if line['warn_reason']:
            reason = line['warn_reason']
            warnings[reason] = warnings.get(reason, 0) + 1
    return {
        'stem': alto.stem,
        'img_w': w,
        'img_h': h,
        'raw': len(lines),
        'kept': len(kept),
        'dropped': len(dropped),
        'reasons': reasons,
        'warnings': warnings,
        # ⚠ A RESTORATION IS THE FILTER SAYING IT DOES NOT TRUST ITS OWN RULE.
        # It has to be visible, or the fix becomes the next silent edit.
        'restored': [{'reason': l['restored_from'], 'content': l['content']}
                     for l in kept if l.get('restored_from')],
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
    p.add_argument('--cols-dir', type=Path)
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
    previous_line = None
    for page in pages:
        for col in ('L', 'R'):
            stem = f'page-{page:03d}-{col}'
            alto = args.alto_dir / f'{stem}.xml'
            png = args.cols_dir / f'{stem}.png' if args.cols_dir else None
            if not alto.exists():
                print(f'skip {stem}: no ALTO', file=sys.stderr)
                previous_line = None
                continue
            out = args.txt_dir / f'{stem}.txt'
            row = process_column(alto, png, out, previous_line,
                                 args.target)
            output_lines = out.read_text(encoding='utf-8').splitlines()
            if output_lines:
                previous_line = output_lines[-1]
            rows.append(row)
            mark = 'OK' if row['kept'] == args.target else f"BAD want {args.target}"
            for r in row.get('restored', ()):
                print(f"  {stem}: PUT BACK {r['content'][:40]!r} — "
                      f"{r['reason']} would have left the column at "
                      f"{row['kept'] - len(row['restored'])}", file=sys.stderr)
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
