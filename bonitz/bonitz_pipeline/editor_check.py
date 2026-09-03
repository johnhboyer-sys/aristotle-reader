"""
Editor check — is this apparatus siglum one Bonitz's own key sanctions?

  python3 -m bonitz_pipeline.editor_check
  python3 -m bonitz_pipeline.editor_check --out work/sweeps/editor-check.tsv

Bonitz names his editors in two printed keys, p.11 and p.12, and closes p.11
by saying the list is COMPLETE BY DESIGN: *"Reliqua editorum et interpretum
nomina cum sine compendio scripta sint explicationem non requirunt"* —
everything not abbreviated there is written out in full. So an abbreviated
editor siglum that is not in the key is either our misreading or a variant he
never sanctioned, and `Bk1` at page-053-R:7 is the specimen: the ink prints
`Bk²`, and the key allows only `Bk`, `Bk2` and `Bk3`.

⚠ NOTHING CHECKS THIS. `siglum_check` and `siglum_homoglyph` are about the
WORK sigla (p.14, `work-sigla.json`), a different key entirely. `latin_check`
loads this key but only to EXEMPT its sigla from the lexicon, so an
unsanctioned variant is exempted by the very list that condemns it.

⚠ AN AUTHORITY CLAIMS NO MORE THAN ITS EVIDENCE, so the yield is tiered by
what the evidence can carry:

  numeral   the letters are a key siglum and the numeral is not sanctioned
            (`Bk1` against `Bk`/`Bk2`/`Bk3`). The stem PROVES this is an
            apparatus siglum, so the finding rests on Bonitz's own list.
  volume    a DIGIT where the editor's volume is a Roman numeral at every
            other site (`AΖι1. 77` against the 20 sites reading `AΖι I`).
            The class `encoding_check` structurally cannot see, since it
            folds Latin against Greek and knows nothing of numerals.
  spelling  one letter away from a key siglum, both at least four letters
            long (`Trdlbg` against the key's `Trdllbg`). Long enough that
            the near-miss is evidence rather than coincidence.
  unknown   capitalised, short, and nowhere in the key. HELD BACK, counted
            and written but never called a finding: Bonitz abbreviates
            ancient authors freely (`Hom`, `Emped`, `Isocr`, `Anax`), and
            they have nothing to do with the editor key. Tuning this tier
            to look better is the temptation `latin_check`'s `other` tier
            was held back to resist.

A finder, never a fixer. The diplomatic rule holds: if the ink really does
print `Bk1`, the corpus keeps it and the corrigenda register carries the
correction.

⚠ VOLUME AS WELL AS VERDICT. The key's size and the hit count per siglum are
printed, because an allowlist that silently fails reads exactly like a corpus
with nothing wrong in it. A missing key raises rather than exempting nothing.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from functools import lru_cache
from pathlib import Path

from .latin_check import SIGLA, sigla

ROOT = Path(__file__).resolve().parent.parent
RECONCILED = ROOT / 'work' / 'reconciled'
OUT = ROOT / 'work' / 'sweeps' / 'editor-check.tsv'

# A candidate apparatus siglum: capitalised, short, with whatever digits are
# welded to it.
#
# ⚠ ONE DIGIT IS AN EDITION, MORE IS A PAGE, AND READING TWO OF THEM MADE
# BOTH OF THE FIRST RUN'S FALSE FINDINGS. `Cuv F304, 9` is Cuvier at page
# 304 and `AΖι I121 n2` is Aubert-Wimmer volume I page 121; taking the first
# two digits of each produced `F30` and `I12`, sigla that are nowhere on the
# page. Bonitz's edition numerals are single digits (`Bk²`, `Bk³`), and
# Bekker pages are four, so the count of digits is what tells them apart.
#
# ⚠ LONG ENOUGH FOR THE LONGEST SIGLUM IN THE KEY. `Sonnenburg` is ten
# letters and `Fritzsche` nine; a pattern that stopped at nine could never
# see the first of them, and a siglum the check cannot match is a siglum it
# silently reports as absent.
CANDIDATE = re.compile(r'(?<![A-Za-zΑ-Ωα-ω0-9])([A-Z][A-Za-z]{0,11})(\d*)'
                       r'(?![A-Za-z])')


# Bonitz, p.11: *"litterae A, ubi opus erat, additum est siglum eius libri
# Aristotelici ad quem pertinet horum interpretum adnotatio, velut AΖι"* —
# the editor's letter, then the WORK siglum, then Aubert-Wimmer's volume as a
# ROMAN numeral: `AΖι I 77`. `Ka` (Karsch) is keyed the same way.
#
# ⚠ A DIGIT IN THE VOLUME POSITION IS INVISIBLE TO `encoding_check`, which
# folds Latin against Greek and knows nothing of numerals — the gap named in
# the 2026-08-12 handoff. It is caught here instead of in a sweep of its own,
# because the whole corpus holds exactly ONE instance: the general shape was
# measured first (32 tokens carry a digit inside a letter run, and all 32 are
# a siglum with its Bekker page, `οβ1347a`), and a module for a class with no
# other member would be a check pretending to a reach it does not have.
#
# One digit only, and not followed by another: `AΖγ216` is page 216 with the
# space closed — that gap is John's RENDER rule of 2026-08-13, not an error.
EDITOR_VOLUME = re.compile(r'(?<![A-Za-z])([AK][a-z]?)([Α-Ωα-ω]{1,3})(\d)(?!\d)')

ROMAN_VOLUME = re.compile(r'(?<![A-Za-z])([AK][a-z]?)([Α-Ωα-ω]{1,3})\s*(I+)\b')


class EditorCheckError(Exception):
    """The check could not run. Raised, never warned: a check that skips its
    own authority reports a clean corpus it never examined."""


@lru_cache(maxsize=1)
def sanctioned() -> frozenset[str]:
    """Every siglum the key allows, INCLUDING the numeral variants its prose
    states.

    `Bk2` and `Bk3` are not keys in the JSON — they live in Bekker's note,
    *"Bk2 and Bk3 are his second and third editions of some books"*. Reading
    them out of the prose is how a person learns them from the page, and the
    alternative is a hand-kept second list that can drift from the key it
    describes. Only tokens whose LETTERS are already a siglum are taken, so
    the ordinary Latin of the key's own descriptions cannot leak in.
    """
    base = set(sigla())
    doc = json.loads(SIGLA.read_text(encoding='utf-8'))
    for token in re.findall(r'\b([A-Z][A-Za-z]{0,8})(\d{1,2})\b',
                            json.dumps(doc, ensure_ascii=False)):
        if token[0] in base:
            base.add(token[0] + token[1])
    return frozenset(base)


def _edit1(a: str, b: str) -> bool:
    """True when one insertion, deletion or substitution turns `a` into `b`."""
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    short, long = (a, b) if len(a) < len(b) else (b, a)
    for i in range(len(long)):
        if long[:i] + long[i + 1:] == short:
            return True
    return False


def classify(token: str, key: frozenset[str]) -> tuple[str, str]:
    """(tier, the key siglum it answers to) for one candidate."""
    if token in key:
        return 'sanctioned', token
    stem = token.rstrip('0123456789')
    if stem != token and stem in key:
        return 'numeral', stem
    if len(token) >= 4:
        near = sorted(k for k in key if len(k) >= 4 and _edit1(token, k))
        if near:
            return 'spelling', near[0]
    return 'unknown', ''


def run(files: list[Path]) -> tuple[list[dict], collections.Counter]:
    """Every candidate in the corpus, tiered. Reads; writes nothing."""
    if not files:
        raise EditorCheckError(
            f'no columns to read — is {RECONCILED} empty? A check that reads '
            f'nothing must not report a clean corpus')
    key = sanctioned()
    rows, counts = [], collections.Counter()
    hits: collections.Counter = collections.Counter()
    for f in sorted(files):
        counts['columns'] += 1
        for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
            for m in CANDIDATE.finditer(line):
                letters, digits = m.group(1), m.group(2)
                # More than one digit is a page or a volume-and-page, not an
                # edition: judge the letters and let the number alone.
                token = letters + digits if len(digits) == 1 else letters
                counts['candidates'] += 1
                tier, answers = classify(token, key)
                counts[tier] += 1
                if tier == 'sanctioned':
                    hits[token] += 1
                    continue
                rows.append({'column': f.stem, 'line': str(i),
                             'token': token, 'tier': tier,
                             'sanctioned': answers,
                             'evidence': _evidence(tier, token, answers, key),
                             'context': line.strip()[:70]})
            for m in EDITOR_VOLUME.finditer(line):
                counts['volume'] += 1
                rows.append({'column': f.stem, 'line': str(i),
                             'token': m.group(0), 'tier': 'volume',
                             'sanctioned': f'{m.group(1)}{m.group(2)} I',
                             'evidence': '', 'context': line.strip()[:70]})
            counts['roman'] += len(ROMAN_VOLUME.findall(line))
    # ⚠ HOW OFTEN THE UNSANCTIONED FORM RECURS IS PART OF THE EVIDENCE, and
    # it points BOTH ways. `Bk1` stands alone against 20 `Bk` and 6 `Bk3`,
    # which reads like a slip. `Trdlbg` is spelt the same way at all 8 of its
    # sites, which reads like Bonitz's habit in the body differing from his
    # own key — a fact about the book, not a defect. Neither is decided here;
    # the count travels with the card so John is not shown a lone site and a
    # settled convention in the same shape.
    for r in rows:
        if r['tier'] == 'volume':
            # The siblings ARE the evidence: the volume is a Roman numeral
            # everywhere else this editor is cited, so a bare digit here is
            # the numeral `I` set as a `1`.
            r['evidence'] = (
                f'{counts["roman"]} sites set this editor\'s volume as a '
                f'Roman numeral ({r["sanctioned"]}); this one is a digit, '
                f'which no other site is')
    seen = collections.Counter(r['token'] for r in rows)
    for r in rows:
        n = seen[r['token']]
        r['evidence'] += (f' · {n} site{"s" if n > 1 else ""} in the corpus, '
                          f'all spelt this way' if n > 1 else
                          ' · the only site in the corpus')
    counts['key'] = len(key)
    counts['sigla seen'] = len(hits)
    return rows, counts, hits


def _evidence(tier: str, token: str, answers: str, key: frozenset[str]) -> str:
    if tier == 'numeral':
        allowed = sorted(k for k in key if k.rstrip('0123456789') == answers)
        return (f'{answers} is in Bonitz\'s key; the key sanctions '
                f'{", ".join(allowed)} and not {token}')
    if tier == 'spelling':
        return (f'one letter from {answers}, which is in the key; {token} '
                f'is not')
    return f'{token} is nowhere in the p.11/p.12 key'


def write_tsv(rows: list[dict], out: Path) -> None:
    """Written even when empty: a header-only file says 'ran, found none',
    where a missing file cannot be told from a run that never looked."""
    head = ['column', 'line', 'token', 'tier', 'sanctioned', 'evidence',
            'context']
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', encoding='utf-8') as f:
        f.write('\t'.join(head) + '\n')
        for r in rows:
            f.write('\t'.join(r[h].replace('\t', ' ') for h in head) + '\n')


def summary(counts: collections.Counter, hits: collections.Counter) -> str:
    top = ' '.join(f'{k}×{v}' for k, v in hits.most_common(12))
    return (
        f'{counts["columns"]} columns, {counts["candidates"]} candidate '
        f'sigla examined against a key of {counts["key"]}\n'
        f'  sanctioned:  {counts["sanctioned"]:>4}  ({counts["sigla seen"]} '
        f'distinct)  {top}\n'
        f'  numeral:     {counts["numeral"]:>4}  (letters in the key, the '
        f'numeral not)\n'
        f'  volume:      {counts["volume"]:>4}  (a digit where the editor\'s '
        f'volume is a Roman numeral at {counts["roman"]} other sites)\n'
        f'  spelling:    {counts["spelling"]:>4}  (one letter from a key '
        f'siglum)\n'
        f'  unknown:     {counts["unknown"]:>4}  HELD BACK — mostly ancient '
        f'authors Bonitz abbreviates freely')


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--reconciled', type=Path, default=RECONCILED)
    p.add_argument('--out', type=Path, default=OUT)
    p.add_argument('--show-unknown', action='store_true',
                   help='print the held-back tier too')
    a = p.parse_args(argv)

    rows, counts, hits = run(sorted(a.reconciled.glob('page-*.txt')))
    write_tsv(rows, a.out)
    for r in rows:
        if r['tier'] == 'unknown' and not a.show_unknown:
            continue
        print(f'  {r["tier"]:<9} {r["column"]}:{r["line"]:<4} '
              f'{r["token"]:<10} {r["evidence"]}')
        print(f'            {r["context"]}')
    print()
    print(summary(counts, hits))
    print(f'\n-> {a.out}')
    print('⚠ a question for the ink, never a correction: if Bonitz really '
          'set the unsanctioned form, the corpus keeps it and the corrigenda '
          'register\n  carries the fix.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
