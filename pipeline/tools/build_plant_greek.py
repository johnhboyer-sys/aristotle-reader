"""De Plantis: Bekker-lineated Greek from First1KGreek's text and Berlin's lines.

The Greek of De Plantis (a Byzantine retranslation from the Latin) is not in
the TLG Aristotle export. First1KGreek (tlg0086.tlg039, CC BY-SA 4.0) has the
text, transcribed from Bekker's Oxford reprint of 1837, but marks only Bekker
columns. The line numbers come from the Berlin edition itself (Aristotelis
Opera vol. 2, 1831, pp. 815-830; archive.org aristotelisopera02arisuoft,
leaves 32-47): each page is OCR'd, every text line is placed on the page's
line grid by the printed gutter numbers, and the OCR lines are aligned to
First1K's text to find where each printed line begins. Nothing is
interpolated: a line number is the printed line a word stands on.

Writes sources/plant-greek/bekker-lines.xml in the verse-mode shape of a
Diogenes export (<div type="Bekker-page" n="815a"><l n="10">...), which
manifests/Plant.yaml names as work.greek_lines.

Inputs (not in the repo; rebuild with `ocr` from archive.org page images,
https://archive.org/download/aristotelisopera02arisuoft/page/n{leaf}.jpg):
  build/plant-ocr/bekker/img/leaf{32..47}.jpg
  build/plant-ocr/bekker/ocr/leaf{32..47}.json   (from `ocr`; needs tesseract grc)

Run from pipeline/:
  uv run --with pillow --with numpy python tools/build_plant_greek.py ocr
  uv run python tools/build_plant_greek.py build      # writes the XML, prints checks
  uv run python tools/build_plant_greek.py check      # exit 1 if the XML is stale
"""
from __future__ import annotations

import argparse
import bisect
import csv
import io
import json
import re
import statistics
import subprocess
import sys
import unicodedata
from difflib import SequenceMatcher
from itertools import combinations
from pathlib import Path
from xml.sax.saxutils import escape

from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "build" / "plant-ocr" / "bekker"
TEI = ROOT / "sources" / "tlg0086.tlg039.1st1K-grc1.xml"
OUT = ROOT / "sources" / "plant-greek" / "bekker-lines.xml"
NS = {"t": "http://www.tei-c.org/ns/1.0"}
LEAF0, PAGE0, PAGE_LAST = 32, 815, 830      # leaf 32 is page 815

# First1K departures from the Berlin print, each checked on the page image.
CORRECTIONS = [
    ("Ἡ ΖΩΗ ἐν τοῖς ζῴοις", "Ἡ ζωὴ ἐν τοῖς ζῴοις",
     "815a10: First1K sets the opening in capitals; Berlin prints ζωὴ"),
    ("τινῶν δ’ οὔ Β. Τὸ δένδρον", "τινῶν δ’ οὔ. Τὸ δένδρον",
     "822a8-12: the book heading Β. is not text; Berlin prints the stop after οὔ"),
    ("Ἡ χλοάζουσα χλοάζουσα δὲ χροιὰ", "Ἡ χλοάζουσα δὲ χροιὰ",
     "827b17: First1K repeats the word; Berlin prints it once"),
]

# Printed lines the OCR lost, read off the page image.
PRINT_READS = {
    ("829b", 18): "τὰ ὄντα ἐν γῇ εὐκράτῳ ἐπισπεύδουσι τὴν πεπειρότητα πρὸ",
}

# Where each page's Bekker lines run, beyond the plain 1..N grid:
#   815: a translator's prologue in small type fills lines 1-9; the work opens at 10.
#   822a: book I ends at line 8; the heading Β. stands on 9-11; book II opens at 12.
#   830: the work ends at line 4 of each column; De Mirabilibus follows.
FIRST_LINE = {815: 10}
LAST_LINE = {830: 4}
HEADING_GAP = {"822a": (8, 12)}     # last line before, first line after


