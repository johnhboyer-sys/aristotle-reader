"""
The mark queue, put in front of the ink.

`diacritic_sweep` lists words where the corpus and LlamaParse differ ONLY in
the small marks — breathings, accents, the iota subscript.  That class is
invisible to the reader panel, because `fold()` strips exactly those marks
before comparing readers, so no disagreement region is ever formed and no
review page is ever built.  Measured 2026-08-08: all 154 rows of the queue
fold to identical strings on both sides.  Nobody has ever looked at them.

This module does three things and nothing else:

  1. CLASSIFIES each row by what the change actually is, because the four
     classes want four different kinds of judgment (see `classify`).
  2. REFUSES to touch a line John has already ruled on.  Five rows of the
     queue sit on such lines and three of those rulings say LEAVE IT — the
     `αλλα` printer's error at 032-L:1 and the two ἁλι- words at 044-R that
     were wrongly "corrected" once already and had to be reverted.
  3. CROPS the 400 dpi ink at each site, at the WORD, so a ruling is made
     against the photograph rather than against another reader.

It applies nothing.  `--sheets` writes contact sheets for adjudication;
`--html` writes the review page.  The ink decides, as everywhere else here.

    python3 -m bonitz_pipeline.mark_review --list
    python3 -m bonitz_pipeline.mark_review --sheets --class C
    python3 -m bonitz_pipeline.mark_review --html work/sweeps/review-marks.html
"""

from __future__ import annotations
import argparse
import base64
import csv
import difflib
import io
import json
import sys
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NS = '{http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15}'
QUEUE = ROOT / 'work/sweeps/diacritic-candidates.tsv'

ROUGH, SMOOTH = '̔', '̓'
ACUTE, GRAVE, CIRC = '́', '̀', '͂'
CIRC_ALT = '̃'                     # combining tilde — the same printed mark
BREATHINGS, ACCENTS = ROUGH + SMOOTH, ACUTE + GRAVE + CIRC

CLASSES = {
    'A': 'corpus has no mark at all, LlamaParse has one',
    'B': 'involves the ou/kai ligature — John\'s ruling pending',
    'C': 'a mark moved to a different letter (changes the word)',
    'D': 'other addition or drop',
}


def marks_of(s: str) -> list[str]:
    return [c for c in unicodedata.normalize('NFD', s)
            if unicodedata.combining(c)]


def classify(corpus: str, llama: str) -> str:
    """Which kind of judgment this row needs.

    A  the corpus word carries NO mark and LlamaParse's does.  Ordinary words
       where Greek admits one form, so the only question is whether the
       printer set the mark — the cheapest class to rule and the safest.
    B  a ligature is involved.  Frozen: the C1 exemption is John's call, and
       LlamaParse is demonstrably wrong on part of it (it writes the smooth
       on `ȣ` where the word is οὗ and the rough is required).
    C  the same number of marks, differently placed.  This changes WHICH WORD
       it is, so LlamaParse is not authority — `ἀλλοιȣ̃σθαι` is the real word
       and its `ἀλλοῖȣσθαι` is not.  Grammar rules most of these; the ink
       rules the rest.
    D  everything else: a mark added or dropped, including acute-against-grave,
       which §154 makes undecidable from the word alone.
    """
    if not marks_of(corpus) and marks_of(llama):
        return 'A'
    if 'ȣ' in corpus or 'ϗ' in corpus or 'ȣ' in llama or 'ϗ' in llama:
        return 'B'
    if len(marks_of(corpus)) == len(marks_of(llama)):
        return 'C'
    return 'D'


def protected() -> dict[tuple[str, int], str]:
    """(column, line) -> why it must not be touched.

    John's 44 hand rulings and the corrigenda register.  A queue that does not
    consult these walks straight back into the 2026-08-08 revert: `ἀλίζειν`
    and `ἀλίσκεται` were ruled KEPT in July, "corrected" by a later pass, and
    had to be restored.
    """
    out: dict[tuple[str, int], str] = {}
    f = ROOT / 'tests/fixtures/john-rulings.json'
    for section, body in json.loads(f.read_text(encoding='utf-8')).items():
        if not isinstance(body, dict):
            continue
        for bucket, items in body.items():
            if not isinstance(items, list):
                continue
            for e in items:
                if 'page' not in e or 'line' not in e:
                    continue
                key = (f"page-{e['page']:03d}-{e['col']}", e['line'])
                verb = 'RULED — do not change' if bucket in (
                    'declined', 'held', 'items') else 'ruled and applied'
                out[key] = f"{verb} ({section}/{bucket}): " \
                           f"{e.get('keep') or e.get('now') or e.get('text', '')}"
    c = ROOT / 'work/corrigenda/entries.json'
    if c.exists():
        for e in json.loads(c.read_text(encoding='utf-8'))['entries']:
            out[(f"page-{e['page']:03d}-{e['col']}", e['line'])] = \
                f"corrigendum — preserved as printed: {e['printed']}"
    return out


