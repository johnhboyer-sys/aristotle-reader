"""One codepoint for the mark that stands after a Greek letter.

The shape does three jobs in this book — elision, a quotation mark, and the
breathing this typography prints BEFORE a capital — and only the first is
settled. Every test here is about the line between them, because a fold that
crossed it would rewrite the printed page rather than its encoding.
"""

from __future__ import annotations

import pytest

from bonitz_pipeline import audit_apply as aa
from bonitz_pipeline import audit_review as review
from bonitz_pipeline import elision

APOS, KOR, RSQ = elision.MARKS
COL = 'page-999-L'


# --- what folds ---------------------------------------------------------------

def test_elision_after_a_greek_letter_folds(c=None):
    assert elision.fold(f'καθ{APOS} ἓν') == 'καθ’ ἓν'
    assert elision.fold(f'ἐφ{KOR} ὅσοις') == 'ἐφ’ ὅσοις'
    assert elision.fold('δ’ ἄλλος') == 'δ’ ἄλλος'


def test_the_fold_is_idempotent():
    once = elision.fold(f'τὰ δ{APOS} ȣ̓ τέλη')
    assert elision.fold(once) == once


def test_a_combining_mark_does_not_hide_the_letter_under_it():
    """⚠ THE MARK BELONGS TO THE LETTER. `ȣ̓` is a ligature and a breathing;
    looking one character back lands on the breathing, and the fold would
    then decide there was no letter there at all."""
    assert elision.fold(f'τȣ̓{APOS} λόγȣ') == 'τȣ̓’ λόγȣ'


def test_the_ou_ligature_counts_as_greek():
    """`ȣ` is U+0223 LATIN SMALL LETTER OU by name and Greek text by use, on
    nearly every line of this corpus."""
    assert elision.fold(f'τȣ{APOS} μὲν') == 'τȣ’ μὲν'


# --- what does not fold, and why ----------------------------------------------

def test_a_breathing_printed_before_a_capital_is_left_alone():
    """⚠ NOT AN APOSTROPHE AT ALL. This book sets a lemma's initial breathing
    in front of the capital — `'Ἀλκιδάμας`, `᾽Αμιναῖος`. Folding it would
    spell a quotation mark where the page prints a breathing, and 13 sites
    say so."""
    assert elision.fold(f'{APOS}Ἀλκιδάμας') == f'{APOS}Ἀλκιδάμας'
    assert elision.fold(f'— {KOR}Αμιναῖος') == f'— {KOR}Αμιναῖος'


def test_an_opening_quotation_mark_is_not_turned_into_a_closing_one():
    """A blind fold reverses the direction of every opening quote in the
    Latin commentary."""
    assert elision.fold(f'({APOS}duo diversa') == f'({APOS}duo diversa'


def test_a_mark_after_a_latin_letter_is_left_alone():
    assert elision.fold(f'intelligi{APOS} S II') == f'intelligi{APOS} S II'


def test_aphaeresis_leads_its_word_and_is_left_alone():
    assert elision.fold('ut ’νόματος') == 'ut ’νόματος'


def test_what_was_left_is_reported_by_position():
    """A fold that named only what it changed would leave nobody looking at
    the cases it could not judge."""
    line = f'{APOS}Ἀλκμαίων ϗ̀ καθ{APOS} ἓν'
    assert elision.unfolded(line) == [0]


# --- the queue never asks again -----------------------------------------------

@pytest.fixture
def only_train(tmp_path, monkeypatch):
    """The kraken training queue alone, so a card can be counted."""
    from bonitz_pipeline import hand_cards
    for name in ('OOF_TSV', 'SIGLUM_TSV', 'DIVISION_TSV', 'ENCODING_TSV',
                 'RULINGS'):
        monkeypatch.setattr(review, name, tmp_path / f'no-{name}.tsv')
    aw = tmp_path / 'aw.tsv'
    aw.write_text('site\tground_truth\tboth_engines\n', encoding='utf-8')
    vk = tmp_path / 'vk.tsv'
    vk.write_text('site\tright\tground_truth\tthis_engine\tkraken\n',
                  encoding='utf-8')
    monkeypatch.setattr(review, 'AGREE_WRONG', aw)
    monkeypatch.setattr(review, 'VS_KRAKEN', vk)
    monkeypatch.setattr(hand_cards, 'HAND_TSV', tmp_path / 'no-hand.tsv')
    train = tmp_path / 'train.tsv'
    monkeypatch.setattr(review, 'TRAIN_TSV', train)
    return train


