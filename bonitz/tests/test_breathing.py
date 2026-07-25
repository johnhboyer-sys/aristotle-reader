"""Breathing is lexical, so the lexicon may speak — but only when unanimous."""

import pytest

from bonitz_pipeline.breathing import breath_key, check, load_index


@pytest.fixture(scope='module')
def index():
    return load_index()


# rough words the readers printed smooth, found on pages 15-51
ROUGH_PRINTED_SMOOTH = ['ἄμα', 'ἀμαρτία', 'ἄμιλλα', 'ἄμμα', 'ἄλμα', 'ἄγιος',
                        'ἀλιάετος', 'ἀλιεύς', 'ἀλουργής']


@pytest.mark.parametrize('word', ROUGH_PRINTED_SMOOTH)
def test_flags_smooth_where_rough_is_attested(word, index):
    r = check(word, index)
    assert r is not None, f'{word} should be flagged'
    assert r['expected'].startswith('ἁ') or 'ἁ' in r['expected'] or \
           r['expected'] != r['printed']


@pytest.mark.parametrize('word', ['ἅμα', 'ἁμαρτία', 'ἅμιλλα', 'ἁλουργής', 'ἡδέα'])
def test_silent_on_correct_forms(word, index):
    assert check(word, index) is None


def test_silent_where_the_traditions_disagree(index):
    """ἀλκυών: LSJ smooth, TLG rough. Both are real; say nothing."""
    assert check('ἀλκυών', index) is None


def test_silent_on_ligature_initial_words(index):
    """The ou-ligature takes an accent with no breathing as a matter of course."""
    assert check('ȣ̓δεὶς', index) is None


def test_breath_key_drops_accents_keeps_breathing():
    assert breath_key('ἅμα') == breath_key('ἁμα') != breath_key('ἄμα')


def test_strength_separates_one_witness_from_two(index):
    strengths = {w: (check(w, index) or {}).get('strength')
                 for w in ('ἄμα', 'ἀφῆς')}
    assert strengths['ἄμα'] == 'strong'      # corpus and LSJ both attest ἅμα
    assert strengths['ἀφῆς'] == 'weak'       # corpus only


def test_reads_through_the_raw_ligature(index):
    """Text keeps ȣ raw; the lexicon spells it ου. Look up the spelled form."""
    r = check('ἀλȣργής', index)
    assert r is not None
    assert r['wrote'] == 'ἀλȣργής'                       # report what is printed
    # breath_key is decomposed (α + combining rough), so compare through it
    assert r['expected'] == breath_key('ἁλουργης')       # judge the spelled form
    assert r['printed'] == breath_key('ἀλουργης')


@pytest.mark.parametrize('word,expected,want', [
    ('ἄμα', 'ἁμα', 'ἅμα'),            # precomposed expected
    ('ἀμαρτία', 'ἁμαρτια', 'ἁμαρτία'),
    ('ἀλȣργής', 'ἁλουργης', 'ἁλȣργής'),  # ligature stays raw in the text
    ('ἐξῆς', 'ἑξης', 'ἑξῆς'),
    ('αλλα', 'ἀλλα', 'ἀλλα'),         # breathing absent entirely
])
def test_rebreathe_keeps_accent_and_ligature(word, expected, want):
    from bonitz_pipeline.lexreview import _rebreathe
    assert _rebreathe(word, expected) == want
