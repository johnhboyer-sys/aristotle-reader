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

Gate: `python3 pipeline/tools/build_prob_forster.py --verify --ocr-dir DIR` word-aligns the Parts
against the body text of both scans and exits 1 if (a) both scans have 1-4 words ours lacks,
(b) ours has words neither scan has, or (c) a `”`, `*`, `†`, superscript digit or a digit glued
to a word stayed in the prose. It prints how many Parts and words it examined and exits 2 if that
is none. Reasoned exceptions go in VERIFY_ALLOW.

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
        if rows and abs(rows[-1]["y"] - yc) < 38 * s:
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
    hdr = [r for r in rows if r["y"] < 340 * s and len(r["w"]) < 7]
    rest = [r for r in rows if r["y"] >= 340 * s or len(r["w"]) >= 7]
    full = [r for r in rest if len(r["w"]) >= 7 and _med([w["xs"] for w in r["w"]]) >= 62 * s]
    if not full:
        return dict(hdr=hdr, lines=[], side=None, bx0=None, bx1=None, k=0, s=s)
    lefts = sorted(r["w"][0]["x0"] for r in full)
    rights = sorted(max(w["x1"] for w in r["w"]) for r in full)
    bx0, bx1 = lefts[len(lefts) // 4], rights[len(rights) // 2]
    side = "R" if bx0 > 300 * s else "V"
    g = 10 * s
    fitL = _fit([(r["y"], r["w"][0]["x0"]) for r in full if abs(r["w"][0]["x0"] - bx0) < 120 * s], s)
    fitR = _fit([(r["y"], max(w["x1"] for w in r["w"])) for r in full
                 if abs(max(w["x1"] for w in r["w"]) - bx1) < 120 * s], s)
    out = []
    for r in rest:
        ex0, ex1 = fitL(r["y"]), fitR(r["y"])
        left = [w for w in r["w"] if w["x1"] < ex0 - g]
        right = [w for w in r["w"] if w["x0"] > ex1 + g and (w["x0"] - ex1 > 12 * s or w["x1"] - ex1 > 45 * s)]
        text = [w for w in r["w"] if w not in left and w not in right]
        inner, outer = (left, right) if side == "R" else (right, left)
        nt = len(text)
        xsm = _med([w["xs"] for w in text]) if text else 70 * s
        out.append(dict(y=r["y"], text=text, inner=inner, outer=outer, n=nt, xs=xsm,
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


def clean_word(t: str) -> str:
    """One OCR token -> its text without footnote marks; '' if the token is only furniture."""
    t = t.strip()
    if not t:
        return ""
    # a Bekker column mark printed inside the text line ("932° so"); never part of the prose
    t = re.sub(r"^(?:8[5-9]\d|9[0-6]\d)[°”\"’'%2-7]?(?=[A-Za-z]|$)", "", t)
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
    if not t or re.fullmatch(r"[;:?.,]+", t):
        return t
    if re.fullmatch(r"[*©+|!'`^~=<>{}\\/#@&%$\"“”‘’.,:;?\[\]()\-—–·]*", t):
        return ""
    # "is" read as 15 or 51
    if t in ("15", "51", "1s"):
        return "is"
    # a number alone, or stuck to the word beside it, is a footnote mark
    if re.fullmatch(r"\d{1,2}[.,;:]?", t):
        return ""
    if re.fullmatch(r"\d{3,}[%°”,.;:]*|\d+\.\d+|[-—]{2,}\d*", t):
        return ""
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
            toks = [dict(t=w["t"], c=w["c"]) for w in l["text"]]
            # standalone punctuation joins the word before it
            for tk in toks:
                ct = clean_word(tk["t"])
                if not ct:
                    continue
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
                    if (core_h + core_t) in v or _UNI.get(core_h, 0) < 3 or _UNI.get(core_t, 0) < 3:
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
    keep the longer ending; otherwise the more confident reading."""
    ta, tb = wa["t"], wb["t"]
    if ta == tb:
        return ta
    ea = len(ta) - len(ta.rstrip(".,;:?)’”\"'—"))
    eb = len(tb) - len(tb.rstrip(".,;:?)’”\"'—"))
    if ta.rstrip(".,;:?)’”\"'—") == tb.rstrip(".,;:?)’”\"'—") and ea != eb:
        return ta if ea > eb else tb
    return ta if wb["c"] <= wa["c"] + 15 else tb


def _lost_line(run: int, w: dict) -> bool:
    """Keep a word that only one scan has? A long stretch is lines the other scan lost, and its
    words stay; so does a stretch of a line's length (6 or more) in plain letters, which keeps
    `mese` and `weese`, words the vocabulary lacks. A single plain lower-case word the scan is
    sure of (`slope`, `jury`) stays too: the vocabulary is only the repo's other texts. Other
    short stretches go by `wscore`."""
    plain = re.fullmatch(r"[A-Za-z’'‘]+[.,;:?)’']*", w["t"]) is not None
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


FUNC = {"a", "an", "the", "to", "of", "in", "on", "at", "is", "it", "and", "for", "as", "or", "be", "by", "if",
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


def split_run_together(t: str) -> str:
    """`Whyisit` -> `Why is it`: a word that is not English but is made of English words,
    one of them a small function word. Case and surrounding punctuation are kept."""
    m = re.fullmatch(r"([^A-Za-z]*)([A-Za-z]{3,16})([^A-Za-z]*)", t)
    if not m:
        return t
    lead, core, trail = m.groups()
    low = core.lower()
    if low in vocab() or low in ("mese", "nete", "hypate", "paranete", "parhypate", "lichanos", "trite"):
        return t
    parts = _segment(low, 3)
    if not parts or len(parts) < 2 or not any(p in FUNC for p in parts):
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
    of exactly these words (checked against the printed pages)."""
    v = vocab()
    out = []
    for t in tokens:
        # italic `that` after a dash (`starting-point—that will be`): both scans misread it
        t = re.sub(r"—(?:/hat|zhat?)(?![A-Za-z])", "—that", t)
        m = re.fullmatch(r"([^A-Za-z/]*)([A-Za-z/]{2,10})([^A-Za-z/]*)", t)
        if m:
            lead, core, trail = m.groups()
            low = re.sub("/", "", core.lower())
            if low not in v and low not in ("nete", "mese", "hypate", "paranete"):
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
    tokens = [split_run_together(t) if t else t for t in tokens]
    first = next((i for i, t in enumerate(tokens) if t), None)
    if first is not None and re.fullmatch(r"[A-Z]{2,}[^A-Za-z]*", tokens[first]):
        tokens[first] = tokens[first][0] + tokens[first][1:].lower()
    out: list[str] = []
    first_idx: list[int] = []   # for each input token, the index of its first output word
    open_s = 0
    for t in tokens:
        first_idx.append(len(out))
        if not t:
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
    return M, starts, done


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
                        ev.append((lo, 0 if which == "A" else 1, "tick", v))
                    elif _is_mark(tok):
                        ev.append((lo, 0 if which == "A" else 1, "mark", 0))
                    elif which == "A" and (re.search(r"\d", tok) or numlike(tok)):
                        unreadable += 1
        ev.sort()
        # cross-scan duplicates: the same number within 40 words is one number
        ev2, seen_tick, seen_mark = [], {}, -999
        for pos, w, kind, v in ev:
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

# Known, reasoned exceptions to --verify: (book, problem, check, words, reason). `check` is "a"
# (both scans have the words, ours lacks them), "b" (ours has words neither scan has) or "c" (a
# mark that stayed in the prose). `words` is the gap as the check prints it (lower case, spaces).
VERIFY_ALLOW: list[tuple[int, int, str, str, str]] = []

_SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹"
# a printed margin number (5, 10 ... 40) as the scans misread it: every letter is one of the
# shapes an OCR gives a digit, and the token has at most three letters
_MARGIN_SHAPE = re.compile(r"^[tilrjIL1|!oOgGqQ0zZ2aAeEsSbBhH3-9fF][tilrjIL1|!oOgGqQ0zZ2aAeEsSbBhH3-9fFnN]{0,2}$")


def _letters(t: str) -> str:
    return re.sub(r"[^a-z]", "", t.lower())


def _tokens(text: str) -> list[str]:
    """Words for comparison: split at spaces and dashes (not hyphens), letters only, lower case."""
    out = []
    for piece in re.split(r"[\s—–]+", text):
        n = _letters(piece)
        if n:
            out.append(n)
    return out


def witness_tokens(L, a: int, b: int, book: int) -> list[dict]:
    """Every text word of a witness's pages a..b-1 (body and footnotes; running heads and the
    margins are not in `lines`), cleaned as the build cleans, with its place on the line."""
    out: list[dict] = []
    carries: dict[bool, str | None] = {False: None, True: None}   # a hyphen runs on in its own stream
    for i in range(a, b):
        for l in L[i]["lines"]:
            carry = carries[l["fn"]]
            toks = []
            for w in l["text"]:
                ct = clean_word(w["t"])
                if ct and re.search(r"[A-Za-z]", ct):
                    toks.append(ct)
            if not toks:
                continue
            if carry is not None:
                toks[0] = carry + toks[0]
                carries[l["fn"]] = None
            if re.search(r"[A-Za-z]-$", toks[-1]):
                carries[l["fn"]] = toks.pop()[:-1]
                if not toks:
                    continue
            if book == 19:
                toks = repair_terms(toks)
            toks = [split_run_together(t) for t in toks]
            toks = [p for t in toks for p in t.split(" ")]
            n = len(toks)
            for k, t in enumerate(toks):
                for piece in re.split(r"[—–]+", t):
                    nm = _letters(piece)
                    if nm:
                        out.append(dict(n=nm, fn=l["fn"], edge=(k == 0 or k == n - 1), page=i))
    return out


def ours_parts(book: int) -> list[str]:
    s = (OUT / f"book-{book:02d}.html").read_text(encoding="utf-8")
    return [html.unescape(m.group(2)) for m in re.finditer(r"Part (\d+)\s*\n\s*<p>(.*?)</p>", s, re.S)]


def _diff_unmatched(a: list[str], b: list[str]):
    """Opcodes of a->b: gaps (b lacks words a has) and the b positions that match nothing in a."""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    gaps, loose = {}, set()
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("delete", "replace") and i2 > i1:
            gaps.setdefault(j1, []).append((i1, i2))
        if tag in ("insert", "replace"):
            loose.update(range(j1, j2))
    return gaps, loose


def verify(ocr_dir: Path) -> int:
    LA = [layout(p) for p in parse_hocr(ocr_dir / f"{IDS['A']}_hocr.html")]
    LB = [layout(p) for p in parse_hocr(ocr_dir / f"{IDS['B']}_hocr.html")]
    bA, bB = book_ranges(LA), book_ranges(LB)
    n_parts = n_words = n_wa = n_wb = n_gaps = 0
    fa: list[tuple] = []   # (book, problem, kind, words, context)
    for book in range(1, 39):
        parts = ours_parts(book)
        ours, where = [], []
        raw_ctx = []
        for pi, txt in enumerate(parts, 1):
            tk = _tokens(txt)
            ours += tk
            where += [pi] * len(tk)
            raw_ctx += [t for t in re.split(r"[\s—–]+", txt) if _letters(t)]
        n_parts += len(parts)
        n_words += len(ours)
        # (c) marks left in the prose
        for pi, txt in enumerate(parts, 1):
            if txt.count("”") > txt.count("“"):
                for m in re.finditer("”", txt):
                    fa.append((book, pi, "c", "”", txt[max(0, m.start() - 40):m.end() + 25]))
                    break
            for m in re.finditer(r"[*†]|[%s]|[A-Za-z]\d|\d[A-Za-z]" % _SUPER, txt):
                fa.append((book, pi, "c", m.group(0), txt[max(0, m.start() - 40):m.end() + 25]))
        wa = witness_tokens(LA, *bA[book - 1], book)
        wb = witness_tokens(LB, *bB[book - 1], book)
        n_wa += len(wa)
        n_wb += len(wb)
        ta, tb = [w["n"] for w in wa], [w["n"] for w in wb]
        # witness gaps are measured against ours: ours is the second sequence, so gaps are keyed by
        # the position in ours where the witness has words ours lacks
        ga, la = _diff_unmatched(ta, ours)
        gb, lb = _diff_unmatched(tb, ours)
        for pos, spans_a in ga.items():
            for (a1, a2) in spans_a:
                if not 1 <= a2 - a1 <= 4:
                    continue
                n_gaps += 1
                words = "".join(ta[a1:a2])
                for dj in (0, -1, 1):
                    for (b1, b2) in gb.get(pos + dj, []):
                        if "".join(tb[b1:b2]) == words and 1 <= b2 - b1 <= 4:
                            toks = ta[a1:a2]
                            if len(toks) == 1 and len(words) <= 3 and _MARGIN_SHAPE.match(words) \
                                    and (wa[a1]["edge"] or wb[b1]["edge"]):
                                continue   # a margin number misread as a word (point 3)
                            if all(wa[x]["fn"] for x in range(a1, a2)):
                                continue   # footnote text
                            p = where[min(pos, len(where) - 1)] if where else 0
                            ctx = " ".join(raw_ctx[max(0, pos - 6):pos]) + " [" + " ".join(toks) + "] " + \
                                " ".join(raw_ctx[pos:pos + 6])
                            fa.append((book, p, "a", " ".join(toks), ctx))
        for j in sorted(set(range(len(ours))) & la & lb):
            fa.append((book, where[j], "b", ours[j],
                       " ".join(raw_ctx[max(0, j - 5):j]) + " [" + raw_ctx[j] + "] " + " ".join(raw_ctx[j + 1:j + 6])))
    seen, final, allowed = set(), [], 0
    allow = {(b, p, c, w) for b, p, c, w, _r in VERIFY_ALLOW}
    for e in fa:
        if e[:4] in allow:
            allowed += 1
        elif (e[0], e[1], e[2], e[3], e[4]) not in seen:
            seen.add((e[0], e[1], e[2], e[3], e[4]))
            final.append(e)
    print(f"verify: examined {n_parts} Parts, {n_words} words of ours; witnesses A {n_wa} words, B {n_wb} words; "
          f"{n_gaps} witness gaps of 1-4 words checked; {allowed} allowed by VERIFY_ALLOW")
    names = {"a": "(a) in both scans, missing from ours", "b": "(b) in ours, in neither scan",
             "c": "(c) mark left in the prose"}
    for k in "abc":
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
    ap.add_argument("--verify", action="store_true",
                    help="compare sources/prob-forster/ with both scans; exit 1 if words are lost or marks remain")
    args = ap.parse_args()
    if args.verify:
        sys.exit(verify(args.ocr_dir))
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
