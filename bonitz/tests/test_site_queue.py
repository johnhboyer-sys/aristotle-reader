"""Re-anchoring a ruling that knows its own site, when the spine has moved."""

import json

import pytest

from bonitz_pipeline import site_queue


COL = (
    'Deperditi libri Aristotelis, qui in superstitibus\n'
    'commemorantur (pΜζ6-8; cf Ρ0o- et Ars poetica)\n'
    'idem idem sed non idem\n'
)


@pytest.fixture
def spine(tmp_path):
    d = tmp_path / 'spine'
    d.mkdir()
    (d / 'page-116-L.txt').write_text(COL, encoding='utf-8')
    return d


def test_a_token_is_found_on_its_own_line(spine):
    off, at = site_queue.anchor(spine, 116, 'L', 2, '(pΜζ6-8;')
    assert at == 14, 'char_at is into the printed line, for the crop'
    from bonitz_pipeline.normalize import canonical
    stream, _ = canonical(COL)
    assert stream[off:off + 8] == canonical('(pΜζ6-8;')[0]


def test_the_offset_survives_the_line_above_changing_length(spine, tmp_path):
    """⚠ THE WHOLE POINT. `latin_spine` swapped calamari in on 517 lines, and
    every offset after a swapped line moved — the ink rulings missed by one to
    three characters. The printed line did not move."""
    before = site_queue.anchor(spine, 116, 'L', 2, 'Ars')[0]
    (spine / 'page-116-L.txt').write_text(
        COL.replace('Deperditi libri', 'Dep erditi libri xx'), encoding='utf-8')
    after = site_queue.anchor(spine, 116, 'L', 2, 'Ars')[0]
    assert after != before, 'the fixture failed to move anything'
    # It still points at the token, and `char_at` — which is measured INTO the
    # printed line, not into the column — did not move at all.
    from bonitz_pipeline.normalize import canonical
    stream, _ = canonical((spine / 'page-116-L.txt').read_text(encoding='utf-8'))
    assert stream[after:after + 3] == canonical('Ars')[0]
    assert site_queue.anchor(spine, 116, 'L', 2, 'Ars')[1] == \
        COL.split('\n')[1].index('Ars')


def test_a_homoglyph_token_still_matches(spine):
    """⚠ MATCHED IN THE FOLD, or the homoglyph sweep cannot find its own sites:
    it records `Αrs` with a GREEK ALPHA for a line printing Latin `Ars`."""
    off, _ = site_queue.anchor(spine, 116, 'L', 2, 'Αrs')     # Greek Α
    off2, _ = site_queue.anchor(spine, 116, 'L', 2, 'Ars')    # Latin A
    assert off == off2


def test_a_token_appearing_twice_refuses(spine):
    with pytest.raises(ValueError, match='appears 3 times'):
        site_queue.anchor(spine, 116, 'L', 3, 'idem')


def test_a_token_not_on_the_line_refuses(spine):
    with pytest.raises(ValueError, match='not on line'):
        site_queue.anchor(spine, 116, 'L', 1, 'poetica')


def test_a_token_on_another_line_is_not_borrowed(spine):
    """The search is confined to the line. A token one line down is a
    different site, and taking it would be a silent relocation."""
    with pytest.raises(ValueError, match='not on line'):
        site_queue.anchor(spine, 116, 'L', 1, 'Ars')


def test_a_missing_column_refuses_rather_than_reporting_nothing(spine):
    with pytest.raises(ValueError, match='no column'):
        site_queue.anchor(spine, 999, 'L', 1, 'Ars')


# --- the store, and the key that moves with the offset ----------------------

def test_a_site_ruling_becomes_a_queue_entry_carrying_its_own_becomes(spine):
    store = {'site:page-116-L:2:9999': {
        'verdict': 'accept', 'token': '(pΜζ6-8;', 'becomes': '(pΜζ6-8;',
        'detail': '(pΜζ6-8;'}}
    queue, refused, rekey, _ = site_queue.build(store, spine)
    assert refused == []
    e = queue['entries'][0]
    assert e['becomes'] == '(pΜζ6-8;'
    assert e['readers']['opus'] == '(pΜζ6-8;'
    assert e['card_sid'] == f"site:page-116-L:2:{e['word_off']}"


def test_the_rekey_is_reported_because_the_key_holds_the_offset(spine):
    """⚠ RE-ANCHORING RENAMES THE RULING. The key is `site:col:line:word_off`,
    so moving the offset moves the key — and a store left un-rekeyed matches
    no card and applies nothing, silently."""
    store = {'site:page-116-L:2:9999': {
        'verdict': 'accept', 'token': 'Ars', 'becomes': 'Ars'}}
    _, _, rekey, _ = site_queue.build(store, spine)
    assert list(rekey) == ['site:page-116-L:2:9999']
    assert rekey['site:page-116-L:2:9999'] != 'site:page-116-L:2:9999'


def test_a_ruling_without_a_token_is_left_alone(spine):
    """Only a SELF-DESCRIBING ruling belongs here. One that names no token is
    answered by a card in its own queue, and inventing geometry for it would
    be a claim about the page."""
    store = {'site:page-116-L:2:10': {'verdict': 'preserve', 'detail': 'x'},
             'forms:a|b': {'verdict': 'accept', 'detail': 'b'}}
    queue, refused, rekey, _ = site_queue.build(store, spine)
    assert queue['entries'] == [] and refused == [] and rekey == {}


