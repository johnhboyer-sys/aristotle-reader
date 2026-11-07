"""Build sources/spir-dobson/ from the archive.org OCR of J. F. Dobson's De Spiritu.

Dobson's translation was printed as a separate Oxford fascicle in 1914 and bound,
from the same sheets, into The Works of Aristotle vol. III (Oxford, 1931). The scan
used here is the University of Toronto's copy of vol. III, whose De Spiritu title
page still reads "Oxford, at the Clarendon Press, 1914" (archive.org
worksofaristotle03arisuoft, leaves 452-468).

Reads (never committed; fetch into build/spir-ocr/):
  T_hocr_part.html   bytes 26251251-27479811 of worksofaristotle03arisuoft_hocr.html
                     (leaves 444-471; the offsets come from its _hocr_pageindex.json.gz):
      curl -L -r 26251251-27479811 -o build/spir-ocr/T_hocr_part.html \\
        https://archive.org/download/worksofaristotle03arisuoft/worksofaristotle03arisuoft_hocr.html
  build/dist/Spir/chapters.json   where each Jaeger chapter opens in the Greek (for a
                     check only: the chapter count must be nine)

Writes (under sources/spir-dobson/):
  book-01.html     `Part N` per Dobson chapter (= Jaeger's chapters 1-9), one <p>
                   per printed paragraph (from the first-line indents)
  anchors.yaml     Bekker ticks read from Dobson's PRINTED margins
  footnotes.json   Dobson's footnotes, numbered 1..N through the work; the prose
                   carries a [^N] marker where he prints each figure

Notes (committed): pipeline/tools/spir_dobson_notes.json, {"leaf.n": html}, each of
Dobson's footnotes as printed on that leaf, transcribed from the page images by two
readers and settled where they differed.

Check the result with verify_spir_dobson.py, which reads a second scan and shares
none of this code.

How it works
  1. hOCR words -> lines. Per page the body column is fitted from the full lines;
     a word wholly outside it is a margin item (a line number, a column mark such
     as 481b, or a chapter number). The running head is the line above the first
     body line; footnotes are the smaller-type lines below a gap after the body.
  2. READS: each OCR error and each footnote mark in the body, settled from the
     page image, as (leaf, OCR text, printed text). Each must occur exactly once
     on its leaf, or the build stops: a re-fetched or shifted OCR cannot be
     silently half-fixed.
  3. Line-end hyphens are rejoined; a hyphen Dobson printed stays when the pair is
     listed in KEEP_HYPHEN. Every join is printed for review.
  4. MARGIN: the margin numbers as printed, per leaf, settled from the image
     where the OCR misread or lost them. A tick's `at` is the first words of the
     printed line it stands beside.

The tool needs only the standard library. Run from the repo root:
  python3 pipeline/tools/build_spir_dobson.py          # write the sources
  python3 pipeline/tools/build_spir_dobson.py --dump   # print the classified pages
"""
from __future__ import annotations

import argparse
import html
import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "build" / "spir-ocr" / "T_hocr_part.html"
OUT = ROOT / "sources" / "spir-dobson"
NOTES = Path(__file__).with_name("spir_dobson_notes.json")
# The notes file is as printed; these misprints in the notes are corrected at
# build, as READS corrects the text: (note, printed, corrected).
NOTE_FIXES: list[tuple[str, str, str]] = [
    ("463.2", "<em>de Caelo</em>, 239<sup>b</sup> 30", "<em>de Caelo</em>, 293<sup>b</sup> 30"),  # Tim. 40 B is quoted at 293b30-32
]
MARK = re.compile(r"\[\^(\d+\.\d+)\]")
# Figures printed twice for one note; every other note's figure is printed once.
TWICE = {"454.5": "lungs that / lungs cannot", "461.1": "opens and closes a bracketed passage"}
LEAVES = range(452, 469)

