"""Carry John's rulings across a re-read, by SITE rather than by card.

A card's identity is its form-set — the set of things the readers said. Fix a
reader and that set changes, so the card dissolves and takes the ruling with
it. The site does not change: `word_off` is an offset into the Opus stream,
and Opus is not what got re-read.

    ⚠ THE RULE THIS MODULE EXISTS FOR. When a re-read dissolves a card John
    already ruled, his ruling stands. The machine did not learn something new
    about the page; it stopped disagreeing with itself. He looked at the ink.

So a ruled site keeps its form no matter what the new pipeline decides, and
only sites he has never seen go back to him.

    python3 -m bonitz_pipeline.carry_rulings work/queue-053-062-filtered.json
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

from bonitz_pipeline.apply_settled import surface_form
from bonitz_pipeline.settle_review import (
    DEFAULT_QUEUE,
    RULINGS,
    Card,
    cards_from_queue,
)

ROOT = Path(__file__).resolve().parent.parent
CARRIED = ROOT / 'work' / 'sweeps' / 'settle-rulings-carried.json'


def _nfc(s: str) -> str:
    return unicodedata.normalize('NFC', s or '')


def ruled_sites(queue_path: Path = DEFAULT_QUEUE,
                rulings_path: Path = RULINGS) -> dict[tuple, dict]:
    """Every site John answered, keyed by (page, col, word_off).

    The value carries the form the corpus should hold there — for a keep, what
    Opus read; for an accept, his form with any ligature the readers show.
    """
    rulings = json.loads(rulings_path.read_text(encoding='utf-8'))
    out: dict[tuple, dict] = {}
    for card in cards_from_queue(queue_path):
        v = rulings.get(card.sid)
        if not v:
            continue
        for m in card.members:
            printed = m.readers.get('opus') or card.printed
            form = (printed if v['verdict'] == 'preserve'
                    else surface_form(v.get('detail', ''), m.readers))
            out[(m.page, m.col, m.word_off)] = {
                'verdict': v['verdict'],
                'form': _nfc(form),
                'printed': _nfc(printed),
                'from': card.sid,
            }
    return out


def carry(new_queue: Path,
          old_queue: Path = DEFAULT_QUEUE,
          rulings_path: Path = RULINGS
          ) -> tuple[dict, list[Card], list[dict]]:
    """(rulings for the new queue, cards still needing John, conflicts).

    A new card is pre-ruled only when EVERY one of its sites is already ruled
    AND they all resolve the same way. One card, one question: a card holding
    both a ruled and an unruled site is a question he has not been asked, and
    a card whose ruled sites disagree with each other is a question the old
    grouping hid.
    """
    ruled = ruled_sites(old_queue, rulings_path)
    carried: dict[str, dict] = {}
    todo: list[Card] = []
    conflicts: list[dict] = []
    for card in cards_from_queue(new_queue):
        answers = [ruled.get((m.page, m.col, m.word_off)) for m in card.members]
        if any(a is None for a in answers):
            todo.append(card)
            continue
        shapes = {(a['verdict'], a['form']) for a in answers}
        if len(shapes) > 1:
            conflicts.append({'sid': card.sid,
                              'shapes': sorted(f'{v}:{f}' for v, f in shapes)})
            todo.append(card)
            continue
        verdict, form = shapes.pop()
        carried[card.sid] = {
            'verdict': verdict,
            'detail': form,
            'carried_from': sorted({a['from'] for a in answers}),
        }
    return carried, todo, conflicts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('new_queue', type=Path)
    ap.add_argument('--old-queue', type=Path, default=DEFAULT_QUEUE)
    ap.add_argument('--rulings', type=Path, default=RULINGS)
    ap.add_argument('--out', type=Path, default=CARRIED)
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args(argv)

    carried, todo, conflicts = carry(a.new_queue, a.old_queue, a.rulings)
    sites = sum(c.n for c in todo)
    print(f'{len(carried)} card(s) carried from rulings John already gave')
    print(f'{len(todo)} card(s) still need him ({sites} sites)')
    if conflicts:
        print(f'{len(conflicts)} card(s) group sites he ruled differently:')
        for c in conflicts[:10]:
            print(f'  {c["sid"]}  {c["shapes"]}')
    for c in todo[:12]:
        print(f'  ask  {c.sid}  ({c.n} sites)')
    if a.write:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(carried, ensure_ascii=False, indent=1),
                         encoding='utf-8')
        print(f'\nwrote {a.out}')
    else:
        print('\ndry run — pass --write to record the carried rulings')
    return 0


if __name__ == '__main__':
    sys.exit(main())
