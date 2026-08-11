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
IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.webp',
                  '.pdf'}
# The two sweep crops that predate this rule. Listed, not globbed, so a third
# cannot join them by accident.
GRANDFATHERED = {
    'work/sweeps/sigla-11-top.png',
    'work/sweeps/sigla-12-top.png',
}
MAX_TRACKED_BYTES = 2 * 1024 * 1024


def _tracked() -> list[str]:
    out = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True,
                         text=True)
    if out.returncode != 0:
        pytest.skip('not a git checkout')
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
