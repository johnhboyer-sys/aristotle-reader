"""A citation that wraps to the next line is still one citation.

Adversarial review by Grok, 2026-08-09, on the 113 unresolved sigla: *"Line-broken
citations never set `last`... Direct cause of `page-015-R:22` and ~34 of the 89."*
It was right, and the true count is larger than it estimated: **790** citations in
the corpus are split across a line break, in two shapes.

    Ζγα4. 717 | a16.        the page ends the line, the column letter opens the next
    Ζιζ 22.   | 576b15.     the siglum and chapter end the line, the page opens the next

Neither is anything Bonitz did.  A printed column wraps where the measure runs out,
and our reconciled files keep his line breaks because the transcription is
diplomatic.  Reading those files a line at a time makes the break semantic, which it
is not.

The damage is not merely that 790 citations go unchecked.  It is that a work named
on the near side of the break never becomes the context for what follows, so the
bare book letters after it inherit whatever work was last named BEFORE it — and are
then reported as errors.  `015-R:22` is the specimen: the true work-setter is
`Ζγα4. 717a16` (De generatione), invisible to the parser, so `β1. 731b23` inherits
Physics from two lines earlier and fails.  731 is uniquely De generatione.

The regex was never the problem: `\\s?` and `\\s*` both match a newline already.
`read()` iterating line by line is the whole of it.
"""

import pytest

from bonitz_pipeline.siglum_check import CITE, Cite, inventory, read, resolve

WORKS = inventory()


# ------------------------------------------------- the regex was always willing

@pytest.mark.parametrize('text,token,chapter,page', [
    ('Ζγα4. 717\na16. β1.731b23', 'Ζγα', '4', 717),      # page | column
    ('Ζιζ 22.\n576b15.', 'Ζιζ', '22', 576),              # siglum+chapter | page
    ('ημβ10. 1208\na13, 18.', 'ημβ', '10', 1208),
])
def test_the_regex_reads_straight_through_a_line_break(text, token, chapter, page):
    """No regex change is needed for any of this — only the iteration."""
    m = CITE.search(text)
    assert m, f'no citation found across the break in {text!r}'
    assert m.group(1) == token
    assert m.group(2) == chapter
    assert int(m.group(3)) == page


# ------------------------------------------------------- the real column, read

def test_the_wrapped_work_setter_is_found_at_all():
    """`Ζγα4. 717a16` on page-015-R spans lines 21/22. Before the stream read it
    did not exist as far as the checker was concerned."""
    cites = read(range(15, 16))
    found = [c for c in cites
             if c.col == 'page-015-R' and c.token == 'Ζγα' and c.page == 717]
    assert found, ('the wrapped citation Ζγα4. 717a16 was not parsed; a line-at-a-'
                   'time read cannot see it')


def test_the_wrapped_work_sets_the_context_for_what_follows():
    """The finding itself. `β1. 731b23` must inherit De generatione from the
    citation that wraps above it, not Physics from before it."""
    cites = read(range(15, 16))
    resolve(cites, WORKS)
    beta = [c for c in cites if c.col == 'page-015-R' and c.page == 731]
    assert beta, 'β1. 731b23 was not parsed at all'
    c = beta[0]
    assert c.work == 'Ζγ', (
        f'731b23 resolved to {c.work!r} ({c.how}); 731 is uniquely De generatione '
        f'and the work is named in the citation that wraps immediately above it')


def test_reading_the_column_as_a_stream_finds_strictly_more():
    """A sanity floor: the stream read must not lose anything the line read had."""
    cites = read(range(15, 53))
    assert len(cites) > 4121, (
        f'{len(cites)} citations; the line-at-a-time read found 4121 and there are '
        f'790 line-broken ones to recover')


def test_a_line_number_is_still_reported_for_every_citation():
    """John rules on these against the scan, so the report has to name a line even
    though the parse no longer respects them. A citation is filed under the line
    its FIRST character sits on."""
    cites = read(range(15, 16))
    assert all(c.line >= 1 for c in cites)
    setter = [c for c in cites if c.token == 'Ζγα' and c.page == 717][0]
    assert setter.line == 21, (
        f'the wrapped citation is filed under line {setter.line}; it begins on 21')
