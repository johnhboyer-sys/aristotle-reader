"""De Plantis: E. S. Forster's English (The Works of Aristotle vol. VI, Oxford
1913; US public domain) from five OCR readings of four scans.

Reads (never committed; build/plant-ocr/forster/, fetched from archive.org):
  A  works0006aris_hocr.html                    archive.org hOCR, leaves 83-120 (primary:
                                                layout, margins, paragraphs)
  B  worksofaristotle06arisuoft_hocr.html       a second scan; its leaf = A's leaf - 5
  C  ocrC/C{n}.hocr                             tesseract 5 (`tesseract A{n}.jpg C{n} -l eng
                                                hocr`) of A's page images
                                                archive.org/download/works0006aris/page/n{n}.jpg,
                                                which are A's leaf n+1
  D  worksofaristotle0006wdro_t4d9_djvu.txt     third scan, text only
  E  worksofaristotle0006wdro_j7j2_djvu.txt     fourth scan, text only

Writes sources/plant-forster/book-01.html, book-02.html (one `Part N` per
Forster chapter, `<p>` per printed paragraph) and anchors.yaml (Forster's
printed margin numbers; `at` is the start of the printed line each stands
beside).

How it works
  1. Layout (A, B, C). Each page's body edges are fitted from the line starts
     and ends (the scans are skewed); a word outside them is in a margin. The
     outer margin carries Bekker numbers, the inner one chapter numbers. The
     running head is the first line; footnotes start at the first line set
     smaller after a gap.
  2. Each reading becomes one word stream: footnote marks dropped (OCR reads
     the raised figures as * ° ® ! ? digits or a stray Greek letter), a word
     broken at a line end kept as one token.
  3. B, C, D and E are word-aligned to A; each word takes the reading most
     scans agree on. A word most scans have and A lacks is put in; one only A
     has is dropped. Places the vote cannot settle are printed, and each was
     settled from the page image in PRINT_READS.
  4. A line-end hyphen is kept when the joined form is not an English word
     the repo's other translations use and both halves are (gum-arabic).

Run from pipeline/:
  uv run python tools/build_plant_forster.py build   # writes sources/plant-forster/, prints the report
  uv run python tools/build_plant_forster.py check   # exit 1 if the sources are stale
Standard library only, but for the pipeline's own parser (paragraph offsets). The text check is tools/verify_plant_forster.py.
"""
from __future__ import annotations

import argparse
import difflib
import html
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "build" / "plant-ocr" / "forster"
OUT = ROOT / "sources" / "plant-forster"
LEAVES = range(83, 121)          # A's leaves: 83 opens Book I, 120 ends the work
B_SHIFT = -5                     # B's leaf for A's leaf
C_SHIFT = -1                     # C's image number for A's leaf

MARKS = "*®°©¹²³⁴⁵⁶⁷⁸⁹†‡§"
GREEK = re.compile(r"[Ͱ-Ͽἀ-῿]")


# ------------------------------------------------------------------ hOCR

_LINE = re.compile(r"<span class=['\"]ocr_line['\"][^>]*title=['\"]([^'\"]*)['\"][^>]*>(.*?)"
                   r"(?=<span class=['\"]ocr_line|</p>|</div>)", re.S)
_WORD = re.compile(r"<span class=['\"]ocrx_word['\"][^>]*title=['\"]([^'\"]*)['\"][^>]*>(.*?)</span>", re.S)
_BBOX = re.compile(r"bbox (\d+) (\d+) (\d+) (\d+)")


def _lines(chunk: str) -> list[dict]:
    out = []
    for lm in _LINE.finditer(chunk):
        xs = re.search(r"x_size ([\d.]+)", lm.group(1))
        words = []
        for wm in _WORD.finditer(lm.group(2)):
            t = html.unescape(re.sub(r"<[^>]+>", "", wm.group(2))).strip()
            if t:
                words.append({"t": t, "bb": tuple(int(x) for x in _BBOX.search(wm.group(1)).groups())})
        if words:
            bb = tuple(int(x) for x in _BBOX.search(lm.group(1)).groups())
            out.append({"bb": bb, "xs": float(xs.group(1)) if xs else 0.0, "words": words})
    out.sort(key=lambda l: (l["bb"][1], l["bb"][0]))
    return out


def parse_hocr(path: Path) -> dict[int, list[dict]]:
    s = path.read_text(encoding="utf-8")
    pages = {}
    for chunk in re.split(r"(?=<div class=['\"]ocr_page['\"])", s)[1:]:
        leaf = int(re.search(r"id=['\"]page_(\d+)['\"]", chunk).group(1))
        pages[leaf] = _lines(chunk)
    return pages


def witness_pages(name: str) -> dict[int, list[dict]]:
    """{A leaf: hOCR lines} for one of A, B, C."""
    if name == "A":
        p = parse_hocr(OCR / "works0006aris_hocr.html")
        return {leaf: p[leaf] for leaf in LEAVES}
    if name == "B":
        p = parse_hocr(OCR / "worksofaristotle06arisuoft_hocr.html")
        return {leaf: p[leaf + B_SHIFT] for leaf in LEAVES}
    return {leaf: _lines((OCR / "ocrC" / f"C{leaf + C_SHIFT}.hocr").read_text(encoding="utf-8"))
            for leaf in LEAVES}


