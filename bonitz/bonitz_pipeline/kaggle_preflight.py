"""Refuse to push a Kaggle kernel that repeats a failure we already paid for.

    python3 -m bonitz_pipeline.kaggle_preflight work/paddle-kernel
    python3 -m bonitz_pipeline.kaggle_preflight work/paddle-kernel --push

⚠ THIS EXISTS BECAUSE READING THE NOTES DID NOT WORK. On 2026-08-31 nine kernel
versions failed in a row, and every one of them broke a rule already written
down in `BONITZ_HANDOFF.md` — including a rule I had rewritten into that file
the same morning, hours before breaking it. John: "sounds like you didn't read
the notes. that needs to be part of mandatory process whenever running kaggle
from cli."

A note is advice and advice is forgettable. These are the same rules as
executable checks, and `--push` runs them first and refuses on any failure.

Each check below cites the version it was bought with. Do not remove one
because it has stopped firing; that is what it looks like when it is working.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

# `!cmd` is fine in these — output is chatter and the exit code is checked
# elsewhere or genuinely does not matter.
PIPE_OK = ('pip ', 'ls ', 'du ', 'nvidia-smi', 'git clone', 'echo ')


def _probe(src: str) -> str:
    """Cell source as something `ast` can parse.

    ⚠ KEEP THE INDENTATION. Replacing a `!cmd` line with a bare `pass`
    unindents it, so a shell call inside an `if` reads as a syntax error that
    is not there — and a checker that cries wolf gets ignored, which is worse
    than no checker.
    """
    out = []
    for line in src.split('\n'):
        stripped = line.lstrip()
        if stripped.startswith('!') or stripped.startswith('%'):
            out.append(re.match(r'\s*', line).group(0) + 'pass')
        else:
            out.append(line)
    return '\n'.join(out)


def cells(nb: dict) -> list[tuple[int, str]]:
    return [(i, ''.join(c['source'])) for i, c in enumerate(nb['cells'])
            if c['cell_type'] == 'code']


def check_compiles(nb: dict) -> list[str]:
    """v-any: a cell that does not parse fails the whole notebook at runtime."""
    bad = []
    for i, src in cells(nb):
        try:
            ast.parse(_probe(src))
        except SyntaxError as e:
            bad.append(f'cell {i} does not compile: {e}')
    return bad


def check_no_swallowed_exit(nb: dict) -> list[str]:
    """v6: `!python train.py | tail -200` reported the kernel COMPLETE while
    training died on the numpy ABI. The pipe eats the exit status.

    This repo has the same note twice already — once for a red pytest suite on
    main, once for a killed Kaggle read that a `| tail` hid.
    """
    bad = []
    for i, src in cells(nb):
        for line in src.split('\n'):
            s = line.lstrip()
            if not s.startswith('!') or '|' not in s:
                continue
            body = s[1:].strip()
            if any(body.startswith(ok) or f'&& {ok}' in body for ok in PIPE_OK):
                continue
            bad.append(f'cell {i} pipes a shell command, so its exit status is '
                       f'lost — use subprocess and check returncode: {s[:80]}')
    return bad


def check_no_hardcoded_mount(nb: dict) -> list[str]:
    """v1-v3: `/kaggle/input/<slug>` is a GUESS. The mount is nested at
    `/kaggle/input/datasets/<user>/<slug>` in this environment, and the dataset
    was attached the whole time. Three pushes were spent on it.
    """
    bad = []
    for i, src in cells(nb):
        for m in re.finditer(r"['\"]/kaggle/input/([^'\"*]+)['\"]", src):
            bad.append(f'cell {i} hardcodes a mount path '
                       f'(/kaggle/input/{m.group(1)}) — discover it instead, '
                       f'e.g. glob("/kaggle/input/**/MANIFEST.json")')
    return bad


def check_pin_order(nb: dict) -> list[str]:
    """v6: numpy was pinned BEFORE PaddleOCR's requirements.txt, which pulled
    it straight back to 2.x. Paddle 2.x is built against the numpy 1.x ABI.
    """
    text = '\n'.join(src for _, src in cells(nb))
    pin = text.find('numpy==')
    req = text.rfind('requirements.txt')
    if pin >= 0 and req >= 0 and pin < req:
        return ['numpy is pinned before the last requirements.txt install, '
                'which will undo the pin — pin it LAST']
    return []


def check_wheels_exist(nb: dict) -> list[str]:
    """v8-v9: `paddlepaddle-gpu==2.5.2` has no Python 3.12 wheel and
    `paddlepaddle==2.6.1` does not exist at all — the CPU fallback failed for
    the same reason the GPU one did. Ask the index; do not remember.
    """
    text = '\n'.join(src for _, src in cells(nb))
    bad = []
    for pkg, ver in set(re.findall(r'([A-Za-z0-9_.\-]+)==([0-9][^\s"\']*)', text)):
        if not pkg.startswith('paddle') and pkg != 'numpy':
            continue
        # ⚠ CURL, NOT urllib. This Mac's framework Python has no CA bundle, so
        # urllib raises CERTIFICATE_VERIFY_FAILED and the check reports a
        # notebook problem that is really a laptop problem — a false alarm is
        # how a gate gets switched off.
        r = subprocess.run(['curl', '-sf', f'https://pypi.org/pypi/{pkg}/json'],
                           capture_output=True, text=True)
        if r.returncode != 0:
            bad.append(f'could not reach PyPI for {pkg} (curl rc={r.returncode})')
            continue
        try:
            rel = json.loads(r.stdout)['releases']
        except Exception as e:
            bad.append(f'could not parse PyPI answer for {pkg}: {e}')
            continue
        base = ver.split('.post')[0]
        if base not in rel or not rel[base]:
            have = sorted((v for v in rel if rel[v]),
                          key=lambda v: [int(x) for x in re.findall(r'\d+', v)][:4])
            bad.append(f'{pkg}=={ver} is not on PyPI; latest are {have[-5:]}')
    return bad


def check_metadata(kernel_dir: Path) -> list[str]:
    """v1: the kernel slug collided with the dataset slug (409), and v2-v3 ran
    with a dataset that was still processing. Check the sources are real.
    """
    meta_path = kernel_dir / 'kernel-metadata.json'
    if not meta_path.exists():
        return [f'{meta_path} is missing']
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    bad = []
    for src in meta.get('dataset_sources') or []:
        r = subprocess.run(['kaggle', 'datasets', 'status', src],
                           capture_output=True, text=True)
        state = (r.stdout or r.stderr).strip().splitlines()[-1:] or ['no answer']
        if 'ready' not in state[0]:
            bad.append(f'dataset {src} is not ready: {state[0]}')
    if meta.get('id', '').split('/')[-1] in {
            s.split('/')[-1] for s in (meta.get('dataset_sources') or [])}:
        bad.append(f'kernel slug {meta["id"]} collides with a dataset slug — '
                   f'Kaggle answers 409')
    return bad


def check_cli_cannot_choose_the_card(nb: dict, kernel_dir: Path) -> list[str]:
    """v12-v13: A CLI PUSH RESETS THE ACCELERATOR TO P100.

    John set GPU T4 x2 in the notebook settings and v10 duly ran on a T4. The
    next `kaggle kernels push` put it straight back on a P100, and an
    `accelerator` field in kernel-metadata.json is accepted and then silently
    ignored. There is no paddle wheel that runs on a P100 under Python 3.12 —
    PyPI and Paddle's own cu118 index carry the same cp312 builds, 2.6.0-2.6.2,
    all compiled for arch 61 and up.

    So a notebook that needs more than compute 6.0 CANNOT be started from the
    CLI. Refuse the push and say who has to press the button.
    """
    text = '\n'.join(src for _, src in cells(nb))
    if re.search(r'cap\s*>=\s*[67]', text) or 'T4' in text:
        return ['this notebook requires a card the CLI cannot select — a push '
                'resets the accelerator to P100 and the `accelerator` metadata '
                'field is ignored. Push the code if you like, but the RUN must '
                'be started from the Kaggle UI with Accelerator = GPU T4 x2.']
    return []


# The one check --ui-start may waive, named rather than positional so a
# reordering of CHECKS cannot silently waive a different one.
CARD_CHECK = 'the CLI can start this run'

CHECKS = (
    ('cells compile', lambda nb, d: check_compiles(nb)),
    ('no swallowed exit status', lambda nb, d: check_no_swallowed_exit(nb)),
    ('no hardcoded mount path', lambda nb, d: check_no_hardcoded_mount(nb)),
    ('numpy pinned last', lambda nb, d: check_pin_order(nb)),
    ('every pinned wheel exists', lambda nb, d: check_wheels_exist(nb)),
    ('kernel metadata and sources', lambda nb, d: check_metadata(d)),
    ('the CLI can start this run', check_cli_cannot_choose_the_card),
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument('kernel_dir', type=Path)
    p.add_argument('--push', action='store_true',
                   help='push only if every check passes')
    # ⚠ THIS DOWNGRADES EXACTLY ONE CHECK, AND ONLY TO A WARNING. The card
    # check refused the push outright while its own message said "Push the
    # code if you like, but the RUN must be started from the Kaggle UI" — so
    # the guard forbade the workflow it recommends, and the only way past it
    # was a hand push, which is the thing this module exists to stop.
    #
    # It must never grow into a general --force. Every other check stays fatal
    # under this flag; they are failures this project already paid for.
    p.add_argument('--ui-start', action='store_true',
                   help='acknowledge that the RUN will be started by hand from '
                        'the Kaggle UI with the right accelerator. Downgrades '
                        'the card check to a warning; every other check still '
                        'blocks the push.')
    a = p.parse_args(argv)

    meta = json.loads(
        (a.kernel_dir / 'kernel-metadata.json').read_text(encoding='utf-8'))
    nb = json.loads(
        (a.kernel_dir / meta['code_file']).read_text(encoding='utf-8'))

    failures = 0
    waived = 0
    for name, fn in CHECKS:
        problems = fn(nb, a.kernel_dir)
        waivable = a.ui_start and name == CARD_CHECK and problems
        tag = 'WARN' if waivable else ('FAIL' if problems else 'ok  ')
        print(f'{tag}  {name}')
        for msg in problems:
            print(f'        {msg}')
        if waivable:
            waived += len(problems)
            print('        WAIVED by --ui-start: you are starting this run by '
                  'hand. Set Accelerator = GPU T4 x2 in the UI.')
        else:
            failures += len(problems)

    if failures:
        print(f'\n{failures} problem(s) — NOT pushing. Every one of these is a '
              f'failure this project already paid for once.')
        return 1
    print('\nall checks pass' + (f' ({waived} waived by --ui-start)'
                                  if waived else ''))
    if a.push:
        r = subprocess.run(['kaggle', 'kernels', 'push', '-p', str(a.kernel_dir)])
        return r.returncode
    return 0


if __name__ == '__main__':
    sys.exit(main())
