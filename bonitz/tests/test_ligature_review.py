"""The ligature-breathing sitting: what the card guarantees, and what it refuses.

The card's whole claim is that one ruling may cover many sites because they
print the same thing. Every test here is that claim, or the ways it can be lost:

  * a member whose corpus text drifted is a BUILD ERROR, never a quiet drop;
  * a button inserts the missing mark and touches nothing else;
  * the ten accent-without-breathing words are a different question and stay out;
  * an exclude survives a round trip and the apply does not touch that site;
  * the apply refuses on a text mismatch rather than writing through it;
  * every enumerated site reaches a card — the volume pin.
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

import pytest

from bonitz_pipeline import ligature_review as lr
from bonitz_pipeline.ligature_review import BuildError, Card, Site

SMOOTH, ROUGH, GRAVE = lr.SMOOTH, lr.ROUGH, lr.GRAVE

COLUMN_TEXT = (
    'ἀρχὴ τῆς κινήσεως ȣκ ἔστιν\n'
    'περὶ ἀνθρώπȣ Ζιβ1. 497 b33 ϗ ἄλλα\n'
    'ϗ̀ τὰ λοιπὰ ȣ̓κ ὄντα ȣδεὶς\n'
)


def _site(tmp_path, line, char_at, form, **kw) -> Site:
    path = tmp_path / 'page-900-L.txt'
    if not path.exists():
        path.write_text(COLUMN_TEXT, encoding='utf-8')
    return Site(page=900, col='L', line=line, char_at=char_at, form=form,
                stage='reconciled', path=str(path), corpus_off=0, **kw)


# --------------------------------------------------------------------------
# classification
# --------------------------------------------------------------------------

def test_classify_separates_the_four_classes():
    assert lr.classify('ȣκ') == 'bare-ou'
    assert lr.classify('ȣ̓κ') == 'breathed-ou'
    assert lr.classify('ȣ̔τως') == 'breathed-ou'
    assert lr.classify('ȣ́σης') == 'accent-ou'
    assert lr.classify('ϗ') == 'bare-kai'
    assert lr.classify('ϗ̀') == 'marked-kai'
    assert lr.classify('λόγος') is None


def test_a_final_ligature_is_not_word_initial():
    """`ȣρανȣ` opens on one and ends on one; only the opening is in question."""
    assert lr.classify('ἀνθρώπȣ') is None
    assert lr.classify('ȣρανȣ') == 'bare-ou'


def test_accent_without_breathing_is_not_in_this_queue():
    """The ten accent-carrying words are a different question and stay out."""
    for form in ('ȣ͂', 'ȣ́σης', 'ȣ́θατα', 'ȣ͂σαν', "ȣ́τ'", 'ȣ́', 'ȣ͂ς'):
        assert lr.classify(form) == 'accent-ou'
        assert lr.classify(form) not in lr.IN_QUEUE


# --------------------------------------------------------------------------
# the missing mark, and nothing else
# --------------------------------------------------------------------------

def test_add_mark_inserts_only_the_missing_mark():
    assert lr.add_mark('ȣκ', SMOOTH) == unicodedata.normalize('NFC', 'ȣ̓κ')
    assert lr.add_mark('ȣκ', ROUGH) == unicodedata.normalize('NFC', 'ȣ̔κ')
    assert lr.add_mark('ϗ', GRAVE) == unicodedata.normalize('NFC', 'ϗ̀')


def test_add_mark_keeps_every_other_mark():
    """`ȣδεὶς` gains a breathing and keeps its grave, exactly."""
    out = lr.add_mark('ȣδεὶς', SMOOTH)
    stripped = unicodedata.normalize('NFD', out).replace(SMOOTH, '', 1)
    assert stripped == unicodedata.normalize('NFD', 'ȣδεὶς')
    assert 'ὶ' in unicodedata.normalize('NFC', out)


def test_add_mark_does_not_add_the_accent_the_word_wants():
    """οὖν needs a circumflex too. This sitting rules the breathing only."""
    out = lr.add_mark('ȣν', SMOOTH)
    d = unicodedata.normalize('NFD', out)
    assert SMOOTH in d
    assert not (lr.ACCENT_MARKS & set(d))


def test_kai_never_gets_a_second_mark():
    with pytest.raises(BuildError):
        lr.add_mark('ϗ̀', GRAVE)


def test_a_breathed_form_is_refused_a_second_breathing():
    with pytest.raises(BuildError):
        lr.add_mark('ȣ̓κ', SMOOTH)
    with pytest.raises(BuildError):
        lr.add_mark('ȣ̓κ', ROUGH)


def test_buttons_offer_both_breathings_for_ou_and_only_grave_for_kai():
    """A card whose only right answer is missing forces a wrong ruling.

    `ȣτως` is οὕτως — ROUGH — so a smooth-only card could not be answered.
    """
    forms = {o['detail'] for o in lr.options_for(Card(form='ȣτως'))}
    assert lr.add_mark('ȣτως', SMOOTH) in forms
    assert lr.add_mark('ȣτως', ROUGH) in forms
    assert 'ȣτως' in forms                       # preserve is always offered
    kai = lr.options_for(Card(form='ϗ'))
    assert [o['detail'] for o in kai] == ['ϗ', lr.add_mark('ϗ', GRAVE), '']
    assert kai[0]['verdict'] == 'preserve'       # the diplomatic option first
    assert kai[-1]['verdict'] == 'none'


# --------------------------------------------------------------------------
# byte identity
# --------------------------------------------------------------------------

def test_verify_site_passes_on_the_real_text(tmp_path):
    lr.verify_site(_site(tmp_path, 1, COLUMN_TEXT.splitlines()[0].index('ȣκ'),
                         'ȣκ'))


def test_a_tampered_member_fails_the_build(tmp_path):
    """The group's claim is byte identity, so a drifted member is fatal."""
    good = _site(tmp_path, 1, COLUMN_TEXT.splitlines()[0].index('ȣκ'), 'ȣκ')
    tampered = _site(tmp_path, 3, 0, 'ȣκ')       # line 3 opens with ϗ̀
    with pytest.raises(BuildError) as e:
        lr.build_cards([good, tampered], {})
    assert 'byte-identical' in str(e.value)


def test_a_moved_line_fails_the_build(tmp_path):
    path = tmp_path / 'page-900-L.txt'
    site = _site(tmp_path, 1, COLUMN_TEXT.splitlines()[0].index('ȣκ'), 'ȣκ')
    path.write_text('ἀρχὴ τῆς κινήσεως ȣ̓κ ἔστιν\n', encoding='utf-8')
    with pytest.raises(BuildError):
        lr.verify_site(site)


# --------------------------------------------------------------------------
# the store, and the exclude round trip
# --------------------------------------------------------------------------

def test_exclude_round_trips_and_survives_a_later_ruling(tmp_path):
    store = tmp_path / 'ligature-rulings.json'
    lr.record_exclude(store, 'forms:ȣκ', 'page-040-R:42:5', True)
    have = json.loads(store.read_text(encoding='utf-8'))
    assert have['forms:ȣκ']['excluded'] == ['page-040-R:42:5']
    assert have['forms:ȣκ']['verdict'] == ''     # an exclude is not a ruling

    lr.record_ruling(store, 'forms:ȣκ', 'accept', 'ȣ̓κ')
    have = json.loads(store.read_text(encoding='utf-8'))
    assert have['forms:ȣκ']['excluded'] == ['page-040-R:42:5']
    assert have['forms:ȣκ']['verdict'] == 'accept'

    lr.record_exclude(store, 'forms:ȣκ', 'page-040-R:42:5', False)
    have = json.loads(store.read_text(encoding='utf-8'))
    assert have['forms:ȣκ']['excluded'] == []
    assert have['forms:ȣκ']['verdict'] == 'accept'


# --------------------------------------------------------------------------
# apply
# --------------------------------------------------------------------------

@pytest.fixture
def bench(tmp_path):
    """A one-column fixture corpus, a queue over it, and a rulings store."""
    col = tmp_path / 'page-900-L.txt'
    col.write_text(COLUMN_TEXT, encoding='utf-8')
    first = COLUMN_TEXT.splitlines()[0]
    second = COLUMN_TEXT.splitlines()[1]
    sites = [
        Site(page=900, col='L', line=1, char_at=first.index('ȣκ'), form='ȣκ',
             stage='reconciled', path=str(col), corpus_off=0, word_off=17),
        Site(page=900, col='L', line=2, char_at=second.index('ϗ'), form='ϗ',
             stage='reconciled', path=str(col), corpus_off=1, word_off=40),
    ]
    card_ou = Card(form='ȣκ', members=[sites[0]], smooth_siblings=66)
    card_kai = Card(form='ϗ', members=[sites[1]])
    queue = tmp_path / 'queue-ligature.json'
    queue.write_text(json.dumps(
        lr.queue_doc([card_ou, card_kai], {}, {},
                     store=tmp_path / 'ligature-rulings.json'),
        ensure_ascii=False), encoding='utf-8')
    return {'col': col, 'queue': queue,
            'rulings': tmp_path / 'ligature-rulings.json',
            'sites': sites}


def test_apply_refuses_a_card_with_no_verdict(bench):
    """Excludes alone are a half-finished card, not a ruling."""
    lr.record_exclude(bench['rulings'], 'forms:ȣκ', bench['sites'][0].sid, True)
    p = lr.plan(bench['queue'], bench['rulings'])
    assert p['steps'] == []
    assert 'forms:ȣκ' in p['unruled'] and 'forms:ϗ' in p['unruled']


def test_apply_writes_the_accept_and_leaves_the_rest(bench):
    lr.record_ruling(bench['rulings'], 'forms:ȣκ', 'accept',
                     lr.add_mark('ȣκ', SMOOTH))
    p = lr.plan(bench['queue'], bench['rulings'])
    assert len(p['steps']) == 1
    result = lr.apply_steps(p['steps'], write=True)
    assert result['counts']['edited'] == 1
    assert result['refusals'] == []
    text = bench['col'].read_text(encoding='utf-8')
    assert unicodedata.normalize('NFC', text.splitlines()[0]).endswith(
        unicodedata.normalize('NFC', 'ȣ̓κ ἔστιν'))
    # ϗ was never ruled, so it is untouched and named.
    assert 'ϗ ἄλλα' in text
    assert 'forms:ϗ' in p['unruled']


def test_an_excluded_site_is_not_touched_and_is_named(bench):
    lr.record_exclude(bench['rulings'], 'forms:ȣκ', bench['sites'][0].sid, True)
    lr.record_ruling(bench['rulings'], 'forms:ȣκ', 'accept',
                     lr.add_mark('ȣκ', SMOOTH))
    p = lr.plan(bench['queue'], bench['rulings'])
    assert p['steps'] == []
    assert [e['member'] for e in p['excluded']] == [bench['sites'][0].sid]
    lr.apply_steps(p['steps'], write=True)
    assert 'ȣκ ἔστιν' in bench['col'].read_text(encoding='utf-8')


def test_an_excluded_site_comes_back_as_its_own_card(bench):
    """The follow-up queue is what makes the exclude a question, not a drop."""
    lr.record_exclude(bench['rulings'], 'forms:ȣκ', bench['sites'][0].sid, True)
    lr.record_ruling(bench['rulings'], 'forms:ȣκ', 'accept',
                     lr.add_mark('ȣκ', SMOOTH))
    p = lr.plan(bench['queue'], bench['rulings'])
    doc = lr.followup_doc(lr.cards_from_queue(bench['queue']), p['excluded'])
    assert doc['n_cards'] == 1 and doc['n_members'] == 1
    assert doc['cards'][0]['members'][0]['char_at'] == bench['sites'][0].char_at
    assert lr.followup_doc(lr.cards_from_queue(bench['queue']), []) is None


