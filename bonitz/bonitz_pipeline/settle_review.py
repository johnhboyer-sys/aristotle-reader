"""The refused settle queue, put to the ink — one question per card.

`apply_settled` leaves every refused word-dispute as Opus wrote it and emits
`work/queue-053-062.json`. This page groups identical form-sets into one card
each, shows the printed ink, and asks which form the crop reads.

    python3 -m bonitz_pipeline.settle_review
    python3 -m bonitz_pipeline.settle_review --wifi

⚠ JOHN'S RULES (each from a real failure — not negotiable):

1. ONE question per card. No typing. No window switching.
2. Big buttons. Every option states its CONSEQUENCE, not just its label.
3. An "unsure" click is a DEFECT IN THE TOOL. If he cannot decide from what
   the card shows, the card is missing something — fix the card.
4. He must see the actual INK: the crop of the printed word. Crop by the
   recorded OFFSET, never by `want.find(word)` — that once cropped the first
   occurrence of a repeated token and misled him on 417 sites.
5. Always offer what is actually PRINTED, even when every authority disagrees.
   A misprint in Bonitz is PRESERVED and recorded as a corrigendum, never
   corrected. Getting this wrong is the worst outcome in the project.

Reuses `book_review.serve`, `book_review.CSS`, `siglum_review.MOBILE_CSS`,
and `mark_review.crop_word` (with path fallback for pages whose columns live
under `work/kraken400/read/cols` rather than `work/kraken400/cols`).
"""

from __future__ import annotations

import argparse
import base64
import difflib
import io
import json
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from bonitz_pipeline.book_review import CSS as _BASE_CSS, _b64, serve
from bonitz_pipeline.breathing_oracle import ROUGH, SMOOTH
from bonitz_pipeline.mark_review import crop_word
from bonitz_pipeline.normalize import canonical, clean_opus
from bonitz_pipeline.siglum_review import MOBILE_CSS

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_QUEUE = ROOT / 'work' / 'queue-053-062.json'
PAGE = ROOT / 'work' / 'sweeps' / 'settle-review.html'
RULINGS = ROOT / 'work' / 'sweeps' / 'settle-rulings.json'
OPUS = ROOT / 'raw' / 'opus'
READ_COLS = ROOT / 'work' / 'kraken400' / 'read' / 'cols'
READ_ALTO = ROOT / 'work' / 'kraken400' / 'read' / 'alto'
LEGACY_COLS = ROOT / 'work' / 'kraken400' / 'cols'
RECONCILED = ROOT / 'work' / 'reconciled'
ALTO_NS = '{http://www.loc.gov/standards/alto/ns-v4#}'

# Verdicts written in the same shape siglum_apply / book_apply expect:
#   { sid: { "verdict": <str>, "detail": <str> } }
# accept  → corpus becomes `detail` at every member of the form-set
# preserve → keep what is printed (Opus); record as corrigendum when detail set
VERDICTS = ('accept', 'preserve')


@dataclass
class Member:
    page: int
    col: str
    line: int
    word_off: int
    char_at: int
    readers: dict
    kind: str
    reason: str
    proposal: dict | None = None

    @property
    def col_key(self) -> str:
        return f'page-{self.page:03d}-{self.col}'

    @property
    def sid(self) -> str:
        return f'{self.col_key}:{self.line}:{self.word_off}'


@dataclass
class Card:
    """One form-set, one question — one ruling covers every member."""
    form_set: tuple[str, ...]
    members: list[Member] = field(default_factory=list)
    printed: str = ''          # Opus form (what we currently hold as printed)
    proposal: dict | None = None
    crop: str = ''
    whole: str = ''
    how: str = ''
    skipped: str = ''          # non-empty when the crop could not be made

    @property
    def sid(self) -> str:
        # Stable key for the form-set group (not a single site).
        return 'forms:' + '|'.join(self.form_set)

    @property
    def n(self) -> int:
        return len(self.members)

    @property
    def exemplar(self) -> Member:
        return self.members[0]


