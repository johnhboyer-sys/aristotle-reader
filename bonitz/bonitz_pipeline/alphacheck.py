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
from functools import lru_cache
from pathlib import Path
from xml.etree import ElementTree as ET

from .batch3 import ROOT, parse_pages
from .normalize import corpus_column, corpus_columns
from .lexcheck import bare, nfc
from .filter_kraken_lines import parse_alto_lines

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


# --- which lines can START an entry ----------------------------------------
#
# Bonitz sets entries with a hanging indent: the headword line reaches the
# left margin, continuation lines are indented ~an em, and the rare sub-lemma
# paragraph (— ἀντεστραμμένος under ἀντιστρέφειν) is indented deeper still.
# The left margin itself cannot anchor the classification — a column dense
# with one-line entries has MOSTLY entry lines, a column inside a giant entry
# has none, and no per-column statistic tells those apart. The right margin
# can: the type is justified, so every full line ends at the same x, and the
# distance s from the right margin back to a line's start is the typographic
# measure — constant across the whole book. Measured over every paired column
# of both trees (mode-of-ends as the margin, so a gutter digit swallowed into
# a line's END cannot drag it), s is bimodal with the same centers
# everywhere: continuations at 1230-1260, entries ~55 px further out at
# 1290-1320, a near-empty valley between. Which cluster DOMINATES a column
# varies — 171 of 172 paired columns are continuation-heavy, page-074-R is
# entry-heavy — but the absolute bands say which is which, and the entry
# threshold then sits in the column's own valley, immune to the ±15 px of
# per-column skew and crop jitter.
#
# The geometry comes from the kraken training pair (work/{tree}/gt/*.xml),
# which already solved the hard parts: marginal line numbers filtered,
# furniture dropped, the reconciled text injected beside each baseline. gt
# omits lines — digit-contaminated, damaged, stubs — and pairing.json's
# `excluded` list UNDERSTATES the omissions (068-R's gt skips the stub line
# `καμπτος.` that no list records), so counting lines cannot map gt rows to
# corpus lines: the mapping is verified TEXT BY TEXT against the corpus,
# every row. Unmapped lines are recovered from the raw seg where the y-order
# is unambiguous. Columns with no PageXML gt fall back to the ALTO read at
# work/kraken400/read/alto-r5 (same matching, same thresholds). That tree is
# model-derived segmentation of an OCR read, not a hand-checked gt pairing —
# `_GEOMETRY_SOURCE` records which tree was measured, because geometry-from-gt
# and geometry-from-read are not the same claim. A column neither tree can
# map stays unknown (empty dict) and `reconciled_headwords` uses textual rules.

_TREES = ('kraken400', 'kraken-cold')
_ALTO_R5 = ROOT / 'work' / 'kraken400' / 'read' / 'alto-r5'


def _alto_trees() -> list[Path]:
    """Every ALTO read that can stand in for a gt pairing, best-known first.

    ⚠ ONE HARDCODED TREE MEANT THE SWEEP WENT BLIND BESIDE A READ IT COULD HAVE
    USED. This named `alto-r5` alone. That tree was deleted on 2026-08-28 and
    103-117 lost its geometry — while `work/kraken15-102/alto107-112` and
    `alto113-117`, a round-6 read of the very same columns, sat on disk
    untouched. Fourteen citation sigla on page 109 were reported as headwords
    out of order for want of a directory name.

    ⚠ AND alto-r5 STAYS FIRST. It is the tree every measurement on 15-117 was
    taken against; if it is ever rebuilt, this must go on answering exactly as
    it did, and the round-6 trees must not silently displace it. Whichever is
    used is written to `_GEOMETRY_SOURCE`, because geometry from round 5 and
    geometry from round 6 are not the same claim either.

    Globbed, not listed: the next tranche's read arrives as another `alto*`
    directory beside these, and a list here would have to be remembered.
    """
    trees = [_ALTO_R5]
    trees += sorted(p for p in (ROOT / 'work' / 'kraken15-102').glob('alto*')
                    if p.is_dir())
    return trees


