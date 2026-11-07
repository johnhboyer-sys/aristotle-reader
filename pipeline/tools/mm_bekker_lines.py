"""Bekker line map for the Magna Moralia, read from Bekker's own pages.

The TLG export of the Magna Moralia (Susemihl's text, as printed in the Loeb)
has no Bekker numbers, and the reader's Greek spine is Bekker-lineated. Bekker
(Berlin, 1831, vol. II pp. 1181-1213) is the one print where every line is a
Bekker line, so we read its scan (archive.org aristotelisopera02arisuoft) and
place each printed line's opening word in the TLG text:

  1. ocr    tesseract (grc) on each page image -> word boxes (TSV)
  2. rows   per page: the gutter numerals (5, 10, ... printed between the
            columns, shared by both) give the row pitch and, for each row of
            words, its line number: the nearest numeral plus whole rows. Titles,
            the running head, footnotes and margin chapter numbers are dropped.
  3. align  each column's OCR text is aligned to the TLG text (accents, case
            and Bekker's ου/στ ligatures folded away), giving a first guess at
            each line's opening; then refine() settles all openings at once,
            each within REACH words of its guess, so that every placed line
            reads most like its printed line. A word Bekker split across lines
            belongs to the line where it starts (the pipeline's convention),
            whether or not the OCR kept the hyphen.
  4. write  sources/mm-bekker/bekker-lines.yaml (read by stage1_relineate) and
            build/mm-ocr/bekker/report.txt (doubtful lines, for the images).

Line numbers come only from the printed numerals and the printed rows between
them; nothing is interpolated across the text. Where the OCR can't settle a
line's opening, LINE_READS holds the reading off the page image, and a stale
entry stops the tool.

Checks (the first also run by tests/test_mm_bekker_lines.py on the committed map):
  - every column 1181a..1213b present, lines consecutive within a column;
  - each placed line read back against the OCR of its printed line;
    report.txt lists the weak ones;
  - --first1k PATH: First1KGreek's TEI of Susemihl's Teubner (not vendored)
    marks every fifth Bekker line in his text. His marks are good to about a
    line, so this catches drift, not a word misplaced.
  - Audit on the images (2026-11-06): 40 openings in five random windows
    (seed 7: 1201b7-14, 1190b12-19, 1206a4-11, 1185b14-21, 1184a30-37), all
    right, split words included. An earlier sample found the errors that
    refine()'s split-word rule now handles.

Run from pipeline/:
  uv run --with pillow python tools/mm_bekker_lines.py --ocr   # once: images + tesseract
  uv run python tools/mm_bekker_lines.py [--first1k PATH] [--chapters]
"""

from __future__ import annotations

import argparse
import csv
import difflib
import re
import statistics as st
import subprocess
import sys
import unicodedata
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aristotle_pipeline.stage1_relineate import tlg_tokens  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "build" / "mm-ocr" / "bekker"
XML = ROOT / "build" / "export" / "Diogenes-Resources" / "xml" / "tlg" / "tlg0086022.xml"
OUT = ROOT / "sources" / "mm-bekker" / "bekker-lines.yaml"
SCAN = "aristotelisopera02arisuoft"   # Bekker vol. II, page P = image n(P-783)
FIRST, LAST = 1181, 1213
# The Magna Moralia opens at line 24 of both columns of 1181 (the Nicomachean
# Ethics fills the rows above, then the title) and ends at 1213b30.
START_LINE = {"1181a": 24, "1181b": 24}
# Book II's title "Β." stands in rows 21-23 of 1198b; the column's text
# resumes at row 24 (Stock's margin and parallel note agree: II opens 1198b24).
TITLE_ROWS = {"1198b": [21, 22, 23]}