def shape(col: str, line: int, word: str) -> str:
    """Is this a word at all, or half of one?  '' means it is a word.

    `diacritic_sweep` has no truncation guard, and `smyth_sweep` learned the
    hard way that it needs one: a word broken at a line end is two fragments
    and neither is accented on its own.  `ἀλή-` / `θειαν` is ἀλήθειαν with the
    accent on the half that carries it, and reporting `θειαν` as "missing an
    accent" is reporting the line break.  19 of the 26 class-A rows are this.

    An index also abbreviates its own headword — `ἀδ.` for ἀδύνατον, `απ.` for
    the entry it stands under — and Bonitz sets those bare.  The stop hard
    against the token is the abbreviation mark.  ⚠ The stop ALONE is not a
    safe test at scale (319 period-followed tokens in the corpus are ordinary
    sentence-final words); here it is used only to explain a token that is
    ALREADY flagged as unaccented, which is a much narrower claim.
    """
    f = ROOT / f'work/reconciled/{col}.txt'
    if not f.exists():
        return ''
    lines = f.read_text(encoding='utf-8').splitlines()
    if line > len(lines):
        return ''
    cur, prev = lines[line - 1], lines[line - 2] if line > 1 else ''
    at = cur.find(word)
    if at < 0:
        return ''
    if cur.rstrip().endswith('-') and cur.rstrip()[:-1].endswith(word):
        return 'line-end fragment — the accent is on the other half'
    if prev.rstrip().endswith('-') and not cur[:at].strip():
        return 'line-start fragment — the accent is on the other half'
    if cur[at + len(word):at + len(word) + 1] == '.':
        return 'abbreviated headword — Bonitz sets these bare'
    return ''


@dataclass
class Site:
    col: str
    line: int
    corpus: str
    llama: str
    marks: str
    context: str
    cls: str = ''
    guard: str = ''            # John ruled this line: never touch it
    shape: str = ''            # not a whole word, so no mark is expected
    score: float = 0.0
    img: object = None          # PIL image of the word, at the ink
    verdict: str = ''           # filled in by adjudication
    proposed: str = ''
    why: str = ''


def _key(s: str) -> str:
    d = unicodedata.normalize('NFD', s)
    return ''.join(c for c in d
                   if not unicodedata.combining(c) and not c.isspace())


def _lines(col: str) -> list[tuple[int, int, int, int, str]]:
    """(x0, y0, x1, y1, text) per segmented line from the paired PageXML."""
    f = ROOT / f'work/kraken400/gt/{col}.xml'
    if not f.exists():
        return []
    out = []
    for tl in ET.parse(f).getroot().iter(f'{NS}TextLine'):
        co, uni = tl.find(f'{NS}Coords'), tl.find(f'{NS}TextEquiv/{NS}Unicode')
        if co is None or uni is None or not (uni.text or '').strip():
            continue
        pts = [p.split(',') for p in co.get('points').split()]
        xs, ys = [int(p[0]) for p in pts], [int(p[1]) for p in pts]
        out.append((min(xs), min(ys), max(xs), max(ys), uni.text))
    return sorted(out, key=lambda t: t[1])


