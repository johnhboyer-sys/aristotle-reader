"""Where a mis-cited quotation actually is.

`quotecheck` says a citation's Greek does not occur at the line cited.  That is
a finding and not yet a fix, and the difference matters: a reader handed "this
is wrong" must go and look, while a reader handed "it is at 192a17, one digit
away" has only to agree.

We hold every Bekker line of the corpus we have text for — 89,726 of them — so
the question "where DOES this passage occur?" is a substring search, and it
answers with an address.

    Bonitz prints   Φα9. 191a17
    the phrase is at  Phys 192a17
    one digit, and the line number was right all along

⚠ ABSENCE IS NOT AN ERROR.  Bonitz quoted Bekker; our text follows a critical
edition, and where an editor has adjusted the text a passage may genuinely not
be there to find.  He also does not always quote — much of the index is
analytical, and Latin glosses have no Greek to locate.  So this reports only
what it CAN place, and says nothing about the rest.  A locator that guessed
would be worse than one that shrugged.

    python3 -m bonitz_pipeline.locate --pages 15-52
"""

from __future__ import annotations
import argparse
import bisect
import glob
import json
import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

from bonitz_pipeline.siglum_check import CITE, inventory, read, resolve

ROOT = Path(__file__).resolve().parent.parent
DIST = Path('/Users/johnboyer/Developer/aristotle-reader/build/dist')
MIN_WORDS = 3          # shorter than this and a match proves nothing


def strip(s: str) -> str:
    s = s.replace('ȣ', 'ου').replace('ϗ', 'και')
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'[^α-ω\s]+', ' ', s)


@lru_cache(maxsize=1)
def index() -> tuple[str, list, list]:
    """The corpus as one stream, with every Bekker line addressable in it."""
    rows = []
    for p in sorted(glob.glob(str(DIST / '*/book-*.json'))):
        work = Path(p).parent.name
        for seg in json.loads(Path(p).read_text(encoding='utf-8')).get('segments', []):
            for g in seg.get('greek', []):
                rows.append((work, seg['column'], g['n'],
                             ' '.join(strip(g['text']).split()),
                             ' '.join(g['text'].split())))
    stream, offs, starts, pos = [], [], [], 0
    for work, col, n, text, raw in rows:
        offs.append((work, col, n, raw))
        starts.append(pos)
        stream.append(text)
        pos += len(text) + 1
    return ' '.join(stream), starts, offs


def address(i: int) -> tuple[str, str, int, str]:
    _, starts, offs = index()
    return offs[bisect.bisect_right(starts, i) - 1]


def marks_agree(bonitz: str, found: str) -> bool:
    """Do the two readings carry the same diacritics, not merely the same letters?

    ⚠ A UNIQUE MATCH UNDER A LOSSY KEY IS STILL A GUESS. Grok, 2026-08-10:
    Bonitz prints `ἡ ἀρχὴ ἢ κινȣ͂σα` — the principle OR the moving — and
    `strip()` collapses ἢ and ἡ to the same `η`, so it matched GA 788a5, which
    reads `ἡ ἀρχὴ ἡ κινοῦσα`. Different Greek, same skeleton, and the match was
    manufactured by our own normalisation.

    Bonitz's accents are his own and our text follows a different edition, so
    they will not agree everywhere — but a proposal shown to a reader as a FIX
    must at least agree on the marks it does carry. Where they differ, the
    locator has found a lookalike and should say nothing.
    """
    a = [c for c in unicodedata.normalize('NFD', bonitz) if unicodedata.combining(c)]
    b = [c for c in unicodedata.normalize('NFD', found) if unicodedata.combining(c)]
    return a == b


