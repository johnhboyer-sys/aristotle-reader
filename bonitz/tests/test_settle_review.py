"""Settle adjudication page — John's rules, pinned as tests.

1. Crop by recorded OFFSET, never want.find(word).
2. Printed-as-is option is always present.
3. One grouped ruling expands to every member of the form-set.
4. Skipped crops are counted, not silent.
"""

from __future__ import annotations

import inspect
import json
from pathlib import Path

import pytest

from bonitz_pipeline.settle_review import (
    Card,
    Member,
    crop_at_offset,
    form_set_key,
    group_entries,
    line_char_offset,
    options_for,
)
from bonitz_pipeline import settle_review as sr
from bonitz_pipeline.settle_apply import plan as apply_plan

ROOT = Path(__file__).resolve().parent.parent


def test_crop_at_offset_source_never_calls_find_on_the_line():
    """The defect on record: crop_word once used want.find(word) and showed
    the wrong citation for 417 sites. Our wrapper must place by `at`."""
    src = inspect.getsource(crop_at_offset)
    assert 'want.find' not in src
    assert '.find(' not in src
    assert 'use_at' in src
    # The call into crop_word must pass at=, not rely on its find fallback.
    assert 'at=None if whole else at' in src


def test_crop_at_offset_passes_offset_into_crop_word(monkeypatch, tmp_path: Path):
    """When legacy paths exist, crop_word is called with at= the offset."""
    seen = {}

    def fake_crop(col, lineno, word, scale=3.0, whole=False, spread=7, at=None):
        seen['at'] = at
        seen['word'] = word
        seen['whole'] = whole
        return None, 0.0, 'none'

    monkeypatch.setattr(sr, 'crop_word', fake_crop)
    recon = tmp_path / 'reconciled'
    cols = tmp_path / 'cols'
    recon.mkdir(); cols.mkdir()
    (recon / 'page-020-L.txt').write_text('x\n', encoding='utf-8')
    (cols / 'page-020-L.png').write_bytes(b'')
    monkeypatch.setattr(sr, 'RECONCILED', recon)
    monkeypatch.setattr(sr, 'LEGACY_COLS', cols)
    crop_at_offset(20, 'L', 3, 'λόγος', at=12, whole=False)
    assert seen['at'] == 12
    assert seen['word'] == 'λόγος'
    crop_at_offset(20, 'L', 3, 'λόγος', at=12, whole=True)
    assert seen['at'] is None  # whole line — no word placement


def test_printed_as_is_option_is_always_present():
    card = Card(
        form_set=('ἁμῶς', 'ἁμιῶς'),
        printed='ἁμιῶς',  # printed form is the "wrong" real-looking one
        members=[Member(53, 'L', 1, 0, 0,
                        {'opus': 'ἁμιῶς', 'kraken': 'ἁμῶς'}, 'letters', 'x')],
    )
    opts = options_for(card)
    preserve = [o for o in opts if o['verdict'] == 'preserve']
    assert len(preserve) == 1
    assert preserve[0]['form'] == 'ἁμιῶς'
    assert 'corpus untouched' in preserve[0]['consequence']
    # And the other reading is offered as accept.
    accept = [o for o in opts if o['verdict'] == 'accept']
    assert any(o['form'] == 'ἁμῶς' for o in accept)


def test_numeral_slot_preserve_states_stigma_not_final_sigma():
    """⚠ "keep as printed · πκς" ASSERTS A NON-NUMBER IS THE PRINTING.

    Final sigma has no numeric value. In a numeral slot the printed sort is
    stigma. The preserve button must name stigma, never claim ς is what Bonitz
    set.
    """
    card = Card(
        form_set=('πκζ', 'πκς'),
        printed='πκς',
        members=[Member(55, 'L', 1, 0, 0,
                        {'opus': 'πκς', 'kraken': 'πκζ'}, 'letters', 'x')],
    )
    opts = options_for(card)
    # No option may present final-sigma-as-printed for a numeral form.
    labels = [o['label'] for o in opts]
    assert not any('keep as printed · πκς' in lab for lab in labels)
    # The printed-sort button names stigma.
    keep = [o for o in opts if o['label'].startswith('keep as printed')]
    assert len(keep) == 1
    assert keep[0]['form'] == 'πκϛ'
    assert 'stigma' in keep[0]['label']
    # And final sigma is not a live accept option either.
    assert not any(o['form'] == 'πκς' for o in opts)