def crop_word(col: str, lineno: int, word: str, scale: float = 3.0,
              whole: bool = False) -> tuple[object, float]:
    """The ink at one word: the line found by TEXT, the word by proportion.

    Line numbers do not carry across — `work/reconciled` counts printed lines
    and the PageXML counts what kraken segmented, which drops the marginal
    numbers — so the line is matched on its text, as `crop_site` does.  Within
    the line the word is placed by character offset across the line's own
    x-extent, which is why the polygon's xs are kept and not just its ys.
    """
    src = ROOT / f'work/kraken400/cols/{col}.png'
    txt = ROOT / f'work/reconciled/{col}.txt'
    if not src.exists() or not txt.exists():
        return None, 0.0
    lines = txt.read_text(encoding='utf-8').splitlines()
    if lineno > len(lines):
        return None, 0.0
    want = lines[lineno - 1]
    cand = _lines(col)
    im = Image.open(src)
    if cand:
        x0, y0, x1, y1, got = max(cand, key=lambda t: difflib.SequenceMatcher(
            None, _key(want), _key(t[4]), autojunk=False).ratio())
        score = difflib.SequenceMatcher(None, _key(want), _key(got),
                                        autojunk=False).ratio()
    else:
        # No PageXML for this column (page-033-R is quarantined).  Fall back to
        # proportional placement over the whole column, the way 047-R:20 and
        # 031-R:10 were cropped — and say so, by scoring it 0.
        n = max(1, len(lines))
        h = im.height / n
        x0, x1 = 0, im.width
        y0, y1, score = int((lineno - 1) * h), int(lineno * h), 0.0
    pad = int((y1 - y0) * 0.45)
    # Place the word across the line's ink extent by character offset.
    # `whole` shows the entire printed line.  The word window is placed by
    # character proportion over a line that is not monospaced, so it can miss —
    # which is one of the two reasons John gave for clicking "unsure".  Seeing
    # the whole line costs a little resolution and never lies about position.
    at = -1 if whole else want.find(word)
    if at < 0 or not want.strip():
        wx0, wx1 = x0, x1
    else:
        # Proportional placement is only an estimate — the setting is not
        # monospaced and the line carries Latin, digits and ligatures of
        # different widths — so the window is opened wide on both sides.  A
        # word clipped in half cannot be ruled on, and a neighbouring word is
        # useful evidence anyway: the surest way to judge a missing accent is
        # a word beside it that has one.
        span = x1 - x0
        wx0 = x0 + int(span * at / len(want)) - pad * 7
        wx1 = x0 + int(span * (at + len(word)) / len(want)) + pad * 7
    box = (max(0, wx0), max(0, y0 - pad),
           min(im.width, max(wx1, wx0 + 60)), min(im.height, y1 + pad))
    c = im.crop(box)
    if c.width and c.height:
        c = c.resize((int(c.width * scale), int(c.height * scale)),
                     Image.LANCZOS)
    return c, score


def load(queue: Path = QUEUE) -> list[Site]:
    guards = protected()
    out = []
    for r in csv.DictReader(queue.open(encoding='utf-8'), delimiter='\t'):
        s = Site(r['column'], int(r['line']), r['corpus'], r['llama'],
                 r['marks'], r['context'])
        s.cls = classify(s.corpus, s.llama)
        s.guard = guards.get((s.col, s.line), '')
        s.shape = shape(s.col, s.line, s.corpus)
        out.append(s)
    v = ROOT / 'work/sweeps/mark-verdicts.json'
    if v.exists():
        ruled = json.loads(v.read_text(encoding='utf-8'))['verdicts']
        for s in out:
            r = ruled.get(f'{s.col}:{s.line}:{s.corpus}')
            if r:
                s.verdict, s.proposed, s.why = (
                    r['verdict'], r.get('proposed', ''), r.get('why', ''))
            elif s.guard:
                s.verdict, s.why = 'JOHN', s.guard
            elif s.shape:
                s.verdict, s.why = 'NO CHANGE', s.shape
    return out


def sheet(sites: list[Site], out: Path, per: int = 6) -> list[Path]:
    """Contact sheets: several sites stacked, each captioned, for adjudication.

    Reading 98 crops one at a time is not practical; reading them six to a
    sheet is.  The caption carries column, line and both readings so a sheet
    is self-contained evidence.
    """
    from PIL import ImageDraw, ImageFont
    # The default PIL bitmap font has no Greek, so every caption renders as
    # tofu — which makes a contact sheet useless for the one thing it is for.
    font = None
    for f in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
              '/System/Library/Fonts/Supplemental/Times New Roman.ttf'):
        if Path(f).exists():
            font = ImageFont.truetype(f, 22)
            break
    out.mkdir(parents=True, exist_ok=True)
    made, batch = [], []
    for i, s in enumerate(sites):
        batch.append(s)
        if len(batch) == per or i == len(sites) - 1:
            imgs = [(b, b.img) for b in batch if b.img]
            if imgs:
                w = max(im.width for _, im in imgs) + 20
                cap = 34
                h = sum(im.height + cap for _, im in imgs) + 20
                sh = Image.new('RGB', (max(w, 900), h), 'white')
                d = ImageDraw.Draw(sh)
                y = 10
                for b, im in imgs:
                    d.text((10, y), f'{b.col}:{b.line}   corpus {b.corpus}'
                                    f'   llama {b.llama}   [{b.marks}]'
                                    f'   match={b.score:.2f}', fill='black',
                           font=font)
                    sh.paste(im, (10, y + cap - 8))
                    y += im.height + cap
                f = out / f'sheet-{len(made) + 1:02d}.png'
                sh.save(f)
                made.append(f)
            batch = []
    return made


