"""Where the Bonitz transcription actually stands, read off disk.

Nothing here is bookkeeping anyone has to maintain: every number is derived
from the files themselves, so the dashboard cannot claim a page was read, or a
sweep was run, when it was not.

    python3 -m bonitz_pipeline.dashboard              # print
    python3 -m bonitz_pipeline.dashboard --write      # docs/STATUS.md + .html

⚠ A SWEEP THAT CANNOT SEE A PAGE IS NOT A SWEEP THAT FOUND NOTHING. Seven
checks read `work/reconciled` alone and so were structurally blind to 53-62,
which is settled but not promoted. They reported clean over ten columns they
had never opened. The `sees_all_stages` column records which ones read the
corpus and which read one directory of it, because that distinction is the
difference between a clean page and an unexamined one.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MD = ROOT / 'docs' / 'STATUS.md'
HTML = ROOT / 'docs' / 'status.html'

# ⚠ A READER WITH ONE GLOB IS A READER THAT VANISHES WHEN ONE DIRECTORY DOES.
# kraken read 15-112 into `work/kraken400/read/txt` and 107-281 into per-tranche
# directories under `work/kraken15-102`. The first was deleted in the 2026-08-28
# clear-out, and while this map named only that path the page reported kraken as
# having read NOTHING — the false absence, in the table whose whole job is to
# make it impossible. genie was worse: not here at all, because it arrives as
# nine .docx chunks and every per-page glob anyone wrote for it said absent. It
# splits to `raw/genie-pages`, which is per page and shows the hole at scan 636.
READERS = {
    'opus': ('raw/opus/page-*.txt',),
    'codex': ('work/codex/page-*',),
    'genie': ('raw/genie-pages/page-*.txt',),
    'llamaparse': ('raw/llamaparse/page-*.md',),
    'llama400': ('raw/llama400/page-*.md',),
    'kraken': ('work/kraken400/read/txt/page-*.txt',
               'work/kraken15-102/txt*/page-*.txt'),
    'calamari': ('work/calamari/read*/txt/page-*.txt',),
}
STAGES = {
    'reconciled': 'work/reconciled/page-*.txt',
    'reconciled-auto': 'work/reconciled-auto/page-*.txt',
}

# Every check that produces reviewable findings, and whether it reads the whole
# corpus or one stage of it. `blind` is not a judgement — it is the fact that
# decides whether "0 findings" means anything.
SWEEPS = [
    ('alphacheck', 'headword order', True),
    ('bekker', 'impossible Bekker pages', True),
    ('family', 'word vs its own headword', True),
    ('lexcheck', 'words in no lexicon', True),
    ('quotecheck', 'quotations vs the cited line', True),
    ('siglum_check', 'citation sigla vs Bonitz\'s key', True),
    ('smyth_sweep', '16 hard Smyth validators', True),
    ('accent_law', 'accent quantity rules', True),
    ('accent', 'accent vs the corpus', True),
    ('breathing', 'breathing vs the corpus', True),
    ('breathing_oracle', 'breathing vs LSJ and Aristotle', True),
    ('diacritic_sweep', 'diacritics vs LlamaParse', True),
    ('book_review', 'book letter vs Bekker span', True),
    ('ngram_check', 'phrase recurrence', False),
]


def _pages(patterns: str | tuple[str, ...]) -> set[int]:
    """Pages matched by one glob or several. A reader may have read a range in
    more than one place — kraken has a round-5 directory and a round-6 one per
    tranche — and naming only one of them understates it silently."""
    if isinstance(patterns, str):
        patterns = (patterns,)
    out = set()
    for pattern in patterns:
        for f in glob.glob(str(ROOT / pattern)):
            m = re.search(r'page-(\d+)', os.path.basename(f))
            if m:
                out.add(int(m.group(1)))
    return out


def span(pages) -> str:
    """{53,54,55,57} -> '53-55, 57'."""
    s = sorted(pages)
    if not s:
        return '—'
    runs, a, b = [], s[0], s[0]
    for n in s[1:]:
        if n == b + 1:
            b = n
        else:
            runs.append((a, b))
            a = b = n
    runs.append((a, b))
    return ', '.join(str(x) if x == y else f'{x}-{y}' for x, y in runs)


def _tsv_hits(path: Path, lo: int, hi: int) -> int | None:
    """Rows in a sweep report whose column falls in [lo, hi].

    Returns None when the report does not exist, which is NOT zero — a sweep
    that has never run and a sweep that found nothing print the same number
    everywhere else in this project, and that is the mistake the dashboard is
    supposed to make impossible.
    """
    if not path.exists():
        return None
    n = 0
    for i, line in enumerate(path.read_text(encoding='utf-8').splitlines()):
        if i == 0 or not line.strip():
            continue
        m = re.match(r'page-(\d+)', line.split('\t')[0])
        if m and lo <= int(m.group(1)) <= hi:
            n += 1
    return n


# Three states, not two. A sweep with no counter here is NOT a sweep that
# found nothing, and NOT a sweep that never ran — conflating them is the very
# claim this dashboard makes and must therefore keep.
NOT_COUNTED = 'not counted'

# ⚠ AND A NUMBER SPLIT ON A GUESS IS WORSE THAN AN UNSPLIT ONE. A sweep whose
# findings the site-mapper does not enumerate — a report shape it cannot read,
# or a counter here that drifted from the mapper there — keeps today's number
# and says the split is unavailable. It is never shown as all-open or
# all-adjudicated, because either would assert something nobody checked.
NOT_MAPPED = 'not mapped'

# ⚠ AND A COUNT FROM A REPORT OLDER THAN THE CORPUS IS NOT A COUNT. `_tsv_hits`
# filters a report's rows to [lo, hi] and never asks whether the report ever
# EXAMINED [lo, hi]. So `accent-law-violations.tsv`, written 2026-08-17, was
# filtered against a corpus carrying 276 rulings made on the 18th and reported
# "all 8 adjudicated" — a clean bill of health for pages it had never opened.
# That is the authority-claims-more-than-its-evidence failure, committed by the
# page whose entire job is to make it impossible, and it is why the sweeps table
# cannot be trusted to update itself when work lands.
STALE = 'stale'

# ⚠ AND A COUNTER THAT RAISED IS NOT A SWEEP THAT FOUND NOTHING. The live
# counters below import and call the sweep, so a change under one of them
# throws where the old code would have returned None — and None here reads as
# "never run", which is the exact collapse this page exists to prevent. A
# failure says so, keeps the page up, and does not pretend to a number.
FAILED = 'counter failed'

# ⚠ AND A SWEEP MISSING ITS EVIDENCE IS NOT A SWEEP REPORTING ON THE BOOK. A
# counter runs, returns a number, and the number describes a hole in `work/`
# rather than anything Bonitz printed. `alphacheck` reads the indent to tell a
# sub-lemma from a citation siglum; the round-5 ALTO carrying that indent for
# 103-117 was deleted on 2026-08-28, and the sweep went from 3 findings to 18
# over an unchanged corpus. Eighteen is not a count of anything. A sweep whose
# inputs are part-missing says so and gives no number — the same refusal as
# STALE, for the same reason.
BLIND = 'blind'

# The reports each counted sweep reads, so staleness is asked of the same files
# the count came from. `accent` and `breathing` are absent deliberately: they
# scan the corpus live on every call and so cannot lag it.
_REPORT_GLOBS = {
    'accent_law': ['accent-law-violations.tsv'],
    'diacritic_sweep': ['diacritic-candidates.tsv'],
    'siglum_check': ['siglum-check*.tsv'],
    'smyth_sweep': ['smyth/*.tsv'],
}


def _corpus_mtime(lo: int, hi: int) -> float:
    """When the corpus in this range was last written."""
    best = 0.0
    for stage in ('reconciled', 'reconciled-auto'):
        for q in (ROOT / 'work' / stage).glob('page-*.txt'):
            m = re.match(r'page-(\d+)', q.name)
            if m and lo <= int(m.group(1)) <= hi:
                best = max(best, q.stat().st_mtime)
    return best


def stale_sweeps(lo: int, hi: int) -> set:
    """Sweeps whose newest report predates the corpus it is counted against.

    A report cannot describe a file written after it. Newest-report-wins: if
    any report for a sweep is current, the sweep has been re-run, and the
    range-named leftovers beside it are history rather than evidence of lag.
    """
    corpus = _corpus_mtime(lo, hi)
    if not corpus:
        return set()
    out = set()
    for name, globs in _REPORT_GLOBS.items():
        times = [q.stat().st_mtime
                 for g in globs
                 for q in (ROOT / 'work' / 'sweeps').glob(g)
                 if not q.name.startswith('_')]
        if times and max(times) < corpus:
            out.add(name)
    return out



def _best(paths, lo: int, hi: int) -> int | None:
    """The fullest report's hit count, or None when none of them exist.

    MAX and not SUM: several reports can cover overlapping spans — a
    range-named one written for a single sitting alongside the whole-corpus
    one — and adding them would count a site once per report that holds it.
    The most complete report is the honest answer, and `None` still means
    nothing was examined.
    """
    counts = [n for n in (_tsv_hits(q, lo, hi) for q in paths) if n is not None]
    return max(counts) if counts else None


def _cols(lo: int, hi: int) -> list:
    """(page, side) for every transcribed column in range, across all stages."""
    from .normalize import corpus_columns
    out = []
    for f in corpus_columns():
        m = re.match(r'page-(\d+)-([LR])$', f.stem)
        if m and lo <= int(m.group(1)) <= hi:
            out.append((int(m.group(1)), m.group(2)))
    return out


def _live_counters() -> dict:
    """Sweeps counted by calling them, name -> fn(lo, hi) -> int.

    ⚠ `ngram_check` AND `book_review` ARE DELIBERATELY ABSENT, and adding them
    later would be a mistake worth this note. ngram_check reports 23,513
    recurring phrases over 15-102; that is a description of the corpus, not a
    list of defects, and a red 23,513 on this page would mean nothing while
    looking like everything. book_review is a review UI, not a sweep — it has
    no findings to count. Both stay `not counted`, which is the honest state.
    """
    def alpha(lo, hi):
        # ⚠ DISTINCT PAGES, SORTED. `_cols` yields a page once per column, and
        # handing scan the same page twice shatters the alphabetical run it
        # walks: 34 real violations reported as 1782.
        from . import alphacheck
        pages = sorted({p for p, _ in _cols(lo, hi)})
        blind = alphacheck.geometry_missing(pages)
        if blind:
            # ⚠ SAY WHICH NUMBER THIS IS. `geometry_missing` counts columns
            # whose geometry FILE is gone — the hole someone dug, and the thing
            # that gates the count. More columns than that measure nothing: a
            # crop that ate the outdent is refused on the evidence, which is the
            # sweep working. Reporting only the first number reads as a claim
            # about the second. Codex caught the page saying "11 columns have no
            # geometry" over a corpus where 19 yield none.
            silent = len(alphacheck.geometry_missing(pages, yielded=True))
            extra = (f', {silent - len(blind)} more measure none'
                     if silent > len(blind) else '')
            return (f'{BLIND}: {len(blind)} columns lost their geometry'
                    f'{extra}')
        return len(alphacheck.scan(pages))

    def bek(lo, hi):
        from . import bekker
        return sum(len(bekker.scan(p, c)[0]) for p, c in _cols(lo, hi))

    def fam(lo, hi):
        from . import family
        return sum(len(family.scan(p, c)) for p, c in _cols(lo, hi))

    def lex(lo, hi):
        from . import lexcheck
        forms = lexcheck.load_forms()
        return sum(len(lexcheck.sweep_column(p, c, forms))
                   for p, c in _cols(lo, hi))

    def quote(lo, hi):
        # ⚠ scan() RETURNS EVERY CITATION, NOT THE FINDINGS. All 2,962 of them,
        # which is a plausible number meaning something else entirely — the
        # worst kind of counter. A finding is a citation that was checkable
        # (not a skipped Latin span), scored at or below zero overlap, and has
        # no standing ruling. That is what its own CLI prints as the total.
        from . import quotecheck
        index = quotecheck.load_corpus()
        n = 0
        for pg, c in _cols(lo, hi):
            for r in quotecheck.scan(pg, c, index):
                if (not r.get('skipped') and r['overlap'] <= 0.0
                        and not r.get('adjudicated')):
                    n += 1
        return n

    def oracle(lo, hi):
        from . import breathing_oracle
        return len(breathing_oracle.disagreements(lo, hi)[0])

    return {'alphacheck': alpha, 'bekker': bek, 'family': fam,
            'lexcheck': lex, 'quotecheck': quote,
            'breathing_oracle': oracle}


_FINDINGS_MEMO: dict = {}


def findings(lo: int = 53, hi: int = 62) -> dict[str, object]:
    """What each sweep currently has to say about a page range.

    A name maps to an int (that many findings), None (a report that does not
    exist — never run), or NOT_COUNTED (no counter implemented here). Codex
    found the third case rendering identically to "never run" for seven sweeps
    that do have reports.
    """
    # ⚠ MEMOISED ON THE INPUTS, NOT ON A CLOCK. The six live counters call the
    # sweeps and take ~15s together, which is fine once and painful on a page
    # that re-serves itself every 60s. The key is the newest corpus file and the
    # newest sweep report, so any edit to either invalidates it — a time-based
    # cache would reintroduce exactly the staleness --serve exists to remove.
    reports = [q.stat().st_mtime
               for q in (ROOT / 'work' / 'sweeps').rglob('*.tsv')]
    key = (lo, hi, _corpus_mtime(lo, hi), max(reports) if reports else 0.0)
    if key in _FINDINGS_MEMO:
        return dict(_FINDINGS_MEMO[key])

    S = ROOT / 'work' / 'sweeps'
    out: dict[str, int | None] = {
        'accent_law': _tsv_hits(S / 'accent-law-violations.tsv', lo, hi),
        'diacritic_sweep': _tsv_hits(S / 'diacritic-candidates.tsv', lo, hi),
        # ⚠ THE RANGE-NAMED REPORT IS NOT THE ONLY ONE, AND USUALLY IS NOT
        # THE ONE. This looked for `siglum-check-{lo}-{hi}.tsv`, which exists
        # only if that exact span was run once — `siglum-check-53-62.tsv` does,
        # and `siglum-check-15-102.tsv` never will, because the whole-corpus
        # run writes `siglum-check.tsv`. So a sweep executed minutes earlier
        # reported "never run", which is the one answer a status page must not
        # give about work that was done. `merge_review` documents this exact
        # trap; the fix there was to read every report and let the page filter
        # decide, and it is the fix here.
        'siglum_check': _best(S.glob('siglum-check*.tsv'), lo, hi),
    }
    # `_labels.tsv` is the tokens the label guard HID from every rule, not
    # findings. Counting it reported 165 where the rules found 3.
    smyth = [_tsv_hits(p, lo, hi) for p in sorted((S / 'smyth').glob('*.tsv'))
             if not p.name.startswith('_')]
    out['smyth_sweep'] = (sum(x for x in smyth if x is not None)
                          if any(x is not None for x in smyth) else None)
    # These two report to stdout and keep no file, so ask them directly.
    for name in ('accent', 'breathing'):
        try:
            mod = __import__(f'bonitz_pipeline.{name}', fromlist=['scan'])
            out[name] = sum(len(mod.scan(p, c))
                            for p in range(lo, hi + 1) for c in ('L', 'R'))
        except Exception:
            out[name] = None

    # ⚠ COUNTED BY CALLING THEM, NOT BY READING THEIR PRINTOUT. Six sweeps read
    # `not counted` for months — not because they had never run, but because no
    # counter here existed, so the page could say nothing about `quotecheck`,
    # `family` or the breathing oracle at all. Each is called directly: a
    # counter that parses stdout breaks the first time a line is reworded, and
    # breaks silently.
    #
    # ⚠ AND CALLED OVER THE COLUMNS THAT EXIST, NOT range(lo, hi+1) x (L, R).
    # `corpus_columns` RAISES for a page in no stage, which is right for a
    # sweep and wrong for a status page that must survive a gap in the corpus.
    for name, fn in _live_counters().items():
        try:
            out[name] = fn(lo, hi)
        except Exception:
            out[name] = FAILED
    for name, _what, _ok in SWEEPS:
        out.setdefault(name, NOT_COUNTED)
    _FINDINGS_MEMO.clear()          # one range at a time; never grows
    _FINDINGS_MEMO[key] = dict(out)
    return out


def adjudication(lo: int = 53, hi: int = 62,
                 counted: dict | None = None) -> dict[str, object]:
    """Each counted sweep's findings, divided into open and adjudicated.

    ⚠ THE RED NUMBERS ARE MOSTLY ANSWERED, AND THE PAGE SAID OTHERWISE. John
    read this table and asked whether the findings were resolved. They are
    standing, not new: a ruled `preserve` keeps what Bonitz printed, so the
    sweep goes on disagreeing with its authority for as long as the page says
    what it says. Counting those beside the ones nobody has looked at is the
    two-states-where-there-are-three failure, committed by the page that
    reports on it.

    Returns `name -> (open, adjudicated)` for a sweep that maps, or NOT_MAPPED
    for one whose count and the mapper's disagree — which is a real condition,
    not a formality: a counter added here without a mapper there would silently
    show every one of its findings as answered.

    ⚠ NOT_MAPPED IS FOR THE CONDITION IT NAMES, NOT FOR ANY FAILURE. Wrapping
    this in a catch-all would turn a broken mapper into a page reporting
    "not mapped" on every row, which reads like a considered answer. The mapper
    raises for a range no corpus stage holds, exactly as `corpus_columns` does,
    and so does this.
    """
    counted = findings(lo, hi) if counted is None else counted
    from .adjudication import split as _split
    parts = _split(lo, hi)
    out: dict[str, object] = {}
    for name, hits in counted.items():
        if not isinstance(hits, int):
            continue                     # never run / not counted: untouched
        got = parts.get(name)
        if got is None:
            # No findings and none enumerated is agreement, not a gap.
            out[name] = (0, 0) if hits == 0 else NOT_MAPPED
        elif got.total != hits:
            out[name] = NOT_MAPPED
        else:
            out[name] = (got.open, got.adjudicated)
    return out


def cell_state(hits, split, is_stale: bool = False) -> tuple[str, int, int]:
    """(which state this sweep's cell is in, open, adjudicated).

    Eight states and not one of them collapsed into another:

        never run     the report does not exist — nothing was examined
        not counted   no counter here; the sweep may have findings
        blind         it ran, over evidence part of which is missing
        stale         its report predates the corpus it is counted against
        not mapped    counted, but the split could not be established
        zero          it ran, it counted, it found nothing
        settled       every finding maps to a ruling John has given
        open          findings nobody has answered

    ⚠ STALE OUTRANKS SETTLED AND ZERO, WHICH IS THE WHOLE POINT. Those two are
    the reassuring answers, and they are exactly the ones a lagging report will
    produce: findings it raised have since been ruled, and findings it never saw
    cannot be raised at all. A stale sweep therefore reports as stale even when
    its arithmetic says the work is done.
    """
    if hits == NOT_COUNTED:
        return 'not counted', 0, 0
    if hits == FAILED:
        return 'counter failed', 0, 0
    # Before every reassuring state, like `stale`: a count taken over missing
    # evidence is wrong in whichever direction the hole happens to push it.
    if isinstance(hits, str) and hits.startswith(BLIND):
        return BLIND, 0, 0
    if hits is None:
        return 'never run', 0, 0
    if is_stale:
        return 'stale', 0, 0
    if split == NOT_MAPPED:
        return 'not mapped', 0, 0
    n_open, n_adj = split if isinstance(split, tuple) else (hits, 0)
    if hits == 0:
        return 'zero', 0, 0
    return ('settled' if n_open == 0 else 'open'), n_open, n_adj


# Where John's answers are kept. `work/sweeps` holds the stores named for the
# sweep that raised them; `work/rulings` holds the ones named for the SITTING —
# `cold-107-117.json`, `space-107-117.json`, `encoding-107-117.json`.
RULING_DIRS = ('work/sweeps', 'work/rulings')


def rulings() -> dict:
    """Every ruling store, keyed by `directory/file`.

    ⚠ IT GLOBBED `work/sweeps/*rulings*.json` AND CALLED THAT THE RULINGS. Not
    one store from a cold tranche matched — they are named for their sitting
    and they live in `work/rulings` — and neither did `john.json`, which alone
    holds more answers than the whole table was showing. The page reported a
    number and meant a subdirectory.

    Same fault the sweep table carries a warning about, one level up: a report
    that reads one corpus stage cannot speak for the corpus, and a report that
    reads one ruling directory cannot speak for the rulings.

    ⚠ AND THE KEY CARRIES THE DIRECTORY, because two of them may hold the same
    file name and a bare name would quietly collapse the rows into one.
    """
    out = {}
    for d in RULING_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for p in sorted(base.glob('*.json')):
            if base.name == 'sweeps' and 'rulings' not in p.name:
                continue          # sweeps also holds reports and queues
            try:
                doc = json.loads(p.read_text(encoding='utf-8'))
            except Exception:
                continue
            out[f'{base.name}/{p.name}'] = _count_rulings(doc)
    return out


def _count_rulings(doc) -> int:
    """How many rulings a store holds, however it wraps them.

    ⚠ `john.json` REPORTED 2. It keeps its answers under a key —
    `{"_": [...notes], "rulings": [...1081]}` — and a bare `len()` counted the
    two top-level keys, so the largest store in the project showed as the
    smallest. A column headed `rulings` has to hold rulings.

    Only an explicit wrapper is unwrapped; an ordinary store's keys ARE its
    rulings and must not be second-guessed.
    """
    if isinstance(doc, dict):
        for key in ('rulings', 'entries'):
            inner = doc.get(key)
            if isinstance(inner, (list, dict)):
                return len(inner)
        return len(doc)
    return len(doc) if isinstance(doc, list) else 0


# Where the card queues live. A queue is the panel's disagreements grouped into
# questions; its answers go to a store named for the sitting.
QUEUE_GLOBS = ('work/kraken15-102/queue-*.json',
               'work/kraken15-102/apply/queue-*.json',
               'work/queue-*.json')


_ALL_SIDS: set[str] = set()


def _every_ruled_sid() -> set[str]:
    """Every card id any store has an answer for, across both ruling trees."""
    if not _ALL_SIDS:
        for d in RULING_DIRS:
            for f in sorted(glob.glob(str(ROOT / d / '*.json'))):
                try:
                    doc = json.loads(Path(f).read_text(encoding='utf-8'))
                except Exception:
                    continue
                if isinstance(doc, dict):
                    _ALL_SIDS.update(k for k in doc if isinstance(k, str))
    return _ALL_SIDS


def queues() -> list[dict]:
    """Cards waiting on John, and cards he has answered, per sitting.

    Every card is a READER DISAGREEMENT — a place the four readers do not
    agree, grouped so one answer settles every site that prints the same thing.
    So this counts the adjudication backlog, which is the only number on this
    page about work in front of John rather than work behind him.

    ⚠ THE SID IS DERIVED BY `settle_review`, NOT BY GUESSING. A first cut built
    `forms:<form-set>` keys itself and reported `queue-margin-118-281` as 0 of
    76 ruled on the evening John had just ruled all 76 — that queue keys its
    cards by SITE (`margin:page-132-L:15`), because one ruling there binds one
    place. A finished sitting shown as untouched is the false absence this page
    exists to prevent, committed by the counter meant to measure it.

    ⚠ AND A QUEUE THAT IS NOT ON DISK IS NOT A QUEUE WITH NOTHING LEFT. Queues
    are regenerable and gitignored, so they come and go; `None` for the count
    says the store was not found, and the caller must not render that as zero.
    """
    from .settle_review import cards_from_queue
    out = []
    for pattern in QUEUE_GLOBS:
        for q in sorted(glob.glob(str(ROOT / pattern))):
            path = Path(q)
            try:
                cards = cards_from_queue(path)
            except Exception:
                out.append({'queue': path.stem, 'cards': None, 'ruled': None,
                            'store': None})
                continue
            # the store a sitting writes to is named for the sitting, and the
            # queue's own name is the only thing that says which that is
            # ⚠ THE STORES ARE NAMED FOR THE SITTING, NOT FOR THE QUEUE, and the
            # old ones live in `work/sweeps` while the cold ones live in
            # `work/rulings`. A lookup that knew only one convention reported a
            # dozen finished sittings as outstanding, which would have put a
            # backlog of thousands on the page — every one of them answered
            # months ago. A queue this cannot pair is reported UNPAIRED and
            # counted in neither total; inventing a number for it is the whole
            # failure this page is against.
            tag = path.stem.replace('queue-', '')
            store = None
            for cand in (ROOT / f'work/rulings/cold-{tag}.json',
                         ROOT / f'work/rulings/{tag}.json',
                         ROOT / f'work/sweeps/{tag}-rulings.json',
                         ROOT / f'work/sweeps/{tag}.json'):
                if cand.exists():
                    store = cand
                    break
            ruled = None
            if store is not None:
                answered = set(json.loads(store.read_text(encoding='utf-8')))
                ruled = sum(1 for c in cards if c.sid in answered)
            else:
                # ⚠ NO STORE BY NAME IS NOT NO ANSWERS. `queue-118-281-rest` has
                # never been served and every card of it is outstanding; a dozen
                # sittings from earlier months have stores this cannot name and
                # every card of THEM is answered. Dropping both leaves the page
                # silent about 1,615 cards John still owes. So ask every store
                # whether it holds these sids, and let the answer say which kind
                # of queue this is.
                ruled = sum(1 for c in cards if c.sid in _every_ruled_sid())
            out.append({'queue': path.stem, 'cards': len(cards),
                        'ruled': ruled, 'sids': [c.sid for c in cards],
                        'store': store.name if store else None})
    return out


def backlog() -> tuple[int, int]:
    """(cards answered, cards outstanding) over DISTINCT cards.

    ⚠ THE SLICES ARE THE SAME CARDS. `queue-118-281` is the whole sitting and
    `-kai`, `-stigma`, `-ou`, `-rest` are cuts of it, so summing the rows counts
    every one of them twice and reported 9,318 cards where there are 5,543. A
    total over queues is a total over FILES; the thing being counted is
    questions, and a question is its sid.
    """
    answered = _every_ruled_sid()
    seen: set[str] = set()
    for row in queues():
        seen.update(row.get('sids') or ())
    return len(seen & answered), len(seen - answered)


def state() -> dict:
    applied = _pages(STAGES['reconciled'])
    settled = _pages(STAGES['reconciled-auto'])
    read_by = {k: _pages(v) for k, v in READERS.items()}
    everything = set().union(*read_by.values()) if read_by else set()
    # ⚠ THE RANGE FOLLOWS THE CORPUS. This called `findings()` bare, which
    # defaults to 53-62 — the ten pages that were live when the table was
    # written. Those settled on 2026-08-11, so the page went on reporting
    # "all 5 adjudicated" about a range nobody was working in while 63-102
    # was being adjudicated all day. A status page whose scope is frozen
    # stops being read, and stopping being read is indistinguishable from
    # being wrong.
    #
    # Reporting on EVERYTHING APPLIED cannot go stale: the span is derived
    # from the files, so it widens when the corpus does.
    lo, hi = (min(applied), max(applied)) if applied else (53, 62)
    found = findings(lo, hi)
    return {
        'readers': read_by,
        'applied': applied,
        'settled_unpromoted': settled,
        'read_not_transcribed': sorted(everything - applied - settled),
        'rulings': rulings(),
        'sweeps': SWEEPS,
        'range': (lo, hi),
        'findings': found,
        'adjudication': adjudication(lo, hi, counted=found),
        # Derived once here so the markdown and the HTML cannot disagree about
        # which sweeps are lagging the corpus.
        'stale': stale_sweeps(lo, hi),
        # cards John has answered / cards still waiting on him
        'backlog': backlog(),
    }


def _todo(s: dict) -> list[tuple[str, str]]:
    """What stands between here and finished, in the order it must happen."""
    out = []
    if s['settled_unpromoted']:
        out.append((f'promote {span(s["settled_unpromoted"])}',
                    'work/reconciled-auto → work/reconciled. John\'s call.'))
    rest = s['read_not_transcribed']
    if rest:
        out.append((f'adjudicate {span(rest)}',
                    'read by at least one reader, in no corpus stage yet'))
    return out


def markdown() -> str:
    s = state()
    L = ['<!-- GENERATED by bonitz_pipeline.dashboard — do not edit by hand. -->',
         '', '# Bonitz — where the transcription stands', '',
         'Derived from the files on disk, not from notes. Regenerate with',
         '`python3 -m bonitz_pipeline.dashboard --write`.', '',
         '## Pages', '',
         '| stage | pages |', '|---|---|',
         f'| adjudicated **and applied** | {span(s["applied"])} |',
         f'| settled, **not promoted** | {span(s["settled_unpromoted"])} |',
         f'| read but not transcribed | {span(s["read_not_transcribed"])} |',
         '', '## Cards', '',
         'A card is a reader disagreement, grouped so one answer settles every',
         'site that prints the same thing.', '',
         '| | cards |', '|---|---|',
         f'| **to rule** | {s["backlog"][1]} |',
         f'| answered | {s["backlog"][0]} |',
         '', '## Read by which reader', '', '| reader | pages |', '|---|---|']
    for k, v in s['readers'].items():
        L.append(f'| {k} | {span(v)} |')
    f, adj = s['findings'], s['adjudication']
    lo, hi = s['range']
    lagging = s['stale']
    L += ['', '## Sweeps', '',
          'A sweep that reads one corpus stage cannot report on a page held in',
          f'another. Seven of these were blind to 53-62 until 2026-08-11.', '',
          'A finding is **open** when it maps to no ruling. It is',
          '**adjudicated** when it sits at a site John has ruled — a `preserve`',
          'keeps what Bonitz printed, so the sweep goes on disagreeing with its',
          'authority and the finding stands for good.', '',
          f'| sweep | checks | reads every stage | {lo}-{hi} |',
          '|---|---|---|---|']
    for name, what, ok in s['sweeps']:
        kind, n_open, n_adj = cell_state(f.get(name), adj.get(name),
                                         name in lagging)
        cell = {'never run': 'never run', 'not counted': 'not counted',
                'stale': f'**stale** \u2014 report predates the corpus',
                'counter failed': '**counter failed**',
                'not mapped': f'{f.get(name)} · **not mapped**',
                BLIND: f'**blind** — '
                       f'{str(f.get(name)).split(": ", 1)[-1]}',
                'zero': '0'}.get(kind)
        if cell is None:
            cell = (f'all {n_adj} adjudicated' if kind == 'settled'
                    else f'**{n_open} open**'
                         + (f' · {n_adj} adjudicated' if n_adj else ''))
        L.append(f'| `{name}` | {what} | {"yes" if ok else "**no**"} | '
                 f'{cell} |')
    L += ['', '## Rulings recorded', '', '| store | rulings |', '|---|---|']
    for k, v in s['rulings'].items():
        L.append(f'| `{k}` | {v} |')
    todo = _todo(s)
    if todo:
        L += ['', '## Outstanding', '']
        for head, why in todo:
            L.append(f'- **{head}** — {why}')
    return '\n'.join(L) + '\n'


def html() -> str:
    """The same palette and faces as the review pages John already uses.

    Deliberately not a fresh visual identity: this is one more screen of the
    same tool, and `book_review`/`settle_review` already established the
    tokens — paper/ink/rule, amber for held, teal for done, red for wrong.
    Reusing them means a state reads the same here as it does on a card.
    """
    s = state()
    f, adj = s['findings'], s['adjudication']
    applied, settled = s['applied'], s['settled_unpromoted']
    lo, hi = s['range']
    lagging = s['stale']
    unread = s['read_not_transcribed']

    # ⚠ THE TILE SAID "FINDINGS TO REVIEW" AND MOST OF THEM WERE REVIEWED. The
    # red number is now the work that is actually left; what John has already
    # answered stands beside it, muted, because it is real and it is not a task.
    n_open = n_adj = n_unmapped = 0
    for name, hits in f.items():
        kind, a, b = cell_state(hits, adj.get(name), name in lagging)
        n_open, n_adj = n_open + a, n_adj + b
        if kind == 'not mapped':
            n_unmapped += hits
    beside = f'{n_adj} adjudicated' if n_adj else ''
    if n_unmapped:
        beside += f'{" · " if beside else ""}{n_unmapped} not mapped'

    def tile(n, label, tone, sub=''):
        return (f'<div class="tile {tone}"><div class="n">{n}</div>'
                f'<div class="l">{label}</div>'
                + (f'<div class="s">{sub}</div>' if sub else '')
                + '</div>')

    answered, outstanding = s['backlog']
    tiles = (tile(len(applied), 'pages applied', 'done')
             + tile(len(settled), 'settled, not promoted', 'held')
             + tile(n_open, 'findings open', 'open', beside)
             # ⚠ THE ONLY NUMBER HERE ABOUT WORK IN FRONT OF JOHN. Every card is
             # a reader disagreement, grouped so one answer settles every site
             # that prints the same thing.
             + tile(outstanding, 'cards to rule', 'open',
                    f'{answered} answered' if answered else '')
             + tile(len(unread), 'read, not transcribed', 'muted'))

    # One cell per page, coloured by how far it has come.
    #
    # ⚠ THE RANGE WAS TYPED IN, AND SO WAS THE HEADING ABOVE IT: `range(15, 172)`
    # under a heading that said "Pages 15-171". It was true when llamaparse was the
    # furthest reader. By 2026-08-28 kraken and calamari had read to 281 and
    # genie to 890, and the strip showed none of it — the page answered "how far
    # have we got" with a number frozen a fortnight earlier, on the one section
    # a reader looks at first. Derived from the same sets that colour the cells,
    # it cannot lag them.
    # ⚠ AND NO STRIP AT ALL RATHER THAN A ONE-CELL ONE. With every set empty the
    # fallback drew "Pages 15-15" over a single grey square for a page nothing
    # had ever touched — a picture of a corpus, made of nothing. Codex found it.
    seen = applied | settled | set(unread)
    first, last = (min(seen), max(seen)) if seen else (0, -1)
    cells = []
    for n in range(first, last + 1):
        klass = ('done' if n in applied else 'held' if n in settled
                 else 'raw' if n in set(unread) else 'none')
        cells.append(f'<i class="{klass}" title="p.{n}"></i>')
    ribbon = ''.join(cells)
    # ⚠ NO STRIP AT ALL RATHER THAN A ONE-CELL ONE. With every set empty the old
    # fallback drew "Pages 15-15" over a single grey square for a page nothing
    # had ever touched — a picture of a corpus, made of nothing. Codex found it.
    strip = '' if not cells else f'''<section>
<h2>Pages {first}–{last}</h2>
<div class="ribbon">{ribbon}</div>
<div class="key">
<span><b style="background:var(--fix)"></b>applied</span>
<span><b style="background:var(--keep)"></b>settled, not promoted</span>
<span><b style="background:var(--rule);opacity:.55"></b>read only</span>
<span><b style="background:var(--rule)"></b>untouched</span>
</div>
</section>'''

    sweep_rows = ''
    for name, what, ok in s['sweeps']:
        hits = f.get(name)
        kind, c_open, c_adj = cell_state(hits, adj.get(name), name in lagging)
        cell = {
            'stale': '<span class="pill wrong">stale \u2014 re-run</span>',
            'counter failed': '<span class="pill wrong">counter failed</span>',
            'not counted': '<span class="pill none">not counted</span>',
            'never run': '<span class="pill none">never run</span>',
            'not mapped': (f'<span class="pill hit">{hits}</span> '
                           f'<span class="pill none">not mapped</span>'),
            BLIND: ('<span class="pill wrong">blind</span> '
                    f'<span class="pill quiet">'
                    f'{str(hits).split(": ", 1)[-1]}</span>'),
            'zero': '<span class="pill zero">0</span>',
            'settled': (f'<span class="pill done">all {c_adj} '
                        f'adjudicated</span>'),
        }.get(kind, f'<span class="pill hit">{c_open} open</span>'
                    + (f' <span class="pill quiet">{c_adj} adjudicated</span>'
                       if c_adj else ''))
        state_pill = ('<span class="pill ok">every stage</span>' if ok
                      else '<span class="pill bad">one stage only</span>')
        sweep_rows += (f'<tr><td><code>{name}</code></td><td>{what}</td>'
                       f'<td>{state_pill}</td><td class="num">{cell}</td></tr>')

    reader_rows = ''.join(f'<tr><td>{k}</td><td class="mono">{span(v)}</td></tr>'
                          for k, v in s['readers'].items())
    ruling_rows = ''.join(f'<tr><td><code>{k}</code></td>'
                          f'<td class="num mono">{v}</td></tr>'
                          for k, v in s['rulings'].items())
    todo = ''.join(f'<li><b>{h}</b><span>{w}</span></li>' for h, w in _todo(s))

    from datetime import datetime
    _now = datetime.now().astimezone()
    built_iso = _now.isoformat(timespec='seconds')
    built = _now.strftime('%Y-%m-%d %H:%M')

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bonitz \u2014 transcription status</title>
<style>
:root{{--paper:#f7f6f2;--ink:#1a1d20;--rule:#d2d0c8;--muted:#6b6963;
--keep:#8a6516;--fix:#12595f;--warn:#9b2226;--plate:#fff}}
@media(prefers-color-scheme:dark){{:root{{--paper:#15181b;--ink:#e6e4de;
--rule:#2c3136;--muted:#918e86;--keep:#d3a64a;--fix:#63b8bc;--warn:#e07a5f;
--plate:#1a1e22}}}}
:root[data-theme=dark]{{--paper:#15181b;--ink:#e6e4de;--rule:#2c3136;
--muted:#918e86;--keep:#d3a64a;--fix:#63b8bc;--warn:#e07a5f;--plate:#1a1e22}}
:root[data-theme=light]{{--paper:#f7f6f2;--ink:#1a1d20;--rule:#d2d0c8;
--muted:#6b6963;--keep:#8a6516;--fix:#12595f;--warn:#9b2226;--plate:#fff}}
*{{box-sizing:border-box}}
body{{background:var(--paper);color:var(--ink);margin:0;padding:2.2rem 1.2rem 4rem;
font:16px/1.55 Charter,"Iowan Old Style",Georgia,serif}}
main{{max-width:58rem;margin:0 auto;display:flex;flex-direction:column;gap:2.2rem}}
h1{{font:600 1.5rem/1.2 Superclarendon,Rockwell,Georgia,serif;margin:0;
text-wrap:balance}}
h2{{font:600 .95rem/1.2 Superclarendon,Rockwell,Georgia,serif;margin:0 0 .7rem;
letter-spacing:.02em}}
.sub{{color:var(--muted);font-size:.88rem;margin:.35rem 0 0}}
section{{display:flex;flex-direction:column}}
.tiles{{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));
gap:.7rem}}
.tile{{background:var(--plate);border:1px solid var(--rule);border-radius:2px;
padding:.9rem 1rem;border-left-width:3px}}
.tile .n{{font:600 1.7rem/1 Superclarendon,Rockwell,Georgia,serif;
font-variant-numeric:tabular-nums}}
.tile .l{{color:var(--muted);font-size:.78rem;margin-top:.3rem;
text-transform:uppercase;letter-spacing:.05em}}
/* What John has already answered is real, and it is not a task. It sits in the
   tile, in the muted face, so the red number can mean only work outstanding. */
.tile .s{{color:var(--muted);font-size:.76rem;margin-top:.25rem;opacity:.85}}
.tile.done{{border-left-color:var(--fix)}} .tile.done .n{{color:var(--fix)}}
.tile.held{{border-left-color:var(--keep)}} .tile.held .n{{color:var(--keep)}}
.tile.open{{border-left-color:var(--warn)}} .tile.open .n{{color:var(--warn)}}
.tile.muted{{border-left-color:var(--rule)}} .tile.muted .n{{color:var(--muted)}}
.ribbon{{display:flex;flex-wrap:wrap;gap:2px}}
.ribbon i{{width:9px;height:16px;border-radius:1px;background:var(--rule)}}
.ribbon i.done{{background:var(--fix)}}
.ribbon i.held{{background:var(--keep)}}
.ribbon i.raw{{background:var(--rule);opacity:.55}}
.key{{display:flex;gap:1.1rem;flex-wrap:wrap;color:var(--muted);
font-size:.78rem;margin-top:.6rem}}
.key b{{display:inline-block;width:.7rem;height:.7rem;border-radius:1px;
margin-right:.35rem;vertical-align:-1px}}
.scroll{{overflow-x:auto}}
table{{border-collapse:collapse;width:100%;background:var(--plate);
border:1px solid var(--rule);font-size:.9rem}}
th{{font:600 .72rem/1 Superclarendon,Rockwell,Georgia,serif;
text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}}
td,th{{padding:.5rem .75rem;border-bottom:1px solid var(--rule);text-align:left}}
tr:last-child td{{border-bottom:none}}
td.num{{text-align:right;font-variant-numeric:tabular-nums}}
.mono,code{{font:.85em "SF Mono",Menlo,ui-monospace,monospace}}
.pill{{display:inline-block;padding:.12rem .5rem;border-radius:999px;
font:.72rem/1.5 "SF Mono",Menlo,monospace;border:1px solid currentColor}}
.pill.ok{{color:var(--fix)}} .pill.bad{{color:var(--warn);font-weight:700}}
.pill.hit{{color:var(--warn)}} .pill.zero{{color:var(--muted)}}
.pill.none{{color:var(--muted);opacity:.7}}
/* A row with nothing open is not the same as a row with nothing found, and it
   must not read as one: teal says answered, the grey zero says never disputed. */
.pill.done{{color:var(--fix);border-style:dashed}}
.pill.quiet{{color:var(--muted);border-color:var(--rule)}}
ul{{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;
gap:.5rem}}
li{{background:var(--plate);border:1px solid var(--rule);border-left:3px solid
var(--keep);border-radius:2px;padding:.6rem .85rem}}
li b{{display:block}} li span{{color:var(--muted);font-size:.86rem}}
footer{{color:var(--muted);font-size:.78rem;border-top:1px solid var(--rule);
padding-top:.8rem}}
</style></head><body><main>

<header>
<h1>Bonitz \u2014 where the transcription stands</h1>
<p class="sub">Every number read off the files themselves.
<span id="stamp" data-built="{built_iso}">Built {built}.</span></p>
<script>
// ⚠ A WRITTEN PAGE CANNOT SAY HOW OLD IT IS, SO IT SAYS IT HERE. docs/status.html
// stood 17 hours past the corpus it described on 2026-08-18 while presenting
// itself as current. Served by --serve this always reads "just now"; opened as a
// stale file it names its own age in the header instead of hiding it.
(function(){{var e=document.getElementById('stamp');
var age=(Date.now()-Date.parse(e.dataset.built))/6e4;
if(age>10){{e.textContent='Built '+e.dataset.built.slice(0,16).replace('T',' ')
+' \u2014 '+(age<120?Math.round(age)+' min':Math.round(age/60)+' h')+' ago. '
+'Run --serve for a page that cannot go stale.';e.style.color='var(--wrong)';}}}})();
</script>
</header>

<section><div class="tiles">{tiles}</div></section>

{strip}

<section>
<h2>Sweeps \u2014 findings on {lo}\u2013{hi}</h2>
<p class="sub">A sweep reading one corpus stage cannot report on a page held in
another. Seven of these were blind to 53\u201362 until 2026-08-11.</p>
<p class="sub"><b>Open</b> means the finding maps to no ruling.
<b>Adjudicated</b> means it sits where John has already ruled \u2014 and a
<i>preserve</i> keeps what Bonitz printed, so the sweep goes on disagreeing with
its authority and the finding stands for good.</p>
<div class="scroll"><table>
<tr><th>sweep</th><th>checks</th><th>coverage</th><th>{lo}\u2013{hi}</th></tr>
{sweep_rows}</table></div>
</section>

<section>
<h2>Read by which reader</h2>
<div class="scroll"><table>{reader_rows}</table></div>
</section>

<section>
<h2>Rulings recorded</h2>
<div class="scroll"><table>{ruling_rows}</table></div>
</section>

<section><h2>Outstanding</h2><ul>{todo}</ul></section>

<footer>Corpus stages: <code>work/reconciled</code> (applied) and
<code>work/reconciled-auto</code> (settled, awaiting promotion).</footer>
</main></body></html>
"""


def serve(port: int = 8790) -> int:
    """Serve the page, rebuilt on every request.

    ⚠ THIS REMOVES THE STALENESS RATHER THAN SCHEDULING AROUND IT. `--write`
    stamps a file that then claims to be the state of the transcription until
    someone remembers the command again; on 2026-08-18 that file stood 17 hours
    past the work it described, and nothing on it said so. A page computed when
    it is asked for has no cached artifact that can go out of date.

    ⚠ AND THE LINE CACHE MUST GO WITH IT. `merge_review._LINES` holds every
    column it has read, keyed by page and side, which is right for a one-shot
    command and wrong for a process that outlives an edit. Left alone, a server
    would answer from the corpus as it stood when it started — the same failure
    in a new place. It is cleared per request.

    Binds to 127.0.0.1 only, like the review servers.
    """
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import traceback
    from . import merge_review as mr

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.split('?')[0] not in ('/', '/index.html',
                                               '/status.html'):
                self.send_error(404)
                return
            mr._LINES.clear()
            try:
                page = html().replace(
                    '</head>',
                    '<meta http-equiv="refresh" content="60"></head>', 1)
                code = 200
            except Exception:
                # ⚠ A STATUS PAGE THAT FAILS BLANK IS WORSE THAN NO PAGE. Show
                # the traceback: an empty screen reads as "nothing to report".
                page = ('<!doctype html><meta charset="utf-8">'
                        '<h1>dashboard failed to build</h1><pre>'
                        + traceback.format_exc() + '</pre>')
                code = 500
            body = page.encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = HTTPServer(('127.0.0.1', port), Handler)
    print(f'status on http://127.0.0.1:{port}/  (rebuilt on every request; '
          f'the page refreshes itself every 60s)\nCtrl-C to stop')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--serve', action='store_true',
                    help='serve on 127.0.0.1, rebuilt on every request')
    ap.add_argument('--port', type=int, default=8790)
    a = ap.parse_args(argv)
    if a.serve:
        return serve(a.port)
    if a.write:
        MD.parent.mkdir(parents=True, exist_ok=True)
        MD.write_text(markdown(), encoding='utf-8')
        HTML.write_text(html(), encoding='utf-8')
        print(f'wrote {MD}\nwrote {HTML}')
    else:
        print(markdown())
    return 0


if __name__ == '__main__':
    sys.exit(main())