# ---------------------------------------------------------------------------
# Settled readings. (leaf, OCR text, printed text). Filled in from the images.
# A footnote mark (printed as a superscript figure; OCR'd as ! ? ’ ” ‘ ® * ° | or
# a stray digit or Greek letter) becomes [^leaf.n], n the figure as printed; the
# build numbers them through the work. "misprint" marks the four places where we
# correct the 1914 printing.
READS: list[tuple[int, str, str]] = [
    (452, "Wuat", "What"),                  # small capitals WHAT
    (452, "nutriment! is", "nutriment[^452.1] is"),
    (452, "re-\nceptacle.”", "re-\nceptacle.[^452.2]"),
    (452, "air® draws", "air[^452.3] draws"),
    (452, "nutrition.*", "nutrition.[^452.4]"),
    (453, "out! and", "out[^453.1] and"),
    (453, "if? there", "if[^453.2] there"),
    (453, "inhalation.’", "inhalation.[^453.3]"),
    (453, "wind-pipe.*", "wind-pipe.[^453.4]"),
    (453, "difficulty ; ὅ", "difficulty ;[^453.5]"),
    (453, "size.°", "size.[^453.6]"),
    (453, "and‘ the", "and[^453.7] the"),
    (454, "1 However", "[^454.1]However"),
    (454, "breath ? is", "breath[^454.2] is"),
    (454, "breath.°", "breath.[^454.3]"),
    (454, "cause.*", "cause.[^454.4]"),
    (454, "lungs® that", "lungs[^454.5] that"),
    (454, "lungs® cannot", "lungs[^454.5] cannot"),
    (455, "| But", "[^455.1]But"),
    (455, "untenable,”", "untenable,[^455.2]"),
    (455, "excretions;*", "excretions;[^455.3]"),
    (455, "animals.*", "animals.[^455.4]"),
    (455, "asking,®", "asking,[^455.5]"),
    (455, "respiration.®", "respiration.[^455.6]"),
    (456, "also! it", "also[^456.1] it"),
    (456, "ne need", "no need"),
    (456, "refrigeration: but", "refrigeration:[^456.2] but"),   # the OCR lost the figure
    (456, "case.°", "case.[^456.3]"),
    (457, "And!", "And[^457.1]"),
    (457, "rate? strange", "rate[^457.2] strange"),
    (457, "appears 5 that", "appears[^457.3] that"),
    (457, "tc the", "to the"),              # misprint: the page reads "tc"
    (457, "nourishment. This", "nourishment.[^457.4] This"),   # the OCR lost the figure
    (458, "equable!", "equable[^458.1]"),
    (458, "gently,? the", "gently,[^458.2] the"),
    (458, "regularity.’", "regularity.[^458.3]"),
    (458, "and,* as", "and,[^458.4] as"),
    (459, "a.\npotentiality", "a\npotentiality"),   # misprint: a stray full stop after "a"
    (459, "erows", "grows"),
    (459, "it,! and", "it,[^459.1] and"),
    (459, "which | has", "which has"),    # a speck, not a figure
    (460, "creatures,! where", "creatures,[^460.1] where"),
    (460, "helped? by", "helped[^460.2] by"),
    (460, "and®", "and[^460.3]"),
    (460, "which * resides", "which[^460.4] resides"),
    (461, "[! For", "[[^461.1]For"),
    (461, 'passage."]', "passage.[^461.1]]"),
    (461, "“ΤῈ is", "[^461.2]It is"),
    (461, "sideways ® from", "sideways[^461.3] from"),
    (461, "side.*", "side.[^461.4]"),
    (461, "meeting-place® between", "meeting-place[^461.5] between"),
    (461, "it ;°", "it ;[^461.6]"),
    (462, "air-duct.!", "air-duct.[^462.1]"),
    (462, "Isits", "Is its"),
    (462, "emission??", "emission?[^462.2]"),
    (462, "fluid;*?", "fluid;[^462.3]"),
    (462, "those* leading", "those[^462.4] leading"),
    (462, "take place Ὁ", "take place?[^462.5]"),
    (462, "connexions?®", "connexions?[^462.6]"),
    (463, "other!’ animals", "other[^463.1] animals"),
    (463, "verse.”", "verse.[^463.2]"),
    (464, "it.!", "it.[^464.1]"),
    (464, "joining ?and", "joining[^464.2] and"),
    (464, "radii? which", "radii[^464.3] which"),
    (464, "way* are", "way[^464.4] are"),
    (464, "so-—thus", "so—thus"),
    (465, "bending,!", "bending,[^465.1]"),
    (465, "present*;", "present[^465.2];"),
    (465, "for® (performing it well.)", "for[^465.3] ⟨performing it well.⟩"),   # Jaeger's supplement, in angle brackets
    (465, "feet,‘ for", "feet,[^465.4] for"),
    (465, "they Ὁ", "they"),                # a speck, not a figure
    (465, "reason.®", "reason.[^465.5]"),
    (466, "universally! the", "universally[^466.1] the"),
    (466, "80 we must", "so we must"),
    (467, "operates ' in", "operates[^467.1] in"),
    (467, "both ἢ", "both?"),
    (467, "ox,? this", "ox,[^467.2] this"),
    (467, "secking", "seeking"),
    (467, "scase—as", "case—as"),           # "s" is the margin's 25
    (467, "Empedocles® stated", "Empedocles[^467.3] stated"),
    (467, "and_ softness", "and softness"),
    (467, "Similarly * with", "Similarly[^467.4] with"),
]