def form_set_key(forms: list[str]) -> tuple[str, ...]:
    return tuple(sorted(forms))


def load_queue(path: Path = DEFAULT_QUEUE) -> list[dict]:
    doc = json.loads(path.read_text(encoding='utf-8'))
    return doc['entries'] if isinstance(doc, dict) else doc


def group_entries(entries: list[dict]) -> list[Card]:
    """Collapse queue entries to one Card per distinct form-set.

    Order is already cheapest-first in the queue (siglum proposals, then
    frequent form-sets); preserve first-seen order of form-sets.
    """
    order: list[tuple[str, ...]] = []
    groups: dict[tuple[str, ...], Card] = {}
    for e in entries:
        fkey = form_set_key(e.get('form_set') or e.get('forms') or [])
        if fkey not in groups:
            order.append(fkey)
            printed = (e.get('readers') or {}).get('opus') or (
                fkey[0] if fkey else '')
            groups[fkey] = Card(
                form_set=fkey,
                printed=printed,
                proposal=e.get('proposal'),
            )
        m = Member(
            page=int(e['page']),
            col=e['col'],
            line=int(e.get('line') or 0),
            word_off=int(e['word_off']),
            char_at=int(e.get('char_at', -1)),
            readers=dict(e.get('readers') or {}),
            kind=e.get('kind', ''),
            reason=e.get('reason', ''),
            proposal=e.get('proposal'),
        )
        card = groups[fkey]
        card.members.append(m)
        # Prefer a member that carries a siglum proposal as the exemplar.
        if e.get('proposal') and not card.proposal:
            card.proposal = e['proposal']
            card.members.insert(0, card.members.pop())
        # Keep printed as Opus of the exemplar.
        if m.readers.get('opus'):
            if card.members[0] is m or not card.printed:
                card.printed = m.readers['opus']
    return [groups[k] for k in order]


def line_char_offset(page: int, col: str, word_off: int) -> int:
    """Character offset of stream[word_off] within its printed line.

    ⚠ NEVER fall back to find(word). A token can repeat on its line.
    """
    path = OPUS / f'page-{page:03d}-{col}.txt'
    if not path.exists() or word_off < 0:
        return -1
    cleaned = clean_opus(path.read_text(encoding='utf-8'))
    base = unicodedata.normalize('NFC', cleaned)
    _, offs = canonical(cleaned)
    if word_off >= len(offs):
        return -1
    base_off = offs[word_off]
    line_start = base.rfind('\n', 0, base_off) + 1
    return base_off - line_start


def _alto_line_box(page: int, col: str, want: str
                   ) -> tuple[int, int, int, int] | None:
    """(x0, y0, x1, y1) for the ALTO line closest in text to `want`."""
    import xml.etree.ElementTree as ET
    f = READ_ALTO / f'page-{page:03d}-{col}.xml'
    src = READ_COLS / f'page-{page:03d}-{col}.png'
    if not f.exists() or not src.exists():
        return None
    im = Image.open(src)
    lines = []
    for tl in ET.parse(f).getroot().iter(f'{ALTO_NS}TextLine'):
        words = [s.get('CONTENT', '') for s in tl.iter(f'{ALTO_NS}String')]
        text = ' '.join(words)
        vpos = int(tl.get('VPOS', 0))
        h = int(tl.get('HEIGHT', 0))
        hpos = int(tl.get('HPOS', 0))
        width = int(tl.get('WIDTH', im.width))
        lines.append((hpos, vpos, hpos + width, vpos + h, text))
    if not lines:
        return None
    w = canonical(want)[0] if want else ''
    x0, y0, x1, y1, _ = max(
        lines,
        key=lambda t: difflib.SequenceMatcher(
            None, w, canonical(t[4])[0], autojunk=False).ratio(),
    )
    return x0, y0, x1, y1


