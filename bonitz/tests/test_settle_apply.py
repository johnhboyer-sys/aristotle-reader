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


PAGE_COL = f'page-{PAGE:03d}-{COL}'


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
    nothing is refused. All 16 now stand in reconciled-auto: 15 were written
    the first time, and 056-L:59 — the one the stale-offset bug rejected —
    followed once `_anchor` could find it, 2026-08-10.
    """
    steps = settle_apply.plan()
    assert settle_apply.unruled() == [], 'a card lost its ruling'
    accepts = [s for s in steps if s['verdict'] == 'accept'
               and s['printed'] != s['becomes']]
    assert len(accepts) == 16, len(accepts)
    out = settle_apply.apply(steps, write=False)
    assert out['skips'] == [], out['skips'][:10]
    assert out['counts']['preserve'] == 385, out['counts']
    assert out['counts']['already'] == 16, out['counts']


def test_the_carried_plan_is_the_one_that_now_applies():
    """The store above is history; this is the live one.

    After the kraken re-read, what gets applied is the FILTERED queue against
    the CARRIED rulings — 270 of them, 236 carried by site plus the 34 John
    answered afterwards. The two stores must agree about the page even though
    they group it differently: same 16 accepts, all standing, nothing refused.

    ⚠ Testing only the old defaults would have guarded a file nobody applies —
    the same shape of hole as a gate reading a column that is not there.
    """
    root = Path(settle_apply.__file__).resolve().parent.parent
    q = root / 'work' / 'queue-053-062-filtered.json'
    r = root / 'work' / 'sweeps' / 'settle-rulings-carried.json'
    steps = settle_apply.plan(q, r)
    assert settle_apply.unruled(q, r) == [], 'a card lost its ruling'
    accepts = [s for s in steps if s['verdict'] == 'accept'
               and s['printed'] != s['becomes']]
    assert len(accepts) == 16, len(accepts)
    out = settle_apply.apply(steps, write=False)
    assert out['skips'] == [], out['skips'][:10]
    assert out['counts'] == {'edited': 0, 'preserve': 341, 'noop': 0,
                             'already': 16, 'skipped': 0}, out['counts']
    # The two sites this store settles that the old grouping could not:
    # 054-L:35, which exemplar drift withheld until he was asked, and
    # 056-L:59. Both are in the corpus now.
    assert settle_apply.corrigenda_for(steps) and [
        (e['printed'], e['correct']) for e in settle_apply.corrigenda_for(steps)
    ] == [('ἄνθρώπȣ', 'ἀνθρώπȣ')]


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


# ---------------------------------------------------------------------------
# A word broken at the measure
#
# Bonitz hyphenates at the line end, and `canonical` folds that hyphen away —
# so the stream holds `ἀγνοιαν` while the page, the card and the ruling all
# hold `ἀ-γνοιαν`. The applier compared the second against the first, found
# nothing, and reported `no_anchor` for four of John's seven accepts. The
# lines below are the real corpus lines those cards sit on.
# ---------------------------------------------------------------------------

BROKEN_PAGE = 901
BROKEN_TEXT = (
    'Αα35. 48a31. ἀνακτέον τȣ̀ς λόγȣς εἰς τὴν τȣ͂ ἐλέγχȣ ἀ-\n'
    'γνοιαν (syn ἀναλύειν εἰς) τι6. 168a18. ἀνάγειν εἰς γνωριμώ-\n'
    'ρεῖσθαι, opp ὑγιάζεσθαι Ζγα18. 726a14. ἀναιρεῖν τȣ̀ς ὑπερ-\n'
    'ἔχοντας, τȣ̀ς φρονηματίας, τȣ̀ς κρείττȣς Πγ13. 1284a33.\n'
    'ἀνάληψις. ἡ τȣ͂ κηρȣ͂ ἀνάληψις ὦπται Ζιι40. 624 b9. — ἀνά-\n'
    'ληψις μνήμης, dist λῆψις μν2. 451 a30.\n'
    'λειν τὴν ἰσότητα τῆς κοινῆς ἀναλογίας μα3. 340 a4. ὑπερ-\n'
    'ἔχειν τῆς ἀναλογίας Οδ2. 309 a14. ὑπερέχειν τὴν εἰρημένην\n'
    'ακ800b15. — 2. i q ἀπόπλ[?]ς θ108. 840a33. — 3. logice\n'
    'κατ᾽ ἀναλογίαν λέγεσθαι Ζγα1. 715 b20. μεταφοραὶ κατ\n'
)


@pytest.fixture
def broken(tmp_path, monkeypatch):
    """The broken-word column, with the module's paths pointed at it."""
    opus = tmp_path / 'raw' / 'opus'
    opus.mkdir(parents=True)
    (opus / f'page-{BROKEN_PAGE}-L.txt').write_text(BROKEN_TEXT,
                                                    encoding='utf-8')
    auto = tmp_path / 'work' / 'reconciled-auto'
    corr = tmp_path / 'work' / 'corrigenda' / 'entries.json'
    corr.parent.mkdir(parents=True)
    corr.write_text(json.dumps({'entries': []}), encoding='utf-8')
    monkeypatch.setattr(settle_apply, 'OPUS', opus)
    monkeypatch.setattr(settle_apply, 'AUTO', auto)
    monkeypatch.setattr(settle_apply, 'CORRIGENDA', corr)
    monkeypatch.setattr(settle_apply, 'ASIDE',
                        tmp_path / 'work' / 'sweeps' / 'settle-none.json')
    return {'auto': auto, 'opus': opus, 'corrigenda': corr,
            'col': auto / f'page-{BROKEN_PAGE}-L.txt'}


def _piece(line_no: int, text: str, *, last: bool = False) -> dict:
    """A printed piece at its real coordinates in the fixture column."""
    line = BROKEN_TEXT.split('\n')[line_no - 1]
    start = line.rindex(text) if last else line.index(text)
    assert start >= 0
    return {'line': line_no, 'start': start, 'text': text}


def _stream_off(line_no: int, start: int) -> int:
    """The canonical-stream offset of a printed position — what word_off is."""
    cleaned = clean_opus(BROKEN_TEXT)
    base = sum(len(l) + 1 for l in cleaned.split('\n')[:line_no - 1]) + start
    _, offs = canonical(cleaned)
    return offs.index(base)


