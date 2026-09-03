"""The pipeline code Kaggle runs, as its own small dataset.

    python3 -m bonitz_pipeline.kaggle_code            # build
    python3 -m bonitz_pipeline.kaggle_code --upload   # build, push, delete

⚠ CODE AND DATA MOVE AT DIFFERENT SPEEDS, SO THEY ARE TWO DATASETS. They were
one 0.71 GB bundle, and on 2026-08-28 that cost a run: `--per-arrow` was added
to `calamari_read` on the Mac, the notebook was pushed to Kaggle, and the read
failed 25 minutes in with

    calamari_read.py: error: unrecognized arguments: --per-arrow 40

because the DATASET still carried the old module. Fixing it meant re-uploading
0.71 GB to change 40 lines. Split, a code fix is ~200 KB and a few seconds, and
the tranche data is uploaded once and left alone.

⚠ THE GATE LIVES HERE, NOT WITH THE DATA. It is code — it changes when the
checks change — and it takes the data directory as an argument so one copy
serves every tranche.

⚠ EACH DATASET SAYS WHICH IT IS. A notebook attaching two datasets cannot tell
them apart by position; the code carries `BONITZ_CODE.json` and a tranche
carries `MANIFEST.json`, and the notebook finds each by its own marker.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SLUG = 'bonitz-pipeline-code'

# Everything the Kaggle notebooks import or run. Keep it to what they need:
# this dataset is versioned constantly and every file in it is a file that can
# go stale on the far side.
MODULES = (
    '__init__.py',
    'calamari_read.py',
    'filter_kraken_lines.py',
    'split_columns.py',
    'normalize.py',
)

GATE = '''"""Refuse a read unless the whole tranche arrived, whole.

    python3 check_before_read.py <data-dir>

