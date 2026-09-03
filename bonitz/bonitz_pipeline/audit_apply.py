"""John's ground-truth audit rulings, carried into the corpus and the ledger.

    python3 -m bonitz_pipeline.audit_apply            # dry run, writes nothing
    python3 -m bonitz_pipeline.audit_apply --apply

`audit_review` records rulings and never applies them. This is the step that
applies them, and it is the sixth store's way home: every ruling also lands in
`work/rulings/john.json` through `john_rulings.add()`, because a ruling that
lives only in `work/audit/audit-rulings.json` is invisible to `migrate()` —
Grok's finding 9, and the 2026-08-12 loss waiting to recur.

    keep   the corpus already reads what the ink prints — nothing is written
           to the text, and the approval is recorded. A keep is the ruling
           most easily lost: the text carries no trace that a human looked.
    fix    the corpus is edited toward the ink, at that site only.
    none   the ink reads none of the readings offered. The print stands; a
           follow-up card is owed. Recorded as `declined`.
    erratum   the chosen reading is print-accurate AND the print is the
           compositor's mistake — the text keeps the ink and the site is
           banked in work/corrigenda/entries.json.

⚠ SCOPE IS RESOLVED BEFORE ANYTHING IS WRITTEN. A class card's members are not
stored with the ruling — they are re-derived from the corpus each time the
queue is built — and this step EDITS that corpus. Resolve as you go and the
third ruling scans ground the first two have moved, so a ruling can reach a
site John never saw. Every ruling is therefore resolved to concrete sites
first, in one pass over the corpus as it stands, and the plan is checked
against the card before a byte changes.

⚠ AND A RULING IS CHECKED AGAINST THE CARD THAT PRODUCED IT. The verdict is
only meaningful beside the options it was chosen from, so a ruling whose
detail is no longer one of its card's options is REFUSED, not guessed at:
that is the signature of a card rebuilt in a different shape under an answer
already given ([[carry-rulings-by-site]]).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from bonitz_pipeline import audit_review as review
from bonitz_pipeline import elision
from bonitz_pipeline import john_rulings
from bonitz_pipeline.kraken_corpus import BEKKER_SPACE
from bonitz_pipeline.kraken_eval import align

ROOT = Path(__file__).resolve().parent.parent
RECONCILED = ROOT / 'work' / 'reconciled'
CORRIGENDA = ROOT / 'work' / 'corrigenda' / 'entries.json'
SOURCE = 'work/audit/audit-rulings.json'
# ⚠ THE DAY THE RULING IS APPLIED, NOT THE DAY THIS LINE WAS WRITTEN. It was a
# constant `'2026-08-13'`, so everything applied on the 14th went into the
# ledger dated the 13th — and a ledger that misdates its own entries cannot
# settle which of two rulings came first, which is the one question
# `ledger_conflicts` exists to answer.
DATE = _dt.date.today().isoformat()


class RenderingOnly(Exception):
    """A ruling whose whole effect belongs to the render rule, not the record.

    ⚠ NOT A REFUSAL. A refusal blocks the entire write — nothing is applied
    while any ruling refuses — and John pressed B on a 65-site spacing bundle
    of which fifteen were siglum gaps, which stopped 18 good lines from being
    written. His ruling is not wrong; it is about how the text RENDERS, which
    he settled on 2026-08-13. So it is recorded and named, and the rest of the
    sitting goes in.
    """


class ApplyError(Exception):
    """The plan could not be built. Raised, never warned: a ruling silently
    skipped reads exactly like a ruling with nothing to do."""


@dataclass
class Edit:
    """One ruling's effect on one printed line.

    `how` says which shape the effect has, and the two do not compose the
    same way. A `line` edit replaces the whole line and therefore demands the
    line still read what the card showed; a `token` edit rewrites one spelling
    wherever it stands on that line, and several of those can land on one line
    without touching each other.
    """
    sid: str
    col: str
    line: int
    how: str                      # 'line' | 'token' | 'none'
    verdict: str
    old: str = ''                 # the line as the card showed it ('line')
    new: str = ''                 # the line as it should read ('line')
    token: str = ''               # the spelling to rewrite ('token')
    becomes: str = ''             # what it becomes ('token')
    erratum: bool = False


@dataclass
class Plan:
    edits: list[Edit] = field(default_factory=list)
    refusals: list[tuple[str, str]] = field(default_factory=list)
    superseded: list[tuple[str, str]] = field(default_factory=list)
    classes: list[dict] = field(default_factory=list)
    recorded: list[str] = field(default_factory=list)   # already in the ledger
    withheld: list[tuple[str, str]] = field(default_factory=list)

    @property
    def changing(self) -> list[Edit]:
        return [e for e in self.edits if e.how != 'none' and not self.noop(e)]

    @staticmethod
    def noop(e: Edit) -> bool:
        return (e.how == 'line' and e.old == e.new) or \
               (e.how == 'token' and e.token == e.becomes)


# --- the corpus, read once ----------------------------------------------------

_LINES: dict[str, list[str]] = {}


def corpus(col: str) -> list[str]:
    if col not in _LINES:
        f = RECONCILED / f'{col}.txt'
        if not f.exists():
            raise ApplyError(f'{f} is missing — a ruling names a column this '
                             f'corpus does not have')
        _LINES[col] = f.read_text(encoding='utf-8').splitlines()
    return _LINES[col]


def _fold(text: str) -> str:
    """Text with every homoglyph folded to one shape — for FINDING a line."""
    from bonitz_pipeline.encoding_check import FOLD
    return ''.join(FOLD.get(c, c) for c in BEKKER_SPACE.sub('', text))


def _match(col: str, text: str) -> list[int]:
    return [i for i, line in enumerate(corpus(col), 1)
            if BEKKER_SPACE.sub('', line) == BEKKER_SPACE.sub('', text)]


def locate(col: str, gt: str, ruled: str | None = None) -> tuple[int, bool]:
    """(printed line, already applied) for a card's text.

    The audit reads kraken's training targets, which spell a Bekker reference
    unspaced (`1456b27`); `work/reconciled` keeps the printed gap. So the two
    are matched through the same strip the training corpus applies, and a text
    that matches no line — or more than one — is refused rather than guessed
    at, because the wrong line is the one edit nobody would catch.

    ⚠ AND THE SECOND RUN MUST NOT REFUSE THE FIRST RUN'S WORK. Once a fix is
    written, the card's text is no longer in the corpus — the card describes
    the line as it stood before. John has 248 cards still to rule and will run
    this again; a step that could only ever run once would make every later
    sitting choose between its own rulings and these. So a card whose text has
    gone is looked for in the shape its own ruling gave it, and a line that
    already reads what was ruled is `done`, not missing.
    """
    hits = _match(col, gt)
    if len(hits) == 1:
        return hits[0], False
    if ruled and ruled != gt:
        done = _match(col, ruled)
        if len(done) == 1:
            return done[0], True
    # ⚠ A HOMOGLYPH CANNOT CHANGE WHICH LINE THIS IS. Two of John's keeps
    # refused because a glyph-pair ruling of his own had since written `AΖι`
    # where their cards showed `AZι` — the same ink, a different codepoint,
    # and a line he had looked at going unrecorded for it. Folding is safe
    # HERE and nowhere else in this file: this test identifies a line, it does
    # not decide a glyph.
    folded = [i for i, line in enumerate(corpus(col), 1)
              if _fold(line) == _fold(gt)]
    if len(folded) == 1:
        return folded[0], False
    raise ApplyError(f'{col}: {len(hits)} lines match the card text, and '
                     f'none reads what was ruled — the corpus has moved '
                     f'under this ruling')


def locate_ops(col: str, gt: str,
               line_ops: dict[int, list[str]]) -> tuple[int, dict[int, str]]:
    """(printed line, the disputes already written there) for a SPLIT card.

    ⚠ `locate` CANNOT FIND A LINE ITS SIBLING HAS MOVED. A split line's parts
    are ruled whenever John reaches them, so the first part is applied and the
    line stops reading what every remaining part's card shows. Matching on the
    card text alone would then refuse the rest of his rulings — a step that
    could only ever run once, which is the failure `locate`'s own fallback was
    written to stop.

    So the line is found by what it may legitimately hold: `gt` with any
    subset of THIS LINE'S OWN disputes already made. A line carrying a change
    no reading of this card ever proposed is not this line, and two matches or
    none is refused rather than guessed at.
    """
    hits = []
    for i, line in enumerate(corpus(col), 1):
        got = review.ops(gt, BEKKER_SPACE.sub('', line))
        if all(text in line_ops.get(pos, ()) for pos, text in got.items()):
            hits.append((i, got))
    if len(hits) != 1:
        raise ApplyError(f'{col}: {len(hits)} lines could be this card\'s, '
                         f'read as its own disputes part-applied — the corpus '
                         f'has moved under this ruling')
    return hits[0]


def _plan_chars(gt: str, new: str) -> tuple[list[str | None], str]:
    """Per-character replacements taking `gt` to `new`, and any tail."""
    out: list[str | None] = [None] * len(gt)
    pending, i = '', 0
    for x, y in align(gt, new):
        if x is None:
            pending += y or ''
            continue
        out[i] = pending + (y if y is not None else '')
        pending, i = '', i + 1
    return out, pending


def remap(raw: str, new: str) -> str:
    """`raw` re-spelt as `new`, keeping the Bekker spaces `new` does not have.

    The card's readings live in the training corpus's spelling, where a Bekker
    reference is unspaced; the line on disk keeps the printed gap. 36 of the
    60 fixes ruled this session sit on such a line, so a wholesale line swap
    would silently strip a space John never ruled on — and the space is the
    thing he ruled a matter of RENDERING, not of the record. The edit is
    therefore carried character by character through the alignment, and the
    Bekker spaces are held in place.
    """
    keep = {m.start() for m in BEKKER_SPACE.finditer(raw)}
    repl, tail = _plan_chars(BEKKER_SPACE.sub('', raw), new)
    out, i = [], 0
    for j, ch in enumerate(raw):
        if j in keep:
            out.append(ch)
            continue
        out.append(ch if i >= len(repl) or repl[i] is None else repl[i])
        i += 1
    got = ''.join(out) + tail
    if BEKKER_SPACE.sub('', got) != new:
        # The edit moved a digit or a column letter next to a held space, so
        # the strip no longer reproduces the ruling. Refuse: the alternative
        # is writing a line neither the card nor John ever saw.
        raise ApplyError('the edit cannot be carried through the Bekker '
                         f'spacing: {raw!r} + {new!r}')
    return got


# --- what a card offered ------------------------------------------------------

def card_options(c: review.Card) -> list[tuple[str, str]]:
    """(verdict, detail) for every button the card carried — the same list
    `build_page` writes, and the only answers a ruling on it can hold."""
    if c.options:
        opts = [(v, text) for v, _label, text, _fixed, _why in c.options]
    else:
        opts = [('keep', c.gt)]
        opts += [('fix', reading) for reading in c.readings.values()]
    return opts + [('none', '')]


def _glyph_pair(sid: str) -> tuple[str, str]:
    lat, _, grk = sid[len('encoding:'):].partition('-')
    return lat, grk


def _replace_runs(line: str, token: str, becomes: str) -> tuple[str, int]:
    """Rewrite whole letter runs equal to `token`. A run, never a substring:
    `οβ` is the Oeconomica siglum and also two letters inside φόβος."""
    n = 0

    def sub(m: re.Match) -> str:
        nonlocal n
        if m.group() != token:
            return m.group()
        n += 1
        return becomes

    return review.LETTER_RUN.sub(sub, line), n


def resolve(cards: dict[str, review.Card], rulings: dict,
            lines: dict[str, review.Card]) -> Plan:
    """Every ruling turned into concrete site edits, against the corpus as it
    stands right now. Nothing here writes."""
    plan = Plan()
    # ⚠ LIVE CARDS FIRST, ORPHANS AFTER. An orphan is settled by comparing it
    # with what the live rulings do to the same line, so resolving in store
    # order made the answer depend on the order John happened to click: the
    # first pass through this had five orphans "disagreeing" with rulings that
    # simply had not been resolved yet.
    # ⚠ A STORED DETAIL PREDATES THE ELISION RULE. 54 of John's rulings hold a
    # whole line spelt with whichever mark the card carried that day, and the
    # cards now spell it U+2019 — so the button check would refuse every one
    # of them as "not a button this card carries". Folded once, here, and
    # every branch below is comparing like with like.
    rulings = {sid: {**r, 'detail': elision.fold(r.get('detail') or '')}
               for sid, r in rulings.items()}
    live = {sid: r for sid, r in rulings.items() if sid in cards}
    orphans = {sid: r for sid, r in rulings.items() if sid not in cards}
    for sid, r in live.items():
        verdict, detail = r.get('verdict', ''), r.get('detail', '')
        card = cards[sid]
        try:
            if (verdict, detail) not in card_options(card):
                if _already(plan, sid, r):
                    continue
                raise ApplyError(
                    f'the ruling answers {verdict!r}/{detail!r}, which is not '
                    f'a button this card now carries — it was rebuilt in a '
                    f'different shape after the ruling')
            if sid.startswith('encoding:'):
                _resolve_encoding(plan, sid, r, card)
            elif sid.startswith('pattern:'):
                _resolve_pattern(plan, sid, r, card, lines)
            elif card.line_ops:
                _apply_reading(plan, sid, card, verdict, detail, _erratum(r))
            elif card.lineno is not None:
                _resolve_sweep(plan, sid, r, card)
            else:
                _resolve_perline(plan, sid, r, card)
        except RenderingOnly as e:
            plan.superseded.append((sid, str(e)))
        except ApplyError as e:
            plan.refusals.append((sid, str(e)))
    for sid, r in orphans.items():
        try:
            _resolve_orphan(plan, sid, r, cards, lines)
        except RenderingOnly as e:
            plan.superseded.append((sid, str(e)))
        except ApplyError as e:
            plan.refusals.append((sid, str(e)))
    return plan


def _erratum(r: dict) -> bool:
    return bool(r.get('erratum'))


def _already(plan: Plan, sid: str, r: dict) -> bool:
    """Is this ruling's outcome already in the corpus? Records it if so.

    ⚠ A CARD CAN GO, OR CHANGE SHAPE, BECAUSE ITS QUESTION WAS SETTLED — NOT
    BECAUSE ANYTHING WAS LOST. The elision fold dropped 37 cards and renumbered
    the parts of others while John was ruling, and nine of that morning's
    rulings landed on them: eight with no card left and one whose part had been
    renumbered. Every one asked for a line the corpus now holds exactly. A
    ruling whose site already reads what it asked for is satisfied, whatever
    became of the card; only one that wants something the corpus does not have
    is a ruling nobody can check.

    ⚠ `fix` ONLY. A `keep` states that the line as it stands is right, so it
    matches the corpus by construction and this test would swallow every one
    of them — and a keep that leaves no trace is how a keep dies (the failure
    `record_ledger` exists to stop). A keep on a card that changed shape still
    refuses, loudly.
    """
    detail = r.get('detail') or ''
    if r.get('verdict') != 'fix' or not detail:
        return False
    col = sid.split(':', 1)[0]
    try:
        line, _done = locate(col, detail)
    except ApplyError:
        return False
    plan.superseded.append(
        (sid, f'{col}:{line} — the corpus already reads what this ruling '
              f'asked for; the card that asked has since changed shape'))
    return True


def _resolve_perline(plan: Plan, sid: str, r: dict,
                     card: review.Card) -> None:
    """A card about one line of one column: the detail IS the line."""
    line, done = locate(card.column, card.gt, r.get('detail'))
    raw = corpus(card.column)[line - 1]
    if r['verdict'] == 'none' or done:
        plan.edits.append(Edit(sid, card.column, line, 'none', r['verdict'],
                               old=raw, new=raw, erratum=_erratum(r)))
        return
    new = raw if r['verdict'] == 'keep' else remap(raw, r['detail'])
    _guard_siglum_space(raw, new)
    plan.edits.append(Edit(sid, card.column, line, 'line', r['verdict'],
                           old=raw, new=new, erratum=_erratum(r)))


def _apply_reading(plan: Plan, sid: str, card: review.Card, verdict: str,
                   detail: str, erratum: bool) -> None:
    """One reading of a SPLIT card carried to its line.

    The card holds the whole printed line and asks about one character of it,
    so the ruling's effect is that one change — merged with whatever its
    sibling parts have already written, and with the Bekker spacing of the
    line on disk held in place.
    """
    line, have = locate_ops(card.column, card.gt, card.line_ops)
    raw = corpus(card.column)[line - 1]
    # ⚠ A PART ANSWERS ONLY ITS OWN QUESTION. Its line's other disputes are
    # in `line_ops` so the line can still be FOUND once a sibling has moved
    # it — that is not licence to write them. A `fix` may only be one of the
    # readings this card put in front of John.
    if verdict == 'fix' and detail not in card.readings.values():
        raise ApplyError(f'{detail!r} is not a reading this card offered — a '
                         f'part may only answer the dispute it asks about')
    mine = review.ops(card.gt, detail) if verdict == 'fix' else {}
    if verdict == 'none' or (mine and all(have.get(i) == t
                                          for i, t in mine.items())):
        # `none` claims nothing about the text; an already-written part is
        # this step's own earlier run, not a fresh edit.
        plan.edits.append(Edit(sid, card.column, line, 'none', verdict,
                               old=raw, new=raw, erratum=erratum))
        return
    # ⚠ `keep` STAYS A 'line' EDIT WITH old == new. It writes nothing, but it
    # is how an erratum on an unchanged line reaches the register — a `none`
    # edit is skipped by `corrigenda_for`, and a keep+erratum is precisely
    # John saying the print is wrong and the corpus should keep it anyway.
    new = raw if verdict == 'keep' else \
        remap(raw, review.apply_ops(card.gt, {**have, **mine}))
    _guard_siglum_space(raw, new)
    plan.edits.append(Edit(sid, card.column, line, 'line', verdict,
                           old=raw, new=new, erratum=erratum))


def _guard_siglum_space(old: str, new: str) -> None:
    """⚠ THE SIGLUM SPACE IS NOT A CORPUS QUESTION. John ruled on 2026-08-13
    that the gap between a siglum and the number after it is how the site and
    the PDF RENDER the text, not what `work/reconciled` records, so an edit
    that only opens or closes that gap belongs to the render rule.

    ⚠ AND ONLY THAT GAP. The first version of this guard refused any edit
    whose whole substance was whitespace, which swallowed three rulings that
    are nothing to do with sigla: `ἀξιȣ͂ νἀξίωμ` → `ἀξιȣ͂ν ἀξίωμ` is where a
    WORD divides, the sweep's own finding, and `100a3sqq.` → `100a3 sqq.`
    opens a gap after a Bekker line, not before a chapter number. A guard
    defined by the shape it means to stop — a space between a letter and a
    digit — keeps those three, which is the difference between enforcing his
    ruling and quietly overreaching it.
    """
    if old == new or old.replace(' ', '') != new.replace(' ', ''):
        return
    if _spaces_between_letter_and_digit(old, new):
        raise RenderingOnly('this edit only opens or closes the gap between a '
                            'siglum and its number, which John ruled a '
                            'RENDERING matter on 2026-08-13 — the site and '
                            'the PDF decide it, work/reconciled does not '
                            'record it')


_SIGLUM_GAP = re.compile(r'[^\W\d_] \d')


def _spaces_between_letter_and_digit(old: str, new: str) -> bool:
    """True when the two differ only in gaps that sit between a letter and a
    digit — `Ηε 10.` against `Ηε10.` — and in nothing else."""
    return (_SIGLUM_GAP.sub(lambda m: m.group().replace(' ', ''), old)
            == _SIGLUM_GAP.sub(lambda m: m.group().replace(' ', ''), new))


def _resolve_sweep(plan: Plan, sid: str, r: dict, card: review.Card) -> None:
    """A sweep finding, addressed by printed line: the card's own text is
    already the corpus's, so no re-spacing is involved."""
    line = card.lineno
    raw = corpus(card.column)[line - 1]
    done = raw != card.gt
    if done and raw != r.get('detail'):
        raise ApplyError(f'{card.column}:{line} reads neither what the card '
                         f'showed nor what was ruled — the corpus has moved '
                         f'under this ruling')
    if r['verdict'] == 'none' or done:
        plan.edits.append(Edit(sid, card.column, line, 'none', r['verdict'],
                               old=raw, new=raw, erratum=_erratum(r)))
        return
    new = raw if r['verdict'] == 'keep' else r['detail']
    _guard_siglum_space(raw, new)
    plan.edits.append(Edit(sid, card.column, line, 'line', r['verdict'],
                           old=raw, new=new, erratum=_erratum(r)))


