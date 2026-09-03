"""Bundled cards: every member's ink on the card, and one click to pull it out.

John's rule from the 2026-08-11 ligature sitting — 25 cards, 192 sites in one
sitting — is that the EXCLUDES are what make a group ruling safe. A card binds
every site printing the same form, and byte-identical transcription is not
byte-identical ink.
"""

import json
import socket
import threading
import time
import urllib.request
from pathlib import Path

import pytest

from bonitz_pipeline import book_review, cold_queue, settle_review


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class _F:
    def __init__(self, sid):
        self.sid = sid


def _serve(store: Path, sites: set, port: int):
    t = threading.Thread(
        target=book_review.serve,
        args=([_F('forms:καὶ|ϗ̀')], port, '127.0.0.1'),
        kwargs={'page': store.parent / 'p.html', 'store': store,
                'verdicts': ('preserve', 'accept'), 'sites': sites},
        daemon=True)
    t.start()
    for _ in range(100):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/rulings', timeout=1)
            return
        except Exception:
            time.sleep(0.05)
    raise RuntimeError('server did not start')


def _post(port: int, path: str, body: dict) -> int:
    req = urllib.request.Request(
        f'http://127.0.0.1:{port}{path}',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json'})
    try:
        return urllib.request.urlopen(req, timeout=2).status
    except urllib.error.HTTPError as e:
        return e.code


def test_exclude_is_recorded_and_the_ruling_survives_it(tmp_path):
    store = tmp_path / 'rulings.json'
    (tmp_path / 'p.html').write_text('<html></html>')
    port = _free_port()
    _serve(store, {'page-107-L:7:317', 'page-107-L:15:900'}, port)

    assert _post(port, '/ruling', {'id': 'forms:καὶ|ϗ̀',
                                   'verdict': 'preserve', 'detail': 'ϗ̀'}) == 204
    assert _post(port, '/exclude', {'id': 'forms:καὶ|ϗ̀',
                                    'site': 'page-107-L:7:317',
                                    'excluded': True}) == 204
    have = json.loads(store.read_text(encoding='utf-8'))
    # ⚠ The exclude must not wipe the verdict, and the verdict must not wipe
    # the excludes — the ruling is SCOPED by them.
    assert have['forms:καὶ|ϗ̀']['verdict'] == 'preserve'
    assert have['forms:καὶ|ϗ̀']['excluded'] == ['page-107-L:7:317']

    assert _post(port, '/ruling', {'id': 'forms:καὶ|ϗ̀',
                                   'verdict': 'accept', 'detail': 'καὶ'}) == 204
    have = json.loads(store.read_text(encoding='utf-8'))
    assert have['forms:καὶ|ϗ̀']['excluded'] == ['page-107-L:7:317']

    assert _post(port, '/exclude', {'id': 'forms:καὶ|ϗ̀',
                                    'site': 'page-107-L:7:317',
                                    'excluded': False}) == 204
    have = json.loads(store.read_text(encoding='utf-8'))
    assert have['forms:καὶ|ϗ̀']['excluded'] == []


def test_exclude_refuses_a_site_this_build_never_put_on_a_card(tmp_path):
    store = tmp_path / 'rulings.json'
    (tmp_path / 'p.html').write_text('<html></html>')
    port = _free_port()
    _serve(store, {'page-107-L:7:317'}, port)
    assert _post(port, '/exclude', {'id': 'forms:καὶ|ϗ̀',
                                    'site': 'page-999-Z:1:1',
                                    'excluded': True}) == 400
    assert not store.exists() or 'excluded' not in store.read_text()


def _queue(tmp_path: Path) -> Path:
    q = tmp_path / 'queue.json'
    q.write_text(json.dumps({
        'spine_reader': 'kraken-r6',
        'entries': [
            {'page': 107, 'col': 'L', 'line': 7, 'word_off': 317,
             'char_at': 5, 'readers': {'opus': 'ϗ̀', 'genie': 'καὶ'},
             'kind': 'marks-only', 'reason': 'cold:marks-only',
             'forms': ['καὶ', 'ϗ̀'], 'form_set': ['καὶ', 'ϗ̀'],
             'n_same_form_set': 2},
            {'page': 107, 'col': 'L', 'line': 15, 'word_off': 900,
             'char_at': 3, 'readers': {'opus': 'ϗ̀', 'genie': 'καὶ'},
             'kind': 'marks-only', 'reason': 'cold:marks-only',
             'forms': ['καὶ', 'ϗ̀'], 'form_set': ['καὶ', 'ϗ̀'],
             'n_same_form_set': 2},
        ]}, ensure_ascii=False), encoding='utf-8')
    return q


def test_an_excluded_site_comes_back_as_its_own_card(tmp_path):
    q = _queue(tmp_path)
    rulings = tmp_path / 'rulings.json'
    rulings.write_text(json.dumps({'forms:καὶ|ϗ̀': {
        'verdict': 'preserve', 'detail': 'ϗ̀',
        'excluded': ['page-107-L:7:317']}}, ensure_ascii=False),
        encoding='utf-8')

    doc = cold_queue.followup(rulings, q)
    assert doc['n_distinct_decisions'] == 1
    e = doc['entries'][0]
    # ⚠ Keyed by SITE. Sharing the group's key would overwrite the very ruling
    # this site was excluded from.
    assert e['card_sid'] == 'site:page-107-L:7:317'
    assert e['n_same_form_set'] == 1
    assert 'excluded from the group ruling' in e['note']

    cards = settle_review.group_entries(doc['entries'])
    assert len(cards) == 1
    assert cards[0].sid == 'site:page-107-L:7:317'
    assert cards[0].sid != 'forms:καὶ|ϗ̀'


def test_a_followup_card_is_never_regrouped_with_its_form_set(tmp_path):
    # Two excluded sites of the SAME form must be two cards, not one: they were
    # pulled out because their ink differed, and from each other too.
    q = _queue(tmp_path)
    rulings = tmp_path / 'rulings.json'
    rulings.write_text(json.dumps({'forms:καὶ|ϗ̀': {
        'verdict': 'preserve', 'detail': 'ϗ̀',
        'excluded': ['page-107-L:7:317', 'page-107-L:15:900']}},
        ensure_ascii=False), encoding='utf-8')
    cards = settle_review.group_entries(cold_queue.followup(rulings, q)['entries'])
    assert len(cards) == 2
    assert {c.sid for c in cards} == {'site:page-107-L:7:317',
                                      'site:page-107-L:15:900'}


def test_an_exclude_pointing_nowhere_is_a_refusal_not_a_silent_drop(tmp_path):
    q = _queue(tmp_path)
    rulings = tmp_path / 'rulings.json'
    rulings.write_text(json.dumps({'forms:καὶ|ϗ̀': {
        'verdict': 'preserve', 'detail': 'ϗ̀',
        'excluded': ['page-500-R:1:1']}}, ensure_ascii=False), encoding='utf-8')
    with pytest.raises(SystemExit) as e:
        cold_queue.followup(rulings, q)
    assert 'page-500-R:1:1' in str(e.value)


def test_the_strip_carries_every_member_and_an_exclude_for_each():
    card = settle_review.Card(
        form_set=('καὶ', 'ϗ̀'),
        members=[settle_review.Member(page=107, col='L', line=7, word_off=317,
                                      char_at=5, readers={'opus': 'ϗ̀'}, kind='marks-only', reason='cold',
                                      crop_name='a.png', crop_how='text'),
                 settle_review.Member(page=107, col='L', line=15, word_off=900,
                                      char_at=3, readers={'opus': 'ϗ̀'}, kind='marks-only', reason='cold',
                                      crop_name='b.png', crop_how='text')])
    out = settle_review.strip_html(card)
    assert out.count('<figure') == 2
    assert '/crops/a.png' in out and '/crops/b.png' in out
    assert out.count('class="x"') == 2
    assert 'page-107-L:7:317' in out and 'page-107-L:15:900' in out


def test_a_member_with_no_crop_says_so_rather_than_showing_another_line():
    card = settle_review.Card(
        form_set=('καὶ', 'ϗ̀'),
        members=[settle_review.Member(page=107, col='L', line=7, word_off=317,
                                      char_at=5, readers={'opus': 'ϗ̀'}, kind='marks-only', reason='cold',
                                      crop_name='a.png', crop_how='text'),
                 settle_review.Member(page=107, col='L', line=0, word_off=-1,
                                      char_at=-1, readers={'opus': 'ϗ̀'}, kind='marks-only', reason='cold')])
    out = settle_review.strip_html(card)
    assert 'NO CROP' in out
    assert out.count('<img') == 1


def test_a_single_site_card_gets_no_strip():
    # The card's own crop already shows the one site; a strip of one is noise.
    card = settle_review.Card(
        form_set=('καὶ', 'ϗ̀'),
        members=[settle_review.Member(page=107, col='L', line=7, word_off=317,
                                      char_at=5, readers={'opus': 'ϗ̀'}, kind='marks-only', reason='cold',
                                      crop_name='a.png')])
    assert settle_review.strip_html(card) == ''


# --- dispute bundles ------------------------------------------------------

def _entry(page, col, line, off, spine, other, kind='marks-only'):
    return {'page': page, 'col': col, 'line': line, 'word_off': off,
            'char_at': 0, 'readers': {'opus': spine, 'genie': other},
            'kind': kind, 'reason': 'cold:' + kind,
            'forms': sorted([spine, other]), 'form_set': sorted([spine, other]),
            'n_same_form_set': 1}


def _bundle_queue(tmp_path, entries):
    q = tmp_path / 'q.json'
    q.write_text(json.dumps({'spine_reader': 'kraken-r6', 'entries': entries},
                            ensure_ascii=False), encoding='utf-8')
    return q


def test_one_dispute_across_different_words_becomes_one_card(tmp_path):
    # `Λακεδαιμονίȣς` and `κόσμȣ` are two words asking one question.
    q = _bundle_queue(tmp_path, [
        _entry(107, 'L', 3, 10, 'Λακεδαιμονίȣς', 'Λακεδαιμονίους'),
        _entry(108, 'R', 9, 40, 'κόσμȣ', 'κόσμου'),
    ])
    rulings = tmp_path / 'r.json'
    rulings.write_text('{}', encoding='utf-8')
    doc = cold_queue.bundle(q, rulings)
    assert doc['n_bundles'] == 1
    cards = settle_review.group_entries(doc['entries'])
    assert len(cards) == 1
    assert cards[0].sid == 'dispute:marks-only:ȣ>ου'
    assert cards[0].n == 2
    # Each site keeps ITS OWN target: accepting must not write one word over
    # the other.
    assert {e['becomes'] for e in doc['entries']} == {'Λακεδαιμονίους',
                                                      'κόσμου'}


def test_an_answered_card_is_never_re_keyed_by_the_rebuild(tmp_path):
    # ⚠ A ruling belongs to the SITE, and a rebuild that renames its card
    # orphans the answer. John ruled 79 cards before bundling existed.
    q = _bundle_queue(tmp_path, [
        _entry(107, 'L', 3, 10, 'Λακεδαιμονίȣς', 'Λακεδαιμονίους'),
        _entry(108, 'R', 9, 40, 'κόσμȣ', 'κόσμου'),
    ])
    answered = 'forms:' + '|'.join(sorted(['Λακεδαιμονίȣς',
                                           'Λακεδαιμονίους']))
    rulings = tmp_path / 'r.json'
    rulings.write_text(json.dumps({answered: {'verdict': 'preserve',
                                              'detail': 'Λακεδαιμονίȣς'}},
                                  ensure_ascii=False), encoding='utf-8')
    doc = cold_queue.bundle(q, rulings)
    sids = {c.sid for c in settle_review.group_entries(doc['entries'])}
    assert answered in sids            # his answer still finds its card
    assert doc['n_bundles'] == 0       # one site left; a dispute of one is not
                                       # a bundle


def test_a_ruled_card_never_gains_a_strip_after_the_fact(tmp_path):
    # John ruled from ONE exemplar crop. Bolting every member's crop onto the
    # answered card afterwards shows him sites he was never asked about, under
    # a green tick, and dresses one ruling as a scoped judgement.
    card = settle_review.Card(
        form_set=('καὶ', 'ϗ̀'),
        ruled_before_strip=True,
        members=[settle_review.Member(page=107, col='L', line=7, word_off=317,
                                      char_at=5, readers={'opus': 'ϗ̀'},
                                      kind='marks-only', reason='cold',
                                      crop_name='a.png', crop_how='text'),
                 settle_review.Member(page=107, col='L', line=15, word_off=900,
                                      char_at=3, readers={'opus': 'ϗ̀'},
                                      kind='marks-only', reason='cold',
                                      crop_name='b.png', crop_how='text')])
    assert settle_review.strip_html(card) == ''
    card.ruled_before_strip = False
    assert '<figure' in settle_review.strip_html(card)


def test_a_bundle_button_names_the_change_not_one_of_the_words():
    # `corpus becomes κόσμου at every site` would write one word over eighteen
    # others.
    card = settle_review.Card(
        form_set=('κόσμȣ', 'κόσμου'),
        bundle={'kind': 'marks-only', 'label': 'ȣ → ου',
                'subs': [['ȣ', 'ου']]},
        members=[settle_review.Member(page=107, col='L', line=3, word_off=10,
                                      char_at=0, readers={'opus': 'κόσμȣ'},
                                      kind='marks-only', reason='cold'),
                 settle_review.Member(page=108, col='R', line=9, word_off=40,
                                      char_at=0, readers={'opus': 'κόσμȣ'},
                                      kind='marks-only', reason='cold')])
    opts = settle_review.options_for(card)
    labels = ' '.join(o['label'] for o in opts)
    assert 'κόσμου' not in labels
    assert 'ȣ → ου' in labels
    assert [o['verdict'] for o in opts].count('preserve') == 2   # keep + none
    assert any(o['detail'] == 'bundle:ȣ>ου' for o in opts)
    assert all('2 sites on this card' in o['consequence']
               or 'every site here' in o['consequence'] for o in opts)


def test_the_bundle_strip_says_which_word_each_crop_is():
    # Nineteen crops of nineteen DIFFERENT words: without the word on the
    # caption the strip reads as one word printed nineteen times.
    card = settle_review.Card(
        form_set=('κόσμȣ', 'κόσμου'),
        bundle={'kind': 'marks-only', 'label': 'ȣ → ου',
                'subs': [['ȣ', 'ου']]},
        members=[settle_review.Member(page=107, col='L', line=3, word_off=10,
                                      char_at=0, readers={'opus': 'κόσμȣ'},
                                      kind='marks-only', reason='cold',
                                      crop_name='a.png', crop_how='text'),
                 settle_review.Member(page=108, col='R', line=9, word_off=40,
                                      char_at=0,
                                      readers={'opus': 'Λακεδαιμονίȣς'},
                                      kind='marks-only', reason='cold',
                                      crop_name='b.png', crop_how='text')])
    out = settle_review.strip_html(card)
    assert 'κόσμȣ' in out and 'Λακεδαιμονίȣς' in out
