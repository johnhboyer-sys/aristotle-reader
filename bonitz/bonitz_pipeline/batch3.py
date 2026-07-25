"""
Batch driver for the three-reader pipeline. Mechanical stages only — the
Opus reader/adjudicator agents are spawned by the orchestrating Claude Code
session between stages.

Stages (each idempotent; existing outputs are skipped):

  python3 -m bonitz_pipeline.batch3 prep      --pages 20-24
      render 600 PPI -> split columns -> 1400px strips; page/col TIFFs deleted.
  python3 -m bonitz_pipeline.batch3 llamaparse --pages 20-24
      one Agentic job (needs LLAMA_CLOUD_API_KEY) -> raw/llamaparse/page-NNN.md
  python3 -m bonitz_pipeline.batch3 compare   --pages 20-24
      needs raw/opus/page-NNN-{L,R}.txt; slices the Genie chunk stream by
      fold-anchor search; writes work/flags-<range>.jsonl + work/flags-by-col/.
  python3 -m bonitz_pipeline.batch3 reconcile --pages 20-24
      needs work/adjudicated/page-NNN-{L,R}.json; writes work/reconciled/ and
      appends to work/HUMAN_QUEUE.md.
"""

from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
import unicodedata
import zipfile
from pathlib import Path

from PIL import Image

from .normalize import canonical, clean_genie, clean_llamaparse, clean_opus
from . import compare3
from .split_columns import split_page

ROOT = Path(__file__).resolve().parent.parent

# PDF-page ranges of the History Genie upload chunks
GENIE_CHUNKS = [
    (1, 200, 'Bonitz 1-200-3.docx'),
    (201, 400, 'Bonitz 201-400.docx'),
    (401, 600, 'Bonitz 401-600.docx'),
    (601, 800, 'Bonitz 601-800.docx'),
    (801, 896, 'Bonitz 801-896.docx'),
]


def parse_pages(spec: str) -> list[int]:
    a, _, b = spec.partition('-')
    return list(range(int(a), int(b or a) + 1))


# --- prep -------------------------------------------------------------------

def make_strips(col_tif: Path, out_root: Path) -> int:
    im = Image.open(col_tif).convert('RGB')
    scale = 1400 / im.width
    im = im.resize((1400, int(im.height * scale)), Image.LANCZOS)
    h = im.height
    strip_h, overlap = 700, 110
    d = out_root / col_tif.stem
    d.mkdir(parents=True, exist_ok=True)
    y, i = 0, 1
    while y < h:
        im.crop((0, y, 1400, min(h, y + strip_h))).save(d / f'strip-{i:02d}.png')
        if y + strip_h >= h:
            break
        y += strip_h - overlap
        i += 1
    return i


def stage_prep(pages: list[int]) -> None:
    img = ROOT / 'images'
    strips = img / 'strips'
    for p in pages:
        if (strips / f'page-{p:03d}-L').exists() and \
           (strips / f'page-{p:03d}-R').exists():
            print(f'page {p}: strips exist, skip')
            continue
        tif = img / f'page-{p:03d}.tif'
        if not tif.exists():
            subprocess.run(
                ['pdftoppm', '-f', str(p), '-l', str(p), '-r', '600',
                 '-tiff', '-tiffcompression', 'lzw',
                 str(ROOT / 'book.pdf'), str(img / 'page')],
                check=True, cwd=ROOT)
        left, right = split_page(tif, img / 'cols')
        for col in (left, right):
            n = make_strips(col, strips)
            print(f'{col.stem}: {n} strips')
            col.unlink()
        tif.unlink()


# --- llamaparse -------------------------------------------------------------

def stage_llamaparse(pages: list[int]) -> None:
    import os
    todo = [p for p in pages
            if not (ROOT / f'raw/llamaparse/page-{p:03d}.md').exists()]
    if not todo:
        print('llamaparse: all pages exist, skip')
        return
    sys.path.insert(0, str(ROOT.parent))
    import bonitz_llamaparse_pilot as base
    from llama_parse import LlamaParse
    parser = LlamaParse(
        api_key=os.environ['LLAMA_CLOUD_API_KEY'].strip(),
        result_type='markdown',
        premium_mode=True,
        user_prompt=base.CUSTOM_PROMPT,
        do_not_unroll_columns=True,
        page_separator='\n\n===== PAGE {page_number} =====\n\n',
        target_pages=','.join(str(p - 1) for p in todo),   # 0-indexed
        verbose=True,
    )
    docs = parser.load_data(str(ROOT / 'book.pdf'))
    if len(docs) != len(todo):
        raise RuntimeError(f'asked {len(todo)} pages, got {len(docs)} docs')
    out = ROOT / 'raw/llamaparse'
    out.mkdir(parents=True, exist_ok=True)
    for p, d in zip(todo, docs):
        f = out / f'page-{p:03d}.md'
        f.write_text(d.text, encoding='utf-8')
        print(f'wrote {f} ({len(d.text)} chars)')


# --- genie slice by fold-anchor search --------------------------------------

def _fold_map(s: str) -> tuple[str, list[int]]:
    """fold() with an offset map from folded index -> index in s."""
    out, offs = [], []
    i, n = 0, len(s)
    while i < n:
        j = i + 1
        while j < n and unicodedata.combining(s[j]):
            j += 1
        group = s[i:j]
        base = group[0]
        if base == 'ϗ':
            piece = 'και'
        elif base == 'ȣ':
            piece = 'ου'
        else:
            piece = ''.join(c for c in unicodedata.normalize('NFD', group)
                            if not unicodedata.combining(c))
            piece = piece.replace('ς', 'σ').lower()
        for ch in piece:
            out.append(ch)
            offs.append(i)
        i = j
    return ''.join(out), offs


