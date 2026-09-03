"""The lost breathings on `ȣ` and `ϗ`, put to the ink — one card per printed form.

`docs/ligature-breathings.md` measured it: 167 words open with a bare ou-ligature
where 280 carry a breathing, and 25 `ϗ` stand without the grave that 760 others
have. Five classes in all — 280 breathed-ou + 10 accent-ou + 167 bare-ou
partition the word-initial ou-ligature; bare-kai (25) and marked-kai (760) are
their own pair. This queue takes the two BARE classes: 167 + 25 = 192. Three 400 dpi crops on three pages all show the mark plainly on the page,
and on 040-R a marked `ȣ̓κ` at line 1 and a bare `ȣκ` at line 42 are the same
printing. So this is reader loss — but three crops are evidence about three
crops, and 192 sites cannot be repaired from a pattern.

    python3 -m bonitz_pipeline.ligature_review build --write
    python3 -m bonitz_pipeline.ligature_review serve --port 8794
    python3 -m bonitz_pipeline.ligature_review apply            # dry run

⚠ WHY A CARD IS TRUSTWORTHY, AND HOW FAR. John asked whether the ~10 groupings
can be believed. A card here is not "words that look alike": every member is
BYTE-IDENTICAL to the card's form, checked against its corpus line at build
time, and a member that is not is a BUILD ERROR rather than a quietly dropped
row. That guarantees the transcription is identical. It does NOT guarantee the
ink is, so the card shows EVERY member's crop and every crop can be excluded
with one click — one anomalous site can never inherit the group's ruling.

⚠ AND BYTE-IDENTICAL IS NOT ONE WORD. The bare standalone `ȣ` covers both `οὐ`
(smooth) and `οὗ` (rough) — the corpus itself carries `ȣ̓` 52 times and `ȣ̔` once
on that same skeleton. A single ruling over 48 sites would be wrong on some of
them. The card says so, in words, from the corpus's own counts; the excludes are
how he answers it.

⚠ SMOOTH IS NOT THE ONLY ANSWER. `ȣτως`, `ȣτος`, `ȣτω` are οὕτως, οὗτος, οὕτω —
ROUGH. Offering only the smooth button would be the `πκζ / πκς` failure again: a
card whose only correct answer is not on it forces a wrong ruling. Both
breathings are offered on every ou-card, named in words because two combining
marks over `ȣ` do not render (see `settle_review.marks_on_ligature`).

⚠ ONLY THE MISSING MARK IS INSERTED. A candidate may vary the mark in question
and nothing else (merge_review's rule). `ȣδεὶς` gains a breathing and keeps its
grave; `ȣν` gains a breathing and does NOT gain the circumflex οὖν wants — the
accent is a different question and this sitting does not ask it.

Reuses `settle_review.crop_at_offset` (the ALTO/offset crop machinery) and
`book_review.CSS`. The crops are served as SEPARATE IMAGES, never inlined:
56 base64 crops once made a 17MB page, and a card here can hold 66.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import unicodedata
from dataclasses import asdict, dataclass, field
from pathlib import Path

from bonitz_pipeline import elision
from bonitz_pipeline.book_review import CSS as _BASE_CSS, lan_address
from bonitz_pipeline.normalize import (canonical, clean_opus, corpus_column,
                                       corpus_columns)
from bonitz_pipeline.settle_review import (_mark_word, crop_at_offset,
                                           marks_on_ligature)
from bonitz_pipeline.siglum_review import MOBILE_CSS

ROOT = Path(__file__).resolve().parent.parent
QUEUE = ROOT / 'work' / 'queue-ligature.json'
FOLLOWUP = ROOT / 'work' / 'queue-ligature-excluded.json'
EXCLUDED_RULINGS = ROOT / 'work' / 'sweeps' / 'ligature-excluded-rulings.json'
FOLLOWUP_PAGE = ROOT / 'work' / 'sweeps' / 'ligature-excluded-review.html'
ACCENT_QUEUE = ROOT / 'work' / 'queue-ligature-accent.json'
ACCENT_RULINGS = ROOT / 'work' / 'sweeps' / 'ligature-accent-rulings.json'
ACCENT_PAGE = ROOT / 'work' / 'sweeps' / 'ligature-accent-review.html'
COMBINED_QUEUE = ROOT / 'work' / 'queue-ligature-combined.json'
COMBINED_RULINGS = ROOT / 'work' / 'sweeps' / 'ligature-combined-rulings.json'
# The seven forms John ruled `none` on, because a breathing-only button was
# half an answer: these words are missing an accent too, and οὐρανοῦ is missing
# it on a different letter.
COMBINED_FORMS = ('ȣν', "ȣτ'", 'ȣτε', 'ȣτως', 'ȣτος', 'ȣτω', 'ȣρανȣ')
RULINGS = ROOT / 'work' / 'sweeps' / 'ligature-rulings.json'
PAGE = ROOT / 'work' / 'sweeps' / 'ligature-review.html'
COMBINED_PAGE = ROOT / 'work' / 'sweeps' / 'ligature-combined-review.html'
# ⚠ UNDER `work/sweeps/crops/`, WHICH IS ALREADY GITIGNORED. A sibling directory
# of my own naming was not, and 192 PNGs — 13 MB of 1870 scan — would have sat
# untracked-but-addable next to the queue. `git add -f` has already put three
# leaves of this book in a public repo once (tests/test_no_scans_in_git.py).
CROPS = ROOT / 'work' / 'sweeps' / 'crops' / 'ligature'
OPUS = ROOT / 'raw' / 'opus'
CORRIGENDA = ROOT / 'work' / 'corrigenda' / 'entries.json'

SMOOTH, ROUGH, GRAVE = '̓', '̔', '̀'
# The printed circumflex has two encodings; both count as an accent here.
ACCENT_MARKS = frozenset('́̀͂̃')
BREATHINGS = frozenset((SMOOTH, ROUGH))
OU = 'ȣȢ'
KAI = 'ϗ'

# Same token as smyth_sweep.WORD — Greek letters, the two ligatures, combining
# marks, apostrophes. Copied rather than imported so a change there cannot
# silently redraw this queue.
WORD = re.compile(r"[Ͱ-Ͽἀ-῿ȣϗ][Ͱ-Ͽἀ-῿ȣϗ̀-ͯ'’‘ʼ᾽᾿]*")

VERDICTS = ('preserve', 'accept', 'none')

# Three states a member can be in, and every one of them is printed. A site
# that cannot be cropped or cannot be placed in the Opus stream is REPORTED,
# never quietly missing — absence rendered as clean is this project's oldest bug.
STATES = ('ok', 'no_crop', 'no_word_off')


class BuildError(Exception):
    """A member whose corpus text is not its card's form. Never recoverable.

    A card's whole claim is that its members print the same thing. If the text
    at a member's recorded place is not the card's form, either the corpus moved
    under us or the enumeration is wrong — and a card built anyway would carry a
    ruling to ink nobody looked at.
    """


# --------------------------------------------------------------------------
# classification
# --------------------------------------------------------------------------

def ligature_marks(token: str) -> tuple[str, str] | None:
    """(the ligature, the marks sitting on it) for a token that opens on one.

    `ϗ` is a whole word, so it is taken wherever it stands; `ȣ` is taken only
    word-INITIALLY — the same sort ends `ȣρανȣ`, where no breathing belongs.
    """
    d = unicodedata.normalize('NFD', token)
    if not d:
        return None
    if d[0] in OU:
        i, marks = 1, ''
    elif KAI in d:
        j = d.index(KAI)
        i, marks = j + 1, ''
    else:
        return None
    lig = d[i - 1]
    while i < len(d) and unicodedata.combining(d[i]):
        marks += d[i]
        i += 1
    return lig, marks


def classify(token: str) -> str | None:
    """Which class a token falls in, or None when it holds no ligature.

    bare-ou      — word-initial ȣ with NO breathing and NO accent  (this queue)
    accent-ou    — word-initial ȣ with an accent and no breathing  (NOT here)
    breathed-ou  — word-initial ȣ that already carries a breathing
    bare-kai     — ϗ with no mark at all                            (this queue)
    marked-kai   — ϗ carrying its grave
    """
    got = ligature_marks(token)
    if got is None:
        return None
    lig, marks = got
    if lig in OU:
        if any(c in BREATHINGS for c in marks):
            return 'breathed-ou'
        # ⚠ AN ACCENT WITHOUT A BREATHING IS A DIFFERENT QUESTION. Ten words in
        # the corpus are like that (`ȣ͂`, `ȣ́σης`, …). They are not "missing a
        # breathing" in the same sense — something was read there — so they are
        # kept out of this sitting rather than folded into it.
        if any(c in marks for c in ACCENT_MARKS):
            return 'accent-ou'
        return 'bare-ou'
    return 'marked-kai' if marks else 'bare-kai'


IN_QUEUE = ('bare-ou', 'bare-kai')


# --------------------------------------------------------------------------
# the missing mark, and nothing else
# --------------------------------------------------------------------------

def add_mark(form: str, mark: str) -> str:
    """`ȣκ` + smooth -> `ȣ̓κ`. Inserts ONE mark on the ligature and nothing else.

    ⚠ A CANDIDATE MAY VARY ONLY THE MARK IN QUESTION. merge_review learned this
    the hard way: laying a whole sweep key on the printed word deleted marks
    nobody disputed. So the accent on `ȣδεὶς` survives untouched, and a form
    that already carries a breathing is refused outright rather than given a
    second one.

    The mark goes immediately after the ligature and before any existing mark:
    breathing before accent is the Greek order, and since U+0313/U+0314/U+0300
    all have combining class 230, NFC will not reorder them.
    """
    d = unicodedata.normalize('NFD', form)
    got = ligature_marks(form)
    if got is None:
        raise BuildError(f'{form!r} carries no ligature to mark')
    lig, marks = got
    if mark in marks:
        raise BuildError(f'{form!r} already carries {mark!r}')
    if mark in BREATHINGS and any(c in BREATHINGS for c in marks):
        raise BuildError(f'{form!r} already carries a breathing')
    if mark in ACCENT_MARKS and any(c in ACCENT_MARKS for c in marks):
        raise BuildError(f'{form!r} already carries an accent')
    i = d.index(lig) + 1
    out = unicodedata.normalize('NFC', d[:i] + mark + d[i:])
    # The guarantee, checked rather than asserted in a comment: removing the
    # inserted mark gives back exactly what was there.
    back = unicodedata.normalize('NFD', out).replace(mark, '', 1)
    if back != d:
        raise BuildError(f'inserting {mark!r} into {form!r} changed more '
                         f'than the mark')
    return out


MARK_NAME = {SMOOTH: 'smooth', ROUGH: 'rough', '́': 'acute', '̀': 'grave',
             '͂': 'circumflex'}


def ligature_positions(form: str) -> list[int]:
    """Index in NFD of every ligature in the form, left to right."""
    d = unicodedata.normalize('NFD', form)
    return [i for i, c in enumerate(d) if c in OU or c == KAI]


def compose(form: str, marks) -> str:
    """`ȣρανȣ` + smooth on the 1st ligature + circumflex on the 2nd -> `ȣ̓ρανȣ͂`.

    ⚠ ADD_MARK DOES ONE MARK, AND THE SINGLE-MARK DISCIPLINE IS NOT NEGOTIABLE.
    Seven of these words need two marks, and one — οὐρανοῦ — needs them on TWO
    DIFFERENT LETTERS. The answer is not to loosen `add_mark` but to compose
    from it: `marks` is a sequence of (ligature index, mark), each insertion
    validated on its own ligature exactly as `add_mark` validates its one, and
    the whole result checked to differ from the input by precisely the marks
    named and nothing else.

    `marks` entries are (which ligature, counting from 0, the mark sits on).
    """
    d = unicodedata.normalize('NFD', form)
    pos = ligature_positions(form)
    if not pos:
        raise BuildError(f'{form!r} carries no ligature to mark')
    seen: set[tuple[int, str]] = set()
    # ⚠ THE MARKS IN THIS CALL MUST BE CHECKED AGAINST EACH OTHER TOO. Checking
    # each one only against the marks already ON the form let
    # `compose('ȣτε', acute + circumflex)` through: neither accent was there
    # yet, so neither tripped the "already carries an accent" test, and the
    # result was a vowel under two accents — precisely what
    # `settle_apply.impossible_reason` says no Greek word is spelt like. The
    # running tally below is what makes this a discipline rather than a slogan.
    pending: dict[int, str] = {}
    for occ, mark in marks:
        if not (0 <= occ < len(pos)):
            raise BuildError(f'{form!r} has no ligature #{occ}')
        if (occ, mark) in seen:
            raise BuildError(f'{form!r}: {MARK_NAME.get(mark, mark)!r} named '
                             f'twice for the same ligature')
        seen.add((occ, mark))
        # The marks already on THIS ligature — the same test add_mark makes —
        # plus the ones this call has already promised to put there.
        i, have = pos[occ] + 1, ''
        while i < len(d) and unicodedata.combining(d[i]):
            have += d[i]
            i += 1
        have += pending.get(occ, '')
        if mark in have:
            raise BuildError(f'{form!r} already carries {mark!r} there')
        if mark in BREATHINGS and any(c in BREATHINGS for c in have):
            raise BuildError(f'{form!r} would carry two breathings there')
        if mark in ACCENT_MARKS and any(c in ACCENT_MARKS for c in have):
            raise BuildError(f'{form!r} would carry two accents there')
        pending[occ] = pending.get(occ, '') + mark
    # Insert right-to-left so earlier indices stay valid. Within one ligature,
    # breathing before accent — the Greek order, and NFC will not reorder two
    # marks of the same combining class.
    out = d
    for occ, mark in sorted(seen, key=lambda t: (-pos[t[0]],
                                                 t[1] not in BREATHINGS)):
        at = pos[occ] + 1
        if mark not in BREATHINGS:
            # An accent follows any breathing already sitting there.
            while at < len(out) and unicodedata.combining(out[at]) \
                    and out[at] in BREATHINGS:
                at += 1
        out = out[:at] + mark + out[at:]
    result = unicodedata.normalize('NFC', out)
    # The guarantee, checked: strip exactly the marks named and the original
    # form comes back.
    back = unicodedata.normalize('NFD', result)
    for _occ, mark in seen:
        back = back.replace(mark, '', 1)
    if back != d:
        raise BuildError(f'composing {form!r} changed more than the marks named')
    return result


def name_composed(form: str, marks) -> str:
    """'smooth + circumflex', or per-letter when the marks are not on one sort.

    ⚠ THE CARD MUST SAY WHICH LETTER. οὐρανοῦ takes a smooth on the ou it opens
    with and a circumflex on the ou it ends with — two marks, two different
    letters — and two combining marks over `ȣ` do not render anyway. Naming them
    in words is the only thing on this card that does not depend on the font.
    """
    n_lig = len(ligature_positions(form))
    bits = []
    for occ, mark in marks:
        name = MARK_NAME.get(mark, mark)
        if n_lig > 1:
            where = 'the first ou-ligature' if occ == 0 else (
                'the last ou-ligature' if occ == n_lig - 1
                else f'ou-ligature #{occ + 1}')
            bits.append(f'{name} on {where}')
        else:
            bits.append(name)
    return ' + '.join(bits)


def marks_of(form: str) -> tuple:
    """The (ligature index, mark) pairs a marked form carries — its recipe."""
    d = unicodedata.normalize('NFD', form)
    out, occ = [], -1
    for ch in d:
        if ch in OU or ch == KAI:
            occ += 1
        elif unicodedata.combining(ch) and occ >= 0 and (
                ch in BREATHINGS or ch in ACCENT_MARKS):
            out.append((occ, ch))
    return tuple(out)


# --------------------------------------------------------------------------
# enumeration
# --------------------------------------------------------------------------

@dataclass
class Site:
    page: int
    col: str
    line: int              # 1-based line of the corpus column file
    char_at: int           # character offset of the word in that line
    form: str
    stage: str             # reconciled | reconciled-auto — where it lives
    path: str              # the corpus file, so apply writes back to it
    corpus_off: int        # canonical-stream offset in that corpus column
    word_off: int = -1     # canonical OPUS-stream offset (carry_rulings' key)
    state: str = 'ok'
    crop_how: str = ''     # text | ink | slices | mismatch | none
    crop_score: float = 0.0   # how well the crop's line matched by TEXT
    note: str = ''

    def flag(self, state: str, note: str) -> None:
        """Record a defect WITHOUT erasing one already recorded.

        ⚠ THE SECOND FLAG USED TO OVERWRITE THE FIRST. A site that could not be
        placed in the Opus stream AND whose crop was placed by geometry showed
        only the crop complaint, so the worse fault of the two disappeared —
        absence rendered as clean, one layer down again.
        """
        order = {'ok': 0, 'no_word_off': 1, 'no_crop': 2}
        if order.get(state, 0) > order.get(self.state, 0):
            self.state = state
        self.note = f'{self.note} · {note}' if self.note else note

    @property
    def col_key(self) -> str:
        return f'page-{self.page:03d}-{self.col}'

    @property
    def sid(self) -> str:
        return f'{self.col_key}:{self.line}:{self.char_at}'

    @property
    def label(self) -> str:
        """`040-R:42` — what the crop is captioned with."""
        return f'{self.page:03d}-{self.col}:{self.line}'

    @property
    def crop_name(self) -> str:
        return f'{self.page:03d}-{self.col}_{self.line}_{self.char_at}.png'


def _line_starts(text: str) -> list[int]:
    pos, out = 0, []
    for ln in text.splitlines():
        out.append(pos)
        pos += len(ln) + 1
    return out


def _opus_offset(cstream: str, coff: int, form: str, ostream: str) -> int:
    """Where this word sits in the Opus stream, or -1 when it cannot be placed.

    `carry_rulings` keys a ruling on (page, col, word_off) in OPUS geometry, and
    Opus is not what the corpus stages edited — so the offset has to be carried
    across. A one-character form like `ȣ` matches everywhere, so the anchor grows
    context until it is UNIQUE. Two matches is not an anchor, it is a guess, and
    a guessed offset would hand a ruling to the wrong word.
    """
    if not ostream:
        return -1
    for left, right in ((0, 0), (0, 4), (3, 4), (6, 8), (10, 12), (16, 16)):
        a = max(0, coff - left)
        b = min(len(cstream), coff + len(form) + right)
        target = cstream[a:b]
        if not target:
            continue
        if ostream.count(target) == 1:
            return ostream.index(target) + (coff - a)
    return -1


def enumerate_sites(pages=None, *, root: Path = ROOT,
                    keep: tuple = IN_QUEUE) -> tuple[list[Site], dict]:
    """Every bare-ligature site in the CURRENT corpus, with a per-class tally.

    Reads through `normalize.corpus_columns`, which RAISES on a page no stage
    holds. Globbing one stage is how six gates certified ten untranscribed pages
    clean; this queue will not join them.
    """
    counts: dict[str, int] = {}
    sites: list[Site] = []
    for path in corpus_columns(pages):
        raw = path.read_text(encoding='utf-8')
        cleaned = clean_opus(raw)
        base = unicodedata.normalize('NFC', cleaned)
        cstream, coffs = canonical(cleaned)
        base_to_stream = {b: i for i, b in enumerate(coffs)}
        page = int(path.stem.split('-')[1])
        col = path.stem.split('-')[2]
        opus_path = root / 'raw' / 'opus' / f'{path.stem}.txt'
        ostream = (canonical(clean_opus(
            opus_path.read_text(encoding='utf-8')))[0]
            if opus_path.exists() else '')
        lines = base.splitlines()
        starts = _line_starts(base)
        for li, line in enumerate(lines):
            # ⚠ THE TAIL OF A HYPHENATED WORD IS NOT WORD-INITIAL. Every class
            # here is defined on the FIRST letter of a word, and Bonitz breaks
            # words at the column edge: page-063-R:35 ends `ἀναπνέ-` and :36
            # opens `ȣσιν`, which is the middle of ἀναπνέȣσιν and correctly
            # carries no breathing. Counting it as `bare-ou` reported the one
            # impossible word-initial ligature in 176 columns, and it was not
            # one. Third module today with this blindness, after
            # `diacritic_sweep` and `smyth_sweep`.
            continues = li > 0 and lines[li - 1].rstrip().endswith('-')
            for m in WORD.finditer(line):
                token = m.group(0)
                if continues and m.start() == 0:
                    continue
                kind = classify(token)
                if kind is None:
                    continue
                counts[kind] = counts.get(kind, 0) + 1
                if kind not in keep:
                    continue
                boff = starts[li] + m.start()
                coff = base_to_stream.get(boff, -1)
                if coff < 0:
                    # The word start folded away in the canonical stream. Never
                    # seen; reported rather than skipped if it ever is.
                    counts['no_corpus_off'] = counts.get('no_corpus_off', 0) + 1
                    continue
                s = Site(page=page, col=col, line=li + 1, char_at=m.start(),
                         form=token, stage=path.parent.name, path=str(path),
                         corpus_off=coff)
                s.word_off = _opus_offset(cstream, coff, token, ostream)
                if s.word_off < 0:
                    s.flag('no_word_off',
                           'no unique place for this word in the Opus stream '
                           '— a carried ruling cannot key on it')
                sites.append(s)
    return sites, counts


def current_path(page: int, col: str, recorded: str) -> Path | None:
    """Where this column lives NOW, whatever the queue recorded.

    ⚠ A RECORDED STAGE IS WHERE THE SITE LIVED AT BUILD TIME, NOT A PROMISE IT
    STAYS THERE. John promoted all twenty 53-62 columns from `reconciled-auto`
    into `reconciled`, and the one ϗ member on 060-L recorded the old stage —
    so `apply` called a finished, correct edit `missing_column`. The queue files
    are RECORDS of what was asked and answered and are not rewritten; the
    resolution happens here, at read time, through the same stage search every
    other gate uses.

    Refuses only when the column is in NO stage. A promoted file is not a
    missing one, but a vanished one still is.
    """
    here = Path(recorded)
    if here.exists():
        return here
    return corpus_column(page, col, required=False)


def verify_site(site: Site) -> None:
    """The card's claim, checked against the ink's transcription. Raises.

    Byte-identity is the whole reason one ruling may cover many sites, so it is
    re-read from disk rather than trusted from the enumeration that produced it.
    """
    path = current_path(site.page, site.col, site.path)
    if path is None:
        raise BuildError(f'{site.sid}: corpus column {site.path} is in no '
                         f'stage — not moved, gone')
    base = unicodedata.normalize(
        'NFC', clean_opus(path.read_text(encoding='utf-8')))
    lines = base.splitlines()
    if site.line < 1 or site.line > len(lines):
        raise BuildError(f'{site.sid}: line {site.line} is not in {path.name}')
    line = lines[site.line - 1]
    got = line[site.char_at:site.char_at + len(site.form)]
    if got != site.form:
        raise BuildError(
            f'{site.sid}: corpus reads {got!r} where the card claims '
            f'{site.form!r} — the group is not byte-identical')


# --------------------------------------------------------------------------
# cards
# --------------------------------------------------------------------------

@dataclass
class Card:
    form: str
    members: list[Site] = field(default_factory=list)
    smooth_siblings: int = 0
    rough_siblings: int = 0
    grave_siblings: int = 0
    # Non-empty only on the COMBINED-marks queue: the full corrected forms this
    # card offers, each with the recipe that builds it. When it is empty the
    # card asks the breathing-only question and builds its own two buttons.
    candidates: list = field(default_factory=list)
    note: str = ''
    # ⚠ A PER-SITE CARD NEEDS A PER-SITE KEY. The follow-up queue re-grouped the
    # nine excluded `ȣ` sites onto one card — the very thing an exclude means
    # they are NOT — and John's first card mixed smooth+acute ink with
    # smooth+circumflex ink. A card keyed by form cannot ask about one site.
    key: str = ''

    @property
    def sid(self) -> str:
        return self.key or f'forms:{self.form}'

    @property
    def rulable(self) -> bool:
        """False when this card has no ink that can be trusted to be its own.

        ⚠ A CROP PLACED BY GEOMETRY IS A PICTURE OF AN UNKNOWN LINE. Two of
        John's four follow-up cards showed the line BELOW the one they asked
        about. The cards outlined them red and said "placed by geometry", which
        reads as a caveat about precision rather than as what it was — the wrong
        text entirely. A card that cannot show the right ink must not offer a
        reading to take.
        """
        # ⚠ NO MEMBERS IS NOT NO INK. `any([])` is False, so a card built
        # without members — every unit test, and any caller inspecting a form's
        # buttons — silently lost every option but NONE. Only a card that HAS
        # sites and has usable ink at none of them is unrulable.
        return not self.members or any(m.state != 'no_crop'
                                       for m in self.members)

    @property
    def n(self) -> int:
        return len(self.members)

    @property
    def is_kai(self) -> bool:
        return KAI in self.form


def _skeleton(form: str) -> str:
    """The word under the marks — breathings AND accents off.

    ⚠ STRIPPING ONLY THE BREATHING TOLD JOHN "NEVER" ABOUT 780 ATTESTATIONS.
    The rough οὕτω family is printed `ȣ̔́τω` — rough AND acute — so taking off
    just the breathing left `ȣ́τω`, which does not match the bare card form
    `ȣτω`; and `ϗ̀` keeps its grave under the same rule, so the `ϗ` card looked
    up an empty bucket while the corpus held 760. Four cards therefore read
    "the corpus never writes it this way" about marks the corpus writes
    constantly — the exact failure this project keeps meeting: a lookup that
    answers "nothing" without saying it never looked.

    The accent is not the question in this sitting, so it must not be part of
    the identity. `ȣδὲν` and `ȣδέν` are one word and their evidence is one pool.
    Iota subscript and diaeresis stay: they are the word, not its accent.
    """
    d = unicodedata.normalize('NFD', form)
    return unicodedata.normalize('NFC', ''.join(
        c for c in d if c not in BREATHINGS and c not in ACCENT_MARKS))


def sibling_counts(pages=None) -> dict[str, dict[str, int]]:
    """For each skeleton, how often the CORPUS itself breathes it, and which way.

    ⚠ THIS IS EVIDENCE, NOT AN AUTHORITY. It says what the transcription holds
    elsewhere, which is a fact about the corpus and not a claim about the page.
    It is on the card because a form the corpus breathes 66 times and never
    otherwise is a different proposition from one it breathes both ways.
    """
    out: dict[str, dict[str, int]] = {}
    for path in corpus_columns(pages):
        base = unicodedata.normalize(
            'NFC', clean_opus(path.read_text(encoding='utf-8')))
        for line in base.splitlines():
            for m in WORD.finditer(line):
                token = m.group(0)
                if classify(token) not in ('breathed-ou', 'marked-kai'):
                    continue
                got = ligature_marks(token)
                if got is None:
                    continue
                _, marks = got
                key = _skeleton(token)
                bucket = out.setdefault(key, {'smooth': 0, 'rough': 0,
                                              'grave': 0})
                if SMOOTH in marks:
                    bucket['smooth'] += 1
                if ROUGH in marks:
                    bucket['rough'] += 1
                if GRAVE in marks:
                    bucket['grave'] += 1
    return out


def build_cards(sites: list[Site], siblings: dict[str, dict[str, int]]
                ) -> list[Card]:
    """One card per distinct printed form, every member verified byte-identical.

    Order: most sites first, so the sitting spends its attention where the
    ruling reaches furthest.
    """
    groups: dict[str, Card] = {}
    for s in sites:
        verify_site(s)
        card = groups.setdefault(s.form, Card(form=s.form))
        if s.form != card.form:
            raise BuildError(f'{s.sid}: {s.form!r} filed under {card.form!r}')
        card.members.append(s)
    for card in groups.values():
        sib = siblings.get(_skeleton(card.form), {})
        card.smooth_siblings = sib.get('smooth', 0)
        card.rough_siblings = sib.get('rough', 0)
        card.grave_siblings = sib.get('grave', 0)
    return sorted(groups.values(), key=lambda c: (-c.n, c.form))


def options_for(card: Card) -> list[dict]:
    """The buttons. Preserve first — the diplomatic option is never buried."""
    # ⚠ NO TRUSTWORTHY INK, NO READING TO TAKE. Every button here asserts
    # something about what the page shows; with no crop that can be tied to its
    # own printed line, the card has no standing to offer one. It says so and
    # leaves only the exit.
    if not card.rulable:
        return [{
            'verdict': 'none',
            'detail': '',
            'label': 'no verifiable ink · this site cannot be ruled here',
            'consequence': ('corpus untouched · the column this site sits in '
                            'has no line segmentation good enough to prove a '
                            'crop is the right line, so nothing is offered'),
        }]
    # ⚠ THE PRESERVE TEXT SAID "THE PAGE REALLY IS BARE HERE" ON A CARD WHOSE
    # FORM IS NOT BARE. The accent class carries a mark already; calling it bare
    # tells John the card is about something it is not, on the one button whose
    # whole job is to be trusted literally.
    _printed_marks = (ligature_marks(card.form) or ('', ''))[1]
    if _printed_marks:
        _keep_why = ('corpus untouched · the ligature carries its accent and '
                     'no breathing, exactly as inked; recorded as a corrigendum '
                     'where the corpus breathes this same word elsewhere')
    else:
        _keep_why = ('corpus untouched · the page really is bare here; '
                     'recorded as a corrigendum where the corpus breathes '
                     'this same word elsewhere')
    out = [{
        'verdict': 'preserve',
        'detail': card.form,
        'label': f'keep as printed · {card.form}',
        'consequence': _keep_why,
    }]
    # ⚠ A BREATHING-ONLY BUTTON WAS HALF AN ANSWER, and John said so by ruling
    # `none` on all seven of these forms: "accent with breathing, or missing
    # accent on a DIFFERENT letter". Where a card carries composed candidates it
    # offers the WHOLE corrected word, marks named, and never the half.
    if card.candidates:
        for c in card.candidates:
            seen, src = c.get('seen', 0), c.get('source', 'standard')
            if seen:
                note = f' · the corpus writes this word this way {seen}× elsewhere'
            elif src == 'grid':
                note = (' · never on THIS word in the corpus, but this is one '
                        'of the six mark-combinations the printer uses on the '
                        'ou-ligature')
            else:
                note = (' · not written this way anywhere in the corpus; this '
                        'is the standard spelling of the word, offered as a '
                        'candidate and not as evidence')
            out.append({
                'verdict': 'accept',
                'detail': c['form'],
                'label': f'read {c["form"]} · {c["names"]}',
                'consequence': (f'corpus becomes {c["form"]} · '
                                f'{c["names"]} · every other mark '
                                f'untouched{note}'),
            })
        out.append({
            'verdict': 'none',
            'detail': '',
            'label': 'none of these · the ink shows something else',
            'consequence': ('corpus untouched · these sites are set aside for '
                            'a proper reading'),
        })
        return out
    marks = ([(GRAVE, 'grave')] if card.is_kai
             else [(SMOOTH, 'smooth'), (ROUGH, 'rough')])
    for mark, name in marks:
        form = add_mark(card.form, mark)
        # ⚠ EACH BUTTON REPORTS ITS OWN MARK'S COUNT. The grave button used to
        # fall through to a hard-coded 0, so the ϗ card denied 760 attestations.
        seen = {'smooth': card.smooth_siblings, 'rough': card.rough_siblings,
                'grave': card.grave_siblings}[name]
        note = (f' · the corpus writes it this way {seen}× elsewhere'
                if seen else ' · the corpus never writes it this way')
        out.append({
            'verdict': 'accept',
            'detail': form,
            'label': f'add the {name} · {form}{marks_on_ligature(form)}',
            'consequence': (f'corpus becomes {form} · only the {name} is '
                            f'inserted, every other mark untouched{note}'),
        })
    # ⚠ THE READERS CAN ALL BE WRONG TOGETHER. Without a NONE the only exits are
    # a wrong ruling or a skip, and a skip is indistinguishable from a card never
    # reached.
    out.append({
        'verdict': 'none',
        'detail': '',
        'label': 'none of these · the ink shows something else',
        'consequence': ('corpus untouched · these sites are set aside for a '
                        'proper reading'),
    })
    return out


def offered_accepts(card: Card) -> set[str]:
    """The only forms this card may ever be ruled INTO."""
    return {o['detail'] for o in options_for(card) if o['verdict'] == 'accept'}


def illegal_accept(card: Card, becomes: str) -> str:
    """Why `becomes` may not be written at this card, or '' when it may.

    ⚠ THE UI IS NOT THE VALIDATOR. `plan` took `detail` straight out of the
    store and made it the text to write, and the store is a JSON file on disk:
    a hand-edit, a merge, a stale carried ruling or a chat-recorded verdict can
    put anything there — `GARBAGE`, or a double-breathing `ȣ̓̔κ` that no add_mark
    would ever produce. That string would go into a diplomatic transcription of
    a printed book with nothing between it and the page.

    The legal set is exactly what the card offered, which is `add_mark(form, m)`
    for the one or two marks in question — so this also re-imposes add_mark's
    single-mark discipline: one mark, on the ligature, nothing else touched.
    """
    want = unicodedata.normalize('NFC', becomes or '')
    if not want:
        return 'accept with an empty form'
    allowed = offered_accepts(card)
    if want in allowed:
        return ''
    shown = ', '.join(sorted(allowed))
    return (f'{becomes!r} is not a reading this card offers — only {shown}. '
            f'A ruling may insert the missing mark and nothing else.')


def all_excluded(card: Card, excluded) -> bool:
    """True when the card's ruling would bind no site at all."""
    out = set(excluded or ())
    return bool(card.members) and all(m.sid in out for m in card.members)


