"""Build sources/prob-forster/ from two archive.org OCR witnesses of E. S. Forster's
Problemata (The Works of Aristotle, vol. VII, Oxford 1927; US public domain).

Reads
  --ocr-dir  (never committed; fetch each from archive.org/download/<id>/<id>_hocr.html)
    worksofaristotle07arisuoft_hocr.html          witness A (primary: layout, numbers)
    worksofaristotle0007unse_o7n4_hocr.html       witness B (the same printing, second scan)
  sources/*/*.html           the repo's other English texts: a vocabulary and word pairs, used
                             only to settle OCR disagreements between A and B
  build/dist/Prob/chapters.json (pass 2 only) where each problem opens in Bekker's Greek, as
                             the pipeline aligned it from the First1KGreek TEI

Writes (under sources/prob-forster/)
  book-01.html ... book-38.html   one `Part N` per Forster problem (see MERGE, EXPECT)
  anchors.yaml                    Bekker line ticks read from the PRINTED marginal numbers

Two passes, because the ticks need the Greek:
  1. python3 pipeline/tools/build_prob_forster.py --pass1 --ocr-dir DIR   (Parts; empty anchors)
  2. cd pipeline && uv run python -m aristotle_pipeline all --work Prob   (writes chapters.json)
  3. python3 pipeline/tools/build_prob_forster.py --ocr-dir DIR           (the anchors)
  4. run the pipeline again; it prints any anchors it cannot place (see UNPLACEABLE).
The tool needs only the standard library.

Gate: `python3 pipeline/tools/build_prob_forster.py --verify --ocr-dir DIR [--books DIR]` checks the Parts
against the raw hOCR words of both scans and shares no text-changing rule with the build (no cleaning, no
vocabulary-driven repair or splitting on the scan side; digits stay). It leaves words out of a scan by
position and size only: margin numbers and column heads (outside the fitted body column), the running head
(a gap above the first line), footnotes (smaller type, measured per scan), call-outs (raised, small). It
exits 1 on (a) letters both scans read alike that ours lacks or changes, with no length cap, (b) ours words
neither scan has, (c) a `”`, `*`, `†`, superscript digit, digit glued to a word or a capital inside a word
that stayed in the prose, (d) a scan word that is English and that ours splits (judged by the system
dictionary and the repo's other texts), (e) a quotation mark a scan has and ours lacks. It prints how much
it examined and exits 2 if that is nothing. Reasoned exceptions, each settled from the page image, go in
VERIFY_ALLOW. `--books` points it at another folder of book-NN.html (to run it on an earlier build).

How it works
  1. hOCR words -> rows. Body text is told from footnotes by type size (the notes are set smaller);
     margins by a fitted left and right edge (the scans are skewed). Recto pages carry the problem
     numbers in the right margin and the Bekker line numbers in the left; verso pages the reverse.
  2. A problem opens at a paragraph break (a vertical gap, an indent, or a short last line on the
     page before) on a line that begins with a question word or carries a margin number. Starts
     seen in either scan are numbered by dynamic programming against the printed margin numbers
     (OCR reads them badly); a start both scans lost is found from a numbered margin token on a
     line that opens mid-line.
  3. Footnote marks (OCR'd as * ° ® ! ? digits, accented Greek) are stripped, hyphenated line ends
     rejoined (a hyphen Forster wrote, as in drinking-water, stays), run-together words split.
  4. The two scans are word-aligned. Where they differ, the reading that is an English word wins,
     then the one the neighbouring words favour, then the more confident. What is left is printed.
  5. Bekker ticks. A printed number inside Forster's problem k falls in the Greek columns between
     where Greek problem k opens and where k+1 opens, and a number that does not rise on the one
     before opens the next column. `at` is the first twelve words of the cleaned text from the first
     word that begins the printed line. The printed column marks (860a, ...) only say where the
     English is cut (the `...1` entries; the manifest sets anchor_cuts). A number that cannot be
     read or placed is skipped and counted, never guessed.

Prints the report: Parts per book against First1KGreek, the anchor counts, and every OCR
disagreement and problem start the rules did not settle.
"""
from __future__ import annotations

import argparse
import difflib
import html
import re
import statistics
import sys
from bisect import bisect_right
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "sources" / "prob-forster"
IDS = {"A": "worksofaristotle07arisuoft", "B": "worksofaristotle0007unse_o7n4"}

# Problems per book in First1KGreek (the Greek spine), books 1-38.
F1K = [55, 42, 36, 32, 42, 7, 9, 22, 14, 67, 62, 13, 12, 16, 13, 13, 3, 10, 50, 36, 26, 14,
       41, 19, 22, 62, 11, 8, 16, 14, 29, 13, 18, 12, 10, 3, 6, 11]

# Line numbers the build could not place: each is the first number of a column whose printed column
# mark neither OCR read, so the English is cut there by proportion and the phrase falls in the column
# before. (The pipeline names them as unresolved anchors; dropped here, counted in the report.)
UNPLACEABLE = {"862b5", "864b5", "917b5", "919a10", "920a5", "943a5", "949b5", "956a5"}

# Problems per book in Forster's print where it differs from First1KGreek (see manifests/Prob.yaml).
# Book 1 prints 56 (First1KGreek has no div n=6). Book 3 prints 36: Forster numbers 1-24, 25a,
# 25b, 26-35. Book 19 prints 51: his 35 is 35a (`Why is the accord in the octave the most
# beautiful`) and 35b (`Why <is the sound shrillest in the middle of the note>`), as the page
# image shows (the first scan read `35a` as `35°`); First1KGreek has one chapter 35 of both.
EXPECT: dict[int, int] = {1: 56, 3: 36, 19: 51}
# Problems read into the one before them. Forster's 25a and 25b (Book 3) share his number 25,
# and the pipeline's chapter reader takes only numeric First1KGreek divs (it drops n="25a"), so
# the chapters of Book 3 are 1-35 and the Parts must be 1-35: 25a and 25b are one Part. The same
# holds for Book 19: 35a and 35b (the 36th problem in print order) are one Part.
# Keys: book -> problems (1-based, in print order) read into the one before.
MERGE: dict[int, list[int]] = {3: [26], 19: [36]}

# Where both scans misread the print alike, so the merge cannot see it. Each entry was read off the
# page image (leaf = image n of the second scan). (book, Part, our words, the print's words, where).
# The build exits if an entry does not match exactly once, so a fix that goes stale fails loudly.
PRINT_READS: list[tuple[int, int, str, str, str]] = [
    (1, 18, "difficulty 7?", "difficulty?", "n22: call-out 5 read as 7"),
    (10, 38, "of Bpeech", "of speech?", "n128: `speech ?²`, call-out and question mark lost"),
    (19, 35, "of 3 to x (for", "of 3/2 to 1 (for", "n218: stacked fraction ³⁄₂"),
    (19, 35, "of 8 to 1 is", "of 3/2 to 1 is", "n218: stacked fraction ³⁄₂"),
]

# ----------------------------------------------------------------------------- hOCR


def parse_hocr(path: Path) -> list[dict]:
    s = path.read_text(encoding="utf-8")
    pages = []
    for pg in re.split(r'<div class="ocr_page"', s)[1:]:
        m = re.search(r"bbox 0 0 (\d+) (\d+)", pg)
        W, H = int(m.group(1)), int(m.group(2))
        words = []
        for li, lm in enumerate(re.split(r'<span class="ocr_line"', pg)[1:]):
            xm = re.search(r"x_size ([\d.]+)", lm)
            xs = float(xm.group(1)) if xm else 0.0
            for wm in re.finditer(
                r'<span class="ocrx_word"[^>]*?title="bbox (\d+) (\d+) (\d+) (\d+);\s*x_wconf (\d+)[^"]*"[^>]*>(.*?)</span>',
                lm, re.S):
                t = html.unescape(re.sub(r"<[^>]+>", "", wm.group(6))).strip()
                if t:
                    x0, y0, x1, y1, c = map(int, wm.groups()[:5])
                    words.append(dict(x0=x0, y0=y0, x1=x1, y1=y1, c=c, t=t, xs=xs, li=li))
        pages.append(dict(W=W, H=H, words=words))
    return pages


# --------------------------------------------------------------------------- layout


def _med(x):
    return statistics.median(x) if x else 0


def _rows(pg, s):
    ws = sorted(pg["words"], key=lambda w: (w["y0"] + w["y1"]) / 2)
    rows = []
    for w in ws:
        yc = (w["y0"] + w["y1"]) / 2
        # a small raised mark (an opening quote) sits well above its line's centre
        tol = 60 * s if w["t"] in ("‘", "'", "`") else 38 * s
        if rows and abs(rows[-1]["y"] - yc) < tol:
            r = rows[-1]
            r["w"].append(w)
            n = len(r["w"])
            r["y"] = (r["y"] * (n - 1) + yc) / n
        else:
            rows.append(dict(y=yc, w=[w]))
    for r in rows:
        r["w"].sort(key=lambda w: w["x0"])
    return rows


def _fit(pts, s):
    if len(pts) < 3:
        m = _med([p[1] for p in pts]) if pts else 0
        return lambda y: m
    a = b = 0.0
    for _ in range(3):
        n = len(pts)
        my = sum(p[0] for p in pts) / n
        mx = sum(p[1] for p in pts) / n
        vy = sum((p[0] - my) ** 2 for p in pts) or 1
        b = sum((p[0] - my) * (p[1] - mx) for p in pts) / vy
        a = mx - b * my
        keep = [p for p in pts if abs(p[1] - (a + b * p[0])) < 20 * s]
        if len(keep) < 3 or len(keep) == len(pts):
            break
        pts = keep
    return lambda y: a + b * y


_NOTE_WORD = re.compile(r"^(Cp|Cf|i\.e|Reading|Omitting|Omit|See|Inserting|Transposing|Deleting)\b")


def note_lead(text: list[dict]) -> bool:
    """A footnote's first line: a call-out mark, then a word notes open with (`1 Cp. chapter 23.`).
    Its type size can sit on the line between note and text, so the size alone cannot tell it."""
    if len(text) < 2:
        return False
    t0 = text[0]["t"]
    return bool(re.fullmatch(r"[^A-Za-z]{1,2}|\d{1,2}", t0)) and bool(_NOTE_WORD.match(text[1]["t"]))


