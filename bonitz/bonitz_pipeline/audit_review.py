"""One card per audited line: the ink against every reading of it.

    python3 -m bonitz_pipeline.audit_review            # build + serve
    python3 -m bonitz_pipeline.audit_review --wifi

The queue is the ground-truth audit: lines where the engines disagree with
the corpus — kraken e26 on its own training columns (work/audit/
gt-audit-train.tsv), and on the holdout the lines where kraken and Calamari
read the same ink the same way against the corpus, plus the lines where
neither matched it. Every card asks ONE question: what does the ink print?

⚠ JOHN'S RULES (each from a real failure — not negotiable):
  1. One question per card. No typing. No window switching.
  2. Big buttons; every option states its consequence.
  3. An "unsure" click is a defect in the tool — the card is missing
     something. NONE exists because every reading offered can be wrong.
  4. He must see the actual INK: crops come from the line's own polygon.
  5. What a font will not separate is named in words beside the button
     (`᾽ GREEK KORONIS` vs `' APOSTROPHE`) — he is matching shapes, and
     some shapes only differ in the codepoint.
  6. Crops are served as SEPARATE IMAGES, never inlined: 56 base64 crops
     once made a 17MB page.

Rulings are RECORDED, never applied from here: work/audit/audit-rulings.json,
verdict `keep` (corpus is what the ink prints), `fix` with the chosen reading
(the ink prints what an engine read — an edit toward the ink, John's call),
or `none` (the ink reads something no one offered — follow-up card).

⚠ THIS STORE IS NOT YET A SOURCE OF `john_rulings.migrate` (Grok, finding 9).
The apply step that consumes these rulings must also fold them into the
ledger via `john_rulings.add()` — until then they live only in this file,
and a ledger rebuilt from its five stores will not know them.
"""

from __future__ import annotations

import argparse
import html as html_mod
import json
import os
import re
import sys
import tempfile
import threading
import unicodedata
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageOps

from bonitz_pipeline import elision
from bonitz_pipeline.kraken_eval import align
from bonitz_pipeline.gt_audit import SEVERITY, classify

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / 'work' / 'kraken400'
AUDIT = ROOT / 'work' / 'audit'
CROPS = AUDIT / 'crops'
PAGE = AUDIT / 'audit-review.html'
RULINGS = AUDIT / 'audit-rulings.json'
TRAIN_TSV = AUDIT / 'gt-audit-train.tsv'
AGREE_WRONG = ROOT / 'work' / 'calamari' / \
    'run1-96px-holdout_predictions-vs-kraken-agree-wrong.tsv'
VS_KRAKEN = ROOT / 'work' / 'calamari' / \
    'run1-96px-holdout_predictions-vs-kraken.tsv'
OOF_TSV = ROOT / 'work' / 'calamari' / 'oof-vs-corpus.tsv'
RECONCILED = ROOT / 'work' / 'reconciled'
SIGLUM_TSV = ROOT / 'work' / 'sweeps' / 'siglum-homoglyph.tsv'
ENCODING_TSV = ROOT / 'work' / 'sweeps' / 'encoding-check.tsv'
DIVISION_TSV = ROOT / 'work' / 'sweeps' / 'division-check.tsv'

LETTER_RUN = re.compile(r'[^\W\d_]+', re.UNICODE)


def _crop_name(key: str, cut: str) -> str:
    """A crop file is named for its SITE AND ITS CUT, never the site alone.

    ⚠ THE SAME LINE IS CROPPED TWO WAYS. A card shows the whole printed line;
    the same line bundled into a class card shows a WINDOW on the dispute. Both
    used to write `<site>.png`, and `cut_crop` returns early when that file
    exists — so page-056-R kept a 600x236 window cut on 2026-08-13, and the
    card that wanted the full line the next day silently served it. John saw a
    crop of the line ABOVE the one he was being asked about, which is worse
    than no crop: it is evidence pointing at the wrong ink.

    The width is in the name too, so widening a bundle's window recuts it
    rather than serving yesterday's tighter one.
    """
    return re.sub(r'[^\w.-]', '_', key) + f'-{cut}.png'

PAGE_NS = 'http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15'


# Card classes, in the order John sees them. The two sweep tiers come first:
# they are few, they carry their own evidence, and a `siglum` card is decided
# by the citation rather than by squinting at type the printer set identically.
TIERS = ['encoding', 'siglum', 'division'] + SEVERITY

# How many per-line cards were folded into the glyph-pair cards. Counted and
# PRINTED, never silently dropped: a queue that quietly shows less than it
# found is the defect this project keeps re-fixing.
HOMOGLYPH_SKIPPED = 0

# How many cards disputed NOTHING BUT the spelling of the elision mark.
# Counted and printed for the same reason.
ELISION_FOLDED = 0

# How many disputed NOTHING BUT the gap between a siglum and its number,
# which John ruled a matter of RENDERING on 2026-08-13 — `_guard_siglum_space`
# refuses such an edit, so a card offering it is a question whose answer the
# apply step is built to reject.
SIGLUM_SPACE_SKIPPED = 0

# How many machine cards a hand card took over, because it asks the whole
# question its line needs and they could only ask part of it.
HAND_SUPERSEDED = 0

# Sweep findings whose site the corpus has moved past — answered, not lost.
SWEEP_DONE: list[str] = []


@dataclass
class Member:
    """One site bound by a class ruling, with its own crop and its own ✕."""
    sid: str                      # column:L<n>:<token>
    column: str
    lineno: int
    token: str                    # the spelling AS THE CORPUS HAS IT here
    label: str                    # which spelling, in words
    crop_how: str = 'text'
    # A member from the per-line audit is addressed by kraken's OWN line id
    # (printed line numbers do not carry across), and its crop is a window
    # placed at `frac` of the way along that polygon.
    line_id: str = ''
    frac: float = -1.0
    # Which dispute on that line this member is bound by, when the line was
    # split into parts. Carried so the crop windows on one line differ.
    part: int | None = None
    # ⚠ WHICH ONE. John, 2026-08-14, on a `p`/nothing bundle: "which p am i
    # judging?" — and he was right to ask. The crop window is centred by
    # CHARACTER INDEX along a justified line, which is an approximation (the
    # offset lesson of 2026-08-10), and a line reading `parorum species` holds
    # two of them. The ink cannot say which; the corpus text can, exactly. So
    # each member carries its own dispute in context, marked — (before, the
    # disputed character, after) — and the crop is what he checks it against
    # rather than what he has to locate it in.
    context: tuple[str, str, str] = ('', '', '')
    # How wide a window the crop takes, in source pixels each side of the
    # dispute. A tight window is what lets 36 crops be read at a glance; a
    # small group has the room to show the words either side, and needs to.
    half: int = 150

    @property
    def crop_name(self) -> str:
        # a member is always a window: on its polygon, or on its token
        return _crop_name(self.sid,
                          f'w{self.half}' if self.frac >= 0 else 'word')


@dataclass
class Card:
    sid: str                      # column:line_id, or column:L<n>:<token>
    column: str
    line_id: str
    cls: str                      # a TIERS entry
    gt: str                       # what the corpus says the line reads
    readings: dict[str, str]      # engine/check label -> its reading (≠ gt)
    # Sweep findings address the corpus by PRINTED LINE NUMBER, not by the
    # kraken XML's line id — the two do not carry across (kraken drops the
    # marginal number lines), so their crops go through `mark_review.crop_word`,
    # which finds the line by its text.
    lineno: int | None = None
    token: str | None = None
    section: str = 'mixed'        # which SECTIONS heading it sits under
    note: str = ''                # the check's own evidence, shown on the card
    crop_how: str = 'text'        # how the crop was placed; 'text' is a match
    # A CLASS card states its own buttons: (verdict, label, shown, names,
    # consequence). Used where the corpus-versus-a-reading shape does not
    # fit — an encoding split has no status quo to keep, because BOTH
    # spellings are already in the corpus.
    options: list[tuple[str, str, str, str, str]] | None = None
    # Every site the ruling binds. Each gets a crop in a scrollable strip and
    # a ✕ that pulls it out — John's format from the ligature sitting, where
    # the excludes are what made a group ruling safe.
    members: list[Member] = field(default_factory=list)
    mixed: str = ''               # ⚠ when the members are not all one case
    # --- a line SPLIT into one card per dispute ---------------------------
    part: int | None = None       # which dispute of its line this card asks
    # Every dispute on the line, as position in `gt` → the texts some reading
    # proposes there. The apply step locates the line by this: once a sibling
    # part is written the line no longer reads `gt`, and a locator that only
    # knew this card's own change could not find it again.
    line_ops: dict[int, list[str]] = field(default_factory=dict)
    crop_of: str = ''             # share one crop across a line's parts
    where: str = ''               # how a member of this line is labelled
    # ⚠ A BUNDLE'S SUBSTITUTION IS CARRIED, NOT RE-PARSED OUT OF ITS SID. The
    # sid is `pattern:<a>-<b>`, and when `a` is itself a HYPHEN — the corpus
    # printing a dash where an engine reads none — splitting on '-' hands back
    # a two-character 'character' and the section test dies on it. The key is
    # for addressing; the fact travels in the card.
    sig: tuple[str, str] | None = None

    @property
    def crop_name(self) -> str:
        # a card shows the WHOLE line — found by polygon, or by text for a
        # sweep finding that addresses its site by printed line number
        return _crop_name(self.crop_of or self.sid,
                          'text' if self.lineno is not None else 'line')


def _tsv(path: Path, optional: bool = False) -> list[dict]:
    # ⚠ `optional` is for a sweep that has never been run, NOT for one that
    # failed: a missing file yields no cards and the queue says how many
    # sources it read, so "this sweep contributed nothing" can never be
    # confused with "this sweep found nothing".
    if not path.exists():
        if optional:
            return []
        raise SystemExit(f'{path} is missing — run the audit that writes it '
                         f'first (gt_audit / calamari_score --against)')
    lines = path.read_text(encoding='utf-8').splitlines()
    head = lines[0].split('\t')
    return [dict(zip(head, l.split('\t'))) for l in lines[1:]]


def _homoglyph_only(gt: str, hyp: str) -> bool:
    """True when every difference folds to the same shape.

    ⚠ FOR A HOMOGLYPH THE ENGINES CARRY NO INFORMATION. They read identical
    ink; which codepoint comes out is an artifact of their training
    alphabet. page-042-R:44 has calamari reading Greek Α + Latin Z and
    kraken Latin A + Latin Z on one token, in different directions. Such a
    card asks John to judge from ink that cannot answer — and the glyph-pair
    card already decides the whole class at once.
    """
    from bonitz_pipeline.encoding_check import FOLD
    subs = [(x, y) for x, y in align(gt, hyp) if x != y]
    if not subs:
        return False
    return all(x and y and FOLD.get(x, x) == FOLD.get(y, y) for x, y in subs)


# Sections, in the order John asked for them (2026-08-13). The tiers say how
# BAD a card is; the sections say what KIND OF JUDGEMENT it wants, and that is
# what makes a run of them fast: reading Latin type, reading Greek type, and
# choosing a codepoint for type that cannot be read at all are three different
# jobs, and switching between them every card is the expensive part.
SECTIONS = [
    ('Latin ↔ Latin', 'reading Latin type — a broken sort prints c for e'),
    ('Latin ↔ Greek', 'the ink CANNOT decide these: one sort, two codepoints'),
    ('Greek ↔ Greek', 'reading Greek type'),
    # ⚠ THE TWO DIRECTIONS ARE TWO QUESTIONS, AND JOHN ANSWERS THEM
    # OPPOSITELY. Measured over his own rulings on 2026-08-14: where the
    # corpus LACKED a mark an engine read, he backed the engine 18 times out
    # of 18; where the corpus HAD one the engine did not read, he backed the
    # corpus 8 times out of 9. Filed together they read as a coin flip — his
    # own impression was "about 50/50" — and each run of cards shuffles two
    # near-settled questions. Apart, each is a fast run of one answer.
    ('marks the corpus lacks',
     'the engine read a breathing or accent the corpus has not — where the '
     'corpus drops the circumflex over ȣ'),
    ('marks the engine dropped',
     'the corpus has a mark no engine read — usually the corpus is right'),
    ('marks', 'one mark against a DIFFERENT one — a breathing or accent '
              'swapped, not added or lost'),
    ('digits', 'Bekker numbers, where an error corrupts every address'),
    ('punctuation', 'stops, commas and which codepoint spells an elision'),
    ('spacing', 'the printed gap — often justification, not meaning'),
    ('mixed', 'more than one kind of thing at once'),
]


