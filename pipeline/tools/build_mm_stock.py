"""Build the Magna Moralia English source files (St. George Stock, Oxford
Works of Aristotle vol. IX, 1915; US public domain) from Wikisource's
unproofread Page-namespace wikitext, checked word by word against two
archive.org scans of the same printing.

Inputs (all under build/, git-ignored):
  build/mm-ocr/ws/ws_pages.json                       Wikisource pages 301-392
  build/mm-ocr/works0009aris_hocr.html                scan A, hOCR index = WS page
  build/mm-ocr/theworksofaristo09arisuoft_hocr.html   scan B, hOCR index = WS page - 3
  build/mm-ocr/img/B<n>.jpg                           page images the reads tables cite
                                                      (`--fetch-images` downloads them)

Outputs:
  sources/mm-stock/book-01.html, book-02.html, anchors.yaml

How the text is made. Wikisource's body words are the base. Each page's words
(with the running head and the foot, so the scans' own heads and foot notes
align to something) are matched to each scan's tokens; a word is confirmed by a
scan that reads it. A word neither scan reads is settled by the scans when they
agree with each other, otherwise by a PRINT_READS entry read off the page image;
the build exits on any word left unsettled. Words both scans have and
Wikisource lacks are restored. Punctuation that both scans agree on and
Wikisource lacks (or has and both lack) follows the scans.

Paragraphs open where the print indents a first line (measured at scan B's
first whole word of each line), never at a page top that merely continues.
Bekker numbers are read from the printed margins of both scans; a column label
stands for that column's line 1. Anything the OCR cannot give is in a reads
table (MARGIN_READS, NUMBER_READS, NUMBER_ABSENT) read off the image, and the
build exits if an entry is stale.

Run from pipeline/:  uv run python tools/build_mm_stock.py
The build ends by reading its own files back through the pipeline's loader and
testing every anchor against them.
"""

from __future__ import annotations

import collections
import difflib
import json
import re
import statistics
import sys
import unicodedata
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "build" / "mm-ocr"
WS_JSON = OCR / "ws" / "ws_pages.json"
SCAN_FILES = {"A": OCR / "works0009aris_hocr.html",
              "B": OCR / "theworksofaristo09arisuoft_hocr.html"}
SCAN_OFFSET = {"A": 0, "B": 3}
OUT = ROOT / "sources" / "mm-stock"
FIRST_PAGE, LAST_PAGE = 301, 392

XH = "{http://www.w3.org/1999/xhtml}"
DASHES = "—–"


# ------------------------------------------------------------------ keys

def key(t: str) -> str:
    """Comparison key: letters and digits only, accents and case gone. A lone
    dash keeps a key so dashes align."""
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    k = re.sub(r"[^0-9a-zα-ωϲ]", "", t)
    if not k and re.fullmatch(r"[—–-]+", t.strip()):
        return "—"
    return k


def split_dash(tok: str) -> list[str]:
    return [p for p in re.split(r"([—–])", tok) if p]


# ------------------------------------------------------------------ Wikisource

def clean_ws_page(v: str):
    """-> (head, body, tail): running head text, body wikitext with markers,
    and the foot (parallel-passage tier and footnotes) as plain text."""
    m0 = re.match(r"\s*<noinclude>(.*?)</noinclude>", v, flags=re.S)
    head = re.sub(r"<pagequality[^>]*/>", "", m0.group(1)) if m0 else ""
    rest = v[m0.end():] if m0 else v
    foot = " ".join(re.findall(r"<noinclude>(.*?)</noinclude>", rest, flags=re.S))
    body = re.sub(r"<noinclude>.*?</noinclude>", "", v, flags=re.S)
    for heading in re.findall(r"\{\{c\|\{\{larger\|(BOOK I+)\}\}\}\}", body):
        head += "\n" + heading
    body = re.sub(r"\{\{c\|\{\{larger\|BOOK I+\}\}\}\}", "", body)
    refs = re.findall(r"<ref>(.*?)</ref>", body, flags=re.S)
    body = re.sub(r"<ref>.*?</ref>", "", body, flags=re.S)
    tail = foot + "\n" + "\n".join(refs)
    tail = re.sub(r"\{\{(?:nop|rule[^}]*|smallrefs)\}\}", " ", tail)
    tail = re.sub(r"\{\{greek\|([^}]*)\}\}", r"\1", tail)
    tail = re.sub(r"<sup>(.*?)</sup>", r"\1", tail)
    tail = tail.replace("''", "")
    body = re.sub(r"\{\{verse\|\|'''(\d+)<sup>([ab])</sup>'''\}\}",
                  lambda m: " \x01COL%s%s\x01 " % (m.group(1), m.group(2)), body)
    body = re.sub(r"\{\{(?:nop|rule[^}]*|smallrefs)\}\}", "", body)
    body = body.replace("{{dhr}}", "\n\n\x01DHR\x01\n\n")
    body = re.sub(r"\{\{\*\*\*\|?\d*\}\}", "", body)
    body = body.replace("{{thsp}}", " ").replace("{{peh}}", "-")
    body = body.replace("{{...}}", " \x01ELL\x01 ")
    body = re.sub(r"\{\{c\|\{\{fine\|(.*?)\}\}\}\}", lambda m: " \x01D0\x01 %s \x01D1\x01 " % m.group(1), body)
    for _ in range(4):
        body = re.sub(r"\{\{(?:c|larger|xxx-larger|xx-smaller|smaller|fine|sc|greek|right)\|([^{}]*)\}\}",
                      r"\1", body)
    body = body.replace("&lt;", "<").replace("<br/>", " \x01BR\x01 ")
    body = re.sub(r"'''(\d+)'''", lambda m: " \x01CH%s\x01 " % m.group(1), body)
    body = body.replace("''", "")
    if re.search(r"[{}|]", body):
        sys.exit(f"unhandled wiki markup in body: {re.findall(r'.{20}[{}|].{20}', body)[:3]}")
    return head, body, tail


def ws_pages() -> dict[int, dict]:
    raw = json.loads(WS_JSON.read_text(encoding="utf-8"))
    out = {}
    for pg in range(FIRST_PAGE, LAST_PAGE + 1):
        head, body, tail = clean_ws_page(raw[str(pg)])
        out[pg] = {"raw": raw[str(pg)], "head": head, "body": body, "tail": tail}
    return out


# ------------------------------------------------------------------ scans (hOCR)

_BBOX = re.compile(r"bbox (\d+) (\d+) (\d+) (\d+)")


def read_hocr(path: Path, first: int, last: int) -> dict[int, tuple[int, list[dict]]]:
    """{hOCR page index: (page height, [line, ...])}; a line is {words: [(bbox, text)]}."""
    root = etree.fromstring(path.read_bytes())
    pages: dict[int, list[dict]] = {}
    for pg in root.iter(XH + "div"):
        if pg.get("class") != "ocr_page":
            continue
        idx = int(pg.get("id").split("_")[1])
        if not first <= idx <= last:
            continue
        lines = []
        for ln in pg.iter(XH + "span"):
            if ln.get("class") != "ocr_line":
                continue
            words = []
            for w in ln.iter(XH + "span"):
                if w.get("class") == "ocrx_word":
                    t = "".join(w.itertext()).strip()
                    if t:
                        words.append((tuple(map(int, _BBOX.search(w.get("title")).groups())), t))
            if words:
                lines.append({"words": words})
        pages[idx] = (int(_BBOX.search(pg.get("title")).group(4)), lines)
    return pages


