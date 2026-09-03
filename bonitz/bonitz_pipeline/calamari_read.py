"""Read a new tranche with calamari, on the pixels its training data was cut from.

    python3 -m bonitz_pipeline.calamari_read \
        --alto-dir work/kraken15-102/alto107-112 \
        --cols-dir work/kraken400/read/cols \
        --txt-dir  work/kraken15-102/txt107-112 \
        --pages 107-112 \
        --models work/calamari/ensemble5-15-102/best_models \
        --out work/calamari/read107-112

⚠ THIS PATH HAS BEEN GOT WRONG TWICE.  `ketos compile` crops every training
line TO ITS BASELINE POLYGON.  Cutting rectangles out of the column PNG — the
obvious thing to do — hands calamari a different image distribution and it
answers with noise:

    kraken r6 : 'Ζπ4. 706a18, 22. θερμότερα τὰ δεξιὰ τȣ͂ σώματος τῶν'
    hand-cut  : 'σέν , εξν ηεόόγοι ξιήροε τιν'

Both times the run was reported as a result (37.8% CER on 2026-08-22, noise on
2026-08-25) because nothing asked whether the images were the right shape.  So
the route here is: write the FILTERED ALTO, hand it to `ketos compile`, dump the
line images out of the arrow exactly as `calamari_export` does, and refuse the
run unless calamari's own mean sentence confidence clears `--min-confidence`.
99.63% on the arrow-derived holdout, 68.85% on the hand-cut crops: the canary is
free and it is the only cheap thing that can tell the two apart.

Two more things are proved rather than assumed, because a reader panel keyed by
position cannot survive either being wrong:

  * the filtered ALTO carries EXACTLY the lines `filter_kraken_lines` kept, in
    order — checked against the filtered .txt the kraken spine is read from;
  * the compiled arrow carries EXACTLY those lines, in that order — checked row
    by row, because `--skip-empty-lines` would drop one and shift every index
    after it onto its neighbour.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET

from bonitz_pipeline import filter_kraken_lines as flk

ALTO_NS = 'http://www.loc.gov/standards/alto/ns-v4#'

# 99.63% on arrow-derived images, 68.85% on hand-cut ones. Anything in between
# is a crop bug, not a hard page.
MIN_CONFIDENCE = 0.95


class ReadError(Exception):
    """The tranche cannot be read the way the training data was cut."""


def _local(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def _line_dicts(root: ET.Element) -> list[dict]:
    """Same fields `filter_kraken_lines.parse_alto_lines` returns, plus `el`.

    Its parser strips the namespace and re-parses, so its dicts cannot be
    walked back to the tree.  This one keeps the element; `_check_parse`
    proves the two agree before anything is dropped.
    """
    lines = []
    for el in root.iter():
        if _local(el.tag) != 'TextLine':
            continue
        hpos = int(flk._f(el, 'HPOS'))
        vpos = int(flk._f(el, 'VPOS'))
        width = int(flk._f(el, 'WIDTH'))
        height = int(flk._f(el, 'HEIGHT'))
        bas = el.get('BASELINE') or ''
        by = None
        if bas:
            parts = [float(x) for x in bas.replace(',', ' ').split()]
            ys = parts[1::2]
            if ys:
                by = sum(ys) / len(ys)
        if by is None:
            by = float(vpos + height)
        strings = []
        for ch in el.iter():
            if _local(ch.tag) == 'String':
                c = ch.get('CONTENT')
                if c:
                    from html import unescape
                    strings.append(unescape(c))
        content = ' '.join(strings)
        lines.append({
            'hpos': hpos, 'vpos': vpos, 'width': width, 'height': height,
            'by': by, 'content': content, 'n': len(content.replace(' ', '')),
            'drop': False, 'drop_reason': '', 'warn_reason': '', 'el': el,
        })
    return lines


def _check_parse(mine: list[dict], theirs: list[dict], stem: str) -> None:
    keys = ('hpos', 'vpos', 'width', 'height', 'by', 'content', 'n')
    if len(mine) != len(theirs):
        raise ReadError(f'{stem}: parsed {len(mine)} lines, '
                        f'filter_kraken_lines parsed {len(theirs)}')
    for i, (a, b) in enumerate(zip(mine, theirs)):
        for k in keys:
            if a[k] != b[k]:
                raise ReadError(f'{stem}: line {i} disagrees on {k}: '
                                f'{a[k]!r} vs {b[k]!r}')


def write_filtered_alto(alto: Path, col_png: Path, out: Path,
                        previous_line: str | None,
                        target: int | None = None) -> list[str]:
    """Write the ALTO with every phantom line removed. Returns kept texts.

    ⚠ THE SAME `target` THE SPINE WAS FILTERED WITH, OR THE TWO DISAGREE.
    `filter_lines` puts back a `foot_short` cut that would leave the column
    under target — seven columns of 118-281 keep the tail of a citation that
    way — and an ALTO filtered without it is a line shorter than the .txt it
    is checked against. `stage_alto` then refuses the whole tranche, which is
    the check working, but the fix is here.
    """
    from PIL import Image

    ET.register_namespace('', ALTO_NS)
    tree = ET.parse(alto)
    root = tree.getroot()
    lines = _line_dicts(root)
    _check_parse(lines, flk.parse_alto_lines(alto), alto.stem)

    with Image.open(col_png) as im:
        width, _ = im.size
    kept, dropped = flk.filter_lines(lines, width, previous_line, target)

    parents = {child: parent for parent in root.iter() for child in parent}
    drop_ids = set()
    for line in dropped:
        el = line['el']
        drop_ids.add(el.get('ID'))
        parents[el].remove(el)

    # ⚠ THE SURVIVORS GO IN BASELINE ORDER, IN ONE BLOCK, BECAUSE THAT IS THE
    # ORDER `ketos compile` CUTS THEM IN AND THE ORDER THE SPINE IS IN.
    # kraken does not write them that way. page-140-R runs by=2833, 3001,
    # 3057, 3113, 2890 — the fifth line belongs third; and page-144-R keeps a
    # stray mark at y=514 alone in a TextBlock that comes FIRST in the file,
    # ahead of a block starting at y=57. `filter_lines` sorts by baseline, so
    # the spine is in reading order, and an ALTO left in document order makes
    # calamari's text key against kraken's off by two for the rest of the
    # column. The arrow check caught it at row 356 of the second chunk on
    # 2026-08-28.
    #
    # Sorting inside each block is not enough — these blocks INTERLEAVE in y —
    # so every kept line moves into the first block, in baseline order, and
    # the blocks left empty are removed.
    blocks = [el for el in root.iter() if _local(el.tag) == 'TextBlock']
    if blocks and len(kept) > 1:
        host = blocks[0]
        for b in blocks:
            for el in [c for c in b if _local(c.tag) == 'TextLine']:
                b.remove(el)
        for line in sorted(kept, key=lambda l: l['by']):
            host.append(line['el'])
        for b in blocks[1:]:
            if not any(_local(c.tag) == 'TextLine' for c in b) and b in parents:
                parents[b].remove(b)

    # A ReadingOrder reference to a line that is gone is a dangling pointer,
    # and kraken orders lines by that group.
    for group in root.iter():
        if _local(group.tag) != 'OrderedGroup':
            continue
        for ref in list(group):
            if _local(ref.tag) == 'ElementRef' and ref.get('REF') in drop_ids:
                group.remove(ref)

    # ketos resolves <fileName> RELATIVE TO THE XML, not to the cwd, and a
    # path it cannot open is a warning it then writes an empty arrow over.
    for el in root.iter():
        if _local(el.tag) == 'fileName':
            el.text = str(col_png.resolve())
            break
    else:
        raise ReadError(f'{alto.stem}: ALTO carries no <fileName>')

    out.parent.mkdir(parents=True, exist_ok=True)
    tree.write(out, encoding='utf-8', xml_declaration=True)
    return [line['content'] for line in kept]


def stage_alto(alto_dir: Path, cols_dir: Path, txt_dir: Path,
               pages: list[int], out_dir: Path,
               target: int | None = None) -> list[tuple[str, list[str]]]:
    """Filtered ALTO for every column, proved against the filtered .txt."""
    columns: list[tuple[str, list[str]]] = []
    previous_line = None
    for page in pages:
        for side in ('L', 'R'):
            stem = f'page-{page:03d}-{side}'
            alto = alto_dir / f'{stem}.xml'
            png = cols_dir / f'{stem}.png'
            if not alto.exists():
                raise ReadError(f'{stem}: no ALTO at {alto}')
            if not png.exists():
                raise ReadError(f'{stem}: no column image at {png}')
            texts = write_filtered_alto(alto, png, out_dir / f'{stem}.xml',
                                        previous_line, target)
            spine = (txt_dir / f'{stem}.txt').read_text(
                encoding='utf-8').splitlines()
            if texts != spine:
                raise ReadError(
                    f'{stem}: the filtered ALTO is not the spine '
                    f'({len(texts)} lines vs {len(spine)}); first difference '
                    f'at {next((i for i, (a, b) in enumerate(zip(texts, spine)) if a != b), min(len(texts), len(spine)))}')
            previous_line = texts[-1] if texts else None
            columns.append((stem, texts))
            print(f'{stem}: {len(texts)} lines')
    return columns


def compile_arrow(xmls: list[Path], arrow: Path, root: Path) -> None:
    """`ketos compile` — the only crop this project will read from.

    Run from `root` so the `<fileName>` each ALTO carries resolves; the paths
    kraken wrote are relative to the repo, not to the ALTO.
    """
    arrow.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ['ketos', 'compile', '-f', 'alto', '--linetype', 'baselines',
         '-o', str(arrow.resolve()), *[str(x.resolve()) for x in xmls]],
        check=True, cwd=root, capture_output=True, text=True)
    # ⚠ ketos WARNS on an image it cannot open and then exits 0 over an empty
    # arrow. Absence rendered as success is the failure this project keeps
    # meeting; the count check downstream would catch it, this says why.
    if 'Could not open file' in proc.stdout + proc.stderr:
        raise ReadError(
            'ketos could not open a column image named by the ALTO — it '
            'resolves <fileName> relative to the XML and writes an EMPTY '
            'arrow rather than failing')


def dump_lines(arrow: Path, out_dir: Path, expected: list[str],
               start: int = 0) -> list[Path]:
    """Dump `NNNNN.png` from the arrow, in row order, proved against `expected`.

    `start` numbers the files so several arrows can fill one directory without
    the second overwriting the first.
    """
    import pyarrow as pa
    import pyarrow.ipc as ipc

    with pa.memory_map(str(arrow), 'rb') as src:
        try:
            table = ipc.open_file(src).read_all()
        except pa.ArrowInvalid:
            src.seek(0)
            table = ipc.open_stream(src).read_all()
    rows = table.column('lines').to_pylist()

    if len(rows) != len(expected):
        raise ReadError(
            f'{arrow.name} holds {len(rows)} lines against {len(expected)} '
            'kept — `--skip-empty-lines` drops a blank line and every index '
            'after it lands on its neighbour')
    for i, (row, text) in enumerate(zip(rows, expected)):
        # Compared stripped: ketos keeps the ALTO's <SP> at a line edge, the
        # ALTO parser joins String contents and does not. Whitespace at the
        # margin is not what this check is for — it is for a line landing on
        # its neighbour's index.
        if (unicodedata.normalize('NFC', row['text']).strip()
                != unicodedata.normalize('NFC', text).strip()):
            raise ReadError(f'arrow row {i} is {row["text"]!r}, '
                            f'the filtered ALTO says {text!r}')

    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, row in enumerate(rows):
        p = out_dir / f'{start + i:05d}.png'
        p.write_bytes(row['im'])
        paths.append(p)
    return paths


CONFIDENCE_RE = re.compile(r'average sentence confidence[:\s]+([0-9.]+)\s*%',
                           re.IGNORECASE)


# ⚠ ONE CALL PER 2000 IMAGES, BECAUSE THE PATHS GO ON THE COMMAND LINE.
# `--data.images` takes every path as an argument. 107-117 was 1342 images and
# fit; 118-281 is 19,978, which is 0.74 MB of argv before the environment is
# counted, and the failure when it does not fit is the shell refusing the whole
# read after the arrow has been built.
BATCH = 2000


def predict(images: list[Path], models: Path, out_dir: Path,
            predict_bin: Path, log: Path,
            batch: int = BATCH) -> tuple[list[str], float]:
    """Run the five folds as one voted reader. Returns (texts, mean confidence)."""
    ckpts = sorted(models.glob('*.ckpt'))
    if not ckpts:
        raise ReadError(f'no .ckpt under {models}')
    out_dir.mkdir(parents=True, exist_ok=True)
    log.parent.mkdir(parents=True, exist_ok=True)
    chunks = [images[i:i + batch] for i in range(0, len(images), batch)] or [[]]
    whole, weighted = [], 0.0
    for n, chunk in enumerate(chunks, 1):
        proc = subprocess.run(
            [str(predict_bin), '--checkpoint', *[str(c) for c in ckpts],
             '--output_dir', str(out_dir),
             '--data.images', *[str(i) for i in chunk]],
            capture_output=True, text=True)
        whole.append(proc.stdout + proc.stderr)
        if proc.returncode != 0:
            log.write_text('\n'.join(whole), encoding='utf-8')
            raise ReadError(f'calamari-predict failed ({proc.returncode}) on '
                            f'batch {n} of {len(chunks)}; see {log}')
        found = CONFIDENCE_RE.findall(whole[-1])
        if not found:
            log.write_text('\n'.join(whole), encoding='utf-8')
            raise ReadError(
                f'calamari-predict printed no average sentence confidence for '
                f'batch {n}; the canary is the only cheap check that the crops '
                f'are right. {log}')
        # ⚠ WEIGHTED BY IMAGES. The last batch is short, and a plain mean of
        # the batch figures would let it count as much as a full one.
        weighted += float(found[-1]) / 100.0 * len(chunk)
        print(f'  batch {n}/{len(chunks)}: {len(chunk)} lines, '
              f'{float(found[-1]):.2f}%', flush=True)
    log.write_text('\n'.join(whole), encoding='utf-8')
    confidence = weighted / len(images) if images else 0.0

    texts = []
    for image in images:
        pred = out_dir / f'{image.stem}.pred.txt'
        if not pred.exists():
            raise ReadError(f'no prediction for {image.name}')
        texts.append(unicodedata.normalize(
            'NFC', pred.read_text(encoding='utf-8').rstrip('\r\n')))
    return texts, confidence


def _parse_pages(spec: str) -> list[int]:
    a, _, b = spec.partition('-')
    return list(range(int(a), int(b or a) + 1))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--alto-dir', type=Path, required=True)
    p.add_argument('--cols-dir', type=Path, required=True)
    p.add_argument('--txt-dir', type=Path, required=True,
                   help='filtered .txt the kraken spine is read from; the '
                        'filtered ALTO must reproduce it exactly')
    p.add_argument('--pages', required=True)
    p.add_argument('--models', type=Path, required=True)
    p.add_argument('--target', type=int, default=61,
                   help='lines per column; must match what the spine '
                        'in --txt-dir was filtered with, or the ALTO '
                        'and the spine disagree by a restored line')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--per-arrow', type=int, default=40,
                   help='columns per `ketos compile`; 328 at once is '
                        '10-18 GB and gets the process killed')
    p.add_argument('--predict-bin', type=Path,
                   default=Path('work/calamari/cal311/bin/calamari-predict'))
    p.add_argument('--root', type=Path, default=Path('.'),
                   help='directory the ALTO <fileName> paths are relative to')
    p.add_argument('--min-confidence', type=float, default=MIN_CONFIDENCE)
    a = p.parse_args(argv)

    out = a.out
    columns = stage_alto(a.alto_dir, a.cols_dir, a.txt_dir,
                         _parse_pages(a.pages), out / 'alto', a.target)

    # ⚠ COMPILE IN CHUNKS OF COLUMNS, OR THE PROCESS IS KILLED WITHOUT A WORD.
    # `ketos compile` holds every line it has cut. Measured: 482 lines peak at
    # 438 MB and write a 54 MB arrow, so this tranche's 19,978 lines want
    # 10-18 GB in one process and a 2.3 GB arrow. On 2026-08-28 that died on
    # Kaggle after staging all 328 columns, with NO traceback and NO `REFUSED`
    # — the signature of a signal, not an exception. Chunking bounds it, and
    # the chunk boundary is a COLUMN boundary so each arrow can be checked
    # against exactly the lines it should carry.
    images: list[Path] = []
    chunks = [columns[i:i + a.per_arrow]
              for i in range(0, len(columns), a.per_arrow)]
    for n, chunk in enumerate(chunks, 1):
        xmls = [out / 'alto' / f'{stem}.xml' for stem, _ in chunk]
        want = [t for _, texts in chunk for t in texts]
        arrow = out / 'arrows' / f'lines-{n:03d}.arrow'
        compile_arrow(xmls, arrow, a.root.resolve())
        got = dump_lines(arrow, out / 'images', want, start=len(images))
        images += got
        print(f'  arrow {n}/{len(chunks)}: {len(chunk)} columns, '
              f'{len(got)} lines', flush=True)
        arrow.unlink()          # 2.3 GB of them otherwise, and they recompile
    expected = [t for _, texts in columns for t in texts]
    print(f'{len(images)} line images')

    texts, confidence = predict(images, a.models, out / 'pred',
                                a.predict_bin.resolve(), out / 'predict.log')
    print(f'mean sentence confidence: {confidence:.2%}')
    if confidence < a.min_confidence:
        raise ReadError(
            f'mean sentence confidence {confidence:.2%} is below '
            f'{a.min_confidence:.2%} — the line images are not cut the way '
            'the training data was. 99.63% on the arrow-derived holdout, '
            '68.85% on hand-cut rectangles. DO NOT PUBLISH THIS READ.')

    # Positional index back to `column:line`, so the panel can key on it.
    keyed: dict[str, list[str]] = {}
    i = 0
    for stem, col_texts in columns:
        keyed[stem] = texts[i:i + len(col_texts)]
        i += len(col_texts)
    (out / 'read.json').write_text(
        json.dumps({'pages': a.pages, 'lines': len(texts),
                    'mean_confidence': confidence,
                    'models': sorted(x.name for x in a.models.glob('*.ckpt')),
                    'columns': keyed}, indent=2, ensure_ascii=False) + '\n',
        encoding='utf-8')
    for stem, col_texts in keyed.items():
        (out / 'txt').mkdir(parents=True, exist_ok=True)
        (out / 'txt' / f'{stem}.txt').write_text(
            '\n'.join(col_texts) + '\n', encoding='utf-8')
    print(f'wrote {out / "read.json"}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except ReadError as exc:
        print(f'REFUSED: {exc}', file=sys.stderr)
        sys.exit(2)
