"""
Five-reader review page: Opus + Genie + LlamaParse + kraken + Codex.

Same shape as `review4`, and it reuses that module's crop, line-mapping and
verdict machinery outright — the only real differences are the fifth column and
what gets left out.

**Already-adjudicated regions are skipped.**  John ruled on the 18 four-way
Opus-alone cases on 2026-08-07; re-asking them wastes the scarce resource here,
which is his attention, not tokens.  Exclusion is by span overlap against
`work/verdicts/verdicts-<range>-full.json`, not by item number: adding a fifth
reader redraws every region boundary, so item 12 of the four-way run is not
item 12 of this one.  `--include-adjudicated` puts them back.

Ordering is by how expensive the case is to settle, hardest first:

  1. no majority at all (2-2-1 and worse) — nothing to defer to but the ink
  2. spine-outvoted — the majority disagrees with Opus
  3. everything else flagged

    python3 -m bonitz_pipeline.review5 53-62

Writes `work/review5-<range>.html` with crops beside it in
`work/review5_crops_<range>/`.  Serve it with `work/serve_review.py` so the
verdict buttons can POST back; opening the file directly gets no persistent
storage and no autosave.  Rules nothing; every row is a question for John.
"""

from __future__ import annotations
import argparse
import base64
import html
import io
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

from .normalize import canonical, clean_opus, fold
from .review4 import BAR, CSS, SCRIPT, crop, line_offsets, mark_span

ROOT = Path(__file__).resolve().parent.parent
READERS = ('opus', 'genie', 'llama', 'kraken', 'codex')
LABELS = {'opus': 'Opus', 'genie': 'Genie', 'llama': 'Llama',
          'kraken': 'kraken', 'codex': 'Codex'}

# Hardest first: a region with no majority has nothing to defer to but the ink.
CLASS_ORDER = {'all-differ': 0, '2-2-split': 1, '3-2-split': 1,
               'spine-outvoted': 2, 'majority-spine': 3, 'soft': 4}


