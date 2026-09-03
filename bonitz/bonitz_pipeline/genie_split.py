"""Genie's .docx archives, split into per-page text a glob can find.

    python3 -m bonitz_pipeline.genie_split            # all nine archives
    python3 -m bonitz_pipeline.genie_split --check    # report, write nothing

Genie read the WHOLE book — pages 15-890, in `raw/genie400/`. Every other
reader is `page-NNN-C.txt` in a directory, so `ls raw/genie* | grep page-`
returns nothing and a coverage table built that way prints `0 files`, which
reads as "genie did not read this" rather than "my glob does not fit genie".
That slip has recurred across sessions; this module is the fix, and it is a
fix in the filesystem rather than a note asking someone to remember.

⚠ THE ARCHIVES ARE THE ORIGINAL AND ARE NOT TOUCHED. Their bold runs mark
Bonitz's headwords and plain text cannot hold that, so the split CARRIES the
bolds as `**…**` and the .docx files stay exactly where they are. Anything
needing the real formatting still goes to the archive.

⚠ PAGES, NOT COLUMNS. Genie's paragraphs are lemma entries flowing across both
columns; nothing in the file marks a column or a printed line. A
`page-NNN-C.txt` at 61 lines is NOT derivable here, and inventing that
boundary would put a guess where every other reader has a measurement. If a
column split is ever wanted it has to come from aligning against a corpus that
already has one — which is a different claim, and a circular one for
defect-finding.

⚠ THE RUNNING HEAD IS THE PRINTED PAGE; OUR FILES USE THE SCAN PAGE. Genie's
heads read 88, 89, 90 where the scans read 100, 101, 102 —
`work/reconciled/page-114` is printed 102. Writing genie under printed numbers
would file it twelve pages from every other reader.
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'raw' / 'genie400'
OUT = ROOT / 'raw' / 'genie-pages'
SEP = '---'
# scan page = printed page + this. Measured: printed 102 is scan 114.
OFFSET = 12


class GenieSplitError(RuntimeError):
    pass


def paragraph_text(xml: str) -> str:
    """One `<w:p>` to text, bold runs wrapped in `**`.

    ⚠ THE BOLD IS THE POINT. It marks Bonitz's headwords, and dropping it
    would throw away the reason for keeping the .docx at all.
    """
    out = []
    for run in re.findall(r'<w:r[ >].*?</w:r>', xml, re.S):
        text = ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', run, re.S))
        if not text:
            continue
        text = (text.replace('&quot;', '"').replace('&apos;', "'")
                    .replace('&amp;', '&').replace('&lt;', '<')
                    .replace('&gt;', '>'))
        bold = re.search(r'<w:rPr>.*?<w:b/>', run, re.S) is not None
        out.append((bold, text))
    parts, buf, was = [], '', None
    for bold, text in out:
        if bold != was and buf:
            parts.append(f'**{buf}**' if was else buf)
            buf = ''
        was, buf = bold, buf + text
    if buf:
        parts.append(f'**{buf}**' if was else buf)
    return ''.join(parts).strip()


def head_page(head: str) -> int | None:
    """The printed page a running head carries, or None when it carries none.

    ⚠ A BEKKER NUMBER IS NOT A PAGE NUMBER. Heads hold headwords, and a
    headword line can carry a citation; page numbers here are 2-3 digits
    standing alone at one end of the head.
    """
    head = head.strip()
    for m in (re.match(r'^(\d{2,3})\b', head), re.search(r'\b(\d{2,3})$', head)):
        if m:
            n = int(m.group(1))
            if 10 <= n <= 900:
                return n
    return None


def looks_like_head(para: str) -> bool:
    """Is this paragraph running-head material rather than an entry?

    ⚠ THE GATE IS WHAT KEEPS A CITATION FROM BEING READ AS A PAGE NUMBER.
    `ἐνεότης π. 40. 895 a 16.` opens an entry and carries two numbers; without
    a gate the second would file the page under 895. A head holds guide words
    and at most the page number, so every token is either a bare number or a
    word with no digit in it.
    """
    toks = para.replace('**', ' ').split()
    if not toks or len(toks) > 8:
        return False
    if not all(t.isdigit() or not any(c.isdigit() for c in t) for t in toks):
        return False
    nums = [int(t) for t in toks if t.isdigit()]
    # ⚠ A HEAD CARRIES AT MOST ITS OWN PAGE NUMBER. An entry short enough to
    # pass the token count still carries a citation, and a citation is two
    # numbers: `ναυπηγεῖσθαι τριήρεις μέλλων οβ 1349 a 25` slipped through and
    # made page 481 into page 25. One number, and no Bekker number — the book
    # ends at printed 878, so anything above 900 is a citation.
    return len(nums) <= 1 and all(10 <= n <= 900 for n in nums)


def head_number(paras: list[str], window: int = 4) -> int | None:
    """The printed page a chunk's head carries, reading the whole head block.

    ⚠ THE HEAD IS NOT ONE PARAGRAPH. Genie breaks it across up to three —
    `ἐνεότης / ἔνθεος / 251`, `Λίγυς / λιπαρός / **431**` — and sometimes keeps
    it on one with the number in the middle, `ὄρνις 529 ὅρος`. Looking only at
    the first paragraph's two ends found a number on 11 of 16 pages of the
    selection archive, and the five it missed were then filled by interpolation
    from a neighbour, which in a SELECTION is a neighbour hundreds of pages
    away.

    ⚠ THE LAST NUMBER IN THE BLOCK, NOT THE FIRST. One page opens
    `460 / μεταπείθειν / μεταφέρειν / 461`: the verso's number carried over
    ahead of the head that belongs to this page.
    """
    seen = []
    for para in paras[:window]:
        if not looks_like_head(para):
            break
        seen += [int(t) for t in para.replace('**', ' ').split()
                 if t.isdigit() and 10 <= int(t) <= 900]
    return seen[-1] if seen else None


def number(found: list[int | None]) -> list[int]:
    """Fill the unlabelled pages from their labelled neighbours.

    ⚠ INTERPOLATE BETWEEN CONSECUTIVE LABELS, NEVER COUNT STRAIGHT THROUGH.
    Counting from the first label makes every later page depend on every
    separator before it, so ONE missing or spurious `---` throws the rest of
    the archive out by one and the whole file gets refused. Eight of the nine
    failed that way. Each labelled page is an anchor; a stretch between two
    anchors is sound when its length matches the gap in their numbers, and
    only the stretch that does not match is a problem.
    """
    known = [(i, n) for i, n in enumerate(found) if n is not None]
    if not known:
        raise GenieSplitError('no page number anywhere in this run — refusing '
                              'to number pages by position alone')
    out: list[int | None] = [None] * len(found)
    for i, n in known:
        out[i] = n
    for (i, a), (j, b) in zip(known, known[1:]):
        if b - a != j - i:
            raise GenieSplitError(
                f'page numbers do not run consecutively: {a} at position {i} '
                f'and {b} at position {j} are {j - i} pages apart but '
                f'{b - a} apart in numbering')
        for k in range(i + 1, j):
            out[k] = a + (k - i)
    # the tails, before the first anchor and after the last
    i0, n0 = known[0]
    for k in range(i0):
        out[k] = n0 - (i0 - k)
    i1, n1 = known[-1]
    for k in range(i1 + 1, len(found)):
        out[k] = n1 + (k - i1)
    return [int(x) for x in out]


def merge_split_pages(found: list[int | None]) -> list[int]:
    """Chunk index -> the page group it belongs to, joining split pages.

    ⚠ A `---` FALLS INSIDE A PAGE IN SIX OF THE NINE ARCHIVES. The tell is two
    consecutive labelled chunks carrying the SAME number: one printed page cut
    in two, not two pages. Refusing the archive over it discarded 800 pages of
    a reader that had already read them.
    """
    group, g = [], 0
    for i, n in enumerate(found):
        if i and n is not None and n == found[i - 1]:
            g -= 1                      # same page continued
        group.append(g)
        g += 1
    # renumber densely
    seen, dense = {}, []
    for x in group:
        dense.append(seen.setdefault(x, len(seen)))
    return dense


def number_with_gaps(
        found: list[int | None]) -> tuple[list[int | None], list[int]]:
    """Number the run, allowing pages genie never produced.

    Returns (numbers, missing). A jump wider than the positions between two
    anchors means genie skipped a page; that page is REPORTED ABSENT rather
    than filled, because filling it would shift every later page by one.
    """
    known = [(i, n) for i, n in enumerate(found) if n is not None]
    if not known:
        raise GenieSplitError('no page number anywhere in this run')
    out: list[int | None] = [None] * len(found)
    missing: list[int] = []
    for i, n in known:
        out[i] = n
    for (i, a), (j, b) in zip(known, known[1:]):
        if b <= a:
            raise GenieSplitError(
                f'page numbers run backward: {a} at position {i} then {b} at '
                f'position {j}')
        span, gap = j - i, b - a
        if gap < span:
            raise GenieSplitError(
                f'{span} chunks between pages {a} and {b}, which are only '
                f'{gap} apart — a chunk here belongs to no page')
        if gap > span and span > 1:
            # ⚠ AN ANCHOR 119 PAGES AWAY PINS NOTHING. Counting up from `a`
            # would file an unlabelled chunk at 760 because 759 came before it,
            # when the gap says it could be any of 760-877. In a run that is
            # the right guess; in a SELECTION it is a page number invented from
            # position. Leave them unplaced and say so.
            missing += list(range(a + 1, b))
            continue
        for k in range(i + 1, j):
            out[k] = a + (k - i)
        missing += list(range(a + (j - i), b))
    i0, n0 = known[0]
    for k in range(i0):
        out[k] = n0 - (i0 - k)
    i1, n1 = known[-1]
    for k in range(i1 + 1, len(found)):
        out[k] = n1 + (k - i1)
    return [None if x is None else int(x) for x in out], missing


def scan_page(printed: int, offset: int = OFFSET) -> int:
    return printed + offset


def split(doc: Path, offset: int = OFFSET) -> dict[int, str]:
    """scan page number -> that page's genie text."""
    xml = zipfile.ZipFile(doc).read('word/document.xml').decode('utf-8')
    paras = [paragraph_text(p + '</w:p>')
             for p in re.split(r'</w:p>', xml)]
    paras = [p for p in paras if p]
    pages, cur = [], []
    for p in paras:
        if p.strip() == SEP:
            pages.append(cur); cur = []
        else:
            cur.append(p)
    pages.append(cur)
    pages = [pg for pg in pages if pg]
    found = [head_number(pg) for pg in pages]
    groups = merge_split_pages(found)
    joined: list[list[str]] = []
    for g, pg in zip(groups, pages):
        if g == len(joined):
            joined.append(list(pg))
        else:
            joined[g] += pg
    heads = [head_number(pg) for pg in joined]
    nums, missing = number_with_gaps(heads)
    if missing:
        print(f'  {doc.name}: genie has no page '
              f'{", ".join(str(m) for m in missing[:6])}'
              f'{" …" if len(missing) > 6 else ""}', file=sys.stderr)
    unplaced = sum(n is None for n in nums)
    if unplaced:
        print(f'  {doc.name}: {unplaced} chunk(s) carry no page number and sit '
              f'in too wide a gap to place — dropped', file=sys.stderr)
    return {scan_page(n, offset): plain_column_letter('\n'.join(pg)) + '\n'
            for n, pg in zip(nums, joined) if n is not None}


