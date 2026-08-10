"""Settle word-level OCR disputes with every authority we have — separately.

`word_flags` turns character-level flag sites into whole-word disputes. This
module asks, of the readings those disputes offer, which ones an authority
will accept. Each authority is tried on its own and reported on its own, so
we can see which earn their place.

The untested idea that is the main point of this module: Morpheus has only
ever been asked "does the PRINTED form exist?". It has never been asked the
arbitration question — of the readings the readers offer, which are real
Greek words? When kraken reads `ἁμιῶς` and opus reads `ἁμῶς`, only one is
Greek. That should settle a share of the LETTER disputes no authority has
pointed at before.

⚠ THREE HARD SAFETY RULES (each learned from a real defect):

1. AN OCR FAILURE CAN MANUFACTURE A REAL WORD. `χȣ̔́τω` (page-050-R:50) is the
   χ of `οὐχ` glued onto `οὕτω`; the glued result is a real Morpheus crasis
   entry. Prefer a reading that does not require gluing or splitting at the
   word boundary; treat a lone "winner" that only becomes valid by absorbing
   or shedding a neighbouring letter as suspect and refuse.

2. SILENCE IS ALWAYS ACCEPTABLE, A WRONG SETTLEMENT IS NOT. Where more than
   one reading is real Greek, do not choose — that is the ink's job.

3. WEAK READERS POISON ARBITRATION. Including genie and llama makes both
   breathings look attested. Every rate is reported BOTH ways: strong
   readers only (opus/kraken/codex) and all five.

⚠ ACCENT-ONLY IS MOSTLY NOT SETTLEABLE FROM A LEXICON. Acute-vs-grave is
positional (Smyth §154): a final acute becomes grave before a following
word, stays acute before stop punctuation or an enclitic (§183), and does
not apply before citation apparatus (siglum / Bekker / Latin). Morpheus
stores citation accents and never generates contextual graves; treating
its silence on a grave as evidence is a known trap. This module recovers
the following WORD from the spaced Opus column (not just the next char)
and applies §154/§183; it never confuses Morpheus silence for an accent
ruling.

    python3 -m bonitz_pipeline.settle work/flags5-053-062.jsonl
    python3 -m bonitz_pipeline.settle work/flags5-053-062.jsonl --sample 20
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from bonitz_pipeline import morpheus
from bonitz_pipeline.breathing_oracle import (
    arbitrate as lexicon_arbitrate,
    breathing,
    decide as lexicon_decide,
)
from bonitz_pipeline.normalize import canonical, clean_opus
from bonitz_pipeline.siglum_check import book_ok, inventory, split
from bonitz_pipeline.word_flags import WordFlag, is_word_char, skeleton, words

ROOT = Path(__file__).resolve().parent.parent

STRONG_READERS = ('opus', 'kraken', 'codex')
ALL_READERS = ('opus', 'genie', 'llama', 'kraken', 'codex')

ACUTE, GRAVE, CIRC = '́', '̀', '͂'
# Stop punctuation: final acute stays acute (Smyth §154a.4: colon/period;
# comma usage varies — we treat it as pause → acute, one common convention).
STOP = set('.,;:·!?—–‐-')
# Bekker page immediately after a citation token in the whitespace-free stream.
BEKKER = re.compile(r'(\d{2,4})\s*([ab])')

# Greek enclitics (Smyth §181), stored as skeletons (skeleton() folds final
# ς→σ and lowercases). Free particle δέ is orthotone — not listed. 2sg εἶ /
# φῄς never enclitic. Orthotone ἔστι (existence) is filtered at match time by
# requiring the token to carry no acute/circumflex of its own.
ENCLITICS = frozenset({
    # particles
    'τε', 'γε', 'τοι', 'περ',
    # personal pronouns
    'μου', 'μοι', 'με', 'σου', 'σοι', 'σε', 'ου', 'οι', 'ε', 'σφισι',
    # indefinite τις (all cases)
    'τισ', 'τι', 'τινοσ', 'τινι', 'τινα', 'τινων', 'τισι', 'τισιν',
    'τινεσ', 'τινασ', 'τινε', 'τινοιν',
    # indefinite adverbs
    'που', 'ποθι', 'πη', 'ποι', 'ποθεν', 'ποτε', 'πω', 'πωσ',
    # εἰμί / φημί present except 2sg
    'ειμι', 'εστι', 'εστιν', 'εσμεν', 'εστε', 'εισι', 'εισιν',
    'φημι', 'φησι', 'φησιν', 'φαμεν', 'φατε', 'φασι', 'φασιν',
})

# Authority names — stable strings for reports and tests.
AUTH_MORPHEUS_MEMBER = 'morpheus.membership'
AUTH_MORPHEUS_DECIDE = 'morpheus.decide'
AUTH_LEX_ARB = 'breathing_oracle.arbitrate'
AUTH_LEX_DECIDE = 'breathing_oracle.decide'
AUTH_SIGLUM = 'siglum.holds'
AUTH_ACCENT_POS = 'accent.positional'
AUTH_AGREE = 'readers.agree'
AUTH_REFUSE = 'refuse'


# --- data -------------------------------------------------------------------

@dataclass(frozen=True)
class Settlement:
    """One dispute's outcome under one reader set."""
    word: WordFlag
    forms: frozenset[str]
    winner: str | None
    authority: str
    reason: str
    readers: tuple[str, ...]
    suspicious: bool = False

    @property
    def settled(self) -> bool:
        return self.winner is not None

    @property
    def kind(self) -> str:
        return self.word.kind


