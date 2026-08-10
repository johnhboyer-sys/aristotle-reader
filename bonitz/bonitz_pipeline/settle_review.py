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
from bonitz_pipeline.siglum_check import BOOK_LETTERS
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


# Book-numeral alphabet plus final sigma (the misread of stigma). A token
# made only of these is a numeral-slot form, not a word like τίς (acute) or
# πῶς (circumflex) — those carry marks outside this set.
_NUMERAL_CHARS = set(BOOK_LETTERS + 'ς')


def is_numeral_form(form: str) -> bool:
    """True when every character is a book-numeral letter (or misread ς)."""
    return bool(form) and all(c in _NUMERAL_CHARS for c in form)


def encoding_only_form_set(forms: list[str] | tuple[str, ...]) -> bool:
    """True when the only dispute is ς vs ϛ on a numeral form.

    That is a codepoint choice, not an ink ruling — numeral_fix settles it.
    Leaving it in the queue makes John hand-rule what a sweep already knows.
    """
    forms = list(forms)
    if len(forms) < 2:
        return False
    if not any('ς' in f for f in forms):
        return False
    folded = {f.replace('ς', 'ϛ') for f in forms}
    if len(folded) != 1:
        return False
    return all(is_numeral_form(f.replace('ς', 'ϛ')) for f in forms)


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

# ⚠ THE FONT WILL NOT SEPARATE THESE, AND THE INK DOES. John, 2026-08-10:
# "i can't tell stigma from sigma in the card font. i can tell the diff in the
# ink though." A card that shows him two glyphs he cannot distinguish has
# handed the decision back to the tool's typography — and `ϛ` against `ς` is
# the single most consequential pair in this index, because one is the numeral
# 6 and the other is a letter with no value. `siglum_review` already learned
# this and marks them; naming them in words needs no font at all.
CONFUSABLE = {'ϛ': 'stigma = 6', 'ς': 'final sigma, no value',
              'ι': 'iota', 'ί': 'iota acute', 'υ': 'upsilon',
              'ο': 'omicron', 'θ': 'theta', 'β': 'beta', 'δ': 'delta',
              'γ': 'gamma', 'η': 'eta', 'ν': 'nu', 'κ': 'kappa',
              'π': 'pi', 'ρ': 'rho', 'Ρ': 'Rho (Greek)', 'P': 'P (Latin)',
              'Η': 'Eta (Greek)', 'H': 'H (Latin)', 'Μ': 'Mu (Greek)',
              'M': 'M (Latin)'}


MARK_NAMES = [('\u0314', 'rough'), ('\u0313', 'smooth'), ('\u0342', 'circumflex'),
              ('\u0301', 'acute'), ('\u0300', 'grave'), ('\u0345', 'iota sub'),
              ('\u0308', 'diaeresis')]


def marks_on_ligature(form: str) -> str:
    """Spell out every mark a form carries, when it sits on a ligature.

    ⚠ TWO COMBINING MARKS OVER `ȣ` DO NOT RENDER. John, 2026-08-10, reading a
    card that held `ȣ̔͂` — OU + rough + circumflex, which is οὗ: the browser drew
    something he first took for an apostrophe, and the headline looked like a
    bare circumflex with the ROUGH BREATHING INVISIBLE. The stored form was
    right and his ruling would have been right, but he could not see what he
    was agreeing to, which is the same defect as the stigma he could not tell
    from a final sigma. The ink is legible; our rendering of it is not.
    """
    if not any(c in form for c in 'ȣȢϗ'):
        return ''
    import unicodedata as _u
    d = _u.normalize('NFD', form)
    bits = [name for mark, name in MARK_NAMES if mark in d]
    return ' · ' + ' + '.join(bits) if bits else ''


def name_letters(form: str, other: str) -> str:
    """Name the letters that differ, for pairs a screen font draws alike."""
    if len(form) != len(other):
        return ''
    diff = [(a, b) for a, b in zip(form, other) if a != b]
    bits = [CONFUSABLE[a] for a, b in diff
            if a in CONFUSABLE and b in CONFUSABLE]
    return ' · ' + ', '.join(dict.fromkeys(bits)) if bits else ''