def _resolve_encoding(plan: Plan, sid: str, r: dict,
                      card: review.Card) -> None:
    """A glyph-pair card: one ruling, every site of both spellings.

    ⚠ THE MEMBER LIST IS RE-DERIVED, SO IT IS ALSO RE-COUNTED. The card told
    John how many sites his ruling would bind; if the corpus now yields a
    different number, he ruled on a different set and the ruling is refused
    rather than applied to sites he never saw.
    """
    lat, grk = _glyph_pair(sid)
    excluded = set(r.get('excluded') or [])
    reached = per_site(card, r)
    plan.classes.append({'sid': sid, 'verdict': r['verdict'],
                         'detail': r['detail'],
                         'sites': [m.sid for m, _v, _d in reached],
                         'excluded': sorted(excluded),
                         'per_site': {m.sid: f'{v}:{d}' for m, v, d in reached
                                      if (v, d) != (r['verdict'], r['detail'])}})
    for m, verdict, chosen in reached:
        if verdict != 'fix':
            # `keep` on this card is 'leave both spellings', and `none` is a
            # follow-up: neither touches the text.
            continue
        if chosen not in (lat, grk):
            raise ApplyError(f'{chosen!r} is neither glyph of this pair')
        other = lat if chosen == grk else grk
        becomes = m.token.replace(other, chosen)
        raw = corpus(m.column)[m.lineno - 1]
        runs = review.LETTER_RUN.findall(raw)
        if m.token not in runs:
            if becomes in runs:
                continue      # an earlier run of this step already wrote it
            raise ApplyError(f'{m.column}:{m.lineno} no longer holds the '
                             f'spelling {m.token!r} this ruling binds')
        plan.edits.append(Edit(sid, m.column, m.lineno, 'token', 'fix',
                               token=m.token, becomes=becomes,
                               erratum=_erratum(r)))


