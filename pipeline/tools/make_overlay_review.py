"""Four-column review page for a secondary translation's Bekker gutter:
Greek | prior gloss | the translation under review | a reference translation.

Built for DA/Wallace, whose ticks were placed by tools/ugarit_align.py rather
than the gloss pipeline. Smith is shown beside it as a reference placement — NOT
as gold; it is machine-verified too, and John's first pass marked it wrong often
enough to be worth judging separately. Hence two verdict rows per card.

Same affordances as generate_review_html.py (Spot on / Early / Late, note box,
localStorage autosave, one-click JSON export) plus keyboard entry: 1/2/3 for the
translation under review, 8/9/0 for the reference.

A tick is correct when its marker sits at the BULK of that Bekker line's content
(John's rule, 2026-07-31), not at whatever renders its first Greek word.

**Commit the exported JSON.** Verdicts live in browser storage; an export that
never lands in the repo leaves no trace and the pass has to be redone. That is
why no human verdict existed anywhere in this repo before 2026-07-31 despite the
docs implying otherwise — see docs/alignment-status.md.

Usage (from pipeline/):
    uv run python tools/make_overlay_review.py DA 3 --batch 40
    → alignment-results/<vid>/review/<work>-<vid>-vs-<ref>.html
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WINDOW = 340          # chars of prose shown either side of the marker


def esc(s):
    return html.escape(s or "")


def load(work: str, books: int):
    """Chapters carrying Greek, the reference prose + its real ticks, and the
    overlay prose + its real ticks. Both tick sets come from the emitted dist,
    so the page always shows what the reader actually renders."""
    chapters, cur, ov_txt, ov_ticks = [], None, {}, {}
    for b in range(1, books + 1):
        p = REPO / f"build/dist/{work}/book-{b:02d}.json"
        if not p.exists():
            continue
        for seg in json.loads(p.read_text())["segments"]:
            col = seg["column"]
            starts = sorted(seg.get("chapterStarts", []), key=lambda c: c["beforeLine"])
            eng = (seg.get("english") or {}).get("text", "")
            cuts = [(c["beforeLine"], c["engOffset"], c["chapter"]) for c in starts]
            bounds = cuts if (cuts and cuts[0][0] <= 1 and cuts[0][1] == 0) else [(0, 0, None)] + cuts
            for i, (bl, eo, ch) in enumerate(bounds):
                nxt = bounds[i + 1] if i + 1 < len(bounds) else None
                lines = [l for l in seg.get("greek", [])
                         if l["n"] >= bl and (nxt is None or l["n"] < nxt[0])]
                if ch is not None:
                    cur = {"key": f"{b}.{ch}", "book": b, "chapter": ch,
                           "greek": [], "ref": "", "refticks": {}}
                    chapters.append(cur)
                if cur is None:
                    continue
                base = len(cur["ref"])
                cur["greek"].append((col, lines))
                cur["ref"] += eng[eo:(nxt[1] if nxt else len(eng))]
                for t in (seg.get("english") or {}).get("bekker") or []:
                    if t.get("real") and eo <= t["offset"] < (nxt[1] if nxt else len(eng)):
                        cur["refticks"][f"{col}{t['n']}"] = base + t["offset"] - eo
            for pc in seg.get("secondary") or seg.get("ross") or []:
                k = f"{b}.{pc['chapter']}"
                base = len(ov_txt.get(k, ""))
                ov_txt[k] = ov_txt.get(k, "") + pc["text"]
                for t in pc.get("bekker") or []:
                    if t.get("real"):
                        ov_ticks.setdefault(k, {})[f"{col}{t['n']}"] = base + t["offset"]
    for c in chapters:
        c["ov"] = ov_txt.get(c["key"], "")
        c["ovticks"] = ov_ticks.get(c["key"], {})
    return chapters


def window(text, off):
    a, b = max(0, off - WINDOW), min(len(text), off + WINDOW)
    lead = "… " if a > 0 else ""
    tail = " …" if b < len(text) else ""
    return (f'{lead}<span class="b">{esc(text[a:off])}</span>'
            f'<span class="mark">▸</span>{esc(text[off:b])}{tail}')


def build_rows(chapters, glossdir, batch):
    """Every tick present in BOTH translations, strided evenly across the range
    of their disagreement so the batch mirrors the real spread — the tails are
    not over-weighted, and the worst few are appended because they are the most
    likely to be outright wrong. Disagreement does NOT indicate correctness (it
    largely measures ordinary translator divergence); it is only a sampling key."""
    cands = []
    for ch in chapters:
        if not ch["ov"] or not ch["ref"]:
            continue
        for cit, ooff in ch["ovticks"].items():
            roff = ch["refticks"].get(cit)
            if roff is None:
                continue
            cands.append({"ch": ch, "cit": cit,
                          "delta": abs(ooff / len(ch["ov"]) - roff / len(ch["ref"]))})
    if not cands:
        return []
    cands.sort(key=lambda c: c["delta"])
    n = len(cands)
    if batch >= n:
        picks = cands
    else:
        step = max(1, batch - 4)
        picks = [cands[round(i * (n - 1) / (step - 1 or 1))] for i in range(step)] + cands[-4:]

    seen, rows = set(), []
    for c in picks:
        if c["cit"] in seen:
            continue
        seen.add(c["cit"])
        ch = c["ch"]
        m = re.match(r"^(\d+[ab])(\d+)$", c["cit"])
        col, line = m.group(1), int(m.group(2))
        gp = glossdir / f"{ch['book']}-{ch['chapter']}.json"
        gl = json.loads(gp.read_text()) if gp.exists() else {}
        span = [(cc, nn, t) for cc, lines in ch["greek"] for nn, t in
                [(l["n"], l["text"]) for l in lines] if cc == col and line <= nn < line + 5]
        rows.append({
            "cit": c["cit"], "chapter": ch["key"], "delta": c["delta"], "line": line,
            "greek": span,
            "gloss": [(nn, gl.get(f"{col}{nn}", "")) for _, nn, _ in span],
            "ov": window(ch["ov"], ch["ovticks"][c["cit"]]),
            "ref": window(ch["ref"], ch["refticks"][c["cit"]]),
        })
    rows.sort(key=lambda r: (int(r["chapter"].split(".")[0]), r["cit"]))
    return rows


CSS = """
:root{--bg:#0e1116;--panel:#151920;--line:#252b35;--ink:#dfe4ec;--dim:#8b94a3;
--grk:#e8d9a8;--gls:#a8c0e8;--tick:#e0a94a;--on:#6fd48b;--early:#e8b45c;--late:#e8767c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif}
header{position:sticky;top:0;z-index:5;background:#0e1116ee;backdrop-filter:blur(8px);
border-bottom:1px solid var(--line);padding:.8rem 1.2rem}
h1{margin:0 0 .25rem;font-size:1.05rem}
.sub{font-size:12.5px;color:var(--dim);max-width:1400px}
.wrap{max-width:1400px;margin:0 auto;padding:1rem 1.2rem;display:flex;flex-direction:column;gap:1rem}
.card{background:var(--panel);border:1px solid var(--line);border-radius:11px;overflow:hidden}
.card.done{border-color:#384150}
.bar{display:flex;gap:.7rem;align-items:center;padding:.55rem .9rem;
border-bottom:1px solid var(--line);background:#191c22}
.cit{font:600 14px/1 ui-monospace,monospace;color:var(--tick)}
.meta{font:12px/1 ui-monospace,monospace;color:var(--dim)}
.badge{font:11px/1 ui-monospace,monospace;padding:.2rem .45rem;border-radius:5px;
background:#222732;color:var(--dim)}
.grid{display:grid;grid-template-columns:1.05fr 1.05fr 1.45fr 1.45fr;gap:0}
.col{padding:.7rem .9rem;min-width:0}
.col+.col{border-left:1px solid var(--line)}
.lab{font:11px/1 ui-monospace,monospace;letter-spacing:.04em;text-transform:uppercase;
color:var(--dim);margin-bottom:.45rem}
.ln{margin:.15rem 0}
.ln .n{font:10px/1 ui-monospace,monospace;color:#5a626f;margin-right:.5rem}
.greek .t{color:var(--grk);font-size:.97rem}
.gloss .t{color:var(--gls);font-size:.9rem}
.greek .ln.tk .t{color:#fff4d6;background:#3a3115;padding:0 3px;border-radius:3px}
.gloss .ln.tk .t{color:#dbe8ff;background:#1f2c46;padding:0 3px;border-radius:3px}
.nogloss{font:11.5px/1.4 ui-monospace,monospace;color:#c99a5e;background:#2a2015;
border-radius:5px;padding:.35rem .5rem;margin-bottom:.4rem}
.prose .p{font:14.5px/1.62 Georgia,serif;color:#c2c8d2}
.prose .b{color:#79808d}
.mark{color:#0a0d12;background:var(--tick);font-weight:700;border-radius:3px;padding:0 4px;margin:0 2px}
.actions{display:flex;gap:.5rem;align-items:center;padding:.5rem .9rem;
border-top:1px solid var(--line);flex-wrap:wrap}
.actions.set{background:#161b16}
.who{font:11px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.05em;
width:74px;color:var(--dim)}
.v{border:1px solid var(--line);background:#20242d;color:var(--ink);border-radius:7px;
padding:.45rem .8rem;cursor:pointer;font-weight:600;font-size:.9rem}
.v:hover{filter:brightness(1.15)}
.v[data-v=on].sel{background:var(--on);color:#08120c;border-color:var(--on)}
.v[data-v=early].sel{background:var(--early);color:#1a1206;border-color:var(--early)}
.v[data-v=late].sel{background:var(--late);color:#1a0a0c;border-color:var(--late)}
.note{flex:1;min-width:160px;background:#13161b;border:1px solid var(--line);
border-radius:7px;color:var(--ink);padding:.45rem .6rem;font:13px/1.4 inherit}
.exp{border:1px solid var(--line);background:#20242d;color:var(--ink);border-radius:7px;
padding:.45rem .8rem;cursor:pointer;font-weight:600}
#prog{font:12px/1 ui-monospace,monospace;color:var(--dim)}
@media(max-width:1100px){.grid{grid-template-columns:1fr 1fr}}
"""

JS = """
const KEY='%KEY%';
const store=JSON.parse(localStorage.getItem(KEY)||'{}');
const rec=id=>store[id]||(store[id]={});
const save=()=>localStorage.setItem(KEY,JSON.stringify(store));
function count(){const cards=[...document.querySelectorAll('.card')];
  const done=cards.filter(c=>{const r=store[c.dataset.id]||{};return r.target&&r.reference;}).length;
  const part=cards.filter(c=>{const r=store[c.dataset.id]||{};
    return (r.target||r.reference)&&!(r.target&&r.reference);}).length;
  document.getElementById('prog').innerHTML='<b>'+done+'</b> / '+cards.length+
    ' complete'+(part?' · '+part+' partial':'');}
function paint(id){const c=document.querySelector('.card[data-id="'+CSS.escape(id)+'"]');
  if(!c)return;const r=store[id]||{};
  c.querySelectorAll('.actions').forEach(a=>{const v=r[a.dataset.who];
    a.querySelectorAll('.v').forEach(b=>b.classList.toggle('sel',b.dataset.v===v));
    a.classList.toggle('set',!!v);});
  c.classList.toggle('done',!!(r.target&&r.reference));}
document.querySelectorAll('.card').forEach(c=>{const id=c.dataset.id;
  c.querySelectorAll('.actions').forEach(a=>{const who=a.dataset.who;
    a.querySelectorAll('.v').forEach(b=>b.addEventListener('click',()=>{
      const r=rec(id);r[who]=r[who]===b.dataset.v?undefined:b.dataset.v;
      r.citation=c.dataset.cit;r.chapter=c.dataset.chap;r.ts=new Date().toISOString();
      save();paint(id);count();}));});
  const nt=c.querySelector('.note');
  nt.addEventListener('input',()=>{const r=rec(id);r.note=nt.value;
    r.citation=c.dataset.cit;r.chapter=c.dataset.chap;save();});
  if(store[id]&&store[id].note)nt.value=store[id].note;paint(id);});
count();
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;
  const m={'1':['target','on'],'2':['target','early'],'3':['target','late'],
           '8':['reference','on'],'9':['reference','early'],'0':['reference','late']}[e.key];
  if(!m)return;
  const c=[...document.querySelectorAll('.card')].find(x=>{
    const b=x.getBoundingClientRect();return b.top>-b.height/2;});
  if(c){const r=rec(c.dataset.id);r[m[0]]=m[1];r.citation=c.dataset.cit;
    r.chapter=c.dataset.chap;r.ts=new Date().toISOString();save();paint(c.dataset.id);count();}});
document.getElementById('exp').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({work:'%WORK%',target:'%TGT%',reference:'%REF%',
    rule:'a tick pegs to the BULK of its Bekker line, not its first Greek word',
    exported:new Date().toISOString(),verdicts:store},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='%WORK%-%TGT%-verdicts.json';a.click();});
"""


def render(rows, work, tgt, ref, total):
    cards = []
    for r in rows:
        gs = "".join(
            f'<div class="ln{" tk" if nn == r["line"] else ""}"><span class="n">{nn}</span>'
            f'<span class="t">{esc(t)}</span></div>' for nn, t in r["gloss"] if t)
        if not any(nn == r["line"] and t for nn, t in r["gloss"]):
            gs = (f'<div class="nogloss">no gloss keyed to line {r["line"]} — glosses '
                  f'cover line-groups, so the rows below are neighbouring lines</div>') + gs
        gk = "".join(
            f'<div class="ln{" tk" if nn == r["line"] else ""}"><span class="n">{nn}</span>'
            f'<span class="t">{esc(t)}</span></div>' for _, nn, t in r["greek"])
        cards.append(f"""
<div class="card" data-id="{r['cit']}" data-cit="{r['cit']}" data-chap="{r['chapter']}">
  <div class="bar"><span class="cit">{r['cit']}</span>
    <span class="meta">{work} {r['chapter']}</span>
    <span class="badge">Δ {r['delta']*100:.1f}% of chapter</span></div>
  <div class="grid">
    <div class="col greek"><div class="lab">Greek</div>{gk}</div>
    <div class="col gloss"><div class="lab">Prior gloss</div>{gs or '<i>no gloss</i>'}</div>
    <div class="col prose"><div class="lab">{esc(tgt)} — under review</div><div class="p">{r['ov']}</div></div>
    <div class="col prose"><div class="lab">{esc(ref)} — reference</div><div class="p">{r['ref']}</div></div>
  </div>
  <div class="actions" data-who="target"><span class="who">{esc(tgt)}</span>
    <button class="v" data-v="on">✓ Spot on</button>
    <button class="v" data-v="early">◀ Early</button>
    <button class="v" data-v="late">Late ▶</button></div>
  <div class="actions" data-who="reference"><span class="who">{esc(ref)}</span>
    <button class="v" data-v="on">✓ Spot on</button>
    <button class="v" data-v="early">◀ Early</button>
    <button class="v" data-v="late">Late ▶</button>
    <input class="note" placeholder="note (only when the buttons can't say it)…"></div>
</div>""")
    js = (JS.replace("%KEY%", f"{work}_{tgt}_review_v2".lower())
            .replace("%WORK%", work).replace("%TGT%", tgt).replace("%REF%", ref))
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{work} — {esc(tgt)} tick review</title><style>{CSS}</style></head><body>
<header><h1>{work} — {esc(tgt)} tick review <span id="prog"></span></h1>
<div class="sub">Judge <b>each</b> column independently. A tick is right when its ▸ sits at the
<b>bulk of that Bekker line's content</b>, not at whatever renders its first Greek word.
<b>{esc(ref)} is not gold</b> — it is the gloss pipeline's machine placement and is wrong
often enough to be worth marking. Keys: <b>1/2/3</b> = {esc(tgt)} on/early/late,
<b>8/9/0</b> = {esc(ref)}. <b>Δ</b> is only how far the two ticks sit apart — it does
<i>not</i> indicate correctness. {len(rows)} of {total} anchors, evenly strided.
<button class="exp" id="exp" style="margin-left:.6rem">⬇ Export JSON</button>
<br><b>Commit the export</b> — verdicts live in browser storage and vanish otherwise.
</div></header>
<div class="wrap">{''.join(cards)}</div><script>{js}</script></body></html>"""


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("work")
    ap.add_argument("books", type=int)
    ap.add_argument("--target", default="Wallace", help="label for the translation under review")
    ap.add_argument("--reference", default="Smith", help="label for the reference translation")
    ap.add_argument("--vid", default="wallace", help="alignment-results/<vid>/ subdir")
    ap.add_argument("--batch", type=int, default=40)
    ap.add_argument("--glossdir", default=None,
                    help="dir of per-chapter gloss JSON (default alignment-results/smith/glosses/<work>)")
    args = ap.parse_args()

    glossdir = Path(args.glossdir) if args.glossdir else \
        REPO / f"alignment-results/smith/glosses/{args.work}"
    chapters = load(args.work, args.books)
    total = sum(len(c["ovticks"]) for c in chapters)
    rows = build_rows(chapters, glossdir, args.batch)
    if not rows:
        raise SystemExit(f"{args.work}: no ticks present in both translations — nothing to review")

    dest = REPO / f"alignment-results/{args.vid}/review"
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / f"{args.work.lower()}-{args.target.lower()}-vs-{args.reference.lower()}.html"
    out.write_text(render(rows, args.work, args.target, args.reference, total), encoding="utf-8")
    print(f"wrote {out.relative_to(REPO)}  ({len(rows)} of {total} anchors)")


if __name__ == "__main__":
    main()
