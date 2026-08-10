"""Breathings decided by the lexicon, before anyone is asked to look.

A breathing is a property of the LEMMA, not of the inflected form: ἁλιεύς is
rough in every case and number it ever takes.  LSJ's headwords carry it — 13,776
of them, fully accented — and their diacritic-free skeletons are almost
perfectly unique, 13,685 distinct.  So a disputed breathing can look up its own
answer, and no reader's opinion is needed.

Measured against John's own hand rulings on 2026-08-10: **16 of 18 reproduced
exactly**.  The seventeenth is `αλλα` at 032-L:1, the printer's error he ruled
to PRESERVE unaccented — LSJ says ἀλλά, which is not a disagreement but exactly
the flag one wants.  The eighteenth LSJ has no headword for.

⚠ THIS IS WHY IT IS NEEDED AT ALL.  `lexcheck` already knows 56,053 attested
Aristotle forms, and cannot help here: it strips diacritics before comparing, so
on this class it is structurally blind — the same blindness as `fold()`, which
is what let 154 mark-queue rows sit unexamined until 2026-08-08.  An authority
that folds the distinction cannot arbitrate it.

⚠ AND IT DOES NOT REACH ACCENTS.  Acute against grave is positional — Smyth
§154, a final acute becomes grave before a following word — not lexical.  LSJ
cannot settle it and neither can any dictionary; that stays with `accent_law`,
and some of it stays with John.

    python3 -m bonitz_pipeline.breathing_oracle            # what it can decide
    python3 -m bonitz_pipeline.breathing_oracle --check    # against the corpus
"""

from __future__ import annotations
import argparse
import glob
import json
import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = Path('/Users/johnboyer/Developer/aristotle-reader/build/dist')

ROUGH, SMOOTH = '̔', '̓'
WORD = re.compile(r'[Ͱ-Ͽἀ-῿̀-ͯȣϗ]{2,}')


def skeleton(w: str) -> str:
    """The word with every mark stripped — what two readings share."""
    return ''.join(c for c in unicodedata.normalize('NFD', w)
                   if not unicodedata.combining(c)).lower()


def breathing(w: str) -> str:
    d = unicodedata.normalize('NFD', w)
    return 'rough' if ROUGH in d else 'smooth' if SMOOTH in d else 'none'


@lru_cache(maxsize=1)
def attested() -> dict[str, dict[str, int]]:
    """Aristotle's own ACCENTED text, skeleton -> {form: how often}.

    ⚠ THIS REPLACED LSJ HEADWORDS, WHICH WERE CONFIDENTLY WRONG. `ἐξ` (out of)
    and `ἕξ` (six) share the skeleton `εξ`, and LSJ carries only one of them as
    a headword — so an oracle asking LSJ "decided" rough and condemned every
    legitimate `ἐξ` in the book. Same for ἐν/ἕν, οἷς/ὄϊς, ἣν/ἤν: the skeletons
    that collide are exactly the high-frequency function words, so the error was
    not rare but constant.

    Aristotle's text does not have that problem. It shows ἐξ 2,111 times AND ἕξ
    20 times, which is the truth: both are words, and the lexicon must therefore
    stay silent. 53,348 distinct forms, accents and breathings intact.
    """
    out: dict[str, dict[str, int]] = {}
    for p in glob.glob(str(DIST / '*/book-*.json')):
        for seg in json.loads(Path(p).read_text(encoding='utf-8')).get('segments', []):
            for g in seg.get('greek', []):
                for t in g.get('tokens', []):
                    w = t.get('t') or ''
                    if w:
                        d = out.setdefault(skeleton(w), {})
                        d[w] = d.get(w, 0) + 1
    return out


@lru_cache(maxsize=1)
def headwords() -> dict[str, set[str]]:
    """LSJ's accented headwords — a FALLBACK only, for what Aristotle lacks."""
    out: dict[str, set[str]] = {}
    for f in glob.glob(str(DIST / 'lsj/*.json')):
        for v in json.loads(Path(f).read_text(encoding='utf-8')).values():
            head = v.get('head') or ''
            if head:
                out.setdefault(skeleton(head), set()).add(head)
    return out


@lru_cache(maxsize=1)
def lemmas() -> dict[str, list[str]]:
    """form skeleton -> lemma names, for words that are not headwords.

    ⚠ THE MAP IS DIACRITIC-FREE, which is why it cannot arbitrate on its own —
    it folds exactly the mark under dispute. It is used only to get from an
    inflected form to a LEMMA, whose breathing LSJ then supplies.
    """
    out: dict[str, list[str]] = {}
    for f in glob.glob(str(DIST / 'lemma-map/*.json')):
        out.update(json.loads(Path(f).read_text(encoding='utf-8')))
    return out