def test_apply_refuses_on_a_text_mismatch(bench):
    lr.record_ruling(bench['rulings'], 'forms:ȣκ', 'accept',
                     lr.add_mark('ȣκ', SMOOTH))
    p = lr.plan(bench['queue'], bench['rulings'])
    # The column moved under the ruling.
    bench['col'].write_text('ἀρχὴ τῆς κινήσεως ϗ ἔστιν\n' + '\n'.join(
        COLUMN_TEXT.splitlines()[1:]) + '\n', encoding='utf-8')
    result = lr.apply_steps(p['steps'], write=True)
    assert result['counts']['edited'] == 0
    assert result['counts']['refused'] == 1
    assert result['refusals'][0][1] == 'text_mismatch'
    assert 'ϗ ἔστιν' in bench['col'].read_text(encoding='utf-8')


def test_a_rerun_reports_already_rather_than_editing_twice(bench):
    lr.record_ruling(bench['rulings'], 'forms:ȣκ', 'accept',
                     lr.add_mark('ȣκ', SMOOTH))
    p = lr.plan(bench['queue'], bench['rulings'])
    lr.apply_steps(p['steps'], write=True)
    again = lr.apply_steps(p['steps'], write=True)
    assert again['counts']['edited'] == 0
    assert again['counts']['already'] == 1
    assert again['counts']['refused'] == 0
    # ⚠ `already` KEEPS ITS OWN LIST. It shared the refusal list once, and a
    # clean rerun of a finished queue printed 167 lines saying REFUSED.
    assert again['refusals'] == []
    assert again['already'][0][1] == 'already'


# --------------------------------------------------------------------------
# the rerun defect: pre-edit offsets on a shared printed line
# --------------------------------------------------------------------------

TWO_ON_A_LINE = 'ἀρχὴ ȣκ τῆς κινήσεως ȣχ ἔστιν ϗ τὰ λοιπά\n'


@pytest.fixture
def shared_line(tmp_path):
    """One printed line carrying three members — the shape that misreported."""
    col = tmp_path / 'page-902-L.txt'
    col.write_text(TWO_ON_A_LINE, encoding='utf-8')
    line = TWO_ON_A_LINE.splitlines()[0]
    spec = [('ȣκ', line.index('ȣκ')), ('ȣχ', line.index('ȣχ')),
            ('ϗ', line.index('ϗ'))]
    cards, sites = [], []
    for form, at in spec:
        s = Site(page=902, col='L', line=1, char_at=at, form=form,
                 stage='reconciled', path=str(col), corpus_off=at, word_off=at)
        sites.append(s)
        cards.append(Card(form=form, members=[s]))
    rulings = tmp_path / 'r.json'
    queue = tmp_path / 'q.json'
    queue.write_text(json.dumps(
        lr.queue_doc(cards, {}, {}, store=rulings),
        ensure_ascii=False), encoding='utf-8')
    for form in ('ȣκ', 'ȣχ'):
        lr.record_ruling(rulings, f'forms:{form}', 'accept',
                         lr.add_mark(form, SMOOTH))
    lr.record_ruling(rulings, 'forms:ϗ', 'accept', lr.add_mark('ϗ', GRAVE))
    return {'col': col, 'queue': queue, 'rulings': rulings, 'sites': sites}


def test_the_shift_budget_counts_only_same_line_accepts_to_the_left(shared_line):
    p = lr.plan(shared_line['queue'], shared_line['rulings'])
    steps = sorted(p['steps'], key=lambda s: s['char_at'])
    budgets = lr.shift_budget(p['steps'])
    assert [budgets[id(s)] for s in steps] == [0, 1, 2]


def test_a_rerun_over_a_shared_line_is_already_for_every_member(shared_line):
    """⚠ THE DEFECT. `char_at` is a PRE-EDIT coordinate: once the leftmost
    member gains its mark, every member to its right stands one character
    further on, and both exact checks read the wrong slice."""
    p = lr.plan(shared_line['queue'], shared_line['rulings'])
    first = lr.apply_steps(p['steps'], write=True)
    assert first['counts'] == {'edited': 3, 'preserve': 0, 'already': 0,
                               'refused': 0}
    text = shared_line['col'].read_text(encoding='utf-8')
    for form, mark in (('ȣκ', SMOOTH), ('ȣχ', SMOOTH), ('ϗ', GRAVE)):
        assert lr.add_mark(form, mark) in unicodedata.normalize('NFC', text)

    again = lr.apply_steps(p['steps'], write=True)
    assert again['counts'] == {'edited': 0, 'preserve': 0, 'already': 3,
                               'refused': 0}
    assert again['refusals'] == []
    assert shared_line['col'].read_text(encoding='utf-8') == text


def test_the_shift_window_never_authorises_a_first_time_write(shared_line):
    """The tolerance may conclude `already` and nothing else.

    A site a neighbour moved which has NOT been written is refused loudly —
    writing it at a guessed offset is the failure the window must not open.
    """
    p = lr.plan(shared_line['queue'], shared_line['rulings'])
    left = min(p['steps'], key=lambda s: s['char_at'])
    right = max(p['steps'], key=lambda s: s['char_at'])
    # Apply only the leftmost, which shifts the others.
    lr.apply_steps([left], write=True)
    before = shared_line['col'].read_text(encoding='utf-8')
    result = lr.apply_steps([right], write=True)
    assert result['counts']['edited'] == 0
    assert result['counts']['already'] == 0
    assert result['refusals'] == [(right['member'], 'text_mismatch')]
    assert shared_line['col'].read_text(encoding='utf-8') == before


def test_the_live_queue_reruns_clean(bench=None):
    """The real 167-site apply, rerun: every site already, nothing refused.

    ⚠ THIS READS THE REAL CORPUS AND WRITES NOTHING. It is the pin that the
    finished sitting stays legible — a rerun that reports 13 mismatches on a
    corpus that is correct sends the next reader after a bug that is not there.
    """
    if not (lr.QUEUE.exists() and lr.RULINGS.exists()):
        pytest.skip('the live queue or its rulings are not on disk')
    p = lr.plan()
    result = lr.apply_steps(p['steps'], write=False)
    # ⚠ ONE MISMATCH, NAMED — AND IT IS NOT A LOST RULING. On 2026-08-13 John
    # ruled the audit card at page-016-L:61 and the line's `(i e ȣ̓χ ἀγαθόν)`
    # became `(i e ȣ̓κ ἀγαθόν)`: the ink prints a kappa. His ligature ruling
    # there was `forms:ȣχ` → `ȣ̓χ`, and it was a ruling about the BREATHING,
    # which is still on the ligature. What no longer matches is the form-set's
    # spelling of the letter AFTER it, which that card never asked about.
    # Named rather than tolerated: a bare `refused <= 1` would let a real
    # mismatch hide behind this one.
    # ⚠ THERE WAS A SECOND, AND THE SWEEP THIS TEST ASKED FOR HAS RUN.
    # page-029-R:17 refused because John's audit ruling spelt the elision with
    # an ASCII apostrophe where this form-set has U+2019 — the codepoint of a
    # mark neither card ever asked about. The corpus now spells it U+2019
    # everywhere (`bonitz_pipeline.elision`) and the recorded forms are read
    # through the same fold, so that site applies and 166 of the 167 steps are
    # done. One left, and it is the kappa above.
    assert [m for m, _ in result['refusals']] == ['page-016-L:61:39']
    assert result['counts']['refused'] == 1
    assert result['counts']['edited'] == 0
    assert result['counts']['already'] == 166 and len(p['steps']) == 167


def test_none_sets_the_sites_aside_and_writes_nothing(bench):
    lr.record_ruling(bench['rulings'], 'forms:ȣκ', 'none', '')
    p = lr.plan(bench['queue'], bench['rulings'])
    assert p['steps'] == []
    assert [a['member'] for a in p['aside']] == [bench['sites'][0].sid]


def test_a_preserve_banks_a_corrigendum_only_where_it_overrules_something():
    """An erratum that corrects nothing hides the ones that do."""
    overruled = {'sid': 'forms:ȣκ', 'page': 40, 'col': 'R', 'line': 42,
                 'verdict': 'preserve', 'printed': 'ȣκ', 'becomes': 'ȣκ',
                 'smooth_siblings': 66, 'rough_siblings': 0}
    lone = dict(overruled, sid='forms:ȣτω', line=16, printed='ȣτω',
                becomes='ȣτω', smooth_siblings=0, rough_siblings=0)
    out = lr.corrigenda_for([overruled, lone])
    assert len(out) == 1
    assert out[0]['printed'] == 'ȣκ'
    assert out[0]['correct'] == lr.add_mark('ȣκ', SMOOTH)


def test_an_accept_banks_nothing():
    step = {'sid': 'forms:ȣκ', 'page': 40, 'col': 'R', 'line': 42,
            'verdict': 'accept', 'printed': 'ȣκ',
            'becomes': lr.add_mark('ȣκ', SMOOTH),
            'smooth_siblings': 66, 'rough_siblings': 0}
    assert lr.corrigenda_for([step]) == []


# --------------------------------------------------------------------------
# the corpus itself
# --------------------------------------------------------------------------

def test_the_volume_pin_nothing_is_dropped_between_sites_and_cards():
    """Every enumerated site reaches a card, and every card member came from one.

    ⚠ THE FAILURE THIS PINS. A queue that silently holds fewer sites than the
    sweep found reads exactly like a queue that found fewer — which is how this
    project has lost work four times.
    """
    sites, counts = lr.enumerate_sites()
    cards = lr.build_cards(sites, lr.sibling_counts())
    assert sum(c.n for c in cards) == len(sites)
    # ⚠ `.get`, NOT `[...]`. A class the corpus no longer holds is absent from
    # the tally, and the applier EMPTIES classes by design — once the ϗ ruling
    # landed there were no bare-kai left and this pin died on a KeyError while
    # the invariant it guards was perfectly intact.
    assert len(sites) == counts.get('bare-ou', 0) + counts.get('bare-kai', 0)
    assert {m.sid for c in cards for m in c.members} == {s.sid for s in sites}


def test_no_queue_member_carries_a_breathing_or_an_accent_on_its_ligature():
    sites, _ = lr.enumerate_sites()
    for s in sites:
        assert lr.classify(s.form) in lr.IN_QUEUE, s.form
        _lig, marks = lr.ligature_marks(s.form)
        assert marks == '', (s.sid, s.form)


def test_every_card_can_build_its_buttons():
    """A card whose buttons cannot be built is a card John cannot answer."""
    sites, _ = lr.enumerate_sites()
    for card in lr.build_cards(sites, lr.sibling_counts()):
        opts = lr.options_for(card)
        assert opts[0]['verdict'] == 'preserve'
        assert opts[-1]['verdict'] == 'none'
        assert all(o['consequence'] for o in opts)


# --------------------------------------------------------------------------
# the combined-marks sitting: two marks, sometimes on two different letters
# --------------------------------------------------------------------------

ACUTE, CIRCUMFLEX = '́', '͂'