# Readings off the page images where the OCR row or alignment is wrong:
# Bekker ref -> TLG word (loc, w) that opens the printed line. Each was checked
# on the image; the tool fails if an entry names no word or no line.
LINE_READS: dict[str, tuple[str, int, str]] = {
    # a stain over 1188a25-28: the OCR kept only parts of these lines
    "1188a25": ("1.13.2.2", 7, "ἁρμόττουσιν,"),
    "1188a26": ("1.13.2.4", 1, "καὶ"),
    "1188a27": ("1.13.3.1", 6, "διειλόμεθα"),
    "1188a28": ("1.13.3.3", 0, "ἀλλὰ"),
    "1188a29": ("1.13.3.3", 9, "τέως"),     # 28 ends ταῦτα, which the OCR lost
    # 1188b14 is "οὐ βία." alone; the OCR read only βία
    "1188b14": ("1.15.1.3", 8, "οὐ"),
    # 1196a26 opens οἰκονομικόν (τὸ ends 25); the OCR lost 27 but its last word
    "1196a26": ("1.33.35.2", 0, "οἰκονομικόν."),
    "1196a27": ("1.33.35.3", 2, "αὑτῆς"),
}
# Lines that read unlike their OCR (below LOW_SIM) and were checked right on the
# image: the OCR garbled the print, not the opening. Any other such line stops
# the tool, as does a column whose last line holds more than LAST_MAX words
# (a row lost at the foot of both columns would pour into it).
IMAGE_CHECKED = {"1213b19"}
LOW_SIM, LAST_MAX = 0.5, 16
# Rows below a column's text that the OCR read as text, checked on the image;
# the tool fails if one is not there to drop. 1188a39 is a stain; 1212a40 is
# the first line of the notes, which held one line reference the OCR kept.
NOT_TEXT_ROWS = {"1188a": [39], "1212a": [40]}


# First1K marks more than a line from ours that were checked on Bekker's
# page and found to be First1K's error. Any other such mark stops the tool.
FIRST1K_KNOWN: dict[str, str] = {
    "1211a5": "First1K's mark is two lines late: Bekker's 5 stands at τὸ εἶναι βούλεσθαι (image)",
}


# -- 1. OCR -----------------------------------------------------------------

# The whole-page pass (--psm 1) finds the gutter numerals but reads words
# poorly where it runs a line across both columns, so each column is cropped
# at the gutter and read again as one column (--psm 4).
COL_PAD = 30     # px of gutter kept beside each column's text


def run_ocr() -> None:
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(6) as pool:
        list(pool.map(_ocr_page, range(FIRST, LAST + 1)))


def _ocr_page(page: int) -> None:
    # Pillow only for cropping, and only in this step (macOS sips ignores a
    # crop offset): run it as `uv run --with pillow python tools/... --ocr`.
    import os
    from PIL import Image
    env = dict(os.environ, OMP_THREAD_LIMIT="1")
    img = OCR / f"p{page}.jpg"
    if not img.exists():
        url = f"https://archive.org/download/{SCAN}/page/n{page - 783}_w2400.jpg"
        subprocess.run(["curl", "-sL", "-o", str(img), url], check=True)
    tsv = OCR / f"p{page}.tsv"
    if not tsv.exists():
        subprocess.run(["tesseract", str(img), str(OCR / f"p{page}"), "-l", "grc",
                        "--psm", "1", "tsv"], check=True, capture_output=True, env=env)
    width, height, words = _read_tsv(tsv)
    _, _, gx = gutter_numerals(width, words)
    for col, x0, x1 in (("a", 0, int(gx) - COL_PAD), ("b", int(gx) + COL_PAD, width)):
        if (OCR / f"p{page}{col}.tsv").exists():
            continue
        crop = OCR / f"p{page}{col}.png"
        Image.open(img).crop((x0, 0, x1, height)).save(crop)
        subprocess.run(["tesseract", str(crop), str(OCR / f"p{page}{col}"), "-l", "grc",
                        "--psm", "4", "tsv"], check=True, capture_output=True, env=env)
        (OCR / f"p{page}{col}.x0").write_text(str(x0))
        crop.unlink()


# -- 2. rows ----------------------------------------------------------------

_NUM = re.compile(r"^(\d{1,2})[.,'’:;]?$")
_TITLE = re.compile(r"^[Α-ΩἈ-Ὧ.,:]+$")


def _read_tsv(path: Path, dx: int = 0) -> tuple[int, int, list[dict]]:
    width = height = 0
    words = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            if r["level"] == "1":
                width, height = int(r["width"]), int(r["height"])
            t = (r["text"] or "").strip()
            if r["level"] != "5" or not t:
                continue
            x, y, w, h = (int(r[k]) for k in ("left", "top", "width", "height"))
            x += dx
            words.append({"t": t, "x": x, "y": y, "w": w, "h": h,
                          "xc": x + w / 2, "yc": y + h / 2})
    return width, height, words


def page_words(page: int) -> tuple[int, list[dict]]:
    width, _, words = _read_tsv(OCR / f"p{page}.tsv")
    return width, words


def column_words(page: int, col: str) -> list[dict]:
    dx = int((OCR / f"p{page}{col}.x0").read_text())
    return _read_tsv(OCR / f"p{page}{col}.tsv", dx)[2]