def margin_like(t: str) -> bool:
    """A margin number or column label as OCR renders it: has a digit, or is a
    lone I/l (a chapter 1)."""
    return bool(re.search(r"\d", t)) or bool(re.fullmatch(r"[Il|]{1,2}[.,]?", t))


def split_margins(lines: list[dict], odd: bool, height: int):
    """Take margin numbers (outside the text block) out of the lines.

    The text block's left edge L and right edge R come from the justified
    lines: L is the 35th percentile of line starts, R the 65th of line ends.
    A number-like word starting more than 20 px left of L is a left-margin
    word; on odd pages a number-like last word starting right of R is a
    right-margin word. Words above 7% of the page height are the running head
    and are left out. Returns (lines without margins, margin words, L, R)."""
    long_ = [l for l in lines if len(l["words"]) >= 5]
    if len(long_) < 4:
        long_ = lines
    starts = sorted(l["words"][0][0][0] for l in long_)
    ends = sorted(l["words"][-1][0][2] for l in long_)
    L = starts[int(len(starts) * 0.35)]
    R = ends[int(len(ends) * 0.65)]
    margin, kept = [], []
    for l in lines:
        for i, (bb, t) in enumerate(l["words"]):
            if (bb[1] + bb[3]) / 2 < 0.07 * height:
                continue
            if bb[0] < L - 20 and margin_like(t):
                margin.append({"bb": bb, "t": t, "side": "L"})
            elif odd and bb[0] > R + 8 and i == len(l["words"]) - 1 and margin_like(t):
                margin.append({"bb": bb, "t": t, "side": "R"})
            else:
                kept.append((bb, t))
    # Regroup the words into lines by height: the OCR's own lines sometimes
    # take a word from the line below.
    kept.sort(key=lambda w: (w[0][1] + w[0][3]) / 2)
    groups: list[list] = []
    for w in kept:
        yc = (w[0][1] + w[0][3]) / 2
        if groups and yc - statistics.mean((x[0][1] + x[0][3]) / 2 for x in groups[-1]) <= 30:
            groups[-1].append(w)
        else:
            groups.append([w])
    body = []
    for g in groups:
        g.sort(key=lambda w: w[0][0])
        ys = [(b[1] + b[3]) / 2 for b, _ in g]
        body.append({"words": g, "x0": g[0][0][0], "x1": max(b[2] for b, _ in g),
                     "y": statistics.mean(ys)})
    body.sort(key=lambda l: l["y"])
    return body, margin, L, R


# ------------------------------------------------------------------ units

QUOTES = "‘’“”'\"`´"
PUNCT_ONLY = re.compile(r"^[^\w]+$")


def ws_body_units(body: str, page: int) -> list[dict]:
    """Words and markers of one page's body, in order. A word unit is
    {t, glue (no space before it), page}; a marker is {m: kind, v: value}."""
    items: list[dict] = []
    for bi, block in enumerate(re.split(r"\n\s*\n", body)):
        if bi > 0:
            items.append({"m": "blank"})
        for tok in block.split():
            if tok.startswith("\x01"):
                kind = tok.strip("\x01")
                if kind.startswith("COL"):
                    items.append({"m": "col", "v": kind[3:]})
                elif kind.startswith("CH"):
                    items.append({"m": "chap", "v": int(kind[2:])})
                elif kind == "DHR":
                    items.append({"m": "dhr"})
                elif kind in ("D0", "D1", "BR"):
                    items.append({"m": kind})
                elif kind == "ELL":
                    items.append({"t": "…", "glue": False, "page": page})
                continue
            for j, part in enumerate(split_dash(tok)):
                items.append({"t": part, "glue": j > 0, "page": page})
    return items


def ws_tail_tokens(text: str) -> list[str]:
    out = []
    for tok in text.split():
        out.extend(split_dash(tok))
    return out


_MARK = re.compile(r"^(.*?[^\W\d_][^\w]*)(\d{1,2})$")


def scan_tokens(lines: list[dict]) -> list[dict]:
    """Tokens of one scan page, in reading order, with their line number.
    Dashes split off; a footnote mark glued after a word (good,3) is cut;
    punctuation standing alone is glued to the word before it."""
    toks: list[dict] = []
    for li, ln in enumerate(lines):
        for wi, (bb, t) in enumerate(ln["words"]):
            m = _MARK.match(t)
            if m:
                t = m.group(1)
            for part in split_dash(t):
                if PUNCT_ONLY.match(part) and part not in DASHES and toks and toks[-1]["line"] == li \
                        and not part.strip(QUOTES) == "":
                    toks[-1]["t"] += part
                    continue
                if part.strip(QUOTES + "()[]") == "" and part not in DASHES:
                    if toks and part in ")]" and toks[-1]["line"] == li:
                        toks[-1]["t"] += part
                    continue
                toks.append({"t": part, "line": li, "w": wi, "bb": bb})
    for tk in toks:
        tk["k"] = key(tk["t"])
    # a lone number is a footnote mark or margin figure, never a word of Stock's
    return [tk for tk in toks if tk["k"] and not re.fullmatch(r"\d{1,3}", tk["k"])]


# ------------------------------------------------------------------ alignment

def _join_match(wk: list[str], sk: list[str]):
    """Match a block of Wikisource keys to a block of scan keys, allowing a
    word to be split across scan tokens (a line-end hyphen) or two words to be
    one scan token. Returns [(wi, [sj, ...])] for matched words, unmatched
    words absent; and the scan indices used."""
    out = []
    used = set()
    wi = sj = 0
    while wi < len(wk) and sj < len(sk):
        if wk[wi] == sk[sj]:
            out.append((wi, [sj])); used.add(sj); wi += 1; sj += 1; continue
        done = False
        for n in (2, 3):
            if sj + n <= len(sk) and wk[wi] == "".join(sk[sj:sj + n]):
                out.append((wi, list(range(sj, sj + n)))); used.update(range(sj, sj + n))
                wi += 1; sj += n; done = True; break
            if wi + n <= len(wk) and "".join(wk[wi:wi + n]) == sk[sj]:
                for d in range(n):
                    out.append((wi + d, [sj]))
                used.add(sj); wi += n; sj += 1; done = True; break
        if done:
            continue
        # no match here: skip whichever side re-synchronises soonest
        wi_skip = next((d for d in range(1, 4) if wi + d < len(wk) and wk[wi + d] == sk[sj]), None)
        sj_skip = next((d for d in range(1, 4) if sj + d < len(sk) and sk[sj + d] == wk[wi]), None)
        if wi_skip is not None and (sj_skip is None or wi_skip <= sj_skip):
            wi += wi_skip
        elif sj_skip is not None:
            sj += sj_skip
        else:
            wi += 1; sj += 1
    return out, used


