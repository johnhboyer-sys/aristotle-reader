"""Reassembling a recogniser's predictions into per-column text.

The two failures worth a test are both silent. Filename order puts line 10
before line 9, which shifts a column's text against the spine from there on;
and a missing prediction, written as a blank line, reads downstream as the
reader disagreeing with everyone — a card raised for nothing, from a line the
reader never saw.
"""

from __future__ import annotations

import json

from bonitz_pipeline import paddle_read_assemble as pa


def _manifest(tmp_path, col='page-118-L', n=12):
    entries = [{'image': f'{col}_{i:03d}.png', 'col': col, 'line': i}
               for i in range(1, n + 1)]
    p = tmp_path / 'MANIFEST.json'
    p.write_text(json.dumps({'lines': n, 'columns': 1, 'entries': entries}),
                 encoding='utf-8')
    return p, entries


def _predicts(tmp_path, entries, text=lambda i: f'line {i}', skip=()):
    rows = [f'/kaggle/x/lines/{e["image"]}\t{text(e["line"])}\t0.99'
            for e in entries if e['line'] not in skip]
    # ⚠ SHUFFLED THE WAY A FILENAME SORT SHUFFLES: 10, 11, 12 before 2.
    rows.sort(key=lambda r: r.split('\t')[0])
    p = tmp_path / 'predicts.txt'
    p.write_text('\n'.join(rows) + '\n', encoding='utf-8')
    return p


def test_lines_come_back_in_printed_order(tmp_path, capsys):
    man, entries = _manifest(tmp_path)
    pred = _predicts(tmp_path, entries)
    out = tmp_path / 'read'
    assert pa.main(['--predicts', str(pred), '--manifest', str(man),
                    '--out', str(out)]) == 0
    got = (out / 'page-118-L.txt').read_text(encoding='utf-8').splitlines()
    assert got == [f'line {i}' for i in range(1, 13)]


def test_a_missing_prediction_refuses_the_column(tmp_path, capsys):
    man, entries = _manifest(tmp_path)
    pred = _predicts(tmp_path, entries, skip=(7,))
    out = tmp_path / 'read'
    rc = pa.main(['--predicts', str(pred), '--manifest', str(man),
                  '--out', str(out)])
    said = capsys.readouterr().out
    assert rc == 1
    assert not (out / 'page-118-L.txt').exists()
    assert 'NO prediction' in said and 'REFUSED' in said


def test_the_ligatures_are_counted_and_their_absence_named(tmp_path, capsys):
    man, entries = _manifest(tmp_path)
    pred = _predicts(tmp_path, entries, text=lambda i: 'τȣ ϗ' if i == 1
                     else f'line {i}')
    out = tmp_path / 'read'
    pa.main(['--predicts', str(pred), '--manifest', str(man), '--out', str(out)])
    said = capsys.readouterr().out
    assert 'ȣ=1' in said and 'ϗ=1' in said and 'ϛ=0' in said
    assert "THE READ CONTAINS NO ['ϛ']" in said


# --- the four shapes Grok found on 2026-08-31 -------------------------------
# Each one produced WRONG TEXT rather than an error, which is the only kind of
# parser bug that reaches a card.

def _parsed(tmp_path, body):
    p = tmp_path / 'predicts.txt'
    p.write_text(body, encoding='utf-8')
    return pa.parse_predicts(p)


def test_a_score_is_never_mistaken_for_a_reading(tmp_path):
    """`name<TAB>0.99` has no text; taking field [1] made the score vote."""
    got, said = _parsed(tmp_path, 'b.png\t0.99\n')
    assert got == {}
    assert 'no text field' in said[0]


def test_an_empty_prediction_is_a_hole_not_a_blank_line(tmp_path):
    got, said = _parsed(tmp_path, 'a.png\t\t0.99\n')
    assert got == {}
    assert 'empty prediction' in said[0]


def test_a_tab_inside_the_text_survives(tmp_path):
    """Splitting from the left dropped everything after the second tab."""
    got, _ = _parsed(tmp_path, 'c.png\tτοῦ\tμεν\t0.99\n')
    assert got == {'c.png': 'τοῦ\tμεν'}


def test_a_repeated_filename_does_not_overwrite_in_silence(tmp_path):
    got, said = _parsed(tmp_path, 'd.png\tκαλόν\t0.98\nd.png\tαλλο\t0.7\n')
    assert got == {'d.png': 'καλόν'}
    assert 'seen twice' in said[0]


def test_an_unusable_line_fails_the_run(tmp_path):
    """A complaint must not be printed and then ignored."""
    man, entries = _manifest(tmp_path, n=2)
    pred = tmp_path / 'predicts.txt'
    pred.write_text('page-118-L_001.png\tα\t0.9\n'
                    'page-118-L_002.png\t\t0.9\n', encoding='utf-8')
    assert pa.main(['--predicts', str(pred), '--manifest', str(man),
                    '--out', str(tmp_path / 'read')]) == 1
