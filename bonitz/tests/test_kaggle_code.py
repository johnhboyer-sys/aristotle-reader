"""Code and data are two datasets, because they move at different speeds.

On 2026-08-28 they were one 0.71 GB bundle and that cost a run: `--per-arrow`
was added to `calamari_read` on the Mac, the notebook was pushed to Kaggle, and
the read failed 25 minutes in with

    calamari_read.py: error: unrecognized arguments: --per-arrow 40

because the DATASET still carried the old module. Fixing it meant re-uploading
0.71 GB to change 40 lines.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from bonitz_pipeline import kaggle_code as kc
from bonitz_pipeline import cold_read_export as cre
from bonitz_pipeline import calamari_read_export as care


def test_the_code_dataset_is_small_and_carries_its_own_marker(tmp_path):
    """A notebook attaching two datasets cannot tell them apart by position."""
    m = kc.build(tmp_path, 'abc1234')
    assert (tmp_path / 'BONITZ_CODE.json').exists()
    assert not (tmp_path / 'MANIFEST.json').exists(), 'that is the DATA marker'
    assert m['built'] == 'abc1234'
    size = sum(p.stat().st_size for p in tmp_path.rglob('*') if p.is_file())
    assert size < 500_000, f'{size} bytes — the point is that this is cheap'
    for name in kc.MODULES:
        assert f'bonitz_pipeline/{name}' in m['files']


def test_the_gate_travels_with_the_code_not_the_data(tmp_path):
    kc.build(tmp_path, 'x')
    assert (tmp_path / 'check_before_read.py').exists()


def _gate(code: Path, data: Path):
    return subprocess.run([sys.executable, str(code / 'check_before_read.py'),
                           str(data)], capture_output=True, text=True)


def _kraken_bundle(tmp_path, monkeypatch):
    scans = tmp_path / 'scan400'; scans.mkdir()
    for n in (118, 119):
        (scans / f'page-{n:03d}.jpg').write_bytes(f'scan {n}'.encode())
    model = tmp_path / 'e11-0.9967.safetensors'; model.write_bytes(b'w')
    monkeypatch.setattr(cre, 'SCANS', scans)
    out = tmp_path / 'data'
    cre.build('118-119', out, model)
    return out


def test_one_gate_serves_the_kraken_bundle(tmp_path, monkeypatch):
    code = tmp_path / 'code'; kc.build(code, 'x')
    data = _kraken_bundle(tmp_path, monkeypatch)
    r = _gate(code, data)
    assert r.returncode == 0, r.stdout + r.stderr
    assert 'GATE PASSED' in r.stdout


def test_a_truncated_scan_still_fails_it(tmp_path, monkeypatch):
    code = tmp_path / 'code'; kc.build(code, 'x')
    data = _kraken_bundle(tmp_path, monkeypatch)
    (data / 'scans' / 'page-119.jpg').write_bytes(b'x')
    r = _gate(code, data)
    assert r.returncode == 1
    assert 'sha256 differs' in r.stderr


def test_the_data_bundles_no_longer_ship_pipeline_code(tmp_path, monkeypatch):
    """The whole point: a code fix must not need a 0.71 GB re-upload."""
    data = _kraken_bundle(tmp_path, monkeypatch)
    assert not (data / 'bonitz_pipeline').exists()
    assert not (data / 'check_before_read.py').exists()
    assert not (data / 'split_columns.py').exists()
    assert (data / 'dataset-metadata.json').exists(), 'needed to push a version'


def test_the_notebooks_find_each_dataset_by_its_own_marker():
    for mod, spec in ((cre, '118-281'), (care, '118-281')):
        src = ''.join(''.join(c['source']) for c in mod.notebook(spec)['cells'])
        assert 'BONITZ_CODE.json' in src and 'MANIFEST.json' in src
        assert '/kaggle/input' in src
        # the mount path is found, never written down
        assert '/kaggle/input/datasets/johnhboyer' not in src.replace(
            'not /kaggle/input/<slug>', '')
        assert 'check_before_read.py' in src


def test_a_scan_that_did_not_arrive_fails_it(tmp_path, monkeypatch):
    code = tmp_path / 'code'; kc.build(code, 'x')
    data = _kraken_bundle(tmp_path, monkeypatch)
    (data / 'scans' / 'page-119.jpg').unlink()
    r = _gate(code, data)
    assert r.returncode == 1
    assert 'page-119.jpg: MISSING' in r.stderr


def test_a_model_swapped_for_another_fails_it(tmp_path, monkeypatch):
    """e11 is round 6 at 0.33%; the other five checkpoints score 0.9961-0.9963
    and are a tie the aggregate cannot break, so reading with the wrong one is
    not visible in the output."""
    code = tmp_path / 'code'; kc.build(code, 'x')
    data = _kraken_bundle(tmp_path, monkeypatch)
    next((data / 'models').glob('*.safetensors')).write_bytes(b'other')
    r = _gate(code, data)
    assert r.returncode == 1
    assert 'sha256 differs' in r.stderr


@pytest.mark.parametrize('mod', [cre, care])
def test_a_notebook_cell_that_does_not_parse_never_ships(mod):
    """Run 5 on 2026-08-28 passed the gate, verified the code dataset, split
    all 328 columns and then died on `SyntaxError: '(' was never closed` — a
    comment written into the middle of an argument list. Thirty minutes to
    learn something `compile()` says for nothing."""
    nb = mod.notebook('118-281')
    assert sum(1 for c in nb['cells'] if c['cell_type'] == 'code') >= 5

    broken = [{'cell_type': 'code', 'source': ['r = subprocess.run([  # oops)']}]
    with pytest.raises(SystemExit, match='does not parse'):
        mod._compiles(broken)


@pytest.mark.parametrize('mod', [cre, care])
def test_a_shell_line_takes_its_continuations_with_it(mod):
    """Dropping `!pip ...` and keeping the indented line under it would refuse
    a notebook that is fine — the check caught itself doing this."""
    ok = [{'cell_type': 'code', 'source': [
        '!uv pip install -q \\\n    "calamari-ocr==2.3.1"\nprint("done")\n']}]
    assert mod._compiles(ok) == ok
