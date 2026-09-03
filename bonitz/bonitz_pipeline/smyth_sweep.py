"""
Every orthography Greek does not permit — Smyth as a battery of validators.

`accent_law.py` proved the shape: a rule that makes a form IMPOSSIBLE needs no
reference text, so it finds errors every reader shares and errors `fold()`
erases.  This module generalises that to the rest of the deterministic space —
breathings, mark placement, word shape — and runs each rule as its own test
with its own output file, so a rule that turns out to be noisy can be judged
and dropped without contaminating the rest.

The prime directive is NO FALSE POSITIVES.  A rule that is merely usually true
is worse than no rule: it spends the one scarce resource here, which is John's
attention against the ink.  Where a verdict would depend on something the
spelling does not show — the quantity of α, ι, υ; whether a following word is
an enclitic; whether Bonitz is quoting a variant — the rule is silent.

Two tiers:

  HARD      a flagged form is wrong, full stop.  Every row is worth reading.
  ADVISORY  the rule is sound Greek but may describe the EDITOR's practice
            rather than our error (1870 printers are not uniform about ῥ, and
            an index is full of unaccented sigla).  Run to measure the yield;
            promote to hard only on evidence.

    python3 -m bonitz_pipeline.smyth_sweep                 # every hard rule
    python3 -m bonitz_pipeline.smyth_sweep --all           # advisory too
    python3 -m bonitz_pipeline.smyth_sweep --rule S9       # one rule
    python3 -m bonitz_pipeline.smyth_sweep --list
    python3 -m bonitz_pipeline.smyth_sweep --source raw/llama-best

Writes one TSV per rule to `work/sweeps/smyth/<id>.tsv`.  Applies nothing: the
ink decides, the same contract as `ligature_sweep` and `diacritic_sweep`.

What this deliberately does NOT do:

  - It does not touch the ligatures for the ACCENT rules.  `ȣ` is a diphthong
    with no precomposed form and `syllables()` cannot see it, so counting
    syllables in `κινȣ́μενον` would be guessing.  Ligature words are still
    checked by every mark-placement and breathing rule, where the ligature is
    simply another base character.  Sizing that gap is future work.
  - It does not test acute-vs-grave in the general case (§154 makes the two
    the same accent in different company); only the one direction where a
    pause settles it, B2 below.
  - It does not test §179, that a proclitic carries no accent.  Written and
    measured: all 187 hits were the relative `ὅ`/`ὃ` and the disjunctive `ἤ`,
    which fall onto the article `ὁ`/`ἡ` the moment accents are stripped — and
    telling a relative from an article needs the sentence, not the word.  The
    rule cannot be made to work at this altitude and was removed.
  - It does not know what a word MEANS.  `breathing.py` does that with a
    lexicon and is the right tool for rough-vs-smooth; this file only asks
    whether a breathing is present at all and whether it sits where Greek puts
    it.
"""

from __future__ import annotations
import argparse
import glob
import re
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .accent_law import check as accent_check, syllables
from .normalize import _is_junk_line, _strip_common_markup

ROOT = Path(__file__).resolve().parent.parent

ROUGH, SMOOTH = '̔', '̓'
ACUTE, GRAVE, CIRC = '́', '̀', '͂'
CIRC_ALT = '̃'                      # combining tilde, same printed mark
SUBSCRIPT, DIAERESIS = 'ͅ', '̈'
BREATHINGS, ACCENTS = ROUGH + SMOOTH, ACUTE + GRAVE + CIRC

VOWELS = 'αεηιουω'
CAPS = {'Α': 'α', 'Ε': 'ε', 'Η': 'η', 'Ι': 'ι', 'Ο': 'ο', 'Υ': 'υ', 'Ω': 'ω'}
LIGATURES = 'ȣϗ'                         # take marks, but are not vowels here
DIPHTHONGS = {'αι', 'ει', 'οι', 'υι', 'αυ', 'ευ', 'ου', 'ηυ', 'ωυ'}
# §133: a Greek word ends in a vowel or in ν, ρ, ς — ξ and ψ being σ-compounds.
# Tested against `.lower()`, so a word set in capitals (ΛΟΓΟΣ, ΤΩΝ) passes: Σ
# lowercases to σ, whose position is A8's business rather than this rule's.
FINAL_OK = set(VOWELS + 'νρςσξψ' + LIGATURES)
# §133b: the two words that break it, plus the pre-vocalic form of οὐ.
FINAL_EXEMPT = {'εκ', 'ουκ', 'ουχ'}