# ---------------------------------------------------------------- layout

def _fit(pts):
    """x = a + b*y by least squares (b = 0 for fewer than two points)."""
    if len(pts) < 2:
        return (pts[0][1] if pts else 0.0), 0.0
    my = statistics.fmean(y for y, _ in pts)
    mx = statistics.fmean(x for _, x in pts)
    syy = sum((y - my) ** 2 for y, _ in pts)
    b = sum((y - my) * (x - mx) for y, x in pts) / syy if syy else 0.0
    return mx - b * my, b


def layout(lines: list[dict], recto: bool) -> dict:
    """One page -> {"head", "body": [line], "notes"}; a body line is
    {y, words, x0, x1, left, right, outer: [str], inner: [str]}. The outer
    margin (right on a recto, left on a verso) carries the Bekker numbers, the
    inner one the chapter numbers."""
    if not lines:
        return {"head": [], "body": [], "notes": []}
    widths = [l["bb"][2] - l["bb"][0] for l in lines]
    wide = max(widths)
    long_ = [l for l, w in zip(lines, widths) if w > 0.6 * wide and len(l["words"]) > 4]
    size = statistics.median(l["xs"] for l in long_)
    x0s = [l["words"][0]["bb"][0] for l in long_ if l["words"][0]["t"][:1].isalpha()]
    x1s = [l["words"][-1]["bb"][2] for l in long_ if l["words"][-1]["t"][-1:].isalpha() or
           l["words"][-1]["t"][-1:] in ",.;:"]
    mx0, mx1 = statistics.median(x0s), statistics.median(x1s)
    la, lb = _fit([(l["bb"][1], l["words"][0]["bb"][0]) for l in long_
                   if abs(l["words"][0]["bb"][0] - mx0) < 20])
    ra, rb = _fit([(l["bb"][1], l["words"][-1]["bb"][2]) for l in long_
                   if abs(l["words"][-1]["bb"][2] - mx1) < 20])
    ys = sorted(l["bb"][1] for l in long_)
    pitch = statistics.median(b - a for a, b in zip(ys, ys[1:]) if 0.7 * size < b - a < 2 * size)
    head, body, notes, margin = [], [], [], []

    def side(x_right_of_body: bool) -> str:
        return "outer" if x_right_of_body == recto else "inner"

    for i, l in enumerate(lines):
        y = l["bb"][1]
        yc = (l["bb"][1] + l["bb"][3]) / 2
        left, right = la + lb * y, ra + rb * y
        words = l["words"]
        text = " ".join(w["t"] for w in words)
        if all(w["bb"][2] < left - 6 or w["bb"][0] > right + 6 for w in words):
            for w in words:      # a margin token the OCR set as a line of its own
                margin.append((side(w["bb"][0] > right), w["t"], (w["bb"][1] + w["bb"][3]) / 2))
            continue
        if not body and not notes:
            nxt = next((m["bb"][1] for m in lines[i + 1:] if m["bb"][1] > l["bb"][3]), y + pitch)
            if re.search(r"PLANTIS|BOOK", text) or widths[i] < 0.5 * wide or (i == 0 and nxt - y > 1.4 * pitch):
                head.append(l)
                continue
        if len(body) > 8 and not notes and l["xs"] < 0.92 * size:
            later = [m for m in lines[i + 1:] if m["bb"][1] > y + 0.5 * pitch]
            if y - body[-1]["y"] > 1.08 * pitch and (not later or later[0]["xs"] < 0.92 * size):
                notes.append(l)
                continue
        if notes:
            notes.append(l)
            continue
        rec = {"y": y, "yc": yc, "words": [], "outer": [], "inner": [], "left": left, "right": right}
        for w in words:
            t = w["t"]
            wy = (w["bb"][1] + w["bb"][3]) / 2
            m = re.fullmatch(r"(\D+?)(\d[\d°*%ᵃᵇ”\"]*)", t)
            if w["bb"][2] < left - 6:
                margin.append((side(False), t, wy))
            elif w["bb"][0] > right + 6:
                margin.append((side(True), t, wy))
            elif w["bb"][2] > right + 15 and m:     # "in15": a word and its margin number
                rec["words"].append(m.group(1))
                margin.append((side(True), m.group(2), wy))
            else:
                if not rec["words"]:
                    rec["x0"] = w["bb"][0]
                rec["words"].append(t)
                rec["x1"] = w["bb"][2]
        if rec["words"]:
            body.append(rec)
    for sd, t, wy in margin:
        if not body:
            break
        near = min(body, key=lambda r: abs(r["yc"] - wy))
        if abs(near["yc"] - wy) < 0.6 * pitch:
            near[sd].append(t)
    return {"head": head, "body": body, "notes": notes, "pitch": pitch, "size": size}


# --------------------------------------------------------------- streams

BREAK = "¬"        # a word broken at a line end, inside one token: "unprofit-¬able"


