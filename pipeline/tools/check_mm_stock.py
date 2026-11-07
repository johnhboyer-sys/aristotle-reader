#!/usr/bin/env python3
"""Independent checker for the Magna Moralia (St. George Stock, Oxford 1915).

Compares our text with the BODY words of two scans of the same printing,
read from the hOCR geometry. It shares no code and no rules with the builder
(pipeline/tools/build_mm_stock.py): it never imports it and never reads it.

Run from pipeline/:
    uv run python tools/check_mm_stock.py [--books DIR] [--standin] [--selftest]

Exit codes: 0 clean; 1 findings (or allowlist errors); 2 coverage not met
(nothing examined, or alignment to either scan below 90% in a book).

Findings (each with book, chapter, a six-word context from ours, and the two
scans' readings):
  WORD   our word matches neither scan where they align (a near miss)
  LOST   one or more body words that both scans have and ours lacks
  NUMBER a digit string of ours that differs from both scans, or a number both
         scans have that ours lacks
  MARK   a stray mark character, or a digit glued to a word
  QUOTE  a quote/apostrophe both scans have and ours lacks, or ours has and
         neither scan has
  EXTRA  a word of ours that neither scan has anywhere near that place

Notes on scope: punctuation other than quote marks is not compared. Words are
compared case-folded, accent-stripped, with hyphens and punctuation removed.
"""
from __future__ import annotations

import argparse
import difflib
import html
import json
import random
import re
import statistics
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OCR_DIR = ROOT / "build" / "mm-ocr"
HOCR_A = OCR_DIR / "works0009aris_hocr.html"
HOCR_B = OCR_DIR / "theworksofaristo09arisuoft_hocr.html"
WS_JSON = OCR_DIR / "ws" / "ws_pages.json"
DEFAULT_BOOKS = ROOT / "sources" / "mm-stock"
ALLOW_PATH = Path(__file__).resolve().parent / "check_mm_stock_allow.json"

FIRST_PAGE, LAST_PAGE = 301, 392  # Wikisource page numbers; scan A index = same
B_OFFSET = 3  # scan B index = Wikisource page - 3

# The Oxford MM runs to about 33,000 words in English. The brief guessed 40,000;
# the Wikisource stand-in has 32,7xx. Anything under this floor means the
# extraction or the parse looked at too little.
MIN_WORDS = 30_000
MIN_ALIGN = 0.90

MARK_CHARS = "®°©*«»|¦†‡§¶"
QUOTES = "‘’“”'\"`´"
OPEN_QUOTES = "‘“"

KINDS = ("WORD", "LOST", "NUMBER", "MARK", "QUOTE", "EXTRA")


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------
GLUE_TAIL = re.compile(r"(?<=[^\W\d_])([^\w\s]*)\d{1,2}$")
GLUE_HEAD = re.compile(r"^\d{1,2}(?=[^\W\d_]{3,})")


def core_of(raw: str) -> str:
    """Comparison form: letters and digits only, case-folded, accents off.

    A footnote number glued to the end or start of a word is dropped here so
    the word still aligns; the glue itself is reported separately as MARK.
    """
    s = GLUE_TAIL.sub(r"\1", raw)
    s = GLUE_HEAD.sub("", s)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return "".join(ch for ch in s.casefold() if ch.isalnum())


class Tok:
    __slots__ = ("raw", "core", "book", "chapter")

    def __init__(self, raw, book=0, chapter=""):
        self.raw = raw
        self.core = core_of(raw)
        self.book = book
        self.chapter = chapter


def split_raw(text: str) -> list[str]:
    """Whitespace split; break after dashes; lone punctuation joins a neighbour."""
    out: list[str] = []
    pending_open = ""
    for piece in text.split():
        parts = re.findall(r"[^—–]+[—–]*|[—–]+", piece)
        for part in parts:
            if not any(ch.isalnum() for ch in part):
                if part and all(ch in OPEN_QUOTES for ch in part):
                    pending_open += part
                elif out:
                    out[-1] += part
                else:
                    pending_open += part
                continue
            out.append(pending_open + part)
            pending_open = ""
    return out


# --------------------------------------------------------------------------
# Scan extraction (hOCR geometry)
# --------------------------------------------------------------------------
PAGE_RE = re.compile(r'<div class=.ocr_page. id=.page_(\d+).[^>]*?title="([^"]*)"')
LINE_RE = re.compile(r'<span class=.ocr_line. [^>]*?title="([^"]*)"')
WORD_RE = re.compile(
    r'<span class=.ocrx_word. [^>]*?title="bbox (\d+) (\d+) (\d+) (\d+)[^"]*"[^>]*>(.*?)</span>',
    re.S,
)
TAG_RE = re.compile(r"<[^>]+>")
REFISH = {"cf", "e", "n", "m", "ee", "en", "mm", "de", "an", "ib", "p", "pp"}
HEAD_WORDS = re.compile(r"MAGNA|MORALIA|BOOK", re.I)


class Line:
    __slots__ = ("x0", "y0", "x1", "y1", "xs", "words", "foot", "head")

    def __init__(self, bbox, xs):
        self.x0, self.y0, self.x1, self.y1 = bbox
        self.xs = xs
        self.words = []  # (x0, y0, x1, y1, text)
        self.foot = False
        self.head = False

    def text(self):
        return " ".join(w[4] for w in self.words)