def _script(c: str) -> str:
    if not c or c == '∅':
        return 'none'
    if c.isspace():
        return 'space'
    if c.isdigit():
        return 'digit'
    if unicodedata.combining(c):
        return 'mark'
    name = unicodedata.name(c, '')
    if 'GREEK' in name:
        return 'mark' if 'COMBINING' in name else 'greek'
    if 'LATIN' in name:
        return 'latin'
    cat = unicodedata.category(c)
    return 'punct' if cat[0] == 'P' or cat == 'Sk' else 'other'


def _base_script(c: str) -> str:
    """The script of a character with its marks peeled off, so `ἄ` is Greek
    rather than a mark, and `ἀ`→`ἄ` reads as an accent question."""
    if not c or c == '∅':
        return 'none'
    stripped = ''.join(ch for ch in unicodedata.normalize('NFD', c)
                       if not unicodedata.combining(ch))
    return _script(stripped) if stripped else 'mark'


def section_of(disputes: list[tuple[str, str]]) -> str:
    """Which section a card belongs in, from the characters it disputes.

    ⚠ THE MOST SIGNIFICANT KIND WINS; a card is NOT filed as `mixed` merely
    for holding two kinds. Requiring one kind put 143 of 442 in the
    catch-all, which is not a section, it is a shrug. A line that disputes a
    letter AND a space is a letter question with a space alongside it, and
    the letter is what John is being asked.
    """
    if not disputes:
        return 'mixed'
    kinds = set()
    for a, b in disputes:
        sa, sb = _base_script(a), _base_script(b)
        pair = {sa, sb} - {'none'}      # an insertion is judged by its letter
        if pair <= {'space'}:
            kinds.add('spacing')
        elif pair <= {'digit'}:
            kinds.add('digits')
        elif pair <= {'punct'}:
            kinds.add('punctuation')
        elif pair <= {'mark'} or (_script(a) == 'mark' or _script(b) == 'mark'):
            # which DIRECTION, because they are different questions
            if _script(a) == 'none' or not a or a == '∅':
                kinds.add('marks the corpus lacks')
            elif _script(b) == 'none' or not b or b == '∅':
                kinds.add('marks the engine dropped')
            else:
                kinds.add('marks')
        elif pair == {'latin'}:
            kinds.add('Latin ↔ Latin')
        elif pair == {'greek'}:
            # same letter, different marks is an accent question, not a
            # letter one — `ἀ` against `ἁ` is a breathing
            # same letter, different marks is an accent question, not a
            # letter one — and a mark ADDED to a bare letter (`ἀ` for `α`)
            # is the corpus-lacks question, not a swap
            if a != b and _strip(a) == _strip(b):
                na, nb = len(unicodedata.normalize('NFD', a)), \
                    len(unicodedata.normalize('NFD', b))
                kinds.add('marks the corpus lacks' if nb > na else
                          'marks the engine dropped' if na > nb else 'marks')
            else:
                kinds.add('Greek ↔ Greek')
        elif pair == {'latin', 'greek'}:
            kinds.add('Latin ↔ Greek')
        else:
            kinds.add('mixed')
    for name in ('Latin ↔ Greek', 'Latin ↔ Latin', 'Greek ↔ Greek', 'digits',
                 'marks the corpus lacks', 'marks the engine dropped', 'marks',
                 'punctuation', 'spacing'):
        if name in kinds:
            return name
    return 'mixed'


def _strip(c: str) -> str:
    return ''.join(ch for ch in unicodedata.normalize('NFD', c)
                   if not unicodedata.combining(ch))


def _signature(gt: str, hyp: str) -> tuple[str, str] | None:
    """The single substitution this line disputes, or None if it disputes
    more than one kind of thing.

    A card whose whole quarrel is one repeated pair — every `Μδ 22` against
    `Μδ22`, every koronis against an apostrophe — is asking the SAME
    question as its seventy siblings, and asking it seventy times is how a
    queue of 481 becomes a day's work.
    """
    subs = {(x or '∅', y or '∅') for x, y in align(gt, hyp) if x != y}
    return subs.pop() if len(subs) == 1 else None


def ops(gt: str, hyp: str) -> dict[int, str]:
    """What `hyp` changes in `gt`, as position → replacement text.

    ⚠ A WHOLE-LINE READING IS NOT A WHOLE-LINE CLAIM, and this is what says
    so. Two cards can ask about one line and both be right: at page-021-R:4
    the siglum sweep rules the `H` a Greek `Η`, and the line's own audit card
    rules the same `H` AND a missing space after `12.`. Compared as whole
    strings they "disagree" and both would be refused; reduced to the
    positions they actually touch they overlap on the `H`, agree there, and
    each contributes its own change.

    An insertion is folded into the character it precedes, so `∅`→`ν` before
    a substitution at the same place is ONE entry: two disputes the ink
    cannot be asked about separately are not two questions.
    """
    raw: dict[int, str] = {}
    pending, i = '', 0

    def _carry() -> bool:
        """⚠ AN ADDED MARK BELONGS TO THE LETTER BEFORE IT, NOT AFTER. The
        alignment offers a combining mark as an insertion, and folding it into
        the FOLLOWING character made `τȣ λόγȣ` -> `τȣ͂ λόγȣ` a question about
        the SPACE. The accent is the ligature's."""
        nonlocal pending
        if not (pending and i and
                all(unicodedata.combining(c) for c in pending)):
            return False
        raw[i - 1] = raw.get(i - 1, gt[i - 1]) + pending
        pending = ''
        return True

    for x, y in align(gt, hyp):
        if x is None:
            pending += y or ''
            continue
        _carry()
        if pending or (y if y is not None else '') != x:
            raw[i] = pending + (y if y is not None else '')
        pending, i = '', i + 1
    if pending and not _carry():
        raw[len(gt)] = pending
    if not raw:
        return {}
    # ⚠ AND NOW BY GRAPHEME CLUSTER, BECAUSE A LETTER OWNS ITS ACCENTS. Per
    # codepoint, deleting `ȣ́` produced a dispute that removed the LIGATURE and
    # kept the acute — page-037-L would have been written `ζ́σης`, the accent
    # orphaned onto the zeta, and `(̓ γίνεται`, a breathing stranded on a
    # parenthesis. John, 2026-08-14, looking at that card: "am i ruling on the
    # ligatures (with their diacriticals) vs nothing? or bare ligature vs
    # nothing?" Neither, as it stood — it was offering him a reading no ink
    # could have.
    #
    # A base and its marks are ONE question. `ȣ` against `ȣ͂` is still its own
    # question, because the cluster differs by the mark alone.
    owner: dict[int, int] = {}
    for start, chunk in _clusters(gt):
        for j in range(start, start + len(chunk)):
            owner[j] = start
    hot = {owner[i] for i in raw if i in owner}
    out = {}
    for start, chunk in _clusters(gt):
        if start in hot:
            out[start] = ''.join(raw.get(j, chunk[j - start])
                                 for j in range(start, start + len(chunk)))
    if len(gt) in raw:
        out[len(gt)] = raw[len(gt)]
    return out


def apply_ops(gt: str, chosen: dict[int, str]) -> str:
    """`gt` with exactly these changes made — the inverse of `ops`.

    Keyed by the START of a grapheme cluster, and replacing the whole of it,
    so a base and its marks are never separated.
    """
    out = [chosen[start] if start in chosen else chunk
           for start, chunk in _clusters(gt)]
    if len(gt) in chosen:
        out.append(chosen[len(gt)])
    return ''.join(out)


# How many disputes were dropped when their line was split, because alone
# they are homoglyphs and the ink cannot answer them. Counted and PRINTED:
# a queue that quietly shows less than it found is this project's oldest bug
# ([[absence-rendered-as-clean]]).
SPLIT_HOMOGLYPH = 0


def split_card(c: Card) -> list[Card]:
    """One card per DISPUTE, for a line that disputes more than one thing.

    John, 2026-08-14: "when a line has several parts that need ruling, can we
    split them into separate items to be ruled on? that would probably
    increase amount that can be bundled and would cut down on the amount of
    'none' rulings". Both halves are borne out by the queue as it stood:
    26 of his 32 per-line `none` verdicts were on lines with more than one
    dispute — he was rejecting a whole line because neither reading was right
    about all of it — and splitting hands the pair-bundler parts it can group.

    Each part keeps the WHOLE line as its text, so John still sees the
    sentence; only one highlight moves, and only that one character is in
    question. The apply step merges the parts of a line character by
    character, which is machinery `audit_apply._compose` already had.

    ⚠ A PART THAT IS A HOMOGLYPH ON ITS OWN IS DROPPED, NOT ASKED. A line
    holding one real dispute and one `A`/`Α` survives the whole-line
    homoglyph filter; split, the second part would ask John to judge from ink
    that cannot answer — which his rules call a defect in the tool. The
    glyph-pair cards decide that class. The count is on the page.
    """
    global SPLIT_HOMOGLYPH
    every: dict[int, dict[str, str]] = {}
    for label, hyp in c.readings.items():
        for i, text in ops(c.gt, hyp).items():
            every.setdefault(i, {})[label] = text
    if len(every) < 2:
        return [c]
    line_ops = {i: sorted(set(by.values())) for i, by in every.items()}
    out = []
    for k, i in enumerate(sorted(every)):
        # engines proposing the same text at this position share one button:
        # two buttons reading identically is a choice that is not a choice
        by_text: dict[str, list[str]] = {}
        for label, text in every[i].items():
            by_text.setdefault(text, []).append(label)
        readings = {' + '.join(labels): apply_ops(c.gt, {i: text})
                    for text, labels in by_text.items()}
        if all(_homoglyph_only(c.gt, r) for r in readings.values()):
            SPLIT_HOMOGLYPH += 1
            continue
        cls = min((classify(align(c.gt, r))[0] for r in readings.values()),
                  key=SEVERITY.index)
        out.append(Card(
            f'{c.sid}#{k}', c.column, c.line_id, cls, c.gt, readings,
            lineno=c.lineno, token=c.token, part=k, line_ops=line_ops,
            crop_of=c.sid, where=c.where,
            note=(f'this line disputes {len(every)} things and this card asks '
                  f'about ONE of them (the {k + 1}{"st" if k == 0 else "nd" if k == 1 else "rd" if k == 2 else "th"} '
                  f'of {len(every)}, highlighted). Its siblings are their own '
                  f'cards — rule this one on its own merits.')))
    return out or [c]


def _dispute_index(gt: str, hyp: str) -> int:
    """Where in `gt` the first disagreement falls, for placing a crop."""
    i = 0
    for x, y in align(gt, hyp):
        if x != y:
            return i
        if x is not None:
            i += 1
    return 0


def _context(gt: str, i: int, span: int = 22) -> tuple[str, str, str]:
    """The disputed character with the text either side of it, windowed.

    Exact, unlike the crop: it comes from the corpus string rather than from
    guessing where a character falls on a justified line.
    """
    if not gt:
        return ('', '', '')
    i = min(i, len(gt) - 1)
    before = gt[max(0, i - span):i]
    after = gt[i + 1:i + 1 + span]
    if i - span > 0:
        before = '…' + before
    if i + 1 + span < len(gt):
        after += '…'
    return (before, gt[i], after)