@dataclass
class SettleReport:
    """Settlements for one reader set, with refusal counts kept visible."""
    settlements: list[Settlement] = field(default_factory=list)
    reader_set: tuple[str, ...] = STRONG_READERS

    @property
    def settled(self) -> list[Settlement]:
        return [s for s in self.settlements if s.settled]

    @property
    def refused(self) -> list[Settlement]:
        return [s for s in self.settlements if not s.settled]

    @property
    def by_kind(self) -> Counter:
        return Counter(s.kind for s in self.settlements)

    @property
    def settled_by_kind(self) -> Counter:
        return Counter(s.kind for s in self.settled)

    @property
    def refused_by_kind(self) -> Counter:
        return Counter(s.kind for s in self.refused)

    @property
    def by_authority(self) -> Counter:
        return Counter(s.authority for s in self.settled)

    @property
    def refuse_reasons(self) -> Counter:
        return Counter(s.reason for s in self.refused)

    @property
    def suspicious(self) -> list[Settlement]:
        return [s for s in self.settlements if s.suspicious]

    def assert_complete(self) -> None:
        """Every input is settled or refused with a reason — nothing vanishes."""
        n = len(self.settlements)
        assert n == len(self.settled) + len(self.refused)
        assert all(s.reason for s in self.settlements)
        assert all(s.authority for s in self.settlements)
        for s in self.refused:
            assert s.winner is None
            assert s.authority == AUTH_REFUSE


# --- pure helpers -----------------------------------------------------------

def select_readings(word: WordFlag,
                    reader_names: tuple[str, ...] | list[str]
                    ) -> dict[str, str]:
    """Readings present both in the word and in the chosen reader set."""
    return {n: word.readers[n] for n in reader_names if n in word.readers}


def is_real_greek(form: str,
                  index: dict[str, set[str]] | None = None) -> bool:
    """True when Morpheus generates this skeleton (any breathing).

    Letter disputes differ in letters, so skeleton membership is the right
    question. Accent is deliberately ignored — Morpheus and Bonitz do not
    share an accent system (see morpheus module docstring).
    """
    idx = index if index is not None else morpheus.index()
    return morpheus.key(form) in idx


def boundary_glue_suspect(winner: str, rivals: set[str]) -> bool:
    """True if the winner is longer than a rival by one letter at either edge.

    That is the χ+οὕτω → χοὔτω class: the sole "real" form only looks Greek
    because OCR absorbed a neighbouring letter. Mid-word insertions
    (ἁμῶς / ἁμιῶς) are ordinary letter fights and must NOT trip this.

    A SHORTER winner against a longer rival is the preferred reading (no
    glue) and is not suspect — refuse only absorption, not the clean form.
    """
    ws = skeleton(winner)
    if not ws:
        return False
    for r in rivals:
        rs = skeleton(r)
        if not rs:
            continue
        if len(ws) == len(rs) + 1 and (ws[1:] == rs or ws[:-1] == rs):
            return True
    return False


def _siglum_tokens(form: str) -> list[str]:
    """Candidate tokens to hand to siglum_check.split."""
    out: list[str] = []
    seen: set[str] = set()
    for t in (form, skeleton(form)):
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
        if t[0].islower():
            cap = t[0].upper() + t[1:]
            if cap not in seen:
                seen.add(cap)
                out.append(cap)
        # Homoglyph Latin → Greek is siglum_check's problem on full lines;
        # word-level tokens here are already Greek from word_flags.
    return out


def looks_like_citation(forms: set[str],
                        works: dict | None = None) -> bool:
    """True when every reading is bare (no diacritics) and at least one splits
    as a Bonitz work+book token.

    Short bare runs like `Πα` / `Πι` are ALSO real-looking Greek to Morpheus
    (`πα` is a form). Citation disputes must not fall through to membership.
    """
    if not forms:
        return False
    works = works if works is not None else inventory()
    any_split = False
    for f in forms:
        d = unicodedata.normalize('NFD', f)
        if any(unicodedata.combining(c) for c in d):
            return False
        sk = skeleton(f)
        if not (1 <= len(sk) <= 4):
            return False
        for t in _siglum_tokens(f):
            if split(t, works):
                any_split = True
                break
    return any_split


HYPHEN = '-‐‑–'