def _mode_edge(values, lo, hi, width=6):
    """Value of the most crowded bin of `values` in [lo, hi]."""
    bins = Counter()
    for v in values:
        if lo <= v <= hi:
            bins[v // width] += 1
    if not bins:
        return None
    b, _ = max(bins.items(), key=lambda kv: (kv[1], -kv[0]))
    inbin = [v for v in values if b * width - width <= v <= b * width + 2 * width]
    return statistics.median(inbin)


def parse_pages(path: Path, wanted: set[int]) -> dict[int, tuple[int, int, list[Line]]]:
    data = path.read_text(encoding="utf8")
    marks = [(m.start(), int(m.group(1)), m.group(2)) for m in PAGE_RE.finditer(data)]
    pages = {}
    for k, (pos, num, title) in enumerate(marks):
        if num not in wanted:
            continue
        end = marks[k + 1][0] if k + 1 < len(marks) else len(data)
        chunk = data[pos:end]
        m = re.search(r"bbox 0 0 (\d+) (\d+)", title)
        pw, ph = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
        lines: list[Line] = []
        # walk lines and words in document order
        events = sorted(
            [(mm.start(), "L", mm) for mm in LINE_RE.finditer(chunk)]
            + [(mm.start(), "W", mm) for mm in WORD_RE.finditer(chunk)],
            key=lambda e: e[0],
        )
        for _, kind, mm in events:
            if kind == "L":
                t = mm.group(1)
                bb = re.search(r"bbox (\d+) (\d+) (\d+) (\d+)", t)
                xs = re.search(r"x_size ([\d.]+)", t)
                if not bb:
                    continue
                lines.append(Line(tuple(int(v) for v in bb.groups()), float(xs.group(1)) if xs else 0.0))
            elif lines:
                text = html.unescape(TAG_RE.sub("", mm.group(5))).strip()
                if text:
                    lines[-1].words.append(tuple(int(v) for v in mm.groups()[:4]) + (text, lines[-1].xs))
        pages[num] = (pw, ph, [ln for ln in lines if ln.words])
    return pages


def body_tokens(pw, ph, lines, stats) -> list[str]:
    """Body words of one scan page, in reading order, from geometry alone."""
    if not lines:
        return []
    words = [w for ln in lines for w in ln.words]
    L = _mode_edge([w[0] for w in words], 0, pw * 0.5)
    R = _mode_edge([w[2] for w in words], pw * 0.5, pw)
    if L is None or R is None:
        stats["page_no_edges"] += 1
        return []
    def is_margin(w):
        x0, x1 = w[0], w[2]
        if x1 <= L + 10 and x0 < L:  # ends at or before the body's left edge
            return True
        if x0 > R + 6:  # starts after the body's right edge
            return True
        return False

    body_lines = []
    for ln in lines:
        keep = []
        for w in ln.words:
            if is_margin(w):
                stats["margin_words"] += 1
            else:
                keep.append(w)
        if keep:
            # the line's own box may have stretched to a margin mark; use its words
            keep.sort(key=lambda w: w[0])
            yc = int(statistics.median((w[1] + w[3]) / 2 for w in keep))
            nl = Line((ln.x0, yc, ln.x1, ln.y1), ln.xs)
            nl.words = keep
            body_lines.append(nl)
    if not body_lines:
        return []
    # A page that tesseract read askew can fold several printed lines into one
    # hOCR line. Then ignore its lines and cluster the words by height.
    def spread(ln):
        ys = [(w[1] + w[3]) / 2 for w in ln.words]
        return max(ys) - min(ys)

    if any(spread(ln) > 45 for ln in body_lines):
        stats["rebuilt_pages"] += 1
        allw = sorted((w for ln in body_lines for w in ln.words), key=lambda w: (w[1] + w[3]) / 2)
        medh = statistics.median(w[3] - w[1] for w in allw)
        gap = 0.8 * medh
        groups, cur, prev_y = [], [], None
        for w in allw:
            yc = (w[1] + w[3]) / 2
            if cur and yc - prev_y > gap:
                groups.append(cur)
                cur = []
            cur.append(w)
            prev_y = yc
        if cur:
            groups.append(cur)
        body_lines = []
        for g in groups:
            g.sort(key=lambda w: w[0])
            nl = Line((g[0][0], g[0][1], g[-1][2], g[-1][3]), statistics.median(w[5] for w in g))
            nl.words = g
            body_lines.append(nl)
    for ln in body_lines:
        ys = [(w[1] + w[3]) / 2 for w in ln.words]
        ln.y0 = int(statistics.median(ys))
    body_lines.sort(key=lambda ln: ln.y0)

    xsizes = [ln.xs for ln in body_lines for _ in ln.words if ln.xs]
    med_xs = statistics.median(xsizes) if xsizes else 0
    y0s = [ln.y0 for ln in body_lines]
    diffs = [b - a for a, b in zip(y0s, y0s[1:]) if 25 < b - a < 120]
    pitch = statistics.median(diffs) if diffs else 62

    # running head: the top lines, set apart or recognisably a head
    while len(body_lines) > 1:
        a, b = body_lines[0], body_lines[1]
        gap = b.y0 - a.y0
        if a.y0 < ph * 0.1 and (gap > 1.4 * pitch or HEAD_WORDS.search(a.text())):
            stats["head_lines"] += 1
            body_lines.pop(0)
        else:
            break

    # a bare "BOOK II" heading is not body text
    body_lines = [ln for ln in body_lines if not re.fullmatch(r"BOOK\s+[IVXL]+\W*", ln.text().strip(), re.I)]

    # foot: a gap, then smaller type, a reference-like line, Greek or a note
    # number. Every line below must look like foot too, or be no larger than
    # body type: a body line OCR'd a little small after a paragraph gap is not
    # the start of the foot.
    def footlike(ln):
        toks = [w[4] for w in ln.words]
        refish = sum(
            1 for t in toks if any(c.isdigit() for c in t) or t.lower().strip(".,:;") in REFISH or t == "="
        ) / max(1, len(toks))
        letters = [ch for t in toks for ch in t if ch.isalpha()]
        greek = sum(1 for ch in letters if "\u0370" <= ch <= "\u1fff") / max(1, len(letters))
        small = med_xs and ln.xs and ln.xs <= 0.9 * med_xs
        tiny = ln.xs and ln.xs < 30
        return bool(small or tiny or refish >= 0.35 or greek >= 0.3)

    cut = None
    for k in range(1, len(body_lines)):
        ln, prev = body_lines[k], body_lines[k - 1]
        if ln.y0 < ph * 0.45 or ln.y0 - prev.y0 <= 1.0 * pitch:
            continue
        marker = ln.y0 > ph * 0.7 and re.fullmatch(r"\d{1,2}|[*†‡]", ln.words[0][4])
        if not (footlike(ln) or marker):
            continue
        below_ok = all(
            footlike(x) or (med_xs and x.xs and x.xs <= 0.97 * med_xs) or (not x.xs) for x in body_lines[k + 1 :]
        )
        if below_ok:
            cut = k
            break
    if cut is not None:
        stats["foot_lines"] += len(body_lines) - cut
        body_lines = body_lines[:cut]

    out = []
    for ln in body_lines:
        hs = [w[3] - w[1] for w in ln.words]
        medh = statistics.median(hs) if hs else 0
        for w in ln.words:
            t = w[4]
            if re.fullmatch(r"\d{1,2}", t) and medh and (w[3] - w[1]) < 0.7 * medh:
                stats["superscript_words"] += 1
                continue
            out.append(t)
        out.append("\n")  # line break marker, used for hyphen rejoin
    return out


def rejoin_hyphens(items: list[str]) -> list[str]:
    """Join a word ending in a hyphen at a line end to the next line's first word."""
    out: list[str] = []
    i = 0
    while i < len(items):
        t = items[i]
        if t == "\n":
            i += 1
            continue
        nxt = i + 1
        if t.endswith(("-", "‐", "¬")) and len(t) > 1 and t[-2].isalpha() and nxt < len(items) and items[nxt] == "\n":
            j = nxt
            while j < len(items) and items[j] == "\n":
                j += 1
            if j < len(items):
                out.append(t[:-1] + items[j])
                i = j + 1
                continue
        out.append(t)
        i += 1
    return out


def scan_stream(path: Path, offset: int, stats) -> list[Tok]:
    wanted = {p - offset for p in range(FIRST_PAGE, LAST_PAGE + 1)}
    pages = parse_pages(path, wanted)
    stats["pages"] = len(pages)
    items: list[str] = []
    for num in sorted(pages):
        pw, ph, lines = pages[num]
        got = body_tokens(pw, ph, lines, stats)
        stats["words_by_page"][num + offset] = sum(1 for g in got if g != "\n")
        items.extend(got)
    raws = rejoin_hyphens(items)
    toks = []
    for r in split_raw(" ".join(raws)):
        t = Tok(r)
        if t.core:
            toks.append(t)
    return toks


# --------------------------------------------------------------------------
# Our text
# --------------------------------------------------------------------------
def parse_books_dir(d: Path) -> list[Tok]:
    files = sorted(d.glob("book-*.html"))
    toks: list[Tok] = []
    for f in files:
        m = re.search(r"book-0*(\d+)", f.stem)
        book = int(m.group(1)) if m else len(toks)
        chapter = "1"
        for line in f.read_text(encoding="utf8").splitlines():
            s = line.strip()
            pm = re.fullmatch(r"Part\s+(\d+)", s)
            if pm:
                chapter = pm.group(1)
                continue
            if not s.startswith("<p"):
                continue
            text = html.unescape(TAG_RE.sub(" ", s))
            for r in split_raw(text):
                t = Tok(r, book, chapter)
                if t.core:
                    toks.append(t)
    return toks


def parse_standin() -> list[Tok]:
    pages = json.loads(WS_JSON.read_text(encoding="utf8"))
    book, chapter = 1, "1"
    toks: list[Tok] = []
    for n in range(FIRST_PAGE, LAST_PAGE + 1):
        t = pages[str(n)]
        t = re.sub(r"<noinclude>.*?</noinclude>", "", t, flags=re.S)
        t = re.sub(r"<ref[^>]*?/>", "", t)
        t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
        t = re.sub(r"\{\{(?:verse|dhr|nop|\*\*\*|peh)[^{}]*\}\}", "", t)
        t = t.replace("{{thsp}}", " ").replace("{{...}}", " ... ")
        for _ in range(4):
            t = re.sub(r"\{\{(?:sc|c|larger|fine|center block)\|([^{}]*)\}\}", r"\1", t)
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
        t = t.replace("<br/>", " ")
        t = TAG_RE.sub("", t)
        # book headings and chapter markers
        pieces = re.split(r"(\bBOOK\s+I{1,3}\b|'''\d+''')", t)
        for piece in pieces:
            hm = re.fullmatch(r"BOOK\s+(I{1,3})", piece)
            cm = re.fullmatch(r"'''(\d+)'''", piece)
            if hm:
                book, chapter = len(hm.group(1)), "1"
                continue
            if cm:
                chapter = cm.group(1)
                continue
            piece = piece.replace("'''", "").replace("''", "")
            piece = html.unescape(piece)
            for r in split_raw(piece):
                tk = Tok(r, book, chapter)
                if tk.core:
                    toks.append(tk)
    return toks


# --------------------------------------------------------------------------
# Alignment
# --------------------------------------------------------------------------
def _lis_pairs(pairs):
    """Longest chain with i and j both rising. pairs sorted by i."""
    import bisect

    tails, tail_idx, prev = [], [], [-1] * len(pairs)
    for k, (_, j) in enumerate(pairs):
        pos = bisect.bisect_left(tails, j)
        if pos == len(tails):
            tails.append(j)
            tail_idx.append(k)
        else:
            tails[pos] = j
            tail_idx[pos] = k
        prev[k] = tail_idx[pos - 1] if pos else -1
    chain, k = [], tail_idx[-1] if tail_idx else -1
    while k != -1:
        chain.append(pairs[k])
        k = prev[k]
    return chain[::-1]


def align(o: list[str], s: list[str], K=6):
    """Opcodes (tag, i1, i2, j1, j2) turning o into s. Anchor on unique K-grams."""
    def grams(seq):
        d = defaultdict(list)
        for i in range(len(seq) - K + 1):
            d[tuple(seq[i : i + K])].append(i)
        return d

    go, gs = grams(o), grams(s)
    pairs = sorted((v[0], gs[g][0]) for g, v in go.items() if len(v) == 1 and len(gs.get(g, ())) == 1)
    chain = _lis_pairs(pairs)
    blocks = []  # (i, j, length)
    for i, j in chain:
        if blocks and blocks[-1][0] - blocks[-1][1] == i - j and i <= blocks[-1][0] + blocks[-1][2]:
            bi, bj, bl = blocks[-1]
            blocks[-1] = (bi, bj, i + K - bi)
        elif blocks and (i < blocks[-1][0] + blocks[-1][2] or j < blocks[-1][1] + blocks[-1][2]):
            continue
        else:
            blocks.append((i, j, K))
    ops = []
    pi = pj = 0
    for bi, bj, bl in blocks + [(len(o), len(s), 0)]:
        if bi > pi or bj > pj:
            sm = difflib.SequenceMatcher(None, o[pi:bi], s[pj:bj], autojunk=False)
            for tag, a1, a2, b1, b2 in sm.get_opcodes():
                ops.append((tag, pi + a1, pi + a2, pj + b1, pj + b2))
        if bl:
            ops.append(("equal", bi, bi + bl, bj, bj + bl))
        pi, pj = bi + bl, bj + bl
    return ops


def ratio(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


class Align:
    """Per-token result of aligning our stream with one scan."""

    def __init__(self, n):
        self.status = ["a"] * n  # m match, d differs, a absent
        self.partner = [""] * n  # scan raw reading(s) at that place
        self.sim = [0.0] * n
        self.ins = []  # (our gap index, scan token index, raw, core)


def align_scan(ours: list[Tok], scan: list[Tok]) -> Align:
    oc = [t.core for t in ours]
    sc = [t.core for t in scan]
    res = Align(len(ours))
    for tag, i1, i2, j1, j2 in align(oc, sc):
        if tag == "equal":
            for k in range(i2 - i1):
                res.status[i1 + k] = "m"
                res.partner[i1 + k] = scan[j1 + k].raw
                res.sim[i1 + k] = 1.0
        elif tag == "delete":
            pass
        elif tag == "insert":
            for j in range(j1, j2):
                res.ins.append((i1, j, scan[j].raw, scan[j].core))
        else:
            _pair_block(ours, scan, res, i1, i2, j1, j2)
    return res


SKIP_COST = 0.8
SUB_BASE = 0.2


def _pair_block(ours, scan, res, i1, i2, j1, j2):
    """Pair the words of a replaced stretch by least edit cost.

    Moves: equal words (free); one of ours against two or three scan words that
    join to it, or the reverse (free); a near miss (costs 0.2 plus the
    difference); a skipped word on either side (0.8).
    """
    n, m = i2 - i1, j2 - j1
    if n * m > 30000:
        return _pair_block_greedy(ours, scan, res, i1, i2, j1, j2)
    oc = [ours[i].core for i in range(i1, i2)]
    sc = [scan[j].core for j in range(j1, j2)]
    INF = 1e9
    cost = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    cost[0][0] = 0.0
    rcache = {}

    def sub_cost(a, b):
        if a == b:
            return 0.0
        k = (a, b)
        if k not in rcache:
            rcache[k] = SUB_BASE + 1.0 - ratio(a, b)
        return rcache[k]

    for x in range(n + 1):
        for y in range(m + 1):
            c = cost[x][y]
            if c >= INF:
                continue
            moves = []
            if x < n:
                moves.append((x + 1, y, SKIP_COST, "so"))
            if y < m:
                moves.append((x, y + 1, SKIP_COST, "ss"))
            if x < n and y < m:
                moves.append((x + 1, y + 1, sub_cost(oc[x], sc[y]), "sub"))
            for k in (2, 3):
                if x + 1 <= n and y + k <= m and oc[x] == "".join(sc[y : y + k]):
                    moves.append((x + 1, y + k, 0.0, ("o1s", k)))
                if x + k <= n and y + 1 <= m and sc[y] == "".join(oc[x : x + k]):
                    moves.append((x + k, y + 1, 0.0, ("ok1", k)))
            for nx, ny, w, tag in moves:
                if c + w < cost[nx][ny]:
                    cost[nx][ny] = c + w
                    back[nx][ny] = (x, y, tag)
    x, y = n, m
    path = []
    while (x, y) != (0, 0):
        px, py, tag = back[x][y]
        path.append((px, py, x, y, tag))
        x, y = px, py
    for px, py, x, y, tag in reversed(path):
        if tag == "so":
            pass
        elif tag == "ss":
            res.ins.append((i1 + px, j1 + py, scan[j1 + py].raw, scan[j1 + py].core))
        elif tag == "sub":
            i, j = i1 + px, j1 + py
            r = 1.0 if oc[px] == sc[py] else ratio(oc[px], sc[py])
            res.status[i] = "m" if oc[px] == sc[py] else "d"
            res.partner[i], res.sim[i] = scan[j].raw, r
        elif tag[0] == "o1s":
            i = i1 + px
            res.status[i], res.sim[i] = "m", 1.0
            res.partner[i] = " ".join(scan[j1 + py + t].raw for t in range(tag[1]))
        else:
            for t in range(tag[1]):
                i = i1 + px + t
                res.status[i], res.partner[i], res.sim[i] = "m", scan[j1 + py].raw, 1.0


def _pair_block_greedy(ours, scan, res, i1, i2, j1, j2):
    """Cheap pairing for very large replaced stretches."""
    q = j1
    for p in range(i1, i2):
        if q >= j2:
            break
        r = ratio(ours[p].core, scan[q].core)
        res.status[p] = "m" if ours[p].core == scan[q].core else "d"
        res.partner[p], res.sim[p] = scan[q].raw, r
        q += 1
    for j in range(q, j2):
        res.ins.append((i2, j, scan[j].raw, scan[j].core))


# --------------------------------------------------------------------------
# Findings
# --------------------------------------------------------------------------
class Finding:
    __slots__ = ("kind", "book", "chapter", "idx", "context", "a", "b", "words")

    def __init__(self, kind, tok, idx, context, a="", b="", words=()):
        self.kind = kind
        self.book = tok.book
        self.chapter = tok.chapter
        self.idx = idx
        self.context = context
        self.a = a
        self.b = b
        self.words = tuple(words)

    def line(self):
        return (
            f"{self.kind:<6} book {self.book} ch {self.chapter:<3} | {self.context} | "
            f"A: {self.a or '-'} | B: {self.b or '-'}"
        )


def context_at(ours, i, before=2, after=3):
    lo, hi = max(0, i - before), min(len(ours), i + after + 1)
    parts = []
    for k in range(lo, hi):
        parts.append(f"[{ours[k].raw}]" if k == i else ours[k].raw)
    return " ".join(parts)


def gap_context(ours, g):
    lo, hi = max(0, g - 3), min(len(ours), g + 3)
    return " ".join(t.raw for t in ours[lo:g]) + " ^ " + " ".join(t.raw for t in ours[g:hi])


def qcount(s):
    return sum(1 for ch in s if ch in QUOTES)


GLUED = re.compile(r"[^\W\d_][^\w\s]*\d|\d[^\W\d_]")


def run_check(ours: list[Tok], scanA: list[Tok], scanB: list[Tok]):
    """Return (findings, stats). Stats hold per-book coverage."""
    n = len(ours)
    A = align_scan(ours, scanA) if scanA else Align(n)
    B = align_scan(ours, scanB) if scanB else Align(n)
    findings: list[Finding] = []

    for i, t in enumerate(ours):
        sa, sb = A.status[i], B.status[i]
        pa = A.partner[i] if sa != "a" else ""
        pb = B.partner[i] if sb != "a" else ""
        raw = t.raw

        # MARK: stray mark characters, and digits glued to words
        for ch in sorted(set(c for c in raw if c in MARK_CHARS)):
            if ch not in pa and ch not in pb:
                findings.append(Finding("MARK", t, i, context_at(ours, i), pa, pb, [ch]))
        if GLUED.search(raw):
            findings.append(Finding("MARK", t, i, context_at(ours, i), pa, pb, ["digit glued"]))

        matched = sa == "m" or sb == "m"
        has_digit = any(c.isdigit() for c in raw)

        # NUMBER: a digit string of ours that neither scan shows here
        if has_digit and not GLUED.search(raw):
            mine = re.findall(r"\d+", raw)
            ok = False
            for p in (pa, pb):
                if p and re.findall(r"\d+", p) == mine:
                    ok = True
            if not ok:
                findings.append(Finding("NUMBER", t, i, context_at(ours, i), pa, pb, mine))
            continue

        if not matched:
            sim = max(A.sim[i] if sa == "d" else 0, B.sim[i] if sb == "d" else 0)
            kind = "WORD" if sim >= 0.5 else "EXTRA"
            findings.append(Finding(kind, t, i, context_at(ours, i), pa, pb))
            continue

    findings.extend(_quotes(ours, A, B))
    findings.extend(_lost(ours, A, B))

    books = sorted({t.book for t in ours})
    cov = {}
    for b in books:
        idx = [i for i, t in enumerate(ours) if t.book == b]
        m = len(idx)
        cov[b] = {
            "words": m,
            "A": sum(1 for i in idx if A.status[i] == "m") / m if m else 0.0,
            "B": sum(1 for i in idx if B.status[i] == "m") / m if m else 0.0,
        }
    return findings, cov


def _pair_events(xs, ys, tol=1):
    """One-to-one pairing of sorted positions: equal positions first, then
    neighbours within `tol`. Returns (pairs, xs_left, ys_left)."""
    cx, cy = Counter(xs), Counter(ys)
    same = cx & cy
    pairs = [(p, p) for p in sorted(same) for _ in range(same[p])]
    xr = sorted((cx - same).elements())
    yr = sorted((cy - same).elements())
    xl, yl = [], []
    i = j = 0
    while i < len(xr) and j < len(yr):
        if abs(xr[i] - yr[j]) <= tol:
            pairs.append((xr[i], yr[j]))
            i += 1
            j += 1
        elif xr[i] < yr[j]:
            xl.append(xr[i])
            i += 1
        else:
            yl.append(yr[j])
            j += 1
    xl.extend(xr[i:])
    yl.extend(yr[j:])
    return sorted(pairs), xl, yl


def _quotes(ours, A, B):
    """Quote marks as events at word positions, paired within one word.

    A scan often glues an opening mark to the word before it, so counts per
    word are not safe. A mark is lost when both scans show one at a place (two
    marks within a word of each other) and ours has none within a word of it.
    A mark of ours is extra when neither scan has one within a word of it.
    """
    n = len(ours)
    both = [A.status[i] == "m" and B.status[i] == "m" for i in range(n)]

    def events(counts):
        ev = []
        for i in range(n):
            if both[i]:
                ev.extend([i] * counts[i])
        return ev

    eo = events([qcount(t.raw) for t in ours])
    ea = events([qcount(A.partner[i]) if A.status[i] == "m" else 0 for i in range(n)])
    eb = events([qcount(B.partner[i]) if B.status[i] == "m" else 0 for i in range(n)])
    out = []
    agreed, _, _ = _pair_events(ea, eb)
    pos_agreed = [a for a, _ in agreed]
    _, lost, _ = _pair_events(pos_agreed, eo)
    for t in lost:
        out.append(Finding("QUOTE", ours[t], t, context_at(ours, t), A.partner[t], B.partner[t], ["lost quote"]))
    _, extra_a, _ = _pair_events(eo, ea)
    _, extra_b, _ = _pair_events(eo, eb)
    # a mark of ours is extra when it pairs with neither scan
    count_extra = Counter(extra_a) & Counter(extra_b)
    for t in sorted(count_extra):
        out.append(Finding("QUOTE", ours[t], t, context_at(ours, t), A.partner[t], B.partner[t], ["extra quote"]))
    return out


def _runs(ins):
    """Group inserted scan tokens into runs of consecutive scan positions."""
    runs, cur = [], []
    for g, j, raw, core in sorted(ins, key=lambda x: x[1]):
        if cur and j == cur[-1][1] + 1:
            cur.append((g, j, raw, core))
        else:
            if cur:
                runs.append(cur)
            cur = [(g, j, raw, core)]
    if cur:
        runs.append(cur)
    return runs


def _merge_splits(cores, other):
    """Join neighbouring cores of a run when the other run has the joined word
    (a scan that splits "knowing" into "know ing")."""
    have = set(other)
    out, k = [], 0
    while k < len(cores):
        for n in (3, 2):
            j = "".join(cores[k : k + n])
            if len(cores[k : k + n]) == n and j in have:
                out.append((j, k, n))
                k += n
                break
        else:
            out.append((cores[k], k, 1))
            k += 1
    return out


def _lost(ours, A, B):
    out = []
    runs_b = _runs(B.ins)
    seen = set()
    for ra in _runs(A.ins):
        ga = ra[0][0]
        for rb in runs_b:
            gb = rb[0][0]
            if abs(ga - gb) > 3:
                continue
            ca0 = [x[3] for x in ra]
            cb0 = [x[3] for x in rb]
            ma = _merge_splits(ca0, cb0)
            mb = _merge_splits(cb0, ca0)
            ca = [m[0] for m in ma]
            cb = [m[0] for m in mb]
            sm = difflib.SequenceMatcher(None, ca, cb, autojunk=False)
            common = [(blk.a + d, blk.b + d) for blk in sm.get_matching_blocks() for d in range(blk.size)]
            if not common:
                continue
            words = [ca[x] for x, _ in common]
            key = (ga, tuple(words))
            if key in seen:
                continue
            seen.add(key)

            def raw(run, merged, idxs):
                parts = []
                for x in idxs:
                    _, k0, n = merged[x]
                    parts.append(" ".join(r[2] for r in run[k0 : k0 + n]))
                return " ".join(parts)

            wa = raw(ra, ma, [x for x, _ in common])
            wb = raw(rb, mb, [y for _, y in common])
            g = min(max(ga, 0), len(ours) - 1)
            kind = "NUMBER" if all(w.isdigit() for w in words) else "LOST"
            out.append(Finding(kind, ours[g], ga, gap_context(ours, ga), wa, wb, words))
    return out


# --------------------------------------------------------------------------
# Allowlist
# --------------------------------------------------------------------------
def apply_allowlist(findings, entries):
    errors, allowed = [], set()
    for e in entries:
        missing = [k for k in ("kind", "book", "chapter", "context", "reason") if k not in e or e[k] in ("", None)]
        if missing:
            errors.append(f"allowlist entry lacks {missing}: {e}")
            continue
        hits = [
            k
            for k, f in enumerate(findings)
            if f.kind == e["kind"]
            and str(f.book) == str(e["book"])
            and str(f.chapter) == str(e["chapter"])
            and e["context"] in f.context
        ]
        if len(hits) == 0:
            errors.append(f"stale allowlist entry (matches no finding): {e}")
        elif len(hits) > 1:
            errors.append(f"allowlist entry matches {len(hits)} findings, must match exactly one: {e}")
        else:
            allowed.add(hits[0])
    return [f for k, f in enumerate(findings) if k not in allowed], errors


# --------------------------------------------------------------------------
# Self-test
# --------------------------------------------------------------------------
NUMBER_WORDS = {"two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "twice"}
FILLERS = ["moreover", "certain", "number", "indeed", "therefore", "whatever", "another", "thing"]


def _clone(ours):
    out = []
    for t in ours:
        c = Tok(t.raw, t.book, t.chapter)
        out.append(c)
    return out


def selftest(ours, scanA, scanB, seed, per_type=5):
    rng = random.Random(seed)
    print(f"selftest seed {seed}")
    base, cov = run_check(ours, scanA, scanB)
    examined = sum(c["words"] for c in cov.values())
    print(f"baseline: {examined} words examined, scans {len(scanA)} / {len(scanB)} body words, {len(base)} findings")
    ok = True
    if examined < MIN_WORDS or len(scanA) < MIN_WORDS or len(scanB) < MIN_WORDS:
        print(f"FAIL: extraction too small (floor {MIN_WORDS} words); the check would be vacuous")
        return False

    # vacuity: with the scans removed the checker must refuse, not report clean
    f0, c0 = run_check(ours, [], [])
    if not any(c["A"] < MIN_ALIGN or c["B"] < MIN_ALIGN for c in c0.values()):
        print("FAIL: with extraction disabled the coverage gate did not trip")
        ok = False
    else:
        print("vacuity: with the scans removed the coverage gate trips (as it must)")

    # where is a plant safe? both scans match, away from existing findings
    n = len(ours)
    A = align_scan(ours, scanA)
    B = align_scan(ours, scanB)
    near = set()
    for f in base:
        for k in range(f.idx - 12, f.idx + 13):
            near.add(k)
    good = [
        i
        for i in range(12, n - 12)
        if i not in near
        and all(A.status[k] == "m" and B.status[k] == "m" for k in range(i - 4, i + 5))
    ]

    def clean_alpha(i):
        c = ours[i].core
        return c.isalpha() and len(c) >= 4 and ours[i].raw.isalpha()

    cand = {
        "lost word": [i for i in good if ours[i].core.isalpha() and len(ours[i].core) >= 3],
        "lost sentence": [],
        "changed number": [],
        "stray mark": [i for i in good if ours[i].raw[-1].isalpha()],
        "lost quote": [
            i
            for i in good
            if qcount(ours[i].raw) >= 1
            and qcount(A.partner[i]) >= 1
            and qcount(B.partner[i]) >= 1
            and len(
                {
                    sum(qcount(x) for x in seq)
                    for seq in (
                        [ours[k].raw for k in range(i - 3, i + 4)],
                        [A.partner[k] for k in range(i - 3, i + 4)],
                        [B.partner[k] for k in range(i - 3, i + 4)],
                    )
                }
            )
            == 1
        ],
        "changed word": [i for i in good if clean_alpha(i)],
        "inserted word": [i for i in good if ours[i].raw[-1].isalpha()],
    }
    sent_ends = ("." , "?", "!", ";")
    for i in good:
        if i > 0 and ours[i - 1].raw.endswith(sent_ends):
            j = i
            while j < n and not ours[j].raw.endswith(sent_ends) and j - i < 30:
                j += 1
            if 6 <= j - i + 1 <= 30 and j < n and all(A.status[k] == "m" and B.status[k] == "m" for k in range(i, j + 1)):
                cand["lost sentence"].append((i, j))
    for i in good:
        c = ours[i].core
        if c.isdigit() or c in NUMBER_WORDS:
            cand["changed number"].append(i)

    plan = []  # (orig_start, type, extra)
    taken = []

    def free(i, span=1):
        return all(abs(i - t) > 45 for t in taken)

    for typ, lst in cand.items():
        lst = list(lst)
        rng.shuffle(lst)
        got = 0
        for c in lst:
            i = c[0] if isinstance(c, tuple) else c
            if not free(i):
                continue
            if typ == "lost sentence" and any(abs(c[1] - t) <= 45 for t in taken):
                continue
            plan.append((i, typ, c))
            taken.append(i if typ != "lost sentence" else c[1])
            if typ == "lost sentence":
                taken.append(i)
            got += 1
            if got == per_type:
                break
        if got < 3:
            print(f"FAIL: only {got} safe places for '{typ}'")
            ok = False

    plan.sort(key=lambda p: p[0])
    new = _clone(ours)
    # final positions first: earlier deletions and insertions shift later places
    running = 0
    final = {}
    for i, typ, c in plan:
        final[(i, typ)] = i + running
        if typ == "lost word":
            running -= 1
        elif typ == "lost sentence":
            running -= c[1] - c[0] + 1
        elif typ == "inserted word":
            running += 1
    # apply from the end so earlier indexes stay valid
    for i, typ, c in sorted(plan, key=lambda p: -p[0]):
        t = new[i]
        if typ == "lost word":
            del new[i]
        elif typ == "lost sentence":
            del new[c[0] : c[1] + 1]
        elif typ == "changed number":
            if t.core.isdigit():
                d = t.raw
                new[i] = Tok(re.sub(r"\d", lambda m: str((int(m.group()) + 3) % 10), d, count=1), t.book, t.chapter)
            else:
                new[i] = Tok(str(rng.randint(11, 98)) + re.sub(r"^[A-Za-z]+", "", t.raw), t.book, t.chapter)
        elif typ == "stray mark":
            if rng.random() < 0.5:
                new[i] = Tok(t.raw + rng.choice(["°", "*", "®", "†", "¶"]), t.book, t.chapter)
            else:
                new[i] = Tok(t.raw + "." + str(rng.randint(1, 9)) if not t.raw[-1] in ".,;:" else t.raw + "3", t.book, t.chapter)
        elif typ == "lost quote":
            new[i] = Tok("".join(ch for ch in t.raw if ch not in QUOTES), t.book, t.chapter)
        elif typ == "changed word":
            letters = [k for k, ch in enumerate(t.raw) if ch.isalpha()]
            k = rng.choice(letters[1:-1] or letters)
            alt = rng.choice([ch for ch in "abcdefghijklmnopqrstuvwxyz" if ch != t.raw[k].lower()])
            new[i] = Tok(t.raw[:k] + alt + t.raw[k + 1 :], t.book, t.chapter)
        elif typ == "inserted word":
            new.insert(i + 1, Tok(rng.choice(FILLERS), t.book, t.chapter))
    # inserted word sits after i, at final index i+running_before+1
    found, _ = run_check(new, scanA, scanB)
    by_kind = defaultdict(list)
    for f in found:
        by_kind[f.kind].append(f)
    want = {
        "lost word": ("LOST",),
        "lost sentence": ("LOST",),
        "changed number": ("NUMBER",),
        "stray mark": ("MARK",),
        "lost quote": ("QUOTE",),
        "changed word": ("WORD",),
        "inserted word": ("EXTRA",),
    }
    table = {}
    tol = 2
    for i, typ, c in plan:
        pos = final[(i, typ)] + (1 if typ == "inserted word" else 0)
        hit = False
        if typ == "lost sentence":
            # an aligner may split one lost sentence at a repeated word; count them together
            got = sum(len(f.words) for f in by_kind["LOST"] if abs(f.idx - pos) <= 4)
            hit = got >= (c[1] - c[0] + 1) * 0.6
        else:
            hit = any(abs(f.idx - pos) <= tol for kind in want[typ] for f in by_kind[kind])
        pl, ca = table.get(typ, (0, 0))
        table[typ] = (pl + 1, ca + (1 if hit else 0))
        if not hit:
            print(f"  MISSED {typ} at ours index {pos}: {context_at(new, min(max(pos,0), len(new)-1))}")
            for f in found:
                if abs(f.idx - pos) <= 8:
                    print(f"     nearby: {f.line()}")
    print(f"{'defect':<16}{'planted':>8}{'caught':>8}")
    for typ in want:
        pl, ca = table.get(typ, (0, 0))
        print(f"{typ:<16}{pl:>8}{ca:>8}")
        if pl < 3 or ca != pl:
            ok = False
    print("selftest:", "PASS" if ok else "FAIL")
    return ok


# --------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--books", type=Path, default=DEFAULT_BOOKS, help="directory with book-01.html, book-02.html")
    ap.add_argument("--standin", action="store_true", help="use the Wikisource wikitext as our text")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--seed", type=int, default=20261106)
    ap.add_argument("--max-print", type=int, default=400)
    args = ap.parse_args(argv)

    for p in (HOCR_A, HOCR_B):
        if not p.exists():
            print(f"missing scan {p}", file=sys.stderr)
            return 2
    stats = {"A": Counter(), "B": Counter()}
    stats["A"]["words_by_page"] = {}
    stats["B"]["words_by_page"] = {}
    scanA = scan_stream(HOCR_A, 0, stats["A"])
    scanB = scan_stream(HOCR_B, B_OFFSET, stats["B"])
    print(
        f"scan A: {stats['A']['pages']} pages, {len(scanA)} body words "
        f"(dropped: {stats['A']['head_lines']} head lines, {stats['A']['foot_lines']} foot lines, "
        f"{stats['A']['margin_words']} margin words, {stats['A']['superscript_words']} superscripts; "
        f"{stats['A']['rebuilt_pages']} askew pages re-lined)"
    )
    print(
        f"scan B: {stats['B']['pages']} pages, {len(scanB)} body words "
        f"(dropped: {stats['B']['head_lines']} head lines, {stats['B']['foot_lines']} foot lines, "
        f"{stats['B']['margin_words']} margin words, {stats['B']['superscript_words']} superscripts; "
        f"{stats['B']['rebuilt_pages']} askew pages re-lined)"
    )
    for pg in range(FIRST_PAGE, LAST_PAGE + 1):
        na, nb = stats["A"]["words_by_page"].get(pg, 0), stats["B"]["words_by_page"].get(pg, 0)
        if abs(na - nb) > max(25, 0.12 * max(na, nb)):
            print(f"warning: page {pg}: scan A has {na} body words, scan B {nb} (extraction may have cut a page)")
    if stats["A"]["pages"] != LAST_PAGE - FIRST_PAGE + 1 or stats["B"]["pages"] != LAST_PAGE - FIRST_PAGE + 1:
        print("scan page range incomplete", file=sys.stderr)
        return 2

    if args.standin:
        ours = parse_standin()
        src = "stand-in (Wikisource wikitext)"
    else:
        if not list(args.books.glob("book-*.html")):
            print(f"no book-*.html in {args.books}; use --standin to develop", file=sys.stderr)
            return 2
        ours = parse_books_dir(args.books)
        src = str(args.books)
    print(f"ours: {src}, {len(ours)} words")

    if args.selftest:
        return 0 if selftest(ours, scanA, scanB, args.seed) else 1

    findings, cov = run_check(ours, scanA, scanB)
    total = sum(c["words"] for c in cov.values())
    print("coverage (words of ours examined; % aligned to each scan):")
    low = False
    for b, c in cov.items():
        print(f"  book {b}: {c['words']} words, A {c['A']:.1%}, B {c['B']:.1%}")
        if c["words"] == 0 or c["A"] < MIN_ALIGN or c["B"] < MIN_ALIGN:
            low = True
    if total == 0:
        print("NOTHING EXAMINED", file=sys.stderr)
        return 2
    if total < MIN_WORDS or len(scanA) < MIN_WORDS or len(scanB) < MIN_WORDS:
        # a cut-down extraction can align 100% and find nothing
        print(f"EXTRACTION TOO SMALL (floor {MIN_WORDS} words): ours {total}, "
              f"A {len(scanA)}, B {len(scanB)}", file=sys.stderr)
        return 2
    if low:
        print(f"COVERAGE BELOW {MIN_ALIGN:.0%}: the check cannot vouch for this text", file=sys.stderr)
        return 2

    errors = []
    if not args.standin:
        entries = json.loads(ALLOW_PATH.read_text(encoding="utf8")) if ALLOW_PATH.exists() else []
        findings, errors = apply_allowlist(findings, entries)

    findings.sort(key=lambda f: (f.book, f.idx))
    counts = Counter(f.kind for f in findings)
    for f in findings[: args.max_print]:
        print(f.line())
    if len(findings) > args.max_print:
        print(f"... {len(findings) - args.max_print} more")
    for e in errors:
        print("ERROR", e)
    print("findings: " + ", ".join(f"{k} {counts.get(k, 0)}" for k in KINDS) + f" (total {len(findings)})")
    return 1 if findings or errors else 0


if __name__ == "__main__":
    sys.exit(main())