def evidence_line(card: Card) -> str:
    """What the corpus holds for this word, per mark — the card's one statistic.

    Form-aware: a `ϗ` card is asked about the grave and must be told about the
    grave. Printing "smooth 0 · rough 0" beside it is not merely useless, it
    reads as evidence of absence.
    """
    if card.candidates:
        # The whole word is the question here, so the whole word is the count.
        bits = [f'{c["form"]} {c["seen"]}×' if c.get('seen')
                else f'{c["form"]} — nowhere in the corpus'
                for c in card.candidates]
        return ' · '.join(bits)
    if card.is_kai:
        return f'grave {card.grave_siblings}×'
    return (f'smooth {card.smooth_siblings}× · '
            f'rough {card.rough_siblings}×')


def mixed_warning(card: Card) -> str:
    """Said out loud when byte-identity is not word-identity.

    ⚠ THE STANDALONE `ȣ` IS TWO WORDS. `οὐ` takes the smooth and `οὗ` the rough,
    and once the breathing is lost they are the same three bytes. The corpus
    carries both on that skeleton, which is the only signal available without
    reading every crop — so it is stated, and the excludes are how he answers it.
    """
    if card.is_kai or not (card.smooth_siblings and card.rough_siblings):
        return ''
    return (f'the corpus carries BOTH breathings on this same form — smooth '
            f'{card.smooth_siblings}×, rough {card.rough_siblings}×. One '
            f'ruling may not fit every site here: exclude the crops that read '
            f'the other way and they come back as their own card.')