def head_and(*rows: str) -> str:
    return ('class\tcolumn\tline_id\tline_idx\tedits\tsubs\tgt\tmodel\n'
            + ''.join(rows))


def test_a_card_disputing_only_the_mark_is_dropped_and_counted(only_train):
    """⚠ FOUR BUNDLES ASKED THIS FOUR WAYS. The engines carry no information
    about which codepoint the ink prints, so the card asks John to judge from
    ink that cannot answer — his rule 3."""
    only_train.write_text(
        head_and(f'letter\t{COL}\tl1\t1\t1\tx\tκαθ{APOS} ἓν\tκαθ{KOR} ἓν\n'),
        encoding='utf-8')
    assert review.line_cards() == {}
    assert review.ELISION_FOLDED == 1


def test_a_real_dispute_on_the_same_line_survives_it(only_train):
    """Only the reading whose whole quarrel was the codepoint goes."""
    only_train.write_text(
        head_and(f'letter\t{COL}\tl1\t1\t1\tx\tκαθ{APOS} ἓν\tκαθ{KOR} ἕν\n'),
        encoding='utf-8')
    card, = review.line_cards().values()
    assert card.gt == 'καθ’ ἓν'
    assert card.readings == {'kraken e26': 'καθ’ ἕν'}
    assert review.ELISION_FOLDED == 0


def test_two_engines_and_one_of_them_only_quarrels_with_the_mark(only_train):
    only_train.write_text(
        head_and(f'letter\t{COL}\tl1\t1\t1\tx\tκαθ{APOS} ἓν\tκαθ{KOR} ἓν\n',
                 f'letter\t{COL}\tl2\t2\t1\tx\tδ{APOS} ἄλλος\tδ{APOS} ἄλλως\n'),
        encoding='utf-8')
    sids = sorted(review.line_cards())
    assert sids == [f'{COL}:l2']


# --- the apply step still knows what he ruled ---------------------------------

def test_a_ruling_stored_in_the_old_spelling_still_answers_its_card():
    """⚠ 54 RULINGS HELD ONE. The card now spells the line U+2019 and the
    store holds whatever the card carried that day; unfolded, the button
    check refuses every one of them as an answer to a question that has
    gone — the relabelling failure of 2026-08-14, again."""
    aa._LINES[COL] = ['καθ’ ἓν ἕκαστον']
    try:
        card = review.Card(f'{COL}:_a', COL, '_a', 'letter', 'καθ’ ἓν ἕκαστον',
                           {'kraken e26': 'καθ’ ἓν ἕκαστα'})
        plan = aa.resolve(
            {card.sid: card},
            {card.sid: {'verdict': 'fix',
                        'detail': f'καθ{APOS} ἓν ἕκαστα'}}, {})
        assert not plan.refusals
        edit, = plan.edits
        assert edit.new == 'καθ’ ἓν ἕκαστα'
    finally:
        aa._LINES.clear()


def test_an_elision_bundle_is_superseded_not_refused():
    """Its card is gone because the question is settled, which is not the
    same as a ruling that addresses nothing."""
    plan = aa.resolve({}, {f'pattern:{KOR}-{APOS}':
                           {'verdict': 'fix', 'detail': APOS}}, {})
    assert not plan.refusals
    (sid, why), = plan.superseded
    assert sid == f'pattern:{KOR}-{APOS}' and 'U+2019' in why