def quoted(line: str, at: int) -> tuple[str, str]:
    """(stripped, as printed) — the Greek a citation is a citation OF."""
    head = line[:at]
    cut = 0
    for m in re.finditer(r'[.;·]|[A-Za-z]{2,}', head):
        cut = m.end()
    raw = head[cut:]
    return ' '.join(strip(raw).split()), ' '.join(raw.split())


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--pages', default='15-52')
    p.add_argument('--show', type=int, default=30)
    a = p.parse_args(argv)
    lo, _, hi = a.pages.partition('-')
    rng = range(int(lo), int(hi or lo) + 1)

    stream, _, _ = index()
    works = inventory()
    cites = read(rng)
    resolve(cites, works)

    checked = right = moved = unplaceable = unverified = 0
    near, far = [], []
    for c in cites:
        lines = (ROOT / f'work/reconciled/{c.col}.txt').read_text(
            encoding='utf-8').splitlines()
        # ⚠ A QUOTATION WRAPS THE COLUMN. Codex, 2026-08-10: `quoted()` was
        # handed one physical line, so a quotation beginning on the previous
        # line and ending before this citation was cut — often below the
        # three-word minimum, and the citation then skipped in silence. Same
        # defect as the 790 citations hidden by line-at-a-time reading.
        #
        # The PREVIOUS line is prepended and the offset shifted to match, so a
        # quotation that runs across the break is seen whole. The break itself
        # is not a boundary: Bonitz's measure ran out, he did not stop quoting.
        prev = lines[c.line - 2] if c.line > 1 else ''
        joined = (prev + ' ' + lines[c.line - 1]) if prev else lines[c.line - 1]
        shift = len(prev) + 1 if prev else 0
        q, q_raw = quoted(joined, c.at + shift)
        if len(q.split()) < MIN_WORDS:
            continue
        checked += 1
        # the last few words are the ones nearest the citation, so the most
        # likely to be what it points at
        # ⚠ ONLY A UNIQUE PHRASE GIVES AN ADDRESS. Taking the FIRST occurrence
        # proposed 79a21 for `ως επι το πολυ` — one of Aristotle's commonest
        # phrases, occurring everywhere including, very probably, the line
        # Bonitz actually cites. A locator that answers for a phrase it cannot
        # pin is not locating anything; it is guessing with a page number
        # attached, which is worse than silence because it looks like evidence.
        #
        # So the probe grows until the phrase is unique, and if it never is,
        # this citation is left alone.
        words = q.split()
        i = -1
        for take in range(4, min(len(words), 9) + 1):
            probe = ' '.join(words[-take:])
            first = stream.find(f' {probe} ')
            if first < 0:
                break
            if stream.find(f' {probe} ', first + 1) < 0:
                i = first
                break
        if i < 0:
            unplaceable += 1
            continue
        work, col, n, found_raw = address(i + 1)
        # ⚠ VERIFY THE MARKS BEFORE PROPOSING ANYTHING. The stripped key found
        # it; only the accents can say it is the same passage.
        take = len(probe.split())
        bw = q_raw.split()[-take:] if len(q_raw.split()) >= take else []
        fw = [w for w in found_raw.split()]
        if not bw or not any(marks_agree(' '.join(bw), ' '.join(fw[j:j + take]))
                             for j in range(max(1, len(fw) - take + 1))):
            unverified += 1
            continue
        if col.rstrip('ab') == str(c.page) and col[-1] == c.column:
            right += 1
        else:
            # ⚠ A RELOCATION ACROSS WORKS IS ALMOST CERTAINLY NOT ONE. Bonitz
            # misreads a digit far more readily than he misattributes a work,
            # and a phrase unique in the corpus can still be a coincidence or a
            # paraphrase rather than the passage he meant. `Ζιγ11. 518b` (Hist.
            # an.) "found" at Politics 1290b22 is not a citation error; it is
            # the locator over-reaching. Only a move INSIDE the cited work is
            # proposed; the rest are reported apart and claimed for nothing.
            same = works[c.work].holds(int(re.sub(r'\D', '', col))) if c.work in works else False
            (near if same else far).append(
                (c.col, c.line, c.raw, f'{col}{n}', probe, work))
            moved += 1
    print(f'pages {a.pages}: {checked:,} citations carry {MIN_WORDS}+ words of Greek\n')
    print(f'  {right:>5,} the quotation is where Bonitz says')
    print(f'  {len(near):>5,} elsewhere INSIDE the work cited — an address to propose')
    print(f'  {len(far):>5,} elsewhere in ANOTHER work — reported, claimed for nothing')
    print(f'  {unverified:>5,} letters matched but the DIACRITICS did not — a lookalike')
    print(f'  {unplaceable:>5,} not found in our text (edition, or not a quotation)\n')
    for col, ln, raw, found, probe, w in near[:a.show]:
        print(f'  {col}:{ln:<4} {raw:<16} -> {w} {found:<10} {probe[:36]}')
    if len(near) > a.show:
        print(f'  … and {len(near) - a.show:,} more')
    return 0


if __name__ == '__main__':
    sys.exit(main())