def _join_breaks(lines: list[list[str]]) -> list[tuple[str, int]]:
    """Lines of words -> [(token, line index)], a word hyphenated across a line
    end kept as one token on the earlier line."""
    out: list[tuple[str, int]] = []
    carry = None
    for k, words in enumerate(lines):
        words = list(words)
        if carry is not None and words:
            words[0] = carry[0] + BREAK + words[0]
            out.append((words[0], carry[1]))
            words = words[1:]
            carry = None
        for j, w in enumerate(words):
            if j == len(words) - 1 and re.search(r"[A-Za-z][-‐¬]$", w) and k + 1 < len(lines):
                carry = (w[:-1] + "-", k)
            else:
                out.append((w, k))
    if carry:
        out.append(carry)
    return out


_GLUED = re.compile(rf"(?<=[A-Za-z.,;:’”)\]])[\d{MARKS}]+")


def clean(tokens: list[str]) -> list[tuple[int, str]]:
    """Footnote marks out of a word stream -> [(index, token)] of the tokens
    kept. The raised figures come through as a glued * ° ® or digit, or as a
    token of their own (a digit, a mark, a stray Greek letter); a ? or ! on a
    word before a lower-case one is one too."""
    out: list[tuple[int, str]] = []
    quoting = False
    for i, t in enumerate(tokens):
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        m = re.fullmatch(rf"([;:,.)])[\d{MARKS}?!}}t‘\"“”]*", t)
        if m and out:            # the old spaced stop, its note figure glued on: "desire ;*"
            out[-1] = (out[-1][0], out[-1][1] + m.group(1))
            continue
        t = _GLUED.sub("", t)
        t = re.sub(r"[“”\"+]", "", t)        # Forster quotes with single marks; these are note figures
        t = re.sub(r"(?<=[,;.:])[?!}t‘\"]+$", "", t)          # has;?  warm,}  hand,‘
        if re.fullmatch(r".*[A-Za-z][?!]", t) and (t[-1] == "!" or nxt[:1].islower()):
            t = t[:-1]                                       # Forster prints no "!"
        t = t.strip(MARKS + "<>")
        if "‘" in t[:1]:
            quoting = True
        if re.search(r"’[.,;:]?$", t) and quoting:
            quoting = False
        elif re.search(r"[^s]’[.,;:]?$|[.,;:]’$", t):     # a note figure read as a quote mark
            t = re.sub(r"’(?=[.,;:]?$)", "", t)
        t = re.sub(r"‘$", "", t)
        if not t or re.fullmatch(rf"[\d{MARKS}?!|_.,:;'‘’\"“”>»«<~=+•-]+", t) or \
                (len(t) <= 2 and GREEK.search(t)):
            continue
        out.append((i, t))
    return out


def key(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.replace(BREAK, "").lower())


def a_stream() -> tuple[list[str], list[tuple[int, int]], dict]:
    """A's body tokens, each with its (leaf, body line) for layout."""
    P = witness_pages("A")
    lines, refs, pages = [], [], {}
    for leaf in LEAVES:
        L = layout(P[leaf], leaf % 2 == 1)
        pages[leaf] = L
        for i, b in enumerate(L["body"]):
            lines.append(b["words"])
            refs.append((leaf, i))
    toks = _join_breaks(lines)
    kept = clean([t for t, _ in toks])
    return [t for _, t in kept], [refs[toks[i][1]] for i, _ in kept], pages


def other_stream(name: str) -> list[str]:
    if name in "BC":
        P = witness_pages(name)
        lines = [b["words"] for leaf in LEAVES for b in layout(P[leaf], leaf % 2 == 1)["body"]]
    else:
        f = {"D": "worksofaristotle0006wdro_t4d9_djvu.txt", "E": "worksofaristotle0006wdro_j7j2_djvu.txt"}[name]
        text = (OCR / f).read_text(encoding="utf-8")
        a = re.search(r"\n\S{0,3} ?Lire is found in animals", text).start()
        b = text.index("Here ends the book on Plants")
        lines = [l.split() for l in text[a:b].splitlines() if l.strip()]
    return [t for _, t in clean([t for t, _ in _join_breaks(lines)])]


# ------------------------------------------------------------------ vote