def _ruled_sids() -> set[str]:
    """The cards John has ANSWERED — not merely the cards the store mentions.

    ⚠ AN ENTRY IS NOT A VERDICT. A card he has only ✕-ed a site on has an
    entry with an empty verdict, and so does one REOPENED after a defect in
    how it was drawn. Counting those as ruled would keep them out of the
    bundling and keep their line unsplit, which is to say it would hide the
    question he has not answered yet.

    ⚠ AND A `none` IS NOT AN ANSWER ABOUT THE TEXT. It says the ink reads
    none of the readings offered — it claims nothing about what the line
    should be, which is why `_resolve_orphan` treats a `none` as superseded
    by any later card on the same site. Counting it as ruled froze its line
    UNSPLIT, and 25 of John's 45 `none` verdicts sit on lines disputing two
    to eight things at once: he was rejecting a whole line because no single
    reading was right about all of it. That is the exact failure splitting
    was built to end, and it was being withheld from the very cards that
    motivated it. A `none` line splits like any other.
    """
    if not RULINGS.exists():
        return set()
    have = json.loads(RULINGS.read_text(encoding='utf-8'))
    return {sid for sid, r in have.items()
            if r.get('verdict') and r['verdict'] != 'none'}


def _none_sids() -> set[str]:
    """The cards John answered `none` — the ink reads none of these."""
    if not RULINGS.exists():
        return set()
    have = json.loads(RULINGS.read_text(encoding='utf-8'))
    return {sid for sid, r in have.items() if r.get('verdict') == 'none'}


NONE_NOTE = ('⚠ YOU RULED THIS LINE `none`, and this card is one question out '
             'of it. A `none` says the ink reads none of the readings '
             'offered — it never said what the line SHOULD be, so nothing '
             'was written and nothing was lost. What was wrong was the card: '
             'it asked about {n} disputes at once and no single reading was '
             'right about all of them.')


def _none_cards(cards: list[Card]) -> list[Card]:
    """Only what a `none` verdict owes, with the reason on each card.

    ⚠ THE OLD CARDS CANNOT BE ANSWERED, AND THAT WAS NEVER JOHN'S FAULT.
    Measured over his 45 `none` verdicts: 25 sit on a line disputing two to
    eight things at once. Splitting was built for exactly that and then
    withheld from them, because `_ruled_sids` counted a `none` as an answer
    and a ruled line is never split. Unfrozen, each becomes as many cards as
    it has questions — and this is the queue of just those.
    """
    want = _none_sids()
    out = []
    for c in cards:
        parent = c.sid.partition('#')[0]
        if parent not in want and c.sid not in want:
            continue
        n = len(c.line_ops) or 1
        c.note = (NONE_NOTE.format(n=n) + (' ' + c.note if c.note else ''))
        out.append(c)
    return out


def _siglum_space_only(gt: str, hyp: str) -> bool:
    """True when the whole quarrel is the gap between a siglum and its number.

    ⚠ JOHN RULED THAT GAP A MATTER OF RENDERING ON 2026-08-13, not of the
    record, and `audit_apply._guard_siglum_space` refuses an edit that changes
    it. A card offering the change is asking a question whose answer the apply
    step is built to reject — and one such bundle put 25 of them behind a
    single button, where pressing it would have refused the whole write.
    """
    from bonitz_pipeline.audit_apply import _spaces_between_letter_and_digit
    return gt != hyp and _spaces_between_letter_and_digit(gt, hyp)


def _gap_context(gt: str, i: int) -> str:
    """What a disputed SPACE stands between, in words.

    ⚠ `(∅, ␣)` IS FOUR QUESTIONS, NOT ONE. Grouped by the substitution alone,
    65 sites came under one button — a siglum gap, the gap after a stop before
    the next citation, the gaps either side of an em-dash, and a handful of
    run-together words. John, 2026-08-15, looking at that card: "is this
    bundle asking if a space should go before the highlighted character or if
    there is a space INSTEAD of the highlighted character?" A bundle whose
    members are not one question cannot be answered by one ruling.
    """
    def kind(ch: str) -> str:
        if not ch:
            return 'the end of the line'
        if ch.isdigit():
            return 'a number'
        if ch == '—':
            return 'a dash'
        if ch in '.,;:':
            return f'{ch!r}'
        return 'a letter' if ch.isalpha() else repr(ch)
    return f'{kind(gt[i - 1] if i else "")} and {kind(gt[i:i + 1])}'


def _pattern_cards(cards: list[Card], floor: int = 2,
                   ruled: set[str] | None = None
                   ) -> tuple[dict[str, Card], set[str]]:
    """Class cards for substitutions repeated at least `floor` times.

    ⚠ A CLASS RULING IS ONLY AS SAFE AS ITS ✕. These are not homoglyphs —
    the ink CAN decide them, and it may decide differently site by site, so
    every member carries its own crop and its own exclude. That is exactly
    the sitting where John ruled 192 sites at once and excluded the ones
    where the ink did not fit.

    ⚠ THE FLOOR IS 2, BECAUSE A PAIR IS ALREADY WORTH A CARD. John,
    2026-08-14: the bundles "are REAL time savers". Measured over the queue
    as it then stood, a floor of 8 left 173 cards where a floor of 2 leaves
    111. Grouping by the whole SET of substitutions was measured too and
    abandoned: no multi-pair signature in this corpus repeats even once, so
    it would have bundled nothing at all.

    ⚠ AND A BUNDLE MUST NEVER DISSOLVE A CARD ALREADY RULED. Lowering the
    floor swept 37 ruled lines into fresh groups, which would have asked him
    for them again under a new sid — the 78 dissolved cards of 2026-08-10,
    exactly ([[carry-rulings-by-site]]). A ruled line keeps its own card and
    stays out of the grouping.

    ⚠ AND IT GROUPS CARDS, NOT AUDIT ROWS. It read the training TSV alone
    until 2026-08-14, so the calamari/kraken queue — where the repeated
    perispomeni over the ou-ligature lives, the case John pointed at — never
    bundled at all. A card is a card whichever queue found it.
    """
    ruled = _ruled_sids() if ruled is None else ruled
    groups: dict[tuple[str, str], list[Card]] = {}
    for c in cards:
        if c.sid in ruled or len(c.readings) != 1:
            continue      # two engines reading it two ways is not one question
        sig = _signature(c.gt, next(iter(c.readings.values())))
        if sig:
            groups.setdefault(sig, []).append(c)

    cards, taken = {}, set()
    for (a, b), members in groups.items():
        if len(members) < floor:
            continue
        ms = []
        for c in members:
            taken.add(c.sid)
            gt, hyp = c.gt, next(iter(c.readings.values()))
            frac = (_dispute_index(gt, hyp) / len(gt)) if gt else 0.0
            i = _dispute_index(gt, hyp)
            ms.append(Member(c.sid, c.column, 0, '',
                             c.where or c.column,
                             line_id=c.line_id, frac=frac, part=c.part,
                             context=_context(gt, i)))
        # ⚠ BUNDLING COSTS CONTEXT, AND THE FLOOR OF 2 WOULD HAVE CHARGED IT
        # ON THE CARDS LEAST ABLE TO PAY. A single card shows the whole
        # printed line; a class member shows a window, because 36 full lines
        # are 15 swipes and defeat the point of seeing the class at once. A
        # pair has no such problem, so it gets more than twice the window —
        # and John's rule stands behind this: an unsure click is a defect in
        # the tool, and a crop that cannot make the case is that defect.
        wide = 150 if len(ms) >= 8 else 340
        for m in ms:
            m.half = wide
        # ⚠ A COMBINING MARK IS SHOWN ON A DOTTED CIRCLE, NEVER BARE. Alone it
        # has no base to sit on, so the browser drops it onto whatever
        # precedes — here the button's own punctuation — and the reader sees a
        # floating accent beside a bracket. `◌` is Unicode's own carrier for
        # exactly this.
        name = lambda c: ('nothing' if c == '∅' else
                          'a space' if c == ' ' else
                          f'◌{c} ({unicodedata.name(c, "?")})'
                          if unicodedata.combining(c) else
                          f'{c} ({unicodedata.name(c, "?")})')
        # ⚠ AND WHEN THE SITES ARE NOT ALL THE SAME SHAPE, THE CARD SAYS SO.
        # John, 2026-08-14: "what if there is a circumflex AND breathing
        # mark?" Two of the seventeen `͂`/nothing sites read `ȣ̓͂` — the
        # ligature carries a breathing as well — and the ruling takes only the
        # circumflex off them. That is right, and it is not something the
        # buttons can show, because they name one mark.
        stacks: dict[str, list[str]] = {}
        for m, mc in zip(ms, members):
            gt = mc.gt
            hyp = next(iter(mc.readings.values()))
            for i in ops(gt, hyp):
                rest = ''.join(ch for ch in gt[i:i + 4][1:]
                               if unicodedata.combining(ch) and ch != b
                               and ch != a)
                stacks.setdefault(rest, []).append(m.label)
        extra = {k: v for k, v in stacks.items() if k}
        mixed = ''
        if extra and len(stacks) > 1:
            bits = '; '.join(
                f'{len(v)} also carry '
                + ' + '.join(unicodedata.name(ch, "?").replace("COMBINING ", "")
                             .lower() for ch in k)
                for k, v in extra.items())
            mixed = (f'these {len(ms)} sites are not all the same shape — '
                     f'{bits}. The ruling changes only the mark named on the '
                     f'buttons and leaves the rest of the stack alone; ✕ any '
                     f'site where that is wrong.')
        sid = f'pattern:{a}-{b}'
        cards[sid] = Card(
            sid, ms[0].column, '', members[0].cls, '', {},
            options=[
                ('keep', 'corpus', name(a), '',
                 f'the corpus is right at every site not ✕-ed — '
                 f'{len(ms)} sites stand'),
                ('fix', 'kraken e26', name(b), '',
                 f'kraken is right at every site not ✕-ed — '
                 f'{len(ms)} sites change'),
            ],
            members=ms, sig=(a, b), mixed=mixed,
            note=(f'{len(ms)} lines dispute only this: the corpus has '
                  f'{name(a)} where kraken read {name(b)}. One ruling binds '
                  f'them all — ✕ any crop where the ink says otherwise.'))
    return cards, taken


VOTE_NOTE = ('⚠ the five-model vote refuses this line — AND IT WAS TRAINED '
             'ON IT. Four of the eight lines like this turned out to be sites '
             'you had already corrected by hand, which is why the rest are '
             'worth a look.')
BOTH_NOTE = ('calamari read this line out-of-fold — the one model of five '
             'that never saw it — and kraken e26 disagrees with the corpus '
             'here too. Neither engine has seen the other\'s reading.')


def _key(text: str) -> str:
    """A line's identity for matching, with the printed Bekker gap ignored —
    a card's ground truth spells `1411b34` where the corpus prints
    `1411 b34`."""
    from bonitz_pipeline.kraken_corpus import BEKKER_SPACE
    return BEKKER_SPACE.sub('', text)


def _spelt(text: str) -> str:
    """Text in the corpus's own spelling of the marks it has settled — the
    elision apostrophe, and a breathing printed before its capital.

    ⚠ EVERY SWEEP OVER `work/reconciled` MOVES THE CORPUS AWAY FROM THE OCR
    TARGETS a card's ground truth is built from, and a card whose text is not
    in the corpus is a card `audit_apply.locate` cannot place.
    """
    from bonitz_pipeline import capital_breathing
    return capital_breathing.normalize(elision.fold(text))