# The token: Greek letters, the two ligatures, combining marks, apostrophes.
WORD = re.compile(r"[Ͱ-Ͽἀ-῿ȣϗ][Ͱ-Ͽἀ-῿ȣϗ̀-ͯ'’‘ʼ᾽᾿]*")
APOSTROPHES = "'’‘ʼ᾽᾿´΄`"
# A pause, before which §154 keeps the acute.  The em-dash separates entries in
# this book and is as much a stop as the period.  A line-end hyphen is NOT a
# pause, which is why '-' is absent.
PAUSE = '.,;·:!?)]»—'


def nfd(s: str) -> str:
    """NFD with the two encodings of the printed circumflex unified."""
    return unicodedata.normalize('NFD', s).replace(CIRC_ALT, CIRC)


def clusters(s: str) -> list[tuple[str, str]]:
    """[(base letter, its combining marks)] over an NFD string."""
    out: list[list[str]] = []
    for ch in s:
        if unicodedata.combining(ch) and out:
            out[-1][1] += ch
        else:
            out.append([ch, ''])
    return [(b, m) for b, m in out]


def is_vowel(base: str) -> bool:
    return base in VOWELS or base in CAPS


def is_rho(base: str) -> bool:
    """§13 gives ρ a breathing, and `Ῥήτωρ` decomposes to a CAPITAL rho."""
    return base in 'ρΡ'


def lower(base: str) -> str:
    return CAPS.get(base, base)


def vowel_group(cl: list[tuple[str, str]], i: int = 0) -> list[int]:
    """Indices of the vowel or diphthong at `i`, or [] if there is none there.

    A diaeresis on the second vowel says the two are pronounced apart (§8), so
    no diphthong forms and the group is one vowel long: Κά-ϊ-κον, ἀ-ΐ-διος.

    `ȣ` counts as a group of its own: it IS the diphthong ου, so a breathing on
    it is word-initial and legal — `ȣ̔́τω` is οὕτω.
    """
    if i >= len(cl):
        return []
    if cl[i][0] in LIGATURES:
        return [i]
    if not is_vowel(cl[i][0]):
        return []
    if (i + 1 < len(cl) and is_vowel(cl[i + 1][0])
            and lower(cl[i][0]) + lower(cl[i + 1][0]) in DIPHTHONGS
            and DIAERESIS not in cl[i + 1][1]):
        return [i, i + 1]
    return [i]


def initial_group(cl: list[tuple[str, str]]) -> list[int]:
    return vowel_group(cl, 0)


def expand(d: str) -> str:
    """`ȣ` -> ου and `ϗ` -> και in NFD, marks moved onto the SECOND vowel.

    The accent rules used to abstain on every word holding a ligature —
    2,138 words, 1,920 of them accented, 9.5% of the corpus, and precisely
    the vocabulary this project exists to get right.  `syllables()` cannot
    see `ȣ` because it is not in VOWELS; expanded, ου and αι are ordinary
    diphthongs and every quantity and syllable test works unchanged.  §11
    puts a diphthong's marks on its second vowel, so that is where they go.
    """
    out, i = [], 0
    while i < len(d):
        ch, i = d[i], i + 1
        marks = ''
        while i < len(d) and unicodedata.combining(d[i]):
            marks, i = marks + d[i], i + 1
        if ch == 'ȣ':
            out += ['ο', 'υ' + marks]
        elif ch == 'ϗ':
            out += ['κα', 'ι' + marks]
        else:
            out.append(ch + marks)
    return ''.join(out)


@dataclass
class Part:
    """One word.  A token may hold several: elision writes `ἀλλ'ὅταν`."""
    text: str                   # NFC
    d: str = ''                 # NFD, circumflex unified
    cl: list = field(default_factory=list)
    elided: bool = False        # an apostrophe follows: the ending is cut off
    apos: bool = False          # an apostrophe leads it: a breathing, not elision
    head: bool = True           # first part of its token
    continues: bool = False     # the tail of a word hyphenated on the line above
    truncated: bool = False     # hyphenated at this line's end
    siglum: bool = False        # a digit touches it — Φε2, αν20, Ζιι3
    label: bool = False         # unaccented letter-run: a siglum, not a word
    line: str = ''
    after: str = ''             # rest of the line, for the pause test


@dataclass
class Hit:
    col: str
    line: int
    word: str
    detail: str
    context: str



# --- what counts as a label -------------------------------------------------

_LIGATURES = 'ȣȢϗ'