def gutter_numerals(width: int, words: list[dict]) -> tuple[list[tuple[int, float]], float, float]:
    """The line numerals printed between the columns, as (k, y) — only those
    that agree with a neighbour on the row pitch — plus the pitch and the
    gutter's x."""
    cand = []
    for w in words:
        m = _NUM.match(w["t"])
        if m and 0.44 * width < w["xc"] < 0.53 * width:
            k = int(m.group(1))
            if k % 5 == 0 and 5 <= k <= 40:
                cand.append((k, w["yc"], w["xc"]))
    cand.sort(key=lambda c: c[1])
    ratios = [(b[1] - a[1]) / (b[0] - a[0]) for a, b in zip(cand, cand[1:]) if b[0] > a[0]]
    pitch = st.median(r for r in ratios if 60 < r < 90)
    good = []
    for i, (k, y, x) in enumerate(cand):
        nbrs = [c for c in (cand[i - 1] if i else None, cand[i + 1] if i + 1 < len(cand) else None) if c]
        if any(c[0] != k and abs((c[1] - y) / (c[0] - k) - pitch) < 0.06 * pitch for c in nbrs):
            good.append((k, y, x))
    return [(k, y) for k, y, _ in good], pitch, st.median(x for _, _, x in good)


def page_rows(page: int) -> dict[str, dict[int, str]]:
    """{column: {line: OCR text}} for one page."""
    width, words = page_words(page)
    nums, pitch, gx = gutter_numerals(width, words)
    title_y = 0
    if page == FIRST:
        # Above the title the numerals count the Ethics' lines; the title's
        # rows are not counted, so only the numerals below it apply.
        title_y = max(w["yc"] for w in words if "ΜΕΓΑΛ" in w["t"] or "ΜΕΤΓΑΛ" in w["t"])
        nums = [(k, y) for k, y in nums if y > title_y] or [
            (k, y) for k, y in gutter_numerals_loose(width, words) if y > title_y]
        words = [w for w in words if w["yc"] > title_y + pitch / 2]
    if not nums:
        raise ValueError(f"p{page}: no gutter numerals")
    def body(ws):
        if page == FIRST:
            ws = [w for w in ws if w["yc"] > title_y + pitch / 2]
        # loose accents and specks read as words are short boxes with no
        # two-letter body; short real words (οὐκ, ἂν) keep their letters
        return [w for w in ws if (w["h"] >= 30 or len(norm(w["t"])) >= 2)
                and not re.search(r"\d", w["t"])
                and not (_TITLE.match(w["t"]) and w["h"] > 60)]
    def numbered(ws) -> dict[int, list[dict]]:
        """Cluster words into printed rows by vertical centre; number each row
        from the nearest gutter numeral."""
        ws = sorted(ws, key=lambda w: w["yc"])
        clusters: list[list[dict]] = []
        for w in ws:
            if clusters and w["yc"] - st.median(c["yc"] for c in clusters[-1]) < 0.5 * pitch:
                clusters[-1].append(w)
            else:
                clusters.append([w])
        out: dict[int, list[dict]] = {}
        for c in clusters:
            y = st.median(w["yc"] for w in c)
            k, yk = min(nums, key=lambda n: abs(n[1] - y))
            out.setdefault(k + round((y - yk) / pitch), []).extend(c)
        return out

    page_body = body(words)
    rows: dict[str, dict[int, list[dict]]] = {}
    for col in ("a", "b"):
        rows[col] = numbered(body(column_words(page, col)))
        # The column pass now and then skips a line near a stain; the
        # whole-page pass read it, so fill a row it lacks from that pass.
        side = [w for w in page_body if (w["xc"] < gx) == (col == "a")]
        for n, ws in numbered(side).items():
            if n not in rows[col]:
                rows[col][n] = ws
    # The body ends below the last numeral at the first row that is empty in
    # both columns (the gap above the notes) or holds two or more numbers
    # outside the gutter: the notes' line references ("12.").
    last_k = max(k for k, _ in nums)
    end = last_k
    while end < 45:
        row = rows["a"].get(end + 1, []) + rows["b"].get(end + 1, [])
        row = [w for w in row if len(norm(w["t"])) >= 2]
        if not row:
            break
        ny = st.median(w["yc"] for w in row)
        # a stain read as "7" is not a reference; a note's reference has its stop
        refs = [w for w in words if abs(w["yc"] - ny) < pitch / 2 and re.match(r"^\d{1,2}\.$", w["t"])
                and not 0.44 * width < w["xc"] < 0.53 * width]
        if len(refs) >= 2:
            break
        end += 1
    out: dict[str, dict[int, str]] = {}
    for col in ("a", "b"):
        column = f"{page}{col}"
        lo = START_LINE.get(column, 1)
        out[column] = {}
        for n in NOT_TEXT_ROWS.get(column, []):
            if n not in rows[col]:
                raise ValueError(f"NOT_TEXT_ROWS {column}{n}: no such row to drop")
            del rows[col][n]
        for n in sorted(rows[col]):
            text = " ".join(w["t"] for w in sorted(rows[col][n], key=lambda w: w["x"]))
            # a row of stray marks (accents read loose, specks) is not a line
            if lo <= n <= end and len(norm(text)) >= 4:
                out[column][n] = text
    return out


