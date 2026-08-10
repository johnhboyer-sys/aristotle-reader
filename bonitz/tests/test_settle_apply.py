"""The corpus-write path for John's settle rulings — what it writes, and when
it refuses.

Codex reviewed this path on 2026-08-10 and found four ways it could lose or
mangle a ruling without saying so. Every one of them is a test here, because
the recurring failure in this project is a step that silently does nothing and
looks exactly like a step that had nothing to do.

The KEEP rulings get the same coverage as the accepts. They are the ones most
easily lost: a preserve that quietly stops preserving leaves no diff to notice.
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

import pytest

from bonitz_pipeline import settle_apply
from bonitz_pipeline.normalize import canonical, clean_opus

PAGE = 900
COL = 'L'
COLUMN_TEXT = (
    'ἀρχὴ τῆς κινήσεως\n'
    'περὶ ἀνθρώπȣ Ζιβ1. 497 b33\n'
    'καὶ ῥαθυμίαι τινές\n'
)


def _word_off(word: str) -> int:
    stream, _ = canonical(clean_opus(COLUMN_TEXT))
    i = stream.find(unicodedata.normalize('NFC', word))
    assert i >= 0, f'{word!r} not in the fixture column'
    return i


@pytest.fixture
def bench(tmp_path, monkeypatch):
    """A one-column corpus with the module's paths pointed at it."""
    opus = tmp_path / 'raw' / 'opus'
    opus.mkdir(parents=True)
    (opus / f'page-{PAGE:03d}-{COL}.txt').write_text(COLUMN_TEXT,
                                                     encoding='utf-8')
    auto = tmp_path / 'work' / 'reconciled-auto'
    corr = tmp_path / 'work' / 'corrigenda' / 'entries.json'
    corr.parent.mkdir(parents=True)
    corr.write_text(json.dumps({'entries': []}), encoding='utf-8')
    aside = tmp_path / 'work' / 'sweeps' / 'settle-none.json'

    monkeypatch.setattr(settle_apply, 'OPUS', opus)
    monkeypatch.setattr(settle_apply, 'AUTO', auto)
    monkeypatch.setattr(settle_apply, 'CORRIGENDA', corr)
    monkeypatch.setattr(settle_apply, 'ASIDE', aside)
    return {'root': tmp_path, 'opus': opus, 'auto': auto,
            'corrigenda': corr, 'aside': aside,
            'col': auto / f'page-{PAGE:03d}-{COL}.txt'}


def _entry(word: str, readers: dict, line: int, **kw) -> dict:
    forms = sorted(set(readers.values()))
    e = {'page': PAGE, 'col': COL, 'line': line,
         'word_off': _word_off(word), 'char_at': 0,
         'readers': readers, 'kind': 'marks', 'reason': 'test',
         'forms': forms, 'form_set': forms}
    e.update(kw)
    return e


def _queue(tmp_path, entries: list[dict]) -> Path:
    p = tmp_path / 'queue.json'
    p.write_text(json.dumps({'entries': entries}, ensure_ascii=False),
                 encoding='utf-8')
    return p


def _rulings(tmp_path, rulings: dict) -> Path:
    p = tmp_path / 'rulings.json'
    p.write_text(json.dumps(rulings, ensure_ascii=False), encoding='utf-8')
    return p


# --- a dry run must not touch the disk --------------------------------------

def test_dry_run_writes_nothing(bench, tmp_path):
    """`plan()` is a plan. It wrote settle-none.json before printing it."""
    q = _queue(tmp_path, [_entry('ἀνθρώπȣ',
                                 {'opus': 'ἀνθρώπȣ', 'kraken': 'ἄνθρώπȣ'}, 46)])
    r = _rulings(tmp_path, {'forms:ἀνθρώπȣ|ἄνθρώπȣ': {'verdict': 'none'}})
    settle_apply.plan(q, r)
    assert not bench['aside'].exists(), 'dry run wrote the aside file'