def crop_at_offset(
        page: int,
        col: str,
        line: int,
        word: str,
        at: int,
        *,
        scale: float = 3.0,
        spread: int = 8,
        whole: bool = False,
) -> tuple[object, float, str]:
    """Crop the printed word by recorded character offset — never by search.

    Prefers `mark_review.crop_word` when the legacy 15–52 paths exist. For
    pages 53+ the columns live under `kraken400/read/cols` and the text under
    `raw/opus`; those get the same proportional-at-offset placement with ALTO
    (or equal-slice) line geometry.

    Returns (image|None, score, how) matching crop_word's contract.
    """
    col_key = f'page-{page:03d}-{col}'
    # ⚠ PATHS: crop_word is hard-wired to work/reconciled + work/kraken400/cols
    # (pages 15–52). When those exist, reuse it with the offset. When they do
    # not, the same algorithm runs against the 53–62 layout below.
    if (RECONCILED / f'{col_key}.txt').exists() and (
            LEGACY_COLS / f'{col_key}.png').exists():
        # crop_word(col, lineno, word, ..., at=)
        return crop_word(col_key, line, word, scale=scale, spread=spread,
                         whole=whole, at=None if whole else at)

    src = READ_COLS / f'{col_key}.png'
    txt = OPUS / f'{col_key}.txt'
    if not src.exists() or not txt.exists() or line < 1:
        return None, 0.0, 'none'
    lines = unicodedata.normalize(
        'NFC', clean_opus(txt.read_text(encoding='utf-8'))).splitlines()
    if line > len(lines):
        return None, 0.0, 'none'
    want = lines[line - 1]
    im = Image.open(src)
    box = _alto_line_box(page, col, want)
    how = 'text'
    score = 0.0
    if box is not None:
        x0, y0, x1, y1 = box
        # Score is text-match of ALTO line vs opus line.
        alto_lines = []
        f = READ_ALTO / f'{col_key}.xml'
        if f.exists():
            import xml.etree.ElementTree as ET
            for tl in ET.parse(f).getroot().iter(f'{ALTO_NS}TextLine'):
                words = [s.get('CONTENT', '')
                         for s in tl.iter(f'{ALTO_NS}String')]
                alto_lines.append(' '.join(words))
        if alto_lines:
            best = max(
                (difflib.SequenceMatcher(
                    None, canonical(want)[0], canonical(t)[0],
                    autojunk=False).ratio() for t in alto_lines),
                default=0.0,
            )
            score = best
            how = 'text' if score >= 0.6 else 'mismatch'
    else:
        # Equal-slice geometry — last resort; report how honestly.
        h = im.height / max(1, len(lines))
        x0, x1 = 0, im.width
        y0, y1 = int((line - 1) * h), int(line * h)
        how = 'slices'
        score = 0.0

    pad = int((y1 - y0) * 0.45)
    # ⚠ OFFSET, NOT FIND. `at` is the character index on the printed line.
    use_at = -1 if whole else at
    if use_at is None or use_at < 0 or not want.strip():
        wx0, wx1 = x0, x1
    else:
        span = x1 - x0
        wx0 = x0 + int(span * use_at / len(want)) - pad * spread
        wx1 = x0 + int(span * (use_at + len(word)) / len(want)) + pad * spread
    box = (max(0, wx0), max(0, y0 - pad),
           min(im.width, max(wx1, wx0 + 60)), min(im.height, y1 + pad))
    c = im.crop(box)
    if c.width and c.height:
        c = c.resize((int(c.width * scale), int(c.height * scale)),
                     Image.LANCZOS)
    return c, score, how


ACCENTS = {'\u0301': 'acute', '\u0300': 'grave', '\u0342': 'circumflex'}


