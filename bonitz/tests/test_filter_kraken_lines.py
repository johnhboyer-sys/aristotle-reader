import json
import re
from pathlib import Path

import pytest

from bonitz_pipeline import filter_kraken_lines
from bonitz_pipeline.filter_kraken_lines import filter_lines


ROOT = Path(__file__).resolve().parent.parent


def _line(by, width, content, *, hpos=100):
    return {
        'by': by,
        'hpos': hpos,
        'width': width,
        'content': content,
        'n': len(content.replace(' ', '')),
    }


def test_keeps_head_stub_and_drops_foot_signature():
    lines = [
        _line(10, 80, '364a29.'),
        _line(100, 700, 'first full body line'),
        _line(150, 700, 'second full body line'),
        _line(200, 700, 'third full body line'),
        _line(250, 700, 'fourth full body line'),
        _line(340, 40, 'V.'),
    ]

    kept, dropped = filter_lines(
        lines, col_width=1000,
        previous_line='ἅτερος παύσεται ἀποβιασθείς μβ6.',
    )

    assert [line['content'] for line in kept][0] == '364a29.'
    assert 'V.' not in [line['content'] for line in kept]
    assert [(line['content'], line['drop_reason']) for line in dropped] == [
        ('V.', 'end_stub'),
    ]


def test_keeps_non_bekker_short_continuation():
    lines = [
        _line(10, 80, 'ἄνω'),
        _line(100, 700, 'first full body line'),
        _line(150, 700, 'second full body line'),
        _line(200, 700, 'third full body line'),
        _line(250, 700, 'fourth full body line'),
    ]

    kept, dropped = filter_lines(
        lines, col_width=1000,
        previous_line='ἡ λέξις συνεχίζεται ἀπο-',
    )

    assert [line['content'] for line in kept][0] == 'ἄνω'
    assert kept[0]['warn_reason'] == 'head_short'
    assert dropped == []


def test_first_column_keeps_and_reports_a_short_head():
    lines = [
        _line(10, 80, 'ἄνω'),
        _line(100, 700, 'first full body line'),
        _line(150, 700, 'second full body line'),
        _line(200, 700, 'third full body line'),
        _line(250, 700, 'fourth full body line'),
    ]

    kept, dropped = filter_lines(lines, col_width=1000, previous_line=None)

    assert kept[0]['content'] == 'ἄνω'
    assert kept[0]['warn_reason'] == 'head_short'
    assert dropped == []


def test_bekker_shaped_phantom_does_not_claim_continuity_by_shape_alone():
    lines = [
        _line(10, 80, '364a29.'),
        _line(100, 700, 'first full body line'),
        _line(150, 700, 'second full body line'),
        _line(200, 700, 'third full body line'),
        _line(250, 700, 'fourth full body line'),
    ]

    kept, dropped = filter_lines(
        lines, col_width=1000,
        previous_line='a complete previous line.',
    )

    assert kept[0]['content'] == 'first full body line'
    assert [(line['content'], line['drop_reason']) for line in dropped] == [
        ('364a29.', 'head_short'),
    ]


def test_missing_column_clears_previous_line(tmp_path, monkeypatch):
    alto = tmp_path / 'alto'
    cols = tmp_path / 'cols'
    out = tmp_path / 'txt'
    alto.mkdir()
    cols.mkdir()
    for stem in ('page-063-L', 'page-064-L', 'page-064-R'):
        (alto / f'{stem}.xml').touch()
        (cols / f'{stem}.png').touch()

    seen = []

    def fake_process(alto_path, _png_path, txt_out, previous_line,
                     _target=None):
        seen.append((alto_path.stem, previous_line))
        txt_out.parent.mkdir(parents=True, exist_ok=True)
        txt_out.write_text(alto_path.stem + '\n', encoding='utf-8')
        return {
            'stem': alto_path.stem,
            'raw': 1,
            'kept': 1,
            'dropped': 0,
            'reasons': {},
        }

    monkeypatch.setattr(filter_kraken_lines, 'process_column', fake_process)

    rc = filter_kraken_lines.main([
        '--alto-dir', str(alto),
        '--txt-dir', str(out),
        '--cols-dir', str(cols),
        '--pages', '63-64',
        '--target', '1',
    ])

    assert rc == 0
    assert seen == [
        ('page-063-L', None),
        ('page-064-L', None),
        ('page-064-R', 'page-064-L'),
    ]


