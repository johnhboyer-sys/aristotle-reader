"""Every sweep's findings for a page range, merged into ONE review queue.

Six checks flag sites on 53-62 and each has its own report format, its own
card style and its own ruling store. Ruling them separately means six sittings
over the same ten pages, and a site that two sweeps both flag gets asked twice.

So this normalises them to the queue shape `settle_review` already serves —
the format John cleared 299 cards in — and merges by SITE, so a place flagged
by three sweeps is one entry carrying three reasons rather than three entries.

⚠ ONE ENTRY PER SITE IS NOT ONE CARD PER SITE. `settle_review` then groups
entries by FORM-SET, which is its design: one ruling covers every instance of
the same question, and the card says how many sites it binds. 36 entries
become 33 cards on 53-62 — three pairs where the same word raises the same
question twice. That is intended, but it means a ruling reaches a site whose
crop was not the one on screen, so the forms must be genuinely identical for
it to be safe. They are here; check it when the range changes.

    python3 -m bonitz_pipeline.merge_review --pages 53-62
    python3 -m bonitz_pipeline.merge_review --pages 53-62 --write

Then serve it with the existing tool:

    python3 -m bonitz_pipeline.settle_review \\
        --queue work/queue-review-53-62.json \\
        --rulings work/sweeps/review-rulings.json --only-unruled

⚠ A FINDING THAT CANNOT BE ANCHORED IS REPORTED, NOT DROPPED. The sweeps give
a line and a word, not an offset, so each has to be located in the Opus stream.
Where a word occurs twice on its line, every occurrence becomes its own card —
guessing which one the sweep meant would put John on the wrong glyph, and being
on the wrong glyph is indistinguishable from being unsure.

⚠ THE CARD SHOWS THE PRINTED TOKEN, NOT THE SWEEP'S TOKEN. John ruled 35 cards
on 53-62 and answered "none of these" on seven of them — every one because the
card asked about something that is not what the page prints. His diagnosis:
the call was on part of a word; or it left out an apostrophe; or it asked about
a hyphenated word without recognising the hyphen. A "none" caused by the card is
a defect in the builder, so the sweep's token is now widened to the whole
PRINTED token before anything else happens:

  * `ἀπόπλ`  ->  `ἀπόπλ[?]ς`   damage marker and the letters past it
  * `κατ`    ->  `κατ᾽`        the elision apostrophe belongs to the word
  * `ὑπερ`   ->  `ὑπερ-ἔχοντας`  head, printed hyphen, next line's tail
  * `ληψις`  ->  `ἀνά-ληψις`   a tail carries the head it continues

and every candidate form is then LAID ON that printed skeleton, so a reading
that cannot exist on the page (`ἑξουσιν` where the sort is `ȣ`) is either mapped
back onto it (`ἕξȣσιν`) or refused a button and stated in the reason instead.

⚠ AND A SWEEP'S `expected` IS A KEY, NOT A READING. `accent_key` drops
breathings and `breath_key` drops accents — each sweep asks about its own marks
and throws the rest away before it speaks. Laying the whole key on the page
deletes a mark nobody disputed, which is how a card came to offer `ὑπερεχοντας`
against ink that plainly reads `έχοντας`. Each candidate now carries only the
marks its sweep has authority over.
"""

from __future__ import annotations

import argparse
import json
import difflib
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from .normalize import (canonical, clean_opus, corpus_column,
                        corpus_columns)
# One list of apostrophe sorts for the whole project — the sweep that reports
# elision and the queue that shows it must agree on what an apostrophe is.
from .smyth_sweep import APOSTROPHES, FINAL_OK

# A letter in any script, so a match inside a longer word is refused.
LETTER = re.compile(r'[^\W\d_]', re.UNICODE)


def _joined(ch: str) -> bool:
    """True when `ch` cannot begin or end a form — a letter, or a mark bound
    to the character before it.

    ⚠ A COMBINING MARK IS NOT A BOUNDARY. `ȣ` and `ϗ` have no precomposed
    accented forms, so they stay DECOMPOSED even under NFC — `τȣ̀ς` is really
    τ + ȣ + U+0300 + ς. The letter test alone called U+0300 a boundary, so the
    form `τȣ` matched inside `τȣ̀ς` and the card pointed at a bare ligature
    where the page carries an accented one. These two sorts are the ones this
    edition turns on, and `ϗ̀` is always accented, so this is the wrong-glyph
    failure in the place it costs most.
    """
    return bool(LETTER.match(ch)) or unicodedata.combining(ch) != 0

ROOT = Path(__file__).resolve().parent.parent
SWEEPS = ROOT / 'work' / 'sweeps'
OPUS = ROOT / 'raw' / 'opus'


@dataclass
class Finding:
    page: int
    col: str
    line: int
    printed: str
    expected: str = ''
    sources: list = field(default_factory=list)   # (sweep, why)
    context: str = ''
    expected_from: str = ''                       # the sweep that expected it
    # ⚠ EVERY SWEEP'S EXPECTATION, NOT JUST THE FIRST. Keeping one meant that
    # at 60-R:35 the accent sweep's key `ταυτό` took the slot and LlamaParse's
    # actual reading `ταὐτό` never became a button — while the reason text
    # named it. A card that prints a reading and will not let you choose it is
    # the "readers cannot offer what none of them saw" defect with the evidence
    # in plain view.
    expecteds: list = field(default_factory=list)   # (form, sweep)