def _members(card: review.Card, excluded: set[str]) -> list[review.Member]:
    """The card's members, deduplicated, minus the excluded sites.

    ⚠ A DUPLICATE SID CANNOT BE EXCLUDED. Two occurrences of one spelling on
    one line share a member id (`page-021-R:L13:Pα`), so an ✕ on either would
    pull out both. Nothing is excluded today; if it ever is, the ambiguity is
    refused rather than resolved in the ruling's favour.
    """
    seen, out = set(), []
    dupes = set()
    for m in card.members:
        if m.sid in seen:
            dupes.add(m.sid)
            continue
        seen.add(m.sid)
        if m.sid not in excluded:
            out.append(m)
    if dupes & excluded:
        raise ApplyError(f'excluded site(s) {sorted(dupes & excluded)} occur '
                         f'twice on their line — an ✕ cannot say which')
    return out


def per_site(card: review.Card, r: dict) -> list[tuple[review.Member, str, str]]:
    """(site, verdict, detail) for every site this class ruling reaches.

    ⚠ A BUNDLE IS NOT ALWAYS ONE ANSWER. John, 2026-08-14: "make the bundles
    into A or B or EXCLUDE". A site marked with a letter answers itself from
    the card's OWN buttons — so one sitting can send three sites to the corpus
    and two to the engine — and a site left unmarked follows the card's
    verdict, exactly as before. `X` means the ruling does not reach it.

    The letters index the card's buttons, so a letter recorded against a card
    that has since been rebuilt with fewer options is REFUSED rather than
    resolved to whatever now sits at that position — the same rule as the
    verdict itself ([[carry-rulings-by-site]]).
    """
    marks = dict(r.get('sites') or {})
    for site in (r.get('excluded') or []):
        marks.setdefault(site, 'X')
    opts = [(v, text) for v, _l, text, _f, _w in (card.options or [])]
    out = []
    for m in _members(card, {s for s, k in marks.items() if k == 'X'}):
        k = marks.get(m.sid)
        if not k or k == 'X':
            out.append((m, r['verdict'], r['detail']))
            continue
        i = 'ABC'.find(k)
        if i < 0 or i >= len(opts):
            raise ApplyError(
                f'{m.sid} is marked {k!r}, which is not a button this card '
                f'carries — it was rebuilt in a different shape after the '
                f'ruling')
        out.append((m, opts[i][0], opts[i][1]))
    return out


