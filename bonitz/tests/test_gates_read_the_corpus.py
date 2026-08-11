"""Every gate must read the pages it claims to certify.

2026-08-10. Five checks — alphacheck, family, bekker, lexcheck, quotecheck —
each opened `work/reconciled/page-NNN-C.txt` and returned an empty result when
the file was not there. Pages 53-62 are settled but not promoted, so they live
in `work/reconciled-auto/`, and all five reported them clean without reading a
character. alphacheck printed

    0 order violations in 0 headword candidates

over twenty columns of a dictionary index, which is nothing but headwords, and
quotecheck printed `0 of 0 checkable citations`. Nought out of nought is not a
pass.

This is the project's recurring defect in its purest form: a check that matches
nothing reports nothing, and looks exactly like a check that finds nothing. So
these tests assert VOLUME, not verdicts. A gate is allowed to find no defects.
It is not allowed to look at no text.
"""

from __future__ import annotations

import pytest

from bonitz_pipeline.normalize import corpus_column

PAGES = range(53, 63)
COLS = ('L', 'R')


def test_every_settled_column_is_found_in_some_stage():
    missing = [f'page-{p:03d}-{c}' for p in PAGES for c in COLS
               if corpus_column(p, c, required=False) is None]
    assert not missing, missing


def test_asking_for_an_untranscribed_page_raises():
    """The lookup must refuse rather than hand back an empty result. Returning
    nothing is what let five gates certify pages they never opened."""
    with pytest.raises(FileNotFoundError):
        corpus_column(500, 'L')


def test_alphacheck_sees_the_headwords():
    """It found 150 candidates on 53-62 once it read the right directory, and
    one real violation with them. Before, it found zero and said so as though
    that were a clean bill."""
    from bonitz_pipeline.alphacheck import reconciled_headwords
    n = sum(len(reconciled_headwords(p)) for p in PAGES)
    assert n > 100, f'{n} headword candidates across 53-62 — the gate is blind'


def test_family_gets_headwords_to_compare():
    """family's scan returns [] both when a page is clean and when it never
    opened one. So test its INPUT: the thing that was silently zero."""
    from bonitz_pipeline.alphacheck import reconciled_headwords
    heads = [h for h in reconciled_headwords(58) if h[1] == 'L']
    assert len(heads) > 3, heads


def test_quotecheck_has_citations_to_check():
    from bonitz_pipeline.quotecheck import load_corpus, scan
    index = load_corpus()
    n = sum(len(scan(p, c, index)) for p in PAGES for c in COLS)
    assert n > 200, f'{n} checkable citations across 53-62 — 0 of 0 is not a pass'


def test_bekker_reads_the_settled_pages():
    """bekker reports only impossible citations, so a clean page and an absent
    one both come back empty. Assert it is looking at real text."""
    from bonitz_pipeline.bekker import scan
    scan(58, 'L')                      # must not raise
    path = corpus_column(58, 'L')
    assert path.read_text(encoding='utf-8').count('\n') > 50, path