# ⚠ AN `expected` IS NOT A READING — IT IS A KEY, AND IT ONLY SPEAKS ABOUT ITS
# OWN MARKS. `accent.accent_key` is documented "breathing dropped, accents
# kept"; `breathing.breath_key` is "accents stripped, breathing kept". So the
# breathing sweep's `ὑπερεχοντας` does not claim the page carries no accent —
# it claims no BREATHING, and its own key threw the accents away before it
# spoke. Offering that string as a button asks John to delete an accent the
# sweep never mentioned; the ink on 57-R:8 plainly reads `έχοντας`, so both of
# that card's buttons were wrong and "none of these" was the only true answer.
#
# Each candidate therefore carries the marks it has authority over. Everything
# else on the letter stays exactly as the page prints it.
SMOOTH, ROUGH = '̓', '̔'
ACUTE, GRAVE, CIRC, CIRC_ALT = '́', '̀', '͂', '̃'
DIAERESIS, IOTA_SUB = '̈', 'ͅ'
BREATHINGS = frozenset((SMOOTH, ROUGH))
ACCENTS = frozenset((ACUTE, GRAVE, CIRC, CIRC_ALT))
# None = a literal reading by a reader, which speaks about everything.
AUTHORITY = {'accent': ACCENTS, 'breathing': BREATHINGS}
_MARK_ORDER = {SMOOTH: 0, ROUGH: 0, DIAERESIS: 1,
               ACUTE: 2, GRAVE: 2, CIRC: 2, CIRC_ALT: 2}


def _nfc(s: str) -> str:
    return unicodedata.normalize('NFC', s or '')


def _tsv(path: Path, lo: int, hi: int):
    """Rows of a sweep report in range, as dicts keyed by its header."""
    if not path.exists():
        return
    rows = path.read_text(encoding='utf-8').splitlines()
    if not rows:
        return
    head = rows[0].split('\t')
    for r in rows[1:]:
        if not r.strip():
            continue
        d = dict(zip(head, r.split('\t')))
        m = re.match(r'page-(\d+)-([LR])', d.get('column', ''))
        if not m:
            continue
        p = int(m.group(1))
        if lo <= p <= hi:
            d['_page'], d['_col'] = p, m.group(2)
            yield d


def collect(lo: int, hi: int) -> list[Finding]:
    """Every sweep's say, merged by (page, col, line, printed form)."""
    merged: dict[tuple, Finding] = {}

    def add(page, col, line, printed, expected, sweep, why, context=''):
        printed = _nfc(printed)
        key = (page, col, int(line), printed)
        f = merged.get(key)
        if f is None:
            f = merged[key] = Finding(page, col, int(line), printed,
                                      _nfc(expected), [], context,
                                      sweep if expected else '')
        # Every expectation is kept, each tagged with the sweep that made it —
        # they are read with different authority and become different buttons.
        if expected:
            pair = (_nfc(expected), sweep)
            if pair not in f.expecteds:
                f.expecteds.append(pair)
            if not f.expected:
                f.expected, f.expected_from = pair
        f.sources.append((sweep, why))
        if context and not f.context:
            f.context = context

    from . import accent, breathing
    # ⚠ A PAGE IN NO CORPUS STAGE IS NOT A CLEAN PAGE. `accent.scan` and
    # `breathing.scan` use required=False and answer [] for a page that does
    # not exist, so build(9999, 9999) returned zero sites and zero orphans —
    # the exact "reports clean about what it never opened" failure this queue
    # was built in response to. Ask for the columns first; corpus_columns
    # raises for a page it cannot find.
    corpus_columns(range(lo, hi + 1))
    for page in range(lo, hi + 1):
        for col in ('L', 'R'):
            # ⚠ `wrote`, NOT `printed`. Both modules expose the literal form
            # as `wrote` and an accent-stripped skeleton as `printed`; the
            # skeleton is not on the page and cannot be anchored to it.
            for r in accent.scan(page, col):
                add(page, col, r['line'], r['wrote'], r.get('expected', ''),
                    'accent', 'accent contradicts the corpus', r.get('context', ''))
            for r in breathing.scan(page, col):
                add(page, col, r['line'], r['wrote'], r.get('expected', ''),
                    'breathing',
                    f"breathing contradicts the corpus ({r.get('strength','')})",
                    r.get('context', ''))

    for d in _tsv(SWEEPS / 'accent-law-violations.tsv', lo, hi):
        add(d['_page'], d['_col'], d['line'], d['word'], '',
            'accent_law', d.get('rule', ''), d.get('context', ''))

    for p in sorted((SWEEPS / 'smyth').glob('*.tsv')):
        if p.name.startswith('_'):
            continue                      # silenced tokens, not findings
        for d in _tsv(p, lo, hi):
            add(d['_page'], d['_col'], d['line'], d['word'], '',
                f'smyth:{p.stem}', d.get('detail', ''), d.get('context', ''))

    for d in _tsv(SWEEPS / 'diacritic-candidates.tsv', lo, hi):
        add(d['_page'], d['_col'], d['line'], d['corpus'], d.get('llama', ''),
            'diacritic', f"LlamaParse reads {d.get('llama','')} "
                         f"({d.get('marks','')})", d.get('context', ''))

    # ⚠ THE RANGE-NAMED REPORT IS NOT THE ONLY ONE. `siglum-check-53-62.tsv`
    # exists only because that exact range was run; `build(54, 60)` found no
    # siglum findings at all while the whole-corpus report held five for those
    # pages. Read every siglum report and let the page filter decide.
    siglum_reports = sorted(SWEEPS.glob('siglum-check*.tsv'))
    seen_siglum: set = set()
    for report in siglum_reports:
      for d in _tsv(report, lo, hi):
        key = (d['_page'], d['_col'], d['line'], d.get('token', ''))
        if key in seen_siglum:
            continue
        seen_siglum.add(key)
        add(d['_page'], d['_col'], d['line'], d['token'], '',
            'siglum', d.get('why', ''), d.get('citation', ''))

    return [merged[k] for k in sorted(merged)]