# ⚠ THE BEKKER COLUMN LETTER, WRITTEN AS EVERY OTHER READER WRITES IT.
# Genie types it as a superscript — `1095ᵃ1`, and 7266 times as the ordinal
# indicator `ª` — where the corpus and every other reader use plain `a`.
# `canonical()` does not fold modifier letters onto their base, so each of
# those was a difference: 3958 false hits across the 103 pages that have a
# corpus column to compare against, 18% of every difference found there. It
# also faked a 4-point accuracy gap between two genie passes that read the
# page identically.
#
# ᶜ and ᵉ appear 12 times between them and Bonitz has no column c, so they are
# left alone rather than guessed at.
#
# This belongs in `normalize.py` eventually — opus writes superscripts on ten
# pages too — but `canonical()` is where `word_off` lives and every applied
# ruling is measured, so it is not a fold to widen casually.
COLUMN_LETTER = {'ᵃ': 'a', 'ª': 'a', 'ᵇ': 'b'}


def plain_column_letter(text: str) -> str:
    return ''.join(COLUMN_LETTER.get(c, c) for c in text)


def _fold(text: str) -> tuple[str, list[int]]:
    """Whitespace-free, markup-free stream plus a map back to `text`."""
    out, idx = [], []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == '*' and text[i:i + 2] == '**':
            i += 2
            continue
        if c == '$':
            j = text.find('$', i + 1)
            if j == -1:
                break
            inner = text[i + 1:j]
            keep = re.sub(r'[\\^{}]', '', inner)
            if len(keep) == 1 and keep in 'ab':
                out.append(keep); idx.append(i)
            i = j + 1
            continue
        if not c.isspace():
            out.append(unicodedata.normalize('NFC', c)); idx.append(i)
        i += 1
    return ''.join(out), idx