# --------------------------------------------------------------------------
# the combined-marks sitting
# --------------------------------------------------------------------------

# The standard spelling of each word, as a recipe over the bare printed form.
# ⚠ THIS IS AN AUTHORITY, AND IT IS LABELLED AS ONE. Where the corpus attests a
# marked form these are not consulted at all; where it does not, the button says
# in words that nothing in the corpus writes it this way and that the offer is
# the standard spelling. A grammar may propose; only the ink may settle.
ACUTE, CIRCUMFLEX = '́', '͂'
STANDARD_FORMS = {
    'ȣν':     (((0, SMOOTH), (0, CIRCUMFLEX)), 'οὖν'),
    "ȣτ'":    (((0, SMOOTH), (0, ACUTE)), "οὔτ'"),
    'ȣτε':    (((0, SMOOTH), (0, ACUTE)), 'οὔτε'),
    'ȣτως':   (((0, ROUGH), (0, ACUTE)), 'οὕτως'),
    'ȣτος':   (((0, ROUGH), (0, CIRCUMFLEX)), 'οὗτος'),
    'ȣτω':    (((0, ROUGH), (0, ACUTE)), 'οὕτω'),
    'ȣρανȣ':  (((0, SMOOTH), (1, CIRCUMFLEX)), 'οὐρανοῦ'),
}


def attested_forms(pages=None) -> dict[str, dict[str, int]]:
    """Every marked ligature-bearing token, bucketed by its bare skeleton."""
    out: dict[str, dict[str, int]] = {}
    for path in corpus_columns(pages):
        base = unicodedata.normalize(
            'NFC', clean_opus(path.read_text(encoding='utf-8')))
        for line in base.splitlines():
            for m in WORD.finditer(line):
                token = m.group(0)
                if not any(c in token for c in OU + KAI):
                    continue
                bucket = out.setdefault(_skeleton(token), {})
                bucket[token] = bucket.get(token, 0) + 1
    return out


def candidates_for(form: str, attested: dict[str, dict[str, int]]
                   ) -> tuple[list[dict], str]:
    """(the full corrected forms this card offers, a note about what was not).

    A candidate must be reachable from the printed form by INSERTING marks —
    `compose` proves it, so a variant that differs in a letter can never be
    offered — and it must carry a breathing on the ligature the word opens with.

    ⚠ THE CORPUS ATTESTS A CANDIDATE THAT IS ITSELF THE DEFECT. `ȣτ'` has one
    marked cousin in the whole index, `ȣ́τ'` — acute, and NO breathing. That is a
    member of the ten accent-without-breathing words, a different queue and an
    open question; offering it here would answer a lost breathing with another
    lost breathing. It is refused as a button and stated in the card's note,
    which is the honest place for it.
    """
    out: list[dict] = []
    rejected: list[str] = []
    for token, n in sorted(attested.get(_skeleton(form), {}).items(),
                           key=lambda kv: (-kv[1], kv[0])):
        if token == form:
            continue
        marks = marks_of(token)
        if not marks:
            continue
        try:
            if compose(form, marks) != unicodedata.normalize('NFC', token):
                continue
        except BuildError:
            continue
        if not any(occ == 0 and mark in BREATHINGS for occ, mark in marks):
            rejected.append(f'{token} ({n}×, an accent and no breathing — '
                            f'itself one of the ten words in that class)')
            continue
        out.append({'form': compose(form, marks),
                    'marks': [[occ, mark] for occ, mark in marks],
                    'names': name_composed(form, marks),
                    'seen': n, 'source': 'corpus'})
    if not out and form in STANDARD_FORMS:
        marks, spelt = STANDARD_FORMS[form]
        out.append({'form': compose(form, marks),
                    'marks': [[occ, mark] for occ, mark in marks],
                    'names': name_composed(form, marks),
                    'seen': 0, 'source': 'standard', 'word': spelt})
    note = ''
    if rejected:
        note = ('the corpus does write ' + '; '.join(rejected)
                + ' — not offered here, because it answers a lost breathing '
                  'with another lost breathing')
    return out, note


def combined_cards(forms, *, rulings_path: Path = RULINGS,
                   pages=None) -> list[Card]:
    """One card per form, over the sites the main sitting left unruled.

    Members are re-enumerated from the CURRENT corpus, so their offsets are
    valid against the text as it now stands — the 167 breathings that landed
    have moved some of these words along their lines. Any site John EXCLUDED in
    the main sitting is left out: it is already asked in the follow-up queue,
    and asking it twice would collect two rulings for one piece of ink.
    """
    want = set(forms)
    sites, _counts = enumerate_sites(pages)
    excluded: set[str] = set()
    if rulings_path.exists():
        for entry in json.loads(
                rulings_path.read_text(encoding='utf-8')).values():
            excluded.update(entry.get('excluded') or [])
    attested = attested_forms(pages)
    groups: dict[str, Card] = {}
    for s in sites:
        if s.form not in want or s.sid in excluded:
            continue
        verify_site(s)
        groups.setdefault(s.form, Card(form=s.form)).members.append(s)
    missing = sorted(want - set(groups))
    if missing:
        raise BuildError(f'no unruled sites left for {missing} — the combined '
                         f'queue would silently drop them')
    for form, card in groups.items():
        card.candidates, card.note = candidates_for(form, attested)
        if not card.candidates:
            raise BuildError(f'{form!r}: no candidate form could be built, so '
                             f'the card has nothing to offer but preserve')
    return sorted(groups.values(), key=lambda c: (-c.n, c.form))


def attested_grid(pages=None) -> list[tuple]:
    """Every breathing-bearing mark-combination this printer puts on a word-
    initial ou-ligature, commonest first.

    Measured, not invented — of 432 marked word-initial ou-ligatures, 422 carry
    a breathing and fall into exactly six combinations: smooth (352),
    smooth+acute (25), rough+circumflex (18), rough+acute (13),
    smooth+circumflex (12), rough (2). The other 10 are the accent-only class
    below. (These counts move as sittings land; `test_the_grid_is_measured…`
    pins the SHAPE, not the numbers, for that reason.)

    ⚠ THE ACCENT-ONLY COMBINATIONS ARE LEFT OUT. `circumflex` alone (6) and
    `acute` alone (4) are the ten accent-without-breathing words — the defect
    itself, a separate open question. Offering one would answer a lost breathing
    with another lost breathing, exactly as `ȣ́τ'` would have.
    """
    counts: dict[tuple, int] = {}
    for path in corpus_columns(pages):
        base = unicodedata.normalize(
            'NFC', clean_opus(path.read_text(encoding='utf-8')))
        for line in base.splitlines():
            for m in WORD.finditer(line):
                token = m.group(0)
                d = unicodedata.normalize('NFD', token)
                if not d or d[0] not in OU:
                    continue
                got = ligature_marks(token)
                if not got or not got[1]:
                    continue
                marks = tuple(c for c in got[1]
                              if c in BREATHINGS or c in ACCENT_MARKS)
                if not any(c in BREATHINGS for c in marks):
                    continue
                counts[marks] = counts.get(marks, 0) + 1
    return [m for m, _n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]


def grid_candidates(form: str, grid: list[tuple],
                    attested: dict[str, dict[str, int]]) -> list[dict]:
    """Every grid combination this form can legally take, with its own count.

    The count is for THIS word — `ȣχ` is written smooth 28× and has never been
    written smooth+acute — so a button says what the corpus knows about the word
    it is on, and says plainly when the corpus knows nothing.
    """
    here = attested.get(_skeleton(form), {})
    per: dict[str, int] = {}
    for token, n in here.items():
        per[unicodedata.normalize('NFC', token)] = n
    out = []
    for marks in grid:
        recipe = tuple((0, mark) for mark in marks)
        try:
            built = compose(form, recipe)
        except BuildError:
            continue
        out.append({'form': built,
                    'marks': [[0, mark] for mark in marks],
                    'names': name_composed(form, recipe),
                    'seen': per.get(built, 0),
                    'source': 'corpus' if per.get(built) else 'grid'})
    out.sort(key=lambda c: (-c['seen'], grid.index(
        tuple(m[1] for m in c['marks']))))
    return out