def align_page(ws_head: list[str], body_words: list[dict], ws_tail: list[str], stoks: list[dict]):
    """Align one page's Wikisource words to one scan's tokens.

    Wikisource side = running head + body + foot, so the scan's head and foot
    align to something and cannot pass for body. Returns (status, gaps):
    status[i] for body word i is ("eq", [scan toks]) when the scan reads the
    word (a word split at a line end is several tokens), ("sub", [scan toks])
    when the scan reads something else there, or ("del", []); gaps[i] = scan
    tokens left over before body word i (i = len(body) is after the last)."""
    hk = [key(t) for t in ws_head]
    bk = [key(w["t"]) for w in body_words]
    tk = [key(t) for t in ws_tail]
    seq = hk + bk + tk
    sk = [t["k"] for t in stoks]
    sm = difflib.SequenceMatcher(None, seq, sk, autojunk=False)
    nh, nb = len(hk), len(bk)
    status: list = [("del", [])] * nb
    gaps: dict[int, list] = collections.defaultdict(list)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        lo, hi = max(i1, nh), min(i2, nh + nb)
        if tag == "equal":
            for d in range(lo, hi):
                status[d - nh] = ("eq", [stoks[j1 + d - i1]])
        elif tag == "replace":
            if lo < hi:
                matched, used = _join_match(bk[lo - nh:hi - nh], sk[j1:j2])
                got = {wi: sj for wi, sj in matched}
                for wi in range(hi - lo):
                    if wi in got:
                        status[lo - nh + wi] = ("eq", [stoks[j1 + x] for x in got[wi]])
                rest = [stoks[j1 + x] for x in range(j2 - j1) if x not in used]
                unmatched = [wi for wi in range(hi - lo) if wi not in got]
                if unmatched and rest and len(unmatched) == len(rest):
                    for wi, tkn in zip(unmatched, rest):
                        status[lo - nh + wi] = ("sub", [tkn])
                elif unmatched and rest:
                    status[lo - nh + unmatched[0]] = ("sub", rest)
                    for wi in unmatched[1:]:
                        status[lo - nh + wi] = ("sub", [])
                elif rest and not unmatched:
                    gaps[hi - nh].extend(rest)
                elif unmatched:
                    for wi in unmatched:
                        status[lo - nh + wi] = ("del", [])
            elif j2 > j1:
                pos = i1 - nh
                if 0 <= pos <= nb:
                    gaps[pos].extend(stoks[j1:j2])
        elif tag == "insert":
            pos = i1 - nh
            if 0 <= pos <= nb:
                gaps[pos].extend(stoks[j1:j2])
    return status, dict(gaps)


# ------------------------------------------------------------------ lines and margins

DIGIT_OCR = {"o": "0", "O": "0", "°": "0", "I": "1", "l": "1", "i": "1", "|": "1", "S": "5", "s": "5",
             "B": "8", "g": "9", "z": "2", "Z": "2", "G": "6"}


def parse_numeral(t: str) -> int | None:
    """A Bekker line number (5, 10, ... 40) from OCR text, or None."""
    s = "".join(DIGIT_OCR.get(c, c) for c in t if c.isalnum() or c in DIGIT_OCR)
    if not s.isdigit():
        return None
    n = int(s)
    return n if n % 5 == 0 and 5 <= n <= 40 else None


def line_map(status: list, body_lines: list[dict]):
    """For one scan page: the first whole word unit of each body line, and
    whether the line opens with the tail of a word split from the line above.
    unit u belongs to the line of its first scan token."""
    start_line: dict[int, int] = {}
    last_line: dict[int, int] = {}
    for u, (tag, toks) in enumerate(status):
        if toks:
            start_line[u] = toks[0]["line"]
            last_line[u] = toks[-1]["line"]
    first: dict[int, int] = {}
    carried: dict[int, bool] = {}
    for u in sorted(start_line):
        li = start_line[u]
        first.setdefault(li, u)
    for u, ll in last_line.items():
        if ll > start_line[u]:
            carried[ll] = True
    return first, carried


# ------------------------------------------------------------------ what the page images settle

# Where Wikisource's text is wrong and the scans cannot settle it by agreeing,
# each entry was read off the page image (B<n> = img/B<n>.jpg, n = page - 3).
# (WS page, Wikisource's tokens, the print's tokens, why). The build exits if
# an entry does not match exactly once on its page, so a fix that goes stale
# fails loudly. An empty print drops the words.
PRINT_READS: list[tuple[int, str, str, str]] = [
    (301, "others to have said", "others have said", "B298: margin 10, not a word"),
    (323, "has to its angles", "has its angles", "B320: margin 10, not a word"),
    (334, "pretends to I have", "pretends to have", "B331: stray I, not in print"),
    (334, "does I have and", "does have and", "B331: stray I, not in print"),
    (336, "the 1housebuilder food,", "the housebuilder food,", "B333: the 1 is the margin 10"),
    (311, "no way cooperates towards", "no way co-operates towards", "B308: hyphen printed"),
    (343, "reason?'.", "reason?'", "B340: no full stop after the closing quote"),
    (352, "steer the ship. In", "steer the ship.' In", "B349: closing quote printed"),
    (350, "What is it? I And", "What is it? And", "B347: the I is Book II's chapter number 1 at the line end"),
    # Found by a diff against Genie's OCR of vol. IX (a fourth witness), read on the image.
    (372, "about good fortune For the", "about good fortune. For the", "B369: a faint full stop ends the line"),
]

# Units that carry no letters and so cannot be matched against a scan; each
# was read off the page image. (WS page, token, how many times it occurs there)
IMAGE_PUNCT: list[tuple[int, str, int, str]] = [
    (316, "…", 1, "B313: spaced full stops"),
    (325, "…", 1, "B322: spaced full stops"),
    (329, "…", 1, "B326: spaced full stops"),
    (390, "…", 1, "B387: spaced full stops"),
    (336, ":", 4, "B333: the proportion A : B : : C : D"),
    (358, "∴", 1, "B355: therefore sign opening the conclusion"),
]

# A hyphen kept where a line or page ends in a printed compound; every other
# fragment ending in a hyphen joins to the next word without one.
KEEP_HYPHEN = {("self-", "control")}


# ------------------------------------------------------------------ load and resolve

class Book:
    """Everything read from the inputs: the Wikisource word stream with its
    markers, and each scan's alignment to it, page by page."""

    def __init__(self):
        self.ws = ws_pages()
        self.pages = list(range(FIRST_PAGE, LAST_PAGE + 1))
        self.stream: list[dict] = []        # words and markers, all pages
        self.words: dict[int, list[dict]] = {}   # page -> word units
        in_disp = after_br = False
        for pg in self.pages:
            items = ws_body_units(self.ws[pg]["body"], pg)
            ws_words = []
            for it in items:
                m = it.get("m")
                if m == "D0":
                    in_disp = True
                elif m == "D1":
                    in_disp = False
                elif m == "BR":
                    after_br = True
                elif "t" in it:
                    it["pi"] = len(ws_words)
                    it["out"] = [it["t"]]
                    it["cat"] = None
                    it["disp"] = in_disp or after_br
                    if not (after_br and not key(it["t"])):
                        after_br = False
                    ws_words.append(it)
            self.words[pg] = ws_words
            self.stream.extend(items)
        self.scan = {}
        for name in "AB":
            off = SCAN_OFFSET[name]
            hocr = read_hocr(SCAN_FILES[name], FIRST_PAGE - off, LAST_PAGE - off)
            per = {}
            for pg in self.pages:
                height, hlines = hocr[pg - off]
                body, margin, L, R = split_margins(hlines, pg % 2 == 1, height)
                toks = scan_tokens(body)
                status, gaps = align_page(ws_tail_tokens(self.ws[pg]["head"]), self.words[pg],
                                          ws_tail_tokens(self.ws[pg]["tail"]), toks)
                per[pg] = {"status": status, "gaps": gaps, "body": body, "margin": margin,
                           "L": L, "R": R}
            self.scan[name] = per