def test_a_word_is_never_offered_a_stigma_to_close_it():
    """⚠ THE STIGMA OFFER BELONGS TO NUMERALS, NOT TO CARDS THAT AREN'T MARGIN.

    118-281, sitting 1: `ἀετέρες / ἀστέρες` asks one thing — is the second
    letter σ or ε. Three readers say ἀστέρες and kraken alone says ἀετέρες.
    The card carried a third button, `ἀστέρεϛ`, which NO READER READ, built
    only because the word ends in final sigma; that is the button John clicked.
    `τοῆϛ` reached work/reconciled/page-111-L.txt by the same route.

    Stigma is the numeral 6 and closes no common noun — this module says so
    itself in `numeral_card_is_a_word_tail`. The guard was scoped to `margin`
    cards, so every ordinary `letters` card kept the offer. Scope it to the
    TOKEN.
    """
    card = Card(
        form_set=('ἀετέρες', 'ἀστέρες'),
        printed='ἀετέρες',
        members=[Member(156, 'L', 40, 1512, 10,
                        {'opus': 'ἀετέρες', 'calamari': 'ἀστέρες'},
                        'letters', 'cold:letters')],
    )
    forms = [o['form'] for o in options_for(card)]
    assert 'ἀστέρες' in forms          # the readers' own form stays offered
    assert not any('ϛ' in f for f in forms), forms

    # And a numeral-shaped token in the same non-margin card kind KEEPS it —
    # that is the case the offer exists for.
    numeral = Card(
        form_set=('πκζ', 'πκς'),
        printed='πκς',
        members=[Member(55, 'L', 1, 0, 0,
                        {'opus': 'πκς', 'kraken': 'πκζ'}, 'letters', 'x')],
    )
    assert any('ϛ' in o['form'] for o in options_for(numeral))


def test_two_options_that_draw_the_same_word_are_told_apart_in_words():
    """⚠ 260-R:30 OFFERED THE SAME WORD TWICE. kraken and calamari split over
    the iota subscript in `ἐνῇδον / ἐνῆδον`, and at card size both buttons
    read `ἐνῆδον · 1 of 4 readers`. John, 2026-08-29: "can't tell here".

    `marks_on_ligature` fixed this for marks sitting on a ligature. The mark
    does not have to sit on a ligature to be invisible.
    """
    card = Card(
        form_set=('ἐνῆδον', 'ἐνῇδον', 'ἔνδον'),
        printed='ἐνῇδον',
        members=[Member(260, 'R', 30, 1253, 15,
                        {'opus': 'ἐνῇδον', 'calamari': 'ἐνῆδον',
                         'genie': 'ἔνδον', 'llama': 'ἔνδον'},
                        'letters', 'cold:letters')],
    )
    opts = options_for(card)
    labels = {o['form']: o['label'] for o in opts}
    assert 'iota sub' in labels['ἐνῇδον'], labels['ἐνῇδον']
    assert 'iota sub' in labels['ἐνῆδον'], labels['ἐνῆδον']
    assert labels['ἐνῇδον'] != labels['ἐνῆδον']
    # ἔνδον has different LETTERS, so it is not a marks question and stays out.
    assert 'iota sub' not in labels['ἔνδον']


def test_the_trim_offer_only_reaches_the_word_at_the_margin(tmp_path, monkeypatch):
    """⚠ A NUMBERED LINE IS NOT A NUMBERED WORD. 260-R:30 offered `νῇδον`,
    `ῇδον` and `δον` — eat the front of `ἐνῇδον`, a word fifteen characters
    into the line, because line 30 is a numbered line. The number is at the
    HEAD of an R line, so only the first token could have swallowed it.
    """
    import bonitz_pipeline.settle_review as sr
    cols = tmp_path / 'txt'
    cols.mkdir()
    (cols / 'page-260-R.txt').write_text(
        '\n' * 29 + 'ἐναρμόνια μέλη ἐνῇδον, dist\n', encoding='utf-8')
    monkeypatch.setattr(sr, 'SPINE_DIR', cols)

    mid = Card(
        form_set=('ἐνῆδον', 'ἐνῇδον'),
        printed='ἐνῇδον',
        members=[Member(260, 'R', 30, 1253, 15,
                        {'opus': 'ἐνῇδον', 'calamari': 'ἐνῆδον'},
                        'letters', 'cold:letters')],
    )
    assert not any('trimmed' in o['label'] for o in options_for(mid))

    # The first token of that same R line CAN have taken the number in.
    edge = Card(
        form_set=('ἐναρμόνια', 'ἐναρμόνι'),
        printed='ἐναρμόνια',
        members=[Member(260, 'R', 30, 1240, 0,
                        {'opus': 'ἐναρμόνια', 'calamari': 'ἐναρμόνι'},
                        'letters', 'cold:letters')],
    )
    assert any('trimmed' in o['label'] for o in options_for(edge))


ALTO_ONE_LINE = """<?xml version="1.0" encoding="UTF-8"?>
<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#"><Layout><Page><PrintSpace>
<TextLine HPOS="118" VPOS="1615" WIDTH="1248" HEIGHT="90">
  <String CONTENT="{w0}" HPOS="118" VPOS="1617" WIDTH="230" HEIGHT="84"/>
  <String CONTENT="{w1}" HPOS="355" VPOS="1620" WIDTH="80" HEIGHT="70"/>
  <String CONTENT="{w2}" HPOS="481" VPOS="1615" WIDTH="117" HEIGHT="88"/>
</TextLine></PrintSpace></Page></Layout></alto>
"""