# The seven forms, their recipes, and the exact codepoints they must produce.
COMBINED = {
    'ȣν':    (((0, SMOOTH), (0, CIRCUMFLEX)), 'ȣ̓͂ν'),
    "ȣτ'":   (((0, SMOOTH), (0, ACUTE)), "ȣ̓́τ'"),
    'ȣτε':   (((0, SMOOTH), (0, ACUTE)), 'ȣ̓́τε'),
    'ȣτως':  (((0, ROUGH), (0, ACUTE)), 'ȣ̔́τως'),
    'ȣτος':  (((0, ROUGH), (0, CIRCUMFLEX)), 'ȣ̔͂τος'),
    'ȣτω':   (((0, ROUGH), (0, ACUTE)), 'ȣ̔́τω'),
    'ȣρανȣ': (((0, SMOOTH), (1, CIRCUMFLEX)), 'ȣ̓ρανȣ͂'),
}


@pytest.mark.parametrize('form,recipe,want', [
    (f, r, w) for f, (r, w) in COMBINED.items()])
def test_compose_builds_each_corrected_form_exactly(form, recipe, want):
    got = lr.compose(form, recipe)
    assert unicodedata.normalize('NFC', got) == unicodedata.normalize('NFC',
                                                                      want)
    # Strip the marks named and the printed form comes back — nothing else moved.
    back = unicodedata.normalize('NFD', got)
    for _occ, mark in recipe:
        back = back.replace(mark, '', 1)
    assert back == unicodedata.normalize('NFD', form)


def test_compose_puts_the_marks_on_the_letters_named():
    """οὐρανοῦ takes a smooth on the ou it opens with and a circumflex on the
    ou it ends with — two marks, two different letters."""
    got = unicodedata.normalize('NFD', lr.compose(
        'ȣρανȣ', ((0, SMOOTH), (1, CIRCUMFLEX))))
    assert got.index(SMOOTH) == 1                    # right after the first ȣ
    assert got.index(CIRCUMFLEX) == got.rindex('ȣ') + 1
    assert lr.marks_of(got) == ((0, SMOOTH), (1, CIRCUMFLEX))


def test_compose_orders_the_breathing_before_the_accent():
    d = unicodedata.normalize('NFD', lr.compose('ȣτε', ((0, ACUTE),
                                                        (0, SMOOTH))))
    assert d.index(SMOOTH) < d.index(ACUTE)


def test_compose_keeps_add_marks_discipline():
    """The single-mark rule is not weakened, it is applied once per mark."""
    with pytest.raises(BuildError):            # a breathing already there
        lr.compose('ȣ̓κ', ((0, ROUGH),))
    with pytest.raises(BuildError):            # the same mark twice
        lr.compose('ȣτε', ((0, SMOOTH), (0, SMOOTH)))
    # ⚠ Two DIFFERENT accents in ONE call: neither is on the form yet, so this
    # slipped through until the running tally was added. A vowel under two
    # accents is what `settle_apply.impossible_reason` refuses outright.
    with pytest.raises(BuildError):            # two accents on one ligature
        lr.compose('ȣτε', ((0, ACUTE), (0, CIRCUMFLEX)))
    with pytest.raises(BuildError):            # two breathings on one ligature
        lr.compose('ȣτε', ((0, SMOOTH), (0, ROUGH)))
    with pytest.raises(BuildError):            # no such ligature
        lr.compose('ȣτε', ((1, ACUTE),))
    with pytest.raises(BuildError):            # nothing to mark
        lr.compose('λόγος', ((0, SMOOTH),))


def test_name_composed_says_which_letter_only_when_it_must():
    assert lr.name_composed('ȣτε', ((0, SMOOTH), (0, ACUTE))) == \
        'smooth + acute'
    names = lr.name_composed('ȣρανȣ', ((0, SMOOTH), (1, CIRCUMFLEX)))
    assert 'smooth on the first ou-ligature' in names
    assert 'circumflex on the last ou-ligature' in names


COMBINED_CORPUS = (
    # the bare sites this sitting asks about
    "ȣν τι ϗ ȣτ' ἄλλο ϗ ȣτε τόδε ϗ ȣρανȣ μέρος\n"
    # attested corrected forms for two of them
    'ȣ̓͂ν γε ϗ ȣ̓́τε μὴν ϗ ȣ̓ρανȣ͂ πέρι\n'
    # ⚠ and the cousin that is itself the defect: acute, no breathing
    "ȣ́τ' ἐστίν\n"
)


@pytest.fixture
def combined_bench(tmp_path, monkeypatch):
    col = tmp_path / 'page-904-L.txt'
    col.write_text(COMBINED_CORPUS, encoding='utf-8')
    monkeypatch.setattr(lr, 'corpus_columns', lambda pages=None: [col])
    return {'col': col, 'rulings': tmp_path / 'main-rulings.json'}


def test_a_candidate_is_taken_from_the_corpus_where_the_corpus_has_one(
        combined_bench):
    attested = lr.attested_forms()
    cands, note = lr.candidates_for('ȣτε', attested)
    assert len(cands) == 1
    assert cands[0]['form'] == lr.compose('ȣτε', ((0, SMOOTH), (0, ACUTE)))
    assert cands[0]['source'] == 'corpus' and cands[0]['seen'] == 1
    assert not note


def test_a_candidate_falls_back_to_the_standard_word_when_it_does_not(
        combined_bench):
    attested = lr.attested_forms()
    cands, _note = lr.candidates_for('ȣτος', attested)
    assert len(cands) == 1
    assert cands[0]['form'] == lr.compose('ȣτος', ((0, ROUGH), (0, CIRCUMFLEX)))
    assert cands[0]['source'] == 'standard' and cands[0]['seen'] == 0
    # And the button must say the corpus does not write it that way.
    card = Card(form='ȣτος', candidates=cands)
    acc = [o for o in lr.options_for(card) if o['verdict'] == 'accept'][0]
    assert 'not written this way anywhere in the corpus' in acc['consequence']
    assert 'standard spelling' in acc['consequence']


def test_an_attested_cousin_that_lacks_a_breathing_is_never_offered(
        combined_bench):
    """⚠ `ȣ́τ'` IS ATTESTED AND IT IS THE DEFECT. Acute, no breathing — itself
    one of the ten accent-without-breathing words. Offering it would answer a
    lost breathing with another lost breathing, so it is refused a button and
    stated in the note instead."""
    attested = lr.attested_forms()
    assert "ȣ́τ'" in attested[lr._skeleton("ȣτ'")]
    cands, note = lr.candidates_for("ȣτ'", attested)
    assert [c['source'] for c in cands] == ['standard']
    assert cands[0]['form'] == lr.compose("ȣτ'", ((0, SMOOTH), (0, ACUTE)))
    assert "ȣ́τ'" in note and 'no breathing' in note


def test_a_combined_card_offers_the_whole_word_and_never_the_half(
        combined_bench):
    cards = {c.form: c for c in lr.combined_cards(
        ('ȣν', "ȣτ'", 'ȣτε', 'ȣρανȣ'), rulings_path=combined_bench['rulings'])}
    for form, card in cards.items():
        opts = lr.options_for(card)
        assert opts[0]['verdict'] == 'preserve' and opts[0]['detail'] == form
        assert opts[-1]['verdict'] == 'none'
        accepts = {o['detail'] for o in opts if o['verdict'] == 'accept'}
        assert accepts == {c['form'] for c in card.candidates}
        # the breathing-only half answer is not among them
        assert lr.add_mark(form, SMOOTH) not in accepts
        assert lr.add_mark(form, ROUGH) not in accepts


def test_illegal_accept_on_a_combined_card_takes_only_the_composed_form():
    card = Card(form='ȣν', candidates=[{
        'form': lr.compose('ȣν', ((0, SMOOTH), (0, CIRCUMFLEX))),
        'marks': [[0, SMOOTH], [0, CIRCUMFLEX]], 'names': 'smooth + circumflex',
        'seen': 4, 'source': 'corpus'}])
    assert lr.illegal_accept(card, lr.compose(
        'ȣν', ((0, SMOOTH), (0, CIRCUMFLEX)))) == ''
    for bad in (lr.add_mark('ȣν', SMOOTH),      # the half answer John refused
                lr.add_mark('ȣν', ROUGH),
                lr.compose('ȣν', ((0, ROUGH), (0, CIRCUMFLEX))),
                'ȣν', 'GARBAGE', ''):
        assert lr.illegal_accept(card, bad), bad


def test_a_site_excluded_in_the_main_sitting_is_not_asked_again(
        combined_bench):
    """It is already in the follow-up queue; two sittings on one piece of ink
    would collect two rulings for it."""
    all_cards = lr.combined_cards(('ȣτε',),
                                  rulings_path=combined_bench['rulings'])
    victim = all_cards[0].members[0]
    lr.record_exclude(combined_bench['rulings'], 'forms:ȣτε', victim.sid, True)
    with pytest.raises(BuildError) as e:
        lr.combined_cards(('ȣτε',), rulings_path=combined_bench['rulings'])
    assert 'no unruled sites left' in str(e.value)


def test_a_form_with_no_sites_left_raises_rather_than_vanishing(
        combined_bench):
    with pytest.raises(BuildError) as e:
        lr.combined_cards(('ȣτως',), rulings_path=combined_bench['rulings'])
    assert 'ȣτως' in str(e.value)


def test_the_live_combined_queue_matches_the_seven_forms():
    """The queue on disk: seven cards, and every target as specified."""
    if not lr.COMBINED_QUEUE.exists():
        pytest.skip('the combined queue has not been built')
    doc = json.loads(lr.COMBINED_QUEUE.read_text(encoding='utf-8'))
    assert doc['store'].endswith('ligature-combined-rulings.json')
    cards = lr.cards_from_queue(lr.COMBINED_QUEUE)
    assert {c.form for c in cards} == set(lr.COMBINED_FORMS)
    assert sum(c.n for c in cards) == doc['n_members']
    for card in cards:
        want = unicodedata.normalize('NFC', COMBINED[card.form][1])
        assert [c['form'] for c in card.candidates] == [want], card.form
        assert lr.illegal_accept(card, want) == ''


def test_the_serve_guard_refuses_a_queue_pointed_at_another_store(tmp_path):
    """A mistyped --rulings would file answers about one question under
    another question's key, silently."""
    queue = tmp_path / 'q.json'
    doc = lr.queue_doc([], {}, {}, store=tmp_path / 'right.json')
    queue.write_text(json.dumps(doc, ensure_ascii=False), encoding='utf-8')

    class A:
        pass
    a = A()
    a.queue, a.rulings = queue, tmp_path / 'wrong.json'
    a.port, a.wifi, a.only_unruled = 0, False, False
    assert lr.cmd_serve(a) == 2


def test_the_crop_directory_is_gitignored():
    """192 PNGs of an 1870 leaf must not be one `git add` from history.

    ⚠ AN ALLOWLIST FAILS SILENTLY. `work/sweeps/` is re-included by a negation,
    so a crop directory of my own naming next to it was untracked-but-addable —
    which is exactly how three leaves of this book reached a public repo.
    """
    import subprocess
    rel = lr.CROPS.relative_to(lr.ROOT)
    out = subprocess.run(['git', 'check-ignore', '-q', str(rel / 'x.png')],
                         cwd=lr.ROOT, capture_output=True)
    if out.returncode == 128:
        pytest.skip('not a git checkout')
    assert out.returncode == 0, f'{rel} is not gitignored'


# --------------------------------------------------------------------------
# FIX 1 — sibling evidence must count the whole word, not the unaccented shell
# --------------------------------------------------------------------------

