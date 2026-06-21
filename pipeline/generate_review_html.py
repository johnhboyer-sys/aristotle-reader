"""Build the human review page for the Edghill Categories gloss alignment.

For each real Bekker tick the aligner placed (column / five_line tiers), show:
  - the Greek window (line above / tick / below), tick line highlighted
  - the gloss window (same three lines, glossed), tick line highlighted
  - the Edghill prose with a ▸ MARKER at the placed offset, plus context before
    and after, so the reviewer can see if the glossed content actually sits
    before the marker (placed too LATE) or after it (placed too EARLY).

Each row has Spot on / Early / Late buttons + a note box; verdicts auto-save to
localStorage and can be exported as one JSON file. Read-only w.r.t. sources/.
Writes -> alignment-results/edghill/review/categories-ch1-2.html
"""

import html
import json
import re

from aristotle_pipeline.align.glossing import chapter_lines, load_gloss, tick_windows
from aristotle_pipeline.config import REPO_ROOT, SOURCES_DIR, Manifest
from aristotle_pipeline.refs import line_key
from aristotle_pipeline.stage1_ross import parse_translation


def bekker_key(citation: str):
    """Sortable Bekker key for a citation like '1a5' -> (page, side, line)."""
    m = re.match(r"(\d+[ab])(\d+)", citation)
    return line_key(m.group(1), int(m.group(2))) if m else (0, "", 0)

WORK = "Cat"
VERSION = "edghill"
REAL_TIERS = ("column", "five_line")
CTX_BEFORE = 240   # chars of Edghill shown before the marker
CTX_AFTER = 360    # chars of Edghill shown after the marker


def build_rows():
    man = Manifest.for_work(WORK)
    primary = man.data["english"]["primary"]
    prose = parse_translation(SOURCES_DIR / primary["dir"], primary["books"],
                              primary.get("chapter_marker", "number"))
    amap = json.loads((REPO_ROOT / "build" / "align" /
                       f"{WORK}_{VERSION}_gloss_map.json").read_text(encoding="utf-8"))

    # tick -> ordered window citations, per (book, chapter)
    windows = {}
    greek_text = {}
    for ch in chapter_lines():
        windows[(ch.book, ch.chapter)] = {
            w.tick: [ln.citation for ln in w.lines] for w in tick_windows(ch)}
        for ln in ch.lines:
            greek_text[(ch.book, ch.chapter, ln.citation)] = ln.text

    rows = []
    for key, rec in amap.items():
        book, chap = (int(x) for x in key.split(":"))
        text = prose.get((book, chap), "")
        gloss = load_gloss(WORK, book, chap)
        win = windows.get((book, chap), {})
        for a in rec["anchors"]:
            if a["tier"] not in REAL_TIERS:
                continue
            off = a["offset"]
            cits = win.get(a["citation"], [a["citation"]])
            greek_win = [{"cit": c, "text": greek_text.get((book, chap, c), ""),
                          "tick": c == a["citation"]} for c in cits]
            gloss_win = [{"cit": c, "text": (gloss.get(c, "") or "").strip(),
                          "tick": c == a["citation"]} for c in cits]
            before = text[max(0, off - CTX_BEFORE):off]
            after = text[off:off + CTX_AFTER]
            rows.append({
                "id": f"{key}:{a['citation']}",
                "chapter": key, "citation": a["citation"], "tier": a["tier"],
                "confidence": a["confidence"], "score": a["score"],
                "flags": a["flags"],
                "greek": greek_win, "gloss": gloss_win,
                "before": before, "before_trunc": off > CTX_BEFORE,
                "after": after, "after_trunc": off + CTX_AFTER < len(text),
            })
    rows.sort(key=lambda r: (tuple(int(x) for x in r["chapter"].split(":")),
                             bekker_key(r["citation"])))
    return rows


