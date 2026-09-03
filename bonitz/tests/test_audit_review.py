"""The audit cards must show the dispute they ask about.

A card whose highlight marks the wrong characters sends John's eye to the
wrong place on the strip, and a queue that loses a source file silently
reviews less than it claims.
"""

from __future__ import annotations

import json

import pytest

from bonitz_pipeline import audit_review, hand_cards
from bonitz_pipeline.audit_review import _mark_diffs, _names, load_cards


def test_the_differing_characters_are_marked_on_both_sides():
    assert _mark_diffs('ἀφῆς', 'ἁφῆς', 'gt') == '<mark>ἀ</mark>φῆς'
    assert _mark_diffs('ἀφῆς', 'ἁφῆς', 'hyp') == '<mark>ἁ</mark>φῆς'


def test_an_insertion_marks_the_inserted_character_on_the_reading():
    assert _mark_diffs('ab', 'axb', 'hyp') == 'a<mark>x</mark>b'
    # ⚠ AND THE SIDE THAT LACKS IT MARKS WHERE IT WOULD GO. This used to show
    # the corpus unmarked, which says the corpus is not in question — when the
    # whole card is about something missing from it.
    assert _mark_diffs('ab', 'axb', 'gt') == 'a<mark>b</mark>'


def test_names_spell_out_what_a_font_hides_per_side():
    """Β and B print identically; each button must name ITS codepoint
    (John, 2026-08-13: 'is corpus a beta or latin?')."""
    assert 'APOSTROPHE' in _names("ἀλλ' ὡς", 'ἀλλ᾽ ὡς', 'gt')
    assert 'KORONIS' in _names("ἀλλ' ὡς", 'ἀλλ᾽ ὡς', 'hyp')
    assert _names('Β15.', 'B15.', 'gt') == 'GREEK CAPITAL LETTER BETA'
    assert _names('Β15.', 'B15.', 'hyp') == 'LATIN CAPITAL LETTER B'


def test_each_button_carries_its_own_codepoint_names(queues, monkeypatch,
                                                     tmp_path):
    monkeypatch.setattr(audit_review, 'PAGE', tmp_path / 'page.html')
    audit_review.build_page(load_cards())
    doc = (tmp_path / 'page.html').read_text(encoding='utf-8')
    # the letter card χ→κ: corpus button names chi, engine button kappa
    assert 'GREEK SMALL LETTER CHI' in doc
    assert 'GREEK SMALL LETTER KAPPA' in doc


def test_a_disputed_space_is_visible_in_the_button():
    assert _mark_diffs('740a22', '740a 22', 'hyp') == \
        '740a<mark>␣</mark>22'


def test_a_disputed_mark_is_never_wrapped_away_from_its_letter():
    """⚠ JOHN, 2026-08-14: "i may have hit none on some cards because it
    looked like it was adding a space but it's just an accent on the letter".

    Wrapping one codepoint at a time put a disputed perispomeni in its own
    inline box, away from the `ȣ` it sits on. A browser cannot compose a
    combining mark across an element boundary, so it drew detached, and
    `mark`'s horizontal padding opened a highlighted gap beside it. It read as
    an inserted SPACE — on the largest card class in the queue, and the
    misreading pushes the answer to `none`, which his rules call a defect in
    the tool rather than an unsure ruling."""
    got = _mark_diffs('τȣ λόγȣ', 'τȣ͂ λόγȣ', 'hyp')
    assert got == 'τ<mark>ȣ͂</mark> λόγȣ'
    assert '<mark>͂</mark>' not in got        # never the mark on its own
    assert '␣' not in got                     # and no phantom space


def test_the_corpus_button_marks_the_letter_the_missing_accent_belongs_to():
    """A mark the corpus lacks has nothing of its own to highlight there. Its
    BASE is what is in question — marking the space after it says the space
    is, which is the same misreading one step along."""
    from bonitz_pipeline.audit_review import _keep_marks
    assert _keep_marks('τȣ λόγȣ', ['τȣ͂ λόγȣ']) == 'τ<mark>ȣ</mark> λόγȣ'


def test_ordinary_spaces_are_not_drawn_as_boxes():
    """`␣` exists so a DISPUTED space can be seen. Spelling every space that
    way turns the line into a ladder nobody can read."""
    assert _mark_diffs('a b c d', 'a b c e', 'hyp') == 'a b c <mark>e</mark>'


@pytest.fixture
def queues(tmp_path, monkeypatch):
    train = tmp_path / 'train.tsv'
    train.write_text(
        'class\tcolumn\tline_id\tline_idx\tedits\tsubs\tgt\tmodel\n'
        'letter\tpage-015-L\tl1\t1\t1\tχ→κ\tἔχειν\tἔκειν\n',
        encoding='utf-8')
    aw = tmp_path / 'aw.tsv'
    aw.write_text('site\tground_truth\tboth_engines\n'
                  'page-055-L:l9\tἀφῆς\tἁφῆς\n', encoding='utf-8')
    vk = tmp_path / 'vk.tsv'
    vk.write_text(
        'site\tright\tground_truth\tthis_engine\tkraken\n'
        'page-055-L:l2\tA\tκαί\tκαί\tκαὶ\n'          # kraken wrong, A right
        'page-055-L:l3\t—\tτȣ͂ ἔτȣς\tτȣ ἔτȣς\tτȣ͂ ἔτυς\n',  # neither right
        encoding='utf-8')
    monkeypatch.setattr(audit_review, 'TRAIN_TSV', train)
    monkeypatch.setattr(audit_review, 'AGREE_WRONG', aw)
    monkeypatch.setattr(audit_review, 'VS_KRAKEN', vk)
    # the sweeps are their own sources; a test of the engine queues must not
    # silently read the real ones off disk
    monkeypatch.setattr(audit_review, 'SIGLUM_TSV', tmp_path / 'no-sig.tsv')
    monkeypatch.setattr(audit_review, 'DIVISION_TSV', tmp_path / 'no-div.tsv')
    monkeypatch.setattr(audit_review, 'ENCODING_TSV', tmp_path / 'no-enc.tsv')
    # and the ruling store: `line_cards` asks it which lines must not be
    # split, and a unit test must not read the live one
    monkeypatch.setattr(audit_review, 'RULINGS', tmp_path / 'no-rulings.json')
    # ⚠ AND CALAMARI'S OUT-OF-FOLD SOURCE. It is 304 live rows; a fixture that
    # does not name it silently reviews the whole real queue, which is how
    # four passing tests started failing the hour that file appeared.
    monkeypatch.setattr(audit_review, 'OOF_TSV', tmp_path / 'no-oof.tsv')
    # ⚠ AND THE HAND-AUTHORED SOURCE, for the same reason. This is the second
    # time a source has been added to `load_cards`; a fixture that does not
    # name every one of them reviews the live queue instead of its own.
    monkeypatch.setattr(hand_cards, 'HAND_TSV', tmp_path / 'no-hand.tsv')


