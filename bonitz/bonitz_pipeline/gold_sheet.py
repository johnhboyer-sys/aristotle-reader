"""
Build a hand-keying sheet for a Bonitz column.

    python3 -m bonitz_pipeline.gold_sheet page-042-R page-037-L

Writes `work/kraken/gold/<column>.html`, one printed line per row: the line's
own crop, cut from the 600 PPI column at the baseline kraken found, and a box
holding the current transcription to check it against.  Export writes a plain
text file in exactly the shape of `work/reconciled/<column>.txt`.

`--blind` leaves the boxes empty instead.  That mode makes an independent
yardstick — the corpus was reconciled from Opus, LlamaParse and Genie, so
scoring any of them against it measures agreement, not accuracy — but it is
expensive and it is not free of error.  Measured on the first fifteen lines of
page-042-R, blind keying found **no** corpus errors and introduced four of its
own, at 0.6% of characters: `ἀλȣ́μενος` for `ἀλύμενος`, a medial for a final
sigma, a dropped stop, and `μιγνθμένων` for `μιγνυμένων` (the Greek layout puts
θ on the `u` key and υ on `y`).  Auditing a filled box cannot make that class
of error at all, so it is the better use of a reader's hour.  Corpus errors are
better found by the model's disagreements — it caught a spliced `ἑκατέρȣ` on
page-052-R that four readers and a review pass had all missed.

Diplomatic rule, as everywhere else in this project: record what the printer
set, errors included.  A correction is legitimate only when it moves toward
the ink.
"""

from __future__ import annotations
import argparse
import base64
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from .kraken_corpus import ROOT, WORK, pair_column


def _esc(s: str) -> str:
    return (s.replace('&', '&amp;').replace('"', '&quot;')
             .replace('<', '&lt;').replace('>', '&gt;'))

PAD = 14          # pixels of headroom above and below the polygon

# (what the button inserts, what it shows, its tooltip).  Glyphs the keyboard
# in use cannot reach — which includes Latin a and b, because on the Greek
# layout those keys give alpha and beta and a Bekker reference comes out
# `1456β27`.  They insert plain Latin letters: the corpus records the raised
# column letters as plain a and b, 2,830 and 2,814 of them, with no
# superscript codepoint anywhere in it.
PALETTE: list[tuple[str, str, str]] = [
    ('ȣ', 'ȣ', 'ou-ligature'),
    ('ϗ', 'ϗ', 'kai'),
    ('̀', '◌̀', 'grave'),
    ('́', '◌́', 'acute'),
    ('͂', '◌͂', 'perispomeni'),
    ('̓', '◌̓', 'smooth breathing'),
    ('̔', '◌̔', 'rough breathing'),
    ('ͅ', '◌ͅ', 'iota subscript'),
    ('a', 'a', 'Bekker column a — Latin a, not alpha'),
    ('b', 'b', 'Bekker column b — Latin b, not beta'),
    ('—', '—', 'em dash'),
    ('’', '’', 'apostrophe'),
    ('ϛ', 'ϛ', 'stigma'),
]


def line_crops(column: str) -> list[tuple[int, str]]:
    """(printed line number, data URI) for every line of the column.

    Masked to the line's own polygon.  A plain rectangle would carry the
    descenders of the line above into the crop, and a keyer glancing down the
    page could key the ghost instead of the line.
    """
    rep = pair_column(column)
    im = Image.open(WORK / 'cols' / f'{column}.png').convert('L')
    out = []
    for i, line in enumerate(rep['kept_lines'], start=1):
        poly = _poly(line)
        mask = Image.new('L', im.size, 0)
        ImageDraw.Draw(mask).polygon(poly, fill=255)
        clean = Image.new('L', im.size, 255)
        clean.paste(im, mask=mask)
        ys = [y for _, y in poly]
        box = (0, max(0, min(ys) - PAD), im.width, min(im.height, max(ys) + PAD))
        buf = io.BytesIO()
        clean.crop(box).save(buf, format='PNG', optimize=True)
        out.append((i, 'data:image/png;base64,'
                    + base64.b64encode(buf.getvalue()).decode()))
    return out


