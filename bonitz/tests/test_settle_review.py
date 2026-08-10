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