# ---------------------------------------------------------------- OCR stage

def _tsv(crop, lang, psm, extra=()):
    from PIL import Image  # noqa: F401  (crop is a PIL image)
    buf = io.BytesIO()
    crop.save(buf, format="PNG")
    r = subprocess.run(["tesseract", "stdin", "stdout", "-l", lang, "--psm", str(psm), *extra, "tsv"],
                       input=buf.getvalue(), capture_output=True, check=True)
    rows = list(csv.DictReader(io.StringIO(r.stdout.decode()), delimiter="\t", quoting=csv.QUOTE_NONE))
    lines: dict[tuple, list] = {}
    for row in rows:
        if row["level"] == "5" and row["text"].strip():
            lines.setdefault((row["block_num"], row["par_num"], row["line_num"]), []).append(row)
    out = []
    for ws in lines.values():
        top = min(int(x["top"]) for x in ws)
        bot = max(int(x["top"]) + int(x["height"]) for x in ws)
        out.append({"y": (top + bot) / 2, "x": int(ws[0]["left"]), "text": " ".join(x["text"] for x in ws)})
    return out


def ocr_page(src: Path, out: Path) -> None:
    import numpy as np
    from PIL import Image
    img = Image.open(src).convert("L")
    a = np.array(img) < 128
    h, w = a.shape
    prof = a[int(h * .08):int(h * .75)].sum(0)
    win = 60
    best = min(range(int(w * .4), int(w * .6) - win), key=lambda x: prof[x:x + win].sum())
    g0, g1 = int(best - 10), int(best + win + 10)
    ink = np.where(prof > 200)[0]
    x0, x1 = int(max(ink[0] - 10, 0)), int(min(ink[-1] + 10, w))
    # gutter numbers: ink blobs in the gutter strip, each read on its own
    gs = a[:, g0 + 12:g1 - 12]
    rowink = gs.sum(1) > 0
    nums, y = [], 0
    while y < h:
        if rowink[y]:
            y0 = y
            while y < h and rowink[y]:
                y += 1
            if y - y0 > 15 and h * 0.06 <= y0 <= h * 0.83:
                cs = np.where(gs[y0:y].sum(0) > 0)[0]
                crop = img.crop((g0 + 12 + int(cs[0]) - 8, y0 - 8, g0 + 12 + int(cs[-1]) + 8, y + 8))
                crop = crop.resize((crop.width * 3, crop.height * 3))
                buf = io.BytesIO()
                crop.save(buf, format="PNG")
                r = subprocess.run(["tesseract", "stdin", "stdout", "--psm", "7", "-c",
                                    "tessedit_char_whitelist=0123456789"],
                                   input=buf.getvalue(), capture_output=True)
                nums.append({"read": r.stdout.decode().strip(), "y": (y0 + y) / 2})
        y += 1
    cols = {}
    for side, (c0, c1) in (("a", (x0, g0 + 15)), ("b", (g1 - 15, x1))):
        cols[side] = _tsv(img.crop((c0, 0, c1, h)), "grc", 4)
    out.write_text(json.dumps({"src": src.name, "w": w, "h": h, "gutter": [g0, g1], "extent": [x0, x1],
                               "numbers": nums, "cols": cols}, ensure_ascii=False), encoding="utf-8")


# ------------------------------------------------------------ line numbering

def _low(s: str) -> int:
    return sum(1 for ch in unicodedata.normalize("NFD", s) if "α" <= ch <= "ω" or ch in "ϛȣ")


def _greek_letters(s: str) -> int:
    return sum(1 for ch in unicodedata.normalize("NFD", s)
               if "Ͱ" <= ch <= "Ͽ" or "ἀ" <= ch <= "῿")