def _bentry(pieces: list[dict], forms: list[str], line: int) -> dict:
    """One queue entry as `merge_review._dress` writes it.

    `word_off` is the WORD's start — the head piece — whichever half the card
    is about; `line` is the half under dispute. That split is the round-2
    contract and this fixture keeps it.
    """
    printed = ''.join(p['text'] for p in pieces)
    return {'page': BROKEN_PAGE, 'col': 'L', 'line': line,
            'word_off': _stream_off(pieces[0]['line'], pieces[0]['start']),
            'char_at': pieces[0]['start'],
            'readers': {'opus': printed}, 'kind': 'marks', 'reason': 'test',
            'forms': sorted(set(forms)), 'form_set': sorted(set(forms)),
            'pieces': pieces, 'broken': len(pieces) > 1,
            'printed_token': printed}


def _run(tmp_path, entries: list[dict], rulings: dict) -> tuple[dict, list[str]]:
    """Apply these rulings to the fixture column; return (result, lines)."""
    q = _queue(tmp_path, entries)
    r = _rulings(tmp_path, rulings)
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    col = settle_apply.AUTO / f'page-{BROKEN_PAGE}-L.txt'
    text = col.read_text(encoding='utf-8') if col.exists() else BROKEN_TEXT
    return out, text.split('\n')


ORIG = BROKEN_TEXT.split('\n')


# --- the four shapes John ruled on 53-62 ------------------------------------

def test_head_edit_lands_on_the_head_line_only(broken, tmp_path):
    """`ἀ-γνοιαν` → `ἄ-γνοιαν`, 054-L:32. The accent is on the head; the tail
    line must come out byte for byte as it went in."""
    e = _bentry([_piece(1, 'ἀ-', last=True), _piece(2, 'γνοιαν')],
                ['ἀ-γνοιαν', 'ἄ-γνοιαν'], line=1)
    out, lines = _run(tmp_path, [e],
                      {'forms:ἀ-γνοιαν|ἄ-γνοιαν': {'verdict': 'accept',
                                                   'detail': 'ἄ-γνοιαν'}})
    assert out['counts']['edited'] == 1 and out['skips'] == [], out
    assert lines[0].endswith('ἐλέγχȣ ἄ-')
    assert lines[1] == ORIG[1], 'the tail line was rewritten'


def test_tail_edit_removes_the_breathing_on_the_tail_line_only(broken, tmp_path):
    """`ὑπερ-ἔχοντας` → `ὑπερ-έχοντας`, 057-R:8. The smooth breathing goes off
    the tail's first letter; the head keeps its hyphen and everything else."""
    e = _bentry([_piece(3, 'ὑπερ-', last=True), _piece(4, 'ἔχοντας')],
                ['ὑπερ-έχοντας', 'ὑπερ-ἔχοντας'], line=4)
    out, lines = _run(tmp_path, [e],
                      {'forms:ὑπερ-έχοντας|ὑπερ-ἔχοντας':
                       {'verdict': 'accept', 'detail': 'ὑπερ-έχοντας'}})
    assert out['counts']['edited'] == 1 and out['skips'] == [], out
    assert lines[2] == ORIG[2], 'the head line was rewritten'
    assert lines[3].startswith('έχοντας,')


def test_tail_edit_writes_the_stigma_on_the_last_letter(broken, tmp_path):
    """`ἀνά-ληψις` → `ἀνά-ληψιϛ`, 059-R:23. John ruled a final stigma, which is
    neither form the card offered — and it touches one letter of the tail."""
    e = _bentry([_piece(5, 'ἀνά-', last=True), _piece(6, 'ληψις')],
                ['ἀνά-ληψις', 'ἀνά-λῆψις'], line=6)
    out, lines = _run(tmp_path, [e],
                      {'forms:ἀνά-ληψις|ἀνά-λῆψις': {'verdict': 'accept',
                                                     'detail': 'ἀνά-ληψιϛ'}})
    assert out['counts']['edited'] == 1 and out['skips'] == [], out
    assert lines[4] == ORIG[4], 'the head line was rewritten'
    assert lines[5].startswith('ληψιϛ μνήμης')
    # …and the unbroken twin two lines up is a different word, untouched.
    assert lines[4].count('ἀνάληψις') == 2


def test_tail_continuation_does_not_grab_the_unbroken_twin(broken, tmp_path):
    """`ὑπερ-ἔχειν` → `ὑπερ-έχειν`, 059-R:47. The same tail line prints
    `ὑπερέχειν` seamlessly further along, so the stream holds the word twice
    and only the one the card anchors may be written."""
    e = _bentry([_piece(7, 'ὑπερ-', last=True), _piece(8, 'ἔχειν')],
                ['ὑπερ-έχειν', 'ὑπερ-ἔχειν'], line=8)
    out, lines = _run(tmp_path, [e],
                      {'forms:ὑπερ-έχειν|ὑπερ-ἔχειν': {'verdict': 'accept',
                                                       'detail': 'ὑπερ-έχειν'}})
    assert out['counts']['edited'] == 1 and out['skips'] == [], out
    assert lines[6] == ORIG[6], 'the head line was rewritten'
    assert lines[7].startswith('έχειν τῆς')
    assert 'ὑπερέχειν τὴν εἰρημένην' in lines[7], 'the twin was edited too'


def test_without_its_pieces_a_broken_accept_cannot_be_anchored(broken):
    """The bug itself, stated. `canonical` folds `-\\n`, so the stream holds
    `ἀγνοιαν` while the card, the page and the ruling hold `ἀ-γνοιαν`; matching
    the second against the first finds nothing, and all four of John's broken
    accepts refused. The geometry is what makes the difference, so the test
    runs the same step twice — once with the pieces stripped off.
    """
    text = unicodedata.normalize('NFC', clean_opus(BROKEN_TEXT))
    opus_len = len(canonical(text)[0])
    for pieces, becomes in (
            ([_piece(1, 'ἀ-', last=True), _piece(2, 'γνοιαν')], 'ἄ-γνοιαν'),
            ([_piece(3, 'ὑπερ-', last=True), _piece(4, 'ἔχοντας')],
             'ὑπερ-έχοντας'),
            ([_piece(5, 'ἀνά-', last=True), _piece(6, 'ληψις')], 'ἀνά-ληψιϛ'),
            ([_piece(7, 'ὑπερ-', last=True), _piece(8, 'ἔχειν')],
             'ὑπερ-έχειν')):
        printed = ''.join(p['text'] for p in pieces)
        step = {'verdict': 'accept', 'printed': printed, 'becomes': becomes,
                'exemplar': printed, 'pieces': None,
                'word_off': _stream_off(pieces[0]['line'],
                                        pieces[0]['start'])}
        assert settle_apply._apply_one(step, text, opus_len)[1] == 'no_anchor'
        assert settle_apply._apply_one(dict(step, pieces=pieces), text,
                                       opus_len)[1] == 'edited'