def test_the_skeleton_strips_accents_as_well_as_breathings():
    """⚠ THE BUG THIS PINS. The rough οὕτω family prints `ȣ̔́τω` — rough AND
    acute — so a breathing-only strip left `ȣ́τω`, which never matched the bare
    card form `ȣτω`; and `ϗ̀` kept its grave, so the ϗ card looked up an empty
    bucket while the corpus held 760."""
    assert lr._skeleton('ȣ̔́τω') == 'ȣτω'
    assert lr._skeleton('ϗ̀') == 'ϗ'
    assert lr._skeleton('ȣ̓κ') == 'ȣκ'
    # One word, one pool: the accent is not the question in this sitting.
    assert lr._skeleton('ȣ̓δὲν') == lr._skeleton('ȣ̓δέν') == 'ȣδεν'
    # Iota subscript is the word, not its accent, and must survive.
    assert 'ᾳ' in lr._skeleton('ȣδεμιᾷ')


# ⚠ A COUNT FROM THE LIVE CORPUS IS A MOMENT, NOT A RULE. These pins first
# froze the real numbers — ȣτως rough 6, ȣτω rough 7, ϗ grave 760 — and the
# apply then wrote 167 breathings into that same corpus, emptying `bare-kai`
# entirely and taking the ϗ card with it. The pins died on a KeyError while the
# fix they guard was working perfectly. A test that has to be re-typed after
# every run of the pipeline it tests is not a guard, so the exact arithmetic is
# pinned on a FIXTURE corpus below, and the live corpus is asked only for things
# that stay true as it advances.
FIXTURE_CORPUS = (
    # bare forms — the queue's business
    'ȣτως ἐπάγειν ϗ ȣτω δια ȣκ ἔστιν\n'
    # their marked siblings, as this book actually prints them:
    # rough AND acute together, which a breathing-only strip could not match
    'ȣ̔́τως μὲν ȣ̔́τως δὲ ȣ̔́τω γὰρ\n'
    'ϗ̀ τὰ ϗ̀ τῶν ϗ̀ μὲν\n'
    'ȣ̓κ ἔστι ȣ̓κ ἄρα\n'
)


@pytest.fixture
def fixture_cards(tmp_path, monkeypatch):
    """Cards built over a corpus this test owns, so the numbers cannot drift."""
    col = tmp_path / 'page-903-L.txt'
    col.write_text(FIXTURE_CORPUS, encoding='utf-8')
    monkeypatch.setattr(lr, 'corpus_columns', lambda pages=None: [col])
    sites, counts = lr.enumerate_sites(root=tmp_path)
    return ({c.form: c for c in lr.build_cards(sites, lr.sibling_counts())},
            counts)


def test_a_rough_plus_acute_sibling_is_counted_under_the_bare_form(fixture_cards):
    """⚠ THE ARITHMETIC THE LIVE CORPUS ONCE SHOWED AS 6 AND 7, PINNED FOR GOOD.
    `ȣ̔́τως` carries rough AND acute; stripping only the breathing left `ȣ́τως`,
    which never matched the bare card form, so the card said "never"."""
    cards, _ = fixture_cards
    assert cards['ȣτως'].rough_siblings == 2
    assert cards['ȣτως'].smooth_siblings == 0
    assert cards['ȣτω'].rough_siblings == 1
    rough = [o for o in lr.options_for(cards['ȣτως'])
             if o['detail'] == lr.add_mark('ȣτως', ROUGH)]
    assert '2× elsewhere' in rough[0]['consequence']
    assert 'never writes it' not in rough[0]['consequence']


def test_the_kai_card_counts_the_grave_and_says_so(fixture_cards):
    """`ϗ̀` keeps its grave under a breathing-only strip, so the ϗ card looked
    up an empty bucket while the corpus held every attestation there is."""
    cards, _ = fixture_cards
    card = cards['ϗ']
    assert card.grave_siblings == 3
    assert lr.evidence_line(card) == 'grave 3×'
    grave = [o for o in lr.options_for(card) if o['verdict'] == 'accept']
    assert len(grave) == 1
    assert '3× elsewhere' in grave[0]['consequence']
    assert 'never writes it' not in grave[0]['consequence']


def test_a_truly_unattested_form_still_says_never(fixture_cards):
    """The fix must not invent evidence: `ȣκ` has a smooth sibling here and no
    rough one, and the rough button must keep saying so."""
    cards, _ = fixture_cards
    assert cards['ȣκ'].smooth_siblings == 2
    assert cards['ȣκ'].rough_siblings == 0
    rough = [o for o in lr.options_for(cards['ȣκ'])
             if o['detail'] == lr.add_mark('ȣκ', ROUGH)]
    assert 'never writes it this way' in rough[0]['consequence']


def test_the_live_corpus_never_reports_never_against_its_own_attestations():
    """The rule, on whatever the corpus currently holds.

    Recomputed rather than frozen: for every card still in the queue, the
    evidence must equal the corpus's own count of marked tokens sharing its
    skeleton. This is what the breathing-only strip got wrong, and it stays
    true however many sittings have landed.
    """
    sites, _ = lr.enumerate_sites()
    if not sites:
        pytest.skip('no bare ligatures left in the corpus')
    sibs = lr.sibling_counts()
    for card in lr.build_cards(sites, sibs):
        bucket = sibs.get(lr._skeleton(card.form), {})
        assert card.smooth_siblings == bucket.get('smooth', 0)
        assert card.rough_siblings == bucket.get('rough', 0)
        assert card.grave_siblings == bucket.get('grave', 0)
        for o in lr.options_for(card):
            if o['verdict'] != 'accept':
                continue
            name = ('grave' if card.is_kai else
                    'rough' if ROUGH in unicodedata.normalize('NFD', o['detail'])
                    else 'smooth')
            n = bucket.get(name, 0)
            if n:
                assert f'{n}× elsewhere' in o['consequence'], (card.form, name)
            else:
                assert 'never writes it this way' in o['consequence']


def test_a_preserve_on_the_kai_card_banks_a_corrigendum():
    """Preserving a bare ϗ overrules 760 graves — that is what a corrigendum is
    for, and the breathings-only check banked nothing."""
    step = {'sid': 'forms:ϗ', 'page': 50, 'col': 'R', 'line': 1,
            'verdict': 'preserve', 'printed': 'ϗ', 'becomes': 'ϗ',
            'smooth_siblings': 0, 'rough_siblings': 0, 'grave_siblings': 760}
    out = lr.corrigenda_for([step])
    assert len(out) == 1
    assert out[0]['correct'] == lr.add_mark('ϗ', GRAVE)


# --------------------------------------------------------------------------
# FIX 2 — the store must not lose a write to a race
# --------------------------------------------------------------------------

def _free_port() -> int:
    import socket
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def live(bench, tmp_path):
    """The real server, on an ephemeral port, over the fixture queue."""
    import http.client
    import socket
    import threading
    import time
    cards = lr.cards_from_queue(bench['queue'])
    page = tmp_path / 'page.html'
    lr.html(cards, page)
    port = _free_port()
    t = threading.Thread(
        target=lr.serve, args=(cards, port, '127.0.0.1'),
        kwargs={'page': page, 'store': bench['rulings'],
                'crops': tmp_path / 'crops'},
        daemon=True)
    t.start()
    for _ in range(100):
        try:
            socket.create_connection(('127.0.0.1', port), 0.2).close()
            break
        except OSError:
            time.sleep(0.05)
    else:
        pytest.skip('the review server did not come up')

    def post(path, body):
        c = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
        c.request('POST', path, json.dumps(body).encode('utf-8'),
                  {'Content-Type': 'application/json'})
        r = c.getresponse()
        out = (r.status, r.read().decode('utf-8'))
        c.close()
        return out
    return {'post': post, 'port': port, **bench}