def _b64(im) -> str:
    b = io.BytesIO()
    im.save(b, format='PNG')
    return base64.b64encode(b.getvalue()).decode()


SUBSCRIPT = 'ͅ'
_MARK_NAMES = {'': 'bare', ACUTE: 'acute', GRAVE: 'grave', CIRC: 'circumflex',
               SMOOTH: 'smooth', ROUGH: 'rough', SUBSCRIPT: 'subscript'}


def _name(marks: str) -> str:
    return ' + '.join(_MARK_NAMES.get(m, '?') for m in marks) or 'bare'


def candidates(corpus: str, llama: str) -> list[tuple[str, str]]:
    """[(form, label)] — the readings a ligature site could actually have.

    The buttons show GLYPHS, not descriptions, because the question John is
    answering is "which of these shapes is on the page" and a name for the
    shape is one translation step away from the evidence.  Built from the
    corpus form by adding each breathing in front of whatever accent is
    already there (§11 order: breathing, then accent), plus LlamaParse's form
    when it differs from all of them.
    """
    d = unicodedata.normalize('NFD', corpus).replace(CIRC_ALT, CIRC)
    e = unicodedata.normalize('NFD', llama or '').replace(CIRC_ALT, CIRC)
    out = [(corpus, 'keep')]

    def split(s):
        """[(base, marks)] over an NFD string."""
        cl = []
        for ch in s:
            if unicodedata.combining(ch) and cl:
                cl[-1][1] += ch
            else:
                cl.append([ch, ''])
        return cl

    a, b = split(d), split(e)
    # WHICH LETTER is in question?  Not always the ligature: `σπȣδαῖα` against
    # `σπȣδαία` differ on the αι, and offering breathings for the ligature gave
    # John four buttons none of which could express the answer.  He said so —
    # "unsure were either because you didn't give me the correct option or
    # because the crop wasn't making the case visible" — so the options are
    # now built for the first cluster where the two readings actually disagree,
    # falling back to the ligature when they agree letter for letter.
    i = next((k for k in range(min(len(a), len(b)))
              if a[k][0] == b[k][0] and a[k][1] != b[k][1]), -1)
    if i < 0:
        i = next((k for k, (bs, _) in enumerate(a) if bs in 'ȣϗ'), -1)
    if i < 0:
        i = next((k for k, (bs, m) in enumerate(a) if m), -1)
    if i >= 0:
        base = a[i][0]
        head = ''.join(x + m for x, m in a[:i])
        tail = ''.join(x + m for x, m in a[i + 1:])
        # ⚠ head/tail keep the REST of the word intact.  The first version took
        # d[:1] as the base and threw the rest away, so "smooth only" on
        # `ȣδενί` offered `ȣ̓` — which would have deleted δενί from the line.
        # John clicked it on 038-R:5 and it was caught before it was written.
        # A button that can silently truncate a word has no business here.
        initial = i == 0 or base in 'ȣϗ'
        combos = ['', ACUTE, GRAVE, CIRC]
        if initial:
            combos += [SMOOTH, ROUGH,
                       SMOOTH + ACUTE, SMOOTH + GRAVE, SMOOTH + CIRC,
                       ROUGH + ACUTE, ROUGH + GRAVE, ROUGH + CIRC]
        if base in 'αηω':
            combos.append(SUBSCRIPT)
        for m in combos:
            form = unicodedata.normalize('NFC', head + base + m + tail)
            if all(form != f for f, _ in out):
                out.append((form, _name(m)))
    if llama and all(llama != f for f, _ in out):
        out.append((llama, 'LlamaParse'))
    # de-duplicate, keep order
    seen, uniq = set(), []
    for f, n in out:
        if f not in seen:
            seen.add(f)
            uniq.append((f, n))
    return uniq