def column_cut(page: str, left: str, right: str, *, floor: float = 0.35) -> int:
    """Index into `page` where column L ends and column R begins.

    ⚠ FOUND BY ALIGNMENT, NEVER BY PROPORTION. Genie's text is a different
    LENGTH from the corpus — different reader, different spacing, LaTeX
    sub/superscripts — so cutting at `len(page) * len(L)/(len(L)+len(R))`
    puts the seam wherever the markup happens to fall. What genie DOES give
    is ORDER: left column complete, then right, measured at 112 probes across
    eleven pages with zero inversions. So align, and read the seam off the
    alignment.

    ⚠ AND REFUSE WHEN THE ALIGNMENT IS THIN. A cut nobody can justify is
    worse than no column split: it would file the head of column R under L
    and every diff against it would report defects that are only the seam.
    """
    gs_, gidx = _fold(page)
    ls_, _ = _fold(left)
    rs_, _ = _fold(right)
    both = ls_ + rs_
    if not gs_ or not both:
        raise GenieSplitError('nothing to align')
    sm = difflib.SequenceMatcher(None, both, gs_, autojunk=False)
    matched = sum(b.size for b in sm.get_matching_blocks())
    if matched < floor * min(len(both), len(gs_)):
        raise GenieSplitError(
            f'only {matched} of {min(len(both), len(gs_))} characters align '
            f'({matched / max(1, min(len(both), len(gs_))):.0%}); refusing to '
            f'place a column boundary on that')
    # the first matching block that reaches past the end of column L
    boundary = len(ls_)
    for b in sm.get_matching_blocks():
        if b.size and b.a + b.size > boundary:
            g = b.b + max(0, boundary - b.a)
            return gidx[min(g, len(gidx) - 1)] if g < len(gidx) else len(page)
    return len(page)


