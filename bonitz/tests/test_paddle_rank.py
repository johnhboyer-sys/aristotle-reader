"""Ordering the card pile by what the fifth reader says.

The bands are the whole point: they are what turns a 3,189-card pile into 439
cards holding most of the corrections. Getting one wrong silently reorders
John's work, so each is pinned.
"""

from __future__ import annotations

from bonitz_pipeline.paddle_rank import band, BANDS
from bonitz_pipeline.normalize import fold


def test_a_silent_reader_is_not_agreement():
    """Absence is its own band. Scored as agreement it would sink a card to
    the bottom of the pile on the strength of a reading that does not exist."""
    assert band('τȣ͂', None, fold) == 'silent'


def test_agreement_is_the_lowest_yield_band():
    assert band('τȣ͂', 'ἀὴρ εἰς ὕδωρ τȣ͂ πρὸς ἄρκτον', fold) == 'agrees'


def test_a_different_reading_is_a_dissent():
    assert band('τῷ', 'ἀὴρ εἰς ὕδωρ τȣ͂ πρὸς ἄρκτον', fold) == 'dissents'


def test_same_letters_different_marks_is_its_own_band():
    """Paddle's measured weakness: 24% of corrections it had right in letters
    and wrong in diacritics. That band yields 40%, between the other two, and
    folding it into either would misrank ~300 cards."""
    assert band('δεσπόζειν', 'ϗ̀ ἄρχειν δεσποζειν Πζ4.', fold) == 'letters-only'


def test_the_band_order_puts_the_yield_first():
    assert BANDS == ('dissents', 'letters-only', 'silent', 'agrees')


def test_an_already_ranked_queue_is_not_read_back_in(tmp_path, capsys, monkeypatch):
    """Written beside its inputs, the output matches their glob and the next
    run counts every site twice. Third instance of this shape in the project.
    """
    import json
    from bonitz_pipeline import paddle_rank
    src = tmp_path / 'queue-118-281-ou.json'
    src.write_text(json.dumps({'group': 'ou', 'entries': []}), encoding='utf-8')
    out = tmp_path / 'queue-118-281-ranked.json'
    out.write_text(json.dumps({'group': 'paddle-ranked', 'entries': []}),
                   encoding='utf-8')
    paddle_rank.main(['--queues', str(tmp_path / 'queue-118-281-*.json'),
                      '--read', str(tmp_path)])
    assert 'skipped 1 already-ranked queue' in capsys.readouterr().out
