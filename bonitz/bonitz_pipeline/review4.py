"""
Four-reader review page: every flagged region with its crop at 400 dpi.

Leads with the **Opus lone-dissent** cases — regions where kraken, Genie and
LlamaParse all agree and only Opus differs.  Those are the ones that decide
whether Opus is worth its tokens as a reader: on pp.53-62 Opus stands alone 18
times against Genie's 259, so it is the most consensus-aligned reader by far,
but consensus is not the ink.  The single case checked against the page so far
(`Ζιθ28`, page 54-L) had Opus alone and Opus wrong.

    python3 -m bonitz_pipeline.review4 53-62

Writes `work/review4-<range>.html` with crops beside it.  Rules nothing; every
row is a question for John.
"""

from __future__ import annotations
import argparse
import base64
import html
import io
import json
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from PIL import Image

from .normalize import canonical, clean_opus, fold

ROOT = Path(__file__).resolve().parent.parent
COLS = ROOT / 'work/kraken400/read/cols'
READERS = ('opus', 'genie', 'llama', 'kraken')


def mark_span(line: str, start: int, length: int) -> str:
    """Escape `line`, wrapping the canonical range [start, start+length) in <mark>.

    The flag records its position in CANONICAL coordinates — whitespace
    stripped, so readers can be compared without spacing disagreements — but
    the line shown is the readable one.  `canonical()` already returns the map
    between the two; use it rather than canonicalising a character at a time,
    which cannot see the folds that consume two characters and emit one (the
    apostrophe-plus-capital breathing merge) and so drifts right of the truth.
    Without this the reader gets sixty characters of Greek and no clue which
    part is in dispute.
    """
    esc = html.escape
    base = unicodedata.normalize('NFC', line)
    _, offs = canonical(base)
    if length <= 0 or start >= len(offs):
        return esc(base)
    a = offs[start]
    end = start + length
    b = offs[end] if end < len(offs) else len(base)
    return f'{esc(base[:a])}<mark>{esc(base[a:b])}</mark>{esc(base[b:])}'


def line_offsets(page: int, col: str) -> tuple[list[int], list[str]]:
    """Canonical offset at the start of each printed line, and the lines.

    Must come from the WHOLE column's canonical map, never from summing
    per-line canonical lengths.  `canonical()` drops the hyphen at a
    hyphenated line break — it matches on `-\\n`, which a line taken on its
    own never contains — so the per-line sum runs 5-16 characters long per
    column and every estimate below the first hyphen drifts.  That put 364 of
    398 highlights on the wrong words, always early, and worse further down.
    """
    f = ROOT / f'raw/opus/page-{page:03d}-{col}.txt'
    base = unicodedata.normalize('NFC', clean_opus(f.read_text(encoding='utf-8')))
    _, offs = canonical(base)        # offs[i] = index of canonical char i in base
    lines = base.splitlines()
    starts, pos = [], 0
    for ln in lines:
        starts.append(pos)
        pos += len(ln) + 1           # +1 for the newline splitlines removed
    out, j = [], 0
    for s in starts:
        while j < len(offs) and offs[j] < s:
            j += 1
        out.append(j)
    return out, lines


_ALTO: dict[tuple[int, str], list[tuple[int, int, str]]] = {}
ALTO_NS = '{http://www.loc.gov/standards/alto/ns-v4#}'


def alto_lines(page: int, col: str) -> list[tuple[int, int, str]]:
    """(vpos, height, text) per line, from kraken's own recognition.

    Estimating a line's position by dividing the column height was wrong twice
    over — margins drift it, and an ink-projection band merges lines whose
    ascenders touch (page 54-R came out as 14 bands for 61 lines).  kraken
    already knows exactly where every line is, so ask it.
    """
    key = (page, col)
    if key not in _ALTO:
        f = ROOT / f'work/kraken400/read/alto/page-{page:03d}-{col}.xml'
        out = []
        if f.exists():
            import xml.etree.ElementTree as ET
            for tl in ET.parse(f).getroot().iter(f'{ALTO_NS}TextLine'):
                words = [s.get('CONTENT', '')
                         for s in tl.iter(f'{ALTO_NS}String')]
                out.append((int(tl.get('VPOS', 0)), int(tl.get('HEIGHT', 0)),
                            ' '.join(words)))
            out.sort()
        _ALTO[key] = out
    return _ALTO[key]