_LINES: dict = {}


def corpus_lines(page: int, col: str) -> list | None:
    """The transcribed column as NFC lines, or None when it is in no stage."""
    key = (page, col)
    if key not in _LINES:
        src = corpus_column(page, col, required=False)
        _LINES[key] = (None if src is None
                       else _nfc(src.read_text(encoding='utf-8')).splitlines())
    return _LINES[key]


def anchor(f: Finding) -> list[tuple[int, int]]:
    """Character offsets within the printed line where this form sits.

    ⚠ ANCHOR IN THE CORPUS, NOT IN raw/opus. The sweeps read the corpus, and
    the corpus is not the Opus stream: `ἄνθρώπȣ` at 60-L:46 carries two accents
    only because John ruled it so, and raw/opus still holds the single-accented
    reading it was read as. Anchoring in Opus lost that site and twelve others.
    (The settle queue's `word_off` IS an Opus offset — deliberately, so rulings
    survive a re-read. This queue is not that queue and says so.)

    ⚠ NEVER ONE ANSWER BY DEFAULT. `str.find` takes the first occurrence, and a
    token repeats on its line often enough that this project already paid for
    it once (417 citations). Two hits means two cards, not a coin toss.
    """
    lines = corpus_lines(f.page, f.col)
    if lines is None:
        return []
    want = f.printed
    if not want:
        return []

    # ⚠ THE REPORTED LINE IS NOT ALWAYS THE LINE. `accent` attributes four of
    # these to the line BEFORE the one the word sits on. Rather than trust or
    # "correct" its numbering, look in a one-line window and record which line
    # actually held the form, so a wrong attribution is visible instead of
    # being silently absorbed.
    for ln in (f.line, f.line + 1, f.line - 1):
        if not (1 <= ln <= len(lines)):
            continue
        line = lines[ln - 1]
        out, i = [], 0
        while True:
            i = line.find(want, i)
            if i < 0:
                break
            # ⚠ WORD BOUNDARIES, OR THE CARD POINTS AT THE WRONG GLYPH. `find`
            # matched `ὑπερ` inside `ὑπερβάλ-` and `παλιν` inside `ἀνάπαλιν`,
            # putting two cards mid-word. A reader cannot tell a mis-anchored
            # crop from a correct one, so an unanchorable finding must be
            # reported rather than placed approximately.
            before = line[i - 1] if i > 0 else ''
            after = line[i + len(want)] if i + len(want) < len(line) else ''
            if not _joined(before or ' ') and not _joined(after or ' '):
                out.append((ln, i))
            i += 1
        if out:
            return out
    line = lines[f.line - 1] if 1 <= f.line <= len(lines) else ''
    # ⚠ THE WORD MAY BE BROKEN ACROSS THE LINE. Bonitz hyphenates at the
    # measure, and the sweeps rejoin the halves before judging — so the form
    # they report (`ἀγνοιαν`) exists on no single line, which is why seven
    # findings anchored nowhere. Point at the line where the word BEGINS: the
    # longest prefix that ends this line before its hyphen.
    stripped = line.rstrip()
    if stripped.endswith('-') and len(want) > 1:
        head = stripped[:-1]
        nxt = lines[f.line] if f.line < len(lines) else ''
        # A one-character head is legitimate — Bonitz breaks `ἀ-γνοιαν` — so
        # the length floor that first guarded this was wrong and orphaned a
        # real site. The CONTINUATION check is the discriminator: the rest of
        # the word must actually begin the next line.
        for n in range(len(want) - 1, 0, -1):
            if not head.endswith(want[:n]):
                continue
            start = len(head) - n
            # ⚠ THE PREFIX MUST BE A WHOLE WORD-HEAD AND THE WORD MUST
            # CONTINUE. Without these, `ανα-` at the end of a line answered a
            # finding for `αναλαμβανειν`, matched inside `συνανα-`, and a lone
            # `ν-` answered `νεος`. A shared prefix is not the same word.
            before = head[start - 1] if start > 0 else ' '
            if _joined(before):
                continue
            if not nxt.startswith(want[n:]):
                continue
            return [(f.line, start)]
    return []


# ---------------------------------------------------------------------------
# The printed token
# ---------------------------------------------------------------------------

@dataclass
class Piece:
    """One printed line's share of a token. A word broken at the measure has
    two: the head (ending in the printed hyphen) and the tail."""
    line: int
    start: int
    text: str


@dataclass
class Token:
    pieces: list
    # '' not broken · 'verified' the sweep's form spans the break and agrees ·
    # 'unverified' the form stops at the break, so nothing checks the join ·
    # 'refused' the next line does not continue this word, so it was not joined
    join: str = ''

    @property
    def printed(self) -> str:
        return ''.join(p.text for p in self.pieces)

    @property
    def texts(self) -> list:
        return [p.text for p in self.pieces]

    @property
    def broken(self) -> bool:
        return len(self.pieces) > 1