def geometry_missing(pages: list[int], yielded: bool = False) -> list[str]:
    """Columns `entry_starts` can measure nothing for.

    ⚠ A COLUMN WITH NO GEOMETRY IS NOT A COLUMN WITH NO INDENT. `entry_starts`
    returns {} and the caller falls back to textual rules, which cannot see a
    sub-lemma opening after a period. The sweep then reads citation sigla as
    headwords and reports violations that are not in the book.

    On 2026-08-28 the round-5 ALTO was deleted and 103-117 lost the only
    geometry it had: over the same corpus this sweep went from 3 findings to
    18, and 15 of the 18 sat in those columns — `Ζγα`, `Οβ`, `Πθ`, fourteen of
    them on page 109 alone. So anything that COUNTS this sweep has to be able
    to ask first, or it publishes the deletion as a finding about Bonitz.

    ⚠ IT ASKS WHETHER THE EVIDENCE IS ON DISK, NOT WHETHER THE MEASUREMENT
    SUCCEEDED, AND THE DIFFERENCE MATTERS BOTH WAYS. A column whose crop ate
    the outdent — 016-L, and 109-L, where even the continuations sit 15 px from
    the edge — has its ALTO and is REFUSED by `entry_starts` on the evidence.
    That is a considered answer this project has always accepted, and the tests
    pin the sweep's output with those columns already refusing. Widening this to
    "yielded no geometry" reads 19 columns instead of 11 and leaves the count
    withheld for good, which is its own false report: a page that never gives a
    number cannot go stale, and cannot say anything either.

    So: a missing FILE is a hole someone dug, and it gates the count. A refusal
    is the sweep working.

    `yielded=True` asks the other question instead — which columns come back
    with nothing measured, refusals included. That is the honest denominator for
    a sentence about what the sweep could see, and the caller states which of
    the two numbers it is quoting.
    """
    out = []
    for page in pages:
        for col in ('L', 'R'):
            stem = f'page-{page:03d}-{col}'
            if yielded:
                try:
                    if entry_starts(page, col):
                        continue
                except ValueError:
                    pass             # a stale pair measures nothing either
                out.append(stem)
                continue
            if any((ROOT / 'work' / t / 'gt' / f'{stem}.xml').exists()
                   for t in _TREES):
                continue
            if any((tree / f'{stem}.xml').exists() for tree in _alto_trees()):
                continue
            out.append(stem)
    return out
# (page, col) -> 'kraken400/gt' | 'kraken-cold/gt' | 'kraken400/read/alto-r5'
# | 'kraken15-102/alto107-112' | any other round-6 tree `_alto_trees` finds
# Populated by `entry_starts` when it actually measures. Absent means the
# column was never seen, not that it has no headwords.
_GEOMETRY_SOURCE: dict[tuple[int, str], str] = {}
# The measured absolute bands for a column's dominant cluster, shared by both
# trees (same scans, same 400 dpi render). `entry_starts` raises on a column
# whose dominant cluster fits neither: that is a different render, and the
# constants would be lying about it.
_CONT_BAND = (1220, 1265)
_ENTRY_BAND = (1290, 1330)
_PAGE_NS = {'p': 'http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15'}


def _flat(line: str) -> str:
    """A line with its spacing removed, for comparison against gt.

    The pair normalizes Bekker spacing before injecting text (John's 2026-08-06
    ruling: `1456 b27` -> `1456b27`), so gt and corpus disagree on spaces
    wherever the diplomatic record kept them. Spacing carries no identity;
    strip it from both sides.
    """
    return line.replace(' ', '')