def canon(t: str) -> str:
    """A token as the scans can be compared to it: no quote marks, no
    footnote number glued to the end."""
    t = t.translate({ord(c): None for c in QUOTES})
    t = t.replace("...", "")                      # an ellipsis, a unit of its own in our text
    t = re.sub(r"(?<=[^\W\d_])\d{1,2}$", "", t)
    t = re.sub(r"(?<=[.,;:?!)\]])\d{1,2}$", "", t)
    return t


_TAILP = re.compile(r"^(.*?)([.,;:?!]*)$")


def resolve(bk: Book) -> dict:
    """Settle every Wikisource word against the scans. Fills each unit's
    `out` (the tokens it becomes; [] = dropped) and `cat`, and returns a log
    {category: [description, ...]}. Exits on anything it cannot settle."""
    log: dict[str, list] = collections.defaultdict(list)
    problems: list[str] = []

    def ctx(pg, i):
        w = bk.words[pg]
        return " ".join(x["t"] for x in w[max(0, i - 3):i + 4])

    # 1. what the page images settled
    for pg, wrong, printed, why in PRINT_READS:
        words = bk.words[pg]
        wt = wrong.split(" ")
        hits = [i for i in range(len(words) - len(wt) + 1)
                if [w["t"] for w in words[i:i + len(wt)]] == wt]
        if len(hits) != 1:
            sys.exit(f"PRINT_READS {pg} {wrong!r}: found {len(hits)} times, expected once (stale?)")
        i0 = hits[0]
        pt = printed.split(" ") if printed else []
        for tag, a1, a2, b1, b2 in difflib.SequenceMatcher(None, wt, pt, autojunk=False).get_opcodes():
            if tag == "equal":
                continue
            units = words[i0 + a1:i0 + a2]
            new = pt[b1:b2]
            if units:
                units[0]["out"] = new
                for u in units[1:]:
                    u["out"] = []
                for u in units:
                    u["cat"] = "image"
            else:
                host = words[i0 + a1 - 1]          # pure insertion: ride on the word before
                host["out"] = host["out"] + new
                host["cat"] = "image"
        for u in words[i0:i0 + len(wt)]:
            u["locked"] = True
        log["image"].append(f"{pg}: {wrong} -> {printed or '(dropped)'}  [{why}]")

    # 2. punctuation with no letters in it cannot be aligned: each was read off an image
    seen: dict[tuple[int, str], int] = collections.Counter()
    for pg in bk.pages:
        for u in bk.words[pg]:
            if not key(u["t"]):
                seen[(pg, u["t"])] += 1
    for pg, tok, n, why in IMAGE_PUNCT:
        if seen.get((pg, tok)) != n:
            sys.exit(f"IMAGE_PUNCT {pg} {tok!r}: found {seen.get((pg, tok), 0)}, expected {n} (stale?)")
    listed = {(pg, tok) for pg, tok, _, _ in IMAGE_PUNCT}
    for (pg, tok), n in seen.items():
        if (pg, tok) not in listed:
            problems.append(f"letterless token {tok!r} on {pg} not in IMAGE_PUNCT")

    # 3. every other word
    for pg in bk.pages:
        sa, sb = bk.scan["A"][pg]["status"], bk.scan["B"][pg]["status"]
        for i, u in enumerate(bk.words[pg]):
            if u.get("locked") or not key(u["t"]):
                continue
            a, b = sa[i], sb[i]
            if a[0] == "eq" or b[0] == "eq":
                if a[0] == "eq" and b[0] == "eq" and len(a[1]) == 1 and len(b[1]) == 1:
                    ca, cb, cw = canon(a[1][0]["t"]), canon(b[1][0]["t"]), canon(u["t"])
                    if ca == cb and ca != cw:
                        sw, tw = _TAILP.match(cw).groups()
                        ss, ts = _TAILP.match(ca).groups()
                        if sw == ss and not any(q in u["t"] for q in QUOTES):
                            u["out"] = [sw + ts]
                            u["cat"] = "agree"
                            log["agree"].append(f"{pg}: {u['t']!r} -> {sw + ts!r}  | {ctx(pg, i)}")
                        elif sw.lower() == ss.lower() and ss.isupper():
                            pass                                    # small capitals
                        elif "<" in sw + tw or ">" in sw + tw:
                            pass                                    # editor's angle brackets, read as ( ) by OCR
                        elif ca.replace("-", "") == cw.replace("-", ""):
                            pass
                        else:
                            problems.append(f"{pg}: {u['t']!r} vs both scans {ca!r}  | {ctx(pg, i)}")
                continue
            if key(u["t"]) == "—":
                continue                                            # a dash the scans spell otherwise
            ta = a[1][0] if a[0] == "sub" and len(a[1]) == 1 else None
            tb = b[1][0] if b[0] == "sub" and len(b[1]) == 1 else None
            if ta and tb and ta["k"] == tb["k"] and len(ta["k"]) >= 2:
                new = canon(tb["t"])
                u["out"] = [new]
                u["cat"] = "agree"
                log["agree"].append(f"{pg}: {u['t']!r} -> {new!r}  (both scans)  | {ctx(pg, i)}")
            else:
                problems.append(f"{pg}: {u['t']!r} in neither scan  A={a[0]}:{[t['t'] for t in a[1]]} "
                                f"B={b[0]}:{[t['t'] for t in b[1]]}  | {ctx(pg, i)}")

    # 4. words both scans have and Wikisource lacks
    for pg in bk.pages:
        ga, gb = bk.scan["A"][pg]["gaps"], bk.scan["B"][pg]["gaps"]
        words = bk.words[pg]
        for pos in sorted(set(ga) & set(gb)):
            ta = [t for t in ga[pos] if _gap_word(t["t"])]
            tb = [t for t in gb[pos] if _gap_word(t["t"])]
            sm = difflib.SequenceMatcher(None, [t["k"] for t in ta], [t["k"] for t in tb], autojunk=False)
            runs = [(a, b, n) for a, b, n in sm.get_matching_blocks() if n]
            if not runs:
                continue
            new = [canon(tb[b + d]["t"]) for a, b, n in runs for d in range(n)]
            # A one-letter word both scans have may be a real word ("a", "I")
            # or a chapter numeral leaked from the inner margin: the image
            # decides, so stop rather than restore it or let it drop.
            if any(len(canon(w).strip(".,;:?!()")) == 1 for w in new):
                problems.append(f"{pg}: both scans have {' '.join(new)!r} that Wikisource lacks "
                                f"(one-letter word) | {ctx(pg, min(pos, len(words) - 1))}")
                continue
            if pos < len(words):
                words[pos]["pre"] = new
                where = f"before {words[pos]['t']!r}"
            else:
                words[-1]["post"] = new
                where = f"after {words[-1]['t']!r}"
            log["restore"].append(f"{pg}: {' '.join(new)} {where}  | {ctx(pg, min(pos, len(words) - 1))}")

    if problems:
        sys.exit("UNSETTLED (add a PRINT_READS entry after reading the image):\n  " + "\n  ".join(problems))
    return log