def describe(form: str, printed: str) -> str:
    """What actually differs, named — ' · rough', ' · grave', ' · iota sub'.

    ⚠ EVERY BUTTON READ `read <form>` AND NOTHING ELSE. On a phone, ἂ against ἄ
    is two nearly identical glyphs at 14px, and asking John to tell them apart
    by eye is asking him to do work the card could do for him. An "unsure" tap
    is a defect in the tool, and an unreadable button manufactures them.
    """
    import unicodedata as _u
    a = _u.normalize('NFD', form)
    b = _u.normalize('NFD', printed or '')
    if _u.normalize('NFD', form.lower()) == _u.normalize('NFD', (printed or '').lower()):
        return ''
    bits = []
    if ROUGH in a and ROUGH not in b:
        bits.append('rough')
    elif SMOOTH in a and SMOOTH not in b:
        bits.append('smooth')
    for mark, name in ACCENTS.items():
        if mark in a and mark not in b:
            bits.append(name)
    if '\u0345' in a and '\u0345' not in b:
        bits.append('iota sub')
    if 'ȣ' in form and 'ȣ' not in (printed or ''):
        bits.append('ligature')
    elif 'ȣ' in (printed or '') and 'ȣ' not in form:
        bits.append('ου spelled out')
    return ' · ' + ', '.join(bits) if bits else ''


def options_for(card: Card) -> list[dict]:
    """Buttons for one card. Always includes the printed form as preserve.

    Each option states a form and a consequence. No typing path.
    """
    printed = card.printed
    forms = list(card.form_set)
    # Always offer the printed form, even if somehow missing from the set.
    if printed and printed not in forms:
        forms = [printed] + forms
    out: list[dict] = []
    # Preserve-as-printed first when a proposal disagrees with it — the
    # diplomatic option must never be buried under authority.
    if printed:
        out.append({
            'form': printed,
            'verdict': 'preserve',
            'detail': printed,
            'label': f'keep as printed · {printed}',
            'consequence': (
                'corpus untouched · recorded as corrigendum if authorities '
                'disagree with the ink'
            ),
            'kind': 'preserve',
        })
    for f in forms:
        if f == printed:
            continue
        out.append({
            'form': f,
            'verdict': 'accept',
            'detail': f,
            'label': f'read {f}{describe(f, printed)}',
            'consequence': f'corpus becomes {f} at every site in this group',
            'kind': 'accept',
        })
    # Siglum proposal: offer even if already among forms (as the recommended
    # accept), so the evidence is one click.
    if card.proposal and card.proposal.get('form'):
        pf = card.proposal['form']
        if not any(o['form'] == pf and o['verdict'] == 'accept' for o in out):
            if pf != printed:
                out.append({
                    'form': pf,
                    'verdict': 'accept',
                    'detail': pf,
                    'label': f'read {pf} (siglum.holds)',
                    'consequence': (
                        f'corpus becomes {pf} · '
                        f'{card.proposal.get("reason", "")}'
                    ),
                    'kind': 'proposal',
                })
            else:
                # Proposal agrees with printed — the preserve button already
                # covers it; tag the first option so the card can highlight.
                out[0]['kind'] = 'proposal-preserve'
    return out


def fill_crops(cards: list[Card]) -> tuple[int, int]:
    """Attach ink crops. Returns (n_ok, n_skipped)."""
    ok = skip = 0
    for card in cards:
        m = card.exemplar
        word = m.readers.get('opus') or card.printed or (
            card.form_set[0] if card.form_set else '')
        at = m.char_at
        if at < 0:
            at = line_char_offset(m.page, m.col, m.word_off)
            m.char_at = at
        if m.line < 1 or not word:
            card.skipped = 'no_line_or_word'
            skip += 1
            continue
        im, score, how = crop_at_offset(
            m.page, m.col, m.line, word, at, scale=3.0, spread=8)
        card.how = how
        if im is None:
            card.skipped = f'crop_failed:{how}'
            skip += 1
            continue
        card.crop = _b64(im)
        whole_im, _, _ = crop_at_offset(
            m.page, m.col, m.line, word, at, scale=1.6, whole=True)
        card.whole = _b64(whole_im) if whole_im is not None else ''
        ok += 1
    return ok, skip


