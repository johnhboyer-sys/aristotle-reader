"""Rhetorica ad Alexandrum: a Bekker-lined Greek spine from two sources.

The TLG files the work under Anaximenes (0547.001) in Fuhrmann's Teubner text
(1966), cited by chapter/section/line: it carries no Bekker numbers. Bekker's
own page (Aristotelis Opera vol. II, Berlin 1831, pp. 1420-1447) gives the
numbers. This tool keeps Fuhrmann's words and takes the line breaks from
Bekker's printed lines: each Bekker line begins at the Fuhrmann word that
answers to the first word Bekker printed on it. No number is interpolated: a
line is numbered by where it stands against the printed gutter numerals
(5, 10, 15 ...), which fix the row grid of every page.

Two steps, both run from pipeline/:

  extract  Read Bekker's printed lines from an archive.org hOCR (scan
           aristotelisopera02arisuoft, or a second scan as a cross-check)
           and write them, OCR as read, to a lines file.
             uv run python tools/build_rhetal_spine.py extract \\
               --hocr ../build/rhetal/b2uoft_hocr.html \\
               --pageindex ../build/rhetal/b2uoft_pageindex.json.gz \\
               --first-leaf 637 --out ../sources/rhetal-greek/bekker1831-lines.json

  build    Align those lines to Fuhrmann's words (a Diogenes export of TLG
           0547.001, kept out of the repo) and write the spine TEI the
           pipeline reads, the chapter starts for the manifest, and a report.
             uv run python tools/build_rhetal_spine.py build \\
               --tlg-xml ../build/rhetal/tlg0547001.xml

  compare  Compare the line breaks two extracts give (two scans of the same
           printed page), as an independent check of the extraction.

The OCR is poor (Bekker's ligatures: ȣ read as ε/ο/ς, στ read as ς), so the
alignment is fuzzy word matching; the report lists every line whose first word
did not match, for checking on the page image.
"""
from __future__ import annotations

import argparse
import difflib
import gzip
import html
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "sources" / "rhetal-greek"
LINES_FILE = OUT_DIR / "bekker1831-lines.json"
SPINE_FILE = OUT_DIR / "rhetal-bekker-grc.xml"
CHAPTERS_FILE = OUT_DIR / "chapters.yaml"
REPORT_FILE = ROOT / "build" / "rhetal" / "spine-report.json"

FIRST_PAGE, LAST_PAGE = 1420, 1447
ROW_H = 73.5          # Bekker's line pitch in the 400-ppi scan, in pixels
# Page 1420: the Rhetoric ends on rows 1-4 of both columns; the title follows
# and this work starts at row 5 of each column (Forster's margin: "1420a5").
# Page 1447: this work ends on rows 1-7 of both columns; the Poetics' title
# follows and the Poetics opens at 1447a8, so the gutter numerals on that page
# belong to the Poetics' grid and the first seven rows are read from the top.
FIRST_ROW = {1420: 5}
LAST_PAGE_ROWS = 7

# ---------------------------------------------------------------- extract

_WORD = re.compile(
    r"<span class=.ocrx_word. [^>]*title=.bbox (\d+) (\d+) (\d+) (\d+); x_wconf (\d+)[^>]*>(.*?)</span>",
    re.S)
_APP = re.compile(r"^\d{1,2}[.,:;]$")   # an apparatus line reference, "12."


def _page_words(hocr: bytes) -> list[dict]:
    s = hocr.decode("utf-8", "replace")
    out = []
    for m in _WORD.finditer(s):
        x0, y0, x1, y1, conf = map(int, m.groups()[:5])
        t = html.unescape(re.sub("<[^>]+>", "", m.group(6))).strip()
        if t:
            out.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "c": conf, "t": t,
                        "yc": (y0 + y1) / 2, "xc": (x0 + x1) / 2})
    return out