def _gap_word(text: str) -> bool:
    """A scan token that counts as a word when both scans have it and
    Wikisource lacks it: two letters or more, or one of English's one-letter
    words. A capital with a stop ("E." of "E. N.") is an abbreviation."""
    w = canon(text).strip(",;:?!()")
    return bool(re.fullmatch(r"[A-Za-z]{2,}\.?", w) or w in ("a", "A", "I", "O"))


# ------------------------------------------------------------------ paragraphs from the scans

INDENT_MIN, INDENT_MAX = 40, 110       # px at scan B's size: a first-line indent is about 57


def scan_paragraph_starts(bk: Book, name: str):
    """Where the print indents a first line: {(page, unit index)}, plus the
    lines whose indent lies outside the normal band (for review). The indent
    is measured at the line's first whole word, so a stray mark at the line
    start cannot move it."""
    starts, odd = set(), []
    scale = 1.0 if name == "B" else 0.83
    for pg in bk.pages:
        sc = bk.scan[name][pg]
        first, carried = line_map(sc["status"], sc["body"])
        words = bk.words[pg]
        for li, ln in enumerate(sc["body"]):
            if li not in first or carried.get(li):
                continue
            u = first[li]
            tok = sc["status"][u][1][0]
            x0 = ln["x0"] if (u > 0 and words[u - 1]["t"] == "…") else tok["bb"][0]
            if u > 0 and words[u - 1]["t"] == "…":
                u -= 1                                  # the paragraph opens on its ellipsis
            d = (x0 - sc["L"]) / scale
            if words[u]["disp"]:
                continue                                # a display line, not a paragraph
            if INDENT_MIN <= d <= INDENT_MAX:
                starts.add((pg, u))
            elif d > 20:
                odd.append((name, pg, li, round(d), " ".join(t for _, t in ln["words"])[:50]))
    return starts, odd


def ws_paragraph_starts(bk: Book) -> set:
    """Where Wikisource has a blank line (or a chapter number): the next word."""
    out, pending = set(), False
    for it in bk.stream:
        if it.get("m") in ("blank", "chap"):
            pending = True
        elif "t" in it:
            if pending:
                out.add((it["page"], it["pi"]))
            pending = False
    return out


# ------------------------------------------------------------------ margins -> Bekker lines

COLUMNS = [f"{n}{c}" for n in range(1181, 1214) for c in "ab"]       # 1181a ... 1213b: 66


def margin_items(bk: Book) -> dict:
    """Every margin item of every body line, per scan: {(page, unit, scan): [(text, side)]}.
    The unit is the line's first whole word."""
    out = collections.defaultdict(list)
    for name in "AB":
        for pg in bk.pages:
            sc = bk.scan[name][pg]
            first, carried = line_map(sc["status"], sc["body"])
            ys = [l["y"] for l in sc["body"]]
            for m in sc["margin"]:
                yc = (m["bb"][1] + m["bb"][3]) / 2
                li = min(range(len(ys)), key=lambda k: abs(ys[k] - yc))
                if li in first and abs(ys[li] - yc) < 40:
                    out[(pg, first[li], name)].append((m["t"], m["side"]))
    return out


def classify_margin(t: str):
    """('num', n) for a Bekker line number, ('lab', text) for a column label,
    ('other', text) for a chapter number or noise. OCR glues the next word on
    to a number often enough (25not) that a number followed by letters counts."""
    s = re.sub(r"[^A-Za-z0-9]", "", t)
    n = parse_numeral(t)
    if n:
        return "num", n
    m = re.match(r"^(5|10|15|20|25|30|35|40)", s)
    if m and not s.startswith(("11", "12")) and len(s) <= 7:
        return "num", int(m.group(1))
    if len(s) >= 3:
        return "lab", s
    return "other", s


def margin_groups(bk: Book) -> list[dict]:
    """Margin items merged across the two scans, in text order. A group is
    {page, unit, items: [(scan, text, side)]}. Items of the two scans on one
    printed line meet at the line's first unit; where the scans disagree by a
    unit or two about where the line starts, they merge."""
    raw = margin_items(bk)
    by_page: dict[int, list] = collections.defaultdict(list)
    for (pg, u, name), items in raw.items():
        by_page[pg].append((u, name, items))
    groups = []
    for pg in sorted(by_page):
        cur: list[dict] = []
        b_starts = line_starts(bk, "B", pg)
        for u, name, items in sorted(by_page[pg], key=lambda x: (x[0], x[1])):
            # scan B's lines are the frame; an item of A's on a line B does not
            # have (A put a line start where B has none) is not placed
            if name == "A" and not any(abs(u - s) <= 2 for s in b_starts):
                continue
            g = next((g for g in cur if abs(g["unit"] - u) <= 2
                      and all(i[0] != name for i in g["items"])), None)
            if g is None:
                g = {"page": pg, "unit": u, "items": [], "units": {}}
                cur.append(g)
            g["units"][name] = u
            g["items"].extend((name, t, side) for t, side in items)
        groups.extend(sorted(cur, key=lambda g: g["unit"]))
    return groups


def line_starts(bk: Book, name: str, pg: int) -> list[int]:
    first, _ = line_map(bk.scan[name][pg]["status"], bk.scan[name][pg]["body"])
    return sorted(set(first.values()))


def is_label_text(t: str) -> bool:
    """A margin item that is no line number and is long enough to be a column label."""
    s = re.sub(r"[^A-Za-z0-9]", "", t)
    return len(s) >= 3 and parse_numeral(t) is None


# Wikisource's column marks are placed by the Greek, not by the margin, and
# two are wrong (read off the page heads and margins): page 332's 1193a is a
# stray (the column opens on 333), and page 359's 1202b is 1202a.
WS_COL_FIXES = {(332, "1193a"): None, (359, "1202b"): "1202a"}

# Column labels the page images give and the OCR cannot.
# (WS page, Bekker reference, first words of the printed line it stands beside, why.)
# 1190b: bold label beside the line, unread by both scans. 1205b: no label beside a line;
# the running head of 369 names the column and page 368's last lines are 1205a 36-40,
# so the column opens on 369's first line.
MARGIN_READS: list[tuple[int, str, str, str]] = [
    (325, "1190b1", "activity? Yes, but now also", "B322: 1190b beside this line, right margin"),
    (369, "1205b1", "In the same way pleasure", "B366: 1205b in the running head; 368 ends at 1205a 40"),
]


def column_marks(bk: Book) -> list[dict]:
    """[{col, page, unit}]: where each of the 66 columns opens, by Wikisource's
    marks with WS_COL_FIXES put right. `unit` is the first word after the mark."""
    marks, used = [], set()
    pending = None
    for it in bk.stream:
        if it.get("m") == "col":
            pending = it["v"]
        elif "t" in it and pending:
            col, pg = pending, it["page"]
            if (pg, col) in WS_COL_FIXES:
                used.add((pg, col))
                col = WS_COL_FIXES[(pg, col)]
            if col:
                marks.append({"col": col, "page": pg, "unit": it["pi"]})
            pending = None
    stale = set(WS_COL_FIXES) - used
    if stale:
        sys.exit(f"WS_COL_FIXES {sorted(stale)}: no such mark (stale?)")
    if [m["col"] for m in marks] != COLUMNS:
        sys.exit("column marks do not run 1181a ... 1213b once each: "
                 + str([m["col"] for m in marks]))
    return marks