def split_columns(page: str, left: str, right: str) -> tuple[str, str]:
    """`page` cut into (L, R). The two halves rejoin to the whole, exactly.

    ⚠ THESE ARE NOT 61-LINE COLUMNS. Genie holds lemma paragraphs, not the
    printed lines kraken has, and a file claiming 61 lines would invite
    `zip(alto_boxes, lines)` and pair the wrong ink with the wrong text.
    """
    i = column_cut(page, left, right)
    return page[:i], page[i:]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--src', type=Path, default=SRC)
    ap.add_argument('--out', type=Path, default=OUT)
    ap.add_argument('--offset', type=int, default=OFFSET)
    ap.add_argument('--check', action='store_true',
                    help='report what would be written, write nothing')
    ap.add_argument('--columns', type=Path, metavar='CORPUS',
                    help='also write page-NNN-C.txt, cutting each page at the '
                         'column boundary found by aligning against CORPUS '
                         '(e.g. work/reconciled). ⚠ ONLY where that corpus '
                         'already holds both columns — there is nothing to '
                         'align against otherwise, and genie alone does not '
                         'say where the columns divide')
    a = ap.parse_args(argv)
    docs = sorted(a.src.glob('*.docx'))
    if not docs:
        raise GenieSplitError(f'no .docx under {a.src} — refusing to report '
                              f'genie split when nothing was read')
    # ⚠ LATER IN THE SORT WINS, SO THE FILENAME CARRIES THE PRECEDENCE.
    # Genie read the 16 missing pages twice. The two passes READ THE SAME —
    # where both transcribe the whole page they agree to within 0.5-2.7%, and
    # against the adjudicated corpus on page 89 they score 2.82% and 2.95%.
    # What varies is HOW MUCH OF THE PAGE each one transcribes: pass 1 dropped
    # 28% of page 443 and 12% of page 473, and page-to-page disagreement
    # tracks the length gap almost exactly. Pass 2 is the fuller read, so it
    # is named `-pass2` and survives the merge. Renaming an archive changes
    # which read ships.
    seen: dict[int, str] = {}
    for d in docs:
        try:
            pages = split(d, a.offset)
        except GenieSplitError as e:
            print(f'  {d.name}: REFUSED — {e}', file=sys.stderr)
            continue
        clash = sorted(set(pages) & set(seen))
        if clash:
            print(f'  {d.name}: {len(clash)} page(s) already written by an '
                  f'earlier archive, first {clash[0]}', file=sys.stderr)
        seen.update(pages)
        print(f'  {d.name}: {len(pages)} pages '
              f'{min(pages)}-{max(pages)} (scan numbering)')
    cut = skipped = refused = 0
    if not a.check:
        a.out.mkdir(parents=True, exist_ok=True)
        wrote: set[Path] = set()
        for n, text in sorted(seen.items()):
            f = a.out / f'page-{n:03d}.txt'
            f.write_text(text, encoding='utf-8')
            wrote.add(f)
            if not a.columns:
                continue
            lp = a.columns / f'page-{n:03d}-L.txt'
            rp = a.columns / f'page-{n:03d}-R.txt'
            if not (lp.exists() and rp.exists()):
                skipped += 1
                continue
            try:
                left, right = split_columns(
                    text, lp.read_text(encoding='utf-8'),
                    rp.read_text(encoding='utf-8'))
            except GenieSplitError as e:
                print(f'  page {n}: no column cut — {e}', file=sys.stderr)
                refused += 1
                continue
            (a.out / f'page-{n:03d}-L.txt').write_text(left, encoding='utf-8')
            (a.out / f'page-{n:03d}-R.txt').write_text(right, encoding='utf-8')
            wrote.add(a.out / f'page-{n:03d}-L.txt')
            wrote.add(a.out / f'page-{n:03d}-R.txt')
            cut += 1
        # ⚠ A PAGE THIS RUN DID NOT WRITE MUST NOT SURVIVE FROM THE LAST ONE.
        # Renumbering moved pages, and the file left behind at the old number
        # still answers a coverage glob — genie would look to have read a page
        # it has not read, which is the one mistake this module exists to stop.
        stale = sorted(f for f in a.out.glob('page-*.txt') if f not in wrote)
        for f in stale:
            f.unlink()
        if stale:
            print(f'removed {len(stale)} stale page file(s) from an earlier '
                  f'run, first {stale[0].name}')
        if a.columns:
            print(f'column split: {cut} pages cut · {skipped} with no corpus '
                  f'column to align against · {refused} refused')
    what = 'would write' if a.check else 'wrote'
    print(f'{what} {len(seen)} pages -> {a.out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