def test_a_deletion_bundle_counts_as_one_too():
    plan = aa.resolve({}, {f'pattern:{RSQ}-∅':
                           {'verdict': 'keep', 'detail': RSQ}}, {})
    assert not plan.refusals and plan.superseded


def test_an_ordinary_bundle_is_not_swallowed_by_the_test():
    """The guard must not eat a real orphan: `pattern:ή-η` has nothing to do
    with the elision mark, and silently superseding it would drop a ruling."""
    assert not aa._elision_bundle('pattern:ή-η')
    assert aa._elision_bundle(f'pattern:{APOS}-{RSQ}')


# --- a card that went while he was ruling --------------------------------------

def test_a_fix_whose_card_went_but_whose_line_already_reads_it():
    """⚠ THE FOLD MOVED THE QUEUE UNDER HIM. 37 cards went and other lines'
    parts renumbered while John was ruling, and nine of that morning's
    rulings landed on them. Each asked for a line the corpus now holds
    exactly, so each is satisfied — not lost, and not a ruling nobody can
    check."""
    aa._LINES[COL] = [f'ἀλλ’ εἴδει ἕτερα']
    try:
        plan = aa.resolve({}, {f'{COL}:_gone': {
            'verdict': 'fix', 'detail': f'ἀλλ{APOS} εἴδει ἕτερα'}}, {})
        assert not plan.refusals and not plan.edits
        (sid, why), = plan.superseded
        assert sid == f'{COL}:_gone' and 'already reads' in why
    finally:
        aa._LINES.clear()


def test_a_keep_whose_card_went_still_reaches_the_ledger():
    """⚠ A KEEP THAT LEAVES NO TRACE IS HOW A KEEP DIES. It is an observation
    about the ink, not about the card, and `record_ledger` is the only place
    it is ever written down — so it becomes a real edit with old == new
    rather than being quietly superseded."""
    aa._LINES[COL] = ['μετ’ ἀλλήλων ζῶσι']
    try:
        plan = aa.resolve({}, {f'{COL}:_gone': {
            'verdict': 'keep', 'detail': f'μετ{APOS} ἀλλήλων ζῶσι'}}, {})
        assert not plan.refusals and not plan.superseded
        edit, = plan.edits
        assert edit.verdict == 'keep' and edit.old == edit.new
        assert edit.line == 1
    finally:
        aa._LINES.clear()


def test_a_ruling_the_corpus_does_not_satisfy_still_refuses():
    """The guard must not turn every orphan into a pass: a ruling that wants
    something the corpus does not have is exactly the one nobody can check."""
    aa._LINES[COL] = ['ἀλλ’ εἴδει ἕτερα']
    try:
        plan = aa.resolve({}, {f'{COL}:_gone': {
            'verdict': 'fix', 'detail': 'wholly different text'}}, {})
        assert not plan.edits and not plan.superseded
        (sid, why), = plan.refusals
        assert 'nothing that can be checked' in why
    finally:
        aa._LINES.clear()


def test_a_homoglyph_from_any_source_is_folded_away_not_asked(only_train,
                                                              monkeypatch,
                                                              tmp_path):
    """⚠ THE FILTER RAN ON KRAKEN'S QUEUE ALONE. When calamari's out-of-fold
    read joined, it brought its homoglyphs with it — John, 2026-08-15, on a
    Greek Κ against a Latin K: "no clue on this one". The ink cannot answer
    a homoglyph; the glyph-pair cards decide the class."""
    oof = tmp_path / 'oof.tsv'
    oof.write_text('site\ttier\tground_truth\toof\tkraken\tvote\n'
                   f'{COL}:l7\tboth\t(Wz ad Κ 6. 5b10)\t'
                   f'(Wz ad K 6. 5b10)\t\t\n', encoding='utf-8')
    monkeypatch.setattr(review, 'OOF_TSV', oof)
    only_train.write_text(head_and(), encoding='utf-8')
    assert review.line_cards() == {}
    assert review.HOMOGLYPH_SKIPPED == 1
