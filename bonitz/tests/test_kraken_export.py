"""The Colab export carries its own guard, and the guard travels intact.

Every guard this pipeline has lives in `kraken_corpus` on this machine;
`ketos train` in a Colab notebook goes through none of them.  A stale zip or
an upload edited in a browser tab is exactly where a held-out column slips
back into training.  So `kraken_export` must refuse to write anything the
verifier cannot vouch for, and the export must include a standalone re-check
that fails CLOSED in Colab.

Four things are pinned, and the last two are the point:

  * a tree that fails `stage_verify` exports nothing — not a partial
    directory, nothing;
  * a clean export's `check_before_training.py` exits 0 when run standalone;
  * the re-check FAILS when train.arrow holds a held-only line, when an
    arrow's bytes changed after export, and when the manifest is missing —
    a check tested only on the good case passes against a check whose body
    has been deleted.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import unicodedata
from pathlib import Path

import pytest

from bonitz_pipeline import kraken_corpus as kc
from bonitz_pipeline import kraken_export as ke

ROOT = Path(__file__).resolve().parent.parent
VENV_PY = ROOT / '.venv' / 'bin' / 'python'

# The real twelve: kc.holdout_columns() reads the ruling at
# ROOT/work/rulings/kraken-holdout.json regardless of --work, so the synthetic
# trees must hold out exactly what John ruled.
RULED = sorted([
    'page-017-L', 'page-022-R', 'page-027-L', 'page-032-R',
    'page-037-L', 'page-042-R', 'page-047-L', 'page-052-R',
    'page-055-L', 'page-055-R', 'page-061-L', 'page-061-R',
])
TRAIN_SIDE = ['page-015-L', 'page-015-R', 'page-016-L', 'page-016-R']


def _gt(work: Path, col: str, lines: list[str]):
    ns = kc.PAGE_NS
    body = '\n'.join(
        f'<TextLine id="l{i}"><TextEquiv><Unicode>{t}</Unicode></TextEquiv>'
        f'</TextLine>' for i, t in enumerate(lines, 1))
    (work / 'gt' / f'{col}.xml').write_text(
        f'<?xml version="1.0"?><PcGts xmlns="{ns}"><Page>{body}</Page></PcGts>',
        encoding='utf-8')


def _tree(work: Path, train: list[str], holdout: list[str]):
    (work / 'gt').mkdir(parents=True, exist_ok=True)
    for c in train + holdout:
        _gt(work, c, _texts(c))
    (work / 'train.txt').write_text('\n'.join(train) + '\n')
    (work / 'holdout.txt').write_text('\n'.join(holdout) + '\n')


def _pairing(work: Path, cols: list[str]):
    work.mkdir(parents=True, exist_ok=True)
    (work / 'pairing.json').write_text(json.dumps([
        {'column': c, 'match': True, 'kept': 61, 'excluded': [5, 10]}
        for c in cols]), encoding='utf-8')


def _whole_corpus(work: Path):
    """A pairing report whose matched columns are the whole split."""
    _pairing(work, sorted(RULED + TRAIN_SIDE))


def _texts(col: str) -> list[str]:
    return [f'{col} line {i}' for i in range(1, 4)]


def _arrow(path: Path, texts: list[str], images: list[bytes] | None = None):
    """A compiled arrow.

    ⚠ EVERY LINE GETS DISTINCT IMAGE BYTES, AND THAT IS NOT COSMETIC.  A
    real arrow holds that line's own PNG in each row, and the verifier now
    proves the split from those pixels.  `images` lets a test state an unusual
    image arrangement rather than inheriting one from its text.
    """
    import pyarrow as pa
    import pyarrow.ipc as ipc
    if images is None:
        images = [f'pixels of {t}'.encode() for t in texts]
    assert len(images) == len(texts)
    lines = pa.array([{'text': t, 'im': im, 'language': []}
                      for t, im in zip(texts, images)])
    table = pa.table({'lines': lines,
                      'train': pa.array([True] * len(texts)),
                      'validation': pa.array([False] * len(texts)),
                      'test': pa.array([False] * len(texts))})
    with ipc.new_file(pa.OSFile(str(path), 'wb'), table.schema) as w:
        w.write_table(table)


def _verifiable(work: Path):
    """A tree whose arrows honestly match its lists."""
    _tree(work, TRAIN_SIDE, RULED)
    # `verify` re-checks the partition, so the tree needs the pairing report a
    # real one always has.
    _whole_corpus(work)
    for name, cols in (('train', TRAIN_SIDE), ('holdout', RULED)):
        _arrow(work / f'{name}.arrow', [t for c in cols for t in _texts(c)])


@pytest.fixture
def work(tmp_path, monkeypatch):
    w = tmp_path / 'kraken400'
    # main() overwrites kc.WORK from --work; the setattr makes monkeypatch
    # restore the real value afterwards so no later test inherits tmp_path.
    monkeypatch.setattr(kc, 'WORK', w)
    return w


def _export(work: Path, out: Path) -> int:
    return ke.main(['--work', str(work), '--out', str(out)])


def _check(out: Path) -> subprocess.CompletedProcess:
    return subprocess.run([str(VENV_PY), str(out / 'check_before_training.py')],
                          capture_output=True, text=True)


# --- the gate: nothing leaves unless verify vouches for it -------------------

def test_a_tree_that_fails_verify_exports_nothing(work, tmp_path):
    """A stale train.arrow — the exact artifact a Colab zip would carry."""
    _verifiable(work)
    _arrow(work / 'train.arrow', ['page-015-L line 1'])  # truncated = stale
    out = tmp_path / 'export'
    with pytest.raises(kc.HoldoutError) as e:
        _export(work, out)
    assert 'stale' in str(e.value)
    assert not out.exists()


def test_a_contaminated_tree_exports_nothing(work, tmp_path):
    _verifiable(work)
    _arrow(work / 'train.arrow',
           [t for c in TRAIN_SIDE for t in _texts(c)] + ['page-055-L line 1'])
    out = tmp_path / 'export'
    with pytest.raises(kc.HoldoutError):
        _export(work, out)
    assert not out.exists()


# --- the clean path, proven end to end ---------------------------------------

def test_a_clean_tree_exports_and_the_travelling_check_passes(work, tmp_path):
    _verifiable(work)
    out = tmp_path / 'export'
    assert _export(work, out) == 0

    for f in ('train.arrow', 'holdout.arrow', 'kraken-holdout.json',
              'MANIFEST.json', 'check_before_training.py'):
        assert (out / f).exists(), f

    manifest = json.loads((out / 'MANIFEST.json').read_text(encoding='utf-8'))
    assert manifest['holdout_columns'] == kc.holdout_columns()
    assert manifest['arrows']['train.arrow']['lines'] == 3 * len(TRAIN_SIDE)
    assert manifest['arrows']['holdout.arrow']['lines'] == 3 * len(RULED)
    # Hashes, not texts: the manifest gets pasted around, the corpus must not.
    assert len(manifest['held_only_line_sha256']) == 3 * len(RULED)
    assert not any('line' in h for h in manifest['held_only_line_sha256'])
    raw = (out / 'MANIFEST.json').read_text(encoding='utf-8')
    assert 'page-017-L line 1' not in raw
    # The exported ruling IS the ruling.
    assert (out / 'kraken-holdout.json').read_bytes() == \
        kc.HOLDOUT_RULING.read_bytes()

    r = _check(out)
    assert r.returncode == 0, r.stdout + r.stderr
    assert 'OK TO TRAIN' in r.stdout


# --- the travelling check must fail closed ------------------------------------

def _rebuild_train_arrow(out: Path, texts: list[str]):
    """Rebuild train.arrow AND book it honestly in the manifest, so only the
    contamination check — not the byte hash, not the count — can object."""
    _arrow(out / 'train.arrow', texts)
    manifest = json.loads((out / 'MANIFEST.json').read_text(encoding='utf-8'))
    manifest['arrows']['train.arrow'] = {
        'lines': len(texts),
        'sha256': hashlib.sha256((out / 'train.arrow').read_bytes()).hexdigest(),
    }
    (out / 'MANIFEST.json').write_text(json.dumps(manifest), encoding='utf-8')


def test_the_check_catches_a_held_only_line_in_train_arrow(work, tmp_path):
    """The scenario the export exists for: the arrow is rebuilt upstream of
    Colab with a held-out line back in, and the paperwork all agrees with it.
    Only the line hashes can catch that."""
    _verifiable(work)
    out = tmp_path / 'export'
    _export(work, out)
    _rebuild_train_arrow(out, [t for c in TRAIN_SIDE for t in _texts(c)]
                         + ['page-055-L line 1'])
    r = _check(out)
    assert r.returncode != 0, r.stdout + r.stderr
    assert 'contaminated' in r.stdout
    assert 'DO NOT TRAIN' in r.stdout


def test_the_check_normalizes_before_hashing(work, tmp_path):
    """NFD in the rebuilt arrow, NFC at export: the same ruling either way.
    kraken trains with `-u NFC`, so a decomposed spelling of a held-out line
    is the same training data and must be the same refusal."""
    _verifiable(work)
    out = tmp_path / 'export'
    _export(work, out)
    smuggled = unicodedata.normalize('NFD', 'page-055-L liné 1')
    _gt(work, 'page-055-L',
        [unicodedata.normalize('NFC', smuggled), 'page-055-L line 2',
         'page-055-L line 3'])
    _arrow(work / 'holdout.arrow',
           [t for c in RULED if c != 'page-055-L' for t in _texts(c)]
           + [unicodedata.normalize('NFC', smuggled), 'page-055-L line 2',
              'page-055-L line 3'])
    _export(work, out)  # re-export so the holdout carries the accented line
    _rebuild_train_arrow(out, [t for c in TRAIN_SIDE for t in _texts(c)]
                         + [smuggled])
    r = _check(out)
    assert r.returncode != 0, r.stdout + r.stderr
    assert 'contaminated' in r.stdout


def test_the_check_catches_bytes_altered_after_export(work, tmp_path):
    _verifiable(work)
    out = tmp_path / 'export'
    _export(work, out)
    p = out / 'train.arrow'
    p.write_bytes(p.read_bytes() + b'x')
    r = _check(out)
    assert r.returncode != 0, r.stdout + r.stderr
    assert 'changed after export' in r.stdout
    assert 'DO NOT TRAIN' in r.stdout


def test_the_check_fails_when_the_manifest_is_missing(work, tmp_path):
    """Fail closed: a check that skips itself is worse than no check."""
    _verifiable(work)
    out = tmp_path / 'export'
    _export(work, out)
    (out / 'MANIFEST.json').unlink()
    r = _check(out)
    assert r.returncode != 0, r.stdout + r.stderr
    assert 'DO NOT TRAIN' in r.stdout


def test_the_check_fails_when_an_arrow_is_missing(work, tmp_path):
    _verifiable(work)
    out = tmp_path / 'export'
    _export(work, out)
    (out / 'holdout.arrow').unlink()
    r = _check(out)
    assert r.returncode != 0, r.stdout + r.stderr
    assert 'DO NOT TRAIN' in r.stdout


def test_an_export_with_nothing_unique_to_the_holdout_is_refused(work, tmp_path):
    """A re-check that would pass against anything proves nothing, so the
    export refuses to create it."""
    _tree(work, TRAIN_SIDE, RULED)
    _whole_corpus(work)
    # Every holdout line also occurs in training, at no greater multiplicity,
    # so `stage_verify` is satisfied and the multiset difference is empty.
    for c in TRAIN_SIDE:
        _gt(work, c, ['the same line'] * 9)
    for c in RULED:
        _gt(work, c, ['the same line'] * 3)
    train_lines = 9 * len(TRAIN_SIDE)
    holdout_lines = 3 * len(RULED)
    # Repeated strings still belong to different line images; distinct bytes
    # keep this a test of the empty text difference rather than an image leak.
    _arrow(work / 'train.arrow', ['the same line'] * train_lines,
           images=[f'training pixels {i}'.encode()
                   for i in range(train_lines)])
    _arrow(work / 'holdout.arrow', ['the same line'] * holdout_lines,
           images=[f'holdout pixels {i}'.encode()
                   for i in range(holdout_lines)])
    out = tmp_path / 'export'
    with pytest.raises(kc.HoldoutError) as e:
        _export(work, out)
    assert 'unique to the holdout' in str(e.value)
    assert not (out / 'train.arrow').exists()


def test_the_travelling_check_refuses_an_emptied_held_only_list(work, tmp_path):
    """⚠ THE COLAB-SIDE COPY OF THE GUARD, PINNED. Export already refuses an
    empty multiset difference, so the check script's own `if not held` could
    be deleted with every test green (Grok's mutation table) — and a manifest
    whose held-only list was stripped in transit would then bless any
    train.arrow. The check must fail closed on its own evidence."""
    _verifiable(work)
    out = tmp_path / 'export'
    assert _export(work, out) == 0
    manifest = json.loads((out / 'MANIFEST.json').read_text(encoding='utf-8'))
    manifest['held_only_line_sha256'] = []
    (out / 'MANIFEST.json').write_text(json.dumps(manifest), encoding='utf-8')
    r = _check(out)
    assert r.returncode != 0
    assert 'DO NOT TRAIN' in r.stdout + r.stderr


def test_the_export_carries_the_manifest_ketos_actually_wants(work, tmp_path):
    """⚠ `-e` TAKES A LIST OF PATHS, NOT AN ARROW. `ketos train -e
    holdout.arrow` refuses with "is not a text file", and every training
    script in this project has passed `-e holdout.files` — a one-line file
    naming the arrow. The export left it behind, so the first Colab run
    stopped at the command line with the arrows uploaded, the gate passed and
    the GPU idle."""
    _verifiable(work)
    out = tmp_path / 'export'
    _export(work, out)
    files = out / 'holdout.files'
    assert files.exists(), 'the export must carry the -e manifest'
    assert files.read_text(encoding='utf-8').split() == ['holdout.arrow']
    assert (out / 'holdout.arrow').exists()
