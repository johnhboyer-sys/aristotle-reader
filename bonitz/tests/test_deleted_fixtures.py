"""The fixtures a disk clear-out took on 2026-08-28, and how to get them back.

⚠ THIS TEST IS MEANT TO FAIL WHILE THEY ARE GONE. Fourteen other tests fail
without them, each with an error about a missing PNG that says nothing about
why. This one names the cause once, so the suite output explains itself.

⚠ IT IS NOT A SKIP. A skip would make the suite green over a hole and the
measured-state tests would stop measuring anything, quietly. Nothing precious
was lost — no corpus, no ruling, no reader testimony — but derived data that
several tests pin their measurements against is missing, and that has to stay
visible until it is rebuilt.

⚠ COLUMNS ARE NOT WHAT THESE TESTS ARE WAITING FOR. 2026-08-29: all of 15-113
was regenerated, gated, and cleared NOT ONE of the eight crop tests. They fail
on `assert None is not None` — the crop comes back empty — because cropping
needs LINE GEOMETRY as well as a column image, and for 15-102 that lived in
`alto-r5`. Regenerating columns removes an entry from this list and fixes
nothing, so do not spend an afternoon on it expecting green.

⚠ AND `work/kraken15-102/cols` IS NOT A SECOND COPY. It is 176 broken symlinks
into `work/kraken400/cols`, which the same clear-out took. `ls` lists them like
files and `du` says `total 0`; a check that only asks `exists()` on the
directory will call them present. They are worth nothing as a reference and
cannot serve as a gate.

The whole exposure on the applied range is 8 columns of 206 — pages 103-106,
both sides. 057-L, 073-R and 093-R never paired and were blind before any of
this. `alphacheck` reads the other 198.
"""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

# ⚠ `exists()` IS NOT EVIDENCE, AND THIS TEST LEARNED IT THE HARD WAY.
# 2026-08-31: it reported 2 of these 5 missing while all five were unusable.
# `work/kraken400/read/cols` had come back holding 328 columns of 118-281 —
# the wrong tranche entirely, nothing the crop tests read — and both calamari
# image directories existed with ZERO files in them. A directory answered for
# its contents, which is the same defect the sweeps keep finding in the corpus
# and the same one `an-allowlist-fails-silently` names. So every entry now
# carries a PROBE that asks for the thing itself.


def _cols_15_113(p: Path) -> bool:
    """Columns for 15-113, not whichever tranche was cut most recently."""
    return any((p / f'page-{n:03d}-L.png').exists() for n in (15, 78, 113))


def _has_images(p: Path) -> bool:
    return any(p.glob('*.png'))


GONE = {
    'work/kraken400/read/cols': (_cols_15_113,
        'column PNGs for the round-5 read. Deterministic from work/scan400 and '
        'regenerated in minutes — but in TWO steps, and 2026-08-29 proved it: '
        'split_columns.split_page reproduces 15-62 exactly (95/95 columns match '
        'the width the gt records) and gets 48 of the 78 cold columns wrong, '
        'narrower by 11-88 px. Those were cut with bonitz_pipeline.recrop_'
        'outdent (--pages 63-91), which keeps split_page edges but moves the '
        'LEFT one out so hanging headword letters stay in frame. The gate is '
        "the gt PageXML's own imageWidth: regenerate, compare, and refuse any "
        'column that disagrees, because a crop from a mis-cut column is '
        'horizontally offset against every coordinate anyone has recorded. '
        '~1.3 GB for 15-113, deleted again once it was clear nothing reads it. '
        'PRESENT ON 2026-08-31 HOLDING 118-281 AND NOTHING THE CROP TESTS '
        'READ — hence the probe.'),
    'work/kraken400/read/alto-r5': (Path.is_dir,
        'the round-5 kraken read. Needs a GPU run — the round-5 model is safe '
        'in the OneDrive models tar. But prefer NOT rebuilding it: '
        'work/kraken15-102/alto118-281 is a current round-6 read of 328 '
        'columns and test_filter_kraken_lines already moved onto it.'),
    'work/audit/crops': (Path.is_dir,
        'line crops for the audit UI. Derived from ALTO + columns once those '
        'exist.'),
    'work/calamari/read107-112/images': (_has_images,
        'line images dumped from the arrow. Recompile with ketos and dump. '
        'THE DIRECTORY EXISTED AND WAS EMPTY on 2026-08-31; margin_guard dies '
        'on the first missing 00000.png, not on the missing directory.'),
    'work/calamari/read113-117/images': (_has_images,
        'as above, for 113-117.'),
}


def test_the_fixtures_deleted_on_2026_08_28_are_back():
    """Fourteen tests are red until these exist. What each one needs is above.

    Backed up and NOT affected: work/scan400, every trained model, book.pdf and
    codex's reader text are in OneDrive under bonitz-archive/; the training
    arrows for round 5 and the cold read are still Kaggle datasets
    (kraken-bonito-v5, cold-kraken); everything adjudicated is in git.
    """
    missing = {p: how for p, (probe, how) in GONE.items()
               if not ((ROOT / p).exists() and probe(ROOT / p))}
    if missing:
        pytest.fail(
            'derived fixtures deleted 2026-08-28 in a disk clear-out:\n'
            + '\n'.join(f'  {p}\n      {how}' for p, how in missing.items()))