CSS = """
:root{--bg:#15171c;--panel:#1c1f26;--line:#2b2f39;--ink:#d6dae2;--dim:#8b93a1;
--grk:#e9dcc0;--gls:#bcd2f0;--tick:#ffe08a;--on:#5ec98f;--early:#f0a35e;--late:#e06c75;--acc:#7fb0ff}
*{box-sizing:border-box}
body{font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink);
margin:0;padding:0 0 6rem}
header{position:sticky;top:0;z-index:5;background:#11131890;backdrop-filter:blur(8px);
border-bottom:1px solid var(--line);padding:.9rem 1.4rem;display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap}
h1{font-size:1.05rem;margin:0;font-weight:600}
.prog{font:13px/1 ui-monospace,monospace;color:var(--dim)}
.prog b{color:var(--ink)}
button.exp{margin-left:auto;background:var(--acc);color:#0a0d12;border:0;border-radius:7px;
padding:.5rem .9rem;font-weight:600;cursor:pointer}
button.exp:hover{filter:brightness(1.1)}
.wrap{max-width:1180px;margin:1.4rem auto;padding:0 1.2rem;display:flex;flex-direction:column;gap:1rem}
.card{background:var(--panel);border:1px solid var(--line);border-radius:11px;overflow:hidden}
.card.done{border-color:#384150}
.card .bar{display:flex;gap:.7rem;align-items:center;padding:.55rem .9rem;border-bottom:1px solid var(--line);
background:#191c22}
.cit{font:600 14px/1 ui-monospace,monospace;color:var(--tick)}
.meta{font:12px/1 ui-monospace,monospace;color:var(--dim)}
.badge{font:11px/1 ui-monospace,monospace;padding:.2rem .45rem;border-radius:5px;background:#222732;color:var(--dim)}
.badge.uncertain{background:#3a2a1d;color:#f0b886}.badge.reliable{background:#1f3327;color:#8fd6a8}
.flag{font:11px/1 ui-monospace,monospace;color:var(--late)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
.col{padding:.7rem .9rem}
.col+.col{border-left:1px solid var(--line)}
.lab{font:11px/1 ui-monospace,monospace;letter-spacing:.04em;text-transform:uppercase;color:var(--dim);margin-bottom:.45rem}
.ln{margin:.15rem 0}
.ln .n{font:10px/1 ui-monospace,monospace;color:#5a626f;margin-right:.5rem}
.greek .t{color:var(--grk);font-size:.97rem}
.gloss .t{color:var(--gls)}
.ln.tk .t{font-weight:600}
.greek .ln.tk .t{color:#fff4d6;background:#3a3115;padding:0 3px;border-radius:3px}
.gloss .ln.tk .t{color:#dbe8ff;background:#1f2c46;padding:0 3px;border-radius:3px}
.edg{padding:.8rem .9rem;border-top:1px solid var(--line);background:#171a20}
.edg .lab{margin-bottom:.5rem}
.edg-txt{font:15px/1.6 Georgia,serif;color:#c2c8d2}
.edg-txt .b{color:#7a828f}
.mark{color:#0a0d12;background:var(--tick);font-weight:700;border-radius:3px;padding:0 4px;margin:0 2px}
.actions{display:flex;gap:.5rem;align-items:center;padding:.7rem .9rem;border-top:1px solid var(--line);flex-wrap:wrap}
.v{border:1px solid var(--line);background:#20242d;color:var(--ink);border-radius:7px;padding:.45rem .8rem;
cursor:pointer;font-weight:600;font-size:.9rem}
.v:hover{filter:brightness(1.15)}
.v[data-v=on].sel{background:var(--on);color:#08120c;border-color:var(--on)}
.v[data-v=early].sel{background:var(--early);color:#1a1206;border-color:var(--early)}
.v[data-v=late].sel{background:var(--late);color:#1a0a0c;border-color:var(--late)}
.note{flex:1;min-width:160px;background:#13161b;border:1px solid var(--line);border-radius:7px;
color:var(--ink);padding:.45rem .6rem;font:13px/1.4 inherit}
.hint{font-size:12px;color:var(--dim);max-width:1180px;margin:0 auto;padding:.2rem 1.2rem}
.legend{font-size:12.5px;color:var(--dim)}
.legend b{color:var(--ink)}
"""