def column_label_lines(bk: Book, marks: list[dict], groups: list[dict]) -> dict[str, tuple[int, int]]:
    """{column: (page, unit)}: the printed line each column's label stands beside.
    The margin item is found on or next to the line holding Wikisource's mark
    (the Greek's column break and the English line need not agree to the line).
    A column with no label item in either scan must be in MARGIN_READS."""
    by_page = collections.defaultdict(list)
    for g in groups:
        by_page[g["page"]].append(g)
    reads = {ref[:-1]: (pg, words) for pg, ref, words, why in MARGIN_READS}
    out, used_reads = {}, set()
    for m in marks:
        pg, u = m["page"], m["unit"]
        starts = line_starts(bk, "B", pg)
        k = max([i for i, f in enumerate(starts) if f <= u] or [0])
        # the mark's line first, then the line after, then the line before
        wanted = [starts[j] for j in (k, k + 1, k - 1) if 0 <= j < len(starts)]
        found = None
        for w in wanted:
            for g in by_page[pg]:
                if abs(g["unit"] - w) <= 1 and any(is_label_text(t) for _, t, _ in g["items"]):
                    found = g
                    break
            if found:
                break
        if found:
            out[m["col"]] = (pg, found["unit"])
        elif m["col"] in reads:
            rpg, words = reads[m["col"]]
            used_reads.add(m["col"])
            out[m["col"]] = (rpg, find_words(bk, rpg, words))
        else:
            sys.exit(f"no label for {m['col']} beside page {pg} unit {u}: add a MARGIN_READS entry")
    unused = set(reads) - used_reads
    if unused:
        sys.exit(f"MARGIN_READS {sorted(unused)}: the scans read these labels (stale?)")
    return out


def find_words(bk: Book, pg: int, words: str) -> int:
    """The unit where `words` (our text, whitespace-separated) opens on page pg; exactly one."""
    wt = words.split()
    ws = bk.words[pg]
    hits = [i for i in range(len(ws) - len(wt) + 1)
            if [t for u in ws[i:i + len(wt)] for t in (u["out"] or [""])][:len(wt)] == wt
            or [u["t"] for u in ws[i:i + len(wt)]] == wt]
    if len(hits) != 1:
        sys.exit(f"{words!r} on page {pg}: found {len(hits)} times, expected once")
    return hits[0]


# Printed line numbers the OCR garbled or dropped in both scans, read off the
# page images: (WS page, Bekker reference, first words of the printed line, why).
NUMBER_READS: list[tuple[int, str, str, str]] = [
    (311, "1185b10", "no one is praised for the virtues", "B308: 10 beside this line"),
    (312, "1185b15", "that defect and excess destroy", "B309: 15 beside this line"),
    (320, "1188b15", "But now we must speak about necessity", "B317: 15 beside this line (OCR 5)"),
    (323, "1189b10", "For in geometry, when one says", "B320: 10 beside this line (WS read it as the word to)"),
    (325, "1190b5", "judgement of each man stands towards the right,", "B322: 5 beside this line"),
    (325, "1190b10", "and fear, we must examine", "B322: 10 beside this line"),
    (346, "1197b10", "a virtue, it is reasonable", "B343: 10 beside this line"),
    (351, "1199a15", "with everybody in his intercourse", "B348: 15 beside this line"),
    (352, "1199b20", "This is made plain by the lawgiver.", "B349: 20 beside this line"),
    (365, "1204a25", "pleasure, not merely because other people", "B362: 25 beside this line"),
    (371, "1206a20", "It is evident, then, that virtue is", "B368: 20 beside this line"),
]

# Numbers the print omits: a column whose count stops short, checked on the image.
# (column, number, why)
NUMBER_ABSENT: list[tuple[str, int, str]] = [
    ("1184a", 35, "B305: nothing printed; 1184b opens two lines after 30's block"),
    ("1213a", 35, "B388: nothing printed; 1213b opens on the line after 30"),
]

# Line numbers a column carries in the outer margin: every fifth line, 5 to 35.
# The first page opens at line 24 in both of 1181's columns (so only 25 follows),
# and the work ends at 1213b 30.
def expected_numbers(col: str) -> tuple[list[int], list[int]]:
    """(required, allowed). A 40 is printed beside some columns' last line."""
    if col in ("1181a", "1181b"):
        return [25], [25]
    if col == "1213b":
        return list(range(5, 31, 5)), list(range(5, 31, 5))
    return list(range(5, 36, 5)), list(range(5, 41, 5))


def margin_numbers(bk: Book, groups: list[dict], labels: dict[str, tuple[int, int]]):
    """Every printed Bekker line number: ({column: [(n, page, unit)]}, problems).

    Bekker numbers stand in the outer margin (right on odd pages, left on even);
    the chapter numbers stand on the inner side, so they are not collected.
    Where the scans read one margin item differently (a dropped leading digit:
    5 for 25), the reading that keeps the column's numbers in order and inside
    its expected 5, 10 ... 35 is taken, and only if exactly one does."""
    label_keys = set(labels.values())
    order = sorted((labels[c], c) for c in COLUMNS)
    fixed: dict[str, list] = collections.defaultdict(list)
    for pg, ref, words, why in NUMBER_READS:
        col, n = re.fullmatch(r"(\d{4}[ab])(\d+)", ref).groups()
        fixed[col].append((int(n), pg, find_words(bk, pg, words)))
    per_col: dict[str, list] = {c: [] for c in COLUMNS}
    problems = []
    for g in groups:
        key = (g["page"], g["unit"])
        if key in label_keys:
            continue
        odd = g["page"] % 2 == 1
        vals: dict[str, list[int]] = {}
        for scan, t, side in g["items"]:
            if odd and side != "R":
                continue
            kind, v = classify_margin(t)
            if kind == "num":
                vals.setdefault(scan, []).append(v)
        cands = sorted({v for vs in vals.values() for v in vs})
        if not cands:
            continue
        col = None
        for lk, c in order:
            if lk <= key:
                col = c
        if col is None:
            problems.append(f"page {g['page']} unit {g['unit']}: number {cands} before the first label")
            continue
        per_col[col].append({"cands": cands, "page": g["page"], "unit": g["unit"]})
    result: dict[str, list] = {}
    for col in COLUMNS:
        groups_ = per_col[col]
        for n, pg, u in fixed.get(col, []):
            groups_ = [g for g in groups_ if not (g["page"] == pg and abs(g["unit"] - u) <= 2)]
            groups_.append({"cands": [n], "page": pg, "unit": u, "fixed": True})
        groups_.sort(key=lambda g: (g["page"], g["unit"]))
        required, exp = expected_numbers(col)
        sols = _orderings(groups_, exp)
        if len(sols) != 1:
            problems.append(f"{col}: {len(sols)} readings fit; groups "
                            + str([(g["page"], g["unit"], g["cands"]) for g in groups_]))
            result[col] = []
            continue
        chosen = [(v, g["page"], g["unit"]) for v, g in zip(sols[0], groups_)]
        result[col] = chosen
        absent = {n for c, n, _ in NUMBER_ABSENT if c == col}
        missing = [x for x in required if x not in sols[0] and x not in absent]
        stale = [x for x in absent if x in sols[0]]
        if stale:
            problems.append(f"{col}: NUMBER_ABSENT {stale} but the scans print them (stale?)")
        if missing:
            problems.append(f"{col}: no printed number found for {missing}")
    return result, problems


