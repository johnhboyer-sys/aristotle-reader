"""
Re-read Bonitz pages with LlamaParse, from the 400 dpi archive.org scan.

LlamaParse is the reader the comparator leans on for the ou-ligature: Genie
emits none at all, and the Opus/Sonnet readers have the documented ȣ->υ defect.
`raw/llamaparse/LIGATURE-HEALTH.json` records what that dependence costs — 82
of 157 pages FLATTEN at least one ligature to a plain upsilon, 280 characters in
all, and a flattened page lets all three readers agree on υ with nothing
flagged.  That is the 3-0 blind spot, in the one reader positioned to prevent it.

This re-runs those pages against the better scan and records the same health
numbers, so the two are directly comparable.  Settings and prompt are carried
over verbatim from `bonitz_llamaparse_pilot.py` — the scan is the only variable.

    python3 -m bonitz_pipeline.llama400 --pages 152,39,47,160,106   # pilot first
    python3 -m bonitz_pipeline.llama400 --all                       # 15-171

Writes `raw/llama400/page-NNN.md` and `raw/llama400/LIGATURE-HEALTH.json`.
Pages already written are skipped, so an interrupted run resumes for free.
`raw/` is write-once by standing rule: this only ever creates new files under
`raw/llama400/`, never touches `raw/llamaparse/`.
"""

from __future__ import annotations
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN = ROOT / 'work' / 'scan400'
OUT = ROOT / 'raw' / 'llama400'
OLD_HEALTH = ROOT / 'raw' / 'llamaparse' / 'LIGATURE-HEALTH.json'

# A ligature flattened to a plain upsilon leaves a non-word.  These are the
# shapes it takes: the corpus word ends -υς/-υ where the print has -ȣς/-ȣ, or
# a τȣ/τȣ̀ς becomes τυ/τὺς.  Counting them the same way the old health file did
# keeps the two runs comparable.
FLAT = re.compile(r'\b\w*[αειουηω]?υ(?:ς|ν)?\b')


# Faults measured in the existing output, not guessed at.  Each line here
# corresponds to something counted in raw/llamaparse/, so this addendum can be
# checked against the numbers rather than argued about.
STRICT_ADDENDUM = """

ERRORS THIS PARSE HAS MADE BEFORE — these are measured, not hypothetical, and
each one destroys data that cannot be recovered downstream.

A. FLATTENING THE OU-LIGATURE. In 82 of 157 previously parsed pages you wrote a
   plain upsilon where the print has ȣ — 280 characters lost. The result is a
   non-word: "ἀμείνυς" for ἀμείνȣς, "νόμυς" for νόμȣς, "διαφέρυσι" for
   διαφέρȣσι, "ἀκύσιον" for ἀκȣσιον. Before you emit any word containing a bare
   υ, ask whether the glyph on the page is the joined ou shape. If it is,
   write ȣ. Writing "υ" there is worse than writing [?].

B. EXPANDING THE OU-LIGATURE. Writing "ου" for ȣ is also wrong. It keeps the
   sense and loses the character, and this edition is being transcribed
   diplomatically. One glyph on the page is one glyph in your output.

C. INVENTING ϗ INSIDE WORDS. You have written "τῆϗ", "ηϗ" and "ἀνῆϗτο", none of
   which are words. ϗ is a standalone abbreviation for καί and stands alone
   between words. It never appears inside a word, never carries a word's
   ending, and is never part of a citation.

D. READING SIGLUM LETTERS AS DIGITS. You wrote "Ζι6 28" where the page reads
   "Ζιθ28". The letter after a work-siglum is always a Greek letter naming a
   book — α β γ δ ε ζ η θ ι κ — and is NEVER a digit. If it looks like a 6, it
   is θ. If it looks like an 8, it is θ or β. Digits appear only in the Bekker
   reference that follows.

E. CONFUSING BEKKER COLUMN LETTERS WITH GREEK. The raised a and b in 1094a3 and
   367b2 are Latin letters. Never write α or β there.
"""