def genie_chunk_stream(pages: list[int]) -> str:
    lo, hi = pages[0], pages[-1]
    for a, b, fname in GENIE_CHUNKS:
        if a <= lo and hi <= b:
            xml = zipfile.ZipFile(ROOT / 'raw/genie' / fname) \
                         .read('word/document.xml').decode('utf-8')
            paras = [''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p))
                     for p in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)]
            stream, _ = canonical(clean_genie(paras))
            return stream
    raise ValueError(f'pages {lo}-{hi} span a Genie chunk boundary — '
                     'run the batch within one chunk')


def locate_genie_slice(spine: str, big: str) -> str:
    fs, _ = _fold_map(spine)
    fb, bmap = _fold_map(big)
    PROBE = 60
    start = None
    for k in range(0, min(len(fs) - PROBE, 900), 150):
        idx = fb.find(fs[k:k + PROBE])
        if idx != -1:
            start = max(0, bmap[max(0, idx - int(k * 1.3) - 30)]
                        if idx - int(k * 1.3) - 30 >= 0 else 0)
            break
    if start is None:
        # fuzzy fallback: longest common substring between the spine's head
        # and the chunk stream locates the batch even when every 60-char
        # probe is broken by reader noise
        import difflib
        head = fs[:2000]
        sm = difflib.SequenceMatcher(None, head, fb, autojunk=False)
        m = sm.find_longest_match(0, len(head), 0, len(fb))
        if m.size < 30:
            raise ValueError('genie slice start anchor not found')
        idx = m.b
        start = bmap[max(0, m.b - m.a - 30)]
        print(f'genie slice: fuzzy start anchor (lcs {m.size} chars)')
    end = None
    for k in range(0, min(len(fs) - PROBE, 900), 150):
        lo = len(fs) - PROBE - k
        j = fb.find(fs[lo:lo + PROBE], idx)
        if j != -1:
            tail = min(len(fb) - 1, j + PROBE + int(k * 1.3) + 30)
            end = bmap[tail] + 1
            break
    if end is None:
        # fallback: no tail anchor matched (reader divergence at the batch
        # edge) — take a proportional window with generous margin; the
        # comparator treats trailing junk as ordinary flagged regions
        approx = idx + int(len(fs) * 1.10) + 200
        end = bmap[min(len(bmap) - 1, approx)] + 1
        print('genie slice: end anchor missing, using proportional fallback')
    return big[start:end]


# --- compare ----------------------------------------------------------------

def batch_spine(pages: list[int]):
    columns = []
    for p in pages:
        for col in ('L', 'R'):
            f = ROOT / f'raw/opus/page-{p:03d}-{col}.txt'
            stream, _ = canonical(clean_opus(f.read_text(encoding='utf-8')))
            columns.append((p, col, stream))
    return compare3.build_spine(columns)


def stage_compare(pages: list[int]) -> None:
    spine, segs = batch_spine(pages)
    genie = locate_genie_slice(spine, genie_chunk_stream(pages))
    lp = '\n'.join(
        (ROOT / f'raw/llamaparse/page-{p:03d}.md').read_text(encoding='utf-8')
        for p in pages)
    llama, _ = canonical(clean_llamaparse(lp))
    print(f'streams: opus={len(spine)} genie={len(genie)} llama={len(llama)}')
    results = compare3.compare(spine, segs, genie, llama)
    tag = f'{pages[0]:03d}-{pages[-1]:03d}'
    total, flagged = compare3.write_flags(results, ROOT / f'work/flags-{tag}.jsonl')
    bycol = ROOT / 'work/flags-by-col'
    bycol.mkdir(exist_ok=True)
    counts = {}
    for r in results:
        if r['flag']:
            counts.setdefault((r['page'], r['col']), []).append(r)
    for (p, c), rs in sorted(counts.items()):
        (bycol / f'page-{p:03d}-{c}.json').write_text(
            json.dumps(rs, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'regions {total}, flagged {flagged}; by col:',
          {f'p{p}{c}': len(rs) for (p, c), rs in sorted(counts.items())})


# --- reconcile --------------------------------------------------------------

def stage_reconcile(pages: list[int]) -> None:
    from .reconcile import reconcile
    edits, queue = reconcile(ROOT, pages)
    qf = ROOT / 'work/HUMAN_QUEUE.md'
    with open(qf, 'a', encoding='utf-8') as f:
        for item in queue:
            f.write(f"- **p{item['page']}{item['col']}** ctx `{item['ctx']}` — "
                    f"verdict `{item['verdict']}` ({item['confidence']}); "
                    f"O=`{item['opus']}` G=`{item['genie']}` "
                    f"L=`{item['llama']}`. {item.get('note', '')}\n")
    print(f'edits {edits}, human-queue items appended: {len(queue)}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('stage', choices=['prep', 'llamaparse', 'compare', 'reconcile'])
    ap.add_argument('--pages', required=True, help='e.g. 20-24')
    args = ap.parse_args()
    pages = parse_pages(args.pages)
    {'prep': stage_prep, 'llamaparse': stage_llamaparse,
     'compare': stage_compare, 'reconcile': stage_reconcile}[args.stage](pages)


if __name__ == '__main__':
    main()
