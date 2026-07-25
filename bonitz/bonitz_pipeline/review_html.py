"""
Generate work/REVIEW.html — one self-serve review page for the human queue.

For every non-high-confidence verdict it shows: page/column, the LINE NUMBER
in work/reconciled/page-NNN-C.txt, the full reconciled line with the disputed
span highlighted, the three readers + adjudicator verdict/note, and the strip
image that contains the line. Open the file in a browser (images load from
../images/strips/ relative to work/).

Usage:
    python3 -m bonitz_pipeline.review_html --pages 15-44
Pages are grouped into the original 5-page batches internally (spine offsets
in the flag files are per-batch).
"""

from __future__ import annotations
import argparse
import html
import json
from pathlib import Path

from PIL import Image

from .batch3 import ROOT, parse_pages
from .normalize import canonical, clean_opus
from .compare3 import build_spine
from .reconcile import match_verdicts

STRIP_H, OVERLAP = 700, 110
STEP = STRIP_H - OVERLAP


def _match(flags: list[dict], verdicts: list[dict]) -> list[tuple[dict, dict]]:
    """Pair flags with verdicts, filling gaps so every vd is a dict."""
    return [(fl, vd if vd is not None else
             {'ctx': fl['ctx'][:30], 'verdict': fl['opus'],
              'agrees_with': 'opus', 'confidence': 'unadjudicated', 'note': ''})
            for fl, vd in match_verdicts(flags, verdicts)]


_COL_CACHE: dict[tuple[int, str], Image.Image | None] = {}


def _column_image(page: int, col: str) -> Image.Image | None:
    """Reassemble the full column from its overlapping strips."""
    key = (page, col)
    if key not in _COL_CACHE:
        d = ROOT / f'images/strips/page-{page:03d}-{col}'
        strips = sorted(d.glob('strip-*.png'))
        if not strips:
            _COL_CACHE[key] = None
        else:
            h_total = STEP * (len(strips) - 1) + Image.open(strips[-1]).height
            im = Image.new('RGB', (1400, h_total), 'white')
            for i, s in enumerate(strips):
                im.paste(Image.open(s), (0, i * STEP))
            _COL_CACHE[key] = im
    return _COL_CACHE[key]


def _crop_for_line(page: int, col: str, line: int, total_lines: int,
                   item_no: int) -> str | None:
    """Crop a window centered on the estimated line -> work/review_crops/."""
    im = _column_image(page, col)
    if im is None:
        return None
    y = (line - 0.5) / total_lines * im.height
    y0 = max(0, int(y) - 300)
    y1 = min(im.height, int(y) + 300)
    d = ROOT / 'work/review_crops'
    d.mkdir(exist_ok=True)
    name = f'item-{item_no:03d}-p{page:03d}{col}-l{line}.png'
    im.crop((0, y0, 1400, y1)).save(d / name)
    return f'review_crops/{name}'


def _line_html(line_text: str, verdict: str) -> str:
    """Reconciled line with the verdict reading highlighted when findable."""
    esc = html.escape
    # only when unambiguous — a 1-char verdict usually recurs in the line
    # and would mark the wrong occurrence
    if verdict and line_text.count(verdict) == 1:
        a = line_text.index(verdict)
        return (esc(line_text[:a]) + '<mark>' + esc(verdict) + '</mark>'
                + esc(line_text[a + len(verdict):]))
    return esc(line_text)


def _compare_batches(pages: list[int]) -> list[list[int]]:
    """The requested pages, split into the batches compare was run over."""
    wanted = set(pages)
    batches = []
    for f in sorted((ROOT / 'work').glob('flags-*-*.jsonl')):
        # the first pilot batch is named flags-p15-19.jsonl
        a, b = (s.lstrip('p') for s in f.stem.split('-')[1:3])
        group = [p for p in range(int(a), int(b) + 1) if p in wanted]
        if group:
            batches.append(group)
            wanted -= set(group)
    if wanted:
        raise SystemExit(f'no compare batch recorded for pages {sorted(wanted)} '
                         f'— run the compare stage for them first')
    return batches


