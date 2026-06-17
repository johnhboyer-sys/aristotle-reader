"""Render the gloss aligner's placement on a reference-less translation.

There is no gold for an unmarked translation like Ross, so validation is human
spot-check: for each real Bekker tick the aligner placed, show the Greek's
meaning (the gloss) beside the translation text it landed on. If the gloss and
the translation excerpt say the same thing, the citation is right.
"""

from __future__ import annotations

import html
import json

from ..config import BUILD_DIR
from .glossing import chapter_lines, load_gloss, tick_windows
from .reference import default_target

REAL_TIERS = ("column", "five_line")


def _windows_by_tick(books=None):
    """{(book, chapter): {tick_citation: [line_citation, ...]}} — the 3-line
    window behind each tick, i.e. the actual matching fingerprint."""
    out = {}
    for ch in chapter_lines(books):
        out[(ch.book, ch.chapter)] = {
            w.tick: [ln.citation for ln in w.lines] for w in tick_windows(ch)
        }
    return out


def _rows(work_id: str, books=None):
    version_id, ross = default_target(work_id)
    amap = json.loads(
        (BUILD_DIR / "align" / f"{work_id}_{version_id}_gloss_map.json").read_text(encoding="utf-8"))
    windows = _windows_by_tick(books)
    out = []
    for key, rec in amap.items():
        book, chap = (int(x) for x in key.split(":"))
        if books and book not in books:
            continue
        text = ross.get((book, chap), "")
        gloss = load_gloss(work_id, book, chap)
        win = windows.get((book, chap), {})
        for a in rec["anchors"]:
            if a["tier"] not in REAL_TIERS:
                continue
            excerpt = text[a["offset"]:a["offset"] + 220].replace("\n", " ")
            # The full window gloss the matcher used; tick line marked.
            cits = win.get(a["citation"], [a["citation"]])
            window = [{"text": (gloss.get(c, "") or "").strip(), "tick": c == a["citation"]}
                      for c in cits]
            out.append({
                "citation": a["citation"], "tier": a["tier"],
                "confidence": a["confidence"], "book": book, "chapter": chap,
                "gloss": (gloss.get(a["citation"], "") or "").strip(),
                "window": window,
                "excerpt": excerpt,
            })
    return version_id, out


def sample(work_id="EN", books=None, every=6):
    """A readable text sample: every Nth real tick, citation / gloss / Ross."""
    _vid, rows = _rows(work_id, books)
    lines = []
    for r in rows[::every]:
        lines.append(f"[{r['citation']}] ({r['tier']}, {r['confidence']})")
        lines.append(f"  GLOSS: {r['gloss'][:120]}")
        lines.append(f"  ROSS : {r['excerpt'][:120]}")
    return "\n".join(lines)


def write_html(work_id="EN", books=None):
    version_id, rows = _rows(work_id, books)
    css = """body{font:15px/1.5 Georgia,serif;max-width:1150px;margin:2rem auto;padding:0 1rem;
background:#16181c;color:#c9cdd4}h1{font-size:1.3rem;color:#e6e9ef}a{color:#7fb0ff}
.tick{font:600 13px monospace;color:#7ec98f;white-space:nowrap}
table{border-collapse:collapse;width:100%}td{border-top:1px solid #2c3038;padding:.5rem .6rem;vertical-align:top}
.g{color:#aeb6c2;width:44%}.r{width:44%;color:#c9cdd4}.uncertain{background:#2a1d1d}
.g .on{color:#cfe0ff;font-weight:600;background:#23304a;padding:0 2px;border-radius:2px}
.g .off{color:#6b7280}
th{text-align:left;border-bottom:2px solid #444b57;padding:.4rem .6rem;font-size:.85rem;color:#e6e9ef}"""
    head = (f"<h1>Gloss alignment — {work_id} → {version_id} (reference-less)</h1>"
            f"<p>{len(rows)} real Bekker ticks placed on the unmarked translation. The "
            f"<b>GLOSS</b> column shows the full 3-line window the matcher used — the "
            f"<span class='on'>tick line</span> in blue, the context lines greyed. Does the "
            f"<b>ROSS</b> excerpt overlap the window?</p>")
    trs = []
    for r in rows:
        cls = " class='uncertain'" if r["confidence"] == "uncertain" else ""
        win = " ".join(
            f"<span class='{'on' if w['tick'] else 'off'}'>{html.escape(w['text'])}</span>"
            for w in r["window"])
        trs.append(
            f"<tr{cls}><td class='tick'>{html.escape(r['citation'])}<br><small>{r['tier']}</small>"
            f"<br><small>{html.escape(r['confidence'])}</small></td>"
            f"<td class='g'>{win}</td>"
            f"<td class='r'>{html.escape(r['excerpt'])}…</td></tr>")
    body = ("<table><tr><th>Bekker</th><th>Gloss — full window (tick line in blue)</th>"
            "<th>Ross at placed offset</th></tr>" + "".join(trs) + "</table>")
    out = f"<!doctype html><meta charset=utf-8><title>Gloss review {work_id}</title><style>{css}</style>{head}{body}"
    path = BUILD_DIR / "align" / f"{work_id}_{version_id}_gloss_review.html"
    path.write_text(out, encoding="utf-8")
    return path