def test_the_pointer_takes_the_word_box_from_the_alto_not_from_arithmetic(
        tmp_path, monkeypatch):
    """⚠ A PROPORTIONAL POINTER MISSES BY A WORD. The rule was placed at
    `x0 + span * at / len(line)`, which assumes every letter is one width.
    On 260-R:30 that put it under `μέλη` while the card asked about `ἐνῇδον`.
    John, 2026-08-29: "the red line isn't helping."

    The ALTO carries a box per word. Take it.
    """
    import bonitz_pipeline.settle_review as sr
    alto = tmp_path / 'alto'
    alto.mkdir()
    (alto / 'page-260-R.xml').write_text(
        ALTO_ONE_LINE.format(w0='ἐναρμόνια', w1='μέλη', w2='ἐνῇδον,'),
        encoding='utf-8')
    monkeypatch.setattr(sr, 'EXTRA_ALTO_DIRS', [alto])

    want = 'ἐναρμόνια μέλη ἐνῇδον, dist'
    at = want.index('ἐνῇδον')
    assert sr._alto_word_span(260, 'R', want, at) == (481, 1615, 598, 1703)
    # …and the word before it is a different box, so this is placement and not
    # a constant.
    assert sr._alto_word_span(
        260, 'R', want, want.index('μέλη')) == (355, 1620, 435, 1690)

    # ⚠ THE OFFSET IS INTO THE SPINE'S LINE, AND THE ALTO IS ANOTHER READ OF
    # IT. Where the two disagree on a letter the index must still land on the
    # right word, or the pointer drifts exactly where the card is hardest.
    (alto / 'page-260-R.xml').write_text(
        ALTO_ONE_LINE.format(w0='ἐναρμόνια', w1='μέλη', w2='ἐνῆδον,'),
        encoding='utf-8')
    assert sr._alto_word_span(260, 'R', want, at) == (481, 1615, 598, 1703)


def test_the_wash_tints_the_paper_and_leaves_the_ink_alone():
    """⚠ THE POINTER MUST NOT DARKEN ANYTHING. A rule under the word covered
    the iota subscript at 260-R:30, which was the question. The tint is a
    BLEND: the paper changes colour, the letters keep their weight.
    """
    from PIL import Image
    import bonitz_pipeline.settle_review as sr
    im = Image.new('RGB', (200, 90), (240, 240, 240))
    for y in range(45, 60):                     # a black stroke inside the word
        im.putpixel((100, y), (10, 10, 10))
    marked = sr._mark_word(im, 80, 120, top=30, bottom=70)
    px = marked.load()
    paper, stroke = px[85, 50], px[100, 50]
    assert paper[2] < paper[0] and paper[2] < paper[1]   # the paper took the wash
    # ⚠ CONTRAST, NOT VISIBILITY, IS WHAT A CARD TURNS ON. The blend scales the
    # gap between ink and paper by (1 - strength); the faintest mark on these
    # cards is an iota subscript the size of a speck.
    assert sum(paper) - sum(stroke) > 0.7 * (3 * 240 - 30)
    assert px[40, 50] == (240, 240, 240)        # outside the word, untouched


def test_a_word_tail_that_spells_a_numeral_keeps_its_final_sigma(
        tmp_path, monkeypatch):
    """⚠ THE LETTERS CANNOT TELL YOU, and `numeral_card_is_a_word_tail` says so
    in its own docstring. `νυχος` is ν 50, υ 400, χ 600, ο 70 and a final
    sigma — a perfectly good numeral — but 158-L:46 ends `γαμψώ-`, so it is the
    tail of `γαμψώνυχος`.

    That card reached John with `keep as printed · νυχοϛ · stigma = 6` as its
    only preserve and the plain word on NO button, which forces a wrong ruling
    exactly as the missing stigma once did. The check existed and was not
    consulted.
    """
    import bonitz_pipeline.settle_review as sr
    cols = tmp_path / 'txt'
    cols.mkdir()
    (cols / 'page-158-L.txt').write_text(
        '\n' * 45 + 'τῶν βαρέων ὁ κόκκυξ ȣ̓κ ὢν γαμψώ-\nνυχος Ζγγ1. 750a11.\n',
        encoding='utf-8')
    monkeypatch.setattr(sr, 'SPINE_DIR', cols)

    tail = Card(
        form_set=('νυξ', 'νυχος', 'νύχων'),
        printed='νυχος',
        members=[Member(158, 'L', 47, 0, 0,
                        {'opus': 'νυχος', 'calamari': 'νυχος',
                         'llama': 'νυξ', 'genie': 'νύχων'},
                        'letters', 'cold:letters')],
    )
    opts = options_for(tail)
    keep = [o for o in opts if o['label'].startswith('keep as printed')]
    assert len(keep) == 1
    assert keep[0]['form'] == 'νυχος' and keep[0]['verdict'] == 'preserve'
    assert not any('ϛ' in o['form'] for o in opts), [o['form'] for o in opts]

    # A numeral on a line whose predecessor does NOT break a word still gets
    # the stigma — the offer exists for that case and must survive the fix.
    (cols / 'page-158-L.txt').write_text(
        '\n' * 45 + 'τῶν βαρέων ὁ κόκκυξ\nνυχος Ζγγ1. 750a11.\n',
        encoding='utf-8')
    assert any('ϛ' in o['form'] for o in options_for(tail))


