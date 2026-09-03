"""
The corpus disagreeing with itself about which codepoint a letter is.

    python3 -m bonitz_pipeline.encoding_check
    python3 -m bonitz_pipeline.encoding_check --out work/sweeps/mine.tsv

The same token spelled two different ways in one corpus is a defect whatever
the right spelling is. That claim needs no lexicon, no Bekker range and no
ink — only the corpus contradicting itself — and it is strictly better
evidence than the page-range discriminator in `siglum_homoglyph` for exactly
the tokens that discriminator has to refuse.

THE SPECIMEN. Bonitz's Aubert-Wimmer references, measured over
`work/reconciled`: `AZι` 23 times with a LATIN Z against `AΖι` 3 times with a
GREEK Ζ; `AZγ` 3 Latin against `AΖγ` 2 Greek; and the volume numeral welded
to one of them, `AZιI` twice Latin against `AZιΙ` once Greek. 26 against 5.
Bonitz's printed key settles which is right — p.11, *"litterae A ubi opus
erat additum est siglum eius libri Aristotelici"*, so `A` alone is the editor
(Aubert & Wimmer) and what follows is the ARISTOTELIAN WORK siglum, making it
Latin A plus Greek Ζι — but this check neither needs the key nor consults it.
The disagreement is the finding.

⚠ WHY `siglum_homoglyph` CANNOT SEE THIS, AND IS RIGHT NOT TO. That module
reports a Latin capital only where the folded token RESOLVES as one of
Bonitz's sigla and the Bekker page beside it confirms the work. `ΑΖι` folded
resolves to nothing in his key — `A` is an editor, not a work — so all 34 of
these tokens are counted `no-siglum` and let go in silence. That is the
two-test rule working exactly as designed; it is what let 63 conversions be
applied unattended without mangling Aubert-Wimmer into the Analytics. This
module is the other half: it asks nothing about what a token means, only
whether the corpus spells it one way.

⚠ AN ENCODING CLAIM, NOT A CLAIM ABOUT THE INK. The printer set ONE glyph;
the transcription chose a codepoint for it, and chose differently in
different places. Nothing here says Bonitz set the wrong letter — the page
cannot tell `Z` from `Ζ`, which is the whole trouble — only that our file
cannot have it both ways. So a finding is never adjudicated against the scan;
it is adjudicated against the rest of the corpus and, where the reader wants
more, against Bonitz's printed key.

⚠ A FINDER, NEVER A FIXER. This module counts spellings and writes a TSV. It
does not touch `work/reconciled`, and it does not assert which spelling is
correct where the corpus alone cannot say — the specimen is the reason for
that restraint: the RIGHT spelling of `AΖι` is the one with 3 sites, not the
one with 23. Majority is not evidence, it is only skew, and skew is printed
so the reader can see it. The diplomatic rule holds.

⚠ THE MAP MUST HOLD ONLY GLYPHS THAT ARE GENUINELY THE SAME INK, or a real
difference reads as an encoding split. The fourteen capitals come from
`siglum_check.HOMOGLYPH` unchanged. Exactly ONE lowercase pair is added —
`o`/`ο`, a circle being a circle in any type — and it earns its place: it
finds `oβ1351 b19` at page-030-L:31, a Latin o in the Oeconomica siglum,
against 42 sites of Greek `οβ`. Every other lowercase candidate was measured
against the corpus and REFUSED, because each is a distinct letter in this
face and each would file Bonitz's own Latin abbreviations as errors: `a`/`α`
(3819 Latin `a` against 48 Greek α — the preposition), `i`/`ι` (95 against
60), `p`/`ρ` (49 against 78 — `p 100 n 13`, pagina), `v`/`ν` (44 against 7),
`n`/`η` (44 against 41). `u`/`υ`, `x`/`χ`, `y`/`γ`, `w`/`ω`, `c`/`ϲ`, `l`/`I`
add nothing at all. See test_encoding_check.py, which pins the refusals.

⚠ WITHIN-GREEK CONFUSIONS ARE NOT THIS CHECK'S BUSINESS. `ϛ` against `ς` in a
book letter is one script arguing with itself about which letter was set —
a claim about the ink, and `siglum_check`'s. The map crosses scripts only.

⚠ TWO TIERS, BECAUSE A SINGLE CHARACTER PROVES LESS. `AZι`/`AΖι` is a
multi-character token that can only be one word: tier `split`, strong. `I`
against `Ι`, or `A` against `Α`, is tier `weak` — both spellings can be
right in different places, a Roman volume numeral standing beside a Greek
capital, and the corpus alone cannot separate them. They are never mixed into
the strong count. Six weak groups are in the corpus, and of none of them can
this check say that anything is wrong — only that a reader may want to look.

⚠ A TOKEN SEEN ONCE CANNOT DISAGREE WITH ITSELF. A group needs two distinct
spellings, so it needs at least two occurrences; singleton shape keys never
become findings by construction, and no filter is needed to exclude them.

⚠ VOLUME AS WELL AS VERDICT — this pipeline's oldest defect, re-fixed four
times. An empty `work/reconciled` glob RAISES rather than printing a clean
zero. The summary states columns read, tokens examined, distinct shape keys,
groups per tier, and what was passed over and why, so
`shapes = consistent + split + weak` can be read off the report.
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from .lexcheck import ROOT, WORD_RE, nfc
from .siglum_check import SIGLA, HOMOGLYPH, Work, inventory, split


class EncodingCheckError(Exception):
    """The check could not run. Raised, never warned: a scan that read
    nothing prints exactly like a corpus with nothing wrong."""


# The one lowercase pair admitted to the map. See the ⚠ paragraph above for
# the twelve candidates measured and refused; this is the only one where the
# two codepoints are the same drawing.
LOWER_HOMOGLYPH = {'o': 'ο'}

# Latin → Greek, applied character by character. The mapping is 1:1, which is
# what makes a shape key the same LENGTH as every spelling under it — and so
# makes "the position where the spellings differ" a well-formed question.
FOLD = {**HOMOGLYPH, **LOWER_HOMOGLYPH}

# A maximal run of Greek letters, combining marks included so an accented
# word stays one run. Only used for the siglum note: a run carrying accents
# resolves to nothing, which is the right answer, sigla being unaccented.
GREEK_RUN = re.compile(r'[̀-ͯͰ-Ͽἀ-῿]+')

TIERS = ('split', 'weak')

TSV_HEADER = 'shape\ttier\tspelling\tcount\tcodepoints\tsites\tsigla\n'


@dataclass(frozen=True)
class Spelling:
    text: str                  # as the transcription set it
    sites: tuple[str, ...]     # every occurrence, `column:line`
    sigla: str                 # '' unless a Greek run is one of Bonitz's

    @property
    def count(self) -> int:
        return len(self.sites)


@dataclass(frozen=True)
class Group:
    shape: str
    tier: str
    spellings: tuple[Spelling, ...]   # count-descending
    majority: str                     # '' where the top count is TIED

    def minority(self) -> tuple[Spelling, ...]:
        """The spellings whose sites are worth listing — the likely errors.

        Where no spelling has a strictly greater count than the rest there is
        no odd one out, so ALL of them are listed. Saying "the minority is
        empty" would hide a 1-against-1 group's only two sites.
        """
        return tuple(s for s in self.spellings if s.text != self.majority)


def fold(token: str) -> str:
    """The token with its Latin homoglyphs replaced by their Greek twins.

    The result is not necessarily all-Greek: `Bk` folds to `Βk`, because `k`
    and `κ` are different ink and stay out of the map. A shape key is a
    canonical form, not a claim that the token is Greek.
    """
    return ''.join(FOLD.get(ch, ch) for ch in token)


def codepoints(token: str) -> str:
    """'AΖι' -> 'LATIN CAPITAL LETTER A + GREEK CAPITAL LETTER ZETA + …'.

    The whole point of the report: two spellings that print identically are
    told apart only by their names.
    """
    return ' + '.join(unicodedata.name(ch, f'U+{ord(ch):04X}') for ch in token)


def sigla_note(token: str, works: dict[str, Work]) -> str:
    """Which of this spelling's Greek runs is one of Bonitz's sigla, if any.

    Evidence the reader will want and the check will not act on. In `AΖι` the
    Greek run is `Ζι`, περὶ τὰ Ζῷα ἱστορίαι; in `AZι` it is a bare `ι`, which
    is nothing. That points at the 3 sites and away from the 23 —
    the opposite of what the counts suggest, which is exactly why this module
    reports skew and refuses to rule on it.
    """
    out = []
    for run in GREEK_RUN.findall(token):
        options = split(run, works)
        if options:
            work = options[0][0]
            out.append(f'{run} = {works[work].title}')
    return '; '.join(out)


def gather(files: list[Path]) -> tuple[dict[str, dict[str, list[str]]],
                                       collections.Counter]:
    """shape key -> spelling -> sites, over every reconciled column.

    Each column is normalised to NFC first, so a precomposed accent and a
    combining one are ONE spelling. That difference is a normalisation
    question and `normalize.py` owns it; folding it in here would file the
    whole corpus as an encoding split.

    A token is a run of letters and combining marks (`lexcheck.WORD_RE`):
    digits, punctuation and whitespace are not tokens and do not join them,
    so `oβ1351 b19` contributes `oβ` and `b`.
    """
    groups: dict[str, dict[str, list[str]]] = collections.defaultdict(
        lambda: collections.defaultdict(list))
    counts: collections.Counter = collections.Counter()
    for path in sorted(files):
        counts['columns'] += 1
        for line_no, line in enumerate(
                nfc(path.read_text(encoding='utf-8')).splitlines(), 1):
            for m in WORD_RE.finditer(line):
                token = m.group()
                counts['tokens'] += 1
                if any(ch in FOLD for ch in token):
                    counts['foldable'] += 1
                else:
                    # No character the map can move, so this token cannot
                    # share a shape key with any spelling but itself.
                    counts['unfoldable'] += 1
                groups[fold(token)][token].append(f'{path.stem}:{line_no}')
    return groups, counts


def findings(groups: dict[str, dict[str, list[str]]],
             works: dict[str, Work],
             counts: collections.Counter) -> list[Group]:
    """Every shape key holding two or more distinct spellings, tiered.

    Tier is decided by the SHAPE's length, which is every spelling's length,
    the fold being 1:1. A one-character group is `weak` however lopsided its
    counts: `I` × 40 against `Ι` × 3 is a Roman numeral and a Greek capital
    living side by side, not a defect.
    """
    out: list[Group] = []
    counts['shapes'] += len(groups)
    for shape, spellings in groups.items():
        if len(spellings) < 2:
            counts['consistent'] += 1
            continue
        tier = 'split' if len(shape) > 1 else 'weak'
        counts[tier] += 1
        ranked = sorted(spellings.items(), key=lambda kv: (-len(kv[1]), kv[0]))
        top = len(ranked[0][1])
        tied = sum(1 for _, sites in ranked if len(sites) == top) > 1
        if tied:
            counts['tied'] += 1
        out.append(Group(
            shape=shape, tier=tier,
            spellings=tuple(Spelling(text, tuple(sites),
                                     sigla_note(text, works))
                            for text, sites in ranked),
            majority='' if tied else ranked[0][0]))
    # split before weak, then the biggest disagreement first.
    out.sort(key=lambda g: (TIERS.index(g.tier),
                            -sum(s.count for s in g.spellings), g.shape))
    counts['minority-sites'] += sum(s.count for g in out for s in g.minority())
    return out


def write_tsv(found: list[Group], out: Path) -> None:
    """One row per SPELLING, sites filled in for the minority ones only.

    Written even when empty: a header-only file says "ran, found none", where
    a missing file cannot be told from a run that never looked.
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', encoding='utf-8') as fh:
        fh.write(TSV_HEADER)
        for g in found:
            minority = {s.text for s in g.minority()}
            for s in g.spellings:
                sites = ' '.join(s.sites) if s.text in minority else ''
                fh.write(f'{g.shape}\t{g.tier}\t{s.text}\t{s.count}\t'
                         f'{codepoints(s.text)}\t{sites}\t{s.sigla}\n')