def _orderings(groups_: list[dict], exp: list[int]) -> list[list[int]]:
    """Every way to give each group one of its readings, in increasing order, from `exp`."""
    out: list[list[int]] = []

    def go(i: int, last: int, acc: list[int]):
        if len(out) > 2:
            return
        if i == len(groups_):
            out.append(list(acc))
            return
        for v in groups_[i]["cands"]:
            if v > last and v in exp:
                go(i + 1, v, acc + [v])

    go(0, 0, [])
    return out


# ------------------------------------------------------------------ the text

def curl_quotes(tok: str) -> str:
    """Wikisource's straight single quotes as the print has them: ‘ opens,
    ’ closes or stands for an apostrophe; < > are the editor's angle brackets."""
    out = []
    for i, c in enumerate(tok):
        if c == "'":
            prev = tok[i - 1] if i else ""
            nxt = tok[i + 1] if i + 1 < len(tok) else ""
            if prev.isalpha() and nxt.isalpha():
                out.append("’")
            elif i == 0 or prev in "([<⟨":
                out.append("‘")
            else:
                out.append("’")
        elif c == "<":
            out.append("⟨")
        elif c == ">":
            out.append("⟩")
        else:
            out.append(c)
    return "".join(out)


def assemble(bk: Book, para_starts: set) -> list[dict]:
    """The chapters: [{book, n, words: [{w, para, first}]}]. `first` is the
    source unit of the word's first token; `units` all of them."""
    chapters: list[dict] = []
    cur = {"book": 1, "n": 1, "toks": []}
    book = 1
    pending_para = False
    for it in bk.stream:
        m = it.get("m")
        if m == "chap":
            v = it["v"]
            chapters.append(cur)
            if v == 1 and book == 1:
                book = 2
            cur = {"book": book, "n": v, "toks": []}
            pending_para = True
        elif "t" in it:
            key_ = (it["page"], it["pi"])
            if key_ in para_starts:
                pending_para = True
            toks = [(t, False, None) for t in it.get("pre", [])]
            toks += [(t, it["glue"] if j == 0 else False, key_ if j == 0 else None)
                     for j, t in enumerate(it["out"])]
            toks += [(t, False, None) for t in it.get("post", [])]
            for t, glue, u in toks:
                # a paragraph opens on the first token a unit gives; a unit dropped
                # outright leaves the opening for the next token
                cur["toks"].append({"t": t, "glue": glue, "u": u, "para": pending_para})
                pending_para = False
    chapters.append(cur)
    # join fragments ending in a hyphen to the next token
    for ch in chapters:
        toks, out, i = ch["toks"], [], 0
        while i < len(toks):
            tk = toks[i]
            if tk["t"].endswith("-") and not tk["t"].endswith("--") and i + 1 < len(toks):
                nx = toks[i + 1]
                keep = (tk["t"], nx["t"]) in KEEP_HYPHEN
                out.append({"t": (tk["t"] if keep else tk["t"][:-1]) + nx["t"], "glue": tk["glue"],
                            "u": tk["u"], "para": tk["para"], "u2": nx["u"]})
                i += 2
            else:
                out.append(tk)
                i += 1
        ch["toks"] = out
    # tokens -> words
    for ch in chapters:
        words: list[dict] = []
        for tk in ch["toks"]:
            t = curl_quotes(tk["t"])
            if tk["glue"] and words and not tk["para"]:
                words[-1]["w"] += t
                words[-1]["units"] += [u for u in (tk["u"], tk.get("u2")) if u]
            else:
                words.append({"w": t, "para": tk["para"], "first": tk["u"],
                              "units": [u for u in (tk["u"], tk.get("u2")) if u],
                              "glued_first": tk["glue"]})
        if words:
            words[0]["para"] = True
        ch["words"] = words
        del ch["toks"]
    return chapters


# ------------------------------------------------------------------ anchors and files

BOOK_TITLES = {1: "Book I", 2: "Book II"}


def paragraphs_of(ch: dict) -> list[str]:
    paras: list[list[str]] = []
    for w in ch["words"]:
        if w["para"] or not paras:
            paras.append([])
        paras[-1].append(w["w"])
    return [" ".join(p) for p in paras]


def book_html(chapters: list[dict], book: int) -> str:
    blocks = []
    for ch in chapters:
        if ch["book"] != book:
            continue
        ps = ["<p>" + html_escape(p) + "</p>" for p in paragraphs_of(ch)]
        blocks.append(f"Part {ch['n']}\n\n" + "\n".join(ps) + "\n")
    return f"<h3>{BOOK_TITLES[book]}</h3>\n\nTranslated by St. George Stock\n\n\n" + "\n".join(blocks)


def html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def phrase_pattern(phrase: str) -> re.Pattern:
    return re.compile(r"(?<!\S)" + r"\s+".join(re.escape(w) for w in phrase.split()) + r"(?!\S)")


def build_anchors(bk: Book, chapters: list[dict]):
    """[(bekker, at)] in reading order, from the printed margins; and a report."""
    marks = column_marks(bk)
    groups = margin_groups(bk)
    labels = column_label_lines(bk, marks, groups)
    nums, problems = margin_numbers(bk, groups, labels)
    if problems:
        sys.exit("MARGIN NUMBERS:\n  " + "\n  ".join(problems))
    entries = []
    for col in COLUMNS:
        line = "24" if col in ("1181a", "1181b") else "1"
        entries.append((labels[col], col + line))
        for n, pg, u in nums[col]:
            entries.append(((pg, u), f"{col}{n}"))
    entries.sort(key=lambda e: e[0])
    # the word each unit starts, or the next that starts one
    start_of: dict[tuple, tuple] = {}
    for ci, ch in enumerate(chapters):
        for wi, w in enumerate(ch["words"]):
            if w["first"] and not w["glued_first"]:
                start_of[w["first"]] = (ci, wi)
    order = [(pg, pi) for pg in bk.pages for pi in range(len(bk.words[pg]))]
    pos = {u: i for i, u in enumerate(order)}
    book_text: dict[int, str] = {}
    for ch in chapters:
        book_text[ch["book"]] = book_text.get(ch["book"], "") + " " + " ".join(w["w"] for w in ch["words"]) + "\n"
    out = []
    for (pg, u), bekker in entries:
        k = pos[(pg, u)]
        while order[k] not in start_of:
            k += 1
        ci, wi = start_of[order[k]]
        ch = chapters[ci]
        words = [w["w"] for w in ch["words"][wi:]]
        for nxt in chapters[ci + 1:]:                       # a line may hold a chapter's last word
            if nxt["book"] != ch["book"] or len(words) >= 40:
                break
            words += [w["w"] for w in nxt["words"]]
        n = min(8, len(words))
        while True:
            phrase = " ".join(words[:n])
            hits = len(phrase_pattern(phrase).findall(book_text[ch["book"]]))
            if hits == 1 or n >= len(words):
                break
            n += 1
        if hits != 1:
            sys.exit(f"{bekker}: no unique phrase from {words[:12]}")
        out.append((bekker, phrase))
    return out, labels, nums


