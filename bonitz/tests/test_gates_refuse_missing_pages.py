"""No gate may print a clean bill for a page it never opened.

This is the oldest defect in the project and it has now been fixed three
times, each time one layer down:

  2026-08-10  five gates read `work/reconciled` only, so pages 53-62 —
              settled but not promoted — were invisible. alphacheck printed
              "0 order violations in 0 headword candidates" across twenty
              columns of a dictionary index.
  2026-08-11  seven more sweeps had the same blindness; `siglum_check`
              reported "0 citations" over a citation index.
  2026-08-11  the residue Grok found: the gates could now SEE
              reconciled-auto, but a page in NO stage still returned [] from
              a required=False lookup and printed a zero.

`scan()` keeps `required=False` deliberately — a single-column call should
not explode. The REQUEST is what gets validated, once, where the caller says
which pages they mean.
"""

from __future__ import annotations

import subprocess
import sys

import pytest

from bonitz_pipeline import dashboard

# Every gate that takes --pages and reports findings. Adding a gate to the
# dashboard without adding it here is the gap this list exists to close.
GATES = ['alphacheck', 'bekker', 'family', 'lexcheck', 'quotecheck']
ABSENT = '9999'


def _run(module: str, pages: str):
    return subprocess.run(
        [sys.executable, '-m', f'bonitz_pipeline.{module}', '--pages', pages],
        cwd=dashboard.ROOT, capture_output=True, text=True)


@pytest.mark.parametrize('module', GATES)
def test_a_page_in_no_corpus_stage_is_refused(module):
    """The failing input is the whole point: ask for a page that does not
    exist and the gate must not answer with a number."""
    r = _run(module, ABSENT)
    assert r.returncode != 0, (
        f'{module} exited 0 for a page that was never transcribed — '
        f'output: {r.stdout.strip()[-200:]!r}')
    assert 'no corpus column' in (r.stderr + r.stdout), r.stderr[-300:]


@pytest.mark.parametrize('module', GATES)
def test_the_guard_does_not_break_a_real_range(module):
    """A guard that refuses everything is as useless as one that refuses
    nothing. 53-62 is transcribed and every gate must still run over it."""
    r = _run(module, '53-62')
    assert r.returncode == 0, r.stderr[-300:]
    assert r.stdout.strip(), f'{module} printed nothing for a real range'


def test_every_sweep_the_dashboard_lists_is_covered_here_or_named():
    """⚠ THE LIST ABOVE MUST NOT ROT. The dashboard names fourteen sweeps; the
    five with a --pages CLI are guarded above. The rest are named here so that
    a gate gaining a --pages flag has to be added deliberately rather than
    slipping past."""
    listed = {name for name, _what, _ok in dashboard.SWEEPS}
    no_pages_cli = {
        'siglum_check',      # guarded in its own module, own test file
        'smyth_sweep',       # --source, defaults to every stage
        'accent_law',        # --source, defaults to every stage
        'accent', 'breathing', 'breathing_oracle', 'diacritic_sweep',
        'book_review', 'ngram_check',
    }
    assert listed == set(GATES) | no_pages_cli, (
        'the dashboard gained or lost a sweep — decide whether it needs the '
        f'missing-page guard: {listed ^ (set(GATES) | no_pages_cli)}')
