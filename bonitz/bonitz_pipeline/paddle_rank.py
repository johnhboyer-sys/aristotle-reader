"""Order an existing card queue by what the fifth reader says about the spine.

    python3 -m bonitz_pipeline.paddle_rank \
        --queues 'work/kraken15-102/queue-118-281-*.json' \
        --read work/paddle-read-118-281 \
        --rulings work/rulings/cold-118-281-*.json \
        --out work/kraken15-102/queue-118-281-ranked.json

⚠ THIS IS WHAT PADDLE IS FOR, AND SEATING IT AS A VOTER IS NOT. Measured on
118-281, 2026-09-01: adding paddle to the panel removes 806 disputed SITES and
produces 510 more CARDS, because a fifth reading fragments the form-sets that
bundle sites onto one card. John rules cards, so the panel rebuild costs him
523 extra cards to win 806 fewer disputes. That trade is not obviously worth
making and he should not be handed it silently.

Ranking costs nothing and wins more. Over his own 591 rulings:

    paddle DISSENTS from the spine   160 ruled · 132 accepts · 82.5%
    paddle agrees on LETTERS only     72 ruled ·  29 accepts · 40.3%
    paddle AGREES with the spine     346 ruled ·  11 accepts ·  3.2%

which beats the previous best predictor, calamari, at 58.1% / 0.8%. On the
3,189 unruled cards that gives 150 dissent cards holding ~124 corrections and
289 letters-only cards holding ~116 — 14% of the pile carrying about 73% of
what is left to find.

⚠ THE TAIL IS NOT EMPTY AND MUST NOT BE DROPPED. 2,750 cards where paddle
agrees still hold an estimated 88 corrections at 3.2%. This orders the queue;
it does not licence skipping the end of it. `an-authority-claims-more-than-its
-evidence` is the house name for the mistake this file would otherwise invite.
"""

from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

BANDS = ('dissents', 'letters-only', 'silent', 'agrees')


def band(spine: str, reading: str | None, fold) -> str:
    """Which predictive band this site falls in."""
    if reading is None:
        return 'silent'
    if spine and spine in reading:
        return 'agrees'
    if spine and fold(spine) in fold(reading):
        return 'letters-only'
    return 'dissents'


def main(argv: list[str] | None = None) -> int:
    from .settle_review import cards_from_queue
    from .normalize import fold
    from . import score_fifth_reader as sf

    p = argparse.ArgumentParser()
    p.add_argument('--queues', required=True, help='glob of queue json')
    p.add_argument('--read', type=Path, required=True)
    p.add_argument('--rulings', default='', help='glob of rulings json')
    p.add_argument('--out', type=Path)
    a = p.parse_args(argv)

    ruled: dict = {}
    for f in glob.glob(a.rulings):
        ruled.update(json.loads(Path(f).read_text(encoding='utf-8')))

    by_band: dict[str, list] = {b: [] for b in BANDS}
    meta = None
    # ⚠ NEVER READ YOUR OWN OUTPUT. Written beside its inputs, a ranked queue
    # matches the same `queue-118-281-*.json` glob they do, and the next run
    # counts every site twice. This is the THIRD time this project has been
    # bitten by an output landing where an input is globbed —
    # `flags4-118-127-carded-carded.jsonl` twice, and this. Write the output
    # elsewhere AND refuse it here, because only one of those survives a
    # future caller passing a different --out.
    inputs = [q for q in sorted(glob.glob(a.queues))
              if json.loads(Path(q).read_text(encoding='utf-8')).get('group')
              != 'paddle-ranked']
    skipped = len(glob.glob(a.queues)) - len(inputs)
    if skipped:
        print(f'skipped {skipped} already-ranked queue(s) in the input glob\n')
    for q in inputs:
        doc = json.loads(Path(q).read_text(encoding='utf-8'))
        meta = meta or doc
        index = {(e['page'], e['col'], e['line'], e['word_off']): e
                 for e in doc.get('entries', [])}
        for card in cards_from_queue(Path(q)):
            if card.sid in ruled:
                continue
            m = card.members[0]
            spine = sf.nfc(m.readers.get('opus') or '')
            got = sf.read_at(a.read, m.page, m.col, m.line)
            b = band(spine, sf.nfc(got) if got is not None else None, fold)
            for mm in card.members:
                e = index.get((mm.page, mm.col, mm.line, mm.word_off))
                if e is not None:
                    e = dict(e); e['paddle_band'] = b
                    by_band[b].append(e)

    entries = [e for b in BANDS for e in by_band[b]]
    print(f'{len(entries)} unruled sites ordered by the fifth reader\n')
    for b in BANDS:
        print(f'  {b:13} {len(by_band[b]):5d} sites')
    if a.out and meta:
        doc = {k: v for k, v in meta.items() if k != 'entries'}
        doc['group'] = 'paddle-ranked'
        doc['ranked_by'] = ('paddle dissent from the spine; bands in order '
                            'dissents, letters-only, silent, agrees')
        doc['n_sites'] = len(entries)
        doc['entries'] = entries
        a.out.write_text(json.dumps(doc, ensure_ascii=False), encoding='utf-8')
        print(f'\n-> {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