def _span(line: str, a: int, b: int) -> tuple[int, int]:
    """Grow [a, b) to the whole printed token on this line.

    ⚠ THE SWEEP'S TOKEN IS NOT THE PRINTED ONE. Every sweep tokenises for its
    own question and stops where its own regex stops: `smyth` stops at the
    apostrophe it is reporting (`κατ` for `κατ᾽`) and at the bracket of a damage
    marker (`ἀπόπλ` for `ἀπόπλ[?]ς`). Showing that stub on the card asks John
    about a word the page does not contain, and he answered seven such cards
    "none of these" — correctly.

    So: letters and their marks, a damage marker `[…]` and whatever follows it,
    a closing elision apostrophe, and the hyphen a broken word ends its line
    with. An apostrophe ENDS the token: `ἀλλ'ὅταν` is two words, which is what
    smyth_sweep._parts already decides.

    Requires `[a, b)` to open ON the token — which `anchor` guarantees, since
    it resolves to the offset a letter sits at. Grown from a space the two
    ends would straddle it and the span would cover two words.
    """
    n = len(line.rstrip())
    while b < len(line):
        ch = line[b]
        if _joined(ch):
            b += 1
            continue
        if ch == '[':
            j = line.find(']', b)
            if j < 0:
                break
            b = j + 1
            continue
        if ch in APOSTROPHES:
            b += 1
        elif ch == '-' and b + 1 >= n:
            b += 1
        break
    while a > 0:
        ch = line[a - 1]
        if _joined(ch):
            a -= 1
            continue
        if ch == ']':
            j = line.rfind('[', 0, a - 1)
            if j < 0:
                break
            a = j
            continue
        # An apostrophe with no letter behind it is a breathing set as its own
        # sort, which this typeface does before a capital (`᾽Αμνέα` = Ἀμνέα) —
        # part of the word. One behind a letter elides THAT word, not this.
        if ch in APOSTROPHES and (a == 1 or not _joined(line[a - 2])):
            a -= 1
        break
    return a, b


def token_at(lines: list, ln: int, at: int, want: str) -> Token:
    """The printed token holding `want` at (ln, at), across the measure break.

    ⚠ A HYPHEN AT THE MEASURE IS PRINTED AND MUST BE SHOWN. Bonitz breaks words
    at the line end and prints the hyphen; the sweeps rejoin the halves before
    judging, so they report `ὑπερεχοντας` — a form on no line of the book. A
    card headed with the rejoined word asks John to rule on a word he cannot
    find in the crop. Both halves, with the hyphen between them, are what the
    page shows.
    """
    line = lines[ln - 1]
    # ⚠ THE SWEEP'S FORM MAY BE LONGER THAN THE LINE. `anchor` resolves a word
    # broken at the measure to the line it BEGINS on, so `want` is the rejoined
    # `ὑπερεχοντας` while the line holds `ὑπερ-`. Opening the span at
    # at+len(want) then ran past the line end, the hyphen was never seen, and
    # the token came back as the bare head. Open on one character and let the
    # span grow — a token is a maximal run either way.
    end = at + len(want) if line[at:at + len(want)] == want else at + 1
    a, b = _span(line, at, min(end, len(line)))
    here = Piece(ln, a, line[a:b])
    pieces, join = [here], ''
    n = len(line.rstrip())
    if b == n and b and line[b - 1] == '-' and ln < len(lines):
        nxt = lines[ln]
        j, k = _span(nxt, 0, 0)
        if k > j:
            join = _join_state(want, here.text, nxt[j:k], at_head=True)
            if join != 'refused':
                pieces.append(Piece(ln + 1, j, nxt[j:k]))
    elif a == 0 and ln > 1:
        prev = lines[ln - 2]
        p = len(prev.rstrip())
        if p and prev[p - 1] == '-':
            i, j = _span(prev, p - 1, p)
            if j > i:
                join = _join_state(want, prev[i:j], here.text, at_head=False)
                if join != 'refused':
                    pieces.insert(0, Piece(ln - 1, i, prev[i:j]))
    return Token(pieces, join)


def _join_state(want: str, head: str, tail: str, *, at_head: bool) -> str:
    """Whether the sweep's form vouches for joining these two halves.

    ⚠ A TRAILING HYPHEN IS NOT A PROOF OF CONTINUATION. `anchor` checks that
    the next line really does continue the word (`nxt.startswith(want[n:])`)
    before it will resolve a broken word — and this joined the halves with no
    check at all, so a line ending `ἀ-` above a line beginning `λόγος` would
    have produced the word `ἀ-λόγος` and put it on a card. Every join on 53-62
    happens to be right, which is exactly the condition under which a missing
    check is invisible.

    Three answers, never a silent guess: the form spans the break and agrees,
    the form stops at the break so nothing checks it, or the form contradicts
    the join and the halves are left apart.
    """
    w, h, t = _base(want), _base(head), _base(tail)
    joined = h + t
    if not w or not t:
        return 'unverified'
    if at_head:
        if len(w) <= len(h):
            return 'unverified'          # the form ends at the hyphen
        return 'verified' if joined.startswith(w) else 'refused'
    if len(w) <= len(t):
        return 'unverified'              # the form begins at the line start
    return 'verified' if joined.endswith(w) else 'refused'


# ---------------------------------------------------------------------------
# Laying a candidate form on the printed skeleton
# ---------------------------------------------------------------------------

def _base(s: str) -> str:
    """The printed letters, with every mark and every point stripped off.

    Case-folded: `Μαίων` against llama's `μαιῶν` is a disagreement about which
    sort was set, which is a question the ink can answer and so a question a
    card may ask. Refusing it as unconstructible would take a real reading off
    the card, which is the failure this whole pass exists to end.
    """
    d = unicodedata.normalize('NFD', s)
    return ''.join(c for c in d
                   if not unicodedata.combining(c) and LETTER.match(c)).lower()


def _letters(s: str) -> list:
    """[[character, [its combining marks]], …] over NFD."""
    out: list = []
    for ch in unicodedata.normalize('NFD', s):
        if unicodedata.combining(ch) and out:
            out[-1][1].append(ch)
        else:
            out.append([ch, []])
    return out


def _order(marks: list) -> str:
    """Breathing, then diaeresis, then accent — NFC will not reorder these."""
    seen = list(dict.fromkeys(marks))
    return ''.join(sorted(seen, key=lambda m: _MARK_ORDER.get(m, 3)))


