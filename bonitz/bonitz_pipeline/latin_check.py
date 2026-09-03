"""
Latin check — is this Latin word a word, or a broken letter?

  python3 -m bonitz_pipeline.latin_check
  python3 -m bonitz_pipeline.latin_check --reconciled work/reconciled --out work/sweeps/latin-check.tsv

Every other sweep here reads Bonitz's Greek. His Latin apparatus — the `opp`,
the `dist`, the `versus Hom affertur` — is a fifth of the ink and no rule has
ever looked at it. Two sites survived every check the project has, and John
ruled both against the 400 dpi scan on 2026-08-13:

  page-018-L   the print reads `intcllexit`   for   intellexit
  page-025-R   the print reads `affcrtur`     for   affertur

At 6x the ink is unambiguous, and it says the same thing twice: an `e` sort
whose crossbar has broken away prints as a `c`. In `intcllexit` the second `e`
of the SAME word prints closed and barred, so the type distinguishes them on
the page. These are the compositor's errors, not the reader's, and they
surfaced only because kraken happened to disagree; where corpus and engines
agree on a broken sort, nothing sees it.

⚠ A FINDER, NEVER A FIXER, AND THE FINDING IS NOT "THE CORPUS IS WRONG".
This transcription is diplomatic: where the printer set an error the corpus
KEEPS the error and the site is banked in the corrigenda register
(`work/corrigenda/entries.json`; `settle_apply.corrigenda_for` shows the shape
of an entry, and `audit_review.store_ruling`'s `erratum` flag is what sends a
site there). So a row here is a question for the ink and nothing else — only
the scan can say whether `affcrtur` is Bonitz's printer or our reader, and the
two answers go to opposite places: a corrigendum, or an edit toward the ink.
`division_check` puts it the same way, because it is the same rule.

THE ARGUMENT, in the order the check makes it:

  attested   Diogenes' Latin analyses (349,741 inflected forms, the Latin twin
             of the Greek file `morpheus` reads from the same directory) hold
             `intellexit` and `affertur` and do not hold `intcllexit` or
             `affcrtur`. That is a statement about Latin, not about how often
             Bonitz used the word — so a rare token the lexicon knows is never
             a finding, however rare, and the whole check rests on forms
             rather than on frequency.
  neighbour  the printed token is one SUBSTITUTION from an attested form.
             Substitution only: a broken sort replaces a letter, it does not
             insert or delete one, and admitting insertions doubles the search
             for a class we have no evidence of.
  frequency  the corpus counts ride along in the row as corroboration, and
             stand alone only where Diogenes cannot judge (below).

⚠ TIER `ce` IS THE CONFIRMED CLASS; TIER `other` IS NOT, AND ON THIS CORPUS IT
IS NOISE. Both confirmed sites are a `c` for an `e`. Everything else is
reported under its own tier and measured separately, because measured
separately is the only way its precision can be seen — and over pages 15-62 it
is 0 for 110: Linnaean binomials (`spinax`, `sylvia`, `haliaetus`), Bonitz's
French and German sources (`aigle`, `renard`, `über`), his post-classical
grammatical Latin (`enunciatio` where Cicero writes `enuntiatio`), his
unlisted abbreviations (`praep`, `sing`, `impers`), and the abbreviated author
names the lexicon happens to hold a near-twin of (`Soph` beside `Sopi`, `Halm`
beside `Hala`). None of these is a broken sort; all of them are words Diogenes
has not got. The tier stays visible and untuned — an abbreviation list padded
until the output looked clean would be fitting the report to the corpus, and
the next page would break it.

⚠ THE LEXICON KNOWS 70% OF BONITZ'S LATIN VOCABULARY AND ITS SILENCE IS NOT A
VERDICT. Diogenes generates classical forms; Bonitz writes 1870 scholarly
Latin over Greek zoology, so a form it does not hold is very often simply a
word it was never built for. Treating unknown as guilty would convict the
whole zoological apparatus. So an unknown token whose neighbours are also
unknown is counted `unjudged` — its own skip class, reported with its number
— and only the corpus can speak for it: a neighbour occurring at least 5x more
often, and at least 5 times outright, carries the row on the corpus's own
authority instead. On pages 15-62 that fallback fires 0 times, which is worth
knowing and is why it is counted rather than assumed.

⚠ VOLUME AS WELL AS VERDICT — this project's standing defect, re-fixed four
times. An empty reconciled glob raises; a missing lexicon raises (morpheus's
rule: an authority that quietly switches itself off looks exactly like a
cautious one, and Diogenes is installed on every machine this runs on); a
missing siglum key raises. Every occurrence lands in exactly one bucket, so
Latin tokens = findings + skips by construction, and the summary states the
lexicon's coverage of Bonitz's vocabulary so the reader can see how far to
trust the rest of it.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import string
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The Latin twin of morpheus.ANALYSES, in the same Diogenes install the corpus
# pipeline already reads for stage-4 morphology. Same format: form TAB analyses.
ANALYSES = Path('/Applications/Diogenes.app/Contents/dependencies/data'
                '/latin-analyses.txt')

# Bonitz's own printed apparatus key, pp.11-12, transcribed 2026-08-09.
SIGLA = ROOT / 'work/sigla/apparatus-sigla.json'

# ⚠ `ȣ` (U+0223 LATIN SMALL LETTER OU) IS IN THE LATIN BLOCK AND IS NOT LATIN.
# It is Bonitz's Greek ou-ligature, 2,204 of them in the corpus, and a class
# written as `[A-Za-zÀ-ɏ]+` swallows every one — 2,191 phantom Latin tokens
# before anything else went wrong. The range stops at U+017F, short of it.
LATIN_RE = re.compile(r'[A-Za-zÀ-ÖØ-öø-ſ]+')

# A broken sort replaces one letter; below this length the token is a Bekker
# column letter (`a` and `b`, 7,624 of them), a one-letter editor siglum, or a
# citation fragment, and a one-substitution neighbour of a three-letter token
# is barely a claim about anything.
MIN_LEN = 4

# ⚠ MEASURED, NOT PICKED. Of the tokens Diogenes does not hold but whose
# neighbour it does, 82 occur once and 15 twice; above that the list turns
# into Bonitz's settled usage — `resp` 17, `Poet` 11, `part` 7, `strix` 5,
# `squalus` 5, `enunciatione` 3. A broken sort is one impression of one
# letter; a spelling he sets three times is his spelling, and correcting it
# would be correcting Bonitz rather than his printer.
RARE_MAX = 2

# The corpus-only fallback, for tokens Diogenes cannot judge either way.
SKEW = 5              # the neighbour must be this many times commoner
MIN_NEIGHBOUR = 5     # and this common outright — 2-against-1 is not evidence

# Bonitz's editorial Latin: `ngram_check.LATIN` is the same inventory as a
# regex, and Bonitz's own key is transcribed at work/kraken/NOTES.md pp.11-12.
# ⚠ NOT EXTENDED TO FIT THE OUTPUT. `praep`, `sing`, `impers`, `adesp` and a
# dozen more are plainly abbreviations too, and each one added here would
# delete a row from tier `other` — which is exactly how a check gets tuned
# until it looks clean on the pages it was written against.
ABBREVIATIONS = frozenset('''
    opp cf sim al syn sive def veluti item coll vid not i e passim ib ibid
    sqq etc est sunt dist fort codd vl ci pass
'''.split())

ROMAN_RE = re.compile(r'[IVXLCDM]+$')

TSV_HEADER = ('column\tline\ttoken\tcount\tneighbour\tneighbour_count\t'
              'substitution\ttier\tauthority\n')


class LatinCheckError(Exception):
    """The check could not run. Raised, never warned: an authority silently
    disabled reads exactly like an authority that found nothing wrong."""


def fold(word: str) -> str:
    """The lookup key: case dropped, and u/v and i/j folded together.

    ⚠ ONE LATIN WORD, TWO ORTHOGRAPHIES, IN BOTH SOURCES. Diogenes holds
    `avarus` AND `auarus`, `ianthina` and not `janthina`; Bonitz sets
    `adiectivo` where the lexicon has `adiectiuo`. Unfolded, those spellings
    convict each other — `adiectivo` reads as an unattested token one
    substitution from an attested one, which is the exact shape of a finding.
    Folding is not a loosening: v/u and j/i are the same letter set to two
    different sorts, and no compositor's slip lives inside that pair.
    """
    return word.lower().replace('v', 'u').replace('j', 'i')


@lru_cache(maxsize=1)
def lexicon() -> frozenset[str]:
    """Every inflected Latin form Diogenes generates, folded.

    ⚠ ITS ABSENCE IS A FAULT, NOT A CONFIGURATION — morpheus's rule, for the
    same file in the same install. An empty index would answer "nothing is
    attested", which turns every Latin word in the book into a finding; a
    missing one that returned an empty set would turn the check off and leave
    the counts looking merely quiet. Diogenes is installed here, so absence
    means a moved or broken install and says so.

    ⚠ THE ENCLITIC LINES ARE A DIFFERENT SHAPE. The file opens with entries
    keyed `-nam`, `-namque`, `-sed` — suffix rules, not forms — and reading
    them as forms puts a leading hyphen in the index where no token can match.
    They are dropped, as morpheus drops its `!` lines.
    """
    if not ANALYSES.exists():
        raise LatinCheckError(
            f'the Latin analyses are not at {ANALYSES}. They ship inside '
            f'Diogenes beside the Greek file morpheus reads, so this is a '
            f'moved or broken install, not a machine without them.')
    out: set[str] = set()
    with ANALYSES.open(encoding='utf-8', errors='replace') as fh:
        for line in fh:
            key = line.split('\t', 1)[0]
            if key and not key.startswith('-'):
                out.add(fold(key))
    if not out:
        raise LatinCheckError(
            f'{ANALYSES} yielded no forms — an empty lexicon attests nothing '
            f'and would convict every Latin word in the book')
    return frozenset(out)


@lru_cache(maxsize=1)
def sigla() -> frozenset[str]:
    """The editor and source sigla, from Bonitz's own printed key.

    ⚠ BY HIS INVENTORY, NEVER BY A SHAPE TEST. `Bz` is Bonitz, `Wz` is Waitz,
    `Trdllbg` is Trendelenburg with the double l the page actually carries —
    none of them is guessable from length or capitalisation, and a blanket
    exemption for anything short and capitalised is what let `Ζιθ28` through
    in `siglum_check`. Bonitz closes p.11 saying every name not on the list is
    written out in full, so the list is complete by design and its absence is
    a fault rather than a reason to skip nothing.
    """
    if not SIGLA.exists():
        raise LatinCheckError(
            f'Bonitz\'s apparatus key is not at {SIGLA} — without it every '
            f'editor siglum reads as an unattested Latin word')
    doc = json.loads(SIGLA.read_text(encoding='utf-8'))
    out: set[str] = set()
    for section in ('editors_p11', 'zoological_p12'):
        for key, val in doc.get(section, {}).items():
            out.update(key.split())          # `Da I` is Da and I
            if isinstance(val, dict):
                also = val.get('also')
                if isinstance(also, str):
                    out.add(also)
                elif isinstance(also, list):
                    out.update(also)
    if not out:
        raise LatinCheckError(f'{SIGLA} holds no sigla')
    return frozenset(out)


def hyphen_fragment(cur: str, prev: str, start: int, end: int) -> bool:
    """Is this token half of a word Bonitz broke at the line end?

    `enun-` / `ciatio` is one word set on two lines, and each half on its own
    is an unattested token one substitution from something. Counting them as
    words would put the column's every wrap in the report.
    `mark_review.shape()` draws the same two tests and `division_check`
    repeats them for the same reason: shape() reads the column off disk to
    answer a different question, and the lines are already in hand here.
    """
    stripped = cur.rstrip()
    if stripped.endswith('-') and end == len(stripped) - 1:
        return True                          # line-end fragment
    return prev.rstrip().endswith('-') and not cur[:start].strip()


def tokenise(text: str, source: str) -> tuple[list[tuple[str, int, str]],
                                              collections.Counter]:
    """One reconciled column's Latin tokens as (column, line, token).

    counts['tokens'] + counts['hyphen-fragment'] == every Latin run matched.
    """
    out: list[tuple[str, int, str]] = []
    counts: collections.Counter = collections.Counter()
    lines = text.splitlines()
    for n, cur in enumerate(lines, 1):
        prev = lines[n - 2] if n > 1 else ''
        for m in LATIN_RE.finditer(cur):
            if hyphen_fragment(cur, prev, m.start(), m.end()):
                counts['hyphen-fragment'] += 1
                continue
            counts['tokens'] += 1
            out.append((source, n, m.group()))
    return out, counts


def neighbours(token: str, forms: frozenset[str]) -> list[tuple[str, str, str]]:
    """Attested forms one SUBSTITUTION away, as (from, to, form).

    Case is preserved through the substitution — a lowercase letter is
    replaced by lowercase ones — so `Homerus` can only yield `Homerus`-shaped
    neighbours and the index never fills with `lusE`. Neighbours that fold to
    the same key as the token, or as each other, are one neighbour: `icarus`
    and `jcarus` are one spelling of one word, and reporting both would state
    the alternative twice.
    """
    seen = {fold(token)}
    out: list[tuple[str, str, str]] = []
    for i, ch in enumerate(token):
        alphabet = (string.ascii_uppercase if ch.isupper()
                    else string.ascii_lowercase)
        for repl in alphabet:
            if repl == ch:
                continue
            cand = token[:i] + repl + token[i + 1:]
            if fold(cand) in forms and fold(cand) not in seen:
                seen.add(fold(cand))
                out.append((ch, repl, cand))
    return out


def is_ce(before: str, after: str) -> bool:
    """The confirmed class: an `e` sort with a broken crossbar prints `c`."""
    return sorted((before.lower(), after.lower())) == ['c', 'e']


def _pick(cands: list[tuple[str, str, str]],
          counts: collections.Counter) -> tuple[str, str, str]:
    """The neighbour to put in the row when several are attested.

    A `c`/`e` swap first — it is the class we have ink for — then the form
    Bonitz himself uses most, then alphabetical so the row is stable across
    runs. The alternatives are not thrown away: the row says how many there
    were, because a token with eight attested neighbours is a much weaker
    claim than one with a single neighbour, and both confirmed sites have one.
    """
    return min(cands, key=lambda c: (not is_ce(c[0], c[1]),
                                     -counts.get(c[2], 0), c[2]))


def judge(occurrences: list[tuple[str, int, str]],
          counts: collections.Counter,
          forms: frozenset[str],
          known_sigla: frozenset[str]) -> list[dict]:
    """Every occurrence into exactly one bucket: a finding, or a named skip.

    Rareness is a fact about the whole corpus, so the frequencies are counted
    over every column before any occurrence is judged. The order of the tests
    is the order of the claims: what cannot be a word at all, then what Bonitz
    tells us is not a word (his abbreviations, his sigla), then what is too
    common to be a slip, then what Latin attests — and the neighbour search
    runs BEFORE the proper-name skip so that a broken sort inside a name
    (`Homcrus` for `Homerus`) is still caught by the lexicon.
    """
    freq = collections.Counter(tok for _, _, tok in occurrences)
    rows: list[dict] = []
    for col, line, tok in occurrences:
        if len(tok) < MIN_LEN:
            counts['short'] += 1
            continue
        if tok in ABBREVIATIONS:
            counts['abbreviation'] += 1
            continue
        if tok in known_sigla:
            counts['siglum'] += 1
            continue
        if ROMAN_RE.match(tok):
            counts['numeral'] += 1
            continue
        n = freq[tok]
        if n > RARE_MAX:
            counts['frequent'] += 1
            continue
        if fold(tok) in forms:
            counts['attested'] += 1
            continue
        cands = neighbours(tok, forms)
        if cands:
            before, after, word = _pick(cands, freq)
            tier = 'ce' if is_ce(before, after) else 'other'
            counts[tier] += 1
            rows.append({
                'column': col, 'line': line, 'token': tok, 'count': n,
                'neighbour': word, 'neighbour_count': freq.get(word, 0),
                'substitution': f'{before}->{after}', 'tier': tier,
                'authority': (
                    f'Diogenes attests {word} and not {tok}'
                    + ('' if len(cands) == 1
                       else f' (1 of {len(cands)} attested neighbours)')),
            })
            continue
        if tok[:1].isupper():
            # A capitalised token Diogenes does not hold and cannot be talked
            # out of: Bernays, Göttling, Democr. The lexicon has already had
            # its say above, so this is the residue, not a blanket exemption.
            counts['proper-name'] += 1
            continue
        best = None
        for i, ch in enumerate(tok):
            for repl in string.ascii_lowercase:
                if repl == ch:
                    continue
                cand = tok[:i] + repl + tok[i + 1:]
                c = freq.get(cand, 0)
                if c >= max(MIN_NEIGHBOUR, SKEW * n) and (
                        best is None or c > best[3]):
                    best = (ch, repl, cand, c)
        if best is None:
            # ⚠ NOT GUILTY. Diogenes holds neither this token nor any
            # neighbour of it, and 30% of Bonitz's Latin is outside what it
            # generates. Silence here is the lexicon's limit, not a verdict.
            counts['unjudged'] += 1
            continue
        before, after, word, wc = best
        tier = 'ce' if is_ce(before, after) else 'other'
        counts[tier] += 1
        rows.append({
            'column': col, 'line': line, 'token': tok, 'count': n,
            'neighbour': word, 'neighbour_count': wc,
            'substitution': f'{before}->{after}', 'tier': tier,
            'authority': f'Diogenes knows neither; Bonitz sets {word} '
                         f'{wc} times against {tok} {n}',
        })
    return rows


def run(files: list[Path]) -> tuple[list[dict], collections.Counter]:
    """Every reconciled column, tokenised first and judged once."""
    occurrences: list[tuple[str, int, str]] = []
    counts: collections.Counter = collections.Counter()
    for f in files:
        occ, c = tokenise(f.read_text(encoding='utf-8'), f.stem)
        occurrences += occ
        counts += c
        counts['columns'] += 1
    forms = lexicon()
    rows = judge(occurrences, counts, forms, sigla())
    vocab = set(tok for _, _, tok in occurrences)
    counts['vocabulary'] = len(vocab)
    counts['vocabulary-attested'] = sum(1 for t in vocab if fold(t) in forms)
    counts['forms'] = len(forms)
    return rows, counts


def write_tsv(rows: list[dict], out: Path) -> None:
    """Written even when empty: a header-only file says 'ran, found none',
    where a missing file cannot be told from a run that never looked."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', encoding='utf-8') as fh:
        fh.write(TSV_HEADER)
        for r in rows:
            fh.write(f"{r['column']}\t{r['line']}\t{r['token']}\t{r['count']}\t"
                     f"{r['neighbour']}\t{r['neighbour_count']}\t"
                     f"{r['substitution']}\t{r['tier']}\t{r['authority']}\n")