def _is_label(text: str, d: str) -> bool:
    """True when this token is a siglum, not a word the accent rules govern.

    ⚠ THE OLD TEST WAS CIRCULAR. It called any run of four or fewer Greek
    letters carrying neither accent nor breathing a label — which is exactly
    what a WORD that has lost its marks looks like. So it could not tell `Ζμ`
    (never had marks) from a `ϗ` whose grave fell off, and it silenced 1,147
    tokens including 25 bare kai and 57 bare `ȣκ`. On 060-L:25 the same
    printed line carries `ϗ` and `ϗ̀` twelve words apart and no rule ever saw
    either.

    Two changes, both John's, 2026-08-11:

    1. A LIGATURE IS NEVER A LABEL. `ϗ` abbreviates καί and `ȣ` is the ou
       vowel-ligature; neither is a work siglum, and they are the two sorts
       this edition turns on.
    2. A LABEL MUST BE A SIGLUM WE CAN NAME. Checked against Bonitz's own key
       via `siglum_check.inventory()`, and a citation siglum is WORK + BOOK
       NUMERAL — `Ζιι` is Ζι plus book ι, `πκγ` is π plus book κγ = 23 — so
       the composition is what gets tested, not the bare shape.
    """
    if any(c in _LIGATURES for c in text):
        return False
    # TERM LETTERS. Bonitz uses runs of capitals as logical variables —
    # `ΑΒΓ signa terminorum in prima syllogismi figura` at 015-L:5. They are
    # not words and never carry marks. Nothing else in this text is set as a
    # run of bare capitals, so the shape is safe to name.
    if len(text) >= 2 and all('Α' <= c <= 'Ω' for c in text):
        return True
    from .siglum_check import book_ok, split
    works = _inventory()
    for head, tail in split(text, works):
        if book_ok(head, tail):
            return True
    return False


_INV = None


def _inventory():
    global _INV
    if _INV is None:
        from .siglum_check import inventory
        _INV = inventory()
    return _INV


def _parts(tok: str) -> list[tuple[str, bool, bool]]:
    """Split a token at apostrophes -> [(text, elided, apostrophe_before)].

    An apostrophe BETWEEN two pieces elides the first (`ἀλλ'ὅταν`).  One with
    nothing before it is not elision at all: it is a breathing set as its own
    sort, which this typeface does before a capital — `᾽Αμνέα` is Ἀμνέα.
    `normalize.canonical` folds the same pair.
    """
    out, cur, lead = [], '', False
    for ch in tok:
        # A CAPITAL behind a lowercase letter is a word boundary the setting
        # lost: this book prints `φόνοιΠβ4.1262a26.` with no space at all, and
        # John's Bekker-spacing ruling says the printed gap is justification,
        # not meaning.  So the corpus is faithful and the token is two words —
        # split it rather than report `φόνοι` as ending in β.  Position 0 and
        # runs of capitals are untouched, so `ΑΒΓ` and `ΑΖγ` stay whole.
        if (ch in CAPS or ch in 'ΒΓΔΖΘΚΛΜΝΞΠΡΣΤΦΧΨ') and cur \
                and cur[-1].islower():
            out.append([cur, False, lead])
            cur, lead = '', False
        if ch in APOSTROPHES:
            if cur:
                out.append([cur, True, lead])
                cur, lead = '', False
            else:
                lead = True
            continue
        cur += ch
    if cur:
        out.append([cur, False, lead])
    return [(t, e, a) for t, e, a in out]


def line_parts(line: str, prev: str = '') -> list[Part]:
    """Every word in one printed line, with the context the rules need."""
    here: list[Part] = []
    for m in WORD.finditer(line):
        tok, a, b = m.group(0), m.start(), m.end()
        # A number on either side makes it a work-siglum, not a word:
        # `Φε2`, `αν20`, `Ζμδ 5`.  Sigla are labels — no breathing and
        # no accent by design — so every presence rule fires on them.
        # The space must be allowed: this book sets `Ζμγ4` and
        # `Ζμδ 5` on the same page, and the readers copy the spacing.
        # ...but only if it looks like one.  A siglum is a LABEL: unaccented
        # and unbreathed.  Without that clause `ἀλώπηξ 1.` — a fully accented
        # lemma before its sense number — was being silenced too, and the
        # index numbers its senses throughout.
        marked = any(c in ACCENTS + BREATHINGS for c in nfd(tok))
        sig = not marked and (bool(re.match(r'\s*\d', line[b:]))
                              or (a > 0 and line[a - 1].isdigit()))
        # The breathing-as-its-own-sort can sit OUTSIDE the token: the
        # regex opens on a Greek letter, so `'Αλκμαίων` matches from
        # the alpha and the mark is left behind.
        lead = a > 0 and line[a - 1] in APOSTROPHES
        for i, (txt, elided, apos) in enumerate(_parts(tok)):
            p = Part(text=txt, d=nfd(txt), elided=elided,
                     apos=apos or (i == 0 and lead),
                     head=(i == 0), siglum=sig, line=line, after=line[b:])
            p.cl = clusters(p.d)
            # A run of Greek letters with neither accent nor breathing
            # is not a word in this book — it is a label: a work
            # siglum (Οα, πκγ), a term-letter (ΑΒΓ), or the ending of
            # a lemma being declined (`ἄκρος, α, ον`).  Every presence
            # and shape rule would fire on all of them.
            # `αλλα` on 032-L:1 looks like the cost of this guard and is
            # not: John ruled it 2026-07-25 — "the print has no breathing
            # AND no accent, a printer's error, recording as printed"
            # (tests/fixtures/john-rulings.json, breathing/declined).  The
            # guard is protecting a ruling.  `_labels.tsv` lists the rest.
            p.label = _is_label(p.text, p.d)
            here.append(p)
    if here:
        if line.rstrip().endswith('-'):
            here[-1].truncated = True
        if prev.rstrip().endswith('-'):
            here[0].continues = True
    return here


