#!/usr/bin/env python3
"""Pilot three-reader comparison for PDF pages 15-19.

Reads the immutable raw outputs (raw/opus/, raw/genie/, raw/llamaparse/),
canonicalizes each, runs the three-way comparator, writes the flag queue to
work/flags-p15-19.jsonl and prints a summary.
"""
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bonitz_pipeline.normalize import (
    canonical, clean_genie, clean_llamaparse, clean_opus)
from bonitz_pipeline import compare3

ROOT = Path(__file__).parent
PAGES = [15, 16, 17, 18, 19]

# --- Opus spine -------------------------------------------------------------
columns = []
for p in PAGES:
    for col in ('L', 'R'):
        f = ROOT / f'raw/opus/page-{p:03d}-{col}.txt'
        stream, _ = canonical(clean_opus(f.read_text(encoding='utf-8')))
        columns.append((p, col, stream))
spine, segs = compare3.build_spine(columns)

# --- History Genie slice ----------------------------------------------------
xml = zipfile.ZipFile(ROOT / 'raw/genie/Bonitz 1-200-3.docx') \
             .read('word/document.xml').decode('utf-8')
paras = [''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p))
         for p in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)]
start = next(i for i, t in enumerate(paras) if 'φωνῆεν' in t)
agog = next(i for i, t in enumerate(paras) if t.strip().startswith('ἀγώγιμος'))
end = next(i for i, t in enumerate(paras[agog:], agog)
           if re.match(r'\s*ἀγών\b', t))
genie, _ = canonical(clean_genie(paras[start:end + 1]))

# --- LlamaParse -------------------------------------------------------------
lp_text = '\n'.join(
    (ROOT / f'raw/llamaparse/page-{p:03d}.md').read_text(encoding='utf-8')
    for p in PAGES)
llama, _ = canonical(clean_llamaparse(lp_text))

# --- compare ----------------------------------------------------------------
print(f'stream lengths: opus={len(spine)} genie={len(genie)} llama={len(llama)}')
results = compare3.compare(spine, segs, genie, llama)
out = ROOT / 'work/flags-p15-19.jsonl'
total, flagged = compare3.write_flags(results, out)

by_cls = {}
for r in results:
    by_cls[r['cls']] = by_cls.get(r['cls'], 0) + 1
print(f'regions: {total}  flagged: {flagged}')
print('by class:', by_cls)
print(f'flag queue -> {out}')
