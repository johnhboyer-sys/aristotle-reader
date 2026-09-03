"""No scan, crop or review image may be committed.

`work/` is gitignored in both repos, which has kept 1.4 GB of page scans and
286 MB of review crops out of history — the check below finds only two small
sweep PNGs in the whole log. But `git add -f` bypasses a gitignore SILENTLY,
and that is exactly how three 1870 leaves reached a public repo on 2026-08-11
before being amended out.

So the rule is asserted rather than trusted: nothing image-shaped, and nothing
large, is tracked under bonitz/. Scans are re-fetchable — the archive.org URL
is in work/frontmatter/NOTES.md — and crops are regenerable from them, so
committing either buys nothing and costs the clone forever.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
# ⚠ THE REPO OF RECORD IS bonitz-text, AND A BARE `git` HERE IS NOT IT. This
# tree is also an aristotle-reader worktree, so `git ls-files` with cwd=ROOT
# answered about `aristotle-reader/.git/worktrees/bonitz-40` — the repo the
# Bonitz commits do NOT go to. This guard was written on 2026-08-11 to assert
# that no scan or crop is ever tracked, and until 2026-09-02 it had never once
# looked at the repo it was guarding. It passed for three weeks by inspecting
# the wrong index.
#
# John, 2026-09-02: "point the guard at bonitz-text". Named explicitly, because
# the failure mode is a guard that is GREEN while the thing it forbids is
# present — which is what it was.
BONITZ_GIT = Path.home() / 'Developer' / 'bonitz-text.git'
IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.webp',
                  '.pdf'}
# ⚠ EMPTY, AND IT STAYS EMPTY. This held two sweep crops "that predate this
# rule". Pointed at bonitz-text on 2026-09-02 the guard found 218 tracked
# images, 26 MB — the list had named two while two hundred more arrived
# unseen, because the check was reading the wrong repo.
#
# John, on being told the orphan-mark crops are cited by four of his own
# rulings: "and if i ruled on those crops, why keep them?" Nothing. The crop's
# job is to let him rule; the RULING is the artifact. Every one is recut
# deterministically by `crop_site.py` from the site the ruling names — those
# notes say "matched by text, score 1.00" — and scan400 is archived, so the
# source survives. Committing them buys nothing and costs every clone forever.
#
# All 218 are in bonitz-archive/bonitz-review-crops.tar and untracked as of
# 2026-09-02. An exception here means a crop no longer regenerable, which
# means the SCAN is at risk — fix that instead.
GRANDFATHERED: set[str] = set()
MAX_TRACKED_BYTES = 2 * 1024 * 1024


def _tracked() -> list[str]:
    # ⚠ NO SKIP. `private-tooling-assumes-its-environment`: in bonitz/ a
    # missing dependency raises. The old `pytest.skip('not a git checkout')`
    # would have gone green on any machine where the repo was not found —
    # green being exactly the answer this guard must never give by default.
    assert BONITZ_GIT.is_dir(), (
        f'{BONITZ_GIT} is missing — it is the repo these assertions are about, '
        f'and without it nothing here is checked')
    out = subprocess.run(
        ['git', f'--git-dir={BONITZ_GIT}', f'--work-tree={ROOT}', 'ls-files'],
        cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, f'git ls-files failed: {out.stderr.strip()}'
    return [p for p in out.stdout.splitlines() if p.strip()]


def test_no_images_are_tracked():
    bad = [p for p in _tracked()
           if Path(p).suffix.lower() in IMAGE_SUFFIXES
           and p not in GRANDFATHERED]
    assert not bad, (
        'image files are tracked under bonitz/ — scans and crops are '
        'regenerable and must not enter history:\n  ' + '\n  '.join(bad))


def test_nothing_large_is_tracked():
    """A guard on shape alone misses the next thing that is big but not a
    picture — a model checkpoint, a bundled corpus, an ALTO dump."""
    big = []
    for p in _tracked():
        f = ROOT / p
        if f.is_file() and f.stat().st_size > MAX_TRACKED_BYTES:
            big.append(f'{p} ({f.stat().st_size / 1048576:.1f} MB)')
    assert not big, (
        f'files over {MAX_TRACKED_BYTES // 1048576} MB are tracked under '
        'bonitz/:\n  ' + '\n  '.join(big))


def test_every_crop_directory_under_sweeps_is_ignored():
    """⚠ NOT TRACKED IS NOT THE SAME AS NOT ADDABLE.

    The two tests above look at what git already holds. This one looks at what
    a single `git add -A` would put there: `work/sweeps/crops/` was named in
    the ignore file as a literal path, and every sitting since has cut its own
    directory beside it — `crops-cold5`, `crops-alphacheck-15-62`,
    `crops-qc-63-102`, all untracked-but-addable from the moment they appeared.
    A named path is not a rule.
    """
    sweeps = ROOT / 'work' / 'sweeps'
    if not sweeps.is_dir():
        pytest.skip('no sweeps directory in this checkout')
    dirs = sorted(d for d in sweeps.iterdir()
                  if d.is_dir() and 'crops' in d.name)
    if not dirs:
        pytest.skip('no crop directory has been cut in this checkout')
    addable = []
    for d in dirs:
        pngs = sorted(d.glob('*.png'))
        if not pngs:
            continue
        probe = pngs[0].relative_to(ROOT)
        out = subprocess.run(['git', 'check-ignore', '-q', str(probe)],
                             cwd=ROOT, capture_output=True, text=True)
        if out.returncode == 1:
            addable.append(str(d.relative_to(ROOT)))
        elif out.returncode > 1:
            pytest.skip('git check-ignore unavailable')
    assert not addable, (
        'crop directories are not ignored and one `git add -A` would put the '
        '1870 scan in history:\n  ' + '\n  '.join(addable))