def test_the_printers_hyphen_is_never_added_or_removed(broken, tmp_path):
    """The cut is made at the hyphen the page prints, and both halves keep
    exactly what they had of it."""
    parts = settle_apply.split_on_pieces(['ὑπερ-', 'ἔχοντας'],
                                         'ὑπερ-έχοντας')
    assert parts == ['ὑπερ-', 'έχοντας']
    assert settle_apply.split_on_pieces(['ἀ-', 'γνοιαν'], 'ἄ-γνοιαν') == [
        'ἄ-', 'γνοιαν']
    # A ruling that moves the hyphen cannot be cut, and is refused rather than
    # placed approximately: expanding a damage marker in the head does that.
    assert settle_apply.split_on_pieces(['ἀπόπλ[?]-', 'ς'], 'ἀπόπλȣ-ς') is None


def test_rerunning_a_broken_accept_reports_already(broken, tmp_path):
    """Twice must be the same as once — and must not read as drift."""
    e = _bentry([_piece(3, 'ὑπερ-', last=True), _piece(4, 'ἔχοντας')],
                ['ὑπερ-έχοντας', 'ὑπερ-ἔχοντας'], line=4)
    r = {'forms:ὑπερ-έχοντας|ὑπερ-ἔχοντας': {'verdict': 'accept',
                                             'detail': 'ὑπερ-έχοντας'}}
    _run(tmp_path, [e], r)
    out, lines = _run(tmp_path, [e], r)
    assert out['counts']['already'] == 1 and out['skips'] == [], out
    assert lines[3].startswith('έχοντας,')


# --- the refusal ------------------------------------------------------------

def test_a_tampered_piece_refuses_and_writes_nothing(broken, tmp_path):
    """A piece that no longer reads what the card recorded is a refusal with
    its coordinates named. Writing at the recorded offset would put the ruled
    form onto whatever has since moved there."""
    col = broken['auto'] / f'page-{BROKEN_PAGE}-L.txt'
    col.parent.mkdir(parents=True, exist_ok=True)
    lines = BROKEN_TEXT.split('\n')
    lines[3] = 'ἔχοντες,' + lines[3][len('ἔχοντας,'):]
    tampered = '\n'.join(lines)
    col.write_text(tampered, encoding='utf-8')

    e = _bentry([_piece(3, 'ὑπερ-', last=True), _piece(4, 'ἔχοντας')],
                ['ὑπερ-έχοντας', 'ὑπερ-ἔχοντας'], line=4)
    out, _ = _run(tmp_path, [e],
                  {'forms:ὑπερ-έχοντας|ὑπερ-ἔχοντας':
                   {'verdict': 'accept', 'detail': 'ὑπερ-έχοντας'}})
    assert out['counts']['edited'] == 0, out
    assert len(out['skips']) == 1 and out['skips'][0][1].startswith(
        'piece_drift'), out['skips']
    assert 'line 4 at 0' in out['skips'][0][1], out['skips']
    assert col.read_text(encoding='utf-8') == tampered, 'a refusal wrote'


# --- two cards on one broken word ------------------------------------------

def _pair(detail_head: str, detail_tail: str) -> tuple[list[dict], dict]:
    """The head-card / tail-card pair on `ὑπερ-ἔχειν` — one word, one word_off.

    A full rebuild of 057-R carries this shape: the head is disputed by one
    sweep and the tail by another, and `_dress` keys both to the word's start.
    """
    pieces = [_piece(7, 'ὑπερ-', last=True), _piece(8, 'ἔχειν')]
    head = _bentry(pieces, ['ὑπερ-ἔχειν', 'ὕπερ-ἔχειν'], line=7)
    tail = _bentry(pieces, ['ὑπερ-έχειν', 'ὑπερ-ἔχειν'], line=8)
    assert head['word_off'] == tail['word_off']
    return [head, tail], {
        'forms:ὑπερ-ἔχειν|ὕπερ-ἔχειν': {'verdict': 'preserve'}
        if detail_head is None else {'verdict': 'accept',
                                     'detail': detail_head},
        'forms:ὑπερ-έχειν|ὑπερ-ἔχειν': {'verdict': 'accept',
                                        'detail': detail_tail},
    }


def test_a_preserve_never_blocks_the_other_card_on_the_word(broken, tmp_path):
    """Head card preserved, tail card accepted, one word_off. The old span
    check saw two rulings at one offset and threw both away."""
    entries, rulings = _pair(None, 'ὑπερ-έχειν')
    out, lines = _run(tmp_path, entries, rulings)
    assert out['counts']['preserve'] == 1, out['counts']
    assert out['counts']['edited'] == 1 and out['skips'] == [], out
    assert lines[6] == ORIG[6]
    assert lines[7].startswith('έχειν τῆς')


def test_two_accepts_on_different_halves_both_land(broken, tmp_path):
    """Different halves are different places, so both rulings stand."""
    entries, rulings = _pair('ὕπερ-ἔχειν', 'ὑπερ-έχειν')
    out, lines = _run(tmp_path, entries, rulings)
    assert out['counts']['edited'] == 2 and out['skips'] == [], out
    assert lines[6].endswith('ὕπερ-')
    assert lines[7].startswith('έχειν τῆς')


def test_two_accepts_on_the_same_half_refuse_both(broken, tmp_path):
    """Two answers to one question, and no way to tell which John meant to
    stand. Both refuse, both are named, and the line is left as printed."""
    entries, rulings = _pair('ὑπερ-έχειν', 'ὑπερ-ἔχην')
    out, lines = _run(tmp_path, entries, rulings)
    assert out['counts']['edited'] == 0, out
    assert sorted(why for _, why in out['skips']) == [
        'overlaps_another_edit', 'overlaps_another_edit'], out['skips']
    assert lines[6] == ORIG[6] and lines[7] == ORIG[7]


# --- the two unbroken shapes in the same sitting ----------------------------

def test_a_damaged_sort_is_still_written(broken, tmp_path):
    """056-L:22. John read the ink: the damaged sort is the ou-ligature. No
    card offered it, so the form arrives from the chat ruling."""
    e = _bentry([_piece(9, 'ἀπόπλ[?]ς')], ['ἀπόπλ[?]ς'], line=9)
    out, lines = _run(tmp_path, [e],
                      {'forms:ἀπόπλ[?]ς': {'verdict': 'accept',
                                           'detail': 'ἀπόπλȣς'}})
    assert out['counts']['edited'] == 1 and out['skips'] == [], out
    assert 'i q ἀπόπλȣς θ108.' in lines[8]