def line_cards() -> dict[str, Card]:
    """Every per-line card of the three queues, split into parts — the index
    the queue is built from AND the one `audit_apply` resolves a ruling
    against, so a part sid means the same thing to both.

    One card per line even when two sources mention it (the holdout appears
    in both calamari files).
    """
    by_sid: dict[str, Card] = {}
    global HOMOGLYPH_SKIPPED, SPLIT_HOMOGLYPH, ELISION_FOLDED
    global SIGLUM_SPACE_SKIPPED
    HOMOGLYPH_SKIPPED = SPLIT_HOMOGLYPH = ELISION_FOLDED = 0
    SIGLUM_SPACE_SKIPPED = 0

    train_rows = [r for r in _tsv(TRAIN_TSV)
                  if not _homoglyph_only(r['gt'], r['model'])]
    HOMOGLYPH_SKIPPED = len(_tsv(TRAIN_TSV)) - len(train_rows)

    for r in train_rows:
        sid = f'{r["column"]}:{r["line_id"]}'
        # ⚠ NO "the polygon looks short" WARNING HERE, DELIBERATELY. It was
        # written and measured: it fires on 56 cards, and most are lines that
        # simply END — an index is full of short last lines — while telling
        # truncation from a short line needs an ink test the scan's
        # bleed-through defeats. The full-width crop makes the warning
        # unnecessary: John can see the whole printed line and judge it.
        by_sid[sid] = Card(sid, r['column'], r['line_id'], r['class'],
                           r['gt'], {'kraken e26': r['model']},
                           where=f'{r["column"]} line {r["line_idx"]}')

    for r in _tsv(AGREE_WRONG):
        col, lid = r['site'].split(':', 1)
        cls, _, _ = classify(align(r['ground_truth'], r['both_engines']))
        by_sid[r['site']] = Card(r['site'], col, lid, cls,
                                 r['ground_truth'],
                                 {'kraken + calamari': r['both_engines']},
                                 where=f'{col} · {lid[:9]}…')

    for r in _tsv(VS_KRAKEN):
        if r['right'] != '—':
            continue          # one engine matched the corpus: not an audit case
        col, lid = r['site'].split(':', 1)
        worst = min((classify(align(r['ground_truth'], r[k]))[0]
                     for k in ('this_engine', 'kraken')), key=SEVERITY.index)
        by_sid[r['site']] = Card(r['site'], col, lid, worst,
                                 r['ground_truth'],
                                 {'calamari': r['this_engine'],
                                  'kraken e26': r['kraken']},
                                 where=f'{col} · {lid[:9]}…')

    # --- calamari's out-of-fold read of the training set --------------------
    # ⚠ THE SECOND ENGINE OVER THE 88% NOTHING HAD DOUBLE-READ. Calamari had
    # seen 722 of 5,832 lines. Its five folds are a proper cross-validation,
    # so every training line has exactly one model that never saw it, and
    # that model's reading is an honest second opinion (`oof_ingest`).
    for r in _tsv(OOF_TSV, optional=True):
        col, lid = r['site'].split(':', 1)
        readings = {k: v for k, v in
                    (('kraken e26', r['kraken']),
                     ('calamari (out-of-fold)', r['oof']),
                     ('calamari (5-model vote)', r['vote'])) if v}
        if not readings:
            continue
        note = (VOTE_NOTE if r['tier'] == 'vote' else BOTH_NOTE)
        have = by_sid.get(r['site'])
        if have is not None:
            # kraken already raised this line; calamari joins its card rather
            # than opening a second one about the same ink
            have.readings.update(readings)
            have.note = note
            continue
        cls = min((classify(align(r['ground_truth'], h))[0]
                   for h in readings.values()), key=SEVERITY.index)
        by_sid[r['site']] = Card(r['site'], col, lid, cls, r['ground_truth'],
                                 readings, where=f'{col} · {lid[:9]}…',
                                 note=note)

    # ⚠ THE ELISION MARK IS NOT A READING, so no card may dispute it. Every
    # source is folded to one codepoint here — BEFORE the split, or an
    # apostrophe against a koronis becomes a part card of its own and then a
    # bundle, which is how four bundles came to ask John the same question
    # four ways (`bonitz_pipeline.elision`). A reading whose whole quarrel was
    # the codepoint stops being a reading; a card left with none is dropped,
    # and the count is printed.
    #
    # ⚠ AND THE HOMOGLYPH FILTER RUNS OVER EVERY SOURCE HERE, NOT JUST
    # KRAKEN'S. It was applied to `TRAIN_TSV` alone, so when calamari's
    # out-of-fold read joined the queue it brought its homoglyphs with it —
    # John, 2026-08-15, on page-045-R:31: "no clue on this one", looking at a
    # Greek Κ against a Latin K. The ink cannot answer that, which is his
    # rule 3, and the glyph-pair cards decide the class anyway.
    # ⚠ AND NONE OF IT TOUCHES A CARD HE HAS ALREADY RULED. A filter added
    # while John is working would otherwise dissolve the very cards he has
    # just answered, and his rulings would come back from the apply step as
    # "no card and no per-line card" — fifteen of them did, in the minute
    # between adding the siglum-space filter and running it
    # ([[carry-rulings-by-site]]). A ruled card keeps its card.
    ruled = _ruled_sids()
    answered = {s.partition('#')[0] for s in ruled}
    for sid, c in list(by_sid.items()):
        c.gt = _spelt(c.gt)
        live = {k: _spelt(v) for k, v in c.readings.items()}
        if sid in answered:
            c.readings = live
            continue
        c.readings = {k: v for k, v in live.items()
                      if v != c.gt and not _homoglyph_only(c.gt, v)
                      and not _siglum_space_only(c.gt, v)}
        if c.readings:
            continue
        if any(_homoglyph_only(c.gt, v) for v in live.values()):
            HOMOGLYPH_SKIPPED += 1
        elif any(_siglum_space_only(c.gt, v) for v in live.values()):
            SIGLUM_SPACE_SKIPPED += 1
        else:
            ELISION_FOLDED += 1
        del by_sid[sid]

    # ⚠ A LINE ALREADY RULED WHOLE IS NEVER SPLIT. His answer covered every
    # dispute on it; re-asking them one at a time under new sids is
    # [[carry-rulings-by-site]] with extra steps.
    out: dict[str, Card] = {}
    for sid, c in by_sid.items():
        for part in ([c] if sid in ruled else split_card(c)):
            out[part.sid] = part
    return out


def load_cards() -> list[Card]:
    """The queue John sees: per-line cards, bundled where they repeat, plus
    the corpus sweeps."""
    by_sid = line_cards()
    pattern, bundled = _pattern_cards(list(by_sid.values()))
    by_sid = {sid: c for sid, c in by_sid.items() if sid not in bundled}
    by_sid.update(pattern)

    for c in _sweep_cards():
        by_sid[c.sid] = c

    # Cards written by hand, for a reading no engine proposed — the follow-up
    # a `none` verdict owes. Imported here because `hand_cards` builds its
    # cards out of this module.
    from bonitz_pipeline.hand_cards import cards as hand_cards
    global HAND_SUPERSEDED
    HAND_SUPERSEDED = 0
    hand = hand_cards()
    for c in hand:
        if c.sid in by_sid:
            raise SystemExit(f'the hand card {c.sid} has the key of a card '
                             f'the queue already built — one of them would '
                             f'replace the other, and a ruling on either '
                             f'would answer whichever survived')
        by_sid[c.sid] = c
    # ⚠ A HAND CARD SUPERSEDES THE MACHINE CARDS ON ITS LINE. It exists
    # BECAUSE they could not put the question — John, 2026-08-15, on a split
    # part of page-056-R:44: "already ruled on this one in a separate card."
    # Leaving them is asking him the same line twice, and the parts can only
    # ever offer half the answer.
    # ⚠ AND ONCE THE HAND CARD IS APPLIED THE TEXT MATCH STOPS WORKING, so
    # the real test is whether the card's line is still IN the corpus at all.
    # A hand card rewrites its line; the machine cards on it keep the OCR
    # ground truth, which then names a line that no longer exists. They came
    # straight back the moment the fix was written — the same three sites John
    # had already answered.
    from bonitz_pipeline.hand_cards import COVERS
    own = {h.sid for h in hand}
    for sid, c in list(by_sid.items()):
        if c.sid in own or c.lineno is not None:
            continue
        if (c.column, _key(c.gt)) in COVERS:
            HAND_SUPERSEDED += 1
            del by_sid[sid]

    for c in by_sid.values():
        c.section = _section_for(c)
    order = {name: i for i, (name, _) in enumerate(SECTIONS)}
    cards = sorted(by_sid.values(),
                   key=lambda c: (order.get(c.section, 99),
                                  TIERS.index(c.cls), c.column,
                                  c.lineno or 0))
    return cards


def _section_for(c: Card) -> str:
    """A card's section, from whatever it actually disputes."""
    if c.cls == 'encoding':
        return 'Latin ↔ Greek'          # a glyph pair is cross-script by kind
    if c.cls == 'siglum':
        return 'Latin ↔ Greek'
    if c.cls == 'division':
        return 'spacing'
    if c.sig is not None:
        return section_of([c.sig])
    if c.readings:
        hyp = next(iter(c.readings.values()))
        return section_of([(x or '∅', y or '∅')
                           for x, y in align(c.gt, hyp) if x != y])
    return 'mixed'


def _sites_of(token: str) -> list[tuple[str, int]]:
    """Every (column, printed line) where the corpus holds this exact
    spelling. Re-derived rather than read from the sweep, which records
    sites for minority spellings only — and a glyph-pair card must show
    the majority's sites too, since a ruling can go either way."""
    # ⚠ WHOLE TOKENS, NEVER A SUBSTRING, AND THE SWEEP'S IDEA OF A TOKEN.
    # `οβ` is the Oeconomica siglum and also two letters inside φόβος: a
    # substring scan bound 65 ordinary Greek words into the o/ο ruling. But
    # splitting on whitespace is wrong the other way — Bonitz writes `Ρα9.`
    # and `οβ1351`, so the siglum is a LETTER RUN inside a longer token, and
    # a whitespace split found almost none of them. Both mistakes were made
    # here in turn; the counts must reconcile with encoding_check's.
    hits = []
    for f in sorted(RECONCILED.glob('page-*.txt')):
        for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(),
                                 1):
            for m in LETTER_RUN.finditer(line):
                if m.group() == token:
                    hits.append((f.stem, i))
    return hits


def _pair_cards(rows: list[dict]) -> dict[str, Card]:
    """One card per DISPUTED GLYPH PAIR — `Z` against `Ζ` — not per token.

    John, 2026-08-13: bundle every call on one pair into a single card with
    a scrollable strip of crops and an ✕ to drop a site from the ruling.
    That is the ligature-sitting format, where the excludes are what made a
    group ruling safe.

    ⚠ A GLYPH PAIR CAN SPAN TWO ROLES, AND THEN ONE RULING IS WRONG FOR
    HALF OF IT. Bonitz writes the editor Aubert-Wimmer with a LATIN A and
    the Analytics siglum with a GREEK Α, and both are right — so an A/Α
    card holds two questions. The card says so (`mixed`) and the ✕ is how
    the wrong half comes out. Z/Ζ has one role and is clean.
    """
    pairs: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        if r['tier'] != 'split':
            continue      # the weak tier is genuine ambiguity, not a queue
        pairs.setdefault(_pair_of(r['shape'], rows), []).append(r)

    cards: dict[str, Card] = {}
    for pair, group in pairs.items():
        if pair == ('', ''):
            continue
        by_spelling: dict[str, dict] = {}
        for r in group:
            by_spelling[r['spelling']] = r
        members, shapes = [], set()
        for spelling, r in sorted(by_spelling.items(),
                                  key=lambda kv: -int(kv[1]['count'])):
            shapes.add(r['shape'])
            script = ('Greek' if 'GREEK' in _glyph_name(spelling, pair)
                      else 'Latin')
            for col, ln in _sites_of(spelling):
                members.append(Member(f'{col}:L{ln}:{spelling}', col, ln,
                                      spelling, f'{spelling} ({script})'))
        if not members:
            continue
        lat, grk = pair
        options = []
        for ch, name in ((grk, 'Greek'), (lat, 'Latin')):
            n = sum(1 for m in members if ch not in m.token)
            options.append(('fix', f'{name} {ch}', ch,
                            unicodedata.name(ch, ''),
                            f'every site not excluded reads {name} {ch} — '
                            f'{n} of {len(members)} change'))
        options.append(('keep', 'both stand', 'leave both spellings', '',
                        'the split is not an error — nothing changes'))
        sigla = sorted({r['sigla'] for r in group if r['sigla']})
        counts = ', '.join(f'{s} ×{r["count"]}'
                           for s, r in sorted(by_spelling.items(),
                                              key=lambda kv: -int(kv[1]['count'])))
        mixed = ''
        if len(shapes) > 1:
            mixed = (f'these {len(members)} sites are not one word — '
                     f'{", ".join(sorted(shapes))}. One ruling may not fit '
                     f'them all: ✕ the crops it does not fit.')
        sid = f'encoding:{lat}-{grk}'
        cards[sid] = Card(
            sid, members[0].column, '', 'encoding', f'{lat} / {grk}', {},
            lineno=members[0].lineno, token=members[0].token,
            options=options, members=members, mixed=mixed,
            note=(f'the corpus writes this glyph both ways: {counts}. '
                  + (' · '.join(sigla) + '. ' if sigla else '')
                  + '⚠ the count does NOT decide it — for the Aubert-Wimmer '
                    'sigla the rarer spelling is the right one.'))
    return cards