def test_two_threads_posting_at_once_never_lose_a_write(live):
    """⚠ A SILENTLY LOST EXCLUDE IS THE WORST FAILURE THIS DESIGN HAS. Two fast
    taps — the exclude, then the verdict — are the normal sitting, and an
    unlocked read-modify-write of the whole JSON drops whichever landed first."""
    import threading
    detail = lr.add_mark('ȣκ', SMOOTH)
    errors = []

    def excluder():
        for _ in range(50):
            code, why = live['post'](
                '/exclude', {'id': 'forms:ϗ', 'site': live['sites'][1].sid,
                             'excluded': True})
            if code != 204:
                errors.append(('exclude', code, why))

    def ruler():
        for _ in range(50):
            code, why = live['post']('/ruling', {'id': 'forms:ȣκ',
                                                 'verdict': 'accept',
                                                 'detail': detail})
            if code != 204:
                errors.append(('ruling', code, why))

    ts = [threading.Thread(target=excluder), threading.Thread(target=ruler)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert not errors, errors
    have = json.loads(live['rulings'].read_text(encoding='utf-8'))
    # Both survive: neither writer clobbered the other's key.
    assert have['forms:ϗ']['excluded'] == [live['sites'][1].sid]
    assert have['forms:ȣκ']['verdict'] == 'accept'
    assert have['forms:ȣκ']['detail'] == detail


def test_an_exclude_and_a_ruling_racing_from_empty_both_survive(live):
    """The interleave that actually loses data: both read {} and both write."""
    import threading
    detail = lr.add_mark('ȣκ', SMOOTH)

    for _ in range(50):
        live['rulings'].write_text('{}', encoding='utf-8')
        barrier = threading.Barrier(2)

        def a():
            barrier.wait()
            live['post']('/ruling', {'id': 'forms:ȣκ', 'verdict': 'accept',
                                     'detail': detail})

        def b():
            barrier.wait()
            live['post']('/exclude', {'id': 'forms:ϗ',
                                      'site': live['sites'][1].sid,
                                      'excluded': True})
        ts = [threading.Thread(target=a), threading.Thread(target=b)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        have = json.loads(live['rulings'].read_text(encoding='utf-8'))
        assert set(have) == {'forms:ȣκ', 'forms:ϗ'}, have


# --------------------------------------------------------------------------
# FIX 3 — a ruling that binds nothing is not a ruling
# --------------------------------------------------------------------------

def test_a_ruling_on_an_all_excluded_card_is_refused(live):
    """Otherwise the card goes green, the counter advances, and apply produces
    zero steps — the sitting reads DONE with that form decided nowhere."""
    code, _ = live['post']('/exclude', {'id': 'forms:ϗ',
                                        'site': live['sites'][1].sid,
                                        'excluded': True})
    assert code == 204
    code, why = live['post']('/ruling', {'id': 'forms:ϗ',
                                         'verdict': 'preserve',
                                         'detail': 'ϗ'})
    assert code == 400
    assert 'excluded' in why and 'bind no site' in why
    have = json.loads(live['rulings'].read_text(encoding='utf-8'))
    assert have['forms:ϗ']['verdict'] == ''       # nothing was recorded

    # Put the crop back and the same ruling is taken.
    live['post']('/exclude', {'id': 'forms:ϗ', 'site': live['sites'][1].sid,
                              'excluded': False})
    code, _ = live['post']('/ruling', {'id': 'forms:ϗ', 'verdict': 'preserve',
                                       'detail': 'ϗ'})
    assert code == 204


def test_all_excluded_is_computed_from_the_members():
    card = Card(form='ȣκ', members=[
        Site(page=1, col='L', line=1, char_at=0, form='ȣκ', stage='x',
             path='x', corpus_off=0)])
    assert lr.all_excluded(card, ['page-001-L:1:0'])
    assert not lr.all_excluded(card, [])
    assert not lr.all_excluded(Card(form='ȣκ'), [])   # no members, no ruling


# --------------------------------------------------------------------------
# FIX 4 — the store is not the UI, and its `detail` is written to the corpus
# --------------------------------------------------------------------------

@pytest.mark.parametrize('payload', ['GARBAGE', 'ȣ̓̔κ'])
def test_an_illegal_accept_never_reaches_the_corpus(bench, payload):
    """The reviewer's two payloads: a form no card offers, and a double
    breathing that `add_mark` would never produce."""
    lr.record_ruling(bench['rulings'], 'forms:ȣκ', 'accept', payload)
    p = lr.plan(bench['queue'], bench['rulings'])
    assert p['steps'] == []
    assert [e['sid'] for e in p['illegal']] == ['forms:ȣκ']
    assert 'not a reading this card offers' in p['illegal'][0]['why']
    lr.apply_steps(p['steps'], write=True)
    assert 'ȣκ ἔστιν' in bench['col'].read_text(encoding='utf-8')


@pytest.mark.parametrize('payload', ['GARBAGE', 'ȣ̓̔κ', ''])
def test_the_server_refuses_an_illegal_accept_outright(live, payload):
    code, why = live['post']('/ruling', {'id': 'forms:ȣκ', 'verdict': 'accept',
                                         'detail': payload})
    assert code == 400, why
    assert not live['rulings'].exists() or 'forms:ȣκ' not in json.loads(
        live['rulings'].read_text(encoding='utf-8'))


def test_illegal_accept_accepts_exactly_what_the_card_offers():
    card = Card(form='ȣκ')
    for good in lr.offered_accepts(card):
        assert lr.illegal_accept(card, good) == ''
    for bad in ('GARBAGE', 'ȣ̓̔κ', 'ȣ̀κ', 'ȣκ', 'οὐκ', ''):
        assert lr.illegal_accept(card, bad)
    kai = Card(form='ϗ')
    assert lr.illegal_accept(kai, lr.add_mark('ϗ', GRAVE)) == ''
    assert lr.illegal_accept(kai, lr.add_mark('ϗ', SMOOTH))


def test_a_diverged_line_geometry_refuses_the_whole_file(tmp_path):
    """The latent normalizer split, made loud — with a real junk line.

    Enumeration and `_verify` count lines in `clean_opus(NFC(text))`; the write
    counts them in the RAW file, because a diplomatic transcription is edited
    exactly as it sits on disk. A dropped junk line shifts every line number
    after it: `_verify` passes on the cleaned text and the write lands
    somewhere else. Today no column has one — so this manufactures one.
    """
    col = tmp_path / 'page-901-L.txt'
    col.write_text('---\n' + COLUMN_TEXT, encoding='utf-8')
    from bonitz_pipeline.normalize import clean_opus as _clean
    cleaned = _clean(col.read_text(encoding='utf-8')).splitlines()
    assert len(cleaned) < len(col.read_text(encoding='utf-8').splitlines())
    at = cleaned[0].index('ȣκ')
    site = Site(page=901, col='L', line=1, char_at=at, form='ȣκ',
                stage='reconciled', path=str(col), corpus_off=0, word_off=0)
    # The site verifies fine — that is exactly why the write must check too.
    lr.verify_site(site)

    rulings = tmp_path / 'r.json'
    queue = tmp_path / 'q.json'
    queue.write_text(json.dumps(
        lr.queue_doc([Card(form='ȣκ', members=[site])], {}, {},
                     store=rulings),
        ensure_ascii=False), encoding='utf-8')
    lr.record_ruling(rulings, 'forms:ȣκ', 'accept', lr.add_mark('ȣκ', SMOOTH))
    p = lr.plan(queue, rulings)
    assert len(p['steps']) == 1

    result = lr.apply_steps(p['steps'], write=True)
    assert result['counts']['edited'] == 0
    assert result['counts']['refused'] == 1
    assert result['refusals'][0][1] == 'line_geometry_diverged'
    assert col.read_text(encoding='utf-8') == '---\n' + COLUMN_TEXT


def test_the_mixed_breathing_warning_fires_where_the_corpus_is_split():
    """`ȣ` alone is both οὐ and οὗ once the breathing is gone. Say so.

    Stated as a rule over whatever cards exist, not over a fixed list: a card is
    warned exactly when the corpus writes its word both ways.
    """
    sibs = lr.sibling_counts()
    cards = lr.build_cards(lr.enumerate_sites()[0], sibs)
    if not cards:
        pytest.skip('no bare ligatures left in the corpus')
    for card in cards:
        both = bool(card.smooth_siblings and card.rough_siblings)
        assert bool(lr.mixed_warning(card)) == (both and not card.is_kai), \
            card.form
    assert not lr.mixed_warning(Card(form='ϗ', grave_siblings=760))


def test_the_mixed_warning_names_both_counts():
    card = Card(form='ȣ', smooth_siblings=57, rough_siblings=19)
    why = lr.mixed_warning(card)
    assert 'smooth 57×' in why and 'rough 19×' in why
    assert not lr.mixed_warning(Card(form='ȣκ', smooth_siblings=66))


# --------------------------------------------------------------------------
# the excluded-site follow-up, rebuilt after John lost a sitting to it
# --------------------------------------------------------------------------

def test_a_card_key_makes_the_sid_per_site_not_per_form():
    """⚠ THE FIRST DEFECT. The follow-up re-grouped nine excluded `ȣ` sites onto
    one card — the one thing an exclude rules out — and John's card mixed
    smooth+acute ink (οὔ) with smooth+circumflex ink (οὗ)."""
    s = Site(page=15, col='R', line=43, char_at=51, form='ȣ',
             stage='reconciled', path='x', corpus_off=0)
    assert Card(form='ȣ', members=[s]).sid == 'forms:ȣ'
    assert Card(form='ȣ', members=[s], key=f'site:{s.sid}').sid == \
        'site:page-015-R:43:51'


def test_a_site_keyed_card_never_inherits_a_form_keyed_verdict(tmp_path):
    """His four `none` rulings were verdicts on DEFECTIVE cards, and the
    rebuilt per-site cards had to ask again.

    ⚠ FROZEN ONTO A FIXTURE. The live form of this pin asserted the store and
    the queue shared NO keys — true only while the rebuilt sitting was still
    open. John has since ruled all twelve, so the store now holds twelve
    `site:` verdicts that legitimately match, and the pin would have to be
    deleted rather than kept. The claim that matters is a DIRECTION, not a
    disjointness: a `site:` card never picks up a `forms:` verdict.
    """
    store = tmp_path / 'store.json'
    lr.record_ruling(store, 'forms:ȣ', 'none', '')
    s = Site(page=15, col='R', line=43, char_at=51, form='ȣ',
             stage='reconciled', path='x', corpus_off=0)
    card = Card(form='ȣ', members=[s], key=f'site:{s.sid}')
    have = json.loads(store.read_text(encoding='utf-8'))
    assert card.sid == 'site:page-015-R:43:51'
    assert card.sid not in have          # the old verdict cannot reach it
    assert 'forms:ȣ' in have             # and it is still on record


def test_the_closed_sitting_keeps_the_direction_on_disk():
    """On the real store: every key that binds a card is `site:`-keyed, and
    every `forms:` key is an orphan of the superseded sitting."""
    if not lr.FOLLOWUP.exists() or not lr.EXCLUDED_RULINGS.exists():
        pytest.skip('the follow-up queue or its store is not on disk')
    have = json.loads(lr.EXCLUDED_RULINGS.read_text(encoding='utf-8'))
    cards = {c['sid'] for c in json.loads(
        lr.FOLLOWUP.read_text(encoding='utf-8'))['cards']}
    assert all(s.startswith('site:') for s in cards)
    assert all(k.startswith('site:') for k in have if k in cards)
    assert all(k not in cards for k in have if k.startswith('forms:'))


def test_a_card_with_no_verifiable_ink_offers_nothing_to_rule():
    """⚠ THE THIRD DEFECT. Two crops showed the printed line BELOW the one they
    asked about, outlined red and captioned "placed by geometry" — which reads
    as a caveat about precision, not as "this is a picture of another line"."""
    s = Site(page=33, col='R', line=29, char_at=0, form='ȣ',
             stage='reconciled', path='x', corpus_off=0)
    s.flag('no_crop', 'no crop that can be tied to its printed line')
    card = Card(form='ȣ', members=[s], key='site:x', candidates=[
        {'form': 'ȣ̓', 'marks': [[0, SMOOTH]], 'names': 'smooth', 'seen': 91,
         'source': 'corpus'}])
    assert not card.rulable
    opts = lr.options_for(card)
    assert [o['verdict'] for o in opts] == ['none']
    assert 'no verifiable ink' in opts[0]['label']
    # and nothing may be ruled into it
    assert lr.illegal_accept(card, 'ȣ̓')


def test_the_grid_is_measured_from_the_printer_and_excludes_the_defect():
    """The six breathing-bearing combinations the printer actually uses. The
    accent-only ones are the ten-word defect and must never be offered."""
    grid = lr.attested_grid()
    assert (SMOOTH,) in grid
    assert (SMOOTH, ACUTE) in grid
    assert (ROUGH, CIRCUMFLEX) in grid
    for marks in grid:
        assert any(c in lr.BREATHINGS for c in marks), marks


def test_the_grid_gives_the_kai_accent_button_john_could_see():
    """⚠ THE SECOND DEFECT. bare/smooth/rough could not express the accent John
    read plainly on the excluded `ȣχ` site."""
    grid = lr.attested_grid()
    cands = lr.grid_candidates('ȣχ', grid, lr.attested_forms())
    forms = {c['form'] for c in cands}
    assert lr.compose('ȣχ', ((0, SMOOTH),)) in forms
    assert lr.compose('ȣχ', ((0, SMOOTH), (0, ACUTE))) in forms
    # the commonest reading for THIS word comes first, with its own count
    assert cands[0]['form'] == lr.compose('ȣχ', ((0, SMOOTH),))
    assert cands[0]['seen'] > 0
    assert any(c['seen'] == 0 and c['source'] == 'grid' for c in cands)


def test_the_rebuilt_followup_is_one_card_per_site_with_verified_ink():
    if not lr.FOLLOWUP.exists():
        pytest.skip('the follow-up queue is not on disk')
    doc = json.loads(lr.FOLLOWUP.read_text(encoding='utf-8'))
    assert doc['n_cards'] == doc['n_members']          # one site per card
    assert doc['store'].endswith('ligature-excluded-rulings.json')
    for c in doc['cards']:
        assert len(c['members']) == 1
        m = c['members'][0]
        # every crop shown is anchored by text, or by two text-matched
        # neighbours — never by a bare band index
        assert m['crop_how'] in ('text', 'gap'), (c['sid'], m['crop_how'])
        # `no_word_off` is about the Opus-stream key, not about the ink.
        assert m['state'] in ('ok', 'no_word_off'), (c['sid'], m['state'])
        accepts = [o for o in c['options'] if o['verdict'] == 'accept']
        assert accepts, c['sid']
        card = Card(form=c['form'], candidates=c['candidates'],
                    key=c['sid'], members=[Site(**m)])
        for o in accepts:
            assert lr.illegal_accept(card, o['detail']) == ''


def test_the_gap_anchor_requires_both_neighbours_and_a_single_missing_line():
    """It is a measurement bounded by two verified boxes, or it is nothing."""
    im, score, how = lr.crop_in_the_gap(21, 'R', 45, 'ȣτως', 34)
    assert how == 'gap' and im is not None and score >= lr.GAP_MATCH
    # a line kraken DID segment has no gap to sit in
    assert lr.crop_in_the_gap(21, 'R', 46, 'x', 0)[2] != 'gap'
    # a column with no segmentation at all cannot be rescued this way
    assert lr.crop_in_the_gap(33, 'R', 29, 'ȣ', 0)[0] is None


# --------------------------------------------------------------------------
# the live path: what serve() and plan() actually see
# --------------------------------------------------------------------------

def test_the_queue_round_trips_through_the_real_serve_path():
    """⚠ THE DEFECT THIS PINS. `cards_from_queue` did not restore `Card.key`,
    so `sid` fell back to `forms:{form}`. The queue on disk held 12 site-keyed
    cards and the prebuilt page was right, but every LIVE path goes through
    here: the 12 collapsed to 4, eight members were dropped, and John's four old
    `none` verdicts reattached as answers. The file was correct and the sitting
    would still have been the one he already lost.
    """
    if not lr.FOLLOWUP.exists():
        pytest.skip('the follow-up queue is not on disk')
    doc = json.loads(lr.FOLLOWUP.read_text(encoding='utf-8'))
    cards = lr.cards_from_queue(lr.FOLLOWUP)          # the real serve path

    assert len(cards) == 12 == doc['n_cards']
    sids = [c.sid for c in cards]
    assert len(set(sids)) == 12
    assert all(s.startswith('site:') for s in sids)
    assert not [s for s in sids if s.startswith('forms:')]
    # nothing dropped, and the recorded identity is the loaded identity
    assert sum(c.n for c in cards) == 12 == doc['n_members']
    assert sids == [c['sid'] for c in doc['cards']]
    assert [m.sid for c in cards for m in c.members] == \
        [f"page-{m['page']:03d}-{m['col']}:{m['line']}:{m['char_at']}"
         for c in doc['cards'] for m in c['members']]


def test_every_recorded_card_field_survives_the_round_trip():
    """Field by field, for every queue on disk — identity, evidence, buttons.

    `sid` was written and never read back for weeks. Anything the queue records
    and the loader ignores can drift the same way.
    """
    import dataclasses
    for path in (lr.QUEUE, lr.FOLLOWUP, lr.COMBINED_QUEUE):
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding='utf-8'))
        cards = lr.cards_from_queue(path)
        assert len(cards) == len(doc['cards'])
        for stored, card in zip(doc['cards'], cards):
            assert stored['sid'] == card.sid
            assert stored['form'] == card.form
            assert stored['n'] == card.n
            assert stored.get('smooth_siblings', 0) == card.smooth_siblings
            assert stored.get('rough_siblings', 0) == card.rough_siblings
            assert stored.get('grave_siblings', 0) == card.grave_siblings
            assert (stored.get('candidates') or []) == card.candidates
            assert stored.get('note', '') == card.note
            # Members survive whole; a field added to Site after the file was
            # written is allowed to default, but nothing STORED may be lost.
            for sm, cm in zip(stored['members'], card.members):
                got = dataclasses.asdict(cm)
                for k, v in sm.items():
                    assert got[k] == v, (stored['sid'], k)
            # The buttons are recomputed, so their VERDICTS and DETAILS — the
            # parts a click posts and `illegal_accept` checks — must still
            # agree with what was served.
            now = lr.options_for(card)
            assert [o['verdict'] for o in now] == \
                [o['verdict'] for o in stored['options']], stored['sid']
            assert [o['detail'] for o in now] == \
                [o['detail'] for o in stored['options']], stored['sid']


