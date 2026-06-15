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

from ..config import BUILD_DIR
from .aligner import align_chapter
from .reference import load_chapters

_CONF = {"certain": "#2563eb", "reliable": "#15803d", "uncertain": "#b45309",
         "interpolated": "#999"}


def _segs(text, offsets):
    bounds = list(offsets) + [len(text)]
    return [text[bounds[i]:bounds[i + 1]].strip() for i in range(len(offsets))]


def build_html(work_id="ne", version_id="ross", backend="lexical", books=None) -> str:
    chapters = load_chapters(version_id)
    if books:
        chapters = [c for c in chapters if c.book in books]

    rows_by_book: dict[int, list[str]] = {}
    for ch in chapters:
        anchors = [a for a in align_chapter(ch, backend) if a.tier != "line"]
        anchors.sort(key=lambda a: a.offset)
        rack = _segs(ch.ref_text, [a.off for a in ch.ref_anchors])
        rack_by_cit = {a.citation: rack[i] for i, a in enumerate(ch.ref_anchors)}
        ross = _segs(ch.ross_text, [a.offset for a in anchors])
        body = []
        for i, a in enumerate(anchors):
            flag = (" · " + ", ".join(a.flags)) if a.flags else ""
            rid = f"{ch.book}:{ch.chapter}:{a.citation}"
            body.append(
                f'<tr class="row" tabindex="0" data-id="{html.escape(rid)}" '
                f'data-book="{ch.book}" data-chapter="{html.escape(str(ch.chapter))}" '
                f'data-cit="{html.escape(a.citation)}" data-tier="{a.tier}" '
                f'data-conf="{a.confidence}">'
                f'<td class="cit"><b>{html.escape(a.citation)}</b><br>'
                f'<span class="tier">{a.tier}</span><br>'
                f'<span class="conf" style="color:{_CONF.get(a.confidence,"#000")}">'
                f'{a.confidence}</span>'
                f'<span class="flag">{html.escape(flag)}</span></td>'
                f'<td class="rk">{html.escape(rack_by_cit.get(a.citation,""))}</td>'
                f'<td class="rs">{html.escape(ross[i])}</td>'
                f'<td class="rate">'
                f'<button class="g" data-v="good"  title="key 1">good</button>'
                f'<button class="c" data-v="close" title="key 2">close</button>'
                f'<button class="o" data-v="off"   title="key 3">off</button>'
                f'</td></tr>'
            )
        rows_by_book.setdefault(ch.book, []).append(
            f'<tr class="chap"><td colspan="4">Book {ch.book}, '
            f'chapter {ch.chapter} &nbsp;({ch.citation})</td></tr>' + "".join(body)
        )

    nav = " ".join(f'<a href="#b{b}">Book {b}</a>' for b in sorted(rows_by_book))
    sections = "".join(
        f'<h2 id="b{b}">Book {b}</h2><table>'
        f'<tr><th>Bekker</th><th>Rackham (reference, anchored)</th>'
        f'<th>Ross (aligned)</th><th>rating</th></tr>{"".join(rows)}</table>'
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
 .rk,.rs{{width:42%}} .rs{{background:#fcfbf7}}
 .rate{{width:74px}} .rate button{{display:block;width:100%;margin:0 0 3px;font:11px sans-serif;
   padding:3px 0;cursor:pointer;border:1px solid #ccc;background:#fafafa;border-radius:3px}}
 tr.chap td{{background:#1f2937;color:#fff;font:13px sans-serif;font-weight:bold;padding:.4rem .6rem}}
 tr.row:focus{{outline:2px solid #2563eb;outline-offset:-2px}}
 tr.row.good td{{background:#eafbe7}} tr.row.close td{{background:#fff7e0}} tr.row.off td{{background:#fdeaea}}
 tr.row.good .rs{{background:#dff5da}} tr.row.close .rs{{background:#fdeec2}} tr.row.off .rs{{background:#f9d9d9}}
 tr.row.good .g,tr.row.close .c,tr.row.off .o{{font-weight:bold;border-color:#333}}
</style>
<h1>Nicomachean Ethics — alignment review</h1>
<p class=lede>Each row is one real Bekker anchor. The two columns should read as the
same content; if Ross drifts out of step with Rackham, the alignment is off.
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
{sections}
<script>
const KEY = "align_ratings_{work}_{version}";
const load = () => JSON.parse(localStorage.getItem(KEY) || "{{}}");
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
  localStorage.setItem(KEY, JSON.stringify(R));
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
clr.onclick=()=>{{ if(confirm("Clear all ratings?")){{ R={{}}; localStorage.removeItem(KEY);
  rows.forEach(paint); counts(); }} }};
</script>
"""


def write_html(work_id="ne", version_id="ross", backend="lexical", books=None):
    out = BUILD_DIR / "align" / f"{work_id}_{version_id}_review.html"
    out.write_text(build_html(work_id, version_id, backend, books), encoding="utf-8")
    return out