def _glyph_name(spelling: str, pair: tuple[str, str]) -> str:
    for ch in spelling:
        if ch in pair:
            return unicodedata.name(ch, '')
    return ''


def _pair_of(shape: str, rows: list[dict]) -> tuple[str, str]:
    """(the Latin glyph, the Greek glyph) this shape's spellings disagree on."""
    spellings = [r['spelling'] for r in rows if r['shape'] == shape]
    if len(spellings) < 2:
        return ('', '')
    a, b = spellings[0], spellings[1]
    if len(a) != len(b):
        return ('', '')
    for x, y in zip(a, b):
        if x == y:
            continue
        lat = x if 'LATIN' in unicodedata.name(x, '') else y
        grk = y if lat is x else x
        return (lat, grk)
    return ('', '')


def _reconciled_line(col: str, lineno: int) -> str:
    f = RECONCILED / f'{col}.txt'
    if not f.exists():
        raise SystemExit(f'{f} is missing — a sweep names a column this '
                         f'corpus does not have')
    lines = f.read_text(encoding='utf-8').splitlines()
    if not 1 <= lineno <= len(lines):
        raise SystemExit(f'{col}: no printed line {lineno} '
                         f'({len(lines)} lines)')
    return lines[lineno - 1]


def _letters(text: str) -> str:
    """Letters alone — no spaces, no marks. What is left when a division
    finding has been mended by moving a space AND adding an accent."""
    return ''.join(c for c in unicodedata.normalize('NFD', text)
                   if not unicodedata.combining(c) and not c.isspace())


def _sweep_cards() -> list[Card]:
    """The two corpus sweeps, as cards.

    Both address a site by printed line and token, and both propose a rewrite
    of that line. The proposal is built by substitution into the line the
    corpus actually holds, so what John compares is two whole lines — never
    the check's summary of them.
    """
    out: dict[str, Card] = {}
    SWEEP_DONE.clear()

    for r in _tsv(SIGLUM_TSV, optional=True):
        col, lineno, token = r['column'], int(r['line']), r['token']
        line = _reconciled_line(col, lineno)
        n = line.count(token)
        out[f'{col}:L{lineno}:{token}'] = Card(
            f'{col}:L{lineno}:{token}', col, '', 'siglum', line,
            {'Greek siglum': line.replace(token, r['proposal'])},
            lineno=lineno, token=token,
            note=(f'{r["token"]!r} leads with a LATIN capital; folded to '
                  f'{r["proposal"]!r} it is work {r["work"]}, whose range '
                  f'holds the Bekker page {r["page"]} beside it'
                  + (f' — {n} occurrences on this line, all proposed'
                     if n > 1 else '')))

    # --- encoding splits, ruled as a CLASS ---------------------------------
    # ⚠ ONE CARD PER SHAPE, NOT PER SITE. The two spellings are the same ink
    # by definition — that is what a homoglyph is — so showing John 23 crops
    # of `AZι` asks him the same question 23 times. His format rule: one card
    # per form-set, one ruling covering every member, and the card says how
    # many. There is deliberately no `keep` button: both spellings are
    # already in the corpus, so there is no status quo to keep.
    out.update(_pair_cards(_tsv(ENCODING_TSV, optional=True)))

    for r in _tsv(DIVISION_TSV, optional=True):
        col, _, lineno = r['source'].partition(':')
        lineno = int(lineno)
        line = _reconciled_line(col, lineno)
        printed, proposed = r['printed'], r['proposed']
        if printed not in line:
            # ⚠ A FINDING THE CORPUS HAS MOVED PAST IS DONE, NOT A DRIFT. John
            # answered this very site by hand — `κληρȣ͂ ντȣς` became
            # `κληρȣ͂ν τȣ̀ς` — and the refusal below took the whole queue down
            # with it, every other card included. Only a finding whose site
            # reads NEITHER what the sweep saw nor what it proposed is a real
            # drift.
            if proposed in line or _letters(printed) in _letters(line):
                SWEEP_DONE.append(f'{col}:{lineno} {printed!r}')
                continue
            raise SystemExit(
                f'{col}:{lineno}: division-check names {printed!r}, which is '
                f'not on that line, and neither is what it proposed — the '
                f'sweep and the corpus have drifted; rerun the sweep')
        sid = f'{col}:L{lineno}:{r["tier"]}'
        readings = {'re-divided': line.replace(printed, proposed, 1)}
        # ⚠ AN IMPOSSIBLE ONSET SAYS THE DIVISION IS WRONG, NOT WHERE IT
        # BELONGS. `κληρȣ͂ ντȣς` can be mended by joining the pair or by
        # moving the space one place right, and the sweep can only propose
        # one — it proposed the join, and the ink read `κληρȣ͂ν τȣ̀ς`. A card
        # that omits the reading the ink actually has forces a NONE, which
        # John's rules call a defect in the tool. Both go on the card.
        if r['tier'] == 'onset' and ' ' in printed:
            left, _, right = printed.partition(' ')
            if len(right) > 1:
                moved = f'{left}{right[0]} {right[1:]}'
                readings['space moved right'] = line.replace(printed, moved, 1)
        out[sid] = Card(
            sid, col, '', 'division', line, readings,
            lineno=lineno, token=printed.split()[0],
            note=f'{r["tier"]}: {r["evidence"]}')

    return list(out.values())


# --- crops --------------------------------------------------------------------

@lru_cache(maxsize=4)
def _column_image(col: str) -> Image.Image:
    return Image.open(WORK / 'cols' / f'{col}.png')


@lru_cache(maxsize=8)
def _bboxes(col: str) -> dict[str, tuple[int, int, int, int]]:
    tree = ET.parse(WORK / 'gt' / f'{col}.xml')
    out = {}
    for el in tree.getroot().iter(f'{{{PAGE_NS}}}TextLine'):
        pts = el.find(f'{{{PAGE_NS}}}Coords').get('points').split()
        xs = [int(p.split(',')[0]) for p in pts]
        ys = [int(p.split(',')[1]) for p in pts]
        out[el.get('id')] = (min(xs), min(ys), max(xs), max(ys))
    return out


def line_bbox(col: str, line_id: str) -> tuple[int, int, int, int]:
    try:
        return _bboxes(col)[line_id]
    except KeyError:
        raise SystemExit(f'{col}: no line {line_id} in its gt XML')


def cut_crop(card: Card, scale: float = 2.0, pad: int = 10) -> None:
    """The whole line at 2×. A zoom window placed by guessing where a
    character falls on a justified line misled once already (the offset
    lesson of 2026-08-10) — the full strip cannot point at the wrong word."""
    dst = CROPS / card.crop_name
    if getattr(card, 'line_id', '') and getattr(card, 'frac', -1) >= 0:
        # A per-line class member: crop the polygon's band, then a WINDOW
        # placed where the dispute falls. The whole line at strip height is
        # nine hundred pixels wide and one crop fills the row, which defeats
        # the point of showing the class at a glance.
        if dst.exists():
            return
        x0, y0, x1, y1 = line_bbox(card.column, card.line_id)
        im = _column_image(card.column)
        cx = x0 + card.frac * (x1 - x0)
        half = getattr(card, 'half', 150)
        pad_y = int((y1 - y0) * 0.35)
        box = (max(0, int(cx - half)), max(0, y0 - pad_y),
               min(im.width, int(cx + half)), min(im.height, y1 + pad_y))
        strip = im.crop(box)
        strip = strip.resize((int(strip.width * scale),
                              int(strip.height * scale)), Image.LANCZOS)
        CROPS.mkdir(parents=True, exist_ok=True)
        strip.save(dst)
        return
    if card.lineno is not None:
        # A sweep finding: the line is found by TEXT, since printed line
        # numbers and kraken's segmented line ids do not correspond.
        # `how` comes back from crop_word and is shown on the card when it is
        # not a text match — a crop placed by geometry is exactly the case
        # John called a defect in the tool rather than an unsure ruling.
        from bonitz_pipeline.mark_review import crop_word
        # scale 2, matching the strips cut from the kraken polygons: crop_word
        # defaults to 3, which makes a line 3,700px wide and shows two words
        # at a time in the card's scroll window.
        # A class member gets a WINDOW on its token, not the whole line: at
        # 5.5rem tall a full line is a thousand pixels wide and one crop
        # fills the strip, which is no strip at all. A single card's own
        # crop stays whole, where position matters more than density.
        window = isinstance(card, Member)
        im, _score, how = crop_word(card.column, card.lineno,
                                    card.token or '', scale=scale,
                                    whole=not window,
                                    spread=14 if window else 7)
        card.crop_how = how
        if im is None:
            raise SystemExit(f'{card.column}:{card.lineno}: no ink for this '
                             f'site — the column image is missing')
        if not dst.exists():
            CROPS.mkdir(parents=True, exist_ok=True)
            im.save(dst)
        return
    if dst.exists():
        return
    x0, y0, x1, y1 = line_bbox(card.column, card.line_id)
    im = _column_image(card.column)
    # ⚠ FULL COLUMN WIDTH, NOT THE POLYGON'S. The crop and kraken's reading
    # come from the SAME polygon, so a segmentation that stopped short hides
    # the very character the card is asking about — John, 2026-08-13, on
    # page-038-L:40, where the corpus had a trailing `ἡ`, kraken did not, and
    # the crop could not settle it because the polygon ended 47px early. A
    # crop that cannot contradict its own source is not evidence.
    box = (0, max(0, y0 - pad), im.width, min(im.height, y1 + pad))
    strip = im.crop(box)
    strip = strip.resize((int(strip.width * scale), int(strip.height * scale)),
                         Image.LANCZOS)
    CROPS.mkdir(parents=True, exist_ok=True)
    strip.save(dst)


def zoom_png(col: str, line_id: str = '', lineno: int = 0,
             frac: float = -1.0, scale: int = 3, rows: float = 1.15) -> bytes:
    """The whole printed line with the lines ABOVE and BELOW it.

    ⚠ A WINDOW CANNOT SETTLE WHAT A WINDOW RAISED. John asked three times in
    one sitting to see more — "crop is off", "can you look more closely",
    "need more context below" — and each time the answer was a hand-cut crop
    from a shell. A strip tight enough to read 36 sites at a glance is by
    construction too tight to judge a doubtful one, so the tight strip stays
    and this is one click away from it. Neighbouring lines are IN FRAME
    deliberately: half the doubtful marks on this page turn out to be a
    descender or a bleed from the line above, and that cannot be ruled out
    from a band that shows only the line itself.
    """
    import io
    im = _column_image(col)
    if line_id:
        x0, y0, x1, y1 = line_bbox(col, line_id)
    else:
        # ⚠ A SITE ADDRESSED BY PRINTED LINE HAS NO POLYGON, so both the band
        # and the width are estimates: the column image is the text block, and
        # its lines are justified to its full width. Without this the zoom on
        # every sweep card raised UnboundLocalError — the link had never been
        # clickable, because `_card_frac` gives one of these a frac too.
        band = im.height / max(1, _printed_lines(col))
        y0, y1 = int((lineno - 1) * band), int(lineno * band)
        x0, x1 = 0, im.width
    if frac >= 0:
        # ⚠ AND ROOM BELOW THE BASELINE, NOT JUST BESIDE THE LETTER. John,
        # 2026-08-14: "still need a wider crop to determine if there is an
        # iota subscript". A subscript hangs UNDER its vowel, so a band cut to
        # the polygon clips the very thing in question — the polygon is drawn
        # round the letters. Nine times life size, a little sky above and
        # nearly a full line of floor below.
        cx = x0 + frac * (x1 - x0)
        box = (max(0, int(cx - 210)), max(0, y0 - int((y1 - y0) * 0.45)),
               min(im.width, int(cx + 210)),
               min(im.height, y1 + int((y1 - y0) * 0.85)))
        scale = 9
    else:
        pad = int((y1 - y0) * rows)
        box = (0, max(0, y0 - pad), im.width, min(im.height, y1 + pad))
    s = im.crop(box)
    s = s.resize((s.width * scale, s.height * scale), Image.LANCZOS)
    buf = io.BytesIO()
    ImageOps.autocontrast(s.convert('L'), cutoff=1).save(buf, 'PNG')
    return buf.getvalue()


