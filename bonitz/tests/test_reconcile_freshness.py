"""Reconcile refuses verdicts that predate their flags.

The three columns killed by a crash on 2026-07-24 left pre-fix verdict files
sitting at the paths a resume would check, newer than nothing but older than
the flags they were supposed to answer. Presence looked like completion, so a
resume would have shipped verdicts drawn against a superseded flag rule.
"""

import json
import os

import pytest

from bonitz_pipeline.reconcile import reconcile


def _column(root, page, col, text):
    p = root / 'raw/opus'
    p.mkdir(parents=True, exist_ok=True)
    (p / f'page-{page:03d}-{col}.txt').write_text(text, encoding='utf-8')


def _pair(root, page, col, *, verdicts_older):
    flags = root / 'work/flags-by-col'
    adj = root / 'work/adjudicated'
    flags.mkdir(parents=True, exist_ok=True)
    adj.mkdir(parents=True, exist_ok=True)
    fp = flags / f'page-{page:03d}-{col}.json'
    ap = adj / f'page-{page:03d}-{col}.json'
    fp.write_text(json.dumps([]), encoding='utf-8')
    ap.write_text(json.dumps([]), encoding='utf-8')
    # mtimes are what the guard reads; set them explicitly rather than
    # relying on write order and filesystem timestamp resolution.
    os.utime(fp, (1_000_000, 1_000_000))
    os.utime(ap, (999_000, 999_000) if verdicts_older else (1_001_000, 1_001_000))


@pytest.fixture
def root(tmp_path):
    _column(tmp_path, 47, 'L', 'ἀλλοτριότητος Ηα13. 1102a18.\n')
    _column(tmp_path, 47, 'R', 'ἀξιȣ͂ν Οβ11. 291b13.\n')
    return tmp_path


def test_refuses_verdicts_older_than_flags(root):
    _pair(root, 47, 'L', verdicts_older=True)
    _pair(root, 47, 'R', verdicts_older=False)
    with pytest.raises(SystemExit) as e:
        reconcile(root, [47])
    assert 'page-047-L.json' in str(e.value)
    assert 'older than' in str(e.value)


def test_accepts_verdicts_newer_than_flags(root):
    _pair(root, 47, 'L', verdicts_older=False)
    _pair(root, 47, 'R', verdicts_older=False)
    reconcile(root, [47])  # must not raise
