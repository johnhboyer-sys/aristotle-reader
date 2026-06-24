"""Render the gloss aligner's placement on a reference-less translation.

Each real Bekker tick is shown with:
  - its raw Greek window (amber = tick line, grey = context)
  - its gloss window  (blue = tick line, grey = context)
  - a clickable translation window: ◀ marks the current placement; click any
    word to set the exact corrected phrase (stored in localStorage and exportable
    as JSON for pipeline reruns)

The exported JSON shape is {citation: {verdict, phrase}} — directly usable by
verify_to_offsets to rerun the correction pass without another agent call.
"""

from __future__ import annotations

import html
import json
import re

from ..config import BUILD_DIR
from .glossing import chapter_lines, load_gloss, tick_windows
from .reference import default_target

REAL_TIERS = ("column", "five_line")
# Characters to show before/after the current tick offset in the translation window.
_BEFORE = 200
_AFTER  = 420


def _windows_by_tick(books=None):
    """{(book, chapter): {tick_citation: [line_citation, ...]}}"""
    out = {}
    for ch in chapter_lines(books):
        out[(ch.book, ch.chapter)] = {
            w.tick: [ln.citation for ln in w.lines] for w in tick_windows(ch)
        }
    return out


def _load_greek(work_id: str, book: int, chap: int) -> dict[str, str]:
    """Greek line text keyed by citation, from the gloss task file."""
    task_file = BUILD_DIR / "align" / "gloss_tasks" / work_id / f"{book}-{chap}.json"
    if not task_file.exists():
        return {}
    windows = json.loads(task_file.read_text(encoding="utf-8"))
    greek: dict[str, str] = {}
    for w in windows:
        for ln in w.get("lines", []):
            greek[ln["citation"]] = ln["greek"]
    return greek


def _render_tw(text_window: str, tick_in_window: int) -> str:
    """Render text_window as clickable word spans.

    Words before ◀ are grey; words at/after ◀ are normal. Click any word to
    set the corrected phrase. The ◀ marker shows the current tick placement.
    Each word gets data-p with the verbatim 80-char phrase starting there.
    """
    marker_placed = False
    parts: list[str] = []
    for m in re.finditer(r"\S+|\s+", text_window):
        off = m.start()
        tok = m.group()
        if not marker_placed and off >= tick_in_window:
            parts.append("<span class='twm'>◀</span>")
            marker_placed = True
        if re.search(r"\S", tok):  # word
            zone = "twa" if off >= tick_in_window else "twb"
            phrase_attr = html.escape(
                text_window[off: off + 80].replace("\n", " "), quote=True)
            parts.append(
                f"<span class=\"tww {zone}\" data-p=\"{phrase_attr}\">"
                f"{html.escape(tok)}</span>")
        else:
            parts.append(html.escape(tok).replace("  ", " &nbsp;"))
    if not marker_placed:
        parts.append("<span class='twm'>◀</span>")
    return "".join(parts)


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
        greek = _load_greek(work_id, book, chap)
        win = windows.get((book, chap), {})
        for a in rec["anchors"]:
            if a["tier"] not in REAL_TIERS:
                continue
            off = a["offset"]
            ws = max(0, off - _BEFORE)
            text_window = text[ws: ws + _BEFORE + _AFTER]
            tick_in_window = off - ws
            cits = win.get(a["citation"], [a["citation"]])
            out.append({
                "citation": a["citation"], "tier": a["tier"],
                "confidence": a["confidence"], "book": book, "chapter": chap,
                "gloss_window": [
                    {"text": (gloss.get(c, "") or "").strip(), "tick": c == a["citation"]}
                    for c in cits],
                "greek_window": [
                    {"text": (greek.get(c, "") or "").strip(), "tick": c == a["citation"]}
                    for c in cits],
                "tw_html": _render_tw(text_window, tick_in_window),
                "excerpt": text[off: off + 80].replace("\n", " "),
            })
    return version_id, out


def sample(work_id="EN", books=None, every=6):
    _vid, rows = _rows(work_id, books)
    lines = []
    for r in rows[::every]:
        lines.append(f"[{r['citation']}] ({r['tier']}, {r['confidence']})")
        lines.append(f"  GLOSS: {r['gloss_window'][0]['text'][:120]}")
        lines.append(f"  ROSS : {r['excerpt'][:120]}")
    return "\n".join(lines)


