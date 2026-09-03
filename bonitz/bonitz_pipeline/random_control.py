"""A random sample of the unruled pile — the control every ranking has lacked.

    python3 -m bonitz_pipeline.random_control --n 100 --seed 20260902

⚠ THIS EXISTS BECAUSE A RANKING WAS SCORED AGAINST NOTHING. On 2026-09-02 a
sitting of 150 cards, ordered by paddle's predicted yield, returned 16.3%
corrections. That was reported as "worse than not ranking at all", read
against the ~35% of John's earlier rulings. John: "wait, you calculated
paddle against what i just ruled?" The 35% came from cards EARLIER SITTINGS
CHOSE, and they chose the spine-alone and bloc-split classes because those
were rich. Comparing a leftover band to a hand-picked one measures the
selection and not the ranking.

So the sample here is drawn with NO reference to any reader, any band, any
predicted yield — uniformly at random from every unruled card, under a
recorded seed. Its accept rate is the base rate of the remaining pile, and
it is the only number against which a future ranking can be called better or
worse than nothing.

⚠ PRE-REGISTERED, BEFORE JOHN RULES IT. Written down here so it cannot be
chosen afterwards to suit the result:

  THE MEASUREMENT   accepts / (accepts + preserves) over the sample. Cards
                    set aside (`none`) are excluded from both, as they are
                    everywhere else in this project.

  THE COMPARISON    the paddle-dissent sitting's 16.3% (24 of 147) against
                    this. If the sample lands NEAR 16.3%, the ranking did
                    nothing and the dissent band is simply the pile. If it
                    lands WELL BELOW, the ranking helped after all and the
                    earlier report was unfair to it. If WELL ABOVE, ranking
                    actively hurt and the ordering cost John clicks.

  NOT A HOLDOUT     this is a base rate, not a model-selection set. It must
                    never be used to pick among candidate rankings — see
                    `holdout-spent-by-selection`. Measuring several rankings
                    against it and keeping the winner spends it, and the
                    number stops meaning what it says.

⚠ AND IT WILL FEEL LIKE A SLOG, WHICH IS THE POINT. Every sitting John has
been served was enriched on purpose. A uniform sample is not, so most of it
will be preserves. That is the measurement working, not the tool wasting his
time.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    from .settle_review import cards_from_queue
    from . import score_fifth_reader as sf

    p = argparse.ArgumentParser()
    p.add_argument('--root', type=Path, default=Path('.'))
    p.add_argument('--n', type=int, default=100)
    p.add_argument('--seed', type=int, required=True,
                   help='recorded in the queue; the draw must be reproducible')
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args(argv)

    ruled = {k for k, v in sf.load_rulings(a.root).items() if v.get('verdict')}
    for extra in a.root.glob('work/rulings/paddle*.json'):
        ruled |= {k for k, v in json.loads(
            extra.read_text(encoding='utf-8')).items() if v.get('verdict')}

    cards, meta, index = {}, None, {}
    for g in sf.QUEUE_GROUPS:
        q = a.root / f'work/kraken15-102/queue-118-281-{g}.json'
        if g == 'excluded' or not q.exists():
            continue
        doc = json.loads(q.read_text(encoding='utf-8'))
        meta = meta or doc
        for e in doc.get('entries', []):
            index[(e['page'], e['col'], e['line'], e['word_off'])] = e
        for c in cards_from_queue(q):
            if c.sid not in ruled:
                cards.setdefault(c.sid, c)

    sids = sorted(cards)                       # sorted first: dict order is not a draw
    rng = random.Random(a.seed)
    picked = rng.sample(sids, min(a.n, len(sids)))
    print(f'{len(sids)} unruled cards; drew {len(picked)} with seed {a.seed}')

    entries = []
    for sid in picked:
        for m in cards[sid].members:
            e = index.get((m.page, m.col, m.line, m.word_off))
            if e is not None:
                entries.append(e)

    doc = {k: v for k, v in (meta or {}).items()
           if k not in ('entries', 'excluded')}
    doc['group'] = 'random-control'
    doc['seed'] = a.seed
    doc['drawn_from'] = f'{len(sids)} unruled cards on 118-281'
    doc['why'] = ('a uniform random draw, with no reference to any reader or '
                  'band. Its accept rate is the base rate of the unruled '
                  'pile — the control no ranking in this project has had.')
    doc['n_sites'] = len(entries)
    doc['entries'] = entries
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(doc, ensure_ascii=False), encoding='utf-8')
    print(f'{len(entries)} sites -> {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