def _lay_from(base: str, cand: list, i: int, marks) -> tuple[str, int]:
    """`base`'s letters wearing `cand`'s marks, reading `cand` from letter `i`.

    `marks` is the set of combining characters `cand` has authority over, or
    None when it is a reader's literal transcription and speaks about all of
    them. Every mark outside that authority stays as the page prints it.
    """
    out = []
    for ch, printed in _letters(base):
        if not LETTER.match(ch) or unicodedata.combining(ch):
            out.append(ch + ''.join(printed))   # hyphen, apostrophe, [?] …
            continue
        while i < len(cand) and not (LETTER.match(cand[i][0])
                                     and not unicodedata.combining(cand[i][0])):
            i += 1
        if i >= len(cand):
            out.append(ch + ''.join(printed))
            continue
        c_ch, c_marks = cand[i]
        i += 1
        # ⚠ THE PRINTED SORT, NEVER THE READER'S SPELLING — except for case,
        # where a reader is claiming a different sort and not a different
        # spelling of the same one, and only where it speaks about sorts.
        letter = c_ch if (marks is None and c_ch.lower() == ch.lower()) else ch
        keep = (c_marks if marks is None
                else [m for m in printed if m not in marks]
                + [m for m in c_marks if m in marks])
        out.append(letter + _order(keep))
    return unicodedata.normalize('NFC', ''.join(out)), i


def religate(form: str) -> str:
    """`οὖσα` -> `ȣ̓͂σα` — settle_review's, imported late (it needs PIL)."""
    from .settle_review import religate as _r
    return _r(form)


def lay_on(texts: list, cand: str, sweep: str = '') -> list | None:
    """`cand` written on the printed pieces, or None when it cannot be.

    ⚠ AN OFFERED FORM MUST BE CONSTRUCTIBLE ON THE INK. The breathing sweep
    offered `ἑξουσιν` against a page that prints `ἔξȣσιν`: the alternative
    spells the ligature out, so the only two buttons on the card were a form
    with the wrong breathing and a form that cannot be on the page at all.
    John clicked "none of these". What that sweep actually claims is a rough
    breathing on a page that prints a smooth one, and on this page that reads
    `ἕξȣσιν` — the sort kept, the printed acute kept, one mark changed.

    A candidate matches the whole token, or one of its pieces (which is how a
    sweep naming `λῆψις` answers a printed `ἀνά-ληψις`). Ligature-expanded
    spellings are re-ligated and tried again. Anything else is not a reading of
    this token and must not become a button.
    """
    whole = ''.join(texts)
    marks = AUTHORITY.get(sweep)
    for c in dict.fromkeys((cand, religate(cand))):
        if not c:
            continue
        d = _letters(c)
        if _base(whole) == _base(c):
            out, i = [], 0
            for t in texts:
                laid, i = _lay_from(t, d, i, marks)
                out.append(laid)
            return out
        for k, t in enumerate(texts):
            if _base(t) == _base(c):
                laid, _ = _lay_from(t, d, 0, marks)
                return texts[:k] + [laid] + texts[k + 1:]
    return None


def _apostrophe(lines: list) -> str:
    """The apostrophe sort this column actually prints."""
    counts = {}
    for line in lines:
        for ch in line:
            if ch in APOSTROPHES:
                counts[ch] = counts.get(ch, 0) + 1
    return max(counts, key=counts.get) if counts else '᾽'


def elided_candidate(tok: Token, sources: list, lines: list) -> str:
    """The elided reading of a token the sweep says cannot end where it does.

    Smyth §133: a Greek word ends in a vowel or in ν, ρ, ς. When `smyth:D1`
    reports `ends in τ` and the printed token really does end in τ with no
    apostrophe on it, the sweep has said the printing cannot be a word — and
    the card must offer some reading that could be, or the only exits are a
    wrong ruling and "none of these", which is what John gave it. 59-R:60 sets
    `κατ᾽` at the line start and `κατ` at the measure.

    ⚠ AND IT IS OFFERED ONLY ON THE PAGE'S OWN EVIDENCE. `ηκ` on 54-L:8 is a
    geometric label — the lines drawn from Η and Κ — and D1 fires on it too. An
    apostrophe there would be pure invention, so the elided form must already
    print SOMEWHERE IN THIS COLUMN before it can be a button. `κατ᾽` prints four
    times on 59-R; `ηκ'` prints nowhere.

    Empty when the token is broken at the measure (the hyphen, not elision,
    explains the ending) or already carries an apostrophe.
    """
    if tok.broken or not any(w.startswith('ends in') for _, w in sources):
        return ''
    text = tok.printed
    if any(c in APOSTROPHES for c in text):
        return ''
    b = _base(text)
    if not b or b[-1] in FINAL_OK:
        return ''
    if not _prints_elided(lines, text):
        return ''
    return text + _apostrophe(lines)


def _prints_elided(lines: list, text: str) -> int:
    """How often this column prints `text` with an apostrophe on it."""
    n = 0
    for line in lines:
        i = 0
        while (i := line.find(text, i)) >= 0:
            j = i + len(text)
            if (not _joined(line[i - 1] if i else ' ')
                    and j < len(line) and line[j] in APOSTROPHES):
                n += 1
            i += 1
    return n


