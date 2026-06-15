"""Render a side-by-side Rackham|Ross review page from the alignment.

At each real Bekker anchor (chapter / column / half-column) it shows the Rackham
reference segment beside the Ross segment the aligner mapped to it, so the two
columns should read as the same content row-by-row. Drift shows up immediately
as the columns falling out of step.

The page is interactive: rate each anchor Good / Close / Off (click or keys
1/2/3). Ratings persist in localStorage (re-generating the page keeps them) and
Export JSON downloads them as labelled data to feed back into calibration / a
gold set.
"""

from __future__ import annotations

import html
import re

from ..config import BUILD_DIR
from .aligner import align_chapter
from .reference import default_target, load_chapters

_CONF = {"certain": "#2563eb", "reliable": "#15803d", "uncertain": "#b45309",
         "interpolated": "#999"}


def _sentence_at(text: str, off: int) -> tuple[str, str]:
    """The sentence starting at `off` (placements are sentence-start snapped),
    plus a little following context. Computed from the offset directly so two
    anchors that land in the same sentence both show it (instead of one going
    blank when sliced between coincident offsets)."""
    off = max(0, min(off, len(text)))
    m = re.match(r'[^.!?]*[.!?]+(?:["\')\]]+)?', text[off:])
    end = off + (m.end() if m else len(text) - off)
    return text[off:end].strip(), text[end:end + 160].strip()


def _cell(lead: str, ctx: str = "") -> str:
    """Bold lead sentence + dimmed trailing context."""
    if not lead and not ctx:
        return ""
    tail = f'<span class="ctx"> {html.escape(ctx)}…</span>' if ctx else ""
    return f'<b class="lead">{html.escape(lead)}</b>{tail}'


def build_html(work_id="ne", version_id="ross", backend="lexical", books=None) -> str:
    _vid, target = default_target(work_id)
    chapters = load_chapters(target)
    if books:
        chapters = [c for c in chapters if c.book in books]

    rows_by_book: dict[int, list[str]] = {}
    for ch in chapters:
        anchors = [a for a in align_chapter(ch, backend) if a.tier != "line"]
        anchors.sort(key=lambda a: a.offset)
        # Rackham side: show the whole sentence the tick falls in (the unit the
        # aligner matches on), so half-column rows aren't a mid-sentence fragment.
        fps = ch.ref_incipits()
        rack_by_cit = {a.citation: fps[i] for i, a in enumerate(ch.ref_anchors)}
        body = []
        for i, a in enumerate(anchors):
            flag = (" · " + ", ".join(a.flags)) if a.flags else ""
            rid = f"{ch.book}:{ch.chapter}:{a.citation}"
            body.append(
                f'<tr class="row" tabindex="0" data-id="{html.escape(rid)}" '
                f'data-book="{ch.book}" data-chapter="{html.escape(str(ch.chapter))}" '
                f'data-cit="{html.escape(a.citation)}" data-tier="{a.tier}" '
                f'data-conf="{a.confidence}">'
                f'<td class="rate">'
                f'<button class="g" data-v="good"  title="key 1">good</button>'
                f'<button class="c" data-v="close" title="key 2">close</button>'
                f'<button class="o" data-v="off"   title="key 3">off</button>'
                f'</td>'
                f'<td class="cit"><b>{html.escape(a.citation)}</b><br>'
                f'<span class="tier">{a.tier}</span><br>'
                f'<span class="conf" style="color:{_CONF.get(a.confidence,"#000")}">'
                f'{a.confidence}</span>'
                f'<span class="flag">{html.escape(flag)}</span></td>'
                f'<td class="rk">{_cell(rack_by_cit.get(a.citation,""))}</td>'
                f'<td class="rs">{_cell(*_sentence_at(ch.ross_text, a.offset))}</td></tr>'
            )
        rows_by_book.setdefault(ch.book, []).append(
            f'<tr class="chap"><td colspan="4">Book {ch.book}, '
            f'chapter {ch.chapter} &nbsp;({ch.citation})</td></tr>' + "".join(body)
        )

    nav = " ".join(f'<a href="#b{b}">Book {b}</a>' for b in sorted(rows_by_book))
    sections = "".join(
        f'<h2 id="b{b}">Book {b}</h2><table>'
        f'<tr><th>rating</th><th>Bekker</th><th>Rackham (reference, anchored)</th>'
        f'<th>Ross (aligned)</th></tr>{"".join(rows)}</table>'
        for b, rows in sorted(rows_by_book.items())
    )
    return _TEMPLATE.format(work=work_id, version=version_id, backend=backend,
                            nav=nav, sections=sections)


