"""A re-read must not cost John a ruling.

Cards are identified by their form-set — the set of things the readers said —
so fixing a reader dissolves the card and, before this, the ruling with it.
Kraken's segmentation fix dissolved 78 of the 300 cards he answered on
2026-08-10. His instruction that day was exact:

    if the kraken fix dissolves cards i already ruled, the right move is to
    keep my ruling, not the machine's new agreement

These tests hold that line. The keeps get the same coverage as the accepts:
a keep that quietly stops being carried leaves no diff to notice.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from bonitz_pipeline import carry_rulings


def _queue(path: Path, entries: list[dict]) -> Path:
    path.write_text(json.dumps({'entries': entries}, ensure_ascii=False),
                    encoding='utf-8')
    return path


def _site(word_off: int, readers: dict, page: int = 900, col: str = 'L'
          ) -> dict:
    forms = sorted(set(readers.values()))
    return {'page': page, 'col': col, 'line': 1, 'word_off': word_off,
            'char_at': 0, 'readers': readers, 'kind': 'marks',
            'reason': 'test', 'forms': forms, 'form_set': forms}


def test_a_dissolved_card_keeps_its_ruling(tmp_path):
    """Kraken stopped dropping the alpha, so the form-set changed and the card
    John answered no longer exists. The site does — and it is his answer that
    holds there, not the readers' new agreement."""
    old = _queue(tmp_path / 'old.json',
                 [_site(10, {'opus': 'ἀναίδεια', 'kraken': 'ναίδεια'})])
    new = _queue(tmp_path / 'new.json',
                 [_site(10, {'opus': 'ἀναίδεια', 'kraken': 'ἀναιδεια'})])
    r = tmp_path / 'r.json'
    r.write_text(json.dumps({'forms:ναίδεια|ἀναίδεια':
                             {'verdict': 'preserve'}}), encoding='utf-8')

    carried, todo, conflicts = carry_rulings.carry(new, old, r)
    assert todo == [] and conflicts == []
    assert carried == {'forms:ἀναίδεια|ἀναιδεια':
                       {'verdict': 'preserve', 'detail': 'ἀναίδεια',
                        'carried_from': ['forms:ναίδεια|ἀναίδεια']}}


def test_an_accept_carries_its_form(tmp_path):
    old = _queue(tmp_path / 'old.json',
                 [_site(10, {'opus': 'ἀνθρώπȣ', 'kraken': 'ἄνθρώπȣ'})])
    new = _queue(tmp_path / 'new.json',
                 [_site(10, {'opus': 'ἀνθρώπȣ', 'kraken': 'ἄνθρωπȣ'})])
    r = tmp_path / 'r.json'
    r.write_text(json.dumps({'forms:ἀνθρώπȣ|ἄνθρώπȣ':
                             {'verdict': 'accept', 'detail': 'ἄνθρώπȣ'}}),
                 encoding='utf-8')
    carried, todo, _ = carry_rulings.carry(new, old, r)
    assert todo == []
    assert list(carried.values())[0]['detail'] == 'ἄνθρώπȣ'


def test_a_card_holding_one_unseen_site_goes_back_to_him(tmp_path):
    """One card, one question. Carrying a ruling onto a site he was never
    shown is the same mistake as applying a card's exemplar to a member that
    prints something else."""
    old = _queue(tmp_path / 'old.json',
                 [_site(10, {'opus': 'ἀρχὴ', 'kraken': 'ἀρχή'})])
    new = _queue(tmp_path / 'new.json',
                 [_site(10, {'opus': 'ἀρχὴ', 'kraken': 'ἀρχή'}),
                  _site(99, {'opus': 'ἀρχὴ', 'kraken': 'ἀρχή'})])
    r = tmp_path / 'r.json'
    r.write_text(json.dumps({'forms:ἀρχή|ἀρχὴ': {'verdict': 'preserve'}}),
                 encoding='utf-8')
    carried, todo, _ = carry_rulings.carry(new, old, r)
    assert carried == {}
    assert [c.sid for c in todo] == ['forms:ἀρχή|ἀρχὴ']


