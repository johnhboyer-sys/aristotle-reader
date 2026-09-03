"""Export the compiled kraken corpus for a Google Colab training run.

    python3 -m bonitz_pipeline.kraken_export --work work/kraken400 \\
        --out work/colab-export

Every guard this pipeline has lives in `kraken_corpus` on this machine, and
`ketos train` in a Colab notebook goes through none of them.  A stale zip or
an upload edited in a browser tab is exactly where a held-out column slips
back into training with every list on disk innocent.

⚠ THE EXPORT IS GATED ON `kraken_corpus.stage_verify`, AND THE RE-CHECK
TRAVELS WITH THE DATA.  Nothing is written unless the arrows still prove
themselves against John's ruling, and the export carries the ruling itself
plus `check_before_training.py` — a standalone script that re-proves in Colab,
from the manifest alone, that the arrows are byte-for-byte the ones that
passed here and that no line printed only on a held-out column is inside the
train.arrow it is about to feed ketos.  The manifest stores sha256 hashes of
the held-only lines, not the lines: it may be pasted into notebooks and chat,
and the corpus text should not ride along.

⚠ THE MANIFEST IS THE CHECK'S ROOT OF TRUST, AND THAT IS A CHOICE.  The
travelling script defends against ACCIDENTS — a stale arrow, a mixed zip, a
truncated upload — because every one of those breaks a hash it verifies.  It
does not defend against an operator who edits the manifest itself: rewrite
`held_only_line_sha256` to junk and a contaminated train.arrow prints OK
(Grok's review, finding 3).  A self-describing archive cannot notarise
itself; if that threat ever matters, the answer is comparing the manifest's
hashes against this repo's copy, not more code in the zip.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from bonitz_pipeline import kraken_corpus as kc

# NFC, matching `ketos train -u NFC` and calamari_export: hashes on this
# machine and hashes in Colab must be computed over identical strings.
NORMALIZATION = 'NFC'


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _sha256_text(text: str) -> str:
    return hashlib.sha256(
        unicodedata.normalize(NORMALIZATION, text).encode('utf-8')).hexdigest()


def _nfc(texts: Counter) -> Counter:
    out: Counter = Counter()
    for t, n in texts.items():
        out[unicodedata.normalize(NORMALIZATION, t)] += n
    return out


def held_only_hashes(lists: dict[str, list[str]]) -> list[str]:
    """sha256 of every distinct line that occurs ONLY in the holdout.

    The multiset difference, not the set difference: a line printed on both a
    held-out and a training column is legitimately in train.arrow, and flagging
    it in Colab would teach whoever runs the notebook to ignore the verdict.

    ⚠ AN EMPTY DIFFERENCE IS A REFUSAL.  A holdout with no line of its own
    gives the travelling check nothing to test against — it would report clean
    on ANY train.arrow, which is `absence rendered as clean` again.
    """
    held = _nfc(kc.gt_texts(lists['holdout'])) - _nfc(kc.gt_texts(lists['train']))
    if not held:
        raise kc.HoldoutError(
            'no line is unique to the holdout — the exported re-check would '
            'pass against anything, so there is nothing worth exporting')
    return sorted(_sha256_text(t) for t in held)


# Written verbatim into the export.  Standalone on purpose: Colab has no
# bonitz_pipeline, so the check may import nothing beyond the stdlib and
# pyarrow (which training itself needs — if this import fails, so would
# `ketos train`, and the crash IS the refusal).
CHECK_SCRIPT = '''#!/usr/bin/env python3
"""Run me in Colab BEFORE the first epoch.  Exit 0 or do not train.