def opus_offset(page: int, col: str, line: int, at: int) -> int:
    """`at` translated from corpus coordinates into the Opus line's.

    ⚠ THE CROP MEASURES AGAINST OPUS, NOT THE CORPUS. `crop_at_offset` places
    its pointer proportionally along the line it reads from `raw/opus`, while
    these offsets are corpus offsets — the two texts differ exactly where John
    has ruled. One card on 53-62 sits on a line that is 55 characters in the
    corpus and 56 in Opus, which moves the pointer about half a glyph. Small,
    but "points slightly off" is the same class of error as "points at the
    wrong word", and it costs nothing to be exact.

    Falls back to `at` when there is no Opus line or no aligned position.
    """
    src = OPUS / f'page-{page:03d}-{col}.txt'
    if not src.exists():
        return at
    lines = _nfc(src.read_text(encoding='utf-8')).splitlines()
    corpus = corpus_column(page, col, required=False)
    if corpus is None or not (1 <= line <= len(lines)):
        return at
    clines = _nfc(corpus.read_text(encoding='utf-8')).splitlines()
    if not (1 <= line <= len(clines)):
        return at
    a, b = clines[line - 1], lines[line - 1]
    if a == b:
        return at
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(
            None, a, b, autojunk=False).get_opcodes():
        if tag == 'equal' and i1 <= at < i2:
            return j1 + (at - i1)
    # ⚠ AN UNMAPPABLE POSITION IS NOT `at`. If the offset falls inside an
    # edited span the two texts do not share it, and returning the corpus
    # number pretends they do — the pointer then lands wherever that index
    # happens to be in the other text. Say so instead.
    return -1


def stream_offset(page: int, col: str, line: int, at_opus: int) -> int:
    """The canonical Opus STREAM offset — what `settle_review` calls word_off.

    ⚠ THE CONSUMER DECIDES THE SCHEMA. `settle_review.cards_from_queue` does
    `int(e['word_off'])` and raises without it, so a queue carrying only a
    character offset cannot be served at all. That is not a detail: this queue
    exists to be opened in that tool, and it was never once loaded into it
    before being handed over. Codex found it in review.

    `word_off` indexes the canonical stream, not the line, so the character
    offset has to be walked back through `canonical()`'s own offset table.
    """
    src = OPUS / f'page-{page:03d}-{col}.txt'
    if not src.exists():
        return -1
    text = _nfc(clean_opus(src.read_text(encoding='utf-8')))
    lines = text.splitlines()
    if not (1 <= line <= len(lines)):
        return -1
    base = sum(len(l) + 1 for l in lines[:line - 1]) + at_opus
    stream, offs = canonical(text)
    for i, b in enumerate(offs):
        if b == base:
            return i
        if b > base:                     # the character was folded away
            return max(0, i - 1)
    return -1


def _stream_at(page: int, col: str, line: int, at: int) -> int:
    """The canonical stream offset of a corpus position on a printed line."""
    o = opus_offset(page, col, line, at)
    return stream_offset(page, col, line, o if o >= 0 else at)


def _piece_of(tok: Token, ln: int, off: int) -> int:
    """Which piece of the printed token the sweep's own anchor fell in."""
    for k, p in enumerate(tok.pieces):
        if p.line == ln and p.start <= off < p.start + len(p.text):
            return k
    return 0


def _dress(e: dict) -> None:
    """Turn one merged site into the card the page justifies.

    The printed token is already known; this lays every candidate reading on it,
    refuses the ones that cannot be laid, moves the crop to the piece actually
    under dispute, and says in the reason what the page does that the sweep's
    token did not show.

    ⚠ THE CROP MUST POINT AT THE DISPUTED GLYPH, NOT AT THE WORD'S START. When
    `ὑπερ-` ends 57-R:7 and the breathing in question sits on the `ἔ` that opens
    57-R:8, a card anchored where the word begins shows John the head and asks
    him about the tail. The site is therefore the piece the candidates differ
    in, and the reason names the other half.
    """
    tok: Token = e.pop('_tok')
    texts, printed = tok.texts, tok.printed
    src = e['src_form']
    notes: list[str] = []

    laid_forms: list[list] = []
    forms = [printed]
    dropped: list[str] = []
    for cand, sweep in e.pop('_raw'):
        if cand == src:
            continue                     # the sweep's own token: this IS it
        laid = lay_on(texts, cand, sweep)
        if laid is None:
            dropped.append(cand)
            continue
        laid_forms.append(laid)
        if ''.join(laid) not in forms:
            forms.append(''.join(laid))
        naive = lay_on(texts, cand) if AUTHORITY.get(sweep) else None
        if naive is not None and ''.join(naive) != ''.join(laid):
            notes.append(
                f'{sweep} proposes {cand!r}, which is a key and not a reading '
                f'— it speaks only about '
                f'{"accents" if sweep == "accent" else "breathings"} and its '
                f'own key drops the rest, so the marks it is silent about stay '
                f'as printed: {"".join(laid)!r}')

    lines = corpus_lines(e['page'], e['col']) or []
    elided = elided_candidate(tok, e.pop('_sources'), lines)
    if elided and elided not in forms:
        forms.append(elided)
        laid_forms.append([elided])
        notes.append(f'no reader read {elided!r} here — offered because no '
                     f'Greek word ends as this one does and this column prints '
                     f'{elided!r} {_prints_elided(lines, printed)} time(s) '
                     f'elsewhere')

    idx = next((i for i in range(len(texts))
                if any(len(a) == len(texts) and a[i] != texts[i]
                       for a in laid_forms)),
               _piece_of(tok, *e.pop('_anchor')))
    piece = tok.pieces[idx]

    if tok.broken:
        head, tail = tok.pieces[0], tok.pieces[-1]
        # ⚠ SAY WHOSE HYPHEN IT IS. This read "one word, and the hyphen is
        # printed", which is true and reads as the opposite of what it means:
        # John took it as Bonitz setting the hyphen deliberately, the way he
        # sets `ἀ-γνοιαν` to show morphology. It is the COLUMN BREAK — the
        # compositor ran out of measure. The distinction decides what the
        # question even is: on a break the hyphen belongs to the typography
        # and the accent is being asked about a whole word, so the card must
        # not invite a ruling about the hyphen itself.
        notes.append(f'broken by the COLUMN BREAK, not by Bonitz: line '
                     f'{head.line} ends {head.text!r} and line {tail.line} '
                     f'begins {tail.text!r}. One word — the hyphen is the '
                     f'measure. Rule on the accent, not on the hyphen; it '
                     f'stays either way.')
    if printed != src:
        notes.append(f'the sweep read {src!r}; the printed token is {printed!r}')
    for d in dropped:
        notes.append(f'{d!r} cannot be laid on the printed token {printed!r} '
                     f'and is not offered as a reading')

    if tok.join == 'refused':
        notes.append(f'line {tok.pieces[0].line} ends in a hyphen but the next '
                     f'line does not continue {src!r}, so the halves are not '
                     f'joined — the token is what this line prints')
    elif tok.join == 'unverified':
        notes.append(f'the break is joined on the printed hyphen alone: '
                     f'{src!r} stops at it and so cannot vouch for the join')

    e['printed_token'] = printed
    e['pieces'] = [{'line': p.line, 'start': p.start, 'text': p.text}
                   for p in tok.pieces]
    e['broken'] = tok.broken
    e['join'] = tok.join
    e['dropped_forms'] = dropped
    e['readers'] = {'opus': printed}
    e['forms'] = forms
    e['form_set'] = sorted(set(forms))
    e['line'] = piece.line
    _o = opus_offset(e['page'], e['col'], piece.line, piece.start)
    e['char_at'] = _o if _o >= 0 else piece.start
    e['char_at_corpus'] = piece.start
    e['opus_aligned'] = _o >= 0
    # ⚠ `word_off` IS THE WORD'S START AND NOTHING ELSE. The crop moved to the
    # piece under dispute, and the offset moved with it — so a card on the tail
    # of a broken word stored the stream offset of the TAIL. But `canonical`
    # folds the measure hyphen away, so the stream holds the seamless word and
    # that offset lands mid-word: `settle_apply` matches
    # stream[word_off:word_off+len(printed)] and `carry_rulings` identifies a
    # site by (page, col, word_off). Both would miss, both silently. Grok found
    # it. The display keeps the disputed piece; the identity keeps the word.
    e['word_off'] = _stream_at(e['page'], e['col'], tok.pieces[0].line,
                               tok.pieces[0].start)
    e['dispute_off'] = _stream_at(e['page'], e['col'], piece.line, piece.start)
    e['context'] = ' ⏎ '.join(lines[p.line - 1] for p in tok.pieces
                              if 1 <= p.line <= len(lines))
    e['line_moved'] = any(x != e['line'] for x in e['lines_reported'])
    e['reason'] = '; '.join(e.pop('reasons') + notes)


