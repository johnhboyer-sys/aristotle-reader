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


@pytest.mark.parametrize('a,b', [('ἐξ', 'ἕξ'), ('ἐν', 'ἕν'), ('ἣν', 'ἦν')])
def test_it_never_chooses_between_two_words_aristotle_writes(a, b):
    """⚠ THIS TEST ASSERTED THE WRONG THING and went red when `decide` learned
    to accept an exact attested form. Both members of each pair ARE real words
    Aristotle writes, so confirming either on its own is right — `ἐξ` in the
    corpus is not an error.

    What must never happen is the oracle CHOOSING between them, and that is
    `arbitrate`, not `decide`. Asserting refusal from `decide` conflated
    "is this a word?" with "which word is on the page?" — the second question
    is the only one arbitration asks, and the only one it may get wrong."""
    from bonitz_pipeline.breathing_oracle import arbitrate
    assert arbitrate({'reader1': a, 'reader2': b}) is None, (
        f'the oracle chose between {a!r} and {b!r}; Aristotle writes both and '
        f'only the ink can say which is printed')
    for w in (a, b):
        got = decide(w)
        assert got and got[0] == breathing(w), (
            f'{w!r} is attested exactly and should be confirmed, not refused')


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


@pytest.mark.parametrize('word,other', [
    ('ἕκτος', 'ἐκτός'),        # sixth / outside — LSJ holds both
    ('ὀδών', 'ὁδῶν'),          # a tooth / of roads — LSJ has one, the corpus the other
])
def test_a_skeleton_two_real_words_share_is_never_decided(word, other):
    """⚠ CODEX FOUND THIS AND IT WAS A WRONG AUTOMATIC DECISION. `decide("ἕκτος")`
    returned SMOOTH, because Aristotle writes ἐκτός (outside) 137 times and
    never ἕκτος (sixth) — so the corpus, asked about a skeleton, answered about
    a different word. LSJ held both and knew.

    It is the ἐξ/ἕξ failure in its second form: that fix covered the case where
    Aristotle writes BOTH breathings, and left the case where he writes only
    one of two real words. Frequency cannot settle which word is on the page.

    ⚠ AND AMBIGUITY IS THE UNION OF BOTH AUTHORITIES. Checking LSJ alone still
    let `ὀδών` through — LSJ holds it smooth, the corpus holds `ὁδῶν` rough, so
    neither source is internally ambiguous and together they are."""
    assert decide(word) is None, (
        f'{word!r} was decided, but {other!r} shares its skeleton with the '
        f'opposite breathing — no corpus count can say which is on the page')


def test_an_exact_form_still_settles_itself():
    """The strictness must not swallow the ordinary case: where Aristotle writes
    this very word, breathing and all, there is nothing to decide."""
    for w in ('ὁδῶν', 'ἐκτός', 'ἁφῆς'):
        got = decide(w)
        assert got and got[0] == breathing(w), f'{w!r} -> {got}'


# ── the lemma map, which for its whole life matched nothing ────────────────

def test_the_lemma_map_is_actually_reachable():
    """⚠ THE JOIN WAS DEAD AND NOTHING WENT RED. `lemmas()` is keyed in Beta
    Code — `outos`, `twn` — and was looked up with a Greek skeleton, so 45,942
    entries answered every question with silence. A lexicon with no opinion
    looks exactly the same from the outside.

    This asserts the fallback FIRES, on a word whose answer is known. Coverage
    numbers cannot catch a dead branch; only a positive case can."""
    from bonitz_pipeline.breathing_oracle import beta, family, lemmas
    assert lemmas().get(beta('οια')) == ['oios']
    assert family('οια') == {'οἶος', 'οἷος'}
    # final sigma is a letter of its own, and forgetting it silently loses
    # every Greek noun that ends in one
    assert beta('αφης') == 'afhs'
    assert family('αγνευτικα') == {'ἁγνευτικός'}


@pytest.mark.parametrize('word,why', [
    ('οἶα', 'οἶος alone / οἷος such as — Aristotle writes only the second'),
    ('ὀῖαν', 'the same pair, and 25 attestations of οἵαν do not settle it'),
    # ⚠ THIS COMMENT ONCE CLAIMED LSJ CARRIES THE HALCYON BOTH WAYS. It does
    # not — this dump has only smooth ἀλκυών. The silence is real but comes
    # from the authorities DISAGREEING WITH EACH OTHER, which is the stronger
    # reason and the one worth naming. A test that passes for a stated reason
    # that is false is a test agreeing with itself.
    ('ἀλκυόνα', 'LSJ has the halcyon smooth and our Aristotle text writes it '
                'rough; when the authorities split, neither may rule'),
])
def test_it_will_not_generalise_across_a_split_lemma(word, why):
    """⚠ ABSENCE FROM ONE AUTHOR IS NOT ABSENCE FROM THE LANGUAGE. Grok,
    2026-08-10: the corpus generalised from a skeleton whenever it held no
    counterexample, so a word Aristotle happens not to use was corrected into
    one he does. An INFLECTED form has no headword to object with — `οια` is
    nobody's headword — so the objection has to come from its lemma."""
    assert decide(word) is None, f'{word}: {why}'


def test_the_guard_costs_almost_nothing():
    """It withdraws five proposals and keeps the rest: a form whose lemma is
    single-breathed is still decided, and that is the overwhelming majority."""
    for w in ('ἁφῆς', 'ἁμαρτάνειν', 'ἀγαθόν'):
        assert decide(w) is not None, f'{w} should still be decidable'


def test_the_ou_ligature_is_a_letter_and_not_a_mark():
    """⚠ THREE AUTHORITIES SILENT AT ONCE, FOR A TYPOGRAPHIC CONVENTION. Grok,
    2026-08-10: Bonitz sets ου as the single sort `ȣ`, and 1,696 of his words
    carry it. `skeleton()` kept the ligature, so the key `εχȣσιν` matched
    neither Aristotle's text nor LSJ nor the lemma map — and silence from every
    source is indistinguishable from a word no one has heard of.

    Expanding it closed 667 of the 1,220 skeletons nothing held. That gap was
    never a lexical gap; it was ours."""
    from bonitz_pipeline.breathing_oracle import beta, skeleton
    assert skeleton('ἔχȣσιν') == 'εχουσιν'
    assert beta(skeleton('ἔχȣσιν')) == 'exousin'
    assert skeleton('ϗ') == 'και'
    got = decide('ἔχȣσιν')
    assert got and got[0] == 'smooth', 'the ligature must not hide the word'


def test_it_reads_the_same_word_in_either_normal_form():
    """NFC and NFD are two keys for one word, and the exact-form check saw only
    one of them. Bonitz's files are NFC today; this is latent, not live."""
    import unicodedata
    for w in ('ἁφῆς', 'ἀγαθόν', 'ἕκαστον'):
        assert decide(unicodedata.normalize('NFD', w)) == decide(w), w


def test_arbitration_will_not_prefer_the_attested_member_of_a_split_pair():
    """⚠ `decide` CONFIRMS AN ATTESTED FORM BEFORE THE FAMILY GATE RUNS, and
    arbitration used to read "one confirmed, one silent" as a verdict. On a
    genuinely split pair both readings are real Greek and only the ink decides;
    confirming a word is safe, PREFERRING it on the other's absence is not."""
    from bonitz_pipeline.breathing_oracle import arbitrate
    assert arbitrate({'a': 'οἷα', 'b': 'οἶα'}) is None, (
        'οἷος and οἶος are two words; the corpus holding only one of them is '
        'a fact about Aristotle, not about the page')
