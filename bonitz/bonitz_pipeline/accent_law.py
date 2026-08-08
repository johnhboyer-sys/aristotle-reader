"""
Flag accentuations Greek does not permit — Smyth's rules as a validator.

Every other check in this project compares readers.  That cannot find an error
all the readers share, and it cannot find one the comparator folds away.  The
accent laws need no reference at all: certain placements are simply impossible,
so a word violating one is wrong however many readers agree on it.

Implemented (Smyth, Greek Grammar, ed. Messing):

  §166  When the ultima is LONG, the acute cannot stand on the antepenult,
        nor the circumflex on the penult.  (ἄνθρωπου and δῶρου are impossible.)
  §167c When the ultima is short and the accented penult is long BY NATURE
        (η, ω, or a diphthong), the accent is the circumflex, not the acute.
  §163  No accent may stand further back than the antepenult.

Deliberately NOT implemented, because they are contextual rather than lexical
and this file must produce no false positives:

  §154  final acute becomes grave before a following word — so acute-vs-grave
        on the ultima is never decidable from the word alone.
  §183a enclitics throw a second accent onto the host, so two accents on one
        word is legal; only the FIRST is tested here (cf. accent.py).
  §171  contraction rules — they explain WHY a circumflex sits where it does
        (ἀλλοιό-ε-σθαι -> ἀλλοιοῦσθαι, §171b) but need the uncontracted form.

Quantity is only asserted where it is certain: η and ω are always long, ε and
ο always short, a diphthong is long EXCEPT final -αι/-οι (§169).  α, ι and υ
are ambiguous and any word whose verdict would depend on one is skipped, not
guessed — which is why this reports few candidates and each is worth reading.

    python3 -m bonitz_pipeline.accent_law
    python3 -m bonitz_pipeline.accent_law --source raw/llama-best
"""

from __future__ import annotations
import argparse
import glob
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ACUTE, GRAVE, CIRC, SUBSCRIPT = '́', '̀', '͂', 'ͅ'
DIAERESIS = '̈'
CIRC_ALT = '̃'                       # combining tilde, same printed mark
VOWELS = 'αειουηωῐῑῠῡ'
LONG_V, SHORT_V = 'ηω', 'εο'
DIPHTHONGS = {'αι', 'ει', 'οι', 'υι', 'αυ', 'ευ', 'ου', 'ηυ', 'ωυ'}

WORD = re.compile(r"[Ͱ-Ͽἀ-῿ȣϗ][Ͱ-Ͽἀ-῿ȣϗ̀-ͯ͂ͅ']*")


def strip_marks(s: str) -> str:
    return ''.join(c for c in s if not unicodedata.combining(c))


def syllables(w: str) -> list[str]:
    """Split NFD text into syllables, crudely but adequately for accent tests.

    Only vowel nuclei matter here: each nucleus (vowel or diphthong) with its
    marks becomes one syllable and consonants attach to whatever follows.
    """
    out, cur, i = [], '', 0
    while i < len(w):
        ch = w[i]
        base = strip_marks(ch)
        if base and base.lower() in VOWELS:
            nucleus = ch
            j = i + 1
            while j < len(w) and unicodedata.combining(w[j]):
                nucleus += w[j]
                j += 1
            # a following vowel may form a diphthong
            if j < len(w) and strip_marks(w[j]).lower() in VOWELS:
                pair = (strip_marks(ch) + strip_marks(w[j])).lower()
                # A diaeresis on the second vowel says the two are pronounced
                # apart, so no diphthong forms: Κά-ϊ-κον, αἱ-μορ-ρο-ΐ-δες.
                # Ignoring it invented four violations out of thirteen.
                after = w[j + 1:j + 3]
                if pair in DIPHTHONGS and DIAERESIS not in after:
                    nucleus += w[j]
                    j += 1
                    while j < len(w) and unicodedata.combining(w[j]):
                        nucleus += w[j]
                        j += 1
            out.append(cur + nucleus)
            cur, i = '', j
        else:
            cur += ch
            i += 1
    if cur and out:
        out[-1] += cur
    elif cur:
        out.append(cur)
    return out


