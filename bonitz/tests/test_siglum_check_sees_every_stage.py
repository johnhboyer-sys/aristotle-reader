"""siglum_check must see every corpus stage, and must not clobber its report.

Two defects, found 2026-08-11, both of the shape this project keeps paying for:
a check that answers a narrower question than the one asked, and cannot tell
you it did.

1. `read()` globbed `work/reconciled` alone. Pages 53-62 are settled but not
   promoted, so they live in `reconciled-auto` — and the module reported
   "55 sigla, 0 citations" over ten columns of a citation index. It now finds
   1,260 there.

2. `--pages` wrote its findings to the default output path, so a subset run
   silently destroyed the whole-corpus report. A 53-62 run wiped 13 real
   findings from 15-52 that nothing else held.
"""

from __future__ import annotations

import pytest

from bonitz_pipeline import siglum_check
from bonitz_pipeline.normalize import CORPUS_STAGES, corpus_columns


def test_the_corpus_now_resolves_wholly_from_reconciled():
    """⚠ THE LIVE PREMISE VANISHED, AND THAT WAS THE POINT. This asserted that
    some page sat in `reconciled-auto`, because 53-62 did. John promoted them on
    2026-08-11 and the assertion failed — on the work it was written to protect.

    What remains true is the arrangement itself: every column comes from a stage
    this project knows, and today they all come from one. The multi-stage claim
    it used to make lives below, where a second stage can be synthesised and
    cannot be promoted out from under it.
    """
    columns = corpus_columns()
    stages = {c.parent.name for c in columns}
    assert columns, 'no corpus columns at all'
    assert stages <= set(CORPUS_STAGES), stages
    assert stages == {'reconciled'}, (
        f'promotion is not complete — columns still sit in {sorted(stages)}')


def test_a_page_in_a_second_stage_is_still_found(tmp_path, monkeypatch):
    """⚠ THE DEFECT ITSELF, PINNED WHERE PROMOTION CANNOT REACH IT. A gate that
    globbed `work/reconciled` alone reported "55 sigla, 0 citations" over ten
    columns of a citation index, because those pages were settled into
    `reconciled-auto` and it never opened them. Nothing about that failure
    depends on which pages happen to be unpromoted today, so it is pinned
    against a corpus built for the purpose: one page in each stage.

    A reader that looks at one directory finds one of them and calls the other
    clean — which is the thing that must stay impossible.
    """
    from bonitz_pipeline import normalize

    for stage, page in (('reconciled', 900), ('reconciled-auto', 901)):
        d = tmp_path / 'work' / stage
        d.mkdir(parents=True, exist_ok=True)
        for col in ('L', 'R'):
            (d / f'page-{page:03d}-{col}.txt').write_text(
                'ἀρχὴ τῆς κινήσεως Ζιβ1. 497 b33\n', encoding='utf-8')

    monkeypatch.setattr(normalize, '__file__',
                        str(tmp_path / 'bonitz_pipeline' / 'normalize.py'))
    found = normalize.corpus_columns([900, 901])
    assert {c.parent.name for c in found} == set(CORPUS_STAGES), found
    assert len(found) == 4, found

    # And the one-stage reader this replaced would have missed half of it.
    one_stage = sorted((tmp_path / 'work' / 'reconciled').glob('page-*.txt'))
    assert len(one_stage) == 2, one_stage
    assert len(one_stage) < len(found), (
        'reading one stage found as much as reading every stage, so this '
        'fixture no longer reproduces the defect')

    # Asking for a page in neither stage still raises rather than reporting it
    # clean — the guarantee the whole module rests on.
    with pytest.raises(FileNotFoundError):
        normalize.corpus_columns([902])


def test_pages_53_62_carry_citations():
    """The specimen. Before the fix this range returned nothing at all, which
    printed identically to a range with no citations in it."""
    cites = siglum_check.read(range(53, 63))
    assert len(cites) > 1000, len(cites)


def test_a_missing_page_raises_rather_than_returning_nothing():
    """Silence must be impossible. Asking for a page in no stage is a mistake,
    and a sweep that answers it with an empty list cannot be trusted on the
    answers that matter."""
    with pytest.raises(FileNotFoundError):
        corpus_columns([9999])


def test_a_subset_run_names_its_own_report():
    """Assert on the FILENAME the CLI chooses, since that is the whole fix —
    a partial run must not be able to overwrite the full one."""
    import argparse
    from pathlib import Path

    def out_for(pages: str) -> Path:
        # Mirrors main()'s default; kept in one expression so a change to the
        # rule breaks this test rather than sliding past it.
        stem = f'siglum-check-{pages}' if pages else 'siglum-check'
        return siglum_check.ROOT / 'work/sweeps' / f'{stem}.tsv'

    assert out_for('') != out_for('53-62')
    assert out_for('').name == 'siglum-check.tsv'
    assert out_for('53-62').name == 'siglum-check-53-62.tsv'
    del argparse
