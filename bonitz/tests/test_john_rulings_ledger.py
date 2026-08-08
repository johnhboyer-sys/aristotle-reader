"""One test over every ruling John has made.

`work/rulings/john.json` is the single ledger, built by
`bonitz_pipeline.john_rulings` and appended to whenever he rules again.  This
file is the guard he asked for: *"can't we have a comprehensive
john_rulings.py that gets updated whenever i rule?"*

What it asserts, and why each matters:

  text      the form he ruled INTO the text is still there.  This is the
            direct guard against the 2026-08-08 failure, where a later pass
            overwrote two of his July rulings and nothing noticed for weeks.
  keep      the form he ruled was ALREADY right is still there.  A keep is
            the ruling most easily lost, because the text carries no trace
            that a human looked at it and approved it — the two ἁλι- words on
            044-R were keeps, and a family propagation "corrected" both.
  declined  a reading he REFUSED is still absent, and the print still stands
            as he ruled it (`αλλα` at 032-L:1, recorded as printed).
  damage    the lines he ruled unreadable are still excluded from training.

`policy` and `pending` rulings are recorded but cannot be checked — a policy
is not a string in a file, and pp.53-62 are not in `work/reconciled` yet.
They are counted here so that if they ever silently vanish from the ledger the
count assertion fails.
"""

import pytest

from bonitz_pipeline.john_rulings import CHECKABLE, check, load

LEDGER = load()['rulings']
CASES = [pytest.param(r, id=f'{r["kind"]}:{r["col"] or "policy"}:{r["line"]}')
         for r in LEDGER if r['kind'] in CHECKABLE]


def test_the_ledger_is_present_and_populated():
    """A missing or emptied ledger must fail loudly rather than turn every
    case below into a vacuous pass."""
    assert len(LEDGER) >= 107, (
        f'the ledger has shrunk to {len(LEDGER)} rulings; it held 107 when '
        f'it was built on 2026-08-08. Rulings are appended, never removed.')
    assert CASES, 'no checkable rulings in the ledger'


def test_every_kind_is_still_represented():
    """The migration pulled from five stores. If a whole kind disappears,
    a source has been dropped rather than a single ruling lost."""
    kinds = {r['kind'] for r in LEDGER}
    assert {'text', 'keep', 'declined', 'damage', 'policy', 'pending'} <= kinds


@pytest.mark.parametrize('r', CASES)
def test_johns_ruling_still_holds(r):
    ok, why = check(r)
    assert ok, (f'John ruled this on {r["date"]} ({r["source"]}):\n'
                f'  {r["ruled"] or r["form"]}\n{why}')