def followup_cards(store_path: Path, queue_path: Path = QUEUE,
                   *, pages=None) -> list[Card]:
    """ONE CARD PER EXCLUDED SITE, re-anchored against the corpus as it stands.

    ⚠ THREE DEFECTS ARE ANSWERED HERE, ALL FROM ONE SITTING JOHN LOST.
    1. The old follow-up re-grouped the sites by form, which is the one thing an
       exclude rules out — his first card carried nine `ȣ` sites whose ink
       genuinely differs (οὔ takes the acute, οὗ the circumflex). One site, one
       card, one crop.
    2. Its buttons were bare/smooth/rough, which cannot express the accent he
       could plainly see on `ȣχ`. The buttons now come from the printer's own
       mark grid, composed and named in words.
    3. Its coordinates were pre-apply, and its crops came from the ink-profile
       fallback. Coordinates are re-derived from the current text, and a crop
       that is not text-matched is refused rather than shown.

    The sids are per-site and share nothing with the old form keys, so the
    `none` verdicts John gave those defective cards cannot carry onto these.
    """
    excluded: set[str] = set()
    if store_path.exists():
        for entry in json.loads(
                store_path.read_text(encoding='utf-8')).values():
            excluded.update(entry.get('excluded') or [])
    if not excluded:
        raise BuildError(f'{store_path} records no excluded site — there is '
                         f'no follow-up to build')

    # Where each excluded site was when it was excluded (pre-apply geometry).
    was: dict[str, dict] = {}
    doc = json.loads(queue_path.read_text(encoding='utf-8'))
    for c in doc['cards']:
        for m in c['members']:
            sid = f"page-{m['page']:03d}-{m['col']}:{m['line']}:{m['char_at']}"
            if sid in excluded:
                was[sid] = m

    missing = sorted(excluded - set(was))
    if missing:
        raise BuildError(f'excluded sites with no record in {queue_path.name}: '
                         f'{missing}')

    # ⚠ RE-DERIVE, DO NOT ADJUST. The excluded sites were never written, so each
    # is still bare and still findable; but the 167 breathings that landed moved
    # some of them along their lines. Rather than add a computed shift to a
    # stale number, the current corpus is re-enumerated and the site is matched
    # by page, column, line and form — then taken as the first still-bare
    # occurrence at or after where it used to be.
    current, _counts = enumerate_sites(pages)
    by_line: dict[tuple, list[Site]] = {}
    for s in current:
        by_line.setdefault((s.page, s.col, s.line, s.form), []).append(s)

    grid = attested_grid(pages)
    attested = attested_forms(pages)
    cards: list[Card] = []
    for sid in sorted(was):
        old = was[sid]
        key = (old['page'], old['col'], old['line'], old['form'])
        here = sorted(by_line.get(key, []), key=lambda s: s.char_at)
        fresh = next((s for s in here if s.char_at >= old['char_at']), None)
        if fresh is None:
            raise BuildError(
                f'{sid}: {old["form"]!r} is no longer bare at or after column '
                f'{old["char_at"]} on its line — it cannot be re-anchored, and '
                f'guessing where it went is how a ruling reaches the wrong ink')
        verify_site(fresh)
        cards.append(Card(
            form=fresh.form,
            members=[fresh],
            # ⚠ NEW KEY, DELIBERATELY. `forms:ȣ` already carries a `none` that
            # John gave to a card showing nine different words at once.
            key=f'site:{fresh.sid}',
            candidates=grid_candidates(fresh.form, grid, attested),
            note=(f'excluded from the {old["form"]!r} group ruling in the main '
                  f'sitting · was at column {old["char_at"]}, now at '
                  f'{fresh.char_at} (a neighbour on this line gained a mark)'
                  if fresh.char_at != old['char_at'] else
                  f'excluded from the {old["form"]!r} group ruling in the main '
                  f'sitting'),
        ))
    return cards


def accent_cards(*, pages=None) -> list[Card]:
    """ONE CARD PER SITE for the ten accent-without-breathing words.

    ⚠ THE CLASS EVERY EARLIER SITTING PUT ASIDE. `ȣ́σης`, `ȣ͂`, `ȣ́θατα` … carry an
    accent and no breathing: something WAS read over the ligature, so they are
    not "a lost breathing" in the sense the bare class was, and offering them a
    breathing-only button would have been answering a different question. C1
    now surfaces them and they get their own sitting.

    ⚠ AND ONE CARD PER SITE IS NOT OPTIONAL HERE. This is precisely where one
    printed skeleton hides different words: `ȣ͂` is the relative `οὗ` at
    015-R:1, 015-R:2, 021-L:42 and 038-L:56 — rough — while `ȣ͂ς` at 041-R:32 is
    `οὖς`, the ear, and takes the smooth. A form-keyed card would bind them
    together and be wrong on some of them however John answered.

    Two candidates per card, no more: the printed accent is what the ink
    already shows and is not in question, so each candidate KEEPS it and adds
    the one mark that is — smooth or rough.
    """
    sites, counts = enumerate_sites(pages, keep=('accent-ou',))
    if not sites:
        raise BuildError('no accent-without-breathing sites in the corpus')
    attested = attested_forms(pages)
    cards: list[Card] = []
    for s in sites:
        verify_site(s)
        here = attested.get(_skeleton(s.form), {})
        per = {unicodedata.normalize('NFC', t): n for t, n in here.items()}
        candidates = []
        for mark, name in ((SMOOTH, 'smooth'), (ROUGH, 'rough')):
            built = compose(s.form, ((0, mark),))
            candidates.append({
                'form': built,
                'marks': [[0, mark]],
                # The printed accent is named too, so the button says the whole
                # word rather than only the part being added.
                'names': f'{name} added, {marks_on_ligature(s.form).lstrip(" ·").strip() or "the printed accent"} kept',
                'seen': per.get(built, 0),
                'source': 'corpus' if per.get(built) else 'grid',
            })
        cards.append(Card(
            form=s.form,
            members=[s],
            key=f'site:{s.sid}',
            candidates=candidates,
            note=('an accent and no breathing — the class held back from every '
                  'earlier sitting; the accent is as inked and stays, the '
                  'question is only which breathing belongs with it'),
        ))
    return cards


# --------------------------------------------------------------------------
# crops
# --------------------------------------------------------------------------

# How far a finished edit may have drifted right from its recorded offset
# when an editor OTHER than this plan touched its line. Combining marks only,
# so a handful of characters is generous.
DRIFT_WINDOW = 8

def _segment_metrics(segs) -> tuple[float, float]:
    """(median line pitch, median box height) for a column's segmented lines.

    Medians, not means: a running head or a merged box would drag an average.
    Returns (0, 0) when there is too little to measure, and the caller then
    skips the cap rather than inventing a pitch.
    """
    import statistics
    if len(segs) < 4:
        return 0.0, 0.0
    ys = sorted(s[1] for s in segs)
    gaps = [b - a for a, b in zip(ys, ys[1:]) if b > a]
    if not gaps:
        return 0.0, 0.0
    return (float(statistics.median(gaps)),
            float(statistics.median([s[3] - s[1] for s in segs])))


GAP_MATCH = 0.9
# The book's line pitch is about 69px at 400dpi; 8 is ~12% of that.
GAP_MIN_HEIGHT = 8


def gap_band(page: int, col: str, line: int):
    """((x0, y0, x1, y1), score) for an unsegmented line, or (None, why).

    Split out from `crop_in_the_gap` so the GEOMETRY can be pinned by a test
    rather than only the label it reports. A regression that moved the band one
    line while still returning `how == "gap"` would show John the wrong text
    under a heading that says the line was verified — the same failure as the
    profile fallback, wearing the fix's badge.
    """

    import difflib
    from PIL import Image
    from bonitz_pipeline.mark_review import _key, _lines

    col_key = f'page-{page:03d}-{col}'
    src = ROOT / f'work/kraken400/cols/{col_key}.png'
    txt = ROOT / f'work/reconciled/{col_key}.txt'
    if not src.exists() or not txt.exists():
        return None, 'none'
    lines = txt.read_text(encoding='utf-8').splitlines()
    segs = _lines(col_key)
    if not segs or not (1 <= line <= len(lines)):
        return None, 'none'

    def _ratio(a: str, b: str) -> float:
        return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()

    def best(ln: int):
        """(score, segment) for a corpus line — and the match must be MUTUAL.

        ⚠ A STRONG MATCH IS NOT THE RIGHT MATCH. Adjacent lines in a printed
        index can be near-identical (`line number 4 of…` against `line number
        5 of…` scores 0.97), so a line kraken MISSED can match its neighbour's
        segment above the threshold — and the band then spans two printed lines
        while every other precondition still passes. Requiring the segment to
        pick the same corpus line back makes the pairing an identification
        rather than a resemblance.
        """
        k = _key(lines[ln - 1])
        pairs = [(_ratio(k, _key(s[4])), i) for i, s in enumerate(segs)]
        score, i = max(pairs, default=(0.0, -1))
        if i < 0:
            return 0.0, -1
        back = max(((_ratio(_key(segs[i][4]), _key(l)), n)
                    for n, l in enumerate(lines, 1)), default=(0.0, -1))
        if back[1] != ln:
            return 0.0, -1
        return score, i

    prev_ln = next_ln = None
    for ln in range(line - 1, max(0, line - 4), -1):
        if best(ln)[0] >= GAP_MATCH:
            prev_ln = ln
            break
    for ln in range(line + 1, min(len(lines), line + 3) + 1):
        if best(ln)[0] >= GAP_MATCH:
            next_ln = ln
            break
    if prev_ln is None or next_ln is None:
        return None, 'no_neighbours'
    # Exactly the target between them, and their segments adjacent — otherwise
    # the gap holds more than one line and which one is which is unknown.
    if next_ln - prev_ln != 2 or line - prev_ln != 1:
        return None, 'gap_not_single'
    p_score, p_i = best(prev_ln)
    n_score, n_i = best(next_ln)
    if n_i != p_i + 1:
        return None, 'segments_not_adjacent'

    px0, _py0, px1, py1, _ = segs[p_i]
    nx0, ny0, nx1, _ny1, _ = segs[n_i]
    y0, y1 = py1, ny0
    # ⚠ A BAND THINNER THAN A LINE IS NOT A LINE. The floor is ~12% of this
    # book's ~69px line pitch: enough to reject two boxes that touch, far
    # enough below a real gap to never reject a genuine one.
    if y1 - y0 < GAP_MIN_HEIGHT:
        return None, 'gap_too_thin'
    # ⚠ AND A BAND CAN BE TOO TALL. Mutual-best pins the neighbours, but a
    # kraken segment that MERGED two printed lines still matches one of them
    # back, so every other precondition passes while the band spans two lines.
    # The geometry says which is which, and it is measured from this column's
    # own verified segments rather than from a constant: the boxes overlap
    # (median pitch 56, median box height 75 on these pages), so exactly one
    # missing line gives 2*pitch - box_h — about 37px here, and the three live
    # gaps measure 33, 38, 38. Two missing lines would give 3*pitch - box_h,
    # about 93. Half a pitch of tolerance separates them with room to spare.
    pitch, box_h = _segment_metrics(segs)
    if pitch:
        expected = 2 * pitch - box_h
        if (y1 - y0) - expected > pitch / 2:
            return None, 'gap_too_tall'
    return (min(px0, nx0), y0, max(px1, nx1), y1), min(p_score, n_score)


def crop_in_the_gap(page: int, col: str, line: int, word: str, at: int,
                    *, scale: float = 3.0, spread: int = 5):
    """Anchor an UNSEGMENTED line between its two segmented neighbours.

    ⚠ THIS IS WHY THREE CARDS HAD NO INK AND DID NOT NEED TO BE DEAD. On
    page-021-R kraken segmented 49 of 61 printed lines, and the lines it missed
    fell through to the profile fallback and pointed at the wrong text. But a
    missed line is not a lost line: its neighbours match by their own text at
    0.96-1.00, their segment indices are CONSECUTIVE, and exactly one corpus
    line lies between them — so the missing line is physically the band between
    the bottom of one box and the top of the next.

    Both endpoints are verified by text, so this is a measurement bounded by two
    facts, not a guess like the band index was.
    """
    from PIL import Image
    col_key = f'page-{page:03d}-{col}'
    src = ROOT / f'work/kraken400/cols/{col_key}.png'
    txt = ROOT / f'work/reconciled/{col_key}.txt'
    band, score = gap_band(page, col, line)
    if band is None:
        return None, 0.0, score          # `score` carries the refusal reason
    x0, y0, x1, y1 = band
    lines = txt.read_text(encoding='utf-8').splitlines()

    im = Image.open(src)
    want = lines[line - 1]
    pad = int((y1 - y0) * 0.45)
    span = x1 - x0
    if at is None or at < 0 or not want.strip():
        mark = None
    else:
        mark = (x0 + int(span * at / len(want)),
                x0 + int(span * (at + len(word)) / len(want)))
    if mark is None:
        wx0, wx1 = x0, x1
    else:
        wx0, wx1 = mark[0] - pad * spread, mark[1] + pad * spread
    box = (max(0, wx0), max(0, y0 - pad),
           min(im.width, max(wx1, wx0 + 60)), min(im.height, y1 + pad))
    c = im.crop(box)
    if mark is not None:
        c = _mark_word(c, mark[0] - box[0], mark[1] - box[0], y1 - box[1])
    if c.width and c.height:
        c = c.resize((int(c.width * scale), int(c.height * scale)),
                     Image.LANCZOS)
    return c, score, 'gap'