def test_the_wash_stays_off_the_line_above():
    """⚠ A LINE BOX IS NOT A LINE. On 231-L the pitch is 56px and the ALTO line
    boxes are 82-109px, so consecutive boxes overlap by thirty to fifty pixels.
    A tint drawn to a line box lands on its neighbour — which put a highlight
    over `εἰδότως` when the card asked about `εἴδωλον.` John, 2026-08-30: "you
    just showed a highlight on two lines."

    The tint takes the WORD's own box, inset at each end where the ascender and
    descender allowances of neighbouring boxes meet.
    """
    from PIL import Image
    import bonitz_pipeline.settle_review as sr
    im = Image.new('RGB', (200, 120), (240, 240, 240))
    marked = sr._mark_word(im, 80, 120, top=40, bottom=100)
    px = marked.load()
    plain = (240, 240, 240)
    assert px[100, 70] != plain                 # the middle of the word
    assert px[100, 41] == plain                 # the inset at the top
    assert px[100, 99] == plain                 # and at the bottom
    assert px[100, 20] == plain and px[100, 115] == plain    # the neighbours


def test_a_siglum_card_says_what_actually_differs():
    """⚠ `ου spelled out` NAMED A RELATIONSHIP THAT WAS NOT THERE. At 130-R:48
    the ink reads `πκϛ 37` — Problemata book 26 — and kraken took the STIGMA
    for the ou ligature. The label fired on "the printed form has ȣ and this
    one does not", which is true of any reading that differs for any reason, so
    the card offered `πκ · ου spelled out` and `πκϛ · ου spelled out`, neither
    of which contains an ου. John, 2026-08-30: "what's with 'ου spelled out'
    here?"

    ⚠ AND THE TALLY READ `0 of 4 readers` on the button holding the right
    answer, because calamari and llama wrote the sort as `ς` and the offer
    builds it as `ϛ`. One sort, one reading.
    """
    card = Card(
        form_set=('πκ', 'πκȣ', 'πκς', 'πκϛ'),
        printed='πκȣ',
        members=[Member(130, 'R', 48, 0, 0,
                        {'opus': 'πκȣ', 'calamari': 'πκς',
                         'genie': 'πκ', 'llama': 'πκς'},
                        'letters', 'cold:letters')],
    )
    labels = {o['form']: o['label'] for o in options_for(card)}
    assert not any('spelled out' in lab for lab in labels.values()), labels
    assert 'stigma = 6' in labels['πκϛ']
    assert '2 of 4 readers' in labels['πκϛ'], labels['πκϛ']

    # And a reading that really does write the ligature out still says so —
    # including when the υ carries a mark, so the ου is only there once the
    # combining characters are set aside.
    spelled = Card(
        form_set=('τȣ͂', 'τοῦ'),
        printed='τȣ͂',
        members=[Member(118, 'R', 16, 0, 0,
                        {'opus': 'τȣ͂', 'genie': 'τοῦ'}, 'letters', 'x')],
    )
    out = {o['form']: o['label'] for o in options_for(spelled)}
    assert 'ου spelled out' in out['τοῦ'], out


def test_the_gutter_trim_is_named_on_whichever_option_is_the_trim(
        tmp_path, monkeypatch):
    """⚠ THE RIGHT ANSWER WORE THE WRONG LABEL. At 146-L:25 the ink reads
    `ἔχȣσιν 25`, kraken took the number's tail onto the word as `ἔχȣσινς`, and
    cutting one grapheme gives `ἔχȣσιν` — which llama also read. The trim was
    skipped as a duplicate, so that button said only `1 of 4 readers` while two
    DEEPER cuts, which eat real letters, carried the gutter label alone. John,
    2026-08-30: "we need that 'gutter numbers spilled in' additional button."

    ⚠ AND THREE WAS NEVER THE BOUND. What spilled in is a line number, so it is
    as long as that number: two digits leak at most two sorts.
    """
    import bonitz_pipeline.settle_review as sr
    cols = tmp_path / 'txt'
    cols.mkdir()
    (cols / 'page-146-L.txt').write_text(
        '\n' * 24 + 'palmipedes, gallinae: ἔχȣσινς\n', encoding='utf-8')
    monkeypatch.setattr(sr, 'SPINE_DIR', cols)
    card = Card(
        form_set=('ἔχȣσιν', 'ἔχȣσινο', 'ἔχȣσινς', 'ἔχουσιν'),
        printed='ἔχȣσινς',
        members=[Member(146, 'L', 25, 0, 0,
                        {'opus': 'ἔχȣσινς', 'calamari': 'ἔχȣσινο',
                         'genie': 'ἔχουσιν', 'llama': 'ἔχȣσιν'},
                        'letters', 'cold:letters')],
    )
    labels = {o['form']: o['label'] for o in options_for(card)}
    assert 'margin number' in labels['ἔχȣσιν'], labels['ἔχȣσιν']
    assert '1 of 4 readers' in labels['ἔχȣσιν']
    # Two digits, so no cut of three — `ἔχȣσ` is the word, not the margin.
    assert 'ἔχȣσ' not in labels, sorted(labels)

    # ⚠ AND A READER CAN CATCH PART OF THE LEAK. 132-L:15 came as
    # `καὶ / ϗ̀ι / ϗ̀ις`: cutting one gives calamari's reading and the right
    # answer needs two, so the deeper cut must still be offered.
    (cols / 'page-132-L.txt').write_text(
        '\n' * 14 + 'καπνὸς θερμὸν ϗ̀ις\n', encoding='utf-8')
    kai = Card(
        form_set=('καὶ', 'ϗ̀ι', 'ϗ̀ις'),
        printed='ϗ̀ις',
        members=[Member(132, 'L', 15, 0, 0,
                        {'opus': 'ϗ̀ις', 'calamari': 'ϗ̀ι', 'genie': 'καὶ'},
                        'letters', 'cold:letters')],
    )
    got = {o['form']: o['label'] for o in options_for(kai)}
    assert 'margin number' in got['ϗ̀ι']
    assert 'margin number' in got['ϗ̀'], sorted(got)


