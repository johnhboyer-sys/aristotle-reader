"""--migrate must be incapable of losing rulings.

On 2026-08-12 a --migrate rebuilt work/rulings/john.json from the source
stores and silently dropped 66 of 198 rulings: everything `add()` had
appended since the stores were last written existed nowhere else, so the
rebuild simply did not know it.  The run printed a success line.

These tests pin the guard that replaces that behavior: a migrate that would
drop ANY entry the ledger already holds refuses, names the count and the ids
it would lose, writes nothing, and exits nonzero.  A migrate that preserves
every entry — equal or superset — proceeds as before.  Everything here runs
against a tmp_path ROOT; the real ledger is never touched.
"""

import json

import pytest

import bonitz_pipeline.john_rulings as jr

# The one store migrate() reads unconditionally.  Two rulings: one plain,
# one with a precomposed circumflex for the canon case below.
FIXTURE = {
    'hand': {'applied': [
        {'page': 32, 'col': 'L', 'line': 1, 'now': 'αλλα',
         'why': 'as printed'},
        {'page': 44, 'col': 'R', 'line': 7, 'now': 'τῶν', 'why': 'held'},
    ]},
}


@pytest.fixture
def root(tmp_path, monkeypatch):
    """A throwaway ROOT holding only the July fixture store."""
    f = tmp_path / 'tests/fixtures/john-rulings.json'
    f.parent.mkdir(parents=True)
    f.write_text(json.dumps(FIXTURE, ensure_ascii=False), encoding='utf-8')
    monkeypatch.setattr(jr, 'ROOT', tmp_path)
    monkeypatch.setattr(jr, 'LEDGER', tmp_path / 'work/rulings/john.json')
    return tmp_path


def test_lossy_migrate_refuses_names_the_loss_and_writes_nothing(root, capsys):
    """The 2026-08-12 shape: a ruling appended by add() lives only in the
    ledger.  Rebuilding from the stores must refuse, not drop it."""
    jr.migrate()
    jr.add('keep', col='page-099-R', line=5, form='φύσις',
           source='review server')          # in the ledger, in no store
    before = jr.LEDGER.read_bytes()

    rc = jr.main(['--migrate'])

    assert rc == 1
    err = capsys.readouterr().err
    assert 'LOSE 1 of' in err
    assert 'page-099-R:5:φύσις' in err
    assert jr.LEDGER.read_bytes() == before, 'refusal must not touch the file'


def test_migrate_raises_rather_than_saving(root):
    """The guard is in migrate() itself, not only in the CLI, so no other
    caller can reach save() with a lossy rebuild."""
    jr.migrate()
    jr.add('keep', col='page-099-R', line=5, form='φύσις',
           source='review server')
    with pytest.raises(jr.MigrateWouldLoseRulings):
        jr.migrate()


def test_non_lossy_migrate_still_works(root):
    """Sources cover everything (a plain re-run): proceeds, output correct."""
    first = jr.migrate()
    again = jr.migrate()

    ids = {r['id'] for r in again['rulings']}
    assert 'page-032-L:1:αλλα' in ids
    assert {r['id'] for r in first['rulings']} == ids
    on_disk = json.loads(jr.LEDGER.read_text(encoding='utf-8'))
    assert on_disk['rulings'] == again['rulings']


def test_superset_migrate_keeps_every_old_entry(root):
    """A new ruling lands in a source store: migrate proceeds and the old
    entries all survive alongside it."""
    old = {r['id'] for r in jr.migrate()['rulings']}

    grown = json.loads(json.dumps(FIXTURE))
    grown['hand']['applied'].append(
        {'page': 50, 'col': 'L', 'line': 3, 'now': 'λόγος', 'why': 'new'})
    (root / 'tests/fixtures/john-rulings.json').write_text(
        json.dumps(grown, ensure_ascii=False), encoding='utf-8')

    new = {r['id'] for r in jr.migrate()['rulings']}
    assert old <= new
    assert 'page-050-L:3:λόγος' in new