def cut_crops_verified(cards: list[Card], out_dir: Path = CROPS, *,
                       write: bool = True) -> dict:
    """Crops, and ONLY the ones whose line was matched by its text.

    ⚠ WHY THE FALLBACK IS NOT GOOD ENOUGH. `mark_review.crop_word` matches the
    corpus line against kraken's segmented lines, and when that scores under
    0.6 it falls back to an ink-profile band index. On page-021-R kraken
    segmented 49 of 61 printed lines, so lines 45 and 55 scored 0.42 and 0.38,
    took the profile, and landed one printed line LOW: John was shown `ἄδηλον`
    (line 56) when asked about line 55, and `Ηκ5. 1175 b32` (line 46) when asked
    about line 45. Page-033-R is worse — kraken produced NO segmentation for it
    at all, so every crop there is an unverified band.

    A band index is not evidence. Here a crop counts only when `how == 'text'`;
    anything else marks the site `no_crop`, and the card then says so and offers
    nothing to rule. Refusing to show ink is honest; showing the wrong ink cost
    a whole sitting.
    """
    stats = {'text': 0, 'gap': 0, 'refused': 0}
    reasons: dict[str, int] = {}
    if write:
        out_dir.mkdir(parents=True, exist_ok=True)
    for card in cards:
        for s in card.members:
            im, score, how = crop_at_offset(
                s.page, s.col, s.line, s.form, s.char_at, scale=3.0, spread=5)
            if how != 'text':
                # The line kraken missed may still sit in a measurable gap
                # between two lines it did not miss.
                alt, alt_score, alt_how = crop_in_the_gap(
                    s.page, s.col, s.line, s.form, s.char_at, spread=5)
                if alt is not None:
                    im, score, how = alt, alt_score, alt_how
            s.crop_how = how
            s.crop_score = round(float(score), 3)
            if im is None or how not in ('text', 'gap'):
                s.flag('no_crop',
                       f'no crop that can be tied to its printed line '
                       f'({how}, text match {score:.2f}) — this site cannot be '
                       f'ruled from the page until its column is re-segmented')
                stats['refused'] += 1
                reasons[how] = reasons.get(how, 0) + 1
                continue
            stats[how] += 1
            if write:
                im.convert('L').quantize(colors=16).save(
                    out_dir / s.crop_name, format='PNG', optimize=True)
    stats.update({f'refused_{k}': v for k, v in reasons.items()})
    return stats


def cut_crops(cards: list[Card], out_dir: Path = CROPS, *, write: bool = True
              ) -> dict:
    """One PNG per MEMBER, on disk, served individually.

    ⚠ NEVER BASE64. 56 inlined crops once made a 17MB page; a card here holds
    up to 66 and there are 192 in all. Separate files also mean the browser can
    lazy-load them, so the strip costs nothing until it is scrolled.

    Returns a tally of how each crop was placed — `text` is a real line match,
    everything else is geometry and must be labelled as such on the card.
    """
    stats = {'text': 0, 'ink': 0, 'slices': 0, 'mismatch': 0, 'none': 0,
             'failed': 0}
    if write:
        out_dir.mkdir(parents=True, exist_ok=True)
    for card in cards:
        for s in card.members:
            im, _score, how = crop_at_offset(
                s.page, s.col, s.line, s.form, s.char_at,
                scale=3.0, spread=5)
            s.crop_how = how
            if im is None:
                s.flag('no_crop', f'no ink crop could be cut ({how})')
                stats['failed'] += 1
                continue
            stats[how] = stats.get(how, 0) + 1
            if how != 'text':
                s.flag('ok', f'crop placed by geometry ({how}), not by '
                             f'matching the line text')
            if write:
                im.convert('L').quantize(colors=16).save(
                    out_dir / s.crop_name, format='PNG', optimize=True)
    return stats


# --------------------------------------------------------------------------
# the queue on disk
# --------------------------------------------------------------------------

def queue_doc(cards: list[Card], counts: dict, crop_stats: dict,
              *, store: Path | str) -> dict:
    """⚠ A QUEUE MUST NAME ITS STORE. Without the field the declared-store
    guard in `plan` and `cmd_serve` is a NO-OP, and it silently was for the main
    queue: planning it against the excluded store set 72 sites aside instead of
    refusing. A guard that only fires on the files that happen to carry the
    field protects nothing. Required here so the omission cannot recur."""
    if not store:
        raise BuildError('a queue must declare the store its rulings go to')
    return {
        'built_from': 'normalize.corpus_columns (every stage, all pages)',
        # ⚠ THE QUEUE NAMES ITS OWN STORE. Three queues now share one serve
        # command, and pointing the wrong `--rulings` at one would file answers
        # about one question under another question's key — silent, and
        # unrecoverable once he has moved on. `cmd_serve` refuses a mismatch.
        'store': str(store),
        'classes': counts,
        'crops': crop_stats,
        'n_cards': len(cards),
        'n_members': sum(c.n for c in cards),
        'cards': [
            {
                'sid': c.sid,
                'form': c.form,
                'n': c.n,
                'smooth_siblings': c.smooth_siblings,
                'rough_siblings': c.rough_siblings,
                'grave_siblings': c.grave_siblings,
                'candidates': c.candidates,
                'note': c.note,
                'options': options_for(c),
                'warning': mixed_warning(c),
                'members': [asdict(m) for m in c.members],
            }
            for c in cards
        ],
    }


def cards_from_queue(path: Path = QUEUE) -> list[Card]:
    """Rebuild the cards the queue records — IDENTITY INCLUDED.

    ⚠ THIS DROPPED `key` AND SILENTLY UNDID THE WHOLE FOLLOW-UP REDESIGN. The
    queue on disk held 12 site-keyed cards and the prebuilt page was right, but
    every live path — serve, plan, apply — goes through here, and here the sid
    fell back to `forms:{form}`. So the 12 cards collapsed to 4, eight members
    were dropped (last `ȣ` member winning), John's four old `none` verdicts
    reattached as "done", and `plan()` reported 0 steps and 4 aside. Nothing
    would have looked broken: the file was correct, the page was correct, and
    the sitting would have been a re-run of the one he already lost.

    The rule this leaves behind: `sid` is the card's IDENTITY and it is written
    to the queue, so it must be read back from the queue. Deriving it again on
    load means the queue and the server can disagree about what a card IS.
    """
    doc = json.loads(path.read_text(encoding='utf-8'))
    out = []
    for c in doc['cards']:
        card = Card(form=c['form'],
                    smooth_siblings=c.get('smooth_siblings', 0),
                    rough_siblings=c.get('rough_siblings', 0),
                    grave_siblings=c.get('grave_siblings', 0),
                    candidates=c.get('candidates') or [],
                    note=c.get('note', ''),
                    # Take the recorded sid verbatim. For a form-keyed queue it
                    # is `forms:{form}` and this changes nothing; for a
                    # site-keyed one it is the only place the identity lives.
                    key=c.get('sid', ''))
        card.members = [Site(**m) for m in c['members']]
        out.append(card)
    return out


# --------------------------------------------------------------------------
# the page
# --------------------------------------------------------------------------

def _attr(v: str) -> str:
    return (v.replace('&', '&amp;').replace('"', '&quot;')
             .replace('<', '&lt;').replace('>', '&gt;'))


def _arg(v: str) -> str:
    """A Python string as a JS literal safe inside an HTML attribute.

    `{x!r}` is not an escaper — Python's repr switches to double quotes around a
    string containing an apostrophe, and `ȣδ'` is exactly that, so the attribute
    would end early and the button would silently have no handler at all.
    """
    return (json.dumps(v, ensure_ascii=False)
            .replace('&', '&amp;').replace('"', '&quot;'))


EXTRA_CSS = """
button{display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;
  text-align:left;width:100%;max-width:36rem}
button .sub2{font-size:.82rem;font-weight:400;opacity:.9;line-height:1.3}
button .gk{font-size:1.6rem;line-height:1.5}
.card{position:relative}
.card .said{font-size:2.4rem;line-height:1.35}
.card.done .said{font-size:1rem}
.rec{display:flex;flex-direction:column;gap:.55rem;margin:.4rem 0 .6rem}
.ask{font:600 1.15rem/1.3 Superclarendon,Rockwell,Georgia,serif;
  margin:1rem 0 .7rem}
/* The strip: every member's ink, side by side, scrolled not stacked. A card
   binding 66 sites must show 66 crops without becoming 66 screens. */
.strip{display:flex;gap:.6rem;overflow-x:auto;padding:.4rem 0 .8rem;
  -webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}
.strip figure{margin:0;flex:0 0 auto;scroll-snap-align:start;position:relative;
  border:1px solid var(--rule);border-radius:2px;background:var(--plate);
  padding:.3rem;cursor:pointer;max-width:22rem}
.strip img{height:5.5rem;width:auto;max-width:none;border:0}
.strip figcaption{font:.68rem "SF Mono",Menlo,monospace;color:var(--muted);
  letter-spacing:.05em;padding:.25rem .1rem 0}
.strip .x{position:absolute;top:.2rem;right:.2rem;width:1.5rem;height:1.5rem;
  border-radius:50%;border:1px solid var(--rule);background:var(--paper);
  color:var(--muted);font:700 .85rem/1.4 Charter,Georgia,serif;text-align:center;
  cursor:pointer}
.strip figure.out{opacity:.32;filter:grayscale(1)}
.strip figure.out .x{background:var(--warn);color:#fff;border-color:var(--warn)}
.strip figure.out figcaption::after{content:' — excluded';color:var(--warn)}
.strip figure.weak{border-color:var(--warn)}
.striphint{font:.72rem "SF Mono",Menlo,monospace;color:var(--muted);
  margin:0 0 .5rem}
.mixed{color:var(--warn);font-size:.9rem;margin:.3rem 0 .7rem;
  border-left:3px solid var(--warn);padding-left:.6rem}
.card.done{opacity:.55;border-color:#3a7d44;max-height:3.2rem;overflow:hidden;
  cursor:pointer;padding-top:.5rem;padding-bottom:.5rem}
.card.done.open{max-height:none;opacity:1}
.card.done .strip,.card.done .rec,.card.done .why,.card.done .said,
.card.done .reclbl,.card.done .ask,.card.done .striphint,.card.done .mixed,
.card.done .warnflag{display:none}
.card.done.open .strip,.card.done.open .rec,.card.done.open .why,
.card.done.open .said,.card.done.open .reclbl,.card.done.open .ask,
.card.done.open .striphint,.card.done.open .mixed,
.card.done.open .warnflag{display:revert}
.card.done .loc::after{content:' — ruled, tap to change';color:#3a7d44;
  font-weight:600}
.card.done::after{content:'✓ ruled';position:absolute;top:.5rem;right:.7rem;
  color:#3a7d44;font-weight:700;font-size:.9rem;letter-spacing:.04em}
.card.done button{cursor:pointer}
.card.done .chosen{opacity:1;background:#3a7d44;color:#fff;font-weight:600}
.card.unsaved{opacity:1;border-color:#b23b3b;border-width:3px}
#warn{position:sticky;top:0;z-index:99;background:#b23b3b;color:#fff;
  padding:.8rem 1rem;font-weight:700;letter-spacing:.02em}
kbd{font:.7rem "SF Mono",Menlo,monospace;border:1px solid var(--rule);
  border-radius:3px;padding:0 .25rem;color:var(--muted)}
"""

JS = r"""
if(location.protocol==='file:'){
  const b=document.createElement('div');
  b.style.cssText='background:#b23b3b;color:#fff;padding:.7rem 1.2rem;font:14px Charter,Georgia,serif';
  b.textContent='Not being saved — run python3 -m bonitz_pipeline.ligature_review serve';
  document.body.prepend(b);
}
const done={}, excluded={};
function counts(card){
  const all=card.querySelectorAll('.strip figure').length;
  const out=card.querySelectorAll('.strip figure.out').length;
  return [all-out, all];
}
function retally(card){
  const [inc,all]=counts(card);
  card.querySelectorAll('button .binds').forEach(s=>{
    s.textContent=' — binds '+inc+' of '+all+' site'+(all===1?'':'s');
  });
}
// A refusal is not an outage, and saying "the server is not answering" when it
// answered with a reason sends John to reload a server that is fine.
function fail(card,why){
  card.classList.add('unsaved'); card.classList.remove('done');
  let w=document.getElementById('warn');
  if(!w){ w=document.createElement('div'); w.id='warn'; document.body.prepend(w); }
  w.textContent = why ? ('NOT RECORDED - '+why)
    : ('NOT SAVED - the server is not answering. Nothing you click is being '
       +'recorded. Reload once it is back.');
}
async function post(url,body,card){
  const r=await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok){
    let why='';
    try{ why=await r.text(); }catch(e){}
    const err=new Error('HTTP '+r.status); err.why=why; throw err;
  }
  card.classList.remove('unsaved');
  const w=document.getElementById('warn'); if(w) w.remove();
}
async function rule(sid,verdict,detail,btn){
  const card=btn.closest('.card');
  card.querySelectorAll('button').forEach(b=>{
    b.setAttribute('aria-pressed','false'); b.classList.remove('chosen'); });
  btn.setAttribute('aria-pressed','true'); btn.classList.add('chosen');
  card.classList.add('done'); card.classList.remove('open'); done[sid]={verdict,detail};
  document.getElementById('count').textContent=
    Object.keys(done).length+' / '+document.querySelectorAll('.card').length+' ruled';
  try{ await post('/ruling',{id:sid,verdict,detail},card); }
  catch(e){
    // The ruling was REFUSED, so undo the green: the card is not answered.
    delete done[sid];
    btn.classList.remove('chosen'); btn.setAttribute('aria-pressed','false');
    document.getElementById('count').textContent=
      Object.keys(done).length+' / '+document.querySelectorAll('.card').length+' ruled';
    fail(card,e.why); return;
  }
  const next=document.querySelector('.card:not(.done)');
  if(next) next.scrollIntoView({block:'start',behavior:'smooth'});
}
async function toggle(sid,site,fig){
  const card=fig.closest('.card');
  const out=!fig.classList.contains('out');
  fig.classList.toggle('out',out);
  (excluded[sid]=excluded[sid]||{})[site]=out;
  retally(card);
  try{ await post('/exclude',{id:sid,site:site,excluded:out},card); }
  catch(e){ fig.classList.toggle('out',!out); retally(card); fail(card,e.why); }
}
addEventListener('DOMContentLoaded', async ()=>{
  try{
    const r=await fetch('/rulings');
    if(r.ok){
      const have=await r.json();
      for(const sid in have){
        const c=document.querySelector('[data-sid="'+CSS.escape(sid)+'"]');
        if(!c) continue;
        (have[sid].excluded||[]).forEach(s=>{
          const f=c.querySelector('[data-site="'+CSS.escape(s)+'"]');
          if(f) f.classList.add('out');
        });
        retally(c);
        if(!have[sid].verdict) continue;
        c.classList.add('done'); done[sid]=have[sid];
        c.querySelectorAll('button').forEach(b=>{
          if(b.dataset.verdict===have[sid].verdict &&
             b.dataset.detail===have[sid].detail){
            b.classList.add('chosen'); b.setAttribute('aria-pressed','true'); }});
      }
      document.getElementById('count').textContent=
        Object.keys(done).length+' / '+document.querySelectorAll('.card').length+' ruled';
    }
  }catch(e){}
  document.querySelectorAll('.card').forEach(c=>{
    retally(c);
    c.addEventListener('click', ev=>{
      if(ev.target.closest('button')||ev.target.closest('figure')) return;
      if(c.classList.contains('done')) c.classList.toggle('open');
    });
  });
  const next=document.querySelector('.card:not(.done)');
  if(next) next.scrollIntoView({block:'start'});
});
// 1-9 rules the card nearest the top of the screen. A ruling stays changeable,
// so a stray key costs one more key, never a lost site.
addEventListener('keydown', ev=>{
  if(ev.metaKey||ev.ctrlKey||ev.altKey) return;
  const n=parseInt(ev.key,10);
  if(!(n>=1&&n<=9)) return;
  let best=null, bestTop=1e9;
  document.querySelectorAll('.card').forEach(c=>{
    const t=c.getBoundingClientRect().top;
    if(t>-80 && t<bestTop){ bestTop=t; best=c; }
  });
  if(!best) return;
  const b=best.querySelectorAll('.rec button')[n-1];
  if(b) b.click();
});
"""