def _grid(nums):
    """y = a + b*n through the gutter reads that agree (pairwise consensus)."""
    pts = [(int(x["read"]), x["y"]) for x in nums
           if re.fullmatch(r"\d{1,2}", x["read"]) and int(x["read"]) % 5 == 0 and int(x["read"]) > 0]
    best = None
    for (n1, y1), (n2, y2) in combinations(pts, 2):
        if n1 == n2:
            continue
        b = (y2 - y1) / (n2 - n1)
        if not 60 < b < 90:
            continue
        a = y1 - b * n1
        inl = [(n, y) for n, y in pts if abs(a + b * n - y) < 12]
        if best is None or len(inl) > len(best[2]):
            best = (a, b, inl)
    if best is None or len(best[2]) < 3:
        raise ValueError("fewer than three gutter numbers agree")
    _, _, inl = best
    k = len(inl)
    sn, sy = sum(n for n, _ in inl), sum(y for _, y in inl)
    snn, sny = sum(n * n for n, _ in inl), sum(n * y for n, y in inl)
    b = (k * sny - sn * sy) / (k * snn - sn * sn)
    return (sy - b * sn) / k, b, sorted(n for n, _ in inl)


def page_lines(page: int, d: dict) -> dict[str, list[dict]]:
    """{column: [{n, y, ocr}]} for one Berlin page, body text only."""
    a0, b, used = _grid(d["numbers"])
    out = {}
    for side in "ab":
        ls = [dict(l) for l in d["cols"][side] if _greek_letters(l["text"]) >= 3 and _low(l["text"]) >= 4]
        # per-column offset: the scan is slightly skewed, so a column's lines
        # can sit a fraction of a line off the gutter's grid
        a = a0
        for _ in range(3):
            res = [l["y"] - b * round((l["y"] - a) / b) for l in ls
                   if _low(l["text"]) >= 15 and (page != 830 or l["y"] < d["h"] * 0.25)]
            a = statistics.median(res)
        for l in ls:
            l["n"] = round((l["y"] - a) / b)
        by: dict[int, list] = {}
        for l in ls:
            by.setdefault(l["n"], []).append(l)
        sel = sorted((max(v, key=lambda l: _low(l["text"])) for v in by.values()), key=lambda l: l["y"])
        body = []
        for l in sel:   # footnotes: after the first gap of more than 1.6 lines
            if body and l["y"] - body[-1]["y"] > 1.6 * b and (body[-1]["n"] >= 30 or page == 830) \
                    and not (page == 822 and side == "a" and body[-1]["n"] < 12):
                break
            body.append(l)
        if page in LAST_LINE:      # the grid belongs to De Mirabilibus below
            body = [dict(l, n=i + 1) for i, l in enumerate(body[:LAST_LINE[page]])]
        body = [l for l in body if FIRST_LINE.get(page, 1) <= l["n"]]
        out[f"{page}{side}"] = [{"n": l["n"], "y": l["y"], "ocr": l["text"]} for l in body]
    return out


# ------------------------------------------------------------------- align

def _norm(s: str) -> tuple[str, list[int]]:
    s = s.replace("ϛ", "στ").replace("ȣ", "ου")
    out, idx = [], []
    for i, ch in enumerate(s):
        d = unicodedata.normalize("NFD", ch)
        base = d[0].lower() if d else ""
        base = "σ" if base == "ς" else base
        if "α" <= base <= "ω":
            out.append(base)
            idx.append(i)
    return "".join(out), idx


def reference() -> tuple[str, list]:
    """First1K's text of books I-II (prologue dropped), corrected, plus
    its Bekker column milestones as (column, offset)."""
    tei = etree.parse(str(TEI))
    parts, ms = [], []
    pos = 0

    def walk(el):
        nonlocal pos
        if etree.QName(el).localname == "milestone" and el.get("unit") == "page":
            ms.append((el.get("n"), pos))
        if el.text:
            parts.append(el.text)
            pos += len(el.text)
        for c in el:
            walk(c)
            if c.tail:
                parts.append(c.tail)
                pos += len(c.tail)

    for part in tei.iterfind(".//t:div[@subtype='part']", NS):
        if part.get("n") != "prol":
            walk(part)
            parts.append(" ")
            pos += 1
    ref = "".join(parts)
    for old, new, why in CORRECTIONS:
        if ref.count(old) != 1:
            raise ValueError(f"correction not found exactly once: {why}")
        at = ref.index(old)
        shift = len(new) - len(old)
        ref = ref.replace(old, new)
        ms = [(c, p + shift if p > at else p) for c, p in ms]
    return ref, ms