def _resolve_pattern(plan: Plan, sid: str, r: dict, card: review.Card,
                     lines: dict[str, review.Card]) -> None:
    """A repeated-substitution card: its members are audited LINES (or single
    disputes of one), so the effect at each is that card's own reading, not a
    token rewrite."""
    excluded = set(r.get('excluded') or [])
    reached = per_site(card, r)
    plan.classes.append({'sid': sid, 'verdict': r['verdict'],
                         'detail': r['detail'],
                         'sites': [m.sid for m, _v, _d in reached],
                         'excluded': sorted(excluded),
                         'per_site': {m.sid: v for m, v, _d in reached
                                      if v != r['verdict']}})
    for m, verdict, _detail in reached:
        if verdict != 'fix':
            continue
        mc = lines.get(m.sid)
        if mc is None:
            raise ApplyError(f'{m.sid} is on the card but not among the '
                             f'per-line cards the bundle was grouped from')
        # a bundled member has exactly one reading — that is what let it group
        reading = next(iter(mc.readings.values()))
        if mc.line_ops:
            _apply_reading(plan, sid, mc, 'fix', reading, _erratum(r))
            continue
        line, done = locate(m.column, mc.gt, reading)
        raw = corpus(m.column)[line - 1]
        if done:
            plan.edits.append(Edit(sid, m.column, line, 'none', 'fix',
                                   old=raw, new=raw, erratum=_erratum(r)))
            continue
        new = remap(raw, reading)
        _guard_siglum_space(raw, new)
        plan.edits.append(Edit(sid, m.column, line, 'line', 'fix',
                               old=raw, new=new, erratum=_erratum(r)))