def html(cards: list[Card], out: Path = PAGE) -> Path:
    parts = []
    for card in cards:
        opts = options_for(card)
        buttons = []
        for i, o in enumerate(opts, 1):
            cls = {'preserve': 'keep', 'accept': 'fix', 'none': 'none'}[
                o['verdict']]
            buttons.append(
                f'<button class="{cls}" data-verdict="{_attr(o["verdict"])}" '
                f'data-detail="{_attr(o["detail"])}" '
                f'onclick="rule({_arg(card.sid)},{_arg(o["verdict"])},'
                f'{_arg(o["detail"])},this)">'
                f'<span class="gk"><kbd>{i}</kbd> {o["label"]}</span>'
                f'<span class="sub2">{o["consequence"]}'
                f'<span class="binds"></span></span>'
                f'</button>')
        figs = []
        for s in card.members:
            weak = ' weak' if s.state != 'ok' or s.note else ''
            title = _attr(s.note or 'crop matched to its printed line')
            # ⚠ THE UNDERLINE IS A PROPORTIONAL ESTIMATE, NOT A MEASUREMENT —
            # it can sit a word off on a line of uneven setting. The card names
            # the word in large type above, so the crop only has to show the
            # right LINE; saying which is which keeps the rule from being read
            # as a measurement it never was.
            cap = ''
            if s.crop_how == 'gap':
                cap = (' · line placed between its two matched neighbours; '
                       'the red rule is an estimate — read the ligature '
                       'and every mark it carries')
            elif s.crop_how == 'text':
                cap = ' · line matched by its text'
            if s.state == 'no_crop':
                # ⚠ SAY WHAT IS WRONG, NOT THAT SOMETHING IS. "Placed by
                # geometry" in a red border read as a caveat about precision;
                # what it meant was that the picture was of a different line.
                inner = ('<div style="height:5.5rem;display:flex;'
                         'align-items:center;padding:0 .6rem;font-size:.8rem">'
                         '⚠ NO CROP SHOWN — this column has no line '
                         'segmentation good enough to prove which printed line '
                         'a crop is. A picture of the wrong line is worse than '
                         'no picture.</div>')
            else:
                inner = (f'<img loading="lazy" src="/crops/{s.crop_name}" '
                         f'alt="the ink at {s.label}">')
            figs.append(
                f'<figure class="site{weak}" data-site="{_attr(s.sid)}" '
                f'title="{title}" '
                f'onclick="toggle({_arg(card.sid)},{_arg(s.sid)},this)">'
                f'<span class="x">✕</span>{inner}'
                f'<figcaption>{s.label}{cap}</figcaption></figure>')
        mixed = mixed_warning(card)
        mixed_html = f'<div class="mixed">⚠ {mixed}</div>' if mixed else ''
        if card.note:
            mixed_html += f'<div class="mixed">⚠ {card.note}</div>'
        weak_n = sum(1 for s in card.members if s.state != 'ok' or s.note)
        no_off = sum(1 for s in card.members if s.word_off < 0)
        flags = []
        if weak_n:
            flags.append(f'{weak_n} crop{"s" if weak_n != 1 else ""} placed by '
                         f'geometry or missing — outlined in red')
        if no_off:
            flags.append(f'{no_off} site{"s" if no_off != 1 else ""} could not '
                         f'be placed in the Opus stream')
        flag_html = (f'<div class="warnflag">⚠ {" · ".join(flags)}</div>'
                     if flags else '')
        parts.append(f"""
<div class="card" id="{_attr(card.sid)}" data-sid="{_attr(card.sid)}">
  <div class="loc">{card.n} site{"s" if card.n != 1 else ""} · one printed form
    · every member byte-identical</div>
  <div class="said gk">{card.form}</div>
  <div class="why">the corpus marks this same word elsewhere:
    {evidence_line(card)}</div>
  {mixed_html}
  {flag_html}
  <div class="striphint">every site's ink, in order — tap a crop to EXCLUDE it
    from this ruling</div>
  <div class="strip">{"".join(figs)}</div>
  <div class="ask">What does the ink read?</div>
  <div class="rec">{"".join(buttons)}</div>
  <div class="reclbl">One ruling applies to every site not excluded above.</div>
</div>""")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        '<!doctype html><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,'
        'maximum-scale=5">'
        '<title>Ligature breathings — what does the ink read?</title>'
        f'<style>{_BASE_CSS}{MOBILE_CSS}{EXTRA_CSS}</style>'
        '<header><h1>Is the breathing on the page?</h1>'
        f'<span id="count">0 / {len(cards)} ruled</span></header>'
        f'<main>{"".join(parts)}</main>'
        f'<script>{JS}</script>',
        encoding='utf-8')
    return out


# --------------------------------------------------------------------------
# the store
# --------------------------------------------------------------------------

def _read_store(store: Path) -> dict:
    return (json.loads(store.read_text(encoding='utf-8'))
            if store.exists() else {})


def _write_store(store: Path, have: dict) -> None:
    """Replace the store atomically.

    ⚠ `write_text` TRUNCATES FIRST, so anyone reading during the write sees an
    empty or half-written file. `GET /rulings` reads it on every page load
    without the lock, and the race test caught the JSON decode blowing up mid
    write. `os.replace` is atomic on POSIX: a reader gets the whole old file or
    the whole new one, never the seam.
    """
    import os
    store.parent.mkdir(parents=True, exist_ok=True)
    tmp = store.with_name(store.name + '.tmp')
    tmp.write_text(json.dumps(have, ensure_ascii=False, indent=1) + '\n',
                   encoding='utf-8')
    os.replace(tmp, store)


# ⚠ THE WHOLE STORE IS READ, CHANGED AND REWRITTEN PER CLICK, AND THE SERVER IS
# THREADED. Two fast taps — an exclude and then the verdict, which is exactly
# how the sitting goes — can interleave: both threads read the same JSON, and
# the second write puts back a copy that never saw the first. A silently lost
# EXCLUDE is the worst failure this design has, because the card then binds a
# site John took out and nothing anywhere says so.
#
# The server stays THREADED: it serves 192 crop images beside the rulings, and
# `book_review.serve` documents what one thread does to a POST queued behind a
# page download — John watched NOT SAVED across the top while the server sat
# there listening. So the fix is a lock over the read-modify-write, not a
# single-threaded server. It is module-level because the contention is between
# handler threads of one process; nothing else writes this file.
_STORE_LOCK = threading.Lock()


def record_ruling(store: Path, sid: str, verdict: str, detail: str = '',
                  members: list[str] | None = None) -> dict | None:
    """One key, last write wins. Excludes already recorded SURVIVE the ruling.

    Returns None — refusing to write — when `members` is given and every one of
    them is already excluded.

    ⚠ THE CHECK BELONGS INSIDE THE LOCK. I first read the excludes in the
    request handler and then called this, which is check-then-act across the
    lock boundary: an exclude landing between the two would be missed, and the
    unlocked read itself blew up on a half-written file under the race test.
    """
    with _STORE_LOCK:
        have = _read_store(store)
        entry = have.get(sid) or {}
        out = sorted(entry.get('excluded') or [])
        if members is not None and members and all(m in out for m in members):
            return None
        have[sid] = {'verdict': verdict, 'detail': detail, 'excluded': out}
        _write_store(store, have)
        return have


def record_exclude(store: Path, sid: str, site: str, excluded: bool) -> dict:
    """Toggle one site out of (or back into) a card's ruling.

    An exclude may land BEFORE a verdict — that is how the sitting works: look
    at the strip, drop the odd ones, then rule. So the entry is created with an
    empty verdict, and `plan` treats an empty verdict as unruled and says so.
    """
    with _STORE_LOCK:
        have = _read_store(store)
        entry = have.get(sid) or {'verdict': '', 'detail': '', 'excluded': []}
        out = set(entry.get('excluded') or [])
        out.add(site) if excluded else out.discard(site)
        entry['excluded'] = sorted(out)
        entry.setdefault('verdict', '')
        entry.setdefault('detail', '')
        have[sid] = entry
        _write_store(store, have)
        return have


# --------------------------------------------------------------------------
# the server
# --------------------------------------------------------------------------

def serve(cards: list[Card], port: int = 8794, host: str = '127.0.0.1',
          *, page: Path = PAGE, store: Path = RULINGS,
          crops: Path = CROPS) -> None:
    """⚠ `--wifi` BINDS EVERY INTERFACE. No authentication, and none is wanted —
    it is a scan of an 1870 index and a JSON file of letter choices — but it is
    open while it runs, so stop it when the sitting is done.

    Separate from `book_review.serve` because that one serves a single page and
    a ruling store; this also serves 192 crop images and takes excludes.
    """
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    body = page.read_bytes()
    by_sid = {c.sid: c for c in cards}
    valid_cards = set(by_sid)
    valid_sites = {c.sid: {m.sid for m in c.members} for c in cards}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _refuse(self, why: str):
            """400 WITH A REASON, and the page shows it.

            A bare 400 made the card go red and said nothing, so a refusal was
            indistinguishable from the server being down — and John's only
            move would have been to click again.
            """
            self._send(why.encode('utf-8'), 'text/plain; charset=utf-8', 400)

        def _send(self, data: bytes, ctype: str, code: int = 200):
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = self.path.split('?')[0]
            if path.rstrip('/') == '/rulings':
                return self._send(
                    store.read_bytes() if store.exists() else b'{}',
                    'application/json')
            if path.startswith('/crops/'):
                # ⚠ NAME ONLY. A path from the network must never reach the
                # filesystem as written; `Path(name).name` cannot climb out.
                name = Path(path[len('/crops/'):]).name
                f = crops / name
                if not f.exists():
                    self.send_response(404); self.end_headers(); return
                return self._send(f.read_bytes(), 'image/png')
            self._send(body, 'text/html; charset=utf-8')

        def do_POST(self):
            n = int(self.headers.get('Content-Length', 0))
            try:
                d = json.loads(self.rfile.read(n) or b'{}')
            except json.JSONDecodeError:
                self.send_response(400); self.end_headers(); return
            sid = d.get('id')
            if sid not in valid_cards:
                return self._refuse('no such card')
            card = by_sid[sid]
            path = self.path.split('?')[0].rstrip('/')
            if path == '/ruling':
                verdict = d.get('verdict')
                if verdict not in VERDICTS:
                    return self._refuse(f'unknown verdict {verdict!r}')
                detail = d.get('detail', '')
                if verdict == 'accept':
                    why = illegal_accept(card, detail)
                    if why:
                        return self._refuse(why)
                # ⚠ A RULING THAT BINDS NOTHING MUST NOT LOOK LIKE A RULING.
                # With every crop excluded the card would go green, the counter
                # would advance, and apply would produce zero steps — the
                # sitting reads DONE while that form has been decided nowhere.
                # An exclude-all is a legitimate state; calling it answered is
                # not, so the refusal names the way out. The test runs inside
                # the store lock, in `record_ruling`, because doing it here
                # would be check-then-act with a writer in between.
                if record_ruling(store, sid, verdict, detail,
                                 members=sorted(valid_sites[sid])) is None:
                    return self._refuse(
                        f'every one of the {card.n} crops on this card is '
                        f'excluded, so this ruling would bind no site. Put a '
                        f'crop back in, or leave the card unruled and they '
                        f'come back as their own cards.')
            elif path == '/exclude':
                site = d.get('site')
                if site not in valid_sites[sid]:
                    return self._refuse('no such site on this card')
                record_exclude(store, sid, site, bool(d.get('excluded')))
            else:
                self.send_response(404); self.end_headers(); return
            self.send_response(204); self.end_headers()

    if host == '0.0.0.0':
        print(f'http://{lan_address()}:{port}   (open on the WiFi)')
    print(f'http://localhost:{port}  ->  {store}')
    ThreadingHTTPServer((host, port), H).serve_forever()


# --------------------------------------------------------------------------
# apply
# --------------------------------------------------------------------------

DATE = '2026-08-11'
RULE = 'ligature breathings: John ruled the ink on the bare printed form'


