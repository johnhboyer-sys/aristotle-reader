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
import functools
import json
import re
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

# ⚠ THE TYPED ESCAPE IS DELIBERATELY QUIET. It is folded shut, greyed, and sits
# under every button — the buttons are the answer wherever an answer exists,
# and a text box competing with them for attention is how "no typing" stops
# being true in practice.
TYPED_CSS = """
details.typed{margin:.4rem 0 0;font:14px Charter,Georgia,serif;opacity:.72}
details.typed summary{cursor:pointer;padding:.5rem .2rem;color:var(--muted)}
.typedrow{display:flex;gap:.5rem;margin:.35rem 0 .2rem}
.typedrow input{flex:1;min-width:0;padding:.75rem .6rem;
  font:17px Charter,Georgia,serif;border:1px solid var(--rule);
  border-radius:6px;background:var(--bg);color:var(--fg)}
.typedrow button{flex:0 0 auto;padding:.75rem .9rem}
.palette{display:flex;flex-flow:row nowrap;gap:.3rem;margin:.45rem 0 .1rem;
  align-items:stretch;justify-content:flex-start;
  overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:.2rem}
.spellout{font:12px ui-monospace,Menlo,monospace;color:var(--muted);
  min-height:1.1em;margin:.15rem 0 .1rem}
.spellout b{color:var(--fg);font-weight:600}
/* ⚠ EVERY BUTTON ON THIS PAGE IS `width:100%`. The option buttons are meant to
   be full-width plates, so the bare `button` rule sets width and max-width —
   and the palette keys inherited it, which is why a row of eleven sorts came
   out as a column of eleven plates twice over. `display` was never the
   problem: a 100%-wide inline-flex still fills its line. John, 2026-08-30:
   "lay these out in one single row." So the keys take back their own width,
   and the row scrolls sideways rather than wrapping. */
.palette .sort{display:inline-flex;flex-direction:column;align-items:center;
  gap:.1rem;width:auto;max-width:none;flex:0 0 auto;
  min-width:3.1rem;padding:.45rem .3rem;line-height:1.15;cursor:pointer;
  text-align:center;
  border:1px solid var(--line);border-radius:.35rem;background:var(--bg)}
.palette .sort .gk{font-size:1.25rem}
.palette .sort small{font-size:10px;color:var(--muted);white-space:nowrap}
.palette .sort.del{margin-left:auto}
details.corr{opacity:1}
details.corr summary{color:var(--keep,#b8862b);font-weight:600}
"""

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_QUEUE = ROOT / 'work' / 'queue-053-062.json'
PAGE = ROOT / 'work' / 'sweeps' / 'settle-review.html'
RULINGS = ROOT / 'work' / 'sweeps' / 'settle-rulings.json'
# Per-member ink, cut to files and served one by one. ⚠ NEVER inlined: 56
# base64 crops once made a 17 MB page the browser would not render, and a
# bundled card here can carry sixty. `work/sweeps/crops/` is gitignored.
CROPS = ROOT / 'work' / 'sweeps' / 'crops' / 'settle'
OPUS = ROOT / 'raw' / 'opus'
READ_COLS = ROOT / 'work' / 'kraken400' / 'read' / 'cols'
# ⚠ 107+ HAS NO COLUMN IMAGE. That tranche was read line by line out of the
# compiled arrow, so what exists on disk is one PNG per printed line and a
# `read.json` naming the columns in the order the lines were cut. Nothing is
# re-cut here: hand-cut crops have produced a garbage read twice in this
# project. [[calamari-images-come-from-the-arrow]]
LINE_READS = (ROOT / 'work' / 'calamari' / 'read107-112',
              ROOT / 'work' / 'calamari' / 'read113-117')
READ_ALTO = ROOT / 'work' / 'kraken400' / 'read' / 'alto'
READ_ALTO_R5 = ROOT / 'work' / 'kraken400' / 'read' / 'alto-r5'

# --- which reader the card calls "printed" -----------------------------------
# On 15-106 that is Opus, and these defaults keep every existing queue reading
# exactly the file it always read.  A COLD TRANCHE HAS NO OPUS FILE BY DESIGN —
# the point of 107+ is that Opus reads it blind, after John's ground truth v1
# exists — so the spine there is kraken round 6's filtered column text, and the
# source has to be a switch rather than a constant.  `use_spine` is the only
# way to move it; nothing here changes unless a caller says so.
SPINE_DIR = OPUS
SPINE_CLEAN = clean_opus
EXTRA_ALTO_DIRS: list[Path] = []
# What the card CALLS the spine. The queue key stays `opus` because
# `word_flags` requires it; the label must not, or a card would tell John that
# Opus read a page Opus has never seen.
SPINE_LABEL = 'opus'


def use_spine(text_dir: Path, cleaner=None, alto_dirs: list[Path] | None = None,
              label: str = 'opus') -> None:
    """Point the cards at a spine other than Opus.

    ⚠ The cleaner must match the source. `clean_opus` strips the running
    furniture Opus transcribes; kraken's filtered text has none of it and
    passing it through the Opus cleaner would silently eat printed lines.
    """
    global SPINE_DIR, SPINE_CLEAN, EXTRA_ALTO_DIRS, SPINE_LABEL
    SPINE_DIR = text_dir
    SPINE_CLEAN = cleaner if cleaner is not None else (lambda t: t)
    EXTRA_ALTO_DIRS = list(alto_dirs or [])
    SPINE_LABEL = label



def read_alto(col_key: str) -> Path | None:
    """The ALTO for a column, round 5 first.

    ⚠ THE ROUND-3 DIRECTORY STOPS AT PAGE 091 and pages 63-102 are reconciled,
    so every column past 91 had no line geometry and `crop_at_offset` fell back
    to dividing the column into equal slices — a crop that can be the wrong
    line entirely with nothing to tell a reader so. `alto-r5` covers 063-110
    and is the better read where both exist (0.9952 against 0.9920), so it is
    preferred rather than merely filling the gap.
    """
    for d in EXTRA_ALTO_DIRS:
        extra = d / f'{col_key}.xml'
        if extra.exists():
            return extra
    r5 = READ_ALTO_R5 / f'{col_key}.xml'
    if r5.exists():
        return r5
    old = READ_ALTO / f'{col_key}.xml'
    return old if old.exists() else None
LEGACY_COLS = ROOT / 'work' / 'kraken400' / 'cols'
RECONCILED = ROOT / 'work' / 'reconciled'
ALTO_NS = '{http://www.loc.gov/standards/alto/ns-v4#}'

# Verdicts written in the same shape siglum_apply / book_apply expect:
#   { sid: { "verdict": <str>, "detail": <str> } }
# accept  → corpus becomes `detail` at every member of the form-set
# preserve → keep what is printed (Opus); record as corrigendum when detail set
VERDICTS = ('accept', 'preserve', 'none')


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
    broken: bool = False
    pieces: list = field(default_factory=list)
    crop_name: str = ''        # the file this member's ink was cut to
    crop_how: str = ''
    # ⚠ A BUNDLE'S RULING IS A CHANGE, NOT A FORM, so the form belongs to the
    # MEMBER: `bundle_options` promises "at every site the corpus takes THAT
    # SITE's own form — the words differ, the change does not", and this is
    # where that form travels. `settle_apply` had no way to keep the promise
    # and put the verdict string `bundle:α>a` in `becomes` instead.
    becomes: str = ''

    @property
    def col_key(self) -> str:
        return f'page-{self.page:03d}-{self.col}'

    @property
    def sid(self) -> str:
        return f'{self.col_key}:{self.line}:{self.word_off}'

    @property
    def place(self) -> str:
        """The site without its spine offset — `page-NNN-C:line`.

        ⚠ `word_off` MOVES WHEN THE SPINE IS REBUILT. `latin_spine` swaps
        calamari's line in for kraken's on every mostly-Latin line, which
        shifts every offset after it in that column, so a same-key check that
        compares sids reports 26 answered cards as re-bound and asks John all
        of them again. The printed line does not move: both engines read the
        same 61 filtered lines.
        """
        return f'{self.col_key}:{self.line}'


def site_place(sid: str) -> str:
    """`page-NNN-C:line:word_off` -> `page-NNN-C:line`. See `Member.place`."""
    parts = sid.rsplit(':', 1)
    return parts[0] if len(parts) == 2 else sid


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
    sid_override: str = ''     # a follow-up card is keyed by its SITE
    note: str = ''
    # ⚠ RULED BEFORE THE STRIP EXISTED, SO IT NEVER GETS ONE. John answered 79
    # cards from a single exemplar crop; bolting all 228 member crops onto them
    # afterwards showed him sites he was never asked about, under a green tick,
    # and made one ruling look like a scoped judgement on every site it binds.
    # A strip may only appear on a card that is still open to being scoped.
    ruled_before_strip: bool = False
    # A dispute bundle: one card for ONE substitution asked of many different
    # WORDS, rather than one card per byte-identical form. `{'subs': [[a, b]],
    # 'kind': ..., 'label': ...}`.
    bundle: dict | None = None

    @property
    def sid(self) -> str:
        # ⚠ A FOLLOW-UP CARD MUST NOT SHARE THE GROUP'S KEY. It exists because
        # one site was pulled OUT of that group; keyed the same, answering it
        # would overwrite the group ruling with a single site's answer.
        if self.sid_override:
            return self.sid_override
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


