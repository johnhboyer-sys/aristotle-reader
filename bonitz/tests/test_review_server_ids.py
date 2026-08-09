"""A malformed ruling id must change nothing.

This is a regression test with a specific history.  `do_POST` wrote the
rulings store BEFORE parsing the site id, so a request whose id was not
`col:line:corpus` was persisted and only then raised.  The bad key survived in
`work/sweeps/mark-rulings.json`, and because `test_john_mark_rulings` unpacks
every key with `rsplit(':', 2)`, pytest COLLECTION failed —

    ValueError: not enough values to unpack (expected 3, got 1)

— which takes the whole suite down, including the guards on John's rulings.
So the cost of one malformed request was every check in the repo going quiet
at once.  That is why the id is validated before anything is written.
"""

import pytest

from bonitz_pipeline.review_server import parse_site_id

GOOD = [
    ('page-033-R:20:ἀλλοιȣται', ('page-033-R', 20, 'ἀλλοιȣται')),
    ('page-041-R:3:ἀκροτάτῃ', ('page-041-R', 3, 'ἀκροτάτῃ')),
    # A corpus form may itself contain a colon. The id is built as
    # f'{col}:{line}:{corpus}', so it must be split LEFT to right: the column
    # never contains a colon and the line is always digits, but the form is
    # arbitrary text. Splitting from the right returns a column of
    # 'page-015-L:7' and a line of 'a' — this case is here because writing the
    # parser the other way round is the obvious mistake, and it was the first
    # one made.
    ('page-015-L:7:a:b', ('page-015-L', 7, 'a:b')),
]

BAD = [
    'PLUMBING-TEST-2',      # the one that actually broke collection
    'page-033-R:20',        # no corpus form
    'page-033-R',
    '',
    'page-1-L:x:word',      # line is not a number
    'page-1-L:5:',          # empty corpus form
    '::x',                  # empty column
    None,                   # not a string at all
    42,
    {'id': 'nested'},
]


@pytest.mark.parametrize('sid,want', GOOD)
def test_a_well_formed_id_parses(sid, want):
    assert parse_site_id(sid) == want


@pytest.mark.parametrize('sid', BAD)
def test_a_malformed_id_is_refused_rather_than_raising(sid):
    """None, not an exception: `do_POST` turns None into a 400 and returns
    before touching the store."""
    assert parse_site_id(sid) is None


def test_every_key_in_the_live_store_parses():
    """The store on disk must contain nothing that would break collection.

    If this fails, a bad key got in despite the guard — delete it and find out
    how, because the ruling tests cannot run until it is gone.
    """
    import json
    from bonitz_pipeline.review_server import RULINGS
    if not RULINGS.exists():
        pytest.skip('no rulings recorded yet')
    keys = json.loads(RULINGS.read_text(encoding='utf-8'))['rulings']
    bad = [k for k in keys if parse_site_id(k) is None]
    assert not bad, f'unparseable keys in {RULINGS.name}: {bad}'