def write_html(work_id="EN", books=None, seed=None):
    version_id, rows = _rows(work_id, books)
    book_num = books[0] if books and len(books) == 1 else 0
    store_key = f"review-{work_id}-{version_id}-book{book_num:02d}"
    dl_filename = f"{store_key}.json"

    css = """
body{font:15px/1.5 Georgia,serif;max-width:1450px;margin:2rem auto;padding:0 1rem;
  background:#16181c;color:#c9cdd4}
h1{font-size:1.3rem;color:#e6e9ef}
.bk{font:600 13px monospace;color:#7ec98f;white-space:nowrap}
table{border-collapse:collapse;width:100%}
td{border-top:1px solid #2c3038;padding:.45rem .55rem;vertical-align:top}
.c0{width:7%}.c1{width:17%}.c2{width:20%}.c3{width:40%}.c4{width:9%;white-space:nowrap}
.uncertain>td{background:#2a1d1d}
.gl-on{color:#cfe0ff;font-weight:600;background:#23304a;padding:0 2px;border-radius:2px}
.gl-off{color:#6b7280}
.gk-on{color:#e8d9a0;font-weight:600}
.gk-off{color:#5a6070}
th{text-align:left;border-bottom:2px solid #444b57;padding:.4rem .55rem;font-size:.82rem;color:#e6e9ef}
/* translation word spans */
.tww{cursor:pointer;border-radius:2px;padding:0 1px}
.twb{color:#6b7280}
.twa{color:#c9cdd4}
.tww:hover{background:#2e3a50;color:#e0eaff}
.tww.selected{background:#1a3a1a;color:#7ec98f;outline:1px solid #7ec98f}
.twm{color:#e05050;font-weight:700;margin:0 2px;pointer-events:none;user-select:none}
/* verdict buttons */
.btn{font:600 11px sans-serif;padding:3px 7px;border-radius:3px;border:1px solid #444;
  cursor:pointer;margin:2px 1px;background:#222;color:#aaa;display:block;width:100%;text-align:left}
.btn:hover{background:#2e3240}
.btn-ok.active{background:#0e2e0e;color:#7ec98f;border-color:#7ec98f}
.btn-early.active{background:#2e1e00;color:#f0a040;border-color:#f0a040}
.btn-late.active{background:#2e0d0d;color:#f06060;border-color:#f06060}
.pp{font:11px/1.3 monospace;color:#8090a8;margin-top:4px;word-break:break-word}
/* row tints */
tr.v-ok   td{background:#0a1a0a}
tr.v-early td{background:#1a1200}
tr.v-late  td{background:#1a0808}
tr.v-ok.uncertain   td{background:#0a1a0a}
tr.v-early.uncertain td{background:#1a1200}
tr.v-late.uncertain  td{background:#1a0808}
/* toolbar */
#toolbar{position:sticky;top:0;z-index:10;background:#1a1d22;padding:.45rem .8rem;
  border-bottom:1px solid #2e3340;display:flex;gap:.8rem;align-items:center;flex-wrap:wrap}
#toolbar label{font-size:.82rem;color:#8b95a8}
#stats{font-size:.82rem;color:#8b95a8;margin-left:auto}
#dl-btn,#imp-btn{font:600 12px sans-serif;padding:4px 12px;border-radius:4px;
  border:1px solid #7fb0ff;background:#1a2a40;color:#7fb0ff;cursor:pointer}
#dl-btn:hover,#imp-btn:hover{background:#243a55}
/* Phone: the 5-column table can't fit ~390px, so stack each tick's cells into
   a labelled card (header row hidden) and lay the verdict buttons in a row. */
@media (max-width:760px){
  body{margin:.4rem auto;padding:0 .55rem;font-size:15px;overflow-x:hidden}
  .pp{overflow-wrap:anywhere}
  #toolbar{gap:.4rem .8rem;padding:.4rem .55rem}
  #stats{margin-left:0}
  table tr:first-of-type{display:none}
  table,tbody,tr,td{display:block;width:auto}
  tr{border-top:2px solid #444b57;padding:.55rem 0}
  td{border:none!important;width:auto!important;padding:.15rem .1rem}
  td.c1::before,td.c2::before,td.c3::before,td.c4::before{
    display:block;font:700 10px sans-serif;letter-spacing:.05em;text-transform:uppercase;
    color:#8b95a8;margin:.5rem 0 .15rem}
  td.c1::before{content:"Greek"}
  td.c2::before{content:"Gloss"}
  td.c3::before{content:"Translation — tap to place"}
  td.c4::before{content:"Verdict"}
  .btn{display:inline-block;width:auto;margin:2px 4px 2px 0;padding:5px 10px;font-size:12px}
}
"""

    js = f"""
const STORE_KEY = {json.dumps(store_key)};
const DL_NAME   = {json.dumps(dl_filename)};
// Verdicts baked into the page at generation (default {{}}); used to pre-fill on
// a device that has no localStorage yet (e.g. reviewing on a phone after starting
// on the desktop). localStorage, if present, wins so on-device progress is kept.
const SEED = {json.dumps(seed or {})};
let saved = Object.assign({{}}, SEED);
try {{ Object.assign(saved, JSON.parse(localStorage.getItem(STORE_KEY) || '{{}}')); }} catch(e) {{}}

function rowEl(cit) {{
  return document.getElementById('r' + cit.replace(/[^a-z0-9]/gi,'_'));
}}

function applyState(cit, rec) {{
  const row = rowEl(cit);
  if (!row) return;
  // row tint — verdict only
  row.classList.remove('v-ok','v-early','v-late');
  if (rec && rec.verdict) row.classList.add('v-' + rec.verdict);
  // buttons — verdict only
  row.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  if (rec && rec.verdict) {{
    const ab = row.querySelector('.btn-' + rec.verdict);
    if (ab) ab.classList.add('active');
  }}
  // phrase preview — phrase only
  const pp = row.querySelector('.pp');
  if (pp) pp.textContent = rec && rec.phrase ? '\\u201c' + rec.phrase.slice(0,55) + '\\u2026\\u201d' : '';
  // word highlight — phrase only
  row.querySelectorAll('.tww.selected').forEach(w => w.classList.remove('selected'));
  if (rec && rec.phrase) {{
    row.querySelectorAll('.tww').forEach(w => {{
      if (w.dataset.p === rec.phrase) w.classList.add('selected');
    }});
  }}
}}

// Button click — sets verdict only; never touches the phrase
function save(cit, verdict) {{
  if (saved[cit] && saved[cit].verdict === verdict) {{
    delete saved[cit].verdict;  // toggle off
    if (!saved[cit].phrase) delete saved[cit];
  }} else {{
    saved[cit] = Object.assign({{}}, saved[cit] || {{}}, {{verdict}});
  }}
  localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  applyState(cit, saved[cit] || null);
  updateStats();
}}

// Word click — updates phrase only; never touches the verdict
document.addEventListener('click', e => {{
  const w = e.target.closest('.tww');
  if (!w) return;
  const row = e.target.closest('tr[data-cit]');
  if (!row) return;
  const cit = row.dataset.cit;
  saved[cit] = Object.assign({{}}, saved[cit] || {{}}, {{phrase: w.dataset.p}});
  localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  applyState(cit, saved[cit]);
  updateStats();
}});

function downloadJSON() {{
  const blob = new Blob([JSON.stringify(saved, null, 2)], {{type:'application/json'}});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = DL_NAME;
  a.click();
  URL.revokeObjectURL(a.href);
}}

// Load a previously exported JSON (merge over current state) so verdicts move
// between devices: Export on one, Import on another.
function importJSON(input) {{
  const file = input.files && input.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {{
    try {{
      const data = JSON.parse(r.result);
      Object.assign(saved, data);
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
      for (const [cit, rec] of Object.entries(saved)) applyState(cit, rec);
      updateStats();
    }} catch(e) {{ alert('Could not read that JSON: ' + e.message); }}
  }};
  r.readAsText(file);
  input.value = '';
}}

function updateStats() {{
  const total  = document.querySelectorAll('tr[data-cit]').length;
  const ok     = Object.values(saved).filter(r => r.verdict==='ok').length;
  const early  = Object.values(saved).filter(r => r.verdict==='early').length;
  const late   = Object.values(saved).filter(r => r.verdict==='late').length;
  document.getElementById('stats').textContent =
    ok+' spot-on  ·  '+early+' early  ·  '+late+' late  ·  '+(total-ok-early-late)+' unreviewed';
}}

window.addEventListener('DOMContentLoaded', () => {{
  // Persist the merged state so a baked-in SEED survives on a fresh device.
  localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  for (const [cit, rec] of Object.entries(saved)) applyState(cit, rec);
  updateStats();
}});
"""

    head = (
        f"<h1>Gloss alignment review — {work_id} → {version_id}</h1>"
        f"<p>{len(rows)} real Bekker ticks. "
        f"<b>Greek</b>: tick in <span class='gk-on'>amber</span>. "
        f"<b>Gloss</b>: tick in <span class='gl-on'>blue</span>. "
        f"<b>Translation</b>: <span class='twm'>◀</span> = current placement — "
        f"click any word to set the exact correct position "
        f"(saved to localStorage; export as JSON for pipeline reruns).</p>"
    )

    toolbar = (
        "<div id='toolbar'>"
        "<label>Verdict buttons mark the current ◀ position as ok/early/late. "
        "Click a word in the translation to pin the exact phrase.</label>"
        f"<button id='dl-btn' onclick='downloadJSON()'>Export JSON</button>"
        "<label id='imp-btn'>Import JSON"
        "<input type='file' accept='.json,application/json' "
        "onchange='importJSON(this)' style='display:none'></label>"
        "<span id='stats'>—</span>"
        "</div>"
    )

    trs = []
    for r in rows:
        cit = r["citation"]
        rid = "r" + re.sub(r"[^a-z0-9]", "_", cit, flags=re.I)
        base_cls = "uncertain" if r["confidence"] == "uncertain" else ""

        gk = " ".join(
            f"<span class='{'gk-on' if w['tick'] else 'gk-off'}'>"
            f"{html.escape(w['text'])}</span>"
            for w in r["greek_window"])
        gl = " ".join(
            f"<span class='{'gl-on' if w['tick'] else 'gl-off'}'>"
            f"{html.escape(w['text'])}</span>"
            for w in r["gloss_window"])

        cit_j = json.dumps(cit)
        btns = (
            f"<button class='btn btn-ok'    onclick='save({cit_j},\"ok\")'>Spot on</button>"
            f"<button class='btn btn-early' onclick='save({cit_j},\"early\")'>Early</button>"
            f"<button class='btn btn-late'  onclick='save({cit_j},\"late\")'>Late</button>"
            f"<div class='pp'></div>"
        )

        trs.append(
            f"<tr id='{rid}' data-cit='{html.escape(cit)}'"
            f"{' class=' + repr(base_cls) if base_cls else ''}>"
            f"<td class='bk c0'>{html.escape(cit)}<br>"
            f"<small>{r['tier']}</small><br>"
            f"<small>{html.escape(r['confidence'])}</small></td>"
            f"<td class='c1' style='font-family:serif'>{gk}</td>"
            f"<td class='c2'>{gl}</td>"
            f"<td class='c3' style='font-size:13.5px'>{r['tw_html']}</td>"
            f"<td class='c4'>{btns}</td></tr>"
        )

    body = (
        "<table>"
        "<tr><th class='c0'>Bekker</th>"
        "<th class='c1'>Greek (amber=tick)</th>"
        "<th class='c2'>Gloss (blue=tick)</th>"
        "<th class='c3'>Translation — click to place</th>"
        "<th class='c4'>Verdict</th></tr>"
        + "".join(trs) + "</table>"
    )

    out = (
        f"<!doctype html><meta charset=utf-8>"
        f"<meta name=viewport content='width=device-width,initial-scale=1'>"
        f"<title>Gloss review {work_id}</title>"
        f"<style>{css}</style>"
        f"<script>{js}</script>"
        f"{toolbar}{head}{body}"
    )
    path = BUILD_DIR / "align" / f"{work_id}_{version_id}_gloss_review.html"
    path.write_text(out, encoding="utf-8")
    return path