# Line-end hyphens Dobson printed (the word keeps its hyphen when rejoined).
KEEP_HYPHEN: set[str] = {"airduct", "airducts", "startingpoint"}

# Dobson's margin numbers, read from the page images, as {leaf: [(body row,
# Bekker line)]}. Numbers in his margin count Bekker's Greek lines (481b5 on
# leaf 454 stands beside "However", the line his note on 453 calls 481b 5-8).
# A column mark (481b) is that column's line 1. Three columns open at the top of
# a page and have no mark: the running head names the column of a page's first
# line, and the page before carries no mark for it (482b1, 483b1, 485a1; Dobson's
# own note on leaf 460 also cites "483b 1" for that line).
MARGIN: dict[int, list[tuple[int, str]]] = {
    452: [(0, "481a1"), (6, "481a5"), (15, "481a10"), (24, "481a15")],
    453: [(4, "481a20"), (15, "481a25"), (21, "481a30"), (22, "481b1")],
    454: [(0, "481b5"), (8, "481b10"), (17, "481b15"), (25, "481b20")],
    455: [(0, "481b25"), (7, "481b30"), (9, "482a1"), (14, "482a5"), (25, "482a10"), (33, "482a15")],
    456: [(9, "482a20"), (17, "482a25"), (23, "482a30"), (32, "482a35")],
    457: [(0, "482b1"), (7, "482b5"), (17, "482b10"), (24, "482b15"), (30, "482b20")],
    458: [(2, "482b25"), (10, "482b30"), (17, "482b35"), (21, "483a1"), (26, "483a5"), (32, "483a10")],
    459: [(7, "483a15"), (13, "483a20"), (20, "483a25"), (28, "483a30"), (35, "483a35")],
    460: [(0, "483b1"), (7, "483b5"), (15, "483b10"), (23, "483b15"), (28, "483b20")],
    461: [(6, "483b25"), (10, "483b30"), (16, "483b35"), (18, "484a1"), (23, "484a5"), (30, "484a10")],
    462: [(3, "484a15"), (12, "484a20"), (19, "484a25"), (27, "484a30")],
    463: [(3, "484a35"), (9, "484b1"), (14, "484b5"), (21, "484b10"), (30, "484b15")],
    464: [(7, "484b20"), (15, "484b25"), (21, "484b30"), (29, "484b35")],
    465: [(0, "485a1"), (6, "485a5"), (13, "485a10"), (21, "485a15"), (29, "485a20")],
    466: [(4, "485a25"), (11, "485a30"), (18, "485a35"), (19, "485b1"), (26, "485b5"), (35, "485b10")],
    467: [(7, "485b15"), (14, "485b20"), (23, "485b25"), (32, "485b30")],
    468: [(3, "485b35"), (5, "486a1"), (10, "486b1")],
}
FROM_HEAD = {"482b1", "483b1", "485a1"}   # see above