def custom_prompt(strict: bool = False) -> str:
    """The Bonitz prompt, read from the pilot runner so the two cannot drift."""
    src = (ROOT.parent / 'bonitz_llamaparse_pilot.py').read_text(encoding='utf-8')
    m = re.search(r'CUSTOM_PROMPT = """\\\n(.*?)\n"""', src, re.S)
    if not m:
        sys.exit('could not read CUSTOM_PROMPT from bonitz_llamaparse_pilot.py')
    return m.group(1) + (STRICT_ADDENDUM if strict else '')


def page_pdf(page: int, tmp: Path, attempt: int = 1) -> Path:
    """One-page PDF from the 400 dpi JPEG, lossless (the JPEG stream is embedded).

    `attempt` goes into the PDF title, which changes the file hash without
    touching a single pixel.  LlamaParse caches by hash, so without this every
    retry returns the cached result byte for byte — which is what made the
    earlier "attempts 2 and 3 were identical" finding look like convergence
    when it was just the cache.
    """
    src = SCAN / f'page-{page:03d}.jpg'
    if not src.exists():
        sys.exit(f'{src} missing — run the scan400 download first')
    dst = tmp / f'page-{page:03d}-a{attempt}.pdf'
    subprocess.run(['img2pdf', '--imgsize', '400dpi',
                    '--title', f'bonitz-p{page:03d}-attempt{attempt}',
                    str(src), '-o', str(dst)],
                   check=True, capture_output=True)
    return dst


