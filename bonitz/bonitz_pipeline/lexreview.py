"""
Review page for the ligatures every reader missed.

lexcheck --scan-reconciled finds words that are not Greek but become Greek
when one υ is read as the ou-ligature. Nobody flagged these — all three
readers agreed — so they never reached REVIEW.html. This builds a
self-contained page so they can be ruled on against the scan.

  python3 -m bonitz_pipeline.lexreview --pages 15-51

CAUTION worth carrying into the review: a non-word in Bonitz is sometimes
the point. He records lectional variants (ἀβελτηρίας against Bekker's
ἀβελτερίας; αἰτώλιος against αἰγώλιος), and those must NOT be "corrected".
Look for a nearby "Bk", "l l", "coni", "vl" or a bracketed variant.
"""

from __future__ import annotations
import argparse
import base64
import html
import io
import unicodedata
from pathlib import Path

from PIL import Image

from .batch3 import ROOT, parse_pages
from .lexcheck import load_forms, scan_reconciled
from .review_html import _column_image

VARIANT_MARKERS = (' Bk', 'l l', 'coni', ' vl', 'legendum', 'lectio', 'exhibet')


def crop(page: int, col: str, line: int, total: int) -> str | None:
    """A window centred on the line, inlined as a grayscale data URI."""
    im = _column_image(page, col)
    if im is None:
        return None
    y = (line - 0.5) / total * im.height
    box = (0, max(0, int(y) - 260), 1400, min(im.height, int(y) + 260))
    buf = io.BytesIO()
    im.crop(box).convert('L').save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def build(pages: list[int]) -> Path:
    forms = load_forms()
    items = []
    for p in pages:
        for col in ('L', 'R'):
            rows = scan_reconciled(p, col, forms)
            if not rows:
                continue
            total = len(unicodedata.normalize('NFC', (
                ROOT / f'work/reconciled/page-{p:03d}-{col}.txt'
            ).read_text(encoding='utf-8')).splitlines())
            for r in rows:
                r['crop'] = crop(p, col, r['line'], total)
                r['variant_risk'] = any(k in r['context'] for k in VARIANT_MARKERS)
                items.append(r)

    esc = html.escape
    out = [f"""<!doctype html><meta charset="utf-8">
<title>Bonitz — ligatures no reader caught</title>
<style>
 body {{ font: 15px/1.5 -apple-system, sans-serif; margin: 2rem auto; max-width: 1180px; color:#111 }}
 h1 {{ font-size: 1.3rem }}
 .lead {{ background:#fff8e1; border-left:4px solid #e6a700; padding:.8rem 1rem; margin:1rem 0 }}
 .item {{ border-top:1px solid #ddd; padding:1.4rem 0 }}
 .hd {{ font-weight:600 }}
 .grk {{ font-size:1.15rem; font-family:"GFS Didot","Times New Roman",serif }}
 .ctx {{ background:#f6f6f6; padding:.5rem .7rem; margin:.5rem 0; white-space:pre-wrap }}
 mark {{ background:#ffe08a }}
 .prop {{ color:#0a6b2e; font-weight:600 }}
 .why {{ color:#555; font-size:.9rem }}
 .warn {{ background:#ffe9e9; border-left:4px solid #c00; padding:.5rem .7rem; margin:.5rem 0 }}
 img {{ width:100%; border:1px solid #ccc; margin-top:.6rem }}
</style>
<h1>Bonitz — {len(items)} ligatures no reader caught</h1>
<div class="lead">All three readers agreed on each of these, so none was ever flagged.
The evidence is lexical: the written form is not a Greek word, and reading one
υ as the ou-ligature makes it one. <b>None has been applied.</b>
<br><br><b>Careful:</b> Bonitz sometimes prints a non-word deliberately, recording a
variant reading (ἀβελτηρίας against Bekker&#39;s ἀβελτερίας; αἰτώλιος against
αἰγώλιος). Lines carrying <i>Bk</i>, <i>l l</i>, <i>coni</i>, <i>vl</i> or
<i>legendum</i> are marked below — leave those alone.</div>"""]

    for k, it in enumerate(items, 1):
        ctx, w = it['context'], it['wrote']
        marked = (esc(ctx).replace(esc(w), f'<mark>{esc(w)}</mark>', 1)
                  if w in ctx else esc(ctx))
        out.append(f"""<div class="item">
<div class="hd">{k}. p{it['page']:03d}{it['col']} · line {it['line']} ·
 <span class="grk">{esc(w)}</span> →
 <span class="prop grk">{esc(w.replace('υ', 'ȣ'))}</span></div>
{'<div class="warn">line carries a variant marker — check before correcting</div>'
 if it['variant_risk'] else ''}
<div class="ctx grk">{marked}</div>
<div class="why">not attested; <b>{esc(it['attested_as'])}</b> is an attested Aristotle form</div>
{f'<img src="{it["crop"]}">' if it['crop'] else '<i>no strip image</i>'}
</div>""")

    dest = ROOT / 'work/LEXICON-REVIEW.html'
    dest.write_text('\n'.join(out), encoding='utf-8')
    print(f'{len(items)} items -> {dest}  ({dest.stat().st_size/1e6:.2f} MB)')
    return dest


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    build(parse_pages(ap.parse_args().pages))