def quantity(syl: str, final: bool) -> str | None:
    """'long', 'short', or None when α/ι/υ leaves it genuinely undecidable."""
    letters = strip_marks(syl).lower()
    nuc = ''.join(c for c in letters if c in VOWELS)
    if not nuc:
        return None
    if len(nuc) >= 2 and nuc[-2:] in DIPHTHONGS:
        # §169: final -αι and -οι count short — but only when the WORD ends
        # there. In ζῴοις the οι is followed by ς, so it is an ordinary long
        # diphthong; testing the vowel nucleus alone called it short and made
        # ζῴοις look like a §167c violation. (Optative -αι/-οι and locative
        # οἴκοι are long even word-finally, so a verdict resting on this rule
        # alone still wants eyes.)
        if final and letters.endswith(('αι', 'οι')):
            return 'short'
        return 'long'
    v = nuc[-1]
    if v in LONG_V:
        return 'long'
    if v in SHORT_V:
        return 'short'
    if SUBSCRIPT in unicodedata.normalize('NFD', syl):
        return 'long'                      # ᾳ ῃ ῳ are long
    return None                            # α, ι, υ — do not guess


def accent_of(syl: str) -> str | None:
    d = unicodedata.normalize('NFD', syl).replace(CIRC_ALT, CIRC)
    for m in (CIRC, ACUTE, GRAVE):
        if m in d:
            return {CIRC: 'circumflex', ACUTE: 'acute', GRAVE: 'grave'}[m]
    return None


def check(word: str) -> str | None:
    """Return a violated rule, or None. Silence means 'not provably wrong'."""
    w = unicodedata.normalize('NFD', word).replace(CIRC_ALT, CIRC)
    syls = syllables(w)
    if len(syls) < 2:
        return None
    marked = [(i, accent_of(s)) for i, s in enumerate(syls) if accent_of(s)]
    if not marked:
        return None
    i, acc = marked[0]                     # §183a: only the first accent counts
    pos = len(syls) - 1 - i                # 0 = ultima, 1 = penult, 2 = antepenult
    plain = strip_marks(w).lower()
    if pos > 2:
        return '§163 accent before the antepenult'
    ult = quantity(syls[-1], final=True)
    if ult == 'long':
        # §163a: "Some nouns in -εως and -εων admit the acute on the
        # antepenult... the genitive of nouns in -ις and -υς (πόλεως, πόλεων,
        # ἄστεως), the forms of the Attic declension, as ἵλεως. So the Ionic
        # genitive in -εω (πολίτεω); also some compound adjectives in -ως."
        # This is the single largest exception in an Aristotelian index, where
        # αἰσθήσεως, φύσεως and κινήσεως are everywhere.
        if pos == 2 and acc == 'acute' and not plain.endswith(
                ('εως', 'εων', 'εω', 'ως')):
            return '§166 acute on antepenult with long ultima'
        if pos == 1 and acc == 'circumflex':
            return '§166 circumflex on penult with long ultima'
    if ult == 'short' and pos == 1 and acc == 'acute':
        # ὥσπερ, ὥστε, μήτε, οὔτε: the accent belongs to the first element and
        # the appended particle does not re-trigger the penult rule (cf. §186).
        if plain.endswith(('περ', 'τε', 'δε', 'γε', 'τοι')):
            return None
        if quantity(syls[-2], final=False) == 'long':
            return '§167c acute on long penult, short ultima (want circumflex)'
    return None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--source', default='work/reconciled',
                   help='directory of text to check (default the corpus)')
    p.add_argument('--out', type=Path,
                   default=ROOT / 'work/sweeps/accent-law-violations.tsv')
    args = p.parse_args(argv)

    pat = str(ROOT / args.source / '*')
    files = sorted(f for f in glob.glob(pat) if f.endswith(('.txt', '.md')))
    if not files:
        sys.exit(f'no text found under {args.source}')

    rows, forms = [], Counter()
    for f in files:
        stem = Path(f).stem
        for n, line in enumerate(unicodedata.normalize(
                'NFC', Path(f).read_text(encoding='utf-8')).splitlines(), 1):
            for w in WORD.findall(line):
                if 'ȣ' in w or 'ϗ' in w:
                    continue               # ligature carries its own accent
                if line[line.find(w) + len(w):len(line)][:1] == '-':
                    continue               # hyphenated at the line end: πλείο-
                rule = check(w)
                if rule:
                    rows.append((stem, n, w, rule, line.strip()))
                    forms[(w, rule)] += 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('w', encoding='utf-8') as fh:
        fh.write('column\tline\tword\trule\tcontext\n')
        for r in sorted(rows, key=lambda r: (-forms[(r[2], r[3])], r[0], r[1])):
            fh.write('\t'.join(str(x) for x in r) + '\n')

    print(f'{len(files)} files, {len(rows)} violations, '
          f'{len(forms)} distinct forms -> {args.out}')
    for (w, rule), n in forms.most_common(30):
        print(f'  {n:4d}  {w:18} {rule}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
