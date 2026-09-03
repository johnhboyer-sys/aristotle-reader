"""Bundle a tranche for calamari on the Kaggle GPU, after kraken has read it.

    python3 -m bonitz_pipeline.calamari_read_export 118-281

⚠ CALAMARI READS THE LINES KRAKEN SEGMENTED, so this bundle carries kraken's
ALTO and the filtered spine as well as the scans. `stage_alto` re-proves on
Kaggle that the filtered ALTO reproduces that spine exactly — a check worth
having on the machine that then compiles the crops.

⚠ TWO PYTHONS. calamari 2.3.1 pins TensorFlow 2.15.1, which ships no wheel
above 3.11, and `ketos compile` comes from kraken in the image's own python.
The notebook installs calamari into a `uv` 3.11 venv and leaves ketos where it
is; the same split the training notebooks use.

⚠ THE ARROW IS THE ONLY CROP THIS PROJECT READS FROM. `ketos compile` cuts
every line to its baseline polygon, which is how the training data was cut.
Hand-cut rectangles have twice been handed to calamari and twice come back as
a result — 37.8% CER once, noise the second time — because nothing asked
whether the images were the right shape. calamari's own mean sentence
confidence is the canary: 99.63% on arrow-derived lines, 68.85% on hand-cut.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from .cold_read_export import pages, sha256

ROOT = Path(__file__).resolve().parent.parent
SCANS = ROOT / 'work' / 'scan400'
MODELS = ROOT / 'work' / 'calamari' / 'ensemble5-15-102' / 'best_models'

# ⚠ THE GATE AND THE PIPELINE CODE ARE NOT IN HERE ANY MORE. See
# `kaggle_code`: they are the `bonitz-pipeline-code` dataset, because a
# flag added on the Mac should not need a 0.71 GB re-upload to reach
# Kaggle — which is exactly what failed a run on 2026-08-28.

NOTEBOOK_CELLS = r"""[
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "# Bonitz calamari \u2014 the COLD READ of pages {tranche}\n\nThe second Greek-strong reader on this tranche. kraken has already read it and\nits ALTO is in this bundle; calamari reads the lines kraken segmented, so the\ntwo are keyed by position and a panel can put them side by side.\n\n\u26a0 **THE ARROW IS THE ONLY CROP THIS PROJECT READS FROM.** `ketos compile` cuts\nevery line to its baseline polygon, which is how calamari's training data was\ncut. Cutting rectangles out of the column PNG is the obvious thing to do and\nhands calamari a different image distribution:\n\n    kraken r6 : \u0396\u03c04. 706a18, 22. \u03b8\u03b5\u03c1\u03bc\u03cc\u03c4\u03b5\u03c1\u03b1 \u03c4\u1f70 \u03b4\u03b5\u03be\u03b9\u1f70 \u03c4\u0223\u0342 \u03c3\u03ce\u03bc\u03b1\u03c4\u03bf\u03c2 \u03c4\u1ff6\u03bd\n    hand-cut  : \u03c3\u03ad\u03bd , \u03b5\u03be\u03bd \u03b7\u03b5\u03cc\u03cc\u03b3\u03bf\u03b9 \u03be\u03b9\u03ae\u03c1\u03bf\u03b5 \u03c4\u03b9\u03bd\n\nThat has happened twice \u2014 37.8% CER on 2026-08-22, noise on 2026-08-25 \u2014 and\nboth times the run was reported as a result, because nothing asked whether the\nimages were the right shape. The last cell refuses the read unless calamari's\nown mean sentence confidence clears 95%: 99.63% on arrow-derived lines against\n68.85% on hand-cut ones. The canary is free.\n\n\u26a0 **TWO PYTHONS.** calamari 2.3.1 pins TensorFlow 2.15.1, which ships no wheel\nabove 3.11, and `ketos compile` comes from kraken in the image's own python. So\ncalamari goes into a `uv` 3.11 venv and ketos stays where it is."
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 1. kraken 7.1, for `ketos compile`"
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "!pip install -q kraken==7.1 \"safetensors~=0.7.0\" \"transformers<5\"\n!ketos --version\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 2. calamari 2.3.1 in its own 3.11\n\n`tensorflow[and-cuda]` brings its own CUDA, so the T4 is still used. Keeping\ncalamari at 2.3.1 is the same discipline as kraken's spec string: it is the\nconstant that makes this read comparable to the last one."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "!pip install -q uv\n!uv venv --python 3.11 /kaggle/working/cal311\n!uv pip install -q --python /kaggle/working/cal311/bin/python \\\n    \"calamari-ocr==2.3.1\" \"ocrd-fork-tfaip==1.2.7\" \"tensorflow[and-cuda]==2.15.1\"\nprint(\"installed\")\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "A CPU session finishes looking exactly like a GPU one, only many hours\nlater. Ask TensorFlow directly, in the venv that will do the reading."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "import subprocess\nPY311 = \"/kaggle/working/cal311/bin/python\"\nr = subprocess.run([PY311, \"-c\", '''\nimport tensorflow as tf, calamari_ocr\ngpus = tf.config.list_physical_devices(\"GPU\")\nprint(\"tensorflow\", tf.__version__, \"| calamari\", calamari_ocr.__version__)\nprint(\"GPUs\", gpus)\nassert gpus, \"NO GPU VISIBLE TO TENSORFLOW\"\n'''], capture_output=True, text=True)\nprint(r.stdout, r.stderr)\nassert r.returncode == 0, \"INSTALL IS BROKEN \u2014 do not read\"\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 2. Find the two datasets\n\n\u26a0 **CODE AND DATA ARE SEPARATE DATASETS.** They move at different speeds: a\nflag added to the pipeline on the Mac used to need a 0.71 GB re-upload to reach\nKaggle, and on 2026-08-28 a read failed 25 minutes in because the notebook was\nnew and the module in the bundle was not. The code is ~60 KB and versioned\nconstantly; a tranche is uploaded once. Each carries its own marker so the\nnotebook can tell them apart."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "# \u26a0 TWO DATASETS, EACH FOUND BY ITS OWN MARKER. Kaggle mounts under\n# /kaggle/input/datasets/<user>/<slug>, not /kaggle/input/<slug>, and a\n# notebook that attaches two of them cannot tell one from the other by\n# position. The code carries BONITZ_CODE.json; a tranche carries MANIFEST.json.\nimport shutil, sys\nfrom pathlib import Path\n\ndef _find(marker):\n    hits = sorted(q.parent for q in Path(\"/kaggle/input\").rglob(marker))\n    assert hits, f\"no dataset under /kaggle/input carries {marker}\"\n    return hits[0]\n\ncode = _find(\"BONITZ_CODE.json\")\ndata = _find(\"MANIFEST.json\")\nprint(\"code:\", code, \"\\ndata:\", data)\n\n# the code is copied out because the input mount is read-only and __pycache__\nwork = Path(\"/kaggle/working/code\")\nif work.exists():\n    shutil.rmtree(work)\nshutil.copytree(code, work)\nsys.path.insert(0, str(work))\nimport json\nprint(\"code version:\", json.loads((work / \"BONITZ_CODE.json\").read_text())[\"built\"])\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 4. The gate\n\n\u26a0 **Exit 0, or do not read.** A truncated upload reads fewer lines and leaves\nevery file on disk looking innocent."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "r = subprocess.run([sys.executable, str(work / \"check_before_read.py\"),\n                    str(data)], capture_output=True, text=True)\nprint(r.stdout, r.stderr)\nassert r.returncode == 0, \"GATE FAILED \u2014 do not read\"\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 5. Split the columns\n\nThe same `split_columns.py` the Mac runs, on the same JPEGs, so the pixels are\nthe ones kraken segmented and the ALTO's boxes land where they should."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "from PIL import Image\nfrom bonitz_pipeline.split_columns import split_page\n\ncols = Path(\"/kaggle/working/cols\")\ncols.mkdir(exist_ok=True)\nscans = sorted((data / \"scans\").glob(\"page-*.jpg\"))\nfor i, s in enumerate(scans, 1):\n    if (cols / f\"{s.stem}-L.png\").exists():\n        continue\n    for t in split_page(s, cols):\n        with Image.open(t) as im:\n            im.save(t.with_suffix(\".png\"))\n        t.unlink()\n    if i % 25 == 0:\n        print(f\"  {i}/{len(scans)}\", flush=True)\nn = len(list(cols.glob(\"*.png\")))\nprint(f\"{n} columns from {len(scans)} pages\")\nassert n == 2 * len(scans), f\"expected {2 * len(scans)} columns, got {n}\"\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 6. Read\n\n`calamari_read` does the rest: filter the ALTO and prove it reproduces the\nspine line for line, `ketos compile` the crops, dump the line images out of the\narrow in row order and prove each against the text it should carry, then\npredict.\n\n\u26a0 **TWO LIMITS, NEITHER A TUNING KNOB.** `ketos compile` holds every line it\ncuts \u2014 482 lines peak at 438 MB, so all 19,978 at once wants 10-18 GB and gets\nthe process killed with no traceback. `--per-arrow 40` bounds it. And\n`--data.images` puts every path on the command line, which is 0.74 MB of argv\nfor this tranche, so prediction runs 2000 at a time."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "# \u26a0 RUN FROM THE CODE DIR, NOT THE DATA DIR. `-m` puts cwd first on\n# sys.path, and a tranche uploaded before the code/data split still carries a\n# stale bonitz_pipeline/ that would win over the code dataset.\n# \u26a0 NOT `!cmd | tail`. A `!` magic never raises on a non-zero exit and the\n# pipe throws the status away, so on 2026-08-28 the read was killed here and\n# the notebook sailed on to the next cell, which failed on a missing\n# read.json \u2014 reporting the wrong cell, 40 minutes in.\nimport subprocess, sys\nr = subprocess.run([\n    sys.executable, \"-m\", \"bonitz_pipeline.calamari_read\",\n    \"--alto-dir\", str(data / \"alto\"),\n    \"--cols-dir\", \"/kaggle/working/cols\",\n    \"--txt-dir\",  str(data / \"txt\"),\n    \"--pages\", \"{tranche}\",\n    \"--models\", str(data / \"models\"),\n    \"--target\", \"61\",\n    \"--per-arrow\", \"40\",\n    \"--out\", \"/kaggle/working/read\",\n    \"--predict-bin\", \"/kaggle/working/cal311/bin/calamari-predict\",\n    \"--root\", \"/kaggle/working\",\n], cwd=str(work), capture_output=True, text=True)\ntail = (r.stdout + r.stderr).splitlines()\nprint(\"\\n\".join(tail[-40:]))\nassert r.returncode == 0, (\n    f\"calamari_read exited {r.returncode}. 2 is argparse: the DATASET carries \"\n    f\"its own bonitz_pipeline/, so a flag added on the Mac needs a new dataset \"\n    f\"version, not just a new notebook. A NEGATIVE code is a signal \u2014 killed, \"\n    f\"most likely out of memory; lower --per-arrow.\")\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 7. What came back\n\nThe confidence figure is the one number that separates a real read from a crop\nbug. `calamari_read` already refuses below 95%; this prints it so it is in the\nnotebook output too, next to the line counts."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "import json\nread = json.loads((Path(\"/kaggle/working/read\") / \"read.json\").read_text())\nprint(f\"lines {read['lines']}  mean confidence {read['mean_confidence']:.2%}\")\nprint(\"models:\", read[\"models\"])\nshort = {k: len(v) for k, v in read[\"columns\"].items() if len(v) != 61}\nprint(f\"{len(read['columns'])} columns, {len(short)} not at 61: {short}\")\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 8. Bring it home\n\nThe per-column text and `read.json`. The line images are ~20,000 PNGs and\nregenerate from the arrow."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "shutil.make_archive(\"/kaggle/working/calamari-read-{tranche}\", \"zip\",\n                    \"/kaggle/working/read\", \"txt\")\nshutil.copy2(\"/kaggle/working/read/read.json\",\n             \"/kaggle/working/calamari-read-{tranche}.json\")\n!ls -lh /kaggle/working/calamari-read-{tranche}.zip /kaggle/working/calamari-read-{tranche}.json\n"
  ]
 }
]"""


def build(spec: str, out: Path, alto_dir: Path, txt_dir: Path,
          models: Path) -> dict:
    ns = pages(spec)
    for d in ('scans', 'alto', 'txt', 'models'):
        (out / d).mkdir(parents=True, exist_ok=True)
    man: dict = {'tranche': spec,
                 'pages': {'first': ns[0], 'last': ns[-1], 'count': len(ns)}}

    def copy_all(srcs, dest):
        got = {}
        for s in srcs:
            d = out / dest / s.name
            if not d.exists() or d.stat().st_size != s.stat().st_size:
                shutil.copy2(s, d)
            got[s.name] = sha256(d)
        return got

    missing = [n for n in ns if not (SCANS / f'page-{n:03d}.jpg').exists()]
    if missing:
        raise SystemExit(f'no scan for page(s) {missing}')
    man['scans'] = copy_all([SCANS / f'page-{n:03d}.jpg' for n in ns], 'scans')

    stems = [f'page-{n:03d}-{c}' for n in ns for c in 'LR']
    for part, src_dir, ext in (('alto', alto_dir, 'xml'),
                               ('txt', txt_dir, 'txt')):
        gone = [s for s in stems if not (src_dir / f'{s}.{ext}').exists()]
        if gone:
            raise SystemExit(f'{part}: nothing for {gone[:4]} — refusing to '
                             f'bundle a tranche with a hole in it')
        man[part] = copy_all([src_dir / f'{s}.{ext}' for s in stems], part)

    # ⚠ A `.ckpt` IS A DIRECTORY. calamari writes TensorFlow SavedModels, so
    # each checkpoint is a tree and only the `.ckpt.json` beside it is a file.
    # Copying with `shutil.copy2` fails on the first one, which is the good
    # case; hashing only the .json would have shipped a broken model quietly.
    got = {}
    for src in sorted(models.iterdir()):
        dest = out / 'models' / src.name
        if src.is_dir():
            if not dest.exists():
                shutil.copytree(src, dest)
            for f in sorted(dest.rglob('*')):
                if f.is_file():
                    got[str(f.relative_to(out / 'models'))] = sha256(f)
        else:
            if not dest.exists() or dest.stat().st_size != src.stat().st_size:
                shutil.copy2(src, dest)
            got[src.name] = sha256(dest)
    if not any(k.endswith('.json') for k in got):
        raise SystemExit(f'no calamari checkpoint under {models}')
    man['models'] = got

    man['spine_lines'] = sum(
        len((txt_dir / f'{s}.txt').read_text(encoding='utf-8').splitlines())
        for s in stems)
    (out / 'MANIFEST.json').write_text(
        json.dumps(man, indent=1, sort_keys=True), encoding='utf-8')
    (out / f'kaggle-calamari-read-{spec}.ipynb').write_text(
        json.dumps(notebook(spec), indent=1), encoding='utf-8')
    slug = f'calamari-read-{spec}'
    (out / 'dataset-metadata.json').write_text(json.dumps({
        'title': slug, 'id': f'johnhboyer/{slug}',
        'licenses': [{'name': 'CC0-1.0'}]}, indent=1), encoding='utf-8')
    return man


def _compiles(cells: list[dict]) -> list[dict]:
    """⚠ A CELL THAT DOES NOT PARSE MUST NOT REACH A GPU.

    Run 5 on 2026-08-28 passed the gate, verified the code dataset, split all
    328 columns and then died on `SyntaxError: '(' was never closed` — a
    comment written into the middle of an argument list, which commented out
    the rest of the line. Thirty minutes to learn something `compile()` says
    for nothing.
    """
    for i, c in enumerate(cells):
        if c.get('cell_type') != 'code':
            continue
        src = ''.join(c['source'])
        # ⚠ A SHELL LINE TAKES ITS CONTINUATIONS WITH IT. Dropping `!pip ...`
        # and keeping the `    "calamari-ocr==2.3.1"` under it leaves an
        # unexpected indent, and this check would refuse a notebook that is
        # fine.
        keep, skipping = [], False
        for line in src.splitlines():
            if not skipping and line.lstrip().startswith(('!', '%')):
                skipping = line.rstrip().endswith('\\')
                continue
            if skipping:
                skipping = line.rstrip().endswith('\\')
                continue
            keep.append(line)
        body = '\n'.join(keep)
        try:
            compile(body, f'<cell {i}>', 'exec')
        except SyntaxError as e:
            raise SystemExit(f'notebook cell {i} does not parse: {e}\n'
                             f'{src[:400]}')
    return cells


def notebook(tranche: str) -> dict:
    cells = _compiles(json.loads(NOTEBOOK_CELLS.replace('{tranche}', tranche)))
    return {'cells': cells,
            'metadata': {'kernelspec': {'display_name': 'Python 3',
                                        'language': 'python',
                                        'name': 'python3'},
                         'language_info': {'name': 'python'},
                         'accelerator': 'GPU'},
            'nbformat': 4, 'nbformat_minor': 5}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('pages')
    ap.add_argument('--out', type=Path)
    ap.add_argument('--alto-dir', type=Path)
    ap.add_argument('--txt-dir', type=Path)
    ap.add_argument('--models', type=Path, default=MODELS)
    a = ap.parse_args(argv)
    out = a.out or ROOT / 'work' / f'calamari-read-{a.pages}'
    k = ROOT / 'work' / 'kraken15-102'
    m = build(a.pages, out, a.alto_dir or k / f'alto{a.pages}',
              a.txt_dir or k / f'txt{a.pages}', a.models)
    size = sum(p.stat().st_size for p in out.rglob('*') if p.is_file())
    print(f"{m['pages']['count']} pages, {len(m['alto'])} columns, "
          f"{m['spine_lines']} spine lines, {len(m['models'])} model files")
    print(f'{size / 1e9:.2f} GB -> {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