def gutter_numerals_loose(width, words):
    out = []
    for w in words:
        m = _NUM.match(w["t"])
        if m and 0.44 * width < w["xc"] < 0.53 * width and int(m.group(1)) % 5 == 0:
            out.append((int(m.group(1)), w["yc"]))
    return out


# -- 3. align ---------------------------------------------------------------

def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().replace("ς", "σ")
    s = re.sub(r"[^α-ω]", "", s)
    return s.replace("ου", "υ").replace("στ", "σ")


def tlg_stream(tokens):
    chars, starts = [], []
    pos = 0
    for t in tokens:
        n = norm(t["text"])
        starts.append(pos)
        chars.append(n)
        pos += len(n)
    return "".join(chars), starts


def align_all(columns: list[tuple[str, dict[int, str]]], tokens) -> tuple[list[dict], list[str]]:
    from bisect import bisect_right
    tlg, tstart = tlg_stream(tokens)
    starts_set = set(tstart)
    entries, doubts = [], []
    cursor = 0
    for column, lines in columns:
        ocr, lstart, hyph, wordstarts = "", {}, {}, {}
        for n, text in lines.items():
            lstart[n] = len(ocr)
            # where each OCR word starts, for a line opening on a word tail
            ws, p = [], len(ocr)
            for tok in text.split():
                ws.append(p)
                p += len(norm(tok))
            wordstarts[n] = ws
            # judged on the last real word: junk read off a stain past the
            # hyphen ("κοι- ἝἜ") hides it otherwise
            real = _real(text)
            hyph[n] = bool(real) and real[-1].endswith(("-", "‐", "¬"))
            ocr += norm(text)
        # A column cannot open before the last line placed in the one before.
        lo = tstart[entries[-1]["i"]] + 1 if entries else 0
        hi = min(len(tlg), cursor + int(len(ocr) * 1.4) + 300)
        window = tlg[lo:hi]
        sm = difflib.SequenceMatcher(None, ocr, window, autojunk=False)
        omap: dict[int, int] = {}
        big: set[int] = set()
        for a, b, size in sm.get_matching_blocks():
            if size >= 3:
                for i in range(size):
                    omap[a + i] = lo + b + i
                    if size >= 5:
                        big.add(a + i)
        prev = None
        for n in sorted(lines):
            s = lstart[n]
            if prev is not None and hyph[prev] and len(wordstarts[n]) > 1:
                # skip the tail of Bekker's split word, unless the first word
                # is matched at a word's start: then the "hyphen" was a stop
                # read wrong (ἀδικεῖται· read ἀδικεῖται-) and the word is whole
                if not (s in big and omap[s] in starts_set):
                    s = wordstarts[n][1]
            # The line opens where its first matched letter says, but a
            # 3- or 4-letter block at the very start can be a chance match
            # (ἐκ ἄρω took δ-εκα-τα), so a letter in a longer block is preferred.
            span = [i for i in range(s, min(s + 15, len(ocr))) if i in omap]
            matched = len(span)
            ref = f"{column}{n}"
            if not span:
                # no letters to place it by: a rough guess (a line holds about
                # ten words) for refine() to settle from the line's whole text
                doubts.append(f"{ref}: no match near line start | {lines[n]}")
                guess = entries[-1]["i"] + 10 if entries else 0
                entries.append({"bekker": ref, "i": min(guess, len(tstart) - 1), "end": None})
                prev = n
                continue
            probe = next((i for i in span if i in big), span[0])
            t = omap[probe] - (probe - s)
            k = max(0, bisect_right(tstart, t) - 1)
            nxt = tstart[k + 1] if k + 1 < len(tstart) else len(tlg)
            off = t - tstart[k]
            if off and nxt - t < off:
                k += 1
            if off and min(off, nxt - t) > 1:
                doubts.append(f"{ref}: opening {min(off, nxt - t)} chars off a word boundary | {lines[n]}")
            if matched < 9:
                doubts.append(f"{ref}: weak match ({matched}/15) | {lines[n]}")
            # where the line's last well-matched letter falls in the TLG text
            e_s = lstart[n] + len(norm(lines[n]))
            tail = [i for i in range(max(s, e_s - 20), e_s) if i in big]
            entries.append({"bekker": ref, "i": k, "end": omap[tail[-1]] if tail else None})
            prev = n
        # Carry the cursor from the last line placed in this column, not from
        # the furthest match: one spurious match near the window's end would
        # otherwise pull every later column off the text.
        placed = [e["i"] for e in entries[-len(lines):] if e["bekker"].startswith(column)]
        if placed:
            k = placed[-1]
            cursor = tstart[min(k + 10, len(tstart) - 1)]
    return entries, doubts