# The one site John settled in chat rather than on a card: page 21-L line 32
# LITERALLY prints `οὐχ` spelled out, with no ligature at all, so no button on
# a card built from the printed form `ȣχ` could express it. The orchestrator
# applied it by hand and the store carries the provenance.
CHAT_OVERRIDE_SID = 'site:page-021-L:32:52'


def test_plan_over_the_closed_sitting_is_eleven_bound_and_one_chat_override():
    """The sitting is CLOSED — all twelve ruled and applied. What plan() says
    about it now, pinned as the honest state.

    ⚠ AND THE TWELFTH IS `illegal`, WHICH IS CORRECT AND STAYS THAT WAY. Its
    detail `οὐχ` is deliberately outside the composed set `illegal_accept`
    allows: the card was built from the printed `ȣχ`, and a form that drops the
    ligature cannot be reached by inserting a mark. So `plan()` refuses to make
    a step of it and names it — which is exactly what a store entry no card
    could have produced SHOULD do. It was applied at the orchestrator level and
    the store is the record. Making this green by widening `illegal_accept`
    would hand every hand-written store entry a route into the corpus.
    """
    if not (lr.FOLLOWUP.exists() and lr.EXCLUDED_RULINGS.exists()):
        pytest.skip('the follow-up queue or its store is not on disk')
    p = lr.plan(lr.FOLLOWUP, lr.EXCLUDED_RULINGS)
    assert len(p['steps']) == 11
    assert p['unruled'] == [] and p['aside'] == [] and p['excluded'] == []
    assert [e['sid'] for e in p['illegal']] == [CHAT_OVERRIDE_SID]
    assert 'not a reading this card offers' in p['illegal'][0]['why']
    # The four superseded form keys are still on record and still bind nothing.
    assert p['orphaned'] == ['forms:ȣ', 'forms:ȣδὲν', 'forms:ȣτως', 'forms:ȣχ']

    # Every one of the eleven is already in the corpus; nothing left to write.
    result = lr.apply_steps(p['steps'], write=False)
    assert result['counts'] == {'edited': 0, 'preserve': 0, 'already': 11,
                                'refused': 0}
    assert result['refusals'] == []


def test_the_chat_override_site_holds_the_spelled_out_word_in_the_corpus():
    """The corpus really does carry `οὐχ` there — the ligature is gone, which
    is why no card could offer it and why plan() cannot rebuild the step."""
    if not lr.FOLLOWUP.exists():
        pytest.skip('the follow-up queue is not on disk')
    col = lr.ROOT / 'work' / 'reconciled' / 'page-021-L.txt'
    if not col.exists():
        pytest.skip('page-021-L is not in this checkout')
    line = unicodedata.normalize('NFC', col.read_text(
        encoding='utf-8')).splitlines()[31]
    assert unicodedata.normalize('NFC', 'οὐχ') in line
    assert 'ȣχ' not in line


def test_apply_exits_non_zero_while_the_store_holds_an_uncoverable_entry():
    """A store entry no card could have produced is a standing flag, not a
    silent pass — `apply` reports it and returns non-zero every run."""
    if not (lr.FOLLOWUP.exists() and lr.EXCLUDED_RULINGS.exists()):
        pytest.skip('the follow-up queue or its store is not on disk')

    class A:
        pass
    a = A()
    a.queue, a.rulings = lr.FOLLOWUP, lr.EXCLUDED_RULINGS
    a.apply, a.followup = False, lr.ROOT / 'work' / 'unused-followup.json'
    assert lr.cmd_apply(a) == 1
    assert not a.followup.exists()


# --------------------------------------------------------------------------
# the gap anchor's preconditions, each refused on its own
# --------------------------------------------------------------------------

@pytest.fixture
def fake_column(tmp_path, monkeypatch):
    """A column whose segmentation this test dictates, line by line."""
    from PIL import Image
    (tmp_path / 'work' / 'reconciled').mkdir(parents=True)
    (tmp_path / 'work' / 'kraken400' / 'cols').mkdir(parents=True)
    text = '\n'.join(f'line number {i} of the printed column' for i in range(1, 8))
    (tmp_path / 'work' / 'reconciled' / 'page-999-L.txt').write_text(
        text + '\n', encoding='utf-8')
    Image.new('L', (600, 800), 255).save(
        tmp_path / 'work' / 'kraken400' / 'cols' / 'page-999-L.png')
    monkeypatch.setattr(lr, 'ROOT', tmp_path)
    lines = text.splitlines()

    def segments(spec):
        """spec: [(corpus line or None, y0, y1)] -> patched _lines()."""
        segs = [(10, y0, 500, y1, lines[ln - 1] if ln else 'zzzz qqqq')
                for ln, y0, y1 in spec]
        monkeypatch.setattr('bonitz_pipeline.mark_review._lines',
                            lambda col: segs)
    return segments


def test_gap_refused_when_a_neighbour_cannot_be_matched(fake_column):
    # Line 3 is missing; line 2 is present but its text matches nothing.
    fake_column([(None, 100, 160), (4, 240, 300)])
    assert lr.gap_band(999, 'L', 3) == (None, 'no_neighbours')


def test_gap_refused_when_more_than_one_line_is_missing(fake_column):
    # Lines 3 AND 4 are unsegmented, so the band holds two lines.
    fake_column([(2, 100, 160), (5, 320, 380)])
    assert lr.gap_band(999, 'L', 3) == (None, 'gap_not_single')


def test_gap_refused_when_the_segments_are_not_adjacent(fake_column):
    # Both neighbours match, but another segment sits between them, so the
    # band is not the single missing line.
    fake_column([(2, 100, 160), (None, 170, 230), (4, 240, 300)])
    assert lr.gap_band(999, 'L', 3) == (None, 'segments_not_adjacent')


def test_gap_refused_when_the_band_is_thinner_than_a_line(fake_column):
    # Adjacent, single missing line — but the boxes almost touch, so whatever
    # is between them is not a printed line.
    fake_column([(2, 100, 160), (4, 163, 230)])
    assert lr.gap_band(999, 'L', 3) == (None, 'gap_too_thin')


def test_gap_accepted_when_every_condition_holds(fake_column):
    fake_column([(2, 100, 160), (4, 240, 300)])
    band, score = lr.gap_band(999, 'L', 3)
    assert band == (10, 160, 500, 240) and score == 1.0


def test_the_gap_band_is_pinned_to_its_alto_derived_bounds():
    """⚠ `how == 'gap'` IS A LABEL, NOT A MEASUREMENT. A regression that moved
    the band a line would still report `gap` — the profile fallback's exact
    failure, wearing the fix's badge. So the bounds are recomputed here from
    the segmentation and the corpus, independently of `gap_band`.
    """
    import difflib
    from bonitz_pipeline.mark_review import _key, _lines
    lines = (lr.ROOT / 'work/reconciled/page-021-R.txt').read_text(
        encoding='utf-8').splitlines()
    segs = _lines('page-021-R')
    if not segs:
        pytest.skip('page-021-R has no segmentation in this checkout')

    def seg_of(ln):
        return max(((difflib.SequenceMatcher(None, _key(lines[ln - 1]),
                                             _key(s[4]), autojunk=False).ratio(), i)
                    for i, s in enumerate(segs)))
    # Line 45 is unsegmented; 44 and 46 are its verified neighbours.
    s44, i44 = seg_of(44)
    s46, i46 = seg_of(46)
    assert s44 >= lr.GAP_MATCH and s46 >= lr.GAP_MATCH
    assert i46 == i44 + 1
    px0, _py0, px1, py1, _ = segs[i44]
    nx0, ny0, nx1, _ny1, _ = segs[i46]
    expected = (min(px0, nx0), py1, max(px1, nx1), ny0)

    band, score = lr.gap_band(21, 'R', 45)
    assert band == expected
    assert score == pytest.approx(min(s44, s46))
    # and it is a plausible line: taller than the floor, shorter than a pitch
    assert lr.GAP_MIN_HEIGHT <= band[3] - band[1] < 120


# --------------------------------------------------------------------------
# round-5 hardening
# --------------------------------------------------------------------------