def adjudicated_spans(tag: str) -> list[tuple[int, str, int, int]]:
    """(page, col, start, end) for every region John has already ruled on.

    The four-way review's item numbers do not survive the fifth reader — the
    region boundaries move — so the rulings are matched back by the span they
    covered in the shared Opus spine, which does not move.
    """
    f = ROOT / f'work/verdicts/verdicts-{tag}-full.json'
    src = ROOT / f'work/flags4-{tag}.jsonl'
    if not (f.exists() and src.exists()):
        return []
    rows = [json.loads(l) for l in src.open(encoding='utf-8')]
    three = ('genie', 'llama', 'kraken')
    lonely = [r for r in rows
              if len({fold(r.get(k) or '') for k in three}) == 1
              and fold(r.get('opus') or '') != fold(r.get(three[0]) or '')]
    ruled = json.load(f.open(encoding='utf-8'))['verdicts']
    if len(lonely) != len(ruled):
        print(f'⚠ {len(ruled)} rulings but {len(lonely)} four-way Opus-alone '
              f'regions — not excluding any, the sets do not correspond',
              file=sys.stderr)
        return []
    return [(r['page'], r['col'], r['spine_off'],
             r['spine_off'] + len(r.get('opus') or '')) for r in lonely]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('pages', help='range, e.g. 53-62')
    p.add_argument('--include-adjudicated', action='store_true',
                   help='do not skip the regions John has already ruled on')
    p.add_argument('--limit', type=int,
                   help='render only the first N items, hardest first')
    p.add_argument('--inline', action='store_true',
                   help='embed crops as data URIs for one portable file; at '
                        '~400 regions that is tens of MB, so prefer serving')
    p.add_argument('--compact', action='store_true',
                   help='downscale and JPEG the crops (implies smaller inline)')
    args = p.parse_args(argv)
    a, _, b = args.pages.partition('-')
    lo, hi = int(a), int(b or a)
    tag = f'{lo:03d}-{hi:03d}'

    src = ROOT / f'work/flags5-{tag}.jsonl'
    if not src.exists():
        sys.exit(f'{src} missing — run `batch4 {lo}-{hi} --with-codex` first')
    rows = [json.loads(l) for l in src.open(encoding='utf-8')]

    # Who stood alone, out of five?
    for r in rows:
        vals = {k: fold(r.get(k) or '') for k in READERS}
        t = Counter(vals.values())
        r['_alone'] = next((k for k, v in vals.items()
                            if t[v] == 1 and max(t.values()) == 4), None)

    done = [] if args.include_adjudicated else adjudicated_spans(tag)

    def already(r: dict) -> bool:
        s = r['spine_off']
        e = s + len(r.get('opus') or '')
        return any(pg == r['page'] and c == r['col'] and s < b2 and a2 < e
                   for pg, c, a2, b2 in done)

    def raw_top(r: dict) -> int:
        """Largest number of readers sharing one RAW reading.

        The section bands come from `compare4`'s folded vote, which is the
        right measure of whether the panel resolved a region — but folding
        equates a ligature with its expansion, so 37 regions where all five
        readers wrote different strings land in `majority-spine`. In a
        diplomatic edition those are the valuable rows, not the dull ones, so
        within each band the raw split decides the order: fewest agreeing
        first.
        """
        c = Counter(r[k] for k in READERS if r.get(k) is not None)
        return max(c.values()) if c else 9

    flags = [r for r in rows if r['flag']]
    skipped = sum(1 for r in flags if already(r))
    todo = [r for r in flags if not already(r)]
    todo.sort(key=lambda r: (CLASS_ORDER.get(r['cls'], 9), raw_top(r),
                             r['page'], r['col'], r['spine_off']))
    if args.limit:
        todo = todo[:args.limit]

    crops = ROOT / f'work/review5_crops_{tag}'
    offs_cache: dict[tuple[int, str], tuple[list[int], list[str]]] = {}
    esc = html.escape

    # Column starts in the spine: cumulative canonical length in reading order.
    # Never derive this from a column's first flagged region — regions exist
    # only where readers disagree, so the first one sits an arbitrary way in
    # and every line estimate below it drifts by that much.
    starts: dict[tuple[int, str], int] = {}
    pos = 0
    for pg in range(lo, hi + 1):
        for col in ('L', 'R'):
            f = ROOT / f'raw/opus/page-{pg:03d}-{col}.txt'
            if not f.exists():
                continue
            starts[(pg, col)] = pos
            pos += len(canonical(clean_opus(f.read_text(encoding='utf-8')))[0])
    for r in rows:
        r['_col_start'] = starts.get((r['page'], r['col']), 0)

    def render(r: dict, item: int) -> str:
        key = (r['page'], r['col'])
        if key not in offs_cache:
            offs_cache[key] = line_offsets(*key)
        offs, lines = offs_cache[key]
        rel = r['spine_off'] - r['_col_start']
        line = max(0, sum(1 for o in offs if o <= rel) - 1)
        img = crop(r['page'], r['col'], line, len(lines), item, crops,
                   want=lines[line] if line < len(lines) else '')
        if img and args.inline:
            fp = crops / Path(img).name
            if args.compact:
                im = Image.open(fp).convert('L')
                if im.width > 1000:
                    im = im.resize((1000, round(im.height * 1000 / im.width)),
                                   Image.LANCZOS)
                buf = io.BytesIO()
                im.save(buf, 'JPEG', quality=72, optimize=True)
                img = ('data:image/jpeg;base64,'
                       + base64.b64encode(buf.getvalue()).decode())
            else:
                img = ('data:image/png;base64,'
                       + base64.b64encode(fp.read_bytes()).decode())
        cells = ''.join(
            f'<td class="{k}">{esc(r.get(k) or "—")}</td>' for k in READERS)
        # One button per DISTINCT reading, labelled with everyone who proposed
        # it, so agreement collapses to a single tap. Readings differing only
        # by a diacritic still get their own button — the diacritic is the data.
        seen: dict[str, list[str]] = {}
        for k in READERS:
            v = r.get(k)
            if v is not None:
                seen.setdefault(v, []).append(k)
        order = sorted(seen.items(), key=lambda kv: (-len(kv[1]), kv[0]))
        btns = ''.join(
            f'<button class="v{" lead" if len(who) >= 3 else ""}" '
            f'data-i="{item}" data-v="{esc(v)}">'
            f'<b>{esc(v) if v.strip() else "∅"}</b>'
            f'<span>{"+".join(LABELS[w] for w in who)}</span></button>'
            for v, who in order)
        split = '&ndash;'.join(str(len(w)) for _, w in order)
        return f"""
<div class=item id="it{item}">
 <h3>{item}. page {r['page']}{r['col']} &middot; line ~{line + 1}
     <span class=cls>{esc(r['cls'])}</span>
     <span class=split>{split}</span></h3>
 <div class=ctx>{mark_span(lines[line], rel - offs[line], len(r['opus'] or ''))
                 if line < len(lines) else esc(r['ctx'])}</div>
 {f'<img loading=lazy decoding=async src="{img}">' if img
   else '<p class=nocrop>no crop</p>'}
 <table><tr>{''.join(f'<th>{LABELS[k]}</th>' for k in READERS)}</tr>
 <tr>{cells}</tr></table>
 <div class=verdict>
  {btns}
  <button class="v other" data-i="{item}">other&hellip;</button>
  <button class="v skip" data-i="{item}" data-v="__unclear__">unclear</button>
  <span class=chosen id="ch{item}"></span>
 </div>
</div>"""

    alone = Counter(r['_alone'] for r in rows if r['_alone'])
    body = [f'<h1>Five-reader review, pages {lo}&ndash;{hi}</h1>']
    body.append(
        f'<p class=lead>{len(rows)} regions, {len(flags)} flagged, '
        f'<b>{len(todo)} awaiting a verdict</b>'
        + (f' ({skipped} already ruled, skipped)' if skipped else '')
        + '. Lone dissents: '
        + ', '.join(f'{LABELS[k]} {alone[k]}'
                    for k in READERS if alone.get(k)) + '.</p>')
    body.append(
        '<p class=lead>Hardest first. A button carries every reader who '
        'proposed that reading, so agreement is one tap; the badge on each '
        'row is the split. Where no reading has a majority there is nothing '
        'to defer to but the ink.</p>')

    n, last = 0, None
    HEADS = {0: 'No majority at all', 1: 'No majority — split',
             2: 'The majority disagrees with Opus', 3: 'Everything else flagged'}
    for r in todo:
        band = CLASS_ORDER.get(r['cls'], 9)
        if band != last:
            body.append(f'<h2>{HEADS.get(band, "Other")}</h2>')
            last = band
        n += 1
        body.append(render(r, n))

    extra = """
.split{font-weight:400;color:#555;background:#eceaf6;padding:1px 7px;
border-radius:9px;font-size:12px;margin-left:6px;font-variant-numeric:tabular-nums}
td.codex{background:#f7f4ff}
button.v.lead{border-color:#8a8a8a;border-width:2px}
@media(prefers-color-scheme:dark){.split{background:#2f2d3a;color:#b3b0c4}
td.codex{background:#2a2733}}
"""
    css = CSS + extra

    view = 'five-way'
    out = ROOT / f'work/review5-{tag}.html'
    out.write_text(
        f'<!doctype html><meta charset=utf-8><title>Five-reader review '
        f'{tag}</title><style>{css}</style>'
        + BAR + '\n'.join(body)
        + SCRIPT.replace('__TAG__', tag).replace('__VIEW__', view),
        encoding='utf-8')
    print(f'{len(rows)} regions, {len(flags)} flagged, {skipped} already ruled, '
          f'{n} rendered -> {out}')
    print(f'  crops -> {crops}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