def judge(word: str, after: str = '') -> list[tuple[str, str]]:
    """Run every rule over one word in isolation -> [(rule id, detail)].

    `after` is whatever follows it on the printed line, which two rules need:
    B2 wants the punctuation, D1 wants to know an abbreviating stop when it
    sees one.  The tests go through here, so they exercise the same path the
    corpus sweep does rather than a convenient imitation of it.
    """
    return [(r.id, d) for p in line_parts(word + after)
            for r in RULES if (d := r.fn(p))]


def numbered_lines(text: str) -> list[tuple[int, str]]:
    """`clean_opus` applied per line, KEEPING the true file line number.

    Calling `clean_opus` on the whole column and enumerating the result would
    renumber everything below any line it drops — running heads, signatures,
    page numbers — so a TSV row would point the reader at the wrong line of
    the scan.  It happens to drop nothing in the present 76 columns, which is
    exactly why this had to be fixed before it silently mattered.
    """
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        cleaned = _strip_common_markup(line)
        if _is_junk_line(cleaned):
            continue
        out.append((i, cleaned.strip()))
    return out


def read_parts(source: str) -> list[tuple[str, int, Part]]:
    """Every word in the corpus, with the context the rules need."""
    out = []
    # ⚠ THE DEFAULT MUST MEAN THE WHOLE CORPUS, NOT ONE STAGE OF IT.
    # `work/reconciled` holds 15-52; 53-62 are settled but not promoted
    # and live in reconciled-auto. With a single-directory default this
    # swept 15-52 and reported nothing about the rest — and pointing it
    # at the other stage by hand then OVERWROTE the first run's report.
    # `corpus` spans every stage; an explicit --source still works, for
    # checking a reader's raw output against the same rules.
    if source == 'corpus':
        from .normalize import corpus_columns
        files = [str(f) for f in corpus_columns()]
    else:
        files = sorted(glob.glob(str(ROOT / source / 'page-*.txt')))
        if not files:
            files = sorted(glob.glob(str(ROOT / source / 'page-*.md')))
    carry = ''            # last line of the previous column, in reading order
    for f in files:
        col = Path(f).stem
        numbered = numbered_lines(unicodedata.normalize(
            'NFC', Path(f).read_text(encoding='utf-8')))
        lines = [t for _, t in numbered]
        for k, (n, line) in enumerate(numbered):
            # A word can break across the COLUMN boundary as readily as across
            # a line: page-020-R ends `ἀδιανοητό-` and page-021-L opens
            # `τερον`, which is not an unaccented word but half of one.  The
            # files are globbed in reading order, so the previous column's
            # last line is the right `prev` for line 1.
            here = line_parts(line, lines[k - 1] if k else carry)
            out.extend((col, n, p) for p in here)
        if lines:
            carry = lines[-1]
    return out


# --------------------------------------------------------------------------
# the rules
# --------------------------------------------------------------------------

@dataclass
class Rule:
    id: str
    smyth: str
    tier: str
    statement: str
    fn: object


RULES: list[Rule] = []


def rule(rid: str, smyth: str, tier: str, statement: str):
    def deco(fn):
        RULES.append(Rule(rid, smyth, tier, statement, fn))
        return fn
    return deco


# --- A. marks that cannot be where they are -------------------------------

@rule('A1', '§169', 'hard',
      'a circumflex needs a long vowel; ε and ο are always short')
def a1(p: Part) -> str | None:
    for base, marks in p.cl:
        if CIRC in marks and lower(base) in 'εο':
            return f'circumflex over {base}'
    return None