# Chapter openings: (n, leaf, body row) where Dobson's chapter n begins (the
# bold number in the outer margin).
CHAPTERS: list[tuple[int, int, int]] = [
    (1, 452, 0), (2, 453, 19), (3, 456, 21), (4, 457, 23), (5, 459, 11),
    (6, 462, 2), (7, 463, 20), (8, 465, 4), (9, 466, 8),
]

# Paragraph openings the indent test misses, and indents that are not one.
PARA_BREAKS: list[tuple[int, int]] = []
NOT_PARA: list[tuple[int, int]] = []


# ---------------------------------------------------------------------------
def parse(path: Path) -> dict[int, list[dict]]:
    """{leaf: [line, ...]} with each line {bbox, xs, words: [(x0,y0,x1,y1,text)]}."""
    h = path.read_text(encoding="utf-8")
    pages: dict[int, list[dict]] = {}
    for chunk in h.split('<div class="ocr_page"')[1:]:
        leaf = int(re.match(r'\s*id="page_(\d+)"', chunk).group(1))
        lines = []
        for lc in chunk.split('<span class="ocr_line"')[1:]:
            m = re.match(r'[^>]*title="bbox (\d+) (\d+) (\d+) (\d+);[^"]*?x_size ([\d.]+)', lc)
            words = [(int(a), int(b), int(c), int(d), html.unescape(t).strip())
                     for a, b, c, d, t in re.findall(
                         r'class="ocrx_word"[^>]*?title="bbox (\d+) (\d+) (\d+) (\d+);[^"]*"[^>]*>([^<]*)</span>', lc)]
            words = [w for w in words if w[4]]
            if m and words:
                lines.append({"bbox": tuple(map(int, m.group(1, 2, 3, 4))),
                              "xs": float(m.group(5)), "words": words})
        # every word on the page must have landed in a line: a span this parse
        # does not expect (a caption, a word tagged with a language) once lost
        # two paragraphs without a sound
        raw = sum(1 for t in re.findall(r'class="ocrx_word"[^>]*>([^<]*)<', chunk) if html.unescape(t).strip())
        got = sum(len(ln["words"]) for ln in lines)
        if leaf in LEAVES and raw != got:
            raise SystemExit(f"leaf {leaf}: parsed {got} of {raw} OCR words")
        pages[leaf] = lines
    return pages


def merge_rows(lines: list[dict]) -> list[dict]:
    """Printed lines from the page's words. hOCR splits one printed line into
    several ocr_line spans (a margin number, the body) and once packs two printed
    lines into one span (leaf 467), so rows are rebuilt from each word's own
    bottom edge: a word more than 50px below the row's first word opens a new
    row. The line pitch is ~89px; a descender drops a bottom ~18px below the
    baseline and a raised note mark lifts it ~25px above, so one printed line
    spans at most ~43px. (Tops do not work: a full stop's top sits low.)"""
    words = sorted((w[3], w[0], w, ln["xs"]) for ln in lines for w in ln["words"])
    rows: list[dict] = []
    for y0, _, w, xs in words:
        if rows and y0 - rows[-1]["top"] < 50:
            r = rows[-1]
            r["words"].append(w)
            r["xs"] = max(r["xs"], xs)
        else:
            rows.append({"top": y0, "xs": xs, "words": [w]})
    for r in rows:
        r["words"].sort()
        r["cy"] = statistics.median((w[1] + w[3]) / 2 for w in r["words"])
    return rows


