import json
import os

from bonitz_pipeline.normalize import canonical, clean_opus
from bonitz_pipeline.reconcile import reconcile


def _write_column(root, page, col, text):
    path = root / 'raw/opus' / f'page-{page:03d}-{col}.txt'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def _write_pair(root, page, col, flags, verdicts):
    flags_path = root / 'work/flags-by-col' / f'page-{page:03d}-{col}.json'
    verdicts_path = root / 'work/adjudicated' / f'page-{page:03d}-{col}.json'
    flags_path.parent.mkdir(parents=True, exist_ok=True)
    verdicts_path.parent.mkdir(parents=True, exist_ok=True)
    flags_path.write_text(json.dumps(flags, ensure_ascii=False), encoding='utf-8')
    verdicts_path.write_text(json.dumps(verdicts, ensure_ascii=False), encoding='utf-8')
    os.utime(flags_path, (1_000_000, 1_000_000))
    os.utime(verdicts_path, (1_001_000, 1_001_000))


def _flag(text, opus, *, spans_word=False, spans_line=False):
    cleaned = clean_opus(text)
    stream, _ = canonical(cleaned)
    local = stream.index(opus)
    return {
        'page': 63,
        'col': 'L',
        'spine_off': local,
        'ctx': stream,
        'opus': opus,
        'genie': '',
        'llama': '',
        'line': 1,
        'line_end': 1,
        'char': 0,
        'word': '',
        'spans_word': spans_word,
        'spans_line': spans_line,
    }


def test_boundary_span_is_queued_without_editing(tmp_path):
    left = "δι’ αὐτό, τέλος\n"
    right = "ἕτερον\n"
    _write_column(tmp_path, 63, 'L', left)
    _write_column(tmp_path, 63, 'R', right)
    flag = _flag(left, "'αὐ", spans_word=True)
    _write_pair(tmp_path, 63, 'L', [flag], [{
        'ctx': flag['ctx'],
        'verdict': 'ἄλλο',
        'agrees_with': 'human',
        'confidence': 'high',
        'note': '',
    }])

    edits, queue = reconcile(tmp_path, [63])

    assert edits == 0
    assert (tmp_path / 'work/reconciled/page-063-L.txt').read_text(
        encoding='utf-8'
    ) == left
    assert len(queue) == 1
    assert queue[0]['confidence'] == 'spans-boundary'


def test_word_level_verdict_replaces_the_whole_word(tmp_path):
    left = 'ἡ μεταβλητικὴ Πα9.\n'
    right = 'ἕτερον\n'
    _write_column(tmp_path, 63, 'L', left)
    _write_column(tmp_path, 63, 'R', right)
    flag = _flag(left, 'ὴ')
    flag['char'] = left.index('ὴ')
    flag['word'] = 'μεταβλητικὴ'
    _write_pair(tmp_path, 63, 'L', [flag], [{
        'ctx': flag['ctx'],
        'verdict': 'μεταβλητική',
        'agrees_with': 'human',
        'confidence': 'high',
        'note': '',
    }])

    edits, queue = reconcile(tmp_path, [63])

    assert edits == 1
    assert queue == []
    assert (tmp_path / 'work/reconciled/page-063-L.txt').read_text(
        encoding='utf-8'
    ) == 'ἡ μεταβλητική Πα9.\n'


def test_spanning_card_61_applies_its_verified_whole_word(tmp_path):
    left = 'ἀντισπᾶν εἰς αὑτό πκα.\n'
    right = 'ἕτερον\n'
    _write_column(tmp_path, 63, 'L', left)
    _write_column(tmp_path, 63, 'R', right)
    flag = _flag(left, 'όπκα', spans_word=True)
    flag['char'] = left.index('ό')
    flag['word'] = 'αὑτό'
    _write_pair(tmp_path, 63, 'L', [flag], [{
        'ctx': flag['ctx'],
        'verdict': 'αὑτὸ',
        'agrees_with': 'human',
        'confidence': 'high',
        'note': '',
    }])

    edits, queue = reconcile(tmp_path, [63])

    assert edits == 1
    assert queue == []
    assert (tmp_path / 'work/reconciled/page-063-L.txt').read_text(
        encoding='utf-8'
    ) == 'ἀντισπᾶν εἰς αὑτὸ πκα.\n'


def test_line_span_refuses_even_a_matching_whole_word_verdict(tmp_path):
    left = 'πρὸς αὑ-\nτὸ τέλος\n'
    right = 'ἕτερον\n'
    _write_column(tmp_path, 63, 'L', left)
    _write_column(tmp_path, 63, 'R', right)
    flag = _flag(left, 'αὑτὸ', spans_line=True)
    flag['word'] = 'αὑ-'
    _write_pair(tmp_path, 63, 'L', [flag], [{
        'ctx': flag['ctx'],
        'verdict': 'αὑτὸ',
        'agrees_with': 'human',
        'confidence': 'high',
        'note': '',
    }])

    edits, queue = reconcile(tmp_path, [63])

    assert edits == 0
    assert queue[0]['confidence'] == 'spans-boundary'
    assert (tmp_path / 'work/reconciled/page-063-L.txt').read_text(
        encoding='utf-8'
    ) == left