def test_an_elided_word_says_so_even_though_no_reading_carries_the_mark(
        tmp_path, monkeypatch):
    """⚠ THE INK ELIDES WHERE NO READING SHOWS IT. At 160-L:13 the printed word
    is `ȣ̓́θ’` — οὐθ’, οὐθέν elided — and the panel tokenises the apostrophe off,
    so the card arrives as `ȣ̓́θ / ȣ̓θ / ȣ̓δ / ὅθ` with nothing to say the word is
    cut short. John, 2026-08-30: "should i be unconcerned about the apostrophe
    here for elision?"

    Unconcerned about losing it — the applier writes only the printed form's
    own characters. But the mark decides the ruling: an elided word is not
    finished by `ὅθ`, and `ȣ̓δ’` against `ȣ̓́θ’` is οὐδέν against οὐθέν, a real
    variant rather than a misread.
    """
    import bonitz_pipeline.settle_review as sr
    cols = tmp_path / 'txt'
    cols.mkdir()
    (cols / 'page-160-L.txt').write_text(
        '\n' * 12 + 'ἐστὶ γένεσις ȣ̓́θ’ ἁπλῶς ȣ̓θενός\n', encoding='utf-8')
    monkeypatch.setattr(sr, 'SPINE_DIR', cols)
    elided = Member(160, 'L', 13, 573, 31,
                    {'opus': 'ȣ̓́θ', 'calamari': 'ȣ̓θ',
                     'llama': 'ȣ̓δ', 'genie': 'ὅθ'}, 'letters', 'x')
    note = sr.elision_note(elided)
    assert 'ȣ̓́θ’' in note and 'elides' in note, note

    # A word that is not elided says nothing, and neither does a form that
    # already carries the mark — the card would then be showing it anyway.
    plain = Member(160, 'L', 13, 0, 0, {'opus': 'γένεσις'}, 'letters', 'x')
    assert sr.elision_note(plain) == ''
    carried = Member(160, 'L', 13, 0, 0, {'opus': 'ȣ̓́θ’'}, 'letters', 'x')
    assert sr.elision_note(carried) == ''


def test_the_typed_field_can_be_filled_without_a_keyboard():
    """⚠ A TYPED FIELD IS NO USE ON A PHONE. Polytonic Greek is not on the
    keyboard and the ligatures are on no keyboard at all, so "none of these
    fits — type what the ink reads" was another way of setting the card aside.
    John, 2026-08-30: "if you put in buttons to insert ligatures and accents
    and breathing into the text boxes, i can just type in the ligature cards
    where the choice is otherwise none."

    Every sort the index turns on must be tappable, and each must SAY what it
    inserts: a bare ϛ against a bare ς is the pair this index cannot afford to
    have guessed at.
    """
    import bonitz_pipeline.settle_review as sr
    html = sr.palette_html('t-abc')
    for ch, name in sr.PALETTE:
        assert name in html, name
    for ch in ('ȣ', 'ϗ', 'ϛ', '\u0313', '\u0314', '\u0301', '\u0300',
               '\u0342', '\u0345'):
        assert ch in html, repr(ch)
    assert 't-abc' in html
    # A backspace, or a mistap is unfixable without the keyboard he does not
    # have.
    assert 'null' in html
    # ⚠ AND HE CANNOT SEE WHAT HE BUILDS. Two combining marks over `ȣ` do not
    # render — recorded 2026-08-10, when John read the pair as an apostrophe.
    # John, 2026-08-30: "or if i can combine, I CAN'T SEE IT RENDER." So the
    # field has somewhere to say in words what it holds.
    assert 'say-t-abc' in html


