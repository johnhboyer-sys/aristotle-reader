"""Cards written by hand, for a reading no engine proposed.

This is the only source in the queue with no machine behind it, so every
test here is about the two ways that can go wrong: a card that asks about
ink the corpus no longer holds, and a card that quietly stops existing.
"""

from __future__ import annotations

import json

import pytest

from bonitz_pipeline import audit_apply as aa
from bonitz_pipeline import audit_review as review
from bonitz_pipeline import hand_cards

COL = 'page-999-L'
LINE = 'ȣ̓ μόνον πασχει αλλα ϗ̀ ἀντι-'


@pytest.fixture
def hand(tmp_path, monkeypatch):
    """A one-column corpus and an empty hand file, ready to be written."""
    rec = tmp_path / 'reconciled'
    rec.mkdir()
    (rec / f'{COL}.txt').write_text(f'ἀγαθόν Ρα7.\n{LINE}\n', encoding='utf-8')
    monkeypatch.setattr(review, 'RECONCILED', rec)
    path = tmp_path / 'hand-cards.tsv'
    monkeypatch.setattr(hand_cards, 'HAND_TSV', path)
    return path


def write(path, *rows: tuple[str, ...]) -> None:
    head = '\t'.join(hand_cards.HEAD)
    path.write_text(f'# a comment\n\n{head}\n'
                    + ''.join('\t'.join(r) + '\n' for r in rows),
                    encoding='utf-8')


ROW = (f'{COL}:2', 'πασχει', 'πάσχει', 'Opus at 9×', 'a tick over the α')


# --- what a card is -----------------------------------------------------------

def test_the_ground_truth_is_read_from_the_corpus_not_typed(hand):
    """⚠ THE ONE THING THAT IS NEVER AUTHORED. A card shows John two whole
    lines and asks which the ink prints; if the left-hand one were typed by
    hand it could differ from the corpus in a place nobody is asking about,
    and a `keep` would then write that difference in."""
    write(hand, ROW)
    c, = hand_cards.cards()
    assert c.gt == LINE
    assert c.readings['Opus at 9×'] == LINE.replace('πασχει', 'πάσχει')
    assert c.lineno == 2 and c.line_id == ''


def test_the_note_says_no_engine_proposed_this(hand):
    """The card's only evidence is that somebody looked, so it must say so:
    every other card on the queue has an engine standing behind its reading
    and this one does not."""
    write(hand, ROW)
    c, = hand_cards.cards()
    assert 'no engine proposed this' in c.note
    assert 'a tick over the α' in c.note


def test_an_empty_becomes_is_a_deletion(hand):
    write(hand, (f'{COL}:2', ' ϗ̀', '', 'Opus at 9×', 'no ink here'))
    c, = hand_cards.cards()
    assert c.readings['Opus at 9×'] == LINE.replace(' ϗ̀', '')


def test_comments_and_blank_lines_are_not_rows(hand):
    write(hand, ROW)
    assert len(hand_cards.cards()) == 1


def test_a_missing_file_is_no_cards_not_an_error(hand):
    assert hand_cards.cards() == []


# --- two readings of one doubtful mark ----------------------------------------

def test_rows_sharing_a_site_and_token_are_one_card_with_two_buttons(hand):
    """⚠ JOHN'S RULE 3. Where a mark is doubtful — an acute or a breathing,
    the same stroke either way — a card offering one of them forces a `none`
    when the ink says the other, which is the dead end this file exists to
    close. Same question, two answers, one card."""
    write(hand,
          (f'{COL}:2', 'πασχει', 'πάσχει', 'acute', 'a straight tick'),
          (f'{COL}:2', 'πασχει', 'πὰσχει', 'grave', 'or it leans the other way'))
    c, = hand_cards.cards()
    assert set(c.readings) == {'acute', 'grave'}
    assert 'a straight tick · or it leans the other way' in c.note