# --- rulings whose card no longer exists --------------------------------------

def _resolve_orphan(plan: Plan, sid: str, r: dict,
                    cards: dict[str, review.Card],
                    lines: dict[str, review.Card]) -> None:
    """A ruling the current queue has no card for.

    Two shapes, both from THIS session's refactors, and neither is John
    changing his mind about a site: the eleven homoglyph-only line cards that
    were folded into the glyph-pair cards, and the eight encoding cards keyed
    by shape (`encoding:Ρα`) before they were re-keyed by glyph pair
    (`encoding:P-Ρ`).

    ⚠ A RENAMED CARD MUST NOT SILENTLY DISCARD THE RULING ON IT. Each orphan
    is resolved to what it asked for and compared with what the live rulings
    do to the same line. Agreement means superseded — recorded, not applied
    twice. Disagreement is John's to settle, so it refuses.
    """
    verdict = r.get('verdict', '')
    if verdict == 'none':
        # A `none` refuses the readings offered; it claims nothing about the
        # outcome, so a later ruling on the same ink cannot contradict it.
        plan.superseded.append((sid, 'answered `none`; a later card covers '
                                     'the site'))
        return
    if sid.startswith('encoding:'):
        _orphan_shape_card(plan, sid, r, cards)
        return
    if _elision_bundle(sid):
        # The four bundles that asked which codepoint the elision mark takes.
        # They have no card because the question is settled, not because
        # anything was lost: the corpus spells it U+2019 at every site either
        # of them bound.
        plan.superseded.append(
            (sid, 'the elision mark is spelt U+2019 everywhere now — this '
                  'bundle asked which codepoint, and nothing is left to ask'))
        return
    mc = lines.get(sid)
    if mc is None:
        if _already(plan, sid, r):
            return
        if verdict == 'keep' and r.get('detail'):
            # ⚠ A KEEP MUST NOT DIE WITH ITS CARD. It says the line as it
            # stands is what the ink prints — an observation about the INK,
            # not about the card — and `record_ledger` is the only place it
            # is ever written down. Two of John's keeps were on elision cards
            # the fold removed under him; superseding them would have left no
            # trace that he had looked at those lines at all.
            col = sid.split(':', 1)[0]
            line, _done = locate(col, r['detail'])
            raw = corpus(col)[line - 1]
            plan.edits.append(Edit(sid, col, line, 'line', 'keep',
                                   old=raw, new=raw, erratum=_erratum(r)))
            return
        raise ApplyError('no card and no per-line card — this ruling '
                         'addresses nothing that can be checked')
    if mc.line_ops:
        line, have = locate_ops(mc.column, mc.gt, mc.line_ops)
        # ⚠ A PART'S `keep` CLAIMS ONE CLUSTER, NOT THE WHOLE LINE. Compared
        # whole, John's two keeps on page-056-R:44 "disagreed" with the hand
        # card that removed `[?]` from a different place on the same line —
        # and a refusal blocks the entire write. His keep said the character
        # THIS card asked about is right as printed, and it still is.
        if verdict == 'keep' and mc.part is not None and \
                mc.part < len(mc.line_ops):
            pos = sorted(mc.line_ops)[mc.part]
            raw = corpus(mc.column)[line - 1]
            got = _compose(raw, [e for e in plan.edits
                                 if e.col == mc.column and e.line == line])
            if pos not in review.ops(mc.gt, BEKKER_SPACE.sub('', got)):
                plan.superseded.append(
                    (sid, f'{mc.column}:{line} — a `keep` on ONE dispute of a '
                          f'split line, and the live rulings leave that '
                          f'character exactly as he found it'))
                return
        mine = review.ops(mc.gt, r['detail']) if verdict == 'fix' else {}
        done = bool(mine) and all(have.get(i) == t for i, t in mine.items())
        raw = corpus(mc.column)[line - 1]
        wanted = raw if verdict == 'keep' else \
            remap(raw, review.apply_ops(mc.gt, {**have, **mine}))
    else:
        line, done = locate(mc.column, mc.gt, r.get('detail'))
        raw = corpus(mc.column)[line - 1]
        wanted = raw if done or verdict == 'keep' else remap(raw, r['detail'])
    if done:
        plan.superseded.append(
            (sid, f'{mc.column}:{line} — the corpus already reads what '
                  f'this asked for'))
        return
    live = [e for e in plan.edits if e.col == mc.column and e.line == line]
    got = _compose(raw, live)
    if BEKKER_SPACE.sub('', got) != BEKKER_SPACE.sub('', wanted):
        raise ApplyError(
            f'this ruling wants {wanted!r} at {mc.column}:{line}, and the '
            f'live rulings produce {got!r} — they disagree, and which stands '
            f'is John\'s call')
    plan.superseded.append(
        (sid, f'{mc.column}:{line} — the live rulings already produce '
              f'what this asked for'))


def _elision_bundle(sid: str) -> bool:
    """`pattern:᾽-'` and its three siblings — a bundle whose whole quarrel was
    which codepoint spells the elision mark."""
    if not sid.startswith('pattern:'):
        return False
    a, _, b = sid[len('pattern:'):].partition('-')
    ok = set(elision.MARKS) | {'∅'}
    return bool(a) and bool(b) and a in ok and b in ok


def _orphan_shape_card(plan: Plan, sid: str, r: dict,
                       cards: dict[str, review.Card]) -> None:
    """An encoding ruling keyed by SHAPE, from before the glyph-pair re-key.

    Its detail is the winning spelling of one shape (`Ρα`); the live card
    rules the glyph (`Ρ`). They agree when applying the live glyph to that
    shape's spellings yields exactly the spelling this ruling named.
    """
    shape = sid[len('encoding:'):]
    rows = [x for x in review._tsv(review.ENCODING_TSV, optional=True)
            if x['shape'] == shape and x['tier'] == 'split']
    if not rows:
        raise ApplyError(f'no split rows for shape {shape!r} — the sweep and '
                         f'this ruling no longer describe the same corpus')
    lat, grk = review._pair_of(shape, review._tsv(review.ENCODING_TSV,
                                                  optional=True))
    live = next((c for c in plan.classes
                 if c['sid'] == f'encoding:{lat}-{grk}'), None)
    if live is None or live['verdict'] != 'fix':
        raise ApplyError(f'the live card encoding:{lat}-{grk} is unruled, so '
                         f'nothing supersedes this one')
    other = lat if live['detail'] == grk else grk
    wants = {x['spelling'].replace(other, live['detail']) for x in rows}
    if r['detail'] not in wants:
        raise ApplyError(
            f'this ruling names {r["detail"]!r}; the live glyph ruling '
            f'({live["detail"]!r}) produces {sorted(wants)} — they disagree')
    plan.superseded.append(
        (sid, f'shape {shape} — superseded by encoding:{lat}-{grk}, which '
              f'rules the same ink the same way'))


