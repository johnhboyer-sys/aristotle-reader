"""The reader panel for a tranche Opus has not seen — kraken spines it instead.

    python3 -m bonitz_pipeline.batch_cold 107-117 \
        --kraken-dir work/kraken15-102/txt107-117 \
        --calamari-dir work/calamari/read107-117/txt \
        --out work/kraken15-102/flags4-107-117.json

`batch4` spines every panel on `raw/opus/page-NNN-C.txt`, which is exactly what
this tranche must not have: John's protocol reads it with the non-Opus engines
FIRST, adjudicates that into ground truth v1, and only then lets Opus read it
blind.  A panel that opened the Opus file would spend the tranche.

So the spine is kraken round 6's filtered per-column text — per-column and at a
known line count, which is what a spine has to be — and the voters are genie,
LlamaParse and calamari round 2.  Four voices make a 2-2 split reachable, and
John's 2026-08-07 ruling is that a 2-2 split always flags.

⚠ ONE LLAMAPARSE STREAM, NOT TWO.  The two variants agreed 401/401 on 107-112:
they are one reader, and counting both manufactures a majority out of a single
opinion.

⚠ `compare4` writes the spine into a field called `opus`, and so does
`word_flags`, which requires that key and treats every other as an independent
voice.  Here that field is KRAKEN.  The name stays — copying it to a `kraken`
key would vote one reading twice — and the output carries `spine_reader` so no
card can show John a kraken reading under an Opus label.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

from . import compare3, compare4, latin_spine, margin_guard
from .batch3 import locate_genie_slice
from .batch4 import ROOT, genie400_stream
from .normalize import canonical, clean_llamaparse


def stamp(results: list[dict], spine_reader: str) -> list[dict]:
    """Name the spine's reader — and add no second copy of its vote.

    ⚠ `word_flags` requires the spine at key `opus` and counts every OTHER key
    as an independent voice. Copying the spine to `kraken` so the field reads
    honestly would vote one reading twice: the mistake the two LlamaParse
    variants already made once, when a panel counted 401 agreements from a
    single opinion as a majority. The label is metadata; it is never a voter.
    """
    for r in results:
        r['spine_reader'] = spine_reader
    return results


def _column_stream(directory: Path, page: int, col: str) -> str:
    f = directory / f'page-{page:03d}-{col}.txt'
    if not f.exists():
        sys.exit(f'{f} missing — this reader has not read this column')
    return f.read_text(encoding='utf-8')


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('pages', help='page range, e.g. 107-117')
    p.add_argument('--kraken-dir', type=Path, required=True,
                   help='FILTERED kraken text, one file per column — the spine')
    p.add_argument('--calamari-dir', type=Path, required=True)
    p.add_argument('--paddle-dir', type=Path,
                   help='per-column text from the PaddleOCR recogniser, a '
                        'FIFTH voter (2026-08-31)')
    p.add_argument('--spine-dir', type=Path,
                   help='a mixed spine from `latin_spine` (its directory holds '
                        'spine-engines.json). The spine then changes engine at '
                        'the line, kraken joins the panel as a fourth voter, '
                        'and whichever engine WROTE a line does not vote on it')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--refuse-opus', action='store_true', default=True,
                   help='refuse if raw/opus holds any page in the range')
    p.add_argument('--reads', type=Path, action='append', default=[],
                   help='read directory (read.json + images/) to check for '
                        'gutter line numbers inside the line boxes; repeatable')
    p.add_argument('--margin-checked', action='store_true',
                   help='the flagged numbered lines have been read against the '
                        'ink; proceed anyway')
    a = p.parse_args(argv)

    lo, _, hi = a.pages.partition('-')
    pages = list(range(int(lo), int(hi or lo) + 1))

    # The whole point of the tranche. If an Opus read exists for these pages
    # the cold measurement is already spent, and the panel should say so rather
    # than quietly produce a number that means nothing.
    if a.refuse_opus:
        seen = [pg for pg in pages for c in 'LR'
                if (ROOT / f'raw/opus/page-{pg:03d}-{c}.txt').exists()]
        if seen:
            sys.exit(f'REFUSED: Opus has already read {sorted(set(seen))} — '
                     'this range is not a cold tranche')

    # ⚠ THE GUTTER NUMBER. Bonitz numbers every fifth printed line in the
    # margin, and where the segmenter drew the line box wide enough to include
    # it BOTH engines read it: `Ζμδ5. 682` came through as `6821`, `τῆς πρώτης`
    # as `τῆς πρώτης as`. Seventeen lines on 107-117, three of them caught only
    # because the Bekker page cannot exist and the rest reading as ordinary
    # prose. `kraken_corpus` has excluded these from the training corpus since
    # the beginning; the cold path never did. See `margin_guard`.
    if a.reads:
        widths: dict = {}
        for d in a.reads:
            widths.update(margin_guard.line_widths(d))
        sus = margin_guard.suspect_columns(widths)
        if sus and not a.margin_checked:
            for col, med, nmed, lines in sus:
                print(f'  {col}  numbered lines run +{nmed - med}px  '
                      f'· lines {lines[0]}-{lines[-1]} every 5', file=sys.stderr)
            sys.exit(
                f'REFUSED: {len(sus)} column(s) have the gutter inside their '
                f'line boxes, so their numbered lines may carry the printed '
                f'line number. Read those lines against the ink, then pass '
                f'--margin-checked.')
        if not sus:
            print(f'margin guard: {len(widths)} columns, none showing the '
                  f'gutter in a line box')
    else:
        # ⚠ SAY WHEN NOTHING LOOKED. A silent skip reads exactly like a pass.
        print('margin guard: NOT RUN — pass --reads to check for gutter line '
              'numbers inside the line boxes', file=sys.stderr)

    spine_dir = a.spine_dir or a.kraken_dir
    engines = {}
    if a.spine_dir:
        sidecar = a.spine_dir / 'spine-engines.json'
        if not sidecar.exists():
            sys.exit(f'{sidecar} missing — a mixed spine that cannot say which '
                     'engine wrote which line would vote one reading twice')
        engines = json.loads(sidecar.read_text(encoding='utf-8'))['columns']

    columns, sources, twins = [], {}, []
    pos = 0
    for pg in pages:
        for col in ('L', 'R'):
            text = _column_stream(spine_dir, pg, col)
            stream, offsets = canonical(text)
            columns.append((pg, col, stream))
            sources[(pg, col)] = (text, offsets)
            if engines:
                twins.extend(latin_spine.twin_intervals(
                    unicodedata.normalize('NFC', text), offsets,
                    engines[f'{pg:03d}-{col}']['engines'], pos))
            pos += len(stream)
    spine, segs = compare3.build_spine(columns)

    genie = locate_genie_slice(spine, genie400_stream(pages))
    lp = '\n'.join((ROOT / f'raw/llama400/page-{pg:03d}.md')
                   .read_text(encoding='utf-8') for pg in pages)
    llama, _ = canonical(clean_llamaparse(lp))
    calamari, _ = canonical('\n'.join(
        _column_stream(a.calamari_dir, pg, col)
        for pg in pages for col in ('L', 'R')))

    readers = {'genie': genie, 'llama': llama, 'calamari': calamari}
    if a.paddle_dir:
        # ⚠ THE FIFTH VOICE CHANGES THE ARITHMETIC OF EVERY CARD. Four
        # opinions (spine + three) made a 2-2 split reachable; five make 3-2
        # and 2-2-1, so a site John has already ruled can change class without
        # any reader changing its reading. His answers are carried by SITE, by
        # `carry_rulings`, and they outrank the new tally.
        readers['paddle'] = canonical('\n'.join(
            _column_stream(a.paddle_dir, pg, col)
            for pg in pages for col in ('L', 'R')))[0]
    label = 'kraken-r6'
    if a.spine_dir:
        # kraken is no longer the whole spine, so it becomes a voter — on the
        # Latin lines it did not write. `spine_twins` mutes it everywhere it
        # did.
        readers['kraken'] = canonical('\n'.join(
            _column_stream(a.kraken_dir, pg, col)
            for pg in pages for col in ('L', 'R')))[0]
        label = 'mixed:kraken-r6+calamari-r2'
    print('streams: spine(%s)=%d %s' % (
        label, len(spine), ' '.join(f'{k}={len(v)}' for k, v in readers.items())))

    results = compare4.compare(spine, segs, readers,
                               spine_twins=twins or None)
    compare4.add_locations(results, segs, sources)
    stamp(results, label)

    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(results, ensure_ascii=False, indent=1) + '\n',
                     encoding='utf-8')
    # JSONL beside it: `word_flags` reads the project's flags format, and the
    # card queue is built from words, not from character regions.
    jsonl = a.out.with_suffix('.jsonl')
    compare3.write_flags(results, jsonl)

    by_cls: dict[str, int] = {}
    for r in results:
        by_cls[r['cls']] = by_cls.get(r['cls'], 0) + 1
    flagged = sum(1 for r in results if r['flag'])
    print(f'regions {len(results)}, flagged {flagged} -> {a.out} + {jsonl.name}')
    for k, v in sorted(by_cls.items(), key=lambda kv: -kv[1]):
        print(f'  {v:5d}  {k}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
