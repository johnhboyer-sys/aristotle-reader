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