def crop(page: int, col: str, line: int, total: int, item: int,
         out: Path, want: str = '') -> str | None:
    src = COLS / f'page-{page:03d}-{col}.png'
    if not src.exists():
        return None
    im = Image.open(src)
    lines = alto_lines(page, col)
    if lines and want:
        # Match the transcription line to kraken's by text, not by index: the
        # two disagree on line COUNT (kraken segments the marginal numbers as
        # lines of their own), so index-to-index would drift down the column.
        import difflib
        w = canonical(want)[0]
        vpos, h, _ = max(lines, key=lambda t: difflib.SequenceMatcher(
            None, w, canonical(t[2])[0], autojunk=False).ratio())
        pitch = h or (im.height / max(1, total))
        y = vpos + pitch / 2
    else:
        pitch = im.height / max(1, total)
        y = (line + 0.5) * pitch
    y0, y1 = max(0, int(y - pitch * 2.0)), min(im.height, int(y + pitch * 2.0))
    out.mkdir(parents=True, exist_ok=True)
    name = f'i{item:03d}-p{page:03d}{col}-l{line + 1}.png'
    im.crop((0, y0, im.width, y1)).save(out / name)
    return f'{out.name}/{name}'


BAR = """
<div id=bar>
 <span id=count>0 / 0 decided</span>
 <button id=exp>Export verdicts</button>
 <button id=sav>Save to Mac</button>
 <span id=savmsg></span>
 <button id=nxt>Next undecided</button>
 <button id=clr>Clear all</button>
</div>
"""

SCRIPT = r"""
<script>
const KEY = "bonitz-verdicts-__TAG__-__VIEW__";
function load(){ try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
                  catch(e){ return {}; } }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(V)); } catch(e){} }
const V = load();
const items = [...document.querySelectorAll(".item")];
function paint(){
  items.forEach(el=>{
    const i = el.id.slice(2), v = V[i];
    el.classList.toggle("done", v !== undefined);
    const ch = document.getElementById("ch"+i);
    if (ch) ch.textContent = v === undefined ? ""
      : (v === "__unclear__" ? "unclear" : "\u2192 " + v);
    el.querySelectorAll("button.v").forEach(b=>
      b.classList.toggle("on", v !== undefined && b.dataset.v === v));
  });
  document.getElementById("count").textContent =
    Object.keys(V).length + " / " + items.length + " decided";
}
function set(i, v){
  if (v === null) delete V[i]; else V[i] = v;
  // Mirror onto the element too: if storage is unavailable (a sandboxed
  // preview, private browsing) the visible state must still be the truth,
  // and export reads from here rather than from V.
  const el = document.getElementById("it" + i);
  if (el) { if (v === null) delete el.dataset.verdict; else el.dataset.verdict = v; }
  save();
  paint();
  clearTimeout(window._as); window._as = setTimeout(()=>push(true), 1200);
}
document.addEventListener("click", e=>{
  const b = e.target.closest("button.v");
  if (!b) return;
  const i = b.dataset.i;
  if (b.classList.contains("other")){
    // An inline field, not prompt(). prompt() is a modal the browser is free
    // to suppress — it is blocked outright in some contexts, and on iOS it
    // covers the crop you are trying to read, which is the whole point of
    // the row. This keeps the ink visible while you type.
    let inp = b.parentElement.querySelector("input.oth");
    if (!inp){
      inp = document.createElement("input");
      inp.className = "oth"; inp.type = "text"; inp.spellcheck = false;
      inp.placeholder = "what the ink says — Enter to save, Esc to cancel";
      inp.addEventListener("keydown", ev=>{
        if (ev.key === "Enter"){ set(i, inp.value); inp.blur(); }
        else if (ev.key === "Escape"){ inp.remove(); }
      });
      b.parentElement.insertBefore(inp, b.nextSibling);
    }
    inp.value = (V[i] && V[i] !== "__unclear__") ? V[i] : "";
    inp.focus(); inp.select();
    return;
  }
  set(i, V[i] === b.dataset.v ? null : b.dataset.v);
});
function payload(){
  const rows = items.map(el=>{
    const i = el.id.slice(2);
    const v = el.dataset.verdict !== undefined ? el.dataset.verdict : V[i];
    if (v === undefined) return null;
    const h = el.querySelector("h3").textContent.replace(/\s+/g," ");
    const m = h.match(/page (\d+)(\w).*?line ~(\d+)/);
    return {item:+i, page:m?+m[1]:null, col:m?m[2]:null,
            line:m?+m[3]:null, verdict:v};
  }).filter(Boolean);
  return JSON.stringify({range:"__TAG__", view:"__VIEW__", verdicts:rows}, null, 1);
}
document.getElementById("exp").onclick = ()=>{
  const blob = new Blob([payload()], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "verdicts-__TAG__-__VIEW__.json";
  a.click();
};
async function push(quiet){
  // Posting back to the machine that served the page is the only reliable
  // way off an iPhone: navigator.clipboard needs a secure context (plain
  // http on a LAN is not one) and a file:// page gets no persistent storage.
  const msg = document.getElementById("savmsg");
  try {
    const r = await fetch("/save", {method:"POST",
      headers:{"Content-Type":"application/json"}, body:payload()});
    const j = await r.json();
    if (msg) msg.textContent = j.ok ? ("saved " + j.saved) : ("save failed: " + j.error);
  } catch(e){ if (msg && !quiet) msg.textContent = "save failed (server down?)"; }
  if (msg) setTimeout(()=>{ msg.textContent = ""; }, 2500);
}
document.getElementById("sav").onclick = ()=>push(false);
document.getElementById("nxt").onclick = ()=>{
  const el = items.find(el=>V[el.id.slice(2)] === undefined);
  if (el) el.scrollIntoView({behavior:"smooth", block:"center"});
};
document.getElementById("clr").onclick = ()=>{
  if (confirm("Clear every verdict on this page?")){
    Object.keys(V).forEach(k=>delete V[k]);
    items.forEach(el=>{ delete el.dataset.verdict; });
    save(); paint();
  }
};
items.forEach(el=>{ const i = el.id.slice(2);
  if (V[i] !== undefined) el.dataset.verdict = V[i];
  else if (el.dataset.verdict !== undefined) V[i] = el.dataset.verdict; });
paint();
</script>
"""


