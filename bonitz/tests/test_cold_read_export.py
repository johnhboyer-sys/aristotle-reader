"""The bundle that goes to the GPU.

The GATE that refuses a short one is tested in `test_kaggle_code`: it moved
into the code dataset on 2026-08-28 so that one copy serves every tranche and
a change to the checks does not need a 0.71 GB re-upload.

Reading a tranche on this Mac does not work: four kraken workers took the
machine down on 2026-08-27, each one holding a segmentation net and a
recognition net, after 22 minutes of splitting columns and zero pages read.
So the tranche goes to Kaggle, and the failure that matters there is a
truncated upload — it reads fewer pages and every file on disk looks innocent.
"""

from __future__ import annotations

import json
import subprocess
import sys

import pytest

from bonitz_pipeline import cold_read_export as ex


def _bundle(tmp_path, monkeypatch, first=118, last=120):
    scans = tmp_path / 'scan400'
    scans.mkdir()
    for n in range(first, last + 1):
        (scans / f'page-{n:03d}.jpg').write_bytes(f'scan {n}'.encode())
    model = tmp_path / 'e11-0.9967.safetensors'
    model.write_bytes(b'weights')
    monkeypatch.setattr(ex, 'SCANS', scans)
    out = tmp_path / 'bundle'
    m = ex.build(f'{first}-{last}', out, model)
    return out, m


def test_a_tranche_with_a_hole_is_refused_at_build(tmp_path, monkeypatch):
    scans = tmp_path / 'scan400'
    scans.mkdir()
    for n in (118, 120):
        (scans / f'page-{n:03d}.jpg').write_bytes(b'x')
    model = tmp_path / 'm.safetensors'
    model.write_bytes(b'w')
    monkeypatch.setattr(ex, 'SCANS', scans)
    with pytest.raises(SystemExit, match='119'):
        ex.build('118-120', tmp_path / 'b', model)


def test_the_notebook_is_generated_from_the_tracked_module(tmp_path, monkeypatch):
    """`work/` is gitignored but for a short allowlist, so a notebook left
    there survives only as long as the machine does."""
    out, _ = _bundle(tmp_path, monkeypatch)
    nb = json.loads((out / 'kaggle-cold-read-118-120.ipynb').read_text())
    assert nb['metadata']['accelerator'] == 'GPU'
    src = ''.join(''.join(c['source']) for c in nb['cells'])
    assert '{tranche}' not in src, 'template placeholder reached the notebook'
    assert '118-120' in src
    # the two things a wrong notebook gets wrong silently
    assert 'cuda:0' in src and 'torch.cuda.is_available()' in src
    assert 'MANIFEST.json' in src, 'the mount path must be found, never hardcoded'