def tlg_words_between(tstart: list[int], end: int, opening: int) -> bool:
    """True if a whole TLG word starts after char `end` and ends before `opening`."""
    from bisect import bisect_right
    k = bisect_right(tstart, end)   # first word starting after `end`
    return k + 1 < len(tstart) and tstart[k + 1] <= opening


MOVE_COST = 0.01   # per word an opening moves from the first guess, to break ties
REACH = 7   # words either side of the first guess that refine() may move an opening


def _real(text: str) -> list[str]:
    """The tokens with a lower-case Greek letter; junk read off stains and
    specks comes out as capitals ("ἝἜ", "ΤΝ") or marks."""
    return [tok for tok in text.split()
            if any(ch.islower() and "GREEK" in unicodedata.name(ch, "") for ch in tok)]


def refine(entries: list[dict], columns, tokens, fixed: dict[str, int]) -> list[dict]:
    """Settle every opening at once: among openings within REACH words of the
    first guess, choose the set under which each placed line reads most like
    its printed line (difflib ratio, on the folded letters).

    A printed line owns a word it splits (the pipeline's convention), so for
    scoring, the tail opening the next line is moved back onto it; see
    joined() for how a split is recognised. `fixed` openings
    (LINE_READS, read off the image) are not moved.
    """
    ocr_of = {f"{c}{n}": t for c, lines in columns for n, t in lines.items()}
    refs = [e["bekker"] for e in entries]
    words = [_real(ocr_of[r]) for r in refs]
    folded = [norm(t["text"]) for t in tokens]
    N, T = len(refs), len(tokens)
    tail = [norm(w[-1]) if w else "" for w in words]
    head = [norm(w[0]) if w else "" for w in words]
    body = [norm(" ".join(w)) for w in words]
    rest = [norm(" ".join(w[1:])) for w in words]

    def joined(k: int, c: int) -> bool:
        """Does line k's hyphen take line k+1's first word, given opening c?"""
        if k < 0 or k + 1 >= N or not tail[k] or not head[k + 1]:
            return False
        # Bekker split a word here if line k's last word and line k+1's first
        # make the TLG word before the opening and the last word alone does
        # not. The OCR's hyphen is not trusted either way: it often drops it
        # (φαί- read φαΐ) and reads a raised stop as one (ἀδικεῖται- for ·).
        if c < 2:
            return False
        last, before = folded[c - 1], folded[c - 2]
        t, h = tail[k], head[k + 1]
        r = lambda a, b: difflib.SequenceMatcher(None, a, b).ratio()
        if abs(len(t) + len(h) - len(last)) > 3 or len(last) <= max(len(t), len(h)):
            return False   # both halves of a split are shorter than the word (ἀ-ρετή may split)
        if r(t, last) >= 0.8 or r(t, before) >= 0.66:
            return False   # line k's last word is a whole word (βία read βίω)
        # one half of the split reads true (the OCR garbles the other at
        # times: προαι- read τέρμ)
        return r(t, last[:len(t)]) >= 0.5 or r(h, last[-len(h):]) >= 0.75

    def ocr_line(k: int, c0: int, c1: int) -> str:
        text = rest[k] if joined(k - 1, c0) else body[k]
        if joined(k, c1):
            text += head[k + 1]
        return text

    cands = []
    for k, e in enumerate(entries):
        if k == 0:
            cands.append([0])
        elif refs[k] in fixed:
            cands.append([fixed[refs[k]]])
        else:
            cands.append([c for c in range(e["i"] - REACH, e["i"] + REACH + 1) if 0 < c < T])
    cands.append([T])
    guess = [e["i"] for e in entries] + [T]
    # best[k][c] = (score of lines < k, back-pointer) with line k opening at c
    best = [{0: (0.0, None)}]
    for k in range(N):
        nxt: dict[int, tuple[float, int]] = {}
        for c1 in cands[k + 1]:
            for c0, (sc, _) in best[k].items():
                if c1 <= c0:
                    continue
                r = difflib.SequenceMatcher(None, "".join(folded[c0:c1]), ocr_line(k, c0, c1),
                                            autojunk=False).ratio()
                # a word the OCR lost at a line's edge reads the same on either
                # line; such a tie keeps the first guess
                r -= MOVE_COST * abs(c1 - guess[k + 1])
                if c1 not in nxt or sc + r > nxt[c1][0]:
                    nxt[c1] = (sc + r, c0)
        if not nxt:
            raise ValueError(f"refine: no opening order fits at {refs[k]}")
        best.append(nxt)
    c = T
    picks = []
    for k in range(N, 0, -1):
        c = best[k][c][1]
        picks.append(c)
    picks.reverse()
    return [{**e, "i": i, "moved": i - e["i"]} for e, i in zip(entries, picks)]


