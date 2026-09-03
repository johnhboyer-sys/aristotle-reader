"""The breathing questions the vote's fold() throws away before anyone counts.

The measured cases are from 118-281: 15 rows where the lexicon decides against
the spine, of which 11 are the oracle offering a RESPELLING rather than a
breathing. Those 11 are the reason the gate exists — an applier that took
`ϗ̀ -> ἐκ` for a spelling would rewrite Bonitz's ligature, which is his ink.
"""

from __future__ import annotations

from bonitz_pipeline import quiet_disputes as qd


def test_a_breathing_move_is_kept_and_a_respelling_is_not():
    # Real rows from 118-281.
    assert qd.breathing_only('ȣ̓́τως', 'ȣ̔́τως')
    assert qd.breathing_only('Ελληνικήν', 'Ἑλληνικήν')
    # The oracle's evidence spells the ligature out as a LOOKUP KEY; taken for
    # a reading it rewrites the ink.
    assert not qd.breathing_only('ϗ̀', 'ἐκ')
    assert not qd.breathing_only('τȣ́πισθεν', 'τοὔπισθεν')
    assert not qd.breathing_only('τȣ͂', 'τῶ')
    # Not a breathing question at all — υ against ι.
    assert not qd.breathing_only('εὑρημένα', 'εἰρημένα')


def test_an_accent_move_is_refused_even_when_it_looks_right():
    """`Ἐβρος -> Ἕβρος` is probably correct and is still held back.

    The oracle does not reach accents — its own docstring says so — and a gate
    that trusts an authority past its competence is not a gate.
    """
    assert not qd.breathing_only('Ἐβρος', 'Ἕβρος')


def test_an_unchanged_word_is_not_a_question():
    assert not qd.breathing_only('ȣ̔́τως', 'ȣ̔́τως')


def _row(**kw):
    base = {'page': 250, 'col': 'R', 'line': 55, 'flag': False,
            'word': 'ȣ̓́τως', 'opus': 'ȣ̓́', 'ctx': ''}
    base.update(kw)
    return base


def test_a_flagged_row_is_left_alone():
    """It is already on its way to John; asking again would card it twice."""
    kept, refused = qd.scan([_row(flag=True, kraken='ȣ̔́')],
                            lambda r: ('ȣ̔́τως', 'rough'))
    assert not kept and not refused


def test_an_ambiguous_fragment_is_dropped_rather_than_guessed():
    """The fragment appears twice, so the swap could build a word nobody read."""
    assert qd.readings_for(_row(word='ȣ̓́τȣ̓́', opus='ȣ̓́', kraken='ȣ̔́')) is None


def test_readers_agreeing_on_the_breathing_pose_no_question():
    assert qd.readings_for(_row(kraken='ȣ̓́', genie='ȣ̓́')) is None


def test_a_dissenting_breathing_reaches_the_oracle():
    got = qd.readings_for(_row(kraken='ȣ̔́'))
    assert got == {'spine': 'ȣ̓́τως', 'kraken': 'ȣ̔́τως'}


def test_paddle_can_pose_the_question_too():
    """The fifth reader is a voter here as well, or it is blind by omission."""
    assert 'paddle' in qd.VOTERS
    got = qd.readings_for(_row(paddle='ȣ̔́'))
    assert got == {'spine': 'ȣ̓́τως', 'paddle': 'ȣ̔́τως'}


# --- mark conflicts fold() also erases -------------------------------------

def _mrow(**kw):
    base = {'page': 136, 'col': 'R', 'line': 48, 'flag': False,
            'word': 'αὑτȣ̀ς', 'opus': 'ὑτȣ̀', 'ctx': ''}
    base.update(kw)
    return base


def test_a_reader_shedding_marks_is_not_disputing_them():
    """1,444 of 1,500 such rows on 118-281 are llama, which strips diacritics
    wholesale. That is testimony about the reader, not about the word."""
    got, noise = qd.mark_conflicts([_mrow(llama='υτȣ')])
    assert got == []
    assert noise == {'llama': 1}


def test_a_reader_adding_a_mark_the_spine_lacks_is_also_not_a_conflict():
    got, noise = qd.mark_conflicts([_mrow(opus='υτȣ', llama='ὑτȣ̀')])
    assert got == [] and noise == {'llama': 1}


def test_a_different_mark_is_a_conflict():
    """αὑτούς against αὐτούς — reflexive against plain. Real, and the vote
    cannot see it because fold() strips both breathings."""
    got, noise = qd.mark_conflicts([_mrow(llama='ὐτȣ̀')])
    assert noise == {}
    assert len(got) == 1
    assert got[0]['spine'] == 'ὑτȣ̀' and got[0]['reading'] == 'ὐτȣ̀'


def test_a_conflict_the_vote_already_saw_is_not_repeated():
    """Different LETTERS survive the fold, so the panel flagged it itself."""
    got, noise = qd.mark_conflicts([_mrow(llama='xyz')])
    assert got == [] and noise == {}


def test_a_flagged_row_is_left_alone_here_too():
    got, noise = qd.mark_conflicts([_mrow(flag=True, llama='ὐτȣ̀')])
    assert got == [] and noise == {}