def numeral_card_is_a_word_tail(page: int, col: str, line: int, form: str,
                                spine_dir: Path) -> bool:
    """Does this numeral-shaped token continue a word broken on the line above?

    ⚠ THE LETTERS CANNOT TELL YOU. `τοϛ` is τ 300, ο 70, ϛ 6 and reads as a
    perfectly good numeral, so `encoding_only_form_set` dropped its card as a
    settled codepoint question. But 117-R:8 ends `κατοικίσαν-`, which makes
    this the tail of `κατοικίσαντος` — a word carrying over the measure is
    never a numeral, and the stigma closing it is the whole defect. The card
    vanished off the page and John went looking for it.

    The hyphen joins the FIRST token of the next line and no other, so that is
    the only position asked about. A missing column answers no.
    """
    p = Path(spine_dir) / f'page-{page:03d}-{col}.txt'
    if not p.exists() or line < 2:
        return False
    lines = p.read_text(encoding='utf-8').splitlines()
    if line > len(lines) or not lines[line - 2].rstrip().endswith('-'):
        return False
    here = lines[line - 1].split()
    return bool(here) and here[0].strip('.,;:()[]—·’‘"?!') == form.strip(
        '.,;:()[]—·’‘"?!')


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
        # An entry carrying its own card key is a card of one, never grouped:
        # it is here precisely because it did not belong with its form-set.
        if e.get('card_sid'):
            fkey = ('\x00card', e['card_sid'])
        if fkey not in groups:
            order.append(fkey)
            printed = (e.get('readers') or {}).get('opus') or (
                fkey[0] if fkey else '')
            groups[fkey] = Card(
                form_set=(form_set_key(e.get('form_set') or e.get('forms') or [])
                          if e.get('card_sid') else fkey),
                printed=printed,
                proposal=e.get('proposal'),
                sid_override=e.get('card_sid', ''),
                note=e.get('note', ''),
                bundle=e.get('bundle'),
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
            becomes=e.get('becomes', ''),
            proposal=e.get('proposal'),
            broken=bool(e.get('broken')),
            pieces=list(e.get('pieces') or []),
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
    path = SPINE_DIR / f'page-{page:03d}-{col}.txt'
    if not path.exists() or word_off < 0:
        return -1
    cleaned = SPINE_CLEAN(path.read_text(encoding='utf-8'))
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
    f = read_alto(f'page-{page:03d}-{col}')
    src = READ_COLS / f'page-{page:03d}-{col}.png'
    if f is None or not src.exists():
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


def _alto_word_span(page: int, col: str, want: str, at: int
                    ) -> tuple[int, int, int, int] | None:
    """The BOX of the ALTO word holding character `at` of the printed line.

    ⚠ A PROPORTIONAL POINTER MISSES BY A WORD. `crop_at_offset` placed its rule
    at `x0 + span * at / len(line)`, which assumes every letter is the same
    width; Greek with accents is not, and on 260-R:30 the rule landed under
    `μέλη` while the card asked about `ἐνῇδον` two words along. John,
    2026-08-29: "the red line isn't helping."

    The ALTO already carries a box per word — the same file the line box comes
    from — so the position is a MEASUREMENT and not an estimate. `at` indexes
    the spine's line, the ALTO is a different read of it, so the offset is
    carried across on matching blocks rather than assumed to be the same index.

    ⚠ THE LINE BOX CANNOT BOUND A MARK. On 231-L the pitch is 56px and the
    ALTO line boxes are 82-109px, so consecutive lines OVERLAP by thirty to
    fifty pixels — line 60 runs 3270-3354 and line 61 runs 3308-3417. Anything
    drawn to the height of a line box therefore lands on its neighbour, which
    is how a tint meant for `εἴδωλον.` came out over `εἰδότως` as well. John,
    2026-08-30: "you just showed a highlight on two lines." The String carries
    its own VPOS and HEIGHT; that box is the only one tight enough.

    Returns None when nothing lines up, and the proportional estimate stands as
    it did — this narrows the pointer, it never widens the claim.
    """
    import xml.etree.ElementTree as ET
    f = read_alto(f'page-{page:03d}-{col}')
    if f is None or at is None or at < 0 or not want:
        return None
    best: tuple[float, list, str] | None = None
    for tl in ET.parse(f).getroot().iter(f'{ALTO_NS}TextLine'):
        strings = list(tl.iter(f'{ALTO_NS}String'))
        text = ' '.join(s.get('CONTENT', '') for s in strings)
        if not text:
            continue
        r = difflib.SequenceMatcher(None, canonical(want)[0],
                                    canonical(text)[0], autojunk=False).ratio()
        if best is None or r > best[0]:
            best = (r, strings, text)
    if best is None or best[0] < 0.6:
        return None
    _, strings, text = best
    target = None
    for a, b, size in difflib.SequenceMatcher(
            None, want, text, autojunk=False).get_matching_blocks():
        if a <= at < a + size:
            target = b + (at - a)
            break
    if target is None:
        return None
    pos = 0
    for s in strings:
        content = s.get('CONTENT', '')
        if pos <= target < pos + len(content):
            h, w = int(s.get('HPOS', 0)), int(s.get('WIDTH', 0))
            v, ht = int(s.get('VPOS', 0)), int(s.get('HEIGHT', 0))
            return (h, v, h + w, v + ht) if w > 0 and ht > 0 else None
        pos += len(content) + 1
    return None


@functools.lru_cache(maxsize=None)
def _line_read_index() -> dict:
    """(col_key, line) -> (image path, the line as that read transcribed it).

    ⚠ THE INDEX IS THE ARROW'S OWN ORDER, so this is not a guess about which
    line an image shows: the images were cut in column order, sixty-one to a
    column, and `read.json` lists the columns in that order. Placement by this
    map is exact, where an ALTO box is a text match and an equal slice is
    arithmetic.
    """
    out: dict = {}
    for d in LINE_READS:
        man = d / 'read.json'
        if not man.exists():
            continue
        cols = json.loads(man.read_text(encoding='utf-8')).get('columns') or {}
        i = 0
        for col_key, lines in cols.items():
            for n, text in enumerate(lines, start=1):
                out[(col_key, n)] = (d / 'images' / f'{i:05d}.png', text)
                i += 1
    return out


def crop_at_offset(
        page: int,
        col: str,
        line: int,
        word: str,
        at: int,
        *,
        # ⚠ UPSCALING ADDS NO INFORMATION AND COST 9x THE PIXELS. This was
        # 3.0, from when `_b64` reduced every crop to fourteen greys and the
        # bytes did not show. With the crop emitted as the scan holds it
        # (John, 2026-09-01: "no highlight or enhancement") a 150-card sitting
        # came out at 253 MB and would not load on his phone at all.
        # LANCZOS cannot invent ink the scan does not have; the browser
        # enlarges the same pixels at display time, and he pinch-zooms anyway.
        scale: float = 1.0,
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

    # ⚠ THE LINE-IMAGE LAYOUT, tried before the column one because 107+ has no
    # column image at all and used to fall straight through to `none` — which
    # is a site John cannot rule on, and the book review had two of them.
    if line >= 1:
        hit = _line_read_index().get((col_key, line))
        if hit is not None and hit[0].exists():
            return _crop_line_image(hit, word, at, scale=scale, spread=spread,
                                    whole=whole)

    src = READ_COLS / f'{col_key}.png'
    txt = SPINE_DIR / f'{col_key}.txt'
    if not src.exists() or not txt.exists() or line < 1:
        return None, 0.0, 'none'
    lines = unicodedata.normalize(
        'NFC', SPINE_CLEAN(txt.read_text(encoding='utf-8'))).splitlines()
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
        f = read_alto(col_key)
        if f is not None:
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
    # The mark is the RAW proportional span. `spread` widens the crop, not the
    # pointer: a rule eight pads wide names half the line and points at
    # nothing.
    if at is None or at < 0 or not want.strip():
        mark = None
    else:
        # The ALTO's own word box where it has one; the estimate where it does
        # not. `how` gains `+word` so the card never dresses one as the other.
        wbox = _alto_word_span(page, col, want, at)
        if wbox is not None:
            how = f'{how}+word'
            mark = (wbox[0], wbox[2])
        else:
            span = x1 - x0
            mark = (x0 + int(span * at / len(want)),
                    x0 + int(span * (at + len(word)) / len(want)))
            wbox = (mark[0], y0, mark[1], y1)

    use_at = -1 if whole else at
    if use_at is None or use_at < 0 or mark is None:
        wx0, wx1 = x0, x1
    else:
        wx0, wx1 = mark[0] - pad * spread, mark[1] + pad * spread
    box = (max(0, wx0), max(0, y0 - pad),
           min(im.width, max(wx1, wx0 + 60)), min(im.height, y1 + pad))
    c = im.crop(box)
    if mark is not None and MARK_WORD:
        # The crop is padded above and below, so it carries the neighbouring
        # lines too. Draw under the TARGET line — the bottom of its own box —
        # or the rule lands beneath a word nobody asked about.
        c = _mark_word(c, wbox[0] - box[0], wbox[2] - box[0],
                       wbox[1] - box[1], wbox[3] - box[1])
    if c.width and c.height:
        c = c.resize((int(c.width * scale), int(c.height * scale)),
                     Image.LANCZOS)
    return c, score, how



def _crop_line_image(hit, word: str, at: int, *, scale: float, spread: int,
                     whole: bool) -> tuple[object, float, str]:
    """Crop within one printed line's own image.

    ⚠ `how` IS `line`, WHICH IS STRONGER THAN `text`, NOT WEAKER. The rule the
    review page keeps is that a crop must never be able to show the wrong line,
    because a reader cannot tell and clicks "unsure". A text-matched ALTO box
    satisfies that by similarity; this image IS the line, cut from the arrow
    the recogniser read. There is no line to be wrong about.

    The horizontal mark is still a PROPORTIONAL pointer, exactly as elsewhere —
    the card prints `how` beside it so the estimate is never read as a
    measurement.
    """
    path, read_text = hit
    im = Image.open(path)
    x0, y0, x1, y1 = 0, 0, im.width, im.height
    # ⚠ THE SCORE ANSWERS "IS THE TARGET ON THIS LINE", not "do two strings
    # look alike". Comparing a six-character token against a sixty-character
    # line scores 0.08 however perfectly the crop is placed, and a review page
    # that prints that number teaches its reader to distrust a good crop.
    ftok, fline = canonical(word)[0], canonical(read_text)[0]
    score = 1.0 if ftok and ftok in fline else difflib.SequenceMatcher(
        None, fline, ftok, autojunk=False).ratio() if ftok else 0.0

    pad = int(im.height * 0.12)
    mark = None
    if not whole and at is not None and at >= 0 and read_text.strip():
        span = x1 - x0
        n = len(read_text)
        mark = (int(span * at / n), int(span * (at + max(1, len(word))) / n))
    if mark is None:
        wx0, wx1 = x0, x1
    else:
        wx0, wx1 = mark[0] - pad * spread, mark[1] + pad * spread
    box = (max(0, wx0), 0, min(im.width, max(wx1, wx0 + 60)), im.height)
    c = im.crop(box)
    if mark is not None and MARK_WORD:
        # This crop IS one line — the image has no neighbours to bleed onto,
        # so the band is the whole of it.
        c = _mark_word(c, mark[0] - box[0], mark[1] - box[0], 0, im.height)
    if c.width and c.height:
        c = c.resize((int(c.width * scale), int(c.height * scale)),
                     Image.LANCZOS)
    return c, score, 'line'


def _mark_word(im, a: int, b: int, top: int, bottom: int):
    """Tint the paper behind the target word. Draw nothing over the ink.

    ⚠ THREE POINTERS FAILED BEFORE THIS ONE, each covering the thing the card
    was asking about.

    A RULE UNDER THE WORD sat on the iota subscript at 260-R:30, where the
    subscript was the whole question; its end ticks rose into the descenders;
    and drawn at the ALTO box's bottom edge it landed on the NEXT line's
    capitals. John, 2026-08-29: "the red line isn't helping."

    FULL-HEIGHT VERTICALS then named no line. 231-L:61 asks about `εἴδωλον.`;
    the line above reads `εἰδότως v εἰδέναι.`, same left margin and near enough
    the same width, so the brackets fitted both and the ruling came back
    `εἰδότως`. Bounding them to the line did not help either — John,
    2026-08-30: "the vertical bands thing is not helping." He chose the wash.

    ⚠ AND THE WASH ARRIVED ON TWO LINES, for the reason every one of these
    failed: A LINE BOX IS NOT A LINE. On 231-L the pitch is 56px and the boxes
    are 82-109px, so they overlap by thirty to fifty pixels. The box for the
    WORD is the only one tight enough, and even that is generous at the
    ascender and descender — so the tint takes the core of it, not the whole.

    It is a BLEND, never a fill: the letters keep their own darkness and only
    the paper changes colour.
    """
    from PIL import Image
    a, b = max(0, min(a, im.width)), max(0, min(b, im.width))
    top, bottom = max(0, min(top, im.height)), max(0, min(bottom, im.height))
    if b - a < 4 or bottom - top < 6:
        return im
    # ⚠ NEUTRALISE THE SCAN FIRST, or the tint has nothing to be distinct
    # from. The paper is cream — warmer, in places, than the wash itself —
    # so a palette built to hold both sent plain paper to the washed
    # entries and the whole crop came out yellow with no highlight in it.
    # The page has always shown these as grey line images; now grey is also
    # what makes the one coloured thing on the card unmistakable.
    im = im.convert('L').convert('RGB')
    # The ascender and descender allowance is where neighbouring boxes meet.
    inset = int((bottom - top) * WASH_INSET)
    y0, y1 = top + inset, bottom - inset
    x0, x1 = max(0, a - 3), min(im.width, b + 3)
    if x1 - x0 < 2 or y1 - y0 < 2:
        return im
    region = im.crop((x0, y0, x1, y1))
    wash = Image.new('RGB', region.size, WASH)
    im.paste(Image.blend(region, wash, WASH_STRENGTH), (x0, y0))
    return im


# The pointer's tint: pale enough that the ink keeps its own weight.
# Every sort the printers used for elision, in one place.
ELISION = "'’ʼ᾽ʾ"

# ⚠ THE TINT IS OFF. Every colour trick this page has tried has cost more ink
# than it bought attention — greyscale killed the pointer, a fixed palette
# blotched the paper, an adaptive one lost the wash, and fourteen greys hid a
# cream-paper assumption that ghosted the running head at 127-R:1. John,
# 2026-09-01: "just give the crop with no highlight or enhancement."
# The word is named in the card's text and the crop is cut around it; the
# paper does not also have to be painted. Set True to put the wash back.
MARK_WORD = False

WASH = (255, 236, 140)
# ⚠ A BLEND SCALES CONTRAST BY (1 - strength). At 0.42 a black stroke came out
# at 112 against paper at 250 — visible, but the faintest thing on these cards
# is an iota subscript the size of a speck, and that is exactly what a card
# turns on. 0.26 keeps nearly three quarters of the ink's contrast and still
# reads as a highlight.
WASH_STRENGTH = 0.26
# Trimmed off each end of the word box, where neighbouring boxes overlap.
WASH_INSET = 0.16

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
              'π': 'pi', 'ρ': 'rho (Greek)', 'Ρ': 'Rho (Greek)',
              'P': 'P (Latin)', 'p': 'p (Latin)',
              'Η': 'Eta (Greek)', 'H': 'H (Latin)', 'Μ': 'Mu (Greek)',
              'M': 'M (Latin)',
              # ⚠ THE LOWERCASE PAIRS WERE MISSING and they are the ones that
              # actually cost a site. `(ρΓα3)` against `(pΓα3)` is one italic
              # letter; without a word on the button the two options are the
              # same picture. John ruled four of these from crops because the
              # card could not say which was which.
              'χ': 'chi (Greek)', 'x': 'x (Latin)',
              'ο': 'omicron (Greek)', 'o': 'o (Latin)',
              'α': 'alpha (Greek)', 'a': 'a (Latin)',
              'ν': 'nu (Greek)', 'v': 'v (Latin)',
              'ζ': 'zeta (Greek)', 'z': 'z (Latin)',
              'Α': 'Alpha (Greek)', 'A': 'A (Latin)',
              'Ζ': 'Zeta (Greek)', 'Z': 'Z (Latin)',
              'Ο': 'Omicron (Greek)', 'O': 'O (Latin)',
              # ⚠ THE FOUR CAPITALS `encoding_check` ACTUALLY REPORTS and this
              # map did not hold. Its weak tier — single sorts whose Greek and
              # Latin forms are one piece of type — is exactly ΑΒΖΙΚΜΧο, and
              # A Z M O were here while B I K X were not. So `Bran` against
              # `Βran` drew two identical buttons, which is an "unsure" click
              # waiting to happen and a defect in the tool, not in the reader.
              'Β': 'Beta (Greek)', 'B': 'B (Latin)',
              'Ι': 'Iota (Greek)', 'I': 'I (Latin)',
              'Κ': 'Kappa (Greek)', 'K': 'K (Latin)',
              'Χ': 'Chi (Greek)', 'X': 'X (Latin)',
              # ⚠ THE MAP HAS BEEN WIDENED FOUR TIMES, each time only to the
              # pair that had just bitten, and each time the next card fell
              # through for the same reason. `Νικομάχεια` against
              # `Nικομάχεια` drew two identical buttons on 113-L:37, and `Tὰ`
              # against `Τὰ` on 113-L:7. So the WHOLE set of Greek capitals
              # whose Latin twin is one piece of type is here now — ΑΒΕΖΗΙΚΜΝ
              # ΟΡΤΥΧ — and `test_confusable_capitals` pins every one, so a
              # fifth widening is a test failure and not a ruined sitting.
              'Ε': 'Epsilon (Greek)', 'E': 'E (Latin)',
              'Ν': 'Nu (Greek)', 'N': 'N (Latin)',
              'Τ': 'Tau (Greek)', 'T': 'T (Latin)',
              'Υ': 'Upsilon (Greek)', 'Y': 'Y (Latin)'}


MARK_NAMES = [('\u0314', 'rough'), ('\u0313', 'smooth'), ('\u0342', 'circumflex'),
              ('\u0301', 'acute'), ('\u0300', 'grave'), ('\u0345', 'iota sub'),
              ('\u0308', 'diaeresis')]


def religate(form: str) -> str:
    """`οὖσα` -> `ȣ̓͂σα`: ου written out, put back as the sort, marks intact."""
    import unicodedata as _u
    d = _u.normalize('NFD', form)
    out, i = [], 0
    while i < len(d):
        if d[i] in 'οΟ':
            j = i + 1
            marks = ''
            while j < len(d) and _u.combining(d[j]):
                marks += d[j]; j += 1
            if j < len(d) and d[j] in 'υΥ':
                k = j + 1
                while k < len(d) and _u.combining(d[k]):
                    marks += d[k]; k += 1
                out.append('ȣ' + marks)
                i = k
                continue
        out.append(d[i]); i += 1
    return _u.normalize('NFC', ''.join(out))


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
    """Name the letters that differ, for pairs a screen font draws alike.

    ⚠ IT NAMED NOTHING WHEN THE LENGTHS DIFFERED, and that is where the worst
    case lives. `πκϛ58` against `πκ` is Problemata book 26 against book 20 —
    the entire difference is one sort the screen barely draws — and the card
    offered both with no word to separate them. John clicked `none`: "no clue
    what you are asking". A numeral sort carries a VALUE, so it is named
    wherever it stands, present or absent, not only when a same-length rival
    disagrees with it.
    """
    bits: list[str] = []
    if len(form) == len(other):
        diff = [(a, b) for a, b in zip(form, other) if a != b]
        bits = [CONFUSABLE[a] for a, b in diff
                if a in CONFUSABLE and b in CONFUSABLE]
    else:
        # The characters one form has and the other does not.
        for ch in form:
            if ch in CONFUSABLE and ch not in other:
                bits.append(CONFUSABLE[ch])
    # Stigma and final sigma are ONE SHAPE and different values. In a numeral
    # or siglum slot that difference is the whole question, so name it whether
    # or not the rival happens to disagree there.
    if is_numeral_form(form):
        for ch in ('ϛ', 'ς'):
            if ch in form and CONFUSABLE[ch] not in bits:
                bits.append(CONFUSABLE[ch])
    named = ' · ' + ', '.join(dict.fromkeys(bits)) if bits else ''
    return named or name_marks(form, other)


def at_margin_end(member: 'Member', printed: str) -> bool:
    """Is this site the one token of its line that could hold the margin number?

    Bonitz prints the line number in the INNER margin: the END of a left
    column's line, the START of a right column's. Only the token at that end
    can have taken it into the text.

    ⚠ A MISSING COLUMN ANSWERS NO, like `numeral_card_is_a_word_tail`. The
    offer proposes to delete letters, so silence must withhold it rather than
    grant it.
    """
    if SPINE_DIR is None:
        return False
    p = Path(SPINE_DIR) / f'page-{member.page:03d}-{member.col}.txt'
    if not p.exists() or member.line < 1:
        return False
    lines = p.read_text(encoding='utf-8').splitlines()
    if member.line > len(lines):
        return False
    toks = lines[member.line - 1].split()
    if not toks:
        return False
    edge = toks[0] if member.col == 'R' else toks[-1]
    strip = '.,;:()[]—·’‘"?!'
    return edge.strip(strip) == (printed or '').strip(strip)


def elision_note(member: 'Member') -> str:
    """The elision mark the card's readings do not carry, named.

    The panel tokenises a trailing apostrophe off the word, so a card about an
    elided form shows every reading without it. The mark is not at risk — the
    applier writes only the printed form's own characters — but it decides the
    ruling: an elided word is cut short, so a reading that completes it is not
    what Bonitz set, and `οὐδ'` against `οὐθ'` is a variant rather than a
    misread.
    """
    if SPINE_DIR is None:
        return ''
    form = member.readers.get('opus') or ''
    if not form or any(c in ELISION for c in form):
        return ''
    p = Path(SPINE_DIR) / f'page-{member.page:03d}-{member.col}.txt'
    if not p.exists() or member.line < 1:
        return ''
    lines = p.read_text(encoding='utf-8').splitlines()
    if member.line > len(lines):
        return ''
    for tok in lines[member.line - 1].split():
        if (tok.startswith(form) and len(tok) > len(form)
                and tok[len(form)] in ELISION):
            return (f'the ink elides here — the printed word is '
                    f'<b class="gk">{tok}</b>. The mark sits outside every '
                    f'reading below and no ruling touches it, but the word is '
                    f'cut short, so a reading that finishes it is not what '
                    f'Bonitz set.')
    return ''


MARK_WORDS = ('rough', 'smooth', 'circumflex', 'acute', 'grave',
              'iota sub', 'diaeresis')


def _dedupe_named(*parts: str) -> str:
    """Join the naming helpers without saying one mark twice.

    ⚠ THREE HELPERS NAME MARKS AND THEY OVERLAP. On 151-R:40 the preserve read
    `keep as printed · ȣ̔̀͂ς · with the grave · rough + circumflex + grave` —
    `name_marks` naming the difference from the rival, `marks_on_ligature`
    spelling out everything the form carries. On a card that turns on marks, a
    label saying "grave" twice is a label John has to parse.

    Keyed on the MARK, not the phrase, or the compound never matches the
    single. Pass the full inventory first and the differences after it: what
    the inventory already covers drops out, and what it does not — an absence,
    `no grave` — survives, which is the half worth reading.
    """
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        for bit in (b.strip() for b in (part or '').split('·')):
            if not bit:
                continue
            pieces = [p.strip() for p in bit.replace('+', ',').split(',')]
            if not all(any(w in p for w in MARK_WORDS) for p in pieces):
                pieces = [bit]          # not a marks phrase — leave it whole
            for piece in pieces:
                word = next((w for w in MARK_WORDS if w in piece), None)
                if word is not None:
                    if word in seen:
                        continue
                    seen.add(word)
                if piece:
                    out.append(piece)
    return ' · ' + ' · '.join(out) if out else ''


def name_marks(form: str, other: str) -> str:
    """Name the marks that differ, when two forms carry the same letters.

    ⚠ TWO BUTTONS DREW THE SAME WORD. 260-R:30 offered `ἐνῇδον` against
    `ἐνῆδον` — eta with the iota subscript and eta without — and at card size
    that mark is a hairline inside a descender. Both labels read `ἐνῆδον` to
    the eye and both said `1 of 4 readers`; John, 2026-08-29: "can't tell
    here".

    `marks_on_ligature` already answers this where a ligature carries the
    marks, and its note says why: "The ink is legible; our rendering of it is
    not." That was never a fact about ligatures. Any mark a screen font draws
    too small to see makes a card that cannot be answered — and the ruling it
    forces looks exactly like a ruling that was meant.
    """
    a, b = unicodedata.normalize('NFD', form), unicodedata.normalize('NFD',
                                                                     other)
    if not other or a == b:
        return ''

    def base(s: str) -> str:
        return ''.join(c for c in s if not unicodedata.combining(c))

    if base(a) != base(b):
        return ''          # the letters differ; name_letters owns that case
    mine = {m for m, _ in MARK_NAMES if m in a}
    theirs = {m for m, _ in MARK_NAMES if m in b}
    bits = [f'with the {n}' for m, n in MARK_NAMES if m in mine - theirs]
    bits += [f'no {n}' for m, n in MARK_NAMES if m in theirs - mine]
    return ' · ' + ', '.join(bits) if bits else ''



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
    # ⚠ ς AND ϛ ARE ONE SORT, SO THEY ARE ONE READING. The stigma offer builds
    # `πκϛ` from readers who wrote `πκς`, and an exact count then called it
    # `0 of 4 readers` — a button holding the reading two of them gave,
    # labelled as the reading nobody gave. Which codepoint the sort was stored
    # under was our choice, never Bonitz's; the tally is about the ink.
    fold = (lambda v: v.replace('ς', 'ϛ')) if 'ϛ' in form else (lambda v: v)
    n = sum(1 for v in readers.values() if fold(v) == fold(form))
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
    # ⚠ `ου spelled out` NAMED A RELATIONSHIP THAT WAS NOT THERE. The test was
    # only "the printed form has ȣ and this one does not", which is true of
    # every reading that differs from the ligature for any reason at all. At
    # 130-R:48 the ink reads `πκϛ 37` — Problemata book 26 — and kraken took the
    # STIGMA for the ou ligature; the card then offered `πκ · ου spelled out`
    # and `πκϛ · ου spelled out`, neither of which contains an ου. John,
    # 2026-08-30: "what's with 'ου spelled out' here?"
    #
    # Say it only when the option really does write out what the other holds as
    # a sort. Where the ligature is simply gone, say THAT — on a siglum the
    # missing sort is a numeral's whole value.
    printed_s = printed or ''
    if 'ȣ' in form and 'ȣ' not in printed_s:
        bits.append('ligature' if 'ου' in printed_s else 'the ȣ ligature')
    elif 'ȣ' in printed_s and 'ȣ' not in form:
        spelled = ''.join(c for c in a if not _u.combining(c))
        bits.append('ου spelled out' if 'ου' in spelled
                    else 'no ȣ ligature')
    return ' · ' + ', '.join(bits) if bits else ''


def _named(x: str, article: bool = True) -> str:
    """A glyph, or the NAME of one the screen cannot draw.

    ⚠ A SPACE RENDERS AS NOTHING. `add ` and `→  ` are blank buttons, and the
    space slot is the whole reason this class reached a card — the panel is
    blind to whitespace by construction, so every one of these questions is
    about a character with no shape.
    """
    if x and not x.strip():
        if len(x) != 1:
            return f'{len(x)} spaces'
        return 'a space' if article else 'space'
    return x


def _keep_phrase(a: str, b: str) -> str:
    """How the KEEP button names what the ink already has."""
    if not a:
        return f'no {_named(b, article=False)}'   # the alternative adds one
    if not a.strip():
        # ⚠ The corpus already HOLDS the space and the alternative would close
        # it up. `_sub_phrase(' ', ' ')` renders `  →   `, a blank button.
        return _named(a)
    return _sub_phrase(a, a) if not b else _named(a)


def _sub_phrase(a: str, b: str) -> str:
    """One substitution, in glyphs AND in words.

    ⚠ Two combining marks over `ȣ` do not render, and John cannot tell ϛ from ς
    on screen though he can in the ink. A bundle button that shows only the
    glyphs is asking him to judge a shape the screen is not drawing.
    """
    if not a:
        return f'add {_named(b)}'
    if not b:
        return f'delete {_named(a)}'
    named = marks_on_ligature(b) or name_letters(b, a)
    return f'{a} → {b}{named}'


def bundle_options(card: Card) -> list[dict]:
    """Buttons for a dispute bundle: the SUBSTITUTION, not one fixed word.

    ⚠ `corpus becomes καθόλου at every site` IS FALSE ON A BUNDLE. The sites
    here are different words that share one dispute — `Λακεδαιμονίȣς`,
    `καλȣ́μεναι`, `κινȣ͂ν` — so accepting means each site takes ITS OWN spelled
    form, which the entry carries as `becomes`. A button naming one word would
    write that word over eighteen others.
    """
    b = card.bundle or {}
    subs = [tuple(x) for x in b.get('subs') or ()]
    n = card.n
    where = f'all {n} sites on this card' if n != 1 else 'this site'
    out = [{
        'form': '',
        'verdict': 'preserve',
        'detail': 'bundle:keep',
        'label': 'keep as printed · ' + ' · '.join(
            _keep_phrase(a, bb) for a, bb in subs) +
            ' · the ink as it stands',
        'consequence': (f'corpus untouched at {where} · each recorded as a '
                        f'corrigendum if authorities disagree with the ink'),
        'kind': 'preserve',
    }]
    for a, bb in subs:
        # ⚠ `read add a space` IS NOT ENGLISH. An insertion or a deletion
        # already reads as an instruction; only a substitution wants `read`
        # in front of it.
        phrase = _sub_phrase(a, bb)
        out.append({
            'form': bb,
            'verdict': 'accept',
            'detail': f'bundle:{a}>{bb}',
            'label': (phrase if phrase.startswith(('add ', 'delete '))
                      else f'read {phrase}'),
            'consequence': (f'at {where} the corpus takes THAT SITE\'s own '
                            f'form — the words differ, the change does not'),
            'kind': 'fix',
        })
    out.append({
        'form': '',
        'verdict': 'preserve',
        'detail': 'bundle:none',
        'label': 'none of these · the ink shows something else',
        'consequence': ('corpus untouched · every site here is set aside for a '
                        'proper reading, not left to a reader'),
        'kind': 'none',
    })
    return out


# The sorts a phone keyboard will not give him, in the order he needs them:
# the two ligatures Bonitz sets, the numeral stigma, then the marks that go on
# top. A combining mark applies to whatever character precedes it, so tapping
# `ȣ` then rough then grave builds `ȣ̔̀` — which is how a reading no reader
# offered gets onto a card without a keyboard.
PALETTE = (
    ('ȣ', 'ou ligature'),
    ('ϗ', 'kai ligature'),
    ('ϛ', 'stigma = 6'),
    ('\u0313', 'smooth'),
    ('\u0314', 'rough'),
    ('\u0301', 'acute'),
    ('\u0300', 'grave'),
    ('\u0342', 'circumflex'),
    ('\u0345', 'iota sub'),
    ('\u0308', 'diaeresis'),
    ('\u2019', 'elision'),
)


def palette_html(target: str) -> str:
    """Tap-to-insert sorts for a text field.

    ⚠ A TYPED FIELD IS NO USE ON A PHONE. Polytonic Greek is not on the
    keyboard and the ligatures are not on any keyboard, so "none of these fits
    — type what the ink reads" was, in practice, another way of setting the
    card aside. John, 2026-08-30: "if you put in buttons to insert ligatures
    and accents and breathing into the text boxes, i can just type in the
    ligature cards where the choice is otherwise none."

    The marks are COMBINING characters and land on whatever precedes them, so
    the palette composes: `ȣ` then rough then grave gives `ȣ̔̀`. Each button
    names what it inserts, because a bare `ϛ` against a bare `ς` is the pair
    this index cannot afford to have guessed at.
    """
    keys = ''.join(
        f'<button type="button" class="sort" title="{_attr(name)}" '
        f'onclick="ins({_arg(target)},{_arg(ch)})">'
        f'<span class="gk">{"&#9676;" if unicodedata.combining(ch) else ch}'
        f'{ch if unicodedata.combining(ch) else ""}</span>'
        f'<small>{name}</small></button>'
        for ch, name in PALETTE)
    return (f'<div class="palette">{keys}'
            f'<button type="button" class="sort del" '
            f'onclick="ins({_arg(target)},null)">'
            f'<span class="gk">⌫</span><small>back</small></button></div>'
            f'<div class="spellout" id="say-{target}"></div>')


def correction_html(card: Card) -> str:
    """The second field: keep the ink, and name what it should have said."""
    if not wants_correction(card):
        return ''
    return (
        '<details class="typed corr" open><summary>keep as printed — and the '
        'revised edition should read</summary>\n'
        '    <div class="typedrow">\n'
        f'      <input type="text" id="c-{card.sid}" spellcheck="false" '
        f'oninput="say(\'c-{card.sid}\')" '
        'autocomplete="off" placeholder="the corrected citation, e.g. Αγ13. 78b">\n'
        f'      <button class="keep" onclick="ruleCorrection({_arg(card.sid)},this)">'
        'bank the corrigendum</button>\n'
        '    </div>\n'
        f'    {palette_html("c-" + card.sid)}\n'
        '  </details>')


def wants_correction(card: Card) -> bool:
    """Does this card need a place to record Bonitz's own error?

    ⚠ ONLY A CORRIGENDUM CARD. `preserve` on an ordinary card says the ink
    reads what we hold and nothing is wrong; there is no emendation to name,
    and offering a box for one would invite an edit the register must never
    receive. A corrigendum card is the other case: the ink is right AND the
    reading is wrong, and both halves have to be written down or
    `corrigenda_for` banks nothing at all.
    """
    return any(m.kind == 'corrigendum' for m in card.members)


def options_for(card: Card) -> list[dict]:
    """Buttons for one card. Always includes the printed form as preserve.

    Each option states a form and a consequence. No typing path.
    """
    if card.bundle:
        return bundle_options(card)
    printed = card.printed
    # ⚠ FINAL SIGMA IS NOT A NUMBER. In a numeral slot the printed sort is the
    # stigma glyph; storing ς was a codepoint choice, never Bonitz's. Offering
    # "keep as printed · πκς" asserts a reading that cannot be what he meant —
    # stigma is 6, final sigma has no value. State the stigma on the button.
    #
    # ⚠ THE LETTERS CANNOT TELL YOU — and this module already says so, in the
    # docstring of `numeral_card_is_a_word_tail`. `νυχος` is ν 50, υ 400, χ 600,
    # ο 70 and a final sigma, so it reads as a perfectly good numeral; but
    # 158-L:46 ends `γαμψώ-`, which makes it the tail of `γαμψώνυχος`. That card
    # went to John with `keep as printed · νυχοϛ · stigma = 6` as its ONLY
    # preserve, the plain word on no button at all, and the ruling it forced
    # writes a stigma into the middle of a noun. The check exists. Consult it.
    m0 = card.members[0] if card.members else None

    def numeral_slot(form: str) -> bool:
        if not is_numeral_form(form):
            return False
        if m0 is None or SPINE_DIR is None:
            return True
        return not numeral_card_is_a_word_tail(m0.page, m0.col, m0.line, form,
                                               SPINE_DIR)

    printed_is_numeral_sigma = bool(
        printed and numeral_slot(printed) and 'ς' in printed)
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
                          f'''{_dedupe_named(
                              marks_on_ligature(printed),
                              name_letters(printed, next(
                                  (x for x in card.form_set if x != printed),
                                  printed)))}'''
                          f'{tally(card, printed)}'),
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
            'label': (f'read {f}'
                      f'''{_dedupe_named(describe(f, offer_printed),
                                         name_letters(f, offer_printed or ''))}'''
                      f'{tally(card, f)}'),
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
    #
    # ⚠ EXCEPT WHERE THE TOKEN IS NOT A NUMERAL. A `margin` card asks one thing:
    # is the run at the edge of this line the printed line number, or is it
    # text? Its forms are ordinary words that happen to end in final sigma, so
    # this rule offered `γένοϛ`, `Ἀχελῷοϛ`, `πνιγμȣ̀ϛ` — and stigma is the
    # numeral 6, which ends no common noun. Eight of 76 margin cards carried two
    # such buttons; John, 2026-08-29: "this card's choices are opaque".
    #
    # ⚠ AND `margin` WAS THE WRONG PREDICATE. Scoping the guard to the card KIND
    # left every ordinary `letters` card still offering the stigma, and on
    # 2026-08-29 `ἀετέρες / ἀστέρες` — a card asking σ against ε in the middle
    # of the word — carried `ἀστέρεϛ`, which no reader read, and that is the
    # button that got clicked. `τοῆϛ` reached work/reconciled/page-111-L.txt the
    # same way. The test belongs on the TOKEN, and this module already states
    # it: a word is never a numeral, and the stigma closing it is the defect
    # (`numeral_card_is_a_word_tail`). So offer the stigma only where the form
    # could be a numeral at all; on a word, offer only the correction toward ς.
    margin_only = bool(card.members) and all(
        m.kind == 'margin' for m in card.members)
    for f in ([] if margin_only else list(o['form'] for o in out)):
        pairs = []
        if numeral_slot(f):
            pairs.append(('ς', 'ϛ'))
        else:
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

    # ⚠ ON A NUMBERED LINE, THE CORRECT READING MAY BE ON NO CARD AT ALL. Bonitz
    # prints a line number in the inner margin every fifth line, and where the
    # segmenter's box took it in, EVERY reader carries some of it: 132-L:15 came
    # to John as `καὶ / ϗ̀ι / ϗ̀ις`, three readings of `ϗ̀` followed by a `15` read
    # as `ις`. The right answer, plain `ϗ̀`, was not a button — the same failure
    # as the stigma that was not a button, and the card forces a wrong ruling or
    # a set-aside.
    #
    # So on a numbered line, where the spine's form is LONGER than another
    # reader's, offer it trimmed at the margin end. Trimming is by GRAPHEME, not
    # by codepoint, or `ϗ̀ις` trimmed three would be bare `ϗ` — the accent thrown
    # away with the margin. L columns carry the number at the end of the line,
    # R columns at the start; that is which end gets cut.
    #
    # ⚠ AND ONLY THE WORD AT THE MARGIN CAN CARRY IT. A numbered LINE is not a
    # numbered word: on 260-R:30 the number sits at the head of the line and
    # `ἐνῇδον` sits fifteen characters in, yet the rule fired on it and offered
    # `νῇδον`, `ῇδον`, `δον` — three buttons proposing to eat the front of a
    # word that never touched the margin. The number is at the START of an R
    # line and the END of an L line, so exactly one token per line can have
    # taken it in.
    numbered = [m for m in card.members
                if m.line % 5 == 0 and at_margin_end(m, card.printed)]
    if numbered and card.printed:
        side = numbered[0].col
        graphemes: list[str] = []
        for ch in unicodedata.normalize('NFC', card.printed):
            if unicodedata.combining(ch) and graphemes:
                graphemes[-1] += ch
            else:
                graphemes.append(ch)
        shortest = min((len(f) for f in card.form_set if f), default=0)
        if len(card.printed) > shortest:
            # ⚠ AND THE RIGHT ANSWER CAN ALREADY BE ON THE CARD, WEARING THE
            # WRONG LABEL. At 146-L:25 the ink reads `ἔχȣσιν 25` and kraken
            # took the margin number's tail onto the word as `ἔχȣσινς`. Cutting
            # one grapheme gives `ἔχȣσιν` — which llama also read, so the trim
            # was skipped as a duplicate and the button said `1 of 4 readers`,
            # while two DEEPER cuts that eat real letters got the gutter label
            # to themselves. John, 2026-08-30: "we need that 'gutter numbers
            # spilled in' additional button."
            #
            # So say it on whichever option is the trim — and do NOT stop
            # there. A reader can catch part of the leak and not the rest:
            # 132-L:15 came as `καὶ / ϗ̀ι / ϗ̀ις`, where cutting one grapheme
            # gives calamari's `ϗ̀ι` and the right answer `ϗ̀` needs two.
            #
            # ⚠ AND THREE WAS NEVER THE BOUND. What spilled in is a LINE
            # NUMBER, so it is as long as that number is: two digits can leak
            # at most two sorts, however they were misread. Cutting three from
            # a two-digit line only ever proposes eating the word.
            for cut in range(1, len(str(numbered[0].line)) + 1):
                if cut >= len(graphemes):
                    break
                trimmed = (''.join(graphemes[:-cut]) if side == 'L'
                           else ''.join(graphemes[cut:]))
                if not trimmed:
                    continue
                same = next((x for x in out if x['form'] == trimmed), None)
                if same is not None:
                    if 'margin number' not in same['label']:
                        same['label'] += ' · the margin number trimmed'
                        same['consequence'] = (
                            f'line {numbered[0].line} is a numbered line; '
                            f'Bonitz prints its number in the margin and the '
                            f'readers took it into the text. ' +
                            same['consequence'])
                    continue
                out.append({
                    'form': trimmed,
                    'verdict': 'accept',
                    'detail': trimmed,
                    'label': f'read {trimmed} · the margin number trimmed',
                    'consequence': (
                        f'line {numbered[0].line} is a numbered line; Bonitz '
                        f'prints its number in the margin and the readers took '
                        f'it into the text. This drops it and keeps the word.'),
                    'kind': 'accept',
                })

    # ⚠ A READER CAN BE RIGHT ABOUT THE MARKS AND WRONG ABOUT THE SORT. John,
    # 2026-08-10, on `ȣ͂σα / ȣσα / ὅσα`: "it's smooth + circumflex" — which is
    # genie's `οὖσα`, the only reading with both marks right. But genie always
    # SPELLS OUT the ligature, so accepting it would replace Bonitz's `ȣ` with
    # `ου` and change the ink to fix a diacritic. The form that is actually
    # correct, `ȣ̓͂σα`, was offered by nobody.
    #
    # Re-ligating is mechanical and loses nothing: ου carrying marks becomes ȣ
    # carrying the same marks.
    # ⚠ AND THE FORM-SET IS NOT EVERY READING. The card's forms come from the
    # strong panel, so genie — the reader that spells `ου` out and therefore the
    # one whose marks most often survive — is not in it. Religating only the
    # offered forms fired ZERO times on 299 cards, which is exactly the shape of
    # a check that matches nothing and looks like a check that found nothing.
    seen_forms = {o['form'] for o in out}
    every = list(seen_forms) + [v for m in card.members
                                for v in m.readers.values()]
    for f in [x for x in every if x]:
        lig = religate(f)
        if lig != f and lig not in {x['form'] for x in out}:
            out.append({
                'form': lig,
                'verdict': 'accept',
                'detail': lig,
                'label': f'read {lig}{marks_on_ligature(lig)} · ligature kept',
                'consequence': (f'the marks of {f} on Bonitz\'s ȣ — no reader '
                                f'offered this, it spells ου back as the sort'),
                'kind': 'accept',
            })

    # ⚠ THE SORT AND THE MARKS CAN BE SPLIT ACROSS READERS, AND THEN NOBODY
    # HOLDS THE WHOLE READING. 151-R:40 came as `ȣ̔̀͂ς / ȣ̔͂ς / ὃς`: kraken has the
    # ligature carrying rough AND grave AND circumflex, which no Greek word
    # carries; genie and llama have rough and grave, correctly, but on an
    # omicron. The reading both halves point at — `ȣ̔̀ς`, οὓς — was on no button,
    # so the card could only be set aside, and John set it aside.
    #
    # This is the ligature case of a rule already here for ου written out: take
    # the SORT from the spine and the MARKS from a reader who has them, which
    # is transcription rather than judgement. It only fires where the base
    # letters line up one for one, so no letter is ever invented.
    def _split(f: str) -> tuple[str, list[str]]:
        d = unicodedata.normalize('NFD', f)
        base, marks, cur = '', [], ''
        for ch in d:
            if unicodedata.combining(ch):
                cur += ch
            else:
                if base:
                    marks.append(cur)
                base += ch
                cur = ''
        if base:
            marks.append(cur)
        return base, marks

    if card.printed:
        spine_base, _ = _split(card.printed)
        for other in {v for m in card.members for v in m.readers.values() if v}:
            ob, om = _split(other)
            # ⚠ A READER WITH NO MARKS TRANSPLANTS NOTHING, and rebuilding
            # the spine's own letters bare put `πκς` back on a numeral card as
            # a live option — the very reading the stigma rule had just
            # suppressed, because final sigma is not a number.
            if (ob == spine_base or len(ob) != len(spine_base)
                    or not any(om)):
                continue
            built = unicodedata.normalize(
                'NFC', ''.join(c + mk for c, mk in zip(spine_base, om)))
            if (not built or built == unicodedata.normalize('NFC', card.printed)
                    or any(x['form'] == built for x in out)):
                continue
            out.append({
                'form': built,
                'verdict': 'accept',
                'detail': built,
                'label': f'read {built}{marks_on_ligature(built)} · '
                         f'the sort as printed, the marks as {other} has them',
                'consequence': (
                    f'no reader offered this — it puts the marks of {other} '
                    f'on the sort the spine read, and changes no letter'),
                'kind': 'accept',
            })

    # ⚠ THE READERS CAN ALL BE WRONG TOGETHER, AND THE CARD MUST SAY SO. John,
    # 2026-08-10: "we need a NONE for when all 5 are wrong." Every option here
    # is built from what some reader read, so a card literally cannot express a
    # reading none of them produced — and five readers sharing one misreading is
    # not rare, it is the normal case for a mark over a ligature.
    #
    # Without this the only exits are a wrong ruling or a skip, and a skip is
    # indistinguishable from a card never reached. NONE records the judgment
    # that the ink shows something else, costs one tap, and needs no typing —
    # these sites collect in their own short list to be read properly.
    out.append({
        'form': '',
        'verdict': 'none',
        'detail': '',
        'label': 'none of these · the ink shows something else',
        'consequence': ('corpus untouched · this site is set aside for a '
                        'proper reading, not left to a reader'),
        'kind': 'none',
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


def _attr(v: str) -> str:
    """A value safe inside a double-quoted HTML attribute."""
    return (v.replace('&', '&amp;').replace('"', '&quot;')
             .replace('<', '&lt;').replace('>', '&gt;'))


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


CROP_CACHE = ROOT / 'work/sweeps/settle-crops.json'


def _crop_key(card: 'Card', m: 'Member') -> str:
    """One key, used to read AND write. ⚠ I first wrote two subtly different
    expressions for it — the read carried the sid and the write did not — so the
    cache would have missed on every card while looking perfectly healthy."""
    return f'{card.sid}|{m.page}|{m.col}|{m.line}|{m.char_at}'


def crop_broken(page: int, col: str, pieces: list, scale: float = 2.2):
    """A word the column break split, framed so BOTH halves are on screen.

    ⚠ THE WORD-CENTRED CROP CANNOT HOLD THIS WORD. The head sits at the RIGHT
    edge of its line and the tail at the LEFT edge of the next, so a window
    placed by the head's offset excludes the tail entirely. On 018-R:46 the
    card asked whether the ink reads `ἐλευ-θέρα` or `ἐλεύ-θερα` and showed
    `ἐλευ-` above the END of line 47. John: "i just can't rule on the part
    after the hyphen due to the crop." The disputed accent was in the half
    that was never on screen, and the whole-line view was folded away behind
    a disclosure triangle.

    The whole-line crop already carries the following line, so one band shows
    the head, the hyphen and the tail in printed order. Stacking two bands was
    tried first and merely printed lines 46-47 twice.

    ⚠ A BREAK ACROSS A COLUMN IS NOT THIS CASE and returns None rather than a
    crop that quietly omits the tail — the halves are then in two different
    images of two different scans, and there is no honest single frame.
    """
    lines = sorted({int(pc['line']) for pc in pieces if pc.get('line')})
    if len(lines) < 2 or lines[-1] - lines[0] != 1:
        return None, 0.0, 'none'
    im, score, how = crop_at_offset(page, col, lines[0], '', 0, scale=scale,
                                    whole=True)
    if im is None:
        return None, 0.0, 'none'
    return im, score, f'{how}:break'


def fill_crops(cards: list[Card]) -> tuple[int, int]:
    """Attach ink crops. Returns (n_ok, n_skipped).

    ⚠ AND CACHE THEM. Cropping 299 cards takes three to four minutes, and it
    ran on EVERY server start — six or seven restarts today, each one John
    sitting waiting while the same crops were cut from the same scans again.
    The cache is keyed by the card's sid and the crop geometry, so a card whose
    site or word changes still re-crops.
    """
    # ⚠ THE CACHE IS OFF, AND IT STAYS OFF UNTIL IT IS PROVED. John,
    # 2026-08-10: "your crops messed up kraken on these." A crop is the ONLY
    # evidence on the card — get it wrong and the reader is shown one word's
    # ink while being asked about another, which is how 417 citations were
    # mis-cropped once before. The key reads `m.char_at` BEFORE the loop below
    # computes it and writes the computed value back, so a read and its write
    # can key differently, and a stale entry can be served for a moved site.
    # Four minutes of cropping is worth less than one wrong crop.
    ok = skip = 0
    cache = {}
    fresh = {}
    for card in cards:
        m0 = card.exemplar
        hit = cache.get(_crop_key(card, m0))
        if hit:
            card.crop, card.whole, card.how = hit['crop'], hit['whole'], hit['how']
            ok += 1
            continue
    for card in cards:
        if card.crop:                 # already restored from the cache
            continue
        m = card.exemplar
        word = m.readers.get('opus') or card.printed or (
            card.form_set[0] if card.form_set else '')
        # ⚠ `char_at` INDEXES A DIFFERENT STRING FROM THE ONE BEING CROPPED.
        # It counts positions in the canonical stream, where combining marks
        # are folded away; the crop places the word proportionally across the
        # PRINTED line, which still has them. So every mark before the target
        # drags the crop left. Measured over the 15-102 queue: where the two
        # disagree, `char_at` landed on the token 0 times out of 24 and the
        # piece's own start landed on it 21 times. Most drifts are one or two
        # characters — survivable, and survivable is how this lasted. Three
        # are 49, 51 and 56, which put the reader on a different phrase of the
        # line with nothing to say so. John, twice in one sitting: "crop is
        # off". The piece knows where it is; ask it first.
        at = m.char_at
        if m.pieces and m.pieces[0].get('start') is not None:
            at = int(m.pieces[0]['start'])
        if at < 0:
            at = line_char_offset(m.page, m.col, m.word_off)
        m.char_at = at
        if m.line < 1 or not word:
            card.skipped = 'no_line_or_word'
            skip += 1
            continue
        if m.broken and len({pc.get('line') for pc in m.pieces}) > 1:
            im, score, how = crop_broken(m.page, m.col, m.pieces, scale=1.0)
        else:
            im, score, how = crop_at_offset(
                m.page, m.col, m.line, word, at, scale=1.0, spread=8)
        card.how = how
        if im is None:
            card.skipped = f'crop_failed:{how}'
            skip += 1
            continue
        card.crop = _b64(im)
        whole_im, _, _ = crop_at_offset(
            m.page, m.col, m.line, word, at, scale=1.0, whole=True)
        card.whole = _b64(whole_im) if whole_im is not None else ''
        ok += 1
        fresh[_crop_key(card, m)] = {
            'crop': card.crop, 'whole': card.whole, 'how': card.how}
    return ok, skip


def cut_member_crops(cards: list[Card], out_dir: Path = CROPS
                     ) -> tuple[int, int]:
    """Every member's own ink, so a group ruling can be scoped by looking.

    ⚠ ONE CROP FOR SIXTY SITES IS A CLAIM ABOUT ONE SITE. A card here binds
    every site printing the same form, and byte-identical transcription is not
    byte-identical ink — 060 sites of `ϗ̀` are 60 separate impressions, any one
    of which may carry a mark the other 59 do not. John's rule from the
    ligature sitting: show every member and let one click pull it out. The
    excludes are what made the group rulings safe there, and they are what
    makes them safe here.

    Returns (n_ok, n_skipped). A member with no crop keeps `crop_name` empty
    and the strip says so in words rather than showing a picture of a line it
    cannot prove.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    ok = skip = 0
    for card in cards:
        if card.n < 2:
            continue          # the card's own crop already shows the one site
        if card.ruled_before_strip:
            continue          # answered without one; it does not gain one now
        for i, m in enumerate(card.members):
            word = m.readers.get('opus') or card.printed or (
                card.form_set[0] if card.form_set else '')
            at = m.char_at
            if m.pieces and m.pieces[0].get('start') is not None:
                at = int(m.pieces[0]['start'])
            if at < 0:
                at = line_char_offset(m.page, m.col, m.word_off)
            m.char_at = at
            if m.line < 1 or not word:
                skip += 1
                continue
            if m.broken and len({pc.get('line') for pc in m.pieces}) > 1:
                im, _, how = crop_broken(m.page, m.col, m.pieces, scale=3.0)
            else:
                im, _, how = crop_at_offset(
                    m.page, m.col, m.line, word, at, scale=3.0, spread=8)
            m.crop_how = how
            if im is None:
                skip += 1
                continue
            # Named by the SITE, not by position in the card: a rebuild that
            # reorders members must not hand one site another's ink.
            name = re.sub(r'[^A-Za-z0-9_.-]', '_', m.sid) + '.png'
            im.convert('L').quantize(colors=16).save(
                out_dir / name, format='PNG', optimize=True)
            m.crop_name = name
            ok += 1
    return ok, skip


def strip_html(card: Card) -> str:
    """The member strip: every site's ink side by side, each one excludable."""
    if card.n < 2 or card.ruled_before_strip:
        return ''
    figs = []
    for m in card.members:
        if m.crop_name:
            inner = (f'<img loading="lazy" src="/crops/{m.crop_name}" '
                     f'alt="the ink at {m.page:03d}-{m.col}:{m.line}">')
        else:
            # ⚠ SAY WHAT IS WRONG, NOT THAT SOMETHING IS. A picture of the
            # wrong line is worse than no picture.
            inner = ('<div class="nocrop">⚠ NO CROP — this site could not be '
                     'placed on a printed line. Exclude it rather than rule '
                     'it blind.</div>')
        weak = '' if (m.crop_how or '').startswith('text') else ' weak'
        cap = f'{m.page:03d}-{m.col}:{m.line}'
        # ⚠ ON A BUNDLE THE WORDS DIFFER, so each crop must say which word it
        # is. Without it the strip looks like nineteen impressions of one word
        # and the ruling looks narrower than it is.
        if card.bundle:
            own = m.readers.get('opus') or ''
            if own:
                cap += f' · <span class="gk">{own}</span>'
        if m.crop_how and m.crop_how != 'text':
            cap += ' · placed by geometry'
        figs.append(
            f'<figure class="site{weak}" data-site="{_attr(m.sid)}" '
            f'onclick="toggle({_arg(card.sid)},{_arg(m.sid)},this)">'
            f'<span class="x">✕</span>{inner}'
            f'<figcaption>{cap}</figcaption></figure>')
    return (
        '<div class="striphint">every site on this card · tap a crop to '
        'EXCLUDE it from the ruling — it becomes its own follow-up card</div>'
        f'<div class="strip">{"".join(figs)}</div>')


def html(cards: list[Card], out: Path = PAGE) -> Path:
    parts = []
    for card in cards:
        m = card.exemplar
        opts = options_for(card)
        warn = ''
        # ⚠ `text+word` IS THE BEST PLACEMENT THERE IS, NOT A WARNING. The
        # suffix marks a crop whose pointer came from the ALTO's own word box;
        # this test read it as "not text" and put a red "placed by geometry"
        # flag on EVERY card of sitting 3, telling John to distrust the one
        # thing that had just been made exact.
        if card.how and not card.how.startswith('text'):
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
        # ⚠ THE INK CAN ELIDE WHERE NO READING SHOWS IT. At 160-L:13 the
        # printed word is `ȣ̓́θ’` — οὐθ’, οὐθέν elided — and the panel tokenises
        # the mark off, so all four readings arrive as `ȣ̓́θ / ȣ̓θ / ȣ̓δ / ὅθ`
        # with nothing to say the word is cut short. John, 2026-08-30: "should
        # i be unconcerned about the apostrophe here for elision?"
        #
        # Unconcerned about LOSING it, yes: the applier writes only the printed
        # form's own characters, so `ȣ̓́θ’` becomes `ȣ̓δ’`. But the mark is
        # evidence for the ruling, not a detail beside it — an elided word
        # cannot be completed by `ὅθ`, and `ȣ̓δ’` against `ȣ̓́θ’` is οὐδέν against
        # οὐθέν, a real variant and not a misreading. 51 sites in this tranche.
        note = elision_note(m)
        elide_html = f'<div class="why">{note}</div>' if note else ''
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
        prop_html = elide_html + prop_html
        readers = m.readers
        rline = ' · '.join(
            f'{SPINE_LABEL if n == "opus" else n}='
            f'<span class="gk">{readers[n]}</span>'
            for n in ('opus', 'kraken', 'calamari', 'paddle', 'codex',
                      'genie', 'llama')
            if n in readers
        )
        buttons = []
        for o in opts:
            cls = 'keep' if o['verdict'] == 'preserve' else 'fix'
            if o.get('kind') in ('proposal', 'proposal-preserve'):
                cls += ' go'
            buttons.append(
                f'<button class="{cls}" data-detail="{_attr(o["detail"])}" '
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
<div class="card" id="{card.sid}" data-sid="{_attr(card.sid)}" data-n="{card.n}">
  <div class="loc">{card.n} site{"s" if card.n != 1 else ""} · {locs}</div>
  <div class="said gk">{(card.bundle or {}).get('label') or "  /  ".join(card.form_set)}</div>
  {f'<div class="mixed">⚠ {card.note}</div>' if card.note else ''}
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
  {strip_html(card)}
  <div class="ask">What does the ink read?</div>
  <div class="rec">
    {"".join(buttons)}
  </div>
  {correction_html(card)}
  <details class="typed"><summary>none of these fits — type what the ink reads</summary>
    <div class="typedrow">
      <input type="text" id="t-{card.sid}" spellcheck="false" autocomplete="off"
             oninput="say('t-{card.sid}')"
             placeholder="the reading, exactly as printed">
      <button class="fix" onclick="ruleTyped({_arg(card.sid)},this)">record this reading</button>
    </div>
    {palette_html("t-" + card.sid)}
  </details>
  <div class="reclbl">One ruling applies to
    <span class="tally">all {card.n} site{"s" if card.n != 1 else ""}</span>
    with this form-set.</div>
</div>""")

    # Extra CSS for consequence subtitles on every button.
    extra = """
button{display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;
  text-align:left;width:100%;max-width:36rem}
button .sub2{font-size:.82rem;font-weight:400;opacity:.9;line-height:1.3}
/* ⚠ THE GREEK IS THE THING BEING JUDGED, SO SET IT LARGE. John, 2026-08-10:
   "make the font bigger so it's easier to see accents." Body-size type on a
   phone is where ἂ and ἄ become the same shape, and a card that cannot show
   the mark under dispute is asking him to rule on faith. The consequence text
   stays small — it is read once; the glyphs are read every card. */
button .gk{font-size:1.6rem;line-height:1.5}
.card .said{font-size:2rem;line-height:1.4}
.card.done .said{font-size:1rem}
/* ⚠ `classList.add('done')` STYLED NOTHING. The click recorded a ruling and
   the card looked exactly as it had a moment before, so on a 300-card phone
   queue there was no way to see where you were or that a tap had registered.
   An adjudication tool that does not show its own state makes the reader do
   the bookkeeping — which is the same defect as asking him to type. */
/* ⚠ A RULED CARD IS DEAD WEIGHT AND IT STILL FILLED THE SCREEN. John,
   2026-08-10: "having issues scrolling down fast to get past ruled cards." 68
   answered cards, each with a full-width scan, stood between him and the next
   question. Collapse them to a line; tapping the line opens it again, because
   a ruling must stay changeable. */
.card.done{opacity:.55;border-color:#3a7d44;max-height:3.2rem;overflow:hidden;
  cursor:pointer;padding-top:.5rem;padding-bottom:.5rem}
.card.done.open{max-height:none;opacity:1}
.card.done .crop,.card.done .rec,.card.done .why,.card.done .said,
.card.done .reclbl,.card.done details,.card.done .ask,
.card.done .warnflag{display:none}
.card.done.open .crop,.card.done.open .rec,.card.done.open .why,
.card.done.open .said,.card.done.open .reclbl,.card.done.open details,
.card.done.open .ask,.card.done.open .warnflag{display:revert}
.card.done .loc::after{content:' — ruled, tap to change';color:#3a7d44;
  font-weight:600}
.mixed{color:var(--warn);font-size:.95rem;margin:.3rem 0 .7rem;
  border-left:3px solid var(--warn);padding-left:.6rem}
.card.done .mixed{display:none}
.card.done.open .mixed{display:revert}
.card.unsaved{opacity:1;border-color:#b23b3b;border-width:3px}
.card.unsaved::after{content:'NOT SAVED';color:#b23b3b}
/* ⚠ STICKY IS NOT FIXED ON A 22MB PAGE. The banner was prepended to the body
   and pinned with `position:sticky`, which keeps it in view only while its own
   containing block is — and John rules thirty cards deep. On 2026-08-31 a typed
   reading for 217-L:54 never reached the store and he had no way to know. */
#warn{position:fixed;top:0;left:0;right:0;z-index:999;background:#b23b3b;
  color:#fff;padding:.8rem 1rem;font-weight:700;letter-spacing:.02em;
  box-shadow:0 2px 10px rgba(0,0,0,.35)}
.card.done .crop{filter:grayscale(1)}
/* ⚠ NOT `pointer-events:none`. Locking a ruled card made a MISCLICK
   PERMANENT from the phone, and John hit one within thirty cards. The tool
   exists to capture his judgment, so it must let him change it; the ✓ and the
   dimming say a ruling was recorded, they do not say it is final. */
.card.done button{cursor:pointer}
.card.done:hover{opacity:.85}
.card.done .chosen{opacity:1;background:#3a7d44;color:#fff;font-weight:600}
button.none{border-color:#8a6d3b;color:#8a6d3b}
button.none .gk{font-style:italic}
.card.done::after{content:'✓ ruled';position:absolute;top:.5rem;right:.7rem;
  color:#3a7d44;font-weight:700;font-size:.9rem;letter-spacing:.04em}
.card{position:relative}
.rec{display:flex;flex-direction:column;gap:.55rem;margin:.4rem 0 .6rem}
.ask{font:600 1.15rem/1.3 Superclarendon,Rockwell,Georgia,serif;
  margin:1rem 0 .7rem}
"""
    # ⚠ THE STRIP SCROLLS, IT DOES NOT STACK. A card binding sixty sites has
    # to show sixty crops without becoming sixty screens; stacked, the buttons
    # fall off the bottom of the phone and the card stops being one question.
    extra += """
.striphint{font:.72rem "SF Mono",Menlo,monospace;color:var(--muted);
  margin:.6rem 0 .3rem}
.strip{display:flex;gap:.6rem;overflow-x:auto;padding:.4rem 0 .8rem;
  -webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}
.strip figure{margin:0;flex:0 0 auto;scroll-snap-align:start;position:relative;
  border:1px solid var(--rule);border-radius:2px;background:var(--plate);
  padding:.3rem;cursor:pointer;max-width:22rem}
.strip img{height:5.5rem;width:auto;max-width:none;border:0}
.strip .nocrop{height:5.5rem;display:flex;align-items:center;padding:0 .6rem;
  font-size:.8rem;max-width:18rem}
.strip figcaption{font:.68rem "SF Mono",Menlo,monospace;color:var(--muted);
  letter-spacing:.05em;padding:.25rem .1rem 0}
/* The exclude target is a real tap target, not a hairline: this is the
   control that keeps a group ruling honest, and it is used on a phone. */
.strip .x{position:absolute;top:.2rem;right:.2rem;width:2rem;height:2rem;
  border-radius:50%;border:1px solid var(--rule);background:var(--paper);
  color:var(--muted);font:700 1rem/1.9 Charter,Georgia,serif;text-align:center}
.strip figure.out{opacity:.32;filter:grayscale(1)}
.strip figure.out .x{background:var(--warn);color:#fff;border-color:var(--warn)}
.strip figure.out figcaption::after{content:' — excluded';color:var(--warn)}
.strip figure.weak{border-color:var(--warn)}
/* ⚠ `display:revert` ON A REOPENED CARD FLATTENED THE STRIP. The reopen rule
   is more specific than `.strip{display:flex}`, and `revert` goes to the
   user-agent value — block — so sixty crops stacked full-width down the page,
   which is the one thing the strip exists not to do. Name the display the
   strip actually needs; only elements whose default IS block may revert. */
.card.done .strip,.card.done .striphint{display:none}
.card.done.open .strip{display:flex}
.card.done.open .striphint{display:revert}
"""
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        '<!doctype html><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,'
        'maximum-scale=5">'
        '<title>Settle queue — what does the ink read?</title>'
        f'<style>{_BASE_CSS}{MOBILE_CSS}{TYPED_CSS}{extra}</style>'
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
        "const done={}, excluded={};\n"
        # ⚠ THE COUNT ON THE CARD MUST FOLLOW THE EXCLUDES. The label said
        # "one ruling applies to all 60 sites" while nine of them sat greyed
        # out on the strip above it — the card contradicting itself about the
        # very thing the excludes exist to control.
        "function retally(c){\n"
        "  const n=+c.dataset.n||1;\n"
        "  const out=c.querySelectorAll('.strip figure.out').length;\n"
        "  const t=c.querySelector('.tally'); if(!t) return;\n"
        "  t.textContent = out ? ((n-out)+' of '+n+' sites — '+out+\n"
        "      ' excluded, each becoming its own card')\n"
        "    : ('all '+n+' site'+(n!==1?'s':''));\n"
        "}\n"
        "async function toggle(sid,site,fig){\n"
        "  const card=fig.closest('.card');\n"
        "  const out=!fig.classList.contains('out');\n"
        "  fig.classList.toggle('out',out);\n"
        "  (excluded[sid]=excluded[sid]||{})[site]=out;\n"
        "  retally(card);\n"
        "  try{\n"
        "    const r=await fetch('/exclude',{method:'POST',"
        "headers:{'Content-Type':'application/json'},\n"
        "      body:JSON.stringify({id:sid,site:site,excluded:out})});\n"
        "    if(!r.ok) throw new Error('HTTP '+r.status);\n"
        "  }catch(e){\n"
        # An exclude that looks recorded and is not would silently widen the
        # ruling back over the site he just pulled out — the same failure as
        # the green card that never saved.
        "    fig.classList.toggle('out',!out); retally(card);\n"
        "    card.classList.add('unsaved');\n"
        "  }\n"
        "}\n"
        # ⚠ A CARD CAN BE GREEN AND ABSENT FROM THE STORE, and nothing on the
        # page ever asks. 217-L:54 was typed, showed `✓ ruled`, and the store
        # had no entry for it — the only trace of that site anywhere was the
        # `none` from the sitting before. The failure branch un-greens a card
        # when a POST throws, but it cannot see a POST that never left, a tab
        # whose network went while it slept, or a store rewritten underneath.
        #
        # So the page checks itself against the store rather than trusting what
        # it remembers: on focus, on waking, and every half minute. What it
        # finds is not a log line — it is the card turning red and saying so.
        "async function reconcile(){\n"
        "  let have;\n"
        "  try{ const r=await fetch('/rulings',{cache:'no-store'});\n"
        "       if(!r.ok) return; have=await r.json(); }catch(e){ return; }\n"
        "  const lost=[];\n"
        "  for(const sid in done){\n"
        "    if(have[sid] && have[sid].verdict) continue;\n"
        "    const c=document.querySelector"
        "('[data-sid=\\''+CSS.escape(sid)+'\\']');\n"
        "    if(!c) continue;\n"
        "    c.classList.add('unsaved'); c.classList.remove('done');\n"
        "    delete done[sid]; lost.push(sid);\n"
        "  }\n"
        "  const cnt=document.getElementById('count');\n"
        "  if(cnt) cnt.textContent=Object.keys(done).length+' / '+\n"
        "    document.querySelectorAll('.card').length+' ruled';\n"
        "  if(lost.length){\n"
        "    let w=document.getElementById('warn');\n"
        "    if(!w){ w=document.createElement('div'); w.id='warn';\n"
        "      document.body.prepend(w); }\n"
        "    w.textContent=lost.length+' ruling'+(lost.length>1?'s are':' is')+\n"
        "      ' NOT in the store - those cards are red again. Rule them once more.';\n"
        "  }\n"
        "}\n"
        "addEventListener('focus',reconcile);\n"
        "addEventListener('visibilitychange',()=>{"
        "if(!document.hidden) reconcile();});\n"
        "setInterval(reconcile,30000);\n"
        "addEventListener('DOMContentLoaded', async ()=>{\n"
        "  try{\n"
        "    const r=await fetch('/rulings'); if(!r.ok) return;\n"
        "    const have=await r.json();\n"
        "    for(const sid in have){\n"
        "      const c=document.querySelector"
        "('[data-sid=\\''+CSS.escape(sid)+'\\']')"
        "||document.getElementById(sid);\n"
        "      if(!c) continue;\n"
        "      (have[sid].excluded||[]).forEach(st=>{\n"
        "        const f=c.querySelector"
        "('[data-site=\\''+CSS.escape(st)+'\\']');\n"
        "        if(f) f.classList.add('out');\n"
        "      });\n"
        "      retally(c);\n"
        # A card can carry excludes before it is answered: excluding is part of
        # reading it, not part of ruling it.
        "      if(!have[sid].verdict) continue;\n"
        "      c.classList.add('done'); done[sid]=have[sid];\n"
        "      c.querySelectorAll('button').forEach(b=>{\n"
        "        if(b.dataset.detail===have[sid].detail){\n"
        "          b.classList.add('chosen');\n"
        "          b.setAttribute('aria-pressed','true'); }});\n"
        "    }\n"
        "    document.getElementById('count').textContent=\n"
        "      Object.keys(done).length+' / '+"
        "document.querySelectorAll('.card').length+' ruled';\n"
        "  }catch(e){}\n"
        "  document.querySelectorAll('.card').forEach(c=>{\n"
        "    retally(c);\n"
        "    c.addEventListener('click', ev=>{\n"
        "      if(ev.target.closest('button')) return;\n"
        "      if(ev.target.closest('.strip')) return;\n"
        "      if(c.classList.contains('done')) c.classList.toggle('open');\n"
        "    });\n"
        "  });\n"
        "  const next=document.querySelector('.card:not(.done)');\n"
        "  if(next) next.scrollIntoView({block:'start'});\n"
        "});\n"
        # ⚠ THE TYPED ESCAPE. Every rule in this file says no typing, and it
        # still does for the BUTTONS — they stay first and they stay the whole
        # answer wherever an answer exists. John asked for this on 2026-08-26
        # while ruling seventeen cards whose right answer is a deletion the
        # readers never offered: without it his only exit is `none`, which
        # records "the ink shows something else" and then costs a second
        # sitting to say what. A typed reading is a LAST resort that saves that
        # round trip; it is recorded as an ordinary accept, with `typed: true`
        # so the store can always be asked which rulings came this way.
        "async function ruleTyped(sid,btn){\n"
        "  const box=document.getElementById('t-'+sid);\n"
        "  const v=(box.value||'').trim();\n"
        "  if(!v){ box.focus(); return; }\n"
        "  await rule(sid,'accept',v,btn,true);\n"
        "}\n"
        # ⚠ A CORRECTION IS A `preserve`, NEVER AN `accept`. The corpus keeps
        # the ink; only the register learns the emendation. Posting this as an
        # accept would edit work/reconciled to a reading John explicitly said
        # the page does NOT have.
        "async function ruleCorrection(sid,btn){\n"
        "  const box=document.getElementById('c-'+sid);\n"
        "  const v=(box.value||'').trim();\n"
        "  if(!v){ box.focus(); return; }\n"
        "  await rule(sid,'preserve','',btn,false,v);\n"
        "}\n"
                # ⚠ INSERT AT THE CARET, NOT AT THE END. He will build a form and
        # then fix the middle of it; appending would make that impossible,
        # and a combining mark must be able to land on the letter he means.
        # `null` is backspace, and it removes a whole GRAPHEME — one tap
        # taking off `ȣ̔̀` a mark at a time, never half a character.
        # ⚠ AND HE CANNOT SEE WHAT HE HAS BUILT. Two combining marks over `ȣ`
        # DO NOT RENDER — recorded here on 2026-08-10, when a card held `ȣ̔͂` and
        # John read the pair as an apostrophe. The palette makes those forms
        # buildable and the screen still will not draw them, so the field says
        # in words what it holds. John, 2026-08-30: "or if i can combine, I
        # CAN'T SEE IT RENDER."
        f'const SORTS={json.dumps({ch: name for ch, name in PALETTE}, ensure_ascii=False)};\n'
        "function say(id){\n"
        "  const el=document.getElementById(id),\n"
        "        out=document.getElementById('say-'+id);\n"
        "  if(!el||!out) return;\n"
        "  const v=el.value.normalize('NFD');\n"
        "  if(!v){out.innerHTML=''; return;}\n"
        "  const bits=[]; let cur=null;\n"
        "  for(const c of v){\n"
        "    if(/\\p{M}/u.test(c)){\n"
        "      if(cur) cur.marks.push(SORTS[c]||'mark');\n"
        "    } else { cur={base:c,marks:[]}; bits.push(cur); }\n"
        "  }\n"
        "  out.innerHTML=bits.map(b=>{\n"
        "    const nm=SORTS[b.base];\n"
        "    const head='<b>'+(nm?nm:b.base)+'</b>';\n"
        "    return b.marks.length? head+' + '+b.marks.join(' + '):head;\n"
        "  }).join(' · ');\n"
        "}\n"
        "function ins(id,ch){\n"
        "  const el=document.getElementById(id); if(!el) return;\n"
        "  let a=el.selectionStart, b=el.selectionEnd;\n"
        "  if(a===null||a===undefined){a=b=el.value.length;}\n"
        "  if(ch===null){\n"
        "    if(a!==b){el.value=el.value.slice(0,a)+el.value.slice(b);}\n"
        "    else if(a>0){let n=a-1;\n"
        "      while(n>0&&/\\p{M}/u.test(el.value[n])) n--;\n"
        "      el.value=el.value.slice(0,n)+el.value.slice(a); a=n;}\n"
        "    b=a;\n"
        "  } else {\n"
        "    el.value=el.value.slice(0,a)+ch+el.value.slice(b);\n"
        "    a=b=a+ch.length;\n"
        "  }\n"
        "  el.focus(); el.setSelectionRange(a,b); say(id);\n"
        "}\n"
        "async function rule(sid,verdict,detail,btn,typed,correction){\n"
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
        "       body:JSON.stringify({id:sid,verdict,detail,typed:!!typed,"
        "correction:correction||''})});\n"
        "    if(!r.ok) throw new Error('HTTP '+r.status);\n"
        "    card.dataset.saved='1';\n"
        "    card.classList.remove('unsaved');\n"
        "    const w0=document.getElementById('warn'); if(w0) w0.remove();\n"
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
    # A re-read gets its own store so a fresh sitting cannot overwrite the
    # rulings already given — see carry_rulings.
    p.add_argument('--rulings', type=Path, default=RULINGS)
    p.add_argument('--only-unruled', action='store_true',
                   help='build the page from cards the store has no answer '
                        'for — the ruled ones still resolve under settle_apply')
    p.add_argument('--serve', action='store_true')
    p.add_argument('--wifi', action='store_true')
    p.add_argument('--port', type=int, default=8793)
    p.add_argument('--no-crops', action='store_true',
                   help='build the page without cropping (fast structure check)')
    p.add_argument('--page', type=Path, default=PAGE,
                   help='where to write the HTML; a cold sitting gets its own')
    p.add_argument('--spine-dir', type=Path, default=None,
                   help='column text the cards call printed (default: the '
                        "queue's own `spine_dir`, else raw/opus)")
    p.add_argument('--spine-alto', type=Path, action='append', default=[],
                   help='extra ALTO directory to crop lines by; repeatable')
    p.add_argument('--crops', type=Path, default=CROPS,
                   help='where per-member crops are cut (gitignored)')
    p.add_argument('--no-strip', action='store_true',
                   help='skip the per-member strip — one crop per card only')
    a = p.parse_args(argv)

    if not a.queue.exists():
        print(f'not found: {a.queue}', file=sys.stderr)
        return 2

    # ⚠ A queue built on a non-Opus spine MUST NOT be cropped against Opus.
    # The queue carries its own spine, so forgetting the flag cannot silently
    # put the wrong reader's line under John's eyes.
    doc = json.loads(a.queue.read_text(encoding='utf-8'))
    spine_dir = a.spine_dir or (
        Path(doc['spine_dir']) if isinstance(doc, dict) and doc.get('spine_dir')
        else None)
    if spine_dir is not None:
        alto = list(a.spine_alto) or [
            Path(d) for d in (doc.get('alto_dirs') or [])
            if isinstance(doc, dict)]
        who = (doc.get('spine_reader') if isinstance(doc, dict) else None) or '?'
        use_spine(spine_dir, None, alto, label=who)
        print(f'spine: {who} at {spine_dir}')

    cards = cards_from_queue(a.queue)
    # A card already answered keeps the shape it was answered in.
    n_moved = 0
    if a.rulings.exists():
        store = json.loads(a.rulings.read_text(encoding='utf-8'))
        for c in cards:
            entry = store.get(c.sid)
            if entry is None:
                continue
            c.ruled_before_strip = True
            was = entry.get('sites')
            # ⚠ SAME KEY, DIFFERENT SITES. The ruling was given over the set it
            # names; if this build binds a different set the answer does not
            # carry, and the card comes back as a question rather than
            # inheriting an answer to something else.
            if was is not None and (sorted(site_place(x) for x in was)
                                    != sorted(m.place for m in c.members)):
                c.ruled_before_strip = False
                c.note = (f'this card was answered over {len(was)} site'
                          f'{"s" if len(was) != 1 else ""} and now binds '
                          f'{c.n} — the earlier answer does not carry, so it '
                          f'is asked again')
                n_moved += 1
    # Pure ς/ϛ numeral form-sets are encoding, not ink. Drop them from the
    # page John sees (numeral_fix owns them) but leave them in the queue JSON
    # so an already-recorded ruling still resolves under settle_apply.
    def _drop_as_numeral(c) -> bool:
        if not encoding_only_form_set(c.form_set):
            return False
        # ⚠ ASK THE LINE ABOVE. See `numeral_card_is_a_word_tail`.
        return not any(numeral_card_is_a_word_tail(
            m.page, m.col, m.line, c.printed or (c.form_set[0] if c.form_set
                                                 else ''), spine_dir)
            for m in c.members)

    n_encoding = sum(1 for c in cards if _drop_as_numeral(c))
    cards = [c for c in cards if not _drop_as_numeral(c)]
    n_answered = 0
    if a.only_unruled and a.rulings.exists():
        answered = {k for k, v in json.loads(
            a.rulings.read_text(encoding='utf-8')).items()
            if v.get('verdict')}
        before = len(cards)
        cards = [c for c in cards if c.sid not in answered
                 or not c.ruled_before_strip]
        n_answered = before - len(cards)
    n_skip = 0
    m_skip = 0
    if a.no_crops:
        print(f'{len(cards)} cards (crops skipped)')
    else:
        n_ok, n_skip = fill_crops(cards)
        print(f'{len(cards)} cards · crops ok={n_ok} skipped={n_skip}')
        if not a.no_strip:
            m_ok, m_skip = cut_member_crops(cards, a.crops)
            bundled = sum(1 for c in cards
                          if c.n > 1 and not c.ruled_before_strip)
            frozen = sum(1 for c in cards if c.n > 1 and c.ruled_before_strip)
            print(f'  {bundled} bundled card{"s" if bundled != 1 else ""} · '
                  f'member crops ok={m_ok} skipped={m_skip} -> {a.crops}')
            if frozen:
                print(f'  {frozen} multi-site card{"s" if frozen != 1 else ""} '
                      f'already ruled — left as answered, no strip added')
    if n_encoding:
        print(f'  dropped {n_encoding} encoding-only numeral card'
              f'{"s" if n_encoding != 1 else ""} (ς/ϛ)')
    if n_moved:
        print(f'  ⚠ {n_moved} card{"s" if n_moved != 1 else ""} bind a '
              f'different set of sites than the answer recorded for them — '
              f'asked again, not inherited')
    if n_answered:
        print(f'  {n_answered} card{"s" if n_answered != 1 else ""} already '
              f'answered in {a.rulings.name} — off the page, still applied')
    html(cards, a.page)
    print(f'-> {a.page}')
    n_prop = sum(1 for c in cards if c.proposal)
    print(f'  form-sets: {len(cards)}')
    print(f'  with siglum proposal: {n_prop}')
    print(f'  total sites: {sum(c.n for c in cards)}')
    if n_skip:
        print(f'  ⚠ {n_skip} cards have no ink crop — do not serve those for ruling')
    if m_skip:
        print(f'  ⚠ {m_skip} member crops could not be cut — those sites say so '
              f'on the strip and should be excluded, not ruled blind')
    if a.serve or a.wifi:
        serve(cards, a.port, '0.0.0.0' if a.wifi else '127.0.0.1',
              page=a.page, store=a.rulings, verdicts=VERDICTS,
              crops=None if a.no_strip else a.crops,
              sites={m.sid for c in cards for m in c.members},
              card_sites={c.sid: [m.sid for m in c.members] for c in cards})
    return 0


if __name__ == '__main__':
    sys.exit(main())