@lru_cache(maxsize=8)
def _printed_lines(col: str) -> int:
    f = RECONCILED / f'{col}.txt'
    return len(f.read_text(encoding='utf-8').splitlines()) if f.exists() else 1


# --- page ---------------------------------------------------------------------

def _shown(c: str) -> str:
    """A disputed character as the button shows it — a disputed SPACE
    renders as ␣, because a highlighted space is a sliver nobody can see
    (John, 2026-08-13, on a card whose whole question was two spaces)."""
    return '␣' if c == ' ' else html_mod.escape(c)


def _clusters(text: str) -> list[tuple[int, str]]:
    """(start index, base + its combining marks) for each cluster."""
    out: list[tuple[int, str]] = []
    for i, ch in enumerate(text):
        if out and unicodedata.combining(ch):
            out[-1] = (out[-1][0], out[-1][1] + ch)
        else:
            out.append((i, ch))
    return out


def _wrap(text: str, disputed: set[int]) -> str:
    """`text` with the disputed characters marked BY CLUSTER.

    ⚠ NEVER A COMBINING MARK ON ITS OWN. John, 2026-08-14: "i may have hit
    none on some cards because it looked like it was adding a space but it's
    just an accent on the letter". Wrapping a codepoint at a time put a
    disputed perispomeni in its own inline box, away from the `ȣ` it sits on —
    the browser cannot compose a mark across an element boundary, so it drew
    detached, and `mark`'s own padding opened a highlighted gap beside it. It
    read as an inserted SPACE. That is the largest card class in the queue,
    and the misreading pushes the answer toward `none`, which his rules call a
    defect in the tool rather than an unsure ruling.

    So the base travels with its marks: the highlight covers the whole glyph,
    and the glyph composes.
    """
    out = []
    for start, chunk in _clusters(text):
        hot = any(i in disputed for i in range(start, start + len(chunk)))
        # ⚠ `␣` ONLY INSIDE A HIGHLIGHT. It is there so a disputed space can
        # be seen at all; spelling every ordinary space that way turns the
        # line into a ladder nobody can read.
        out.append(f'<mark>{"".join(_shown(c) for c in chunk)}</mark>'
                   if hot else html_mod.escape(chunk))
    return ''.join(out)


def _sided(gt: str, hyp: str, side: str) -> tuple[str, set[int]]:
    """(this side's text, the indices in it that are disputed).

    ⚠ AN INSERTION IS SHOWN ON THE SIDE THAT LACKS IT TOO, by marking the
    character it would land beside. A mark the corpus does not have has
    nothing of its own to highlight there, and a `corpus` button with no
    highlight at all says the corpus is not in question — when the whole card
    is about a gap in it.
    """
    text: list[str] = []
    disputed: set[int] = set()
    other = ''                      # what the far side has and this side lacks
    for x, y in align(gt, hyp):
        c, o = ((x, y) if side == 'gt' else (y, x))
        if c is None:
            other += o or ''
            continue
        if other:
            # ⚠ A MISSING MARK IS SHOWN ON ITS BASE, NOT ON WHAT FOLLOWS. The
            # perispomeni the corpus lacks belongs to the `ȣ` BEFORE the gap,
            # and marking the space after it says the space is in question —
            # which is the misreading this whole fix is about.
            if text and all(unicodedata.combining(ch) for ch in other):
                disputed.add(len(text) - 1)
            else:
                disputed.add(len(text))
            other = ''
        if x != y:
            disputed.add(len(text))
        text.append(c)
    if other and text:
        disputed.add(len(text) - 1)
    return ''.join(text), disputed


def _mark_diffs(gt: str, hyp: str, side: str) -> str:
    """The reading with its differing characters wrapped in <mark>."""
    return _wrap(*_sided(gt, hyp, side))


def _keep_marks(gt: str, readings: list[str]) -> str:
    """The corpus text with every character ANY reading disputes marked."""
    disputed: set[int] = set()
    for hyp in readings:
        disputed |= _sided(gt, hyp, 'gt')[1]
    return _wrap(gt, disputed)


def _names(gt: str, hyp: str, side: str) -> str:
    """Codepoint names for THIS side's disputed characters — the part of a
    dispute a font cannot be trusted to show. Named per button, because
    `Β` and `B` print identically and John rules on the codepoint (his
    question of 2026-08-13: 'is corpus a beta or latin?')."""
    seen, bits = set(), []
    for x, y in align(gt, hyp):
        if x == y:
            continue
        c = x if side == 'gt' else y
        if c in seen:
            continue
        seen.add(c)
        if c is None:
            bits.append('(absent here)')
        else:
            bits.append('SPACE' if c == ' ' else
                        unicodedata.name(c, f'U+{ord(c):04X}'))
    if len(bits) > 4:
        bits = bits[:4] + ['…']
    return ' · '.join(bits)


def _card_frac(c: Card) -> float:
    """Where along the line this card's own dispute falls."""
    if not c.gt or not c.readings:
        return -1.0
    return _dispute_index(c.gt, next(iter(c.readings.values()))) / len(c.gt)


def _zoom_href(x, frac: float = -1.0) -> str:
    from urllib.parse import urlencode
    q = {'col': x.column}
    if getattr(x, 'line_id', ''):
        q['line_id'] = x.line_id
    elif getattr(x, 'lineno', None):
        q['lineno'] = x.lineno
    f = getattr(x, 'frac', frac)
    if f is not None and f >= 0:
        q['frac'] = f'{f:.4f}'
    return '/zoom?' + urlencode(q)