Re-proves, against MANIFEST.json, what the export machine's guards proved at
export time: the arrows are byte-for-byte the ones that passed verification,
and no line unique to the held-out columns is inside train.arrow.  Every
missing file, unreadable manifest, or short count is a FAILURE, not a skip —
a check that skips itself is worse than no check.
"""
import hashlib
import json
import sys
import unicodedata
from pathlib import Path

import pyarrow as pa
import pyarrow.ipc as ipc

HERE = Path(__file__).resolve().parent


def fail(msg):
    print('FAIL: ' + msg)
    print('VERDICT: DO NOT TRAIN')
    sys.exit(1)


def arrow_texts(path):
    with pa.memory_map(str(path), 'rb') as src:
        try:
            table = ipc.open_file(src).read_all()
        except pa.ArrowInvalid:
            src.seek(0)
            table = ipc.open_stream(src).read_all()
    return [row['text'] for row in table.column('lines').to_pylist()]


def main():
    manifest_path = HERE / 'MANIFEST.json'
    if not manifest_path.exists():
        fail('MANIFEST.json is missing beside this script — do not train on '
             'an export you cannot check')
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except ValueError as e:
        fail('MANIFEST.json is not readable JSON: %s' % e)
    try:
        arrows = manifest['arrows']
        held = set(manifest['held_only_line_sha256'])
        norm = manifest['normalization']
    except (KeyError, TypeError) as e:
        fail('MANIFEST.json lacks a required field: %r' % e)
    if not held:
        fail('the manifest lists no held-only lines, so this check can prove '
             'nothing — re-export')

    # 1. The bytes are the bytes that passed verification on the export
    #    machine.  An edited or re-zipped arrow fails here, whatever is in it.
    for name in sorted(arrows):
        p = HERE / name
        if not p.exists():
            fail('%s is missing' % name)
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        if digest != arrows[name]['sha256']:
            fail('%s: sha256 %s does not match the manifest (%s) — the file '
                 'changed after export' % (name, digest, arrows[name]['sha256']))

    # 2. Volume as well as verdict: a truncated arrow has nothing wrong IN it.
    texts = {name: arrow_texts(HERE / name) for name in sorted(arrows)}
    for name, lines in texts.items():
        if len(lines) != arrows[name]['lines']:
            fail('%s holds %d lines, manifest says %d' %
                 (name, len(lines), arrows[name]['lines']))
        print('%s: %d lines, sha256 ok' % (name, len(lines)))

    # 3. The direct statement: no line unique to a held-out column is in the
    #    training arrow.
    train_hashes = {
        hashlib.sha256(unicodedata.normalize(norm, t).encode('utf-8'))
        .hexdigest() for t in texts['train.arrow']}
    leaked = train_hashes & held
    if leaked:
        fail('%d held-out line(s) are inside train.arrow — the holdout is '
             'contaminated' % len(leaked))
    print('no held-out line is in train.arrow (%d lines are unique to the '
          'holdout and none of them is there)' % len(held))
    print('VERDICT: OK TO TRAIN')
    return 0


if __name__ == '__main__':
    sys.exit(main())
'''


def export(out: Path) -> dict:
    """Write the verified corpus, the ruling, the manifest and the re-check.

    The caller has already run `stage_verify`; everything here restates what
    that proved in a form that survives the trip to Colab.
    """
    lists = kc.read_lists()
    held_hashes = held_only_hashes(lists)

    out.mkdir(parents=True, exist_ok=True)
    arrows = {}
    for name in ('train', 'holdout'):
        src = kc.WORK / f'{name}.arrow'
        dst = out / f'{name}.arrow'
        shutil.copyfile(src, dst)
        # Hash the COPY: it is the file that travels.
        arrows[f'{name}.arrow'] = {
            'lines': sum(kc.arrow_texts(dst).values()),
            'sha256': _sha256_file(dst),
        }
    ruling_dst = out / 'kraken-holdout.json'
    shutil.copyfile(kc.HOLDOUT_RULING, ruling_dst)

    # ⚠ `-e` TAKES A MANIFEST OF PATHS, NOT AN ARROW. `ketos train -e
    # holdout.arrow` refuses with "is not a text file"; the training scripts
    # here have always passed `-e holdout.files`, a one-line list. The export
    # left it behind, so the first Colab run stopped at the command line with
    # everything else in place. It travels now.
    (out / 'holdout.files').write_text('holdout.arrow\n', encoding='utf-8')

    manifest = {
        'source': str(kc.WORK),
        'holdout_ruling': {
            'path': str(kc.HOLDOUT_RULING),
            'sha256': _sha256_file(ruling_dst),
        },
        'holdout_columns': kc.holdout_columns(),
        'normalization': NORMALIZATION,
        'arrows': arrows,
        'held_only_line_sha256': held_hashes,
    }
    (out / 'MANIFEST.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    (out / 'check_before_training.py').write_text(CHECK_SCRIPT,
                                                  encoding='utf-8')
    return manifest


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--work', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    # ⚠ THE GUARD READS THE RULING, SO THE RULING HAS TO TRAVEL WITH --work.
    # This set `kc.WORK` and left `kc.HOLDOUT_RULING` at its default, so
    # exporting a second corpus tree re-verified it against the 15-62 ruling
    # and refused: "held out but not ruled" for all twelve of the 63-102
    # columns. The refusal was right — that ruling says nothing about these
    # pages — and the fix is to name the ruling here too, not to loosen it.
    p.add_argument('--holdout', type=Path,
                   help='holdout ruling for THIS tree (default '
                        'work/rulings/kraken-holdout.json, which governs '
                        '15-62 and no other range)')
    a = p.parse_args(argv)
    kc.WORK = a.work.resolve()
    if a.holdout:
        kc.HOLDOUT_RULING = a.holdout.resolve()

    # Refuse to export anything the guard cannot vouch for.  Any failure
    # propagates and NOTHING is written — a half-export that fails late is a
    # directory someone will zip anyway.
    kc.stage_verify()

    manifest = export(a.out)
    for name, spec in manifest['arrows'].items():
        print(f"{name:14} {spec['lines']:>5} lines  sha256 {spec['sha256'][:12]}…")
    print(f"{len(manifest['held_only_line_sha256'])} lines unique to the "
          f"holdout, exported as hashes only")
    print(f'→ {a.out}  (run check_before_training.py in Colab before the '
          f'first epoch; exit 0 or do not train)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