def vote(A: list[str], others: dict[str, list[str]]):
    """A's tokens with every other reading aligned to them. Returns (tokens,
    origin, report): origin[i] is the A index a token stands at; a line put in
    from the other scans has -1 - (the A index after it)."""
    ka = [key(t) for t in A]
    reads = [[t] for t in A]
    dels = [0] * len(A)
    ins: dict[int, list[tuple]] = {}
    seg: dict[tuple[int, int], list[tuple]] = {}
    def walk(name, kw, W, i0, i1, j0, j1, fine):
        sm = difflib.SequenceMatcher(None, ka[i0:i1], kw[j0:j1], autojunk=not fine)
        for op, a1, a2, b1, b2 in sm.get_opcodes():
            a1, a2, b1, b2 = a1 + i0, a2 + i0, b1 + j0, b2 + j0
            if op == "equal" or (op == "replace" and a2 - a1 == b2 - b1):
                for d in range(a2 - a1):
                    reads[a1 + d].append(W[b1 + d])
            elif op == "delete":
                for i in range(a1, a2):
                    dels[i] += 1
            elif op == "insert":
                ins.setdefault(a1, []).append((name, tuple(W[b1:b2])))
            elif "".join(ka[a1:a2]) == "".join(kw[b1:b2]):     # the same letters, spaced otherwise
                seg.setdefault((a1, a2), []).append(tuple(W[b1:b2]))
            elif not fine:                                    # look closer without the junk heuristic
                walk(name, kw, W, a1, a2, b1, b2, True)
            elif a2 - a1 == 1 and BREAK in A[a1] and b2 - b1 >= 2 and \
                    kw[b2 - 1] == key(A[a1].split(BREAK)[1]) and kw[b1].startswith(key(A[a1].split(BREAK)[0])):
                # A lost the printed line between a broken word's halves and
                # joined the head to the next line's first word
                reads[a1].append(W[b1])
                ins.setdefault(a1 + 1, []).append((name, tuple(W[b1 + 1:b2])))

    for name, W in others.items():
        kw = [key(t) for t in W]
        walk(name, kw, W, 0, len(ka), 0, len(kw), False)
    out, origin, report = [], [], {"unsettled": [], "dropped": [], "inserted": [], "changed": 0,
                                   "respaced": []}
    respace = {}
    for (i1, i2), alts in seg.items():
        c = Counter(tuple(key(x) for x in a) for a in alts)
        alt, n = c.most_common(1)[0]
        keep = sum(1 for i in range(i1, i2) for _ in [0]) and min(len(reads[i]) for i in range(i1, i2))
        if n > keep and len(alt) > i2 - i1:      # only ever split a run-together word
            respace[i1] = (i2, Counter(a for a in alts if tuple(key(x) for x in a) == alt).most_common(1)[0][0])
    skip_to = -1
    for i, t in enumerate(A):
        if i < skip_to:
            continue
        if i in respace:
            i2, surf = respace[i]
            report["respaced"].append((A[i:i2], surf))
            out += list(surf)
            origin += [i] * len(surf)
            skip_to = i2
            continue
        if i in ins:
            # Words A lacks: a run one of the layout readings (B, C) has that
            # another scan's run contains (theirs may carry notes or margin
            # junk around it). D and E alone carry the footnotes too.
            best_run = None
            for name, run in ins[i]:
                if name not in "BC" or not run:
                    continue
                k = " " + " ".join(key(x) for x in run) + " "
                sup = sum(1 for n2, r2 in ins[i] if n2 != name and k in " " + " ".join(key(x) for x in r2) + " ")
                if sup >= 1 and (best_run is None or sup > best_run[0]):
                    best_run = (sup, run)
            if best_run:
                out += list(best_run[1])
                # A word or two A lost opens the next line (OCR read "So" in
                # small capitals, "of" as Greek); a longer run is a printed
                # line A lost whole, which has no A line of its own.
                origin += [i if len(best_run[1]) <= 2 else -1 - i] * len(best_run[1])
                report["inserted"].append((i, best_run[1]))
        if dels[i] >= 3:
            report["dropped"].append((i, t))
            continue
        c = Counter(reads[i])
        best, n = c.most_common(1)[0]
        top = [r for r, m in c.items() if m == n]
        if t in top:
            best = t
        if best != t:
            report["changed"] += 1
            report.setdefault("changes", []).append((i, t, best, reads[i]))
        report.setdefault("reads", {})[len(out)] = reads[i]
        if len(top) > 1 or n < 3:
            report["unsettled"].append((i, reads[i]))
        out.append(best)
        origin.append(i)
    return out, origin, report


# ------------------------------------------------------------- the text

def vocabulary() -> Counter:
    """Word counts across the repo's other English translations."""
    c: Counter = Counter()
    for p in (ROOT / "sources").glob("*/*.html"):
        if p.parent.name == OUT.name:
            continue
        for w in re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)*", html.unescape(p.read_text(encoding="utf-8", errors="ignore"))):
            c[w.lower()] += 1
    return c


def unbreak(tokens: list[str], vocab: Counter) -> tuple[list[str], list]:
    """Each word broken at a line end, rejoined, or kept hyphenated where
    Forster wrote the hyphen (both halves words, the joined form not one)."""
    own = Counter(key(t) for t in tokens if BREAK not in t)
    own_h = Counter(re.sub(r"[^a-z-]", "", t.lower()) for t in tokens if BREAK not in t and "-" in t)
    out, doubt = [], []
    for t in tokens:
        if BREAK not in t:
            out.append(t)
            continue
        head, tail = t.split(BREAK)
        joined, hyph = head[:-1] + tail, head + tail
        kj = re.sub(r"[^a-z]", "", joined.lower())
        kh = re.sub(r"[^a-z-]", "", hyph.lower())
        h1, h2 = (re.sub(r"[^a-z]", "", x.lower()) for x in (head, tail))
        if own_h[kh] or (vocab[kh] > vocab[kj] and not own[kj]):
            out.append(hyph)
        elif own[kj] or vocab[kj]:
            out.append(joined)
        elif vocab[h1] and vocab[h2] and len(h1) > 2 and len(h2) > 2:
            out.append(hyph)
            doubt.append((hyph, "kept: neither form known, both halves words"))
        else:
            out.append(joined)
            doubt.append((joined, "joined: neither form known"))
    return out, doubt