def test_every_queue_on_disk_declares_its_store():
    """⚠ THE GUARD WAS A NO-OP ON THE FILE THAT MATTERED MOST. `queue-ligature`
    carried no `store`, so planning it against the excluded store set 72 sites
    aside instead of refusing. A guard that fires only on files that happen to
    carry the field protects nothing."""
    for path in (lr.QUEUE, lr.FOLLOWUP, lr.COMBINED_QUEUE):
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding='utf-8'))
        assert doc.get('store'), path.name
        assert Path(doc['store']).name.endswith('.json')


def test_a_queue_cannot_be_built_without_a_store():
    with pytest.raises(BuildError):
        lr.queue_doc([], {}, {}, store=None)
    with pytest.raises(BuildError):
        lr.queue_doc([], {}, {}, store='')


def test_planning_a_queue_against_another_sittings_store_is_refused(tmp_path):
    if not (lr.QUEUE.exists() and lr.EXCLUDED_RULINGS.exists()):
        pytest.skip('the live queues are not on disk')
    with pytest.raises(SystemExit) as e:
        lr.plan(lr.QUEUE, lr.EXCLUDED_RULINGS)
    assert 'declares its store' in str(e.value)


# --- the band-height cap ---------------------------------------------------

def test_a_band_spanning_two_printed_lines_is_refused(fake_column):
    """Mutual-best pins the neighbours, but a segment that MERGED two printed
    lines matches one of them back — so every other precondition passes while
    the band covers two lines. Only the geometry can say so."""
    # Pitch 60, box height 70 (boxes overlap, as they really do): one missing
    # line is 2*60-70 = 50; two would be 3*60-70 = 110.
    fake_column([(1, 0, 70), (2, 60, 130), (3, 120, 190), (5, 240, 310),
                 (6, 300, 370), (7, 360, 430)])
    band, why = lr.gap_band(999, 'L', 4)
    assert band is not None and why == 1.0
    assert band[3] - band[1] == 50

    # Now stretch the same gap so it spans two lines' worth.
    fake_column([(1, 0, 70), (2, 60, 130), (3, 120, 190), (5, 300, 370),
                 (6, 360, 430), (7, 420, 490)])
    assert lr.gap_band(999, 'L', 4) == (None, 'gap_too_tall')


def test_the_cap_is_derived_from_the_column_not_a_constant():
    """Two columns with different pitch must get different caps."""
    tall = [(0, i * 100, 500, i * 100 + 120, f'line {i}') for i in range(8)]
    short = [(0, i * 40, 500, i * 40 + 50, f'line {i}') for i in range(8)]
    assert lr._segment_metrics(tall) == (100.0, 120.0)
    assert lr._segment_metrics(short) == (40.0, 50.0)
    assert lr._segment_metrics(tall[:2]) == (0.0, 0.0)   # too little to measure


def test_the_live_gap_bands_survive_the_cap():
    """The three crops John is being shown must be unaffected."""
    for page, col, line, height in ((21, 'R', 45, 38), (21, 'R', 55, 33),
                                    (17, 'R', 40, 38)):
        band, score = lr.gap_band(page, col, line)
        assert band is not None, (page, col, line)
        assert band[3] - band[1] == height
        assert score >= lr.GAP_MATCH


# --- schema lock -----------------------------------------------------------

# Keys the loader deliberately does not round-trip, each with its reason.
QUEUE_CARD_ALLOWLIST = {
    # Recomputed from `candidates`/siblings at render time. Verdicts and
    # details are pinned exactly; only the prose may drift as wording improves.
    'consequence',
    'label',
}


def test_the_card_schema_is_locked_both_ways():
    """⚠ `sid` WAS WRITTEN AND NEVER READ BACK. Any field can drift the same
    way, so the check is symmetric: every stored key must be accounted for, and
    every exception must be named here with a reason."""
    import dataclasses
    for path in (lr.QUEUE, lr.FOLLOWUP, lr.COMBINED_QUEUE):
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding='utf-8'))
        for stored, card in zip(doc['cards'], lr.cards_from_queue(path)):
            rebuilt = {
                'sid': card.sid, 'form': card.form, 'n': card.n,
                'smooth_siblings': card.smooth_siblings,
                'rough_siblings': card.rough_siblings,
                'grave_siblings': card.grave_siblings,
                'candidates': card.candidates, 'note': card.note,
                'options': lr.options_for(card),
                'warning': lr.mixed_warning(card),
                'members': [dataclasses.asdict(m) for m in card.members],
            }
            # Symmetric: no stored key unaccounted for, none invented.
            assert set(stored) == set(rebuilt), (path.name, stored['sid'])
            for k in stored:
                if k in ('options', 'members'):
                    continue
                assert stored[k] == rebuilt[k], (path.name, stored['sid'], k)
            for a, b in zip(stored['options'], rebuilt['options']):
                assert set(a) == set(b)
                for k in a:
                    if k in QUEUE_CARD_ALLOWLIST:
                        continue
                    assert a[k] == b[k], (stored['sid'], k)
            # Site is a dataclass: a field added later may default, but every
            # key the file holds must survive with its value.
            for sm, cm in zip(stored['members'], card.members):
                got = dataclasses.asdict(cm)
                assert set(sm) <= set(got), (stored['sid'], set(sm) - set(got))
                for k, v in sm.items():
                    assert got[k] == v, (stored['sid'], k)


def test_the_orphan_names_are_the_four_superseded_form_keys():
    if not (lr.FOLLOWUP.exists() and lr.EXCLUDED_RULINGS.exists()):
        pytest.skip('the follow-up queue or its store is not on disk')
    p = lr.plan(lr.FOLLOWUP, lr.EXCLUDED_RULINGS)
    assert p['orphaned'] == ['forms:ȣ', 'forms:ȣδὲν', 'forms:ȣτως', 'forms:ȣχ']
    assert all(o.startswith('forms:') for o in p['orphaned'])


# --- the drift window ------------------------------------------------------

def test_the_drift_window_finds_a_finished_edit_another_sitting_moved(bench):
    """⚠ THE BUDGET KNOWS ONLY ITS OWN PLAN. The combined sitting inserted marks
    at 027-R:18 and 045-R:8, pushing MAIN-queue neighbours further right than
    any main-queue budget could account for."""
    step = {'path': str(bench['col']), 'line': 1, 'page': 900, 'col': 'L',
            'char_at': COLUMN_TEXT.splitlines()[0].index('ȣκ'),
            'printed': 'ȣκ', 'becomes': lr.add_mark('ȣκ', SMOOTH),
            'verdict': 'accept', 'member': 'page-900-L:1:18'}
    # Apply it, then insert two characters to its LEFT as another sitting would.
    lr.apply_steps([dict(step)], write=True)
    text = bench['col'].read_text(encoding='utf-8')
    lines = text.splitlines()
    lines[0] = 'XX' + lines[0]
    bench['col'].write_text('\n'.join(lines) + '\n', encoding='utf-8')
    # A zero budget must still recognise it, via the fixed drift window.
    assert lr._verify(step, 0) == 'already'
    assert 2 <= lr.DRIFT_WINDOW


def test_two_matches_in_the_window_is_ambiguous_not_already(bench):
    """A unique match under a bounded window is an anchor; two is a guess."""
    becomes = lr.add_mark('ȣκ', SMOOTH)
    bench['col'].write_text(f'αα{becomes}{becomes} rest\n', encoding='utf-8')
    step = {'path': str(bench['col']), 'line': 1, 'char_at': 0,
            'page': 900, 'col': 'L',
            'printed': 'ȣκ', 'becomes': becomes, 'verdict': 'accept',
            'member': 'page-900-L:1:0'}
    assert lr._verify(step, 0) == 'ambiguous_already'
    result = lr.apply_steps([step], write=False)
    assert result['counts']['refused'] == 1
    assert result['counts']['already'] == 0
    assert result['refusals'] == [('page-900-L:1:0', 'ambiguous_already')]


# --------------------------------------------------------------------------
# the accent-without-breathing sitting — the class every earlier one held back
# --------------------------------------------------------------------------

def test_enumerate_sites_can_be_asked_for_the_accent_class(tmp_path,
                                                           monkeypatch):
    """The default is unchanged; the accent class is opt-in."""
    col = tmp_path / 'page-905-L.txt'
    col.write_text("ἀρχὴ ȣκ τῆς ȣ͂ κινήσεως ȣ̓κ ἔστιν ϗ ἄλλα\n", encoding='utf-8')
    monkeypatch.setattr(lr, 'corpus_columns', lambda pages=None: [col])
    bare, counts = lr.enumerate_sites(root=tmp_path)
    assert {s.form for s in bare} == {'ȣκ', 'ϗ'}
    accents, _ = lr.enumerate_sites(root=tmp_path, keep=('accent-ou',))
    assert [s.form for s in accents] == ['ȣ͂']
    assert counts['accent-ou'] == 1


# ⚠ FROZEN ONTO A FIXTURE, AND THE LIVE FORM BECAME THE GOOD NEWS. John ruled
# all ten; the accent-ou class is now EMPTY, so `accent_cards()` raises and
# every pin built from it would have to be deleted rather than kept. The
# behaviour is pinned on a corpus these tests own; the live claim below is that
# the class is gone.
ACCENT_CORPUS = (
    # four sites sharing one printed form — the relative οὗ
    "τἀγαθόν, ȣ͂ πάντα ϗ̀ τὸ ȣ͂ ἕνεκα ϗ̀ ὑφ’ ȣ͂ ϗ̀ τις ȣ͂ μέμνηται\n"
    # a fifth site whose skeleton differs — οὖς, the ear
    'ἂν τρυπηθῇ τὸ ȣ͂ς ἢ ἀκρωτήριον\n'
    # and one carrying an acute instead of the circumflex
    'αἰθρίας ȣ́σης μα4. 342 a12.\n'
    # marked siblings, so the per-candidate counts have something to count
    'ȣ̔͂ ϗ̀ ȣ̔͂ ϗ̀ ȣ̓͂ ϗ̀ ȣ̓́σης\n'
)


@pytest.fixture
def accent_bench(tmp_path, monkeypatch):
    col = tmp_path / 'page-906-L.txt'
    col.write_text(ACCENT_CORPUS, encoding='utf-8')
    monkeypatch.setattr(lr, 'corpus_columns', lambda pages=None: [col])
    return lr.accent_cards()


def test_the_accent_sitting_is_one_card_per_site(accent_bench):
    """⚠ THIS IS WHERE ONE SKELETON HIDES DIFFERENT WORDS. `ȣ͂` is the relative
    `οὗ` at four sites — rough — while `ȣ͂ς` is `οὖς`, the ear, and takes the
    smooth. A form-keyed card would bind them and be wrong on some however John
    answered."""
    cards = accent_bench
    assert len(cards) == 6
    assert len({c.sid for c in cards}) == 6
    assert all(c.sid.startswith('site:') and c.n == 1 for c in cards)
    # four sites share the printed form and must still be four cards
    assert sum(1 for c in cards if c.form == 'ȣ͂') == 4
    # the ear is its own skeleton and gets its own evidence
    ear = next(c for c in cards if c.form == 'ȣ͂ς')
    assert [x['seen'] for x in ear.candidates] == [0, 0]
    ou = next(c for c in cards if c.form == 'ȣ͂')
    assert [x['seen'] for x in ou.candidates] == [1, 2]   # smooth 1, rough 2


