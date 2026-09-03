"""The cold tranche: kraken spines it, and nothing may vote twice or vanish."""

import json
from pathlib import Path

from bonitz_pipeline import batch_cold, cold_queue


def test_the_spine_is_named_but_never_counted_as_a_second_reader():
    # A record as `compare4` writes it with a kraken spine: the spine sits at
    # `opus`, the voters are the other keys.
    results = [{'page': 107, 'col': 'L', 'opus': 'τȣ͂', 'genie': 'τὸ',
                'llama': 'τȣ', 'calamari': 'τȣ͂'}]
    batch_cold.stamp(results, 'kraken-r6')
    r = results[0]
    assert r['spine_reader'] == 'kraken-r6'
    # The whole point: no key now holds a duplicate of the spine's vote.
    assert 'kraken' not in r
    voices = [k for k in r if k in ('genie', 'llama', 'calamari', 'kraken')]
    assert sorted(voices) == ['calamari', 'genie', 'llama']


def _spine_column(d: Path, page: int, col: str, lines: list[str]) -> None:
    d.mkdir(parents=True, exist_ok=True)
    (d / f'page-{page:03d}-{col}.txt').write_text(
        '\n'.join(lines) + '\n', encoding='utf-8')


def test_queue_locates_the_site_in_the_kraken_spine_not_in_opus(tmp_path):
    spine = tmp_path / 'txt'
    _spine_column(spine, 107, 'L', ['πρώτη γραμμή', 'δεύτερη καθόλȣ γραμμή'])
    _spine_column(spine, 107, 'R', ['τρίτη γραμμή'])

    # `καθόλȣ` starts at stream offset 20: 12 chars on line 1 (one space
    # dropped by canonical) + 'δεύτερη' = 7 + ... — computed, not guessed.
    from bonitz_pipeline.normalize import canonical
    stream, _ = canonical((spine / 'page-107-L.txt').read_text())
    off = stream.index('καθόλȣ')

    flags = tmp_path / 'flags.jsonl'
    flags.write_text(json.dumps({
        'page': 107, 'col': 'L', 'spine_off': off + 5, 'ctx': '',
        'opus': 'ȣ', 'genie': 'ου', 'llama': 'ου', 'calamari': 'ȣ',
        'cls': '2-2-split', 'vote': None, 'flag': True, 'citation': False,
    }, ensure_ascii=False) + '\n', encoding='utf-8')

    doc = cold_queue.build(flags, spine)
    assert doc['spine_reader'] == 'kraken-r6'
    assert doc['n_words'] == 1
    entry = doc['entries'][0]
    assert entry['page'] == 107 and entry['col'] == 'L'
    assert entry['line'] == 2                      # from the kraken spine
    assert set(entry['form_set']) == {'καθόλȣ', 'καθόλου'}
    assert entry['readers']['opus'] == 'καθόλȣ'    # the spine, under its key
    assert entry['readers']['calamari'] == 'καθόλȣ'


def test_excluded_sites_are_written_out_never_only_counted(tmp_path):
    # 255 of 896 sites on 107-117 excluded as `not_greek_word` — the Bekker
    # citations and the sigla. A queue that drops them silently reads as
    # "nothing to see" when nothing looked.
    spine = tmp_path / 'txt'
    _spine_column(spine, 107, 'L', ['ἀκοὴ 959a20, 30.'])
    _spine_column(spine, 107, 'R', ['γραμμή'])

    flags = tmp_path / 'flags.jsonl'
    flags.write_text(json.dumps({
        'page': 107, 'col': 'L', 'spine_off': 6, 'ctx': '',
        'opus': '9', 'genie': '3', 'llama': '9', 'calamari': '9',
        'cls': 'majority-spine', 'vote': '9', 'flag': False,
        'citation': True,
    }, ensure_ascii=False) + '\n', encoding='utf-8')

    doc = cold_queue.build(flags, spine)
    assert doc['n_excluded'] == 1
    assert doc['excluded'][0]['reason'] == 'not_greek_word'
    assert doc['excluded'][0]['page'] == 107


# --- what must never become a card ---------------------------------------

