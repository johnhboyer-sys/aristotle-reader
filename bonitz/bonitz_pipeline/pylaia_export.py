"""Convert a Calamari export into PyLaia's inputs — both tokenisations at once.

    python3 -m bonitz_pipeline.pylaia_export --export work/calamari-export \
        --out work/pylaia-export [--va-every 10]

PyLaia's ground truth is whitespace-separated symbol tokens, so the symbol
inventory is ours to define — the whole point of the experiment is one model
where `ȣ̓` is a single CTC class (grapheme-cluster) against one where it is a
base glyph plus a later combining-mark frame (per-codepoint).  Both symbol
tables and both table sets come out of ONE run over ONE export, so the two
training runs differ in exactly one input: the tokenisation.

⚠ HOLDOUT LINES GO TO te.txt ONLY.  The holdout is John's ruling, not a
hyperparameter: a test asserts no holdout id ever appears in tr.txt or va.txt,
in either tokenisation.  Validation is carved out of the training split —
every Nth line, deterministically, the SAME lines in both tokenisations.

⚠ THE EXPORT DIRECTORY MUST PROVE ITS PROVENANCE.  Splitting on the directory
NAMED holdout/ is not the same as honouring the ruling: a hand-assembled
--export, or one made before the ruling moved, puts held-out lines in train/
and this converter would train PyLaia on them.  So the converter reads the
source's MANIFEST.json — written by calamari_export at the moment its gate
verified the arrows — and refuses unless the ruling it records equals the
ruling on disk now.  No override flag; see the ⚠ notes in kraken_corpus.

⚠ THE MANIFEST IS STILL THE ROOT OF TRUST, AND THE OBVIOUS HARDENING HAS A
NUMBER ON IT NOW.  That check proves which RULING gated the export; it does
not open train/ and look.  A directory whose train/ really does hold held-out
lines, carrying a manifest that says otherwise, passes — Grok's finding 8,
recorded as a deliberate boundary: this defends accidents, not forgery.

Refusing when a train line's text also appears in holdout is the natural
next gate, and it was MEASURED before being written rather than after
(2026-08-13): across the 82 training and 12 holdout columns of
work/kraken400, 4,977 train lines and 732 holdout lines share exactly ONE
text — `b21.`, a four-character continuation line two columns coincide on by
nature.  An exact-text gate would therefore fail closed on a clean export
today, and any workable version needs a length floor or a tolerance.  That is
a threshold, which is John's to set and not a thing to invent at the end of a
session; the measurement is here so whoever sets it starts from a number.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import unicodedata
from pathlib import Path

from bonitz_pipeline import kraken_corpus as kc

CTC = '<ctc>'
SPACE = '<space>'
TOKENISATIONS = ('codepoint', 'cluster')


def codepoint_tokens(text: str) -> list[str]:
    """One token per Unicode codepoint; a literal space becomes `<space>`."""
    return [SPACE if c == ' ' else c for c in text]


def cluster_tokens(text: str) -> list[str]:
    """One token per grapheme cluster; a literal space becomes `<space>`.

    Each combining codepoint attaches to the preceding base character.  Exact
    for this corpus — the only clusters are marks over `ȣ` and `ϗ` — and it
    keeps the `regex` package out of the pipeline.  A mark with nothing to
    attach to (line start, or after a space) stands alone rather than
    corrupting the `<space>` token.
    """
    toks: list[str] = []
    for c in text:
        if c == ' ':
            toks.append(SPACE)
        elif unicodedata.combining(c) and toks and toks[-1] != SPACE:
            toks[-1] += c
        else:
            toks.append(c)
    return toks


_TOKENISE = {'codepoint': codepoint_tokens, 'cluster': cluster_tokens}


def check_provenance(export_dir: Path) -> None:
    """Refuse an export that cannot prove the ruling it was gated on.

    `calamari_export` records `holdout_columns` — the ruling its gate verified
    at export time — in its MANIFEST.json.  A second engine trained elsewhere
    is exactly where a held-out column slips back in unnoticed (the ⚠ in
    kraken_corpus and calamari_export), so:

      * no manifest → refuse: an export without provenance is exactly the
        hand-assembled directory, where train/ can hold anything;
      * unreadable manifest, or one that never recorded the ruling → refuse,
        for the same reason;
      * recorded ruling ≠ the ruling on disk now → refuse: the ruling moved
        since the export was made, so its train/ may hold columns John has
        since ruled out.

    Every refusal raises before a byte is written.  There is no override.
    """
    p = export_dir / 'MANIFEST.json'
    if not p.is_file():
        raise kc.HoldoutError(
            f'{p} is missing — an export without provenance is a '
            f'hand-assembled directory, and a hand-assembled train/ is how a '
            f'held-out column reaches training. Re-run '
            f'bonitz_pipeline.calamari_export.')
    try:
        manifest = json.loads(p.read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:
        raise kc.HoldoutError(
            f'{p} is not readable JSON ({e}) — it cannot prove which ruling '
            f'gated this export. Re-run bonitz_pipeline.calamari_export.'
        ) from e
    recorded = manifest.get('holdout_columns')
    if not isinstance(recorded, list) or not recorded:
        raise kc.HoldoutError(
            f'{p} does not record the holdout ruling it was gated on '
            f'(`holdout_columns`) — without it nothing says train/ honours '
            f'John\'s ruling. Re-run bonitz_pipeline.calamari_export.')
    ruled = set(kc.holdout_columns())
    got = {str(c) for c in recorded}
    if got != ruled:
        newly_held = sorted(ruled - got)
        no_longer = sorted(got - ruled)
        raise kc.HoldoutError(
            f'{p} was gated on a different ruling than '
            f'{kc.HOLDOUT_RULING} holds now — the export is stale, and its '
            f'train/ may hold columns John has since ruled out. Held now but '
            f'not at export: {newly_held or "none"}; held at export but not '
            f'now: {no_longer or "none"}. Re-run '
            f'bonitz_pipeline.calamari_export against the current ruling.')


def read_split(export: Path, name: str) -> list[tuple[str, str, Path]]:
    """Read one Calamari split as `(image-id, text, png-path)` triples.

    Ids are namespaced (`train-00000`, `holdout-00000`) because both splits
    number from 00000 in the source and PyLaia resolves every id against one
    flat image directory.  A text without its image raises: a silently
    dropped line is exactly the defect this pipeline exists to refuse.
    """
    d = export / name
    if not d.is_dir():
        raise FileNotFoundError(f'{d} is not a directory — is {export} a '
                                f'calamari_export output?')
    rows = []
    for gt in sorted(d.glob('*.gt.txt')):
        png = gt.with_name(gt.name[:-len('.gt.txt')] + '.png')
        if not png.is_file():
            raise FileNotFoundError(f'{gt} has no image {png}')
        text = gt.read_text(encoding='utf-8')
        if text.endswith('\n'):
            text = text[:-1]
        rows.append((f'{name}-{png.stem}', text, png))
    if not rows:
        raise FileNotFoundError(f'no *.gt.txt lines under {d}')
    return rows


def link_or_copy(src: Path, dst: Path) -> None:
    """Hardlink `src` at `dst`; copy when linking fails (e.g. across devices)."""
    if dst.exists():
        dst.unlink()
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def build_syms(train_lines: list[tuple[str, str, Path]],
               holdout_lines: list[tuple[str, str, Path]],
               tokenise) -> tuple[list[str], list[str]]:
    """Symbol table from the TRAINING split, holdout-only symbols appended.

    `<ctc>` sits at index 0, `<space>` next, then the training symbols.  A
    symbol seen only in the holdout must still appear or decoding can never
    emit it — it goes at the end and is returned separately so the manifest
    can name it (expect it wrong; exclude it from per-class conclusions).
    """
    train_syms = {t for _, text, _ in train_lines for t in tokenise(text)}
    holdout_syms = {t for _, text, _ in holdout_lines for t in tokenise(text)}
    train_syms.discard(SPACE)
    holdout_syms.discard(SPACE)
    holdout_only = sorted(holdout_syms - train_syms)
    return [CTC, SPACE] + sorted(train_syms) + holdout_only, holdout_only


def write_table(path: Path, rows: list[tuple[str, str, Path]],
                tokenise) -> int:
    """Write `<image-id> <sym> <sym> …` lines; returns the line count."""
    with path.open('w', encoding='utf-8') as f:
        for image_id, text, _ in rows:
            f.write(' '.join([image_id] + tokenise(text)) + '\n')
    return len(rows)


def export(export_dir: Path, out: Path, va_every: int = 10) -> dict:
    """Convert one Calamari export into both PyLaia input sets; return the manifest."""
    if va_every < 2:
        raise ValueError(f'--va-every must be >= 2, got {va_every}')
    check_provenance(export_dir)
    train = read_split(export_dir, 'train')
    holdout = read_split(export_dir, 'holdout')

    imgs = out / 'imgs'
    imgs.mkdir(parents=True, exist_ok=True)
    for image_id, _, png in train + holdout:
        link_or_copy(png, imgs / f'{image_id}.png')

    # Deterministic validation split: lines va_every, 2·va_every, … (1-based)
    # of the training split.  Index-only, so both tokenisations get the SAME
    # lines by construction.
    va = [row for i, row in enumerate(train, 1) if i % va_every == 0]
    tr = [row for i, row in enumerate(train, 1) if i % va_every != 0]

    manifest = {'source': str(export_dir), 'va_every': va_every,
                'va_fraction': len(va) / len(train), 'images': len(train) + len(holdout),
                'tokenisations': {}}
    for name in TOKENISATIONS:
        tokenise = _TOKENISE[name]
        d = out / name
        d.mkdir(parents=True, exist_ok=True)
        syms, holdout_only = build_syms(train, holdout, tokenise)
        (d / 'syms.txt').write_text(
            ''.join(f'{s} {i}\n' for i, s in enumerate(syms)), encoding='utf-8')
        counts = {'tr': write_table(d / 'tr.txt', tr, tokenise),
                  'va': write_table(d / 'va.txt', va, tokenise),
                  'te': write_table(d / 'te.txt', holdout, tokenise)}
        manifest['tokenisations'][name] = {
            'tokenisation': name, 'symbols': len(syms),
            'holdout_only_symbols': holdout_only, 'tables': counts}

    (out / 'MANIFEST.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    return manifest


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--export', type=Path, required=True, dest='export_dir',
                   help='a bonitz_pipeline.calamari_export output directory')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--va-every', type=int, default=10,
                   help='every Nth training line goes to va.txt (default 10)')
    a = p.parse_args(argv)

    manifest = export(a.export_dir.resolve(), a.out, a.va_every)
    for name, t in manifest['tokenisations'].items():
        c = t['tables']
        extra = (f"  holdout-only: {' '.join(t['holdout_only_symbols'])}"
                 if t['holdout_only_symbols'] else '')
        print(f"{name:10} {t['symbols']:>4} symbols  tr {c['tr']:>5}  "
              f"va {c['va']:>4}  te {c['te']:>4}{extra}")
    print(f"→ {a.out}  (te.txt is the holdout: never name it to "
          f"`pylaia-htr-train-ctc`)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
