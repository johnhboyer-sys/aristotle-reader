"""The space slot: the one whitespace error a rule can see, and its limits."""


import pytest

from bonitz_pipeline import space_slot
from bonitz_pipeline.settle_review import (_keep_phrase, _named, _sub_phrase,
                                           Card, bundle_options)


def _hits(line: str, page: int = 117, col: str = 'L'):
    return space_slot.scan_text(line, page, col)


# --- what the rule must NOT say ---------------------------------------------

def test_a_column_letter_glued_to_a_number_is_bonitz_and_not_a_finding():
    # ⚠ 8300 of these against 5367 spaced in the settled corpus. A rule that
    # flagged them would report a fifth of every citation on the page.
    assert _hits('ρήνη f 579. 1573a25, hunc\n') == []


def test_sq_inside_a_word_is_not_a_finding():
    assert _hits('quisque et consequenter\n') == []


# --- what it must say -------------------------------------------------------

def test_a_column_letter_glued_to_a_word_is_flagged():
    got = _hits('1573a25, cfa16. Ἀ. Platonicus\n')
    assert [(h.rule, h.token, h.becomes) for h in got] == [
        ('column_letter_after_word', 'cfa16', 'cf a16')]


def test_sq_glued_inside_a_bekker_citation_is_flagged():
    # ⚠ THE LOOKBEHIND REGRESSION. `(?<![\\w])(\\d+)(sqq?)` requires the number
    # to start at a word boundary, so `378a15sqq` — where `15` follows the
    # column letter `a` — was silently skipped. It is the exact shape kraken
    # set correctly as `378a15 sqq`, and five hits on this tranche were lost.
    got = _hits('μγ7. 378a15sqq. cf Rose\n')
    assert [(h.token, h.becomes) for h in got] == [('15sqq', '15 sqq')]


def test_the_whole_number_reaches_the_card_not_its_last_digit():
    got = _hits('Bernays p 108sqq. non esse\n')
    assert got[0].token == '108sqq'


def test_the_hit_names_its_printed_position():
    got = _hits('ab p 13sq. Forch-\n', page=117, col='L')[0]
    assert got.line == 1
    assert got.sid == 'page-117-L:1:5'


# --- the rule that was measured and thrown away -----------------------------

def test_the_page_abbrev_rule_is_not_shipped():
    """⚠ 1 true in 15 across pages 15-117; the other fourteen are Bonitz's own
    abbreviations (`Emp` 9, `adesp` 3, `Hipp`, `Symp`). Worse than the paren
    detector John had already found not worth his eyes."""
    assert 'page_abbrev_after_name' not in space_slot.RULES
    assert 'page_abbrev_after_name' in space_slot.REJECTED_RULES
    # And it must stay silent on Plato's Symposium.
    assert _hits('b11 (cf Plat Symp 129D).\n') == []


# --- asking the readers, which the folded stream could never do -------------

def test_a_reader_that_puts_a_space_there_is_recorded_as_a_witness():
    hit = _hits('Bernays Dial p 108sq;\n')[0]
    assert space_slot.witness(hit, 'confert Bernays Dial p 108 sq;') == 'space'
    assert space_slot.witness(hit, 'confert Bernays Dial p 108sq;') == 'glued'


def test_a_reader_that_does_not_hold_the_passage_does_not_vote():
    hit = _hits('Bernays Dial p 108sq;\n')[0]
    assert space_slot.witness(hit, 'nothing like it here at all') == 'absent'


def test_a_passage_occurring_twice_names_no_position():
    # ⚠ NO POSITION, NO VOTE. Two matches mean the anchor does not identify a
    # site, and guessing the first would be a claim about ink nothing located.
    hit = _hits('ab p 13sq.\n')[0]
    assert space_slot.witness(hit, 'ab p 13sq. ab p 13sq.') == 'ambiguous'


def test_the_score_counts_only_readers_that_voted():
    hit = _hits('Bernays Dial p 108sq;\n')[0]
    scored = space_slot.Hit(**{**hit.__dict__, 'witness': {
        'kraken': 'space', 'calamari': 'glued',
        'llama': 'absent', 'genie': 'ambiguous'}})
    assert scored.score == '1 of 2'