def test_none_is_recorded_when_applying(bench, tmp_path):
    """…but the set-aside sites must still be listed on a real run."""
    q = _queue(tmp_path, [_entry('ἀνθρώπȣ',
                                 {'opus': 'ἀνθρώπȣ', 'kraken': 'ἄνθρώπȣ'}, 46)])
    r = _rulings(tmp_path, {'forms:ἀνθρώπȣ|ἄνθρώπȣ': {'verdict': 'none'}})
    steps = settle_apply.plan(q, r, record_aside=True)
    assert steps == [], 'a NONE must never produce a write step'
    aside = json.loads(bench['aside'].read_text(encoding='utf-8'))
    assert len(aside) == 1 and aside[0]['line'] == 46


# --- a card nobody ruled on must be counted, not dropped --------------------

def test_unruled_cards_are_reported(bench, tmp_path):
    """John skipped a card. The plan must say so; it used to say nothing."""
    q = _queue(tmp_path, [
        _entry('ἀνθρώπȣ', {'opus': 'ἀνθρώπȣ', 'kraken': 'ἄνθρώπȣ'}, 46),
        _entry('ῥαθυμίαι', {'opus': 'ῥαθυμίαι', 'kraken': 'ῥᾳθυμίαι'}, 47),
    ])
    r = _rulings(tmp_path, {'forms:ἀνθρώπȣ|ἄνθρώπȣ':
                            {'verdict': 'preserve'}})
    unruled = settle_apply.unruled(q, r)
    assert [c.sid for c in unruled] == ['forms:ῥαθυμίαι|ῥᾳθυμίαι']


# --- accepts, preserves, and the misprint that must self-register ----------

def test_accept_writes_the_ruled_form(bench, tmp_path):
    q = _queue(tmp_path, [_entry('ἀνθρώπȣ',
                                 {'opus': 'ἀνθρώπȣ', 'kraken': 'ἄνθρώπȣ'}, 46)])
    r = _rulings(tmp_path, {'forms:ἀνθρώπȣ|ἄνθρώπȣ':
                            {'verdict': 'accept', 'detail': 'ἄνθρώπȣ'}})
    steps = settle_apply.plan(q, r)
    out = settle_apply.apply(steps, write=True)
    assert out['counts']['edited'] == 1, out
    assert 'ἄνθρώπȣ' in bench['col'].read_text(encoding='utf-8')


def test_accept_of_an_impossible_form_banks_a_corrigendum(bench, tmp_path):
    """Two accents on adjacent syllables is a misprint we chose to PRESERVE by
    accepting it. Rule 6: such an accept must register itself. The ἄνθρώπȣ
    entry had to be written by hand because it did not."""
    q = _queue(tmp_path, [_entry('ἀνθρώπȣ',
                                 {'opus': 'ἀνθρώπȣ', 'kraken': 'ἄνθρώπȣ'}, 46)])
    r = _rulings(tmp_path, {'forms:ἀνθρώπȣ|ἄνθρώπȣ':
                            {'verdict': 'accept', 'detail': 'ἄνθρώπȣ'}})
    settle_apply.apply(settle_apply.plan(q, r), write=True)
    doc = json.loads(bench['corrigenda'].read_text(encoding='utf-8'))
    hits = [e for e in doc['entries'] if e['line'] == 46]
    assert len(hits) == 1, doc['entries']
    # printed is what the ink shows and what we now hold — not the old reading.
    assert hits[0]['printed'] == 'ἄνθρώπȣ'
    assert 'accent' in hits[0]['rule']


def test_a_normal_accept_banks_nothing(bench, tmp_path):
    """Only forms no grammar allows self-register. A plain misread fix is not
    a corrigendum — it is a correction toward the ink."""
    q = _queue(tmp_path, [_entry('ῥαθυμίαι',
                                 {'opus': 'ῥαθυμίαι', 'kraken': 'ῥᾳθυμίαι'},
                                 47)])
    r = _rulings(tmp_path, {'forms:ῥαθυμίαι|ῥᾳθυμίαι':
                            {'verdict': 'accept', 'detail': 'ῥᾳθυμίαι'}})
    settle_apply.apply(settle_apply.plan(q, r), write=True)
    doc = json.loads(bench['corrigenda'].read_text(encoding='utf-8'))
    assert doc['entries'] == []