@rule('A2', '§5', 'hard', 'iota subscript stands only under α, η, ω')
def a2(p: Part) -> str | None:
    for base, marks in p.cl:
        if SUBSCRIPT in marks and lower(base) not in 'αηω':
            return f'subscript under {base}'
    return None


@rule('A3', '§8', 'hard', 'the diaeresis stands only over ι and υ')
def a3(p: Part) -> str | None:
    for base, marks in p.cl:
        if DIAERESIS in marks and lower(base) not in 'ιυ':
            return f'diaeresis over {base}'
    return None


@rule('A4', '§13', 'hard',
      'marks stand on vowels, on an initial ρ, and on the ρρ pair')
def a4(p: Part) -> str | None:
    for i, (base, marks) in enumerate(p.cl):
        if not marks or base in LIGATURES or is_vowel(base):
            continue
        if not any(m in BREATHINGS + ACCENTS + SUBSCRIPT for m in marks):
            continue
        # §13: initial ρ is always rough, and a medial double rho is written
        # ῤῥ — two breathings on two consonants, both correct.
        if is_rho(base) and not any(m in ACCENTS + SUBSCRIPT for m in marks):
            if i == 0 or (i and is_rho(p.cl[i - 1][0])) or \
                    (i + 1 < len(p.cl) and is_rho(p.cl[i + 1][0])):
                continue
        return f'mark on {base}'
    return None


@rule('A5', '§13', 'hard', 'a word carries at most one breathing on a vowel')
def a5(p: Part) -> str | None:
    # Rho breathings are counted by A4, not here.  Counting every mark in the
    # word instead was wrong twice over: `διάῤῥοια` carries two by §13, and
    # `ῥινοῤῥαγία` — initial rough plus a medial ῤῥ — carries three.
    n = sum(1 for b, m in p.cl
            if not is_rho(b) for x in m if x in BREATHINGS)
    return f'{n} breathings on vowels' if n > 1 else None


@rule('A6', '§183c', 'hard',
      'two accents only in the enclitic pattern: acute on the antepenult or '
      'circumflex on the penult, plus an acute thrown onto the ultima')
def a6(p: Part) -> str | None:
    marks = [c for c in p.d if c in ACCENTS]
    if len(marks) < 2:
        return None
    if len(marks) > 2:
        return f'{len(marks)} accents'
    # §182: the accent an enclitic throws back is always an ACUTE.
    if GRAVE in marks:
        return 'grave as one of two accents'
    syls = syllables(expand(p.d))
    if len(syls) < 2:
        return 'two accents in one syllable'
    at = [(len(syls) - 1 - i, m) for i, s in enumerate(syls)
          for m in s if m in ACCENTS]
    if len(at) != 2:
        return None                       # a mark outside any nucleus: A4's job
    (pos1, m1), (pos2, m2) = sorted(at, reverse=True)
    # §183c: only a proparoxytone or a properispomenon receives the extra
    # acute.  A paroxytone does not — ῥόδον stays ῥόδον before an enclitic.
    if pos2 == 0 and m2 == ACUTE and ((pos1 == 2 and m1 == ACUTE)
                                      or (pos1 == 1 and m1 == CIRC)):
        return None
    return 'two accents outside the enclitic pattern'


@rule('A7', '§68a', 'hard',
      'a rough breathing deeper than the vowel behind one initial consonant '
      'is junk — the crasis position (ταὑτοῦ) is allowed without proving crasis')
def a7(p: Part) -> str | None:
    if not p.head or p.continues:
        return None
    ok = set(initial_group(p.cl))
    # §68a: crasis keeps the rough of the SECOND word, so τοῦ αὐτοῦ is written
    # ταὑτοῦ — and the mark lands on the υ, the second vowel of the crasis
    # diphthong, two clusters in.  Allow the whole vowel group behind a single
    # initial consonant; that keeps ταὑτοῦ and still rejects mid-word junk.
    if len(p.cl) > 1 and not is_vowel(p.cl[0][0]) and not is_rho(p.cl[0][0]):
        ok.update(vowel_group(p.cl, 1))
    for i, (base, marks) in enumerate(p.cl):
        if ROUGH in marks and i not in ok and not is_rho(base):
            return f'rough breathing on the {i + 1}th letter'
    return None


@rule('A8', '§1', 'hard', 'ς ends a word and σ does not')
def a8(p: Part) -> str | None:
    if p.siglum or p.label or len(p.text) < 2:
        return None
    letters = [b for b, _ in p.cl]
    if 'ς' in letters[:-1]:
        return 'final sigma inside the word'
    if letters[-1] == 'σ' and not p.elided and not p.truncated:
        return 'medial sigma at the word end'
    return None