Exit 0, or do not read. A truncated upload reads fewer pages and leaves every
file on disk looking innocent.
"""
import hashlib, json, sys
from pathlib import Path

data = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
m = json.load(open(data / 'MANIFEST.json'))
bad = []


def sha256(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''):
            h.update(c)
    return h.hexdigest()


parts = [k for k in ('scans', 'alto', 'txt', 'models') if k in m]
for part in parts:
    for name, want in sorted(m[part].items()):
        p = data / part / name
        if not p.exists():
            bad.append(f'{part}/{name}: MISSING')
        elif sha256(p) != want:
            bad.append(f'{part}/{name}: sha256 differs')

# the single-model form the kraken bundle uses
if 'model' in m:
    p = data / 'models' / m['model']['name']
    if not p.exists():
        bad.append(f"{m['model']['name']}: MISSING")
    elif sha256(p) != m['model']['sha256']:
        bad.append(f"{m['model']['name']}: sha256 differs")

lo, hi = m['pages']['first'], m['pages']['last']
for n in range(lo, hi + 1):
    if 'scans' in m and f'page-{n:03d}.jpg' not in m['scans']:
        bad.append(f'scans: nothing for page {n}')
    for part, ext in (('alto', 'xml'), ('txt', 'txt')):
        if part not in m:
            continue
        for c in 'LR':
            if f'page-{n:03d}-{c}.{ext}' not in m[part]:
                bad.append(f'{part}: nothing for page-{n:03d}-{c}')

# ⚠ THE SPINE'S LINE COUNT IS PART OF THE PAYLOAD. `stage_alto` refuses unless
# the filtered ALTO reproduces the .txt line for line, so a spine filtered with
# different settings fails the whole read after the columns are split.
if 'spine_lines' in m:
    lines = sum(len((data / 'txt' / n).read_text(encoding='utf-8').splitlines())
                for n in m['txt'] if (data / 'txt' / n).exists())
    if lines != m['spine_lines']:
        bad.append(f'spine holds {lines} lines, manifest says {m["spine_lines"]}')

for line in bad:
    print('  ' + line, file=sys.stderr)
print(f"tranche {m.get('tranche')}: " + ', '.join(
    f'{len(m[p])} {p}' for p in parts))
print('GATE FAILED' if bad else 'GATE PASSED')
sys.exit(1 if bad else 0)
'''

# The cell every Kaggle notebook opens with. One place, so a fix to how the
# datasets are found does not have to be made twice.
FIND_CELL = '''# ⚠ TWO DATASETS, EACH FOUND BY ITS OWN MARKER. Kaggle mounts under
# /kaggle/input/datasets/<user>/<slug>, not /kaggle/input/<slug>, and a
# notebook that attaches two of them cannot tell one from the other by
# position. The code carries BONITZ_CODE.json; a tranche carries MANIFEST.json.
import shutil, sys
from pathlib import Path

def _find(marker):
    hits = sorted(q.parent for q in Path("/kaggle/input").rglob(marker))
    assert hits, f"no dataset under /kaggle/input carries {marker}"
    return hits[0]

code = _find("BONITZ_CODE.json")
data = _find("MANIFEST.json")
print("code:", code, "\\ndata:", data)

# the code is copied out because the input mount is read-only and __pycache__
work = Path("/kaggle/working/code")
if work.exists():
    shutil.rmtree(work)
shutil.copytree(code, work)
sys.path.insert(0, str(work))
# ⚠ PROVE THE CODE ARRIVED. `kaggle datasets create` without `-r zip` uploads
# the top-level files and silently leaves the package behind; run 4 on
# 2026-08-28 passed the data gate and then died on `No module named
# bonitz_pipeline`. The marker lists every file with its hash, so say so here.
import hashlib, json
marker = json.loads((work / "BONITZ_CODE.json").read_text())
missing = [f for f in marker["files"] if not (work / f).exists()]
assert not missing, f"the code dataset is incomplete: {missing}"
wrong = [f for f, want in marker["files"].items()
         if hashlib.sha256((work / f).read_bytes()).hexdigest() != want]
assert not wrong, f"code files differ from the marker: {wrong}"
print("code version:", marker["built"], f"({len(marker['files'])} files verified)")
'''


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def build(out: Path, built: str) -> dict:
    (out / 'bonitz_pipeline').mkdir(parents=True, exist_ok=True)
    files = {}
    for name in MODULES:
        src = ROOT / 'bonitz_pipeline' / name
        if not src.exists():
            raise SystemExit(f'{name} is not in bonitz_pipeline/ — refusing to '
                             f'ship a code dataset with a hole in it')
        dst = out / 'bonitz_pipeline' / name
        shutil.copy2(src, dst)
        files[f'bonitz_pipeline/{name}'] = sha256(dst)
    (out / 'check_before_read.py').write_text(GATE, encoding='utf-8')
    files['check_before_read.py'] = sha256(out / 'check_before_read.py')
    marker = {'built': built, 'files': files}
    (out / 'BONITZ_CODE.json').write_text(
        json.dumps(marker, indent=1, sort_keys=True), encoding='utf-8')
    (out / 'dataset-metadata.json').write_text(json.dumps({
        'title': SLUG, 'id': f'johnhboyer/{SLUG}',
        'licenses': [{'name': 'CC0-1.0'}]}, indent=1), encoding='utf-8')
    return marker


def upload(out: Path, message: str) -> None:
    """Create the dataset the first time, version it after."""
    kaggle = Path.home() / '.local' / 'bin' / 'kaggle'
    listed = subprocess.run([str(kaggle), 'datasets', 'list', '--mine'],
                            capture_output=True, text=True)
    first = SLUG not in listed.stdout
    # ⚠ `-r zip` OR THE PACKAGE DOES NOT GO. Without it the CLI uploads only
    # the top-level files and silently leaves `bonitz_pipeline/` behind — the
    # dataset then holds a marker and a gate and no code, which is exactly how
    # run 4 died on 2026-08-28 with `No module named 'bonitz_pipeline'` after
    # the gate had passed.
    cmd = ([str(kaggle), 'datasets', 'create', '-p', str(out), '-r', 'zip']
           if first else
           [str(kaggle), 'datasets', 'version', '-p', str(out), '-m', message,
            '-r', 'zip'])
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode:
        raise SystemExit(f'kaggle {"create" if first else "version"} failed')


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--out', type=Path,
                    default=ROOT / 'work' / 'kaggle-code')
    ap.add_argument('--built', default='',
                    help='a stamp for the marker; the git sha is a good one')
    ap.add_argument('--upload', action='store_true',
                    help='push to Kaggle and delete the local copy')
    ap.add_argument('-m', '--message', default='code update')
    a = ap.parse_args(argv)
    built = a.built or subprocess.run(
        ['git', 'rev-parse', '--short', 'HEAD'], capture_output=True,
        text=True, cwd=ROOT).stdout.strip() or 'unknown'
    marker = build(a.out, built)
    size = sum(p.stat().st_size for p in a.out.rglob('*') if p.is_file())
    print(f'{len(marker["files"])} files, {size / 1024:.0f} KB, built {built}')
    if a.upload:
        upload(a.out, a.message)
        shutil.rmtree(a.out)
        print(f'uploaded and removed {a.out}')
    else:
        print(f'-> {a.out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