def test_the_whole_118_281_tranche_filters_to_61_or_says_why(tmp_path, capsys):
    """The filter against a real read, end to end.

    This used to run on `work/kraken400/read/alto-r5`, a round-5 read of pages
    63-110 that was deleted on 2026-08-28 in a disk clear-out. It is not worth
    a GPU run to rebuild: `alto118-281` is 328 columns read with round 6, it is
    current, and it exercises the same property harder — 317 columns land on 61
    and every one that does not has a record in `work/segmenter-gaps/` saying
    whether the segmenter lost lines or the page is short by design.

    ⚠ AND IT PINS THE RESTORED CITATION TAILS. Seven columns keep a line the
    `foot_short` rule would cut — `544b26.`, `b36).`, `990b97.` — because a cut
    that ends below target did not remove a phantom.
    """
    alto = ROOT / 'work/kraken15-102/alto118-281'
    if not alto.exists():
        pytest.fail(
            f'{alto} is missing. Rebuild it with a kraken read of 118-281: '
            f'python3 -m bonitz_pipeline.cold_read_export 118-281, then run '
            f'the notebook it writes on a Kaggle GPU.')
    out = tmp_path / 'txt'
    report = tmp_path / 'filter-check.json'
    rc = filter_kraken_lines.main([
        '--alto-dir', str(alto),
        '--txt-dir', str(out),
        '--pages', '118-281',
        '--target', '61',
        '--report', str(report),
    ])
    capsys.readouterr()
    data = json.loads(report.read_text(encoding='utf-8'))
    # ⚠ 1, NOT 0. Twelve columns are not at 61 and the filter says so by its
    # exit code. Nine of them are correct — a letter-section page carries a
    # display capital in a band with no body text — but the filter cannot know
    # that, and a run that exited 0 here would be claiming it could.
    assert rc == 1
    assert data['n_columns'] == 328
    # 316 before 2026-09-01. page-127-R joined them when the `running_head`
    # rule started dropping its guide word and page number — the one column
    # in 328 that was carrying two lines of furniture as index text, and it
    # sat two OVER target the whole time saying so.
    assert data['n_at_target'] == 317

    off = {c['stem']: c['kept'] for c in data['columns'] if c['kept'] != 61}
    assert off == {
        'page-134-L': 60, 'page-134-R': 60,      # a 60-line page
        'page-144-L': 57, 'page-144-R': 58,      # letter-section display capital
        'page-156-L': 57, 'page-156-R': 58,
        'page-176-L': 57, 'page-176-R': 58,
        'page-215-L': 60,   # one line the segmenter never found
        'page-223-L': 58, 'page-223-R': 56,
    }
    # every short column is accounted for, none of them silently
    gaps = ROOT / 'work' / 'segmenter-gaps'
    for stem, kept in off.items():
        if kept < 61:
            assert (gaps / f'{stem}.json').exists(), f'{stem} short and unexplained'

    # the seven citation tails the guard puts back
    restored = {c['stem']: [r['content'] for r in c.get('restored', [])]
                for c in data['columns'] if c.get('restored')}
    assert restored == {
        'page-155-R': ['149a7.'], 'page-162-L': ['544b26.'],
        'page-205-L': ['623b30.'], 'page-217-R': ['b44, 45.'],
        'page-235-R': ['b36).'], 'page-238-R': ['b12.'],
        'page-242-R': ['990b97.'],
    }


def _body(y, content, width=1200, hpos=40):
    return {'by': float(y), 'content': content, 'width': width, 'hpos': hpos,
            'n': len(content)}


def test_a_citation_tail_at_the_foot_is_put_back():
    """`foot_short` drops a short last line as a printer's gathering mark.

    Seven columns of 118-281 lost the tail of a citation that way — `544b26.`,
    `b36).`, `990b97.`, each the last characters of a Bekker number wrapped to
    the foot. The real marks in the same tranche are `P`, `Bb`, `Ii`, `Kk`, and
    `b12` is one while `b12.` is a citation, so no content test separates them.
    The line count does: the cut was the last one made to a column already at
    target.
    """
    lines = [_body(60 + 55 * i, f'body line {i}') for i in range(60)]
    lines.append(_body(60 + 55 * 60, 'b36).', width=90))
    kept, dropped = filter_lines(lines, 1300, None, 61)
    assert len(kept) == 61
    assert kept[-1]['content'] == 'b36).'
    assert kept[-1]['restored_from'] == 'foot_short'
    assert not dropped


def test_without_a_target_the_filter_behaves_as_it_always_did():
    lines = [_body(60 + 55 * i, f'body line {i}') for i in range(60)]
    lines.append(_body(60 + 55 * 60, 'b36).', width=90))
    kept, dropped = filter_lines(lines, 1300, None, None)
    assert len(kept) == 60 and len(dropped) == 1


def test_a_gutter_number_is_not_put_back_to_reach_the_target():
    """Letting every rule yield to the count reached 61 on more columns and
    made them worse: 144-R got back `5`, `κ` and an empty box — gutter numbers,
    correctly identified — so it read 61 with three junk lines in it, which
    downstream cannot be told from a clean column."""
    assert filter_kraken_lines.RESTORABLE == ('foot_short',)


def test_a_column_the_segmenter_cut_short_stays_short():
    """The four letter-section pages of 118-281 carry a display capital in a
    blank band and have no `foot_short` drop to put back. They must stay
    visibly short rather than be padded to target."""
    lines = [_body(60 + 55 * i, f'body line {i}') for i in range(57)]
    kept, dropped = filter_lines(lines, 1300, None, 61)
    assert len(kept) == 57 and not dropped