def html(cards: list[Card], out: Path = PAGE) -> Path:
    parts = []
    for card in cards:
        m = card.exemplar
        opts = options_for(card)
        warn = ''
        if card.how and card.how != 'text':
            warn = (
                '<div class="warnflag">⚠ this crop was placed by geometry, not '
                'by matching the line text — check it against the printed line'
                '</div>'
            )
        if card.skipped:
            warn += (
                f'<div class="warnflag">⚠ crop skipped: {card.skipped} — '
                f'do not rule without the ink</div>'
            )
        prop_html = ''
        if card.proposal:
            p = card.proposal
            prop_html = (
                f'<div class="why">siglum.holds proposes '
                f'<b class="gk">{p.get("form", "")}</b> — '
                f'{p.get("reason", "")}. '
                f'Work {p.get("work", "")} '
                f'({p.get("lo", "?")}–{p.get("hi", "?")}) · '
                f'Bekker {p.get("bekker_page", "?")}. '
                f'This is evidence, not a settlement.</div>'
            )
        readers = m.readers
        rline = ' · '.join(
            f'{n}=<span class="gk">{readers[n]}</span>'
            for n in ('opus', 'kraken', 'codex', 'genie', 'llama')
            if n in readers
        )
        buttons = []
        for o in opts:
            cls = 'keep' if o['verdict'] == 'preserve' else 'fix'
            if o.get('kind') in ('proposal', 'proposal-preserve'):
                cls += ' go'
            buttons.append(
                f'<button class="{cls}" '
                f'onclick="rule({card.sid!r},{o["verdict"]!r},{o["detail"]!r},this)">'
                f'<span class="gk">{o["label"]}</span>'
                f'<span class="sub2">{o["consequence"]}</span>'
                f'</button>'
            )
        locs = ', '.join(
            f'{x.page:03d}-{x.col}:{x.line}' for x in card.members[:6])
        if card.n > 6:
            locs += f' · +{card.n - 6} more'
        parts.append(f"""
<div class="card" id="{card.sid}">
  <div class="loc">{card.n} site{"s" if card.n != 1 else ""} · {locs}</div>
  <div class="said gk">{"  /  ".join(card.form_set)}</div>
  <div class="why">kind {m.kind} · {m.reason}</div>
  <div class="why">{rline}</div>
  {prop_html}
  {warn}
  <div class="crops">
    <div class="scrollcrop">
      <img src="data:image/png;base64,{card.crop}" alt="the printed word">
    </div>
    <div class="panhint">drag the scan sideways · pinch to zoom</div>
    <details><summary>the whole printed line</summary>
      <div class="scrollcrop">
        <img src="data:image/png;base64,{card.whole}" alt="the whole line">
      </div>
    </details>
  </div>
  <div class="ask">What does the ink read?</div>
  <div class="rec">
    {"".join(buttons)}
  </div>
  <div class="reclbl">One ruling applies to all {card.n} site{"s" if card.n != 1 else ""}
    with this form-set.</div>
</div>""")

    # Extra CSS for consequence subtitles on every button.
    extra = """
button{display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;
  text-align:left;width:100%;max-width:36rem}
button .sub2{font-size:.82rem;font-weight:400;opacity:.9;line-height:1.3}
/* ⚠ `classList.add('done')` STYLED NOTHING. The click recorded a ruling and
   the card looked exactly as it had a moment before, so on a 300-card phone
   queue there was no way to see where you were or that a tap had registered.
   An adjudication tool that does not show its own state makes the reader do
   the bookkeeping — which is the same defect as asking him to type. */
.card.done{opacity:.45;border-color:#3a7d44}
.card.done .crop{filter:grayscale(1)}
.card.done button{pointer-events:none}
.card.done .chosen{opacity:1;background:#3a7d44;color:#fff;font-weight:600}
.card.done::after{content:'✓ ruled';position:absolute;top:.5rem;right:.7rem;
  color:#3a7d44;font-weight:700;font-size:.9rem;letter-spacing:.04em}
.card{position:relative}
.rec{display:flex;flex-direction:column;gap:.55rem;margin:.4rem 0 .6rem}
.ask{font:600 1.15rem/1.3 Superclarendon,Rockwell,Georgia,serif;
  margin:1rem 0 .7rem}
"""
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        '<!doctype html><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,'
        'maximum-scale=5">'
        '<title>Settle queue — what does the ink read?</title>'
        f'<style>{_BASE_CSS}{MOBILE_CSS}{extra}</style>'
        '<header><h1>What does the ink read?</h1>'
        f'<span id="count">0 / {len(cards)} ruled</span></header>'
        f'<main>{"".join(parts)}</main>'
        # book_review.JS posts {id, verdict, detail} to /ruling — same shape.
        '<script>\n'
        "if(location.protocol==='file:'){\n"
        "  const b=document.createElement('div');\n"
        "  b.style.cssText='background:var(--warn);color:#fff;padding:.7rem 1.2rem;"
        "font:14px Charter,Georgia,serif';\n"
        "  b.textContent='Not being saved — open via "
        "python3 -m bonitz_pipeline.settle_review --wifi';\n"
        "  document.body.prepend(b);\n"
        "}\n"
        "const done={};\n"
        "async function rule(sid,verdict,detail,btn){\n"
        "  const card=btn.closest('.card');\n"
        "  card.querySelectorAll('button').forEach(b=>"
        "b.setAttribute('aria-pressed','false'));\n"
        "  btn.setAttribute('aria-pressed','true');\n"
        "  card.classList.add('done'); done[sid]={verdict,detail};\n"
        "  if(btn) btn.classList.add('chosen');\n"
        "  document.getElementById('count').textContent=\n"
        "    Object.keys(done).length+' / '+"
        "document.querySelectorAll('.card').length+' ruled';\n"
        "  try{ await fetch('/ruling',{method:'POST',"
        "headers:{'Content-Type':'application/json'},\n"
        "       body:JSON.stringify({id:sid,verdict,detail})}); }\n"
        "  catch(e){ /* saved only when served */ }\n"
        "}\n"
        '</script>',
        encoding='utf-8',
    )
    return out