CSS = """
body{font:15px/1.5 -apple-system,Segoe UI,sans-serif;margin:0 auto;max-width:1100px;
padding:24px;background:#faf9f7;color:#222}
h1{font-size:22px} h2{margin-top:34px;border-bottom:2px solid #ccc;padding-bottom:4px}
.lead{color:#555}
.item{background:#fff;border:1px solid #ddd;border-radius:6px;padding:14px;margin:16px 0}
.item h3{margin:0 0 6px;font-size:15px;font-weight:600}
.cls{font-weight:400;color:#8a6d3b;background:#fcf8e3;padding:1px 7px;border-radius:9px;
font-size:12px;margin-left:8px}
.ctx{font-family:ui-serif,Georgia,serif;color:#666;font-size:14px;margin-bottom:8px;
word-break:break-word}
.ctx mark{background:#ffd54a;color:#111;padding:0 2px;border-radius:3px;
font-weight:600;box-shadow:0 0 0 1px #e0a800}
img{max-width:100%;border:1px solid #ccc;border-radius:3px;display:block}
table{border-collapse:collapse;margin-top:10px;font-family:ui-serif,Georgia,serif}
th,td{border:1px solid #ddd;padding:5px 12px;text-align:center;font-size:17px}
th{background:#f0efec;font-size:12px;font-family:-apple-system,sans-serif;
text-transform:uppercase;letter-spacing:.5px;color:#666}
td.opus{background:#fff4f4} td.kraken{background:#f2f8f2}
.verdict{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button.v{font:inherit;cursor:pointer;border:1px solid #bbb;background:#fff;
border-radius:6px;padding:4px 10px;display:flex;flex-direction:column;
align-items:center;line-height:1.25}
button.v b{font-family:ui-serif,Georgia,serif;font-size:17px;font-weight:600}
button.v span{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.4px}
button.v:hover{border-color:#777;background:#f4f4f2}
button.v.on{background:#1f7a3d;border-color:#1f7a3d;color:#fff}
button.v.on span{color:#cfe8d6}
button.other,button.skip{color:#666;font-size:13px;padding:8px 12px}
.chosen{font-family:ui-serif,Georgia,serif;font-size:14px;color:#1f7a3d;margin-left:6px}
.item.done{border-color:#1f7a3d;box-shadow:inset 3px 0 0 #1f7a3d}
#bar{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #ccc;
padding:10px 14px;margin:-24px -24px 16px;display:flex;gap:12px;align-items:center;
flex-wrap:wrap}
#bar button{font:inherit;cursor:pointer;border:1px solid #999;background:#fff;
border-radius:6px;padding:5px 12px}
#count{font-weight:600}
@media(prefers-color-scheme:dark){button.v{background:#2b2a28;border-color:#4a4846;
color:#e8e6e3}button.v:hover{background:#343230}#bar{background:#252423;
border-color:#3a3836}#bar button{background:#2b2a28;border-color:#4a4846;color:#e8e6e3}}

input.oth{font:17px/1.3 ui-serif,Georgia,serif;padding:5px 9px;border:2px solid #1f7a3d;
border-radius:6px;min-width:16ch;background:#fff;color:#111}
input.oth:focus{outline:2px solid #1f7a3d;outline-offset:1px}
@media(prefers-color-scheme:dark){input.oth{background:#1f1e1d;color:#e8e6e3}}
.nocrop{color:#999;font-style:italic}
@media(prefers-color-scheme:dark){body{background:#1b1b1a;color:#e8e6e3}
.item{background:#252423;border-color:#3a3836}th{background:#2f2e2c;color:#aaa}
th,td{border-color:#3a3836}td.opus{background:#33262a}td.kraken{background:#22301f}
.ctx,.lead{color:#9a9894}}
"""


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('pages', help='range, e.g. 53-62')
    p.add_argument('--opus-alone', action='store_true',
                   help='only the regions where Opus stands against the other '
                        'three — the set that decides whether it earns its tokens')
    p.add_argument('--compact', action='store_true',
                   help='downscale crops and encode as JPEG before inlining, so '
                        'the whole review is one file small enough to sync and '
                        'open on a phone')
    p.add_argument('--inline', action='store_true',
                   help='embed crops as data URIs so the page is one portable '
                        'file; only sane with --opus-alone (all 354 crops are 48MB)')
    args = p.parse_args(argv)
    a, _, b = args.pages.partition('-')
    lo, hi = int(a), int(b or a)
    tag = f'{lo:03d}-{hi:03d}'

    src = ROOT / f'work/flags4-{tag}.jsonl'
    if not src.exists():
        sys.exit(f'{src} missing — run batch4 {lo}-{hi} first')
    rows = [json.loads(l) for l in src.open(encoding='utf-8')]

    # classify: who stood alone?
    for r in rows:
        vals = {k: fold(r.get(k) or '') for k in READERS}
        t = Counter(vals.values())
        r['_alone'] = next((k for k, v in vals.items()
                            if t[v] == 1 and max(t.values()) == 3), None)

    flags = [r for r in rows if r['flag']]
    lonely = [r for r in flags if r['_alone'] == 'opus']
    # Opus can stand alone without the region being flagged (majority-spine
    # covers the reverse case), so sweep unflagged rows too.
    lonely += [r for r in rows if not r['flag'] and r['_alone'] == 'opus']
    others = [r for r in flags if r['_alone'] != 'opus']

    crops = ROOT / f'work/review4_crops_{tag}'
    offs_cache: dict[tuple[int, str], tuple[list[int], list[str]]] = {}
    esc = html.escape

    def render(r: dict, item: int) -> str:
        key = (r['page'], r['col'])
        if key not in offs_cache:
            offs_cache[key] = line_offsets(*key)
        offs, lines = offs_cache[key]
        # spine_off is absolute across the batch; make it column-relative by
        # subtracting the offset of the column's first flag-free anchor.
        rel = r['spine_off'] - r.get('_col_start', 0)
        line = max(0, sum(1 for o in offs if o <= rel) - 1)
        img = crop(r['page'], r['col'], line, len(lines), item, crops,
                   want=lines[line] if line < len(lines) else '')
        if img and args.inline:
            f = crops / Path(img).name
            if args.compact:
                # 354 PNGs at full column width are 48MB and sync as 354
                # separate files; one JPEG-compressed page is a single upload.
                im = Image.open(f).convert('L')
                if im.width > 1000:
                    im = im.resize((1000, round(im.height * 1000 / im.width)),
                                   Image.LANCZOS)
                buf = io.BytesIO()
                im.save(buf, 'JPEG', quality=72, optimize=True)
                img = ('data:image/jpeg;base64,'
                       + base64.b64encode(buf.getvalue()).decode())
            else:
                img = ('data:image/png;base64,'
                       + base64.b64encode(f.read_bytes()).decode())
        cells = ''.join(
            f'<td class="{k}">{esc(r.get(k) or "—")}</td>' for k in READERS)
        # One button per DISTINCT reading, labelled with who proposed it, so a
        # verdict is a single tap rather than a transcription.  Readings that
        # differ only in a diacritic still get their own button — the whole
        # point of this edition is that the diacritic is the data.
        seen: dict[str, list[str]] = {}
        for k in READERS:
            v = r.get(k)
            if v is not None:
                seen.setdefault(v, []).append(k)
        btns = ''.join(
            f'<button class=v data-i="{item}" data-v="{esc(v)}">'
            f'<b>{esc(v) if v.strip() else "∅"}</b>'
            f'<span>{"+".join(who)}</span></button>'
            for v, who in seen.items())
        return f"""
<div class=item id="it{item}">
 <h3>{item}. page {r['page']}{r['col']} &middot; line ~{line + 1}
     <span class=cls>{esc(r['cls'])}</span></h3>
 <div class=ctx>{mark_span(lines[line], rel - offs[line], len(r['opus'] or ''))
                 if line < len(lines) else esc(r['ctx'])}</div>
 {f'<img loading=lazy decoding=async src="{img}">' if img
   else '<p class=nocrop>no crop</p>'}
 <table><tr><th>Opus</th><th>Genie</th><th>Llama</th><th>kraken</th></tr>
 <tr>{cells}</tr></table>
 <div class=verdict>
  {btns}
  <button class="v other" data-i="{item}">other&hellip;</button>
  <button class="v skip" data-i="{item}" data-v="__unclear__">unclear</button>
  <span class=chosen id="ch{item}"></span>
 </div>
</div>"""

    # Each column's true start in the spine, rebuilt exactly as batch4 builds
    # it: cumulative canonical length over every column in reading order.
    #
    # Deriving it from the column's first flagged region — as this did at
    # first — is wrong.  Regions exist only where readers disagree, so the
    # first one sits an arbitrary distance into the column, and every line
    # estimate below it drifts by that much.  It produced crops of blank paper
    # past the foot of the column.
    starts: dict[tuple[int, str], int] = {}
    pos = 0
    for pg in range(lo, hi + 1):
        for col in ('L', 'R'):
            f = ROOT / f'raw/opus/page-{pg:03d}-{col}.txt'
            if not f.exists():
                continue
            starts[(pg, col)] = pos
            pos += len(canonical(clean_opus(f.read_text(encoding='utf-8')))[0])
    for r in rows:
        r['_col_start'] = starts.get((r['page'], r['col']), 0)

    n = 0
    body = ['<h1>Four-reader review, pages %d&ndash;%d</h1>' % (lo, hi)]
    body.append(f'<p class=lead>{len(rows)} regions, {len(flags)} flagged. '
                f'Opus stands alone {len(lonely)} times; Genie '
                f'{sum(1 for r in rows if r["_alone"] == "genie")}, Llama '
                f'{sum(1 for r in rows if r["_alone"] == "llama")}, kraken '
                f'{sum(1 for r in rows if r["_alone"] == "kraken")}.</p>')
    body.append('<h2>Opus alone against the other three</h2>'
                '<p class=lead>The question these answer: is Opus worth its '
                'tokens as a reader? If the ink agrees with Opus here, keep it '
                'reading. If it agrees with the other three, Opus is paying to '
                'be outvoted.</p>')
    for r in lonely:
        n += 1
        body.append(render(r, n))
    if not args.opus_alone:
        body.append('<h2>Everything else flagged</h2>')
        for r in others:
            n += 1
            body.append(render(r, n))

    css = CSS
    view = ('opus-alone' if args.opus_alone else
            'full' if not args.compact else 'full-mobile')
    suffix = ('-opus-alone' if args.opus_alone else
              '-mobile' if args.compact else '')
    out = ROOT / f'work/review4-{tag}{suffix}.html'
    out.write_text(
        f'<!doctype html><meta charset=utf-8><title>Four-reader review '
        f'{tag}</title><style>{css}</style>'
        + BAR + '\n'.join(body)
        + SCRIPT.replace('__TAG__', tag).replace('__VIEW__', view),
        encoding='utf-8')
    print(f'{len(rows)} regions, {len(flags)} flagged, '
          f'{len(lonely)} Opus-alone -> {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
