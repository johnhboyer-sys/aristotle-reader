"""Render a side-by-side Rackham|Ross review page from the alignment.

At each real Bekker anchor (chapter / column / half-column) it shows the Rackham
reference segment beside the Ross segment the aligner mapped to it, so the two
columns should read as the same content row-by-row. Drift shows up immediately
as the columns falling out of step.
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
            body.append(
                f'<tr class="t-{a.tier}">'
                f'<td class="cit"><b>{html.escape(a.citation)}</b><br>'
                f'<span class="tier">{a.tier}</span><br>'
                f'<span class="conf" style="color:{_CONF.get(a.confidence,"#000")}">'
                f'{a.confidence}</span>'
                f'<span class="flag">{html.escape(flag)}</span></td>'
                f'<td class="rk">{html.escape(rack_by_cit.get(a.citation,""))}</td>'
                f'<td class="rs">{html.escape(ross[i])}</td></tr>'
            )
        rows_by_book.setdefault(ch.book, []).append(
            f'<tr class="chap"><td colspan="3">Book {ch.book}, '
            f'chapter {ch.chapter} &nbsp;({ch.citation})</td></tr>' + "".join(body)
        )

    nav = " ".join(f'<a href="#b{b}">Book {b}</a>' for b in sorted(rows_by_book))
    sections = "".join(
        f'<h2 id="b{b}">Book {b}</h2><table>'
        f'<tr><th>Bekker</th><th>Rackham (reference, anchored)</th>'
        f'<th>Ross (aligned)</th></tr>{"".join(rows)}</table>'
        for b, rows in sorted(rows_by_book.items())
    )
    return f"""<!doctype html><meta charset=utf-8>
<title>NE alignment review — Rackham vs Ross</title>
<style>
 body{{font:15px/1.5 Georgia,serif;max-width:1200px;margin:1.5rem auto;padding:0 1rem;color:#222}}
 h1{{font-size:1.4rem}} .lede{{color:#555;font-size:.9rem}}
 .nav{{position:sticky;top:0;background:#fff;padding:.5rem 0;border-bottom:1px solid #ddd;font:13px sans-serif}}
 .nav a{{margin-right:.6rem}}
 table{{border-collapse:collapse;width:100%;margin-bottom:2rem}}
 td,th{{vertical-align:top;border-bottom:1px solid #eee;padding:.5rem .6rem;text-align:left}}
 th{{font:12px sans-serif;color:#666;border-bottom:1px solid #ccc}}
 .cit{{width:110px;font:11px sans-serif}} .tier{{color:#888}} .conf{{font-weight:bold}}
 .flag{{display:block;color:#b45309;font-size:10px;margin-top:2px}}
 .rk,.rs{{width:45%}} .rs{{background:#fcfbf7}}
 tr.chap td{{background:#1f2937;color:#fff;font:13px sans-serif;font-weight:bold;padding:.4rem .6rem}}
 tr.t-chapter td{{background:#eef4ff}}
</style>
<h1>Nicomachean Ethics — alignment review</h1>
<p class=lede>Each row is one real Bekker anchor. The two columns should read as the
same content; if Ross drifts out of step with Rackham, the alignment there is off.
Single interpolated lines are omitted. Backend: {backend}.</p>
<div class=nav>{nav}</div>
{sections}
"""


def write_html(work_id="ne", version_id="ross", backend="lexical", books=None):
    out = BUILD_DIR / "align" / f"{work_id}_{version_id}_review.html"
    out.write_text(build_html(work_id, version_id, backend, books), encoding="utf-8")
    return out
