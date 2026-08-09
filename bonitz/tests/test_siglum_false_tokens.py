"""The tail of a Greek word is not a citation.

`θέσιν 32. 88a` parsed as a citation of a work called `σιν`.  The guard against
that was there and did not work:

    (?<![Α-Ωα-ω])

`Α-Ω` is U+0391-U+03A9 and `α-ω` is U+03B1-U+03C9 — the UNACCENTED letters only.
Every accented Greek letter lives outside that span, in the precomposed range from
U+03AC or in Greek Extended from U+1F00, and a decomposed one ends in a combining
mark from U+0300.  So the lookbehind blocked the one case that never happens (a
citation glued to a bare vowel) and passed the case that does: a word ending in
unaccented letters, accented on the syllable before.

    θέσιν   =  θ έ σ ι ν   — the guard looks at έ (U+03AD), shrugs, matches `σιν`

Three of the eleven "unknown siglum" findings were this, and every one of them cost
a reader's attention on a word that was never a citation.  A false positive in this
report is worse than a miss: the report exists to be believed.
"""

import unicodedata

import pytest

from bonitz_pipeline.siglum_check import CITE, read


@pytest.mark.parametrize('text', [
    'θέσιν 32. 88a4',
    'ἡ θέσις 32. 88a4',
    'κατὰ φύσιν 12. 199b15',
])
def test_a_word_ending_in_unaccented_letters_is_not_a_citation(text):
    """Composed form: the accent sits on a precomposed letter above U+03AB."""
    assert not CITE.search(text), (
        f'{text!r} parsed as a citation; the word tail was read as a work siglum')


@pytest.mark.parametrize('text', [
    'θέσιν 32. 88a4',
    'κατὰ φύσιν 12. 199b15',
])
def test_the_same_word_decomposed_is_also_not_a_citation(text):
    """The corpus is not uniformly composed — the perispomeni normalisation of
    2026-08-08 left combining marks throughout — so the guard has to hold when the
    accent is a separate U+0300-range codepoint."""
    nfd = unicodedata.normalize('NFD', text)
    assert nfd != text, 'this case is only meaningful if the text decomposes'
    assert not CITE.search(nfd), (
        f'{nfd!r} parsed as a citation once decomposed; the guard must cover '
        f'combining marks as well as precomposed letters')


def test_a_genuine_citation_after_a_greek_word_still_parses():
    """The guard must not swallow the normal case: Bonitz sets a citation directly
    after the headword it belongs to, separated by a space."""
    m = CITE.search('ἀγαθόν Ηα1. 1094a22')
    assert m and m.group(1) == 'Ηα' and int(m.group(3)) == 1094


def test_the_known_word_fragments_are_gone_from_the_corpus_report():
    """`σιν` at 024-R:18 and the other fragment tokens were reported as unknown
    sigla. They are not sigla and never were."""
    cites = read(range(15, 53))
    fragments = {c.raw for c in cites if c.token in ('σιν', 'κις', 'ς')}
    assert not fragments, f'word fragments still parsing as citations: {fragments}'