def broken_at_the_measure(ct: '_ColText', word_off: int, word: str) -> bool:
    """Is this word only half of one, broken across Bonitz's column?

    ⚠ A FRAGMENT IS NOT A LEMMA, AND IT ALWAYS LOOKS LIKE SOME SHORTER WORD.
    Measured 2026-08-10 against John's adjudicated text: the column breaks
    `δοκί-` / `δες` for δοκίδες, and asked which of `δοξί`/`δοκί` is real Greek,
    Morpheus crowned `δοξί` — a real form, and the wrong one. That was the sole
    failure of `morpheus.membership` in the ground-truth run, 9 of 10.

    ⚠ AND IT CANNOT BE ASKED OF THE STREAM. `canonical` strips ALL whitespace,
    so the broken word arrives joined as `δοξίδες` with no hyphen left to find,
    and "is a Greek letter next?" is true of very nearly every word in the
    column — a first attempt at this refused 371 sites on pages 53-62 and would
    have thrown away a third of the settlements. The question only means
    anything against the ORIGINAL SPACED TEXT, which is what `offs` is for.

    Reader agreement is deliberately left alone: readers can see the page, and
    it is only a lexicon that cannot tell a word from a piece of one.
    """
    if word_off < 0 or word_off >= len(ct.offs):
        return False
    end = ct.offs[word_off] + len(word)
    return bool(re.match(r'[-‐‑–]\s*\n', ct.base[end:end + 4]))


def bekker_after(stream: str, word_off: int, word: str) -> int | None:
    """Bekker page printed after this token in the whitespace-free Opus stream.

    A citation states the same fact twice (siglum+book, and page). The page
    is what adjudicates which reading of the token is possible.
    """
    if word_off < 0 or word_off > len(stream):
        return None
    # Search a short window starting at the token; accept the first page that
    # begins at or after the token's end (minus one, for tight packing).
    window = stream[word_off:word_off + len(word) + 48]
    end = len(word)
    for m in BEKKER.finditer(window):
        if m.start() >= max(0, end - 1):
            return int(m.group(1))
    return None


def final_accent_mark(form: str) -> str | None:
    """The acute/grave/circumflex on the last accented vowel, or None."""
    d = unicodedata.normalize('NFD', form)
    last: str | None = None
    i = 0
    while i < len(d):
        if unicodedata.combining(d[i]):
            i += 1
            continue
        j = i + 1
        marks: list[str] = []
        while j < len(d) and unicodedata.combining(d[j]):
            if d[j] in (ACUTE, GRAVE, CIRC):
                marks.append(d[j])
            j += 1
        if marks:
            last = marks[-1]
        i = j
    return last


def following_char(stream: str, word_off: int, word: str) -> str:
    """Next character after the Opus form in the whitespace-free stream."""
    at = word_off + len(word)
    if 0 <= at < len(stream):
        return stream[at]
    return ''


def _has_acute_or_circ(form: str) -> bool:
    d = unicodedata.normalize('NFD', form)
    return ACUTE in d or CIRC in d


def is_enclitic_form(form: str) -> bool:
    """True when form is an unaccented (or grave-only) enclitic.

    Orthotone ἔστι / φησί keep an acute and must NOT trip the enclitic
    exception — before them the host takes the grave (ordinary §154).
    """
    if not form:
        return False
    if skeleton(form) not in ENCLITICS:
        return False
    # Enclitic has lost its accent; orthotone writing keeps acute/circumflex.
    return not _has_acute_or_circ(form)


@dataclass(frozen=True)
class Following:
    """What comes after a word in the spaced column text."""
    raw: str
    kind: str          # end | stop | greek | latin | digit | other
    is_enclitic: bool = False
    is_citation: bool = False  # work siglum / Bekker apparatus, not prose sandhi


def following_token(
        stream: str,
        offs: list[int],
        base: str,
        word_off: int,
        word: str,
) -> Following:
    """Next spaced token after `word` at stream[word_off:].

    The whitespace-free stream alone cannot recover word boundaries (Greek
    runs glue together). Map through `offs` into the original spaced `base`,
    which is how word_flags already rebuilds words.
    """
    end = word_off + len(word)
    if end <= 0 or not stream or end > len(stream):
        return Following('', 'end')
    if end == len(stream):
        return Following('', 'end')
    # Base offset just after the last stream char of this word.
    base_at = offs[end - 1] + 1 if end - 1 < len(offs) else len(base)
    i = base_at
    while i < len(base) and base[i].isspace():
        i += 1
    if i >= len(base):
        return Following('', 'end')
    c0 = base[i]
    if c0 in STOP:
        return Following(c0, 'stop')
    # Parentheses / quotes often open a gloss; not prose sandhi — refuse.
    if c0 in '()[]{}«»"\'':
        return Following(c0, 'other')
    if c0.isdigit():
        j = i
        while j < len(base) and (base[j].isdigit() or base[j] in 'ab.'):
            j += 1
        return Following(base[i:j], 'digit', is_citation=True)
    if c0.isascii() and c0.isalpha():
        j = i
        while j < len(base) and base[j].isascii() and (
                base[j].isalpha() or base[j] in '.-'):
            j += 1
        return Following(base[i:j], 'latin', is_citation=True)
    if not (is_word_char(c0) or _is_greek_letter(c0)):
        return Following(c0, 'other')
    j = i
    while j < len(base) and not base[j].isspace() and is_word_char(base[j]):
        j += 1
    raw = base[i:j]
    while raw and raw[-1] in STOP | set('()[]{}'):
        raw = raw[:-1]
    if not raw:
        return Following(base[i:j], 'other')
    # Citation apparatus: short bare Greek hard against a Bekker page.
    # Do NOT use siglum_check.split here — almost any short Greek string
    # parses as some work+book (τι, τε, ε+στι, …), which would refuse all
    # real sandhi. The digit that always follows a Bonitz citation is the
    # reliable signal. Smyth §154 is about words in the sentence, not sigla.
    sk = skeleton(raw)
    k = j
    while k < len(base) and base[k].isspace():
        k += 1
    citation = (
        1 <= len(sk) <= 4
        and k < len(base)
        and base[k].isdigit()
    )
    encl = (not citation) and is_enclitic_form(raw)
    return Following(raw, 'greek', is_enclitic=encl, is_citation=citation)