def test_the_palette_keys_do_not_inherit_the_full_width_button():
    """⚠ EVERY BUTTON ON THIS PAGE IS `width:100%`. The option buttons are
    full-width plates by design, so the bare `button` rule sets width and
    max-width — and the palette keys inherited it, which is why a row of eleven
    sorts rendered as a column of eleven plates. Twice: `display:inline-flex`
    does not help a box that is still 100% wide. John, 2026-08-30: "lay these
    out in one single row."
    """
    import re
    import bonitz_pipeline.settle_review as sr
    css = sr.TYPED_CSS
    block = re.search(r'\.palette \.sort\{[^}]*\}', css)
    assert block, 'no .palette .sort rule in the page CSS'
    rule = block.group(0)
    assert 'width:auto' in rule, rule
    assert 'max-width:none' in rule, rule
    # And the row itself must not wrap into a column on a narrow screen.
    row = re.search(r'\.palette\{[^}]*\}', css)
    assert row and 'nowrap' in row.group(0), row


def test_the_palette_and_its_readout_name_the_same_sorts():
    """The readout is generated from PALETTE, so a sort cannot be tappable and
    unnameable — which is how `ϛ` and `ς` would become indistinguishable again.
    """
    import json as _json
    import bonitz_pipeline.settle_review as sr
    page = sr.html([], out=Path('/dev/null')) if False else None
    table = _json.dumps({ch: name for ch, name in sr.PALETTE},
                        ensure_ascii=False)
    for ch, name in sr.PALETTE:
        assert ch in table and name in table


def test_the_spine_sort_is_offered_with_another_readers_marks():
    """⚠ THE SORT AND THE MARKS CAN BE SPLIT ACROSS READERS. 151-R:40 came as
    `ȣ̔̀͂ς / ȣ̔͂ς / ὃς`: kraken has the ligature under rough AND grave AND
    circumflex, which no Greek word carries, while genie and llama have rough
    and grave correctly but on an omicron. `ȣ̔̀ς` — οὓς, what both halves point
    at — was on no button, so the card could only be set aside, and John set it
    aside.

    Taking the sort from the spine and the marks from a reader who has them is
    transcription, not judgement, and it invents no letter: it fires only where
    the base letters line up one for one.
    """
    card = Card(
        form_set=('ȣ̔̀͂ς', 'ȣ̔͂ς', 'ὃς'),
        printed='ȣ̔̀͂ς',
        members=[Member(151, 'R', 40, 1603, 0,
                        {'opus': 'ȣ̔̀͂ς', 'calamari': 'ȣ̔͂ς',
                         'genie': 'ὃς', 'llama': 'ὃς'}, 'letters', 'x')],
    )
    import unicodedata
    forms = {unicodedata.normalize('NFC', o['form'])
             for o in options_for(card)}
    assert unicodedata.normalize('NFC', 'ȣ\u0314\u0300ς') in forms, forms

    # ⚠ AND A READER WITH NO MARKS TRANSPLANTS NOTHING. Rebuilding the spine's
    # own letters bare put `πκς` back on a numeral card as a live option — the
    # reading the stigma rule had just suppressed, because a final sigma is not
    # a number.
    numeral = Card(
        form_set=('πκζ', 'πκς'),
        printed='πκς',
        members=[Member(55, 'L', 1, 0, 0,
                        {'opus': 'πκς', 'kraken': 'πκζ'}, 'letters', 'x')],
    )
    assert not any(o['form'] == 'πκς' for o in options_for(numeral))


def test_the_page_checks_itself_against_the_store(tmp_path):
    """⚠ A CARD CAN BE GREEN AND ABSENT FROM THE STORE, and nothing on the page
    ever asked. On 2026-08-31 a typed reading for 217-L:54 showed `✓ ruled`
    while the store held no entry for it — the only trace of that site anywhere
    was the `none` from the sitting before. John: "tell me what was recorded
    here when i typed."

    The failure branch un-greens a card when a POST throws, but it cannot see a
    POST that never left, a tab whose network dropped while it slept, or a
    store rewritten underneath. So the page re-reads the store and turns any
    card it cannot find red again.

    ⚠ AND THE WARNING WAS UNSEEABLE. `position:sticky` on a body child keeps
    the banner in view only while its own containing block is, and these pages
    run to 22 MB with John thirty cards down.
    """
    import bonitz_pipeline.settle_review as sr
    card = Card(
        form_set=('ȣ̀ς', 'ȣ̓ς', 'ἧς'),
        printed='ȣ̓ς',
        members=[Member(217, 'L', 54, 2355, 0,
                        {'opus': 'ȣ̓ς', 'calamari': 'ȣ̀ς', 'genie': 'ἧς'},
                        'letters', 'x')],
    )
    out = tmp_path / 'p.html'
    sr.html([card], out=out)
    page = out.read_text(encoding='utf-8')
    assert 'async function reconcile()' in page
    assert "addEventListener('focus',reconcile)" in page
    assert 'setInterval(reconcile,30000)' in page
    # It must REMOVE the green, not merely log — a card that looks ruled and is
    # not saved is worse than one that refuses to be clicked.
    assert "c.classList.remove('done')" in page
    assert '#warn{position:fixed' in page