def _poly(line: dict) -> list[tuple[int, int]]:
    from xml.etree import ElementTree as ET
    from .kraken_corpus import NS, _pts
    return _pts(line['el'].find('p:Coords', NS)) or [(0, int(line['y']))]


def prefill_lines(column: str) -> list[str]:
    """The corpus reading of each line, in John's Bekker convention."""
    from .kraken_corpus import BEKKER_SPACE, gt_lines
    return [BEKKER_SPACE.sub('', t) for t in gt_lines(column)]


def disputed(column: str) -> dict[int, list[str]]:
    """Line number -> what each reader read, where the three disagreed.

    The flag files carry `spine_off`, an offset into the whitespace-free
    canonical stream, so the offsets `canonical` returns are what turn a flag
    back into a line.
    """
    path = ROOT / 'work' / 'flags-by-col' / f'{column}.json'
    if not path.exists():
        return {}
    from .normalize import canonical
    # `spine_off` indexes the spine of a whole batch, not of this column, so
    # it cannot be used here.  Each flag carries `ctx` instead — canonical
    # text either side of the disagreement — and that can be located directly
    # in the column's own canonical stream.
    lines = (ROOT / 'work' / 'reconciled' / f'{column}.txt') \
        .read_text(encoding='utf-8').splitlines()
    spans, stream = [], ''
    for n, line in enumerate(lines, start=1):
        c, _ = canonical(line)
        spans.append((len(stream), len(stream) + len(c), n))
        stream += c

    out: dict[int, list[dict]] = {}
    for f in json.loads(path.read_text(encoding='utf-8')):
        ctx = f.get('ctx') or ''
        probe = ctx[len(ctx) // 2 - 8:len(ctx) // 2 + 8] or ctx
        at = stream.find(probe)
        if at < 0:
            continue
        hit = next(((s, n) for s, e, n in spans if s <= at < e), None)
        if not hit:
            continue
        start, line = hit
        # Where the flag sits in the printed line, so the reader is not left
        # hunting for `ȣσινὄνȣ` in `φρίττȣσιν ὄνȣ` — the flag strings are
        # canonical, with the spaces taken out.
        _, offs = canonical(lines[line - 1])
        lo = at - start + len(probe) // 2
        width = max(len(str(f.get(k) or '')) for k in ('opus', 'genie', 'llama'))
        a = offs[max(0, min(lo - width // 2, len(offs) - 1))]
        b = offs[max(0, min(lo + (width + 1) // 2, len(offs) - 1))] + 1
        # Widen to whole words.  A reader hunting for `ȣσινὄνȣ` in
        # `φρίττȣσιν ὄνȣ` is hunting for something that was never printed.
        src = lines[line - 1]
        while a > 0 and not src[a - 1].isspace():
            a -= 1
        while b < len(src) and not src[b].isspace():
            b += 1
        out.setdefault(line, []).append({
            'readers': f"Opus {f.get('opus','—')} · Genie {f.get('genie','—')} "
                       f"· Llama {f.get('llama','—')}",
            'word': src[a:b],
            'span': [a, b],
        })
    return out


def lexicon() -> list[str]:
    """Every Greek word form attested in the reconciled corpus.

    The check exists to catch typing, not to second-guess the transcription:
    on the Greek layout `u` gives θ where `y` gives υ, which turns
    `μιγνυμένων` into `μιγνθμένων`, and an unshifted breathing key turns a
    rough into a smooth.  So the column being read counts towards the lexicon
    — leaving it out flags its own hapax legomena, and `ἀλύμενος` warning that
    it is not a word teaches the reader to ignore the warnings.
    """
    import re as _re
    words: set[str] = set()
    for p in sorted((ROOT / 'work' / 'reconciled').glob('page-*.txt')):
        for w in _re.findall(r'[Ͱ-Ͽἀ-῿̀-ͯȣ]+',
                             p.read_text(encoding='utf-8')):
            if len(w) > 2:
                words.add(w)
    return sorted(words)


def build(column: str, out_dir: Path, prefill: bool = True) -> Path:
    crops = line_crops(column)
    text = prefill_lines(column) if prefill else [''] * len(crops)
    marks = disputed(column) if prefill else {}
    rows = []
    for n, uri in crops:
        v = text[n - 1] if n <= len(text) else ''
        hits = marks.get(n, [])
        tip = ' — '.join(f"{h['word']}: {h['readers']}" for h in hits)
        spans = json.dumps([h['span'] for h in hits])
        badge = (f'<button type=button class=dispute '
                 f'data-readers="{_esc(tip)}" '
                 f'title="what each reader read">{len(hits)}</button>'
                 if hits else '')
        # Print damage is neither a reading nor a printer's error: the type was
        # set right and the impression failed.  Marked lines leave the training
        # corpus — a line teaching that a blank is `ει` teaches invention — and
        # leave the error count, which they otherwise inflate.
        dmg = (f'<button type=button class=dmg data-n="{n}" '
               f'title="print damage — the impression failed here">⚑</button>')
        tick = (f'<input type=checkbox class=tick data-n="{n}" '
                f'title="done — Enter ticks it too">')
        rows.append(
            f'<div class=row><div class=n>{n}{badge}{tick}{dmg}</div>'
            f'<div class=ink><img src="{uri}" alt="line {n}"></div>'
            # the coloured mirror sits directly under the ink, so the eye
            # compares print to reading before it reaches the editable box
            f'<div class=mirror></div>'
            f'<input class=key id="l{n}" data-n="{n}" spellcheck=false '
            f'autocomplete=off value="{_esc(v)}" data-orig="{_esc(v)}" '
            f'data-spans="{_esc(spans)}">'
            f'</div>')
    rows = '\n'.join(rows)
    keys = ''.join(
        f'<button type=button data-ch="{ch}" title="{title}">{label}</button>'
        for ch, label, title in PALETTE)

    html = _TEMPLATE.replace('%%COLUMN%%', column) \
                    .replace('%%COUNT%%', str(len(crops))) \
                    .replace('%%ROWS%%', rows) \
                    .replace('%%KEYS%%', keys) \
                    .replace('%%MODE%%', 'audit' if prefill else 'blind') \
                    .replace('%%HEADING%%',
                             'check what the printer set' if prefill
                             else 'key what the printer set') \
                    .replace('%%INTRO%%', _AUDIT_INTRO if prefill else _BLIND_INTRO) \
                    .replace('%%LEXICON%%', json.dumps(lexicon(),
                                                       ensure_ascii=False))
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / f'{column}.html'
    dst.write_text(html, encoding='utf-8')
    return dst


_BLIND_INTRO = """One box per printed line, keyed from the ink alone."""

_AUDIT_INTRO = """Each box holds the current transcription. Read the line
    against it and correct only what the ink contradicts; Enter accepts a line
    and moves on. Amber badges mark where the three readers disagreed — hover
    for what each read."""

_TEMPLATE = """<!doctype html>
<html lang=en><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Key %%COLUMN%% — Bonitz gold</title>
<style>
 :root { color-scheme: light dark; }
 body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 0;
        padding: 1rem 1rem 6rem; }
 header { position: sticky; top: 0; z-index: 3; padding: .6rem 0;
          background: Canvas; border-bottom: 1px solid color-mix(in srgb, CanvasText 20%, transparent); }
 h1 { font-size: 1.05rem; margin: 0 0 .3rem; }
 p.note { margin: .3rem 0; opacity: .75; font-size: .85rem; max-width: 62ch; }
 .keys { margin-top: .4rem; display: flex; flex-wrap: wrap; gap: .25rem; }
 .keys button { font-size: 1rem; padding: .2rem .5rem; min-width: 2rem;
                border: 1px solid color-mix(in srgb, CanvasText 30%, transparent);
                border-radius: 4px; background: Canvas; color: CanvasText; cursor: pointer; }
 .keys button:hover { background: color-mix(in srgb, CanvasText 10%, Canvas); }
 .row { display: grid; grid-template-columns: 3.4rem 1fr; gap: .2rem .5rem;
        padding: .5rem 0; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
 .n { grid-row: span 2; text-align: right; opacity: .5; font-variant-numeric: tabular-nums; padding-top: .4rem; }
 .tick { display: block; margin: .35rem 0 0 auto; width: 1.05rem; height: 1.05rem;
         accent-color: #2e7d32; cursor: pointer; }
 .dmg { display: block; margin: .3rem 0 0 auto; border: 0; background: none;
        font-size: .9rem; line-height: 1; padding: .1rem .2rem; cursor: pointer;
        opacity: .25; color: CanvasText; }
 .dmg:hover { opacity: .7; }
 .row.damaged .dmg { opacity: 1; color: #c62828; }
 .row.damaged { background: color-mix(in srgb, #c62828 7%, transparent); }
 .ink { overflow-x: auto; }
 .ink img { display: block; max-width: none; height: var(--ink-h, 46px);
            image-rendering: -webkit-optimize-contrast; cursor: zoom-in; }
 .ink img.big { height: calc(var(--ink-h, 46px) * 2.4); cursor: zoom-out; }
 input.key { font: var(--key-f, 19px)/1.5 "GFS Didot", "New Athena Unicode", Georgia, serif;
             grid-column: 2; width: 100%; padding: .35rem .5rem; box-sizing: border-box;
             border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
             border-radius: 4px; background: Canvas; color: CanvasText; }
 input.key:focus { outline: 2px solid Highlight; }
 input.key.done { background: color-mix(in srgb, CanvasText 5%, Canvas); }
 input.key.edited { border-color: #2e7d32; background: color-mix(in srgb, #2e7d32 10%, Canvas); }
 input.key.warn { border-color: #b8860b; background: color-mix(in srgb, #b8860b 12%, Canvas); }
 .warn-msg { grid-column: 2; font-size: .8rem; color: #b8860b; margin-top: .15rem; }
 /* A coloured mirror of the typed line.  An input cannot style its own
    characters, and a rough breathing typed as a smooth is a few pixels at
    reading size — here it is a colour. */
 .mirror { grid-column: 2; font: calc(var(--key-f, 19px) * 1.15)/1.6
           "GFS Didot", "New Athena Unicode", Georgia, serif;
           padding: .1rem .5rem .2rem; word-break: break-word; }
 .rough  { color: #1565c0; }                 /* blue   */
 .smooth { color: #c62828; }                 /* red    */
 .rough-acc  { color: #6a1b9a; }             /* purple */
 .smooth-acc { color: #ef6c00; }             /* orange */
 .acute  { color: #2e7d32; }                 /* green  */
 .grave  { color: #00838f; }                 /* teal   */
 .circ   { color: #ad1457; }                 /* magenta*/
 @media (prefers-color-scheme: dark) {
   .rough{color:#7fb2f0}.smooth{color:#f28b82}.rough-acc{color:#c9a3ea}
   .smooth-acc{color:#ffb870}.acute{color:#81c995}.grave{color:#68d2dd}
   .circ{color:#f28bc1}
 }
 .flagged { text-decoration: underline wavy #b8860b;
            text-underline-offset: 4px; text-decoration-thickness: 2px; }
 .legend { font-size: .78rem; opacity: .8; margin-top: .35rem; }
 .legend span { margin-right: .7rem; white-space: nowrap; }
 .row.checked .n { opacity: .9; }
 .row.checked { background: color-mix(in srgb, CanvasText 3%, transparent); }
 .dispute { display: inline-block; margin-left: .25rem; min-width: 1.3rem;
            font: inherit; font-size: .7rem; line-height: 1.3rem; padding: 0;
            text-align: center; border: 0; border-radius: 999px;
            background: #b8860b; color: #fff; cursor: pointer; }
 .readers { grid-column: 2; font-size: .85rem; padding: .3rem .5rem;
            margin-top: .2rem; border-left: 3px solid #b8860b;
            background: color-mix(in srgb, #b8860b 10%, Canvas); }
 .readers b { font-weight: 600; opacity: .7; font-size: .78rem; }
 footer { position: fixed; inset: auto 0 0 0; padding: .6rem 1rem;
          background: Canvas; border-top: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
          display: flex; gap: .75rem; align-items: center; }
 footer button { font-size: .95rem; padding: .4rem .8rem; border-radius: 5px;
                 border: 1px solid color-mix(in srgb, CanvasText 30%, transparent);
                 background: Canvas; color: CanvasText; cursor: pointer; }
 #done { opacity: .7; font-variant-numeric: tabular-nums; }
 @media (max-width: 600px) { .ink img { height: 38px; } body { padding: .5rem .5rem 6rem; } }
</style>
<header>
  <details>
    <summary><b>%%COLUMN%%</b> — %%HEADING%%</summary>
    <p class=note>%%INTRO%% Record the ink, errors included; a correction
      counts only when it moves toward what is printed. Skip the marginal line
      numbers. Bekker references are <b>unspaced, with plain letters</b> —
      <code>1456b27</code>, never <code>1456 b27</code> and never a raised
      letter. Work is saved in this browser as you go.</p>
  </details>
  <div class=keys>%%KEYS%%</div>
  <div class=legend>
    <span class=rough>ἁ rough</span><span class=smooth>ἀ smooth</span>
    <span class=rough-acc>ἅ rough + accent</span><span class=smooth-acc>ἄ smooth + accent</span>
    <span class=acute>ά acute</span><span class=grave>ὰ grave</span>
    <span class=circ>ᾶ circumflex</span>
  </div>
</header>
%%ROWS%%
<footer>
  <button id=export>Download .txt</button>
  <button id=copy>Copy all</button>
  <button id=smaller title="smaller text">A−</button>
  <button id=bigger title="bigger text">A+</button>
  <span id=done></span><span id=dmgcount></span>
</footer>
<script>
const COLUMN = "%%COLUMN%%", COUNT = %%COUNT%%, MODE = "%%MODE%%";
const KEY = "bonitz-gold-" + COLUMN + "-" + MODE;   // a blind pass and an
                                                    // audit pass never mix
const LEX = new Set(%%LEXICON%%);
const boxes = [...document.querySelectorAll("input.key")];
let last = null;

const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
boxes.forEach(b => {
  const s = saved[b.dataset.n];
  if (s && typeof s === "object") { b.value = s.v; b.dataset.checked = s.c ? "1" : ""; }
  else if (s) b.value = s;
});
function markChecked(b) { b.dataset.checked = "1"; save(); }
// One tick per line.  Enter sets it as you move down; the box lets you set or
// clear it on its own, so a line you have looked at and left alone still counts.
document.querySelectorAll(".tick").forEach(t => {
  t.addEventListener("change", () => {
    const b = document.getElementById("l" + t.dataset.n);
    b.dataset.checked = t.checked ? "1" : "";
    save();
  });
});

// The Greek layout puts alpha and beta on the a and b keys, so a Bekker
// reference typed without switching layouts comes out 1456β27.  Latin and
// Greek capitals that share a shape are the same trap one level up.
const HOMOGLYPH = {"Α":"A","Β":"B","Ε":"E","Ζ":"Z","Η":"H","Ι":"I","Κ":"K",
                   "Μ":"M","Ν":"N","Ο":"O","Ρ":"P","Τ":"T","Υ":"Y","Χ":"X"};
function warnings(v) {
  const w = [];
  if (/[0-9][αβ][0-9]/.test(v)) w.push("Greek α/β in a Bekker reference — the Latin a/b is wanted");
  if (/[0-9] [ab][0-9]/.test(v)) w.push("Bekker references are keyed unspaced");
  // Unshifted, the breathing key gives the standalone koronis instead of the
  // dasia.  The koronis is legitimate between words (106 of them in the book,
  // all elision) but never in front of a vowel, and the standalone dasia never
  // appears at all.
  if (/᾽[αεηιουωἀ-ῼ]/.test(v))
    w.push("᾽ before a vowel — a rough breathing on the letter was probably meant");
  if (/῾/.test(v))
    w.push("standalone ῾ — the book never uses one; put the breathing on the letter");
  const latin = v.match(/[A-Za-z]/g) || [];
  if (latin.some(c => "ABEZHIKMNOPTYX".includes(c)) && /[α-ω]/.test(v))
    w.push("Latin capital next to Greek — check it should not be the Greek letter");
  const unknown = (v.match(/[Ͱ-Ͽἀ-῿̀-ͯȣ]+/g) || [])
    .filter(x => x.length > 3 && !LEX.has(x));
  if (unknown.length)
    w.push("not found elsewhere in the book: " + unknown.join(", "));
  return w;
}
// Decompose so a precomposed ἁ and a hand-built ἁ colour the same, then take
// each base letter with the marks that follow it and colour by what they are.
const ROUGH = "̔", SMOOTH = "̓", ACUTE = "́",
      GRAVE = "̀", CIRC = "͂";
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
// Walks the text as typed, so offsets stay valid, and decomposes each cluster
// only to ask what marks it carries.
function colorize(s, spans) {
  spans = spans || [];
  let html = "", i = 0;
  while (i < s.length) {
    const at = i;
    let cluster = s[i++];
    while (i < s.length && /[̀-ͯ]/.test(s[i])) cluster += s[i++];
    const marks = cluster.normalize("NFD").slice(1);
    const br = marks.includes(ROUGH) ? "rough"
             : marks.includes(SMOOTH) ? "smooth" : "";
    const ac = marks.includes(ACUTE) ? "acute"
             : marks.includes(GRAVE) ? "grave"
             : marks.includes(CIRC) ? "circ" : "";
    let cls = br && ac ? br + "-acc" : br || ac;
    if (spans.some(sp => at >= sp[0] && at < sp[1])) cls += " flagged";
    cls = cls.trim();
    const glyph = esc(cluster);
    html += cls ? '<span class="' + cls + '">' + glyph + "</span>" : glyph;
  }
  return html;
}

function save() {
  const o = {};
  boxes.forEach(b => {
    if (b.value || b.dataset.checked) o[b.dataset.n] = {v: b.value, c: b.dataset.checked ? 1 : 0};
  });
  localStorage.setItem(KEY, JSON.stringify(o));
  const filled = Object.keys(o).length;
  const edited = boxes.filter(b => b.value !== b.dataset.orig).length;
  const checked = boxes.filter(b => b.dataset.checked === "1").length;
  document.getElementById("done").textContent =
    checked + " / " + COUNT + " checked, " + edited + " corrected";
  boxes.forEach(b => {
    b.classList.toggle("done", !!b.value);
    b.classList.toggle("edited", b.value !== b.dataset.orig);
    b.parentElement.classList.toggle("checked", b.dataset.checked === "1");
    const t = b.parentElement.querySelector(".tick");
    if (t) t.checked = b.dataset.checked === "1";
    const mir = b.parentElement.querySelector(".mirror");
    // the marks are offsets into the transcription as it came, so they stop
    // meaning anything once the line has been edited
    const spans = b.value === b.dataset.orig
      ? JSON.parse(b.dataset.spans || "[]") : [];
    if (mir) mir.innerHTML = colorize(b.value, spans);
    const w = b.value ? warnings(b.value) : [];
    b.classList.toggle("warn", w.length > 0);
    let msg = b.parentElement.querySelector(".warn-msg");
    if (w.length && !msg) {
      msg = document.createElement("div");
      msg.className = "warn-msg";
      b.parentElement.appendChild(msg);
    }
    if (msg) msg.textContent = w.join(" · ");
  });
}
boxes.forEach((b, i) => {
  b.addEventListener("input", () => { b.dataset.checked = "1"; save(); });
  b.addEventListener("focus", () => last = b);
  b.addEventListener("keydown", e => {
    if (e.key === "Enter") {           // Enter = "this line is right", move on
      e.preventDefault(); markChecked(b); (boxes[i + 1] || b).focus();
    }
  });
});
document.querySelectorAll(".keys button").forEach(btn => {
  btn.addEventListener("mousedown", e => e.preventDefault());
  btn.addEventListener("click", () => {
    const b = last || boxes[0]; b.focus();
    const s = b.selectionStart, ch = btn.dataset.ch;
    b.value = b.value.slice(0, s) + ch + b.value.slice(b.selectionEnd);
    b.selectionStart = b.selectionEnd = s + ch.length;
    save();
  });
});
// A ᾽ typed for a ῾ is a few pixels at reading size, in the box as much as in
// the ink.  A+/A− scale the typed text; clicking a crop blows that line up.
let keyF = +(localStorage.getItem(KEY + "-font") || 19);
function applyFont() {
  document.documentElement.style.setProperty("--key-f", keyF + "px");
  localStorage.setItem(KEY + "-font", keyF);
}
document.getElementById("bigger").onclick = () => { keyF = Math.min(40, keyF + 3); applyFont(); };
document.getElementById("smaller").onclick = () => { keyF = Math.max(13, keyF - 3); applyFont(); };
document.querySelectorAll(".ink img").forEach(img =>
  img.addEventListener("click", () => img.classList.toggle("big")));

// The badges opened a native tooltip, which needs a steady hover and vanishes
// while you read it.  Click them open instead, and leave them open.
document.querySelectorAll(".dispute").forEach(btn => {
  btn.addEventListener("click", () => {
    const row = btn.closest(".row");
    const open = row.querySelector(".readers");
    if (open) { open.remove(); return; }
    const d = document.createElement("div");
    d.className = "readers";
    d.innerHTML = "<b>readers disagreed:</b> " + colorize(btn.dataset.readers);
    row.appendChild(d);
  });
});
applyFont();

// Print damage: the impression failed, so neither reader is wrong and the
// line is unlearnable.  Kept beside the text, not inside it.
const DKEY = KEY + "-damage";
const damaged = new Set(JSON.parse(localStorage.getItem(DKEY) || "[]"));
function paintDamage() {
  document.querySelectorAll(".dmg").forEach(btn =>
    btn.closest(".row").classList.toggle("damaged", damaged.has(+btn.dataset.n)));
  document.getElementById("dmgcount").textContent =
    damaged.size ? damaged.size + " damaged" : "";
}
document.querySelectorAll(".dmg").forEach(btn => {
  btn.addEventListener("click", () => {
    const n = +btn.dataset.n;
    damaged.has(n) ? damaged.delete(n) : damaged.add(n);
    localStorage.setItem(DKEY, JSON.stringify([...damaged].sort((a, b) => a - b)));
    paintDamage();
  });
});
paintDamage();

function text() { return boxes.map(b => b.value).join("\\n") + "\\n"; }
function download(name, body, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], {type: type}));
  a.download = name; a.click();
}
document.getElementById("export").addEventListener("click", () => {
  download(COLUMN + ".txt", text(), "text/plain");
  if (damaged.size) download(COLUMN + ".damage.json", JSON.stringify(
    {column: COLUMN, damaged: [...damaged].sort((a, b) => a - b)}, null, 1),
    "application/json");
});
document.getElementById("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(text());
  document.getElementById("copy").textContent = "Copied";
  setTimeout(() => document.getElementById("copy").textContent = "Copy all", 1200);
});
save();
</script>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('columns', nargs='+', help='e.g. page-042-R')
    p.add_argument("--out", type=Path, default=WORK / "gold")
    p.add_argument("--blind", action="store_true",
                   help="empty boxes instead of the current transcription")
    args = p.parse_args(argv)
    for c in args.columns:
        dst = build(c, args.out, prefill=not args.blind)
        print(f'{dst}  ({dst.stat().st_size / 1e6:.1f} MB)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