def anchors_yaml(entries: list[tuple[str, str]]) -> str:
    head = ("# generated by tools/build_mm_stock.py from St. George Stock's printed margins "
            "(Oxford Works of Aristotle vol. IX, 1915; scans archive.org works0009aris and "
            "theworksofaristo09arisuoft): each number is read beside its printed line, never "
            "interpolated; a column label stands for that column's line 1 (1181a and 1181b: line 24)\n")
    body = "".join(f'- bekker: "{b}"\n  at: "{a}"\n' for b, a in entries)
    return head + body


# ------------------------------------------------------------------ checks, files, report

STRAY = re.compile(r"[®°©*«»|¦†‡§¶]")
BOOK_CHAPTERS = {1: 34, 2: 17}
LOADER_CFG = {"dir": "mm-stock", "books": 2, "chapter_marker": "part"}


def fetch_images() -> None:
    """Download the page images the reads tables cite (B<n>: scan B, leaf n)."""
    import urllib.request
    img = OCR / "img"
    img.mkdir(parents=True, exist_ok=True)
    cited = set()
    for table in (PRINT_READS, IMAGE_PUNCT, MARGIN_READS, NUMBER_READS, NUMBER_ABSENT):
        for row in table:
            cited.update(int(n) for n in re.findall(r"\bB(\d+)\b", row[-1]))
    for n in sorted(cited):
        dest = img / f"B{n}.jpg"
        if not dest.exists():
            url = f"https://archive.org/download/theworksofaristo09arisuoft/page/n{n}_w1200.jpg"
            dest.write_bytes(urllib.request.urlopen(url).read())
            print("fetched", dest.name)


def check_text(chapters: list[dict]) -> None:
    counts = collections.Counter(ch["book"] for ch in chapters)
    if dict(counts) != BOOK_CHAPTERS:
        sys.exit(f"chapters per book {dict(counts)}, expected {BOOK_CHAPTERS}")
    for book in BOOK_CHAPTERS:
        ns = [ch["n"] for ch in chapters if ch["book"] == book]
        if ns != list(range(1, BOOK_CHAPTERS[book] + 1)):
            sys.exit(f"book {book} chapters run {ns}")
    text = " ".join(w["w"] for ch in chapters for w in ch["words"])
    bad = STRAY.findall(text)
    if bad:
        sys.exit(f"stray marks in the text: {sorted(set(bad))}")
    if re.search(r"\d", text):
        sys.exit("a digit in the text: " + str(re.findall(r".{20}\d.{20}", text)[:3]))
    if re.search(r"[<>&]|'|\"", text):
        sys.exit("an unconverted quote or bracket: " + str(re.findall(r".{20}[<>&'\"].{20}", text)[:3]))
    if not text.rstrip().endswith("on a footing of equality."):
        sys.exit("the text does not end where Stock ends")


def book_of(bekker: str) -> int:
    """The first book runs to 1198b20, the second begins at 1198b24."""
    col, line = bekker[:5], int(bekker[5:])
    return 1 if (col, line) < ("1198b", 24) else 2


def check_loaded(entries: list[tuple[str, str]]) -> dict:
    """Read the written files back through the pipeline's own loader and test
    every anchor against what it loads."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from aristotle_pipeline import stage1_archive
    prose = stage1_archive._load_prose(LOADER_CFG)
    want = [(b, n) for b, top in BOOK_CHAPTERS.items() for n in range(1, top + 1)]
    if sorted(prose) != want:
        sys.exit(f"loader gives {len(prose)} chapters, expected {len(want)}: {sorted(prose)[:3]} ...")
    book_text = {b: "\n".join(prose[(b, n)] for n in range(1, top + 1)) for b, top in BOOK_CHAPTERS.items()}
    bad = [(b, len(phrase_pattern(at).findall(book_text[book_of(b)]))) for b, at in entries]
    bad = [x for x in bad if x[1] != 1]
    if bad:
        sys.exit(f"anchors not found exactly once in their book: {bad[:10]}")
    for col in COLUMNS:
        lines = [int(b[5:]) for b, _ in entries if b[:5] == col]
        if not lines:
            sys.exit(f"no anchors for column {col}")
        if lines != sorted(set(lines)):
            sys.exit(f"{col}: line numbers do not strictly increase: {lines}")
    return prose


def main(argv: list[str]) -> None:
    if "--fetch-images" in argv:
        fetch_images()
    bk = Book()
    log = resolve(bk)
    starts_b, odd = scan_paragraph_starts(bk, "B")
    chapters = assemble(bk, starts_b)
    check_text(chapters)
    entries, labels, nums = build_anchors(bk, chapters)
    OUT.mkdir(parents=True, exist_ok=True)
    for book in BOOK_CHAPTERS:
        (OUT / f"book-{book:02d}.html").write_text(book_html(chapters, book), encoding="utf-8")
    (OUT / "anchors.yaml").write_text(anchors_yaml(entries), encoding="utf-8")
    prose = check_loaded(entries)
    report(bk, log, chapters, entries, nums, prose)


def report(bk, log, chapters, entries, nums, prose) -> None:
    words = sum(len(ch["words"]) for ch in chapters)
    text = " ".join(w["w"] for ch in chapters for w in ch["words"])
    print(f"words in text: {words}   chapters: {len(chapters)}   paragraphs: "
          f"{sum(len(paragraphs_of(ch)) for ch in chapters)}")
    print("typography:", {c: text.count(c) for c in "‘’“”—…⟨⟩"},
          " apostrophes inside words:", len(re.findall(r"(?<=[A-Za-z])’(?=[A-Za-z])", text)))
    dropped = sum(max(0, len(w.split()) - len(p.split())) for _, w, p, _ in PRINT_READS)
    print("tokens changed vs Wikisource: scans-agree fix", len(log["agree"]),
          "| image read", len(PRINT_READS), "entries", "| restored", len(log["restore"]),
          "| dropped", dropped)
    for k in ("agree", "restore"):
        for line in log[k]:
            print(f"  {k}: {line}")
    print(f"anchors: {len(entries)} entries, {len(COLUMNS)} column labels, "
          f"{sum(len(v) for v in nums.values())} numerals")
    thin = [(c, len(v)) for c, v in nums.items() if len(v) < 5]
    print("columns with fewer than 5 numerals:", thin)
    lost = 0
    for ch in chapters:
        ps = paragraphs_of(ch)
        got = len([x for x in prose[(ch["book"], ch["n"])].split("\n") if x.strip()])
        lost += len(ps) - got
    ws = ws_paragraph_starts(bk)
    print(f"paragraph openings: print {sum(len(paragraphs_of(ch)) for ch in chapters)}, "
          f"Wikisource blank lines {len(ws)} (it never marks a page top, and breaks around display verse)")
    print("paragraph breaks the loader drops (previous paragraph does not end a sentence):", lost)


if __name__ == "__main__":
    main(sys.argv[1:])
