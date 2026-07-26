"""
One review page for every outstanding check.

Four checks now have unreviewed findings, and working them as four separate
passes means jumping between error types and revisiting the same page four
times. This gathers them, sorts by page/column/line, and renders a single
self-contained document so a page is reviewed once.

  python3 -m bonitz_pipeline.review --pages 15-51
  python3 -m bonitz_pipeline.review --pages 15-51 --weak     # + single-witness
  python3 -m bonitz_pipeline.review --pages 15-51 --no-crops # small, text only

Crops are included by default but cost ~150KB each; at ~80 findings that is
an 12MB file. --no-crops gives a phone-sized page, which is enough for the
accent findings (ἀγαλμα for ἄγαλμα needs no ink) though not for a genuinely
fine judgment.
"""

from __future__ import annotations
import argparse
import html
import unicodedata

from . import accent as accent_mod
from . import alphacheck, family
from . import breathing as breathing_mod
from .batch3 import ROOT, parse_pages
from .lexcheck import nfc
from .lexreview import VARIANT_MARKERS, _rebreathe, crop

RULINGS = ROOT / 'tests/fixtures/john-rulings.json'


def already_ruled() -> set[tuple]:
    """Findings John has already decided. A settled question is not a finding.

    Declining a correction is a decision — αλλα keeps its missing marks
    because the print has none — so a check that keeps raising it is asking
    him to rule twice on the same ink.
    """
    import json
    if not RULINGS.exists():
        return set()
    d = json.loads(RULINGS.read_text(encoding='utf-8'))
    out = set()
    for sect, key, field in (('breathing', 'declined', 'keep'),
                             ('family', 'held', 'keep'),
                             ('not_errors', 'items', 'text'),
                             ('print_errors_recorded_as_printed', 'items', 'text')):
        for r in d.get(sect, {}).get(key, []):
            out.add((r['page'], r['col'], r[field]))
    return out

KINDS = {
    'accent':   ('accent contradicts the corpus', '#8250df'),
    'breathing': ('breathing contradicts the lexicon', '#0a6b2e'),
    'alpha':    ('headword out of alphabetical order', '#b35c00'),
    'family':   ('disagrees with its own entry', '#c00'),
}


def gather(pages: list[int], weak: bool) -> list[dict]:
    out = []
    ruled = already_ruled()
    a_idx = accent_mod.load_index()
    b_idx = breathing_mod.load_index()

    for p in pages:
        for col in ('L', 'R'):
            for r in accent_mod.scan(p, col, a_idx):
                out.append({**r, 'kind': 'accent',
                            'proposed': nfc(unicodedata.normalize('NFC', r['expected'])),
                            'why': 'the corpus attests only this accentuation'})
            for r in breathing_mod.scan(p, col, b_idx):
                if r['strength'] != 'strong' and not weak:
                    continue
                out.append({**r, 'kind': 'breathing',
                            'proposed': _rebreathe(r['wrote'], r['expected']),
                            'why': f"corpus and LSJ agree ({r['strength']})"})
            for r in family.scan(p, col):
                out.append({**r, 'kind': 'family', 'wrote': r['word'],
                            'proposed': None,
                            'why': f"{r['agree']} words in the {r['headword']} entry "
                                   f"disagree with it, {r['differ']} agree"})

    for r in alphacheck.scan(pages):
        out.append({**r, 'kind': 'alpha', 'wrote': r['word'], 'proposed': None,
                    'context': '', 'why': f"belongs between {r['after']} and {r['before']}"})

    out = [r for r in out if (r['page'], r['col'], r['wrote']) not in ruled]
    out.sort(key=lambda r: (r['page'], r['col'], r.get('line', 0)))
    return out


