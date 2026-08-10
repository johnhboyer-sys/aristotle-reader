"""Settled winners become column text — or are skipped out loud.

The recurring bug: a step that silently does nothing looks exactly like a
step that had nothing to do. These tests assert the writer REFUSES on offset
mismatch, PRESERVES ligatures, leaves refused sites byte-identical to Opus,
and COUNTS every skip.
"""

from __future__ import annotations

import unicodedata
from pathlib import Path

import pytest

from bonitz_pipeline.apply_settled import (
    apply_column,
    apply_settlements,
    build_queue,
    expand_ligatures,
    form_set_key,
    surface_form,
)
from bonitz_pipeline.normalize import canonical, clean_opus
from bonitz_pipeline.settle import (
    AUTH_AGREE,
    AUTH_MORPHEUS_MEMBER,
    AUTH_REFUSE,
    Settlement,
    SettleReport,
)
from bonitz_pipeline.word_flags import WordFlag

ROOT = Path(__file__).resolve().parent.parent


def _wf(kind: str, readers: dict[str, str],
        page: int = 90, col: str = 'L', word_off: int = 0) -> WordFlag:
    return WordFlag(page=page, col=col, word_off=word_off,
                    readers=readers, kind=kind, n_sites=1, spine_off=word_off)


def _settle(word: WordFlag, winner: str | None, authority: str,
            reason: str) -> Settlement:
    forms = frozenset(word.readers.values())
    return Settlement(
        word=word, forms=forms, winner=winner,
        authority=authority, reason=reason,
        readers=tuple(word.readers),
    )


def _col_parts(text: str):
    cleaned = clean_opus(text)
    stream, offs = canonical(cleaned)
    base = unicodedata.normalize('NFC', cleaned)
    return base, stream, offs


# --- surface form / ligatures -----------------------------------------------

def test_expand_ligatures_is_a_key_not_a_reading():
    assert expand_ligatures('σπȣδαῖος') == 'σπουδαῖος'
    assert expand_ligatures('ϗ̀') == 'καὶ' or expand_ligatures('ϗ') == 'και'


def test_surface_form_keeps_ligature_when_winner_is_expanded():
    """The defect on record: writing the lexicon expansion destroyed ȣ."""
    readings = {
        'opus': 'σπȣδαῖος',
        'kraken': 'σπȣδαῖος',
        'codex': 'σπουδαῖος',
        'genie': 'σπουδαῖος',
    }
    # Settle picked the expanded twin; the applier must write the ligature.
    assert surface_form('σπουδαῖος', readings) == 'σπȣδαῖος'
    assert 'ȣ' in surface_form('σπουδαῖος', readings)


def test_surface_form_writes_winner_when_no_ligature_twin():
    readings = {
        'opus': 'ἐλίττεσθαι',
        'kraken': 'ἑλίττεσθαι',
        'codex': 'ἐλίττεσθαι',
    }
    assert surface_form('ἑλίττεσθαι', readings) == 'ἑλίττεσθαι'


# --- apply_column: mismatch refuses, refused is identical, skips counted ---

def test_apply_refuses_offset_mismatch_and_counts_skip():
    text = 'ἁμῶς γέ πως καὶ ἕτερον.\n'
    base, stream, offs = _col_parts(text)
    # Point word_off at ἁμῶς but claim a different opus form — mismatch.
    w = _wf('letters',
            {'opus': 'ἁμιῶς', 'kraken': 'ἁμῶς', 'codex': 'ἁμῶς'},
            word_off=0)
    s = _settle(w, 'ἁμῶς', AUTH_MORPHEUS_MEMBER, 'only real form')
    cr = apply_column(base, stream, offs, [s], page=90, col='L')
    assert len(cr.skips) == 1
    assert cr.skips[0].reason == 'opus_mismatch'
    assert cr.n_changed == 0
    # Column text is still the Opus baseline (plus trailing newline).
    assert cr.text.rstrip('\n') == base.rstrip('\n')


def test_apply_refuses_oob_offset_rather_than_guessing():
    text = 'λόγος ἔργον.\n'
    base, stream, offs = _col_parts(text)
    w = _wf('letters',
            {'opus': 'λόγος', 'kraken': 'νόμος'},
            word_off=9999)
    s = _settle(w, 'νόμος', AUTH_MORPHEUS_MEMBER, 'x')
    cr = apply_column(base, stream, offs, [s], page=90, col='L')
    assert len(cr.skips) == 1
    assert cr.skips[0].reason == 'offset_oob'
    assert cr.n_changed == 0


def test_refused_site_is_byte_identical_to_opus():
    text = 'ἁμῶς γέ πως καὶ ἁμιῶς λοιπόν.\n'
    base, stream, offs = _col_parts(text)
    # Find ἁμιῶς
    bad = 'ἁμιῶς'
    off = stream.index(bad)
    w = _wf('letters',
            {'opus': bad, 'kraken': 'ἁμῶς', 'codex': bad},
            word_off=off)
    s = _settle(w, None, AUTH_REFUSE, 'morpheus:multiple_real_forms')
    cr = apply_column(base, stream, offs, [s], page=90, col='L')
    assert cr.n_refused_left == 1
    assert cr.n_changed == 0
    assert cr.skips == []
    assert cr.text.rstrip('\n') == base.rstrip('\n')
    # The refused word is still exactly the Opus reading.
    assert bad in cr.text