def test_a_refusal_is_named_not_dropped(spine):
    store = {'site:page-116-L:3:0': {'verdict': 'accept', 'token': 'idem',
                                     'becomes': 'ιδεμ'}}
    queue, refused, _, _ = site_queue.build(store, spine)
    assert queue['entries'] == []
    assert len(refused) == 1 and 'appears 3 times' in refused[0][1]


def test_a_ruling_the_new_spine_already_satisfies_says_so(spine):
    """⚠ NOT THE SAME AS A LOST RULING. Three of John's ink readings could not
    be anchored on 107-117 because the token was gone: the second engine had
    already made his correction. Reporting that as a bare failure would send
    someone hunting a site that is right."""
    store = {'site:page-116-L:2:0': {'verdict': 'accept',
                                     'token': 'Αrs poetikα',
                                     'becomes': 'Ars poetica'}}
    queue, refused, _, _ = site_queue.build(store, spine)
    assert queue['entries'] == []
    assert refused[0][1].startswith('SATISFIED')


# --- re-anchoring a whole queue ---------------------------------------------

def test_requeue_moves_every_entry_to_the_current_spine(spine):
    q = {'entries': [{'page': 116, 'col': 'L', 'line': 2, 'word_off': 4242,
                      'char_at': 0, 'readers': {'opus': 'Ars'},
                      'kind': 'homoglyph', 'reason': 't',
                      'forms': ['Ars'], 'form_set': ['Ars'],
                      'card_sid': 'site:page-116-L:2:4242'}]}
    out, refused, rekey = site_queue.requeue(q, spine)
    assert refused == []
    e = out['entries'][0]
    assert e['word_off'] != 4242
    assert e['card_sid'] == f"site:page-116-L:2:{e['word_off']}"


def test_a_token_ending_a_printed_line_is_still_found(tmp_path):
    """⚠ THE COLUMN FOLD DROPS A LINE-FINAL HYPHEN — the word carries on over
    the measure — while `canonical('Ρ0o-')` on its own keeps it. Folding the
    token alone and hunting the column for it therefore misses every token
    that ends a line. It missed `Ρ0o- → Po-`, one of the ten sweep sites, and
    reported it as `not on line 52` while it sat there in the ink.
    """
    d = tmp_path / 'spine'
    d.mkdir()
    (d / 'page-115-R.txt').write_text(
        'dubium est: ἕτερος ἔστω λόγος ψγ3. 427b26 (?). — Ρ0o-\n'
        'etica quoque commemoratur alibi\n', encoding='utf-8')
    off, at = site_queue.anchor(d, 115, 'R', 1, 'Ρ0o-')
    assert at == 49
    from bonitz_pipeline.normalize import canonical
    stream, _ = canonical((d / 'page-115-R.txt').read_text(encoding='utf-8'))
    assert stream[off:off + 3] == canonical('Ρ0o')[0]


def test_a_form_cut_at_a_measure_break_is_reported_and_the_store_follows(
        tmp_path):
    """⚠ THE STORE AND THE QUEUE MUST BE CUT TOGETHER. A plain accept is
    written from the RULING's `detail`, never from the entry — so trimming the
    entry alone left `detail` saying `Po-` while the column held `Ρ0ο`, and
    the write would have printed `Po--`."""
    d = tmp_path / 'spine'
    d.mkdir()
    (d / 'page-115-R.txt').write_text(
        'dubium est λόγος ψγ3. 427b26 (?). — Ρ0o-\n'
        'litica quoque commemoratur alibi\n', encoding='utf-8')
    store = {'site:page-115-R:1:0': {'verdict': 'accept', 'token': 'Ρ0o-',
                                     'becomes': 'Po-', 'detail': 'Po-'}}
    queue, refused, rekey, trimmed = site_queue.build(store, d)
    assert refused == []
    assert queue['entries'][0]['readers']['opus'] == 'Ρ0ο', \
        'the token must be spelled as the COLUMN holds it'
    assert queue['entries'][0]['becomes'] == 'Po'
    assert list(trimmed.values()) == ['Po'], trimmed


def test_requeue_rekeys_the_store_or_the_rulings_match_nothing(spine):
    """⚠ THE SILENT FAILURE. A `site:` card's sid holds its offset, so a
    re-anchored queue renames every card that moved — and the homoglyph store,
    still keyed on the old spine's offsets, matched no card and applied none
    of John's eleven rulings while reporting a clean run."""
    q = {'entries': [{'page': 116, 'col': 'L', 'line': 2, 'word_off': 4242,
                      'char_at': 0, 'readers': {'opus': 'Αrs'},
                      'kind': 'homoglyph', 'reason': 't',
                      'forms': ['Αrs', 'Ars'], 'form_set': ['Αrs', 'Ars'],
                      'card_sid': 'site:page-116-L:2:4242'}]}
    out, refused, rekey = site_queue.requeue(q, spine)
    assert refused == []
    assert rekey == {'site:page-116-L:2:4242': out['entries'][0]['card_sid']}
    assert out['entries'][0]['card_sid'] != 'site:page-116-L:2:4242'
    # ⚠ AND THE READING IS RE-SPELLED IN THE FOLD, which is where the offset
    # lives: the column's canonical stream writes Latin `A` as Greek `Α`, and
    # `settle_apply` anchors in that stream. A raw Latin spelling here finds
    # nothing — it is how `Ηeitzp` came back `no_anchor` off a line that plainly
    # held it.
    from bonitz_pipeline.normalize import canonical
    assert out['entries'][0]['readers']['opus'] == canonical('Ars')[0]
    assert out['entries'][0]['readers']['opus'] != 'Ars'