def build_page(cards: list[Card]) -> None:
    rows = []
    seen_section = None
    blurb = dict(SECTIONS)
    for c in cards:
        if c.section != seen_section:
            seen_section = c.section
            n = sum(1 for x in cards if x.section == c.section)
            # ⚠ COLLAPSIBLE, AND OPEN BY DEFAULT. A section that hid itself
            # would let a whole kind of question go unnoticed — the queue must
            # never show less than it holds without saying so.
            rows.append(
                f'<h2 class="sect" data-sect="{html_mod.escape(c.section)}">'
                f'<span class="caret">▾</span> {html_mod.escape(c.section)}'
                f' <span class="n">{n}</span>'
                f'<span class="blurb">{html_mod.escape(blurb.get(c.section, ""))}'
                f'</span></h2>')
        if c.options:
            options = list(c.options)
        else:
            options = [('keep', 'corpus', c.gt, None,
                        'the ink prints what the corpus has — no change')]
            for engine, reading in c.readings.items():
                options.append(('fix', engine, reading, None,
                                f'the ink prints this — corpus edit at this '
                                f'line ({engine})'))
        buttons = []
        for i, (verdict, label, text, fixed, consequence) in \
                enumerate(options, 1):
            if fixed is not None:
                shown, names = html_mod.escape(text), fixed
            elif verdict == 'keep':
                # highlight where the corpus differs from ANY engine reading,
                # so the corpus button points at every disputed character —
                # on a two-engine card, marking only the first engine's
                # dispute sends the eye past the other one
                shown = _keep_marks(c.gt, list(c.readings.values()))
                seen, bits = set(), []
                for r in c.readings.values():
                    for b in _names(c.gt, r, 'gt').split(' · '):
                        if b and b not in seen:
                            seen.add(b)
                            bits.append(b)
                names = ' · '.join(bits)
            else:
                shown = _mark_diffs(c.gt, c.readings[label], 'hyp')
                names = _names(c.gt, c.readings[label], 'hyp')
            # ⚠ THE ATTRIBUTE IS QUOTED. Unquoted, the HTML parser cuts the
            # value at the first space, JSON.parse throws before the fetch,
            # and every keep/fix button on a real line does nothing — found
            # by Grok's review with 1352 of 1353 buttons broken.
            detail = html_mod.escape(json.dumps(text, ensure_ascii=False))
            cp = (f'<span class="cp">{html_mod.escape(names)}</span>'
                  if names else '')
            letter = 'ABC'[i - 1] if i <= 3 and c.members else ''
            buttons.append(
                f'<button class="opt" data-v="{verdict}" data-d="{detail}">'
                f'<span class="key">{i}</span>'
                f'<span class="who">{(letter + " · ") if letter else ""}'
                f'{label}</span>'
                f'<span class="form">{shown}</span>{cp}'
                f'<span class="why">{html_mod.escape(consequence)}</span>'
                f'</button>')
        n = len(options) + 1
        buttons.append(
            f'<button class="opt none" data-v="none" data-d="&quot;&quot;">'
            f'<span class="key">{n}</span><span class="who">none</span>'
            f'<span class="form">the ink reads none of these</span>'
            f'<span class="why">follow-up card; nothing written</span>'
            f'</button>')
        where = (f'line {c.lineno}' if c.lineno is not None
                 else f'{c.line_id[:9]}…')
        if c.part is not None:
            where += f' · part {c.part + 1}'
        if c.cls == 'encoding':
            where = (f'{html_mod.escape(c.gt)} <span class="fold">(a fold, '
                     f'not a spelling)</span> · {where}')
        note = (f'<div class="note">{html_mod.escape(c.note)}</div>'
                if c.note else '')
        # ⚠ THE INK CANNOT SETTLE A HOMOGLYPH, so the card must not ask.
        # John, 2026-08-13: "i can't tell by looking at the ink between A and
        # Α or between Z and Ζ". Proved on page-018-L:21, which prints a
        # Greek Β and a Latin B in one line — the same sort both times, no
        # visible difference. The crop stays because it shows the CITATION
        # (whose volume and page identify the work), and that is what decides
        # it; it is labelled so nobody spends time on the letterform.
        if c.cls == 'encoding':
            note += ('<div class="cannot">⚠ the ink cannot answer this — '
                     'these are one sort in the fount, and the scan shows no '
                     'difference. The crop is here for the CITATION around '
                     'it; the decision is Bonitz\'s key plus what the rest '
                     'of the corpus does.</div>')
        warn = ('' if c.crop_how == 'text' else
                f'<div class="warn">⚠ this crop was placed by '
                f'{html_mod.escape(c.crop_how)}, not by matching the line\'s '
                f'text — check the strip really is line {c.lineno}</div>')
        if c.members:
            figs = []
            for m in c.members:
                weak = '' if m.crop_how == 'text' else ' weak'
                b, at, a = m.context
                ctx = (f'<div class="ctx">{html_mod.escape(b)}'
                       f'<mark>{_shown(at)}</mark>'
                       f'{html_mod.escape(a)}</div>') if at else ''
                picks = ''.join(
                    f'<button class="pick" data-m="{L}">{L}</button>'
                    for L in 'ABC'[:max(0, len(options) - 1)])
                figs.append(
                    f'<figure class="site{weak}" data-site="{m.sid}">'
                    f'<a class="zoom" target="_blank" href="{_zoom_href(m)}">'
                    f'<img loading="lazy" src="/crops/{m.crop_name}">'
                    f'<span class="mag">⤢</span></a>'
                    f'{ctx}'
                    f'<figcaption>{html_mod.escape(m.label)}'
                    + ('' if m.line_id else f' · {m.column} line {m.lineno}')
                    + f'</figcaption><div class="picks">{picks}'
                      f'<button class="pick x" data-m="X">✕</button></div>'
                      f'</figure>')
            mixed = (f'<div class="mixedwarn">⚠ {html_mod.escape(c.mixed)}'
                     f'</div>' if c.mixed else '')
            ink = (f'{mixed}<div class="sites">{"".join(figs)}</div>'
                   f'<div class="reclbl">the marked character is the one in '
                   f'question at each site. A button below the card answers '
                   f'ALL {len(c.members)} of them; A / B / ✕ on a crop answers '
                   f'that one on its own and overrides it.</div>')
        else:
            ink = (f'<div class="strip">'
                   f'<a class="zoom" target="_blank" '
                   f'href="{_zoom_href(c, _card_frac(c))}">'
                   f'<img loading="lazy" src="/crops/{c.crop_name}">'
                   f'<span class="mag">⤢</span></a></div>'
                   f'<div class="reclbl">tap the strip for a 9x look at the '
                   f'disputed character, with room below the baseline</div>')
        rows.append(f'''
<div class="card" id="{c.sid}" data-cls="{c.cls}" \
data-sect="{html_mod.escape(c.section)}">
  <div class="meta"><b>{c.cls}</b> · {c.column} · {where} \
<span class="redo">(tap to re-rule)</span></div>{note}{warn}
  {ink}
{'' if c.cls == 'encoding' else
 '<div class="err"><span class="box"></span> printer&#39;s error — the chosen '
 'reading is print-accurate AND the print is the compositor&#39;s mistake: '
 'bank a corrigendum at apply (key E)</div>'}
  <div class="opts">{''.join(buttons)}</div>
</div>''')

    counts = {k: sum(1 for c in cards if c.cls == k) for k in TIERS}
    legend = ' · '.join(f'{k} {v}' for k, v in counts.items() if v)
    if HOMOGLYPH_SKIPPED:
        legend += (f' · {HOMOGLYPH_SKIPPED} homoglyph-only cards folded into '
                   f'the glyph-pair cards')
    if SPLIT_HOMOGLYPH:
        legend += (f' · {SPLIT_HOMOGLYPH} split parts dropped as homoglyphs '
                   f'(the glyph-pair cards decide those)')
    doc = f'''<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ground-truth audit — {len(cards)} cards</title>
<style>
body {{ font-family: -apple-system, sans-serif; margin: 0; padding: 8px;
       background: #f4f1ea; }}
.card {{ background: #fff; border-radius: 10px; padding: 10px;
         margin: 10px auto; max-width: 1100px;
         box-shadow: 0 1px 4px rgba(0,0,0,.15); }}
.card.done {{ opacity: .45; }}
.card.done .strip, .card.done .opts, .card.done .err {{ display: none; }}
.card .redo {{ display: none; }}
.card.done .redo {{ display: inline; color: #4a7dbd; cursor: pointer; }}
.err {{ margin: 6px 0; padding: 8px; border: 1px dashed #b99; color: #844;
        border-radius: 8px; font-size: 14px; cursor: pointer;
        user-select: none; }}
.err .box {{ display: inline-block; width: 15px; height: 15px;
             border: 2px solid #b66; border-radius: 3px;
             vertical-align: -2px; margin-right: 4px; }}
.err.on {{ background: #fbe9e7; font-weight: 600; }}
.err.on .box {{ background: #c0392b; }}
.meta {{ color: #666; font-size: 14px; margin-bottom: 6px; }}
.strip {{ overflow-x: auto; background: #eee; border-radius: 6px;
          margin-bottom: 8px; }}
.strip img {{ display: block; }}
.zoom {{ position: relative; display: block; }}
.mag {{ position: absolute; top: 3px; right: 3px; background: rgba(0,0,0,.55);
        color: #fff; font-size: 12px; line-height: 1; padding: 3px 4px;
        border-radius: 4px; }}
.cp {{ grid-column: 2 / 4; color: #8a6d3b; font-size: 12.5px; }}
.note {{ color: #2e6b4f; font-size: 13.5px; margin: 4px 0 6px; }}
.fold {{ color: #999; font-size: 12px; font-style: italic; }}
.cannot {{ color: #55407a; background: #f1edfa; font-size: 13.5px;
           padding: 6px 8px; border-radius: 6px; margin: 4px 0 6px; }}
/* A WRAPPED grid, not one long row: 31 crops in a single scrolling line is
   fifteen swipes to see the class, and the point of showing every member is
   that the odd one out should catch the eye at a glance. */
.sites {{ display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0 8px;
          max-height: 26rem; overflow-y: auto; }}
.site {{ margin: 0; flex: 0 0 auto; position: relative; cursor: pointer;
         border: 2px solid transparent; border-radius: 6px;
         background: #eee; }}
.site img {{ display: block; height: 4rem; width: auto; }}
.site figcaption {{ font-size: 11.5px; color: #666; padding: 2px 4px;
                    white-space: nowrap; }}
/* ⚠ WHICH ONE IS BEING JUDGED. The crop is centred by character index on a
   justified line, so it points at roughly the right place; this says exactly
   which character, out of the corpus text itself. */
.ctx {{ font-family: 'Gentium Plus', 'Times New Roman', Georgia, serif;
        font-size: 15px; padding: 1px 4px; white-space: nowrap;
        max-width: 30ch; overflow-x: auto; color: #333; }}
.picks {{ display: flex; gap: 3px; padding: 0 3px 3px; }}
.pick {{ flex: 1; font-size: 13px; padding: 3px 0; border: 1px solid #ccc;
         border-radius: 4px; background: #fafafa; cursor: pointer;
         color: #555; }}
.pick:active {{ background: #d0e8ff; }}
.pick.on {{ background: #2b6cb0; color: #fff; border-color: #2b6cb0;
            font-weight: 600; }}
.pick.x.on {{ background: #c0392b; border-color: #c0392b; }}
.site.out {{ opacity: .45; border-color: #c0392b; }}
.site.set {{ border-color: #2b6cb0; }}
.site.weak {{ border-color: #e0a800; }}
.mixedwarn {{ color: #8a4b00; background: #fff3e0; font-size: 13.5px;
              padding: 6px 8px; border-radius: 6px; margin: 4px 0; }}
.reclbl {{ font-size: 12.5px; color: #777; margin-bottom: 6px; }}
.sect {{ max-width: 1100px; margin: 22px auto 6px; font-size: 17px;
         color: #2b2b2b; cursor: pointer; user-select: none;
         border-bottom: 2px solid #d8d2c4; padding-bottom: 5px; }}
.sect .caret {{ display: inline-block; width: 1em; color: #888; }}
.sect.shut .caret {{ transform: rotate(-90deg); }}
.sect .n {{ background: #2b2b2b; color: #eee; border-radius: 10px;
            padding: 1px 9px; font-size: 13px; vertical-align: 2px; }}
.sect .blurb {{ display: block; font-size: 13px; color: #777;
                font-weight: normal; margin-left: 1em; }}
.warn {{ color: #8a4b00; background: #fff3e0; font-size: 13.5px;
         padding: 6px 8px; border-radius: 6px; margin: 4px 0 6px; }}
.opts {{ display: flex; flex-direction: column; gap: 8px; }}
.opt {{ display: grid; grid-template-columns: 2em 9em 1fr; gap: 8px;
        align-items: center; text-align: left; padding: 10px;
        border: 1px solid #ccc; border-radius: 8px; background: #fafafa;
        cursor: pointer; }}
.opt:active {{ background: #d0e8ff; }}
.opt .key {{ color: #999; font-size: 15px; }}
.opt .who {{ color: #555; font-size: 14px; }}
/* ⚠ NOT New Athena Unicode. It sets a combining mark over `ȣ` small and
   tight to the bowl — John, 2026-08-13, circled a perispomeni on a button
   and asked whether the crop had clipped it. It had not; the font had
   shrunk it. Every alternative tested draws it full size, and Gentium Plus
   (SIL, built for stacked polytonic marks) draws `ȣ̓́` and `ϗ̀` clearest.
   The marks over the ligature are the thing this project judges, so the
   font that renders them is not a matter of taste. */
.opt .form {{ font-size: 30px; font-family: 'Gentium Plus', 'Times New Roman',
              Georgia, serif; overflow-x: auto; white-space: nowrap;
              line-height: 1.7; }}
.opt .why {{ grid-column: 2 / 4; color: #777; font-size: 13px; }}
.opt.none .form {{ font-size: 17px; color: #666; }}
/* ⚠ NO HORIZONTAL PADDING. A highlight that widens the box it wraps reads as
   an inserted space — and the marks over the ou-ligature are the thing this
   project judges. Vertical breathing room only. */
mark {{ background: #ffd54d; padding: 1px 0; border-radius: 2px; }}
#bar-msg {{ color: #ffcf6b; }}
#bar {{ position: sticky; top: 0; background: #2b2b2b; color: #eee;
        padding: 8px 12px; border-radius: 8px; font-size: 14px; z-index: 9;}}
</style></head><body>
<div id="bar">{len(cards)} cards — {legend} · <span id="left"></span>
 <span id="bar-msg"></span></div>
{''.join(rows)}
<script>
const cards = [...document.querySelectorAll('.card')];
// ⚠ A RULING IS NEVER LOST TO A DEAD SOCKET. The bar used to print a bare
// failure and stop there — indistinguishable from a refusal, never clearing,
// and the click gone. John lost one to a server restart on 2026-08-14, and restarts
// happen because the queue is rebuilt while he is working. A network failure
// now queues and retries; only a REFUSAL (4xx) is final, and it says which.
const pending = [];
let draining = false;
function say(msg) {{ document.getElementById('bar-msg').textContent = msg; }}
function refresh() {{
  const left = cards.filter(c => !c.classList.contains('done')).length;
  document.getElementById('left').textContent = left + ' left';
  say(pending.length ? '⟳ ' + pending.length + ' waiting for the server' : '');
}}
async function drain() {{
  if (draining) return;
  draining = true;
  while (pending.length) {{
    const job = pending[0];
    try {{
      const r = await fetch(job.path, {{method: 'POST', body: job.body}});
      if (r.status >= 400 && r.status < 500) {{
        pending.shift();
        job.onrefused(r.status);
        continue;
      }}
      if (!r.ok) throw new Error('server ' + r.status);
      pending.shift();
      job.onok();
    }} catch (e) {{
      draining = false;
      refresh();
      setTimeout(drain, 2000);      // the server is down or restarting
      return;
    }}
    refresh();
  }}
  draining = false;
  refresh();
}}
function send(path, body, onok, onrefused) {{
  pending.push({{path, body: JSON.stringify(body), onok, onrefused}});
  refresh();
  drain();
}}
function markDone(sid) {{
  const el = document.getElementById(sid);
  if (el) el.classList.add('done');
}}
fetch('/rulings').then(r => r.json()).then(rs => {{
  Object.entries(rs).forEach(([sid, v]) => {{
    const marks = v.sites || {{}};
    (v.excluded || []).forEach(s => {{ if (!marks[s]) marks[s] = 'X'; }});
    Object.entries(marks).forEach(([site, m]) => {{
      const f = document.querySelector(
        '#' + CSS.escape(sid) + ' .site[data-site="' + site + '"]');
      if (!f) return;
      paint(f, m);
    }});
    if (v.verdict) markDone(sid);
  }});
  refresh();
  const first = cards.find(c => !c.classList.contains('done'));
  if (first) first.scrollIntoView();
}});
document.querySelectorAll('.sect').forEach(h => h.onclick = () => {{
  const shut = h.classList.toggle('shut');
  cards.filter(c => c.dataset.sect === h.dataset.sect)
       .forEach(c => c.style.display = shut ? 'none' : '');
}});
document.querySelectorAll('.err').forEach(e => e.onclick = () =>
  e.classList.toggle('on'));
function paint(f, m) {{
  f.querySelectorAll('.pick').forEach(
    b => b.classList.toggle('on', !!m && b.dataset.m === m));
  f.classList.toggle('out', m === 'X');
  f.classList.toggle('set', !!m && m !== 'X');
}}
document.querySelectorAll('.site .pick').forEach(b => b.onclick = ev => {{
  ev.stopPropagation();
  const f = b.closest('.site'), card = b.closest('.card');
  // ⚠ CLICKING THE SAME LETTER AGAIN CLEARS IT. A site he set by accident must
  // be recoverable without guessing which button was the default.
  const m = b.classList.contains('on') ? '' : b.dataset.m;
  const was = [...f.querySelectorAll('.pick.on')].map(x => x.dataset.m)[0] || '';
  paint(f, m);                     // optimistic; put back if it is refused
  send('/site', {{id: card.id, site: f.dataset.site, mark: m}},
       () => {{}},
       code => {{ paint(f, was);
                 say('site NOT saved (' + code + ') — reload the page'); }});
}});
document.querySelectorAll('.redo').forEach(s => s.onclick = () => {{
  const card = s.closest('.card');
  card.classList.remove('done'); refresh();
}});
document.querySelectorAll('.opt').forEach(b => b.onclick = () => {{
  const card = b.closest('.card');
  let detail;
  try {{ detail = JSON.parse(b.dataset.d); }}
  // ⚠ THE ONE FAILURE RETRYING CANNOT MEND: the button's own payload will not
  // parse, so there is nothing to send. Grok found this with 1352 of 1353
  // buttons dead; it says so plainly rather than looking like a lost write.
  catch (e) {{ say('this button is malformed — reload the page'); return; }}
  // ⚠ NULL-SAFE: an encoding card HAS no erratum toggle (the printer set the
  // right sort; only the codepoint is in question), and reading .classList
  // off the missing div threw before the fetch — every button on those cards
  // dead, silently, exactly the shape Grok found in the unquoted data-d.
  const err = card.querySelector('.err');
  markDone(card.id);
  const nxt = cards.find(c => !c.classList.contains('done'));
  if (nxt) nxt.scrollIntoView({{behavior: 'smooth'}});
  send('/', {{id: card.id, verdict: b.dataset.v, detail: detail,
              erratum: !!(err && err.classList.contains('on'))}},
       () => {{}},
       code => {{
         card.classList.remove('done');
         say(code === 409
             ? 'REFUSED: every site is ✕-ed, so this ruling would reach '
               + 'nothing. Un-✕ a crop, or answer sites with A / B.'
             : 'REFUSED (' + code + '): this card is not the one the server '
               + 'holds — reload the page.');
         refresh();
       }});
}});
document.onkeydown = e => {{
  const card = cards.find(c => !c.classList.contains('done'));
  if (!card) return;
  if (e.key === 'e' || e.key === 'E') {{
    const err = card.querySelector('.err');
    if (err) err.classList.toggle('on');
    return;
  }}
  if (e.key < '1' || e.key > '9') return;
  const opts = card.querySelectorAll('.opt');
  const b = opts[Number(e.key) - 1];
  if (b) b.click();
}};
</script></body></html>'''
    PAGE.parent.mkdir(parents=True, exist_ok=True)
    PAGE.write_text(doc, encoding='utf-8')