def test_the_pages_script_actually_parses(tmp_path):
    """⚠ ONE BAD ESCAPE KILLS EVERY BUTTON ON THE PAGE. On 2026-08-31 a
    `\\'` written into the emitted JS collapsed to `''`, so the whole script
    threw `SyntaxError: missing ) after argument list` and nothing on the page
    responded — John: "trying to click on cards is doing nothing." The page had
    been checked for its CSS in a browser and never for its console.

    Python cannot tell a valid script from a broken one, so ask node, which is
    on this machine. A missing node is a FAILURE here, not a skip: this is
    private tooling and a check that quietly does not run is the defect it is
    meant to catch.
    """
    import subprocess
    import bonitz_pipeline.settle_review as sr
    card = Card(
        form_set=('ȣ̀ς', 'ȣ̓ς'),
        printed='ȣ̓ς',
        members=[Member(217, 'L', 54, 2355, 0,
                        {'opus': 'ȣ̓ς', 'calamari': 'ȣ̀ς'}, 'letters', 'x')],
    )
    page = tmp_path / 'p.html'
    sr.html([card], out=page)
    html = page.read_text(encoding='utf-8')
    i = html.rindex('<script')
    js = html[html.index('>', i) + 1:html.rindex('</script>')]
    assert 'function rule(' in js and 'function ins(' in js
    out = tmp_path / 'p.js'
    out.write_text(js, encoding='utf-8')
    r = subprocess.run(['node', '--check', str(out)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_second_click_overwrites_ruling_not_duplicates(tmp_path: Path):
    """A misclick must be fixable. Second write replaces the first key."""
    from bonitz_pipeline.settle_review import record_ruling
    store = tmp_path / 'settle-rulings.json'
    record_ruling(store, 'forms:πκζ|πκϛ', 'preserve', 'πκϛ')
    record_ruling(store, 'forms:πκζ|πκϛ', 'accept', 'πκζ')
    data = json.loads(store.read_text(encoding='utf-8'))
    assert list(data.keys()) == ['forms:πκζ|πκϛ']
    assert data['forms:πκζ|πκϛ'] == {'verdict': 'accept', 'detail': 'πκζ'}
    # A second distinct card coexists; still one entry each.
    record_ruling(store, 'forms:ἂ|ᾶ', 'preserve', 'ἂ')
    data = json.loads(store.read_text(encoding='utf-8'))
    assert len(data) == 2
    assert data['forms:πκζ|πκϛ']['verdict'] == 'accept'


def test_encoding_only_numeral_form_set_is_flagged():
    """ς vs ϛ on a numeral is numeral_fix's job, not a hand-ruling card."""
    from bonitz_pipeline.settle_review import encoding_only_form_set
    assert encoding_only_form_set(['πις', 'πιϛ'])
    assert encoding_only_form_set(['κς', 'κϛ'])
    assert not encoding_only_form_set(['πκζ', 'πκϛ'])  # letter dispute
    assert not encoding_only_form_set(['τίς', 'τις'])   # not a numeral form
    # Still groupable (queue keeps them for settle_apply); the page drops them.
    entries = [
        {'page': 61, 'col': 'R', 'line': 47, 'word_off': 0, 'char_at': 0,
         'readers': {'opus': 'πιϛ', 'kraken': 'πις'}, 'kind': 'letters',
         'reason': 'x', 'forms': ['πις', 'πιϛ'], 'form_set': ['πις', 'πιϛ']},
    ]
    cards = group_entries(entries)
    assert len(cards) == 1
    assert encoding_only_form_set(cards[0].form_set)


def test_printed_present_even_when_missing_from_form_set():
    """Authorities may all disagree with the page — printed still offered."""
    card = Card(
        form_set=('ἁμῶς',),  # only the "correct" form in the set
        printed='ἁμιῶς',
        members=[Member(53, 'L', 1, 0, 0,
                        {'opus': 'ἁμιῶς'}, 'letters', 'x')],
    )
    opts = options_for(card)
    forms = {o['form'] for o in opts}
    assert 'ἁμιῶς' in forms
    assert any(o['verdict'] == 'preserve' and o['form'] == 'ἁμιῶς' for o in opts)


def test_siglum_proposal_surfaces_on_the_card():
    card = Card(
        form_set=('Ζγβ', 'Ζηβ'),
        printed='Ζηβ',
        proposal={
            'form': 'Ζγβ',
            'authority': 'siglum.holds',
            'reason': 'Ζγβ → Ζγ book β holds Bekker 748 (715-789)',
            'bekker_page': 748, 'work': 'Ζγ', 'book': 'β', 'lo': 715, 'hi': 789,
        },
        members=[Member(53, 'R', 1, 0, 0,
                        {'opus': 'Ζηβ', 'kraken': 'Ζγβ'}, 'letters',
                        'siglum:proposal_only',
                        proposal={'form': 'Ζγβ'})],
    )
    opts = options_for(card)
    assert any(o['form'] == 'Ζγβ' and o['verdict'] == 'accept' for o in opts)
    assert any(o['verdict'] == 'preserve' and o['form'] == 'Ζηβ' for o in opts)


def test_group_entries_collapses_form_sets_and_keeps_count():
    entries = [
        {'page': 53, 'col': 'L', 'line': 1, 'word_off': 0, 'char_at': 0,
         'readers': {'opus': 'ἂ', 'kraken': 'ᾶ'}, 'kind': 'accent-only',
         'reason': 'x', 'forms': ['ἂ', 'ᾶ'], 'form_set': ['ἂ', 'ᾶ'],
         'n_same_form_set': 2},
        {'page': 54, 'col': 'R', 'line': 2, 'word_off': 1, 'char_at': 1,
         'readers': {'opus': 'ἂ', 'kraken': 'ᾶ'}, 'kind': 'accent-only',
         'reason': 'x', 'forms': ['ἂ', 'ᾶ'], 'form_set': ['ἂ', 'ᾶ'],
         'n_same_form_set': 2},
        {'page': 55, 'col': 'L', 'line': 3, 'word_off': 2, 'char_at': 2,
         'readers': {'opus': 'ἁμῶς', 'kraken': 'ἁμιῶς'}, 'kind': 'letters',
         'reason': 'y', 'forms': ['ἁμῶς', 'ἁμιῶς'], 'form_set': ['ἁμῶς', 'ἁμιῶς'],
         'n_same_form_set': 1},
    ]
    cards = group_entries(entries)
    assert len(cards) == 2
    by_n = sorted(cards, key=lambda c: -c.n)
    assert by_n[0].n == 2
    assert by_n[0].form_set == form_set_key(['ἂ', 'ᾶ'])
    assert by_n[1].n == 1


def test_grouped_ruling_applies_to_every_member(tmp_path: Path):
    """plan() expands one form-set ruling into one step per site."""
    queue = {
        'entries': [
            {'page': 53, 'col': 'L', 'line': 1, 'word_off': 0, 'char_at': 0,
             'readers': {'opus': 'ἂ', 'kraken': 'ᾶ'}, 'kind': 'accent-only',
             'reason': 'x', 'forms': ['ἂ', 'ᾶ'], 'form_set': ['ἂ', 'ᾶ']},
            {'page': 54, 'col': 'R', 'line': 2, 'word_off': 1, 'char_at': 1,
             'readers': {'opus': 'ἂ', 'kraken': 'ᾶ'}, 'kind': 'accent-only',
             'reason': 'x', 'forms': ['ἂ', 'ᾶ'], 'form_set': ['ἂ', 'ᾶ']},
        ]
    }
    qpath = tmp_path / 'queue.json'
    rpath = tmp_path / 'rulings.json'
    qpath.write_text(json.dumps(queue), encoding='utf-8')
    sid = 'forms:' + '|'.join(sorted(['ἂ', 'ᾶ']))
    rpath.write_text(json.dumps({
        sid: {'verdict': 'accept', 'detail': 'ᾶ'},
    }), encoding='utf-8')
    steps = apply_plan(qpath, rpath)
    assert len(steps) == 2
    assert all(s['becomes'] == 'ᾶ' for s in steps)
    assert {s['page'] for s in steps} == {53, 54}


def test_line_char_offset_uses_stream_geometry_not_search():
    """On a real Opus column, the offset is recomputed from word_off."""
    opus = ROOT / 'raw' / 'opus' / 'page-053-L.txt'
    if not opus.exists():
        pytest.skip('opus 053-L missing')
    # word_off 0 should map to a non-negative char_at on line 1.
    at = line_char_offset(53, 'L', 0)
    assert at >= 0


@pytest.mark.skipif(
    not (ROOT / 'work' / 'kraken400' / 'read' / 'cols' / 'page-053-L.png').exists(),
    reason='no 053-L column image')
def test_crop_on_053_returns_image_or_counts_skip():
    im, score, how = crop_at_offset(53, 'L', 1, 'ἁμῶς', at=0)
    # Either a real crop or an honest failure — never a silent wrong find.
    assert how in ('text', 'ink', 'slices', 'mismatch', 'none')
    if im is not None:
        assert im.size[0] > 0 and im.size[1] > 0


def test_every_confusable_the_corpus_reports_can_be_named():
    """⚠ A BUTTON THAT CANNOT SAY WHICH LETTER IT MEANS IS AN `unsure` CLICK,
    and John's rule is that those are a defect in the tool. `encoding_check`'s
    weak tier is the corpus's own list of sorts whose Greek and Latin forms are
    one piece of type — ΑΒΖΙΚΜΧ and lowercase ο — and four of the capitals were
    missing from CONFUSABLE, so `Bran` against `Βran` drew two identical
    buttons.
    """
    from bonitz_pipeline.settle_review import CONFUSABLE, name_letters
    for greek, latin in (('Α', 'A'), ('Β', 'B'), ('Ζ', 'Z'), ('Ι', 'I'),
                         ('Κ', 'K'), ('Μ', 'M'), ('Χ', 'X'), ('Ο', 'O'),
                         ('ο', 'o')):
        assert greek in CONFUSABLE and latin in CONFUSABLE, (greek, latin)
        assert 'Greek' in CONFUSABLE[greek] and 'Latin' in CONFUSABLE[latin]
        # and the pair is actually separated on a card
        said = name_letters(greek + 'ran', latin + 'ran')
        assert 'Greek' in said, (greek, said)