def build(pages: list[int]) -> Path:
    for old in (ROOT / 'work/review_crops').glob('item-*.png'):
        old.unlink()
    items = []
    # Spine offsets are relative to the page range compare was run over, so
    # the groups here must be those same ranges. work/flags-<a>-<b>.jsonl
    # records them; assuming a fixed batch size silently mis-locates every
    # flag whenever a batch was run at a different size.
    for group in _compare_batches(pages):
        columns, cleaned_by_col = [], {}
        for p in group:
            for col in ('L', 'R'):
                cleaned = clean_opus(
                    (ROOT / f'raw/opus/page-{p:03d}-{col}.txt').read_text(encoding='utf-8'))
                stream, offs = canonical(cleaned)
                columns.append((p, col, stream))
                cleaned_by_col[(p, col)] = (cleaned, offs)
        _, segs = build_spine(columns)
        seg_by_col = {(s.page, s.col): s for s in segs}
        for (p, col), (cleaned, offs) in cleaned_by_col.items():
            fpath = ROOT / f'work/flags-by-col/page-{p:03d}-{col}.json'
            apath = ROOT / f'work/adjudicated/page-{p:03d}-{col}.json'
            if not (fpath.exists() and apath.exists()):
                continue
            flags = json.loads(fpath.read_text(encoding='utf-8'))
            verdicts = json.loads(apath.read_text(encoding='utf-8'))
            rec_path = ROOT / f'work/reconciled/page-{p:03d}-{col}.txt'
            rec_lines = rec_path.read_text(encoding='utf-8').splitlines()
            seg = seg_by_col[(p, col)]
            for fl, vd in _match(flags, verdicts):
                if vd['confidence'] == 'high':
                    continue
                ls = fl['spine_off'] - seg.start
                pos = offs[ls] if ls < len(offs) else len(cleaned)
                line_no = cleaned.count('\n', 0, pos) + 1
                line_text = (rec_lines[line_no - 1]
                             if line_no <= len(rec_lines) else '')
                items.append({
                    'page': p, 'col': col, 'line': line_no,
                    'file': rec_path.name, 'line_text': line_text,
                    'strip': _crop_for_line(p, col, line_no, len(rec_lines),
                                            len(items) + 1),
                    'fl': fl, 'vd': vd,
                })

    esc = html.escape
    out = [f"""<!doctype html><meta charset="utf-8">
<title>Bonitz review queue — pages {pages[0]}–{pages[-1]}</title>
<style>
 body {{ font-family: Georgia, serif; max-width: 1450px; margin: 1em auto; padding: 0 1em; }}
 .item {{ border-top: 2px solid #999; padding: 1em 0; }}
 .hdr {{ font-weight: bold; font-size: 1.1em; }}
 .loc {{ color: #0645ad; font-family: monospace; }}
 .conf-medium {{ background: #ffe9b0; padding: 0 .35em; }}
 .conf-uncertain, .conf-unadjudicated {{ background: #ffc7c7; padding: 0 .35em; }}
 .line {{ font-size: 1.15em; background: #f4f4f4; padding: .4em .6em; margin: .5em 0; }}
 mark {{ background: #ffd54d; }}
 table {{ border-collapse: collapse; margin: .4em 0; }}
 td, th {{ border: 1px solid #ccc; padding: .15em .6em; font-size: .95em; }}
 .note {{ color: #444; font-style: italic; }}
 img {{ max-width: 100%; border: 1px solid #ccc; margin-top: .5em; }}
</style>
<h1>Bonitz human queue — pages {pages[0]}–{pages[-1]} ({len(items)} items)</h1>
<p>Each item: reconciled file + line number, the line as it now stands
(disputed reading <mark>highlighted</mark> when found), the three readers,
and an image window centered on the estimated line (the target should sit
mid-window, &plusmn;2 lines).</p>"""]
    for k, it in enumerate(items, 1):
        fl, vd = it['fl'], it['vd']
        conf = vd['confidence']
        strip_html = (f'<img src="{it["strip"]}" loading="lazy">'
                      if it['strip'] else '<p>(no strip image found)</p>')
        out.append(f"""<div class="item" id="i{k}">
<div class="hdr">{k}. p{it['page']}{it['col']}
 <span class="loc">{it['file']}:{it['line']}</span>
 <span class="conf-{conf}">{conf}</span></div>
<div class="line">{_line_html(it['line_text'], vd['verdict'])}</div>
<table><tr><th>Opus</th><th>Genie</th><th>LlamaParse</th><th>verdict (sided with {esc(vd.get('agrees_with', '?'))})</th></tr>
<tr><td>{esc(fl['opus'])}</td><td>{esc(fl['genie'])}</td><td>{esc(fl['llama'])}</td><td><b>{esc(vd['verdict'])}</b></td></tr></table>
<div class="note">{esc(vd.get('note', ''))}</div>
{strip_html}
</div>""")
    dest = ROOT / 'work/REVIEW.html'
    dest.write_text('\n'.join(out), encoding='utf-8')
    print(f'{len(items)} items -> {dest}')
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True, help='e.g. 15-44')
    build(parse_pages(ap.parse_args().pages))


if __name__ == '__main__':
    main()