# --- server -------------------------------------------------------------------

_STORE_LOCK = threading.Lock()


def record_site(sid: str, site: str, mark: str,
                store: Path | None = None) -> dict:
    """One site of a class card answered on its own: `A`, `B`, `C` or `X`.

    ⚠ A BUNDLE IS NOT ALWAYS ONE ANSWER, AND MAKING IT ONE COSTS A SITTING.
    John, 2026-08-14: "make the bundles into A or B or EXCLUDE". With a single
    verdict plus an ✕, a bundle where three sites read with the corpus and two
    with the engine had to be ruled one way and the other two ✕-ed — and those
    two came back later as fresh cards asking what he had already decided
    while looking at them. A letter per site settles the whole bundle in one
    pass; `X` still means the ruling does not reach that site at all.

    An empty mark clears the site back to whatever the card's own buttons say.
    Written through the same lock and the same atomic swap as a verdict,
    because a per-site answer IS a ruling.
    """
    store = store or RULINGS
    with _STORE_LOCK:
        have = (json.loads(store.read_text(encoding='utf-8'))
                if store.exists() else {})
        entry = have.get(sid) or {'verdict': '', 'detail': '',
                                  'erratum': False, 'excluded': [], 'sites': {}}
        sites = dict(entry.get('sites') or {})
        if mark:
            sites[site] = mark
        else:
            sites.pop(site, None)
        entry['sites'] = sites
        # ⚠ `excluded` STAYS IN STEP. Rulings made before the letters exist
        # carry only this list, and `audit_apply` and every test still read it.
        entry['excluded'] = sorted(k for k, v in sites.items() if v == 'X')
        have[sid] = entry
        _write(store, have)
        return entry['sites']


def record_exclude(sid: str, site: str, excluded: bool,
                   store: Path | None = None) -> list[str]:
    """The older boolean form of `record_site`, kept for the stored rulings
    and the tests that speak it."""
    record_site(sid, site, 'X' if excluded else '', store)
    store = store or RULINGS
    return (json.loads(store.read_text(encoding='utf-8'))
            .get(sid, {}).get('excluded') or [])


def _write(store: Path, have: dict) -> None:
    store.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=store.parent, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(json.dumps(have, ensure_ascii=False, indent=1))
    os.replace(tmp, store)


def store_ruling(sid: str, verdict: str, detail: str,
                 erratum: bool = False, store: Path | None = None) -> None:
    """One ruling to disk — locked and atomic, because losing one is the
    project's worst defect class.

    ⚠ THE SERVER IS THREADED (a slow crop download must not block a ruling),
    so two POSTs can interleave: both read the store, each writes its own
    card, the slower write erases the faster one. The lock serialises the
    read-modify-write. And the write goes to a temp file first: `write_text`
    truncates before it writes, so a crash in that window leaves an empty
    store — os.replace swaps whole files and cannot."""
    store = store or RULINGS
    with _STORE_LOCK:
        have = (json.loads(store.read_text(encoding='utf-8'))
                if store.exists() else {})
        # `erratum` = the ink is print-accurate AND the print is the
        # compositor's mistake (John, 2026-08-13, on `intcllexit`): the
        # verdict says what the corpus should read, the flag sends the site
        # to the corrigenda register when rulings are applied.
        prior = have.get(sid) or {}
        have[sid] = {'verdict': verdict, 'detail': detail,
                     'erratum': bool(erratum),
                     # a verdict must not silently drop the per-site answers
                     # already given on this card
                     'excluded': prior.get('excluded') or [],
                     'sites': prior.get('sites') or {}}
        _write(store, have)


def serve(cards: list[Card], port: int, host: str) -> None:
    """Same contract as book_review.serve — reload restores rulings from
    disk, malformed posts are refused, threaded so a slow crop download
    cannot block a ruling — plus a /crops/ route for the strips."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from urllib.parse import unquote

    body = PAGE.read_bytes()
    valid = {c.sid for c in cards}
    # ⚠ ONLY COLUMNS THE QUEUE ACTUALLY NAMES. `/zoom` takes a column from the
    # query string and opens a file with it; anything else is a path the page
    # never asked for.
    known_cols = {c.column for c in cards} | \
        {m.column for c in cards for m in c.members}
    members = {c.sid: {m.sid for m in c.members} for c in cards if c.members}

    def _excluded(sid: str) -> list[str]:
        if not RULINGS.exists():
            return []
        return (json.loads(RULINGS.read_text(encoding='utf-8'))
                .get(sid, {}).get('excluded') or [])

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split('?')[0]
            if path.rstrip('/') == '/rulings':
                have = (RULINGS.read_bytes() if RULINGS.exists() else b'{}')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(have)))
                self.end_headers()
                self.wfile.write(have)
                return
            if path == '/zoom':
                from urllib.parse import parse_qs, urlparse
                q = parse_qs(urlparse(self.path).query)
                col = (q.get('col') or [''])[0]
                if col not in known_cols:
                    self.send_response(404); self.end_headers(); return
                try:
                    data = zoom_png(col, (q.get('line_id') or [''])[0],
                                    int((q.get('lineno') or ['0'])[0]),
                                    float((q.get('frac') or ['-1'])[0]))
                except (SystemExit, ValueError, OSError):
                    self.send_response(404); self.end_headers(); return
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if path.startswith('/crops/'):
                # ⚠ UNQUOTE FIRST. The crop names carry Greek — `Hε.png`
                # reaches the server as `H%CE%B5.png`, and matching the raw
                # path 404s every card whose token is not pure ASCII.
                name = unquote(path[len('/crops/'):])
                f = CROPS / Path(name).name
                if not f.exists():
                    self.send_response(404); self.end_headers(); return
                data = f.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            n = int(self.headers.get('Content-Length', 0))
            try:
                d = json.loads(self.rfile.read(n) or b'{}')
            except json.JSONDecodeError:
                self.send_response(400); self.end_headers(); return
            route = self.path.split('?')[0].rstrip('/')
            if route == '/exclude':
                return self.do_exclude(d)
            if route == '/site':
                return self.do_site(d)
            sid, verdict = d.get('id'), d.get('verdict')
            if sid not in valid or verdict not in ('keep', 'fix', 'none') \
                    or not isinstance(d.get('erratum', False), bool):
                self.send_response(400); self.end_headers(); return
            # ⚠ A RULING THAT BINDS NOTHING IS REFUSED. With every crop ✕-ed
            # the card would go green and the counter would drop, while the
            # ruling reached no site at all — the ligature sitting's lesson.
            if members.get(sid) and verdict != 'none':
                left = set(members[sid]) - set(_excluded(sid))
                if not left:
                    self.send_response(409); self.end_headers(); return
            store_ruling(sid, verdict, d.get('detail', ''),
                         d.get('erratum', False))
            self.send_response(204); self.end_headers()

        def do_site(self, d):
            sid, site, mark = d.get('id'), d.get('site'), d.get('mark')
            if sid not in members or site not in members.get(sid, ()) \
                    or mark not in ('A', 'B', 'C', 'X', ''):
                self.send_response(400); self.end_headers(); return
            record_site(sid, site, mark)
            self.send_response(204); self.end_headers()

        def do_exclude(self, d):
            sid, site = d.get('id'), d.get('site')
            if sid not in members or site not in members.get(sid, ()) \
                    or not isinstance(d.get('excluded'), bool):
                self.send_response(400); self.end_headers(); return
            record_exclude(sid, site, d['excluded'])
            self.send_response(204); self.end_headers()

    if host == '0.0.0.0':
        import socket
        name = socket.gethostname()
        print(f'open on the WiFi as http://{name}.local:{port} '
              f'(or this machine\'s LAN address)')
    print(f'http://localhost:{port}  ->  {RULINGS}')
    ThreadingHTTPServer((host, port), H).serve_forever()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--classes', help='comma-separated subset of '
                                     f'{",".join(TIERS)} (default: all)')
    p.add_argument('--port', type=int, default=8795)
    p.add_argument('--wifi', action='store_true')
    p.add_argument('--build-only', action='store_true',
                   help='write page + crops, do not serve')
    p.add_argument('--none', action='store_true',
                   help='only what a `none` verdict owes: the lines John '
                        'rejected whole, re-asked one dispute at a time')
    a = p.parse_args(argv)

    cards = load_cards()
    if a.none:
        cards = _none_cards(cards)
    if a.classes:
        want = set(a.classes.split(','))
        bad = want - set(TIERS)
        if bad:
            raise SystemExit(f'unknown class(es): {sorted(bad)}')
        cards = [c for c in cards if c.cls in want]
    if not cards:
        raise SystemExit('no cards — nothing in the audit queues matches')

    # cut in column order so the cached column image is reused, whatever
    # order the queue shows the cards in. A class card's own crop is never
    # shown — its members carry the ink — so only theirs are cut.
    targets = [m for c in cards for m in c.members] + \
              [c for c in cards if not c.members]
    for t in sorted(targets, key=lambda t: t.column):
        cut_crop(t)
    build_page(cards)
    print(f'{len(cards)} cards -> {PAGE}')
    if HAND_SUPERSEDED:
        print(f'{HAND_SUPERSEDED} card(s) superseded by a hand card on the '
              f'same line — it asks the whole question, they could not')
    if ELISION_FOLDED:
        print(f'{ELISION_FOLDED} card(s) disputed nothing but the spelling of '
              f'the elision mark, which is settled: U+2019 everywhere')
    if not a.build_only:
        serve(cards, a.port, '0.0.0.0' if a.wifi else '127.0.0.1')
    return 0


if __name__ == '__main__':
    sys.exit(main())