# --- the queue --------------------------------------------------------------

def _column(tmp_path, page, col, lines):
    d = tmp_path / 'spine'
    d.mkdir(exist_ok=True)
    (d / f'page-{page:03d}-{col}.txt').write_text('\n'.join(lines) + '\n',
                                                  encoding='utf-8')
    return d


def test_one_card_per_rule_however_many_numbers(tmp_path):
    # ⚠ `139sqq` and `13sq` are eighteen numbers asking ONE question. Eighteen
    # cards would be eighteen looks at the same shape.
    d = _column(tmp_path, 117, 'L',
                ['Bernays p 108sqq. non', 'ab Arist Stud I p 13sq. Forch-'])
    hits = space_slot.scan_dir(d)
    doc = space_slot.to_queue(hits, d, 'kraken-r6')
    assert doc['n_sites'] == 2
    assert {e['card_sid'] for e in doc['entries']} == {'space:sq_after_number'}
    for e in doc['entries']:
        assert e['bundle']['subs'] == [['', ' ']]
        assert e['becomes'] == e['readers']['opus'].replace('sq', ' sq', 1)


def test_the_queue_locates_the_site_in_the_spine_stream(tmp_path):
    d = _column(tmp_path, 117, 'L', ['abc def', 'gh p 13sq. i'])
    doc = space_slot.to_queue(space_slot.scan_dir(d), d, 'kraken-r6')
    e = doc['entries'][0]
    from bonitz_pipeline.normalize import canonical
    stream, _ = canonical((d / 'page-117-L.txt').read_text(encoding='utf-8'))
    assert stream[e['word_off']:e['word_off'] + 4] == '13sq'
    assert e['char_at'] == 5           # into the printed line, for the crop


def test_a_witness_becomes_a_reader_form_on_the_card(tmp_path):
    d = _column(tmp_path, 117, 'L', ['gh p 13sq. i'])
    hits = space_slot.add_witnesses(space_slot.scan_dir(d), {
        'kraken': 'gh p 13 sq. i', 'calamari': 'gh p 13sq. i'})
    e = space_slot.to_queue(hits, d, 'kraken-r6')['entries'][0]
    assert e['readers'] == {'opus': '13sq', 'kraken': '13 sq',
                            'calamari': '13sq'}
    assert e['form_set'] == ['13 sq', '13sq']


# --- the button, for a character with no shape ------------------------------

def test_a_space_is_named_because_it_cannot_be_drawn():
    # ⚠ `add ` and `→  ` are BLANK BUTTONS, and every question in this class is
    # about whitespace.
    assert _sub_phrase('', ' ') == 'add a space'
    assert _keep_phrase('', ' ') == 'no space'
    assert _named('  ') == '2 spaces'
    # Nothing else changes.
    assert _keep_phrase('ρ', 'p') == 'ρ'
    assert _sub_phrase('ι', '') == 'delete ι'


def test_an_insertion_button_does_not_read_read_add_a_space():
    card = Card(form_set=('13 sq', '13sq'), sid_override='space:sq',
                bundle={'kind': 'space', 'label': '', 'subs': [['', ' ']]})
    labels = [o['label'] for o in bundle_options(card)]
    assert labels[0].startswith('keep as printed · no space')
    assert labels[1] == 'add a space'
    assert 'read add' not in ' '.join(labels)


def test_a_substitution_button_still_says_read():
    card = Card(form_set=('a', 'b'),
                bundle={'kind': 'letters', 'label': '', 'subs': [['ρ', 'p']]})
    assert bundle_options(card)[1]['label'].startswith('read ρ → p')


# --- the guard against a directory nothing looked in ------------------------

def test_an_empty_directory_raises_rather_than_reporting_nothing(tmp_path):
    # This project has shipped "nothing found" from a path nothing read four
    # times. [[absence-rendered-as-clean]]
    with pytest.raises(SystemExit):
        space_slot.scan_dir(tmp_path)