def _pagexml_lines(gt: Path) -> list[tuple[str, int, int, int]]:
    """(text, x, y, x_end) from a PAGE TextLine's Baseline points."""
    gl = []
    for tl in ET.parse(gt).getroot().iter(
            '{%s}TextLine' % _PAGE_NS['p']):
        bl = tl.find('p:Baseline', _PAGE_NS)
        uni = tl.find('.//p:Unicode', _PAGE_NS)
        if bl is None or uni is None or not uni.text:
            continue
        first, last = bl.get('points').split()[0], \
                      bl.get('points').split()[-1]
        gl.append((nfc(uni.text),
                   int(first.split(',')[0]),
                   int(first.split(',')[1]),
                   int(last.split(',')[0])))
    return gl


def _alto_lines(alto: Path) -> list[tuple[str, int, int, int]]:
    """(text, x, y, x_end) from ALTO: left edge is hpos, right is hpos+width."""
    gl = []
    for line in parse_alto_lines(alto):
        if not line['content']:
            continue
        gl.append((nfc(line['content']),
                   line['hpos'],
                   int(line['by']),
                   line['hpos'] + line['width']))
    return gl


@lru_cache(maxsize=None)
def entry_starts(page: int, col: str) -> dict[int, bool]:
    """{corpus line -> starts an entry?} for the lines the pair reached.

    A line absent from the dict is UNKNOWN, not settled either way — the
    caller must fall back to textual signals, never treat absence as an
    answer. Empty dict when the column never paired (057-L, 073-R, 093-R)
    and no ALTO geometry could be mapped. RAISES when gt exists but most
    of its lines no longer appear in the corpus: that is a stale pair, and
    classifying against it would be geometry about a text that no longer
    exists. `_GEOMETRY_SOURCE[(page, col)]` says which tree was measured.
    """
    stem = f'page-{page:03d}-{col}'
    gl: list[tuple[str, int, int, int]] = []
    recover_seg: Path | None = None
    source: str | None = None
    paired = False
    for tree in _TREES:
        gt = ROOT / 'work' / tree / 'gt' / f'{stem}.xml'
        if not gt.exists():
            continue
        gl = _pagexml_lines(gt)
        recover_seg = ROOT / 'work' / tree / 'seg' / f'{stem}.xml'
        source = f'{tree}/gt'
        paired = True
        break
    else:
        # No PageXML gt for this column. An ALTO read is model-derived
        # segmentation, not a hand-checked gt pairing — the tree that answered
        # is recorded below so a later reader can tell geometry-from-gt from
        # geometry-from-read, and round 5 from round 6.
        for tree in _alto_trees():
            alto = tree / f'{stem}.xml'
            if alto.exists():
                gl = _alto_lines(alto)
                source = str(tree.relative_to(ROOT / 'work'))
                break
    p = corpus_column(page, col, required=False)
    if p is None or not gl:
        return {}
    corpus = nfc(p.read_text(encoding='utf-8')).splitlines()
    # Map each gt line to its corpus line by TEXT, not by position —
    # neither pairing.json's `excluded` list nor the gt file's own line
    # order is a reliable record of which corpus lines it holds (068-R's
    # gt omits lines no list records AND carries a run out of print
    # order). A gt line whose text is not unique in the column, or that
    # nothing matches, is simply left unknown.
    import difflib
    by_flat: dict[str, list[int]] = {}
    for i, line in enumerate(corpus, 1):
        by_flat.setdefault(_flat(line), []).append(i)
    found, ends, leftover = {}, [], []
    for t, x, y, e in gl:
        hits = by_flat.get(_flat(t), [])
        if len(hits) == 1:
            found[hits[0]] = (x, y)
            ends.append(e)
        else:
            leftover.append((t, x, y, e))
    for t, x, y, e in leftover:               # corrected lines drift from
        best, score = None, 0.0               # the gt snapshot: fuzzy
        if len(_flat(t)) < 15:
            continue
        for i, line in enumerate(corpus, 1):
            if i in found:
                continue
            r = difflib.SequenceMatcher(None, _flat(t),
                                        _flat(line)).ratio()
            if r > score:
                best, score = i, r
        if best is not None and score >= 0.85:
            found[best] = (x, y)
            ends.append(e)
    if len(found) < len(gl) - max(2, len(gl) // 8):
        if not paired:
            # ALTO extras are phantom OCR lines, not a stale gt pair.
            # Cannot map reliably: unknown, never "no headwords".
            return {}
        raise ValueError(
            f'{stem}: only {len(found)} of {len(gl)} gt lines still '
            f'appear in the corpus — stale pair, re-run kraken_corpus '
            f'pair before trusting geometry from it')
    right = _mode10(ends) + 5
    s = {n: right - x for n, (x, _) in found.items()}
    c = _mode10(s.values())
    if _CONT_BAND[0] <= c <= _CONT_BAND[1]:
        # +28, not the ~55 px a full em suggests: the hand-set indent
        # runs shallow on some pages (052-L outdents ἀμφισβητεῖν by
        # 31 px, 050-R Ἄμμων by 33) and a threshold at the tree-wide
        # valley reads those real headwords as continuations.
        entry_at, suspect_at = c + 28, c + 100
        # Some crops cut into the outdent zone, so an entry line's
        # baseline is truncated to the image edge and its measure falls
        # short of entry_at (056-R: entries at x=2 against continuations
        # at 27). A line AT the edge of such a crop can only be an
        # outdent. When even the continuations sit within 25 px of the
        # edge (016-L), the crop ate the whole distinction: no geometry.
        if right - c < 25:
            return {}
    elif _ENTRY_BAND[0] <= c <= _ENTRY_BAND[1]:
        entry_at, suspect_at = c - 20, c + 45
    else:
        raise ValueError(
            f'{stem}: dominant line-start cluster at {c} px from the '
            f'right margin fits neither the continuation band '
            f'{_CONT_BAND} nor the entry band {_ENTRY_BAND} — this is '
            f'not the calibrated 400 dpi render, re-measure before '
            f'trusting geometry from it')
    if recover_seg is not None:
        _recover_excluded(recover_seg, found, len(corpus), right, s)
    if source is not None:
        _GEOMETRY_SOURCE[(page, col)] = source
    return {n: v >= entry_at or right - v <= 8
            for n, v in s.items() if v < suspect_at}


def _mode10(values) -> int:
    """The busiest 10 px bin — the robust center of the dominant cluster."""
    bins: dict[int, int] = {}
    for v in values:
        bins[v // 10 * 10] = bins.get(v // 10 * 10, 0) + 1
    return max(bins, key=lambda k: bins[k])


def _recover_excluded(seg: Path, found: dict, total: int, right: int,
                      s: dict) -> None:
    """Fill measures for the corpus lines gt excluded, from the raw seg.

    Every gt line IS a seg line (pair injects text into the segmenter's own
    tree), so walking the y-sorted seg past each known line in order leaves,
    in each gap, the seg lines for the corpus numbers between — plus any
    marginal digit or furniture line the pair dropped there. Only a gap whose
    leftover count matches its missing-number count is trusted; a swallowed
    digit drags a baseline into the far margin, past the suspect threshold,
    where `entry_starts` discards it as unknown rather than reading it as an
    outdent.
    """
    if not seg.exists() or len(found) == total:
        return
    pts = []
    for m in re.finditer(r'<Baseline points="(-?\d+),(-?\d+)', seg.read_text()):
        pts.append((int(m.group(2)), int(m.group(1))))       # (y, x)
    pts.sort()
    known = sorted(found)                                    # corpus numbers
    i = 0
    prev_n = 0
    for n in known + [total + 1]:
        gap = []
        if n <= total:
            target = (found[n][1], found[n][0])
            while i < len(pts) and pts[i] != target:
                gap.append(pts[i])
                i += 1
            if i == len(pts):                                # known line not
                return                                       # in seg: bail
            i += 1
        else:
            gap = pts[i:]
        missing = [m for m in range(prev_n + 1, n) if m not in found]
        if len(gap) == len(missing):
            for m, (y, x) in zip(missing, gap):
                s[m] = right - x
        prev_n = n


def reconciled_headwords(page: int) -> list[tuple[str, str, int]]:
    """(word, col, line) for each headword, read from OUR text.

    LlamaParse's bold only says WHERE a headword is; it must not say what it
    says. Sorting its own readings audits LlamaParse — page 39's ἀκύσιος
    family are its errors, while our columns have ἀκȣ́σιος correctly. So take
    each bold run, find the line-initial word it points at in the reconciled
    column, and sort that.

    Bold marks more than headwords: Bonitz prints in-entry forms of the lemma
    (τὰ μὴ ἀναπνευστικά under ἀναπνευστικός) and dash sub-lemmata (— ἀνυστός
    under ἀνύειν) in the same face, so a line-initial word inside an entry can
    take a bold run and enter the sort as a fake headword — every 2026-08-20
    alphacheck flag but two was this. A headword is what STARTS an entry, so
    only entry-start lines join the pool: by the print's hanging indent where
    the pair has geometry (`entry_starts`), and where it does not, a line
    cannot start an entry if it is dash-appended (Bonitz's sub-lemma
    convention, the dash on this line or hanging off the previous one) or if
    the previous line ends mid-clause — entries end with a citation's period
    or a closing parenthesis.
    """
    import difflib
    lines = []
    for col in ('L', 'R'):
        p = corpus_column(page, col, required=False)
        if p is not None:
            geo = entry_starts(page, col)
            text = nfc(p.read_text(encoding='utf-8')).splitlines()
            for i, line in enumerate(text, 1):
                # the tail of a hyphen-broken word is not a headword, and it
                # sorts as gibberish (μένως, δρῶς) if allowed to be one
                if i > 1 and text[i - 2].rstrip().endswith('-'):
                    continue
                if line.lstrip().startswith('—'):
                    continue
                if i > 1 and text[i - 2].rstrip().endswith('—'):
                    continue
                starts = geo.get(i)
                if starts is False:
                    continue
                if starts is None and i > 1 and \
                        not text[i - 2].rstrip().endswith(('.', ')')):
                    continue
                first = re.match(r'[^\W\d_]+', line.lstrip(), re.UNICODE)
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
    # ⚠ SORT INTO PRINT ORDER FIRST. `reconciled_headwords` emits in
    # LlamaParse's bold-run order, which is NOT the printed order — on
    # page 63 it yields ἀναπληρȣ͂ν (l.31) before ἀναπιμπλάναι (l.18). The
    # subsequence walk below judges ORDER, so a shuffled input manufactures
    # violations about the shuffle: nine "Bonitz order anomalies" on 63-102
    # were exactly this, survived one triage, and reached John's review page
    # before the band crops' line numbers gave the contradiction away
    # (2026-08-21). Page, then column L before R, then printed line.
    seq.sort(key=lambda t: (t[0], t[3], t[4]))
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
    # ⚠ A PAGE IN NO CORPUS STAGE IS NOT A CLEAN PAGE. `scan` looks up
    # its column with required=False and answers [] when there is none,
    # so asking for a page that was never transcribed printed a zero and
    # looked exactly like a page with no defects. This is the residue of
    # the 2026-08-10 five-gate fix: they can SEE reconciled-auto now, but
    # total absence still read as cleanliness. Validate the REQUEST here,
    # once, where the user says which pages they mean.
    corpus_columns(pages)
    n_cand = sum(len(reconciled_headwords(p)) for p in pages)
    v = scan(pages)
    for x in v:
        print(f"  page-{x['page']:03d}-{x['col']}:{x['line']:<3} {x['word']:20} "
              f"out of run [{x['after']} … {x['before']}]")
    print(f'{len(v)} order violations in {n_cand} headword candidates')


if __name__ == '__main__':
    main()
