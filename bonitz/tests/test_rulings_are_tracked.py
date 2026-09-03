"""Every ruling John has given must be under version control.

⚠ GITIGNORE HIDES A NEW STORE COMPLETELY. `work/*` is ignored wholesale, so a
ruling file that nobody force-added does not appear in `git status` as
untracked — it does not appear at all. Every store in this repo is tracked
only because someone remembered `git add -f` at the time, and nothing checked.

John, 2026-09-02: "how many of our rulings aren't pushed to git?" The answer
was none, and the check that said so was worth nothing — it could not have
seen a store that was never added. `an-allowlist-fails-silently` is the house
name for this, from the day five of six readers went missing.

The asymmetry is the point. `test_no_scans_in_git` stops scans getting IN.
Nothing stopped rulings staying OUT — and the rulings are the one artifact
this project treats as irreplaceable: the queues are regenerable, the reads
are re-runnable, his answers are neither. He looked at the ink.

⚠ AND IT DOES NOT ASSERT THAT TRACKED STORES ARE COMMITTED. A store being
modified is NORMAL — it is what a live sitting looks like, and `git status`
already shows it. Failing on that would cry wolf through every sitting and be
ignored by the second one. The silent failure is the untracked file, so that
is what is caught.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# ⚠ THE REPO OF RECORD IS bonitz-text, NOT whatever `git` resolves to here.
# This tree is also an aristotle-reader worktree, so a bare `git ls-files`
# answers about the WRONG index — it would pass while bonitz-text, the repo
# the rulings are actually kept in, had never seen the file.
BONITZ_GIT = Path.home() / 'Developer' / 'bonitz-text.git'


def _answers(path: Path) -> int:
    """How many verdicts a store holds. A store with none is scratch."""
    try:
        doc = json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError):
        return 0
    if not isinstance(doc, dict):
        return 0
    return sum(1 for v in doc.values()
               if isinstance(v, dict) and v.get('verdict'))


def _tracked_in_bonitz_text() -> set[str]:
    # ⚠ NO SKIP. `private-tooling-assumes-its-environment`: in bonitz/ a
    # missing dependency must raise. A skip here would go green on the exact
    # machine where the rulings live.
    assert BONITZ_GIT.is_dir(), (
        f'{BONITZ_GIT} is missing — this is the repo the rulings are kept in, '
        f'and without it nothing here is checked')
    out = subprocess.run(
        ['git', f'--git-dir={BONITZ_GIT}', f'--work-tree={ROOT}',
         'ls-files', 'work/rulings/'],
        cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, f'git ls-files failed: {out.stderr.strip()}'
    return {p.strip() for p in out.stdout.splitlines() if p.strip()}


def test_every_store_holding_answers_is_tracked():
    tracked = _tracked_in_bonitz_text()
    loose = []
    for f in sorted((ROOT / 'work' / 'rulings').glob('*.json')):
        n = _answers(f)
        if n and f'work/rulings/{f.name}' not in tracked:
            loose.append(f'{f.name} ({n} rulings)')
    assert not loose, (
        'these ruling files hold answers and are NOT tracked in bonitz-text. '
        'gitignore hides them from `git status`, so nothing else will say so. '
        'Add each with `git add -f`:\n  ' + '\n  '.join(loose))


def test_the_check_can_actually_fail(tmp_path):
    """⚠ A GUARD THAT CANNOT FAIL IS NOT A GUARD. `_answers` is what decides
    whether a file is worth protecting; if it returned 0 for a real store the
    test above would pass over every untracked ruling in the directory."""
    real = tmp_path / 'store.json'
    real.write_text(json.dumps({
        'forms:α|β': {'verdict': 'accept', 'detail': 'β'},
        'forms:γ|δ': {'verdict': 'preserve', 'detail': 'γ'},
        'forms:ε|ζ': {'detail': 'no verdict here'},
    }), encoding='utf-8')
    assert _answers(real) == 2

    for junk in ('', '[]', 'not json'):
        p = tmp_path / f'j{len(junk)}.json'
        p.write_text(junk, encoding='utf-8')
        assert _answers(p) == 0


def test_the_rulings_directory_is_not_empty():
    """A glob that matches nothing passes every assertion above in silence."""
    stores = list((ROOT / 'work' / 'rulings').glob('*.json'))
    assert stores, 'work/rulings/ is empty — the guard above proved nothing'
    assert sum(_answers(f) for f in stores) > 0, 'no store holds any verdict'
