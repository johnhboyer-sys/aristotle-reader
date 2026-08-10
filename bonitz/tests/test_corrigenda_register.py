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
    """The corpus line an entry claims to describe.

    Pages settled but not yet promoted live in `reconciled-auto`. Checking
    those too is the point — a register entry for a page nobody can look at is
    exactly the kind of unguarded claim this file exists to stop.
    """
    col = f'page-{e["page"]:03d}-{e["col"]}'
    for stage in ('reconciled', 'reconciled-auto'):
        p = ROOT / f'work/{stage}/{col}.txt'
        if p.exists():
            return p.read_text(encoding='utf-8').splitlines()[e['line'] - 1]
    raise AssertionError(f'{col} is in the register but in no corpus stage')


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


def test_a_correction_never_invents_a_character_the_page_does_not_carry():
    """The register records the PRINTED page, so a correction may not add a work
    siglum the ink never had. `κ1. 1050` was written `Μθ1. 1050` and
    `η4. 1276` was written `Πγ4. 1276` — fine as fully expanded citations, wrong
    as "what the printed form should become". The work belongs in `authority`.

    Grok, 2026-08-09. A bare inherited letter stays bare."""
    # ⚠ A PLACEHOLDER IS NOT A CORRECTION. The work-level preserves record
    # `(unsettled — see authority)`, because John ruled that the PAGE reads as
    # printed without being asked WHICH of siglum or page Bonitz got wrong.
    # That is the honest entry, and it must not be measured as if it were a
    # proposed reading.
    grown = [(e['printed'], e['correct']) for e in ENTRIES
             if not e['correct'].startswith('(')
             and len(e['correct']) > len(e['printed'])]
    assert not grown, f'corrections longer than what was printed: {grown}'


def test_a_contestable_correction_says_so():
    """`correct` moves the book letter on the reasoning that the page is the
    sound member. For 16 of the 21 book-level entries a SINGLE DIGIT would
    validate the letter as printed instead — `ηεδ … 1231` against book δ at
    1234, `Ρβ … 1407` against β ending 1404. John ruled what is printed, not
    which of the two Bonitz got wrong, and a default must not read as a
    verdict."""
    book = [e for e in ENTRIES if e['rule'].startswith('book_spans')]
    flagged = [e for e in book if e.get('contested')]
    assert len(flagged) == 16, (
        f'{len(flagged)} of {len(book)} flagged; the near-boundary cases must '
        f'carry the warning or the revised edition inherits a guess as a fact')
    for e in flagged:
        assert 'CONTESTABLE' in e['contested']
