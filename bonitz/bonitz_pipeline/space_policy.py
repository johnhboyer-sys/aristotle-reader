"""The word-space Bonitz would have set without a printer's page budget.

    python3 -m bonitz_pipeline.space_policy --dir work/reconciled          # dry run
    python3 -m bonitz_pipeline.space_policy --dir work/reconciled --apply

⚠ THIS IS A NORMALISATION, NOT A CORRIGENDUM, AND NOT A DIPLOMATIC READING.
Everywhere else in this project the rule is that the printer's setting is
preserved and his errors are banked in `work/corrigenda/entries.json`. This
module deliberately does something different, on John's ruling of 2026-08-26:

    "let's just assume a uniform approach on the part of Bonitz and what he
    would have done had he had a digital presentation that wasn't bounded by
    space considerations faced by printers"

and, on being shown a crop where the ink looks closed up:

    "it may look like no space but I'm saying there should be a space and if
    it looks like none, that's just kerning because of the constraints of
    trying to fit the whole index into less than 900 pages"

So a site is NOT ruled `preserve` because its crop looks tight. Tight is the
appearance this policy already accounts for.

⚠ AND THE CORPUS COULD NOT AGREE WITH ITSELF ANYWAY. Over pages 15-106 the
settled text writes the Bekker column letter spaced 5353 times and glued 8300,
and the split is OUR transcription rather than Bonitz's:

    15-59     erratic, flipping every 1-4 pages   hand transcription in batches
    61-102    one solid glued block of 42 pages   the Opus waves over 63-102
    103-106   spaced again                        the later pipeline

Page 60 is 96% spaced and page 61 is 8%. Two hypotheses were tested and both
fail. LINE DENSITY: the glued pages average 49.7 characters per printed line
and the spaced ones 52.2 — the spaced pages are the DENSER, which is backwards.
DIFFERENT TYPESETTERS: printing gatherings are 8 or 16 pages and nothing here
runs in blocks of that size. The boundary is where our process changed.

WHAT IS TOUCHED, AND WHAT IS NOT. Two closed classes, each named:

    bekker_after_word     cfa16   -> cf a16      after an abbreviation
    sq_after_number       139sqq  -> 139 sqq     sq / sqq

⚠ AND NOT `1573a25`. The Bekker page and its column are ONE TOKEN under John's
policy for the revised edition — see BEKKER_SPACED below. This module spaced
8300 of them once, on my reading of "uniform approach" rather than his, and
broke 122 tests that pin the adjudicated corpus. The ruling reaches the
abbreviation slot, not the citation itself.

Nothing else. General spacing is NOT decidable — `space_slot` documents the
measurement — and this module must never grow a rule that guesses at one.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ⚠ EVERY PATTERN SPLITS ONE PAIR AND INSERTS ONE SPACE. None of them may
# delete, reorder or normalise anything else; a normaliser that does more than
# it says is how a corpus quietly stops being the thing that was adjudicated.
POLICY: dict[str, tuple[re.Pattern, str]] = {
    # `cfa16` -> `cf a16`. The column letter follows an ABBREVIATION here, and
    # a word-space separates them. 82 spaced against 1 glued in the corpus.
    'bekker_after_word': (
        re.compile(r'(?<![\wͰ-Ͽἀ-῿])'
                   r'([A-Za-zͰ-Ͽἀ-῿]{2,})([ab]\d)'),
        r'\1 \2'),
    'sq_after_number': (re.compile(r'(\d)(sqq?)(?![\w])'), r'\1 \2'),
}

# ⚠ THE BEKKER PAGE AND ITS COLUMN ARE ONE TOKEN — `1573a25`, CLOSED UP.
# John, 2026-08-26, after this module had already spaced 8300 of them:
#
#     "no space between bekker page and bekker column/line number though.
#      that's MY policy ... for our revised edition"
#
# So the uniform-approach ruling reaches the abbreviation slot and the `sq`
# slot and STOPS THERE. `1573 a25` is the deviation, not `1573a25`, and the
# settled corpus holds 5353 of those against 8300 correct — the same
# transcription drift documented above, pointing the other way.
#
# ⚠ CLOSING THEM UP IS A SEPARATE, UNORDERED CHANGE. Spacing 8300 broke 122
# tests that pin the adjudicated corpus; the reverse edit is the same size and
# wants the same care. `--close-bekker` does it, and only when asked.
#
# ⚠ AND IT IS NOT A NEW POLICY. `kraken_corpus.BEKKER_SPACE` has closed these
# up since John's ruling of 2026-08-06 — at the TRAINING layer, and its comment
# says why it stops there: "Applied here rather than to work/reconciled/, which
# stays the diplomatic record." All 173 training columns hold 11,445 citations
# and NOT ONE is spaced, so both OCR engines read the closed form. Only the
# diplomatic corpus still splits. `close_bekker` is that same ruling reaching
# one more output layer; what is undecided is the layer, never the form.
#
# ⚠ `[ \t]`, NEVER `\s`. `\s` matches a NEWLINE, and 821 of these citations
# are split across a printed line — `717` ending one line and `a16` beginning
# the next. Closing those up would silently join two lines of the diplomatic
# transcription, and counting them as "spaced" inflated the class from 4532
# to 5353 in the first measurement of it.
#
# ⚠⚠ AND IT CANNOT TELL A PAGE FROM A CONTINUATION. THIS PATTERN IS NOT SAFE
# TO RUN, and the reason was found on 107-117, where exactly two citations are
# spaced and BOTH are the shape it would corrupt:
#
#     468a25 b2.        `468a25` and `468b2` — TWO citations
#     686a18, 24 b21.   `686a18`, `686a24`, `686b21`
#
# Here `25` and `24` are LINE numbers and the `b` opens the other column of the
# SAME page. Closing them gives `468a25b2`, a citation of nothing. The regex
# sees `digit space column digit` in both cases and a Bekker page can be two
# digits (`Κ12. 14 b6.` is Categories 14b6), so length does not separate them
# either. A rough classifier over `work/reconciled` puts the true continuations
# in the single digits against 4319 real pages — small, and not zero, and the
# corpus is diplomatic.
#
# ⚠ SO `--close-bekker` STAYS UNRUN until the continuation class is separated,
# and 107-117 needed it for NOTHING: 1472 of its 1474 citations are already
# closed, because both OCR engines were trained on ground truth that closes
# them (see `kraken_corpus.BEKKER_SPACE`, John's ruling of 2026-08-06).
BEKKER_SPACED = re.compile(r'(\d)[ \t]+([ab]\d)')

POLICY_RECORD = ROOT / 'work' / 'corrigenda' / 'space-policy.json'

# ⚠ WHAT THE BANKED RECORD SAYS. It must name the EXCLUSION too: a
# record reading 'uniform word-space' alone would license the 8300-site
# edit that this module already made once and had to revert.
RULING = (
    "john 2026-08-26: a uniform word-space where the printer's page bud"
    "get closed one up — the abbreviation slot (`cf a16`) and `sq`/`sqq`. NOT t"
    "he Bekker citation: `1573a25` is ONE TOKEN, his policy for the revised edition.")


def normalise(text: str) -> tuple[str, dict[str, int]]:
    """Apply every rule once. Returns (text, {rule: n_changed})."""
    counts: dict[str, int] = {}
    for rule, (pat, repl) in POLICY.items():
        text, n = pat.subn(repl, text)
        counts[rule] = n
    return text, counts


def _bare(text: str) -> str:
    """Everything but the whitespace — what this edit must never alter."""
    return ''.join(text.split())


def close_bekker(directory: Path, apply: bool = False,
                 pages: range | None = None) -> dict:
    """`1573 a25` -> `1573a25`. The page and its column are one token.

    ⚠ NOT PART OF `normalise`, AND NOT RUN BY DEFAULT. This is the reverse of
    the edit that broke 122 tests, at the same scale — 5353 sites over pages
    15-106 — and it must be asked for.
    """
    files = sorted(directory.glob('page-*.txt'))
    if not files:
        sys.exit(f'no column text in {directory}')
    n, touched, samples = 0, [], []
    for f in files:
        m = re.match(r'page-(\d+)-([LR])\.txt$', f.name)
        if not m or (pages is not None and int(m.group(1)) not in pages):
            continue
        before = unicodedata.normalize('NFC', f.read_text(encoding='utf-8'))
        after, k = BEKKER_SPACED.subn(r'\1\2', before)
        if not k:
            continue
        # ⚠ THE INVARIANT, CHECKED PER COLUMN BEFORE ANYTHING IS WRITTEN. This
        # edit may ONLY delete spaces inside a line. If one non-space character
        # moved, or a printed line was lost or joined, the transcription has
        # stopped being the thing that was adjudicated and the run must stop —
        # not warn, not skip the file, STOP. 4532 sites is the same scale as
        # the edit that had to be reverted an hour ago.
        if _bare(before) != _bare(after):
            sys.exit(f'REFUSED at {f.name}: a non-space character changed')
        if before.count('\n') != after.count('\n'):
            sys.exit(f'REFUSED at {f.name}: the printed line count moved')
        n += k
        touched.append(f.name)
        if len(samples) < 3:
            samples.append((f.name, [l for l in difflib.unified_diff(
                before.splitlines(), after.splitlines(), lineterm='', n=0)
                if l.startswith(('-', '+'))
                and not l.startswith(('---', '+++'))][:4]))
        if apply:
            f.write_text(after, encoding='utf-8')
    return {'n': n, 'files': len(touched), 'samples': samples,
            'applied': apply}


def run(directory: Path, apply: bool = False, pages: range | None = None
        ) -> dict:
    files = sorted(directory.glob('page-*.txt'))
    if not files:
        # ⚠ An empty glob is a broken path, never a clean corpus.
        sys.exit(f'no column text in {directory}')
    total: dict[str, int] = {k: 0 for k in POLICY}
    touched, samples = [], []
    for f in files:
        m = re.match(r'page-(\d+)-([LR])\.txt$', f.name)
        if not m:
            continue
        if pages is not None and int(m.group(1)) not in pages:
            continue
        before = unicodedata.normalize('NFC', f.read_text(encoding='utf-8'))
        after, counts = normalise(before)
        if after == before:
            continue
        touched.append(f.name)
        for k, v in counts.items():
            total[k] += v
        if len(samples) < 4:
            diff = [l for l in difflib.unified_diff(
                before.splitlines(), after.splitlines(),
                lineterm='', n=0) if l.startswith(('-', '+'))
                and not l.startswith(('---', '+++'))]
            samples.append((f.name, diff[:4]))
        if apply:
            f.write_text(after, encoding='utf-8')
    return {'files': len(touched), 'by_rule': total,
            'n': sum(total.values()), 'samples': samples,
            'applied': apply}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--dir', type=Path, required=True)
    p.add_argument('--pages', help='restrict to a range, e.g. 53-106')
    p.add_argument('--apply', action='store_true',
                   help='write the files. Without it nothing is changed.')
    p.add_argument('--close-bekker', action='store_true',
                   help='the OTHER direction: close `1573 a25` up to '
                        '`1573a25`, John\'s policy for the revised edition. '
                        '5353 sites; respects --apply')
    p.add_argument('--record', type=Path, default=POLICY_RECORD,
                   help='where the policy application is banked')
    a = p.parse_args(argv)

    pages = None
    if a.pages:
        lo, _, hi = a.pages.partition('-')
        pages = range(int(lo), int(hi or lo) + 1)

    if a.close_bekker:
        got = close_bekker(a.dir, a.apply, pages)
        print(f"{got['n']} Bekker citation(s) closed up across "
              f"{got['files']} column(s)"
              + ('' if a.apply else '  — DRY RUN, nothing written'))
        for name, diff in got['samples']:
            print(f'\n  {name}')
            for line in diff:
                print(f'    {line}')
        if not a.apply:
            print('\ndry run — pass --apply to write')
        return 0

    got = run(a.dir, a.apply, pages)
    print(f"{got['n']} space(s) inserted across {got['files']} column(s) "
          f"in {a.dir}" + ('' if a.apply else '  — DRY RUN, nothing written'))
    for rule, n in got['by_rule'].items():
        print(f'  {n:6d}  {rule}')
    for name, diff in got['samples']:
        print(f'\n  {name}')
        for line in diff:
            print(f'    {line}')
    if a.apply:
        # ⚠ BANKED, BECAUSE THE CORPUS NO LONGER SAYS WHAT THE PAGE SAYS HERE.
        # A reader who finds `1573 a25` must be able to learn that the space is
        # editorial policy and not an observation of the ink.
        a.record.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            'date': date.today().isoformat(),
            'ruling': RULING,
            'directory': str(a.dir),
            'pages': a.pages or 'all',
            'by_rule': got['by_rule'],
            'n': got['n'],
            'files': got['files'],
            'not_touched': 'general spacing — not decidable; see space_slot',
        }
        old = (json.loads(a.record.read_text(encoding='utf-8'))
               if a.record.exists() else [])
        old.append(entry)
        a.record.write_text(json.dumps(old, ensure_ascii=False, indent=1)
                            + '\n', encoding='utf-8')
        print(f'\nbanked in {a.record}')
    else:
        print('\ndry run — pass --apply to write')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