# --- composition and writing --------------------------------------------------

# An edit reduced to the positions it actually touches, so a conflict is two
# rulings wanting different things AT ONE POSITION rather than two whole-line
# readings that merely differ. It lives in `audit_review` because the queue
# now splits a line by these same positions — one definition, or the card and
# the edit would drift apart on what counts as one dispute.
_ops = review.ops


def _compose(raw: str, edits: list[Edit]) -> str:
    """The line after every edit on it."""
    merged: dict[int, tuple[str, str]] = {}
    for e in edits:
        if e.how != 'line' or e.new == e.old:
            continue
        if e.old != raw:
            raise ApplyError('a whole-line ruling was made against text this '
                             'line no longer holds')
        for i, text in _ops(raw, e.new).items():
            if i in merged and merged[i][0] != text:
                raise ApplyError(
                    f'{e.sid} and {merged[i][1]} rule the same character '
                    f'differently ({text!r} against {merged[i][0]!r})')
            merged[i] = (text, e.sid)
    cur = ''.join(merged[i][0] if i in merged else ch
                  for i, ch in enumerate(raw)) + \
        (merged[len(raw)][0] if len(raw) in merged else '')
    for e in edits:
        if e.how != 'token' or e.token == e.becomes:
            continue
        cur, n = _replace_runs(cur, e.token, e.becomes)
        if n:
            continue
        # ⚠ ALREADY DONE IS NOT UNDONE. At page-021-R:13 the siglum sweep
        # rewrites the whole line, both `Pα` with it, so the glyph-pair
        # ruling that binds the same two sites finds nothing left to change.
        # Its outcome holds; refusing here would report agreement as conflict.
        if e.becomes not in review.LETTER_RUN.findall(cur):
            raise ApplyError(f'{e.token!r} is not on this line by the time '
                             f'{e.sid} reaches it, and {e.becomes!r} is not '
                             f'there either')
    return cur


def compose(plan: Plan) -> tuple[dict[tuple[str, int], str], list]:
    """Every line the plan touches, with its final text."""
    by_line: dict[tuple[str, int], list[Edit]] = {}
    for e in plan.edits:
        by_line.setdefault((e.col, e.line), []).append(e)
    out, refusals = {}, []
    for (col, line), edits in sorted(by_line.items()):
        raw = corpus(col)[line - 1]
        try:
            got = _compose(raw, edits)
        except ApplyError as e:
            for x in {x.sid for x in edits}:
                refusals.append((x, f'{col}:{line}: {e}'))
            continue
        if got != raw:
            out[(col, line)] = got
    return out, refusals


def write_corpus(final: dict[tuple[str, int], str]) -> int:
    cols: dict[str, dict[int, str]] = {}
    for (col, line), text in final.items():
        cols.setdefault(col, {})[line] = text
    for col, lines in cols.items():
        have = corpus(col)
        for line, text in lines.items():
            have[line - 1] = text
        (RECONCILED / f'{col}.txt').write_text('\n'.join(have) + '\n',
                                               encoding='utf-8')
    return len(final)


def record_ledger(plan: Plan, final: dict[tuple[str, int], str]) -> int:
    """Every ruling into `work/rulings/john.json`, through `add()`.

    ⚠ THIS IS THE POINT OF THE STEP. `audit-rulings.json` is a sixth store
    that `migrate()` cannot see; until a ruling is in the ledger it is one
    rebuild away from vanishing. `add()` replaces by id, so running this
    twice records the same rulings once.
    """
    n = 0
    # ⚠ ONE ENTRY PER LINE, NAMING EVERY RULING ON IT. `add()` ids a ruling as
    # col:line:form, so two cards answering one line — the siglum sweep and
    # that line's own audit card, at page-021-R:4 and page-047-R:2 — produce
    # ONE id, and the second `add()` silently replaced the first. Two of
    # John's rulings vanished from the ledger while the step reported success:
    # the 2026-08-12 loss in miniature, inside the very code written to end
    # it. So the entry carries both sids, and both are recoverable from it.
    by_line: dict[tuple[str, int], list[Edit]] = {}
    for e in plan.edits:
        if e.how == 'token':
            continue          # the class ruling below carries these sites
        by_line.setdefault((e.col, e.line), []).append(e)
    for (col, line), es in sorted(by_line.items()):
        sids = sorted({e.sid for e in es})
        verdicts = {e.verdict for e in es}
        line_now = final.get((col, line), es[0].old)
        detail = '; '.join(f'{e.sid} → {e.verdict}' for e in es)
        if verdicts == {'none'}:
            kind, form, applied = 'declined', '', False
            note = ('the ink reads none of the offered readings; a follow-up '
                    'card is owed')
        else:
            kind = 'text' if 'fix' in verdicts else 'keep'
            form, applied = line_now, True
            note = ('ruled against the 400 dpi ink in the ground-truth audit '
                    'queue')
        john_rulings.add(kind, col=col, line=line, form=form,
                         ruled='audit ' + ' + '.join(sids), quote=es[0].old,
                         note=f'{note} · {detail}',
                         source=SOURCE, date=DATE, applied=applied)
        n += 1
    for c in plan.classes:
        # ⚠ THE RESOLVED SITE LIST TRAVELS WITH THE RULING. It was never
        # stored with the verdict — the queue re-derives it from the corpus
        # every build — so this is where the scope John actually ruled on
        # stops being re-computable and starts being recorded.
        john_rulings.add('policy',
                         ruled=f'audit {c["sid"]}',
                         quote=' '.join(c['sites']),
                         note=f'{c["verdict"]} → {c["detail"] or "none"}; '
                              f'{len(c["sites"])} sites bound, '
                              f'{len(c["excluded"])} excluded by ✕; ruled '
                              f'against the 400 dpi ink in the ground-truth '
                              f'audit queue',
                         source=SOURCE, date=DATE, applied=True)
        n += 1
    for sid, why in plan.superseded:
        # ⚠ A SUPERSEDED RULING IS STILL A RULING. These are the answers John
        # gave to cards this session then renamed — the homoglyph lines folded
        # into the glyph-pair cards, and the encoding cards re-keyed from
        # shape to glyph pair. Nothing is applied from them, because a later
        # card rules the same ink the same way; but leaving them out of the
        # ledger would let the rename finish the job of losing them, which is
        # [[carry-rulings-by-site]] exactly.
        john_rulings.add('policy', ruled=f'audit {sid}', note=f'superseded: '
                         f'{why}. Recorded so the ruling is not lost with the '
                         f'card it was made on.',
                         source=SOURCE, date=DATE, applied=None)
        n += 1
    return n