# ---------------------------------------------------------- margin numbers

def spine_columns() -> list[tuple[str, list[int]]]:
    """[(column, [line numbers])] of the Greek spine, in order."""
    xml = (ROOT / "sources" / "plant-greek" / "bekker-lines.xml").read_text(encoding="utf-8")
    cols = []
    for m in re.finditer(r'<div type="Bekker-page" n="(\d+[ab])">(.*?)</div>', xml, re.S):
        cols.append((m.group(1), [int(n) for n in re.findall(r'<l n="(\d+)">', m.group(2))]))
    return cols


def expected_marks() -> list[tuple[str, int | None]]:
    """What Forster's margin should carry: each column's label at its first
    line, then every fifth line."""
    out = []
    for col, ns in spine_columns():
        out.append((col, None))
        out += [(col, n) for n in ns[1:] if n % 5 == 0]
    return out


def _line_map(a_lines, w_lines) -> dict[int, int]:
    """{w line: A line} on one page, by the lines' words."""
    ka = [" ".join(key(t) for t in l["words"][:4]) for l in a_lines]
    kw = [" ".join(key(t) for t in l["words"][:4]) for l in w_lines]
    m = {}
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ka, kw, autojunk=False).get_opcodes():
        if op == "equal" or (op == "replace" and i2 - i1 == j2 - j1):
            for d in range(i2 - i1):
                m[j1 + d] = i1 + d
    return m


def observed_marks(pages: dict) -> list[dict]:
    """Every A body line with anything in its outer margin in A, B or C:
    {leaf, line, reads: [str]}, in reading order."""
    wl = {w: witness_pages(w) for w in "BC"}
    obs = []
    for leaf in LEAVES:
        a = pages[leaf]["body"]
        reads: dict[int, list[str]] = {i: ["".join(l["outer"])] for i, l in enumerate(a)}
        for w in "BC":
            wb = layout(wl[w][leaf], leaf % 2 == 1)["body"]
            for j, i in _line_map(a, wb).items():
                reads[i].append("".join(wb[j]["outer"]))
        for i in range(len(a)):
            r = [x for x in reads[i] if x]
            if r:
                obs.append({"leaf": leaf, "line": i, "reads": reads[i]})
    return obs


_DIG = str.maketrans({"o": "0", "O": "0", "°": "0", "ο": "0", "Ο": "0", "I": "1", "l": "1", "i": "1",
                      "ι": "1", "Ι": "1", "|": "1", "t": "1", "τ": "1", "r": "1", "S": "5", "s": "5",
                      ";": "5", "σ": "5", "g": "4", "a": "2", "Z": "2"})


def _digits(r: str) -> str:
    for five in ("σι", "or", "Or", "on", "wm", "Ww"):      # an old-style 5, read as letters
        r = r.replace(five, "5")
    return re.sub(r"\D", "", r.translate(_DIG))


def _fits(r: str, want: tuple[str, int | None]) -> int:
    """1 if reading r can be the mark `want`, -1 if it reads as another
    number, 0 if it cannot be read."""
    d = _digits(r)
    if not d:
        return 0
    col, n = want
    if n is None:
        return 1 if d[:3] == col[:3] or (len(d) >= 3 and sorted(d[:3]) == sorted(col[:3])) or \
            (len(d) >= 3 and d[0] == "8" and d[2:3] == col[2]) else -1
    s = str(n)
    if d == s or sorted(d) == sorted(s):
        return 1
    return -1