# --- authorities (each returns (winner, reason) or None) --------------------

def by_morpheus_membership(
        forms: set[str],
        index: dict[str, set[str]] | None = None,
) -> tuple[str, str] | None:
    """Exactly one reading is a form Morpheus generates — take it.

    Refuses (returns None) when zero or many are real, and when the sole
    real form is a boundary-glue suspect against a rival.
    """
    idx = index if index is not None else morpheus.index()
    real = {f for f in forms if is_real_greek(f, idx)}
    if len(real) != 1:
        return None
    winner = next(iter(real))
    rivals = forms - {winner}
    if boundary_glue_suspect(winner, rivals):
        return None
    return winner, f'only {winner!r} is a Morpheus form'


def by_morpheus_decide(forms: set[str]) -> tuple[str, str] | None:
    """Morpheus admits exactly one breathing; exactly one reading has it."""
    if len(forms) < 2:
        return None
    # Same skeleton required for a breathing fight; letter fights belong to
    # membership. If skeletons differ, decide() keys differently per form.
    if len({morpheus.key(f) for f in forms}) != 1:
        return None
    probe = next(iter(forms))
    got = morpheus.decide(probe)
    if got is None:
        return None
    want, evidence = got
    match = {f for f in forms if breathing(f) == want}
    if len(match) != 1:
        return None
    winner = next(iter(match))
    return winner, evidence


def by_lexicon_arbitrate(
        readings: dict[str, str],
) -> tuple[str, str] | None:
    """breathing_oracle.arbitrate: accepts some readings, rejects others."""
    got = lexicon_arbitrate(readings)
    if got is None:
        return None
    return got[0], got[1]


def by_lexicon_decide(forms: set[str]) -> tuple[str, str] | None:
    """Unique form whose breathing decide() confirms; others not confirmed.

    Narrower than arbitrate: no family-ambiguity pre-gate across the set, so
    it can fire where arbitrate stays silent — and can also over-reach, which
    is why it is reported separately and applied after arbitrate.
    """
    good: dict[str, str] = {}
    for f in forms:
        d = lexicon_decide(f)
        if d and d[0] == breathing(f):
            good[f] = d[1]
    if len(good) == 1 and len(good) < len(forms):
        w, why = next(iter(good.items()))
        return w, why
    return None


def by_siglum_holds(
        forms: set[str],
        page: int | None,
        works: dict | None = None,
) -> tuple[str, str] | None:
    """Exactly one reading is a work+book whose Bekker range holds `page`."""
    if page is None:
        return None
    works = works if works is not None else inventory()
    good: set[str] = set()
    why: dict[str, str] = {}
    for f in forms:
        for t in _siglum_tokens(f):
            for work_sig, book in split(t, works):
                w = works[work_sig]
                if w.holds(page) and book_ok(work_sig, book):
                    good.add(f)
                    why[f] = (f'{t} → {work_sig} book {book or "—"} '
                              f'holds Bekker {page} ({w.lo}-{w.hi})')
                    break
            if f in good:
                break
    if len(good) != 1:
        return None
    winner = next(iter(good))
    return winner, why[winner]


def by_accent_positional(
        forms: set[str],
        nxt: Following | str,
) -> tuple[str, str] | None:
    """Smyth §154 / §183 for final acute-vs-grave only.

    - Before ordinary following Greek word → grave (§154).
    - Before enclitic → acute (§154a.1 / §183a: ἀγαθός τις).
    - Before stop punctuation or end of stream → acute (§154a.4).
    - Before Latin, digit, work-siglum, or other non-prose → refuse.
      Bonitz's page is dense with citations; a siglum is not "another word
      in the sentence," so sandhi does not apply.
    - Circumflex fights and non-final accent fights → refuse.

    `nxt` may be a Following (preferred) or a bare next-character string for
    the old char-level call sites and tests.
    """
    if len(forms) < 2:
        return None
    marks = {final_accent_mark(f) for f in forms}
    if marks != {ACUTE, GRAVE}:
        return None
    # Every form must carry its accent on the same skeleton (accent-only).
    if len({skeleton(f) for f in forms}) != 1:
        return None

    if isinstance(nxt, str):
        # Back-compat path: single following character (no word recovery).
        if not nxt:
            foll = Following('', 'end')
        elif nxt in STOP:
            foll = Following(nxt, 'stop')
        elif _is_greek_letter(nxt):
            foll = Following(nxt, 'greek')
        else:
            return None
    else:
        foll = nxt

    if foll.kind == 'end':
        want, where = ACUTE, 'end of stream'
    elif foll.kind == 'stop':
        want, where = ACUTE, f'before stop {foll.raw!r}'
    elif foll.is_citation or foll.kind in ('latin', 'digit'):
        return None
    elif foll.kind == 'greek' and foll.is_enclitic:
        want, where = ACUTE, f'before enclitic {foll.raw!r}'
    elif foll.kind == 'greek':
        want, where = GRAVE, f'before following Greek word {foll.raw!r}'
    else:
        return None

    match = {f for f in forms if final_accent_mark(f) == want}
    if len(match) != 1:
        return None
    winner = next(iter(match))
    return winner, f'Smyth §154: final {("grave" if want == GRAVE else "acute")} {where}'