def show(g: Group, limit: int) -> str:
    """One group for the console: the shape, then each spelling with its
    count and — at the positions where the group actually disagrees — the
    codepoint it chose there. Naming only the varying positions keeps a long
    Greek word's row as short as `AZι`'s, and they are the only positions any
    of this is about."""
    varies = [i for i in range(len(g.shape))
              if len({s.text[i] for s in g.spellings}) > 1]
    lines = [f'  {g.shape}  [{g.tier}]']
    for s in g.spellings:
        at = '  '.join(f'[{i}] {unicodedata.name(s.text[i], "?")}'
                       for i in varies)
        mark = ' ' if s.text == g.majority else '←'
        lines.append(f'   {mark} {s.text!r:12} ×{s.count:<4} {at}'
                     + (f'   {s.sigla}' if s.sigla else ''))
        if s.text != g.majority:
            shown = s.sites[:limit]
            more = ('' if len(s.sites) <= limit
                    else f' … +{len(s.sites) - limit} more in the TSV')
            lines.append('       ' + ' '.join(shown) + more)
    return '\n'.join(lines)


def _row(label: str, value: int, note: str = '') -> str:
    return f'  {label:<50}{value:6d}{note}\n'


def summary(counts: collections.Counter) -> str:
    """The volume report. `shapes = consistent + split + weak` by
    construction, and the token line says how much of the corpus the map
    could touch at all — a shape key with no foldable character is one the
    check could never have filed, and saying so is the difference between
    found nothing and never looked."""
    return (
        f"{counts['columns']} columns read, {counts['tokens']} tokens "
        f"examined, {counts['shapes']} distinct shape keys\n"
        + _row('shape keys with ONE spelling (consistent):',
               counts['consistent'])
        + _row('shape keys with TWO OR MORE (findings):',
               counts['split'] + counts['weak'])
        + _row('  tier split (multi-character token):', counts['split'],
               '  ← reported')
        + _row('  tier weak  (single-character token):', counts['weak'],
               '  ← reported apart, never counted strong')
        + _row('  of those, no strict majority (every site listed):',
               counts['tied'])
        + _row('sites of minority spellings listed:',
               counts['minority-sites'])
        + _row('tokens holding a character the map can move:',
               counts['foldable'])
        + _row('tokens holding none (cannot split, by construction):',
               counts['unfoldable'])
        + '  passed over: digits, punctuation and whitespace are not tokens; '
          'every column\n    read as NFC, so a precomposed accent and a '
          'combining one are one spelling')


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--reconciled', type=Path, default=ROOT / 'work/reconciled',
                   help='directory of reconciled column .txt files')
    p.add_argument('--sigla', type=Path, default=SIGLA,
                   help="Bonitz's printed key (work-sigla.json)")
    p.add_argument('--out', type=Path,
                   default=ROOT / 'work/sweeps/encoding-check.tsv')
    p.add_argument('--sites', type=int, default=12,
                   help='minority sites printed per spelling (all go to TSV)')
    p.add_argument('--tier', choices=TIERS, default=None,
                   help='print one tier only; both are always written')
    args = p.parse_args(argv)

    files = sorted(args.reconciled.glob('*.txt'))
    if not files:
        # ⚠ Never looked must never read as clean. No columns, no report.
        raise EncodingCheckError(
            f'no reconciled columns match {args.reconciled}/*.txt '
            '— refusing to report an empty scan')

    works = inventory(args.sigla)
    groups, counts = gather(files)
    found = findings(groups, works, counts)
    write_tsv(found, args.out)

    for g in found:
        if args.tier in (None, g.tier):
            print(show(g, args.sites))
    print(summary(counts))
    print(f'-> {args.out}')
    print('⚠ an ENCODING claim, not a claim about the ink: the printer set '
          'one glyph and\n  the transcription chose two codepoints for it. '
          'Which spelling is right is\n  NOT decided here — in the AΖι '
          'specimen the correct one has 3 sites and\n  the wrong one 23. '
          'This module proposes; it never edits the corpus.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