def classify(rows: list[dict]) -> dict:
    """Split a page's rows into head, body, notes; body words into text and margin."""
    full = [r for r in rows if len(r["words"]) >= 6 and r["xs"] >= 60]
    lefts = sorted(min(w[0] for w in r["words"] if True) for r in full)
    rights = sorted(max(w[2] for w in r["words"]) for r in full)
    # The body's left edge: the commonest left among full rows (indented rows sit
    # ~75px in); margin numbers sit well outside it.
    left = statistics.median(lefts[: max(1, len(lefts) * 2 // 3)])
    right = statistics.median(rights)
    first_body = next(i for i, r in enumerate(rows) if r in full)
    head = rows[:first_body]
    body, notes = [], []
    pitch = statistics.median(b["cy"] - a["cy"] for a, b in zip(full, full[1:]))
    xs_body = statistics.median(r["xs"] for r in full)
    in_notes = False
    prev = None
    for r in rows[first_body:]:
        if not in_notes and prev is not None and r["cy"] - prev["cy"] > 1.2 * pitch \
                and r["xs"] < 0.9 * xs_body:
            in_notes = True
        if in_notes:
            notes.append(r)
            continue
        # Margin items stand clear of the fitted column (measured: every
        # number on these leaves sits 4px or more outside it, no body word does).
        # A number that starts 20px or more left of the column is a margin
        # number even when its right edge touches the column (leaf 455, "25").
        text = [w for w in r["words"] if not (w[2] < left - 3 or w[0] > right + 3
                or (w[0] < left - 20 and re.fullmatch(r"\d+[ab*°”\"]?", w[4])))]
        margin = [w for w in r["words"] if w not in text]
        if text or margin:
            body.append({"cy": r["cy"], "words": text, "margin": margin,
                         "indent": bool(text) and text[0][0] > left + 40})
        prev = r
    return {"head": head, "body": body, "notes": notes, "left": left, "right": right}


def body_rows(pages: dict[int, list[dict]]) -> list[dict]:
    """Every body row in reading order: {leaf, i, text, indent, margin}."""
    out = []
    for leaf in LEAVES:
        p = classify(merge_rows(pages[leaf]))
        for i, r in enumerate(p["body"]):
            out.append({"leaf": leaf, "i": i, "indent": r["indent"],
                        "text": " ".join(w[4] for w in r["words"]),
                        "margin": " ".join(w[4] for w in r["margin"])})
    return out


def apply_reads(rows: list[dict]) -> list[dict]:
    """Apply READS per leaf. Each OCR text must occur exactly once on its leaf;
    rows are joined with newlines so a reading may cross a line end."""
    by_leaf: dict[int, list[dict]] = {}
    for r in rows:
        by_leaf.setdefault(r["leaf"], []).append(r)
    bad = []
    for leaf, old, new in READS:
        page = "\n".join(r["text"] for r in by_leaf[leaf])
        n = page.count(old)
        if n != 1:
            bad.append(f"leaf {leaf}: {old!r} occurs {n} times")
            continue
        page = page.replace(old, new)
        lines = page.split("\n")
        if len(lines) != len(by_leaf[leaf]):
            bad.append(f"leaf {leaf}: {old!r} -> {new!r} changes the line count")
            continue
        for r, t in zip(by_leaf[leaf], lines):
            r["text"] = t
    if bad:
        raise SystemExit("READS do not apply:\n  " + "\n  ".join(bad))
    return rows


def assemble(rows: list[dict]) -> tuple[list[list[list[str]]], dict, list[str]]:
    """Rows -> chapters of paragraphs of words, and for each printed row the
    place (chapter, paragraph, word) of the first word that BEGINS on it.

    Three spacing rules, all typographic: the printing sets a space before ; : ?
    and ! (and the OCR keeps it only sometimes), so a token that is only such a
    mark joins the word before; a line that opens with a dash continues the word
    before it ("flesh / —not"); and a line that ends with one runs on into the
    next line's first word ("agent— / either"), since Dobson closes his dashes up."""
    starts = {(leaf, i): n for n, leaf, i in CHAPTERS}
    paras_extra = set(PARA_BREAKS)
    no_para = set(NOT_PARA)
    chapters: list[list[list[str]]] = []
    placed: dict[tuple[int, int], tuple[int, int, int]] = {}
    carry = None          # first half of a word hyphenated across the line end
    dash_open = False     # the line before ended in a dash
    joins = []
    for r in rows:
        key = (r["leaf"], r["i"])
        words = r["text"].split()
        if not words:
            continue
        if key in starts:
            assert carry is None, key
            if len(chapters) + 1 != starts[key]:
                raise SystemExit(f"chapter {starts[key]} out of order at {key}")
            chapters.append([[]])
        elif ((r["indent"] and key not in no_para) or key in paras_extra) \
                and chapters and chapters[-1][-1]:
            assert carry is None, key
            chapters[-1].append([])
        if not chapters:
            raise SystemExit(f"text before chapter 1 at {key}")
        para = chapters[-1][-1]
        if dash_open and para:
            # Dobson closes up his dashes ("bones—for"); one that ends a line
            # takes the next line's first word with it, as a hyphen does.
            para[-1] += words[0]
            words = words[1:]
        dash_open = False
        if carry is not None:
            pair = carry + words[0]
            word = carry + "-" + words[0] if pair in KEEP_HYPHEN else pair
            joins.append(f"{carry}-|{words[0]} -> {word}")
            para.append(word)
            words = words[1:]
            carry = None
        first = None
        for w in words:
            if para and (re.fullmatch(rf"[;:?!]+[—]?(?:{MARK.pattern})*", w) or w.startswith("—")
                         or re.fullmatch(f"(?:{MARK.pattern})+", w)):
                para[-1] += w
            else:
                if first is None:
                    first = len(para)
                para.append(w)
        # A row whose words all joined the line before begins no word itself;
        # its tick goes to the next word that does.
        placed[key] = (len(chapters), len(chapters[-1]) - 1, len(para) if first is None else first)
        last = para[-1]
        if last.endswith("-") and not last.endswith("—") and len(last) > 1:
            carry = para.pop()[:-1]
        elif last.endswith("—") and len(last) > 1:
            dash_open = True
    assert carry is None
    return chapters, placed, joins


def number_notes(chapters: list[list[list[str]]], notes: dict[str, str]) -> dict[str, str]:
    """Renumber each [^leaf.n] to [^k], k counting the notes in reading order
    (a figure printed twice for one note keeps one number), and return the
    footnotes as {k: html}. Every note must be cited and every mark defined."""
    order: dict[str, int] = {}
    times: dict[str, int] = {}

    def renumber(m: re.Match) -> str:
        times[m.group(1)] = times.get(m.group(1), 0) + 1
        return f"[^{order.setdefault(m.group(1), len(order) + 1)}]"

    for ch in chapters:
        for para in ch:
            para[:] = [MARK.sub(renumber, w) for w in para]
    undefined = sorted(set(order) - set(notes))
    uncited = sorted(set(notes) - set(order))
    if undefined or uncited:
        raise SystemExit(f"notes: marks with no note {undefined}; notes with no mark {uncited}")
    # each page numbers its figures 1, 2, 3 ... down the page: a label out of
    # that order is a figure pinned to the wrong note
    seq = [tuple(map(int, k.split("."))) for k in order]
    expect = [(leaf, n) for leaf in sorted({l for l, _ in seq})
              for n in range(1, 1 + sum(1 for l, _ in seq if l == leaf))]
    if seq != expect:
        bad = next(f"{a[0]}.{a[1]}" for a, b in zip(seq, expect) if a != b)
        raise SystemExit(f"notes: figure {bad} is out of the page's order")
    wrong = {k: n for k, n in times.items() if n != (2 if k in TWICE else 1)}
    if wrong:
        raise SystemExit(f"notes: figures cited the wrong number of times {wrong}")
    return {str(k): notes[key] for key, k in order.items()}


def anchors(chapters: list[list[list[str]]], placed: dict, words: int = 9) -> list[tuple[str, str, int, int]]:
    """[(bekker, at, leaf, row)] for every MARGIN entry: `at` is the opening words
    of the printed line, made long enough to occur once in the whole text."""
    flat_all = " ".join(w for ch in chapters for p in ch for w in p)
    out = []
    for leaf, entries in MARGIN.items():
        for row, ref in entries:
            if (leaf, row) not in placed:
                raise SystemExit(f"MARGIN {ref}: leaf {leaf} row {row} is not a body row")
            c, p, w = placed[(leaf, row)]
            seq = [x for pi, para in enumerate(chapters[c - 1]) if pi >= p
                   for x in (para[w:] if pi == p else para)]
            n = words
            while " ".join(seq[:n]) and flat_all.count(" ".join(seq[:n])) > 1 and n < len(seq):
                n += 1
            out.append((ref, " ".join(seq[:n]), leaf, row))
    return out


def write(chapters: list[list[list[str]]]) -> str:
    out = ["<h3>De Spiritu</h3>", "", "Translated by J. F. Dobson (Oxford, 1914)", "", ""]
    for n, paras in enumerate(chapters, 1):
        out += [f"Part {n}", ""]
        out += [f"<p>{html.escape(' '.join(p), quote=False)}</p>" for p in paras]
        out += ["", ""]
    return "\n".join(out).rstrip() + "\n"


def dump(pages: dict[int, list[dict]]) -> None:
    for leaf in LEAVES:
        p = classify(merge_rows(pages[leaf]))
        print(f"===== leaf {leaf}  column {p['left']:.0f}-{p['right']:.0f}")
        for r in p["head"]:
            print("  HEAD  " + " ".join(w[4] for w in r["words"]))
        for i, r in enumerate(p["body"]):
            m = " ".join(w[4] for w in r["margin"])
            print(f"  {i:2d} {'>' if r['indent'] else ' '} {m:>8} | " + " ".join(w[4] for w in r["words"]))
        for r in p["notes"]:
            print("  NOTE  " + " ".join(w[4] for w in r["words"]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", action="store_true")
    ap.add_argument("--joins", action="store_true", help="print every rejoined line-end hyphen")
    args = ap.parse_args()
    pages = parse(OCR)
    if args.dump:
        dump(pages)
        return 0
    rows = apply_reads(body_rows(pages))
    chapters, placed, joins = assemble(rows)
    if args.joins:
        print("\n".join(joins))
    notes = json.loads(NOTES.read_text(encoding="utf-8"))
    for key, old, new in NOTE_FIXES:
        if notes[key].count(old) != 1:
            raise SystemExit(f"NOTE_FIXES: {old!r} occurs {notes[key].count(old)} times in note {key}")
        notes[key] = notes[key].replace(old, new)
    footnotes = number_notes(chapters, notes)
    ticks = anchors(chapters, placed)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "book-01.html").write_text(write(chapters), encoding="utf-8")
    (OUT / "footnotes.json").write_text(json.dumps(footnotes, ensure_ascii=False, indent=1) + "\n",
                                        encoding="utf-8")
    head = ["# De Spiritu — Dobson (Oxford, 1914): real Bekker ticks.",
            "# Each entry is a number Dobson prints in his margin, read from the page images",
            "# (archive.org worksofaristotle03arisuoft, leaves 452-468); `at` is the start of",
            "# the printed line it stands beside. The {column}1 entries are also where each",
            "# column's English begins (manifest `anchor_cuts: true`). 482b1, 483b1 and 485a1",
            "# have no mark: each opens a page whose running head names that column.",
            "# Generated by pipeline/tools/build_spir_dobson.py; do not edit by hand."]
    body = []
    for ref, at, leaf, row in ticks:
        note = "  # running head" if ref in FROM_HEAD else ""
        body.append(f'- bekker: "{ref}"{note}\n  at: {json.dumps(at, ensure_ascii=False)}')
    (OUT / "anchors.yaml").write_text("\n".join(head + body) + "\n", encoding="utf-8")
    nwords = sum(len(p) for c in chapters for p in c)
    print(f"wrote {OUT}: {len(chapters)} chapters, {sum(len(c) for c in chapters)} paragraphs, "
          f"{nwords} words, {len(ticks)} ticks, {len(footnotes)} notes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