def _is_greek_letter(c: str) -> bool:
    if not c:
        return False
    base = unicodedata.normalize('NFD', c)[0]
    o = ord(base)
    return (0x0370 <= o <= 0x03FF) or (0x1F00 <= o <= 0x1FFF) or base in 'ȣȢϗϛ'


# --- column cache for Bekker / following-word --------------------------------

@dataclass(frozen=True)
class _ColText:
    stream: str
    offs: list[int]
    base: str


@lru_cache(maxsize=1)
def _opus_columns(opus_dir: str) -> dict[tuple[int, str], _ColText]:
    root = Path(opus_dir)
    out: dict[tuple[int, str], _ColText] = {}
    for p in sorted(root.glob('page-*-*.txt')):
        # page-053-L.txt
        parts = p.stem.split('-')
        if len(parts) != 3:
            continue
        try:
            page = int(parts[1])
        except ValueError:
            continue
        col = parts[2]
        cleaned = clean_opus(p.read_text(encoding='utf-8'))
        stream, offs = canonical(cleaned)
        base = unicodedata.normalize('NFC', cleaned)
        out[(page, col)] = _ColText(stream, offs, base)
    return out


def column_stream(page: int, col: str,
                  opus_dir: Path | None = None) -> str | None:
    d = str(opus_dir or (ROOT / 'raw' / 'opus'))
    ct = _opus_columns(d).get((page, col))
    return ct.stream if ct else None


def column_text(page: int, col: str,
                opus_dir: Path | None = None) -> _ColText | None:
    d = str(opus_dir or (ROOT / 'raw' / 'opus'))
    return _opus_columns(d).get((page, col))


# --- refuse-reason classifiers (visible, not silent) ------------------------

def _membership_refusal(forms: set[str],
                        index: dict[str, set[str]] | None = None) -> str:
    idx = index if index is not None else morpheus.index()
    real = {f for f in forms if is_real_greek(f, idx)}
    if len(real) == 0:
        return 'morpheus:no_real_form'
    if len(real) > 1:
        return 'morpheus:multiple_real_forms'
    winner = next(iter(real))
    if boundary_glue_suspect(winner, forms - {winner}):
        return 'morpheus:glue_suspect'
    return 'morpheus:unsettled'


def _siglum_refusal(forms: set[str], page: int | None,
                    works: dict | None = None) -> str:
    if page is None:
        return 'siglum:no_bekker_page'
    works = works if works is not None else inventory()
    n = 0
    for f in forms:
        for t in _siglum_tokens(f):
            hit = False
            for work_sig, book in split(t, works):
                if works[work_sig].holds(page) and book_ok(work_sig, book):
                    n += 1
                    hit = True
                    break
            if hit:
                break
    if n == 0:
        return 'siglum:no_reading_holds_page'
    if n > 1:
        return 'siglum:multiple_readings_hold_page'
    return 'siglum:unsettled'


# --- per-dispute settlement -------------------------------------------------