def cards_from_queue(path: Path = DEFAULT_QUEUE) -> list[Card]:
    return group_entries(load_queue(path))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    p.add_argument('--serve', action='store_true')
    p.add_argument('--wifi', action='store_true')
    p.add_argument('--port', type=int, default=8793)
    p.add_argument('--no-crops', action='store_true',
                   help='build the page without cropping (fast structure check)')
    a = p.parse_args(argv)

    if not a.queue.exists():
        print(f'not found: {a.queue}', file=sys.stderr)
        return 2

    cards = cards_from_queue(a.queue)
    n_skip = 0
    if a.no_crops:
        print(f'{len(cards)} cards (crops skipped)')
    else:
        n_ok, n_skip = fill_crops(cards)
        print(f'{len(cards)} cards · crops ok={n_ok} skipped={n_skip}')
    html(cards)
    print(f'-> {PAGE}')
    n_prop = sum(1 for c in cards if c.proposal)
    print(f'  form-sets: {len(cards)}')
    print(f'  with siglum proposal: {n_prop}')
    print(f'  total sites: {sum(c.n for c in cards)}')
    if n_skip:
        print(f'  ⚠ {n_skip} cards have no ink crop — do not serve those for ruling')
    if a.serve or a.wifi:
        serve(cards, a.port, '0.0.0.0' if a.wifi else '127.0.0.1',
              page=PAGE, store=RULINGS, verdicts=VERDICTS)
    return 0


if __name__ == '__main__':
    sys.exit(main())