def test_sites_he_ruled_differently_are_reported_not_merged(tmp_path):
    """The new grouping can put two sites in one card that the old grouping
    kept apart. Picking either answer would be inventing one."""
    old = _queue(tmp_path / 'old.json', [
        _site(10, {'opus': 'ἄν', 'kraken': 'ἄν'}),
        _site(20, {'opus': 'ἂν', 'kraken': 'ἂν'}),
    ])
    new = _queue(tmp_path / 'new.json', [
        _site(10, {'opus': 'ἄν', 'kraken': 'ἂν'}),
        _site(20, {'opus': 'ἂν', 'kraken': 'ἄν'}),
    ])
    r = tmp_path / 'r.json'
    r.write_text(json.dumps({'forms:ἄν': {'verdict': 'preserve'},
                             'forms:ἂν': {'verdict': 'preserve'}}),
                 encoding='utf-8')
    carried, todo, conflicts = carry_rulings.carry(new, old, r)
    assert carried == {}
    assert [c['sid'] for c in conflicts] == ['forms:ἂν|ἄν']
    assert [c.sid for c in todo] == ['forms:ἂν|ἄν']


def test_a_member_printing_something_else_was_never_answered(tmp_path):
    """A card shows one exemplar. A member printing another was not the thing
    he looked at, so it is unruled — and carrying it forward would launder a
    non-answer into an answer. Seven sites on 53-62 are like this."""
    old = _queue(tmp_path / 'old.json', [
        _site(10, {'opus': 'αὐτὸν', 'kraken': 'αὑτὸν'}),
        # same card, but Opus reads the OTHER form here
        _site(50, {'opus': 'αὑτὸν', 'kraken': 'αὐτὸν'}),
    ])
    new = _queue(tmp_path / 'new.json',
                 [_site(50, {'opus': 'αὑτὸν', 'kraken': 'αὐτὸν'})])
    r = tmp_path / 'r.json'
    r.write_text(json.dumps({'forms:αὐτὸν|αὑτὸν':
                             {'verdict': 'accept', 'detail': 'αὑτὸν'}}),
                 encoding='utf-8')

    assert (900, 'L', 50) not in carry_rulings.ruled_sites(old, r)
    carried, todo, _ = carry_rulings.carry(new, old, r)
    assert carried == {}
    assert [c.sid for c in todo] == ['forms:αὐτὸν|αὑτὸν']


# --- the live re-read ------------------------------------------------------

FILTERED = (Path(__file__).resolve().parent.parent
            / 'work' / 'queue-053-062-filtered.json')


@pytest.mark.skipif(not FILTERED.exists(), reason='no re-read queue yet')
def test_the_kraken_reread_costs_no_ruling():
    """78 of the 300 cards dissolved. Not one of the 397 answered sites did."""
    ruled = carry_rulings.ruled_sites()
    # 404 member sites, less the 7 whose printed form was never on a card.
    assert len(ruled) == 397, len(ruled)
    carried, todo, conflicts = carry_rulings.carry(FILTERED)
    assert len(carried) == 236, len(carried)
    assert sum(c.n for c in todo) == 62, sum(c.n for c in todo)
    # No conflicts left on this range: the two that looked like contradictory
    # answers (ἄν/ἂν, ἐστιν/ἐστὶν) were drift sites, and dropping those from
    # `ruled` sends the cards back to him for the simpler and truer reason —
    # they hold a site he was never shown.
    assert conflicts == [], conflicts

    # Every site he answered still resolves to the form he chose — either
    # carried onto a new card, or gone from the queue because the readers now
    # agree with him and the corpus already holds it.
    from bonitz_pipeline.settle_review import cards_from_queue
    lost = []
    for card in cards_from_queue(FILTERED):
        c = carried.get(card.sid)
        if not c:
            continue
        for m in card.members:
            was = ruled.get((m.page, m.col, m.word_off))
            if was and was['form'] != c['detail']:
                lost.append((m.sid, was['form'], c['detail']))
    assert not lost, lost
