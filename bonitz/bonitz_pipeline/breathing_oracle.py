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
# ⚠ ELISION TERMINATES THE TOKEN. Four characters print the same mark —
# U+1FBD koronis, U+1FBF psili, U+2019, ASCII ' — and only the first two sit
# inside ἀ-῿, so without an explicit trailer `ȣ̓́θ'` became `ȣ̓́θ` (skeleton
# length 3) and never reached the oracle. The trailer is OPTIONAL AND FINAL
# only: ἀλλ'ὅταν stays two words, and Latin d'Alembert is never glued on.
WORD = re.compile(r"[Ͱ-Ͽἀ-῿̀-ͯȣϗ]{2,}['᾽᾿’]?")


def skeleton(w: str) -> str:
    """The word with every mark stripped — what two readings share.

    ⚠ BONITZ'S LIGATURES ARE LETTERS TO US AND SORTS TO HIM. `ȣ` is ου and `ϗ`
    is καί, set as one piece of type; a skeleton that keeps them is a key no
    Greek index can hold, so `ἔχȣσιν` matched neither Aristotle's text nor LSJ
    nor the lemma map — three authorities silent at once, all for a typographic
    convention. `locate.strip()` expanded them from the start; this did not.
    """
    w = w.replace('ȣ', 'ου').replace('Ȣ', 'ου').replace('ϗ', 'και')
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


BETA = dict(zip('αβγδεζηθικλμνξοπρστυφχψωςϲ', 'abgdezhqiklmncoprstufxywss'))
# Bonitz's page, not the lemma map's alphabet: the ου ligature, καί, and the
# three characters an OCR reader may set for an elision mark.
BETA |= {'ȣ': 'ou', 'ϗ': 'kai', '᾽': "'", '᾿': "'", '’': "'"}


def beta(skel: str) -> str:
    """A Greek skeleton in Beta Code, which is how the lemma map is keyed.

    ⚠ FINAL SIGMA IS A SEPARATE LETTER and omitting it here cost nothing
    visible: `ἁφῆς` became `afhς`, missed, and looked exactly like a word the
    lemma map does not hold. Every Greek noun ending in -ς — most of them —
    would have failed that way in silence.

    ⚠ AND SO IS `ȣ`. Grok, 2026-08-10: Bonitz sets the ου ligature as a single
    sort, and 1,696 of his words carry it. Every one of them passed the
    ligature through unmapped — `ἔχȣσιν` -> `exȣsin` — and missed. 1,532 join
    once it is spelled `ou`. Third time this exact shape of bug has been found
    in this module: an unmapped character does not raise, it just quietly stops
    matching, and the coverage number that would reveal it looks fine.
    """
    return ''.join(BETA.get(c, c) for c in skel)


@lru_cache(maxsize=1)
def lemmas() -> dict[str, list[str]]:
    """form skeleton (BETA CODE) -> lemma names, for words that are not headwords.

    ⚠ THE MAP IS DIACRITIC-FREE, which is why it cannot arbitrate on its own —
    it folds exactly the mark under dispute. It is used only to get from an
    inflected form to a LEMMA, whose breathing LSJ then supplies.

    ⚠ AND IT IS KEYED `outos`, NOT `ουτος`. It was looked up with a Greek
    skeleton for as long as it existed, so it matched NOTHING, 45,942 entries
    answering every question with silence — indistinguishable from a lexicon
    that simply had no opinion. Nothing failed; the fallback just never ran.
    """
    out: dict[str, list[str]] = {}
    for f in glob.glob(str(DIST / 'lemma-map/*.json')):
        out.update(json.loads(Path(f).read_text(encoding='utf-8')))
    return out


@lru_cache(maxsize=1)
def by_lemma() -> dict[str, set[str]]:
    """lemma name (bare Beta) -> its accented LSJ headwords.

    LSJ keys carry their marks — `a)be/baios` — and the lemma map's names do
    not, so the join is on the bare letters. One bare name can reach two
    headwords, and that is the point: `oios` reaches BOTH οἶος and οἷος.
    """
    out: dict[str, set[str]] = {}
    for f in glob.glob(str(DIST / 'lsj/*.json')):
        for k, v in json.loads(Path(f).read_text(encoding='utf-8')).items():
            head = v.get('head') or ''
            if head:
                out.setdefault(re.sub(r'[^a-z]', '', k.lower()), set()).add(head)
    return out