def health(text: str) -> dict:
    lig = text.count('ȣ')
    flat = [w for w in FLAT.findall(text)
            if len(w) > 3 and not w.isascii()]
    return {'ligatures': lig, 'flattened': len(flat), 'examples': flat[:6]}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument('--pages', help='comma-separated page numbers')
    g.add_argument('--all', action='store_true',
                   help='every page the old run covered (15-171)')
    p.add_argument('--workers', type=int, default=1,
                   help='pages parsed concurrently; the wall time is all API '
                        'round-trip, so this is close to a linear speedup')
    p.add_argument('--attempts', type=int, default=1,
                   help='parse each page N times and keep the run with the '
                        'most ligatures; prompts alternate strict/base')
    p.add_argument('--strict', action='store_true',
                   help='append the measured-faults addendum to the prompt; '
                        'writes to raw/llama400-strict/ so the A/B stays clean')
    p.add_argument('--dry-run', action='store_true',
                   help='show what would be sent and stop, spending nothing')
    args = p.parse_args(argv)
    global OUT
    if args.strict:
        OUT = ROOT / 'raw' / 'llama400-strict'

    if args.all:
        pages = sorted(int(f.stem.split('-')[1])
                       for f in (ROOT / 'raw' / 'llamaparse').glob('page-*.md'))
    else:
        pages = [int(x) for x in args.pages.split(',')]

    OUT.mkdir(parents=True, exist_ok=True)
    todo = [n for n in pages if not (OUT / f'page-{n:03d}.md').exists()]
    print(f'{len(pages)} requested, {len(pages) - len(todo)} already done, '
          f'{len(todo)} to parse')
    if args.dry_run:
        print('dry run — pages:', ', '.join(str(n) for n in todo))
        return 0
    if not todo:
        return 0

    key = os.environ.get('LLAMA_CLOUD_API_KEY', '').strip()
    if not key:
        sys.exit('set LLAMA_CLOUD_API_KEY first')
    from llama_cloud_services import LlamaParse

    # A fresh parser per page.  Reusing one across calls closes its asyncio
    # event loop after the first parse and every page after that fails with
    # "Event loop is closed" — which LlamaParse reports as an empty document,
    # so it looks like a page with no ligatures rather than a page that never
    # parsed.  Cheap to reconstruct; the cost is entirely in the API call.
    def make_parser(strict: bool):
        return LlamaParse(
            api_key=key,
            result_type='markdown',
            premium_mode=True,
            user_prompt=custom_prompt(strict),
            do_not_unroll_columns=True,
            page_separator='\n\n===== PAGE {page_number} =====\n\n',
            verbose=False,
        )

    old = json.loads(OLD_HEALTH.read_text())['pages'] if OLD_HEALTH.exists() else {}
    hf = OUT / 'LIGATURE-HEALTH.json'
    new = json.loads(hf.read_text())['pages'] if hf.exists() else {}

    lock = threading.Lock()
    done = [0]

    def one_page(n: int, tmp: Path) -> None:
        # Best-of-N.  LlamaParse's ligature handling is close to random between
        # runs — page 106 gave 30, then 43, then 0 on the same image — so one
        # pass is a coin flip per page.  Take the attempt with the most
        # ligatures: missing them is common, inventing them is rare, so the
        # count is a usable quality gate.  Alternate the prompt too, for a
        # second axis of variation.
        best, best_lig, tries = '', -1, []
        for a in range(1, args.attempts + 1):
            strict = args.strict if args.attempts == 1 else (a % 2 == 1)
            try:
                docs = make_parser(strict).load_data(str(page_pdf(n, tmp, a)))
                t = '\n\n'.join(d.text for d in docs)
            except Exception as e:                       # noqa: BLE001
                print(f'      page {n} attempt {a}: {type(e).__name__}: {e}',
                      flush=True)
                t = ''
            lig = t.count('ȣ')
            tries.append(f'a{a}{"S" if strict else "B"}:{lig if t.strip() else "-"}')
            # LlamaParse swallows its own errors — exhausted credits or a closed
            # event loop come back as an empty document rather than an
            # exception, and an earlier version wrote those out as clean files
            # reporting 0 ligatures, indistinguishable from a perfect parse.
            if len(t.strip()) >= 200 and lig > best_lig:
                best, best_lig = t, lig
        with lock:
            done[0] += 1
            i = done[0]
            if not best.strip():
                print(f'  [{i}/{len(todo)}] page {n}: ALL ATTEMPTS EMPTY '
                      f'({" ".join(tries)}) — not recorded', flush=True)
                return
            (OUT / f'page-{n:03d}.md').write_text(best, encoding='utf-8')
            h = health(best)
            h['attempts'] = ' '.join(tries)
            new[f'{n:03d}'] = h
            o = old.get(f'{n:03d}', {})
            print(f'  [{i}/{len(todo)}] page {n}: [{" ".join(tries)}] '
                  f'{h["ligatures"]}lig/{h["flattened"]}flat'
                  + (f'   (was {o.get("ligatures","?")}/{o.get("flattened","?")})'
                     if o else ''), flush=True)
            hf.write_text(json.dumps(
                {'_': ['Ligature health of the 400 dpi LlamaParse re-read.',
                       'Comparable to raw/llamaparse/LIGATURE-HEALTH.json:',
                       'same prompt family, same settings, best-of-N per page.'],
                 'pages': new}, ensure_ascii=False, indent=1), encoding='utf-8')

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        # The wall time is entirely API round-trip, so concurrency is close to
        # a linear speedup: 68s/page serial becomes ~12s at six workers.
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            list(pool.map(lambda n: one_page(n, tmp), todo))

    tl = sum(v['ligatures'] for v in new.values())
    tf = sum(v['flattened'] for v in new.values())
    ol = sum(old[k]['ligatures'] for k in new if k in old)
    of = sum(old[k]['flattened'] for k in new if k in old)
    print(f'\nover {len(new)} pages — 400dpi: {tl} ligatures, {tf} flattened')
    print(f'                        300dpi: {ol} ligatures, {of} flattened')
    return 0


if __name__ == '__main__':
    sys.exit(main())