def _word_start(ref: str, p: int, forward: bool = False) -> int:
    if forward:
        while p < len(ref) and not ref[p].isspace():
            p += 1
        while p < len(ref) and ref[p].isspace():
            p += 1
        return p
    while p > 0 and not ref[p - 1].isspace():
        p -= 1
    return p


def align(lines: list[dict], ref: str) -> list[dict]:
    rn, rmap = _norm(ref)
    starts_n, parts, cur = [], [], 0
    for l in lines:
        t, _ = _norm(l["ocr"])
        starts_n.append(cur)
        parts.append(t)
        cur += len(t)
    on = "".join(parts)
    blocks, ia, jb, step = [], 0, 0, 3000
    while ia < len(on):
        a_seg = on[ia:ia + step]
        off = max(jb - 300, 0)
        sm = SequenceMatcher(None, a_seg, rn[off:jb + int(step * 1.25) + 300], autojunk=False)
        bl = [(x.a + ia, x.b + off, x.size) for x in sm.get_matching_blocks() if x.size >= 3]
        last_seg = ia + step >= len(on)
        lim = len(on) if last_seg else ia + int(len(a_seg) * 0.85)
        bl = [x for x in bl if x[0] < lim]
        if not bl:
            raise ValueError(f"no match near OCR letter {ia}")
        blocks += bl
        ia, jb = bl[-1][0] + bl[-1][2], bl[-1][1] + bl[-1][2]
        if last_seg:
            break
    mono, lastb = [], -1
    for a, b, s in sorted(blocks):
        if b > lastb:
            mono.append((a, b, s))
            lastb = b + s - 1
    mono_a = [m[0] for m in mono]

    def map_a(i):
        k = bisect.bisect_right(mono_a, i) - 1
        if k >= 0 and i < mono[k][0] + mono[k][2]:
            return mono[k][1] + (i - mono[k][0])
        k += 1
        if k < len(mono):
            return mono[k][1] - (mono[k][0] - i)
        return len(rn) - 1

    starts = []
    for k, l in enumerate(lines):
        p = rmap[max(0, min(map_a(starts_n[k]), len(rmap) - 1))]
        ws = _word_start(ref, p)
        wf = _word_start(ref, p, forward=True) if ws < p else p
        cand = ws if (p - ws) <= len(re.sub(r"\s", "", ref[p:wf])) else wf
        # (a column-a line can end with the gutter number printed beside it)
        prev_hyph = k > 0 and re.sub(r"\s*\d{1,2}\W*$", "", lines[k - 1]["ocr"].rstrip()).endswith(("-", "—", "‐", ":", "~", "="))
        if prev_hyph and ws < p and cand == ws:
            # The line opens with the tail of a word hyphenated across the
            # break: the word stays whole on the earlier line (the TLG export's
            # convention), if the reference word really ends with that tail.
            toks = l["ocr"].split()
            tok = _norm(toks[0])[0] if toks else ""
            wend = ws
            while wend < len(ref) and not ref[wend].isspace():
                wend += 1
            word = _norm(ref[ws:wend])[0]
            if tok and len(word) > len(tok) and SequenceMatcher(None, word[-len(tok):], tok).ratio() >= 0.6:
                cand = wf
                l["hyph_tail"] = True
        if prev_hyph and not l.get("hyph_tail"):
            # The same case when the tail is misread (μοῦ as μὲ) and the
            # alignment lands on the word's start: the word at cand opens with
            # the head printed before the hyphen, so it belongs to that line.
            head_toks = re.sub(r"\s*\d{1,2}\W*$", "", lines[k - 1]["ocr"].rstrip()).split()
            head = _norm(head_toks[-1])[0] if head_toks else ""
            wend = cand
            while wend < len(ref) and not ref[wend].isspace():
                wend += 1
            word = _norm(ref[cand:wend])[0]
            toks = l["ocr"].split()
            tok = _norm(toks[0])[0] if toks else ""
            head_r = SequenceMatcher(None, word[:len(head)], head).ratio()
            tail_r = SequenceMatcher(None, word[-len(tok):], tok).ratio() if tok else 0
            # ...unless the word before cand already answers to the head (the
            # hyphenated word is whole on the earlier line, and a stop read
            # as ":" is no hyphen at all).
            before = _norm(ref[_word_start(ref, cand - 1):cand])[0] if cand > 0 else ""
            done = SequenceMatcher(None, before[:len(head)], head).ratio() >= 0.6
            if len(head) >= 2 and len(word) > len(head) and not done \
                    and (head_r >= 0.6 or (head_r >= 0.5 and tail_r >= 0.5)):
                cand = _word_start(ref, cand, forward=True)
                l["hyph_tail"] = True
        elif not prev_hyph:
            # The OCR's opening words against the reference words starting at
            # cand and one word earlier: an unreadable first word (Οὐ read as
            # ὁ) must not slide onto the previous line.
            toks = l["ocr"].split()
            tok = _norm(toks[0])[0] if toks else ""
            back = _word_start(ref, cand - 1) if cand > 0 else cand

            def first_word(at):
                e = at
                while e < len(ref) and not ref[e].isspace():
                    e += 1
                return _norm(ref[at:e])[0]
            sb = SequenceMatcher(None, tok, first_word(back)).ratio()
            sc = SequenceMatcher(None, tok, first_word(cand)).ratio()
            if tok and back < cand and sb >= 0.5 and sb > sc + 0.3:
                cand = back
                l["moved_back"] = True
        if k == 0:
            cand = len(ref) - len(ref.lstrip())
        starts.append(cand)
    for k in range(1, len(starts) - 1):   # a line holding only a hyphen tail keeps the word
        if starts[k] >= starts[k + 1] and lines[k].get("hyph_tail"):
            starts[k] = _word_start(ref, starts[k] - 1)
    bad = [f"{lines[k]['col']}{lines[k]['n']}" for k in range(len(starts) - 1) if starts[k] >= starts[k + 1]]
    if bad:
        raise ValueError(f"line starts out of order at {bad}")
    for k, l in enumerate(lines):
        end = starts[k + 1] if k + 1 < len(lines) else len(ref)
        l["text"] = re.sub(r"\s+", " ", ref[starts[k]:end]).strip()
        l["ref_start"] = starts[k]
        l["ratio"] = round(SequenceMatcher(None, _norm(l["text"])[0], _norm(l["ocr"])[0],
                                           autojunk=False).ratio(), 3)
    return lines