def layout(pg: dict) -> dict:
    """Rows of one page split into running head, body, footnotes and margin tokens.
    A row above the cut-off line is a running head only if it is short (the head is
    `PROBLEMATA 859a` or `BOOK V. 41 885a`). A page the scan shifted up (witness B) puts its
    first line of text above the line; a row of seven words or more is that line, not a head."""
    s = pg["W"] / 2418
    rows = _rows(pg, s)
    # a short row near the top is a running head (`PROBLEMATA 859a`, `BOOK V. 41 885a`: capitals and
    # numbers) or is set off by a gap well above the line pitch; a page the scan shifted up has its first
    # line of text there, short and in lower case
    pitch = sorted(b["y"] - a["y"] for a, b in zip(rows[2:], rows[3:]))
    pitch = pitch[len(pitch) // 2] if pitch else 0
    hdr = [r for i, r in enumerate(rows) if r["y"] < 340 * s and len(r["w"]) < 7
           and (not any(re.search(r"[a-z]{3}", w["t"]) for w in r["w"])
                or i + 1 >= len(rows) or not pitch or rows[i + 1]["y"] - r["y"] > 1.3 * pitch)]
    rest = [r for r in rows if r not in hdr]
    full = [r for r in rest if len(r["w"]) >= 7 and _med([w["xs"] for w in r["w"]]) >= 62 * s]
    if not full:
        return dict(hdr=hdr, lines=[], side=None, bx0=None, bx1=None, k=0, s=s)
    # the column's edges come from the words of the text: a margin number (digits and marks alone) at
    # a line's end would otherwise pull the right edge out to itself
    def _txt(r):
        return [w for w in r["w"] if re.search(r"[A-Za-z]", w["t"])] or r["w"]
    lefts = sorted(_txt(r)[0]["x0"] for r in full)
    rights = sorted(max(w["x1"] for w in _txt(r)) for r in full)
    bx0, bx1 = lefts[len(lefts) // 4], rights[len(rights) // 2]
    side = "R" if bx0 > 300 * s else "V"
    g = 10 * s
    fitL = _fit([(r["y"], _txt(r)[0]["x0"]) for r in full if abs(_txt(r)[0]["x0"] - bx0) < 120 * s], s)
    fitR = _fit([(r["y"], max(w["x1"] for w in _txt(r))) for r in full
                 if abs(max(w["x1"] for w in _txt(r)) - bx1) < 120 * s], s)
    out = []
    for r in rest:
        ex0, ex1 = fitL(r["y"]), fitR(r["y"])
        left = [w for w in r["w"] if (w["x0"] + w["x1"]) / 2 < ex0 + 4 * s and not re.match(r"\d{1,3}\W?[A-Za-z]{2,}", w["t"])
                or w["x1"] < ex0 - g]
        right = [w for w in r["w"] if w["x0"] > ex1 + g and (w["x0"] - ex1 > 12 * s or w["x1"] - ex1 > 45 * s)]
        text = [w for w in r["w"] if w not in left and w not in right]
        inner, outer = (left, right) if side == "R" else (right, left)
        nt = len(text)
        xsm = _med([w["xs"] for w in text]) if text else 70 * s
        out.append(dict(y=r["y"], ex0=ex0, text=text, inner=inner, outer=outer, n=nt, xs=xsm,
                        fnish=nt >= 3 and (xsm < 62 * s or note_lead(text)),
                        body=nt >= 3 and xsm >= 62 * s and not note_lead(text)))
    n = len(out)
    best = None
    for k in range(n + 1):
        sc = sum(1 for l in out[k:] if l["fnish"]) + sum(1 for l in out[:k] if l["body"])
        if best is None or sc > best[0]:
            best = (sc, k)
    k = best[1]
    # a short last line of the text (a few words, body-sized) belongs to the text, not the notes
    while k < n - 1 and out[k]["n"] < 3 and out[k]["xs"] >= 60 * s and out[k + 1]["fnish"]:
        k += 1
    # the first footnote row can look like body; footnote rows are set closer (~60) than body (~87)
    while 0 < k < n and out[k - 1]["n"] >= 3 and (out[k]["y"] - out[k - 1]["y"]) < 72 * s:
        k -= 1
    for i, l in enumerate(out):
        l["fn"] = i >= k
    return dict(hdr=hdr, lines=out, side=side, bx0=bx0, bx1=bx1, k=k, s=s)


def ltxt(l):
    return " ".join(w["t"] for w in l["text"])


def htxt(pg):
    return " ".join(" ".join(w["t"] for w in r["w"]) for r in pg["hdr"])


def find_openings(L: list[dict]) -> list[int]:
    res = []
    for i, pg in enumerate(L):
        if not pg["lines"] or i < 10 or i > 380:
            continue
        top = []
        for l in pg["lines"]:
            if l["fn"]:
                break
            top.append(l)
            if l["outer"] and re.fullmatch(r"[1Il|!]\.?", l["outer"][0]["t"].strip()):
                break
            if len(top) >= 7:
                break
        t = " ".join(ltxt(l) for l in top)
        if re.search(r"\bBOOK\b|B[O0]{2}K|PROBLEMS|CONNECTED|CONCERNING|CONCERNS", t) and "PROBLEMATA" not in htxt(pg):
            res.append(i)
    return res


def book_ranges(L):
    o = find_openings(L)
    if len(o) != 38:
        raise SystemExit(f"expected 38 book openings, found {len(o)}: {o}")
    end = o[-1]
    j = end + 1
    while j < len(L) and L[j]["lines"] and ("PROBLEMATA" in htxt(L[j]) or "BOOK" in htxt(L[j]) or j <= end + 2) \
            and not L[j]["lines"][0]["fn"]:
        end = j
        j += 1
    return list(zip(o, o[1:] + [end + 1]))


# ---------------------------------------------------------------------- start flags

# words a problem opens with when no margin number is read ("Is it because", "When ..." open
# the second paragraph of a problem or a verse quotation, never a problem)
QW = re.compile(r"^(w[hu]{1,2}[yvi]|but why|how|what|whether|wherefore|does|do|in what|for what)\b", re.I)
CONF = {"I": "1", "l": "1", "|": "1", "!": "1", "i": "1", "o": "0", "O": "0", "g": "9", "Ι": "1", "S": "5",
        "s": "5", "B": "8", "z": "2", "Z": "2", "t": "1", "r": "1"}


def fuzzyq(t):
    t = re.sub(r"^[^A-Za-zͰ-Ͽἀ-῿]+", "", t)
    return bool(re.match(r"^w[hu]{1,2}[yv]", t, re.I) or QW.match(t))


def numlike(tok):
    return bool(re.search(r"\d", tok) or re.fullmatch(r"[IlΙiogSzZ!]{1,3}\.?", tok))


def parse_num(t):
    t = t.strip().rstrip(".,;:")
    if not t:
        return None
    s = "".join(CONF.get(c, c) for c in t)
    return int(s) if s.isdigit() else None


# ------------------------------------------------------------------ word cleaning

_WORD_VOCAB: set[str] | None = None
_UNI: dict[str, int] = {}
_BI: dict[tuple[str, str], int] = {}


def vocab() -> set[str]:
    """Real English words: words that occur at least 3 times in the repo's other English
    sources, plus longer words (6+ letters) of the system dictionary when there is one.
    Also fills the unigram and bigram counts used to settle OCR disagreements."""
    global _WORD_VOCAB
    if _WORD_VOCAB is None:
        for p in (ROOT / "sources").glob("*/*.html"):
            if p.parent.name == "prob-forster":
                continue
            try:
                txt = re.sub(r"<[^>]+>", " ", p.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                continue
            for sent in re.split(r"[.?!;:]", txt):
                ws = [w.lower() for w in re.findall(r"[A-Za-z]+", sent)]
                for w in ws:
                    _UNI[w] = _UNI.get(w, 0) + 1
                for pair in zip(ws, ws[1:]):
                    _BI[pair] = _BI.get(pair, 0) + 1
        v = {w for w, c in _UNI.items() if c >= 3 and (len(w) >= 2 or w in ("a", "i"))}
        for d in ("/usr/share/dict/words", "/usr/share/dict/web2"):
            if Path(d).exists():
                v.update(w.strip().lower() for w in Path(d).read_text(errors="ignore").split()
                         if w.isalpha() and len(w) >= 6)
        v.update({"a", "i"})
        _WORD_VOCAB = v
    return _WORD_VOCAB


GREEK = "Ͱ-Ͽἀ-῿"

# Stands for the apostrophe of a plural possessive (`animals’ hoofs`) from the word's reading to the
# last step, so that the rule that drops a closing quote with no opening one leaves it alone. A call-out
# the scan read as `’` after a plural (`songs’`, `clouds’`) is read at low confidence (under 85), a real
# apostrophe at 94-96; only the sure reading earns the mark.
POSS = "\ue000"
# Stands for an opening quote mark the scan is not sure of (under 85); `postprocess` keeps it only with a
# closing mark in the next sixteen words and no other opening mark between. A sure one (85 or more) keeps
# its place with a closing mark anywhere in the next 120 words (a long quotation).
UQ = "\ue001"

_SYSDICT: set[str] | None = None


def known_word(low: str) -> bool:
    """Is `low` an English word that must not be split? It is if the repo's other English texts use
    it (6+ letters), or the system dictionary has it or its stem with a plain ending (5+ letters;
    the dictionary lacks `sheared`, `abounds`, `informs`)."""
    global _SYSDICT
    vocab()
    if len(low) >= 6 and _UNI.get(low, 0) >= 1:
        return True
    if len(low) < 5:
        return False
    if _SYSDICT is None:
        d = Path("/usr/share/dict/words")
        _SYSDICT = {x.strip().lower() for x in d.read_text(errors="ignore").split()} if d.exists() else set()
    for suf, rep in (("", ""), ("s", ""), ("es", ""), ("ed", ""), ("d", ""), ("ing", ""), ("ing", "e"), ("ies", "y"),
                     ("ly", ""), ("er", ""), ("ers", "")):
        if low.endswith(suf) and len(low) - len(suf) >= 4 and low[:len(low) - len(suf)] + rep in _SYSDICT:
            return True
    return False


def clean_word(t: str) -> str:
    """One OCR token -> its text without footnote marks; '' if the token is only furniture."""
    t = t.strip()
    if not t:
        return ""
    # a Bekker column mark printed inside the text line ("932° so"); never part of the prose
    t = re.sub(r"^(?:8[5-9]\d|9[0-6]\d)[°”\"’'%2-7]?(?=[A-Za-z])", "", t)
    # signs that are never in the prose: footnote marks and OCR debris
    t = re.sub("[°®¢_]", "", t)
    # Forster quotes with single marks (‘ ’) and the prose has no * or †: a double quote mark, an
    # asterisk or a dagger is a footnote call-out (a small raised number or sign the OCR read as one)
    t = re.sub("[*†”“\"]", "", t)
    # lower-case and accented Greek is a footnote mark here; capital Greek letters label figures
    t = re.sub("[ά-ώα-ωἀ-῿]", "", t)
    t = re.sub(r"^[=©#+~*|]+", "", t)
    for _ in range(3):
        t = re.sub(r"[*©+|!^]+$", "", t)
        t = re.sub(r"(?<=[.,;:?)’'”\"])\d{1,2}$", "", t)
        t = re.sub(r"(?<=[.?!])\d{1,2}[,;:.]$", "", t)
        t = re.sub(r"(?<=[A-Za-z])\d{1,2}$", "", t) if re.fullmatch(r"[A-Za-z’'-]{2,}\d{1,2}", t) else t
        t = re.sub(r"\?{2,}$", "?", t)
        t = re.sub(r"(?<=[,.;:])\?$", "", t)
        t = re.sub(r"(?<=[,.;:])\?(?=\)$)", "", t)
        t = re.sub(r"(?<=[a-z]{2})I$", "", t)   # a raised 1 read as capital I (`areI`)
        t = re.sub(r"(?<=[A-Za-z,.;?:)])[‘]$", "", t)
        t = re.sub(r"(?<=’[.,;:?!])’$", "", t)     # a call-out after a closing quote and its stop (`‘word’,’`)
        t = re.sub(r"(?<=.)‘$", "", t)               # an opening mark at a word's end is a call-out
    if not t or re.fullmatch(r"[;:?.,]+", t):
        return t
    if re.fullmatch(r"[*©+|!'`^~=<>{}\\/#@&%$\"“”‘’.,:;?\[\]()\-—–·]*", t):
        return ""
    # "is" read as 15 or 51
    if t in ("15", "51", "1s"):
        return "is"
    # a final capital after lower-case letters is a lower-case letter the scan read large (`sO`, `aS`)
    t = re.sub(r"(?<=[a-z])[A-Z]+(?=[.,;:?!)’']*$)", lambda m: m.group(0).lower(), t)
    # A number between spaces is a number of the prose (`ratio of 3 to 2`); the call-outs the scan set
    # apart are left out by their size and height (BookStream), and a digit run set against a word's
    # letters is a call-out the scan did not set apart.
    if re.fullmatch(r"\d{4,}[%°”,.;:]*|\d+\.\d+[,.;:]*|[-—]{2,}\d*", t):
        return ""
    if re.fullmatch(r"[?!]\d{1,2}", t):
        return t[0]                             # a call-out set against a question mark (`?7`); `to 3?` is a number
    t = re.sub(r"^\d{1,2}(?=[—–]|[A-Za-z])", "", t)
    return t


# ------------------------------------------------------------------------- streams


class BookStream:
    """Cleaned words of one book in one witness, with the line each word begins on."""

    def __init__(self, L, a, b, which):
        self.which = which
        self.words: list[dict] = []   # {t, c, line, first}
        self.lines: list[dict] = []   # {page, y, flags..., w0, w1}
        self.L = L
        self._build(a, b)

    @staticmethod
    def _line_tokens(l, s) -> list[dict]:
        """The words of one text line as {t, c}. Left out: a footnote call-out, a word with no lower-case
        letter (a digit, a mark, a Greek letter) under 60% of the line's tall words in height and
        standing above their bottoms; a real word is never dropped for its size. A lone opening quote
        mark the scan is sure of is joined to the word after it. A line's first word whose box starts
        well left of the column has a margin number set against its first letter, which the scan read
        as a letter that a digit can look like (`5 ing` read as `Sing`); that letter is cut."""
        ws = l["text"]
        tall = sorted(w["y1"] - w["y0"] for w in ws)
        cap = tall[(3 * len(tall)) // 4] if tall else 0
        toks: list[dict] = []
        pend = ""
        for k, w in enumerate(ws):
            h = w["y1"] - w["y0"]
            t = w["t"]
            peers = sorted(x["y1"] for x in ws[max(0, k - 3):k + 4] if x is not w and x["y1"] - x["y0"] >= 0.85 * cap)
            floor = peers[0] if peers else w["y1"]
            if re.fullmatch(r"[‘'`]", t):          # an opening quote mark is small and raised, and is no call-out
                if w["c"] >= 85:               # (a speck with no closing mate is dropped in `postprocess`)
                    pend = "‘"
                elif w["c"] >= 60:
                    pend = UQ
                continue
            if len(ws) >= 3 and not re.search(r"[a-z]", t) and h <= 0.6 * cap and w["y1"] <= floor - 0.3 * cap:
                continue
            if cap and h < 0.3 * cap and len(ws) >= 3:
                continue        # a speck of ink the scan boxed as a word (a box a third of the line's height)
            if w["c"] < 20 and re.fullmatch(r"[\d\W_]+", t):
                continue        # a digit or mark the scan is all but sure is not there (`1` over `not`)
            if k == 0 and w["x0"] < l["ex0"] - 25 * s and len(t) >= 4 and t[0] in "SsIl|!OoZzgB3":
                per = (w["x1"] - w["x0"]) / len(t)      # as wide as the letters it covers: cut those that lie left of the edge
                t = t[min(3, len(t) - 3, max(1, round((l["ex0"] - w["x0"]) / per))):]
            if re.fullmatch(r"[’'][.,;:?!)]*", t) and toks and w["c"] >= 50:
                toks[-1]["t"] += t          # a closing mark set apart from its word (`‘two-five’ ,`)
                continue
            if t[:1] == "‘" and w["c"] < 85:
                t = UQ + t[1:]
            toks.append(dict(t=pend + t, c=w["c"]))
            pend = ""
        return toks

    def _body_lines(self, a, b):
        seq = []
        for i in range(a, b):
            for k, l in enumerate(x for x in self.L[i]["lines"] if not x["fn"]):
                seq.append((i, k, l))
        return seq

    def _build(self, a, b):
        seq = self._body_lines(a, b)
        v = vocab()
        pending = None  # hyphen carry
        for n, (i, k, l) in enumerate(seq):
            pg = self.L[i]
            s = pg["s"]
            if not l["text"]:
                continue
            if n == 0:
                gap = True
            else:
                pi, pk, pl = seq[n - 1]
                if pi == i:
                    gap = (l["y"] - pl["y"]) > 1.07 * 87 * s
                else:
                    gap = bool(pl["text"] and pl["text"][-1]["x1"] < self.L[pi]["bx1"] - 50 * self.L[pi]["s"])
            ind = pg["side"] == "R" and l["text"][0]["x0"] > pg["bx0"] + 40 * s
            outer = [w["t"] for w in l["outer"] if re.fullmatch(r"[\w|!.,:;]{1,4}", w["t"])]
            inner = [dict(t=w["t"], c=w["c"], x0=w["x0"]) for w in l["inner"]]
            ln = dict(page=i, k=k, y=l["y"], gap=gap, ind=ind, outer=outer, inner=inner, text=ltxt(l),
                      q=fuzzyq(ltxt(l)), num=any(numlike(t) for t in outer), w0=len(self.words))
            ln["pos"] = gap or ind
            ln["start"] = (ln["pos"] and ln["q"]) or (ln["pos"] and ln["num"])
            ln["idx"] = len(self.lines)
            first = True
            toks = self._line_tokens(l, s)
            # standalone punctuation joins the word before it
            for tk in toks:
                ct = clean_word(tk["t"])
                if not ct:
                    continue
                if tk["c"] >= 85 and re.fullmatch(r"[A-Za-z]+(?:-[A-Za-z]+)*s’", ct):
                    ct = ct[:-1] + POSS
                if re.fullmatch(r"[;:?.,]+", ct) or (ct[0] in "—–" and self.words and pending is None):
                    if self.words:
                        self.words[-1]["t"] += ct
                    continue
                if pending is not None and first:
                    # join across the line break
                    head = pending["t"][:-1]
                    core_t = re.sub(r"[^A-Za-z]", "", ct).lower()
                    core_h = re.sub(r"[^A-Za-z]", "", head).lower()
                    # a break inside a word is rejoined; a hyphen the author wrote (drinking-water,
                    # over-feeding) stays: both halves are words and the whole is not
                    if ((core_h + core_t) in v or _UNI.get(core_h, 0) < 3 or _UNI.get(core_t, 0) < 3) \
                            and not ct[:1].isupper():
                        pending["t"] = head + ct
                    else:
                        pending["t"] = pending["t"] + ct
                    pending["c"] = min(pending["c"], tk["c"])
                    pending = None
                    first = False
                    # the rest of this line's words begin on this line; the joined word does not
                    continue
                wd = dict(t=ct, c=tk["c"], line=ln["idx"], first=first)
                self.words.append(wd)
                first = False
            if self.words and re.search(r"[A-Za-z]-$", self.words[-1]["t"]) and self.words[-1]["line"] == ln["idx"]:
                pending = self.words[-1]
            ln["w1"] = len(self.words)
            self.lines.append(ln)
        # the book's title lines come before its first problem: drop them
        first = next((l for l in self.lines[:15] if l["start"]), None)
        if first is not None:
            cut = first["w0"]
            self.words = self.words[cut:]
            self.lines = [l for l in self.lines if l["idx"] >= first["idx"]]
            for l in self.lines:
                l["w0"] -= cut
                l["w1"] -= cut
        self._split_words()

    def _split_words(self):
        """Split the run-together words of this scan (`whichthey`, `areexercising`) before the two
        scans are aligned: the scans run different words together, and aligned as they stand they
        lose words (`which they are exercising`). Lines keep their word spans."""
        new, start = [], []
        prev = ""
        for w in self.words:
            start.append(len(new))
            parts = split_run_together(w["t"], prev).split(" ")
            for k, p in enumerate(parts):
                new.append(dict(w, t=p, first=w["first"] and k == 0))
            prev = w["t"]
        start.append(len(new))
        self.words = new
        for l in self.lines:
            l["w0"], l["w1"] = start[l["w0"]], start[l["w1"]]


def norm(t):
    return re.sub(r"[^a-z]", "", t.lower())


# ----------------------------------------------------------- merging two witnesses


def wscore(t: str, conf: int) -> float:
    core = re.sub(r"[^A-Za-z]", "", t)
    low = core.lower()
    if not low:
        return 0.0
    s = 0.0
    if low in vocab():
        s += 3.0
    elif core[:1].isupper() and len(core) >= 4:
        s += 1.5
    if re.search(r"[0-9*°®|\\^_]", t):
        s -= 1.5
    return s + conf / 100.0


def _same_word(wa: dict, wb: dict) -> str:
    """The same word read by both scans. Marks only ever add characters to a token, and the
    cleaning removes them, so a stop one scan has and the other lacks is one the other lost:
    keep the longer ending; otherwise the more confident reading. An opening quote mark either scan
    read stays: nothing the scans misread as a call-out stands before a word."""
    ta, tb = wa["t"], wb["t"]
    if (POSS in ta) != (POSS in tb):      # a plural's apostrophe stands only where both scans are sure of it
        ta, tb = ta.replace(POSS, ""), tb.replace(POSS, "")
    lead = "‘" if (ta[:1] == "‘" or tb[:1] == "‘") else (UQ if (ta[:1] == UQ or tb[:1] == UQ) else "")
    ta, tb = ta.lstrip("‘" + UQ), tb.lstrip("‘" + UQ)
    if ta == tb:
        return lead + ta
    ea = len(ta) - len(ta.rstrip(".,;:?)’”\"'—" + POSS))
    eb = len(tb) - len(tb.rstrip(".,;:?)’”\"'—" + POSS))
    if ta.rstrip(".,;:?)’”\"'—" + POSS) == tb.rstrip(".,;:?)’”\"'—" + POSS) and ea != eb:
        return lead + (ta if ea > eb else tb)
    return lead + (ta if wb["c"] <= wa["c"] + 15 else tb)


def _lost_line(run: int, w: dict) -> bool:
    """Keep a word that only one scan has? A long stretch is lines the other scan lost, and its
    words stay; so does a stretch of a line's length (6 or more) in plain letters, which keeps
    `mese` and `weese`, words the vocabulary lacks. A single plain lower-case word the scan is
    sure of (`slope`, `jury`) stays too: the vocabulary is only the repo's other texts. Other
    short stretches go by `wscore`."""
    plain = re.fullmatch(r"[A-Za-z’'‘]+(?:[,.;:?)’'—–]+[A-Za-z’'‘]+)*[.,;:?)’']*", w["t"]) is not None
    return run >= 40 or (run >= 6 and plain) or (plain and w["c"] >= 90 and len(w["t"]) >= 4
                                                 and w["t"][:1].islower())


class Merged:
    """The two witnesses of one book, word-aligned and voted into one word list."""

    def __init__(self, sa: BookStream, sb: BookStream):
        self.sa, self.sb = sa, sb
        self.w: list[dict] = []        # {t, c, a, b}
        self.unsettled: list[tuple] = []  # (merged index, A reading, B reading)
        self.a2m = [None] * len(sa.words)
        self.b2m = [None] * len(sb.words)
        self._merge()

    def _add(self, t, c, a=None, b=None):
        self.w.append(dict(t=t, c=c, a=a, b=b))
        k = len(self.w) - 1
        if a is not None:
            self.a2m[a] = k
        if b is not None:
            self.b2m[b] = k
        return k

    def _merge(self):
        A, B = self.sa.words, self.sb.words
        na = [norm(w["t"]) or w["t"] for w in A]
        nb = [norm(w["t"]) or w["t"] for w in B]
        sm = difflib.SequenceMatcher(None, na, nb, autojunk=False)
        ops = sm.get_opcodes()
        if len(ops) > 1 and ops[0][0] in ("insert", "replace") and ops[0][4] - ops[0][3] < 30 \
                and ops[0][1] == 0 and ops[1][0] == "equal":
            # B's first words are the book's title lines (it opened its first problem later): drop them
            _, i1, i2, j1, j2 = ops[0]
            for i in range(i1, i2):
                self._add(A[i]["t"], A[i]["c"], a=i)
            for j in range(j1, j2):
                self.b2m[j] = len(self.w)
            ops = ops[1:]
        for tag, i1, i2, j1, j2 in ops:
            if tag == "equal":
                for d in range(i2 - i1):
                    wa, wb = A[i1 + d], B[j1 + d]
                    t = _same_word(wa, wb)
                    self._add(t, max(wa["c"], wb["c"]), i1 + d, j1 + d)
            elif tag == "delete":
                run = i2 - i1
                for i in range(i1, i2):
                    if _lost_line(run, A[i]) or wscore(A[i]["t"], A[i]["c"]) >= 3:
                        self._add(A[i]["t"], A[i]["c"], a=i)
            elif tag == "insert":
                run = j2 - j1
                for j in range(j1, j2):
                    if _lost_line(run, B[j]) or wscore(B[j]["t"], B[j]["c"]) >= 3.6:
                        self._add(B[j]["t"], B[j]["c"], b=j)
            else:
                self._replace(i1, i2, j1, j2)
        for x2m, n in ((self.a2m, len(self.w)), (self.b2m, len(self.w))):
            nxt = n - 1 if n else 0
            for i in range(len(x2m) - 1, -1, -1):
                if x2m[i] is None:
                    x2m[i] = nxt
                else:
                    nxt = x2m[i]

    def _replace(self, i1, i2, j1, j2):
        A, B = self.sa.words, self.sb.words
        if i2 - i1 == j2 - j1:
            for d in range(i2 - i1):
                wa, wb = A[i1 + d], B[j1 + d]
                sa_, sb_ = wscore(wa["t"], wa["c"]), wscore(wb["t"], wb["c"])
                if norm(wa["t"]) == norm(wb["t"]):
                    t = _same_word(wa, wb)
                else:
                    t = wb["t"] if sb_ > sa_ + 0.3 else wa["t"]
                    if sa_ >= 3 and sb_ >= 3:
                        # both are words: let the neighbouring words decide
                        prev = norm(self.w[-1]["t"]) if self.w else ""
                        nxt = norm(A[i1 + d + 1]["t"]) if i1 + d + 1 < len(A) else ""
                        ca, cb = norm(wa["t"]), norm(wb["t"])
                        ra = _BI.get((prev, ca), 0) + _BI.get((ca, nxt), 0)
                        rb = _BI.get((prev, cb), 0) + _BI.get((cb, nxt), 0)
                        if ra != rb:
                            t = wa["t"] if ra > rb else wb["t"]
                        else:
                            self.unsettled.append((len(self.w), wa["t"], wb["t"], t))
                    elif sa_ < 3 and sb_ < 3:
                        self.unsettled.append((len(self.w), wa["t"], wb["t"], t))
                self._add(t, max(wa["c"], wb["c"]), i1 + d, j1 + d)
            return
        ba, bb = A[i1:i2], B[j1:j2]
        sa_ = sum(wscore(w["t"], w["c"]) for w in ba) / max(1, len(ba))
        sb_ = sum(wscore(w["t"], w["c"]) for w in bb) / max(1, len(bb))
        pickB = sb_ > sa_ + 0.3
        if len(ba) >= 3 * len(bb) + 4:
            pickB = False  # the other witness is missing this stretch: keep the long one
            sb_ = sa_
        elif len(bb) >= 3 * len(ba) + 4:
            pickB = True
            sa_ = sb_
        if abs(sa_ - sb_) < 1.0:
            self.unsettled.append((len(self.w), " ".join(w["t"] for w in ba), " ".join(w["t"] for w in bb),
                                   " ".join(w["t"] for w in (bb if pickB else ba))))
        first = len(self.w)
        if pickB:
            for j in range(j1, j2):
                self._add(B[j]["t"], B[j]["c"], b=j)
            for i in range(i1, i2):
                self.a2m[i] = first
        else:
            for i in range(i1, i2):
                self._add(A[i]["t"], A[i]["c"], a=i)
            for j in range(j1, j2):
                self.b2m[j] = first


# ------------------------------------------------------------------- problem starts


def sentence_split(M: Merged, lo: int, hi: int) -> int:
    """Where a problem opens on a line that begins mid-problem: the last sentence
    boundary on the line (merged words lo..hi)."""
    best = None
    for j in range(lo + 1, hi + 1):
        if re.search(r"[.?!][’”)\"']?$", M.w[j - 1]["t"]) and M.w[j]["t"][:1].isupper():
            best = j
    return best if best is not None else lo


def compat(tokens, e):
    for t in tokens:
        v = parse_num(t)
        if not v or v <= 0:
            continue
        if v == e:
            return True
        se, sv = str(e), str(v)
        if se.endswith(sv) or sv.endswith(se):
            return True
    return False


def line_span(M, ln, which):
    x2m = M.a2m if which == "A" else M.b2m
    lo = x2m[ln["w0"]] if ln["w0"] < len(x2m) else len(M.w) - 1
    hi = x2m[ln["w1"] - 1] if 0 < ln["w1"] <= len(x2m) else lo
    return lo, max(lo, hi)


def candidate_starts(M):
    cands = []
    for ln in M.sa.lines:
        if ln["start"]:
            lo, hi = line_span(M, ln, "A")
            cands.append(dict(pos=lo, hi=hi, toks=list(ln["outer"]), a=ln, b=None, text=ln["text"]))
    for ln in M.sb.lines:
        if ln["start"]:
            lo, hi = line_span(M, ln, "B")
            near = [c for c in cands if abs(c["pos"] - lo) <= 4]
            if near:
                near[0]["b"] = ln
                near[0]["toks"] += list(ln["outer"])
            else:
                cands.append(dict(pos=lo, hi=hi, toks=list(ln["outer"]), a=None, b=ln, text=ln["text"]))
    cands.sort(key=lambda c: c["pos"])
    return cands


def weak_numbered(M):
    out = []
    for which, S in (("A", M.sa), ("B", M.sb)):
        for ln in S.lines:
            if not ln["start"] and ln["num"]:
                lo, hi = line_span(M, ln, which)
                out.append(dict(pos=lo, hi=hi, toks=list(ln["outer"])))
    return out


def number_starts(book, M, notes):
    """Starts as [(pos, part)] in merged-word space; part is the problem's place in the book
    (the Part number). Candidates (starts seen by either witness) are placed by dynamic
    programming against the printed margin numbers. State: (part p, offset d); the margin
    number is p - d, and d grows where Forster interleaves lettered problems (25a, 25b). An
    entry earns credit for a margin number that matches, loses for one that does not, and may
    be rejected (a mid-problem paragraph) or leave parts unfilled (a start both OCRs missed,
    found afterwards from a numbered margin token on a line that opens mid-problem)."""
    cands = candidate_starts(M)
    weak = weak_numbered(M)
    n_c = len(cands)
    want = EXPECT.get(book, F1K[book - 1])
    top = max(F1K) + 12
    DM = 8
    NEG = -1e9
    best = [dict() for _ in range(n_c + 1)]
    back: dict = {}
    best[0][(0, 0)] = 0.0
    for i, c in enumerate(cands):
        both = c["a"] is not None and c["b"] is not None
        hasnum = any(0 < (parse_num(t) or 0) < 100 for t in c["toks"])
        rej = -6.0 if both else (-2.5 if hasnum else -0.3)
        for (p, d), cur in list(best[i].items()):
            if cur + rej > best[i + 1].get((p, d), NEG):
                best[i + 1][(p, d)] = cur + rej
                back[(i + 1, (p, d))] = ((p, d), False)
            for np_ in range(p + 1, min(top, p + 4) + 1):
                for nd in range(d, min(DM, d + 2) + 1):
                    if compat(c["toks"], np_ - nd):
                        a = 4.0 + (1.0 if both else 0.0)
                    elif hasnum:
                        a = -1.0 if both else -3.0
                    else:
                        a = 0.5 if both else -0.5
                    sc = cur + a - 1.5 * (np_ - p - 1) - 1.0 * (nd - d)
                    if sc > best[i + 1].get((np_, nd), NEG):
                        best[i + 1][(np_, nd)] = sc
                        back[(i + 1, (np_, nd))] = ((p, d), True)
    key = max(best[n_c], key=lambda k: best[n_c][k] - 2.5 * abs(k[0] - want))
    acc = {}
    for i in range(n_c, 0, -1):
        pk, took = back[(i, key)]
        if took:
            acc[i - 1] = key
        key = pk
    out = []
    prev_part, prev_pos = 0, -1
    for i, (n, d) in sorted(acc.items()):
        c = cands[i]
        for m in range(prev_part + 1, n):
            w = [x for x in weak if prev_pos < x["pos"] < c["pos"] and compat(x["toks"], m - d)]
            if w:
                pos = sentence_split(M, w[0]["pos"], w[0]["hi"])
                out.append(pos)
                notes.append(f"book {book}: a problem opens mid-line at merged word {pos} (margin number only)")
            else:
                notes.append(f"book {book}: part {m} not found before word {c['pos']} ({c['text'][:40]!r})")
        out.append(c["pos"])
        if not compat(c["toks"], n - d):
            notes.append(f"book {book}: start without a readable number {c['text'][:40]!r} margin {c['toks']}")
        prev_part, prev_pos = n, c["pos"]
    for i, c in enumerate(cands):
        if i not in acc:
            notes.append(f"book {book}: rejected start {c['text'][:40]!r} margin {c['toks']}")
    return sorted(set(out))


# --------------------------------------------------------------------- problem text


FUNC = {"they", "also", "which", "when", "them", "their", "then", "what", "where", "there", "a", "an", "the", "to", "of", "in", "on", "at", "is", "it", "and", "for", "as", "or", "be", "by", "if",
        "so", "we", "he", "are", "was", "not", "that", "this", "but", "his", "its", "one", "no", "do", "up", "us",
        "my", "me", "i", "who", "how", "why", "has", "had", "can", "all", "any", "than", "with", "from", "are"}


def _segment(s: str, k: int):
    v = vocab()
    if s in v and (len(s) >= 2 or s in ("a", "i")):
        return [s]
    if k == 0:
        return None
    for i in range(len(s) - 1, 0, -1):   # the longest first word that leaves a word or words
        a = s[:i]
        if a in v and (len(a) >= 2 or a in ("a", "i")):
            r = _segment(s[i:], k - 1)
            if r:
                return [a] + r
    return None


def split_run_together(t: str, prev: str = "") -> str:
    """`Whyisit` -> `Why is it`: a word that is not English but is made of English words,
    one of them a small function word. Case and surrounding punctuation are kept. A word that is
    English whole (`sheared`, `informs`) stays, and so does a name in mid-sentence (`Attica`,
    `Messina`) unless a function word of two letters or more ends it (`Libyaas`); `prev` is the
    word before."""
    g = re.fullmatch(r"([A-Za-z]{2,}[,;:?])([A-Za-z]{2,})", t)
    if g:
        return g.group(1) + " " + g.group(2)        # `And,speaking`: the space after the stop was lost
    m = re.fullmatch(r"([^A-Za-z]*)([A-Za-z]{3,16})([^A-Za-z]*)", t)
    if not m:
        return t
    lead, core, trail = m.groups()
    low = core.lower()
    if low in vocab() or known_word(low) or low in ("mese", "nete", "hypate", "paranete", "parhypate", "lichanos", "trite"):
        return t
    parts = _segment(low, 3)
    if not parts or len(parts) < 2 or not any(p in FUNC for p in parts):
        return t
    if core[:1].isupper() and prev and not re.search(r"[.?!:;]['’”\")]*$", prev) \
            and not (parts[-1] in FUNC and len(parts[-1]) >= 2):
        return t
    # a real run-together is function words and whole words; a long word cut into scraps
    # (`ventilates` -> `ventil at es`, `stickiest` -> `stick i est`) is not: a part is a function
    # word (not `i`) or a word of 4+ letters in the vocabulary or a 3-letter word the repo's
    # other English texts use often
    if not all((p in FUNC and p != "i") or (len(p) >= 4 and p in vocab()) or (len(p) == 3 and _UNI.get(p, 0) >= 25)
               for p in parts):
        return t
    if core[:1].isupper():
        parts[0] = parts[0].capitalize()
    return lead + " ".join(parts) + trail


def repair_terms(tokens: list[str]) -> list[str]:
    """Book 19 (the Music problems) names notes of the scale in italic transliteration: hypate,
    nete, mese, paranete. The scans read them as strings like `Aypaze`, `zefe`, `szese`. A word that
    is not English and has the shape of one of these is put back; the shapes are those the OCR made
    of exactly these words (checked against the printed pages). A word that is English (`verge`) is
    never changed: the repair is called for Book 19 alone, and `known_word` keeps real words out."""
    v = vocab()
    out = []
    for t in tokens:
        # italic `that` after a dash (`starting-point—that will be`): both scans misread it
        t = re.sub(r"—(?:/hat|zhat?)(?![A-Za-z])", "—that", t)
        if "-" in t and re.fullmatch(r"[A-Za-z/]+(?:-[A-Za-z/]+)+[^A-Za-z/]*", t):
            # `hypate-reed`: each part is repaired by itself
            out.append("-".join(repair_terms([x])[0] for x in t.split("-")))
            continue
        m = re.fullmatch(r"([^A-Za-z/]*)([A-Za-z/]{2,10})([^A-Za-z/]*)", t)
        if m:
            lead, core, trail = m.groups()
            low = re.sub("/", "", core.lower())
            if low not in v and not known_word(low) and low not in ("nete", "mese", "hypate", "paranete"):
                new = None
                if re.fullmatch(r"[a-z]{0,2}y[a-z]{1,2}a[a-z]{1,2}e", low):
                    new = "hypate"
                elif re.fullmatch(r"[a-z]aranet?[a-z]e", low):
                    new = "paranete"
                elif re.fullmatch(r"[a-z]{0,2}ese", low) and len(low) >= 3:
                    new = "mese"
                elif re.fullmatch(r"[a-z]{0,3}c?e?hanos", low):
                    new = "lichanos"
                elif 2 <= len(low) <= 5 and re.fullmatch(r"[b-df-hj-np-tv-z]*e[b-df-hj-np-tv-z]*e?[b-df-hj-np-tv-z]*", low) \
                        and not re.search(r"[aiouy]", low):
                    new = "nete"
                if new:
                    if core[:1].isupper() and not lead:
                        new = new.capitalize()
                    t = lead + new + trail
        out.append(t)
    return out


def postprocess(tokens: list[str]) -> str:
    """Join words; drop a closing quote mark that closes nothing (a footnote mark), a `?`
    that runs on into a lower-case word (a footnote mark), and run-together words."""
    tokens = [re.sub(r"[|>]", "", t) for t in tokens]   # marks that no stage of the cleaning caught
    tokens = [re.sub(r"\?{2,}$", "?", t) for t in tokens]   # a call-out read as a second `?`
    for i, t in enumerate(tokens[:-1]):
        if t.endswith("?") and not t.endswith("??") and re.match(r"[a-z]", tokens[i + 1]) and len(t) > 1 \
                and not re.search(r"[)’”\"']\?$", t):
            tokens[i] = t[:-1]
    for i, t in enumerate(tokens[:-2]):
        # "...? Is it because": the question's mark was lost to the OCR in both scans
        if t and tokens[i + 1:i + 3] == ["Is", "it"] and not re.search(r"[.?!;:,—)”’]$", t):
            tokens[i] = t + "?"
    # an opening quote stays only if a closing one follows and no other opening one stands between them
    # (`‘fire added to fire’`); a speck before a word is read as an opening quote with no mate. A sure mark
    # (`‘`) may have its mate 120 words on, an unsure one (UQ) only 16.
    closer = re.compile(r"[A-Za-z0-9).,;:?!]’+[.,;:?!)—]*$")
    for i, t in enumerate(tokens):
        if t[:1] not in ("‘", UQ):
            continue
        sure = t[0] == "‘"
        win = tokens[i:i + (120 if sure else 16)]
        j = next((k for k, x in enumerate(win) if closer.search(x.replace(POSS, ""))), None)
        between = win[1:j + 1] if j is not None else []
        if j is None or any((x[:1] == "‘") if sure else (x[:1] in ("‘", UQ)) for x in between):
            tokens[i] = t[1:]
        else:
            tokens[i] = "‘" + t[1:]
    tokens = [split_run_together(t, tokens[i - 1] if i else "") if t else t for i, t in enumerate(tokens)]
    first = next((i for i, t in enumerate(tokens) if t), None)
    if first is not None and re.fullmatch(r"[A-Z]{2,}[^A-Za-z]*", tokens[first]):
        tokens[first] = tokens[first][0] + tokens[first][1:].lower()
    elif first is not None and re.fullmatch(r"W[a-z]?H[a-z]?", tokens[first]):
        tokens[first] = "Why"     # `WHY` in small capitals, read as `WuHy`
    out: list[str] = []
    first_idx: list[int] = []   # for each input token, the index of its first output word
    open_s = 0
    for t in tokens:
        first_idx.append(len(out))
        if not t:
            continue
        if POSS in t:
            out.extend(t.replace(POSS, "’").split(" "))
            continue
        n_open = t.count("‘")
        m = re.search(r"([’']+)([.,;:?!)—]*)$", t)
        k = len(m.group(1)) if m else 0
        if k:
            allowed = min(k, open_s + n_open)
            if re.search(r"(?<![A-Za-z])[A-Z]$", t[: m.start(1)]):
                allowed = k   # the prime of a point in a figure (`I’` for Γ’), not a quote mark
            t = re.sub(r"\?{2,}$", "?", t[: m.start(1)] + "’" * allowed + m.group(2))
        else:
            allowed = 0
        open_s = max(0, open_s + n_open - allowed)
        out.extend(t.split(" "))
    return " ".join(out), first_idx, out


def build_book(book: int, LA, LB, bA, bB, notes):
    sa = BookStream(LA, *bA[book - 1], "A")
    sb = BookStream(LB, *bB[book - 1], "B")
    M = Merged(sa, sb)
    starts = number_starts(book, M, notes)
    for i in sorted(MERGE.get(book, []), reverse=True):
        notes.append(f"book {book}: problem {i} read into problem {i - 1} (see MERGE)")
        del starts[i - 1]
    ends = starts[1:] + [len(M.w)]
    fix = repair_terms if book == 19 else (lambda x: x)
    done = [postprocess(fix([w["t"] for w in M.w[s:e]])) for s, e in zip(starts, ends)]
    for b, part, old, new, where in PRINT_READS:
        if b == book:
            done[part - 1] = print_read(done[part - 1], old, new, f"{b}.{part} ({where})")
    return M, starts, done


def print_read(part, old: str, new: str, label: str):
    """Put the print's words for `old` in one Part, keeping the token-to-word map in step."""
    text, first, words = part
    ow, nw = old.split(" "), new.split(" ")
    hits = [i for i in range(len(words) - len(ow) + 1) if words[i:i + len(ow)] == ow]
    if len(hits) != 1:
        sys.exit(f"PRINT_READS {label}: {old!r} found {len(hits)} times, expected once")
    i, end = hits[0], hits[0] + len(ow)
    words = words[:i] + nw + words[end:]
    first = [f + len(nw) - len(ow) if f >= end else min(f, i + len(nw) - 1) if f >= i else f for f in first]
    return " ".join(words), first, words


# --------------------------------------------------------------------- Bekker ticks

DIGIT = {"o": "0", "O": "0", "I": "1", "l": "1", "i": "1", "|": "1", "g": "9", "S": "5", "s": "5", "B": "8",
         "z": "2", "Z": "2", "G": "6"}


def _col_idx(col: str) -> int:
    return int(col[:-1]) * 2 + (col[-1] == "b")


def _col_label(idx: int) -> str:
    return f"{idx // 2}{'b' if idx % 2 else 'a'}"


def load_chapters(path: Path) -> dict[int, list[tuple[int, int]]]:
    """Where each problem opens in Bekker's Greek, {book: [(column index, line)]}, from the
    pipeline's chapters.json (build/dist/Prob/, written by a run of the pipeline on the Parts
    of pass 1)."""
    import json
    d = json.loads(path.read_text(encoding="utf-8"))
    return {int(b): [(_col_idx(c["column"]), int(c["line"])) for c in lst] for b, lst in d.items()}


_MARK = re.compile(r"^\d.{1,5}$")


def _is_mark(tok: str) -> bool:
    if not _MARK.match(tok) or re.fullmatch(r"\d{1,2}", tok):
        return False
    head = "".join(DIGIT.get(c, c) for c in tok[:3])
    return head.isdigit() and 859 <= int(head) <= 967


def read_ticks(LA, LB, Ms, starts_all, chapters):
    """Bekker line numbers and column marks printed in Forster's margins.

    Each problem of Forster's is one problem of the Greek, whose first line in Bekker is known
    (the pipeline's chapters.json). A printed number inside problem k therefore falls in a column
    between the Greek column where problem k opens and the one where k+1 opens, and a number that
    does not rise on the one before it opens the next column: the column is read from the Greek,
    not from the printed column marks, which OCR often loses or misreads. The marks only say
    where in the English a column opens. Both scans are read; a number is taken from A, and from
    B where A's OCR lost it. Returns (ticks, column marks, stats), as [(book, merged word index,
    ref)]."""
    ticks, marks = [], []
    unreadable = skipped_noise = 0
    for book in range(1, 39):
        M, st, chs = Ms[book - 1], starts_all[book - 1], chapters[book]
        if len(chs) != len(st):
            raise SystemExit(f"book {book}: {len(st)} Parts but {len(chs)} chapters in chapters.json")
        ev = []
        for which, S in (("A", M.sa), ("B", M.sb)):
            for ln in S.lines:
                lo, _hi = line_span(M, ln, which)
                for t in ln["inner"]:
                    tok = t["t"]
                    v = parse_num(tok)
                    if v is not None and 5 <= v <= 40 and v % 5 == 0:   # no column has more than 40 lines
                        ev.append((lo, 0 if which == "A" else 1, "tick", v, t["c"]))
                    elif _is_mark(tok):
                        ev.append((lo, 0 if which == "A" else 1, "mark", 0, t["c"]))
                    elif which == "A" and (re.search(r"\d", tok) or numlike(tok)):
                        unreadable += 1
        ev.sort()
        # cross-scan duplicates: the same number within 40 words is one number
        # the two scans can read different numbers on one printed line (`20` and `30`): the reading the
        # scan is surer of stands, so that two numbers never share a line
        best: dict[int, tuple] = {}
        for e in ev:
            if e[2] == "tick" and (e[0] not in best or e[4] > best[e[0]][4]):
                best[e[0]] = e
        ev = [e for e in ev if e[2] != "tick" or best[e[0]] is e or best[e[0]][3] == e[3]]
        ev2, seen_tick, seen_mark = [], {}, -999
        for pos, w, kind, v, _c in ev:
            if kind == "tick":
                if v in seen_tick and pos - seen_tick[v] < 40:
                    continue
                seen_tick[v] = pos
            else:
                if pos - seen_mark < 40:
                    continue
                seen_mark = pos
            ev2.append((pos, kind, v))
        c, last, j = None, 0, -1
        assigned: list[tuple[int, int, int]] = []   # (pos, column index, value)
        for pos, kind, v in ev2:
            if kind != "tick":
                continue
            jj = max(0, bisect_right(st, pos) - 1)
            if jj != j:
                j = jj
                c, last = chs[j][0], chs[j][1] - 1
                if assigned and (assigned[-1][1] > c or (assigned[-1][1] == c and assigned[-1][2] >= chs[j][1])):
                    # the previous problem's last numbers already carry this problem's opening line
                    c, last = assigned[-1][1], assigned[-1][2]
            end_c, end_l = chs[j + 1] if j + 1 < len(chs) else (chs[j][0] + 1, 99)
            if v <= last:
                if c + 1 <= end_c:
                    c, last = c + 1, 0
                else:
                    skipped_noise += 1
                    continue
            if c == end_c and v > end_l + 2:
                skipped_noise += 1
                continue
            if v < last + 1:
                skipped_noise += 1
                continue
            assigned.append((pos, c, v))
            last = v
        for pos, c, v in assigned:
            ticks.append((book, pos, f"{_col_label(c)}{v}"))
        # column marks: the opening of a column is the last mark before its first number
        prev_c, prev_pos = None, -1
        first_start = chs[0]
        evm = [(p, k) for p, k, _ in ev2 if k == "mark"]
        for pos, c, v in assigned:
            cc = c
            if prev_c is None:
                # a book that opens at line 1 of a column: its mark is on its first lines
                if first_start[1] == 1 and c == first_start[0]:
                    cand = [p for p, _ in evm if p < pos]
                    if cand and cand[-1] - 0 < 120:
                        marks.append((book, cand[-1], f"{_col_label(c)}1"))
            elif cc > prev_c:
                cand = [p for p, _ in evm if prev_pos < p <= pos]
                if cand:
                    marks.append((book, cand[-1], f"{_col_label(cc)}1"))
            prev_c, prev_pos = cc, pos
    cols: dict[str, list[int]] = {}
    for _, _, r in ticks:
        m = re.fullmatch(r"(\d+[ab])(\d+)", r)
        cols.setdefault(m.group(1), []).append(int(m.group(2)))
    skipped = sum(max(v) // 5 - len(v) for v in cols.values())
    return ticks, marks, dict(skipped=skipped, unreadable=unreadable, resync=skipped_noise)


def write_books(done_by_book):
    OUT.mkdir(parents=True, exist_ok=True)
    for book, done in done_by_book.items():
        lines = [f"<h3>Problemata, Book {book}</h3>", "", "Translated by E. S. Forster", "", "", ""]
        for n, (text, _first, _words) in enumerate(done, 1):
            lines += [f"Part {n}", "", "<p>" + html.escape(text, quote=False) + "</p>", ""]
        (OUT / f"book-{book:02d}.html").write_text("\n".join(lines), encoding="utf-8")


def anchor_entries(ticks, colstarts, starts_all, done_all, chapters, stats):
    """[(ref, phrase)] in reading order. The phrase is the next 12 words of the cleaned text
    from the first whole word of the printed line, cut at the end of its problem."""
    ents = []
    placed: dict[tuple, str] = {}
    corpus = "\n".join(text for done in done_all for text, _f, _w in done)
    allp = sorted([(b, k, r, True) for b, k, r in colstarts] + [(b, k, r, False) for b, k, r in ticks],
                  key=lambda e: (e[0], e[1], not e[3]))
    for book, k, ref, is_col in allp:
        st = starts_all[book - 1]
        if not st or k < st[0]:
            stats["before_first"] = stats.get("before_first", 0) + 1
            continue
        j = max(i for i, s in enumerate(st) if s <= k)
        _text, first_idx, words = done_all[book - 1][j]
        local = k - st[j]
        if local >= len(first_idx):
            continue
        i0 = first_idx[local]
        phrase = " ".join(words[i0:i0 + 12])
        if len(phrase.split()) < 4:
            stats["short"] = stats.get("short", 0) + 1
            continue
        if is_col:
            # the cut for line 1 of column X must fall in the Part whose Greek problem holds that
            # line, and not at the head of a Part that opens later in the column
            chs = chapters[book]
            col_x = _col_idx(ref[:-1])
            jstar = max((i for i, (cc, ll) in enumerate(chs) if (cc, ll) <= (col_x, 1)), default=0)
            if j != jstar or (local == 0 and chs[j] != (col_x, 1)):
                stats["bad_mark"] = stats.get("bad_mark", 0) + 1
                continue
            # a column cut must name its place once in the whole text (problems repeat each other)
            n = 12
            while corpus.count(phrase) != 1 and i0 + n < len(words):
                n += 6
                phrase = " ".join(words[i0:i0 + n])
            if corpus.count(phrase) != 1:
                stats["not_unique"] = stats.get("not_unique", 0) + 1
                continue
        if ref in UNPLACEABLE:
            stats["unplaceable"] = stats.get("unplaceable", 0) + 1
            continue
        # two numbers never name one place: the build stops, so that a collision (a number read on the
        # wrong line) cannot reach anchors.yaml
        place = (book, j, i0)
        if place in placed:
            raise SystemExit(f"anchors {placed[place]} and {ref} resolve to the same place: book {book}, Part {j + 1}, "
                             f"word {i0} ({phrase[:50]!r})")
        placed[place] = ref
        ents.append((ref, phrase))
    return ents


def write_anchors(ents, stats):
    import json
    head = (
        "# Bekker line ticks read from the PRINTED marginal numbers of E. S. Forster, Problemata (Oxford, 1927).\n"
        "# Source: archive.org worksofaristotle07arisuoft; a number its OCR lost is read from the same printing's\n"
        "# second scan, worksofaristotle0007unse_o7n4. Script: pipeline/tools/build_prob_forster.py. Each `at` is the\n"
        "# opening of the printed line that carries the number (the first whole word that begins that line), as it\n"
        "# reads in the cleaned text. A `...1` entry is a column mark (860a, 860b, ...): the build cuts the English\n"
        f"# there. {len(ents)} entries; {stats['skipped']} line numbers skipped (lost to OCR or out of sequence),\n"
        f"# {stats['unreadable']} margin tokens unreadable.\n"
    )
    body = "".join(f"- bekker: {json.dumps(r)}\n  at: {json.dumps(p, ensure_ascii=False)}\n" for r, p in ents)
    (OUT / "anchors.yaml").write_text(head + body, encoding="utf-8")
    return len(ents)


# --------------------------------------------------------------------------- verify
#
# The check shares no text-changing rule with the build. Its witness side is the raw OCR word of
# each scan: lower case, edge punctuation off, line-end hyphens joined, digits kept. No vocabulary,
# no repair, no splitting, no spelling-based exemption. What it leaves out of a scan it leaves out
# by where the word sits on the page: margin numbers and column heads (outside the body column),
# the running head (the top line, set apart by a gap), footnotes (smaller type, measured per scan,
# below the text) and footnote call-outs (a raised word of small height). The build's page-range
# finder is its only shared code, and that only says which pages belong to which book.

# Known, reasoned exceptions to --verify: (book, problem, check, words, reason). `check` is "a" (both
# scans have the words, ours lacks or changes them), "b" (ours has words neither scan has), "c" (a mark
# that stayed in the prose), "d" (a word of the scan that ours splits, shown `scan -> ours`) or "e" (a
# quotation mark a scan has and ours lacks). `words` is the finding as the check prints it (lower case),
# or a tuple of such; `problem` None means any Part of the book. Each was settled from the page image
# (leaf = the archive.org image n<leaf>.jpg of the first scan, worksofaristotle07arisuoft).
_TERMS = ("nete", "mese", "hypate", "paranete", "lichanos")
_GARBLED = ("vzze", "zese", "ese", "zefe", "hyfate", "hyfaze", "ze¢e", "zeze")
VERIFY_ALLOW: list[tuple[int, int | None, str, str | tuple, str]] = [
    (1, 17, "e", "‘where",
     "no quote mark before `where` in the print (leaf 22); a scan pairs a speck there with the closing mark of "
     "the real quotation ‘fire added to fire’ that follows"),
    (5, 38, "b", ("at", "other"),
     "print reads `at other seasons` (leaf 96); both scans read a speck between the words (`at’other`, `at”other`)"),
    (9, 6, "b", "and",
     "print reads `and other things` at the head of the line, with the margin number 30 beside it (leaf 115); "
     "the scans read the two together as `scand` and `3oand`"),
    (13, 5, "d", "fora -> for a", "print reads `for a movement takes place` (leaf 173)"),
    (15, 1, "d", "fora -> for a", "print reads `for a rectilinear figure` (leaf 182)"),
    (16, 1, "d", "apiece -> a piece", "print reads `even if a piece of wood` (leaf 192)"),
    (20, 10, "d", "itas -> it as", "print reads `in it, as some contend` (leaf 233)"),
    (29, 14, "d", "itas -> it as", "print reads `regarding it as useless` (leaf 324)"),
    (24, 19, "a", "or perhaps vitriol",
     "footnote 1 (`Or, perhaps, ‘vitriol’.`) at the foot of leaf 273; both scans' body lines include it, ours leaves it out"),
    (26, 30, "a", "mornsing",
     "print reads `morn-` / `ing`, with the margin line number 5 before `ing` (leaf 293); both scans read the 5 as S"),
    (26, 30, "b", "morning", "the same place: ours reads `morning`, as the print does (leaf 293)"),
    (19, 1, "b", "are", "print reads `those who are` with the margin number 1 after it (leaf 209); the scans read `areI`, `arel`"),
    (19, 44, "b", "that", "print reads `starting-point—that will be` with `that` in italic (leaf 227); the scans read `/hat`"),
    (19, 41, "d", "area -> are a", "print reads `Why are a double fifth` (leaf 224)"),
    (19, 46, "d", "thana -> than a", "print reads `to sing a high note than a low note` (leaf 227)"),
    (19, 35, "b", "3/2",
     "print sets a stacked fraction ³⁄₂ twice, `ratio of ³⁄₂ to 1` (second scan, image n218); the scans read "
     "`3 to 1`, `3 to x`, `8 to 1°`, `3 to 1°`; PRINT_READS puts it back"),
    (19, 35, "a", "3", "the same place: the numerator the first scan read as a whole number"),
    (19, None, "b", _TERMS + ("hypatereed", "netereed"),
     "the notes of the scale are set in italic transliteration (hypate, nete, mese, paranete, lichanos; the reeds "
     "`hypate-reed`, `nete-reed`, leaves 211, 212, 216, 217, 223, 225, 227, 228); both scans garble them "
     "(`Aypaze`, `zefe`, `szese`) and `repair_terms` puts them back"),
    (19, None, "a", _GARBLED,
     "the scans' garbled readings of the same italic notes (leaves 211, 212, 216, 223, 225, 227); the page reads "
     "nete, mese or hypate there"),
]

_SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹"
_HYPHENS = "-‐‑¬"


def _tok(piece: str) -> str | None:
    """One word for comparison: lower case, edge punctuation off, internal hyphens off. A closing
    apostrophe straight after an `s` stays (`animals’`, a plural possessive); any other trailing
    mark goes (a quote closer or a footnote call-out the scan read as one)."""
    s = piece.lower().replace("'", "’")
    s = re.sub(r"^[\W_]+", "", s)
    e = max((i for i, c in enumerate(s) if c.isalnum()), default=-1)
    if e < 0:
        return None
    tail = s[e + 1:]
    s = s[:e + 1] + ("’" if tail.startswith("’") and s[e] == "s" else "")
    s = "".join(c for c in s if c not in _HYPHENS)
    s = re.sub(r"(?<=[a-z0-9])[,;:?](?=[a-z])", "", s)      # a stop with no space after it (`itself,as`)
    return s or None


def _toks(text: str) -> list[str]:
    """Comparison words of our text. A trailing `’` after an `s` is a quote closer, and goes, when a
    `‘` is open in the Part; otherwise it is a plural possessive and stays."""
    out = []
    depth = 0
    for piece in re.split(r"[\s—–]+", text):
        t = _tok(piece)
        if not t:
            continue
        depth += piece.count("‘")
        if re.search(r"[A-Za-z.,;:?!)]’[.,;:?!)”]*$", piece):
            if t.endswith("’") and depth > 0:
                t = t[:-1]
            depth = max(0, depth - 1)
        out.append(t)
    return out


def _vol_threshold(pages: list[dict]) -> float:
    """The type size (hOCR x_size) that divides body from footnotes in one scan: halfway between the
    commonest size of long lines at 64 or more and the commonest below that (down to 48)."""
    import collections
    h: collections.Counter = collections.Counter()
    for pg in pages:
        s = pg["W"] / 2418     # the scans differ in size; sizes are read at the first scan's scale
        lines: dict[int, list] = {}
        for w in pg["words"]:
            lines.setdefault(w["li"], []).append(w)
        for ws in lines.values():
            if len(ws) >= 5:
                h[round(ws[0]["xs"] / s / 2) * 2] += len(ws)
    body = max((k for k in h if k >= 64), key=lambda k: h[k])
    note = max((k for k in h if 48 <= k < 64), key=lambda k: h[k])
    return (body + note) / 2


def _edge_fit(pts: list[tuple[float, float]], start: float, tol: float):
    """x at height y for a column edge: a line fitted to the points near `start`."""
    keep = [p for p in pts if abs(p[1] - start) < tol]
    a, b = start, 0.0
    for _ in range(3):
        if len(keep) < 4:
            break
        my = sum(p[0] for p in keep) / len(keep)
        mx = sum(p[1] for p in keep) / len(keep)
        vy = sum((p[0] - my) ** 2 for p in keep) or 1.0
        b = sum((p[0] - my) * (p[1] - mx) for p in keep) / vy
        a = mx - b * my
        nk = [p for p in pts if abs(p[1] - (a + b * p[0])) < tol / 2]
        if len(nk) < 4 or len(nk) == len(keep):
            break
        keep = nk
    return lambda y: a + b * y


def page_body_lines(pg: dict, thr: float, stats: dict) -> list[list[tuple[str, int]]]:
    """The body text of one page, line by line, as raw (word, confidence). Margin words, the running head,
    footnotes and raised small call-outs are left out by position and size alone."""
    s = pg["W"] / 2418
    # rows by height alone: the scan's own line grouping joins the last words of one line to the
    # first of the next (`owing ... heat.` and `Why`), so it is not used
    rows: list[list] = []
    for w in sorted(pg["words"], key=lambda w: (w["y0"] + w["y1"]) / 2):
        yc = (w["y0"] + w["y1"]) / 2
        if rows and abs(sum((x["y0"] + x["y1"]) / 2 for x in rows[-1]) / len(rows[-1]) - yc) < 38 * s:
            rows[-1].append(w)
        else:
            rows.append([w])
    lines = []
    for ws in rows:
        ws.sort(key=lambda w: w["x0"])
        xsl = sorted(w["xs"] for w in ws)
        lines.append(dict(ws=ws, xs=xsl[len(xsl) // 2] / s, y=sum((w["y0"] + w["y1"]) / 2 for w in ws) / len(ws)))
    lines.sort(key=lambda l: l["y"])
    full = [l for l in lines if len(l["ws"]) >= 7 and l["xs"] >= thr]
    if len(full) < 4:
        stats["blank_pages"] = stats.get("blank_pages", 0) + 1
        return []
    xl = sorted(l["ws"][0]["x0"] for l in full)[len(full) // 4]
    xr = sorted(l["ws"][-1]["x1"] for l in full)[len(full) // 2]
    fl = _edge_fit([(l["y"], l["ws"][0]["x0"]) for l in full], xl, 35 * s)
    fr = _edge_fit([(l["y"], l["ws"][-1]["x1"]) for l in full], xr, 35 * s)
    kept = []
    for l in lines:
        ws = []
        for w in l["ws"]:
            yc = (w["y0"] + w["y1"]) / 2
            # a margin number's centre lies left of the column's edge (its box may run a little into it),
            # or it starts beyond the right edge; a word the scan glued to a margin number starts inside
            xc = (w["x0"] + w["x1"]) / 2
            glued = re.match(r"\d{1,3}\W?[A-Za-z]{2,}", w["t"])    # a margin mark the scan joined to the word beside it
            if (xc < fl(yc) + 4 * s and not glued) or w["x0"] > fr(yc) + 4 * s:
                stats["margin"] = stats.get("margin", 0) + 1
                continue
            ws.append(w)
        if not ws:
            continue
        hs = sorted(w["y1"] - w["y0"] for w in ws)
        mh = hs[len(hs) // 2]
        out = []
        for k, w in enumerate(ws):
            # the baseline near this word: the lowest bottom among full-height neighbours that sit
            # on it (a descender hangs below it; a raised mark does not reach full height)
            nb = [x["y1"] for x in ws[max(0, k - 3):k + 4] if x is not w and x["y1"] - x["y0"] >= 0.9 * mh] or [w["y1"]]
            raised = w["y1"] < min(nb) - 0.35 * mh and (w["y1"] - w["y0"]) < 0.62 * mh
            if raised and len(ws) >= 3:
                stats["callout"] = stats.get("callout", 0) + 1
                continue
            out.append(w)
        if out:
            kept.append(dict(l, ws=out))
    if not kept:
        return []
    # footnote zone: runs to the foot of the page. It opens at the first line of small type after which
    # (nearly) every long line is small too; a body line the scan sized small does not open it
    zone = len(kept)
    for i, l in enumerate(kept):
        if l["xs"] < thr and len(l["ws"]) >= 4:
            rest = [m for m in kept[i + 1:] if len(m["ws"]) >= 4]
            if not rest or sum(1 for m in rest if m["xs"] < thr) >= 0.8 * len(rest):
                zone = i
                break
    # a one- or two-word note line can sit just above the zone; the notes start after the wider gap that
    # a text line does not have above it (the text is set at one pitch, so a line a pitch and a quarter
    # below the one before it opens the notes)
    if len(kept) > 4:
        pitch = sorted(b["y"] - a["y"] for a, b in zip(kept, kept[1:]) if len(a["ws"]) >= 4)
        pitch = pitch[len(pitch) // 2] if pitch else 0
        while zone > 1 and pitch and len(kept[zone - 1]["ws"]) < 4 and \
                kept[zone - 1]["y"] - kept[zone - 2]["y"] > 1.25 * pitch:
            zone -= 1
    body = kept[:zone]
    stats["note_lines"] = stats.get("note_lines", 0) + len(kept) - zone
    # running head: the top line, if a gap well above the usual line pitch sets it apart
    if len(body) >= 3:
        pitch = sorted(b["y"] - a["y"] for a, b in zip(body, body[1:]))[(len(body) - 1) // 2]
        if body[1]["y"] - body[0]["y"] > 1.4 * pitch:
            stats["heads"] = stats.get("heads", 0) + 1
            stats.setdefault("head_text", []).append(" ".join(w["t"] for w in body[0]["ws"]))
            body = body[1:]
    return [[(w["t"], w["c"]) for w in l["ws"]] for l in body]


def witness_book(pages, thr, a: int, b: int, stats: dict) -> list[dict]:
    """The tokens of a scan's pages a..b-1: {n: token, page}. Line-end hyphens are joined."""
    raw: list[tuple[str, int, int]] = []
    for i in range(a, b):
        for line in page_body_lines(pages[i], thr, stats):
            raw += [(t, i, c) for t, c in line] + [("\n", i, 100)]
    out: list[dict] = []
    carry, carry_c = "", 100
    prev_raw = ""
    depth = since_open = 0
    pend_open = False
    for k, (t, i, conf) in enumerate(raw):
        if t == "\n":
            continue
        last = k + 1 < len(raw) and raw[k + 1][0] == "\n"
        if carry:
            t, carry, conf = carry + t, "", min(conf, carry_c)
        if last and t and t[-1] in _HYPHENS and len(t) > 1:
            carry, carry_c = t[:-1], conf
            continue
        # a digit run set against a word's letters (`direction.2,`, `2—which`) is a footnote call-out
        # the scan did not set apart; a number between spaces or inside a list (`3,4,`) is not
        g = re.sub(r"(?<=[A-Za-z])\d{1,2}(?!\d)|(?<=[A-Za-z][.,;:?!’'\)])\d{1,2}(?!\d)|^\d{1,2}(?=[A-Za-z—–])", "", t)
        g = re.sub(r"^\d{1,3}[°%”’'\"]?(?=[A-Za-z]{2,})", "", g)
        g = re.sub(r"^([.,;:?!’'\)]+)\d{1,2}$", r"\1", g)
        if g != t and g:
            stats["glued"] = stats.get("glued", 0) + 1
            t = g
        for piece in re.split(r"[—–]+", t):
            n = _tok(piece)
            # a lone opening mark stands for the word after it
            if re.fullmatch(r"[‘'`]+", piece):
                if conf >= 60:
                    depth += 1
                    since_open = 0
                    pend_open = True
                continue
            was_open = pend_open or bool(re.match(r"[‘']", piece))
            if conf >= 85 or re.match(r"‘.*[A-Za-z]’", piece):
                depth += piece.count("‘")
            if depth:
                since_open += 1
                if since_open > 40:
                    depth = 0
            if n:
                closer = bool(re.search(r"[A-Za-z.,;:?!)]’[.,;:?!)”]*$", piece))
                if n.endswith("’") and (conf < 85 or depth > 0):    # a call-out read as a mark, or a closing quote
                    n = n[:-1]
                mid = bool(out) and not re.search(r"[.?!:;]['’”\")]*$", prev_raw)
                paired = closer and depth > 0 and conf >= 85
                if closer:
                    depth = max(0, depth - 1)
                out.append(dict(n=n, page=i, name=piece[:1].isupper() and mid, conf=conf, cr=closer,
                                op=was_open and (conf >= 85 or bool(re.match(r"‘.*[A-Za-z]’", piece))), cl=paired))
                pend_open = False
        prev_raw = t
    # an opening mark the scan is sure of (85 or more) stays with a closing mark within 120 words and no other
    # opening one between; the rest are specks, as in ours
    for i, w in enumerate(out):
        if w["op"]:
            win = out[i:i + 120]
            j = next((k for k, x in enumerate(win) if x["cr"]), None)
            if j is None or any(x["op"] for x in win[1:j + 1]):
                w["op"] = False
    return out


def ours_parts(book: int, books: Path | None = None) -> list[str]:
    s = ((books or OUT) / f"book-{book:02d}.html").read_text(encoding="utf-8")
    return [html.unescape(m.group(2)) for m in re.finditer(r"Part (\d+)\s*\n\s*<p>(.*?)</p>", s, re.S)]


def _matched(a: list[str], b: list[str]):
    """SequenceMatcher on a (a scan) and b (ours). Returns the a and b indices in equal blocks, ours
    index -> scan index, the re-spacings (same letters, different spaces: `ina` / `in a`; they count
    as matched, the caller judges them) and the differences (i1, i2, j1, j2) that are left."""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ma, mb, o2a, resp, diffs = set(), set(), {}, [], []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            ma.update(range(i1, i2))
            mb.update(range(j1, j2))
            for d in range(i2 - i1):
                o2a[j1 + d] = i1 + d
        elif i2 > i1 and j2 > j1 and "".join(a[i1:i2]) == "".join(b[j1:j2]):
            ma.update(range(i1, i2))
            mb.update(range(j1, j2))
            resp.append((i1, i2, j1, j2))
        else:
            diffs.append((i1, i2, j1, j2))
    return ma, mb, o2a, resp, diffs


def _agreed(a: list[str], da: list[tuple], b: list[str], db: list[tuple]):
    """Gaps where both scans read the same letters and ours reads others. The differences of the two
    scans are grouped where their stretches of ours overlap; a group is agreed when the scans' words
    over it have the same letters. Yields (A words, B words, ours j1, ours j2, A index)."""
    ev = sorted([(d[2], d[3], "A", d) for d in da] + [(d[2], d[3], "B", d) for d in db])
    groups, cur = [], None
    for j1, j2, w, d in ev:
        if cur is not None and (j1 < cur[1] or (j1 == cur[1] and (j1 == j2 or cur[0] == cur[1]))
                                or (j1 == cur[0] and j2 == cur[1])):
            cur[1] = max(cur[1], j2)
            cur[2].append((w, d))
        else:
            cur = [j1, j2, [(w, d)]]
            groups.append(cur)
    for j1, j2, members in groups:
        ma_ = [d for w, d in members if w == "A"]
        mb_ = [d for w, d in members if w == "B"]
        if not ma_ or not mb_:
            continue
        xa = a[min(d[0] for d in ma_):max(d[1] for d in ma_)]
        xb = b[min(d[0] for d in mb_):max(d[1] for d in mb_)]
        if "".join(xa) == "".join(xb) and xa:
            yield xa, xb, j1, j2, min(d[0] for d in ma_)


_DICT: set[str] | None = None


def _real(w: str) -> bool:
    """A real English word by the system dictionary, with the plain endings the dictionary lacks."""
    global _DICT
    if _DICT is None:
        d = Path("/usr/share/dict/words")
        if not d.exists():
            raise SystemExit("--verify needs /usr/share/dict/words")
        _DICT = {x.strip().lower() for x in d.read_text(errors="ignore").split()}
    if len(w) < 4 or not w.isalpha():
        return False
    vocab()
    if len(w) >= 6 and _UNI.get(w, 0) >= 1:     # the repo's other English texts use it
        return True
    stems = [w]
    for suf, rep in (("s", ""), ("es", ""), ("ed", ""), ("d", ""), ("ing", ""), ("ing", "e"), ("ies", "y"), ("ly", ""),
                     ("ed", "e"), ("er", ""), ("ers", ""), ("ness", "")):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            stems.append(w[:len(w) - len(suf)] + rep)
    return any(x in _DICT for x in stems)


def verify(ocr_dir: Path, books: Path | None = None) -> int:
    PA = parse_hocr(ocr_dir / f"{IDS['A']}_hocr.html")
    PB = parse_hocr(ocr_dir / f"{IDS['B']}_hocr.html")
    thrA, thrB = _vol_threshold(PA), _vol_threshold(PB)
    bA = book_ranges([layout(p) for p in PA])      # page ranges only
    bB = book_ranges([layout(p) for p in PB])
    stA: dict = {}
    stB: dict = {}
    n_parts = n_words = n_wa = n_wb = n_runs = n_title = n_resp = 0
    fa: list[tuple] = []   # (book, problem, kind, words, context)
    for book in range(1, 39):
        parts = ours_parts(book, books)
        ours, where, raw_ctx = [], [], []
        for pi, txt in enumerate(parts, 1):
            tk = _toks(txt)
            ours += tk
            where += [pi] * len(tk)
            raw_ctx += [t for t in re.split(r"[\s—–]+", txt) if _tok(t)]
        n_parts += len(parts)
        n_words += len(ours)
        for pi, txt in enumerate(parts, 1):
            if txt.count("”") > txt.count("“"):
                m = re.search("”", txt)
                fa.append((book, pi, "c", "”", txt[max(0, m.start() - 40):m.end() + 25]))
            for m in re.finditer(r"[*†]|[%s]|[A-Za-z]\d|\d[A-Za-z]|(?<=[a-z])[A-Z]" % _SUPER, txt):
                fa.append((book, pi, "c", m.group(0), txt[max(0, m.start() - 40):m.end() + 25]))
        wa = witness_book(PA, thrA, *bA[book - 1], stA)
        wb = witness_book(PB, thrB, *bB[book - 1], stB)
        n_wa += len(wa)
        n_wb += len(wb)
        ta, tb = [w["n"] for w in wa], [w["n"] for w in wb]
        ma_a, ma_o, o2a_a, resp_a, diff_a = _matched(ta, ours)
        mb_b, mb_o, o2a_b, resp_b, diff_b = _matched(tb, ours)

        def leaf(j: int) -> str:
            """The leaf of scan A (its image n<leaf>.jpg) nearest to ours word j."""
            for d in range(0, 40):
                for k in (j - d, j + d):
                    if k in o2a_a:
                        return f"A{wa[o2a_a[k]]['page']}"
            return "A?"
        # re-spacings: a word of the scan that ours splits (or two that ours joins) is a fault when the
        # whole word is English (by the system dictionary) or a name in mid-sentence
        for wit, resp in ((wa, resp_a), (wb, resp_b)):
            for i1, i2, j1, j2 in resp:
                n_resp += 1
                ctx = (" ".join(raw_ctx[max(0, j1 - 5):j1]) + " [" + " ".join(raw_ctx[j1:j2]) + "] " +
                       " ".join(raw_ctx[j2:j2 + 5]) + " @" + leaf(j1))
                if i2 - i1 == 1 and j2 - j1 > 1:       # ours splits one word of the scan
                    w = wit[i1]
                    if _real(w["n"]) or (w["name"] and len(w["n"]) >= 5 and len(ours[j2 - 1]) == 1):
                        fa.append((book, where[j1], "d", w["n"] + " -> " + " ".join(ours[j1:j2]), ctx))
                elif j2 - j1 == 1 and i2 - i1 > 1 and all(_real(wit[x]["n"]) or wit[x]["n"] in ("a", "i") for x in range(i1, i2)):
                    # ours joins words the scan has apart, and each is English
                    fa.append((book, where[j1], "d", " ".join(wit[x]["n"] for x in range(i1, i2)) + " -> " + ours[j1], ctx))
        # (a) letters both scans read alike where ours reads others: gaps of any length
        for xa, xb, j1, j2, ia in _agreed(ta, diff_a, tb, diff_b):
            if j2 == 0 and len(xa) <= 40 and wa[ia]["page"] == bA[book - 1][0]:
                n_title += len(xa)    # the book's title lines, above its first problem
                continue
            n_runs += 1
            at = min(j1, len(where) - 1)
            ctx = " ".join(raw_ctx[max(0, j1 - 6):j1]) + " [ours: " + " ".join(raw_ctx[j1:j2]) + "] " + \
                " ".join(raw_ctx[j2:j2 + 6]) + f" @A{wa[ia]['page']}"
            fa.append((book, where[at], "a", " ".join(xa), ctx))
        # (e) quotation marks a scan carries (an opening mark; a closing one that closes an opening
        # one) on a word that ours bears bare
        for j in sorted(set(o2a_a) | set(o2a_b)):
            xs = [w[o2a[j]] for w, o2a in ((wa, o2a_a), (wb, o2a_b)) if j in o2a]
            rw = raw_ctx[j]
            pg = xs[0]["page"]
            if any(x["op"] for x in xs) and not re.match(r"[‘'“\"]", rw):
                fa.append((book, where[j], "e", "‘" + ours[j], " ".join(raw_ctx[max(0, j - 5):j]) + " [" + rw + "] " +
                           " ".join(raw_ctx[j + 1:j + 6]) + f" @A{pg}"))
            elif any(x["cl"] for x in xs) and not re.search(r"[’'”\"]", rw) and not ours[j].endswith("’"):
                fa.append((book, where[j], "e", ours[j] + "’", " ".join(raw_ctx[max(0, j - 5):j]) + " [" + rw + "] " +
                           " ".join(raw_ctx[j + 1:j + 6]) + f" @A{pg}"))
        # (b) words of ours that neither scan has
        for j in range(len(ours)):
            if j not in ma_o and j not in mb_o:
                fa.append((book, where[j], "b", ours[j],
                           " ".join(raw_ctx[max(0, j - 5):j]) + " [" + raw_ctx[j] + "] " + " ".join(raw_ctx[j + 1:j + 6]) + " @" + leaf(j)))
    seen, final, allowed = set(), [], 0

    def listed(e: tuple) -> bool:
        return any(e[0] == b and p in (None, e[1]) and e[2] == c and e[3] in (w if isinstance(w, tuple) else (w,))
                   for b, p, c, w, _r in VERIFY_ALLOW)
    for e in fa:
        if listed(e):
            allowed += 1
        elif e not in seen:
            seen.add(e)
            final.append(e)
    print(f"verify: examined {n_parts} Parts, {n_words} words of ours; scans A {n_wa} words, B {n_wb} words "
          f"(left out by position: A {stA.get('margin', 0)} margin words, {stA.get('heads', 0)} running heads, "
          f"{stA.get('note_lines', 0)} note lines, {stA.get('callout', 0)} raised call-outs, {stA.get('glued', 0)} glued digits; "
          f"B {stB.get('margin', 0)}, {stB.get('heads', 0)}, {stB.get('note_lines', 0)}, {stB.get('callout', 0)}, "
          f"{stB.get('glued', 0)}); type-size cut A {thrA:.1f}, B {thrB:.1f}; {n_title} title words skipped; "
          f"{n_runs} agreed gaps; {n_resp} re-spacings judged; {allowed} allowed by VERIFY_ALLOW")
    names = {"a": "(a) in both scans, missing from ours", "b": "(b) in ours, in neither scan",
             "c": "(c) mark left in the prose", "d": "(d) a word re-spaced that is English whole",
             "e": "(e) quote mark in a scan, not in ours"}
    for k in "abcde":
        sel = [e for e in final if e[2] == k]
        print(f"{names[k]}: {len(sel)}")
        for book, p, _k, w, ctx in sel:
            print(f"  {book}.{p}  [{w}]  ...{ctx}...")
    if n_parts == 0 or n_words == 0 or n_wa == 0 or n_wb == 0:
        print("verify: examined nothing")
        return 2
    return 1 if final else 0


# --------------------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ocr-dir", required=True, type=Path)
    ap.add_argument("--chapters", type=Path, default=ROOT / "build" / "dist" / "Prob" / "chapters.json",
                    help="the pipeline's chapters.json for Prob (needed for the Bekker ticks)")
    ap.add_argument("--pass1", action="store_true",
                    help="write the Parts and an empty anchors.yaml only (run the pipeline, then run again)")
    ap.add_argument("--books", type=Path, default=None,
                    help="with --verify: the folder of book-NN.html to check (default sources/prob-forster)")
    ap.add_argument("--verify", action="store_true",
                    help="compare sources/prob-forster/ with the raw hOCR of both scans; exit 1 on any finding")
    args = ap.parse_args()
    if args.verify:
        sys.exit(verify(args.ocr_dir, args.books))
    LA = [layout(p) for p in parse_hocr(args.ocr_dir / f"{IDS['A']}_hocr.html")]
    LB = [layout(p) for p in parse_hocr(args.ocr_dir / f"{IDS['B']}_hocr.html")]
    bA, bB = book_ranges(LA), book_ranges(LB)
    notes: list[str] = []
    Ms, starts_all, done_all = [], [], []
    for book in range(1, 39):
        M, starts, done = build_book(book, LA, LB, bA, bB, notes)
        Ms.append(M)
        starts_all.append(starts)
        done_all.append(done)
    write_books({b + 1: d for b, d in enumerate(done_all)})
    if args.pass1 or not args.chapters.exists():
        write_anchors([], dict(skipped=0, unreadable=0))
        print("pass 1: Parts written, anchors.yaml left empty; run the pipeline, then run this again")
        return
    chapters = load_chapters(args.chapters)
    ticks, colstarts, stats = read_ticks(LA, LB, Ms, starts_all, chapters)
    ents = anchor_entries(ticks, colstarts, starts_all, done_all, chapters, stats)
    placed = write_anchors(ents, stats)
    print("book  F1K  Forster")
    for book in range(1, 39):
        n = len(done_all[book - 1])
        print(f"{book:>4} {F1K[book - 1]:>4} {n:>7}{'' if n == F1K[book - 1] else '   differs'}")
    print(f"anchors: {placed} entries ({len(colstarts)} column marks, {len(ticks)} line numbers), "
          f"skipped {stats['skipped']}, unreadable margin tokens {stats['unreadable']}, resyncs {stats['resync']}, "
          f"short phrases dropped {stats.get('short', 0)}")
    for n in notes:
        print("note:", n)
    for book in range(1, 39):
        for k, a, b, t in Ms[book - 1].unsettled:
            st = starts_all[book - 1]
            part = sum(1 for s in st if s <= k)
            print(f"unsettled {book}.{part}: A={a!r} B={b!r} -> {t!r}")


if __name__ == "__main__":
    main()