JS = """
const KEY='cat_edghill_verdicts_v1';
const store=JSON.parse(localStorage.getItem(KEY)||'{}');
function count(){const n=Object.keys(store).length,t=document.querySelectorAll('.card').length;
  document.getElementById('prog').innerHTML='<b>'+n+'</b> / '+t+' reviewed';}
function paint(id){const c=document.querySelector('.card[data-id="'+CSS.escape(id)+'"]');
  if(!c)return;const v=store[id]&&store[id].verdict;
  c.querySelectorAll('.v').forEach(b=>b.classList.toggle('sel',b.dataset.v===v));
  c.classList.toggle('done',!!v);}
document.querySelectorAll('.card').forEach(c=>{
  const id=c.dataset.id;
  c.querySelectorAll('.v').forEach(b=>b.addEventListener('click',()=>{
    const cur=store[id]||{};cur.verdict=b.dataset.v;cur.citation=c.dataset.cit;
    cur.chapter=c.dataset.chap;cur.ts=new Date().toISOString();store[id]=cur;
    localStorage.setItem(KEY,JSON.stringify(store));paint(id);count();}));
  const nt=c.querySelector('.note');
  nt.addEventListener('input',()=>{const cur=store[id]||{};cur.note=nt.value;
    cur.citation=c.dataset.cit;cur.chapter=c.dataset.chap;store[id]=cur;
    localStorage.setItem(KEY,JSON.stringify(store));});
  if(store[id]&&store[id].note)nt.value=store[id].note;
  paint(id);
});
count();
document.getElementById('exp').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({work:'Cat',version:'edghill',
    exported:new Date().toISOString(),verdicts:store},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='categories-edghill-verdicts.json';a.click();});
"""


def esc(s):
    return html.escape(s or "")


def render(rows):
    cards = []
    for r in rows:
        conf = r["confidence"]
        flags = ("".join(f"<span class='flag'>⚑ {esc(f)}</span>" for f in r["flags"]))
        greek = "".join(
            f"<div class='ln {'tk' if l['tick'] else ''}'><span class='n'>{esc(l['cit'])}</span>"
            f"<span class='t'>{esc(l['text'])}</span></div>" for l in r["greek"])
        gloss = "".join(
            f"<div class='ln {'tk' if l['tick'] else ''}'><span class='n'>{esc(l['cit'])}</span>"
            f"<span class='t'>{esc(l['text'])}</span></div>" for l in r["gloss"])
        before = ("… " if r["before_trunc"] else "") + esc(r["before"])
        after = esc(r["after"]) + (" …" if r["after_trunc"] else "")
        edg = (f"<span class='b'>{before}</span><span class='mark'>▸</span>"
               f"<span>{after}</span>")
        cards.append(f"""
<div class="card" data-id="{esc(r['id'])}" data-cit="{esc(r['citation'])}" data-chap="{esc(r['chapter'])}">
  <div class="bar">
    <span class="cit">{esc(r['citation'])}</span>
    <span class="meta">ch {esc(r['chapter'])} · {esc(r['tier'])}</span>
    <span class="badge {esc(conf)}">{esc(conf)} · {r['score']}</span>
    {flags}
  </div>
  <div class="grid">
    <div class="col greek"><div class="lab">Greek window</div>{greek}</div>
    <div class="col gloss"><div class="lab">Gloss window</div>{gloss}</div>
  </div>
  <div class="edg">
    <div class="lab">Edghill — ▸ marks the placed line ({esc(r['citation'])})</div>
    <div class="edg-txt">{edg}</div>
  </div>
  <div class="actions">
    <button class="v" data-v="on">✓ Spot on</button>
    <button class="v" data-v="early">◀ Early (content is after ▸)</button>
    <button class="v" data-v="late">Late (content is before ▸) ▶</button>
    <input class="note" placeholder="note (optional)…">
  </div>
</div>""")
    head = f"""<header>
  <h1>Categories · Edghill — Bekker gloss-alignment review</h1>
  <span class="prog" id="prog"></span>
  <button class="exp" id="exp">⬇ Export JSON</button>
</header>
<p class="hint legend">Does the <b>gloss window</b> (meaning of the Greek at this tick) match the Edghill text
right at the <span class="mark">▸</span> marker? <b>Spot on</b> = yes. <b>Early</b> = the matching content
appears <i>after</i> the marker (tick placed too early). <b>Late</b> = it appears <i>before</i> the marker
(placed too late). Verdicts auto-save in this browser; hit Export when done.</p>"""
    body = "<div class='wrap'>" + "".join(cards) + "</div>"
    return (f"<!doctype html><html><head><meta charset='utf-8'>"
            f"<title>Categories · Edghill alignment review</title>"
            f"<style>{CSS}</style></head><body>{head}{body}<script>{JS}</script></body></html>")


def main():
    rows = build_rows()
    out_dir = REPO_ROOT / "alignment-results" / "edghill" / "review"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "categories-ch1-2.html"
    out.write_text(render(rows), encoding="utf-8")
    print(f"wrote {out}  ({len(rows)} ticks to review)")


if __name__ == "__main__":
    main()