def test_two_rows_with_one_source_name_are_refused(hand):
    """A button is recorded by its NAME, so a second button called the same
    thing would replace the first in the store — the ruling would answer a
    question that had gone."""
    write(hand,
          (f'{COL}:2', 'πασχει', 'πάσχει', 'Opus at 9×', 'one'),
          (f'{COL}:2', 'πασχει', 'πὰσχει', 'Opus at 9×', 'two'))
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert 'already reads this site' in str(e.value)


# --- refusals, each naming its row --------------------------------------------

def test_a_token_that_is_not_unique_on_the_line_is_refused(hand):
    """⚠ NOT 'REPLACE THE FIRST ONE'. `αλλ` is on this line twice over, and a
    card that silently took one of them would put a crop in front of John
    with no way to tell him which — the `which p am i judging?` failure."""
    write(hand, (f'{COL}:2', 'λ', 'λλ', 'Opus at 9×', 'why'))
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert 'occurrences' in str(e.value) and ':4:' in str(e.value)


def test_a_token_the_line_does_not_hold_is_refused(hand):
    write(hand, (f'{COL}:2', 'νοτηερε', 'x', 'Opus at 9×', 'why'))
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert '0 occurrences' in str(e.value)


def test_a_line_the_column_does_not_have_is_refused(hand):
    write(hand, (f'{COL}:99', 'πασχει', 'πάσχει', 'Opus at 9×', 'why'))
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert 'no printed line 99' in str(e.value)


def test_a_site_that_is_not_column_and_line_is_refused(hand):
    write(hand, (COL, 'πασχει', 'πάσχει', 'Opus at 9×', 'why'))
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert 'printed line' in str(e.value)


@pytest.mark.parametrize('field,i', [('token', 1), ('source', 3), ('why', 4)])
def test_an_empty_field_that_is_not_becomes_is_refused(hand, field, i):
    row = list(ROW)
    row[i] = ''
    write(hand, tuple(row))
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert f'{field} is empty' in str(e.value)


def test_a_row_that_changes_nothing_is_refused(hand):
    write(hand, (f'{COL}:2', 'πασχει', 'πασχει', 'Opus at 9×', 'why'))
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert 'asks nothing' in str(e.value)


def test_a_short_row_is_refused_by_field_count(hand):
    hand.write_text('\t'.join(hand_cards.HEAD) + f'\n{COL}:2\tπασχει\n',
                    encoding='utf-8')
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert '2 tab-separated fields' in str(e.value)


def test_a_wrong_header_is_refused(hand):
    hand.write_text('site\tbecomes\nx\ty\n', encoding='utf-8')
    with pytest.raises(SystemExit) as e:
        hand_cards.cards()
    assert 'header' in str(e.value)


# --- the queue and the apply step ---------------------------------------------

def test_a_hand_card_joins_the_queue(hand, monkeypatch):
    write(hand, ROW)
    for name in ('TRAIN_TSV', 'AGREE_WRONG', 'VS_KRAKEN', 'OOF_TSV',
                 'SIGLUM_TSV', 'DIVISION_TSV', 'ENCODING_TSV', 'RULINGS'):
        monkeypatch.setattr(review, name, hand.parent / f'no-{name}.tsv')
    monkeypatch.setattr(review, '_tsv', lambda *a, **k: [])
    cards = {c.sid: c for c in review.load_cards()}
    assert f'{COL}:L2:hand-πασχει' in cards


def test_a_ruling_on_a_hand_card_reaches_its_line(hand):
    """The apply step treats it as any site addressed by printed line: the
    card's own text is already the corpus's, so what is written is exactly
    the reading John chose."""
    write(hand, ROW)
    c, = hand_cards.cards()
    aa._LINES[COL] = ['ἀγαθόν Ρα7.', LINE]
    try:
        plan = aa.resolve(
            {c.sid: c},
            {c.sid: {'verdict': 'fix', 'detail': c.readings['Opus at 9×']}},
            {})
        assert not plan.refusals
        edit, = plan.edits
        assert edit.line == 2
        assert edit.new == LINE.replace('πασχει', 'πάσχει')
    finally:
        aa._LINES.clear()