def tally(card: 'Card', form: str) -> str:
    """ ' · 4 of 5 readers' — who actually read this.

    ⚠ `keep as printed` NAMED OPUS'S READING AS THE INK, and Opus is one
    reader. On `Ζιβ / Ζιθ` the crop plainly reads Ζιθ and four of five readers
    said so, but the card offered Opus's Ζιβ under a label asserting it was
    what the page shows — and it was taken. The preserve option is still
    correct and still first, because a misprint must be preservable; what was
    wrong was dressing one reader's guess as the printing.
    """
    # A card groups sites that share a form-set; the reader split is the same
    # question at each, so the first member speaks for the group.
    readers = card.members[0].readers if card.members else {}
    if not readers:
        return ''
    n = sum(1 for v in readers.values() if v == form)
    return f' · {n} of {len(readers)} readers'


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
    # ⚠ FINAL SIGMA IS NOT A NUMBER. In a numeral slot the printed sort is the
    # stigma glyph; storing ς was a codepoint choice, never Bonitz's. Offering
    # "keep as printed · πκς" asserts a reading that cannot be what he meant —
    # stigma is 6, final sigma has no value. State the stigma on the button.
    printed_is_numeral_sigma = bool(
        printed and is_numeral_form(printed) and 'ς' in printed)
    if printed_is_numeral_sigma:
        true_print = printed.replace('ς', 'ϛ')
    else:
        true_print = printed

    forms = list(card.form_set)
    # Always offer the printed form, even if somehow missing from the set.
    # When the codepoint was wrong, offer the true printed sort (stigma).
    offer_printed = true_print if printed_is_numeral_sigma else printed
    if offer_printed and offer_printed not in forms:
        forms = [offer_printed] + forms
    out: list[dict] = []
    # Preserve-as-printed first when a proposal disagrees with it — the
    # diplomatic option must never be buried under authority.
    if offer_printed:
        if printed_is_numeral_sigma:
            # Encoding fix, not a misprint to preserve: corpus becomes stigma.
            out.append({
                'form': true_print,
                'verdict': 'accept',
                'detail': true_print,
                'label': (f'keep as printed · {true_print}'
                          f' · {CONFUSABLE["ϛ"]}'),
                'consequence': (
                    f'corpus becomes {true_print} · final sigma is not a '
                    f'number; the printed sort is stigma'
                ),
                'kind': 'preserve',
            })
        else:
            out.append({
                'form': printed,
                'verdict': 'preserve',
                'detail': printed,
                'label': (f'keep as printed · {printed}'
                          f'{name_letters(printed, next((x for x in card.form_set if x != printed), printed))}'
                          f'{marks_on_ligature(printed)}{tally(card, printed)}'),
                'consequence': (
                    'corpus untouched · recorded as corrigendum if authorities '
                    'disagree with the ink'
                ),
                'kind': 'preserve',
            })
    for f in forms:
        if f == offer_printed:
            continue
        # Never offer final sigma as a reading of a numeral form — it has no
        # numeric value. The stigma button (above or among accepts) is enough.
        if is_numeral_form(f) and 'ς' in f and 'ϛ' not in f:
            continue
        out.append({
            'form': f,
            'verdict': 'accept',
            'detail': f,
            'label': (f'read {f}{describe(f, offer_printed)}'
                      f'{name_letters(f, offer_printed or "")}{tally(card, f)}'),
            'consequence': f'corpus becomes {f} at every site in this group',
            'kind': 'accept',
        })
    # ⚠ THE READERS CANNOT OFFER WHAT NONE OF THEM SAW. John, 2026-08-10, on
    # `πκζ / πκς`: "this is clearly a stigma" — and STIGMA WAS NOT A BUTTON,
    # because the card's options are built from what the readers read and not
    # one of them read ϛ. So the only correct answer could not be given, which
    # is worse than a hard card: it is a card that forces a wrong ruling.
    #
    # ς and ϛ are the same printed sort. Always offer stigma where a form has
    # final sigma. For a NUMERAL form never offer the reverse: final sigma is
    # not a number, so `πκς` must not appear as a live option.
    for f in list(o['form'] for o in out):
        pairs = [('ς', 'ϛ')]
        if not is_numeral_form(f):
            pairs.append(('ϛ', 'ς'))
        for a, b in pairs:
            if a not in f:
                continue
            alt = f.replace(a, b)
            if any(x['form'] == alt for x in out):
                continue
            out.append({
                'form': alt,
                'verdict': 'accept',
                'detail': alt,
                'label': f'read {alt} · {CONFUSABLE[b]}',
                'consequence': (f'no reader read this — offered because '
                                f'{a} and {b} are one sort in the type'),
                'kind': 'accept',
            })

    # Siglum proposal: offer even if already among forms (as the recommended
    # accept), so the evidence is one click.
    if card.proposal and card.proposal.get('form'):
        pf = card.proposal['form']
        if not any(o['form'] == pf and o['verdict'] == 'accept' for o in out):
            if pf != offer_printed:
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


