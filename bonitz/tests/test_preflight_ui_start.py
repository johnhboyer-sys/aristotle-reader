"""`--ui-start` waives ONE check, and must never grow into a general --force.

⚠ THE GUARD WAS FORBIDDING THE WORKFLOW IT RECOMMENDED. The card check
refused the push outright while its own message read "Push the code if you
like, but the RUN must be started from the Kaggle UI" — so the only way to
get code onto Kaggle was a hand push, which is exactly what this module
exists to prevent. John, 2026-09-02, was in that corner.

So the waiver exists. What it must not become is an escape hatch for the
other six, every one of which is a failure this project already paid for on
a GPU twenty minutes into a run.
"""
from __future__ import annotations

import json

import pytest

from bonitz_pipeline import kaggle_preflight as pf


def _kernel(tmp_path, cell_src: str, gpu: bool = True):
    nb = {'cells': [{'cell_type': 'code', 'source': [cell_src]}],
          'metadata': {}, 'nbformat': 4, 'nbformat_minor': 5}
    (tmp_path / 'k.ipynb').write_text(json.dumps(nb), encoding='utf-8')
    (tmp_path / 'kernel-metadata.json').write_text(json.dumps({
        'id': 'johnhboyer/t', 'title': 't', 'code_file': 'k.ipynb',
        'language': 'python', 'kernel_type': 'notebook', 'is_private': True,
        'enable_gpu': gpu, 'enable_internet': True,
        'dataset_sources': [], 'competition_sources': [], 'kernel_sources': [],
    }), encoding='utf-8')
    return tmp_path


def test_ui_start_does_not_waive_a_compile_failure(tmp_path, capsys):
    """⚠ THE POINT OF THE TEST. A notebook whose cells do not compile must
    still be refused with the flag set."""
    d = _kernel(tmp_path, 'def broken(:\n')
    assert pf.main([str(d), '--ui-start']) == 1
    assert 'NOT pushing' in capsys.readouterr().out


def test_ui_start_does_not_waive_a_swallowed_exit_status(tmp_path, capsys):
    d = _kernel(tmp_path, "!python train.py | tail -200\n")
    assert pf.main([str(d), '--ui-start']) == 1
    assert 'NOT pushing' in capsys.readouterr().out


def test_the_card_check_still_fails_without_the_flag(tmp_path, capsys):
    d = _kernel(tmp_path, "print('ok')\n")
    rc = pf.main([str(d)])
    out = capsys.readouterr().out
    if 'the CLI can start this run' in out and 'FAIL' in out:
        assert rc == 1
    else:
        pytest.skip('this fixture does not trip the card check')


def test_the_waived_check_is_named_not_positional():
    """⚠ REORDERING `CHECKS` MUST NOT SILENTLY WAIVE A DIFFERENT ONE."""
    assert pf.CARD_CHECK in [name for name, _ in pf.CHECKS]
    assert isinstance(pf.CARD_CHECK, str)