def html(sites: list[Site], out: Path, title: str, applied: bool) -> Path:
    """The review page: the ink first, then what was read, then what changed.

    Built so a wrong change is obvious without reading prose — the photograph
    sits directly above the two readings, and the changed letter is marked in
    both.
    """
    rows = []
    for s in sites:
        sid = f'{s.col}:{s.line}:{s.corpus}'
        btns = ''
        if not s.verdict and not applied:
            btns = '<div class="btns">' + ''.join(
                f'<button data-id="{sid}" data-form="{f}" '
                f'class="b{" b-keep" if n == "keep" else ""}">'
                f'<span class="g">{f}</span><span class="n">{n}</span></button>'
                for f, n in candidates(s.corpus, s.llama)) + (
                f'<button data-id="{sid}" data-form="?" class="b b-skip">'
                f'<span class="g">?</span><span class="n">unsure</span>'
                f'</button></div>')
        img = f'<img src="data:image/png;base64,{_b64(s.img)}">' if s.img \
            else '<p class="nocrop">no crop — see note</p>'
        warn = ''
        if s.img is not None and s.score < 0.6:
            warn = ('<p class="warn">⚠ line match {:.2f} — the crop may not be '
                    'this line; do not rule on it</p>'.format(s.score))
        if s.guard:
            warn += f'<p class="guard">⛔ {s.guard}</p>'
        # NOT "proposed": an unruled site has no proposal behind it, and
        # labelling it so reads as "switch to LlamaParse", which is the one
        # thing this page must never imply.  LlamaParse is wrong at five of
        # class D's eight sites — it strips the second accent an enclitic
        # throws back (γίνεταί τινι, ἄγονόν ποτε) — so its column is a second
        # opinion and nothing more.  John asked what the badge meant, 2026-08-08.
        verdict = s.verdict or ('applied' if applied else 'UNRULED')
        rows.append(f'''
<section class="site {'guarded' if s.guard else ''}" id="s-{sid}">
  <h3>{s.col} : line {s.line} <span class="cls">class {s.cls}</span>
      <span class="v v-{verdict.split()[0].lower()}">{verdict}</span></h3>
  <div class="ink">{img}</div>
  {btns}
  {warn}
  <table>
    <tr><th>corpus</th><td class="grk">{s.corpus}</td>
        <th>LlamaParse</th><td class="grk">{s.llama}</td>
        <th>marks</th><td>{s.marks}</td></tr>
    {f'<tr><th>proposed</th><td class="grk prop">{s.proposed}</td>'
     f'<th colspan="3">{s.why}</th></tr>' if s.proposed or s.why else ''}
  </table>
  <p class="ctx">{s.context}</p>
</section>''')
    css = '''
body{font:15px/1.5 -apple-system,Segoe UI,sans-serif;margin:0;padding:24px;
     background:#faf9f7;color:#1a1a1a;max-width:1100px}
h1{font-size:22px} h3{font-size:15px;margin:0 0 8px;font-weight:600}
.site{background:#fff;border:1px solid #ddd;border-radius:6px;padding:16px;
      margin:0 0 18px}
.site.guarded{border-color:#c00;background:#fff6f6}
.ink{background:#fff;border:1px solid #eee;overflow-x:auto;padding:6px}
.ink img{display:block;image-rendering:-webkit-optimize-contrast}
.grk{font-family:"GFS Didot","Times New Roman",serif;font-size:21px}
.prop{color:#0a6}
table{border-collapse:collapse;margin:10px 0;font-size:13px}
th{text-align:left;padding:3px 10px 3px 0;color:#666;font-weight:600}
td{padding:3px 20px 3px 0}
.ctx{font-family:"GFS Didot",serif;font-size:14px;color:#555;
     background:#f4f3f0;padding:6px 8px;border-radius:4px;margin:6px 0 0}
.cls{color:#888;font-weight:400;font-size:12px;margin-left:6px}
.v{float:right;font-size:11px;text-transform:uppercase;letter-spacing:.06em;
   padding:2px 8px;border-radius:10px;background:#eee}
.v-applied{background:#d8f0e0;color:#064}
.v-unruled{background:#eee;color:#555}
.v-fix{background:#fdf0d0;color:#850}
.v-preserve{background:#e4e8f5;color:#345}
.v-john,.v-adjudicate{background:#fde0e0;color:#900}
.warn{color:#b00;font-size:13px;margin:6px 0 0}
.guard{color:#c00;font-weight:600;font-size:13px;margin:6px 0 0}
.lead{background:#fff;border-left:3px solid #999;padding:10px 14px;
      margin:0 0 20px}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 4px}
.b{display:flex;flex-direction:column;align-items:center;gap:2px;
   min-width:104px;padding:14px 18px;border:2px solid #c9c9c9;border-radius:10px;
   background:#fff;cursor:pointer;font:inherit;line-height:1.1}
.b:hover{border-color:#666;background:#f4f4f4}
.b .g{font-family:"GFS Didot","Times New Roman",serif;font-size:34px}
.b .n{font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.05em}
.b-keep{border-color:#9bb89b}
.b-skip{border-style:dashed}
.b.chosen{border-color:#0a6;background:#e8f6ee;box-shadow:0 0 0 3px #cdebda}
.b.chosen .n{color:#064;font-weight:700}
#bar{position:sticky;top:0;z-index:9;background:#222;color:#fff;padding:10px 16px;
     border-radius:8px;margin:0 0 16px;font-size:14px;display:flex;gap:16px;
     align-items:center;justify-content:space-between}
#bar b{font-size:16px}
#bar .ok{color:#7fe0a8}  #bar .err{color:#ff9c9c}
@media(prefers-color-scheme:dark){
 body{background:#16181c;color:#e6e6e6}
 .site,.ink,.lead{background:#1e2126;border-color:#333}
 .ctx{background:#23262c;color:#bbb} th{color:#999}
 .site.guarded{background:#2a1c1c}
 .b{background:#23262c;border-color:#444;color:#e6e6e6}
 .b:hover{background:#2b2f36;border-color:#888}
 .b.chosen{background:#12301f;border-color:#0a6}}
'''
    # The page posts each click to the collector, which appends it to
    # work/sweeps/mark-rulings.json.  No typing, no window switching, no
    # copy-paste: John clicks in the browser pane and the ruling is on disk.
    # If the collector is not running the click still registers visually and
    # the bar says so, so the page degrades to a read-only review.
    js = '''
const bar=document.getElementById('bar'),n=document.getElementById('n');
let done=new Set();
document.addEventListener('click',async e=>{
 const b=e.target.closest('.b'); if(!b) return;
 b.parentElement.querySelectorAll('.b').forEach(x=>x.classList.remove('chosen'));
 b.classList.add('chosen');
 done.add(b.dataset.id); n.textContent=done.size;
 try{
  const r=await fetch('/verdict',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:b.dataset.id,form:b.dataset.form,
                         label:b.querySelector('.n').textContent})});
  if(!r.ok) throw 0;
  bar.querySelector('.status').innerHTML='<span class="ok">saved</span>';
 }catch(_){
  bar.querySelector('.status').innerHTML=
    '<span class="err">not saved — collector is not running</span>';
 }
});'''
    n_open = sum(1 for s in sites if not s.verdict) if not applied else 0
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(f'''<!doctype html><meta charset="utf-8">
<title>{title}</title><style>{css}</style>
<h1>{title}</h1>
<div id="bar"><span><b><span id="n">0</span></b> of {n_open} ruled</span>
  <span class="status">click a glyph — it saves as you go</span></div>
<div class="lead">{len(sites)} sites. The photograph is the 400 dpi ink of the
1870 original, cropped at the word. <b>The buttons show glyphs, not advice</b> —
pick the shape you see. LlamaParse is a second opinion and is wrong at five of
class D's eight sites, so its column is never a recommendation.</div>
{''.join(rows)}
<script>{js}</script>''', encoding='utf-8')
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--class', dest='cls', action='append',
                   choices=list(CLASSES))
    p.add_argument('--list', action='store_true')
    p.add_argument('--real', action='store_true',
                   help='drop the rows a guard already answers — John\'s '
                        'rulings, line-break fragments, headword abbreviations')
    p.add_argument('--sheets', type=Path)
    p.add_argument('--html', type=Path)
    p.add_argument('--title', default='Bonitz — the mark queue against the ink')
    args = p.parse_args(argv)

    sites = load()
    if args.cls:
        sites = [s for s in sites if s.cls in args.cls]
    if args.real:
        sites = [s for s in sites if not s.guard and not s.shape]

    if args.list:
        from collections import Counter
        for c, n in sorted(Counter(s.cls for s in sites).items()):
            print(f'  {c}  {n:4}  {CLASSES[c]}')
        g = [s for s in sites if s.guard]
        print(f'\n{len(g)} on lines John has ruled:')
        for s in g:
            print(f'   {s.col}:{s.line}  {s.corpus}  — {s.guard}')
        return 0

    if args.sheets or args.html:
        for s in sites:
            s.img, s.score = crop_word(s.col, s.line, s.corpus)
    if args.sheets:
        made = sheet(sites, args.sheets)
        print(f'{len(made)} sheets -> {args.sheets}')
    if args.html:
        html(sites, args.html, args.title, applied=False)
        print(f'-> {args.html}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