def corrigenda_for(plan: Plan, final: dict[tuple[str, int], str]) -> list[dict]:
    """The sites John flagged as the compositor's own error.

    The verdict says what the ink prints and the text keeps it; the flag banks
    the correction for the revised edition. Both facts, neither traded for the
    other.
    """
    out = []
    for e in plan.edits:
        if not e.erratum or e.how == 'none':
            continue
        printed = final.get((e.col, e.line), e.old)
        page, _, col = e.col[len('page-'):].partition('-')
        out.append({
            'page': int(page), 'col': col, 'line': e.line,
            'printed': printed, 'correct': '',
            'rule': 'ground-truth audit: John ruled the 400 dpi ink',
            'authority': 'John ruled this line against the 400 dpi ink in '
                         'the audit queue and marked it a printer\'s error: '
                         'the reading is print-accurate, and the print is '
                         'wrong.',
            'checked': f'400dpi {DATE}',
            'note': f'audit ruling {e.sid} · {DATE} · registered '
                    f'automatically; the correct reading is not yet ruled',
        })
    return out


def bank_corrigenda(entries: list[dict]) -> int:
    if not entries or not CORRIGENDA.exists():
        return 0
    doc = json.loads(CORRIGENDA.read_text(encoding='utf-8'))
    have = {(e['page'], e['col'], e['line'], e['printed'])
            for e in doc['entries']}
    fresh = [e for e in entries
             if (e['page'], e['col'], e['line'], e['printed']) not in have]
    if fresh:
        doc['entries'].extend(fresh)
        CORRIGENDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1)
                              + '\n', encoding='utf-8')
    return len(fresh)


# --- driver -------------------------------------------------------------------

def ledger_conflicts(plan: Plan,
                     final: dict[tuple[str, int], str]) -> list[tuple[str, str]]:
    """Edits that would falsify a ruling John has already made.

    ⚠ THIS IS THE 2026-08-08 FAILURE, AND THIS MODULE REPRODUCED IT. A later
    pass overwrote two of his July rulings and nothing noticed for weeks; the
    ledger exists so that cannot recur. The first run of this step changed
    `Ζμγ9. 673` to `673 → 679` at page-028-R:24, against his own ruling of
    2026-08-09, and dropped `9.` from `σ9. 973 a` at page-027-R:47, against
    2026-08-10. Both are John contradicting John a day apart, which is his to
    settle and nobody else's — so the edit refuses and names both rulings.

    A `reversed_by` entry is exempt: he has already said that one is
    superseded, and only a hand-added field can say so.
    """
    who: dict[tuple[str, int], set[str]] = {}
    for e in plan.edits:
        who.setdefault((e.col, e.line), set()).add(e.sid)
    out = list(_corrigenda_conflicts(final, who)) + \
        list(_grammar_conflicts(final, who))
    for r in john_rulings.load()['rulings']:
        key = (r.get('col'), r.get('line'))
        if key not in final or r.get('reversed_by'):
            continue
        if r['kind'] not in john_rulings.CHECKABLE or r['kind'] == 'damage':
            continue
        want = john_rulings.canon(r.get('form', ''))
        if not want or want in john_rulings.canon(final[key]):
            continue
        out.append((key, ' + '.join(sorted(who.get(key, {'?'}))),
                    f'{key[0]}:{key[1]} — this edit would falsify a ruling '
                    f'John made on {r["date"]} ({r["source"]}): '
                    f'{r["form"]!r} would no longer be on the line, which '
                    f'would read {final[key]!r}. Two of his own rulings '
                    f'disagree; which stands is his call.'))
    return out


def _grammar_conflicts(final: dict[tuple[str, int], str],
                       who: dict[tuple[str, int], set[str]]):
    """Edits that would spell a word no grammar allows.

    ⚠ THIS IS NOT THE GRAMMAR OVERRULING A READING, AND IT MUST NEVER BECOME
    THAT. Bonitz PRINTED `ἄνθρώπȣ` with two accents on page 60 and the corpus
    keeps it; `transcription_doc` says so in as many words. The rule only
    reports that the printing was wrong, which is what a corrigendum records.

    But a class ruling that CREATES such a word is a different animal. On
    2026-08-14 `pattern:ο-ό` — add an acute to an omicron, ruled once for two
    sites — turned `ἀκυροτέρων` into `ἀκυρότέρων` at page-042-L:5. The ink may
    well print that; it is not what John was asked, because the card showed
    him a glyph pair and not the word it lands in. So the line is withheld and
    both facts are named: if the ink really does carry two accents, the ruling
    stands with the erratum flag, and that is his call to make deliberately.
    """
    from bonitz_pipeline.settle_apply import impossible_reason
    for key, text in final.items():
        for word in text.split():
            why = impossible_reason(word)
            if not why:
                continue
            if any(impossible_reason(w) for w in corpus(key[0])[key[1] - 1].split()
                   if w == word):
                continue          # it was already spelt that way; not this edit
            yield (key, ' + '.join(sorted(who.get(key, {'?'}))),
                   f'{key[0]}:{key[1]} — this edit would spell {word!r}, and '
                   f'{why}. The card asked about a glyph, not about the word '
                   f'it lands in. If the ink really prints it that way, rule '
                   f'it again with the erratum flag; nothing is written until '
                   f'then.')


