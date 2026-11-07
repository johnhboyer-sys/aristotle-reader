"""Build sources/rhetal-forster/ from three archive.org OCR witnesses of E. S.
Forster's Rhetorica ad Alexandrum (The Works of Aristotle, vol. XI, Oxford
1924; US public domain since 2020).

Witnesses (fetch each as archive.org/download/<id>/<id>_hocr.html into
--ocr-dir; never committed):
  A  worksofaristotle0011wrhy        1924 printing (Tesseract OCR)
  B  worksofaristotle0011wdro_k5k3   1924 printing, second copy (Tesseract)
  C  worksofaristotle11arisuoft      1946/1951/1959 impression, "reprinted
                                     lithographically" from the 1924 sheets, so
                                     the same page, line for line (ABBYY OCR)

Writes (under sources/rhetal-forster/)
  book-01.html     the Letter and Forster's Chapters 1-38 as Parts 1-39
  anchors.yaml     Bekker ticks read from Forster's PRINTED margin
  paragraphs.yaml  paragraph openings, from the printed first-line indents

How it works
  1. Each page's hOCR words are grouped into printed rows (lines whose heights
     overlap are one row: Tesseract sets a margin numeral apart as its own
     line). The body column is fitted per page; words outside it are margin
     (Bekker numbers; the chapter numeral, left of a chapter's first line).
     The running head is the first row; the footnotes are the rows under the
     last wide gap on the page, when they are set in smaller type.
  2. The three scans must agree on every page's count of body rows (they are
     the same printed page). Rows are then aligned word by word and each word
     is voted: two witnesses that agree win; otherwise an English word (the
     vocabulary of the repo's other English texts) wins; otherwise A.
  3. Footnote call-outs (superscript figures, which the OCR reads as ^ * ! ? °
     ® ’ or a glued digit) are removed where a witness shows one. Where the
     vote still goes wrong (a call-out read as a quote, or taking a quote with
     it; Forster's Greek) the page image settles it: PRINT_READS, PRINT_MARGIN.
  4. A word broken at a line end is rejoined; the hyphen stays only where the
     vocabulary knows the word hyphenated and not solid. Forster closes up his
     dashes ("passed—a"), so a row ending in a dash takes the next row's
     first word with it, as a hyphen does.
  5. Margin numbers are voted the same way and must rise by five within a
     column; a column mark (1421a, 1421b) restarts the count. A number that
     cannot be read or does not fit is skipped and counted, never guessed.

  --verify is NOT here: pipeline/tools/verify_rhetal_forster.py checks the
  output against the raw hOCR and shares no code with this file.

Run from the repo root:  python3 pipeline/tools/build_rhetal_forster.py --ocr-dir build/rhetal/ocr
The tool needs only the standard library.
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
OUT = ROOT / "sources" / "rhetal-forster"
SCANS = {"A": "worksofaristotle0011wrhy", "B": "worksofaristotle0011wdro_k5k3",
         "C": "worksofaristotle11arisuoft"}
# hOCR page index of the work's first page (the Letter) in each scan; the
# work runs 74 pages, to the end of Chapter 38.
FIRST = {"A": 243, "B": 243, "C": 239}
NPAGES = 74

_LINE = re.compile(
    r"<span class=.ocr_(?:line|caption|header|textfloat). [^>]*?title=.bbox (\d+) (\d+) (\d+) (\d+)"
    r"([^>]*)>(.*?)(?=<span class=.ocr_(?:line|caption|header|textfloat)|</p>)", re.S)
_WORD = re.compile(
    r"<span class=.ocrx_word. [^>]*?title=.bbox (\d+) (\d+) (\d+) (\d+); x_wconf (\d+)"
    r"(?:; x_fsize (\d+))?[^>]*>(.*?)</span>", re.S)


# ---------------------------------------------------------------- pages

def read_pages(path: Path, first: int) -> list[dict]:
    s = path.read_text(encoding="utf-8")
    raw = re.split(r"(?=<div class=.ocr_page)", s)[1:]
    pages = []
    for k in range(NPAGES):
        p = raw[first + k]
        w, h = map(int, re.search(r"bbox 0 0 (\d+) (\d+)", p).groups())
        lines = []
        for m in _LINE.finditer(p):
            ws = []
            for x in _WORD.finditer(m.group(6)):
                t = html.unescape(re.sub(r"<[^>]+>", "", x.group(7))).strip()
                if t:
                    ws.append({"x0": int(x.group(1)), "y0": int(x.group(2)),
                               "x1": int(x.group(3)), "y1": int(x.group(4)),
                               "c": int(x.group(5)), "fs": int(x.group(6) or 0), "t": t})
            if ws:
                lines.append({"y0": int(m.group(2)), "y1": int(m.group(4)), "w": ws})
        rows = _rows(lines)
        if rows and _is_signature(rows[-1]):
            rows.pop()
        pages.append({"k": k, "w": w, "h": h, "rows": rows})
    return pages


_SIG = re.compile(r"^(?:[\d.\-*]+|[A-Za-z]{1,2})$")


def _is_signature(row: dict) -> bool:
    """The printer's signature at the foot of a sheet's first page ("645.10",
    "S 2", "T 2"): at most three tokens, each figures or one or two letters."""
    ts = [w["t"] for w in row["w"]]
    return len(ts) <= 3 and all(_SIG.match(t) for t in ts)


def _rows(lines: list[dict]) -> list[dict]:
    """Merge hOCR lines that share a printed row (vertical overlap)."""
    lines = sorted(lines, key=lambda l: (l["y0"] + l["y1"]) / 2)
    rows: list[dict] = []
    for l in lines:
        if rows:
            r = rows[-1]
            ov = min(r["y1"], l["y1"]) - max(r["y0"], l["y0"])
            if ov > 0.5 * min(r["y1"] - r["y0"], l["y1"] - l["y0"]):
                r["w"].extend(l["w"])
                r["y0"], r["y1"] = min(r["y0"], l["y0"]), max(r["y1"], l["y1"])
                continue
        rows.append({"y0": l["y0"], "y1": l["y1"], "w": list(l["w"])})
    for r in rows:
        r["w"].sort(key=lambda w: w["x0"])
    return rows


NUMISH = re.compile(r"^[\[(]?[0-9IilJoOSsrtTg%°*'’”\"^:;,.\-]{1,9}[)\]]?$")


def _is_numish(t: str) -> bool:
    return bool(NUMISH.match(t)) and bool(re.search(r"[0-9]", t) or re.fullmatch(r"(to|ro|io|lo|[IJl1]{1,2})[.,]?", t))


_COLMARK = re.compile(r"^[\[(]?[1Il!|][4A][0-9OoIlSs]{2}")


def _is_margin_figure(t: str) -> bool:
    return _is_numish(t) or bool(_COLMARK.match(t))


def layout(page: dict) -> dict:
    """Split a page into head, body rows (with margin words apart) and notes."""
    rows = page["rows"]
    firsts = [r["w"][0] for r in rows if len(r["w"]) >= 4 and not _is_numish(r["w"][0]["t"])]
    lasts = [r["w"][-1] for r in rows if len(r["w"]) >= 4 and not _is_numish(r["w"][-1]["t"])]
    L = statistics.median(sorted(w["x0"] for w in firsts)[: max(1, len(firsts) * 2 // 3)])
    R = statistics.median(sorted(w["x1"] for w in lasts)[len(lasts) // 3:])
    head, body = rows[0], rows[1:]
    ys = [r["y0"] for r in body]
    pitch = statistics.median([b - a for a, b in zip(ys, ys[1:])]) if len(ys) > 2 else 60
    # notes: the rows at the foot of the page set in smaller type. A row's
    # size is the mean of two ratios to the body's median: its words' font
    # size, and its width per letter. Under 0.92 is small. The notes are the
    # small rows under the last row that is not small; rows too short to say
    # (under 8 letters) go with the rows round them.
    def size(r):
        ws = [w for w in r["w"] if len(w["t"]) > 2]
        n = sum(len(w["t"]) for w in ws)
        if n < 8:
            return None
        fs = statistics.median([w["fs"] for w in ws])
        return fs, sum(w["x1"] - w["x0"] for w in ws) / n
    sizes = [size(r) for r in body]
    # the body's size, from the top third of the page (notes can fill more
    # than half a page, as under the end of the Letter)
    known = [z for z in sizes[: max(6, len(sizes) // 3)] if z]
    mfs = statistics.median([z[0] for z in known]) or 1
    mpl = statistics.median([z[1] for z in known])
    def small(z):
        return z is not None and (z[0] / mfs + z[1] / mpl) / 2 < 0.92
    page["small"] = [None if z is None else small(z) for z in sizes]
    cut = page.get("cut", len(body))
    out_rows, orphans = [], []
    for r in body[:cut]:
        ws = list(r["w"])
        # margin numerals stand only 15-20 px clear of the text block, so a
        # figure (or column mark, or any word of three letters or fewer: a
        # figure misread, "ao" for 20) is margin when it starts past the right
        # edge of the text or left of its left edge (ABBYY's boxes run on to
        # the next word, so where a word ends says nothing); any other word
        # wholly outside the block is margin too (stray marks)
        left = []
        while ws and (ws[0]["x1"] < L - 12 or ((_is_margin_figure(ws[0]["t"]) or len(ws[0]["t"]) <= 3)
                                                and ws[0]["x0"] < L - 15)):
            left.append(ws.pop(0))
        right = []
        while ws and (ws[-1]["x0"] > R + 12 or ((_is_margin_figure(ws[-1]["t"]) or len(ws[-1]["t"]) <= 3)
                                                 and ws[-1]["x0"] >= R - 5)):
            right.insert(0, ws.pop())
        # a margin numeral glued to the last word ("you.15")
        if ws and ws[-1]["x1"] > R + 25:
            m = re.match(r"^(.*?[^\d])(\d{1,2})$", ws[-1]["t"])
            if m:
                right.insert(0, dict(ws[-1], t=m.group(2)))
                ws[-1] = dict(ws[-1], t=m.group(1))
        yc = (r["y0"] + r["y1"]) / 2
        if not ws:
            orphans.append((yc, left, right))  # a row of margin words only
            continue
        out_rows.append({"y0": r["y0"], "yc": yc, "words": [w["t"] for w in ws],
                         "indent": ws[0]["x0"] - L, "left": [w["t"] for w in left],
                         "right": [w["t"] for w in right]})
    for yc, left, right in orphans:  # to the nearest text row
        if out_rows:
            near = min(out_rows, key=lambda o: abs(o["yc"] - yc))
            near["left"] += [w["t"] for w in left]
            near["right"] += [w["t"] for w in right]
    return {"head": " ".join(w["t"] for w in head["w"]), "rows": out_rows,
            "notes": [" ".join(w["t"] for w in r["w"]) for r in body[cut:]],
            "note_rows": body[cut:], "L": L, "R": R, "pitch": pitch}


# ---------------------------------------------------------------- tokens

_PUNCT_ONLY = re.compile(r"^[;:,.?!)\]]+$")
# a call-out set apart from its word: C (ABBYY) reads the superscript as ^ or
# *, A and B (Tesseract) as one of * ° ® § ^ ! and the like
_CALLOUT_ALONE = re.compile(r"^[\^*°®§'’\"”!]{1,3}$")
_CALLOUT_GLUED = re.compile(r"(?:\^+\*?|\*+\^*|[°®§]+)$")


def clean_tokens(words: list[str]) -> list[dict]:
    """A row's words as [{t, mark}]: `mark` is True where a footnote call-out
    was read on the word (removed from `t`). Punctuation set apart by the
    1924 compositor ("intention ;") is joined to its word."""
    out: list[dict] = []
    for raw in words:
        t = raw
        if out and _PUNCT_ONLY.match(t):
            out[-1]["t"] += t
            continue
        if out and out[-1]["t"] in ("‘", "“"):  # an opening quote set apart
            out[-1]["t"] += t
            continue
        if out and _CALLOUT_ALONE.match(t):
            out[-1]["mark"] = True
            continue
        mark = False
        m = _CALLOUT_GLUED.search(t)
        if m and m.start() > 0:
            t, mark = t[: m.start()], True
        # "forensic.!" "qualities,?" ; a figure glued to a word ("animals.2",
        # "amplification.2,")
        m = re.search(r"(?<=[a-z.,;:])(?:[!?]|\d{1,2})([,;:.]?)$", t)
        if m and (t[m.start() - 1] in ".,;:" or m.group(0)[0].isdigit()):
            t, mark = t[: m.start()] + m.group(1), True
        if t:
            out.append({"t": t, "mark": mark})
        elif out:
            out[-1]["mark"] = True
    return out


_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "`": "'"})


def cmp_key(t: str) -> str:
    return re.sub(r"\s+", " ", t.translate(_QUOTES)).strip()


def align_key(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())


def _vocab() -> Counter:
    """Words of the repo's other English translations (sources/*/book-*.html),
    lower case, hyphenated compounds kept whole."""
    c: Counter = Counter()
    for f in (ROOT / "sources").glob("*/book-*.html"):
        if f.parent.name == "rhetal-forster":
            continue
        txt = re.sub(r"<[^>]+>", " ", f.read_text(encoding="utf-8", errors="replace")).lower()
        c.update(re.findall(r"[a-z]+(?:-[a-z]+)*", txt.replace("’", "'")))
    return c


VOCAB: Counter = Counter()


def _english(t: str) -> bool:
    ws = re.findall(r"[a-z]+(?:-[a-z]+)*", t.lower().replace("’", "'"))
    return bool(ws) and all(VOCAB.get(w, 0) > 0 for w in ws)


def _english_count(t: str) -> int:
    return sum(1 for w in re.findall(r"[a-z]+(?:-[a-z]+)*", t.lower().replace("’", "'"))
               if VOCAB.get(w, 0) > 0)


def _curl(t: str) -> str:
    """Straight quotes (ABBYY's) as the print's curly ones."""
    t = re.sub(r"(?<![\w.,;:?!])'", "‘", t)
    t = t.replace("'", "’")
    t = re.sub(r'(?<![\w.,;:?!])"', "“", t)
    return t.replace('"', "”")


def _units(n: int, ops: dict[str, list]) -> list[tuple[int, int]]:
    """Voting units over the skeleton's n tokens: single tokens, except where
    another scan reads a run as a different number of words (merged into one
    unit), plus empty units (i, i) where another scan has words the skeleton
    lacks."""
    inner = set()
    inserts = set()
    for opc in ops.values():
        for tag, i1, i2, j1, j2 in opc:
            if tag == "replace" and i2 - i1 != j2 - j1:
                inner.update(range(i1 + 1, i2))
            if tag == "insert":
                inserts.add(i1)
            if tag == "replace" and i2 - i1 != j2 - j1 and i1 == i2:
                inserts.add(i1)
    bounds = [b for b in range(n + 1) if b not in inner]
    out = []
    for a, b in zip(bounds, bounds[1:] + [None]):
        if a in inserts:
            out.append((a, a))
        if b is not None:
            out.append((a, b))
    return out


def _project(opc: list, toks: list[dict], a: int, b: int) -> list[dict]:
    got = []
    for tag, i1, i2, j1, j2 in opc:
        if a == b:
            if tag == "insert" and i1 == a:
                got += toks[j1:j2]
            continue
        if tag == "insert":
            if a < i1 < b:
                got += toks[j1:j2]
        elif tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
            lo, hi = max(a, i1), min(b, i2)
            if lo < hi:
                got += toks[j1 + lo - i1: j1 + hi - i1]
        elif tag == "replace":
            if a <= i1 and i2 <= b:
                got += toks[j1:j2]
    return got


def vote_row(rows: dict[str, list[dict] | None], skel: str) -> tuple[list[dict], list]:
    """One printed row voted word by word. `rows` holds each scan's cleaned
    tokens (None where the scan has no matching row). Returns the voted
    tokens [{t, mark}] and the units where no two scans agreed."""
    S = rows[skel]
    others = {s: r for s, r in rows.items() if s != skel and r is not None}
    ops = {s: difflib.SequenceMatcher(None, [align_key(x["t"]) for x in S],
                                      [align_key(x["t"]) for x in r], autojunk=False).get_opcodes()
           for s, r in others.items()}
    out, doubts = [], []
    for a, b in _units(len(S), ops):
        reads = {skel: S[a:b]}
        for s, r in others.items():
            reads[s] = _project(ops[s], r, a, b)
        text = {s: " ".join(x["t"] for x in v) for s, v in reads.items()}
        marks = {s: any(x["mark"] for x in v) for s, v in reads.items()}
        tally = Counter(cmp_key(t) for t in text.values())
        best, n = tally.most_common(1)[0]
        if n >= 2:
            pick = next(text[s] for s in ("A", "B", "C") if s in text and cmp_key(text[s]) == best)
            # two Tesseract reads of one printing can share a mistake ("aman",
            # "shali"): a reading that is English where the majority is not,
            # and differs from it by little, wins, and is logged
            if pick and not _english(pick):
                alt = [text[s] for s in ("C", "A", "B") if s in text and text[s] and _english(text[s])
                       and difflib.SequenceMatcher(None, pick.replace(" ", ""),
                                                   text[s].replace(" ", "")).ratio() >= 0.75]
                if alt:
                    doubts.append({"override": pick, "to": alt[0]})
                    pick = alt[0]
        else:
            # no two agree: the reading with most English words, C first on a tie
            order = [s for s in ("C", "A", "B") if s in text and text[s]
                     and len(text[s].split()) <= len(text[skel].split()) + 2]
            pick = max(order, key=lambda s: _english_count(text[s]), default=None)
            pick = text[pick] if pick else text[skel]
            if a != b or pick:
                doubts.append(dict(text))
            if a == b:
                pick = ""  # words only one scan has are not taken
        if not pick:
            continue
        if "'" in pick or '"' in pick:
            pick = _curl(pick)
        # a call-out stands where two scans read one, or where C (whose OCR
        # reads the superscript as ^ or *, never as a word's own mark) does
        mark = sum(marks.values()) >= 2 or bool(marks.get("C"))
        if mark and "C" in text:
            # a closing quote or ? that only the Tesseract scans read here was
            # the call-out
            c = cmp_key(text["C"])
            while pick and pick[-1] in "’”?!" and not c.endswith(cmp_key(pick[-1])):
                pick = pick[:-1]
        toks = pick.split(" ")
        out += [{"t": t, "mark": False} for t in toks]
        out[-1]["mark"] = mark
    return out, doubts


def _rowkey(words: list[str]) -> str:
    return re.sub(r"[^a-z]", "", " ".join(words).lower())


def match_rows(base: list[dict], other: list[dict]) -> dict[int, int]:
    """base row index -> other row index, in order, by the rows' letters."""
    m, last = {}, -1
    kb = [_rowkey(r["words"]) for r in base]
    ko = [_rowkey(r["words"]) for r in other]
    for i, k in enumerate(kb):
        cands = [(difflib.SequenceMatcher(None, k, ko[j], autojunk=False).ratio(), j)
                 for j in range(last + 1, min(last + 4, len(ko)))]
        if cands:
            r, j = max(cands)
            # a row that holds two printed lines (ABBYY once interleaved two)
            # matches neither
            if r >= 0.6 and 0.7 <= len(ko[j]) / max(1, len(k)) <= 1.4:
                m[i], last = j, j
    return m


def vote_page(L: dict[str, dict]) -> tuple[list[dict], list]:
    """A page's body rows voted across the scans. The skeleton is A, unless A
    alone has a different count of rows (two printed lines read as one)."""
    n = {s: len(L[s]["rows"]) for s in L}
    skel = "A"
    if n["A"] != n["B"] and n["B"] == n["C"]:
        skel = "C"
    others = [s for s in L if s != skel]
    maps = {s: match_rows(L[skel]["rows"], L[s]["rows"]) for s in others}
    out, doubts = [], []
    for i, r in enumerate(L[skel]["rows"]):
        rows = {skel: clean_tokens(r["words"])}
        margins = {skel: (r["left"], r["right"])}
        indents = {skel: r["indent"]}
        for s in others:
            j = maps[s].get(i)
            rows[s] = clean_tokens(L[s]["rows"][j]["words"]) if j is not None else None
            if j is not None:
                o = L[s]["rows"][j]
                margins[s] = (o["left"], o["right"])
                indents[s] = o["indent"]
        toks, d = vote_row(rows, skel)
        doubts += d
        out.append({"toks": toks, "margins": margins, "indents": indents, "skel": skel,
                    "matched": sum(1 for s in others if i in maps[s])})
    return out, doubts


def _key(r: dict) -> str:
    return re.sub(r"[^a-z]", "", " ".join(w["t"] for w in r["w"]).lower())


_CROSSREF = re.compile(r"^\S{0,3}\s*Cp[.,]")


def vote_notes(pages: dict[str, dict]) -> None:
    """Set each scan's page["cut"]: the first footnote row. Rows are matched
    across the scans by their letters; a row is a note when at least two of
    the scans that hold it call it small. The notes are the run of such rows
    at the foot (rows no scan can size go with the rows round them). In the
    other scans a row that matches no row of the first is a note when it lies
    in that run and is not set at body size."""
    for s, p in pages.items():
        layout(p)  # fills p["small"]
    names = list(pages)
    body = {s: pages[s]["rows"][1:] for s in names}
    keys = {s: [_key(r) for r in body[s]] for s in names}
    note_rows: dict[str, set] = {s: set() for s in names}
    base = names[0]
    match = {}
    for s in names[1:]:
        m = {}
        for i, k in enumerate(keys[base]):
            best = max(((difflib.SequenceMatcher(None, k, k2).ratio(), j)
                        for j, k2 in enumerate(keys[s]) if abs(j - i) <= 6), default=(0, None))
            if best[0] >= 0.6:
                m[i] = best[1]
        match[s] = m
    verdict = []
    for s in names:  # a cross-reference ("1 Cp. Rhet. 1408a 1-5.") is a note at any size
        for i, k in enumerate(pages[s]["rows"][1:]):
            if _CROSSREF.match(" ".join(w["t"] for w in k["w"])):
                pages[s]["small"][i] = True
    for i in range(len(body[base])):
        flags = [pages[base]["small"][i]] + [
            pages[s]["small"][match[s][i]] for s in names[1:] if i in match[s]]
        flags = [f for f in flags if f is not None]
        verdict.append(None if not flags else sum(flags) * 2 > len(flags))
    rows0 = body[base]
    # a row too short to size that opens lowercase under a body row ends the
    # body's last sentence ("proem." alone at the foot of leaf 50): a note
    # opens with its figure. Its y says nothing: without ascenders it sits low.
    for i in range(1, len(verdict)):
        if verdict[i] is None and verdict[i - 1] is False and rows0[i]["w"][0]["t"][:1].islower():
            verdict[i] = False
    # the notes are the foot of the page below some row; take the split that
    # leaves fewest rows on the wrong side of their verdict. Rows too short to
    # size can tie it: then split where the rows step wider apart than 1.15 of
    # the page's pitch (the notes stand a little below the text), else lowest.
    ys = [(r["y0"] + r["y1"]) / 2 for r in rows0]
    pitch = statistics.median([b - a for a, b in zip(ys, ys[1:])])
    def wrong(c):
        return sum(1 for v in verdict[:c] if v) + sum(1 for v in verdict[c:] if v is False)
    def step(c):
        return c < len(rows0) and ys[c] - ys[c - 1] > 1.15 * pitch
    cut = min(range(3, len(verdict) + 1), key=lambda c: (wrong(c), not step(c), -c))
    pages[base]["cut"] = cut
    for s in names[1:]:
        if cut - 1 in match[s]:
            # the body ends where the base scan's last body row lands
            pages[s]["cut"] = match[s][cut - 1] + 1
            continue
        # walk up from the foot: a row matched to a note of the base scan is a
        # note; an unmatched one (Greek in a note reads differently in each
        # scan) is a note unless it is set at body size
        inv = {j: i for i, j in match[s].items()}
        c = len(body[s])
        for j in range(len(body[s]) - 1, 2, -1):
            if j in inv:
                if inv[j] < cut:
                    break
            elif pages[s]["small"][j] is False:
                break
            c = j
        pages[s]["cut"] = c


# ---------------------------------------------------------------- assembly

_DIGIT = str.maketrans({"o": "0", "O": "0", "I": "1", "l": "1", "i": "1", "J": "1", "!": "1",
                        "|": "1", "t": "1", "r": "1", "S": "5", "s": "5", "a": "2", "e": "2",
                        "z": "2", "Z": "2", "B": "8", "g": "9", "A": "4"})


def read_figure(t: str) -> int | None:
    """A margin figure as a number ("to" 10, "a5" 25, "I" 1), or None."""
    d = re.sub(r"(?<=[\dIlos])°", "0", t)  # "3°" is 30: the 0 read as a degree sign
    d = d.strip("[](){}.,;:'’”\"*°^-_~").translate(_DIGIT)
    return int(d) if d.isdigit() and len(d) <= 2 else None


def read_colmark(t: str) -> int | None:
    """The page of a column mark ("1421*", "I42I'*", "i42o''5"), or None."""
    m = _COLMARK.match(t)
    if not m:
        return None
    d = re.sub(r"^[\[(]", "", m.group(0))[:4].translate(_DIGIT)
    return int(d) if d.isdigit() else -1


def spine_columns() -> dict[str, tuple[int, int]]:
    """{column: (first line, last line)} of the Greek spine."""
    x = (ROOT / "sources" / "rhetal-greek" / "rhetal-bekker-grc.xml").read_text(encoding="utf-8")
    out = {}
    for col, body in re.findall(r'<div type="Bekker-page" n="(\d+[ab])">(.*?)</div>', x, re.S):
        ns = [int(n) for n in re.findall(r'<l n="(\d+)"', body)]
        out[col] = (min(ns), max(ns))
    return out


def _next_col(col: str) -> str:
    return col[:-1] + "b" if col.endswith("a") else f"{int(col[:-1]) + 1}a"


# Words the three scans cannot give, read from the page images of
# worksofaristotle11arisuoft (leaf n = 238 + page k). Each is (what the vote
# makes of it, what the print reads); each must match exactly once.
PRINT_READS = [
    # k=41 (1435a-b): Forster quotes the Greek particles and phrases
    ("I indeed (ixiv) came", "I indeed (μέν) came"),
    ("but (he) you, though", "but (δέ) you, though"),
    ("doth (xat) the cause", "both (καί) the cause"),  # italic "both" read as "doth"
    ("and (kai) the cause of this", "and (καί) the cause of this"),
    ("this man (tovtov tovtov témrew)", "this man (τοῦτον τοῦτον τύπτειν)"),
    ("this man (tovtov nò tovtov rénrecOa)", "this man (τοῦτον ὑπὸ τούτου τύπτεσθαι)"),
    # k=42 (1435b)
    ("This man [ovtos 6 dvOpw7os)", "This man (οὗτος ὁ ἄνθρωπος)"),
    ("this man {tovtov tov avOpcoTTor)", "this man (τοῦτον τὸν ἄνθρωπον)"),
    ("threshold (686s)", "threshold (ὀδός)"),
    ("way (6dés)", "way (ὁδός)"),
    # stray call-outs, brackets and stops the vote gets wrong
    ("dealt with specially 1 in these", "dealt with specially in these"),  # k=3, note 10
    ("numerous and_ incalculable", "numerous and incalculable"),  # k=14
    ("while statenients about", "while statements about"),
    ("our benefactors You will", "our benefactors’. You will"),  # k=6
    ("defence, | which are concerned with forensic business,^] and",
     "defence, [which are concerned with forensic business,] and"),  # k=18
    ("on general matters, There", "on general matters. There"),  # k=27
    ("contrary names; ‘These", "contrary names: ‘These"),  # k=38, a broken colon
    ("while examples (are supplied", "while examples ⟨are supplied"),  # k=29: Forster's
    ("because they ^) can", "because they⟩ can"),  # angle brackets mark a supplement
    ("Callicles’—‘ By the gods", "Callicles’—‘By the gods"),  # k=32
    ("poor and needy ;’ and", "poor and needy;’ and"),  # k=42
    ("after concluding’^ with", "after concluding with"),  # k=57, note 2
    ("kill my son ?’—‘ Yes", "kill my son?’—‘Yes"),  # k=67
    ("thrash my son? — ‘Yes", "thrash my son?’—‘Yes"),
    ("break my head ?’—‘ Yes", "break my head?’—‘Yes"),
    ("kill my son? — No,", "kill my son?’—‘No,"),
    ("laid down. 1 [Sacrifices", "laid down. [Sacrifices"),  # k=71, note 1
    ("is an advantage. |", "is an advantage.]"),  # k=73, the last line
    # a call-out beside a closing quote: read as the quote, or taking it with it
    ("is my own,” viz.", "is my own, viz."),  # k=3, note 6
    ("for Theodectes,’ while", "for Theodectes, while"),  # note 7
    ("can be arranged.” First", "can be arranged. First"),  # k=39, note 2
    ("did not do so’?; or", "did not do so’; or"),  # k=41, note 2
    ("τύπτεσθαι). This is an example", "τύπτεσθαι).’ This is an example"),
    ("‘Parisosis takes a form", "‘Parisosis’ takes a form"),  # k=43
    ("‘Paromoeosis (parallelism", "‘Paromoeosis’ (parallelism"),  # note 1
    ("makes the ‘members not only", "makes the ‘members’ not only"),
    ("using ‘irony in the following", "using ‘irony’ in the following"),  # k=45, note 1
    ("‘pretended omission and promise", "‘pretended omission’, and promise"),  # k=50, note 1
    # Found by diffing against a fourth witness, Genie's OCR of the volume, and
    # read on the page image (worksofaristotle0011wrhy; archive.org page/n<N>
    # is hOCR page N+1). All three scans misread these alike.
    ("contrary case: it is just to punish", "contrary case: ‘As it is just to punish"),  # n248: ‘ Asit
    ("for along time’", "for a long time’"),  # n268
    ("Let us new deal", "Let us now deal"),  # n284: a worn o
    ("top of another!: ‘If", "top of another: ‘If"),  # n259: call-out 1, then the colon
    ("whether he is poor, For", "whether he is poor. For"),  # n273
    ("confusion or transposition, The", "confusion or transposition. The"),  # n283
    ("to good luck, (you must", "to good luck, ⟨you must"),  # n299: Forster's angle
    ("his earliest years), observing", "his earliest years⟩, observing"),  # brackets, a supplement
    ("oratory of accusation? and inquiry", "oratory of accusation and inquiry"),  # n301: call-out 1
]


# Margin figures no scan reads right (a broken "2" reads as 3 or as letters),
# read from the same page images: (page k, the line's opening as voted, line
# number). Each must match exactly one line on its page.
PRINT_MARGIN = [
    (2, "These, then, and like sentiments", 25),     # 1421a
    (9, "prosperity; again, that this", 20),         # 1423b
    (11, "laid down regarding elections", 20),       # 1424a
    (20, "of a discreditable tendency", 20),         # 1427b
    (20, "has formed any intention", 25),            # 1427b
    (23, "infer it. Failing that", 25),              # 1428b
    (28, "maxims based on parallels", 20),           # 1430b
    (28, "which they have themselves inflicted", 25),  # 1430b
    (40, "strong man in war", 20),                   # 1435a
    (60, "conciliate the jury by praising", 15),     # 1442a
    (60, "is represented as unfit", 25),             # 1442a
]


def _keep_hyphen(stem: str, core: str) -> bool:
    """A word broken at a line end: keep the hyphen where the vocabulary knows
    the hyphenated form better than the solid one; where it knows neither,
    keep it only between two common words of three letters or more ("council-
    chamber"), not in a broken word ("amplifica-tion", "com-mission") or
    before a suffix ("discredit-able")."""
    h, solid = VOCAB.get((stem + "-" + core).lower(), 0), VOCAB.get((stem + core).lower(), 0)
    if h or solid:
        return h > solid
    if core.lower() in _SUFFIXES:
        return False
    return all(len(x) >= 3 and VOCAB.get(x.lower(), 0) >= 3 for x in (stem, core))


_SUFFIXES = {"able", "ible", "ment", "ments", "ness", "less", "ly", "tion", "ing", "ed"}


def assemble(pages: list[list[dict]], heads: list[dict[str, str]]) -> dict:
    """Parts, paragraph openings and Bekker anchors from the voted pages."""
    rows = [dict(r, k=k) for k, pr in enumerate(pages) for r in pr]
    report: dict = {"chapters": [], "heads": [], "anchors_skipped": [], "colmarks": [],
                    "spacing": []}
    # paragraph openings: the first-line indent (median over the scans)
    for r in rows:
        r["para"] = statistics.median(r["indents"].values()) >= 30
    # chapters: a paragraph whose margin carries the next chapter numeral; it
    # stands in the margin the Bekker numbers leave free (left on a recto
    # page, k even; right on a verso)
    chap = 0
    for i, r in enumerate(rows):
        r["chapter"] = None
        if r["para"]:
            side = 0 if r["k"] % 2 == 0 else 1
            figs = [read_figure(t) for s, m in r["margins"].items() for t in m[side]]
            if chap + 1 in figs:
                chap += 1
                r["chapter"] = chap
                report["chapters"].append((chap, r["k"], " ".join(t["t"] for t in r["toks"][:6])))
        r["in_chapter"] = chap
    if chap != 38:
        raise SystemExit(f"found {chap} chapter openings, want 38: {report['chapters'][-3:]}")
    # the running head names the chapter in force at the top of the page
    first_row = {}
    for r in rows:
        first_row.setdefault(r["k"], r)
    for k, hs in enumerate(heads):
        want = first_row[k]["in_chapter"] if first_row[k]["chapter"] is None else first_row[k]["chapter"]
        said = set()
        for h in hs.values():
            m = re.search(r"CHAP\w*\s+(\S+)", h)
            if m and read_figure(m.group(1)) is not None:
                said.add(read_figure(m.group(1)))
        if said and want not in said:
            report["heads"].append((k, want, sorted(said)))

    # text, Part by Part: Part 1 is the Letter, Part n+1 Forster's Chapter n.
    # Words are kept as a list per Part; offsets come from word indices once
    # the Part is joined.
    words: dict[int, list[str]] = {1: []}
    para_at: list[tuple[int, int]] = []   # (part, word index)
    row_at: dict[int, tuple[int, int]] = {}  # row -> (part, index of its first whole word)
    part = 1
    broken = False  # the last row ended in a hyphen
    dash_open = False  # the last row ended in a dash
    for i, r in enumerate(rows):
        if r["chapter"]:
            part = r["chapter"] + 1
            words[part] = []
            broken = dash_open = False
        toks = [t["t"] for t in r["toks"]]
        if not toks:
            continue
        w = words[part]
        if dash_open and w:
            w[-1] += toks[0]
            toks = toks[1:]
        elif broken and w:
            stem = w[-1][:-1]
            core = re.sub(r"[^\w’'-]+$", "", toks[0])
            keep = _keep_hyphen(stem, core)
            w[-1] = stem + ("-" if keep else "") + toks[0]
            toks = toks[1:]
        elif r["para"] and w:
            para_at.append((part, len(w)))
        row_at[i] = (part, len(w))
        w.extend(toks)
        broken = bool(w) and w[-1].endswith("-") and len(w[-1]) > 1 and not w[-1].endswith("--")
        dash_open = bool(w) and w[-1].endswith("—") and len(w[-1]) > 1
    parts = {n: " ".join(ws) for n, ws in words.items()}

    def offset(part: int, idx: int) -> int:
        return len(" ".join(words[part][:idx])) + (1 if idx else 0)
    paras = [(p, offset(p, j)) for p, j in para_at]
    row_at = {i: (p, offset(p, j)) for i, (p, j) in row_at.items()}
    # the readings settled from the page images; offsets past each move with
    # it, and one inside it (a line or paragraph that opens inside the reading)
    # goes where a character diff of the two puts it: past what was dropped
    for old, new in PRINT_READS:
        hits = [(n, t.find(old)) for n, t in parts.items() if old in t]
        if len(hits) != 1 or parts[hits[0][0]].count(old) != 1:
            raise SystemExit(f"PRINT_READS: {old!r} matches {len(hits)} Parts, want one place")
        n, at = hits[0]
        parts[n] = parts[n][:at] + new + parts[n][at + len(old):]

        def moved(p: int, o: int) -> int:
            if p != n or o <= at:
                return o
            if o >= at + len(old):
                return o + len(new) - len(old)
            rel = o - at
            for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes():
                if i1 <= rel < i2:
                    j = j1 + rel - i1 if tag == "equal" else j2
                    return at + j + len(new[j:]) - len(new[j:].lstrip(" "))
            raise AssertionError((old, rel))
        paras = [(p, moved(p, o)) for p, o in paras]
        row_at = {i: (p, moved(p, o)) for i, (p, o) in row_at.items()}

    def at_word(p: int, o: int) -> None:
        if o and parts[p][o - 1:o] != " " or not parts[p][o:o + 1].strip():
            raise SystemExit(f"Part {p}: offset {o} is not at a word: {parts[p][o - 20:o + 20]!r}")
    for p, o in paras:
        at_word(p, o)

    # Bekker anchors from the printed margin: recto pages (even k) carry them
    # on the right, verso on the left
    cols = spine_columns()
    forced: dict[int, int] = {}
    for k, opening, n in PRINT_MARGIN:
        hits = [i for i, r in enumerate(rows) if r["k"] == k
                and " ".join(t["t"] for t in r["toks"]).startswith(opening)]
        if len(hits) != 1:
            raise SystemExit(f"PRINT_MARGIN: {opening!r} on page {k} matches {len(hits)} lines")
        forced[hits[0]] = n
    anchors = [("1420a", 5, 0)]
    col, last = "1420a", 5
    for i, r in enumerate(rows[1:], start=1):
        if i in forced:
            if not last < forced[i] <= cols[col][1]:
                raise SystemExit(f"PRINT_MARGIN: {col}{forced[i]} on page {r['k']} follows {col}{last}")
            last = forced[i]
            anchors.append((col, last, i))
            continue
        side = 1 if r["k"] % 2 == 0 else 0
        toks = [t for s, m in r["margins"].items() for t in m[side]]
        marks = [read_colmark(t) for t in toks]
        marks = [m for m in marks if m is not None]
        if marks:
            nxt = _next_col(col)
            page = int(nxt[:-1])
            report["colmarks"].append((nxt, r["k"], marks))
            if nxt not in cols:
                report["anchors_skipped"].append((r["k"], "column past the spine", toks))
                continue
            if page not in marks:
                # a mark that is not the next column's page is a misreading or
                # a skipped column: settle it on the image, never by counting on
                raise SystemExit(f"page {r['k']}: column mark read as {marks}, next column is {nxt}")
            col, last = nxt, cols[nxt][0]
            anchors.append((col, last, i))
        figs = [read_figure(t) for t in toks if read_colmark(t) is None]
        # a figure two scans read is taken anywhere further down the column; a
        # figure one scan reads only as the next number or the one after
        votes = Counter(v for v in figs if v and v % 5 == 0 and last < v <= cols[col][1])
        ok = [v for v, c in votes.items() if c >= 2 or v <= last + 10]
        ok = [v for v in figs if v in ok]
        if not ok:
            if any(f for f in figs):
                report["anchors_skipped"].append((r["k"], f"{col}: {figs} after {last}", toks))
            continue
        tally = Counter(ok).most_common()
        if len(tally) > 1 and tally[0][1] == tally[1][1]:
            report["anchors_skipped"].append((r["k"], f"{col}: tie {tally}", toks))
            continue
        last = tally[0][0]
        anchors.append((col, last, i))
    for (c1, n1, i1), (c2, n2, i2) in zip(anchors, anchors[1:]):
        if c1 == c2 and not 0.6 <= (i2 - i1) / (n2 - n1) <= 2.2:
            report["spacing"].append((f"{c1}{n1}", f"{c2}{n2}", i2 - i1))
    # The pipeline looks for an anchor's words in its own column's English
    # (stage1_archive._resolve_anchors: first hit, by substring), so each `at`
    # must stand once in that column. A column runs from its first line's row
    # to the next column's, across Parts; a match counts if it starts there
    # (a column's last line runs on past its end).
    first_row: dict[str, int] = {}
    for col, n, i in anchors:
        first_row.setdefault(col, i)
    order = list(first_row)

    def span(col: str) -> list[tuple[int, int, int]]:
        p0, o0 = row_at[first_row[col]]
        j = order.index(col)
        p1, o1 = (row_at[first_row[order[j + 1]]] if j + 1 < len(order)
                  else (max(parts), len(parts[max(parts)])))
        return [(q, o0 if q == p0 else 0, o1 if q == p1 else len(parts[q]))
                for q in range(p0, p1 + 1)]

    def times(phrase: str, col: str) -> int:
        pat = re.compile(r"\s+".join(re.escape(w) for w in phrase.split()))
        return sum(1 for q, a, b in span(col) for m in pat.finditer(parts[q], a) if m.start() < b)

    out_anchors = []
    for col, n, i in anchors:
        p, off = row_at[i]
        at_word(p, off)
        # ten words, or as many more as it takes to name this place alone in
        # its column
        ws = parts[p][off:].split()
        at = next((" ".join(ws[:k]) for k in range(min(10, len(ws)), len(ws) + 1)
                   if times(" ".join(ws[:k]), col) == 1), None)
        if at is None:
            raise SystemExit(f"{col}{n}: no opening from Part {p} offset {off} stands once in its column")
        out_anchors.append({"bekker": f"{col}{n}", "at": at, "part": p,
                            "cut": n == cols[col][0] and col != "1420a"})
    return {"parts": parts, "paras": paras, "anchors": out_anchors, "report": report, "rows": rows}


def write(res: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    parts = res["parts"]
    body = ["<h3>Rhetorica ad Alexandrum</h3>", "", "Translated by E. S. Forster", "", "", ""]
    for n in sorted(parts):
        body += [f"Part {n}", "", f"<p>{html.escape(parts[n], quote=False)}</p>", ""]
    (OUT / "book-01.html").write_text("\n".join(body), encoding="utf-8")
    a = res["anchors"]
    head = (
        "# Bekker line ticks read from the PRINTED margin of E. S. Forster, Rhetorica ad Alexandrum\n"
        "# (Oxford, The Works of Aristotle vol. XI, 1924), voted across three scans: archive.org\n"
        "# worksofaristotle0011wrhy, worksofaristotle0011wdro_k5k3 (1924) and worksofaristotle11arisuoft\n"
        "# (lithographic reprint of the same sheets). Script: pipeline/tools/build_rhetal_forster.py.\n"
        "# Each `at` is the opening of the printed line that carries the number (from the first whole\n"
        "# word on that line), as it reads in book-01.html. `cut: true` marks a column's first line\n"
        "# (1421a1, ...; 1420b5, where Bekker's column b opens under the end of the Rhetoric): the\n"
        f"# build cuts the English there. {len(a)} entries.\n")
    lines = []
    for e in a:
        lines.append(f'- bekker: "{e["bekker"]}"\n  at: {json.dumps(e["at"], ensure_ascii=False)}\n')
        if e["cut"]:
            lines.append("  cut: true\n")
    (OUT / "anchors.yaml").write_text(head + "".join(lines), encoding="utf-8")
    ph = ("# Paragraph openings in OUR text, from the first-line indents of the printed page\n"
          "# (pipeline/tools/build_rhetal_forster.py). offset = characters into the Part's prose;\n"
          "# at = our own opening words.\n")
    rows = []
    for part, off in res["paras"]:
        at = " ".join(parts[part][off:].split()[:5])
        rows.append(f"- {{book: 1, chapter: {part}, offset: {off}, at: {json.dumps(at, ensure_ascii=False)}}}\n")
    (OUT / "paragraphs.yaml").write_text(ph + "".join(rows), encoding="utf-8")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ocr-dir", required=True)
    ap.add_argument("--survey", action="store_true", help="print each page's row counts and stop")
    ap.add_argument("--dump", action="store_true", help="print the voted pages and stop")
    args = ap.parse_args(argv)
    d = Path(args.ocr_dir)
    raw = {s: read_pages(d / f"{i}_hocr.html", FIRST[s]) for s, i in SCANS.items()}
    for k in range(NPAGES):
        vote_notes({s: raw[s][k] for s in raw})
    scans = {s: [layout(p) for p in raw[s]] for s in raw}
    if args.survey:
        for k in range(NPAGES):
            n = {s: len(scans[s][k]["rows"]) for s in scans}
            nn = {s: len(scans[s][k]["notes"]) for s in scans}
            flag = "" if len(set(n.values())) == 1 else "  <-- rows differ"
            print(k, n, "notes", nn, scans["C"][k]["head"][:40], flag)
        return
    VOCAB.update(_vocab())
    pages, doubts = [], []
    for k in range(NPAGES):
        rows, d = vote_page({s: scans[s][k] for s in scans})
        pages.append(rows)
        doubts += [(k, x) for x in d]
    if args.dump:
        for k, rows in enumerate(pages):
            print(f"=== page {k}")
            for r in rows:
                print(" ", " ".join(t["t"] + ("¹" if t["mark"] else "") for t in r["toks"]),
                      "|", r["margins"].get("A"), r["margins"].get("C"))
        print(len(doubts), "doubts")
        for k, x in doubts:
            print(k, x)
        return
    heads = [{s: scans[s][k]["head"] for s in scans} for k in range(NPAGES)]
    res = assemble(pages, heads)
    rep = res["report"]
    print(len(res["parts"]), "parts;", len(res["paras"]), "paragraph openings;",
          len(res["anchors"]), "anchors;", len(rep["anchors_skipped"]), "margin figures skipped")
    for x in rep["heads"]:
        print("  head disagrees:", x)
    for x in rep["anchors_skipped"]:
        print("  skipped:", x)
    for x in rep["spacing"]:
        print("  odd spacing (rows between ticks):", x)
    cols = spine_columns()
    have = {a["bekker"] for a in res["anchors"]}
    for c, (lo, hi) in cols.items():
        want = [f"{c}{lo}"] + [f"{c}{n}" for n in range(5, hi + 1, 5) if n > lo]
        miss = [w for w in want if w not in have]
        if miss:
            print("  no tick:", " ".join(miss))
    write(res)
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