def decide(word: str) -> tuple[str, str] | None:
    """(breathing, the evidence), or None where the question is genuinely open.

    Aristotle's own text first. It answers only when EVERY attested form
    sharing this skeleton takes the same breathing — where he writes both, the
    word is ambiguous in fact and no authority should pretend otherwise.
    """
    skel = skeleton(word)
    seen = attested().get(skel)

    # ⚠ THE EXACT FORM SETTLES ITSELF. If Aristotle writes this very word,
    # breathing and all, there is nothing to decide and nothing to flag.
    if seen and word in seen:
        return breathing(word), f'Aristotle writes {word} ({seen[word]}x)'

    # ⚠ AND A DICTIONARY'S REAL JOB IS TO SAY WHEN GREEK IS AMBIGUOUS, not to
    # count. Codex, 2026-08-10: `decide("ἕκτος")` returned SMOOTH, because
    # Aristotle writes ἐκτός (outside) 137 times and never ἕκτος (sixth) — so
    # the corpus, asked about a skeleton, answered about a different word.
    # LSJ holds BOTH under `εκτος` and knew perfectly well. Same for ὀδών
    # against ὁδῶν.
    #
    # This is the ἐξ/ἕξ failure again in its second form: there I fixed the case
    # where Aristotle writes both, and left the case where he writes only one.
    # Frequency cannot settle which word is on the page; only the page can.
    # ⚠ AMBIGUITY IS THE UNION OF WHAT BOTH AUTHORITIES KNOW. Checking LSJ
    # alone still let `ὀδών` through: LSJ holds it (smooth, a tooth) and the
    # corpus holds `ὁδῶν` (rough, of roads), so NEITHER source is internally
    # ambiguous and together they are. A skeleton two real Greek words share is
    # undecidable however each authority looks on its own.
    known = set(headwords().get(skel) or ()) | set((seen or {}))
    if len({breathing(k) for k in known if breathing(k) != 'none'}) > 1:
        return None

    if seen:
        # ⚠ ONLY FORMS THAT CARRY A BREATHING MAY VOTE ON ONE. Aristotle's text
        # holds uppercase runs like `ΑΓ` which have none, and skeletonising
        # lowercases them onto `ἀγ` — so the oracle "decided" that a word with a
        # smooth breathing should have no breathing at all, 29 times over.
        marked = {w: n for w, n in seen.items() if breathing(w) != 'none'}
        if not marked:
            return None
        marks = {breathing(w) for w in marked}
        if len(marks) == 1:
            best = max(marked, key=marked.get)
            return marks.pop(), f'Aristotle writes {best} ({marked[best]}x)'
        return None            # he writes both — the lexicon must not choose
    # ⚠ THE LSJ FALLBACK ONLY SPEAKS WHERE IT CANNOT BE CONFUSED. `Ἅιδης` and
    # `ἀϊδής` share a skeleton and disagree; a headword list that happens to
    # hold one of a colliding pair is not evidence, it is an accident of
    # coverage. Require the skeleton to be unique in LSJ.
    # …and never about a PROPER NOUN. `Ἅιδης` is Hades; LSJ under that skeleton
    # holds only the common adjective `ἀϊδής`, unseen — a coverage gap that
    # looks exactly like evidence. A dictionary of common words cannot rule on
    # a name it does not contain.
    if word[:1].isupper():
        return None
    hw = headwords()
    for key in (skel, *(skeleton(l) for l in lemmas().get(skel, []))):
        cands = hw.get(key)
        if not cands or len(cands) != 1:
            continue
        head = next(iter(cands))
        if breathing(head) == 'none':
            continue
        return breathing(head), f'LSJ has {head}'
    return None


def arbitrate(readings: dict[str, str]) -> tuple[str, str] | None:
    """Given reader -> word, which reading does the lexicon accept?

    Returns (word, why) only where the lexicon ACCEPTS SOME AND REJECTS OTHERS.
    Where every reading agrees with it, or none does, there is nothing to
    arbitrate and the dispute goes to a human — silence here is the honest
    answer, not a failure.
    """
    if len(set(readings.values())) < 2:
        return None
    good = {}
    for w in set(readings.values()):
        d = decide(w)
        if d and d[0] == breathing(w):
            good[w] = d[1]
    if len(good) == 1 and len(good) < len(set(readings.values())):
        w, head = next(iter(good.items()))
        return w, f'LSJ has {head}, which is {breathing(w)}'
    return None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--check', action='store_true',
                   help='test every word in the corpus against the lexicon')
    a = p.parse_args(argv)

    hw = headwords()
    print(f'{sum(len(v) for v in hw.values()):,} LSJ headwords, '
          f'{len(hw):,} distinct skeletons, {len(lemmas()):,} form->lemma entries')
    if not a.check:
        return 0

    agree = differ = unknown = 0
    rows = []
    for f in sorted((ROOT / 'work/reconciled').glob('*.txt')):
        for n, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
            for m in WORD.finditer(line):
                w = m.group(0)
                if breathing(w) == 'none' or len(skeleton(w)) < 4:
                    continue
                # ⚠ AN ABBREVIATED HEADWORD IS NOT A WORD. Bonitz sets `ἀγ.`
                # for ἀγαθόν throughout his own entries, and judging its
                # breathing against a lexicon judges a fragment.
                if line[m.end():m.end() + 1] == '.':
                    continue
                d = decide(w)
                if d is None:
                    unknown += 1
                elif d[0] == breathing(w):
                    agree += 1
                else:
                    differ += 1
                    rows.append((f.stem, n, w, d[0], d[1]))
    print(f'\n{agree + differ + unknown:,} words carry a breathing:')
    print(f'  {agree:>6,} confirmed by the lexicon')
    print(f'  {differ:>6,} DISAGREE — candidates for the ink')
    print(f'  {unknown:>6,} the lexicon cannot speak to\n')
    for col, n, w, want, head in rows[:40]:
        print(f'  {col}:{n:<4} {w:<18} is {breathing(w):<6} but {head} '
              f'({want})')
    if len(rows) > 40:
        print(f'  … and {len(rows) - 40} more')
    return 0


if __name__ == '__main__':
    sys.exit(main())