def _gone_from_column(f: Finding) -> bool:
    """Is the form this finding names absent from its whole column now?

    Anchoring already failed, so the question is only WHY: a form still
    somewhere in the column is one the anchor could not place — a real
    orphan — while a form nowhere in it has been rewritten since the sweep
    ran, and there is nothing left to rule.

    ⚠ A WHOLE TOKEN, NEVER A SUBSTRING. `τον` is a substring of the very
    word that replaced it — `ὦτον` — so a containment test says the finding
    is still there when the token it named has gone.
    """
    import re
    run = re.compile(r'[^\W\d_]+', re.UNICODE)
    lines = corpus_lines(f.page, f.col) or []
    return not any(f.printed in run.findall(ln) for ln in lines)


def build(lo: int, hi: int, sites_wanted: list | None = None
          ) -> tuple[dict, list[Finding]]:
    """One card per RESOLVED site, carrying every reason it was flagged.

    ⚠ MERGE AFTER ANCHORING, NOT BEFORE. Findings are first keyed by the line
    the sweep REPORTED, and four of them report the line before the one the
    word is on. Two sweeps naming the same word at 57-R:6 and 57-R:7 both
    resolve to 57-R:7 — and keying on the reported line made that two cards
    for one place, which is exactly what merging is supposed to prevent.

    `sites_wanted` is a list of `PPP-C:LINE:CHAR[=FORM]` specs — the ANCHOR
    coordinates, the ones the sweeps and the previous queue name — restricting
    the queue to a follow-up set. A spec that matches nothing is reported in
    `unmatched_sites`, never silently absent.
    """
    specs = [_spec(s) for s in (sites_wanted or [])]
    sites: dict[tuple, dict] = {}
    orphans: list[Finding] = []
    resolved: list[Finding] = []
    for f in collect(lo, hi):
        spots = anchor(f)
        if not spots:
            # ⚠ A FINDING THE CORPUS HAS MOVED PAST IS ANSWERED, NOT LOST. The
            # sweep TSVs are a snapshot; when a ruling rewrites the word they
            # named, the row survives them. `τον` at 60-R:56 is one — John
            # read `(τὸν υ[?]τον)` as `(τὸν ὦτον)` on 2026-08-15, and the bare
            # `τον` the sweeps flagged is no longer a token on that line. An
            # orphan is a finding that CANNOT be placed; this one no longer
            # needs to be.
            if _gone_from_column(f):
                resolved.append(f)
                continue
            orphans.append(f)
            continue
        lines = corpus_lines(f.page, f.col) or []
        toks = {(ln, off): token_at(lines, ln, off, f.printed)
                for ln, off in spots}
        for ln, off in spots:
            key = (f.page, f.col, ln, off, f.printed)
            e = sites.get(key)
            if e is None:
                same = sum(1 for t in toks.values()
                           if t.printed == toks[(ln, off)].printed)
                e = sites[key] = {
                    'page': f.page, 'col': f.col, 'line': ln,
                    'src_form': f.printed,
                    'anchor_line': ln, 'anchor_char': off,
                    'kind': 'sweep',
                    'reasons': [],
                    'n_same_form_set': 1,
                    'sweeps': [],
                    'lines_reported': [],
                    # ⚠ TWO OCCURRENCES OF THE SWEEP'S TOKEN NEED NOT BE TWO OF
                    # THE PRINTED ONE. 59-R:60 carries `κατ` twice and the page
                    # prints `κατ᾽` and `κατ` — one card each, and neither is a
                    # guess about which the sweep meant.
                    'ambiguous': same > 1,
                    '_tok': toks[(ln, off)],
                    '_raw': [],
                    '_sources': [],
                    '_anchor': (ln, off),
                }
            for sweep, why in f.sources:
                if sweep not in e['sweeps']:
                    e['sweeps'].append(sweep)
                e['reasons'].append(f'{sweep}: {why}')
            e['_sources'].extend(f.sources)
            for form, from_ in [(f.printed, '')] + list(f.expecteds):
                if form and (form, from_) not in e['_raw']:
                    e['_raw'].append((form, from_))
            if f.line not in e['lines_reported']:
                e['lines_reported'].append(f.line)

    entries = []
    for key in sorted(sites):
        e = sites[key]
        e['sweeps'] = sorted(e['sweeps'])
        _dress(e)
        entries.append(e)

    unmatched: list[str] = []
    if specs:
        keep = []
        for want, spec in zip(sites_wanted, specs):
            hits = [e for e in entries if _matches(e, spec)]
            if not hits:
                unmatched.append(want)
            keep += [e for e in hits if e not in keep]
        entries = [e for e in entries if e in keep]

    counts: dict[str, int] = {}
    for e in entries:
        for s in e['sweeps']:
            counts[s] = counts.get(s, 0) + 1
    return ({'_': ['Every sweep\'s findings for this range, merged by site. '
                   'Serve with settle_review --queue this --rulings '
                   'work/sweeps/review-rulings.json --only-unruled.'],
             'pages': f'{lo}-{hi}',
             'n_sites': len(entries),
             'by_sweep': counts,
             'unmatched_sites': unmatched,
             # ⚠ COUNTED AND NAMED, NEVER JUST ABSENT. A sweep row whose word
             # a later ruling rewrote has nothing left to rule, and saying so
             # is the difference between "answered" and "lost".
             'resolved_since': [f'{f.page:03d}-{f.col}:{f.line} {f.printed!r}'
                                for f in resolved],
             'entries': entries}, orphans)