def test_an_elided_apostrophe_is_still_written(broken, tmp_path):
    """059-R:60. `κατ` at the measure, `κατ᾽` at the line start — and the
    column prints the elided form eight times, which is why it was offered."""
    e = _bentry([_piece(10, 'κατ', last=True)], ['κατ', 'κατ᾽'], line=10)
    r = {'forms:κατ|κατ᾽': {'verdict': 'accept', 'detail': 'κατ᾽'}}
    out, lines = _run(tmp_path, [e], r)
    assert out['counts']['edited'] == 1 and out['skips'] == [], out
    assert lines[9].endswith('μεταφοραὶ κατ᾽')

    # ⚠ AND ONCE ONLY. The stream folds every apostrophe to one sort, so a
    # finished `κατ᾽` reads back as `κατ'` and matched neither the ruled form
    # nor the "already" test — while the printed `κατ` was still there as its
    # prefix. Three runs wrote three apostrophes.
    out, lines = _run(tmp_path, [e], r)
    assert out['counts'] == {'edited': 0, 'preserve': 0, 'noop': 0,
                             'already': 1, 'skipped': 0}, out['counts']
    assert lines[9].endswith('μεταφοραὶ κατ᾽')


# --- the grammar rule judges a word, not a line-break -----------------------

def test_the_impossible_rule_judges_the_word_not_the_hyphen():
    """`impossible_reason` counts vowel groups, and a printed hyphen splits
    one. Where the break falls inside a vowel cluster the two spellings do not
    agree, and the word is the one the rule is about."""
    step = {'pieces': [{'line': 1, 'start': 0, 'text': 'ἀγνό-'},
                       {'line': 2, 'start': 0, 'text': 'ίανος'}],
            'becomes': 'ἀγνό-ίανος'}
    assert settle_apply.as_word(step, 'ἀγνό-ίανος') == 'ἀγνόίανος'
    assert settle_apply.impossible_reason('ἀγνό-ίανος') != ''
    assert settle_apply.impossible_reason('ἀγνόίανος') == ''


def test_a_broken_accept_banks_no_corrigendum_on_the_hyphen(broken, tmp_path):
    """…so a ruling whose only offence is the line-break registers nothing."""
    step = {'sid': 'forms:x', 'page': BROKEN_PAGE, 'col': 'L', 'line': 2,
            'verdict': 'accept', 'printed': 'ἀγνο-ίανος',
            'becomes': 'ἀγνό-ίανος', 'proposal': '',
            'pieces': [{'line': 1, 'start': 0, 'text': 'ἀγνό-'},
                       {'line': 2, 'start': 0, 'text': 'ίανος'}]}
    assert settle_apply.corrigenda_for([step]) == []


# --- the real sitting, against the corpus it was ruled on --------------------
#
# ⚠ A REHEARSAL OF A FINISHED APPLY CANNOT USE THE APPLIED CORPUS. This test
# read `work/reconciled-auto`, and the seven accepts it counts have since been
# written there — so it reported `already: 7` and failed, on the day the work
# it guards succeeded. A test that dies of its own success teaches nothing and
# looks exactly like a regression.
#
# The columns therefore come from tests/fixtures/fix-sitting-53-62, taken from
# bonitz-text at 5e3f048 — the last commit before the apply. The queue is the
# committed one John was served; the rulings store is the live one, because his
# answers are the input the rehearsal replays, and `allow_foreign` already
# tolerates the other sitting's keys sharing it.

FIX_QUEUE = Path(settle_apply.__file__).resolve().parent.parent / 'work'
REAL_QUEUE = FIX_QUEUE / 'queue-review-53-62-fix.json'
REAL_RULINGS = FIX_QUEUE / 'sweeps' / 'review-rulings.json'
PRE_APPLY = (Path(__file__).resolve().parent / 'fixtures'
             / 'fix-sitting-53-62')
FROZEN_RULINGS = PRE_APPLY / 'work' / 'sweeps' / 'review-rulings.json'


@pytest.fixture
def sitting(tmp_path, monkeypatch):
    """The 53-62 columns as they stood the morning John ruled them.

    A scratch copy, so a test may write to it: applying twice is the only way
    to prove the second run is a no-op, and the second run is where the
    apostrophe doubled.
    """
    auto = tmp_path / 'work' / 'reconciled-auto'
    auto.mkdir(parents=True)
    for p in sorted((PRE_APPLY / 'work' / 'reconciled-auto').glob('page-*.txt')):
        (auto / p.name).write_bytes(p.read_bytes())
    corr = tmp_path / 'work' / 'corrigenda' / 'entries.json'
    corr.parent.mkdir(parents=True)
    corr.write_text(json.dumps({'entries': []}), encoding='utf-8')
    monkeypatch.setattr(settle_apply, 'AUTO', auto)
    monkeypatch.setattr(settle_apply, 'OPUS', PRE_APPLY / 'raw' / 'opus')
    monkeypatch.setattr(settle_apply, 'CORRIGENDA', corr)
    monkeypatch.setattr(settle_apply, 'ASIDE',
                        tmp_path / 'work' / 'sweeps' / 'settle-none.json')

    # ⚠ AND THE STAGE LOOKUP, OR THE REHEARSAL READS THE REAL CORPUS. The
    # applier resolves each column through `normalize.corpus_column` now, so
    # pointing `AUTO` at a scratch copy no longer keeps a test off the live
    # pages: it would rehearse against the promoted corpus and report that as
    # the fixture's answer.
    def column(page, col, *, required=True):
        p = auto / f'page-{page:03d}-{col}.txt'
        return p if p.exists() else None

    monkeypatch.setattr(settle_apply, 'corpus_column', column)
    return auto


@pytest.mark.skipif(not REAL_QUEUE.exists() or not REAL_RULINGS.exists()
                    or not PRE_APPLY.exists(),
                    reason='the 53-62 re-serve is not in this tree')