def _corrigenda_conflicts(final: dict[tuple[str, int], str],
                          who: dict[tuple[str, int], set[str]]):
    """Edits that would falsify the corrigenda register.

    ⚠ THE LEDGER IS NOT THE ONLY PLACE A HUMAN LOOK IS RECORDED, AND THIS
    GUARD LEARNT THAT THE HARD WAY. On 2026-08-14 the class ruling
    `pattern:ἀ-ἁ` — 16 sites, none excluded — rewrote page-044-R:27 from
    smooth to rough, and nothing refused it. That site had been examined at
    400 dpi on 2026-08-08, ruled SMOOTH with the reasoning written down
    ("identical in shape to `ἄρτοι` beside it, unlike the rough on `ὑπὸ` at
    l.42"), and an automated rough-propagation there had been explicitly
    reverted. The register said so; `ledger_conflicts` read only
    work/rulings/john.json and could not see it.

    A corrigendum is a claim about what the page PRINTS. An edit that removes
    the printed form does not merely disagree with it — it makes the register
    describe a corpus that no longer exists.
    """
    if not CORRIGENDA.exists():
        return
    doc = json.loads(CORRIGENDA.read_text(encoding='utf-8'))
    for e in doc['entries']:
        key = (f'page-{e["page"]:03d}-{e["col"]}', e['line'])
        if key not in final or not e.get('printed'):
            continue
        if e['printed'] in final[key]:
            continue
        yield (key, ' + '.join(sorted(who.get(key, {'?'}))),
               f'{key[0]}:{key[1]} — this edit would falsify the corrigenda '
               f'register, which records from {e.get("checked", "a 400 dpi "
               "look")} that the page PRINTS {e["printed"]!r}. The line would '
               f'read {final[key]!r}, and the register would then describe a '
               f'corpus that does not exist. Two of his own observations '
               f'disagree; which stands is his call.')


def recorded_sids() -> set[str]:
    """Audit rulings the ledger already holds.

    ⚠ THE LEDGER IS THE MEMORY, NOT THE QUEUE. Applying a ruling changes the
    corpus the sweeps read, so the sweep TSVs — and the cards built from them
    — stop describing it: the division finding this step mends is the finding
    `audit_review` then refuses to rebuild, by design. A step that had to
    re-derive its own history from those cards could therefore run exactly
    once. What it has already recorded is a question for `work/rulings/
    john.json`, which is the store that outlives every rebuild.
    """
    out = set()
    for r in john_rulings.load()['rulings']:
        if r.get('source') == SOURCE and r.get('ruled', '').startswith('audit '):
            out.update(r['ruled'][len('audit '):].split(' + '))
    return out


def build_plan(store: Path | None = None) -> tuple[Plan, dict]:
    store = store or review.RULINGS
    if not store.exists():
        raise ApplyError(f'{store} does not exist — nothing has been ruled')
    have = json.loads(store.read_text(encoding='utf-8'))
    # ⚠ AN ENTRY IS NOT A RULING. A card carrying only an ✕, or one REOPENED
    # after a defect in how it was drawn, has an entry and an empty verdict.
    # Fed to `resolve` it fails the option check — '' is not a button any card
    # offers — and one refusal stops every other ruling from being written.
    rulings = {sid: r for sid, r in have.items() if r.get('verdict')}
    if not rulings:
        raise ApplyError(f'{store} holds no rulings')
    done = recorded_sids()
    fresh = {sid: r for sid, r in rulings.items() if sid not in done}
    if not fresh:
        # Every ruling is in the ledger, so the cards are not needed — and
        # asking for them would fail on the very sweeps this step corrected.
        plan = Plan()
        plan.recorded = sorted(rulings)
        return plan, {}
    cards = {c.sid: c for c in review.load_cards()}
    plan = resolve(cards, fresh, review.line_cards())
    plan.recorded = sorted(done & set(rulings))
    final, clashes = compose(plan)
    plan.refusals.extend(clashes)
    if clashes:
        final = {}
    # ⚠ WITHHELD, NOT REFUSED WHOLESALE. A ruling that cannot be resolved at
    # all means the inputs disagree and applying half of them is guesswork, so
    # it stops everything. A ruling that contradicts one of John's earlier
    # rulings is a different animal: it is fully understood, both sides are
    # named, and the precise action is to leave those lines exactly as they
    # are — unwritten AND unrecorded, so the next run offers them again once
    # he has settled it — while the other hundred-odd rulings land.
    conflicts = ledger_conflicts(plan, final)
    plan.withheld = [(sid, why) for _key, sid, why in conflicts]
    lines = {key for key, _sid, _why in conflicts}
    if lines:
        final = {k: v for k, v in final.items() if k not in lines}
        plan.edits = [e for e in plan.edits if (e.col, e.line) not in lines]
    return plan, final


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--apply', action='store_true',
                   help='write the corpus, the ledger and the corrigenda '
                        '(default: report and write nothing)')
    p.add_argument('--store', type=Path, default=None)
    p.add_argument('--show', type=int, default=15)
    a = p.parse_args(argv)

    plan, final = build_plan(a.store)
    store = a.store or review.RULINGS
    rulings = json.loads(store.read_text(encoding='utf-8'))

    verdicts = {v: sum(1 for r in rulings.values()
                       if r.get('verdict') == v) for v in
                ('keep', 'fix', 'none')}
    print(f'{len(rulings)} rulings in {store.relative_to(ROOT)} — '
          + ', '.join(f'{k} {v}' for k, v in verdicts.items()))
    print(f'  already in the ledger: {len(plan.recorded)} (not re-applied)')
    print(f'  resolved to sites:   {len(plan.edits)}')
    print(f'  class rulings:       {len(plan.classes)} '
          f'({sum(len(c["sites"]) for c in plan.classes)} sites bound)')
    print(f'  superseded:          {len(plan.superseded)}')
    print(f'  lines that change:   {len(final)}')
    errata = corrigenda_for(plan, final)
    print(f'  errata to bank:      {len(errata)}')
    if plan.withheld:
        print(f'\n⚠ {len(plan.withheld)} ruling(s) WITHHELD — they contradict '
              f'a ruling John already made, so those lines are left exactly '
              f'as they are, and nothing about them is recorded:')
        for sid, why in plan.withheld:
            print(f'  {sid}\n      {why}')

    for sid, why in plan.superseded:
        print(f'  superseded  {sid}\n              {why}')
    shown = 0
    for (col, line), text in sorted(final.items()):
        if shown >= a.show:
            print(f'  … {len(final) - shown} more')
            break
        shown += 1
        print(f'  {col}:{line}')
        print(f'    -  {corpus(col)[line - 1][:92]}')
        print(f'    +  {text[:92]}')

    if plan.refusals:
        print(f'\n⚠ {len(plan.refusals)} REFUSED — nothing is written while '
              f'any ruling refuses:')
        for sid, why in plan.refusals:
            print(f'  {sid}\n      {why}')
        return 1

    if not a.apply:
        print('\nDRY RUN — nothing written. Re-run with --apply to write '
              'work/reconciled, the ledger and the corrigenda register.')
        return 0

    n = write_corpus(final)
    banked = bank_corrigenda(errata)
    recorded = record_ledger(plan, final)
    print(f'\n{n} lines written to work/reconciled')
    print(f'{recorded} rulings recorded in {john_rulings.LEDGER.name}')
    print(f'{banked} corrigenda banked')
    return 0


if __name__ == '__main__':
    sys.exit(main())