def settle_one(
        word: WordFlag,
        reader_names: tuple[str, ...] = STRONG_READERS,
        *,
        index: dict[str, set[str]] | None = None,
        works: dict | None = None,
        stream: str | None = None,
        allow_accent_positional: bool = True,
) -> Settlement:
    """Apply authorities in a fixed order; silence when no unique winner.

    Order matters only among successful settlements (first win ends the
    chain). Refusals always carry an explicit reason so a dead lookup cannot
    look like caution.
    """
    names = tuple(reader_names)
    readings = select_readings(word, names)
    forms = frozenset(readings.values())
    base = dict(word=word, forms=forms, readers=names)

    # Degenerate input: fewer than two of the *requested* readers present.
    # One reader's opinion is not agreement — refuse with a counted reason.
    # (The old path treated a lone opus reading as readers.agree and "settled"
    # thousands of three-reader flags under STRONG without kraken/codex.)
    if len(readings) < 2:
        if len(readings) == 0:
            reason = 'no_readings_in_reader_set'
        else:
            reason = 'readers:fewer_than_two_present'
        return Settlement(
            winner=None, authority=AUTH_REFUSE,
            reason=reason,
            suspicious=False, **base)

    if len(forms) < 2:
        # ≥2 readers present and they all wrote the same form.
        only = next(iter(forms))
        return Settlement(
            winner=only, authority=AUTH_AGREE,
            reason='chosen readers agree on one form',
            suspicious=False, **base)

    form_set = set(forms)
    # ⚠ NO LEXICON MAY RULE ON HALF A WORD. Checked before any authority runs,
    # because every one of them asks a question only a whole word can answer.
    _ct = column_text(word.page, word.col)
    if _ct is not None and broken_at_the_measure(
            _ct, word.word_off, word.readers.get('opus') or next(iter(form_set))):
        return Settlement(
            winner=None, authority=AUTH_REFUSE,
            reason='fragment:broken_at_line_end',
            suspicious=False, **base)
    idx = index if index is not None else morpheus.index()
    wrks = works if works is not None else inventory()
    opus_form = word.readers.get('opus') or next(iter(form_set))

    # --- letters ------------------------------------------------------------
    if word.kind == 'letters':
        if looks_like_citation(form_set, wrks):
            page = bekker_after(stream, word.word_off, opus_form) if stream else None
            got = by_siglum_holds(form_set, page, wrks)
            if got:
                return Settlement(
                    winner=got[0], authority=AUTH_SIGLUM, reason=got[1],
                    suspicious=False, **base)
            # Do NOT fall through to Morpheus: short sigla are false friends.
            return Settlement(
                winner=None, authority=AUTH_REFUSE,
                reason=_siglum_refusal(form_set, page, wrks),
                suspicious=False, **base)

        got = by_morpheus_membership(form_set, idx)
        if got:
            return Settlement(
                winner=got[0], authority=AUTH_MORPHEUS_MEMBER, reason=got[1],
                suspicious=False, **base)
        return Settlement(
            winner=None, authority=AUTH_REFUSE,
            reason=_membership_refusal(form_set, idx),
            suspicious=False, **base)

    # --- breathing-only / marks-only (breathing authorities) ----------------
    if word.kind in ('breathing-only', 'marks-only'):
        for auth, fn in (
            (AUTH_MORPHEUS_DECIDE, lambda: by_morpheus_decide(form_set)),
            (AUTH_LEX_ARB, lambda: by_lexicon_arbitrate(readings)),
            (AUTH_LEX_DECIDE, lambda: by_lexicon_decide(form_set)),
        ):
            got = fn()
            if got:
                return Settlement(
                    winner=got[0], authority=auth, reason=got[1],
                    suspicious=False, **base)
        return Settlement(
            winner=None, authority=AUTH_REFUSE,
            reason=f'{word.kind}:breathing_authorities_silent',
            suspicious=False, **base)

    # --- accent-only --------------------------------------------------------
    if word.kind == 'accent-only':
        if allow_accent_positional and stream is not None:
            # Prefer spaced-column following word when this stream is that
            # column (production path). A synthetic stream (tests) falls
            # back to the next-character rule.
            col = column_text(word.page, word.col)
            if col is not None and stream == col.stream:
                nxt: Following | str = following_token(
                    col.stream, col.offs, col.base,
                    word.word_off, opus_form)
            else:
                nxt = following_char(stream, word.word_off, opus_form)
            got = by_accent_positional(form_set, nxt)
            if got:
                return Settlement(
                    winner=got[0], authority=AUTH_ACCENT_POS, reason=got[1],
                    suspicious=False, **base)
            return Settlement(
                winner=None, authority=AUTH_REFUSE,
                reason='accent-only:not_positional_or_ambiguous',
                suspicious=False, **base)
        return Settlement(
            winner=None, authority=AUTH_REFUSE,
            reason='accent-only:lexicon_cannot_settle',
            suspicious=False, **base)

    return Settlement(
        winner=None, authority=AUTH_REFUSE,
        reason=f'unknown_kind:{word.kind}',
        suspicious=False, **base)


def settle_words(
        word_list: list[WordFlag],
        reader_names: tuple[str, ...] = STRONG_READERS,
        *,
        opus_dir: Path | None = None,
        allow_accent_positional: bool = True,
) -> SettleReport:
    """Settle every word dispute under one reader set."""
    idx = morpheus.index()
    wrks = inventory()
    odir = opus_dir or (ROOT / 'raw' / 'opus')
    # Prime the column cache once.
    _ = _opus_columns(str(odir))

    out: list[Settlement] = []
    for w in word_list:
        stream = column_stream(w.page, w.col, odir)
        out.append(settle_one(
            w, reader_names,
            index=idx, works=wrks, stream=stream,
            allow_accent_positional=allow_accent_positional,
        ))
    rep = SettleReport(settlements=out, reader_set=tuple(reader_names))
    rep.assert_complete()
    return rep


