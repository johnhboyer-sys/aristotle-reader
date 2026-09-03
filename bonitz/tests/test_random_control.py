"""The control sample must be a DRAW, not a selection.

⚠ EVERY WAY THIS COULD QUIETLY STOP BEING RANDOM IS A WAY IT STOPS MEASURING
ANYTHING. It exists to give a base rate for the unruled pile; a draw that
leans on reader agreement, card size, or dict insertion order gives a number
that looks like a base rate and is not one.
"""
from __future__ import annotations

import json

from bonitz_pipeline import random_control


def test_the_same_seed_draws_the_same_cards(tmp_path):
    outs = []
    for i in (0, 1):
        p = tmp_path / f'q{i}.json'
        random_control.main(['--n', '25', '--seed', '7', '--out', str(p)])
        outs.append(json.loads(p.read_text(encoding='utf-8'))['entries'])
    assert outs[0] == outs[1], 'the draw is not reproducible from its seed'


def test_a_different_seed_draws_differently(tmp_path):
    got = []
    for s in ('7', '8'):
        p = tmp_path / f'q{s}.json'
        random_control.main(['--n', '25', '--seed', s, '--out', str(p)])
        got.append({(e['page'], e['col'], e['word_off'])
                    for e in json.loads(p.read_text(encoding='utf-8'))['entries']})
    assert got[0] != got[1], 'the seed is not reaching the draw'


def test_the_queue_records_its_seed(tmp_path):
    """A draw whose seed is not written down cannot be checked later."""
    p = tmp_path / 'q.json'
    random_control.main(['--n', '10', '--seed', '4242', '--out', str(p)])
    doc = json.loads(p.read_text(encoding='utf-8'))
    assert doc['seed'] == 4242
    assert doc['group'] == 'random-control'


def test_it_draws_no_card_John_has_already_ruled(tmp_path):
    """⚠ A RULED CARD IN THE SAMPLE IS A RIGGED BASE RATE. It would come back
    pre-answered, and its answer was given in a sitting that SELECTED it."""
    from pathlib import Path
    from bonitz_pipeline import score_fifth_reader as sf
    from bonitz_pipeline.settle_review import cards_from_queue

    p = tmp_path / 'q.json'
    random_control.main(['--n', '60', '--seed', '11', '--out', str(p)])
    ruled = {k for k, v in sf.load_rulings(Path('.')).items() if v.get('verdict')}
    for extra in Path('.').glob('work/rulings/paddle*.json'):
        ruled |= {k for k, v in json.loads(
            extra.read_text(encoding='utf-8')).items() if v.get('verdict')}
    drawn = {c.sid for c in cards_from_queue(p)}
    assert not (drawn & ruled), f'drew {len(drawn & ruled)} already-ruled cards'