def test_a_keep_with_an_erratum_is_how_the_print_is_recorded_as_wrong(hand):
    """⚠ THE DIPLOMATIC CASE, and the reason `αλλα` needed a card at all.
    Both engines agree with the corpus, so nothing disputes the line — but
    the print really is bare in an otherwise accented line, and that belongs
    in the corrigenda register, not in the text."""
    write(hand, ROW)
    c, = hand_cards.cards()
    aa._LINES[COL] = ['ἀγαθόν Ρα7.', LINE]
    try:
        plan = aa.resolve({c.sid: c},
                          {c.sid: {'verdict': 'keep', 'detail': c.gt,
                                   'erratum': True}}, {})
        assert not plan.refusals
        edit, = plan.edits
        assert edit.old == edit.new == LINE and edit.erratum
    finally:
        aa._LINES.clear()


# --- what still owes a card ---------------------------------------------------

def test_the_none_worklist_names_the_site_and_what_was_refused(hand,
                                                               monkeypatch):
    store = hand.parent / 'rulings.json'
    sid = f'{COL}:L2:hand-πασχει'
    store.write_text(json.dumps({sid: {'verdict': 'none', 'detail': ''},
                                 'other': {'verdict': 'keep', 'detail': 'x'}}),
                     encoding='utf-8')
    write(hand, ROW)
    monkeypatch.setattr(review, 'line_cards', dict)
    monkeypatch.setattr(review, 'load_cards', list)
    aa._LINES[COL] = ['ἀγαθόν Ρα7.', LINE]
    try:
        rows = hand_cards.unanswered(store)
    finally:
        aa._LINES.clear()
    assert [r['sid'] for r in rows] == [sid]
    assert rows[0]['site'] == f'{COL}:2'
    assert rows[0]['refused'] == {'Opus at 9×': LINE.replace('πασχει',
                                                             'πάσχει')}


def test_a_none_whose_card_has_gone_is_still_reported(hand, monkeypatch):
    """⚠ IT IS THE ONE MOST EASILY LOST, so it comes back saying it cannot be
    placed rather than being dropped for being awkward."""
    store = hand.parent / 'rulings.json'
    store.write_text(json.dumps({'vanished': {'verdict': 'none'}}),
                     encoding='utf-8')
    monkeypatch.setattr(review, 'line_cards', dict)
    monkeypatch.setattr(review, 'load_cards', list)
    rows = hand_cards.unanswered(store)
    assert rows == [{'sid': 'vanished', 'site': '', 'gt': '', 'refused': {}}]


def test_a_hand_card_supersedes_the_machine_cards_on_its_line(hand,
                                                              monkeypatch):
    """⚠ IT EXISTS BECAUSE THEY COULD NOT PUT THE QUESTION. John, 2026-08-15,
    on a split part of a line he had just answered by hand: "already ruled on
    this one in a separate card." Leaving them is asking him the same line
    twice, and a part can only ever offer half the answer."""
    write(hand, ROW)
    train = hand.parent / 'train.tsv'
    train.write_text(
        'class\tcolumn\tline_id\tline_idx\tedits\tsubs\tgt\tmodel\n'
        f'letter\t{COL}\tl1\t1\t1\tx\t{LINE}\tȣ̓ μόνον πάσχει αλλα ϗ̀ ἀντι-\n',
        encoding='utf-8')
    monkeypatch.setattr(review, 'TRAIN_TSV', train)
    for name in ('AGREE_WRONG', 'VS_KRAKEN', 'OOF_TSV', 'SIGLUM_TSV',
                 'DIVISION_TSV', 'ENCODING_TSV', 'RULINGS'):
        monkeypatch.setattr(review, name, hand.parent / f'no-{name}.tsv')
    real = review._tsv
    monkeypatch.setattr(review, '_tsv', lambda p, optional=False:
                        real(p, optional) if p == train else [])
    cards = {c.sid: c for c in review.load_cards()}
    assert list(cards) == [f'{COL}:L2:hand-πασχει']
    assert review.HAND_SUPERSEDED == 1