def test_the_three_sources_merge_and_one_engine_right_is_excluded(queues):
    cards = load_cards()
    # page-055-L:l3 disputes two things — calamari drops the perispomeni over
    # the ligature, kraken reads the second ligature as υ — so it arrives as
    # two cards, one question each.
    assert {c.sid for c in cards} == {
        'page-015-L:l1', 'page-055-L:l9',
        'page-055-L:l3#0', 'page-055-L:l3#1'}
    first = next(c for c in cards if c.sid == 'page-055-L:l3#0')
    assert set(first.readings) == {'calamari'}
    assert first.readings['calamari'] == 'τȣ ἔτȣς'
    second = next(c for c in cards if c.sid == 'page-055-L:l3#1')
    assert second.readings['kraken e26'] == 'τȣ͂ ἔτυς'
    # and both still show John the WHOLE line, so he judges in context
    assert first.gt == second.gt == 'τȣ͂ ἔτȣς'


def test_the_letter_class_sorts_first(queues):
    cards = load_cards()
    assert cards[0].cls == 'letter'


def test_a_missing_queue_file_refuses_rather_than_reviewing_less(queues,
                                                                 monkeypatch,
                                                                 tmp_path):
    monkeypatch.setattr(audit_review, 'TRAIN_TSV', tmp_path / 'absent.tsv')
    with pytest.raises(SystemExit):
        load_cards()


# --- the page must be able to save what it shows -------------------------------

def test_every_button_payload_on_the_built_page_parses(queues, monkeypatch,
                                                       tmp_path):
    """⚠ GROK'S CRITICAL FINDING. `data-d` was written UNQUOTED, so the HTML
    parser cut every reading at its first space and JSON.parse threw before
    the fetch — 1352 of 1353 buttons dead, zero rulings ever stored, and the
    tests were green because none of them built the page. This one builds
    the page and parses every payload the way the browser will."""
    import html as html_mod
    import re
    monkeypatch.setattr(audit_review, 'PAGE', tmp_path / 'page.html')
    cards = load_cards()
    audit_review.build_page(cards)
    doc = (tmp_path / 'page.html').read_text(encoding='utf-8')
    buttons = re.findall(r'<button class="opt[^"]*" data-v="\w+" '
                         r'data-d="([^"]*)"', doc)
    # every card: one keep + one fix per engine + one none
    want = sum(1 + len(c.readings) + 1 for c in cards)
    assert len(buttons) == want
    for raw in buttons:
        json.loads(html_mod.unescape(raw))   # what JSON.parse must survive
    # the readings with spaces are the ones the unquoted attribute truncated
    assert any(' ' in json.loads(html_mod.unescape(b)) for b in buttons)