def summary(counts: collections.Counter) -> str:
    """The volume report. Latin tokens = findings + skips by construction,
    and the lexicon's coverage of Bonitz's vocabulary is stated outright —
    that number says how far the whole check can be trusted."""
    vocab = counts['vocabulary'] or 1
    skips = ('short', 'abbreviation', 'siglum', 'numeral', 'frequent',
             'attested', 'proper-name', 'unjudged')
    why = {
        'short': f'(under {MIN_LEN} letters — Bekker column letters, '
                 f'one-letter sigla)',
        'abbreviation': "(Bonitz's editorial Latin — opp, cf, dist)",
        'siglum': "(Bonitz's printed apparatus key, pp.11-12)",
        'numeral': '(Roman numeral)',
        'frequent': f'(set more than {RARE_MAX} times — his usage, not a slip)',
        'attested': '(Diogenes holds the form: rare, but Latin)',
        'proper-name': '(capitalised, unknown to Diogenes, no attested '
                       'neighbour)',
        'unjudged': '(Diogenes knows neither it nor any neighbour — its '
                    'limit, not a verdict)',
    }
    lines = [
        f"{counts['columns']} columns read, {counts['tokens']} Latin tokens "
        f"examined, {counts['vocabulary']} distinct Latin words",
        f"  {counts['hyphen-fragment']} line-end fragments were not counted "
        f"as words",
        f"  Diogenes attests {counts['vocabulary-attested']} of "
        f"{counts['vocabulary']} "
        f"({100 * counts['vocabulary-attested'] / vocab:.1f}%) — the rest is "
        f"1870 scholarly Latin, Linnaean zoology, French and German",
        f"  {counts['ce'] + counts['other']} rare tokens carried a "
        f"one-substitution neighbour Latin attests",
        f"  tier ce:     {counts['ce']:4d} findings  "
        f"(a `c` for an `e` — the class John confirmed against the ink)",
        f"  tier other:  {counts['other']:4d} findings  "
        f"(any other substitution — measured apart, and unproven)",
    ]
    for k in skips:
        lines.append(f"    skipped {k + ':':14} {counts[k]:5d}  {why[k]}")
    lines.append(
        f"⚠ every finding is a question for the 400 dpi ink. Where the ink "
        f"prints the\n  broken sort the corpus KEEPS it and the site is "
        f"banked in work/corrigenda;\n  only the scan tells a compositor's "
        f"error from a reader's.")
    return '\n'.join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--reconciled', type=Path, default=ROOT / 'work/reconciled',
                    help='directory of reconciled column .txt files')
    ap.add_argument('--out', type=Path,
                    default=ROOT / 'work/sweeps/latin-check.tsv')
    args = ap.parse_args(argv)

    files = sorted(args.reconciled.glob('*.txt'))
    if not files:
        # ⚠ An empty scan reported as clean is the defect this pipeline has
        # fixed four times. No columns means we never looked: raise.
        raise LatinCheckError(
            f'no reconciled columns match {args.reconciled}/*.txt '
            f'— refusing to report an empty scan')
    rows, counts = run(files)
    write_tsv(rows, args.out)
    for r in sorted(rows, key=lambda r: (r['tier'] != 'ce', r['column'])):
        print(f"  {r['tier']:5} {r['column']}:{r['line']:<4} "
              f"{r['token']:16} x{r['count']} -> {r['neighbour']:16} "
              f"x{r['neighbour_count']:<4} {r['substitution']:8} "
              f"{r['authority']}")
    print(summary(counts))
    print(f'-> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