def _arg(v: str) -> str:
    """A Python string as a JS literal, safe inside an HTML attribute.

    ⚠ `{x!r}` IS NOT AN ESCAPER, AND IT KILLED EVERY ELIDED CARD. Python's repr
    switches to DOUBLE quotes when the string contains a single quote, so a
    form like the elided ὅτ' rendered as  onclick="rule(...,"ὅτ'")"  — the
    attribute ended at that inner double quote and the button had no handler at
    all. Perfectly silent: no console error, nothing to see, the click just did
    nothing.

    Elision is everywhere in Bonitz, and the tokenizer fix that admitted these
    forms this morning is what made the cards appear. json.dumps gives a real
    JS literal; escaping & and " makes it safe as an attribute.
    """
    return (json.dumps(v, ensure_ascii=False)
            .replace('&', '&amp;').replace('"', '&quot;'))


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
                f'onclick="rule({_arg(card.sid)},{_arg(o["verdict"])},'
                f'{_arg(o["detail"])},this)">'
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
.card.unsaved{opacity:1;border-color:#b23b3b;border-width:3px}
.card.unsaved::after{content:'NOT SAVED';color:#b23b3b}
#warn{position:sticky;top:0;z-index:99;background:#b23b3b;color:#fff;
  padding:.8rem 1rem;font-weight:700;letter-spacing:.02em}
.card.done .crop{filter:grayscale(1)}
/* ⚠ NOT `pointer-events:none`. Locking a ruled card made a MISCLICK
   PERMANENT from the phone, and John hit one within thirty cards. The tool
   exists to capture his judgment, so it must let him change it; the ✓ and the
   dimming say a ruling was recorded, they do not say it is final. */
.card.done button{cursor:pointer}
.card.done:hover{opacity:.85}
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
        "  card.querySelectorAll('button').forEach(b=>{\n"
        "    b.setAttribute('aria-pressed','false');\n"
        "    b.classList.remove('chosen');\n"
        "  });\n"
        "  btn.setAttribute('aria-pressed','true');\n"
        "  card.classList.add('done'); done[sid]={verdict,detail};\n"
        "  if(btn) btn.classList.add('chosen');\n"
        "  document.getElementById('count').textContent=\n"
        "    Object.keys(done).length+' / '+"
        "document.querySelectorAll('.card').length+' ruled';\n"
        "  try{\n"
        "    const r=await fetch('/ruling',{method:'POST',"
        "headers:{'Content-Type':'application/json'},\n"
        "       body:JSON.stringify({id:sid,verdict,detail})});\n"
        "    if(!r.ok) throw new Error('HTTP '+r.status);\n"
        "    card.dataset.saved='1';\n"
        "  }catch(e){\n"
        # ⚠ THIS CATCH WAS EMPTY AND IT COST JOHN 28 RULINGS. The
        # server was restarted under a tab he was still working in, so
        # every POST failed, every card still went green, and nothing
        # said a word. A card that LOOKS ruled and is not saved is
        # worse than one that refuses to be clicked.
        "    card.classList.add('unsaved'); card.classList.remove('done');\n"
        "    let w=document.getElementById('warn');\n"
        "    if(!w){ w=document.createElement('div'); w.id='warn';\n"
        "      document.body.prepend(w); }\n"
        "    w.textContent='NOT SAVED - the server is not answering. "
        "Nothing you click is being recorded. Reload once it is back.';\n"
        "  }\n"
        "}\n"
        '</script>',
        encoding='utf-8',
    )
    return out


def record_ruling(store: Path, sid: str, verdict: str, detail: str = '') -> dict:
    """Write one ruling by sid. A second click REPLACES the first — never appends.

    The serve handler assigns `have[sid] = {...}`. That is the whole contract:
    one key, last write wins, no list of history. John re-rules after a
    misclick; the store must not keep both.
    """
    have = (json.loads(store.read_text(encoding='utf-8'))
            if store.exists() else {})
    have[sid] = {'verdict': verdict, 'detail': detail}
    store.parent.mkdir(parents=True, exist_ok=True)
    store.write_text(json.dumps(have, ensure_ascii=False, indent=1) + '\n',
                     encoding='utf-8')
    return have


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
    # Pure ς/ϛ numeral form-sets are encoding, not ink. Drop them from the
    # page John sees (numeral_fix owns them) but leave them in the queue JSON
    # so an already-recorded ruling still resolves under settle_apply.
    n_encoding = sum(1 for c in cards if encoding_only_form_set(c.form_set))
    cards = [c for c in cards if not encoding_only_form_set(c.form_set)]
    n_skip = 0
    if a.no_crops:
        print(f'{len(cards)} cards (crops skipped)')
    else:
        n_ok, n_skip = fill_crops(cards)
        print(f'{len(cards)} cards · crops ok={n_ok} skipped={n_skip}')
    if n_encoding:
        print(f'  dropped {n_encoding} encoding-only numeral card'
              f'{"s" if n_encoding != 1 else ""} (ς/ϛ)')
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