def family(skel: str) -> set[str]:
    """Every accented headword this form could be an inflection of."""
    out: set[str] = set()
    for name in lemmas().get(beta(skel)) or ():
        out |= by_lemma().get(re.sub(r'[^a-z]', '', name.lower())) or set()
    return out


def decide(word: str) -> tuple[str, str] | None:
    """(breathing, the evidence), or None where the question is genuinely open.

    Aristotle's own text first. It answers only when EVERY attested form
    sharing this skeleton takes the same breathing — where he writes both, the
    word is ambiguous in fact and no authority should pretend otherwise.
    """
    # ⚠ THE SAME WORD IN TWO NORMAL FORMS IS TWO DICTIONARY KEYS. Grok,
    # 2026-08-10: an NFD `ἁφῆς` misses the exact-form check that its NFC twin
    # passes, and falls through to a different branch. Bonitz's files are NFC
    # today, so this is latent — which is precisely when it is cheap to close.
    word = unicodedata.normalize('NFC', word)
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
    # ⚠ AND THE WORD'S OWN LEMMA IS AN AUTHORITY TOO. Grok, 2026-08-10: the
    # corpus generalised from a skeleton whenever it held no counterexample —
    # so `οἶα`, which Aristotle does not write, was corrected to `οἷα`, which
    # he writes 39 times. But οἶος (alone) and οἷος (such as) are two words,
    # and only the second is his. Absence from one author is not absence from
    # the language, and an INFLECTED form has no headword of its own to say so:
    # the skeleton check above sees nothing, because `οια` is nobody's headword.
    #
    # The lemma map crosses that gap — `oia` -> `oios` -> {οἶος, οἷος} — and two
    # breathings in one family is the same disqualification as two headwords.
    known = (set(headwords().get(skel) or ()) | set((seen or {}))
             | family(skel))
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
    for cands in (headwords().get(skel), family(skel)):
        marked = {h for h in (cands or ()) if breathing(h) != 'none'}
        if len(marked) != 1:
            continue
        head = next(iter(marked))
        return breathing(head), f'LSJ has {head}'
    return None


def arbitrate(readings: dict[str, str]) -> tuple[str, str] | None:
    # ⚠ AN APPLIER MUST CHANGE THE BREATHING AND NOTHING ELSE. Codex,
    # 2026-08-10: the evidence string reads `LSJ has ἁλουργός`, and a caller
    # that took it for a replacement SPELLING would quietly rewrite Bonitz's
    # `ȣ` — the ligature is his ink and our expansion of it is a lookup key,
    # never a reading. Thirteen of the current proposals print `ἀλȣργ…`. No
    # applier exists yet; this is here for the one that will.
    """Given reader -> word, which reading does the lexicon accept?

    Returns (word, why) only where the lexicon ACCEPTS SOME AND REJECTS OTHERS.
    Where every reading agrees with it, or none does, there is nothing to
    arbitrate and the dispute goes to a human — silence here is the honest
    answer, not a failure.
    """
    if len(set(readings.values())) < 2:
        return None
    # ⚠ AND `decide` IS NOT ENOUGH ON ITS OWN HERE. Grok, 2026-08-10: it
    # returns early for any form Aristotle actually writes, BEFORE the family
    # gate runs — so on a genuinely split pair it confirms the attested member
    # and says nothing about the other, and arbitration reads that silence as a
    # verdict. Confirming a word is safe; PREFERRING it over an equally real
    # alternative is the one thing arbitration must never do on absence.
    for w in set(readings.values()):
        s = skeleton(w)
        known = (set(headwords().get(s) or ()) | set(attested().get(s) or {})
                 | family(s))
        if len({breathing(k) for k in known if breathing(k) != 'none'}) > 1:
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
                #
                # ⚠ NOR IS HALF OF A WORD BROKEN AT THE MEASURE. Grok,
                # 2026-08-10: `αἰδε-` is the head of αἰδεῖσθαι and the lemma map
                # matched the fragment to ὅδε, so the oracle proposed ROUGH for
                # a smooth word; `ἡμαρ-` (ἡμαρτημένοι) drew ἦμαρ out of LSJ the
                # same way. A fragment always looks like some shorter word.
                if line[m.end():m.end() + 1] in ('.', '-', '‐', '‑', '–'):
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