@rule('A9', '§149', 'hard',
      'one accent and one breathing to a letter')
def a9(p: Part) -> str | None:
    for base, marks in p.cl:
        if sum(1 for m in marks if m in ACCENTS) > 1:
            return f'two accents on {base}'
        if sum(1 for m in marks if m in BREATHINGS) > 1:
            return f'two breathings on {base}'
    return None


# --- B. accent placement ---------------------------------------------------

@rule('B1', '§161', 'hard', 'the grave stands only on the ultima')
def b1(p: Part) -> str | None:
    syls = syllables(expand(p.d))
    if len(syls) < 2:
        return None
    for i, s in enumerate(syls[:-1]):
        if GRAVE in s:
            return f'grave {len(syls) - 1 - i} syllables from the end'
    return None


@rule('B2', '§154a', 'hard',
      'one direction of §154 only: before a full stop or a raised point the '
      'final acute is retained, so a grave cannot stand there')
def b2(p: Part) -> str | None:
    if p.elided or p.truncated or p.continues or GRAVE not in p.d:
        return None
    nxt = p.after.lstrip()
    # Only the marks Smyth actually settles.  The COMMA is out: §154a says
    # usage varies before one, and Bonitz writes `Ἀδριαναὶ,`.  Brackets are
    # out: Smyth does not treat them, and this book closes a parenthesis
    # mid-sentence.  `...` is out: it stands for the words Bonitz elided, so
    # the grave is before a following word after all — which is exactly the
    # environment §154 requires.
    if not nxt or nxt[0] not in '.·;':
        return None
    # Bonitz spaces his ellipsis — `ἅμα ϗ̀ . . ϗ̀ μδ9` on 049-L:1 — so an
    # unspaced test misses it and the grave looks like it stands before a stop.
    if re.match(r'\.\s*\.', nxt):
        return None
    syls = syllables(expand(p.d))
    if not syls or GRAVE not in syls[-1]:
        return None
    return f'grave before {nxt[0]!r}'


@rule('B6', '§149', 'hard', 'the circumflex never reaches the antepenult')
def b6(p: Part) -> str | None:
    syls = syllables(expand(p.d))
    for i, s in enumerate(syls[:-2]):
        if CIRC in s:
            return f'circumflex {len(syls) - 1 - i} syllables from the end'
    return None


@rule('B7', '§163/§166/§167c', 'hard',
      "accent_law's quantity rules, reached on ligature words by expanding ȣ")
def b7(p: Part) -> str | None:
    if not any(c in LIGATURES for c in p.text):
        return None                       # accent_law already covers the rest
    if p.siglum or p.label or p.truncated or p.continues:
        return None
    return accent_check(unicodedata.normalize('NFC', expand(p.d)))


# --- C. breathings ---------------------------------------------------------

@rule('C1', '§9', 'hard', 'a word beginning with a vowel carries a breathing')
def c1(p: Part) -> str | None:
    if p.siglum or p.label or p.continues or p.apos or len(p.text) < 2:
        return None
    # ϗ abbreviates καί, which begins with a consonant — no breathing belongs
    # on it, so §9 is silent about it. The OU-LIGATURE GETS NO SUCH EXEMPTION:
    # the blanket one that stood here claimed "the ou-ligature routinely
    # carries an accent and no breathing", the corpus refuted it 28:1, and it
    # hid 167 reader-lost breathings for a month — the fourth layer of the
    # absence-rendered-as-clean defect. John ruled all 192 bare sites on
    # 2026-08-11; from here a word-initial bare ȣ is a FINDING.
    if p.cl and p.cl[0][0] in 'ϗϏ':
        return None
    grp = initial_group(p.cl)
    if not grp:
        return None
    marks = ''.join(p.cl[i][1] for i in grp)
    return 'no breathing' if not any(m in BREATHINGS for m in marks) else None


@rule('C2', '§10', 'hard',
      'initial υ takes the rough breathing (Attic norm; a psilotic dialect '
      'form quoted by Bonitz would be a real exception, none seen yet)')
def c2(p: Part) -> str | None:
    if p.continues:
        return None
    grp = initial_group(p.cl)
    if not grp or lower(p.cl[grp[0]][0]) != 'υ':
        return None
    marks = ''.join(p.cl[i][1] for i in grp)
    return 'smooth on initial υ' if SMOOTH in marks else None


@rule('C3', '§11', 'hard',
      'in an ORDINARY initial diphthong the breathing on the second vowel and '
      'the accent on the first are a contradiction (ᾳ ῃ ῳ are not this case)')