def test_every_accent_card_offers_exactly_preserve_two_breathings_and_none(
        accent_bench):
    for card in accent_bench:
        opts = lr.options_for(card)
        assert [o['verdict'] for o in opts] == \
            ['preserve', 'accept', 'accept', 'none'], card.sid
        assert opts[0]['detail'] == card.form
        details = [o['detail'] for o in opts if o['verdict'] == 'accept']
        assert details == [lr.compose(card.form, ((0, SMOOTH),)),
                           lr.compose(card.form, ((0, ROUGH),))]
        for d in details:
            assert lr.illegal_accept(card, d) == ''


def test_an_accent_candidate_keeps_the_printed_accent(accent_bench):
    """The ink already shows the accent; it is not what is being asked."""
    for card in accent_bench:
        printed_marks = lr.ligature_marks(card.form)[1]
        assert printed_marks and not (set(printed_marks) & lr.BREATHINGS)
        for cand in card.candidates:
            marks = lr.ligature_marks(cand['form'])[1]
            # the printed accent survives, and exactly one breathing joins it
            assert set(printed_marks) <= set(marks)
            assert len(set(marks) & lr.BREATHINGS) == 1
            # and nothing outside the ligature moved
            back = unicodedata.normalize('NFD', cand['form'])
            for _occ, m in (tuple(x) for x in cand['marks']):
                back = back.replace(m, '', 1)
            assert back == unicodedata.normalize('NFD', card.form)


def test_an_accent_card_refuses_a_reading_that_drops_the_printed_accent():
    """No corpus needed: the card is built from the printed form."""
    card = Card(form='ȣ͂', key='site:page-015-R:1:46', candidates=[
        {'form': lr.compose('ȣ͂', ((0, m),)), 'marks': [[0, m]],
         'names': n, 'seen': 0, 'source': 'grid'}
        for m, n in ((SMOOTH, 'smooth added, circumflex kept'),
                     (ROUGH, 'rough added, circumflex kept'))])
    assert lr.illegal_accept(card, lr.add_mark('ȣ͂', ROUGH)) == ''   # keeps it
    for bad in ('ȣ̔', 'ȣ̓', 'ȣ͂', 'ȣ̓͂ς', 'GARBAGE', ''):
        assert lr.illegal_accept(card, bad), bad


def test_the_preserve_button_does_not_call_an_accented_form_bare():
    """⚠ THE ONE BUTTON WHOSE JOB IS TO BE READ LITERALLY. It told John "the
    page really is bare here" on a card whose form carries a circumflex."""
    accented = lr.options_for(Card(form='ȣ͂'))[0]['consequence']
    assert 'bare' not in accented
    assert 'accent and no breathing' in accented
    bare = lr.options_for(Card(form='ȣκ'))[0]['consequence']
    assert 'the page really is bare here' in bare


def test_the_accent_class_is_gone_from_the_corpus():
    """The good news, asserted positively rather than skipped: every
    word-initial ligature in the corpus now carries its marks."""
    sites, counts = lr.enumerate_sites(keep=('accent-ou',))
    assert sites == []
    assert counts.get('accent-ou', 0) == 0
    assert counts.get('bare-ou', 0) == 0

    # ⚠ THE BARE KAI IS NOT ZERO AND MUST NOT BE. This asserted 0 when the
    # corpus stopped at page 62. Pages 63-102 brought page-063-L:8, where
    # Bonitz sets `ϗ` BARE TWICE IN ONE LINE while every other kai on those
    # pages carries its grave — recorded in `work/audit/new-pages-flags.md`
    # and kept as printed, because a misprint is preserved. Forcing this back
    # to zero would mean correcting the compositor, which is the worst outcome
    # this project has.
    #
    # So the count is not pinned; the SITES are. A third bare kai anywhere
    # fails, and these two are named as the deliberate ones.
    import re
    from bonitz_pipeline.normalize import corpus_columns
    bare = []
    for path in corpus_columns():
        for i, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            for m in re.finditer('ϗ', line):
                nxt = line[m.end():m.end() + 1]
                if not (nxt and unicodedata.combining(nxt)):
                    bare.append((path.stem, i))
    assert set(bare) == {('page-063-L', 8)}, sorted(set(bare))
    assert len(bare) == 2, bare
    # the tally must agree with the sites just enumerated, not with zero
    assert counts.get('bare-kai', 0) == len(bare), counts
    assert counts['breathed-ou'] and counts['marked-kai']
    # and the builder refuses to invent a sitting out of an empty class
    with pytest.raises(BuildError) as e:
        lr.accent_cards()
    assert 'no accent-without-breathing sites' in str(e.value)


def test_the_live_accent_queue_matches_the_ten_sites():
    if not lr.ACCENT_QUEUE.exists():
        pytest.skip('the accent queue has not been built')
    doc = json.loads(lr.ACCENT_QUEUE.read_text(encoding='utf-8'))
    assert doc['n_cards'] == doc['n_members'] == 10
    assert doc['store'].endswith('ligature-accent-rulings.json')
    cards = lr.cards_from_queue(lr.ACCENT_QUEUE)
    assert [c.sid for c in cards] == [c['sid'] for c in doc['cards']]
    for card in cards:
        assert lr.classify(card.form) == 'accent-ou'
        m = card.members[0]
        assert m.crop_how in ('text', 'gap'), (card.sid, m.crop_how)
        for cand in card.candidates:
            assert lr.illegal_accept(card, cand['form']) == ''


def test_the_accent_class_is_disjoint_from_every_bare_sitting():
    """It was held back from all of them on purpose, and the queues must agree
    that it never belonged to any."""
    if not lr.ACCENT_QUEUE.exists():
        pytest.skip('the accent queue has not been built')
    accent = {c['sid'] for c in json.loads(
        lr.ACCENT_QUEUE.read_text(encoding='utf-8'))['cards']}
    for other in (lr.QUEUE, lr.FOLLOWUP, lr.COMBINED_QUEUE):
        if not other.exists():
            continue
        doc = json.loads(other.read_text(encoding='utf-8'))
        theirs = {f"site:page-{m['page']:03d}-{m['col']}:{m['line']}:{m['char_at']}"
                  for c in doc['cards'] for m in c['members']}
        assert not (accent & theirs), other.name
        for c in doc['cards']:
            assert lr.classify(c['form']) != 'accent-ou', (other.name, c['sid'])


# --------------------------------------------------------------------------
# a promoted column: the recorded stage moved, the site did not
# --------------------------------------------------------------------------

def test_a_promoted_column_is_followed_not_refused(tmp_path, monkeypatch):
    """⚠ A RECORDED STAGE IS NOT A CONTRACT. John promoted all twenty 53-62
    columns from `reconciled-auto` into `reconciled`; the one ϗ member on
    060-L recorded the old stage, and `apply` called a finished, correct edit
    `missing_column`. The queue is a RECORD and is not rewritten — the
    resolution happens at read time, through the same stage search every other
    gate uses.
    """
    auto = tmp_path / 'work' / 'reconciled-auto'
    live = tmp_path / 'work' / 'reconciled'
    auto.mkdir(parents=True)
    live.mkdir(parents=True)
    text = 'ἀρχὴ τῆς κινήσεως ϗ̀ τὰ λοιπά\n'
    (live / 'page-960-L.txt').write_text(text, encoding='utf-8')
    monkeypatch.setattr(lr, 'ROOT', tmp_path)
    monkeypatch.setattr('bonitz_pipeline.normalize.Path', Path, raising=False)

    # The queue still records the pre-promotion location.
    recorded = str(auto / 'page-960-L.txt')
    step = {'page': 960, 'col': 'L', 'path': recorded, 'line': 1,
            'char_at': text.index('ϗ'), 'printed': 'ϗ',
            'becomes': lr.add_mark('ϗ', GRAVE), 'verdict': 'accept',
            'member': 'page-960-L:1:18'}

    import bonitz_pipeline.normalize as nz
    monkeypatch.setattr(nz, 'corpus_column',
                        lambda page, col, required=True: (
                            live / f'page-{page:03d}-{col}.txt'
                            if (live / f'page-{page:03d}-{col}.txt').exists()
                            else (None if not required else pytest.fail())))
    monkeypatch.setattr(lr, 'corpus_column', nz.corpus_column)

    assert not Path(recorded).exists()
    assert lr.current_path(960, 'L', recorded) == live / 'page-960-L.txt'
    # The edit is already in the promoted file, so it reads as done — not as a
    # missing column and not as a mismatch.
    assert lr._verify(step, 0) == 'already'
    result = lr.apply_steps([step], write=False)
    assert result['counts'] == {'edited': 0, 'preserve': 0, 'already': 1,
                                'refused': 0}


def test_a_column_in_no_stage_still_refuses_loudly(tmp_path, monkeypatch):
    """A promoted file is not a missing one — but a vanished one still is."""
    monkeypatch.setattr(lr, 'ROOT', tmp_path)
    import bonitz_pipeline.normalize as nz
    monkeypatch.setattr(nz, 'corpus_column',
                        lambda page, col, required=True: None)
    monkeypatch.setattr(lr, 'corpus_column', nz.corpus_column)
    gone = str(tmp_path / 'work' / 'reconciled-auto' / 'page-961-L.txt')
    step = {'page': 961, 'col': 'L', 'path': gone, 'line': 1, 'char_at': 0,
            'printed': 'ϗ', 'becomes': lr.add_mark('ϗ', GRAVE),
            'verdict': 'accept', 'member': 'page-961-L:1:0'}
    assert lr.current_path(961, 'L', gone) is None
    assert lr._verify(step, 0) == 'missing_column'
    result = lr.apply_steps([step], write=False)
    assert result['counts']['refused'] == 1
    assert result['refusals'] == [('page-961-L:1:0', 'missing_column')]

    site = Site(page=961, col='L', line=1, char_at=0, form='ϗ',
                stage='reconciled-auto', path=gone, corpus_off=0)
    with pytest.raises(BuildError) as e:
        lr.verify_site(site)
    assert 'in no stage' in str(e.value)


def test_a_promoted_column_whose_text_moved_on_still_refuses(tmp_path,
                                                             monkeypatch):
    """Resolution follows the file; it does not excuse the text."""
    live = tmp_path / 'work' / 'reconciled'
    live.mkdir(parents=True)
    (live / 'page-962-L.txt').write_text('something else entirely\n',
                                         encoding='utf-8')
    monkeypatch.setattr(lr, 'ROOT', tmp_path)
    import bonitz_pipeline.normalize as nz
    monkeypatch.setattr(nz, 'corpus_column',
                        lambda page, col, required=True:
                        live / f'page-{page:03d}-{col}.txt')
    monkeypatch.setattr(lr, 'corpus_column', nz.corpus_column)
    step = {'page': 962, 'col': 'L',
            'path': str(tmp_path / 'work' / 'reconciled-auto' / 'page-962-L.txt'),
            'line': 1, 'char_at': 0, 'printed': 'ϗ',
            'becomes': lr.add_mark('ϗ', GRAVE), 'verdict': 'accept',
            'member': 'page-962-L:1:0'}
    assert lr._verify(step, 0) == 'text_mismatch'


def test_the_live_queues_all_resolve_after_the_promotion():
    """Every member of every queue on disk resolves to a column that exists."""
    for path in (lr.QUEUE, lr.FOLLOWUP, lr.COMBINED_QUEUE, lr.ACCENT_QUEUE):
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding='utf-8'))
        for c in doc['cards']:
            for m in c['members']:
                live = lr.current_path(m['page'], m['col'], m['path'])
                assert live is not None and live.exists(), (path.name, m)