def all_lines() -> list[dict]:
    lines = []
    for page in range(PAGE0, PAGE_LAST + 1):
        d = json.loads((OCR / "ocr" / f"leaf{page - PAGE0 + LEAF0}.json").read_text(encoding="utf-8"))
        for col, ls in page_lines(page, d).items():
            for l in ls:
                lines.append({"col": col, "n": l["n"], "ocr": l["ocr"]})
            for (c, n), txt in PRINT_READS.items():
                if c == col:
                    if any(x["col"] == col and x["n"] == n for x in lines):
                        raise ValueError(f"PRINT_READS {c}{n}: the OCR has this line now")
                    k = max(i for i, x in enumerate(lines) if x["col"] == col and x["n"] < n)
                    lines.insert(k + 1, {"col": col, "n": n, "ocr": txt, "print_read": True})
    return lines


def checks(lines: list[dict], ms: list) -> list[str]:
    """Problems that must be zero before the XML is written."""
    probs = []
    cols: dict[str, list[int]] = {}
    for l in lines:
        cols.setdefault(l["col"], []).append(l["n"])
    for col, ns in cols.items():
        want = list(range(ns[0], ns[-1] + 1))
        if col in HEADING_GAP:
            lo, hi = HEADING_GAP[col]
            want = [n for n in want if n <= lo or n >= hi]
        if ns != want:
            probs.append(f"{col}: lines {ns[0]}-{ns[-1]} not consecutive (missing "
                         f"{sorted(set(want) - set(ns))}, repeated {sorted({n for n in ns if ns.count(n) > 1})})")
    for l in lines:
        if not l["text"]:
            probs.append(f"{l['col']}{l['n']}: empty")
    # Berlin's line 1 of each column against First1K's column milestone: two
    # printed sources, read independently, must put the column break at the
    # same word.
    first = {}
    for l in lines:
        first.setdefault(l["col"], l["ref_start"])
    marks: dict[str, list[int]] = {}
    for c, p in ms:
        marks.setdefault(c, []).append(p)
    ref_cache = reference()[0]
    for col, p in first.items():
        if col not in marks:
            probs.append(f"{col}: no First1K milestone")
            continue
        q = min(marks[col], key=lambda x: abs(x - p))
        if ref_cache[min(p, q):max(p, q)].split():
            probs.append(f"{col}: Berlin line 1 and First1K's milestone differ: "
                         f"{ref_cache[min(p, q):max(p, q)]!r}")
    return probs