def c3(p: Part) -> str | None:
    if p.continues:
        return None
    grp = initial_group(p.cl)
    if len(grp) != 2:
        return None
    first, second = p.cl[grp[0]][1], p.cl[grp[1]][1]
    # NOT "any mark on the first vowel": a breathing there is how this book
    # writes hiatus without a diaeresis — ἀίδιος is ἀ-ΐ-διος, and the
    # breathing's position is itself the proof, since a real diphthong takes
    # it on the second vowel.  Only the contradiction is impossible: the
    # breathing claiming one syllable while the accent claims the other.
    if any(m in BREATHINGS for m in second) and any(m in ACCENTS for m in first):
        return 'breathing on the second vowel, accent on the first'
    return None


# --- D. word shape ---------------------------------------------------------

@rule('D1', '§133', 'hard',
      'a Greek word ends in a vowel or in ν, ρ, ς (ξ, ψ) — save ἐκ, οὐκ, οὐχ')
def d1(p: Part) -> str | None:
    if (p.siglum or p.label or p.elided or p.truncated or p.continues
            or len(p.text) < 2):
        return None
    # An index abbreviates its own headword — under ἀδύνατον the entries read
    # `ἀδ.`, and the stop is the abbreviation mark.  A Greek letter-run ending
    # in an impossible consonant with a period hard against it is that, not a
    # misreading.
    if p.after[:1] == '.':
        return None
    bare = ''.join(lower(b) for b, _ in p.cl)
    # οὐκ and οὐχ are printed with the ligature here — ȣκ, ȣ̓χ — so the
    # exemption has to be tested after expanding it.
    # `endswith`, not `==`: crasis writes καὶ οὐκ as κοὐκ — `κȣ̓κ` here.
    if bare.replace('ȣ', 'ου').replace('ϗ', 'και').endswith(tuple(FINAL_EXEMPT)):
        return None
    last = p.cl[-1][0]
    return f'ends in {last}' if last.lower() not in FINAL_OK else None


# --- E. advisory: sound Greek, but possibly the editor's practice ----------

PROCLITICS = {'ο', 'η', 'οι', 'αι', 'εν', 'εις', 'ες', 'εξ', 'εκ', 'ως', 'ει',
              'ου', 'ουκ', 'ουχ'}
ENCLITICS = {'με', 'μου', 'μοι', 'σε', 'σου', 'σοι', 'ε', 'ου', 'οι', 'σφισι',
             'τις', 'τι', 'τινος', 'τινι', 'τινα', 'των', 'τινων', 'τισι',
             'τινες', 'τινας', 'τινε', 'τινοιν',
             'που', 'ποθι', 'ποθεν', 'ποι', 'πω', 'πως', 'ποτε', 'περ', 'τε',
             'γε', 'δε', 'τοι', 'νυν', 'ρα', 'κε', 'κεν', 'θην',
             'ειμι', 'εστι', 'εστιν', 'εισι', 'εισιν', 'ει', 'εσμεν', 'εστε',
             'φημι', 'φησι', 'φησιν', 'φαμεν', 'φατε', 'φασι', 'φασιν'}


# Bonitz cites an adjective the way a lexicon does — `ἄκρος, α, ον` — where the
# bare endings after the comma are ENDINGS, not words. They carry no accent
# because there is nothing there to accent: the accent belongs to the headword
# that precedes them. John, 2026-08-18: "this is correct as it reads
# unaccented. we need the unaccented sweep to have an exception for adjective
# headword endings like this."
#
# ⚠ NARROW ON PURPOSE. The token must be a bare unaccented Greek run sitting in
# a comma-separated list that a nominative headword opens on the same line. A
# plain "the token has a comma before it" test would silence real defects —
# `αλλα` on page-032-L:1 follows a comma nowhere, but plenty of accentless
# misprints do sit after one.
_ADJ_CITATION = re.compile(
    r'[^\s,]*(?:ος|ης|υς|ων|ας|ος)\s*,'      # the headword, nominative
    r'(?:\s*[α-ωϊϋ]{1,4}\s*,)*'              # any endings already listed
    r'\s*[α-ωϊϋ]{1,4}\s*[,.]')               # and the one under test


def adjective_ending(p: 'Part') -> bool:
    """True when this bare run is an ending in a dictionary headword citation."""
    if not p.text or any(unicodedata.combining(c) for c in p.d):
        return False
    if not all('α' <= c <= 'ω' or c in 'ϊϋ' for c in p.text):
        return False
    for m in _ADJ_CITATION.finditer(p.line):
        span = m.group()
        # the token must be one of the comma-separated endings, not the head
        tail = span[span.index(',') + 1:]
        if p.text in [t.strip(' ,.') for t in tail.split(',')]:
            return True
    return False