def test_the_re_serve_plans_seven_accepts_and_refuses_nothing(sitting):
    """John's 8-card sitting, rehearsed against the corpus it was ruled on and
    written nowhere. Seven accepts, one preserve, no refusal — and none of the
    four broken cards reporting `no_anchor`, which is what they all did.

    The store also holds the 35 answers to the first sitting; those cards are
    in another queue, so they are named as foreign rather than applied here.
    """
    steps = settle_apply.plan(REAL_QUEUE, REAL_RULINGS, allow_foreign=True)
    assert settle_apply.unruled(REAL_QUEUE, REAL_RULINGS) == []
    accepts = [s for s in steps if s['verdict'] == 'accept'
               and s['printed'] != s['becomes']]
    assert len(accepts) == 7, [s['member'] for s in accepts]
    assert sum(1 for s in accepts if (s['pieces'] or []) and
               len(s['pieces']) > 1) == 4

    cols = sorted({(s['page'], s['col']) for s in steps})
    before = {c: (sitting / f'page-{c[0]:03d}-{c[1]}.txt').read_bytes()
              for c in cols}
    out = settle_apply.apply(steps, write=False)
    assert out['counts'] == {'edited': 7, 'preserve': 1, 'noop': 0,
                             'already': 0, 'skipped': 0}, out['counts']
    assert out['skips'] == [], out['skips']
    assert 'no_anchor' not in [st for _, st in out['status']]
    assert settle_apply.corrigenda_for(steps) == []
    for c in cols:
        assert (sitting / f'page-{c[0]:03d}-{c[1]}.txt').read_bytes() \
            == before[c], f'a rehearsal wrote {c}'


@pytest.mark.skipif(not REAL_QUEUE.exists() or not REAL_RULINGS.exists()
                    or not PRE_APPLY.exists(),
                    reason='the 53-62 re-serve is not in this tree')
def test_the_sitting_applied_twice_writes_once(sitting):
    """⚠ AND THE SECOND RUN MUST DO NOTHING. Every one of these edits changes a
    length — an apostrophe added, a breathing swapped, a hyphenated word
    rewritten in two pieces — and the stream folds both the measure hyphen and
    every apostrophe sort away, so a finished edit can read back as unfinished
    while its own prefix is still there to match. That is how `κατ᾽` became
    `κατ᾽᾽`. Rerunning an apply is routine; it must be safe."""
    steps = settle_apply.plan(REAL_QUEUE, REAL_RULINGS, allow_foreign=True)
    first = settle_apply.apply(steps, write=True)
    assert first['counts'] == {'edited': 7, 'preserve': 1, 'noop': 0,
                               'already': 0, 'skipped': 0}, first['counts']

    again = settle_apply.apply(
        settle_apply.plan(REAL_QUEUE, REAL_RULINGS, allow_foreign=True),
        write=True)
    assert again['counts'] == {'edited': 0, 'preserve': 1, 'noop': 0,
                               'already': 7, 'skipped': 0}, again['counts']
    assert again['skips'] == [], again['skips']

    text = (sitting / 'page-059-R.txt').read_text(encoding='utf-8')
    assert 'μεταφοραὶ κατ᾽' in text
    for double in ('κατ᾽᾽', "κατ᾽'", "κατ''"):
        assert double not in text, f'{double!r} — the apply ran twice'


@pytest.mark.skipif(not REAL_QUEUE.exists() or not FROZEN_RULINGS.exists(),
                    reason='the 53-62 re-serve is not in this tree')
def test_a_shared_store_is_named_not_swallowed():
    """One store, two sittings. The other sitting's sids name no card here —
    which is not the typo the guard was built for, so they are listed. Without
    the flag it still refuses, because a silent drop is the worse failure.

    The store is the frozen copy, not the live one: the live store gains keys
    with every sitting John rules, and this test counts foreign sids."""
    foreign = settle_apply.foreign_rulings(REAL_QUEUE, FROZEN_RULINGS)
    assert len(foreign) == 35, len(foreign)
    with pytest.raises(SystemExit, match='rulings with no card'):
        settle_apply.plan(REAL_QUEUE, FROZEN_RULINGS)


# --- a bundle ruling: one substitution, many different words ----------------
#
# ⚠ THIS MODULE PREDATES BUNDLES. `settle_review.bundle_options` writes the
# verdict `bundle:α>a`, and `plan` put that STRING in `becomes` — so the
# applier's own guards were the only thing standing between John's space
# sitting and the literal text `bundle:> ` in the corpus. The queue entry
# already carries the member's own spelled `becomes`; nothing read it.

def _bundle_entry(word: str, readers: dict, line: int, sub, becomes: str,
                  card_sid: str | None = None):
    """⚠ ONE CARD, MANY WORDS — so `card_sid` is the substitution, and every
    member of a bundle shares it whatever word that member prints."""
    a, b = sub
    return _entry(word, readers, line,
                  bundle={'kind': 'letters', 'label': f'{a} → {b}',
                          'subs': [[a, b]]},
                  becomes=becomes,
                  card_sid=card_sid or f'dispute:letters:{a}>{b}')


def test_a_bundle_accept_writes_each_site_its_own_form(bench, tmp_path):
    """⚠ `corpus becomes X at every site` IS FALSE ON A BUNDLE — the sites are
    different words sharing one dispute. Each takes the form its own entry
    carries."""
    q = _queue(tmp_path, [
        _bundle_entry('ἀνθρώπȣ', {'opus': 'ἀνθρώπȣ', 'kraken': 'ἀνθρώποȣ'},
                      46, ('ρ', 'ρ'), 'ἀνθρώπȣ'),
    ])
    r = _rulings(tmp_path, {'dispute:letters:ρ>ρ':
                            {'verdict': 'accept', 'detail': 'bundle:ρ>ρ'}})
    steps = settle_apply.plan(q, r)
    assert steps, 'the bundle ruling produced no step'
    assert steps[0]['becomes'] == 'ἀνθρώπȣ', \
        f"wrote {steps[0]['becomes']!r} — a bundle verdict is not a form"
    assert not steps[0]['becomes'].startswith('bundle:')