def _gutter(words: list[dict], width: int, need: int = 3,
            row_h: float = ROW_H) -> tuple[float, float, list[dict]]:
    """(row-grid offset, gutter x, gutter numeral words) for one page.

    The gutter numerals stand between the columns every fifth row. Each one
    that reads as a multiple of five gives the grid offset c in
    y = c + n * ROW_H; the median rejects misreadings ("45" for 15)."""
    mid = width / 2
    cand = [w for w in words if re.fullmatch(r"\d{1,2}", w["t"])
            and abs(w["xc"] - mid) < 0.12 * width]
    offs = sorted(w["yc"] - int(w["t"]) * row_h for w in cand
                  if int(w["t"]) % 5 == 0 and 5 <= int(w["t"]) <= 45)
    if not offs:
        raise ValueError("no gutter numerals")
    c = offs[len(offs) // 2]
    good = []
    for w in cand:
        nf = (w["yc"] - c) / row_h
        if abs(nf - round(nf)) < 0.3 and round(nf) % 5 == 0:
            good.append(w)
    if len(good) < need:
        raise ValueError(f"only {len(good)} gutter numerals on the grid")
    gx = sorted(w["xc"] for w in good)[len(good) // 2]
    return c, gx, good


def extract_page(hocr: bytes, page: int, row_h: float = ROW_H, foot: int = 0) -> dict:
    words = _page_words(hocr)
    m = re.search(rb"bbox 0 0 (\d+) (\d+)", hocr)
    width = int(m.group(1))
    c, gx, gutter = _gutter(words, width, 2 if page == LAST_PAGE else 3, row_h)
    if page == LAST_PAGE:
        # Rows above the Poetics' title: count down from the title. The
        # gutter grid is the Poetics' (its line 8 opens under the title), so
        # this work's row n stands at the Poetics' grid row n - 8.
        c -= 8 * row_h
    gids = {id(w) for w in gutter}
    rows: dict[int, list[dict]] = {}
    for w in words:
        if id(w) in gids:
            continue
        nf = (w["yc"] - c) / row_h
        rows.setdefault(round(nf), []).append(dict(w, res=nf - round(nf)))
    first = FIRST_ROW.get(page, 1)
    last = LAST_PAGE_ROWS if page == LAST_PAGE else 99
    lines: dict[str, list] = {"a": [], "b": []}
    started = False
    for n in sorted(rows):
        if n < first or n > last:
            continue
        ws = sorted(rows[n], key=lambda w: w["x0"])
        txt = " ".join(w["t"] for w in ws)
        app = sum(1 for w in ws if _APP.match(w["t"]))
        # The apparatus under the text: a row of line references ("12.", "15.")
        # or a lemma bracket; a near-empty row is the rule above it.
        brk = app >= 2 or (app >= 1 and "]" in txt) or (len(ws) <= 6 and n >= 25)
        brk = brk and n >= foot   # a scan that strews stray numerals: no apparatus above `foot`
        if brk and started:
            break
        if brk:
            continue
        started = True
        for col in ("a", "b"):
            side = [w for w in ws if (w["xc"] < gx) == (col == "a")]
            lines[col].append({"n": n, "words": [w["t"] for w in side],
                               "conf": [w["c"] for w in side]})
    return {"page": page, "grid": round(c, 1), "gutter_x": round(gx),
            "gutter": sorted(round((w["yc"] - c) / row_h) for w in gutter),
            "columns": lines}


def cmd_extract(args) -> None:
    index = json.load(gzip.open(args.pageindex))
    pages = []
    with open(args.hocr, "rb") as f:
        for page in range(FIRST_PAGE, LAST_PAGE + 1):
            leaf = args.first_leaf + page - FIRST_PAGE
            f.seek(index[leaf][2])
            hocr = f.read(index[leaf][3] - index[leaf][2])
            p = extract_page(hocr, page, args.row_h, args.foot)
            p["leaf"] = leaf
            pages.append(p)
            ns = [ln["n"] for ln in p["columns"]["a"]]
            print(f"{page}: rows {ns[0]}..{ns[-1]} ({len(ns)})")
    out = {"scan": args.scan, "note": "Bekker 1831 vol. II, pp. 1420-1447, as the scan's OCR read "
           "it; rows numbered from the printed gutter numerals.", "pages": pages}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"wrote {args.out}")


# ---------------------------------------------------------------- normalise

def norm(w: str) -> str:
    """Base letters only, with Bekker's ligatures collapsed the way the OCR
    reads them: στ (printed as one sort) -> σ, ου -> ο."""
    s = unicodedata.normalize("NFD", w)
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = s.replace("ς", "σ")
    s = re.sub(r"[^α-ω]", "", s)
    return s.replace("στ", "σ").replace("ου", "ο")


def loose(s: str) -> str:
    """A second, looser form for OCR vowel confusions (ω/ο, η/ε, ε for ȣ)."""
    return s.translate(str.maketrans("ωηυ", "οεο")).replace("ι", "")


def sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    r1 = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
    la, lb = loose(a), loose(b)
    r2 = difflib.SequenceMatcher(None, la, lb, autojunk=False).ratio() * 0.95 if la and lb else 0
    r = max(r1, r2)
    if min(len(a), len(b)) <= 2:     # short words: only near-exact counts
        return r if r >= 0.99 or (la == lb) else 0.0
    return r


MATCH = 0.6

# Line openings read from Bekker's page image (archive.org
# aristotelisopera02arisuoft) where the OCR led the alignment astray. A second
# scan of the same pages (b33521311_0002, `extract --row-h 65.7 --foot 35`)
# was built the same way and disagreed by two words or more on 78 lines; each
# was read on the image, and these are the ones the first scan's build got
# wrong. Each value is the Fuhrmann words that open the printed line; a word
# Bekker splits across the line end stays on the earlier line. Where the two
# texts word a passage differently, the line opens at the Fuhrmann word that
# answers to Bekker's first whole word.
PRINT_STARTS = {
    ("1421a", 28): "τὸ βιβλίον",          # [λήψε]ται τὸ βιβλίον
    ("1422a", 27): "κριτῶν ἢ",            # Bekker: ἐνδόξων ἢ | ὑπὸ κριτῶν
    ("1423a", 27): "οὖσαι,",              # [τυγ]χάνουσιν οὖσαι
    ("1424a", 21): "καθ' ἓν",             # [διοί]κησιν καθ' ἓν
    ("1426b", 9): "δὲ καὶ σκοπεῖν,",      # Bekker: σκοπεῖν | δὲ καὶ τὸ πρᾶγμα
    ("1427a", 37): "εἶναι τῶν",           # [ἀδι]κεῖν εἶναι
    ("1427a", 40): "ἀξίου δὲ",            # [ἀν]θρώπων. ἀξίου
    ("1429a", 7): "πίστιν εἶναι,",        # [φαί]νονται, πίστιν
    ("1430b", 4): "οὔτ' ἀπιστεῖται",      # [ἀγνοεῖ]ται τὸ λεγόμενον οὔτ' ἀπιστεῖται
    ("1431a", 8): "ὡς ἡμεῖς λέγομεν καὶ",  # [φύ]σει ἀναγκαίων, ὡς ἡμεῖς λέγομεν (Fuhrmann: ****)
    ("1433a", 19): "μὴ τοῖς",             # [θο]ρυβῇ, μὴ τοῖς
    ("1433a", 25): "θορύβοις ἀπαντήσομεν",
    ("1433a", 26): "δεικνύντες",          # [ἐνθυ]μήμασι, δεικνύντες
    ("1433a", 27): "νόμοις ἢ",
    ("1435a", 20): "εὔρωστον",            # [πο]λέμοις εὔρωστον
    ("1435b", 8): "τύπτειν τοῦτον·",      # Bekker: τοῦτον τοῦ-|τον τύπτειν
    ("1436a", 4): "ἀλλήλοις.",            # [μό]νον ἀλλήλοις
    ("1436b", 21): "μετ' εἰρωνείας",      # [συντό]μως μετ'
    ("1437a", 9): "ἢ μέλλειν",            # [κρί]σιν ἢ μέλλειν
    ("1437a", 10): "ἐπενεγκόντας",
    ("1437a", 20): "εἶναι δόξει",
    ("1437b", 10): "καὶ ἐκ τῆς καινότητος",  # [με]γέθους καὶ ἐκ
    ("1437b", 18): "αἱ δὲ",               # Bekker: ἐπιχειρήσο-|μεν λύειν· αἱ δὲ
    ("1438a", 38): "συντόμως δέ,",        # [διαφυλάτ]τοντες, συντόμως
    ("1439a", 37): "καὶ καλὸν",           # [συμ]φέρον καὶ καλὸν
    ("1439a", 39): "ὅρισαι.",             # [πέ]ρατι ὅρισαι
    ("1441b", 31): "ἐξεταστικόν.",
    ("1445a", 36): "μὲν οὖν σχεδὸν",
    ("1447a", 7): "μᾶλλον συμφέρειν",
}


# ---------------------------------------------------------------- Fuhrmann

def read_fuhrmann(xml_path: Path) -> tuple[list[dict], list[dict], str]:
    """Fuhrmann's words in order, each with its chapter, and the chapter
    starts. Hyphenated line ends are rejoined. The title lines are dropped;
    the salutation (Bekker's line 1420a5) is kept, with the brace that opens
    the bracketed Letter."""
    tree = etree.parse(str(xml_path))
    ns = {"t": "http://www.tei-c.org/ns/1.0"}
    words: list[dict] = []
    starts: list[dict] = []
    salutation = ""
    for chap in tree.iterfind(".//t:div[@type='Chapter']", ns):
        cn = chap.get("n")
        starts.append({"chapter": cn, "word": len(words)})
        for sec in chap.iterfind("t:div", ns):
            for l in sec.iterfind("t:l", ns):
                if sec.get("n") == "tit":
                    lab = l.find("t:label", ns)
                    if lab is not None and "ΕΥ ΠΡΑΤΤΕΙΝ" in (lab.text or ""):
                        salutation = (lab.text or "").strip()
                    continue
                text = "".join(t for t in l.itertext())
                text = re.sub(r"\s+", " ", text).strip()
                toks = text.split(" ") if text else []
                for i, t in enumerate(toks):
                    if words and words[-1]["text"].endswith("-") and i == 0 and words[-1]["hy"]:
                        words[-1]["text"] = words[-1]["text"][:-1] + t
                        words[-1]["hy"] = False
                        continue
                    words.append({"text": t, "chapter": cn, "hy": i == len(toks) - 1 and t.endswith("-")})
    if not salutation:
        raise ValueError("no salutation in the proem's title lines")
    return words, starts, salutation


# ---------------------------------------------------------------- Bekker

def _noise(w: str) -> bool:
    """An OCR token that cannot be a printed word: no Greek letter at all
    (stray accents, quotes, digits, Latin), or one capital letter standing
    alone (the OCR reads detached breathings and accents as Ἁ, Ν, Ψ ...)."""
    n = norm(w)
    if not n:
        return True
    letters = [ch for ch in unicodedata.normalize("NFD", w) if ch.isalpha()]
    return len(letters) == 1 and letters[0].isupper()


def bekker_stream(lines_doc: dict) -> tuple[list[dict], list[tuple[str, int]]]:
    """Bekker's OCR words in reading order with their (column, line); a word
    hyphenated at a line end is rejoined onto the earlier line."""
    toks: list[dict] = []
    order: list[tuple[str, int]] = []
    for p in lines_doc["pages"]:
        for col in ("a", "b"):
            for ln in p["columns"][col]:
                key = (f"{p['page']}{col}", ln["n"])
                order.append(key)
                ws = [w for w in ln["words"] if not _noise(w)]
                for i, w in enumerate(ws):
                    if (i == 0 and toks and toks[-1]["hy"]):
                        toks[-1]["t"] = toks[-1]["t"][:-1] + w
                        toks[-1]["hy"] = False
                        continue
                    toks.append({"t": w, "line": key,
                                 "hy": i == len(ws) - 1 and w.endswith("-")})
    return toks, order


# ---------------------------------------------------------------- align

def align(bt: list[str], ft: list[str]) -> dict[int, tuple[int, float]]:
    """Map Bekker token index -> (Fuhrmann token index, score).

    Exact matches of the normalised forms seed the alignment (difflib's
    longest matching blocks, kept only when 3+ words long); the stretches
    between them are aligned by a small dynamic program that maximises the
    summed similarity of matched pairs."""
    sm = difflib.SequenceMatcher(None, bt, ft, autojunk=False)
    anchors = [b for b in sm.get_matching_blocks() if b.size >= 3 or b.size == 0]
    out: dict[int, tuple[int, float]] = {}
    pi = pj = 0
    for blk in anchors:
        _dp(bt, ft, pi, blk.a, pj, blk.b, out)
        for k in range(blk.size):
            out[blk.a + k] = (blk.b + k, 1.0)
        pi, pj = blk.a + blk.size, blk.b + blk.size
    return out


def _dp(bt, ft, i0, i1, j0, j1, out) -> None:
    n, m = i1 - i0, j1 - j0
    if n <= 0 or m <= 0:
        return
    if n * m > 4_000_000:
        raise ValueError(f"gap too large to align: {n} x {m} at bekker {i0}, fuhrmann {j0}")
    score = [[0.0] * (m + 1) for _ in range(n + 1)]
    back = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        a = bt[i0 + i - 1]
        row, prow = score[i], score[i - 1]
        brow = back[i]
        for j in range(1, m + 1):
            best, how = prow[j], 1          # skip a Bekker word
            if row[j - 1] > best:
                best, how = row[j - 1], 2   # skip a Fuhrmann word
            s = sim(a, ft[j0 + j - 1])
            if s >= MATCH and prow[j - 1] + s > best:
                best, how = prow[j - 1] + s, 3
            row[j] = best
            brow[j] = how
    i, j = n, m
    while i > 0 and j > 0:
        how = back[i][j]
        if how == 3:
            out[i0 + i - 1] = (j0 + j - 1, sim(bt[i0 + i - 1], ft[j0 + j - 1]))
            i -= 1
            j -= 1
        elif how == 1:
            i -= 1
        else:
            j -= 1


def _matched(a: str, b: str) -> int:
    if not a or not b:
        return 0
    return sum(m.size for m in difflib.SequenceMatcher(None, a, b, autojunk=False)
               .get_matching_blocks())


def _split(tail: list[str], head: list[str], gap: list[str]) -> tuple[int, float]:
    """Index (into `gap`) of the first Fuhrmann word of the new line, and a
    confidence in [0, 1]: how much of the head's letters the chosen split
    explains. The previous line's unread tail should match the gap's opening
    letters and this line's unread head its closing letters."""
    T, Hd = loose("".join(tail)), loose("".join(head))
    words = [loose(w) for w in gap]
    G = "".join(words)
    bounds, pos = [], 0          # char offset where each gap word starts
    for w in words:
        bounds.append(pos)
        pos += len(w)
    best = None
    for x in range(len(G) + 1):
        score = _matched(T, G[:x]) + _matched(Hd, G[x:])
        # ties: prefer the split nearest the letters' proportion
        want = len(G) * len(T) / max(1, len(T) + len(Hd))
        key = (score, -abs(x - want))
        if best is None or key > best[0]:
            best = (key, x)
    x = best[1]
    # word index: the first word that starts at or after x (a word cut by x
    # stays on the earlier line)
    start = next((i for i, b in enumerate(bounds) if b >= x), len(gap))
    conf = _matched(Hd, G[x:]) / max(1, len(Hd)) if Hd else 1.0
    return start, conf


def line_starts(btoks, order, amap, bt, ft) -> tuple[dict, list[dict]]:
    """Fuhrmann start index for every Bekker line, and the boundaries that are
    not settled by the line's own first word."""
    by_line: dict[tuple, list[int]] = {k: [] for k in order}
    for i, t in enumerate(btoks):
        by_line[t["line"]].append(i)
    starts: dict[tuple, int] = {}
    notes: list[dict] = []
    prev_end = -1          # last Fuhrmann index claimed by the previous line
    prev_tail_idx: list[int] = []
    for key in order:
        idx = by_line[key]
        matched = [(k, i) for k, i in enumerate(idx) if i in amap]
        if not matched:
            starts[key] = prev_end + 1
            notes.append({"line": key, "kind": "no-match", "start": prev_end + 1})
            continue
        k, i = matched[0]
        fj = amap[i][0]
        # Fuhrmann words between the previous line's last match and this
        # line's first: give the previous line as many as it had unmatched
        # words at its end, the rest to this line (k unmatched words here).
        gap = fj - (prev_end + 1)
        if k == 0 or gap == 0:
            # The line's first printed word is matched (any Fuhrmann words
            # Bekker lacks before it close the previous line), or there is
            # nothing between the two lines' matched words to place.
            start = fj
            if gap:
                notes.append({"line": key, "kind": "extra-words", "gap": gap,
                              "lead_unmatched": k, "start": start})
        else:
            # k unread words open this line and `gap` Fuhrmann words stand
            # before its first match. Split the gap's letters between the
            # previous line's unread tail and this line's unread head, where
            # the two OCR strings match the gap best; a split inside a word
            # means Bekker broke that word across the lines (its hyphen lost
            # to the OCR), and the spine keeps a broken word whole on the
            # earlier line, as stage1 does for the TLG's own hyphens.
            tail_toks = [bt[i] for i in prev_tail_idx]
            head_toks = [bt[i] for i in idx[:k]]
            start, conf = _split(tail_toks, head_toks, ft[prev_end + 1:fj])
            start += prev_end + 1
            kind = "ambiguous" if conf < 0.5 else "lead-unread"
            notes.append({"line": key, "kind": kind, "gap": gap, "lead_unmatched": k,
                          "prev_tail_unmatched": len(tail_toks), "start": start,
                          "first_match": fj, "split_conf": round(conf, 2)})
        starts[key] = start
        last_k, last_i = matched[-1]
        prev_end = amap[last_i][0]
        prev_tail_idx = idx[last_k + 1:]
    return starts, notes


def apply_print_starts(starts: dict, notes: list[dict], words: list[str]) -> list[dict]:
    """Set each PRINT_STARTS line to the Fuhrmann word its opening names: the
    one place, within twelve words of where the alignment put it, that those
    words stand. Its alignment note gives way to a "print" note."""
    for key, opening in PRINT_STARTS.items():
        if key not in starts:
            raise SystemExit(f"PRINT_STARTS: no line {key[0]}{key[1]}")
        want = opening.split()
        hits = [i for i in range(max(0, starts[key] - 12), min(len(words), starts[key] + 13))
                if words[i:i + len(want)] == want]
        if len(hits) != 1:
            raise SystemExit(f"PRINT_STARTS {key[0]}{key[1]}: {opening!r} stands at {len(hits)} "
                             "places near the aligned start, want one")
        starts[key] = hits[0]
    notes = [x for x in notes if x["line"] not in PRINT_STARTS]
    return notes + [{"line": k, "kind": "print", "start": starts[k]} for k in PRINT_STARTS]


def cmd_build(args) -> None:
    lines_doc = json.loads(Path(args.lines).read_text(encoding="utf-8"))
    fw, fstarts, salutation = read_fuhrmann(Path(args.tlg_xml))
    btoks, order = bekker_stream(lines_doc)
    # Bekker 1420a5 is the salutation; Fuhrmann has it as a heading. It is
    # set as that line's text and taken out of the alignment.
    sal_key = ("1420a", 5)
    order_body = [k for k in order if k != sal_key]
    btoks_body = [t for t in btoks if t["line"] != sal_key]
    bt = [norm(t["t"]) for t in btoks_body]
    ft = [norm(w["text"]) for w in fw]
    amap = align(bt, ft)
    starts, notes = line_starts(btoks_body, order_body, amap, bt, ft)
    notes = apply_print_starts(starts, notes, [w["text"] for w in fw])
    # monotone, inside the text
    seq = [starts[k] for k in order_body]
    for a, b in zip(seq, seq[1:]):
        if b < a:
            raise ValueError("line starts go backwards")
    texts: dict[tuple, str] = {}
    for idx, key in enumerate(order_body):
        s = starts[key]
        e = starts[order_body[idx + 1]] if idx + 1 < len(order_body) else len(fw)
        texts[key] = " ".join(w["text"] for w in fw[s:e])
    texts[sal_key] = "{" + salutation
    if seq[0] != 0:
        raise ValueError(f"first Bekker line starts at Fuhrmann word {seq[0]}, not 0")
    empty = [k for k in order if not texts[k]]

    # spine TEI
    tei = etree.Element("TEI", nsmap={None: "http://www.tei-c.org/ns/1.0"})
    hdr = etree.SubElement(tei, "teiHeader")
    fd = etree.SubElement(hdr, "fileDesc")
    ts = etree.SubElement(fd, "titleStmt")
    etree.SubElement(ts, "title").text = "Rhetorica ad Alexandrum (Bekker-lined)"
    sd = etree.SubElement(fd, "sourceDesc")
    etree.SubElement(sd, "p").text = (
        "Words: M. Fuhrmann, Anaximenis ars rhetorica (Leipzig: Teubner, 1966), as digitised "
        "by the TLG (0547.001). Line breaks and Bekker numbers: I. Bekker, Aristotelis Opera "
        "vol. II (Berlin, 1831), pp. 1420-1447, read from the printed page (archive.org "
        f"{lines_doc['scan']}). Built by pipeline/tools/build_rhetal_spine.py.")
    body = etree.SubElement(etree.SubElement(tei, "text"), "body")
    cur_col, div = None, None
    for key in order:
        col, n = key
        if col != cur_col:
            div = etree.SubElement(body, "div", type="Bekker-page", n=col)
            cur_col = col
        etree.SubElement(div, "l", n=str(n)).text = texts[key]
    SPINE_FILE.write_bytes(etree.tostring(tei, encoding="utf-8", xml_declaration=True,
                                          pretty_print=True))

    # chapters: Fuhrmann's chapter divs at their Bekker line and word
    sys.path.insert(0, str(ROOT / "pipeline"))
    from aristotle_pipeline.stage1_chapters import _norm as spine_norm
    line_of = []
    for idx, key in enumerate(order_body):
        e = starts[order_body[idx + 1]] if idx + 1 < len(order_body) else len(fw)
        line_of.extend([key] * (e - starts[key]))
    chap_lines = []
    for n, st in enumerate(fstarts, 1):
        key = line_of[st["word"]]
        if n == 1:
            key = sal_key   # the Letter opens with the salutation
            word = 0
        else:
            before = " ".join(w["text"] for w in fw[starts[key]:st["word"]])
            word = len(spine_norm(before.replace("-", "")).split())
        label = "Letter" if st["chapter"] == "proem" else f"Fuhrmann {st['chapter']}"
        chap_lines.append(f'    - {{ n: {n}, bekker: "{key[0]}{key[1]}", word: {word} }}'
                          f'   # {label}: {" ".join(w["text"] for w in fw[st["word"]:st["word"] + 5])}')
    CHAPTERS_FILE.write_text("# generated by pipeline/tools/build_rhetal_spine.py; paste into "
                             "manifests/RhetAl.yaml chapters.list\n" + "\n".join(chap_lines) + "\n",
                             encoding="utf-8")

    unsettled = [x for x in notes if x["kind"] in ("ambiguous", "no-match")]
    matched = len(amap)
    report = {
        "bekker_tokens": len(bt), "fuhrmann_tokens": len(ft), "matched": matched,
        "lines": len(order), "empty_lines": [f"{c}{n}" for c, n in empty],
        "notes": [dict(x, line=f"{x['line'][0]}{x['line'][1]}") for x in notes],
    }
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"bekker words {len(bt)}, fuhrmann words {len(ft)}, matched {matched} "
          f"({matched / len(bt):.1%} of Bekker)")
    print(f"lines {len(order)}; empty {len(empty)}; " + ", ".join(
        f"{k} {v}" for k, v in sorted(Counter(x["kind"] for x in notes).items())))
    print(f"wrote {SPINE_FILE.relative_to(ROOT)}, {CHAPTERS_FILE.relative_to(ROOT)}, "
          f"{REPORT_FILE.relative_to(ROOT)}")