def test_body_clobber_refuses_names_id_and_fields(root, capsys):
    """Grok finding 4A: same id, different content.  John re-rules the
    page-032 site as a keep with a note; the July fixture still holds it as
    applied/text.  An id-only guard would silently write the fixture row over
    his later ruling.  Must refuse, name the id and the changed fields, and
    leave the ledger byte-identical."""
    jr.migrate()
    jr.add('keep', col='page-032-L', line=1, form='αλλα',
           note='held on re-review', source='review server')
    before = jr.LEDGER.read_bytes()

    rc = jr.main(['--migrate'])

    assert rc == 1
    err = capsys.readouterr().err
    assert 'OVERWRITE 1 of' in err
    assert 'page-032-L:1:αλλα' in err
    assert 'kind' in err and 'note' in err
    assert jr.LEDGER.read_bytes() == before, 'refusal must not touch the file'


def test_body_clobber_raises_rather_than_saving(root):
    """Like the loss guard, the clobber guard lives in migrate() itself."""
    jr.migrate()
    jr.add('keep', col='page-032-L', line=1, form='αλλα',
           note='held on re-review', source='review server')
    with pytest.raises(jr.MigrateWouldLoseRulings):
        jr.migrate()


def test_canon_collapse_with_differing_content_refuses(root, capsys):
    """Grok finding 4B: two ledger entries whose ids canon() to one rebuilt
    id both count as found while only one row would be written.  When their
    content differs the migrate must refuse and name both."""
    jr.migrate()
    d = json.loads(jr.LEDGER.read_text(encoding='utf-8'))
    twin = dict(next(r for r in d['rulings']
                     if r['id'] == 'page-044-R:7:τῶν'))
    twin['id'] = twin['id'].replace('ῶ', 'ω̃')
    twin['note'] = 'a different ruling under the other encoding'
    d['rulings'].append(twin)
    jr.save(d)
    before = jr.LEDGER.read_bytes()

    rc = jr.main(['--migrate'])

    assert rc == 1
    err = capsys.readouterr().err
    assert 'COLLAPSE' in err
    assert 'page-044-R:7:τῶν' in err and 'page-044-R:7:τω̃ν' in err
    assert jr.LEDGER.read_bytes() == before, 'refusal must not touch the file'


def test_identical_duplicate_collapse_proceeds(root):
    """The counterpart: two encodings of the SAME ruling, field for field,
    are deduplication, not loss.  The migrate proceeds."""
    jr.migrate()
    d = json.loads(jr.LEDGER.read_text(encoding='utf-8'))
    twin = dict(next(r for r in d['rulings']
                     if r['id'] == 'page-044-R:7:τῶν'))
    twin['id'] = twin['id'].replace('ῶ', 'ω̃')
    d['rulings'].append(twin)
    jr.save(d)

    out = jr.migrate()                       # must not refuse

    ids = [r['id'] for r in out['rulings']]
    assert len(ids) == len(set(ids))


def test_save_is_atomic_and_leaves_no_debris(root):
    """save() goes through a tempfile in the ledger's directory and
    os.replace, so a crash mid-write can never leave a torn ledger.  After a
    successful save: no *.tmp debris, and the file parses."""
    jr.migrate()
    jr.add('keep', col='page-099-R', line=5, form='φύσις',
           source='review server')

    leftovers = list(jr.LEDGER.parent.glob('*.tmp'))
    assert leftovers == []
    d = json.loads(jr.LEDGER.read_text(encoding='utf-8'))
    assert any(r['id'] == 'page-099-R:5:φύσις' for r in d['rulings'])


def test_a_reencoded_circumflex_is_not_reported_lost(root):
    """verdict_drift's lesson, applied here: a ledger id spelled with the
    combining tilde and a rebuild spelled with the perispomeni are the same
    ruling, not 82 false losses."""
    jr.migrate()
    d = json.loads(jr.LEDGER.read_text(encoding='utf-8'))
    for r in d['rulings']:
        r['id'] = r['id'].replace('ῶ', 'ω̃')
    jr.save(d)

    jr.migrate()                             # must not refuse