def plan(queue_path: Path = QUEUE, rulings_path: Path = RULINGS) -> dict:
    """Steps, plus everything that is NOT a step and why.

    ⚠ THE APPLY REFUSES WITHOUT A VERDICT. An entry can exist carrying only
    excludes; that is a half-finished card, not a ruling, and treating it as one
    would write a decision John never made.
    """
    if not rulings_path.exists():
        raise SystemExit(f'no rulings yet: {rulings_path}')
    rulings = json.loads(rulings_path.read_text(encoding='utf-8'))
    # ⚠ SERVE THE QUEUE ITS OWN STORE. The same check `cmd_serve` makes: a
    # queue filed into another sitting's rulings would answer one question
    # under another's key.
    declared = json.loads(queue_path.read_text(encoding='utf-8')).get('store')
    if declared and Path(declared).resolve() != rulings_path.resolve():
        raise SystemExit(
            f'{queue_path.name} declares its store as {declared}, not '
            f'{rulings_path} — refusing to plan against another sitting\'s '
            f'rulings')
    cards = {c.sid: c for c in cards_from_queue(queue_path)}
    # ⚠ AN ORPHAN IS A SUPERSEDED RECORD, NOT A CRASH. When a queue is rebuilt
    # the old cards' keys stay in the store — that is the point of keeping the
    # file as the record of what was asked and answered before. Raising here
    # meant `apply` died outright on the rebuilt follow-up, whose four `none`
    # verdicts belong to cards that no longer exist. They bind nothing and they
    # are named; the store-mismatch guard above is what catches the wrong file.
    orphaned = sorted(set(rulings) - set(cards))

    steps: list[dict] = []
    excluded: list[dict] = []
    aside: list[dict] = []
    unruled: list[str] = []
    illegal: list[dict] = []
    for sid, card in cards.items():
        v = rulings.get(sid) or {}
        verdict = v.get('verdict') or ''
        if verdict not in ('preserve', 'accept', 'none'):
            unruled.append(sid)
            continue
        # ⚠ VALIDATE THE STORE, NOT THE UI. The page can only produce legal
        # forms; the store is a file anyone can edit, and its `detail` was being
        # written into the corpus unread. A card whose ruling is not one this
        # card offers produces NO steps and is named loudly — never repaired,
        # never guessed at, and never quietly skipped.
        if verdict == 'accept':
            why = illegal_accept(card, v.get('detail', ''))
            if why:
                illegal.append({'sid': sid, 'detail': v.get('detail', ''),
                                'why': why, 'n': card.n})
                continue
        out = set(v.get('excluded') or [])
        for m in card.members:
            if m.sid in out:
                # ⚠ AN EXCLUDED SITE IS NOT RULED. It is not touched, and it is
                # named — it becomes its own follow-up card, never a silent gap.
                excluded.append({'sid': sid, 'member': m.sid,
                                 'form': m.form, 'label': m.label})
                continue
            if verdict == 'none':
                aside.append({'sid': sid, 'member': m.sid, 'form': m.form,
                              'label': m.label})
                continue
            steps.append({
                'sid': sid,
                'member': m.sid,
                'page': m.page,
                'col': m.col,
                'line': m.line,
                'char_at': m.char_at,
                'corpus_off': m.corpus_off,
                'word_off': m.word_off,
                'path': m.path,
                'verdict': verdict,
                'printed': m.form,
                'becomes': m.form if verdict == 'preserve' else v['detail'],
                'smooth_siblings': card.smooth_siblings,
                'rough_siblings': card.rough_siblings,
                'grave_siblings': card.grave_siblings,
            })
    return {'steps': steps, 'excluded': excluded, 'aside': aside,
            'unruled': sorted(unruled), 'illegal': illegal,
            'orphaned': orphaned}


def shift_budget(steps: list[dict]) -> dict[int, int]:
    """How far each step's text may have moved RIGHT since its offsets were taken.

    ⚠ THE RERUN DEFECT, EXACTLY. `char_at` is a PRE-EDIT coordinate. The first
    apply writes right-to-left, so it is correct — but afterwards every member
    that shares a printed line with a member to its LEFT stands one character
    further along per mark that went in before it. On a rerun the recorded slice
    reads a space and the leading letter instead of the word, so BOTH the
    already-check and the printed-check fail and 13 finished edits reported
    `text_mismatch`. Measured on the live queue: 154 members shift by 0, twelve
    by 1, one by 2 — that last shares its line with two members to its left.

    (The two sites the rerun output made look wrong, 015-R:15:15 and :25:8, are
    alone on their lines and always reported `already` correctly. They only
    LOOKED refused because every outcome was printed under one REFUSED heading;
    that reporting defect is fixed in `apply_steps` below.)

    The budget is the total length same-line ACCEPTS to the left could have
    added. Keyed by `id(step)`, so two identical-looking steps cannot collide.
    """
    by_line: dict[tuple, list[dict]] = {}
    for s in steps:
        by_line.setdefault((s['path'], s['line']), []).append(s)
    out: dict[int, int] = {}
    for group in by_line.values():
        for s in group:
            out[id(s)] = sum(
                len(x['becomes']) - len(x['printed'])
                for x in group
                if x['verdict'] == 'accept' and x['char_at'] < s['char_at']
                and len(x['becomes']) > len(x['printed']))
    return out


def _verify(step: dict, budget: int = 0) -> str:
    """'' when the corpus still reads what the ruling was given on.

    ⚠ ANCHOR-VERIFY, THEN WRITE. The offsets were taken at build time; anything
    that edited the column since has moved them. A mismatch is REFUSED and
    reported — never skipped quietly, and never written through on the theory
    that the offset is probably still fine.

    ⚠ AND THE TOLERANCE IS FOR `already` ONLY. `budget` lets a FINISHED edit be
    recognised a character or two right of where its offset was taken, because a
    same-line neighbour's mark pushed it there. It never authorises a WRITE at a
    shifted place: the first-time path still demands the printed form at the
    EXACT recorded offset, so a site a neighbour moved and which has not yet
    been written is refused, loudly, rather than edited at a guess. The window
    is consulted only after both exact tests have failed, it is bounded by the
    marks actually inserted before it on its own line, and it can conclude
    nothing but `already`.
    """
    path = current_path(step['page'], step['col'], step['path'])
    if path is None:
        return 'missing_column'
    base = unicodedata.normalize(
        'NFC', clean_opus(path.read_text(encoding='utf-8')))
    lines = base.splitlines()
    if not (1 <= step['line'] <= len(lines)):
        return 'line_gone'
    line = lines[step['line'] - 1]
    at = step['char_at']
    # ⚠ THE FORM-SET PREDATES THE ELISION RULE. Its recorded forms hold
    # whichever mark the sitting that wrote them used — `ȣδ'` — and the
    # corpus now spells that mark U+2019 everywhere
    # (`bonitz_pipeline.elision`). Compared raw, three finished edits came
    # back as `text_mismatch` the hour the fold ran. The fold is
    # length-preserving, so every recorded offset still points where it
    # did.
    becomes = elision.fold(step['becomes'])
    printed = elision.fold(step['printed'])
    # ⚠ THE RULED FORM IS LONGER THAN THE PRINTED ONE, so the already-applied
    # test must slice to ITS length. Slicing to the printed length compared
    # `ȣ̓` against `ȣ̓κ` and called a finished edit a mismatch — the same
    # off-by-a-mark that settle_apply's `_anchor` exists to avoid.
    if becomes != printed and line[at:at + len(becomes)] == becomes:
        return 'already'
    if line[at:at + len(printed)] == printed:
        return ''
    if becomes != printed:
        # ⚠ THE BUDGET KNOWS ONLY ITS OWN PLAN, AND THE CORPUS HAS MORE THAN
        # ONE EDITOR. The combined sitting inserted two marks at 027-R:18 and
        # 045-R:8, which pushed MAIN-queue neighbours on those lines further
        # right than any main-queue budget could account for — so a rerun
        # called two finished edits `text_mismatch` all over again, one layer
        # out from the first time.
        #
        # So the window is the plan's own budget OR a small fixed drift,
        # whichever is larger, and the hit must be UNIQUE within it. A unique
        # match under a bounded window is an anchor; two matches is a guess —
        # `settle_apply._anchor` settled that rule for this project already.
        # It can still conclude nothing but `already`.
        window = max(budget, DRIFT_WINDOW)
        hits = [k for k in range(1, window + 1)
                if line[at + k:at + k + len(becomes)] == becomes]
        if len(hits) == 1:
            return 'already'
        if len(hits) > 1:
            return 'ambiguous_already'
    return 'text_mismatch'


def apply_steps(steps: list[dict], *, write: bool) -> dict:
    """Write the accepts back into the stage the site came from.

    ⚠ BACK INTO ITS OWN STAGE. Pages 15-52 live in `reconciled` and 53-62 in
    `reconciled-auto`; `corpus_columns` prefers `reconciled`. Writing a 15-52
    correction into `reconciled-auto` would produce a file nothing ever reads —
    an edit that looks applied and changes nothing.
    """
    counts = {'edited': 0, 'preserve': 0, 'already': 0, 'refused': 0}
    refusals: list[tuple[str, str]] = []
    already: list[tuple[str, str]] = []
    by_file: dict[str, list[dict]] = {}
    budgets = shift_budget(steps)
    for s in steps:
        why = _verify(s, budgets.get(id(s), 0))
        if why:
            # ⚠ `already` IS NOT A REFUSAL AND MUST NOT SIT IN THE REFUSAL LIST.
            # Every outcome went into one list and `cmd_apply` printed the lot
            # under "REFUSED", so a clean rerun of a finished queue read as 167
            # failures — and the two sites picked out of that output to be
            # diagnosed were both perfectly applied. A report that cannot tell
            # "done" from "refused" sends the next reader after the wrong bug.
            # Named, counted, listed — but in its own list.
            if why == 'already':
                counts['already'] += 1
                already.append((s['member'], why))
            else:
                counts['refused'] += 1
                refusals.append((s['member'], why))
            continue
        if s['verdict'] == 'preserve' or \
                elision.fold(s['printed']) == elision.fold(s['becomes']):
            counts['preserve'] += 1
            continue
        # Group by where the column IS, not where it was recorded, so a
        # promoted column cannot split into two groups or be written twice.
        live = current_path(s['page'], s['col'], s['path'])
        by_file.setdefault(str(live), []).append(s)

    for path_s, group in sorted(by_file.items()):
        path = Path(path_s)
        text = path.read_text(encoding='utf-8')
        lines = text.splitlines()
        keep_nl = text.endswith('\n')
        # ⚠ TWO NORMALIZERS, ONE LINE NUMBER. Enumeration and `_verify` count
        # lines in `clean_opus(NFC(text))`; the write counts them in the RAW
        # file, because a diplomatic transcription must be edited exactly as it
        # sits on disk. Today the two agree on all 96 columns — clean_opus drops
        # nothing from them, measured — so the divergence is latent. It would
        # not stay latent quietly: a dropped junk line shifts every line number
        # after it, `_verify` would pass on the cleaned text and the write would
        # land on a different line. So the agreement is CHECKED, per file, right
        # before anything is written, and a divergence refuses the whole file.
        if len(clean_opus(unicodedata.normalize('NFC', text)).splitlines()) \
                != len(lines):
            for s in group:
                counts['refused'] += 1
                refusals.append((s['member'], 'line_geometry_diverged'))
            continue
        # Right-to-left within a line, so an insertion cannot move a later one.
        for s in sorted(group, key=lambda s: (-s['line'], -s['char_at'])):
            line = lines[s['line'] - 1]
            printed, becomes = (elision.fold(s['printed']),
                                elision.fold(s['becomes']))
            a, b = s['char_at'], s['char_at'] + len(printed)
            if unicodedata.normalize('NFC', line[a:b]) != printed:
                counts['refused'] += 1
                refusals.append((s['member'], 'text_mismatch_at_write'))
                continue
            lines[s['line'] - 1] = line[:a] + becomes + line[b:]
            counts['edited'] += 1
        if write:
            path.write_text('\n'.join(lines) + ('\n' if keep_nl else ''),
                            encoding='utf-8')
    return {'counts': counts, 'refusals': refusals, 'already': already}


def corrigenda_for(steps: list[dict]) -> list[dict]:
    """A preserve that overrules the corpus's own majority reading.

    ⚠ AN ERRATUM THAT CORRECTS NOTHING HIDES THE ONES THAT DO. Banking every
    preserve once put 373 useless entries in the register. So a ruling registers
    only where there is something it overrules: the corpus writes this same word
    WITH a breathing elsewhere, and John ruled the ink bare here. Where the
    corpus never breathes it, nothing has been overruled and nothing is banked.
    """
    out, seen = [], set()
    for s in steps:
        if s['verdict'] != 'preserve':
            continue
        smooth, rough = s['smooth_siblings'], s['rough_siblings']
        # ⚠ THE ϗ CARD OVERRULES 760 GRAVES AND USED TO BANK NOTHING, because
        # only the two breathings were consulted. A preserve there is exactly
        # the case a corrigendum is for.
        grave = s.get('grave_siblings', 0)
        if not (smooth or rough or grave):
            continue
        if grave and not (smooth or rough):
            mark = GRAVE
        else:
            mark = SMOOTH if smooth >= rough else ROUGH
        try:
            correct = add_mark(s['printed'], mark)
        except BuildError:
            continue
        key = (s['page'], s['col'], s['line'], s['printed'])
        if key in seen:
            continue
        seen.add(key)
        out.append({
            'page': s['page'],
            'col': s['col'],
            'line': s['line'],
            'printed': s['printed'],
            'correct': correct,
            'rule': RULE,
            'authority': (
                f'the corpus writes this same word marked elsewhere '
                f'(smooth {smooth}×, rough {rough}×, grave {grave}×); John '
                f'read the crop and ruled the page bare here. The page '
                f'outranks the pattern.'),
            'checked': f'400dpi {DATE}',
            'note': f'ligature form {s["sid"]} · {DATE} · registered '
                    f'automatically',
        })
    return out


def followup_doc(cards: list[Card], excluded: list[dict]) -> dict | None:
    """The excluded sites, as a queue that `serve` can take without changes.

    ⚠ OTHERWISE "IT BECOMES ITS OWN CARD" IS A PROMISE NOTHING KEEPS. An exclude
    that only ever appears as a line of apply output is a site quietly dropped
    from the sitting — the same shape as every other absence this project has
    had to rediscover. The crops are already on disk under the same names, so
    the follow-up queue serves immediately.
    """
    if not excluded:
        return None
    want = {e['member'] for e in excluded}
    out = []
    for card in cards:
        members = [m for m in card.members if m.sid in want]
        if members:
            out.append(Card(form=card.form, members=members,
                            smooth_siblings=card.smooth_siblings,
                            rough_siblings=card.rough_siblings,
                            grave_siblings=card.grave_siblings))
    doc = queue_doc(out, {'excluded_from': 'the first ligature sitting'}, {},
                    store=EXCLUDED_RULINGS)
    doc['built_from'] = ('sites John excluded from a card ruling — each is '
                         'asked on its own')
    return doc