def build(pages: list[int], weak: bool = False, crops: bool = True):
    items = gather(pages, weak)
    esc = html.escape
    by_kind = {k: sum(1 for i in items if i['kind'] == k) for k in KINDS}
    chips = ' '.join(
        f'<span class="chip" style="background:{KINDS[k][1]}">{k} {n}</span>'
        for k, n in by_kind.items() if n)

    out = [f"""<!doctype html><meta charset="utf-8">
<title>Bonitz — {len(items)} outstanding findings</title>
<style>
 body {{ font: 15px/1.55 -apple-system, sans-serif; margin: 1.5rem auto; max-width: 1100px; color:#111; padding:0 1rem }}
 h1 {{ font-size: 1.25rem }}
 .lead {{ background:#fff8e1; border-left:4px solid #e6a700; padding:.75rem 1rem; margin:1rem 0 }}
 .chip {{ color:#fff; border-radius:10px; padding:.1rem .55rem; font-size:.78rem; margin-right:.3rem }}
 .item {{ border-top:1px solid #ddd; padding:1.1rem 0 }}
 .hd {{ font-weight:600 }}
 .grk {{ font-size:1.15rem; font-family:"GFS Didot","Times New Roman",serif }}
 .ctx {{ background:#f6f6f6; padding:.45rem .65rem; margin:.45rem 0; white-space:pre-wrap }}
 mark {{ background:#ffe08a }}
 .prop {{ color:#0a6b2e; font-weight:600 }}
 .why {{ color:#555; font-size:.88rem }}
 .warn {{ background:#ffe9e9; border-left:4px solid #c00; padding:.45rem .65rem; margin:.45rem 0 }}
 img {{ width:100%; border:1px solid #ccc; margin-top:.5rem }}
</style>
<h1>Bonitz — {len(items)} outstanding findings, pages {pages[0]}–{pages[-1]}</h1>
<div class="lead">{chips}<br><br>
Sorted by page so each one is reviewed once. <b>Nothing here has been applied.</b>
<br><br><b>The standing rule:</b> a correction is legitimate only when it moves the
text toward the ink. Where the print itself is wrong, it is recorded as printed —
that is how ἀλλοτριώτερχ, Ηκ13 and the 1835/1820 compositor errors were handled,
and why <i>αλλα</i> on 32-L keeps its missing marks. Lines carrying a variant
marker (<i>Bk</i>, <i>l l</i>, <i>coni</i>, <i>vl</i>) are flagged below.</div>"""]

    for k, it in enumerate(items, 1):
        w = it['wrote']
        ctx = it.get('context', '')
        marked = (esc(ctx).replace(esc(w), f'<mark>{esc(w)}</mark>', 1)
                  if w and w in ctx else esc(ctx))
        label, colour = KINDS[it['kind']]
        prop = it.get('proposed')
        arrow = (f' → <span class="prop grk">{esc(prop)}</span>' if prop else '')
        risk = any(m in ctx for m in VARIANT_MARKERS)
        img = ''
        if crops:
            total = len(nfc((ROOT / f"work/reconciled/page-{it['page']:03d}-{it['col']}.txt")
                            .read_text(encoding='utf-8')).splitlines())
            data = crop(it['page'], it['col'], it.get('line', 1), total)
            img = f'<img src="{data}">' if data else ''
        out.append(f"""<div class="item">
<div class="hd">{k}. p{it['page']:03d}{it['col']}:{it.get('line','?')} ·
 <span class="chip" style="background:{colour}">{it['kind']}</span>
 <span class="grk">{esc(w)}</span>{arrow}</div>
{'<div class="warn">variant marker on this line — check before correcting</div>' if risk else ''}
{f'<div class="ctx grk">{marked}</div>' if ctx else ''}
<div class="why">{esc(it['why'])}</div>
{img}
</div>""")

    dest = ROOT / ('work/REVIEW-ALL.html' if crops
                   else 'work/REVIEW-ALL-text.html')
    dest.write_text('\n'.join(out), encoding='utf-8')
    print(f'{len(items)} findings ({by_kind}) -> {dest} '
          f'({dest.stat().st_size/1e6:.2f} MB)')
    return dest


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    ap.add_argument('--weak', action='store_true')
    ap.add_argument('--no-crops', action='store_true')
    a = ap.parse_args()
    build(parse_pages(a.pages), weak=a.weak, crops=not a.no_crops)