def test_preserve_leaves_the_text_and_registers_nothing(bench, tmp_path):
    """Confirming that the OCR matches the ink is not an erratum. Banking every
    keep filled the register with 373 entries whose correction was identical to
    what was printed, which is how a real one gets lost."""
    q = _queue(tmp_path, [_entry('ῥαθυμίαι',
                                 {'opus': 'ῥαθυμίαι', 'kraken': 'ῥᾳθυμίαι'},
                                 47)])
    r = _rulings(tmp_path, {'forms:ῥαθυμίαι|ῥᾳθυμίαι':
                            {'verdict': 'preserve'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert out['counts']['preserve'] == 1
    assert out['counts']['edited'] == 0
    doc = json.loads(bench['corrigenda'].read_text(encoding='utf-8'))
    assert doc['entries'] == []


def test_preserve_over_an_authority_is_registered(bench, tmp_path):
    """When a proposal wanted another form and John ruled for the page, that
    disagreement is exactly what the register is for."""
    q = _queue(tmp_path, [dict(
        _entry('ῥαθυμίαι', {'opus': 'ῥαθυμίαι', 'kraken': 'ῥᾳθυμίαι'}, 47),
        proposal={'form': 'ῥᾳθυμίαι', 'authority': 'lexicon'})])
    r = _rulings(tmp_path, {'forms:ῥαθυμίαι|ῥᾳθυμίαι':
                            {'verdict': 'preserve'}})
    settle_apply.apply(settle_apply.plan(q, r), write=True)
    doc = json.loads(bench['corrigenda'].read_text(encoding='utf-8'))
    assert [(e['printed'], e['correct']) for e in doc['entries']] == [
        ('ῥαθυμίαι', 'ῥᾳθυμίαι')]


# --- running it twice must not invent failures ------------------------------

def test_rerun_reports_already_not_mismatch(bench, tmp_path):
    """After a length-changing edit the auto text drifts off Opus geometry.
    The second run used to call four finished edits `base_mismatch`."""
    q = _queue(tmp_path, [
        _entry('ἀνθρώπȣ', {'opus': 'ἀνθρώπȣ', 'kraken': 'ἄνθρώπȣ'}, 46),
        _entry('ῥαθυμίαι', {'opus': 'ῥαθυμίαι', 'kraken': 'ῥᾳθυμίαι'}, 47),
    ])
    r = _rulings(tmp_path, {
        'forms:ἀνθρώπȣ|ἄνθρώπȣ': {'verdict': 'accept', 'detail': 'ἄνθρώπȣ'},
        'forms:ῥαθυμίαι|ῥᾳθυμίαι': {'verdict': 'accept',
                                    'detail': 'ῥᾳθυμίαι'},
    })
    steps = settle_apply.plan(q, r)
    first = settle_apply.apply(steps, write=True)
    assert first['counts']['edited'] == 2, first

    second = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert second['skips'] == [], second['skips']
    assert second['counts']['already'] == 2, second['counts']


def test_an_earlier_edit_does_not_derail_a_later_one(bench, tmp_path):
    """056-L:59 refused because a prior settlement one line above shifted the
    stream by a character. Re-anchor, or refuse for a stated reason — never
    write at a stale offset."""
    q = _queue(tmp_path, [
        _entry('ἀρχὴ', {'opus': 'ἀρχὴ', 'kraken': 'ἀρχή'}, 1),
        _entry('ῥαθυμίαι', {'opus': 'ῥαθυμίαι', 'kraken': 'ῥᾳθυμίαι'}, 47),
    ])
    # Apply the earlier site first, on its own, so the column drifts.
    r1 = _rulings(tmp_path, {'forms:ἀρχή|ἀρχὴ': {'verdict': 'accept',
                                                 'detail': 'ἀρχή'}})
    settle_apply.apply(settle_apply.plan(q, r1), write=True)

    r2 = _rulings(tmp_path, {'forms:ῥαθυμίαι|ῥᾳθυμίαι':
                             {'verdict': 'accept', 'detail': 'ῥᾳθυμίαι'}})
    out = settle_apply.apply(settle_apply.plan(q, r2), write=True)
    assert out['skips'] == [], out['skips']
    assert 'ῥᾳθυμίαι' in bench['col'].read_text(encoding='utf-8')


# --- the two guards that refuse rather than write --------------------------

def test_a_site_printing_something_else_is_refused(bench, tmp_path):
    """The card showed one exemplar; this member prints another. John ruled on
    what he saw, so the ruling does not reach here."""
    # The queue's form_set is built over the strong readers; `readers` holds
    # all five. So a member can land in a card whose exemplar it does not
    # print — and the accept would then overwrite a different word entirely.
    q = _queue(tmp_path, [
        _entry('ἀρχὴ', {'opus': 'ἀρχὴ', 'kraken': 'ἀρχή'}, 1),
        dict(_entry('κινήσεως', {'opus': 'κινήσεως', 'llama': 'κινήσεωσ'}, 1),
             form_set=['ἀρχή', 'ἀρχὴ'], forms=['ἀρχή', 'ἀρχὴ']),
    ])
    r = _rulings(tmp_path, {'forms:ἀρχή|ἀρχὴ': {'verdict': 'accept',
                                                'detail': 'ἀρχή'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert [why for _, why in out['skips']] == ['exemplar_drift'], out['skips']
    assert 'κινήσεως' in bench['col'].read_text(encoding='utf-8')


def test_a_ligature_is_never_written_away(bench, tmp_path):
    """The page has the ȣ sort. Writing `ου` there is not a correction, it is
    a different text. surface_form rescues exact twins only, so a ruling that
    changes a second character too arrives with the ligature already expanded.
    """
    q = _queue(tmp_path, [_entry('ἀνθρώπȣ',
                                 {'opus': 'ἀνθρώπȣ', 'kraken': 'ἀνθρώπου'},
                                 46)])
    # `ἀνθρώπȣν` is what should be written; the ruling arrives spelt out.
    r = _rulings(tmp_path, {'forms:ἀνθρώπȣ|ἀνθρώπου':
                            {'verdict': 'accept', 'detail': 'ἀνθρώπουν'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert [why for _, why in out['skips']] == ['ligature_loss'], out['skips']
    assert not bench['col'].exists(), 'a refusal must not write the column'


def test_a_disputed_ligature_still_applies(bench, tmp_path):
    """The guard must not swallow the opposite case. Where the ruled form has
    no `ου` at all, the ligature was the misreading, and John ruled on it."""
    q = _queue(tmp_path, [_entry('ἀνθρώπȣ',
                                 {'opus': 'ἀνθρώπȣ', 'kraken': 'ἀνθρώποις'},
                                 46)])
    r = _rulings(tmp_path, {'forms:ἀνθρώπȣ|ἀνθρώποις':
                            {'verdict': 'accept', 'detail': 'ἀνθρώποις'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert out['skips'] == [] and out['counts']['edited'] == 1, out
    assert 'ἀνθρώποις' in bench['col'].read_text(encoding='utf-8')


# --- the live queue, so a guard cannot quietly reject John's real rulings ---

def test_the_live_plan_still_applies_cleanly():
    """Guards that refuse everything are as bad as guards that refuse nothing.

    John's 300 rulings still resolve to the same 16 accepts and 385 keeps, and
    nothing is refused: 15 of the accepts are already in reconciled-auto, and
    the sixteenth is 056-L:59, which the stale-offset bug used to reject.
    """
    steps = settle_apply.plan()
    assert settle_apply.unruled() == [], 'a card lost its ruling'
    accepts = [s for s in steps if s['verdict'] == 'accept'
               and s['printed'] != s['becomes']]
    assert len(accepts) == 16, len(accepts)
    out = settle_apply.apply(steps, write=False)
    assert out['skips'] == [], out['skips'][:10]
    assert out['counts']['preserve'] == 385, out['counts']
    assert out['counts']['already'] == 15, out['counts']


def test_only_one_live_ruling_belongs_in_the_register():
    """The impossible-form rule has to fire on the case we know and stay quiet
    everywhere else. Across all 403 steps it names ἄνθρώπȣ and nothing more."""
    entries = settle_apply.corrigenda_for(settle_apply.plan())
    assert [(e['printed'], e['correct']) for e in entries] == [
        ('ἄνθρώπȣ', 'ἀνθρώπȣ')]


def test_the_enclitic_exception_is_honoured():
    """ἄνθρωπός τις carries two accents legitimately — the second on the
    ultima. Calling that impossible would have flagged real Greek as a
    misprint, which is how a grammar starts overruling a page."""
    assert settle_apply.impossible_reason('ἄνθρωπός') == ''
    assert settle_apply.impossible_reason('ἀνθρώπȣ') == ''
    assert settle_apply.impossible_reason('ἄνθρώπȣ') != ''