def _flags(tmp_path: Path, rows: list[dict]) -> Path:
    f = tmp_path / 'flags.jsonl'
    f.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows),
                 encoding='utf-8')
    return f


def test_a_fold_equal_region_is_never_put_to_john(tmp_path):
    """`soft` is the panel saying every reader read the SAME.

    Spine `ȣϗ̀` against genie `ουκαὶ` is genie spelling out both ligatures.
    Carded, it asked John to correct a ligature to a non-word — and 241 of the
    896 regions on 107-117 were this class.
    """
    spine = tmp_path / 'txt'
    _spine_column(spine, 110, 'R', ['περὶ χρόνȣ ϗ̀ κινήσεως'])
    _spine_column(spine, 110, 'L', ['γραμμή'])
    from bonitz_pipeline.normalize import canonical
    stream, _ = canonical((spine / 'page-110-R.txt').read_text())
    flags = _flags(tmp_path, [{
        'page': 110, 'col': 'R', 'spine_off': stream.index('ȣϗ̀'), 'ctx': '',
        'opus': 'ȣϗ̀', 'genie': 'ουκαὶ', 'llama': 'ȣϗ̀', 'calamari': 'ȣϗ̀',
        'cls': 'soft', 'vote': 'ȣϗ̀', 'flag': False, 'citation': False,
        'spans_word': True,
    }])
    doc = cold_queue.build(flags, spine)
    assert doc['entries'] == []
    assert doc['n_not_carded']['soft'] == 1


def test_a_region_crossing_a_word_boundary_is_never_carded(tmp_path):
    """Spliced back into the first word it makes `χρόνȣ → χρόνουκαὶ`.

    Not a competing reading of that word — two spine words run together, and
    not a word at all.
    """
    spine = tmp_path / 'txt'
    _spine_column(spine, 110, 'R', ['περὶ χρόνȣ ϗ̀ κινήσεως'])
    _spine_column(spine, 110, 'L', ['γραμμή'])
    from bonitz_pipeline.normalize import canonical
    stream, _ = canonical((spine / 'page-110-R.txt').read_text())
    flags = _flags(tmp_path, [{
        'page': 110, 'col': 'R', 'spine_off': stream.index('ȣϗ̀'), 'ctx': '',
        'opus': 'ȣϗ̀', 'genie': 'ουκX', 'llama': 'ȣϗ̀', 'calamari': 'ȣϗ̀',
        'cls': '2-2-split', 'vote': None, 'flag': True, 'citation': False,
        'spans_word': True,
    }])
    doc = cold_queue.build(flags, spine)
    assert doc['entries'] == []
    assert doc['n_not_carded']['spans_word'] == 1


def test_a_real_ink_dispute_still_gets_a_card(tmp_path):
    # The filter must not be a blanket: readers differing on actual letters is
    # exactly what this queue exists to ask.
    spine = tmp_path / 'txt'
    _spine_column(spine, 110, 'L', ['γραμμή'])
    _spine_column(spine, 110, 'R', ['τὰ μένȣσιν ἐν τῇ πόλει'])
    from bonitz_pipeline.normalize import canonical
    # ⚠ `spine_off` is the BATCH offset. Columns concatenate L then R, so the
    # R column starts after the L column's stream — an offset measured inside
    # one column alone lands in the wrong place, or out of bounds.
    left, _ = canonical((spine / 'page-110-L.txt').read_text())
    stream, _ = canonical((spine / 'page-110-R.txt').read_text())
    off = len(left) + stream.index('μένȣσιν') + 'μένȣσιν'.index('ȣ')
    flags = _flags(tmp_path, [{
        'page': 110, 'col': 'R', 'spine_off': off, 'ctx': '',
        'opus': 'ȣ', 'genie': 'ου', 'llama': 'ω', 'calamari': 'ȣ',
        'cls': '2-2-split', 'vote': None, 'flag': True, 'citation': False,
        'spans_word': False,
    }])
    doc = cold_queue.build(flags, spine)
    assert doc['n_words'] == 1
    assert set(doc['entries'][0]['form_set']) == {'μένȣσιν', 'μένουσιν',
                                                  'μένωσιν'}