# -- 4. write ---------------------------------------------------------------

def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ocr", action="store_true", help="fetch images and run tesseract first")
    ap.add_argument("--first1k", type=Path, help="First1KGreek TEI for the margin cross-check")
    ap.add_argument("--chapters", action="store_true",
                    help="print the manifest's chapters.list from the written map")
    args = ap.parse_args(argv)
    tokens = tlg_tokens(XML)
    if args.chapters:
        from aristotle_pipeline.stage1_relineate import load_map
        index = {(t["loc"], t["w"]): i for i, t in enumerate(tokens)}
        starts = [(str(e["bekker"]), index[(e["loc"], e["w"])]) for e in load_map(OUT)]
        for c in chapter_list(tokens, starts):
            print(f"    - {{ book: {c['book']}, n: {c['n']}, bekker: \"{c['bekker']}\", word: {c['word']} }}")
        return 0
    if args.ocr:
        run_ocr()
    columns = []
    problems = []
    for page in range(FIRST, LAST + 1):
        for column, lines in page_rows(page).items():
            ns = sorted(lines)
            if not ns:
                problems.append(f"{column}: no lines")
                continue
            gaps = [n for n in range(ns[0], ns[-1] + 1)
                    if n not in lines and n not in TITLE_ROWS.get(column, [])]
            if gaps:
                problems.append(f"{column}: rows missing {gaps}")
            if ns[0] != START_LINE.get(column, 1):
                problems.append(f"{column}: first line {ns[0]}")
            columns.append((column, lines))
    entries, doubts = align_all(columns, tokens)
    refs = {e["bekker"] for e in entries}
    fixed = {}
    for ref, (loc, w, word) in LINE_READS.items():
        i = next((j for j, t in enumerate(tokens) if t["loc"] == loc and t["w"] == w), None)
        if i is None or ref not in refs or tokens[i]["text"] != word:
            problems.append(f"LINE_READS {ref}: stale (no {word!r} at {loc}:{w}, or no such line)")
            continue
        fixed[ref] = i
    entries = refine(entries, columns, tokens, fixed)
    rows = [f"{c}{n}" for c, lines in columns for n in sorted(lines)]
    if [e["bekker"] for e in entries] != rows:
        problems.append("the map's lines are not the printed rows, one for one")
    print(f"refine moved {sum(1 for e in entries if e['moved'])} openings")
    tlg, tstart = tlg_stream(tokens)
    for a, b in zip(entries, entries[1:]):
        # The print's line a must end before line b opens, and leave no whole
        # word between: else one of the two openings is a word off.
        if a["end"] is not None and b["i"] < len(tstart):
            if a["end"] >= tstart[b["i"]]:
                doubts.append(f"{b['bekker']}: line {a['bekker']} reads on past this opening")
            elif tlg_words_between(tstart, a["end"], tstart[b["i"]]):
                doubts.append(f"{b['bekker']}: a word between {a['bekker']}'s end and this opening")
        if b["i"] <= a["i"]:
            problems.append(f"{a['bekker']} -> {b['bekker']}: no word between (token {a['i']}..{b['i']})")
    if entries and entries[0]["i"] != 0:
        problems.append(f"first line {entries[0]['bekker']} opens at token {entries[0]['i']}, not 0")
    # Each placed line, read back from the TLG text, against the OCR of the
    # printed line: the strongest check that the boundaries are right.
    ocr_of = {f"{c}{n}": t for c, lines in columns for n, t in lines.items()}
    sims = []
    for k, e in enumerate(entries):
        j = entries[k + 1]["i"] if k + 1 < len(entries) else len(tokens)
        ours = norm(" ".join(t["text"] for t in tokens[e["i"]:j]))
        r = difflib.SequenceMatcher(None, ours, norm(ocr_of[e["bekker"]]), autojunk=False).ratio()
        sims.append((round(r, 3), e["bekker"]))
        if r < LOW_SIM and e["bekker"] not in LINE_READS and e["bekker"] not in IMAGE_CHECKED:
            problems.append(f"{e['bekker']}: line reads {r:.2f} like the print; check the image")
        if r < 0.6:
            doubts.append(f"{e['bekker']}: line reads {r:.2f} like the print | "
                          f"{' '.join(t['text'] for t in tokens[e['i']:j])} || {ocr_of[e['bekker']]}")
    print("line similarity to print: " + "  ".join(
        f"<{q}: {sum(1 for r, _ in sims if r < q)}" for q in (0.5, 0.6, 0.7, 0.8, 0.9)))
    sizes = [(b["i"] - a["i"], a["bekker"]) for a, b in zip(entries, entries[1:])]
    for (size, ref), nxt in zip(sizes, entries[1:]):
        if nxt["bekker"][:5] != ref[:5] and size > LAST_MAX:
            problems.append(f"{ref}: a column's last line holds {size} words; a row lost?")
    for size, ref in sizes:
        if size < 3 or size > 14:
            doubts.append(f"{ref}: {size} words on the line")
    report = OCR / "report.txt"
    report.write_text("\n".join(problems + ["--"] + doubts) + "\n", encoding="utf-8")
    print(f"lines {len(entries)}  columns {len(columns)}  problems {len(problems)}  doubts {len(doubts)}")
    print(f"words per line: median {st.median(s for s, _ in sizes)}  min {min(sizes)}  max {max(sizes)}")
    for p in problems[:40]:
        print("  PROBLEM", p)
    if args.first1k:
        off, placed = first1k_check(args.first1k, entries, tokens, columns)
        if not placed:
            problems.append("first1k: no mark placed; the check examined nothing")
        for ref, ours, d in off:
            if ref not in FIRST1K_KNOWN:
                problems.append(f"first1k: Susemihl's {ref} falls in our {ours} ({d} lines)")
        for ref in set(FIRST1K_KNOWN) - {r for r, _, _ in off}:
            problems.append(f"first1k: FIRST1K_KNOWN {ref} no longer disagrees; drop it")
    if problems:
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# Bekker line map for the Magna Moralia: the TLG word (book.chapter.section.line:word,",
             "# hyphenation rejoined) that opens each line of Bekker, Aristotelis Opera II (Berlin, 1831),",
             f"# read from the scan archive.org {SCAN} by pipeline/tools/mm_bekker_lines.py.",
             "# Consumed by aristotle_pipeline/stage1_relineate.py; do not edit by hand (use LINE_READS)."]
    for e in entries:
        t = tokens[e["i"]]
        lines.append(yaml.safe_dump([{"bekker": e["bekker"], "loc": t["loc"], "w": t["w"], "at": t["text"]}],
                                    allow_unicode=True, default_flow_style=None, sort_keys=False,
                                    width=1000).strip())
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


