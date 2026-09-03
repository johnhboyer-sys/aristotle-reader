"""Score a candidate fifth reader against John's own rulings.

    python3 -m bonitz_pipeline.score_fifth_reader --read work/paddle-read-118-281

⚠ CER ON A HOLDOUT DOES NOT DECIDE THIS. A reader earns a place on the panel by
helping with the work John actually does, and that has two halves which must be
measured SEPARATELY — an average hides the trade between them:

  RECALL   of the sites he corrected. Where the spine was wrong and he ruled a
           different reading, does the candidate hold that reading? Those are
           the corrections it would have helped find.

  QUIET    on the sites he preserved. Where the spine was right, does the
           candidate agree with it? Every disagreement there is a card raised
           for nothing — which is the whole complaint against genie and llama
           ("too error prone such that they are surfacing too many cards that
           aren't wrong"), and the reason a noisy reader is worse than none.

The decision rule, fixed 2026-08-31 BEFORE any result was seen, so it could not
be rationalised afterwards:

    universal   catches a good share of the corrections AND its false-alarm
                rate on the preserves is no worse than calamari's
    selective   informative but too noisy to vote: tie-break the 2-2 splits,
                and flag sites where all four readers agreed and it does not
    reject      ligature recall near zero, whatever else it scores

⚠ AND THE LIGATURE CHECK IS STRUCTURAL, NOT A SCORE. Tesseract read 30% of
holdout lines perfectly and emitted `ȣ` zero times in forty opportunities. A
reader that cannot produce the sorts this index turns on is not a candidate for
either mode, however well it does on the rest.
"""

from __future__ import annotations

import argparse
import collections
import glob
import json
import sys
import unicodedata
from pathlib import Path

LIGATURES = 'ȣϗϛ'
QUEUE_GROUPS = ('rest', 'ou', 'kai', 'stigma', 'excluded', 'split22-1',
                'ou-alone-1', 'ou-alone-2', 'rest-alone-1', 'rest-alone-2',
                'rest-alone-3')


def nfc(s: str | None) -> str:
    return unicodedata.normalize('NFC', s or '')


def load_cards(root: Path) -> dict:
    cards = {}
    for g in QUEUE_GROUPS:
        p = root / f'work/kraken15-102/queue-118-281-{g}.json'
        if not p.exists():
            continue
        for e in json.loads(p.read_text(encoding='utf-8'))['entries']:
            cards.setdefault('forms:' + '|'.join(e['form_set']), e)
    return cards


def load_rulings(root: Path) -> dict:
    out = {}
    for f in glob.glob(str(root / 'work/rulings/cold-118-281-*.json')):
        try:
            out.update(json.loads(Path(f).read_text(encoding='utf-8')))
        except Exception:
            continue
    return out


def read_at(read_dir: Path, page: int, col: str, line: int) -> str | None:
    """The candidate's reading of one printed line, or None if it has none."""
    p = read_dir / f'page-{page:03d}-{col}.txt'
    if not p.exists():
        return None
    lines = p.read_text(encoding='utf-8').splitlines()
    return lines[line - 1] if 0 < line <= len(lines) else None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--read', type=Path, required=True,
                   help="directory of the candidate's per-column .txt")
    p.add_argument('--root', type=Path, default=Path('.'))
    a = p.parse_args(argv)

    cards, rulings = load_cards(a.root), load_rulings(a.root)
    if not cards or not rulings:
        raise SystemExit('no cards or no rulings found — wrong --root?')

    tally = collections.Counter()
    misses = []
    for sid, r in rulings.items():
        e = cards.get(sid)
        if not e or r.get('verdict') not in ('accept', 'preserve'):
            continue
        got = read_at(a.read, e['page'], e['col'], e['line'])
        if got is None:
            tally['no reading'] += 1
            continue
        got = nfc(got)
        spine, ruled = nfc(e['readers'].get('opus')), nfc(r.get('detail'))
        if r['verdict'] == 'accept':
            # ⚠ SUBSTRING, NOT EQUALITY. The candidate reads the whole printed
            # line; the ruling is one word in it.
            tally['corrections'] += 1
            if ruled and ruled in got:
                tally['corrections caught'] += 1
            elif spine and spine in got:
                tally['corrections missed (sided with the spine)'] += 1
                misses.append((e, spine, ruled))
            else:
                tally['corrections missed (read a third thing)'] += 1
        else:
            tally['preserves'] += 1
            if spine and spine in got:
                tally['preserves agreed'] += 1
            else:
                tally['preserves disagreed (a card for nothing)'] += 1

    print('scored against John\'s own rulings on 118-281\n')
    n_c, n_p = tally['corrections'], tally['preserves']
    if n_c:
        hit = tally['corrections caught']
        print(f'RECALL   {hit}/{n_c} corrections held the reading he ruled '
              f'({100 * hit / n_c:.0f}%)')
        for k in ('corrections missed (sided with the spine)',
                  'corrections missed (read a third thing)'):
            print(f'           {tally[k]:4d}  {k.split("(")[1][:-1]}')
    if n_p:
        ok = tally['preserves agreed']
        print(f'\nQUIET    {ok}/{n_p} preserves agreed with the spine '
              f'({100 * ok / n_p:.0f}%)')
        print(f'           {tally["preserves disagreed (a card for nothing)"]:4d}'
              f'  cards it would have raised for nothing')
    if tally['no reading']:
        print(f'\n⚠ {tally["no reading"]} sites had no reading at all — the '
              f'candidate is missing those columns, and a missing column is '
              f'not agreement.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