def read_marks(obs: list[dict], expect: list) -> tuple[dict, list]:
    """Align the observed margin lines with the expected marks (dynamic
    programming): {expected index: observed index}, and the problems."""
    def score(o, e):
        if "forced" in obs[o]:
            return 10 if obs[o]["forced"] == mark_name(expect[e]) else -100
        fits = [_fits(r, expect[e]) for r in obs[o]["reads"] if r]
        if any(f == 1 for f in fits):
            return 3 + fits.count(1)
        return -4 if any(f == -1 for f in fits) else 0
    n, m = len(obs), len(expect)
    NEG = -10 ** 9
    best = [[NEG] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    best[0][0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            v = best[i][j]
            if v == NEG:
                continue
            if i < n:   # observed line is no mark
                junk = -1 if any(_digits(r) for r in obs[i]["reads"]) else -0.2
                if v + junk > best[i + 1][j]:
                    best[i + 1][j], back[i + 1][j] = v + junk, (i, j, "junk")
            if j < m:   # expected mark not seen
                if v - 2 > best[i][j + 1]:
                    best[i][j + 1], back[i][j + 1] = v - 2, (i, j, "miss")
            if i < n and j < m:
                s = v + score(i, j)
                if s > best[i + 1][j + 1]:
                    best[i + 1][j + 1], back[i + 1][j + 1] = s, (i, j, "match")
    i, j, match, probs = n, m, {}, []
    while (i, j) != (0, 0):
        pi, pj, kind = back[i][j]
        if kind == "match":
            match[pj] = pi
            if score(pi, pj) <= 0:
                probs.append(("unread", expect[pj], obs[pi]))
        elif kind == "miss":
            probs.append(("missing", expect[pj], None))
        elif any(_digits(r) for r in obs[pi]["reads"]):
            probs.append(("extra", None, obs[pi]))
        i, j = pi, pj
    return match, probs[::-1]


# ----------------------------------------------------------------- output

# Readings settled from the page images (archive.org works0006aris, the leaf
# in each note), where every scan misread alike or the vote chose wrong. Each
# `old` must be in the voted text exactly once, or the build stops.
PRINT_READS = [
    ("sexes ornot.", "sexes or not.", "83: word space"),
    ("soul. Buta plant", "soul. But a plant", "86: word space"),
    ("generates 7m another,", "generates in another,", "87: italic in"),
    ("in itself Some one", "in itself. Some one", "86: itself.⁴"),
    ("three coverings.. All", "three coverings. All", "91: a speck after the stop"),
    ("desert wind )....", "desert wind). . . .", "92: wind⁵). . . .⁶, four stops (vol6_genie.py, r3i1 leaf 92)"),
    ("called vargariaton!; in", "called vargariaton; in", "94: vargariaton¹;"),
    ("have anumber of", "have a number of", "95: word space"),
    ("others in 4otivers.", "others in rivers.", "96: the margin 40 ran into the word"),
    ("many others., Empedocles", "many others. Empedocles", "90: others.²"),
    ("are present, Sometimes only", "are present, sometimes only", "98: lower-case s"),
    ("five causes of plants, Trees", "five causes of plants. Trees", "113: plants."),
    ("of assimilation, Consequently", "of assimilation. Consequently", "120: assimilation."),
    ("harsh flavour, Next,", "harsh flavour. Next,", "120: flavour."),
    ("and gumarabic. Some", "and gum-arabic. Some", "90: gum- at the line end, arabic."),
    ("and intelligence For nature,", "and intelligence. For nature,", "85: intelligence.¹"),
    ("in (almost) all", "in ⟨almost⟩ all", "94: Forster's angle brackets"),
    ("real fruits,!as we", "real fruits, as we", "114: fruits,¹ as"),
    ("said. Thesame theory", "said. The same theory", "114: word space"),
    ("ducts Within will", "ducts within will", "116: lower-case w"),
    ("finally bitter, [he reason", "finally bitter. The reason", "120: bitter. The"),
    # Against History Genie's read of the volume (tools/vol6_genie.py), judged
    # on the images of archive.org worksofaristotle0001unse_r3i1 (its leaf).
    ("father of plants?", "father of plants.", "r3i1 leaf 88: plants.², no question mark"),
    ("dissimilar parts?", "dissimilar parts", "r3i1 leaf 91: parts⁷, no question mark"),
]

# Each chapter opens with its first word(s) in small capitals, which the OCR
# reads every which way (Lire, pLant, Puants, Tue); as printed, in plain case.
OPENINGS = {
    (1, 1): "Life is", (1, 2): "Let us", (1, 3): "Some trees", (1, 4): "Some plants",
    (1, 5): "A plant which", (1, 6): "In aromatic", (1, 7): "Again, some",
    (2, 1): "A plant has", (2, 2): "We have", (2, 3): "So too", (2, 4): "Plants which",
    (2, 5): "A plant which", (2, 6): "Every plant", (2, 7): "Trees have",
    (2, 8): "Greenness must", (2, 9): "The shedding", (2, 10): "Fruit will",
}
CHAPTERS = {1: 7, 2: 10}
BOOK2_LEAF = 101                 # Book II opens at the head of this page
END = "Here ends the book on Plants."   # Forster's closing line, from the Latin; not text


def print_reads(tokens: list[str], origin: list[int]) -> tuple[list[str], list[int]]:
    for old, new, why in PRINT_READS:
        o, n = old.split(), new.split()
        hits = [k for k in range(len(tokens) - len(o) + 1) if tokens[k:k + len(o)] == o]
        if len(hits) != 1:
            raise ValueError(f"PRINT_READS {old!r} ({why}): found {len(hits)} times")
        k = hits[0]
        tokens = tokens[:k] + n + tokens[k + len(o):]
        origin = origin[:k] + [origin[k + min(j, len(o) - 1)] for j in range(len(n))] + origin[k + len(o):]
    return tokens, origin


def structure(tokens, origin, at, pages) -> list[tuple[int, int, list[list[str]]]]:
    """[(book, chapter, [paragraph tokens])]: chapters where A's inner margin
    carries the chapter number, paragraphs where A's line is indented."""
    starts = {}            # A line -> "chapter" | "para"
    for leaf in LEAVES:
        for i, b in enumerate(pages[leaf]["body"]):
            ch = "".join(b["inner"]).translate(_DIG)
            if b["x0"] - b["left"] > 25 or (leaf in (LEAVES[0], BOOK2_LEAF) and i == 0):
                starts[(leaf, i)] = "para"
            if re.fullmatch(r"\d{1,2}", ch) or (leaf in (LEAVES[0], BOOK2_LEAF) and i == 0):
                starts[(leaf, i)] = "chapter"
    out, seen = [], set()
    book, chap = 1, 0
    for k, t in enumerate(tokens):
        line = at[origin[k]] if origin[k] >= 0 else None
        first = line is not None and line not in seen
        seen.add(line)
        kind = starts.get(line) if first else None
        if kind == "chapter":
            if line[0] == BOOK2_LEAF and line[1] == 0:
                book, chap = 2, 0
            chap += 1
            out.append((book, chap, [[]]))
        elif kind == "para":
            out[-1][2].append([])
        out[-1][2][-1].append(t)
    got = Counter(b for b, _, _ in out)
    if dict(got) != CHAPTERS:
        raise ValueError(f"chapters per book {dict(got)}, want {CHAPTERS}")
    for b, c, paras in out:
        words = OPENINGS[(b, c)].split()
        for j, w in enumerate(words):
            if difflib.SequenceMatcher(None, key(paras[0][j]), key(w)).ratio() < 0.4:
                raise ValueError(f"opening of {b}.{c}: {paras[0][:4]} is not {OPENINGS[(b, c)]!r}")
            paras[0][j] = w
    return out


def build():
    A, at, pages = a_stream()
    others = {w: other_stream(w) for w in "BCDE"}
    tokens, origin, report = vote(A, others)
    end = END.split()
    if tokens[-len(end):] != end:
        raise ValueError(f"the text no longer ends with {END!r}")
    tokens, origin = tokens[:-len(end)], origin[:-len(end)]
    tokens, doubt = unbreak(tokens, vocabulary())
    report["hyphens"] = doubt
    tokens, origin = print_reads(tokens, origin)
    chapters = structure(tokens, origin, at, pages)
    tokens = [t for _, _, paras in chapters for para in paras for t in para]
    return chapters, anchors(tokens, origin, at, pages), report


# Margin lines the OCR could not read, or misread, each read off the image.
# A column that begins at the head of a page has its label in the running
# head, not the margin (819b, 822b).
MARGIN_READS = {
    (83, 15): "815a25", (84, 29): "815b35", (95, 0): "819b", (101, 3): "822a15",
    (101, 8): "822a20", (102, 0): "822b", (107, 2): "824b5", (107, 6): "824b10",
    (106, 24): "824a35", (111, 6): "826a25", (113, 9): "827a8", (113, 11): "827a12",
    (113, 1): None,     # the brace beside the bracketed 827a9-11, not a number
}
# Marks on printed lines A's OCR lost (the words came in from the other
# scans): the mark, and the line's opening words in our text (the first whole
# word when the line opens with the end of a broken one).
LOST_MARKS = {
    "818b20": "by which it reaches completion are not parts",
    "823a35": "of heat that it causes moisture to rise",
    "824a1": "therefore, will be the basis of sand,",
    "825b30": "ground is fresh, water is generally not far away.",
    "826a40": "When these four conditions are fulfilled,",
}
# Around the bracketed 827a9-11, which Forster moves up the page, he numbers
# lines 8 and 12 and not 10.
MARK_SWAP = {("827a", 10): [("827a", 8), ("827a", 12)]}


def mark_name(m: tuple[str, int | None]) -> str:
    col, n = m
    return f"{col}{n}" if n is not None else f"{col}*"


def anchors(tokens, origin, at, pages) -> list[dict]:
    """[{bekker, at}] from Forster's margin, in text order."""
    expect = []
    for m in expected_marks():
        expect += MARK_SWAP.get(m, [m])
    lost = {k for k in LOST_MARKS}
    expect = [m for m in expect if mark_name(m) not in lost and
              not (m[1] is None and f"{m[0]}1" in lost)]
    obs = observed_marks(pages)
    have = {(o["leaf"], o["line"]) for o in obs}
    for (leaf, line), v in MARGIN_READS.items():
        if v and (leaf, line) not in have:
            obs.append({"leaf": leaf, "line": line, "reads": []})
    obs = [o for o in obs if MARGIN_READS.get((o["leaf"], o["line"]), "") is not None]
    obs.sort(key=lambda o: (o["leaf"], o["line"]))
    for o in obs:
        f = MARGIN_READS.get((o["leaf"], o["line"]))
        if f:
            o["forced"] = f if not f.endswith(("a", "b")) else f + "*"
    match, probs = read_marks(obs, expect)
    if probs:
        raise ValueError("margin numbers not placed: " + "; ".join(
            f"{k} {mark_name(e) if e else ''} {(o['leaf'], o['line'], o['reads']) if o else ''}"
            for k, e, o in probs))
    first_line = {col: ns[0] for col, ns in spine_columns()}
    start = {}
    for k, o in enumerate(origin):
        if o >= 0 and at[o] not in start:
            start[at[o]] = k
    text = " " + " ".join(tokens) + " "

    def phrase(k):
        for n in range(4, 13):
            p = " ".join(tokens[k:k + n])
            if text.count(" " + p + " ") == 1 or n == 12:
                return p
    out = []
    for e, o in match.items():
        col, n = expect[e]
        o = obs[o]
        k = start[(o["leaf"], o["line"])]
        out.append({"bekker": f"{col}{n if n is not None else first_line[col]}", "at": phrase(k), "_k": k})
    for mark, p in LOST_MARKS.items():
        if text.count(" " + p + " ") != 1:
            raise ValueError(f"LOST_MARKS {mark}: {p!r} is not in the text exactly once")
        k = len(text[:text.index(" " + p + " ")].split())
        out.append({"bekker": mark if not mark.endswith("1") or mark[:-1] not in first_line
                    else f"{mark[:-1]}{first_line[mark[:-1]]}", "at": p, "_k": k})
    out.sort(key=lambda a: a["_k"])
    order = [(int(a["bekker"][:3]), a["bekker"][3], int(a["bekker"][4:])) for a in out]
    bad = [out[i]["bekker"] for i in range(1, len(out)) if order[i] <= order[i - 1]]
    if bad:
        raise ValueError(f"anchors out of Bekker order at {bad}")
    return out


TITLE = "De Plantis"
CREDIT = "Translated by E. S. Forster (Oxford, 1913)"


def render(chapters, found) -> dict[str, str]:
    """{file name: content} for sources/plant-forster/."""
    files = {}
    for book in (1, 2):
        out = [f"<h3>{TITLE}</h3>", "", CREDIT, "", ""]
        for b, c, paras in chapters:
            if b != book:
                continue
            out += [f"Part {c}", ""]
            out += ["<p>" + html.escape(" ".join(p), quote=False) + "</p>" for p in paras]
            out += ["", ""]
        files[f"book-{book:02d}.html"] = "\n".join(out).rstrip() + "\n"
    head = [
        "# De Plantis — Forster (Oxford, 1913): real Bekker ticks.",
        "# Each entry is a number Forster prints in his outer margin (a column label",
        "# in the margin, or in the running head when the column opens a page), read",
        "# from the scans of The Works of Aristotle vol. VI (archive.org works0006aris,",
        "# leaves 83-120, with worksofaristotle06arisuoft) by",
        "# pipeline/tools/build_plant_forster.py; the numbers the OCR could not read were",
        "# read off the page images (MARGIN_READS, LOST_MARKS there). `at` is the start",
        "# of the printed line the number stands beside (its first whole word). A",
        "# column label stands as the column's first Berlin line, so 815b and 822b",
        "# open at their own first lines. Forster prints 827a8 and 827a12, not 827a10:",
        "# he moves the bracketed 827a9-11 to the head of the page.",
    ]
    body = []
    for a in found:
        body += [f'- bekker: "{a["bekker"]}"', f'  at: {json.dumps(a["at"], ensure_ascii=False)}']
    files["anchors.yaml"] = "\n".join(head + body) + "\n"
    return files


def paragraphs_yaml(chapters, files) -> str:
    """paragraphs.yaml: each paragraph after a chapter's first, as an offset
    into the prose the pipeline reads back from book-NN.html."""
    sys.path.insert(0, str(ROOT / "pipeline"))
    import tempfile
    from aristotle_pipeline.stage1_ross import parse_translation
    with tempfile.TemporaryDirectory() as tmp:
        for name, text in files.items():
            (Path(tmp) / name).write_text(text, encoding="utf-8")
        prose = parse_translation(Path(tmp), 2, "part")
    out = [
        "# Paragraph openings in OUR text: Forster's first-line indents, read from the",
        "# page layout by pipeline/tools/build_plant_forster.py.",
        "# offset = characters into the chapter's prose; at = our own opening words.",
    ]
    for b, c, paras in chapters:
        text, pos = prose[(b, c)], 0
        for j, p in enumerate(paras):
            pat = r"\s+".join(re.escape(w) for w in p[:8])
            m = re.compile(pat).search(text, pos)
            if not m or (j == 0 and m.start() != 0):
                raise ValueError(f"paragraph {b}.{c}.{j + 1} not found in the parsed prose")
            pos = m.end()
            if j:
                at = json.dumps(" ".join(p[:5]), ensure_ascii=False)
                out.append(f"- {{book: {b}, chapter: {c}, offset: {m.start()}, at: {at}}}")
    return "\n".join(out) + "\n"


def outputs():
    chapters, found, report = build()
    files = render(chapters, found)
    files["paragraphs.yaml"] = paragraphs_yaml(chapters, files)
    return files, report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("cmd", choices=["build", "check"])
    args = ap.parse_args(argv)
    files, report = outputs()
    if args.cmd == "check":
        stale = [n for n, t in files.items()
                 if not (OUT / n).exists() or (OUT / n).read_text(encoding="utf-8") != t]
        print("stale: " + ", ".join(stale) if stale else "sources/plant-forster/ is current")
        return 1 if stale else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for n, t in files.items():
        (OUT / n).write_text(t, encoding="utf-8")
    for k in ("changes", "unsettled", "inserted", "dropped", "respaced", "hyphens"):
        print(f"{k}: {len(report.get(k, []))}")
    print(f"wrote {', '.join(sorted(files))} to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