_TEMPLATE = """<!doctype html><meta charset=utf-8>
<title>NE alignment review — Rackham vs Ross</title>
<style>
 body{{font:15px/1.5 Georgia,serif;max-width:1280px;margin:1.5rem auto;padding:0 1rem;color:#222}}
 h1{{font-size:1.4rem}} .lede{{color:#555;font-size:.9rem}}
 .bar{{position:sticky;top:0;z-index:5;background:#fff;padding:.5rem 0;border-bottom:1px solid #ddd;
   font:13px sans-serif;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}}
 .bar a{{margin-right:.5rem}} .counts b{{font-variant-numeric:tabular-nums}}
 .bar button{{font:12px sans-serif;padding:.3rem .6rem;cursor:pointer}}
 table{{border-collapse:collapse;width:100%;margin-bottom:2rem}}
 td,th{{vertical-align:top;border-bottom:1px solid #eee;padding:.5rem .6rem;text-align:left}}
 th{{font:12px sans-serif;color:#666;border-bottom:1px solid #ccc}}
 .cit{{width:104px;font:11px sans-serif}} .tier{{color:#888}} .conf{{font-weight:bold}}
 .flag{{display:block;color:#b45309;font-size:10px;margin-top:2px}}
 .rk,.rs{{width:40%}} .rs{{background:#fcfbf7}}
 .lead{{font-weight:600;color:#111}} .ctx{{color:#aaa}}
 .rate{{width:96px}} .rate button{{display:block;width:100%;margin:0 0 6px;font:14px sans-serif;
   padding:11px 0;cursor:pointer;border:1px solid #bbb;background:#f3f3f3;border-radius:6px}}
 .rate .g{{color:#15803d}} .rate .c{{color:#b45309}} .rate .o{{color:#b91c1c}}
 tr.chap td{{background:#1f2937;color:#fff;font:13px sans-serif;font-weight:bold;padding:.4rem .6rem}}
 tr.row:focus{{outline:2px solid #2563eb;outline-offset:-2px}}
 tr.row.good td{{background:#9be88f}} tr.row.close td{{background:#ffd24d}} tr.row.off td{{background:#ff7a7a}}
 tr.row.good .rs{{background:#7fdd72}} tr.row.close .rs{{background:#ffc21f}} tr.row.off .rs{{background:#ff5e5e}}
 tr.row.good .ctx,tr.row.close .ctx,tr.row.off .ctx{{color:#5a5a5a}}
 tr.row.good .g{{background:#1f9d57;color:#fff;border-color:#147a41;font-weight:bold}}
 tr.row.close .c{{background:#e0890a;color:#fff;border-color:#b56d00;font-weight:bold}}
 tr.row.off .o{{background:#d62828;color:#fff;border-color:#a81f1f;font-weight:bold}}
</style>
<h1>Nicomachean Ethics — alignment review</h1>
<p class=lede>Each row compares one Bekker line. Left shows the <b>Rackham sentence that
the line falls in</b>; right shows the <b>Ross sentence the tool matched</b> (bold),
plus dimmed context. They should be the same thought — judge the bold sentences.
(Ross is terser, so the dimmed tails won't line up; ignore them.)
Rate each row <b>good / close / off</b> (click, or focus a row and press
<b>1 / 2 / 3</b> — that also jumps to the next row). Single interpolated lines are
omitted. Backend: {backend}.</p>
<div class=bar>
 <span>Books: {nav}</span>
 <span class=counts>rated <b id=cN>0</b>/<b id=tN>0</b> &nbsp;·&nbsp;
   <span style=color:#15803d>good <b id=gN>0</b></span> &nbsp;
   <span style=color:#b45309>close <b id=kN>0</b></span> &nbsp;
   <span style=color:#b91c1c>off <b id=oN>0</b></span></span>
 <button id=exp>Export JSON</button>
 <button id=clr>Clear all</button>
</div>
<noscript><p style="background:#fdeaea;padding:.6rem;font:13px sans-serif">
 ⚠ JavaScript is off (or this is a static preview) — the rating buttons won't work.
 Open this file in a real browser (Safari/Chrome).</p></noscript>
{sections}
<script>
const KEY = "align_ratings_{work}_{version}";
// localStorage can throw (file://, private mode) — fall back to in-memory so the
// buttons still work for the session.
let store; try {{ localStorage.setItem("_t","1"); localStorage.removeItem("_t"); store = localStorage; }}
catch(e) {{ const mem={{}}; store = {{getItem:k=>mem[k]??null, setItem:(k,v)=>mem[k]=v, removeItem:k=>delete mem[k]}}; }}
const load = () => {{ try {{ return JSON.parse(store.getItem(KEY) || "{{}}"); }} catch(e) {{ return {{}}; }} }};
let R = load();
const rows = [...document.querySelectorAll("tr.row")];

function paint(tr){{
  const v = R[tr.dataset.id];
  tr.classList.remove("good","close","off");
  if(v) tr.classList.add(v);
}}
function counts(){{
  let g=0,k=0,o=0;
  for(const v of Object.values(R)){{ if(v==="good")g++; else if(v==="close")k++; else if(v==="off")o++; }}
  cN.textContent=g+k+o; tN.textContent=rows.length;
  gN.textContent=g; kN.textContent=k; oN.textContent=o;
}}
function rate(tr,v){{
  if(R[tr.dataset.id]===v) delete R[tr.dataset.id]; else R[tr.dataset.id]=v;
  store.setItem(KEY, JSON.stringify(R));
  paint(tr); counts();
}}
rows.forEach(tr=>{{
  paint(tr);
  tr.querySelectorAll(".rate button").forEach(b=>
    b.addEventListener("click", e=>{{ e.stopPropagation(); rate(tr, b.dataset.v); }}));
  tr.addEventListener("keydown", e=>{{
    const map={{"1":"good","2":"close","3":"off"}};
    if(map[e.key]){{ rate(tr, map[e.key]); const i=rows.indexOf(tr); if(rows[i+1]) rows[i+1].focus(); e.preventDefault(); }}
  }});
}});
counts();
exp.onclick=()=>{{
  const data = rows.map(tr=>({{
    id:tr.dataset.id, book:+tr.dataset.book, chapter:tr.dataset.chapter,
    citation:tr.dataset.cit, tier:tr.dataset.tier, confidence:tr.dataset.conf,
    rating: R[tr.dataset.id] || null
  }}));
  const out = {{work:"{work}", version:"{version}", backend:"{backend}",
    exported: new Date().toISOString(),
    summary: {{rated:+cN.textContent, total:rows.length,
      good:+gN.textContent, close:+kN.textContent, off:+oN.textContent}},
    ratings: data}};
  const blob = new Blob([JSON.stringify(out,null,1)], {{type:"application/json"}});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="{work}_{version}_ratings.json"; a.click();
}};
clr.onclick=()=>{{ if(confirm("Clear all ratings?")){{ R={{}}; store.removeItem(KEY);
  rows.forEach(paint); counts(); }} }};
</script>
"""


def write_html(work_id="ne", version_id="ross", backend="lexical", books=None):
    out = BUILD_DIR / "align" / f"{work_id}_{version_id}_review.html"
    out.write_text(build_html(work_id, version_id, backend, books), encoding="utf-8")
    return out