def chapter_list(tokens, starts: list[tuple[str, int]]) -> list[dict]:
    """TLG's chapter divisions as explicit chapter entries: the Bekker line
    each chapter's first word falls on, and that word's index in the line.
    `starts` is [(bekker, token index)] in order.

    Words are counted as stage 6 counts them (stage1_chapters._norm: only
    words with letters), and a chapter opens on its first word with letters:
    TLG starts I.20 on Susemihl's lacuna stars ("* *"), which stage 6 cannot
    count to, while Bekker opens it at Ἐπεὶ on the next line (1190b9)."""
    from bisect import bisect_right
    from aristotle_pipeline.stage1_chapters import _norm
    has_letters = [bool(_norm(t["text"]).strip()) for t in tokens]
    idx = [i for _, i in starts]
    out, seen = [], set()
    for i, t in enumerate(tokens):
        key = (t["book"], t["chapter"])
        if key in seen:
            continue
        seen.add(key)
        while not has_letters[i]:
            i += 1
        j = bisect_right(idx, i) - 1
        out.append({"book": t["book"], "n": int(t["chapter"]),
                    "bekker": starts[j][0], "word": sum(has_letters[idx[j]:i])})
    return out


def _next_column(col: str) -> str:
    return col[:-1] + "b" if col.endswith("a") else f"{int(col[:-1]) + 1}a"