def test_concurrent_rulings_do_not_erase_each_other(tmp_path):
    """Two threads, two cards: unlocked read-modify-write lost the slower
    one. The store must hold both, whatever the interleaving."""
    import threading
    store = tmp_path / 'rulings.json'
    sids = [f'page-015-L:l{i}' for i in range(40)]
    threads = [threading.Thread(target=audit_review.store_ruling,
                                args=(s, 'keep', ''), kwargs={'store': store})
               for s in sids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    have = json.loads(store.read_text(encoding='utf-8'))
    assert sorted(have) == sorted(sids)
    assert not list(tmp_path.glob('*.tmp'))   # atomic swap leaves no debris


def test_an_erratum_flag_rides_with_the_ruling(tmp_path):
    """John, 2026-08-13, on `intcllexit`: print-accurate AND the
    compositor's mistake. The verdict says what the corpus reads; the flag
    sends the site to the corrigenda register at apply."""
    store = tmp_path / 'rulings.json'
    audit_review.store_ruling('page-018-L:l1', 'fix', 'intcllexit',
                              erratum=True, store=store)
    audit_review.store_ruling('page-018-L:l2', 'keep', '', store=store)
    have = json.loads(store.read_text(encoding='utf-8'))
    assert have['page-018-L:l1']['erratum'] is True
    assert have['page-018-L:l2']['erratum'] is False


def test_the_page_carries_the_erratum_toggle_and_redo(queues, monkeypatch,
                                                      tmp_path):
    monkeypatch.setattr(audit_review, 'PAGE', tmp_path / 'page.html')
    audit_review.build_page(load_cards())
    doc = (tmp_path / 'page.html').read_text(encoding='utf-8')
    assert doc.count('class="err"') == 4          # one toggle per card
    assert 'erratum: !!(err &&' in doc            # rides with the POST
    assert 'tap to re-rule' in doc                # ruled cards reopen


# --- the two corpus sweeps as cards -------------------------------------------

@pytest.fixture
def sweeps(queues, tmp_path, monkeypatch):
    rec = tmp_path / 'reconciled'
    rec.mkdir()
    (rec / 'page-021-R.txt').write_text(
        '\n'.join(['x'] * 12 + ['ἀδίκημα μεῖζον τί Pα14. 3. 1359a25.']) + '\n',
        encoding='utf-8')
    (rec / 'page-025-L.txt').write_text(
        '\n'.join(['x'] * 11 + ['Ηγ11. 1116b13. κληρȣ͂ ντȣς ἀθλητάς']) + '\n',
        encoding='utf-8')
    sig = tmp_path / 'sig.tsv'
    sig.write_text('column\tline\ttoken\tproposal\twork\tpage\n'
                   'page-021-R\t13\tPα\tΡα\tΡ\t1359\n', encoding='utf-8')
    div = tmp_path / 'div.tsv'
    div.write_text('source\ttier\tprinted\tproposed\tevidence\n'
                   'page-025-L:12\tonset\tκληρȣ͂ ντȣς\tκληρȣ͂ντȣς\t'
                   'no Greek word begins ντ-\n', encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RECONCILED', rec)
    monkeypatch.setattr(audit_review, 'SIGLUM_TSV', sig)
    monkeypatch.setattr(audit_review, 'DIVISION_TSV', div)


def test_a_sweep_finding_becomes_a_card_proposing_the_whole_line(sweeps):
    cards = {c.sid: c for c in load_cards()}
    sig = cards['page-021-R:L13:Pα']
    assert sig.cls == 'siglum' and sig.lineno == 13
    # what John compares is two WHOLE LINES, not the check's summary of them
    assert sig.gt == 'ἀδίκημα μεῖζον τί Pα14. 3. 1359a25.'
    assert sig.readings['Greek siglum'] == \
        'ἀδίκημα μεῖζον τί Ρα14. 3. 1359a25.'
    div = cards['page-025-L:L12:onset']
    assert div.cls == 'division'
    assert div.readings['re-divided'].endswith('κληρȣ͂ντȣς ἀθλητάς')


def test_an_encoding_split_is_one_class_card_with_no_status_quo(queues,
                                                                tmp_path,
                                                                monkeypatch):
    """No `keep the corpus` button: both spellings are already in the corpus,
    so there is no status quo to keep. The weak tier is not a queue at all —
    a lone `I` may be a Roman numeral or a Greek iota and both are right."""
    rec = tmp_path / 'rec'
    rec.mkdir()
    (rec / 'page-030-R.txt').write_text('foo AZι I 93\n', encoding='utf-8')
    (rec / 'page-044-R.txt').write_text('bar AΖι I 77\n', encoding='utf-8')
    enc = tmp_path / 'enc.tsv'
    enc.write_text(
        'shape\ttier\tspelling\tcount\tcodepoints\tsites\tsigla\n'
        'ΑΖι\tsplit\tAZι\t23\tLATIN CAPITAL LETTER Z\t\t\n'
        'ΑΖι\tsplit\tAΖι\t3\tGREEK CAPITAL LETTER ZETA\tpage-030-R:57\tΖι = ἱστορίαι\n'
        'Κ\tweak\tK\t35\tLATIN CAPITAL LETTER K\t\t\n'
        'Κ\tweak\tΚ\t31\tGREEK CAPITAL LETTER KAPPA\tpage-020-L:3\t\n',
        encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RECONCILED', rec)
    monkeypatch.setattr(audit_review, 'ENCODING_TSV', enc)
    cards = {c.sid: c for c in load_cards()}
    assert 'encoding:K-Κ' not in cards        # the weak tier is not a queue
    c = cards['encoding:Z-Ζ']
    verdicts = [v for v, *_ in c.options]
    assert verdicts.count('keep') == 1        # only "both stand"
    # the majority must not read as the verdict
    assert 'count does NOT decide' in c.note


def test_sections_file_a_card_by_the_judgement_it_wants():
    from bonitz_pipeline.audit_review import section_of
    assert section_of([('e', 'c')]) == 'Latin ↔ Latin'
    assert section_of([('Ζ', 'Z')]) == 'Latin ↔ Greek'
    assert section_of([('χ', 'κ')]) == 'Greek ↔ Greek'
    assert section_of([('ἀ', 'ἁ')]) == 'marks'   # a SWAP: neither added nor lost
    assert section_of([('α', 'ἁ')]) == 'marks the corpus lacks'
    assert section_of([('ἁ', 'α')]) == 'marks the engine dropped'
    assert section_of([('͂', '∅')]) == 'marks the engine dropped'
    assert section_of([('3', '9')]) == 'digits'
    assert section_of([('.', ',')]) == 'punctuation'
    assert section_of([(' ', '∅')]) == 'spacing'


def test_the_most_significant_dispute_names_the_section():
    """⚠ NOT `mixed` merely for holding two kinds — that put 143 of 442 in
    the catch-all, which is a shrug rather than a section. A line disputing
    a letter AND a space is a letter question."""
    from bonitz_pipeline.audit_review import section_of
    assert section_of([('χ', 'κ'), (' ', '∅')]) == 'Greek ↔ Greek'
    assert section_of([('͂', '∅'), (' ', '∅')]) == 'marks the engine dropped'


def test_a_homoglyph_only_card_is_folded_away_and_counted(tmp_path,
                                                          monkeypatch):
    """The engines read identical ink, so which codepoint they emit is a
    training artifact, not a reading — page-042-R:44 had calamari saying
    Greek Α + Latin Z and kraken Latin A + Latin Z on one token. Such a
    card asks John to judge from ink that cannot answer, and the glyph-pair
    card decides the whole class anyway. Folded away, and COUNTED."""
    train = tmp_path / 'train.tsv'
    train.write_text(
        'class\tcolumn\tline_id\tline_idx\tedits\tsubs\tgt\tmodel\n'
        'letter\tpage-030-R\tl1\t1\t1\tΖ→Z\tfoo AΖι bar\tfoo AZι bar\n'
        'letter\tpage-030-R\tl2\t2\t1\tχ→κ\tἔχειν\tἔκειν\n',
        encoding='utf-8')
    aw = tmp_path / 'aw.tsv'
    aw.write_text('site\tground_truth\tboth_engines\n', encoding='utf-8')
    vk = tmp_path / 'vk.tsv'
    vk.write_text('site\tright\tground_truth\tthis_engine\tkraken\n',
                  encoding='utf-8')
    for name, p in (('TRAIN_TSV', train), ('AGREE_WRONG', aw),
                    ('VS_KRAKEN', vk)):
        monkeypatch.setattr(audit_review, name, p)
    # ⚠ EVERY SOURCE, NOT THE ONES THAT EXISTED WHEN THIS WAS WRITTEN. A
    # fixture that names four of five reviews the live queue for the fifth.
    for name in ('SIGLUM_TSV', 'DIVISION_TSV', 'ENCODING_TSV', 'OOF_TSV',
                 'RULINGS'):
        monkeypatch.setattr(audit_review, name, tmp_path / f'no-{name}.tsv')
    # and the hand-authored source, which lives in its own module — this
    # fixture named five of six the day that file appeared, and read three
    # live cards for the sixth
    monkeypatch.setattr(hand_cards, 'HAND_TSV', tmp_path / 'no-hand.tsv')
    cards = load_cards()
    assert [c.line_id for c in cards] == ['l2']       # the χ→κ one survives
    assert audit_review.HOMOGLYPH_SKIPPED == 1


def test_a_pair_card_binds_every_site_of_the_glyph_and_each_has_its_x(
        queues, tmp_path, monkeypatch):
    """John, 2026-08-13: bundle every call on one pair into one card with a
    strip of crops and an ✕ per crop. The ✕ is what makes a group ruling
    safe — the ligature sitting's lesson."""
    rec = tmp_path / 'rec'
    rec.mkdir()
    (rec / 'page-030-R.txt').write_text('x\nfoo AZι I 93 bar\n',
                                        encoding='utf-8')
    (rec / 'page-044-R.txt').write_text('baz AΖι I 77 qux\n', encoding='utf-8')
    enc = tmp_path / 'enc.tsv'
    enc.write_text(
        'shape\ttier\tspelling\tcount\tcodepoints\tsites\tsigla\n'
        'ΑΖι\tsplit\tAZι\t1\tLATIN CAPITAL LETTER Z\t\t\n'
        'ΑΖι\tsplit\tAΖι\t1\tGREEK CAPITAL LETTER ZETA\tpage-044-R:1\t\n',
        encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RECONCILED', rec)
    monkeypatch.setattr(audit_review, 'ENCODING_TSV', enc)
    c = {x.sid: x for x in load_cards()}['encoding:Z-Ζ']
    assert [(m.column, m.lineno, m.token) for m in c.members] == [
        ('page-030-R', 2, 'AZι'), ('page-044-R', 1, 'AΖι')]
    assert [lab for _, lab, *_ in c.options] == ['Greek Ζ', 'Latin Z',
                                                 'both stand']
    # the consequence counts the sites that CHANGE, not the sites that match
    assert '1 of 2 change' in c.options[0][4]


def test_a_siglum_inside_a_word_is_not_bound_by_the_pair_ruling(
        queues, tmp_path, monkeypatch):
    """⚠ `οβ` is the Oeconomica siglum AND two letters inside φόβος. A
    substring scan bound 65 ordinary Greek words into the o/ο ruling; the
    members must be letter-runs, the way the sweep counted them."""
    rec = tmp_path / 'rec'
    rec.mkdir()
    (rec / 'page-030-L.txt').write_text('φόβος καὶ οβ1351 b19\n',
                                        encoding='utf-8')
    (rec / 'page-031-L.txt').write_text('oβ 42 al\n', encoding='utf-8')
    enc = tmp_path / 'enc.tsv'
    enc.write_text(
        'shape\ttier\tspelling\tcount\tcodepoints\tsites\tsigla\n'
        'οβ\tsplit\tοβ\t1\tGREEK SMALL LETTER OMICRON\t\t\n'
        'οβ\tsplit\toβ\t1\tLATIN SMALL LETTER O\tpage-031-L:1\t\n',
        encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RECONCILED', rec)
    monkeypatch.setattr(audit_review, 'ENCODING_TSV', enc)
    c = {x.sid: x for x in load_cards()}['encoding:o-ο']
    assert len(c.members) == 2                      # not three
    assert all('φόβος' not in m.token for m in c.members)


def test_no_handler_dereferences_a_toggle_a_card_may_not_have(queues,
                                                              tmp_path,
                                                              monkeypatch):
    """⚠ THE CARD WITHOUT THE TOGGLE. Dropping the erratum box from encoding
    cards left both handlers reading `.classList` off a div that is not
    there, so every button on those cards threw before the fetch and John
    got a dead page — the same silent shape as the unquoted data-d. A
    `.err` lookup must never be dereferenced unguarded."""
    import re
    rec = tmp_path / 'rec'
    rec.mkdir()
    (rec / 'page-030-R.txt').write_text('foo AZι I 93\n', encoding='utf-8')
    (rec / 'page-044-R.txt').write_text('bar AΖι I 77\n', encoding='utf-8')
    enc = tmp_path / 'enc.tsv'
    enc.write_text(
        'shape\ttier\tspelling\tcount\tcodepoints\tsites\tsigla\n'
        'ΑΖι\tsplit\tAZι\t1\tLATIN CAPITAL LETTER Z\t\t\n'
        'ΑΖι\tsplit\tAΖι\t1\tGREEK CAPITAL LETTER ZETA\tpage-044-R:1\t\n',
        encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RECONCILED', rec)
    monkeypatch.setattr(audit_review, 'ENCODING_TSV', enc)
    monkeypatch.setattr(audit_review, 'PAGE', tmp_path / 'page.html')
    cards = load_cards()
    audit_review.build_page(cards)
    doc = (tmp_path / 'page.html').read_text(encoding='utf-8')
    # a card that HAS no toggle is in this page, so an unguarded lookup
    # would be a live crash
    assert any(c.cls == 'encoding' for c in cards)
    assert "querySelector('.err').classList" not in doc


def test_an_exclude_is_recorded_and_a_verdict_does_not_drop_it(tmp_path):
    store = tmp_path / 'r.json'
    audit_review.record_exclude('encoding:Z-Ζ', 'page-030-R:L2:AZι', True,
                                store=store)
    audit_review.store_ruling('encoding:Z-Ζ', 'fix', 'Ζ', store=store)
    have = json.loads(store.read_text(encoding='utf-8'))
    assert have['encoding:Z-Ζ']['excluded'] == ['page-030-R:L2:AZι']
    assert have['encoding:Z-Ζ']['verdict'] == 'fix'
    audit_review.record_exclude('encoding:Z-Ζ', 'page-030-R:L2:AZι', False,
                                store=store)
    have = json.loads(store.read_text(encoding='utf-8'))
    assert have['encoding:Z-Ζ']['excluded'] == []


def test_an_encoding_card_says_the_ink_cannot_answer_and_drops_the_erratum(
        queues, tmp_path, monkeypatch):
    """John, 2026-08-13: 'i can't tell by looking at the ink between A and Α'.
    He is right — page-018-L:21 prints a Greek Β and a Latin B in one line
    from the same sort. A card inviting him to judge the letterform is a
    defect, and a printer's-error flag is meaningless where the printer set
    the right sort and only the codepoint is in question."""
    enc = tmp_path / 'enc.tsv'
    enc.write_text(
        'shape\ttier\tspelling\tcount\tcodepoints\tsites\tsigla\n'
        'ΑΖι\tsplit\tAZι\t23\tLATIN CAPITAL LETTER Z\t\t\n'
        'ΑΖι\tsplit\tAΖι\t3\tGREEK CAPITAL LETTER ZETA\tpage-030-R:57\t\n',
        encoding='utf-8')
    monkeypatch.setattr(audit_review, 'ENCODING_TSV', enc)
    monkeypatch.setattr(audit_review, 'PAGE', tmp_path / 'page.html')
    cards = load_cards()
    audit_review.build_page(cards)
    doc = (tmp_path / 'page.html').read_text(encoding='utf-8')
    assert 'the ink cannot answer this' in doc
    assert 'a fold, not a spelling' in doc
    # one erratum toggle per NON-encoding card, and none on the encoding one
    assert doc.count('class="err"') == len(
        [c for c in cards if c.cls != 'encoding'])


def test_an_onset_card_offers_both_ways_to_mend_the_division(sweeps):
    """An impossible onset says the division is wrong, not where it belongs.
    The sweep proposed joining; the ink read `κληρȣ͂ν τȣ̀ς`. Offering only one
    forces a NONE, which John's rules call a defect in the tool."""
    div = {c.sid: c for c in load_cards()}['page-025-L:L12:onset']
    assert set(div.readings) == {'re-divided', 'space moved right'}
    assert div.readings['space moved right'].endswith('κληρȣ͂ν τȣς ἀθλητάς')


def test_cards_are_grouped_by_section_then_tier(sweeps):
    """Sections now drive the order — the siglum card is a Latin/Greek
    question and the division card a spacing one, so they no longer sit
    together."""
    from bonitz_pipeline.audit_review import SECTIONS
    cards = load_cards()
    order = [n for n, _ in SECTIONS]
    seen = [order.index(c.section) for c in cards]
    assert seen == sorted(seen)                # sections never interleave
    sig = next(c for c in cards if c.cls == 'siglum')
    div = next(c for c in cards if c.cls == 'division')
    assert sig.section == 'Latin ↔ Greek'
    assert div.section == 'spacing'


def test_a_sweep_that_has_never_run_contributes_nothing_and_does_not_raise(
        queues, tmp_path, monkeypatch):
    monkeypatch.setattr(audit_review, 'SIGLUM_TSV', tmp_path / 'absent.tsv')
    monkeypatch.setattr(audit_review, 'DIVISION_TSV', tmp_path / 'gone.tsv')
    assert all(c.cls not in ('siglum', 'division') for c in load_cards())


def test_a_sweep_that_has_drifted_from_the_corpus_refuses(sweeps, tmp_path,
                                                          monkeypatch):
    """The finding names text the corpus no longer holds — the sweep was run
    before an edit. Proposing a substitution that cannot be made would put a
    line in front of John that exists nowhere."""
    div = tmp_path / 'stale.tsv'
    div.write_text('source\ttier\tprinted\tproposed\tevidence\n'
                   'page-025-L:12\tonset\tοὐκ ἔστιν\tοὐκἔστιν\tstale\n',
                   encoding='utf-8')
    monkeypatch.setattr(audit_review, 'DIVISION_TSV', div)
    with pytest.raises(SystemExit):
        load_cards()


def test_keep_highlight_covers_every_engines_dispute():
    """On a two-engine card the corpus button must mark BOTH disputes, not
    just the first engine's."""
    from bonitz_pipeline.audit_review import _keep_marks
    out = _keep_marks('τȣ͂ ἔτȣς', ['τȣ ἔτȣς', 'τȣ͂ ἔτυς'])
    assert out.count('<mark>') == 2
    # ⚠ THE MARK TRAVELS WITH ITS BASE. `<mark>͂</mark>` — the perispomeni
    # alone, which this once asserted — is the defect: a browser cannot
    # compose a combining mark across an element boundary, so it drew
    # detached and read as an inserted space.
    assert out == 'τ<mark>ȣ͂</mark> ἔτ<mark>ȣ</mark>ς'
    assert '<mark>͂</mark>' not in out


# --- bundling: the floor, and what it must never swallow ---------------------

def _row(col: str, lid: str, gt: str, model: str,
         cls: str = 'mark') -> audit_review.Card:
    return audit_review.Card(f'{col}:{lid}', col, lid, cls, gt,
                             {'kraken e26': model}, where=f'{col} line 1')


def test_a_pair_of_lines_is_already_worth_a_bundle():
    """John, 2026-08-14: the bundles "are REAL time savers". A floor of 8
    left 173 cards where a floor of 2 leaves 111."""
    rows = [_row('page-900-L', '_a', 'τȣ λόγȣ', 'τȣ͂ λόγȣ'),
            _row('page-900-L', '_b', 'ἀγνοȣντες', 'ἀγνοȣ͂ντες')]
    cards, taken = audit_review._pattern_cards(rows, ruled=set())
    assert list(cards) == ['pattern:∅-͂']
    assert len(cards['pattern:∅-͂'].members) == 2
    assert taken == {'page-900-L:_a', 'page-900-L:_b'}


def test_a_bundle_never_swallows_a_line_already_ruled():
    """⚠ THE 78 DISSOLVED CARDS OF 2026-08-10. Lowering the floor swept 37
    ruled lines into fresh groups; each would have been asked again under a
    new sid, and his ruling would have been left pointing at a card that no
    longer existed. A ruled line keeps its own card."""
    rows = [_row('page-900-L', '_a', 'τȣ λόγȣ', 'τȣ͂ λόγȣ'),
            _row('page-900-L', '_b', 'ἀγνοȣντες', 'ἀγνοȣ͂ντες'),
            _row('page-900-L', '_c', 'ἡντινȣν', 'ἡντινȣ͂ν')]
    cards, taken = audit_review._pattern_cards(rows, ruled={'page-900-L:_b'})
    assert 'page-900-L:_b' not in taken
    assert [m.sid for m in cards['pattern:∅-͂'].members] == \
        ['page-900-L:_a', 'page-900-L:_c']


def test_a_ruled_line_that_leaves_a_lone_survivor_bundles_nothing():
    """Two lines, one ruled: the survivor is a card of its own, not a bundle
    of one."""
    rows = [_row('page-900-L', '_a', 'τȣ λόγȣ', 'τȣ͂ λόγȣ'),
            _row('page-900-L', '_b', 'ἀγνοȣντες', 'ἀγνοȣ͂ντες')]
    cards, taken = audit_review._pattern_cards(rows, ruled={'page-900-L:_b'})
    assert cards == {} and taken == set()


def test_a_small_bundle_gets_a_wider_window_than_a_large_one():
    """⚠ BUNDLING COSTS CONTEXT. A single card shows the whole printed line;
    a class member shows a window, because 36 full lines are fifteen swipes.
    A pair has no such problem and gets more than twice the window — an
    unsure click is a defect in the tool, and a crop that cannot make the
    case is that defect."""
    pair = [_row('page-900-L', f'_{i}', 'τȣ λόγȣ', 'τȣ͂ λόγȣ') for i in 'ab']
    many = [_row('page-900-L', f'_{i}', 'τȣ λόγȣ', 'τȣ͂ λόγȣ')
            for i in 'abcdefghij']
    small, _ = audit_review._pattern_cards(pair, ruled=set())
    large, _ = audit_review._pattern_cards(many, ruled=set())
    assert {m.half for m in small['pattern:∅-͂'].members} == {340}
    assert {m.half for m in large['pattern:∅-͂'].members} == {150}


# --- splitting a line into one card per dispute -------------------------------

def test_ops_and_apply_ops_are_inverses():
    """The definition of "one dispute" that the queue and the apply step must
    share — they drifted apart once already."""
    gt, hyp = 'τȣ͂ ἔτȣς', 'τȣ ἔτυς'
    o = audit_review.ops(gt, hyp)
    assert audit_review.apply_ops(gt, o) == hyp
    assert audit_review.apply_ops(gt, {}) == gt


def test_an_insertion_and_a_substitution_in_one_place_are_one_dispute():
    """⚠ NOT TWO CARDS. `∅`→`ν` immediately before `α`→`ω` is a single mend
    the ink cannot be asked about in halves, so `ops` folds them and the
    split follows."""
    assert audit_review.ops('τα', 'τνω') == {1: 'νω'}


def test_a_line_that_disputes_two_things_becomes_two_cards():
    """John, 2026-08-14. 26 of his 32 per-line `none` verdicts were on lines
    with more than one dispute: he was rejecting a whole line because neither
    reading was right about all of it."""
    c = audit_review.Card('page-900-L:_a', 'page-900-L', '_a', 'mark',
                          'τȣ͂ ἔτȣς', {'kraken e26': 'τȣ ἔτυς'})
    parts = audit_review.split_card(c)
    assert [p.sid for p in parts] == ['page-900-L:_a#0', 'page-900-L:_a#1']
    assert [p.readings['kraken e26'] for p in parts] == ['τȣ ἔτȣς', 'τȣ͂ ἔτυς']
    # each still shows the WHOLE line — one question, full context
    assert all(p.gt == 'τȣ͂ ἔτȣς' for p in parts)
    # and each carries every dispute on the line, so the apply step can find
    # it again once a sibling has moved it
    assert all(p.line_ops == parts[0].line_ops for p in parts)
    # ⚠ THE DISPUTE SITS ON THE LETTER, NOT ON ITS ACCENT'S CODEPOINT. Index 1
    # is the `ȣ͂` cluster; the perispomeni that calamari drops belongs to it.
    # Cut per codepoint this was index 2 — the mark alone — and a part could
    # then propose removing a base letter while keeping its accent.
    assert sorted(parts[0].line_ops) == [1, 6]


def test_a_line_that_disputes_one_thing_is_left_alone():
    c = audit_review.Card('page-900-L:_a', 'page-900-L', '_a', 'mark',
                          'ἔχειν', {'kraken e26': 'ἔκειν'})
    assert audit_review.split_card(c) == [c]


def test_engines_that_read_one_place_the_same_way_share_one_button():
    """Two buttons reading identically is a choice that is not a choice."""
    c = audit_review.Card('page-900-L:_a', 'page-900-L', '_a', 'mark',
                          'τȣ ἔτȣς',
                          {'calamari': 'τȣ͂ ἔτυς', 'kraken e26': 'τȣ͂ ἔτȣς'})
    first, second = audit_review.split_card(c)
    assert list(first.readings) == ['calamari + kraken e26']
    assert list(second.readings) == ['calamari']


def test_a_part_that_is_a_homoglyph_alone_is_dropped_and_counted():
    """⚠ THE INK CANNOT SETTLE A HOMOGLYPH, so the card must not ask. A line
    holding one real dispute and one `A`/`Α` survives the whole-line filter;
    split, its second part would ask John to judge from ink that cannot
    answer. The glyph-pair cards decide that class — and the count is on the
    page, because a queue that shows less than it found without saying so is
    this project's oldest bug."""
    audit_review.SPLIT_HOMOGLYPH = 0
    c = audit_review.Card('page-900-L:_a', 'page-900-L', '_a', 'letter',
                          'ἔχειν Aα3.', {'kraken e26': 'ἔκειν Αα3.'})
    parts = audit_review.split_card(c)
    assert [p.sid for p in parts] == ['page-900-L:_a#0']
    assert audit_review.SPLIT_HOMOGLYPH == 1


def test_split_parts_bundle_where_their_whole_lines_could_not():
    """The payoff John predicted: two lines that dispute two things each
    share ONE of them, so as whole lines they group with nothing and as parts
    they are a pair."""
    whole = [audit_review.Card(f'page-900-L:_{i}', 'page-900-L', f'_{i}',
                               'mark', gt, {'kraken e26': model})
             for i, (gt, model) in enumerate([('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί'),
                                              ('τȣ βίȣ ὁρα', 'τȣ͂ βίȣ ὅρα')])]
    none, _ = audit_review._pattern_cards(whole, ruled=set())
    assert none == {}
    parts = [p for c in whole for p in audit_review.split_card(c)]
    cards, taken = audit_review._pattern_cards(parts, ruled=set())
    assert list(cards) == ['pattern:∅-͂']
    assert taken == {'page-900-L:_0#0', 'page-900-L:_1#0'}


def test_a_bundled_member_remembers_which_part_it_is():
    """Two parts of one line are two crops in a strip, and a member that
    forgot which dispute it stood for would place both windows identically."""
    c = audit_review.Card('page-900-L:_a', 'page-900-L', '_a', 'mark',
                          'τȣ λόγȣ τȣ βίȣ', {'kraken e26': 'τȣ͂ λόγȣ τȣ͂ βίȣ'})
    cards, _ = audit_review._pattern_cards(audit_review.split_card(c),
                                           ruled=set())
    assert [m.part for m in cards['pattern:∅-͂'].members] == [0, 1]
    assert len({m.frac for m in cards['pattern:∅-͂'].members}) == 2


def test_a_line_already_ruled_whole_is_never_split(queues, monkeypatch,
                                                   tmp_path):
    """⚠ HIS ANSWER COVERED EVERY DISPUTE ON IT. Re-asking them one at a time
    under new sids is [[carry-rulings-by-site]] with extra steps."""
    store = tmp_path / 'ruled.json'
    store.write_text(json.dumps({'page-055-L:l3': {'verdict': 'keep',
                                                   'detail': 'τȣ͂ ἔτȣς'}}),
                     encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RULINGS', store)
    have = audit_review.line_cards()
    assert 'page-055-L:l3' in have
    assert not [sid for sid in have if sid.startswith('page-055-L:l3#')]


def test_a_card_whose_engines_disagree_with_each_other_never_bundles():
    """⚠ A BUNDLE OFFERS TWO BUTTONS: the corpus, or the reading. A card where
    the two engines read one place two different ways is a three-way choice,
    and folding it into a pair card would bind it to a reading John was never
    shown for it."""
    two = [audit_review.Card(f'page-900-L:_{i}', 'page-900-L', f'_{i}', 'mark',
                             'τȣ λόγȣ',
                             {'calamari': 'τυ λόγȣ', 'kraken e26': 'τβ λόγȣ'})
           for i in 'ab']
    cards, taken = audit_review._pattern_cards(two, ruled=set())
    assert cards == {} and taken == set()


# --- calamari's out-of-fold read joins the queue ------------------------------

def test_a_bundle_whose_disputed_character_is_a_hyphen_still_files(queues):
    """⚠ THE SID IS FOR ADDRESSING; THE FACT TRAVELS IN THE CARD. A bundle is
    keyed `pattern:<a>-<b>`, so when `a` is itself a HYPHEN — the corpus
    printing a dash where an engine reads none — splitting the key on '-'
    hands back a two-character 'character', and `_section_for` died on it the
    first time calamari's out-of-fold read put such a card in the queue."""
    rows = [audit_review.Card(f'page-900-L:_{i}', 'page-900-L', f'_{i}',
                              'punct', 'ἀνα- τροφὴν', {'kraken e26': 'ἀνα τροφὴν'})
            for i in 'ab']
    cards, _ = audit_review._pattern_cards(rows, ruled=set())
    card = next(iter(cards.values()))
    assert card.sig == ('-', '∅')
    assert audit_review._section_for(card) == 'punctuation'


def test_calamari_joins_krakens_card_rather_than_opening_a_second(
        queues, monkeypatch, tmp_path):
    """One line, one card, however many engines raised it. A second card
    about the same ink asks John the same question twice and splits his
    ruling across two sids."""
    oof = tmp_path / 'oof.tsv'
    oof.write_text(
        'site\ttier\tground_truth\toof\tkraken\tvote\n'
        'page-015-L:l1\tboth\tἔχειν\tἔκεῖν\tἔκειν\t\n', encoding='utf-8')
    monkeypatch.setattr(audit_review, 'OOF_TSV', oof)
    have = audit_review.line_cards()
    # one card, split into its two disputes — not two cards about one line
    assert sorted(s for s in have if s.startswith('page-015-L:l1')) == \
        ['page-015-L:l1#0', 'page-015-L:l1#1']
    # at the first dispute both engines read κ, so they share ONE button:
    # two buttons reading identically is a choice that is not a choice
    assert list(have['page-015-L:l1#0'].readings) == \
        ['kraken e26 + calamari (out-of-fold)']
    # at the second, only calamari has anything to say
    assert list(have['page-015-L:l1#1'].readings) == ['calamari (out-of-fold)']


def test_the_vote_tier_says_why_it_is_sharp(queues, monkeypatch, tmp_path):
    """A vote that refuses a line it was TRAINED on is the strongest signal
    this project has, and the card must say so — John cannot weigh it from
    the reading alone."""
    oof = tmp_path / 'oof.tsv'
    oof.write_text(
        'site\ttier\tground_truth\toof\tkraken\tvote\n'
        'page-900-R:z9\tvote\tσ9. 973a12.\t\t\tσ. 973a12.\n', encoding='utf-8')
    monkeypatch.setattr(audit_review, 'OOF_TSV', oof)
    card = audit_review.line_cards()['page-900-R:z9']
    assert 'TRAINED ON IT' in card.note
    assert card.readings == {'calamari (5-model vote)': 'σ. 973a12.'}


def test_a_bundled_site_says_WHICH_character_is_in_question():
    """⚠ JOHN, 2026-08-14, ON A `p`/NOTHING BUNDLE: "which p am i judging?"

    The crop window is centred by CHARACTER INDEX along a justified line,
    which is an approximation — the offset lesson of 2026-08-10 — and a line
    reading `parorum species, fort p` holds three of them. The ink cannot say
    which; the corpus string can, exactly. An unsure click is a defect in the
    tool, and a crop that cannot make the case is that defect.
    """
    assert audit_review._context('616a5 (serin C, parorum species', 16) == \
        ('616a5 (serin C, ', 'p', 'arorum species')
    # windowed, and the ellipsis says so rather than pretending it is the line
    b, at, a = audit_review._context('x' * 40 + 'p' + 'y' * 40, 40)
    assert b.startswith('…') and a.endswith('…') and at == 'p'
    # a dispute at the very start has nothing before it and claims nothing
    assert audit_review._context('pater', 0) == ('', 'p', 'ater')
    assert audit_review._context('', 0) == ('', '', '')


def test_the_marked_character_reaches_the_page(queues, monkeypatch, tmp_path):
    rows = [audit_review.Card(f'page-900-L:_{i}', 'page-900-L', f'_{i}',
                              'letter', 'serin C, parorum species',
                              {'kraken e26': 'serin C, arorum species'})
            for i in 'ab']
    cards, _ = audit_review._pattern_cards(rows, ruled=set())
    card = next(iter(cards.values()))
    assert card.members[0].context == ('serin C, ', 'p', 'arorum species')
    monkeypatch.setattr(audit_review, 'PAGE', tmp_path / 'page.html')
    audit_review.build_page([card])
    doc = (tmp_path / 'page.html').read_text(encoding='utf-8')
    assert '<div class="ctx">serin C, <mark>p</mark>arorum species</div>' in doc
    assert 'the marked character is the one in question' in doc


def test_a_card_and_a_member_at_one_site_never_share_a_crop_file():
    """⚠ THE SAME LINE IS CROPPED TWO WAYS, AND ONE FILE CANNOT HOLD BOTH.
    A card shows the whole printed line; bundled into a class card, that same
    line shows a WINDOW on its dispute. Both wrote `<site>.png`, and cut_crop
    returns early when the file exists — so page-056-R kept a 600x236 window
    cut on 2026-08-13, and the card that wanted the full line the next day
    served it silently. John was shown the line ABOVE the one in question,
    which is worse than no crop: evidence pointing at the wrong ink."""
    sid = 'page-056-R:_83ec5b13'
    card = audit_review.Card(sid, 'page-056-R', '_83ec5b13', 'letter', 'x', {})
    member = audit_review.Member(sid, 'page-056-R', 0, '', 'l',
                                 line_id='_83ec5b13', frac=0.5)
    assert card.crop_name != member.crop_name
    assert card.crop_name.endswith('-line.png')
    assert member.crop_name.endswith('-w150.png')
    # and a wider window is a different file, so widening recuts
    member.half = 340
    assert member.crop_name.endswith('-w340.png')
    # a sweep card is found by text, not by polygon — also its own cut
    sweep = audit_review.Card(sid, 'page-056-R', '', 'siglum', 'x', {},
                              lineno=12)
    assert sweep.crop_name.endswith('-text.png')


def test_an_entry_without_a_verdict_is_not_a_ruled_card(tmp_path,
                                                        monkeypatch):
    """⚠ AN ENTRY IS NOT A VERDICT. A card with only an ✕ recorded, or one
    REOPENED after a defect in how it was drawn, has an entry and no answer.
    Counting those as ruled keeps them out of the bundling and keeps their
    line unsplit — which is to say it hides the question John has not
    answered yet."""
    store = tmp_path / 'r.json'
    store.write_text(json.dumps({
        'a': {'verdict': 'keep', 'detail': 'x'},
        'b': {'verdict': '', 'excluded': ['s1']},
        'c': {'verdict': '', 'was': 'none', 'reopened': 'the accent drew '
              'detached from its letter and read as a space'},
    }), encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RULINGS', store)
    assert audit_review._ruled_sids() == {'a'}


def test_a_letter_is_never_split_from_its_own_accents():
    """⚠ JOHN, 2026-08-14, ON A `ȣ`/NOTHING BUNDLE: "am i ruling on the
    ligatures (with their diacriticals) vs nothing? or bare ligature vs
    nothing?"

    Neither, as it stood. `ops` cut per CODEPOINT, so deleting `ȣ́` became two
    disputes — drop the ligature, drop the acute — and ruling the first alone
    would have written `ζ́σης`, the accent orphaned onto the zeta, and
    `(̓ γίνεται`, a breathing stranded on a parenthesis. The card was offering
    a reading no ink could have.
    """
    gt = 'ζȣ́σης (ȣ̓ γ'
    assert audit_review.ops(gt, 'ζσης (ȣ̓ γ') == {1: ''}       # ONE dispute
    assert audit_review.apply_ops(gt, {1: ''}) == 'ζσης (ȣ̓ γ'
    # and a mark against no mark is still its own question — the cluster
    # differs by the accent alone
    assert audit_review.ops('τȣ λόγȣ', 'τȣ͂ λόγȣ') == {1: 'ȣ͂'}
    assert audit_review.ops('τȣ͂ λόγȣ', 'τȣ λόγȣ') == {1: 'ȣ'}


def test_an_added_mark_asks_about_the_letter_not_the_space_after_it():
    """The alignment offers a combining mark as an insertion, and folding it
    into the FOLLOWING character made `τȣ λόγȣ` a question about the SPACE."""
    assert 1 in audit_review.ops('τȣ λόγȣ', 'τȣ͂ λόγȣ')
    assert 2 not in audit_review.ops('τȣ λόγȣ', 'τȣ͂ λόγȣ')


# --- seeing more than the strip can show --------------------------------------

def test_the_zoom_shows_the_lines_above_and_below():
    """⚠ A WINDOW CANNOT SETTLE WHAT A WINDOW RAISED. John asked three times in
    one sitting to see more — "crop is off", "can you look more closely",
    "need more context below" — and each time it was a hand-cut crop from a
    shell. The neighbouring lines are in frame on purpose: half the doubtful
    marks on a page turn out to be a descender or a bleed from the line above,
    and a band showing only the line itself cannot rule that out."""
    import io
    from PIL import Image
    col = 'page-061-R'
    if not (audit_review.WORK / 'cols' / f'{col}.png').exists():
        pytest.skip('the column images are not on disk')
    lid = '_248a6746-0126-4b00-a2a1-b241c7d70146'
    x0, y0, x1, y1 = audit_review.line_bbox(col, lid)
    im = Image.open(io.BytesIO(audit_review.zoom_png(col, lid, scale=1)))
    assert im.width == audit_review._column_image(col).width   # whole width
    assert im.height > (y1 - y0) * 2.5                         # and neighbours


def test_the_zoom_link_names_the_site_and_where_to_look(queues):
    m = audit_review.Member('page-900-L:_a', 'page-900-L', 0, '', 'l',
                            line_id='_a', frac=0.5)
    assert audit_review._zoom_href(m) == \
        '/zoom?col=page-900-L&line_id=_a&frac=0.5000'
    c = audit_review.Card('s', 'page-900-L', '', 'siglum', 'x', {}, lineno=12)
    assert audit_review._zoom_href(c) == '/zoom?col=page-900-L&lineno=12'


def test_the_zoom_leaves_room_below_the_baseline():
    """⚠ JOHN, 2026-08-14: "still need a wider crop to determine if there is
    an iota subscript". A subscript hangs UNDER its vowel, and the polygon is
    drawn round the LETTERS — so a band cut to the polygon clips the very
    thing in question. The framed view keeps nearly a full line of floor."""
    import io
    from PIL import Image
    col = 'page-043-R'
    if not (audit_review.WORK / 'cols' / f'{col}.png').exists():
        pytest.skip('the column images are not on disk')
    lid = '_515555f6-3222-4519-a5cf-00a1255e759e'
    x0, y0, x1, y1 = audit_review.line_bbox(col, lid)
    im = Image.open(io.BytesIO(audit_review.zoom_png(col, lid, frac=0.5)))
    band = (y1 - y0)
    assert im.height / 9 > band * 2.2          # sky above and floor below
    assert im.width / 9 < (x1 - x0)            # and it is a WINDOW, magnified


def test_a_site_can_be_answered_on_its_own(tmp_path):
    """John, 2026-08-14: "make the bundles into A or B or EXCLUDE". A bundle
    where three sites read with the corpus and two with the engine had to be
    ruled one way and the rest ✕-ed — and those came back later as fresh cards
    asking what he had already decided while looking at them."""
    store = tmp_path / 'r.json'
    audit_review.record_site('pattern:x', 's1', 'A', store=store)
    audit_review.record_site('pattern:x', 's2', 'B', store=store)
    audit_review.record_site('pattern:x', 's3', 'X', store=store)
    have = json.loads(store.read_text(encoding='utf-8'))['pattern:x']
    assert have['sites'] == {'s1': 'A', 's2': 'B', 's3': 'X'}
    # ⚠ `excluded` STAYS IN STEP: rulings made before the letters existed carry
    # only that list, and the apply step still reads it.
    assert have['excluded'] == ['s3']
    # clicking the same letter again clears the site back to the card's answer
    audit_review.record_site('pattern:x', 's1', '', store=store)
    have = json.loads(store.read_text(encoding='utf-8'))['pattern:x']
    assert 's1' not in have['sites']


def test_a_verdict_does_not_wipe_the_per_site_answers(tmp_path):
    store = tmp_path / 'r.json'
    audit_review.record_site('pattern:x', 's1', 'B', store=store)
    audit_review.store_ruling('pattern:x', 'keep', 'corpus', store=store)
    have = json.loads(store.read_text(encoding='utf-8'))['pattern:x']
    assert have['sites'] == {'s1': 'B'} and have['verdict'] == 'keep'


def test_a_combining_mark_on_a_button_gets_a_carrier():
    """⚠ A MARK ALONE HAS NO BASE TO SIT ON, so the browser drops it onto
    whatever precedes — the button's own punctuation — and the reader sees a
    floating accent beside a bracket. `◌` is Unicode's own carrier."""
    rows = [audit_review.Card(f'page-900-L:_{i}', 'page-900-L', f'_{i}',
                              'mark', 'τȣ͂ λόγȣ', {'kraken e26': 'τȣ λόγȣ'})
            for i in 'ab']
    cards, _ = audit_review._pattern_cards(rows, ruled=set())
    card = next(iter(cards.values()))
    shown = [t for _v, _l, t, _f, _w in card.options]
    assert '◌͂ (COMBINING GREEK PERISPOMENI)' in shown
    assert 'nothing' in shown


def test_a_bundle_says_when_its_sites_carry_different_mark_stacks():
    """⚠ JOHN, 2026-08-14: "what if there is a circumflex AND breathing mark?"

    Two of the seventeen `͂`/nothing sites read `ȣ̓͂` — the ligature carries a
    breathing as well — and the ruling takes only the circumflex off them.
    That is correct, and the buttons cannot show it, because they name one
    mark. So the card says it in words, and the ✕ is how a site the ruling
    does not fit comes out."""
    plain = audit_review.Card('page-900-L:_a', 'page-900-L', '_a', 'mark',
                              'τȣ͂ λόγȣ', {'kraken e26': 'τȣ λόγȣ'})
    stacked = audit_review.Card('page-900-L:_b', 'page-900-L', '_b', 'mark',
                                'τȣ̓͂ λόγȣ', {'kraken e26': 'τȣ̓ λόγȣ'})
    cards, _ = audit_review._pattern_cards([plain, stacked], ruled=set())
    card = next(iter(cards.values()))
    assert 'not all the same shape' in card.mixed
    assert 'comma above' in card.mixed
    assert 'only the mark named on the buttons' in card.mixed
    # and a bundle whose sites ARE all one shape says nothing
    only, _ = audit_review._pattern_cards([plain, plain], ruled=set())
    assert next(iter(only.values())).mixed == ''


def test_a_ruling_is_queued_and_retried_rather_than_lost(queues, monkeypatch,
                                                         tmp_path):
    """⚠ JOHN LOST A CLICK TO A SERVER RESTART, 2026-08-14. The bar printed
    NOT SAVED and stopped: indistinguishable from a refusal, never clearing,
    and the ruling gone. Restarts happen because the queue is rebuilt while
    he is working, so a dead socket must never be terminal."""
    monkeypatch.setattr(audit_review, 'PAGE', tmp_path / 'page.html')
    audit_review.build_page(load_cards())
    doc = (tmp_path / 'page.html').read_text(encoding='utf-8')
    assert 'const pending = []' in doc
    assert 'setTimeout(drain, 2000)' in doc          # it comes back
    assert 'waiting for the server' in doc           # and it SAYS so
    # a refusal is final and names itself; a network failure is not
    assert 'r.status >= 400 && r.status < 500' in doc
    assert 'every site is ✕-ed' in doc               # the 409, in words
    assert 'NOT SAVED' not in doc                    # the dead end is gone


def test_the_zoom_works_on_a_site_addressed_by_printed_line(monkeypatch,
                                                            tmp_path):
    """⚠ IT NEVER HAD. `_card_frac` gives every card with a reading a frac,
    and `_zoom_href` puts a printed line number in the query when there is no
    polygon — so the zoom on every sweep card raised UnboundLocalError before
    it drew a pixel. A site addressed by printed line has no polygon, so the
    band and the width are estimated from the column image.
    """
    from PIL import Image
    rec = tmp_path / 'reconciled'
    rec.mkdir()
    (rec / 'page-021-R.txt').write_text('a\nb\nc\nd\n', encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RECONCILED', rec)
    monkeypatch.setattr(audit_review, '_column_image',
                        lambda col: Image.new('L', (900, 400), 255))
    png = audit_review.zoom_png('page-021-R', lineno=3, frac=0.5)
    assert png[:8] == b'\x89PNG\r\n\x1a\n'


def test_a_none_does_not_freeze_its_line_unsplit(queues, monkeypatch,
                                                 tmp_path):
    """⚠ SPLITTING WAS WITHHELD FROM THE VERY CARDS THAT MOTIVATED IT. A
    `none` says the ink reads none of the readings offered; it never said
    what the line should be. Counted as an answer it kept its line whole,
    and 25 of John's 45 `none` verdicts sit on lines disputing two to eight
    things at once — he was rejecting a whole line because no single reading
    was right about all of it."""
    store = tmp_path / 'rulings.json'
    store.write_text(json.dumps({'page-015-L:l1': {'verdict': 'none'}}),
                     encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RULINGS', store)
    assert audit_review._ruled_sids() == set()
    assert audit_review._none_sids() == {'page-015-L:l1'}


def test_the_none_reviewer_serves_only_what_a_none_owes(queues, monkeypatch,
                                                        tmp_path):
    store = tmp_path / 'rulings.json'
    store.write_text(json.dumps({'page-055-L:l9': {'verdict': 'none'}}),
                     encoding='utf-8')
    monkeypatch.setattr(audit_review, 'RULINGS', store)
    got = audit_review._none_cards(load_cards())
    assert [c.sid for c in got] == ['page-055-L:l9']
    assert 'YOU RULED THIS LINE `none`' in got[0].note
