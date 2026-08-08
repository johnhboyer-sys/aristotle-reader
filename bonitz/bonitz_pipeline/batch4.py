"""
Four-reader comparison on the 400 dpi sources: Opus spine + Genie + LlamaParse
+ kraken.

Mirrors `batch3.stage_compare` but votes four ways through `compare4`, and
reads the re-read sources rather than the originals:

    opus    raw/opus/page-NNN-C.txt          (unchanged — the only per-column reader)
    genie   raw/genie400/bonitz-hi-res-*.docx
    llama   raw/llama400/page-NNN.md
    kraken  work/kraken400/read/txt/page-NNN-C.txt
    codex   work/codex/best/page-NNN-C.txt   (--with-codex; best-of-N pick)

    python3 -m bonitz_pipeline.batch4 53-62 [--with-codex]

Writes `work/flags<N>-<range>.jsonl` and `work/flags<N>-by-col/`, where N is the
reader count — so the five-reader run lands beside the four-reader output
rather than over it, and neither disturbs the three-reader files.

⚠ Pages below 53 are refused by default: kraken trained on the reconciled text
of 15-52, so its vote there is recitation.  `compare4` mutes it automatically,
but running a whole batch where the fourth reader cannot vote is almost always
a mistake rather than an intention — `--allow-trained` says you meant it.
"""

from __future__ import annotations
import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

from . import compare3, compare4
from .batch3 import locate_genie_slice
from .normalize import canonical, clean_genie, clean_llamaparse, clean_opus

ROOT = Path(__file__).resolve().parent.parent

# The 400 dpi Genie re-read, chunked as the PDFs were uploaded.
GENIE400_CHUNKS = [
    (15, 99, 'bonitz-hi-res-p015-p099.docx'),
    (100, 199, 'bonitz-hi-res-p100-p199.docx'),
    (200, 299, 'bonitz-hi-res-p200-p299.docx'),
    (300, 399, 'bonitz-hi-res-p300-p399.docx'),
    (400, 499, 'bonitz-hi-res-p400-p499.docx'),
    (500, 599, 'bonitz-hi-res-p500-p599.docx'),
    (600, 699, 'bonitz-hi-res-p600-p699.docx'),
    (700, 799, 'bonitz-hi-res-p700-p799.docx'),
    (800, 890, 'bonitz-hi-res-p800-p890.docx'),
]


def genie400_stream(pages: list[int]) -> str:
    lo, hi = pages[0], pages[-1]
    for a, b, fname in GENIE400_CHUNKS:
        if a <= lo and hi <= b:
            xml = zipfile.ZipFile(ROOT / 'raw/genie400' / fname) \
                         .read('word/document.xml').decode('utf-8')
            paras = [''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p))
                     for p in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)]
            stream, _ = canonical(clean_genie(paras))
            return stream
    sys.exit(f'pages {lo}-{hi} span a Genie chunk boundary — '
             'run the batch within one chunk')


def kraken_stream(pages: list[int]) -> str:
    """kraken's per-column readings, concatenated in reading order."""
    parts = []
    for p in pages:
        for col in ('L', 'R'):
            f = ROOT / f'work/kraken400/read/txt/page-{p:03d}-{col}.txt'
            if not f.exists():
                sys.exit(f'{f} missing — kraken has not read this column')
            parts.append(f.read_text(encoding='utf-8'))
    stream, _ = canonical('\n'.join(parts))
    return stream


def codex_stream(pages: list[int]) -> str:
    """Codex's per-column readings — the best-of-N pick, not a raw sample.

    `work/codex/codex_best.py` chooses per column; running the panel against a
    single raw sample would import that sample's whole-column ϗ coin flip.
    """
    parts = []
    for p in pages:
        for col in ('L', 'R'):
            f = ROOT / f'work/codex/best/page-{p:03d}-{col}.txt'
            if not f.exists():
                sys.exit(f'{f} missing — run work/codex/codex_best.py first')
            parts.append(f.read_text(encoding='utf-8'))
    stream, _ = canonical(clean_opus('\n'.join(parts)))
    return stream


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('pages', help='page range, e.g. 53-62')
    p.add_argument('--allow-trained', action='store_true',
                   help='permit pages kraken trained on (15-52), where its '
                        'vote is muted and the panel is effectively three')
    p.add_argument('--with-codex', action='store_true',
                   help='add Codex as a fifth reader; writes flags5-* rather '
                        'than overwriting the four-reader output')
    args = p.parse_args(argv)
    a, _, b = args.pages.partition('-')
    pages = list(range(int(a), int(b or a) + 1))

    if pages[0] < compare4.KRAKEN_INDEPENDENT_FROM and not args.allow_trained:
        sys.exit(f'pages start at {pages[0]}: kraken trained on 15-52 and its '
                 f'vote is not evidence there. Use --allow-trained to proceed.')

    columns = []
    for pg in pages:
        for col in ('L', 'R'):
            f = ROOT / f'raw/opus/page-{pg:03d}-{col}.txt'
            stream, _ = canonical(clean_opus(f.read_text(encoding='utf-8')))
            columns.append((pg, col, stream))
    spine, segs = compare3.build_spine(columns)

    genie = locate_genie_slice(spine, genie400_stream(pages))
    lp = '\n'.join((ROOT / f'raw/llama400/page-{pg:03d}.md')
                   .read_text(encoding='utf-8') for pg in pages)
    llama, _ = canonical(clean_llamaparse(lp))
    kraken = kraken_stream(pages)

    readers = {'genie': genie, 'llama': llama, 'kraken': kraken}
    if args.with_codex:
        readers['codex'] = codex_stream(pages)

    print('streams: opus=%d %s' % (
        len(spine), ' '.join(f'{k}={len(v)}' for k, v in readers.items())))

    results = compare4.compare(spine, segs, readers)

    n = len(readers) + 1
    tag = f'{pages[0]:03d}-{pages[-1]:03d}'
    total, flagged = compare3.write_flags(
        results, ROOT / f'work/flags{n}-{tag}.jsonl')
    bycol = ROOT / f'work/flags{n}-by-col'
    bycol.mkdir(exist_ok=True)
    counts: dict[tuple[int, str], list[dict]] = {}
    for r in results:
        if r['flag']:
            counts.setdefault((r['page'], r['col']), []).append(r)
    for (pg, c), rs in sorted(counts.items()):
        (bycol / f'page-{pg:03d}-{c}.json').write_text(
            json.dumps(rs, ensure_ascii=False, indent=1), encoding='utf-8')

    by_cls: dict[str, int] = {}
    for r in results:
        by_cls[r['cls']] = by_cls.get(r['cls'], 0) + 1
    print(f'regions {total}, flagged {flagged}')
    for k, v in sorted(by_cls.items(), key=lambda kv: -kv[1]):
        print(f'  {v:5d}  {k}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