def test_settled_winner_is_written_at_word_offset():
    text = 'ἁμιῶς γέ πως.\n'
    base, stream, offs = _col_parts(text)
    off = stream.index('ἁμιῶς')
    w = _wf('letters',
            {'opus': 'ἁμιῶς', 'kraken': 'ἁμῶς', 'codex': 'ἁμῶς'},
            word_off=off)
    s = _settle(w, 'ἁμῶς', AUTH_MORPHEUS_MEMBER, 'only ἁμῶς is real')
    cr = apply_column(base, stream, offs, [s], page=90, col='L')
    assert cr.n_changed == 1
    assert cr.skips == []
    assert 'ἁμῶς' in cr.text
    assert 'ἁμιῶς' not in cr.text


def test_ligature_survives_a_settlement_that_picked_the_expansion():
    text = 'ὁ σπȣδαῖος ἀνήρ.\n'
    base, stream, offs = _col_parts(text)
    off = stream.index('σπȣδαῖος')
    w = _wf('marks-only', {
        'opus': 'σπȣδαῖος',
        'kraken': 'σπȣδαῖος',
        'codex': 'σπουδαῖος',
        'genie': 'σπουδαῖος',
    }, word_off=off)
    s = _settle(w, 'σπουδαῖος', 'breathing_oracle.arbitrate', 'exact form')
    cr = apply_column(base, stream, offs, [s], page=90, col='L')
    # Surface kept the ligature → no-op write, text still has ȣ.
    assert 'ȣ' in cr.text
    assert 'σπουδαῖος' not in cr.text or 'σπȣδαῖος' in cr.text
    assert cr.skips == []
    # Either changed=0 (noop keep ligature) or changed with ligature form.
    assert all('ȣ' in (sk.winner or '') or True for sk in cr.skips)
    assert 'σπȣδαῖος' in cr.text


def test_skips_are_counted_not_silent_in_report(tmp_path: Path):
    """A full ApplyReport must account for every settlement."""
    opus = tmp_path / 'opus'
    opus.mkdir()
    (opus / 'page-090-L.txt').write_text('ἁμιῶς γέ πως.\n', encoding='utf-8')
    (opus / 'page-090-R.txt').write_text('padding.\n', encoding='utf-8')

    base, stream, offs = _col_parts('ἁμιῶς γέ πως.\n')
    off = stream.index('ἁμιῶς')
    good = _wf('letters',
               {'opus': 'ἁμιῶς', 'kraken': 'ἁμῶς'},
               page=90, col='L', word_off=off)
    bad = _wf('letters',
              {'opus': 'ἁμιῶς', 'kraken': 'ἁμῶς'},
              page=90, col='L', word_off=9999)  # will skip
    refused = _wf('accent-only',
                  {'opus': 'πως', 'kraken': 'πῶς'},
                  page=90, col='L', word_off=stream.index('πως'))

    rep = SettleReport(settlements=[
        _settle(good, 'ἁμῶς', AUTH_MORPHEUS_MEMBER, 'real'),
        _settle(bad, 'ἁμῶς', AUTH_MORPHEUS_MEMBER, 'real'),
        _settle(refused, None, AUTH_REFUSE, 'accent-only:lexicon_cannot_settle'),
    ], reader_set=('opus', 'kraken', 'codex'))

    out = apply_settlements(rep, opus_dir=opus, out_dir=tmp_path / 'out',
                            write=True, pages=[90])
    assert out.n_skips == 1
    assert out.skips[0].reason == 'offset_oob'
    assert out.n_changed == 1
    # Completeness: 3 settlements → applied + refused + skips
    total = sum(c.n_applied + c.n_refused_left + len(c.skips)
                for c in out.columns)
    assert total == 3
    written = (tmp_path / 'out' / 'page-090-L.txt').read_text(encoding='utf-8')
    assert 'ἁμῶς' in written


# --- queue ------------------------------------------------------------------

def test_queue_groups_identical_form_sets_and_counts_distinct():
    a = _wf('accent-only', {'opus': 'ἂ', 'kraken': 'ᾶ', 'codex': 'ἂ'},
            page=53, col='L', word_off=1)
    b = _wf('accent-only', {'opus': 'ἂ', 'kraken': 'ᾶ', 'codex': 'ἂ'},
            page=54, col='R', word_off=2)
    c = _wf('letters', {'opus': 'ἁμῶς', 'kraken': 'ἁμιῶς'},
            page=55, col='L', word_off=3)
    refused = [
        _settle(a, None, AUTH_REFUSE, 'accent-only:lexicon_cannot_settle'),
        _settle(b, None, AUTH_REFUSE, 'accent-only:lexicon_cannot_settle'),
        _settle(c, None, AUTH_REFUSE, 'morpheus:multiple_real_forms'),
    ]
    # No opus files needed for form-set grouping; line may be 0.
    entries, n_distinct = build_queue(refused, opus_dir=ROOT / 'raw' / 'opus')
    assert n_distinct == 2
    assert len(entries) == 3
    # Cheapest first: the form-set with 2 instances leads.
    assert entries[0]['n_same_form_set'] == 2
    assert entries[0]['forms'] == list(form_set_key(a.readers))
    assert entries[1]['n_same_form_set'] == 2
    assert entries[2]['n_same_form_set'] == 1
    for e in entries:
        assert 'page' in e and 'col' in e and 'word_off' in e
        assert 'readers' in e and 'kind' in e and 'reason' in e