def settle_path(
        path: Path | str,
        reader_names: tuple[str, ...] = STRONG_READERS,
        *,
        opus_dir: Path | None = None,
        allow_accent_positional: bool = True,
) -> SettleReport:
    """Load word flags from a flags JSONL and settle them."""
    return settle_words(
        words(path, opus_dir=opus_dir),
        reader_names,
        opus_dir=opus_dir,
        allow_accent_positional=allow_accent_positional,
    )


# --- per-authority measurement (no short-circuit) ---------------------------

def measure_authorities(
        word_list: list[WordFlag],
        reader_names: tuple[str, ...] = STRONG_READERS,
        *,
        opus_dir: Path | None = None,
) -> dict[str, Counter]:
    """How often each authority COULD settle, kind by kind — independently.

    Unlike settle_one, this does not short-circuit. A dispute may be counted
    under more than one authority. Used for the report that decides which
    authorities earn their place.
    """
    idx = morpheus.index()
    wrks = inventory()
    odir = opus_dir or (ROOT / 'raw' / 'opus')
    _ = _opus_columns(str(odir))

    # authority -> Counter(kind -> n)
    hits: dict[str, Counter] = {
        AUTH_MORPHEUS_MEMBER: Counter(),
        AUTH_MORPHEUS_DECIDE: Counter(),
        AUTH_LEX_ARB: Counter(),
        AUTH_LEX_DECIDE: Counter(),
        AUTH_SIGLUM: Counter(),
        AUTH_ACCENT_POS: Counter(),
        AUTH_AGREE: Counter(),
    }
    # also track glue / multi refusals for membership
    membership_block = Counter()

    for w in word_list:
        readings = select_readings(w, reader_names)
        form_set = set(readings.values())
        # Same gate as settle_one: one present reader is not agreement.
        if len(readings) < 2:
            continue
        if len(form_set) < 2:
            if len(form_set) == 1:
                hits[AUTH_AGREE][w.kind] += 1
            continue
        stream = column_stream(w.page, w.col, odir)
        col = column_text(w.page, w.col, odir)
        opus_form = w.readers.get('opus') or next(iter(form_set))

        # membership (letter disputes only; skip pure citations)
        if w.kind == 'letters' and not looks_like_citation(form_set, wrks):
            real = {f for f in form_set if is_real_greek(f, idx)}
            if len(real) == 1:
                win = next(iter(real))
                if boundary_glue_suspect(win, form_set - {win}):
                    membership_block['glue_suspect'] += 1
                else:
                    hits[AUTH_MORPHEUS_MEMBER][w.kind] += 1
            elif len(real) > 1:
                membership_block['multiple_real'] += 1
            else:
                membership_block['no_real'] += 1

        if w.kind in ('breathing-only', 'marks-only', 'letters'):
            if by_morpheus_decide(form_set):
                hits[AUTH_MORPHEUS_DECIDE][w.kind] += 1
            if by_lexicon_arbitrate(readings):
                hits[AUTH_LEX_ARB][w.kind] += 1
            if by_lexicon_decide(form_set):
                hits[AUTH_LEX_DECIDE][w.kind] += 1

        if w.kind == 'letters' and looks_like_citation(form_set, wrks):
            page = bekker_after(stream, w.word_off, opus_form) if stream else None
            if by_siglum_holds(form_set, page, wrks):
                hits[AUTH_SIGLUM][w.kind] += 1

        if w.kind == 'accent-only' and stream is not None:
            if col is not None:
                nxt: Following | str = following_token(
                    col.stream, col.offs, col.base,
                    w.word_off, opus_form)
            else:
                nxt = following_char(stream, w.word_off, opus_form)
            if by_accent_positional(form_set, nxt):
                hits[AUTH_ACCENT_POS][w.kind] += 1

    hits['_membership_block'] = membership_block  # type: ignore[assignment]
    return hits


# --- report / CLI -----------------------------------------------------------

