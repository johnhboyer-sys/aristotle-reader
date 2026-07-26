"""
Alphabetical-order check.

Bonitz is an index, so its headwords run in strict alphabetical order. That
makes a misread headword detectable with no lexicon, no scan and no model —
which matters, because it is the one error class nothing else here can see.
A whole ἁλουργ- entry sat wrong fifteen times partly because it was
self-consistent: every reader agreed, every form was equally wrong, and no
attestation test could fire until the ligature was fixed first.

Headwords are not recoverable from the reconciled text — it is flush-left
running text with no markup — so candidates come from LlamaParse's bold
runs, which are structural but noisy (it bolds the odd citation, and misses
entries). The check is therefore framed to tolerate bad candidates: it
reports ORDER VIOLATIONS for review, not a claim about what every headword
is. A candidate that sorts before its predecessor is either a misread
headword or a bad candidate, and both are worth a human glance.

  python3 -m bonitz_pipeline.alphacheck --pages 15-51
"""

from __future__ import annotations
import argparse
import glob
import re
import unicodedata
from pathlib import Path

from .batch3 import ROOT, parse_pages
from .lexcheck import bare, nfc

BOLD_RE = re.compile(r'\*\*([^*\n]+)\*\*')
GREEK_RE = re.compile(r'[Ͱ-Ͽἀ-῿]')

# Sort key: the alphabet Bonitz actually orders by — accents and breathings
# ignored, final sigma folded, and the ou-ligature spelled out so that ἀκολȣθ-
# files where ἀκολουθ- belongs rather than after ω.
ALPHABET = 'αβγδεζηθικλμνξοπρστυφχψω'
RANK = {c: i for i, c in enumerate(ALPHABET)}


def sort_key(word: str) -> list[int]:
    w = bare(word.replace('ȣ', 'ου').replace('Ȣ', 'ου')).replace('ς', 'σ')
    return [RANK.get(c, len(ALPHABET)) for c in w]


def candidates(page: int) -> list[str]:
    """Bold runs from LlamaParse that could be a headword."""
    path = ROOT / f'raw/llamaparse/page-{page:03d}.md'
    if not path.exists():
        return []
    out = []
    for raw in BOLD_RE.findall(nfc(path.read_text(encoding='utf-8'))):
        w = raw.strip().strip('.,;:·')
        # a headword is one Greek word: no digits (citations), no spaces
        if not w or ' ' in w or any(c.isdigit() for c in w):
            continue
        if not GREEK_RE.match(unicodedata.normalize('NFD', w)[0]):
            continue
        out.append(w)
    return out


def reconciled_headwords(page: int) -> list[tuple[str, str, int]]:
    """(word, col, line) for each headword, read from OUR text.

    LlamaParse's bold only says WHERE a headword is; it must not say what it
    says. Sorting its own readings audits LlamaParse — page 39's ἀκύσιος
    family are its errors, while our columns have ἀκȣ́σιος correctly. So take
    each bold run, find the line-initial word it points at in the reconciled
    column, and sort that.
    """
    import difflib
    lines = []
    for col in ('L', 'R'):
        p = ROOT / f'work/reconciled/page-{page:03d}-{col}.txt'
        if p.exists():
            text = nfc(p.read_text(encoding='utf-8')).splitlines()
            for i, line in enumerate(text, 1):
                # the tail of a hyphen-broken word is not a headword, and it
                # sorts as gibberish (μένως, δρῶς) if allowed to be one
                if i > 1 and text[i - 2].rstrip().endswith('-'):
                    continue
                first = re.match(r'[^\W\d_]+', line.lstrip('— '), re.UNICODE)
                if first:
                    lines.append((first.group(), col, i))
    out, used = [], set()
    for cand in candidates(page):
        key = bare(cand)
        best, score = None, 0.0
        for j, (w, col, ln) in enumerate(lines):
            if j in used:
                continue
            r = difflib.SequenceMatcher(None, key, bare(w)).ratio()
            if r > score:
                best, score = j, r
        if best is not None and score >= 0.7:
            used.add(best)
            out.append(lines[best])
    return out


def scan(pages: list[int]) -> list[dict]:
    """Candidates that cannot belong to the alphabetical run.

    Comparing each word to its predecessor, or to the highest word so far,
    both cascade: one bad candidate then indicts every good headword after
    it. Instead take the longest non-decreasing subsequence — the largest
    set of candidates that CAN all be in order — and report the complement.
    A single misplaced word is then reported alone, as it should be.
    """
    seq = [(p, w, sort_key(w), col, ln)
           for p in pages for (w, col, ln) in reconciled_headwords(p)]
    if not seq:
        return []
    # O(n^2) is ample at ~800 headwords and keeps the reconstruction simple
    n = len(seq)
    length = [1] * n
    prev = [-1] * n
    for i in range(n):
        for j in range(i):
            if seq[j][2] <= seq[i][2] and length[j] + 1 > length[i]:
                length[i], prev[i] = length[j] + 1, j
    end = max(range(n), key=lambda i: length[i])
    keep = set()
    while end != -1:
        keep.add(end)
        end = prev[end]

    out = []
    for i, (p, w, _, col, ln) in enumerate(seq):
        if i in keep:
            continue
        before = next((seq[j][1] for j in range(i + 1, n) if j in keep), None)
        after = next((seq[j][1] for j in range(i - 1, -1, -1) if j in keep), None)
        out.append({'page': p, 'col': col, 'line': ln, 'word': w,
                    'after': after, 'before': before})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    args = ap.parse_args()
    pages = parse_pages(args.pages)
    n_cand = sum(len(reconciled_headwords(p)) for p in pages)
    v = scan(pages)
    for x in v:
        print(f"  page-{x['page']:03d}-{x['col']}:{x['line']:<3} {x['word']:20} "
              f"out of run [{x['after']} … {x['before']}]")
    print(f'{len(v)} order violations in {n_cand} headword candidates')


if __name__ == '__main__':
    main()