def _spec(s: str) -> tuple:
    """`057-R:7:53=ὑπερἔχοντας` -> (57, 'R', 7, 53, 'ὑπερἔχοντας').

    The form is optional and disambiguates a place two sweeps read differently:
    57-R:7 char 53 carries both a `ὑπερ` card and a `ὑπερἔχοντας` one.
    """
    site, _, form = s.partition('=')
    m = re.fullmatch(r'(\d+)-([LR]):(\d+):(\d+)', site.strip())
    if not m:
        raise SystemExit(f'--sites: {s!r} is not PPP-C:LINE:CHAR[=FORM]')
    return (int(m.group(1)), m.group(2), int(m.group(3)), int(m.group(4)),
            _nfc(form))


def _matches(e: dict, spec: tuple) -> bool:
    page, col, line, char, form = spec
    return ((e['page'], e['col'], e['anchor_line'], e['anchor_char'])
            == (page, col, line, char)
            and (not form or e['src_form'] == form))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--pages', default='53-62')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--sites', default='',
                    help='comma-separated PPP-C:LINE:CHAR[=FORM] — build a '
                         'follow-up queue holding only these sites')
    ap.add_argument('--out', type=Path, default=None,
                    help='where --write puts the queue')
    a = ap.parse_args(argv)
    lo, _, hi = a.pages.partition('-')
    lo, hi = int(lo), int(hi or lo)
    wanted = [s for s in a.sites.split(',') if s.strip()]

    queue, orphans = build(lo, hi, wanted)
    print(f'{queue["n_sites"]} sites from {len(queue["by_sweep"])} sweeps')
    for s, n in sorted(queue['by_sweep'].items(), key=lambda t: -t[1]):
        print(f'  {n:4d}  {s}')
    amb = [e for e in queue['entries'] if e['ambiguous']]
    if amb:
        print(f'\n{len(amb)} site(s) whose form repeats on its line — each '
              f'occurrence is its own card')
    if orphans:
        print(f'\n⚠ {len(orphans)} finding(s) could not be anchored and are '
              f'NOT in the queue:')
        for f in orphans[:10]:
            print(f'  {f.page:03d}-{f.col}:{f.line} {f.printed!r} '
                  f'({", ".join(s for s, _ in f.sources)})')
    # ⚠ A REQUESTED SITE THAT DID NOT ARRIVE IS THE ONE THING WORTH SHOUTING.
    # A follow-up queue built from a list is only as good as its refusal to
    # come back short: eight asked for and seven delivered looks exactly like
    # eight delivered unless the missing one is named.
    if queue['unmatched_sites']:
        print(f'\n⚠ {len(queue["unmatched_sites"])} requested site(s) matched '
              f'no anchored finding and are NOT in the queue:')
        for s in queue['unmatched_sites']:
            print(f'  {s}')
    out = a.out or ROOT / 'work' / f'queue-review-{lo}-{hi}.json'
    if a.write:
        out.write_text(json.dumps(queue, ensure_ascii=False, indent=1),
                       encoding='utf-8')
        print(f'\nwrote {out}')
    else:
        print('\ndry run — pass --write to record the queue')
    return 1 if queue['unmatched_sites'] else 0


if __name__ == '__main__':
    sys.exit(main())
