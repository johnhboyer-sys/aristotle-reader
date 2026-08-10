"""The lexicon decides a breathing, or it says nothing. Never a third thing.

A breathing belongs to the word, not to the reader, so it is the one big class
this project keeps paying for that does not need an eye at all — 17 of kraken's
200 holdout errors are a dropped smooth breathing, plus ἁ→ἀ x9 and ὑ→ὐ x4, plus
every one of the 18 breathings John has ruled by hand.

⚠ EVERY TEST BELOW EXISTS BECAUSE THE ORACLE WAS CONFIDENTLY WRONG FIRST. It
was built on LSJ headwords and would have condemned every `ἐξ` in the book.
"""

import pytest

from bonitz_pipeline.breathing_oracle import breathing, decide, skeleton


@pytest.mark.parametrize('word', ['ἐξ', 'ἕξ', 'ἐν', 'ἕν', 'ἣν', 'ἦν'])
def test_it_refuses_a_word_aristotle_writes_both_ways(word):
    """⚠ THE FIRST VERSION DECIDED THESE, AND WAS WRONG EVERY TIME. `ἐξ` (out
    of) and `ἕξ` (six) share the skeleton `εξ`, and LSJ carries only one of them
    as a headword — so asking LSJ produced "rough", condemning 2,111 legitimate
    instances. The colliding skeletons are the high-frequency function words, so
    the error was constant rather than rare.

    Aristotle's own text shows both, which is the truth: the word is ambiguous
    in fact and no authority may choose."""
    assert decide(word) is None, (
        f'{word!r} was decided; Aristotle writes both breathings for this '
        f'skeleton and silence is the only honest answer')


@pytest.mark.parametrize('word,want', [
    ('ἁφῆς', 'rough'), ('ἁπτόμενον', 'rough'), ('ἁδρύνω', 'rough'),
    ('ἀγαθόν', 'smooth'), ('ἀρετή', 'smooth'),
])
def test_it_decides_where_aristotle_is_consistent(word, want):
    got = decide(word)
    assert got and got[0] == want, f'{word!r} -> {got}'


def test_an_unbreathed_form_never_votes_on_a_breathing():
    """Aristotle's text holds uppercase runs like `ΑΓ` with no breathing at all,
    and skeletonising lowercases them onto `ἀγ` — so the oracle decided that a
    word bearing a smooth breathing should bear none, 29 times over."""
    got = decide('ἀγαθόν')
    assert got and got[0] != 'none'


def test_it_will_not_rule_on_a_proper_noun():
    """`Ἅιδης` is Hades; LSJ under that skeleton holds only the common
    adjective `ἀϊδής`, unseen. A coverage gap looks exactly like evidence."""
    assert decide('Ἅιδης') is None


def test_it_reproduces_johns_own_breathing_rulings():
    """The claim that justifies the whole module: 16 of the 18 breathings John
    ruled by hand come back identical. The exceptions are `αλλα`, the printer's
    error at 032-L:1 he ruled to PRESERVE unaccented, and one the lexicon has no
    entry for."""
    import json
    from pathlib import Path
    led = json.loads((Path(__file__).resolve().parent.parent /
                      'work/rulings/john.json').read_text(encoding='utf-8'))
    k = 'rulings' if 'rulings' in led else [x for x in led if x != '_'][0]
    forms = [r['form'] for r in led[k] if 'breathing' in r.get('ruled', '')]
    agreed = [w for w in forms
              if (d := decide(w)) and d[0] == breathing(w)]
    assert len(agreed) >= 14, (
        f'only {len(agreed)} of {len(forms)} hand rulings reproduce; the '
        f'lexicon has stopped agreeing with the reader it is meant to spare')


def test_silence_is_reported_as_silence():
    """Where it cannot decide it must return None, not a guess. A tool that
    always answers cannot be trusted on the answers that matter."""
    assert decide('ξξξξ') is None