def first1k_check(path: Path, entries, tokens, columns) -> list[tuple[str, int]]:
    """An independent print. Susemihl (Teubner 1883) marks Bekker's lines in
    his text; First1KGreek's TEI of it carries the marks as <lb n="5"/> at
    the word where Bekker's line begins (every fifth line) and the column
    starts as margin notes. Its OCR misreads some column notes ("1188 a" for
    1183a) and drops others, so the column is carried by the line numbers,
    which restart in each column, and a margin note is taken only when it
    names the next column. Each mark is placed on the TLG text by its next
    40 letters. Susemihl's marks are not exact to the word: checked on
    Bekker's page, his 1183a5 stands at the opening of Bekker's 1183a6. So a
    mark must fall in our line of that number or one either side; one
    further off means our lines have drifted from the print. Returns those."""
    from bisect import bisect_right
    from lxml import etree
    body = etree.parse(str(path)).find(".//{*}body")
    stream, marks, skipped = [], [], []
    state = {"col": None, "n": 0, "pos": 0}

    def add(text):
        n = norm(text or "")
        stream.append(n)
        state["pos"] += len(n)

    def walk(el):
        tag = etree.QName(el).localname if isinstance(el.tag, str) else ""
        if tag == "note":
            v = re.sub(r"\s", "", el.text or "")
            if el.get("type") == "marginal" and re.fullmatch(r"\d{4}[ab]", v):
                # column notes stand beside a paragraph, not a line: they
                # set the column but are not compared
                if state["col"] is None or v == _next_column(state["col"]):
                    state.update(col=v, n=1)
        elif tag == "lb":
            n = el.get("n")
            if n and n.isdigit() and state["col"]:
                v = int(n)
                if v % 5:                                 # he marks every fifth line
                    skipped.append(f"{state['col']}:{n}")
                    return add(el.tail)
                if v <= 10 and state["n"] >= 25:          # a new column
                    state["col"] = _next_column(state["col"])
                elif not state["n"] < v <= 41:            # misread ("27" amid 10, 15)
                    skipped.append(f"{state['col']}:{n}")
                    return add(el.tail)
                state["n"] = v
                marks.append((state["col"] + n, state["pos"]))
        elif tag != "head":
            add(el.text)
            for c in el:
                walk(c)
        add(el.tail)

    for c in body:
        walk(c)
    f1k = "".join(stream)
    tlg, tstart = tlg_stream(tokens)
    # place each mark by the first 12 letters after it that occur once in
    # the TLG text: no reliance on First1K's column notes
    G = 12
    seen: dict[str, int] = {}
    for i in range(len(tlg) - G + 1):
        g = tlg[i:i + G]
        seen[g] = -1 if g in seen else i
    opens = [e["i"] for e in entries]
    line_no = {e["bekker"]: k for k, e in enumerate(entries)}
    tally: dict = {}
    off, unplaced = [], []
    for ref, p in marks:
        t = next((seen[f1k[q:q + G]] - (q - p) for q in range(p, p + 30)
                  if seen.get(f1k[q:q + G], -1) >= 0), None)
        if t is None:
            unplaced.append(ref)
            continue
        k = max(0, bisect_right(tstart, t) - 1)
        if k + 1 < len(tstart) and tstart[k + 1] - t < t - tstart[k]:
            k += 1
        at = bisect_right(opens, k) - 1
        ours = entries[at]["bekker"]
        # lines apart in the whole map, so a mark in the wrong column counts
        d = at - line_no[ref] if ref in line_no else None
        tally[d] = tally.get(d, 0) + 1
        if d is None or abs(d) > 1:
            off.append((ref, ours, d))
    print(f"first1k: {len(marks)} marks; our line minus Susemihl's: "
          + "  ".join(f"{d:+d}: {c}" for d, c in sorted((d, c) for d, c in tally.items() if d is not None))
          + f"  (not a line of ours: {tally.get(None, 0)})"
          + f"; not placed {len(unplaced)}")
    for ref, ours, d in off:
        print(f"  Susemihl {ref} falls in our {ours}" + (f" ({d:+d} lines)" if d is not None else ""))
    if skipped:
        print("  margin numbers out of sequence, skipped:", " ".join(skipped))
    placed = sum(tally.values())
    if not placed:
        print("first1k: NO MARK PLACED -- the check examined nothing")
    return off, placed


if __name__ == "__main__":
    sys.exit(main())