def bank_corrigenda(entries: list[dict], path: Path = CORRIGENDA) -> int:
    if not path.exists() or not entries:
        return 0
    doc = json.loads(path.read_text(encoding='utf-8'))
    have = {(e['page'], e['col'], e['line'], e['printed'])
            for e in doc['entries']}
    fresh = [e for e in entries
             if (e['page'], e['col'], e['line'], e['printed']) not in have]
    if fresh:
        doc['entries'].extend(fresh)
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                        encoding='utf-8')
    return len(fresh)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def cmd_build(a) -> int:
    sites, counts = enumerate_sites()
    n_enumerated = len(sites)
    siblings = sibling_counts()
    cards = build_cards(sites, siblings)
    crop_stats = cut_crops(cards, write=a.write)
    doc = queue_doc(cards, counts, crop_stats, store=a.store)

    # ⚠ THE VOLUME PIN. Every site enumerated must arrive in a card. A queue
    # that quietly holds fewer is the failure this project keeps rediscovering:
    # a check that answers "nothing" without saying it never looked.
    if doc['n_members'] != n_enumerated:
        raise BuildError(f'{n_enumerated} sites enumerated but '
                         f'{doc["n_members"]} reached the cards')

    print(f'classes in the corpus: '
          + ' · '.join(f'{k}={v}' for k, v in sorted(counts.items())))
    print(f'{len(cards)} cards · {doc["n_members"]} sites')
    for c in cards:
        weak = sum(1 for m in c.members if m.crop_how != 'text')
        off = sum(1 for m in c.members if m.word_off < 0)
        bits = []
        if weak:
            bits.append(f'{weak} crop(s) placed by geometry')
        if off:
            bits.append(f'{off} unplaced in Opus')
        print(f'  {c.form:<12} {c.n:>3} site(s)   {evidence_line(c):<26}'
              + (f'   ⚠ {", ".join(bits)}' if bits else ''))
    print('crop geometry: '
          + ' · '.join(f'{k}={v}' for k, v in crop_stats.items() if v))
    every = [m for c in cards for m in c.members]
    for state in STATES:
        n = sum(1 for m in every if m.state == state)
        print(f'  state {state}: {n}')
    bad = [m for m in every if m.state != 'ok']
    if bad:
        print(f'⚠ {len(bad)} site(s) not in state ok:')
        for m in bad[:20]:
            print(f'   {m.sid}  {m.state}  {m.note}')
    if a.write:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                         encoding='utf-8')
        html(cards)
        print(f'-> {a.out}')
        print(f'-> {PAGE}')
    else:
        print('\ndry run — pass --write to record the queue, page and crops')
    return 0


def cmd_combined(a) -> int:
    """The combined-marks sitting for the forms ruled `none` on a half answer."""
    cards = combined_cards(COMBINED_FORMS, rulings_path=a.rulings)
    crop_stats = cut_crops(cards, write=a.write)
    doc = queue_doc(cards, {'combined_forms': list(COMBINED_FORMS)},
                    crop_stats, store=a.store)
    print(f'{len(cards)} cards · {doc["n_members"]} sites')
    for c in cards:
        weak = sum(1 for m in c.members if m.crop_how != 'text')
        print(f'  {c.form:<10} {c.n:>2} site(s)'
              + (f'   ⚠ {weak} crop(s) placed by geometry' if weak else ''))
        for cand in c.candidates:
            marks = ' '.join(f'U+{ord(ch):04X}'
                             for ch in unicodedata.normalize('NFD',
                                                             cand['form']))
            src = (f'corpus {cand["seen"]}×' if cand.get('seen')
                   else f'standard spelling {cand.get("word", "")}')
            print(f'       -> {cand["form"]:<10} {cand["names"]:<52} '
                  f'{src}')
            print(f'          {marks}')
        if c.note:
            print(f'       note: {c.note}')
    print('crop geometry: '
          + ' · '.join(f'{k}={v}' for k, v in crop_stats.items() if v))
    every = [m for c in cards for m in c.members]
    for state in STATES:
        print(f'  state {state}: {sum(1 for m in every if m.state == state)}')
    if a.write:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                         encoding='utf-8')
        html(cards, COMBINED_PAGE)
        print(f'-> {a.out}\n-> {COMBINED_PAGE}')
        print(f'serve it with:  python3 -m bonitz_pipeline.ligature_review '
              f'serve --queue {a.out} --rulings {a.store} --port <a free port>')
    else:
        print('\ndry run — pass --write to record the queue, page and crops')
    return 0


def cmd_followup(a) -> int:
    """Rebuild the excluded-site follow-up: one card per site, re-anchored."""
    cards = followup_cards(a.rulings, a.queue)
    crop_stats = cut_crops_verified(cards, write=a.write)
    doc = queue_doc(cards, {'excluded_from': str(a.rulings)}, crop_stats,
                    store=a.store)
    print(f'{len(cards)} cards · {doc["n_members"]} sites (one card per site)')
    for c in cards:
        m = c.members[0]
        mark = ('ink OK' if m.state != 'no_crop'
                else f'NO CROP ({m.crop_how}, text match {m.crop_score:.2f})')
        print(f'  {c.sid:<28} {c.form!r:8} {mark}')
        if not c.rulable:
            print('        -> offers NONE only; nothing may be ruled from it')
            continue
        for cand in c.candidates:
            cps = ' '.join(f'U+{ord(ch):04X}'
                           for ch in unicodedata.normalize('NFD', cand['form']))
            src = (f'this word {cand["seen"]}×' if cand['seen']
                   else 'not on this word')
            print(f'        {cand["form"]:<8} {cand["names"]:<22} '
                  f'{src:<18} {cps}')
    print(f'crops: {crop_stats}')
    n_dead = sum(1 for c in cards if not c.rulable)
    if n_dead:
        print(f'⚠ {n_dead} card(s) have no verifiable ink and offer nothing')
    if a.write:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                         encoding='utf-8')
        html(cards, FOLLOWUP_PAGE)
        print(f'-> {a.out}\n-> {FOLLOWUP_PAGE}')
        print(f'serve it with:  python3 -m bonitz_pipeline.ligature_review '
              f'serve --queue {a.out} --rulings {a.store} --port <a free port>')
    else:
        print('\ndry run — pass --write to record the queue, page and crops')
    return 0


def cmd_accent(a) -> int:
    """The ten accent-without-breathing words, one card each."""
    cards = accent_cards()
    crop_stats = cut_crops_verified(cards, write=a.write)
    doc = queue_doc(cards, {'class': 'accent-ou (accent, no breathing)'},
                    crop_stats, store=a.store)
    print(f'{len(cards)} cards · {doc["n_members"]} sites (one card per site)')
    for c in cards:
        m = c.members[0]
        mark = ('ink OK' if m.state != 'no_crop'
                else f'NO CROP ({m.crop_how}, text match {m.crop_score:.2f})')
        print(f'  {c.sid:<26} {c.form!r:10} {m.crop_how:<4} {mark}')
        if not c.rulable:
            print('        -> offers NONE only; nothing may be ruled from it')
            continue
        for cand in c.candidates:
            cps = ' '.join(f'U+{ord(ch):04X}'
                           for ch in unicodedata.normalize('NFD', cand['form']))
            src = (f'{cand["seen"]}× in corpus' if cand['seen']
                   else 'not written this way')
            print(f'        {cand["form"]:<10} {src:<20} {cps}')
    print(f'crops: {crop_stats}')
    if a.write:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                         encoding='utf-8')
        html(cards, ACCENT_PAGE)
        print(f'-> {a.out}\n-> {ACCENT_PAGE}')
        print(f'serve it with:  python3 -m bonitz_pipeline.ligature_review '
              f'serve --queue {a.out} --rulings {a.store} --port <a free port>')
    else:
        print('\ndry run — pass --write to record the queue, page and crops')
    return 0


def cmd_serve(a) -> int:
    if not a.queue.exists():
        print(f'not found: {a.queue} — run `build --write` first',
              file=sys.stderr)
        return 2
    # ⚠ A QUEUE MUST NOT BE SERVED INTO ANOTHER QUEUE'S STORE. Three sittings
    # now share this command; a mistyped --rulings would file answers about one
    # question under another's key, and nothing would ever say so.
    declared = json.loads(a.queue.read_text(encoding='utf-8')).get('store', '')
    if declared and Path(declared).resolve() != a.rulings.resolve():
        print(f'{a.queue.name} declares its store as {declared}, not '
              f'{a.rulings} — refusing to serve a queue into another '
              f'sitting\'s rulings', file=sys.stderr)
        return 2
    cards = cards_from_queue(a.queue)
    if a.only_unruled:
        have = _read_store(a.rulings)
        ruled = {k for k, v in have.items() if v.get('verdict')}
        before = len(cards)
        cards = [c for c in cards if c.sid not in ruled]
        if before - len(cards):
            print(f'{before - len(cards)} card(s) already ruled — off the page,'
                  f' still applied')
    html(cards)
    serve(cards, a.port, '0.0.0.0' if a.wifi else '127.0.0.1',
          store=a.rulings)
    return 0


def _report_outcomes(result: dict) -> None:
    """Refusals loudly and by name; the finished ones counted, not paraded.

    A rerun of a fully-applied queue should read as ONE quiet line saying so.
    Printing 167 `already` sites under a REFUSED heading is how a clean state
    got diagnosed as a failure.
    """
    for m, why in result['refusals'][:20]:
        print(f'  REFUSED  {m}  {why}')
    n = len(result['refusals'])
    if n > 20:
        print(f'  ... and {n - 20} more refusals')
    if result['already']:
        print(f'  {len(result["already"])} site(s) already carry the ruled '
              f'form — nothing to do there')


def cmd_apply(a) -> int:
    p = plan(a.queue, a.rulings)
    steps = p['steps']
    accepts = [s for s in steps if s['verdict'] == 'accept']
    print(f'{len(steps)} member-step(s) from '
          f'{len({s["sid"] for s in steps})} ruling(s)')
    print(f'  accept (would change): {len(accepts)}')
    print(f'  preserve:              {len(steps) - len(accepts)}')
    print(f'  excluded by John:      {len(p["excluded"])}')
    print(f'  set aside (none):      {len(p["aside"])}')
    if p['unruled']:
        print(f'  UNRULED cards (refused, nothing applied): '
              f'{len(p["unruled"])}')
        for sid in p['unruled'][:10]:
            print(f'    {sid}')
    if p['orphaned']:
        print(f'  {len(p["orphaned"])} ruling(s) in the store belong to cards '
              f'this queue no longer has (a superseded sitting; they bind '
              f'nothing):')
        for sid in p['orphaned'][:10]:
            print(f'    {sid}')
    if p['illegal']:
        print(f'\n⚠⚠ {len(p["illegal"])} RULING(S) THE STORE HOLDS ARE NOT '
              f'READINGS THEIR CARD OFFERS. Nothing was applied for them; the '
              f'store needs looking at before this runs again:')
        for e in p['illegal']:
            print(f'    {e["sid"]}  ({e["n"]} site(s))  {e["why"]}')
    for s in accepts[:8]:
        print(f'  edit  {s["member"]:<26} {s["printed"]!r} → {s["becomes"]!r}')
    for e in p['excluded'][:10]:
        print(f'  excluded  {e["member"]:<26} {e["form"]!r} — its own card')
    if not a.apply:
        # A dry run still verifies, so a mismatch is known before the write.
        result = apply_steps(steps, write=False)
        print(f'\ndry run: {result["counts"]}')
        _report_outcomes(result)
        print('pass --apply to write the corpus and corrigenda')
        return 1 if (p['illegal'] or result['counts']['refused']) else 0
    result = apply_steps(steps, write=True)
    print(f'applied: {result["counts"]}')
    _report_outcomes(result)
    banked = bank_corrigenda(corrigenda_for(steps))
    print(f'corrigenda banked: {banked}')
    follow = followup_doc(cards_from_queue(a.queue), p['excluded'])
    if follow:
        a.followup.parent.mkdir(parents=True, exist_ok=True)
        a.followup.write_text(
            json.dumps(follow, ensure_ascii=False, indent=1) + '\n',
            encoding='utf-8')
        print(f'{follow["n_members"]} excluded site(s) -> {a.followup}\n'
              f'  serve them with:  python3 -m bonitz_pipeline.ligature_review '
              f'serve --queue {a.followup} --rulings <a new store>')
    return 1 if p['illegal'] else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)

    b = sub.add_parser('build', help='enumerate, group, cut crops')
    b.add_argument('--write', action='store_true')
    b.add_argument('--out', type=Path, default=QUEUE)
    b.add_argument('--store', type=Path, default=RULINGS)
    b.set_defaults(fn=cmd_build)

    c = sub.add_parser('combined',
                       help='the combined-marks sitting for the seven forms '
                            'John ruled `none` on a breathing-only button')
    c.add_argument('--write', action='store_true')
    c.add_argument('--out', type=Path, default=COMBINED_QUEUE)
    c.add_argument('--store', type=Path, default=COMBINED_RULINGS)
    c.add_argument('--rulings', type=Path, default=RULINGS,
                   help='the MAIN sitting\'s store, read to find the sites '
                        'John excluded there — they are asked in the follow-up '
                        'queue, not here')
    c.set_defaults(fn=cmd_combined)

    f = sub.add_parser('followup',
                       help='rebuild the excluded-site queue — one card per '
                            'site, re-anchored against the current corpus')
    f.add_argument('--write', action='store_true')
    f.add_argument('--out', type=Path, default=FOLLOWUP)
    f.add_argument('--queue', type=Path, default=QUEUE)
    f.add_argument('--rulings', type=Path, default=RULINGS,
                   help="the MAIN sitting's store, which records the excludes")
    f.add_argument('--store', type=Path, default=EXCLUDED_RULINGS,
                   help='where the follow-up sitting records ITS rulings')
    f.set_defaults(fn=cmd_followup)

    ac = sub.add_parser('accent',
                        help='the ten accent-without-breathing words, one '
                             'card per site')
    ac.add_argument('--write', action='store_true')
    ac.add_argument('--out', type=Path, default=ACCENT_QUEUE)
    ac.add_argument('--store', type=Path, default=ACCENT_RULINGS)
    ac.set_defaults(fn=cmd_accent)

    s = sub.add_parser('serve', help='put the cards to John')
    s.add_argument('--queue', type=Path, default=QUEUE)
    s.add_argument('--rulings', type=Path, default=RULINGS)
    s.add_argument('--port', type=int, default=8794)
    s.add_argument('--wifi', action='store_true')
    s.add_argument('--only-unruled', action='store_true')
    s.set_defaults(fn=cmd_serve)

    p = sub.add_parser('apply', help='carry the rulings into the corpus')
    p.add_argument('--queue', type=Path, default=QUEUE)
    p.add_argument('--rulings', type=Path, default=RULINGS)
    p.add_argument('--apply', action='store_true')
    p.add_argument('--followup', type=Path, default=FOLLOWUP,
                   help='where the excluded sites are written as their own '
                        'queue (only on --apply)')
    p.set_defaults(fn=cmd_apply)

    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == '__main__':
    sys.exit(main())
