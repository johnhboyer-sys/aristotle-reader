"""Bundle a cold tranche for the Kaggle GPU, because reading it here does not work.

    python3 -m bonitz_pipeline.cold_read_export 118-281

⚠ FOUR KRAKEN WORKERS TOOK THE MAC DOWN. Each one loads a segmentation net and
a recognition net, and four of those at once crashed the machine on 2026-08-27
after 22 minutes of column splitting and zero pages read. The reads run on
Kaggle's GPU; this module packs what the notebook needs.

⚠ SHIP THE SCANS, NOT THE COLUMNS. The 328 split columns are 2.0 GB of PNG;
the 164 source JPEGs they come from are 0.28 GB, and `split_columns` is
deterministic, so splitting on Kaggle gives the same pixels. Uploading the
columns would move seven times the bytes to arrive at the same place.

⚠ THE GATE IS THE POINT OF THE MANIFEST. A truncated upload reads fewer pages
and every file on disk looks innocent; `check_before_read.py` re-proves from
the manifest alone that every scan arrived and arrived whole, and that the page
range has no hole in it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCANS = ROOT / 'work' / 'scan400'
MODEL = ROOT / 'work' / 'kraken15-102' / 'models' / 'e11-0.9967.safetensors'


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def pages(spec: str) -> list[int]:
    lo, _, hi = spec.partition('-')
    return list(range(int(lo), int(hi or lo) + 1))


# ⚠ THE GATE AND THE PIPELINE CODE ARE NOT IN HERE ANY MORE. They live in
# the `bonitz-pipeline-code` dataset — see `kaggle_code`. Code and data move
# at different speeds, and keeping them in one bundle cost a run on
# 2026-08-28: a flag added on the Mac needed a 0.71 GB re-upload to reach
# Kaggle, and until it did the notebook ran the old module.

# ⚠ THE NOTEBOOK IS GENERATED, NOT KEPT. `work/` is gitignored except for a
# short allowlist, so every Kaggle notebook this project has written lives
# untracked and dies with the machine. Holding it here as a template means the
# tracked code is the thing that survives, and the notebook regenerates.
NOTEBOOK_CELLS = r"""[
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "# Bonitz kraken \u2014 the COLD READ of pages 118\u2013281\n\n\u26a0 **THIS TRANCHE HAS NOT BEEN READ BY ANY GREEK-STRONG ENGINE.** On 118\u2013281\nthe only readers are genie and LlamaParse, and both are the Latin pair \u2014 the\ntwo we discard on Greek. Every Greek word in this tranche currently rests on\none unchecked opinion. kraken is the spine that fixes that.\n\n\u26a0 **DO NOT LET OPUS NEAR THIS TRANCHE.** John's protocol reads a cold tranche\nwith the non-Opus engines FIRST, adjudicates that into ground truth v1, and\nonly then lets Opus read it blind. `raw/opus` stops at 106 and stays there.\n\n\u26a0 **THIS RUNS HERE BECAUSE IT DOES NOT RUN ON THE MAC.** Four kraken workers\ntook the machine down on 2026-08-27 \u2014 each loads a segmentation net and a\nrecognition net \u2014 after 22 minutes of splitting columns and zero pages read.\n\n**The model is `e11-0.9967`** \u2014 round 6, 0.33% character error. The other five\ncheckpoints score 0.9961\u20130.9963 and are a tie the aggregate cannot break, so\npicking one by filename would pick the wrong one.\n\n**What comes back is ALTO, not text.** The line polygons are what calamari\ncuts its line images from and what `margin_guard` measures line width against;\nthe 107\u2013117 run kept only the text and the line images had to be rebuilt. The\nplain per-column text is written on the Mac afterwards by\n`filter_kraken_lines`, because kraken's stock segmenter over-splits a Bonitz\ncolumn \u2014 raw ALTO runs 63\u201374 lines where the page has 61, and every phantom\nline shifts the stream against the other readers.\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 1. kraken 7.1"
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "!pip install -q kraken==7.1 \"safetensors~=0.7.0\" \"transformers<5\"\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "`kraken --version` answers before torch is really exercised. Ask for the\ndevice instead \u2014 a CPU session here would run for hours and finish looking\nexactly like a GPU one."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "import torch\nprint(\"torch\", torch.__version__, \"| cuda\", torch.cuda.is_available(),\n      \"|\", torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"NO GPU\")\nassert torch.cuda.is_available(), \"no GPU \u2014 switch the accelerator on before reading\"\n!kraken --version\n"
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
   "## 3. The gate\n\n\u26a0 **Exit 0, or do not read.** A truncated upload reads fewer pages and leaves\nevery file on disk looking innocent. This re-proves from the manifest alone\nthat every scan arrived, arrived whole, and that the page range has no hole in\nit."
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
   "## 4. Split the columns\n\nThe same `split_columns.py` the Mac runs, on the same JPEGs, so the pixels are\nthe ones the model was trained against. Shipping the split columns instead\nwould have moved 2.0 GB to arrive at the same place; these scans are 0.29 GB."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "import sys\nsys.path.insert(0, str(work))\nfrom PIL import Image\nfrom split_columns import split_page\n\ncols = Path(\"/kaggle/working/cols\")\ncols.mkdir(exist_ok=True)\nscans = sorted((data / \"scans\").glob(\"page-*.jpg\"))\nfor i, s in enumerate(scans, 1):\n    if (cols / f\"{s.stem}-L.png\").exists():\n        continue\n    for t in split_page(s, cols):          # writes TIFF\n        with Image.open(t) as im:\n            im.save(t.with_suffix(\".png\"))  # PNG is what kraken and the filter read\n        t.unlink()\n    if i % 25 == 0:\n        print(f\"  {i}/{len(scans)}\", flush=True)\nn = len(list(cols.glob(\"*.png\")))\nprint(f\"{n} columns from {len(scans)} pages\")\nassert n == 2 * len(scans), f\"expected {2 * len(scans)} columns, got {n}\"\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 5. Read\n\n\u26a0 **ONE BATCH, NOT ONE PROCESS PER COLUMN.** `-I` loads the segmentation and\nrecognition nets once instead of 328 times. `-a` carries the line polygons out\nwith the text."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "model = next((data / \"models\").glob(\"*.safetensors\"))\nprint(\"model:\", model.name)\n!cd /kaggle/working && kraken -a -d cuda:0 -I 'cols/*.png' -o '.xml' \\\n    segment -bl ocr -m {model} 2>&1 | tail -20\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 6. What came back\n\n\u26a0 **A SHORT READ LOOKS EXACTLY LIKE A GOOD ONE UNTIL SOMETHING COUNTS.** Every\ncolumn should carry 61 body lines plus the phantoms the segmenter adds; a\ncolumn at 0 lines, or a page missing one side, is the failure this cell\nexists to name."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "from xml.etree import ElementTree as ET\nimport collections\n\nNS = \"{http://www.loc.gov/standards/alto/ns-v4#}\"\naltos = sorted(cols.glob(\"*.xml\"))\ncounts = {}\nfor x in altos:\n    try:\n        counts[x.stem] = sum(1 for _ in ET.parse(x).getroot().iter(f\"{NS}TextLine\"))\n    except ET.ParseError as e:\n        counts[x.stem] = -1\n        print(f\"  {x.stem}: UNREADABLE \u2014 {e}\")\n\nmissing = [s.stem + c for s in scans for c in (\"-L\", \"-R\") if s.stem + c not in counts]\nshort = {k: v for k, v in counts.items() if v < 55}\nprint(f\"{len(altos)} ALTO files\")\nprint(\"lines per column:\", dict(sorted(collections.Counter(counts.values()).items())))\nif missing:\n    print(f\"MISSING: {missing}\")\nif short:\n    print(f\"SUSPICIOUSLY SHORT: {short}\")\nassert not missing and not short, \"read is incomplete \u2014 do not bring this back\"\n"
  ]
 },
 {
  "cell_type": "markdown",
  "metadata": {},
  "source": [
   "## 7. Bring it home\n\nThe ALTO only. The column PNGs are 2.0 GB and regenerate from the scans in\nminutes."
  ]
 },
 {
  "cell_type": "code",
  "metadata": {},
  "execution_count": null,
  "outputs": [],
  "source": [
   "import shutil\nout = Path(\"/kaggle/working/alto{tranche}\")\nout.mkdir(exist_ok=True)\nfor x in cols.glob(\"*.xml\"):\n    shutil.copy2(x, out / x.name)\nshutil.make_archive(\"/kaggle/working/alto{tranche}\", \"zip\", out)\nprint(len(list(out.glob(\"*.xml\"))), \"files\")\n!ls -lh /kaggle/working/alto{tranche}.zip\n"
  ]
 }
]"""


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
    return {
        'cells': cells,
        'metadata': {
            'kernelspec': {'display_name': 'Python 3', 'language': 'python',
                           'name': 'python3'},
            'language_info': {'name': 'python'},
            'accelerator': 'GPU',
        },
        'nbformat': 4, 'nbformat_minor': 5,
    }


def build(spec: str, out: Path, model: Path) -> dict:
    ns = pages(spec)
    (out / 'scans').mkdir(parents=True, exist_ok=True)
    (out / 'models').mkdir(parents=True, exist_ok=True)
    scans = {}
    missing = []
    for n in ns:
        src = SCANS / f'page-{n:03d}.jpg'
        if not src.exists():
            missing.append(n)
            continue
        dst = out / 'scans' / src.name
        if not dst.exists() or dst.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dst)
        scans[src.name] = sha256(dst)
    if missing:
        raise SystemExit(f'no scan for page(s) {missing} — refusing to bundle '
                         f'a tranche with a hole in it')
    shutil.copy2(model, out / 'models' / model.name)
    manifest = {
        'tranche': spec,
        'source': str(SCANS),
        'pages': {'first': ns[0], 'last': ns[-1], 'count': len(ns)},
        'model': {'name': model.name, 'sha256': sha256(model),
                  'note': 'kraken round 6, 0.33% character error'},
        'scans': scans,
    }
    (out / 'MANIFEST.json').write_text(
        json.dumps(manifest, indent=1, sort_keys=True), encoding='utf-8')
    (out / f'kaggle-cold-read-{spec}.ipynb').write_text(
        json.dumps(notebook(spec), indent=1), encoding='utf-8')
    slug = f'cold-read-{spec}'
    (out / 'dataset-metadata.json').write_text(json.dumps({
        'title': slug, 'id': f'johnhboyer/{slug}',
        'licenses': [{'name': 'CC0-1.0'}]}, indent=1), encoding='utf-8')
    return manifest


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('pages', help='e.g. 118-281')
    ap.add_argument('--out', type=Path)
    ap.add_argument('--model', type=Path, default=MODEL)
    a = ap.parse_args(argv)
    out = a.out or ROOT / 'work' / f'cold-read-{a.pages}'
    m = build(a.pages, out, a.model)
    size = sum(p.stat().st_size for p in out.rglob('*') if p.is_file())
    print(f"{m['pages']['count']} scans, pages {m['pages']['first']}-"
          f"{m['pages']['last']}, model {m['model']['name']}")
    print(f'{size / 1e9:.2f} GB -> {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