def emit(lines: list[dict]) -> str:
    head = ("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            "<!-- De Plantis (Bekker 815a10-830b4), Bekker-lineated. Generated by "
            "pipeline/tools/build_plant_greek.py; do not edit by hand.\n"
            "     Text: Open Greek and Latin, First1KGreek tlg0086.tlg039.1st1K-grc1 (Bekker,\n"
            "     Oxford 1837), CC BY-SA 4.0, with the corrections listed in the tool.\n"
            "     Line numbers: the printed lines of I. Bekker, Aristotelis Opera vol. 2\n"
            "     (Berlin 1831), pp. 815-830. This file is likewise CC BY-SA 4.0. -->\n"
            "<TEI xmlns=\"http://www.tei-c.org/ns/1.0\"><text><body>\n")
    out, col = [head], None
    for l in lines:
        if l["col"] != col:
            if col:
                out.append("</div>\n")
            col = l["col"]
            out.append(f"<div type=\"Bekker-page\" n=\"{col}\">\n")
        out.append(f"<l n=\"{l['n']}\">{escape(l['text'])}</l>\n")
    out.append("</div>\n</body></text></TEI>\n")
    return "".join(out)


def build() -> tuple[str, list[dict], list[str]]:
    ref, ms = reference()
    lines = align(all_lines(), ref)
    return emit(lines), lines, checks(lines, ms)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["ocr", "build", "check"])
    args = ap.parse_args(argv)
    if args.cmd == "ocr":
        for leaf in range(LEAF0, LEAF0 + PAGE_LAST - PAGE0 + 1):
            ocr_page(OCR / "img" / f"leaf{leaf}.jpg", OCR / "ocr" / f"leaf{leaf}.json")
            print("leaf", leaf)
        return 0
    xml, lines, probs = build()
    for p in probs:
        print("PROBLEM", p)
    low = [l for l in lines if l["ratio"] < 0.6]
    for l in low:
        print(f"  low match {l['col']}{l['n']} {l['ratio']}: {l['text'][:50]} || {l['ocr'][:50]}")
    print(f"{len(lines)} lines in {len({l['col'] for l in lines})} columns; "
          f"{len(PRINT_READS)} read off the image; {len(CORRECTIONS)} corrections")
    if probs:
        return 1
    if args.cmd == "check":
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != xml:
            print(f"{OUT} is stale: run build")
            return 1
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(xml, encoding="utf-8")
    print("wrote", OUT.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