def _print_report(
        path: Path,
        strong: SettleReport,
        all5: SettleReport,
        word_list: list[WordFlag],
        sample_n: int,
) -> None:
    n = len(word_list)
    kinds = Counter(w.kind for w in word_list)
    print(f'flags: {path}')
    print(f'word disputes: {n}')
    print(f'  by kind: {dict(kinds)}')
    print()

    for label, rep in (('STRONG (opus/kraken/codex)', strong),
                      ('ALL FIVE (opus/genie/llama/kraken/codex)', all5)):
        # Collapsed = readers.agree (dispute vanishes under this reader set)
        n_agree = sum(1 for s in rep.settlements if s.authority == AUTH_AGREE)
        n_auto = sum(1 for s in rep.settled if s.authority != AUTH_AGREE)
        n_human = len(rep.refused)
        print(f'=== {label} ===')
        print(f'  agree (dispute collapses): {n_agree}')
        print(f'  auto-settled (authority):  {n_auto}')
        print(f'  still need John:           {n_human}')
        print(f'  total accounted:           {n_agree + n_auto + n_human} '
              f'(of {n})')
        print(f'  settled by kind:  {dict(rep.settled_by_kind)}')
        print(f'  refused by kind:  {dict(rep.refused_by_kind)}')
        print(f'  by authority:     {dict(rep.by_authority)}')
        print(f'  refuse reasons:   {dict(rep.refuse_reasons)}')
        if rep.suspicious:
            print(f'  suspicious:       {len(rep.suspicious)}')
        print()

    # Independent authority measurement on STRONG
    print('=== Per-authority hits (STRONG, independent — no short-circuit) ===')
    hits = measure_authorities(word_list, STRONG_READERS)
    block = hits.pop('_membership_block', Counter())
    for auth, ctr in hits.items():
        if sum(ctr.values()):
            print(f'  {auth:<32} {dict(ctr)}  total={sum(ctr.values())}')
    if block:
        print(f'  morpheus.membership blocks:   {dict(block)}')
    print()

    print('=== Per-authority hits (ALL FIVE, independent) ===')
    hits5 = measure_authorities(word_list, ALL_READERS)
    hits5.pop('_membership_block', None)
    for auth, ctr in hits5.items():
        if sum(ctr.values()):
            print(f'  {auth:<32} {dict(ctr)}  total={sum(ctr.values())}')
    print()

    # Recommendation
    s_auto = sum(1 for s in strong.settled if s.authority != AUTH_AGREE)
    a_auto = sum(1 for s in all5.settled if s.authority != AUTH_AGREE)
    s_breath = sum(1 for s in strong.settled
                   if s.kind == 'breathing-only' and s.authority != AUTH_AGREE)
    a_breath = sum(1 for s in all5.settled
                   if s.kind == 'breathing-only' and s.authority != AUTH_AGREE)
    print('=== Recommendation ===')
    print(f'  Strong auto-settles {s_auto} (breathing-only {s_breath}); '
          f'all-five auto-settles {a_auto} (breathing-only {a_breath}).')
    if s_breath >= a_breath:
        print('  Use STRONG readers (opus/kraken/codex) for arbitration. '
              'Weak readers add noise that makes both breathings look attested.')
    else:
        print('  All-five settles more here; re-check quality before adopting.')
    print()

    # Sample of settled LETTER disputes
    letter_settled = [s for s in strong.settled
                      if s.kind == 'letters' and s.authority != AUTH_AGREE]
    print(f'=== Sample of {min(sample_n, len(letter_settled))} settled LETTER '
          f'disputes (STRONG) ===')
    for s in letter_settled[:sample_n]:
        w = s.word
        forms = ', '.join(f'{n}={w.readers[n]!r}'
                          for n in s.readers if n in w.readers)
        print(f'  {w.page}-{w.col}:{w.word_off}  {forms}')
        print(f'      -> {s.winner!r}  [{s.authority}] {s.reason}')
    print()

    # What we cannot do
    print('=== What this cannot do ===')
    n_acc = kinds.get('accent-only', 0)
    acc_pos = sum(1 for s in strong.settled if s.authority == AUTH_ACCENT_POS)
    acc_ref = sum(1 for s in strong.refused if s.kind == 'accent-only')
    print(f'  Accent-only disputes: {n_acc}. Positional §154/§183 settled '
          f'{acc_pos} under STRONG; {acc_ref} still refused.')
    print('  Acute/grave is positional (Smyth §154 + enclitic §183), not')
    print('  lexical. Citation apparatus (siglum+Bekker) is refused, not')
    print('  treated as a following Greek word. Morpheus stores citation')
    print('  accents and does not generate contextual graves; its silence')
    print('  on a grave is NOT evidence. Circumflex fights and non-final')
    print('  accent fights stay with John.')
    print('  locate() places quoted phrases at Bekker lines — useful for')
    print('  mis-cited quotations, not for choosing between OCR spellings of')
    print('  a single index word. Not applied here.')
    multi = strong.refuse_reasons.get('morpheus:multiple_real_forms', 0)
    glue = strong.refuse_reasons.get('morpheus:glue_suspect', 0)
    print(f'  Letter disputes with multiple real forms (STRONG refuse): {multi}')
    print(f'  Letter disputes refused as boundary-glue suspects: {glue}')


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('flags', nargs='?',
                   default=str(ROOT / 'work' / 'flags5-053-062.jsonl'),
                   help='flags JSONL (default: work/flags5-053-062.jsonl)')
    p.add_argument('--sample', type=int, default=20,
                   help='how many settled letter disputes to print')
    p.add_argument('--accent-positional', action='store_true',
                   help='enable Smyth §154/§183 positional accent (default ON)')
    p.add_argument('--no-accent-positional', action='store_true',
                   help='disable Smyth §154 positional accent settlement')
    a = p.parse_args(argv)

    path = Path(a.flags)
    if not path.exists():
        print(f'not found: {path}', file=sys.stderr)
        return 2

    # Default ON: enclitic guard + citation refuse are in place (§154/§183).
    allow = not a.no_accent_positional
    if a.accent_positional:
        allow = True
    word_list = words(path)
    strong = settle_words(word_list, STRONG_READERS,
                          allow_accent_positional=allow)
    all5 = settle_words(word_list, ALL_READERS,
                        allow_accent_positional=allow)
    _print_report(path, strong, all5, word_list, a.sample)
    return 0


if __name__ == '__main__':
    sys.exit(main())