# ---------------------------------------------------------------- compare

def cmd_compare(args) -> None:
    """Row by row, the two extracts must read the same printed line: a row
    whose text differs (or that one scan lacks) is listed for the page image.
    The texts are compared in norm() form, joined, as one string."""
    docs = [json.loads(Path(f).read_text(encoding="utf-8")) for f in (args.a, args.b)]
    rows = [{(p["page"], col, ln["n"]): norm("".join(ln["words"]))
             for p in d["pages"] for col, lns in p["columns"].items() for ln in lns} for d in docs]
    keys = sorted(set(rows[0]) | set(rows[1]))
    if not keys:
        raise SystemExit("no rows in either extract")
    odd = []
    for k in keys:
        a, b = rows[0].get(k), rows[1].get(k)
        if a is None or b is None:
            odd.append((k, "only in " + (docs[0] if b is None else docs[1])["scan"], a or b))
            continue
        r = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() if a and b else float(a == b)
        if r < args.min:
            odd.append((k, f"{r:.2f}", f"{a} | {b}"))
    both = sum(1 for k in keys if k in rows[0] and k in rows[1])
    print(f"rows: {len(rows[0])} in {docs[0]['scan']}, {len(rows[1])} in {docs[1]['scan']}, "
          f"{both} in both; {len(odd)} differ (text ratio < {args.min})")
    for (page, col, n), why, text in odd:
        print(f"  {page}{col}{n}: {why}: {text[:90]}")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract")
    e.add_argument("--hocr", required=True)
    e.add_argument("--pageindex", required=True)
    e.add_argument("--first-leaf", type=int, required=True, help="hOCR page index of p. 1420")
    e.add_argument("--scan", default="aristotelisopera02arisuoft")
    e.add_argument("--row-h", type=float, default=ROW_H, help="line pitch in the scan, in pixels")
    e.add_argument("--foot", type=int, default=0, help="first row the apparatus may start on")
    e.add_argument("--out", default=str(LINES_FILE))
    b = sub.add_parser("build")
    b.add_argument("--tlg-xml", required=True)
    b.add_argument("--lines", default=str(LINES_FILE))
    c = sub.add_parser("compare")
    c.add_argument("a")
    c.add_argument("b")
    c.add_argument("--min", type=float, default=0.5, help="text ratio below which a row is listed")
    args = ap.parse_args(argv)
    {"extract": cmd_extract, "build": cmd_build, "compare": cmd_compare}[args.cmd](args)


if __name__ == "__main__":
    main()