@rule('E1', '§170', 'advisory',
      'every word carries an accent, save the proclitics and enclitics')
def e1(p: Part) -> str | None:
    if p.siglum or p.label or p.continues or p.truncated or len(p.text) < 2:
        return None
    # Elision carries the accent off with the vowel it drops: ἀλλά is written
    # ἀλλ', ἐπί is ἐπ' (§174).  And an index abbreviates its headword — `ἀδ.`
    # for ἀδύνατον — where the stop is the abbreviation mark.
    if p.elided or p.after[:1] == '.':
        return None
    if any(c in p.text for c in LIGATURES):
        return None
    if any(m in ACCENTS for m in p.d):
        return None
    bare = ''.join(lower(b) for b, _ in p.cl if is_vowel(b) or b.isalpha())
    bare = ''.join(c for c in bare if not unicodedata.combining(c))
    if bare in PROCLITICS or bare in ENCLITICS:
        return None
    if adjective_ending(p):
        return None
    return 'no accent'


@rule('E3', '§10', 'advisory', 'initial ρ takes the rough breathing')
def e3(p: Part) -> str | None:
    if p.siglum or p.continues or len(p.text) < 2:
        return None
    if p.cl[0][0] != 'ρ':
        return None
    return 'no rough breathing on initial ρ' if ROUGH not in p.cl[0][1] else None


# --------------------------------------------------------------------------

def run(rules: list[Rule], source: str) -> dict[str, list[Hit]]:
    parts = read_parts(source)
    if not parts:
        sys.exit(f'no text found under {source}')
    hits: dict[str, list[Hit]] = {r.id: [] for r in rules}
    for col, n, p in parts:
        # The label guard buys quiet at a price — `αλλα` on 032-L:1 is a real
        # defect it hides — so what it swallowed is written out rather than
        # dropped.  A sweep that reports a bounded set must say what it bounded.
        if p.label and not p.siglum:
            hits.setdefault('_labels', []).append(
                Hit(col, n, p.text, 'unmarked run: rules abstain',
                    p.line.strip()))
        for r in rules:
            d = r.fn(p)
            if d:
                hits[r.id].append(Hit(col, n, p.text, d, p.line.strip()))
    return hits


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--source', default='corpus')
    p.add_argument('--rule', action='append', help='run only these rule ids')
    p.add_argument('--all', action='store_true', help='advisory rules too')
    p.add_argument('--list', action='store_true')
    p.add_argument('--out', type=Path, default=ROOT / 'work/sweeps/smyth')
    args = p.parse_args(argv)

    if args.list:
        for r in RULES:
            print(f'{r.id:4} {r.smyth:7} {r.tier:9} {r.statement}')
        return 0

    rules = [r for r in RULES
             if (not args.rule or r.id in args.rule)
             and (args.all or args.rule or r.tier == 'hard')]
    if not rules:
        sys.exit('no rules selected')

    hits = run(rules, args.source)
    args.out.mkdir(parents=True, exist_ok=True)
    if not args.rule:
        # A TSV for a rule that no longer exists is a trap: E2 was removed and
        # its file sat there afterwards, full of `ἢ`, ready to be acted on.
        live = {f'{r.id}.tsv' for r in RULES} | {'_labels.tsv'}
        for stale in args.out.glob('*.tsv'):
            if stale.name not in live:
                stale.unlink()
                print(f'removed stale {stale.name}')
    print(f'{args.source}\n')
    print(f'{"rule":5} {"smyth":7} {"tier":9} {"hits":>5} {"forms":>6}  statement')
    print('-' * 96)
    for rid in [r.id for r in rules] + (['_labels'] if '_labels' in hits else []):
        h = hits[rid]
        forms = Counter(x.word for x in h)
        f = args.out / f'{rid}.tsv'
        with f.open('w', encoding='utf-8') as fh:
            fh.write('column\tline\tword\tdetail\tcontext\n')
            # The same wrong form repeated across columns is stronger evidence
            # than a one-off — and likelier to be the printer's, not ours.
            for x in sorted(h, key=lambda x: (-forms[x.word], x.col, x.line)):
                fh.write(f'{x.col}\t{x.line}\t{x.word}\t{x.detail}\t'
                         f'{x.context}\n')
        r = next((x for x in rules if x.id == rid), None)
        print(f'{rid:5} {r.smyth if r else "—":7} {r.tier if r else "silenced":9} '
              f'{len(h):5d} {len(forms):6d}  '
              f'{r.statement[:52] if r else "tokens the label guard hid from every rule"}')
    print(f'\n-> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