def test_a_bundle_reaches_a_member_printing_another_word(bench, tmp_path):
    """⚠ THE EXEMPLAR GUARD IS FOR FORM-SET CARDS, NOT BUNDLES. `John ruled on
    the form the card showed him` is right when one card means one word; a
    bundle means one CHANGE asked of many words, and refusing every member but
    the exemplar's own site is refusing the feature."""
    q = _queue(tmp_path, [
        _bundle_entry('ἀνθρώπȣ', {'opus': 'ἀνθρώπȣ'}, 46, ('ώ', 'ω'),
                      'ἀνθρωπȣ', card_sid='dispute:letters:accent>bare'),
        _bundle_entry('ῥαθυμίαι', {'opus': 'ῥαθυμίαι'}, 47, ('ί', 'ι'),
                      'ῥαθυμιαι', card_sid='dispute:letters:accent>bare'),
    ])
    r = _rulings(tmp_path, {'dispute:letters:accent>bare':
                            {'verdict': 'accept', 'detail': 'bundle:accent>bare'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert 'exemplar_drift' not in dict(out['status']).values(), out['status']
    assert out['counts']['edited'] == 2, out['counts']
    got = bench['col'].read_text(encoding='utf-8')
    assert 'ἀνθρωπȣ' in got and 'ῥαθυμιαι' in got


def test_a_bundle_keep_still_writes_nothing(bench, tmp_path):
    """`bundle:keep` is a preserve, and 26 of the 34 bundle rulings on 107-117
    are one. It must stay a noop, not become the literal text."""
    q = _queue(tmp_path, [
        _bundle_entry('ἀνθρώπȣ', {'opus': 'ἀνθρώπȣ'}, 46, ('ώ', 'ω'),
                      'ἀνθρωπȣ')])
    r = _rulings(tmp_path, {'dispute:letters:ώ>ω':
                            {'verdict': 'preserve', 'detail': 'bundle:keep'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert out['counts']['edited'] == 0, out['status']
    if bench['col'].exists():
        assert bench['col'].read_text(encoding='utf-8') == COLUMN_TEXT
        assert 'bundle:' not in bench['col'].read_text(encoding='utf-8')


# --- Latin, and the fold the offsets are written in -------------------------

def test_a_latin_homoglyph_does_not_read_as_a_different_base(bench, tmp_path):
    """⚠ `canonical()` FOLDS LATIN `I` TO GREEK `Ι`, and the queue records the
    spine reading from the folded stream. So a Latin site's `printed` is the
    Greek-folded spelling while the column holds the Latin one, and the base
    check compared the two and refused eight true edits on 107-117.

    The offsets are expressed in the fold; the comparison has to be too. A
    wrong span still fails — it does not fold-match either.
    """
    text = 'Ieberveg Plat Schriften p 12.\n'
    (bench['opus'] / f'page-{PAGE:03d}-{COL}.txt').write_text(
        text, encoding='utf-8')
    stream, _ = canonical(clean_opus(text))
    off = stream.find('Ιeberveg')          # GREEK IOTA — the folded form
    assert off == 0, 'the fixture must exercise the fold'
    q = _queue(tmp_path, [{
        'page': PAGE, 'col': COL, 'line': 1, 'word_off': off, 'char_at': 0,
        'readers': {'opus': 'Ιeberveg', 'llama': 'Ueberweg'},
        'kind': 'letters', 'reason': 'test',
        'forms': ['Ueberweg', 'Ιeberveg'],
        'form_set': ['Ueberweg', 'Ιeberveg']}])
    r = _rulings(tmp_path, {'forms:Ueberweg|Ιeberveg':
                            {'verdict': 'accept', 'detail': 'Ueberweg'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert out['counts']['edited'] == 1, out
    assert 'Ueberweg' in bench['col'].read_text(encoding='utf-8')


def test_the_base_check_still_refuses_a_genuinely_different_word(bench,
                                                                tmp_path):
    """The fold must not become a licence. A site printing another word is
    still refused — that guard has caught real drift."""
    q = _queue(tmp_path, [_entry('ἀνθρώπȣ',
                                 {'opus': 'οὐδέτερος'}, 46)])
    r = _rulings(tmp_path, {'forms:οὐδέτερος':
                            {'verdict': 'accept', 'detail': 'οὐδέτερα'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert out['counts']['edited'] == 0, out['status']


# --- the site outranks the bundle -------------------------------------------

def test_a_site_ruling_beats_a_bundle_covering_the_same_site(bench, tmp_path):
    """⚠ JOHN'S ANSWER BELONGS TO THE SITE. He was shown `ο → ρ` as a group and
    took it, then looked again at two members and said the ink reads `τοῖς` and
    `φιλοσοφίας` — so the group does not reach them. The bundle would have
    written `τρῖς` and `φιλρσοφίας` into the corpus.

    Until this, the exemplar guard was blocking those two by accident, and the
    accident ended the moment bundles were taught to reach past it.
    """
    q = _queue(tmp_path, [
        _bundle_entry('ἀνθρώπȣ', {'opus': 'ἀνθρώπȣ'}, 46, ('ο', 'ρ'),
                      'ἀνθρώπȣ', card_sid='dispute:letters:ο>ρ'),
        _bundle_entry('ῥαθυμίαι', {'opus': 'ῥαθυμίαι'}, 47, ('ο', 'ρ'),
                      'ῥαθυμίαι', card_sid='dispute:letters:ο>ρ'),
    ])
    entries = json.loads(q.read_text(encoding='utf-8'))['entries']
    guarded = f"site:{PAGE_COL}:47:{entries[1]['word_off']}"
    r = _rulings(tmp_path, {
        'dispute:letters:ο>ρ': {'verdict': 'accept',
                                'detail': 'bundle:ο>ρ'},
        guarded: {'verdict': 'preserve', 'detail': 'ῥαθυμίαι'},
    })
    steps = settle_apply.plan(q, r, allow_foreign=True)
    reached = {s['member'] for s in steps if s['sid'] == 'dispute:letters:ο>ρ'}
    assert guarded[5:] not in reached, \
        'the bundle reached a site John had already ruled on its own'
    assert f'{PAGE_COL}:46:{entries[0]["word_off"]}' in reached, \
        'the bundle must still reach every other member'


def test_a_site_ruling_that_agrees_still_takes_the_site(bench, tmp_path):
    """Precedence is not about disagreement — it is about which question was
    answered. Silently letting the bundle win where they agree would make the
    guard depend on the answer instead of the address."""
    q = _queue(tmp_path, [
        _bundle_entry('ἀνθρώπȣ', {'opus': 'ἀνθρώπȣ'}, 46, ('ώ', 'ω'),
                      'ἀνθρωπȣ', card_sid='dispute:letters:ώ>ω')])
    entries = json.loads(q.read_text(encoding='utf-8'))['entries']
    same = f"site:{PAGE_COL}:46:{entries[0]['word_off']}"
    r = _rulings(tmp_path, {
        'dispute:letters:ώ>ω': {'verdict': 'accept', 'detail': 'bundle:ώ>ω'},
        same: {'verdict': 'accept', 'detail': 'ἀνθρωπȣ'},
    })
    steps = settle_apply.plan(q, r, allow_foreign=True)
    assert steps == [], (
        'the bundle took a site that had its own answer. The site ruling is '
        'applied from the queue that asked it — here there is none, and the '
        'right number of steps is none, not a step from the losing card.')


def test_a_site_john_excluded_is_not_written(bench, tmp_path):
    """⚠ `excluded` IS A CLICK, AND THIS MODULE DID NOT READ IT. `settle_review`
    lets John take a group ruling while holding sites back from it, and records
    them on the ruling. Four rulings on 107-117 hold back five sites; four of
    those he later answered on their own, so site-precedence covers them by
    accident. The fifth, `page-112-L:23:1056`, has no other answer — and the
    group was one step from writing `δb → δt` at a site he had refused it.

    An exclusion that only works when a later ruling happens to exist is not
    an exclusion. [[absence-rendered-as-clean]]
    """
    q = _queue(tmp_path, [
        _bundle_entry('ἀνθρώπȣ', {'opus': 'ἀνθρώπȣ'}, 46, ('ώ', 'ω'),
                      'ἀνθρωπȣ', card_sid='dispute:letters:ώ>ω'),
        _bundle_entry('ῥαθυμίαι', {'opus': 'ῥαθυμίαι'}, 47, ('ώ', 'ω'),
                      'ῥαθυμιαι', card_sid='dispute:letters:ώ>ω'),
    ])
    entries = json.loads(q.read_text(encoding='utf-8'))['entries']
    held = f'{PAGE_COL}:47:{entries[1]["word_off"]}'
    r = _rulings(tmp_path, {'dispute:letters:ώ>ω': {
        'verdict': 'accept', 'detail': 'bundle:ώ>ω', 'excluded': [held]}})
    steps = settle_apply.plan(q, r)
    assert held not in {s['member'] for s in steps}, \
        'wrote at a site John held back from the group'
    assert len(steps) == 1, [s['member'] for s in steps]
    out = settle_apply.apply(steps, write=True)
    assert out['counts']['edited'] == 1
    assert 'ῥαθυμιαι' not in bench['col'].read_text(encoding='utf-8')


# --- a ruled form can be more than one word ---------------------------------

def test_a_two_word_ruling_is_judged_word_by_word(bench, tmp_path):
    """⚠ THE GRAMMAR RULE IS ABOUT A WORD, AND A SPACE ENDS ONE. John ruled
    `τȣ̀ςἈρκάδας → τȣ̀ς Ἀρκάδας`, restoring a word-space the spine had lost.
    Judged as a single token the result carries two accents, so the register
    banked it as a misprint John had chosen to KEEP — the opposite of what he
    said, with a fabricated authority line reading "the ink reads the printed
    form" over a correction.

    `τȣ̀ς` and `Ἀρκάδας` are each ordinary Greek. Nothing here is impossible.
    """
    assert settle_apply.impossible_reason('τȣ̀ς Ἀρκάδας'), \
        'the fixture must exercise the single-token misreading'
    assert not settle_apply.impossible_reason('τȣ̀ς')
    assert not settle_apply.impossible_reason('Ἀρκάδας')
    steps = [{'page': 117, 'col': 'R', 'line': 8, 'verdict': 'accept',
              'printed': 'τȣ̀ςἈρκάδας', 'becomes': 'τȣ̀ς Ἀρκάδας',
              'proposal': '', 'sid': 'site:x', 'member': 'm', 'pieces': None}]
    assert settle_apply.corrigenda_for(steps) == [], \
        'a correction was registered as a preserved misprint'


def test_a_genuinely_impossible_word_still_registers(bench, tmp_path):
    """The split must not become an amnesty: one bad word among several still
    makes the form one no grammar allows."""
    steps = [{'page': 117, 'col': 'R', 'line': 8, 'verdict': 'accept',
              'printed': 'x', 'becomes': 'καλός ἕτέρῳ',
              'proposal': '', 'sid': 'site:x', 'member': 'm', 'pieces': None}]
    got = settle_apply.corrigenda_for(steps)
    assert len(got) == 1 and got[0]['rule'] != settle_apply.RULE


# --- an encoding fix: same shape, different codepoint -----------------------

def test_an_encoding_fix_can_be_written_at_all(bench, tmp_path):
    """⚠ THE ONE RULING THE FOLD CANNOT EXPRESS. `encoding_check` asks which
    CODEPOINT a letter is — Latin `O` or Greek `Ο` — and `canonical` conflates
    exactly those two. So the site is located in a stream where the question
    has already been answered away, and `_anchor` hunting the raw spelling in
    the folded stream finds nothing at all.

    Anchoring folds the target, which is right because the stream it searches
    is folded; the write still puts down the raw ruled spelling. A site that
    two codepoints make ambiguous still refuses, because the anchor demands a
    unique match.
    """
    text = 'Bonitz Oα3. 269a natura\n'      # LATIN O before a Greek alpha
    (bench['opus'] / f'page-{PAGE:03d}-{COL}.txt').write_text(
        text, encoding='utf-8')
    stream, _ = canonical(clean_opus(text))
    off = stream.find(canonical('Oα')[0])
    assert off >= 0
    q = _queue(tmp_path, [{
        'page': PAGE, 'col': COL, 'line': 1, 'word_off': off, 'char_at': 7,
        'readers': {'opus': 'Oα'}, 'kind': 'encoding', 'reason': 'test',
        'forms': ['Oα', 'Οα'], 'form_set': ['Oα', 'Οα']}])
    r = _rulings(tmp_path, {'forms:Oα|Οα':
                            {'verdict': 'accept', 'detail': 'Οα'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert out['counts']['edited'] == 1, out
    got = bench['col'].read_text(encoding='utf-8')
    assert 'Οα' in got and 'Oα' not in got, repr(got)


def test_an_encoding_card_reaches_the_member_spelt_the_other_way(bench,
                                                                 tmp_path):
    """⚠ THE MEMBERS DIFFER BECAUSE THAT IS THE FINDING. An encoding family is
    one word the corpus spells two ways — `Bran` on one page and `Βran` on
    another — and the ruling picks the spelling for BOTH. Holding the exemplar
    there refuses the half of the family that is already spelt the other way,
    which is exactly the half the question is about; three of the ten families
    on 107-117 are one site each way.

    Same reasoning as a bundle, and no wider: a form-set card still holds.
    """
    text = 'primum Bran edidit, quod Βran negat\n'
    (bench['opus'] / f'page-{PAGE:03d}-{COL}.txt').write_text(
        text, encoding='utf-8')
    stream, _ = canonical(clean_opus(text))
    q = _queue(tmp_path, [
        {'page': PAGE, 'col': COL, 'line': 1,
         'word_off': stream.find(canonical('Bran')[0]), 'char_at': 7,
         'readers': {'opus': 'Bran'}, 'kind': 'encoding', 'reason': 't',
         'forms': ['Bran', 'Βran'], 'form_set': ['Bran', 'Βran'],
         'card_sid': 'encoding:Βran'},
        {'page': PAGE, 'col': COL, 'line': 1,
         'word_off': stream.rfind(canonical('Βran')[0]), 'char_at': 25,
         'readers': {'opus': 'Βran'}, 'kind': 'encoding', 'reason': 't',
         'forms': ['Bran', 'Βran'], 'form_set': ['Bran', 'Βran'],
         'card_sid': 'encoding:Βran'},
    ])
    r = _rulings(tmp_path, {'encoding:Βran':
                            {'verdict': 'accept', 'detail': 'Bran'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert 'exemplar_drift' not in dict(out['status']).values(), out['status']
    got = bench['col'].read_text(encoding='utf-8')
    assert 'Βran' not in got, 'the Greek-spelt member was left behind'
    assert got.count('Bran') == 2


def test_an_encoding_preserve_settles_the_whole_family(bench, tmp_path):
    """⚠ `preserve` ON AN ENCODING CARD NAMES A SPELLING, NOT "LEAVE IT ALONE".

    The button reads `keep as printed · corum · o (Latin)`: it names one
    spelling and the card covers every site of the family. Read as an ordinary
    preserve — each member keeps whatever it has — the half spelt the other way
    keeps the other way, and the family the sweep exists to settle is STILL
    SPLIT after the ruling is applied. John ruled three families that way on
    107-117 and all three would have stayed exactly as they were.
    """
    text = 'primum Bran edidit, quod Βran negat\n'
    (bench['opus'] / f'page-{PAGE:03d}-{COL}.txt').write_text(
        text, encoding='utf-8')
    stream, _ = canonical(clean_opus(text))
    q = _queue(tmp_path, [
        {'page': PAGE, 'col': COL, 'line': 1,
         'word_off': stream.find(canonical('Bran')[0]), 'char_at': 7,
         'readers': {'opus': 'Bran'}, 'kind': 'encoding', 'reason': 't',
         'forms': ['Bran', 'Βran'], 'form_set': ['Bran', 'Βran'],
         'card_sid': 'encoding:Βran'},
        {'page': PAGE, 'col': COL, 'line': 1,
         'word_off': stream.rfind(canonical('Βran')[0]), 'char_at': 25,
         'readers': {'opus': 'Βran'}, 'kind': 'encoding', 'reason': 't',
         'forms': ['Bran', 'Βran'], 'form_set': ['Bran', 'Βran'],
         'card_sid': 'encoding:Βran'},
    ])
    r = _rulings(tmp_path, {'encoding:Βran':
                            {'verdict': 'preserve', 'detail': 'Bran'}})
    settle_apply.apply(settle_apply.plan(q, r), write=True)
    got = bench['col'].read_text(encoding='utf-8')
    assert 'Βran' not in got, 'the family is still spelt two ways'
    assert got.count('Bran') == 2


def test_an_ordinary_preserve_still_leaves_the_page_alone(bench, tmp_path):
    """The exception is for encoding cards and stops there. A preserve on a
    form-set card is John ruling FOR the page against an authority, and it must
    never rewrite the ink to the card's exemplar."""
    q = _queue(tmp_path, [_entry('ῥαθυμίαι',
                                 {'opus': 'ῥαθυμίαι', 'kraken': 'ῥᾳθυμίαι'}, 47)])
    r = _rulings(tmp_path, {'forms:ῥαθυμίαι|ῥᾳθυμίαι':
                            {'verdict': 'preserve', 'detail': 'ῥᾳθυμίαι'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert out['counts']['edited'] == 0, out['status']


def test_a_deletion_is_not_reported_as_already_done(bench, tmp_path):
    """⚠ `already` MEANT "THE RULED FORM IS HERE", WHICH A DELETION SATISFIES
    BEFORE IT IS APPLIED. Stripping a marginal line number turns `non 5` into
    `non`, and `non` is a PREFIX of what is printed — so the check found it,
    called the edit finished, and left the number in the corpus. Eleven of the
    seventeen margin cards on 107-117 reported `already` and wrote nothing.

    The mirror of the elision case the comment below records: there an accept
    ADDED a character and the printed form survived as a prefix. Either way
    the question is the same — the edit is done only when the OLD form is gone.
    """
    text = 'ad hos locos apparebit non 5\n'
    (bench['opus'] / f'page-{PAGE:03d}-{COL}.txt').write_text(
        text, encoding='utf-8')
    stream, _ = canonical(clean_opus(text))
    off = stream.find(canonical('non 5')[0])
    q = _queue(tmp_path, [{
        'page': PAGE, 'col': COL, 'line': 1, 'word_off': off, 'char_at': 21,
        'readers': {'opus': 'non 5'}, 'kind': 'margin', 'reason': 't',
        'forms': ['non', 'non 5'], 'form_set': ['non', 'non 5']}])
    r = _rulings(tmp_path, {'forms:non|non 5':
                            {'verdict': 'accept', 'detail': 'non'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert out['counts']['edited'] == 1, out
    got = bench['col'].read_text(encoding='utf-8')
    assert got.rstrip().endswith('apparebit non'), repr(got)


def test_a_finished_deletion_is_still_reported_as_already(bench, tmp_path):
    """And a rerun must not delete a second time."""
    text = 'ad hos locos apparebit non\n'
    (bench['opus'] / f'page-{PAGE:03d}-{COL}.txt').write_text(
        text, encoding='utf-8')
    stream, _ = canonical(clean_opus(text))
    q = _queue(tmp_path, [{
        'page': PAGE, 'col': COL, 'line': 1,
        'word_off': stream.find(canonical('non')[0]), 'char_at': 21,
        'readers': {'opus': 'non 5'}, 'kind': 'margin', 'reason': 't',
        'forms': ['non', 'non 5'], 'form_set': ['non', 'non 5']}])
    r = _rulings(tmp_path, {'forms:non|non 5':
                            {'verdict': 'accept', 'detail': 'non'}})
    out = settle_apply.apply(settle_apply.plan(q, r), write=True)
    assert dict(out['status']).get(f'{PAGE_COL}:1:{stream.find(canonical("non")[0])}') \
        == 'already', out['status']
