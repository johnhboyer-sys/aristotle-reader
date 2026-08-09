"""The register and the corpus must not drift apart.

`work/corrigenda/README.md` has said since 2026-08-07 that `printed` must match
`work/reconciled` exactly, and that *"a test asserts that"*.  No test did.  The
claim was written down and never built, which is the worst of both worlds: the
invariant looked guarded, so nothing guarded it.

It matters because the register is the record of BONITZ'S errors, deliberately
left standing in the transcription.  If a later pass silently "corrects" one,
the corpus and the register disagree — and the register is the one that saw the
page.  Two of John's rulings were overwritten exactly that way on 2026-08-08
(`ἀλίσκεται`, `ἀλίζειν`, both 044-R) and had to be reverted.
"""

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
ENTRIES = json.loads((ROOT / 'work/corrigenda/entries.json')
                     .read_text(encoding='utf-8'))['entries']


def line_of(e: dict) -> str:
    col = f'page-{e["page"]:03d}-{e["col"]}'
    return (ROOT / f'work/reconciled/{col}.txt').read_text(
        encoding='utf-8').splitlines()[e['line'] - 1]


def test_every_recorded_error_is_still_in_the_corpus_as_printed():
    """The load-bearing one. A corrigendum whose `printed` has left the text is
    either a correction that moved off the ink, or a register gone stale."""
    drift = [(e['page'], e['col'], e['line'], e['printed'])
             for e in ENTRIES if e['printed'] not in line_of(e)]
    assert not drift, (
        f'{len(drift)} recorded errors are no longer in work/reconciled as '
        f'printed — the corpus and the register disagree, and the register is '
        f'the one that saw the page: {drift}')


def test_a_correction_is_never_identical_to_what_was_printed():
    """An entry that corrects nothing records nothing."""
    empty = [e['printed'] for e in ENTRIES if e['printed'] == e['correct']]
    assert not empty, f'entries whose correction changes nothing: {empty}'


def test_every_entry_says_who_checked_it_and_against_what():
    for e in ENTRIES:
        assert e.get('checked'), f'{e["printed"]!r} records no check'
        assert e.get('authority'), f'{e["printed"]!r} records no authority'
        assert e.get('rule'), f'{e["printed"]!r} records no rule'


def test_no_two_entries_record_the_same_place_twice():
    keys = [(e['page'], e['col'], e['line'], e['printed']) for e in ENTRIES]
    dupes = {k for k in keys if keys.count(k) > 1}
    assert not dupes, f'the same place recorded twice: {dupes}'


def test_the_book_level_rulings_are_all_registered():
    """John's 27 of 2026-08-09: the 21 he preserved are Bonitz's errors and
    belong here; the 6 he fixed are ours and must NOT."""
    book = [e for e in ENTRIES if e['rule'].startswith('book_spans')]
    assert len(book) == 21, f'{len(book)} book-level corrigenda; John preserved 21'
