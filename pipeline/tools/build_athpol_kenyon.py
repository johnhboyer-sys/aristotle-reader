"""Transcribe F. G. Kenyon's Athenian Constitution (Oxford Works of Aristotle,
vol. X, 1921) into the reader's archive HTML format, with its footnotes and
the section-start anchors.

Source: archive.org scan worksofaristotle0010wdro_x8m2, the Athenian
Constitution at hOCR pages 371-449 (page images n370-n448). Everything is read
from the local cache in build/athpol-ocr/ -- hocr.html (the scan's hOCR),
img/ (the page images the tables below were checked against), pg26095.txt
(Project Gutenberg #26095, the same translation, used only as a witness) and
genie-x.txt (the Ath. Pol. pages of the Genie OCR of the same volume, copied
from sources/genie-oxford/, a second witness that also covers the notes). No
network.

Method:
  - Each hOCR page is split into running head, body lines, margin words,
    footnotes and signature marks by position and type size; paragraphs start
    at lines indented past the fitted left edge; VERSE blocks keep their lines.
  - Words broken at a line end are rejoined; the hyphen stays only where the
    print itself, or failing that Gutenberg, writes the word with one.
  - READS correct the OCR to the printed page, each checked on the image
    (superscript note numbers become [^k], breves and macrons are restored,
    Greek in the notes is read from the image). The 1921 print is the
    authority: misprints are kept as printed and listed in MISPRINTS.
  - clean() makes the remaining mechanical fixes; notes are numbered through
    the work.
  - MARGINS is the inventory of printed section numerals; ANCHORS gives the
    opening words of each TLG 0086.003 section. Each chapter's "Part N" line
    goes at its section-1 anchor.

Writes sources/athpol-kenyon/{book-01.html, footnotes.json, anchors.yaml},
then checks them (parse_book, paragraphs, anchors, the numeral inventory,
notes, misprints, line-end hyphens, a word and punctuation comparison with
Gutenberg in which every difference must be listed in GB_KNOWN or PUNCT_KNOWN,
and one of text and notes with Genie, every difference listed in GENIE_KNOWN).
Run from pipeline/:
  uv run python tools/build_athpol_kenyon.py
(--dump prints the page analysis, --text the per-page text before READS.)
"""
from __future__ import annotations

import html as _html
import json
import re
import statistics as st
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "build" / "athpol-ocr"
HOCR = CACHE / "hocr.html"
GUTENBERG = CACHE / "pg26095.txt"
GENIE = CACHE / "genie-x.txt"
OUT = ROOT / "sources" / "athpol-kenyon"
FIRST_PAGE, LAST_PAGE = 371, 449

@dataclass
class Word:
    x0: int
    y0: int
    x1: int
    y1: int
    text: str
    fs: int


@dataclass
class Line:
    x0: int
    y0: int
    x1: int
    y1: int
    words: list

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    @property
    def fs(self) -> float:
        return st.median([w.fs for w in self.words])


@dataclass
class Page:
    n: int
    head: list = field(default_factory=list)
    body: list = field(default_factory=list)      # Line, margin words removed
    margin: list = field(default_factory=list)    # (Word, body line index)
    notes: list = field(default_factory=list)     # Line
    sig: list = field(default_factory=list)       # Line
    noise: list = field(default_factory=list)     # Line
    L: float = 0
    R: float = 0


_PAGE = re.compile(r'<div class="ocr_page" id="page_(\d+)"')
_LINE = re.compile(
    r'<span class="ocr_(?:line|caption|header|textfloat)"[^>]*title="bbox (\d+) (\d+) (\d+) (\d+);'
    r'[^"]*">(.*?)</span>\s*(?=<span class="ocr_|</p>)', re.S)
_WORD = re.compile(
    r'<span class="ocrx_word"[^>]*title="bbox (\d+) (\d+) (\d+) (\d+); x_wconf \d+'
    r'(?:; x_fsize (\d+))?[^"]*"[^>]*>(.*?)</span>', re.S)


def load_hocr() -> dict:
    raw = HOCR.read_text(encoding="utf-8")
    parts = _PAGE.split(raw)
    pages = {}
    for k in range(1, len(parts), 2):
        n = int(parts[k])
        if not FIRST_PAGE <= n <= LAST_PAGE:
            continue
        lines = []
        for m in _LINE.finditer(parts[k + 1]):
            x0, y0, x1, y1 = map(int, m.groups()[:4])
            ws = []
            for a, b, c, d, fs, t in _WORD.findall(m.group(5)):
                t = _html.unescape(re.sub(r"<[^>]+>", "", t)).strip()
                if t:
                    ws.append(Word(int(a), int(b), int(c), int(d), t, int(fs or 0)))
            if ws:
                lines.append(Line(x0, y0, x1, y1, ws))
        pages[n] = lines
    return pages


_HEAD = re.compile(r"[CG]HAPTER|ATHENIENSIUM|RESPUBLICA")  # OCR reads the C of one head as G
_SIG = re.compile(r"^[0-9.,\s]*[A-Z]{1,2}[\s0-9]*$")


def _fit(pts: list) -> tuple:
    """Robust least-squares x = a + b*y through (y, x) points: refit after
    dropping points more than 8px off, three rounds."""
    for _ in range(3):
        n = len(pts)
        my = sum(p[0] for p in pts) / n
        mx = sum(p[1] for p in pts) / n
        vy = sum((p[0] - my) ** 2 for p in pts) or 1
        b = sum((p[0] - my) * (p[1] - mx) for p in pts) / vy
        a = mx - b * my
        keep = [p for p in pts if abs(p[1] - (a + b * p[0])) <= 8]
        if len(keep) == len(pts) or len(keep) < 5:
            break
        pts = keep
    return a, b


def classify(n: int, lines: list) -> Page:
    pg = Page(n)
    lines = sorted(lines, key=lambda l: l.y0)
    if lines and _HEAD.search(lines[0].text):
        pg.head.append(lines.pop(0))
    while lines and lines[-1].y0 > 2600 and lines[-1].x1 - lines[-1].x0 < 800 \
            and (_SIG.match(lines[-1].text) or re.fullmatch(r"\d{3}\.\d{2}\s+\w{1,3}", lines[-1].text)):
        pg.sig.insert(0, lines.pop())
    widths = sorted(l.x1 - l.x0 for l in lines)
    full = widths[(len(widths) * 95) // 100]
    wide = [l for l in lines if l.x1 - l.x0 > 0.9 * full]
    # left edge from the left ends of wide lines (indented ones drop out of
    # the fit); right edge from the ends of their last non-margin words
    la, lb = _fit([(l.y0, l.x0) for l in wide])
    ra, rb = _fit([(l.y0, l.x1) for l in wide])
    pg.left = lambda y: la + lb * y
    pg.right = lambda y: ra + rb * y
    pg.L, pg.R = round(pg.left(1500)), round(pg.right(1500))
    inner = []
    for l in lines:
        if l.x1 < pg.left(l.y0) - 6 or l.x0 > pg.right(l.y0) + 6:
            for w in l.words:
                pg.margin.append([w, None])
        elif l.fs < 30:
            pg.noise.append(l)     # a detached speck or stray mark inside the text block
        else:
            inner.append(l)
    # a short last line far below the rest is a signature mark ("B 2", "3,")
    if len(inner) > 1 and inner[-1].y0 - inner[-2].y0 > 56 and inner[-1].x1 - inner[-1].x0 < 400 \
            and re.fullmatch(r"[0-9A-Z]{1,3}[,.]?(\s+\d+)?", inner[-1].text):
        pg.sig.insert(0, inner.pop())
    k = len(inner)
    while k > 0:
        l = inner[k - 1]
        tight = k < len(inner) and inner[k].y0 - l.y0 < 50
        last_tight = k == len(inner) and k > 1 and l.y0 - inner[k - 2].y0 < 56 and inner[k - 2].fs <= 46
        if l.fs <= 46 or tight or last_tight:
            k -= 1
        else:
            break
    # a full-size line sitting at body pitch above the notes is body text
    while k < len(inner) and k > 0 and inner[k].fs >= 45 and inner[k].y0 - inner[k - 1].y0 < 68:
        k += 1
    pg.notes = inner[k:]
    # a centred signature mark below the notes ("C 2" read as "Cee")
    while pg.notes and pg.notes[-1].x1 - pg.notes[-1].x0 < 300 and pg.notes[-1].x0 - pg.left(pg.notes[-1].y0) > 300:
        pg.sig.append(pg.notes.pop())
    for l in inner[:k]:
        keep = []
        for j, w in enumerate(l.words):
            out = w.x0 > pg.right(w.y0) - 2 or w.x1 < pg.left(w.y0) + 2
            if out and len(w.text) <= 4:
                pg.margin.append([w, None])
                continue
            # a margin numeral the OCR fused onto the first/last word of a line
            m = re.fullmatch(r"(\d{1,2})(\D.*)", w.text) if j == 0 and w.x0 < pg.left(w.y0) - 10 else None
            m2 = re.fullmatch(r"(.*\D)(\d{1,2})", w.text) if j == len(l.words) - 1 and w.x1 > pg.right(w.y0) + 10 else None
            if m:
                pg.margin.append([Word(w.x0, w.y0, w.x0 + 20, w.y1, m.group(1), w.fs), None])
                w = Word(w.x0, w.y0, w.x1, w.y1, m.group(2), w.fs)
            elif m2:
                pg.margin.append([Word(w.x1 - 20, w.y0, w.x1, w.y1, m2.group(2), w.fs), None])
                w = Word(w.x0, w.y0, w.x1, w.y1, m2.group(1), w.fs)
            keep.append(w)
        if keep:
            pg.body.append(Line(min(w.x0 for w in keep), l.y0, max(w.x1 for w in keep), l.y1, keep))
    for m in pg.margin:
        w = m[0]
        cy = (w.y0 + w.y1) / 2
        m[1] = min(range(len(pg.body)), key=lambda i: abs((pg.body[i].y0 + pg.body[i].y1) / 2 - cy)) if pg.body else None
    return pg


def paragraph_starts(pg: Page) -> list:
    """Indices of body lines indented past the page's fitted left edge."""
    return [i for i, l in enumerate(pg.body) if l.x0 - pg.left(l.y0) > 28]


_NOTE_NUM = re.compile(r"^[0-9'‘’*?!°}\]^\"“”]{1,2}$")
_WORDCH = re.compile(r"[A-Za-z\u00C0-\u024F]")


def gutenberg_text() -> str:
    t = GUTENBERG.read_text(encoding="utf-8")
    a = t.index("Translated by Sir Frederic G. Kenyon")
    b = t.index("*** END OF THE PROJECT GUTENBERG")
    return t[a:b]


def _gb_vocab() -> tuple:
    words = re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)*", gutenberg_text())
    solid = {w.lower() for w in words if "-" not in w}
    hyph = {w.lower() for w in words if "-" in w}
    return solid, hyph


_HYPHEN_LOG: list = []
_PRINT_VOCAB: tuple = ()


def _print_vocab() -> tuple:
    """(solid, hyphenated) word forms the print itself uses inside a line
    (a line's last word is left out: its hyphen may be a break)."""
    global _PRINT_VOCAB
    if not _PRINT_VOCAB:
        solid, hyph = set(), set()
        for lines in load_hocr().values():
            for l in lines:
                for w in l.words[:-1]:
                    t = re.sub(r"^\W+|\W+$", "", w.text).lower()
                    if re.fullmatch(r"[a-z]+(?:-[a-z]+)+", t):
                        hyph.add(t)
                    elif re.fullmatch(r"[a-z]+", t):
                        solid.add(t)
        _PRINT_VOCAB = (solid, hyph)
    return _PRINT_VOCAB


def _join_hyphen(left: str, right: str, solid: set, hyph: set, n: int) -> str:
    """Rejoin a word broken at a line end. The print's own usage inside a line
    decides first (hyphenated there: keep; solid there: close up); failing
    that, keep the hyphen when Gutenberg hyphenates the word and never prints
    it solid; else close it up."""
    a = re.sub(r"^\W+", "", left).lower()
    b = re.sub(r"\W+$", "", right).lower()
    psolid, phyph = _print_vocab()
    if f"{a}-{b}" in phyph:
        keep, why = True, "print"
    elif a + b in psolid:
        keep, why = False, "print"
    elif f"{a}-{b}" in hyph and a + b not in solid:
        keep, why = True, "gutenberg"
    elif a + b in solid:
        keep, why = False, "gutenberg"
    else:
        keep, why = False, "neither"
    _HYPHEN_LOG.append((n, left + "-|" + right, keep, why))
    return f"{left}-{right}" if keep else left + right


def _lines_to_text(lines: list, breaks: dict, solid: set, hyph: set, n: int) -> str:
    """Join physical lines into text. `breaks[i]` is what goes before line i:
    "\n\n" (paragraph), "\n" (verse line) or nothing (soft wrap: a space,
    or a rejoined hyphenated word). A trailing hyphen on the last line is left
    as `-` for the page join."""
    out = ""
    for i, l in enumerate(lines):
        t = l.text
        brk = breaks.get(i)
        if brk:
            out = out.rstrip() + brk
        elif out.endswith("-") and not out.endswith("--") and out[-2:-1].isalpha():
            m = re.search(r"(\S+)-$", out)
            first, _, rest = t.partition(" ")
            out = out[:m.start()] + _join_hyphen(m.group(1), first, solid, hyph, n)
            t = rest
            if not t:
                continue
            out += " "
        elif out and not out.endswith("\n"):
            out += " "
        out += t
    return out


def _verse_breaks(n: int, body: list) -> tuple:
    """Breaks for the VERSE blocks on page n: each verse line on its own line,
    a turnover (indented past the block's left edge) joined to the line it
    continues, the block a paragraph of its own. Returns (breaks, verse line
    indices)."""
    breaks, inside = {}, set()
    for page, first, last in VERSE:
        if page != n:
            continue
        i0 = 0 if first is None else next(i for i, l in enumerate(body) if l.text.startswith(first))
        i1 = len(body) - 1 if last is None else next(i for i, l in enumerate(body) if i >= i0 and l.text.startswith(last))
        left = min(body[i].x0 for i in range(i0, i1 + 1))
        for i in range(i0, i1 + 1):
            inside.add(i)
            if i == i0:
                breaks[i] = "\n" if first is None else "\n\n"
            elif body[i].x0 - left <= 30:
                breaks[i] = "\n"
        if i1 + 1 < len(body):
            breaks[i1 + 1] = "\n\n"
    return breaks, inside


def page_texts(pages: dict) -> dict:
    """{page: (body_text, [notes])}: body text with blank lines at paragraph
    starts (a leading blank line if the page opens a paragraph), notes as a
    list of strings (a note continued from the previous page starts with `+`)."""
    solid, hyph = _gb_vocab()
    out = {}
    for n in sorted(pages):
        pg = classify(n, pages[n])
        breaks, inside = _verse_breaks(n, pg.body)
        for i in paragraph_starts(pg):
            if i not in inside:
                breaks[i] = "\n\n"
        body = _lines_to_text(pg.body, breaks, solid, hyph, n)
        if any(p == n and last is not None and pg.body[-1].text.startswith(last) for p, _f, last in VERSE):
            body += "\n\n"       # a verse block closing the page closes its paragraph
        groups = []
        # the notes' own left edge: the fitted text edge, or further left where
        # the fit is pulled off by verse (indented note starts sit ~45px in)
        offs = sorted(l.x0 - pg.left(l.y0) for l in pg.notes)
        nleft = min(offs + [0])
        if len(offs) >= 3 and offs[1] - offs[0] > 12:
            nleft = min(offs[1], 0)       # one line pulled left by a leading speck
        for l in pg.notes:
            ind = l.x0 - pg.left(l.y0) - nleft
            if ind > 20 or not groups:
                words = list(l.words)
                if words and _NOTE_NUM.match(words[0].text):
                    words = words[1:]
                if not words:
                    continue
                groups.append(("" if ind > 20 else "+", [Line(l.x0, l.y0, l.x1, l.y1, words)]))
            else:
                groups[-1][1].append(l)
        notes = [plus + _lines_to_text(ls, {}, solid, hyph, n).strip() for plus, ls in groups]
        out[n] = (body, notes)
    return out


def apply_reads(texts: dict) -> dict:
    """Apply READS page by page to "body @NOTES #1 note #2 note ...". Each
    OCR reading must occur exactly once on its page."""
    out = {}
    for n, (body, notes) in texts.items():
        t = body + "\n@NOTES\n" + "\n".join(f"#{k} {x}" for k, x in enumerate(notes, 1))
        for page, ocr, printed, _note in READS:
            if page != n:
                continue
            c = t.count(ocr)
            if c != 1:
                raise SystemExit(f"READS page {n}: {ocr!r} occurs {c} times")
            t = t.replace(ocr, printed)
        body, _, nt = t.partition("\n@NOTES\n")
        notes = [re.sub(r"^#\d+ ?", "", x).strip() for x in re.split(r"\n(?=#\d+ )", nt) if x.strip()]
        out[n] = (body, notes)
    return out


def clean(t: str) -> str:
    """Mechanical cleanup after READS: drop stray rule/tilde/bar tokens, close
    the printer's thin space before ; : ? ! and inside quotation marks, curl
    straight apostrophes, read small-capital "B.c." as "B.C.", close the
    thin space in "i. e." and "e. g.", collapse runs of spaces."""
    t = re.sub(r"(?<!\S)[_~|]+(?!\S)", " ", t)
    t = re.sub(r"\b(i|e)\. (e|g)\.", r"\1.\2.", t)
    t = re.sub(r"(?<=[\w\])’”])[ \t]+([;:?!])", r"\1", t)
    t = re.sub(r"‘[ \t]+", "‘", t)
    t = re.sub(r"(?<=[\w.,!?\]])[ \t]+’(?=[\s,.;:)\]]|$)", "’", t)
    t = t.replace("'", "’")
    t = re.sub(r"\bB\.\s?c\.", "B.C.", t)       # small-capital C read as lower case
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    return t


_REF = re.compile(r"\[\^(\d+)\]")


def assemble(pages: dict) -> tuple:
    """(prose, footnotes): the whole work as one string (paragraphs separated
    by blank lines, verse lines by single newlines, page-local footnote
    numbers renumbered through the work) and the note texts in order."""
    texts = apply_reads(page_texts(pages))
    solid, hyph = _gb_vocab()
    prose, foot = "", []
    for n in sorted(texts):
        body, notes = texts[n]
        body, notes = clean(body), [clean(x) for x in notes]
        body = body.lstrip(" ")
        refs = [int(k) for k in _REF.findall(body)]
        fresh = [x for x in notes if not x.startswith("+")]
        if refs != list(range(1, len(fresh) + 1)):
            raise SystemExit(f"page {n}: refs {refs} but {len(fresh)} notes")
        base = len(foot)
        body = _REF.sub(lambda m: f"[^{base + int(m.group(1))}]", body)
        for x in notes:
            if x.startswith("+"):
                if not foot:
                    raise SystemExit(f"page {n}: continued note with nothing before it")
                foot[-1] = _join_soft(foot[-1], x[1:].strip(), solid, hyph, n)
            else:
                foot.append(x)
        if not prose:
            prose = body.lstrip("\n")
        elif prose.endswith("\n\n"):
            prose = prose + body.lstrip("\n")
        elif body.startswith("\n"):
            prose = prose.rstrip() + ("\n\n" if body.startswith("\n\n") else "\n") + body.lstrip("\n")
        else:
            prose = _join_soft(prose, body, solid, hyph, n)
    return prose.strip(), foot


def _join_soft(a: str, b: str, solid: set, hyph: set, n: int) -> str:
    """Join text across a page break: rejoin a hyphenated word, else a space."""
    m = re.search(r"(\S+)-$", a)
    if m and a[-2:-1].isalpha():
        first, _, rest = b.partition(" ")
        return a[:m.start()] + _join_hyphen(m.group(1), first, solid, hyph, n) + (" " + rest if rest else "")
    return a.rstrip() + " " + b


# ---------------------------------------------------------------- output

def _pattern(phrase: str) -> re.Pattern:
    """An anchor phrase as stage1_archive._find_phrase matches it: the words
    verbatim, any run of whitespace between them."""
    return re.compile(r"\s+".join(re.escape(w) for w in phrase.split()))


def locate_anchors(prose: str) -> dict:
    """{section: offset}: each ANCHORS phrase found at its first occurrence
    after the previous section's start."""
    starts, pos = {}, 0
    for key, phrase in ANCHORS:
        m = _pattern(phrase).search(prose, pos)
        if not m:
            raise SystemExit(f"anchor {key} {phrase!r} not found after offset {pos}")
        starts[key] = pos = m.start()
    return starts


def book_html(prose: str, starts: dict) -> tuple:
    """(file text, chapters whose Part line splits a printed paragraph)."""
    cuts = [starts[f"{c}.1"] for c in range(1, 70)] + [len(prose)]
    if cuts[0] != 0:
        raise SystemExit(f"anchor 1.1 is not at the start of the text (offset {cuts[0]})")
    out, splits = ["<HTML><BODY>", "Translated by Sir Frederic G. Kenyon"], []
    for c in range(1, 70):
        a, b = cuts[c - 1], cuts[c]
        if c > 1 and not prose[:a].endswith("\n\n"):
            splits.append(c)
        out += ["", f"Part {c}", "", prose[a:b].strip()]
    out += ["", "</BODY></HTML>", ""]
    return "\n".join(out), splits


def anchors_yaml() -> str:
    def q(s: str) -> str:
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    head = ("# Section starts of Kenyon's Athenian Constitution (Oxford 1921) against the\n"
            "# TLG 0086.003 sections, written by pipeline/tools/build_athpol_kenyon.py.\n"
            "# bekker is \"{chapter}a{section}\"; at is the section's opening words verbatim.\n")
    rows = []
    for key, phrase in ANCHORS:
        c, s = key.split(".")
        rows.append(f"- {{ bekker: {q(f'{c}a{s}')}, at: {q(phrase)} }}")
    return head + "\n".join(rows) + "\n"


# ---------------------------------------------------------------- checks

def _section_key(label: str) -> tuple:
    c, _, s = label.partition(".")
    return int(c), int(s or 1)


def greek_sections() -> list:
    """[(chapter, section)] of the TLG text, from sources/athpol-greek-starts.yaml."""
    keys = re.findall(r'^"(\d+)a(\d+)":', (ROOT / "sources" / "athpol-greek-starts.yaml").read_text(encoding="utf-8"), re.M)
    return [(int(c), int(s)) for c, s in keys]


def check_parse(path: Path, starts: dict, html_text: str) -> dict:
    sys.path.insert(0, str(ROOT / "pipeline"))
    from aristotle_pipeline.stage1_ross import parse_book
    ch = parse_book(path, "part")
    ok = sorted(ch) == list(range(1, 70))
    print(f"[parse] parse_book(book-01.html, 'part'): {len(ch)} chapters, numbered "
          f"{min(ch)}..{max(ch)} -> {'OK' if ok else 'FAIL'}")
    if not ok:
        raise SystemExit("parse_book does not return chapters 1..69")
    # paragraphs: as written vs as parse_book joins them
    blocks = re.split(r"\nPart \d+\n", html_text)[1:]
    written = [len([p for p in re.split(r"\n\s*\n", b.replace("</BODY></HTML>", "")) if p.strip()]) for b in blocks]
    parsed = [len([p for p in ch[c].split("\n") if p.strip()]) for c in range(1, 70)]
    print(f"[paras] written {sum(written)} paragraphs; parse_book keeps {sum(parsed)} "
          f"({sum(written) - sum(parsed)} joined to the next because the line before the blank does not end in . ? ! :)")
    merged = [f"{c} ({written[c - 1]}->{parsed[c - 1]})" for c in range(1, 70) if written[c - 1] != parsed[c - 1]]
    print(f"[paras] chapters where parse_book joins paragraphs: {', '.join(merged) or 'none'}")
    return ch


def check_anchors(ch: dict, starts: dict) -> None:
    keys = [k for k, _ in ANCHORS]
    tlg = [f"{c}.{s}" for c, s in greek_sections()]
    if keys != tlg:
        raise SystemExit(f"ANCHORS keys differ from the TLG sections: {sorted(set(keys) ^ set(tlg))}")
    bad, refs, short = [], [], []
    last = {}
    for key, phrase in ANCHORS:
        c = int(key.split(".")[0])
        text = ch[c]
        hits = [m.start() for m in _pattern(phrase).finditer(text)]
        if len(hits) != 1:
            bad.append(f"{key}: {len(hits)} hits")
            continue
        if hits[0] <= last.get(c, -1):
            bad.append(f"{key}: out of order")
        last[c] = hits[0]
        if "[^" in phrase:
            refs.append(key)
        if len(phrase.split()) < 5:
            short.append(f"{key} {phrase!r}")
    print(f"[anchors] {len(ANCHORS)} anchors against {len(tlg)} TLG sections; "
          f"{len(ANCHORS) - len(bad)} found exactly once, in order, in their chapter's parsed prose")
    for b in bad:
        print(f"[anchors]   FAIL {b}")
    print(f"[anchors] shorter than 5 words (a footnote ref follows): {', '.join(short) or 'none'}")
    print(f"[anchors] containing a footnote ref: {refs or 'none'}")
    if bad:
        raise SystemExit("anchor check failed")


def _line_spans(pages: dict, prose: str) -> dict:
    """{(page, body line index): (start, end)} in the prose for each MARGINS
    line, by matching the line's first six words (letters only) against the
    prose's words, searching forward from the previous match."""
    toks = [(m.start(), re.sub(r"[^a-z]", "", m.group().lower())) for m in re.finditer(r"\S+", prose)]
    toks = [t for t in toks if t[1]]
    words = [w for _, w in toks]
    spans, cur, cache = {}, 0, {}
    for page, prefix, label, _src in MARGINS:
        pg = cache.setdefault(page, classify(page, pages[page]))
        idx = [i for i, l in enumerate(pg.body) if l.text.startswith(prefix)]
        if len(idx) != 1:
            raise SystemExit(f"MARGINS p{page} {prefix!r}: {len(idx)} body lines")
        i = idx[0]
        lw = [w for w in (re.sub(r"[^a-z]", "", w.text.lower()) for w in pg.body[i].words) if len(w) >= 2]
        best = (-1, cur)
        for s in range(max(0, cur - 50), min(len(words), cur + 3000)):
            sc = sum(1 for k, w in enumerate(lw[:6]) if s + k < len(words) and words[s + k] == w)
            if sc > best[0]:
                best = (sc, s)
            if sc == min(6, len(lw)):
                break
        sc, s = best
        if sc < 3:
            raise SystemExit(f"MARGINS p{page} {prefix!r}: line not found in the prose (score {sc})")
        cur = s
        spans[(page, i)] = (label, toks[s][0], toks[min(len(toks) - 1, s + len(lw))][0])
    return spans


# What the margins are known to disagree with, each checked on the page image.
# check_margins fails on any difference not listed here and on any entry here
# that no longer applies.
# Chapters whose printed numerals differ from the TLG sections: printed list.
MARGIN_CHAPTERS = {
    8: [1, 2, 4, 5],         # no "3" printed; TLG 8.3 starts "There were four tribes"
    15: [1, 2, 3, 4, 5],     # Kenyon's 15.5 "Pisistratus accordingly" is inside TLG 15.4
    26: [1, 2, 3, 4],        # Kenyon's 26.4 "and two years afterwards" is inside TLG 26.3
    49: [1, 2, 3, 4, 5],     # Kenyon's 49.5 is inside TLG 49.4
}
# Anchors (TLG section starts) not on the line of Kenyon's printed numeral.
OFF_NUMERAL = {"4.4", "8.5", "9.1", "9.2", "37.2", "40.3", "47.3", "47.4", "47.5",
               "49.2", "53.2", "56.4"}
# TLG sections with no printed numeral.
NO_NUMERAL = {"8.3"}


def check_margins(pages: dict, prose: str, starts: dict) -> None:
    labels = [m[2] for m in MARGINS]
    keys = [_section_key(l) for l in labels]
    if keys != sorted(keys) or len(set(keys)) != len(keys):
        raise SystemExit("MARGINS labels are not in strictly ascending order")
    inv = [sum(1 for c, _ in keys if c == n) for n in range(1, 70)]
    tlg = [sum(1 for c, _ in greek_sections() if c == n) for n in range(1, 70)]
    src = {s: sum(1 for m in MARGINS if m[3] == s) for s in ("hocr", "img")}
    print(f"[margins] {len(MARGINS)} printed section numerals ({src['hocr']} also in the hOCR, {src['img']} read from the image only)")
    print(f"[margins] per chapter 1..69: {inv}")
    print(f"[margins] total {sum(inv)}; TLG sections {sum(tlg)}")
    differ = {}
    for n in range(1, 70):
        if inv[n - 1] != tlg[n - 1]:
            have = sorted(s for c, s in keys if c == n)
            differ[n] = have
            print(f"[margins]   ch {n}: printed {inv[n - 1]} {have} vs TLG {tlg[n - 1]}")
    if differ != MARGIN_CHAPTERS:
        raise SystemExit(f"margin inventory differs from TLG other than as MARGIN_CHAPTERS says: {differ}")
    # every numeral the OCR itself saw in a margin should be in MARGINS
    seen = {(p, pre) for p, pre, _l, _s in MARGINS}
    stray, examined = [], 0
    for n in sorted(pages):
        pg = classify(n, pages[n])
        for w, i in pg.margin:
            if i is None or not re.fullmatch(r"\d{1,2}", w.text):
                continue
            examined += 1
            line = pg.body[i].text
            if not any(p == n and line.startswith(pre) for p, pre in seen):
                stray.append(f"p{n} {w.text!r} by {line[:30]!r}")
    print(f"[margins] hOCR margin digits examined: {examined}; on a line with no MARGINS entry: {len(stray)}")
    for s in stray:
        print(f"[margins]   {s}")
    if stray or not examined:
        raise SystemExit("hOCR margin digits with no MARGINS entry, or none examined")
    spans = _line_spans(pages, prose)
    off = []
    for (page, _i), (label, a, b) in spans.items():
        key = label if "." in label else f"{label}.1"
        if key not in starts:
            continue
        if not a - 25 <= starts[key] < b:     # the opening word may end the line above
            off.append(f"{key} (p{page})")
    print(f"[margins] anchors not on the line of their printed numeral: {len(off)}: {', '.join(off) or 'none'}")
    printed = {f"{c}.{s}" for c, s in keys}
    nonum = [k for k, _ in ANCHORS if k not in printed]
    print(f"[margins] TLG sections with no printed numeral: {nonum or 'none'}")
    if {k.split(" ")[0] for k in off} != OFF_NUMERAL:
        raise SystemExit(f"anchors off their numeral's line other than OFF_NUMERAL: {off}")
    if set(nonum) != NO_NUMERAL:
        raise SystemExit(f"sections with no numeral other than NO_NUMERAL: {nonum}")


def check_notes(prose: str, foot: list) -> None:
    refs = [int(k) for k in _REF.findall(prose)]
    ok = refs == list(range(1, len(foot) + 1))
    print(f"[notes] {len(foot)} footnotes; {len(refs)} refs in the text, each once and in order: {'OK' if ok else 'FAIL'}")
    if not ok:
        raise SystemExit("footnote refs and notes disagree")
    empty = [k for k, t in enumerate(foot, 1) if not t.strip()]
    if empty:
        raise SystemExit(f"empty footnotes: {empty}")


def check_misprints(prose: str, foot: list) -> None:
    whole = prose + "\n" + "\n".join(foot)
    for page, text, note in MISPRINTS:
        n = whole.count(text)
        print(f"[misprints] p{page} {text!r}: {n}x in output -- {note}")
        if n < 1:
            raise SystemExit(f"misprint {text!r} not in the output")


def _norm_words(text: str) -> list:
    """Words for the Gutenberg comparison: lower case, no diacritics, no
    hyphens, letters and digits only."""
    out = []
    for w in text.split():
        w = unicodedata.normalize("NFD", w.lower())
        w = re.sub(r"[^a-z0-9]", "", w)
        if w:
            out.append(w)
    return out


def check_gutenberg(prose: str) -> None:
    import difflib
    body = re.sub(r"\[\^\d+\]", "", prose)
    gb = gutenberg_text()
    gb = re.sub(r"^Translated by Sir Frederic G\. Kenyon", "", gb)
    gb = re.sub(r"(?m)^\s*Part \d+\s*$", " ", gb)
    a, b = _norm_words(body), _norm_words(gb)
    ops = [o for o in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if o[0] != "equal"]
    used, left = set(), []
    for tag, i1, i2, j1, j2 in ops:
        ours, theirs, ctx = " ".join(a[i1:i2]), " ".join(b[j1:j2]), " ".join(a[max(0, i1 - 2):i1])
        hit = next((k for k, g in enumerate(GB_KNOWN) if k not in used and g[:3] == (ours, theirs, ctx)), None)
        if hit is None:
            left.append((ours, theirs, ctx))
        else:
            used.add(hit)
    print(f"[gutenberg] {len(a)} words here, {len(b)} in Gutenberg; {len(ops)} differences "
          f"(diacritics, hyphens, punctuation ignored); {len(used)} accounted for by GB_KNOWN, each checked on the image")
    for ours, theirs, ctx in left:
        print(f"[gutenberg]   NOT ACCOUNTED FOR: here [{ours}] Gutenberg [{theirs}] after '{ctx}'")
    stale = [GB_KNOWN[k] for k in range(len(GB_KNOWN)) if k not in used]
    for g in stale:
        print(f"[gutenberg]   GB_KNOWN entry matched nothing: {g}")
    if left or stale:
        raise SystemExit("Gutenberg comparison: unexplained differences")


def _punct_tokens(text: str) -> list:
    """[(letters, token)] with diacritics, quote and dash forms folded; a token
    of punctuation alone joins the word before it."""
    out = []
    for w in text.split():
        w = "".join(c for c in unicodedata.normalize("NFD", w) if not unicodedata.combining(c))
        w = w.translate(str.maketrans("‘’“”—–", "''\"\"--"))
        core = re.sub(r"[^A-Za-z0-9]", "", w).lower()
        if core:
            out.append([core, w])
        elif out:
            out[-1][1] += w
    return out


def check_punctuation(prose: str) -> None:
    """Punctuation against Gutenberg, word by word where the words agree: the
    word comparison cannot see a comma the OCR read for a full stop."""
    import difflib
    gb = gutenberg_text()
    gb = re.sub(r"^Translated by Sir Frederic G\. Kenyon", "", gb)
    gb = re.sub(r"(?m)^\s*Part \d+\s*$", " ", gb)
    a, b = _punct_tokens(re.sub(r"\[\^\d+\]", "", prose)), _punct_tokens(gb)
    sm = difflib.SequenceMatcher(None, [x[0] for x in a], [x[0] for x in b], autojunk=False)
    compared, brackets, used, left = 0, 0, set(), []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag != "equal":
            continue
        for k in range(i2 - i1):
            compared += 1
            x, y = a[i1 + k][1], b[j1 + k][1]
            px, py = re.sub(r"[A-Za-z0-9-]", "", x), re.sub(r"[A-Za-z0-9-]", "", y)
            if px == py:
                continue
            if px.replace("[", "(").replace("]", ")") == py:
                brackets += 1
                continue
            hit = next((n for n, g in enumerate(PUNCT_KNOWN) if n not in used and g[:2] == (x, y)), None)
            if hit is None:
                left.append((x, y))
            else:
                used.add(hit)
    print(f"[punct] {compared} words compared with Gutenberg for punctuation; {brackets} where Gutenberg prints ( ) "
          f"for the print's [ ]; {len(used)} other differences in PUNCT_KNOWN, each checked on the image")
    for x, y in left:
        print(f"[punct]   NOT ACCOUNTED FOR: here {x!r} Gutenberg {y!r}")
    stale = [PUNCT_KNOWN[n] for n in range(len(PUNCT_KNOWN)) if n not in used]
    for g in stale:
        print(f"[punct]   PUNCT_KNOWN entry matched nothing: {g}")
    if left or stale:
        raise SystemExit("punctuation comparison: unexplained differences")


_G_HEAD = re.compile(r"^#*\s*(?:ATHENIENSIUM RESPUBLICA|CHAPTER [0-9IVXL]+)\s*$")
_G_NOTE = re.compile(r"^\s*(?:\$\^\{?(\d+)\}?\$|<sup>(\d+)</sup>|\^(\d+)\^|([¹²³⁴⁵⁶⁷⁸⁹⁰]+))")
_G_SUP = str.maketrans("¹²³⁴⁵⁶⁷⁸⁹⁰", "1234567890")


def genie_pages() -> dict:
    """{printed page: (body lines, note lines)} from the Genie OCR. Pages are
    split by `---` lines, each opening with its running head; a `---` segment
    with no head is the foot of the page before it (a footnote rule), so its
    lines are notes. Inside a headed segment the notes start at a `***` rule or
    the first line marked as note 1."""
    t = GENIE.read_text(encoding="utf-8")
    t = t[t.index("### ATHENIENSIUM RESPUBLICA\n\n. . ."):]
    pages = []
    for seg in re.split(r"(?m)^---$", t):
        lines = [l for l in seg.split("\n") if l.strip()]
        if not lines:
            continue
        if _G_HEAD.match(lines[0]):
            body = lines[1:]
            k = next((i for i, l in enumerate(body) if l.strip() == "***" or ((m := _G_NOTE.match(l))
                      and "".join(g or "" for g in m.groups()).translate(_G_SUP) == "1")), len(body))
            pages.append((body[:k], [l for l in body[k:] if l.strip() != "***"]))
        else:
            pages[-1][1].extend(lines)
    if len(pages) != LAST_PAGE - FIRST_PAGE + 1:
        raise SystemExit(f"Genie: {len(pages)} pages, expected {LAST_PAGE - FIRST_PAGE + 1}")
    return {FIRST_PAGE + k: p for k, p in enumerate(pages)}


def _genie_text(lines: list) -> str:
    """Genie lines as plain text: signature marks, HTML, Markdown, superscripts
    (note refs and the margin numerals Genie raises) and bold or italic
    numerals dropped, and lines holding only a margin numeral; words broken at
    a line end rejoined."""
    out = []
    for l in lines:
        l = _html.unescape(l.replace("&nbsp;", " ").replace("&emsp;", " "))
        l = re.sub(r"\$([^$]*\\[^$]*)\$", lambda m: _latex_greek(m.group(1)), l)
        l = re.sub(r"<sup>[^<]*</sup>|\$[\^_]\{?[^$]*\}?\$|\^\d+\^|[¹²³⁴⁵⁶⁷⁸⁹⁰]+", " ", l)
        l = re.sub(r"<[^>]+>", " ", l)
        l = re.sub(r"\*{1,2}\d+\*{1,2}", " ", l)
        l = re.sub(r"^\s*[#>]+\s*", "", l).replace("*", "").replace("_", "")
        if _SIG.match(l.strip()) or re.fullmatch(r"\s*(?:\d+\.\d+\s+[A-Z]{1,2}|\d{1,2})\s*", l):
            continue
        out.append(l.strip())
    t = "\n".join(out)
    return re.sub(r"(?<=[A-Za-z])- *(?:\n *)?(?:\d{1,2} +)?(?!(?:and|or)\b)(?=[a-z])", "", t)


_GREEK = dict(zip("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi o pi rho sigma "
                  "varsigma tau upsilon phi chi psi omega".split(), "αβγδεζηθικλμνξοπρσςτυφχψω"))


def _latex_greek(m: str) -> str:
    """Genie's few TeX-coded Greek words (mu, acute{eta}) as Greek letters."""
    m = re.sub(r"\\[a-z]+\{(\\?[a-z]+)\}", r" \1 ", m)
    return "".join(_GREEK.get(x, "") for x in re.findall(r"\\?([a-z]+)", m))


def _close_abbr(text: str) -> str:
    """'B. C.' or 'i. e.' as one word however spaced."""
    return re.sub(r"\b([A-Za-z])\. (?=[A-Za-z]\.)", r"\1.", text)


def _genie_words(text: str) -> list:
    """Words as _norm_words leaves them, but keeping Greek letters."""
    out = []
    for w in _close_abbr(text).split():
        w = unicodedata.normalize("NFD", w.lower())
        w = re.sub(r"[^a-z0-9α-ω]", "", w)
        if w:
            out.append(w)
    return out


def check_genie(prose: str, foot: list) -> None:
    """Words and punctuation of the text and of the notes against the Genie
    OCR, a second and independent reading of the same scan. A run of one- or
    two-digit numbers found only in Genie's text, each the number of a section
    printed in the margin of that page or one beside it (MARGINS), is a margin
    numeral Genie kept in the line; every other difference must be in
    GENIE_KNOWN. Punctuation is compared as check_punctuation does, word by
    word where the words agree."""
    import difflib
    gp = genie_pages()
    numerals = {}       # page: the numbers printed in its margin, from MARGINS
    for page, _pre, label, _src in MARGINS:
        numerals.setdefault(page, set()).add(label.split(".")[-1])
    streams = {"text": (re.sub(r"\[\^\d+\]", "", prose), 0), "notes": ("\n".join(foot), 1)}
    used, left, counts, margins = set(), [], {}, 0

    def known(key: tuple) -> bool:
        hit = next((k for k, g in enumerate(GENIE_KNOWN) if k not in used and g[:4] == key), None)
        if hit is not None:
            used.add(hit)
        return hit is not None

    def punct(stream: str, ours: str, theirs: str) -> None:
        a, b = _punct_tokens(_close_abbr(ours)), _punct_tokens(_close_abbr(theirs))
        sm = difflib.SequenceMatcher(None, [x[0] for x in a], [x[0] for x in b], autojunk=False)
        n = 0
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            for k in range(i2 - i1 if tag == "equal" else 0):
                x, y = a[i1 + k][1], b[j1 + k][1]
                if re.sub(r"[A-Za-z0-9-]", "", x) != re.sub(r"[A-Za-z0-9-]", "", y):
                    n += 1
                    ctx = " ".join(t[0] for t in a[max(0, i1 + k - 2):i1 + k])
                    if not known((stream + " punct", x, y, ctx)):
                        left.append((stream + " punct", "", x, y, ctx))
        counts[stream + " punct"] = n

    for stream, (ours_text, part) in streams.items():
        a = _genie_words(ours_text)
        texts = [_genie_text(p[part]) for p in gp.values()]
        for k in range(1, len(texts)):       # a word broken across the page break
            m = re.match(r"\s*([a-z]\S*)\s*", texts[k])
            if m and re.search(r"[A-Za-z]-$", texts[k - 1].rstrip()):
                texts[k - 1], texts[k] = texts[k - 1].rstrip()[:-1] + m.group(1), texts[k][m.end():]
        punct(stream, ours_text, "\n".join(texts))
        b, bpage = [], []
        for n, t in zip(gp, texts):
            ws = _genie_words(t)
            b += ws
            bpage += [n] * len(ws)
        bpage.append(LAST_PAGE)
        ops = [o for o in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if o[0] != "equal"]
        n_ops = 0
        for tag, i1, i2, j1, j2 in ops:
            near = set().union(*(numerals.get(n, set()) for n in range(bpage[j1] - 1, bpage[j1] + 2)))
            if stream == "text" and i1 == i2 and all(w in near for w in b[j1:j2]):
                margins += j2 - j1
                continue
            n_ops += 1
            ours, theirs, ctx = " ".join(a[i1:i2]), " ".join(b[j1:j2]), " ".join(a[max(0, i1 - 2):i1])
            if not known((stream, ours, theirs, ctx)):
                left.append((stream, f"p{bpage[j1]}", ours, theirs, ctx))
        counts[stream] = (len(a), len(b), n_ops)
    kinds = {}
    for k in used:
        kinds[GENIE_KNOWN[k][4]] = kinds.get(GENIE_KNOWN[k][4], 0) + 1
    print(f"[genie] text {counts['text'][0]} words here, {counts['text'][1]} in Genie; notes {counts['notes'][0]} here, "
          f"{counts['notes'][1]} in Genie; {margins} margin numerals Genie keeps in a line; "
          f"{counts['text'][2] + counts['notes'][2]} word and {counts['text punct'] + counts['notes punct']} punctuation "
          f"differences, {len(used)} in GENIE_KNOWN, each checked on the image ("
          + ", ".join(f"{v} {k}" for k, v in sorted(kinds.items())) + ")")
    for stream, page, ours, theirs, ctx in left:
        print(f"[genie]   NOT ACCOUNTED FOR: {stream} {page} here [{ours}] Genie [{theirs}] after '{ctx}'")
    stale = [GENIE_KNOWN[k] for k in range(len(GENIE_KNOWN)) if k not in used]
    for g in stale:
        print(f"[genie]   GENIE_KNOWN entry matched nothing: {g}")
    if left or stale:
        raise SystemExit("Genie comparison: unexplained differences")


def check_hyphens() -> None:
    from collections import Counter
    c = Counter((h[2], h[3]) for h in _HYPHEN_LOG)
    print(f"[hyphens] {len(_HYPHEN_LOG)} words broken at a line end: "
          f"kept {c[(True, 'print')]} by the print's own usage, {c[(True, 'gutenberg')]} by Gutenberg; "
          f"closed {c[(False, 'print')]} by the print, {c[(False, 'gutenberg')]} by Gutenberg, "
          f"{c[(False, 'neither')]} with no evidence either way (listed)")
    print("[hyphens]   " + ", ".join(f"p{h[0]} {h[1]}" for h in _HYPHEN_LOG if h[3] == "neither"))


def main() -> None:
    pages = load_hocr()
    print(f"[hocr] {len(pages)} pages, {FIRST_PAGE}..{LAST_PAGE}; {len(READS)} READS; {len(MARGINS)} MARGINS; {len(ANCHORS)} ANCHORS")
    prose, foot = assemble(pages)
    starts = locate_anchors(prose)
    text, splits = book_html(prose, starts)
    OUT.mkdir(parents=True, exist_ok=True)
    book = OUT / "book-01.html"
    book.write_text(text, encoding="utf-8")
    (OUT / "footnotes.json").write_text(
        json.dumps({str(k): t for k, t in enumerate(foot, 1)}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (OUT / "anchors.yaml").write_text(anchors_yaml(), encoding="utf-8")
    print(f"[write] {book.relative_to(ROOT)} ({text.count(chr(10))} lines), footnotes.json ({len(foot)}), anchors.yaml ({len(ANCHORS)})")
    print(f"[parts] Part lines that split a printed paragraph: {splits or 'none'}")
    ch = check_parse(book, starts, text)
    check_anchors(ch, starts)
    check_margins(pages, prose, starts)
    check_notes(prose, foot)
    check_misprints(prose, foot)
    check_hyphens()
    check_gutenberg(prose)
    check_punctuation(prose)
    check_genie(prose, foot)


# ---------------------------------------------------------------- tables

# Verse blocks: (page, first-line prefix or None = from the page top,
# last-line prefix or None = to the page foot).
VERSE = [
    (375, 'I behold, and within', 'Slain by the sword.'),
    (375, 'But ye who have store', 'ever obey.'),
    (378, 'The son of Diphilus', 'For his promotion a thank-offering.'),
    (381, 'I gave to the mass', 'triumph was not with right.'),
    (381, 'But thus will the people', None),
    (382, None, 'balanced soul.'),
    (382, 'So they came in search', 'our race.'),
    (382, 'Of all the aims', None),
    (383, None, 'Turning at bay like wolf among the hounds.'),
    (383, 'Nay, if one must lay blame', 'Should praise me and should court me as their friend.'),
    (383, 'He had not kept the people back, nor ceased', 'And barred the foes from battle.'),
    (391, 'Ah! Lipsydrium', 'Of noble sires a noble seed.'),
    (393, 'Pour a health yet again', 'man and true.'),
]

# (hOCR page, OCR reading, printed reading, note). Applied in order to the page's
# body + notes; each OCR reading must occur exactly once when applied. 'img:'
# notes say what the page image shows; 'GB' gives Project Gutenberg #26095.
READS = [
    # p371
    (371, '...[They? were', '...[They[^1] were', "img: superscript 1 after 'They'; GB no notes"),
    (371, 'expiation 2,', 'expiation[^2],', 'img: superscript 2 before the comma'),
    (371, 'Pelatae', 'Pelătae', 'img: breve on a; GB Pelatae'),
    (371, 'Hectémori,?', 'Hectēmŏri,[^3]', 'img: macron e, breve o, superscript 3; GB Hectemori'),
    (371, 'Draco. ae', 'Draco.', "img: no 'ae' (speck)"),
    (371, 'interpretation. ;', 'interpretation.', "img: no ';' (speck)"),
    (371, 'landlords, ;', 'landlords.', 'img: full stop'),
    # p372
    (372, 'Nowthe', 'Now the', "img: two words; GB 'Now the'"),
    (372, 'of ten years! The', 'of ten years.[^1] The', 'img: full stop then superscript 1'),
    (372, 'Ion ? was', 'Ion[^2] was', 'img: superscript 2'),
    (372, 'Acastus,? and', 'Acastus,[^3] and', 'img: superscript 3 after comma'),
    (372, '1066 B.C, With', '1066 B.C. With', 'img: full stop'),
    (372, 'been transferred, This', 'been transferred. This', 'img: full stop'),
    (372, 'was.said', 'was said', 'img: speck, no stop'),
    # p373
    (373, 'Thesmothétae! were', 'Thesmothĕtae[^1] were', "img: breve e, superscript 1; GB 'Thesmothetae were appointed'"),
    (373, 'Prytanéum,', 'Prytanēum,', 'img: macron e; GB Prytaneum'),
    (373, 'Dionysus? takes', 'Dionysus[^2] takes', 'img: superscript 2'),
    (373, 'Epilycéum.', 'Epilycēum.', 'img: macron e; GB Epilyceum'),
    (373, 'Polemarchéum,', 'Polemarchēum,', 'img: macron e; GB Polemarcheum'),
    (373, 'Thesmothetéum.', 'Thesmothetēum.', 'img: macron e; GB Thesmotheteum'),
    (373, 'all’came', 'all came', "img: speck between words; GB 'all came'"),
    (373, 'hold 2 preliminary', 'hold a preliminary', "img: 'a'; GB 'a'"),
    # p374
    (374, 'Aristaichmus,! Draco', 'Aristaichmus,[^1] Draco', 'img: superscript 1 after comma'),
    (374, '[Stratégi]', '[Stratēgi]', 'img: macron e; GB (Strategi)'),
    (374, 'the Prytanes,', 'the Prytănes,', 'img: breve a; GB Prytanes'),
    (374, 'au‘ited,', 'audited,', "img: 'audited' (broken d); GB audited"),
    (374, 'magistracies? the', 'magistracies[^2] the', 'img: superscript 2'),
    (374, 'Pentacosiomedimnus,? two', 'Pentacosiomedimnus,[^3] two', 'img: superscript 3 after comma'),
    (374, 'is}not', 'is not', 'img: speck between words'),
    (374, 'not the case. :', 'not the case.', 'img: no colon (speck)'),
    (374, 'by lot which', 'by lot, which', "img: comma after 'lot' at the line end; OCR dropped it (Genie 'lot,')"),
    (374, 'ch, 7, 4.', 'ch. 7, 4.', 'img: full stop after ch'),
    # p375
    (375, 'the laws.= Any', 'the laws. Any', "img: a smudge after 'laws.', not a numeral (page has 3 notes, all placed)"),
    (375, 'before,! loans', 'before,[^1] loans', 'img: superscript 1'),
    (375, 'for along time', 'for a long time', "img: two words; GB 'a long'"),
    (375, 'last,? by', 'last,[^2] by', 'img: superscript 2'),
    (375, 'Slain by the sword.', 'Slain by the sword.[^3]', 'img: superscript 3 after the stop; OCR dropped it'),
    (375, 'sated_and’overflow,', 'sated and overflow,', "img: specks between words; GB 'sated and overflow'"),
    (375, '#1 em ly', '#1 Ch. 2, 2.', "img: note 1 reads 'Ch. 2, 2.'; OCR garbled"),
    (375, '(de Fads. Leg.', '(de Fals. Leg.', "img: 'de Fals. Leg.' (italic)"),
    (375, 'quoted ~ just', 'quoted just', 'img: no tilde (speck)'),
    # p376
    (376, 'this accusation to be false,', 'this accusation to be false.', 'img: full stop'),
    # p377
    (377, 'stands,! and', 'stands,[^1] and', 'img: superscript 1'),
    (377, 'stone,’ declaring', 'stone,[^2] declaring', 'img: superscript 2'),
    (377, 'Thetes.? Thevarious', 'Thetes.[^3] The various', "img: superscript 3; 'The various' two words, tight; GB 'The various'"),
    (377, '[Polétae],', '[Polētae],', 'img: macron e; GB (Poletae)'),
    (377, 'Eleven,* and', 'Eleven,[^4] and', 'img: superscript 4'),
    (377, '[Colacrétae],°he', '[Colacrĕtae],[^5] he', "img: breve e, superscript 5 then 'he'; GB (Colacretae) he"),
    (377, 'Diphilus,° bearing', 'Diphilus,[^6] bearing', 'img: superscript 6'),
    (377, '#1 j,e.', '#1 i.e.', "img: 'i.e.'"),
    (377, '#2 a Seerch. 55,.5-', '#2 See ch. 55, 5.', "img: 'See ch. 55, 5.'"),
    (377, 'ch. 52, I.', 'ch. 52, 1.', 'img: old-style figure 1'),
    (377, 'own day. :', 'own day.', 'img: no colon (speck)'),
    # p378
    (378, 'Atthe sametime it seemsreasonable', 'At the same time it seems reasonable', "img: tight spacing, five words; GB 'At the same time it seems reasonable'"),
    (378, 'Pentacosiomedimni.! Such', 'Pentacosiomedimni.[^1] Such', 'img: superscript 1'),
    (378, 'Areopagus* summoned', 'Areopagus[^2] summoned', 'img: superscript 2'),
    (378, 'ch. 47, I,', 'ch. 47, 1,', 'img: old-style figure 1'),
    (378, 'time of Solon, The elections', 'time of Solon. The elections', 'img: full stop'),
    # p379
    (379, 'Naucraries! in', 'Naucraries[^1] in', 'img: superscript 1'),
    (379, 'called Naucrari,', 'called Naucrāri,', 'img: macron a; GB Naucrari'),
    (379, 'expendi‘ture.', 'expenditure.', "img: speck before 'ture' at line start; GB expenditure"),
    (379, 'Tt also', 'It also', "img: 'It'; GB It"),
    (379, 'ina time', 'in a time', "img: two words; GB 'in a time'"),
    (379, 'sot as created', 'not as created', "img: 'not' (damaged n)"),
    (379, 'four tribes. as', 'four tribes, as', 'img: comma (a speck beside it); found by the punctuation comparison'),
    # p380
    (380, 'full hundred.’ The', 'full hundred.[^1] The', 'img: superscript 1'),
    (380, 'other values.”', 'other values.[^2]', 'img: superscript 2'),
    (380, 'hadcompleted', 'had completed', "img: tight spacing; GB 'had completed'"),
    # p381
    (381, 'their. greed', 'their greed', "img: speck after 'their'"),
    (381, 'cither', 'either', "img: 'either'; GB either"),
    (381, 'obey, é,', 'obey,', 'img: no second token (speck)'),
    # p382
    (382, 'pillars! broadcast', 'pillars[^1] broadcast', 'img: superscript 1'),
    # p383
    (383, 'goad as JI,', 'goad as I,', "img: 'I,'"),
    (383, "Archon;' and hegoverned for twoyears", 'Archon;[^1] and he governed for two years', "img: superscript 1 after semicolon; tight spacing; GB 'he governed for two years'"),
    (383, 'elapsed ’, 2 ; eae lite', 'elapsed’.', 'img: closing quote, full stop; rest is specks'),
    # p384
    (384, 'Demiurgi;’ and', 'Demiurgi;[^1] and', 'img: superscript 1 after semicolon'),
    (384, 'apprehension.” A', 'apprehension.[^2] A', 'img: superscript 2'),
    (384, 'him a bodyguard, After', 'him a bodyguard. After', "img: full stop; GB 'bodyguard. After'"),
    (384, 'these ‘club-bearers’', 'these ‘club-bearers’,', 'img: comma after the quote (OCR read it as a detached speck)'),
    (384, '#1 Eupatridae=the aristocrats, Agroeci=the country, or agricultural, party, Demiurgi=the handworkers', '#1 Eupatridae = the aristocrats, Agroeci = the country, or agricultural, party, Demiurgi = the handworkers', "img: note 1; '=' set with thin spaces"),
    # p385
    (385, 'rest,-—wiser', 'rest,—wiser', "img: long dash (two rules) after the comma; GB 'rest--wiser'"),
    (385, 'hisrule.', 'his rule.', "img: two words; GB 'his rule'"),
    (385, 'later! Megacles', 'later[^1] Megacles', 'img: superscript 1'),
    (385, '‘found a woman', 'found a woman', 'img: no quote mark (speck at line start)'),
    (385, 'named Phyé', 'named Phyë', 'img (zoomed): diaeresis on e; GB Phye'),
    (385, 'assigned-to', 'assigned to', 'img: speck between words'),
    (385, 'his . third', 'his third', 'img: speck'),
    (385, 'Fora statement', 'For a statement', 'img: two words'),
    (385, 'ad /oc,', 'ad loc.', "img: italic 'ad loc.'"),
    # p383
    (383, 'grumblings in the 5 times', 'grumblings in the times', 'margin numeral 5 inside the OCR line (verse page skews the edge fit)'),
    (385, 'Acropolis, This', 'Acropolis. This', 'img: full stop'),
    (385, 'silence, But', 'silence. But', 'img: full stop'),
    (385, 'the same, Solon’s', 'the same. Solon’s', 'img: full stop'),
    # p386
    (386, 'Paeania', 'Paeānia', 'img: macron a; GB Paeania'),
    (386, 'ina garb', 'in a garb', "img: two words; GB 'in a'"),
    (386, 'Inthis manner', 'In this manner', "img: two words; GB 'In this'"),
    (386, 'a place’ called', 'a place called', "img: speck after 'place'"),
    (386, 'Rhaicélus,', 'Rhaicēlus,', 'img: macron e; GB Rhaicelus'),
    (386, 'Lygdamis of Naxos', 'Lygdămis of Naxos', 'img: breve a (first mention only); GB Lygdamis'),
    (386, 'Palléné', 'Pallēnē', 'img: macron on both e; GB Pallene'),
    (386, 'Theséum,', 'Thesēum,', 'img: macron e; GB Theseum'),
    # p387
    (387, 'justices,’ and', 'justices,[^1] and', 'img: superscript 1'),
    (387, 'ch. $3, 1,', 'ch. 53, 1,', "img: '53'"),
    (387, 'thorough. cultivation', 'thorough cultivation', 'img: speck, no stop'),
    # p388
    (388, 'Philoneos,! three', 'Philoneos,[^1] three', 'img: superscript 1'),
    (388, 'legitimate * wife', 'legitimate[^2] wife', 'img: superscript 2'),
    (388, 'lophon', 'Iophon', 'img: capital I; GB Iophon'),
    (388, 'Hegesistratus, who', 'Hegesistrătus, who', 'img: breve a; GB Hegesistratus'),
    (388, '#1 BS a7ebuC.', '#1 527 B.C.', "img: '527 B.C.'"),
    (388, 'hearts) of', 'hearts of', 'img: speck, no bracket'),
    # p389
    (389, 'Gorgilus', 'Gorgīlus', 'img: macron i; GB Gorgilus'),
    (389, 'Archinus', 'Archīnus', 'img: macron i; GB Archinus'),
    (389, 'Cypsélus,', 'Cypsĕlus.', "img: breve e, full stop; GB 'Cypselus. This'"),
    (389, 'the house.! He', 'the house.[^1] He', 'img: superscript 1'),
    (389, 'confederates,? But', 'confederates.[^2] But', "img: full stop and superscript 2; GB 'confederates. But'"),
    (389, 'to blame. , :', 'to blame.', 'img: specks'),
    (389, 'silently ‘but', 'silently but', 'img: speck'),
    # p390
    (390, 'Leocoréum', 'Leocorēum', 'img: macron e; GB Leocoreum'),
    (390, 'for the’ current', 'for the current', "img: speck at the line end after 'the'"),
    (390, 'story,! that', 'story,[^1] that', 'img: superscript 1'),
    # p391
    (391, 'position inthe city', 'position in the city', "img: two words; GB 'in the'"),
    (391, 'Delphi,’ thereby', 'Delphi,[^1] thereby', 'img: superscript 1'),
    (391, '#1 1The temple', '#1 The temple', 'note numeral fused to the first word'),
    # p392
    (392, 'Harpactides, after', 'Harpactides,[^1] after', 'img: superscript 1; OCR dropped it'),
    (392, 'pollution ’,? a', 'pollution’,[^2] a', 'img: superscript 2 after quote and comma'),
    (392, 'Athenians, While', 'Athenians. While', 'img: period; OCR read a comma'),
    (392, 'were -supposed', 'were supposed', "img: speck; GB 'suppposed' (sic)"),
    # p393
    (393, 'Isagoras,! his', 'Isagoras,[^1] his', 'img: superscript 1'),
    (393, 'franchise.* From', 'franchise.[^2] From', 'img: superscript 2'),
    (393, 'families? Next', 'families.[^3] Next', 'img: full stop and superscript 3'),
    (393, '#1 aa OO BGs', '#1 508 B.C.', "img: '508 B.C.'"),
    (393, 'connected with them,', 'connected with them.', 'img: full stop'),
    # p394
    (394, 'twelve.tribes', 'twelve tribes', 'img: speck between words'),
    (394, 'demes,! ten', 'demes,[^1] ten', 'img: superscript 1'),
    (394, 'demes ;* and', 'demes;[^2] and', 'img: superscript 2 after semicolon'),
    (394, 'oftheir', 'of their', "img: tight spacing; GB 'of their'"),
    (394, 'oneanother.', 'one another.', "img: tight spacing; GB 'one another'"),
    (394, 'Naucrarii—the', 'Naucrari,—the', "img: comma then dash; GB 'Naucrari--the'"),
    (394, '#2 Ifthe', '#2 If the', 'img: two words'),
    (394, 'that _the new', 'that the new', 'img: no mark'),
    (394, 'heroes,\n\nBy', 'heroes.\n\nBy', 'img: full stop'),
    # p395
    (395, 'Four years! after', 'Four years[^1] after', 'img: superscript 1'),
    (395, 'of Telesinus,” they', 'of Telesinus,[^2] they', 'img: superscript 2'),
    (395, 'to say. . ;', 'to say.', 'img: specks'),
    (395, '487 B.C. ‘The date', '487 B.C. The date', 'img: no quote mark'),
    # p396
    (396, 'hundred! candidates', 'hundred[^1] candidates', 'img: superscript 1'),
    (396, 'vote;? and', 'vote;[^2] and', 'img: superscript 2'),
    (396, 'Alopécé, was', 'Alopĕcē, was', 'img: breve on first e, macron on last; GB Alopece'),
    (396, 'Nicodemus,? the', 'Nicodemus,[^3] the', 'img: superscript 3'),
    (396, "Hypsichides,'", 'Hypsichides,[^4]', 'img: superscript 4'),
    (396, '#4 57183) BrC, * 481 B.C.', '#4 483 B.C.\n#5 481 B.C.', "img: two notes on one line, '³ 483 B.C.' and '⁴ 481 B.C. The name of this Archon is new.'"),
    # p397
    (397, 'Scyllaeum,! on', 'Scyllaeum,[^1] on', 'img: superscript 1'),
    (397, 'of-the', 'of the', 'img: speck between words'),
    (397, 'insertion of 7) or the substitution of exrds for évrds.', 'insertion of μή or the substitution of ἐκτός for ἐντός.', 'img (zoomed): Greek μή, ἐκτός, ἐντός; OCR garbled'),
    (397, 'irrevocably,\n\nSo', 'irrevocably.\n\nSo', 'img: full stop'),
    # p398
    (398, 'from! the', 'from[^1] the', 'img: superscript 1'),
    (398, 'Timosthenes ;? and', 'Timosthenes;[^2] and', 'img: superscript 2 after semicolon'),
    (398, 'the sea.°', 'the sea.[^3]', 'img: superscript 3'),
    (398, 'some 7004 abroad', 'some 700[^4] abroad', "img: '700' then superscript 4; GB 700"),
    (398, 'guard-ships,’ and', 'guard-ships,[^5] and', 'img: superscript 5'),
    (398, 'at this time. x', 'at this time.', 'img: speck'),
    (398, '#2 E47 OUBnG:', '#2 478 B.C.', "img: '478 B.C.'"),
    (398, '(i. 16 5)', '(i. 165)', "img: '165'"),
    (398, '(Zod. xvi.', '(Epod. xvi.', "img: italic 'Epod.'"),
    # p399
    (399, 'Prytanéum,', 'Prytanēum,', 'img: macron e; GB Prytaneum'),
    (399, 'Conon,! he', 'Conon,[^1] he', 'img: superscript 1'),
    (399, 'Themistocles,2 who', 'Themistocles,[^2] who', 'img: superscript 2'),
    (399, '462 B.C. ; ;', '462 B.C.', 'img: specks'),
    # p400
    (400, 'subvert.the', 'subvert the', "img: speck between words; GB 'subvert the'"),
    (400, 'until?they', 'until they', "img: speck between words; GB 'until they'"),
    (400, 'Aristodicus', 'Aristodĭcus', 'img: breve i; GB Aristodicus'),
    (400, 'young man}, and', 'young man[^1], and', 'img: superscript 1 before the comma (spaced)'),
    (400, '(e. g. voOpor, ‘sluggish’, for vedrepoy)', '(e.g. νωθρόν, ‘sluggish’, for νεώτερον)', 'img (zoomed): Greek νωθρόν, νεώτερον; OCR garbled'),
    # p401
    (401, 'classes! The', 'classes.[^1] The', 'img: full stop and superscript 1'),
    (401, 'Mnesitheides.? Up', 'Mnesitheides.[^2] Up', 'img: superscript 2'),
    (401, 'Lysicrates,* the', 'Lysicrates,[^3] the', 'img: superscript 3'),
    (401, 'justices’,4 as', 'justices’,[^4] as', 'img: superscript 4'),
    (401, 'Antidotus,> in', 'Antidotus,[^5] in', 'img: superscript 5'),
    (401, 'PythodoGrus,®', 'Pythodōrus,[^6]', 'img: macron o, superscript 6; GB Pythodorus'),
    (401, 'theadministration', 'the administration', "img: tight spacing; GB 'the administration'"),
    (401, 'law-courts, asa bid', 'law-courts, as a bid', "img: two words; GB 'as a'"),
    (401, '#1 Tt is', '#1 It is', "img: 'It'"),
    (401, '#3 WAS SeBaes 4 See chapters 16, 5 and 53, I. PAs BuC', '#3 453 B.C.\n#4 See chapters 16, 5 and 53, 1.\n#5 451 B.C.', "img: three notes on one line: '³ 453 B.C.', '⁴ See chapters 16, 5 and 53, 1.', '⁵ 451 B.C.'"),
    (401, '432-1 B,C.;', '432–1 B.C.;', "img: en dash, 'B.C.'"),
    (401, '431 B,C.', '431 B.C.', "img: 'B.C.'"),
    # p402
    (402, 'Laciadae', 'Laciădae', 'img: breve a; GB Laciadae'),
    (402, 'their» own', 'their own', 'img: speck in the margin'),
    (402, 'Pylos.! He', 'Pylos.[^1] He', 'img: superscript 1'),
    (402, 'the people,? in', 'the people,[^2] in', 'img: superscript 2'),
    # p403
    (403, 'Alemeonidae;', 'Alcmeonidae;', "img: 'Alcmeonidae'; GB Alcmeonidae"),
    (403, 'Bema,’ and', 'Bema,[^2] and', 'img: superscript 2'),
    (403, 'performances,’ and', 'performances,[^3] and', 'img: superscript 3'),
    (403, 'by the state,', 'by the state.', 'img: full stop'),
    (403, '\n#4 645-20 D', '', "signature line '645.20 D' taken as a note"),
    (403, 'Aristides, and after', 'Aristides,[^1] and after', 'img: superscript 1; OCR dropped it'),
    (403, 'tyrants. there', 'tyrants there', 'img: speck, no stop'),
    # p404
    (404, 'Safety,’ after', 'Safety,[^1] after', 'img: superscript 1'),
    (404, 'also ‘statesmen', 'also statesmen', 'img: speck, no quote mark'),
    # p405
    (405, "Prytanes ' should", 'Prytanes[^1] should', 'img: superscript 1'),
    (405, 'impeach‘ments', 'impeachments', "img: line-end hyphen 'impeach-/ments' read as a quote; GB impeachments"),
    (405, 'Eleven? to', 'Eleven[^2] to', 'img: superscript 2'),
    (405, 'overforty', 'over forty', "img: tight spacing; GB 'over forty'"),
    (405, 'ona full', 'on a full', "img: two words; GB 'on a'"),
    (405, 'Thousand ?® elected', 'Thousand[^3] elected', 'img: superscript 3'),
    (405, '#1 See ch. : 2 See ch. 52, I. ees', '#1 See ch. 43, 4.\n#2 See ch. 52, 1.', "img: two notes on one line, '¹ See ch. 43, 4.' and '² See ch. 52, 1.'"),
    (405, '#2 . This pec of', '#3 This mention of', "img: '³ This mention of'"),
    (405, 'ch, 32, 3,', 'ch. 32, 3,', 'img: full stop after ch'),
    (405, 'the F ive Thousand', 'the Five Thousand', 'img: one word'),
    # p406
    (406, 'Ampbhictyonic', 'Amphictyonic', "img: 'Amphictyonic'; GB Amphictyonic"),
    (406, '[Hieromnemon],’ the', '[Hieromnemon],[^1] the', 'img: superscript 1'),
    (406, 'Phylarchs,? the', 'Phylarchs,[^2] the', 'img: superscript 2'),
    (406, '[Hellenotamiae],* the', '[Hellenotamiae],[^3] the', 'img: superscript 3'),
    (406, 'Sacrifices [ Hieropoei],', 'Sacrifices [Hieropoei],', 'img: no space after bracket'),
    (406, 'Council. As regards', 'Council.[^4] As regards', 'img: superscript 4; OCR dropped it'),
    (406, 'were to bé', 'were to be', "img: 'be'; GB be"),
    (406, 'the rest. being. to advise and superintend, .', 'the rest being to advise and superintend.', "img: specks after 'rest' and 'being'; full stop"),
    # p407
    (407, 'rest! as', 'rest[^1] as', 'img: superscript 1'),
    (407, 'fora year', 'for a year', "img: two words; GB 'for a'"),
    (407, 'They? were', 'They[^2] were', 'img: superscript 2'),
    (407, 'theirability. Ifthey', 'their ability. If they', "img: tight spacing; GB 'their ability. If they'"),
    (407, 'theancient constitution,®', 'the ancient constitution,[^3]', "img: tight spacing, superscript 3; GB 'the ancient'"),
    (407, '#1 i,e.,', '#1 i.e.,', "img: 'i.e.,'"),
    (407, '(Classtcal Quarterly)', '(Classical Quarterly)', "img: italic 'Classical Quarterly'"),
    (407, '#3 je. as', '#3 i.e. as', "img: 'i.e.'"),
    # p408
    (408, 'éxamination', 'examination', 'img: plain e; GB examination'),
    (408, 'generrally,', 'generally,', "img: 'gener-/ally' (margin numeral beside 'ally'); GB generally"),
    (408, 'Thousand! was', 'Thousand[^1] was', 'img: superscript 1'),
    (408, 'Phylarchs;’', 'Phylarchs;', 'img: speck in the margin'),
    (408, 'distribution? of', 'distribution[^2] of', 'img: superscript 2'),
    (408, 'join inthe Council', 'join in the Council', "img: tight spacing; GB 'in the'"),
    (408, 'Callias,? was', 'Callias,[^3] was', 'img: superscript 3'),
    (408, '#2 ie, the distribution', '#2 i.e. the distribution', "img: 'i.e.'"),
    (408, 'to"be', 'to be', 'img: speck'),
    (408, '(viz.the', '(viz. the', "img: 'viz.' then 'the' (tight)"),
    (408, '#3 M Callias’', '#3 Callias’', "img: no 'M' (speck)"),
    (408, 'itsend.', 'its end.', 'img: two words'),
    # p409
    (409, 'Scirophorion.! Thus', 'Scirophorion.[^1] Thus', 'img: superscript 1'),
    (409, 'conferred,” occupied', 'conferred,[^2] occupied', 'img: superscript 2'),
    (409, 'Oréum,', 'Orēum,', 'img: macron e; GB Oreum'),
    (409, '{n retaining', 'in retaining', "img: 'in'; GB in"),
    (409, '#2 i.e, the ten', '#2 i.e. the ten', "img: 'i.e.'"),
    # p410
    (410, 'equipment.’', 'equipment.[^1]', 'img: superscript 1'),
    (410, 'government.’ Then', 'government.[^2] Then', 'img: superscript 2'),
    (410, 'Angélé,’ the', 'Angĕlē,[^3] the', "img: 'Angĕlē' breve then macron, superscript 3; GB Angele"),
    (410, 'all* condemned', 'all[^4] condemned', 'img: superscript 4'),
    (410, 'part in, the', 'part in the', 'img: the comma is a speck in the margin'),
    (410, 'vessels.> Secondly', 'vessels.[^5] Secondly', 'img: superscript 5'),
    (410, 'Deceléa', 'Decelēa', 'img: macron e; GB Decelea'),
    (410, 'breastplate,®', 'breastplate,[^6]', 'img: superscript 6'),
    (410, 'them.’ They', 'them.[^7] They', 'img: superscript 7'),
    (410, '#3 $406', '#3 406', "img: no '$' (note numeral)"),
    (410, '‘Two of the generals', 'Two of the generals', 'img: no quote mark'),
    (410, '#5 > And', '#5 And', "img: '>' is the note numeral"),
    # p411
    (411, 'Archinus,', 'Archīnus,', 'img: macron i; GB Archinus'),
    (411, 'clubs,! together', 'clubs,[^1] together', 'img: superscript 1'),
    (411, 'Pythodorus.2— As', 'Pythodorus.[^2] As', 'img: superscript 2, no dash'),
    (411, 'constitution,? but', 'constitution,[^3] but', 'img: superscript 3'),
    (411, 'candidates,t and', 'candidates,[^4] and', 'img: superscript 4'),
    (411, '‘Jash-bearers’', '‘lash-bearers’', "img: 'lash-bearers'; GB lash-bearers"),
    (411, '#1 i.e. the extreme oligarchs. 2 The year 404-403 B.C,', '#1 i.e. the extreme oligarchs.\n#2 The year 404–403 B.C.', 'img: two notes on one line; en dash; full stop'),
    (411, '#2 The Thirty', '#3 The Thirty', 'renumber after the split'),
    (411, '#3 MS.', '#4 MS.', 'renumber after the split'),
    # p412
    (412, 'obscure," and', 'obscure,[^1] and', 'img: superscript 1'),
    (412, 'accusers.? In', 'accusers.[^2] In', 'img: superscript 2'),
    (412, 'fifteen hundred persons,', 'fifteen hundred persons.', 'img: full stop; GB persons.'),
    (412, 'government, At', 'government. At', 'img: full stop; GB government. At'),
    (412, '#1 Beoee ChaO a2.', '#1 See ch. 9, 2.', "img: '¹ See ch. 9, 2.'"),
    # p413
    (413, 'thousand! citizens', 'thousand[^1] citizens', 'img: superscript 1'),
    (413, 'ail merit', 'all merit', "img: 'all'; GB all"),
    (413, 'Thrasybilus', 'Thrasybūlus', 'img: macron u; GB Thrasybulus'),
    (413, 'Phylé,', 'Phylē,', 'img: macron e; GB Phyle'),
    (413, 'Eétioneia,?', 'Eëtioneia,[^2]', 'img: diaeresis on the second e, superscript 2; GB Eetioneia'),
    (413, 'Hundred. who', 'Hundred who', "img: speck after Hundred; GB 'Hundred who'"),
    (413, 'asthe Three', 'as the Three', 'img: tight spacing'),
    # p414
    (414, 'franchiseand', 'franchise and', "img: tight spacing; GB 'franchise and'"),
    (414, 'todeath.1 Theramenes', 'to death.[^1] Theramenes', 'img: tight spacing, superscript 1'),
    (414, 'atermination.', 'a termination.', "img: two words; GB 'a termination'"),
    (414, 'Demarétus,', 'Demarĕtus,', 'img: breve e; GB Demaretus'),
    (414, 'populace’to', 'populace to', 'img: speck after populace'),
    (414, 'Ten,’ consisting', 'Ten,[^2] consisting', 'img: superscript 2'),
    (414, '(ii. 3. 23-56)', '(ii. 3. 23–56)', 'img: en dash'),
    # p415
    (415, 'ten! commissioners', 'ten[^1] commissioners', 'img: superscript 1'),
    (415, 'Eucleides,?', 'Eucleides,[^2]', 'img: superscript 2'),
    (415, 'Ceryces', 'Cerȳces', 'img: macron y; GB Ceryces'),
    (415, 'Eumolpidae,®', 'Eumolpidae,[^3]', 'img: superscript 3'),
    (415, 'sepeuntend’ng. the Eleusinian mysteries, See ch. 57, 1', 'superintending the Eleusinian mysteries. See ch. 57, 1.', "img: 'superintending the Eleusinian mysteries. See ch. 57, 1.'"),
    # p416
    (416, 'allowed to do 480. The list', 'allowed to do so. The list', "img: 'so.' (margin numeral 4 beside it); GB 'to do so'"),
    (416, 'ancestral practice! There', 'ancestral practice.[^1] There', 'img: full stop, superscript 1'),
    (416, 'in the city.” On these', 'in the city.[^2] On these', 'img: superscript 2'),
    (416, 'willdo, Archinus, observing theirnumbers,', 'will do, Archīnus, observing their numbers,', "img: tight spacing; macron i; GB 'will do, Archinus, observing their numbers'"),
    (416, '(inserting ev ro dore: after év rots),', '(inserting ἐν τῷ ἄστει after ἐν τοῖς).', 'img: Greek read from the image; full stop'),
    # p417
    (417, 'parties? making', 'parties[^1] making', 'img: superscript 1'),
    (417, 'Xenaenétus.?', 'Xenaenĕtus.[^2]', 'img: breve e, superscript 2; GB Xenaenetus'),
    (417, '#1 Or ‘ victorious democracies’ (reading of djpyor xparycarres),', '#1 Or ‘victorious democracies’ (reading οἱ δῆμοι κρατήσαντες).', "img: Greek read from the image ('of' is the OCR of οἱ); full stop"),
    (417, '#2 2401" BG; OE LE date is not elsewhere definitely recorded,', '#2 401 B.C. The date is not elsewhere definitely recorded.', "img: '² 401 B.C. The date is not elsewhere definitely recorded.'"),
    # p418
    (418, 'Pythodérus', 'Pythodōrus', 'img: macron o; GB Pythodorus'),
    (418, 'exertions.1 This', 'exertions.[^1] This', 'img: superscript 1'),
    (418, 'constitution,’ was', 'constitution,[^2] was', 'img: superscript 2'),
    (418, '#2 ® This', '#2 This', "img: '®' is the note numeral"),
    # p419
    (419, 'Agyrrhius} in', 'Agyrrhius,[^1] in', 'img: comma, superscript 1'),
    (419, 'Clazomenae,” nicknamed', 'Clazomenae,[^2] nicknamed', 'img: superscript 2'),
    (419, 'eighteen, On', 'eighteen. On', 'img: full stop; GB eighteen. On'),
    (419, 'require.? Then', 'require.[^3] Then', 'img: superscript 3'),
    (419, '/cc/es/azusae', 'Ecclesiazusae', "img: italic 'Ecclesiazusae'"),
    (419, 'before that date. ; see', 'before that date.', "img: specks after 'date.'"),
    (419, 'the /on attributed', 'the Ion attributed', "img: italic 'Ion'"),
    (419, 'at Athens. e', 'at Athens.', 'img: speck'),
    (419, '#3 je. whether', '#3 i.e. whether', "img: 'i.e.'"),
    # p420
    (420, '[ Ephébi]', '[Ephēbi]', "img: '[Ephēbi]' macron e; GB (Ephebi)"),
    (420, 'shore.1 The', 'shore.[^1] The', 'img: superscript 1'),
    (420, 'theatre,” they', 'theatre,[^2] they', 'img: superscript 2'),
    (420, 'state,® or', 'state,[^3] or', 'img: superscript 3'),
    (420, '#1 ’Axry =', '#1 Ἀκτή =', 'img: Greek read from the image'),
    (420, '#2 ® This', '#2 This', "img: '®' is the note numeral"),
    # p421
    (421, "family.'. When", 'family.[^1] When', 'img: superscript 1'),
    (421, 'fund,? and', 'fund,[^2] and', 'img: superscript 2'),
    (421, 'Springs.? These', 'Springs.[^3] These', 'img: superscript 3'),
    (421, 'next.4 All', 'next.[^4] All', 'img: superscript 4'),
    (421, 'lunar years, The', 'lunar years.[^5] The', 'img: full stop, superscript 5'),
    (421, 'Tholus,® and', 'Tholus,[^6] and', 'img: superscript 6'),
    (421, 'her or,to provide', 'her or to provide', "img: speck after 'or'"),
    (421, 'similar conditions, These', 'similar conditions. These', 'img: full stop'),
    (421, '‘families’ in” the', '‘families’ in the', "img: speck after 'in'"),
    (421, 'See ch, 21, 6', 'See ch. 21, 6', 'img: full stop after ch'),
    (421, '#7 © The official', '#7 The official', "img: '©' is the note numeral"),
    # p422
    (422, 'wards of state, so that', 'wards of state,[^1] so that', 'img: superscript 1; OCR dropped it'),
    (422, '#1 ‘If there', '#1 If there', 'img: no quote mark'),
    (422, 'recognized. ‘The claims', 'recognized. The claims', 'img: no quote mark'),
    # p423
    (423, 'Whenever. the', 'Whenever the', 'img: speck after Whenever'),
    (423, 'generally.} They', 'generally.[^1] They', 'img: superscript 1'),
    (423, 'prytany. __. Elections', 'prytany.\n\nElections', "img: new paragraph at 'Elections' (specks before it hid the indent)"),
    (423, 'case also.?', 'case also.[^2]', 'img: superscript 2'),
    (423, 'but * when', 'but[^3] when', 'img: superscript 3'),
    (423, 'Lysimachus* to', 'Lysimachus[^4] to', 'img: superscript 4'),
    (423, 'Alopécé', 'Alopĕcē', 'img: breve then macron e; GB Alopece'),
    (423, 'hands,> maintaining', 'hands,[^5] maintaining', 'img: superscript 5'),
    (423, '(Xen. He//. ii. 4, 8). _', '(Xen. Hell. ii. 4, 8).', "img: italic 'Hell.'; speck"),
    # p424
    (424, 'of law. Accordingly', 'of law.[^1] Accordingly', 'img: superscript 1; OCR dropped it'),
    (424, 'drum-head’;? and', 'drum-head’;[^2] and', 'img: superscript 2'),
    (424, 'Archons.® Formerly', 'Archons.[^3] Formerly', 'img: superscript 3'),
    (424, 'the _Assembly', 'the Assembly', 'img: speck'),
    (424, 'grounds.*', 'grounds.[^4]', 'img: superscript 4'),
    (424, 'sheds,® and', 'sheds,[^5] and', 'img: superscript 5'),
    (424, 'quadriremes,® whichever', 'quadriremes,[^6] whichever', 'img: superscript 6'),
    (424, '(dikacrnpiov)', '(δικαστήριον)', 'img: Greek read from the image'),
    (424, 'atranslation', 'a translation', 'img: tight spacing'),
    (424, 'denotesthat', 'denotes that', 'img: tight spacing'),
    (424, '#3 SES CG Big', '#3 See ch. 55, 2.', "img: '³ See ch. 55, 2.'"),
    (424, '#5 > i.e, the sheds in which the ships were laid up when in dock. -', '#5 i.e. the sheds in which the ships were laid up when in dock.', "img: 'i.e.'; specks"),
    # p425
    (425, 'Council} cannot', 'Council[^1] cannot', 'img: superscript 1'),
    (425, 'itsown', 'its own', "img: tight spacing; GB 'its own'"),
    (425, 'opinion that. the', 'opinion that the', 'img: speck in the margin'),
    (425, 'condemnation? hands', 'condemnation[^2] hands', 'img: superscript 2'),
    (425, 'Athena,’ ten', 'Athena,[^3] ten', 'img: superscript 3'),
    (425, '[Polétae]', '[Polētae]', 'img: macron e; GB (Poletae)'),
    (425, 'ch. 54, 7 aS 329', 'ch. 54, 7 as 329', "img: 'as'"),
    (425, 'parallel language. ;', 'parallel language.', 'img: speck'),
    (425, '(xarayvodca)', '(καταγνοῦσα)', 'img: Greek read from the image'),
    (425, '(dd:xeiy 66&)', '(ἀδικεῖν δόξῃ)', 'img: Greek read from the image; the iota subscript is faint'),
    (425, 'otiose..', 'otiose.', 'img: one full stop'),
    (425, 'Katayvovtos.', 'καταγνόντος.', 'img: Greek read from the image'),
    # p426
    (426, '‘ones, which', 'ones, which', "img: speck before 'ones'"),
    (426, 'let. under', 'let under', 'img: speck'),
    (426, '[ten?] years. They', '[ten?] years.[^1] They', 'img: superscript 1'),
    (426, 'isin', 'is in', "img: tight spacing; GB 'is in'"),
    (426, 'pigeon-holes? the', 'pigeon-holes[^2] the', 'img: superscript 2'),
    (426, '[| Apodectae]', '[Apodectae]', "img: '[Apodectae]'"),
    (426, 'Ifany', 'If any', "img: tight spacing; GB 'If any'"),
    # p427
    (427, 'member§,', 'members,', "img: 'members,'; GB members"),
    (427, '[Euthinus]', '[Euthūnus]', 'img: macron u; GB (Euthunus)'),
    (427, '|[Paredri]', '[Paredri]', "img: '[Paredri]'"),
    (427, 'hours,! each', 'hours,[^1] each', 'img: superscript 1'),
    (427, 'name ard that', 'name and that', "img: 'and'; GB and"),
    (427, 'ifs after', 'if after', "img: 'if'; GB if"),
    (427, 'cases ? for', 'cases[^2] for', 'img: superscript 2'),
    (427, 'Then,ifthe', 'Then, if the', 'img: tight spacing'),
    (427, 'Reading rais dyopais,', 'Reading ταῖς ἀγοραῖς,', 'img: Greek read from the image'),
    # p428
    (428, 'Ifa man', 'If a man', "img: tight spacing; GB 'If a'"),
    (428, 'cavalry,} and', 'cavalry,[^1] and', 'img: superscript 1'),
    (428, '[Cataldgeis]', '[Catalŏgeis]', 'img: breve o; GB (Catalogeis)'),
    (428, 'cavalry.” If', 'cavalry.[^2] If', 'img: superscript 2'),
    (428, 'Athena ;* but', 'Athena;[^3] but', 'img: superscript 3'),
    (428, 'The mpédpopo above', 'The πρόδρομοι above', 'img: Greek read from the image'),
    (428, "the new ' enrolment.", 'the new enrolment.', 'img: speck'),
    # p429
    (429, '[Astyndmi]', '[Astynŏmi]', 'img: breve o; GB (Astynomi)'),
    (429, 'five inthe city', 'five in the city', "img: tight spacing; GB 'in the'"),
    (429, 'harp-and', 'harp- and', "img: 'flute- and harp- and lute-players'"),
    (429, 'doors! which', 'doors[^1] which', 'img: superscript 1'),
    (429, '[Agorandmi]', '[Agoranŏmi]', 'img: breve o; GB (Agoranomi)'),
    (429, '[Metronémi]', '[Metronŏmi]', 'img: breve o; GB (Metronomi)'),
    # p430
    (430, 'sellers use. fair', 'sellers use fair', 'img: speck'),
    (430, '[Sitophylices]', '[Sitophylăces]', "img: 'Sitophy-/lăces' breve a; GB (Sitophylaces)"),
    (430, 'and: secondly', 'and secondly', 'img: speck'),
    (430, 'but ifnot,', 'but if not,', "img: tight spacing; GB 'if not'"),
    (430, 'some » such', 'some such', 'img: speck'),
    (430, '[Eisagoégeis]', '[Eisagōgeis]', 'img: macron o; GB (Eisagogeis)'),
    (430, 'cases! to', 'cases[^1] to', 'img: superscript 1'),
    (430, '12 per cent.,', '12 per cent.[^2],', 'img: superscript 2 before the comma'),
    (430, '#1 ‘i.e, cases', '#1 i.e. cases', "img: 'i.e.'"),
    # p431
    (431, 'out cf friendly', 'out of friendly', "img: 'of'; GB of"),
    (431, 'Forty! are', 'Forty[^1] are', 'img: superscript 1'),
    # p432
    (432, 'years of service! The', 'years of service.[^1] The', 'img: full stop, superscript 1'),
    (432, 'year.they', 'year they', "img: speck; GB 'year they'"),
    (432, 'Eponymiof', 'Eponymi of', 'img: tight spacing'),
    (432, 'not asa soldier', 'not as a soldier', 'img: tight spacing'),
    # p433
    (433, '[ Hodopoei]', '[Hodopoei]', 'img: no space after bracket'),
    (433, 'examination, and who', 'examination,[^1] and who', 'img: superscript 1; OCR dropped it'),
    (433, 'Ifthey', 'If they', "img: tight spacing; GB 'If they'"),
    (433, 'consulship? and', 'consulship[^2] and', 'img: superscript 2'),
    (433, 'during his office. :', 'during his office.', 'img: speck'),
    # p434
    (434, 'the secrs,', 'the seers,', "img: third letter prints as 'c' (an e whose bar did not print?); GB seers -- REPORT"),
    (434, 'place.’ To', 'place.[^1] To', 'img: superscript 1'),
    (434, 'Cephisophon.?', 'Cephisophon.[^2]', 'img: superscript 2'),
    (434, 'Chorégi', 'Chorēgi', 'img: macron e; GB Choregi'),
    (434, 'the Jaw-court', 'the law-court', "img: 'law-court'; GB law-court"),
    (434, '#2 ® This', '#2 This', "img: '®' is the note numeral"),
    # p435
    (435, 'accusers,’ it', 'accusers,[^1] it', 'img: superscript 1'),
    (435, 'their.charges', 'their charges', 'img: speck'),
    (435, 'independently. z', 'independently.', 'img: speck'),
    # p436
    (436, 'Chorégi to', 'Chorēgi to', 'img: macron e; GB Choregi'),
    (436, 'three! of', 'three[^1] of', 'img: superscript 1'),
    (436, 'choruses? and', 'choruses[^2] and', 'img: superscript 2'),
    (436, 'providingit); hetransacts', 'providing it); he transacts', "img: tight spacing; GB 'providing it); he transacts'"),
    (436, 'them,® and', 'them,[^3] and', 'img: superscript 3'),
    (436, 'mission* for', 'mission[^4] for', 'img: superscript 4'),
    (436, 'unconnected . with', 'unconnected with', 'img: speck in the margin'),
    (436, '#4 i.e, chiefs', '#4 i.e. chiefs', "img: 'i.e.'"),
    (436, 'read dpxOea| pous].', 'read ἀρχιθεώ[ρους].', 'img: Greek read from the image'),
    # p437
    (437, 'Dionysia—-the', 'Dionysia—the', "img: a dash printed as two pieces '–-'; GB '--'"),
    (437, 'penalty) ;! injury', 'penalty);[^1] injury', 'img: superscript 1'),
    (437, 'husbands) ;?_ injury', 'husbands);[^2] injury', 'img: superscript 2'),
    (437, 'the jury. ;', 'the jury.', 'img: speck'),
    (437, '#2 2,The state', '#2 The state', "img: '²' then a speck"),
    # p438
    (438, 'the Ceryces.', 'the Cerȳces.', 'img: macron y; GB Ceryces'),
    (438, 'Dionysia,! which', 'Dionysia,[^1] which', 'img: superscript 1'),
    (438, 'Healso managesall', 'He also manages all', "img: tight spacing; GB 'He also manages all'"),
    (438, 'Indictmentsfor', 'Indictments for', "img: tight spacing; GB 'Indictments for'"),
    (438, 'families? and', 'families[^2] and', 'img: superscript 2'),
    (438, 'as whena man', 'as when a man', "img: tight spacing; GB 'when a'"),
    (438, 'Ifa man', 'If a man', "img: tight spacing; GB 'If a'"),
    (438, 'reconciliation® incurs', 'reconciliation[^3] incurs', 'img: superscript 3'),
    (438, '#2 # See', '#2 See', "img: '²' only"),
    # p439
    (439, 'lot falls! The King', 'lot falls.[^1] The King', 'img: full stop, superscript 1'),
    (439, 'animals.’', 'animals.[^2]', 'img: superscript 2'),
    (439, 'casesinwhich', 'cases in which', "img: tight spacing; GB 'cases in which'"),
    (439, 'one,? and', 'one,[^3] and', 'img: superscript 3'),
    (439, 'wards. of state', 'wards of state', 'img: speck'),
    (439, 'uponits', 'upon its', 'img: tight spacing'),
    (439, 'the MS. ; , :', 'the MS.', 'img: specks'),
    # p440
    (440, 'theyintroduce', 'they introduce', "img: tight spacing; GB 'they introduce'"),
    (440, 'magistrates,! and', 'magistrates,[^1] and', 'img: superscript 1'),
    (440, 'Archons. = There are', 'Archons.\n\nThere are', "img: new paragraph (chapter 60); '=' is a speck"),
    (440, 'Games[{Athlothétae|,', 'Games [Athlothĕtae],', "img: 'Games[Athlothĕtae],' set tight, breve e; GB 'Games (Athlothetae)'"),
    (440, 'Athena* and', 'Athena[^2] and', 'img: superscript 2'),
    (440, '#1 i.e, the', '#1 i.e. the', "img: 'i.e.'"),
    # p441
    (441, "vases,' and", 'vases,[^1] and', 'img: superscript 1'),
    (441, 'plants.2 When', 'plants.[^2] When', 'img: superscript 2'),
    (441, 'has ; collected', 'has collected', 'img: speck'),
    (441, 'victors inthe', 'victors in the', "img: tight spacing; GB 'in the'"),
    (441, 'con: test', 'contest', "img: 'con-/test' at line end; GB contest"),
    (441, '[Stratégi]', '[Stratēgi]', 'img: macron e; GB (Strategi)'),
    (441, 'war }.one', 'war; one', 'img: semicolon then speck'),
    # p442
    (442, 'symmories,! who', 'symmories,[^1] who', 'img: superscript 1'),
    (442, 'trierarchs? and', 'trierarchs[^2] and', 'img: superscript 2'),
    (442, 'properties *® for', 'properties[^3] for', 'img: superscript 3'),
    (442, 'tribesm enand', 'tribesmen and', "img: 'tribesm enand' (spacing slipped); GB 'tribesmen and'"),
    (442, '| Lochagi]', '[Lochāgi]', "img: '[Lochāgi]' macron a; GB (Lochagi)"),
    (442, 'arealso', 'are also', "img: tight spacing; GB 'are also'"),
    (442, 'similarly elected.*', 'similarly elected.[^4]', 'img: superscript 4'),
    (442, '#3 See motess on) chiy.50,435', '#3 See note 3 on ch. 56, 3.', "img: '³ See note 3 on ch. 56, 3.'"),
    # p443
    (443, 'Theséum', 'Thesēum', 'img: macron e; GB Theseum'),
    (443, 'adrachmaa', 'a drachma a', "img: tight spacing; GB 'a drachma a'"),
    (443, 'Prytanéum', 'Prytanēum', 'img: macron e; GB Prytaneum'),
    (443, 'place,from', 'place, from', 'img: tight spacing'),
    (443, 'anallowance fortheir', 'an allowance for their', "img: tight spacing; GB 'an allowance for their'"),
    # p444
    (444, 'civil rights, If', 'civil rights. If', "img: full stop; GB 'rights. If'"),
    (444, 'up to Zagpa ;} for', 'up to kappa;[^1] for', "img: italic 'kappa', superscript 1; GB kappa"),
    (444, 'each letter. _ When', 'each letter. When', 'img: speck'),
    (444, 'which is. inscribed', 'which is inscribed', 'img: speck in the margin'),
    (444, '[Empéctes]', '[Empēctes]', 'img: macron e; GB (Empectes)'),
    (444, 'same person,he', 'same person, he', "img: 'sameperson,he' set tight; GB 'same person, he'"),
    (444, 'from a/pha to', 'from alpha to', "img: italic 'alpha'"),
    (444, 'were indicated - by', 'were indicated by', 'img: speck in the margin'),
    (444, 'from /améda onwards', 'from lambda onwards', "img: italic 'lambda'"),
    # p445
    (445, 'proportion.! As', 'proportion.[^1] As', 'img: superscript 1'),
    (445, 'whole number, The', 'whole number. The', 'img: full stop'),
    # p446
    (446, "officials' assigned", 'officials[^1] assigned', 'img: superscript 1'),
    (446, 'Whenall', 'When all', "img: tight spacing; GB 'When all'"),
    (446, 'court,and', 'court, and', "img: tight spacing; GB 'court, and'"),
    (446, 'other. _The', 'other. The', 'img: speck'),
    (446, 'Ifit', 'If it', "img: tight spacing; GB 'If it'"),
    # p447
    (447, 'only one. case', 'only one case', 'img: speck'),
    (447, 'supply-tubes,’ into', 'supply-tubes,[^1] into', 'img: superscript 1'),
    (447, 'Ten gallons? are', 'Ten gallons[^2] are', 'img: superscript 2'),
    (447, 'toa set', 'to a set', "img: tight spacing; GB 'to a'"),
    (447, 'water.*? The', 'water.[^3] The', 'img: superscript 3'),
    (447, 'mont -Froseideon*.. ..« ... .-. The measured ‘day', 'month Poseideon[^4] . . . . . . . . . . The measured day', "img: 'month Poseideon⁴' then ten spaced leader dots (Kenyon's lacuna); GB 'month Poseideon ... The measured day'"),
    (447, '#1 Or, reading avdAovs te €xovoa kai expous,', '#1 Or, reading αὐλούς τε ἔχουσαι καὶ ἔκρους,', 'img: Greek read from the image'),
    (447, '#2 The yois', '#2 The χοῦς', 'img: Greek read from the image'),
    (447, 'reading documents,', 'reading documents.', 'img: full stop'),
    (447, '#4 j,e. December', '#4 i.e. December', "img: 'i. e.'"),
    (447, '500 members... ;', '500 members . . . ;', "img: three spaced dots (Kenyon's lacuna); GB '500 members ...;'"),
    # p448
    (448, 'votes,! the', 'votes,[^1] the', 'img: superscript 1'),
    # p388
    (388, 'case, For these', 'case. For these', "img: full stop; GB 'case. For'"),
    # p395
    (395, 'Hipparchus. ‘Then', 'Hipparchus. Then', 'img: no quote mark (speck)'),
]

# The printed section numerals: (hOCR page, prefix of the body line they stand
# against, label, source). 'hocr' = the OCR also read the numeral; 'img' = read
# from the page image only. A chapter's own numeral (its section 1) is the bare
# chapter number.
MARGINS = [
    (371, '...[They? were tried]', '1', 'hocr'),
    (371, 'After this event', '2', 'hocr'),
    (371, 'between the upper', '2.2', 'img'),
    (372, 'of the people.', '2.3', 'hocr'),
    (372, 'Nowthe ancient constitution,', '3', 'hocr'),
    (372, 'of ten years!', '3.2', 'img'),
    (372, 'ing need. The', '3.3', 'hocr'),
    (373, 'additions. The Thesmothétae!', '3.4', 'hocr'),
    (373, 'Such, then, is', '3.5', 'hocr'),
    (373, 'magistracies. The Council', '3.6', 'hocr'),
    (374, 'Such was, in', '4', 'hocr'),
    (374, 'military equipment. The', '4.2', 'img'),
    (374, 'and the Hipparchi', '4.3', 'img'),
    (374, 'two if he', '4.4', 'hocr'),
    (375, 'wrong done to', '4.5', 'img'),
    (375, 'Since such, then,', '5', 'hocr'),
    (375, 'rose against the', '5.2', 'img'),
    (375, 'between them. By', '5.3', 'hocr'),
    (376, 'As soon as', '6', 'hocr'),
    (376, 'loads removed from', '6.2', 'img'),
    (376, 'However, the story', '6.3', 'hocr'),
    (376, 'That he had', '6.4', 'hocr'),
    (376, 'Next Solon drew', '7', 'hocr'),
    (377, 'to the present', '7.2', 'img'),
    (377, 'ized the constitution.', '7.3', 'hocr'),
    (377, 'Assembly and in', '7.4', 'hocr'),
    (378, 'The elections to', '8', 'hocr'),
    (378, 'the Pentacosiomedimni.! Such', '8.2', 'img'),
    (379, 'Council of four', '8.4', 'img'),
    (379, 'engaged in internal', '8.5', 'img'),
    (379, 'There are three', '9', 'hocr'),
    (380, 'when the democracy', '9.2', 'hocr'),
    (380, 'These seem to', '10', 'img'),
    (380, 'During his administration', '10.2', 'hocr'),
    (380, 'When he hadcompleted', '11', 'hocr'),
    (381, 'obey them just', '11.2', 'hocr'),
    (381, 'The truth of', '12', 'hocr'),
    (381, 'Again he declares', '12.2', 'hocr'),
    (382, 'And again elsewhere', '12.3', 'hocr'),
    (382, 'Once more he', '12.4', 'hocr'),
    (383, 'And again he', '12.5', 'img'),
    (383, 'Such, then, were', '13', 'hocr'),
    (383, 'reason. Subsequently, after', '13.2', 'img'),
    (384, 'with this office', '13.3', 'hocr'),
    (384, 'personal rivalries among', '13.4', 'hocr'),
    (384, 'was looked on', '13.5', 'img'),
    (384, 'Pisistratus had the', '14', 'hocr'),
    (385, 'of Solon. It', '14.2', 'hocr'),
    (385, 'Solon’s exhortations, however,', '14.3', 'hocr'),
    (385, 'years after the', '14.4', 'hocr'),
    (386, 'Inthis manner did', '15', 'hocr'),
    (386, 'retired from the', '15.2', 'img'),
    (386, 'Eretria. After his', '15.3', 'img'),
    (386, 'to take Naxos', '15.4', 'img'),
    (386, 'a signal to', '15.5', 'hocr'),
    (387, 'Such was the', '16', 'hocr'),
    (387, 'tyranny of Pisistratus.', '16.2', 'hocr'),
    (387, 'might make their', '16.3', 'hocr'),
    (387, 'nor the time', '16.4', 'hocr'),
    (387, 'produce. For the', '16.5', 'hocr'),
    (387, 'their farms. It', '16.6', 'img'),
    (387, 'he granted him', '16.7', 'hocr'),
    (388, 'became much harsher.', '16.8', 'img'),
    (388, 'case, For these', '16.9', 'img'),
    (388, 'of both. Moreover,', '16.10', 'hocr'),
    (388, 'Thus did Pisistratus', '17', 'hocr'),
    (388, 'was in possession', '17.2', 'hocr'),
    (388, 'of each of', '17.3', 'hocr'),
    (389, 'was surnamed Thessalus.', '17.4', 'hocr'),
    (389, 'Hippias and Hipparchus', '18', 'hocr'),
    (389, 'the other poets),', '18.2', 'img'),
    (389, 'But while they', '18.3', 'img'),
    (390, 'the design as', '18.4', 'hocr'),
    (390, 'According to the', '18.5', 'hocr'),
    (390, 'falsehood, but was', '18.6', 'hocr'),
    (390, 'After this event', '19', 'hocr'),
    (390, 'About three years', '19.2', 'hocr'),
    (391, 'following way. The', '19.3', 'img'),
    (391, 'Having failed, then,', '19.4', 'hocr'),
    (391, 'and Argos. Accordingly', '19.5', 'hocr'),
    (392, 'While he was', '19.6', 'hocr'),
    (392, 'After the overthrow', '20', 'hocr'),
    (392, 'masses. Thereupon Isagoras,', '20.2', 'img'),
    (392, 'curse of pollution.', '20.3', 'hocr'),
    (392, 'and the other', '20.4', 'hocr'),
    (393, 'at perpetual war', '20.5', 'hocr'),
    (393, 'The people, therefore,', '21', 'hocr'),
    (393, 'archonship of Isagoras,!', '21.2', 'hocr'),
    (393, 'to scrutinize the', '21.3', 'hocr'),
    (394, 'fresh combinations. Further,', '21.4', 'hocr'),
    (394, 'He also instituted', '21.5', 'hocr'),
    (394, 'On the other', '21.6', 'hocr'),
    (394, 'By these reforms', '22', 'hocr'),
    (395, 'law concerning ostracism.', '22.2', 'hocr'),
    (395, 'Polemarch was the', '22.3', 'hocr'),
    (395, 'as a popular', '22.4', 'hocr'),
    (395, 'Hipparchus. ‘Then in', '22.5', 'hocr'),
    (396, 'ostracized. Thus for', '22.6', 'hocr'),
    (396, 'Xanthippus son of', '22.7', 'hocr'),
    (396, 'the son of', '22.8', 'img'),
    (397, 'So far, then,', '23', 'hocr'),
    (397, 'on board. On', '23.2', 'img'),
    (397, 'Opposition of the', '23.3', 'hocr'),
    (397, 'adviser. The rebuilding', '23.4', 'hocr'),
    (398, 'of the Ionian', '23.5', 'img'),
    (398, 'After this, seeing', '24', 'hocr'),
    (398, 'leadership. This advice', '24.2', 'img'),
    (398, 'they then possessed.', '24.3', 'hocr'),
    (399, 'Such was the', '25', 'hocr'),
    (399, 'Council. First of', '25.2', 'hocr'),
    (399, 'others to the', '25.3', 'hocr'),
    (400, 'refuge in suppliant', '25.4', 'hocr'),
    (400, 'After this revolution', '26', 'hocr'),
    (400, 'Consequently in most', '26.2', 'img'),
    (401, 'was overlooked. Four', '26.3', 'hocr'),
    (401, 'archonship of Antidotus,>', '26.4', 'hocr'),
    (401, 'After this Pericles', '27', 'hocr'),
    (401, 'into their own', '27.2', 'img'),
    (401, 'of the state', '27.3', 'img'),
    (402, 'help himself to', '27.4', 'hocr'),
    (402, 'position. Moreover, bribery', '27.5', 'hocr'),
    (402, 'So long, however,', '28', 'hocr'),
    (402, 'democracy. The first', '28.2', 'img'),
    (403, 'the opposition. After', '28.3', 'hocr'),
    (403, 'any unworthy action.', '28.4', 'hocr'),
    (404, 'The best statesmen', '28.5', 'img'),
    (404, 'So long as', '29', 'hocr'),
    (404, 'dorus was to', '29.2', 'img'),
    (404, 'best. Cleitophon concurred', '29.3', 'hocr'),
    (405, 'democratic, but closely', '29.4', 'hocr'),
    (405, 'Eleven? to be', '29.5', 'img'),
    (405, 'These were the', '30', 'img'),
    (406, 'and produced the', '30.2', 'img'),
    (406, 'Council. As regards', '30.3', 'hocr'),
    (407, 'the selected body', '30.4', 'hocr'),
    (407, 'was to be', '30.5', 'hocr'),
    (407, 'balloting. Any member', '30.6', 'hocr'),
    (407, 'Such was the', '31', 'hocr'),
    (408, 'rally, they might', '31.2', 'img'),
    (408, 'joining in the', '31.3', 'hocr'),
    (408, 'The hundred commissioners', '32', 'img'),
    (409, 'Scirophorion.! Thus was', '32.2', 'img'),
    (409, 'ability and judgement.', '32.3', 'img'),
    (409, 'For about four', '33', 'hocr'),
    (409, 'not be given', '33.2', 'img'),
    (410, 'The people, however,', '34', 'hocr'),
    (410, 'on all the', '34.2', 'img'),
    (411, 'following manner. One', '34.3', 'hocr'),
    (411, 'In this way', '35', 'hocr'),
    (411, 'of these they', '35.2', 'hocr'),
    (412, 'matters also their', '35.3', 'hocr'),
    (412, 'Thirty were doing', '35.4', 'hocr'),
    (412, 'Theramenes, however, seeing', '36', 'hocr'),
    (413, 'constitution. Theramenes, however,', '36.2', 'hocr'),
    (413, 'Now when winter', '37', 'hocr'),
    (414, 'the Thirty had', '37.2', 'hocr'),
    (414, 'These events were', '38', 'hocr'),
    (414, 'money. Further, finding', '38.2', 'img'),
    (414, 'of the exiles', '38.3', 'img'),
    (415, 'the exiles. For', '38.4', 'img'),
    (415, 'This reconciliation was', '39', 'hocr'),
    (415, 'personal property. The', '39.2', 'img'),
    (416, 'other Athenians. If', '39.3', 'hocr'),
    (416, '480. The list', '39.4', 'img'),
    (416, 'them after their', '39.5', 'hocr'),
    (416, 'conducted according to', '39.6', 'hocr'),
    (416, 'When the reconciliation', '40', 'hocr'),
    (417, 'recovered confidence. This', '40.2', 'hocr'),
    (417, 'one ever again', '40.3', 'img'),
    (417, 'A final reconciliation', '40.4', 'hocr'),
    (417, 'This, however, took', '41', 'hocr'),
    (418, 'own exertions.1 This', '41.2', 'img'),
    (419, 'influence, than large', '41.3', 'img'),
    (419, 'The present state', '42', 'hocr'),
    (419, 'tion. After this', '42.2', 'img'),
    (420, 'of Athenians, to', '42.3', 'hocr'),
    (420, 'In this way', '42.4', 'img'),
    (420, 'patrol the country', '42.5', 'img'),
    (421, 'Such is the', '43', 'hocr'),
    (421, 'The Council of', '43.2', 'img'),
    (421, 'reckoning is by', '43.3', 'hocr'),
    (422, 'sitting is to', '43.4', 'img'),
    (422, 'without the cognizance', '43.5', 'img'),
    (422, 'it. Another Assembly', '43.6', 'hocr'),
    (423, 'There is a', '44', 'hocr'),
    (423, 'Prytanes, named by', '44.2', 'img'),
    (423, 'over the programme', '44.3', 'img'),
    (423, '__. Elections to', '44.4', 'img'),
    (423, 'In former times', '45', 'img'),
    (424, 'The Council passes', '45.2', 'hocr'),
    (424, 'law-courts if the', '45.3', 'hocr'),
    (424, 'In all these', '45.4', 'hocr'),
    (424, 'The Council also', '46', 'hocr'),
    (425, 'commissioners, chosen from', '46.2', 'hocr'),
    (425, 'The Council also', '47', 'hocr'),
    (425, 'presence of the', '47.2', 'img'),
    (426, 'out for the', '47.3', 'hocr'),
    (426, 'in ten. The', '47.4', 'img'),
    (426, 'prytany that the', '47.5', 'img'),
    (426, 'There are ten', '48', 'hocr'),
    (427, 'imprisonment. They receive', '48.2', 'img'),
    (427, 'The Council also', '48.3', 'img'),
    (427, 'trates for each', '48.4', 'hocr'),
    (427, 'in the record', '48.5', 'img'),
    (428, 'The Council also', '49', 'hocr'),
    (428, 'and any one whom it rejects ceases', '49.2', 'img'),
    (428, 'Formerly the Council', '49.3', 'hocr'),
    (429, 'The Council also examines', '49.4', 'hocr'),
    (429, 'The Council also,', '49.5', 'hocr'),
    (429, 'There are ten', '50', 'hocr'),
    (429, 'There are also', '50.2', 'img'),
    (429, 'Market Commissioners [Agorandmi]', '51', 'hocr'),
    (429, 'Commissioners of Weights', '51.2', 'img'),
    (430, 'Formerly there were', '51.3', 'hocr'),
    (430, 'There are ten', '51.4', 'hocr'),
    (430, 'The Eleven also', '52', 'hocr'),
    (430, 'There are also', '52.2', 'img'),
    (431, 'and the office', '52.3', 'hocr'),
    (431, 'The Forty! are', '53', 'hocr'),
    (431, 'of the Thirty', '53.2', 'img'),
    (431, 'one, and those', '53.3', 'hocr'),
    (432, 'The Arbitrators are', '53.4', 'hocr'),
    (432, 'last of the', '53.5', 'img'),
    (432, 'the duty. Any', '53.6', 'hocr'),
    (432, 'have, however, in', '53.7', 'hocr'),
    (433, 'The following magistrates', '54', 'hocr'),
    (433, 'order: and ten', '54.2', 'hocr'),
    (433, 'The Clerk of', '54.3', 'img'),
    (433, 'Now, however, he', '54.4', 'hocr'),
    (433, 'all the laws.', '54.5', 'hocr'),
    (434, 'The Assembly also', '54.6', 'hocr'),
    (434, 'there is occasion.', '54.7', 'hocr'),
    (434, 'An Archon is', '54.8', 'hocr'),
    (434, 'All the foregoing', '55', 'hocr'),
    (434, 'each tribe. They', '55.2', 'img'),
    (434, 'matter of the', '55.3', 'hocr'),
    (435, 'facts’; and when', '55.4', 'hocr'),
    (435, 'disqualified before the', '55.5', 'hocr'),
    (435, 'The Archon, the', '56', 'hocr'),
    (436, 'As soon as', '56.2', 'hocr'),
    (436, 'end of his', '56.3', 'hocr'),
    (436, 'chorus must be', '56.4', 'hocr'),
    (437, 'expenses. The Archon', '56.5', 'img'),
    (437, 'The suits and', '56.6', 'img'),
    (437, 'mining disputes as', '56.7', 'hocr'),
    (438, 'The King in', '57', 'hocr'),
    (438, 'ancestral sacrifices. Indictmentsfor', '57.2', 'img'),
    (438, 'sacred ceremonies. Actions', '57.3', 'hocr'),
    (439, 'his defence from', '57.4', 'hocr'),
    (439, 'The Polemarch performs', '58', 'hocr'),
    (439, 'Only private actions', '58.2', 'hocr'),
    (439, 'over to the', '58.3', 'hocr'),
    (439, 'The Thesmothetae in', '59', 'hocr'),
    (440, 'Moreover theyintroduce impeachments', '59.2', 'hocr'),
    (440, 'presented by the', '59.3', 'hocr'),
    (440, 'of debtors, and', '59.4', 'hocr'),
    (440, 'and the condemnations', '59.5', 'hocr'),
    (440, 'trates, whether for', '59.6', 'hocr'),
    (440, 'from the Areopagus.', '59.7', 'hocr'),
    (440, '= There are', '60', 'hocr'),
    (441, 'This oil is', '60.2', 'hocr'),
    (441, 'from the individual', '60.3', 'img'),
    (441, 'All officers connected', '61', 'img'),
    (442, 'moment. The appointment', '61.2', 'img'),
    (442, 'There are also', '61.3', 'hocr'),
    (442, 'appoints captains of', '61.4', 'hocr'),
    (442, 'confirmation. There are', '61.5', 'hocr'),
    (442, 'Taxiarchs do the', '61.6', 'hocr'),
    (442, 'in Lemnos. There', '61.7', 'img'),
    (442, 'Of the magistrates', '62', 'hocr'),
    (443, 'Pay is received', '62.2', 'img'),
    (443, 'The military offices', '62.3', 'hocr'),
    (443, 'The juries for', '63', 'hocr'),
    (443, 'Thesmothetae for the', '63.2', 'hocr'),
    (443, 'filled. All persons', '63.3', 'hocr'),
    (444, 'Each juror has', '63.4', 'hocr'),
    (444, 'mately an equal', '63.5', 'img'),
    (444, 'The ten chests', '64', 'hocr'),
    (444, 'ticket from each', '64.2', 'hocr'),
    (444, 'rooms assigned for', '64.3', 'hocr'),
    (445, 'among those selected.', '64.4', 'hocr'),
    (445, 'the jurors of', '64.5', 'img'),
    (445, 'The juror thereupon,', '65', 'hocr'),
    (445, 'by the colour', '65.2', 'hocr'),
    (445, 'this duty has', '65.3', 'img'),
    (445, 'Ticket-hangers. The public', '65.4', 'img'),
    (446, 'Whenall the courts', '66', 'hocr'),
    (446, 'When the jurors', '66.2', 'img'),
    (446, 'no malpractice in', '66.3', 'img'),
    (446, 'These preliminaries being', '67', 'hocr'),
    (447, 'is tried. Water-clocks', '67.2', 'img'),
    (447, 'second speech. The', '67.3', 'hocr'),
    (447, 'but each party', '67.4', 'hocr'),
    (447, 'mont -Froseideon*.. ..«', '67.5', 'hocr'),
    (447, 'Most of the', '68', 'hocr'),
    (447, 'jurors, or three', '68.2', 'img'),
    (448, 'unless he votes.', '68.3', 'hocr'),
    (448, 'When the jurors', '68.4', 'hocr'),
    (448, 'When all the', '69', 'hocr'),
    (449, 'defendant. Then, if', '69.2', 'hocr'),
]

# Section starts against the TLG 0086.003 sections: (section, opening words
# verbatim). See the report for where these depart from Kenyon's numerals.
ANCHORS = [
    ('1.1', '...[They'),
    ('2.1', 'After this event there was contention for a long time'),
    ('2.2', 'Not only was the constitution at this time oligarchical in'),
    ('2.3', 'But the hardest and bitterest part of the constitution in'),
    ('3.1', 'Now the ancient constitution, as it existed before the time'),
    ('3.2', 'The first magistrates, both in date and in importance, were'),
    ('3.3', 'The last of the three offices was that of the'),
    ('3.4', 'The Thesmothĕtae'),
    ('3.5', 'Such, then, is the relative chronological precedence of these offices.'),
    ('3.6', 'The Council of Areopagus had as its constitutionally assigned duty'),
    ('4.1', 'Such was, in outline, the first constitution, but not very'),
    ('4.2', 'The nine Archons and the Treasurers were elected by this'),
    ('4.3', 'There was also to be a Council, consisting of four'),
    ('4.4', 'The Council of Areopagus was guardian of the laws, and'),
    ('4.5', 'But, as has been said before,'),
    ('5.1', 'Since such, then, was the organization of the constitution, and'),
    ('5.2', 'The strife was keen, and for a long time the'),
    ('5.3', 'By birth and reputation Solon was one of the foremost'),
    ('6.1', 'As soon as he was at the head of affairs,'),
    ('6.2', 'In connexion with it some persons try to traduce the'),
    ('6.3', 'However, the story of the popular party is by far'),
    ('6.4', 'That he had this absolute power is, in the first'),
    ('7.1', 'Next Solon drew up a constitution and enacted new laws;'),
    ('7.2', 'Solon ratified his laws for a hundred years; and the'),
    ('7.3', 'He divided the population according to property into four classes,'),
    ('7.4', 'A man had to rank as a Pentacosiomedimnus if he'),
    ('8.1', 'The elections to the various offices Solon enacted should be'),
    ('8.2', 'Such was Solon’s legislation with respect to the nine Archons;'),
    ('8.3', 'There were four tribes, as before, and four tribe-kings. Each'),
    ('8.4', 'Solon also appointed a Council of four hundred, a hundred'),
    ('8.5', 'Further, since he saw the state often engaged in internal'),
    ('9.1', 'Such, then, was his legislation concerning the magistracies. There are'),
    ('9.2', 'Moreover, since the laws were not drawn up in simple'),
    ('10.1', 'These seem to be the democratic features of his laws;'),
    ('10.2', 'During his administration the measures were made larger than those'),
    ('11.1', 'When he had completed his organization of the constitution in'),
    ('11.2', 'Moreover, his position at this time was unpleasant. Many members'),
    ('12.1', 'The truth of this view of Solon’s policy is established'),
    ('12.2', 'Again he declares how the mass of the people ought'),
    ('12.3', 'And again elsewhere he speaks about the persons who wished'),
    ('12.4', 'Once more he speaks of the abolition of debts and'),
    ('12.5', 'And again he reviles both parties for their grumblings in'),
    ('13.1', 'Such, then, were Solon’s reasons for his departure from the'),
    ('13.2', 'Subsequently, after a similar period had elapsed, Damasias was elected'),
    ('13.3', 'But altogether they were in a continual state of internal'),
    ('13.4', 'The parties at this time were three in number. First'),
    ('13.5', 'This latter party was reinforced by those who had been'),
    ('14.1', 'Pisistratus had the reputation of being an extreme democrat, and'),
    ('14.2', 'It is related that, when Pisistratus asked for his bodyguard,'),
    ('14.3', 'Solon’s exhortations, however, proved fruitless, and Pisistratus assumed the sovereignty.'),
    ('14.4', 'Eleven years later'),
    ('15.1', 'In this manner did his first return take place. He'),
    ('15.2', 'First he led a colony to a place called Rhaicēlus,'),
    ('15.3', 'After his victory in the battle at Pallēnē he captured'),
    ('15.4', 'He effected the disarmament of the people in the following'),
    ('16.1', 'Such was the origin and such the vicissitudes of the'),
    ('16.2', 'His administration was temperate, as has been said before, and'),
    ('16.3', 'In this he had two objects, first that they might'),
    ('16.4', 'At the same time his revenues were increased by the'),
    ('16.5', 'For the same reasons he instituted the local justices,'),
    ('16.6', 'It was in one of these progresses that, as the'),
    ('16.7', 'And so in matters in general he burdened the people'),
    ('16.8', 'But most important of all in this respect was his'),
    ('16.9', 'For these reasons he held power long, and whenever he'),
    ('16.10', 'Moreover, the laws in reference to tyrants at that time'),
    ('17.1', 'Thus did Pisistratus grow old in the possession of power,'),
    ('17.2', 'It is evident from this that the story is mere'),
    ('17.3', 'After the death of Pisistratus his sons took up the'),
    ('17.4', 'For Pisistratus took a wife from Argos, Timonassa, the daughter'),
    ('18.1', 'Hippias and Hipparchus assumed the control of affairs on grounds'),
    ('18.2', 'while Thessalus was much junior in age, and was violent'),
    ('18.3', 'But while they were lying in wait for Hippias in'),
    ('18.4', 'of the two leaders, Harmodius was killed on the spot'),
    ('18.5', 'According to the story of the popular party, Aristogeiton accused'),
    ('18.6', 'At last, when for all his efforts he could not'),
    ('19.1', 'After this event the tyranny became much harsher. In consequence'),
    ('19.2', 'About three years after the death of Hipparchus, finding his'),
    ('19.3', 'The Athenian exiles, headed by the Alcmeonidae, could not by'),
    ('19.4', 'Having failed, then, in every other method, they took the'),
    ('19.5', 'Accordingly they first sent Anchimolus by sea at the head'),
    ('19.6', 'While he was sitting down before the place, it so'),
    ('20.1', 'After the overthrow of the tyranny, the rival leaders in'),
    ('20.2', 'Thereupon Isagoras, finding himself left inferior in power, invited Cleomenes,'),
    ('20.3', 'On this Cleisthenes retired from the country, and Cleomenes, entering'),
    ('20.4', 'When the people had thus obtained the command of affairs,'),
    ('20.5', 'But even earlier than the attempts of the Alcmeonidae, one'),
    ('21.1', 'The people, therefore, had good reason to place confidence in'),
    ('21.2', 'his first step was to distribute the whole population into'),
    ('21.3', 'Next he made the Council to consist of five hundred'),
    ('21.4', 'Further, he divided the country into thirty groups of demes,'),
    ('21.5', 'He also instituted Demarchs, who had the same duties as'),
    ('21.6', 'On the other hand he allowed every one to retain'),
    ('22.1', 'By these reforms the constitution became much more democratic than'),
    ('22.2', 'Four years'),
    ('22.3', 'Then, eleven years later, in the archonship of Phaenippus they'),
    ('22.4', 'and the first person ostracized was one of his relatives,'),
    ('22.5', 'Then in the very next year, in the archonship of'),
    ('22.6', 'Thus for three years they continued to ostracize the friends'),
    ('22.7', 'Two years later, in the archonship of Nicodemus,'),
    ('22.8', 'Three years later, however, in the archonship of Hypsichides,'),
    ('23.1', 'So far, then, had the city progressed by this time,'),
    ('23.2', 'On these grounds people bowed to its prestige; and during'),
    ('23.3', 'The leaders of the people during this period were Aristides,'),
    ('23.4', 'The rebuilding of the fortifications they conducted in combination, although'),
    ('23.5', 'It follows that it was he who made the first'),
    ('24.1', 'After this, seeing the state growing in confidence and much'),
    ('24.2', 'This advice was taken; and when the people had assumed'),
    ('24.3', 'They also secured an ample maintenance for the mass of'),
    ('25.1', 'Such was the way in which the people earned their'),
    ('25.2', 'First of all he ruined many of its members by'),
    ('25.3', 'In this revolution he was assisted by Themistocles,'),
    ('25.4', 'Every one was astounded at the occurrence, and presently, when'),
    ('26.1', 'After this revolution the administration of the state became more'),
    ('26.2', 'Consequently in most matters of administration less heed was paid'),
    ('26.3', 'Four years later, in the archonship of Lysicrates,'),
    ('27.1', 'After this Pericles came forward as popular leader, having first'),
    ('27.2', 'Moreover, forty-eight years after the battle of Salamis, in the'),
    ('27.3', 'Pericles was also the first to institute pay for service'),
    ('27.4', 'Pericles’ private property was quite unequal to this magnificence and'),
    ('27.5', 'Moreover, bribery came into existence after this, the first person'),
    ('28.1', 'So long, however, as Pericles was leader of the people,'),
    ('28.2', 'The first leader of the people,'),
    ('28.3', 'After the death of Pericles, Nicias, who subsequently fell in'),
    ('28.4', 'After Cleophon the popular leadership was occupied successively by the'),
    ('28.5', 'The best statesmen at Athens, after those of early times,'),
    ('29.1', 'So long as the fortune of the war continued even,'),
    ('29.2', 'The motion of Pythodorus was to the following effect. The'),
    ('29.3', 'Cleitophon concurred with the motion of Pythodorus, but moved that'),
    ('29.4', 'When the committee was elected, their first proposal was that'),
    ('29.5', 'After these preliminary measures, they drew up the constitution in'),
    ('30.1', 'These were the recommendations of the committee; and when they'),
    ('30.2', 'There should be a Council, holding office for a year,'),
    ('30.3', 'As regards the future, four Councils were to be created,'),
    ('30.4', 'They[^80] were to administer that office as seemed'),
    ('30.5', 'These five persons were to cast lots for precedence between'),
    ('30.6', 'Any member of the Council who did not enter the'),
    ('31.1', 'Such was the constitution which they drew up for the'),
    ('31.2', 'They must, however, observe the laws that might be enacted'),
    ('31.3', 'The Five Thousand'),
    ('32.1', 'The hundred commissioners appointed by the Five Thousand drew up'),
    ('32.2', 'Thus was the oligarchy established, in the archonship of Callias,'),
    ('32.3', 'When, however, this constitution had been established, the Five Thousand'),
    ('33.1', 'For about four months the constitution of the Four Hundred'),
    ('33.2', 'The persons chiefly responsible for the revolution were Aristocrates and'),
    ('34.1', 'The people, however, in a very short time deprived the'),
    ('34.2', 'They mismanaged their opportunity then, and in a very short'),
    ('34.3', 'One of the terms of peace stipulated that the state'),
    ('35.1', 'In this way were the Thirty established in power, in'),
    ('35.2', 'At first, indeed, they behaved with moderation towards the citizens'),
    ('35.3', 'In other matters also their conduct was similar. At first,'),
    ('35.4', 'But so soon as they had got a firmer hold'),
    ('36.1', 'Theramenes, however, seeing the city thus falling into ruin, was'),
    ('36.2', 'Theramenes, however, criticized this scheme also, first on the ground'),
    ('37.1', 'Now when winter had set in, Thrasybūlus and the exiles'),
    ('37.2', 'Theramenes having been thus removed, they disarmed all the people'),
    ('38.1', 'These events were followed by the occupation of Munichia by'),
    ('38.2', 'Further, finding that the citizens who possessed the franchise were'),
    ('38.3', 'When, however, the party in Piraeus and Munichia began to'),
    ('38.4', 'For it was Pausanias, the king of the Lacedaemonians, who'),
    ('39.1', 'This reconciliation was effected in the archonship of Eucleides,'),
    ('39.2', 'The temple at Eleusis should be common ground for both'),
    ('39.3', 'If any of the seceding party wished to take a'),
    ('39.4', 'The list of those who desired to secede should be'),
    ('39.5', 'No one who settled at Eleusis should be capable of'),
    ('39.6', 'There should be a general amnesty concerning past events towards'),
    ('40.1', 'When the reconciliation had taken place on these terms, those'),
    ('40.2', 'This is one point in which Archinus appears to have'),
    ('40.3', 'Not only did they blot out all memory of former'),
    ('40.4', 'A final reconciliation was made with the secessionists at Eleusis'),
    ('41.1', 'This, however, took place at a later date; at the'),
    ('41.2', 'This was the eleventh change which had taken place in'),
    ('41.3', 'At first they refused to allow payment for attendance at'),
    ('42.1', 'The present state of the constitution is as follows. The'),
    ('42.2', 'After this the Council examines those who have been enrolled,'),
    ('42.3', 'Under the charge of these persons the youths first of'),
    ('42.4', 'In this way they spend the first year. The next'),
    ('42.5', 'For these two years they are on garrison duty, and'),
    ('43.1', 'Such is the manner of the enrolment of the citizens'),
    ('43.2', 'The Council of Five Hundred is elected by lot, fifty'),
    ('43.3', 'The Prytanes for the time being, in the first place,'),
    ('43.4', 'They also draw up the programme for the meetings of'),
    ('43.5', 'In the sixth prytany, in addition to the business already'),
    ('43.6', 'Another Assembly in each prytany is assigned to the hearing'),
    ('44.1', 'There is a single President of the Prytanes, elected by'),
    ('44.2', 'Whenever the Prytanes convene a meeting of the Council or'),
    ('44.3', 'They take it and see to the preservation of order,'),
    ('44.4', 'Elections to the offices of General and Hipparch and all'),
    ('45.1', 'In former times the Council had full powers to inflict'),
    ('45.2', 'The Council passes judgement on nearly all magistrates, especially those'),
    ('45.3', 'The Council also examines those who are to be its'),
    ('45.4', 'In all these matters, therefore, the Council has no final'),
    ('46.1', 'The Council also superintends the triremes that are already in'),
    ('46.2', 'The Council also inspects all public buildings, and if it'),
    ('47.1', 'The Council also co-operates with the other magistrates in most'),
    ('47.2', 'Then there are the Commissioners for Public Contracts [Polētae], ten'),
    ('47.3', 'They make separate lists, first of those who have to'),
    ('47.4', 'Further, the King-archon brings before the Council the leases of'),
    ('47.5', 'The tablets containing the lists of the instalments are carried'),
    ('48.1', 'There are ten Receivers-General [Apodectae], elected by lot, one from'),
    ('48.2', 'They receive all the instalments, therefore, on one day, and'),
    ('48.3', 'The Council also elects ten Auditors [Logistae] by lot from'),
    ('48.4', 'They also elect one Examiner of Accounts [Euthūnus] by lot'),
    ('48.5', 'The latter takes it, and if after reading it he'),
    ('49.1', 'The Council also inspects the horses belonging to the state.'),
    ('49.2', 'The roll of the cavalry is drawn up by the'),
    ('49.3', 'Formerly the Council used to decide on the plans for'),
    ('49.4', 'The Council also examines infirm paupers; for there is a'),
    ('50.1', 'There are ten Commissioners for Repairs of Temples, elected by'),
    ('50.2', 'There are also ten City Commissioners [Astynŏmi], of whom five'),
    ('51.1', 'Market Commissioners [Agoranŏmi] are elected by lot, five for Piraeus,'),
    ('51.2', 'Commissioners of Weights and Measures [Metronŏmi] are elected by lot,'),
    ('51.3', 'Formerly there were ten Corn Commissioners [Sitophylăces], elected by lot,'),
    ('51.4', 'There are ten Superintendents of the Mart, elected by lot,'),
    ('52.1', 'The Eleven also are appointed by lot to take care'),
    ('52.2', 'There are also five Introducers of Cases [Eisagōgeis], elected by'),
    ('52.3', 'These are brought up as ‘monthly’ cases and are introduced'),
    ('53.1', 'The Forty'),
    ('53.2', 'The Arbitrators take up the case, and, if they cannot'),
    ('53.3', 'These they seal up and, having attached to them the'),
    ('53.4', 'The Arbitrators are persons in the sixtieth year of their'),
    ('53.5', 'Then the Forty take the last of the Eponymi of'),
    ('53.6', 'Any one who suffers injustice at the hands of the'),
    ('53.7', 'The Eponymi are also used in reference to military expeditions;'),
    ('54.1', 'The following magistrates also are elected by lot: Five Commissioners'),
    ('54.2', 'and ten Auditors, with ten assistants, to whom all persons'),
    ('54.3', 'The Clerk of the Prytany, as he is called, is'),
    ('54.4', 'There is, in addition, a Clerk of the Laws, elected'),
    ('54.5', 'The Assembly also elects by open vote a clerk to'),
    ('54.6', 'The Assembly also elects by lot the Commissioners of Public'),
    ('54.7', 'It also elects by lot ten others, known as Annual'),
    ('54.8', 'An Archon is also elected by lot for Salamis, and'),
    ('55.1', 'All the foregoing magistrates are elected by lot, and their'),
    ('55.2', 'They are examined first of all by the Council of'),
    ('55.3', 'When they are examined, they are asked, first, ‘Who is'),
    ('55.4', 'and when the candidate has produced his witnesses, he next'),
    ('55.5', 'When the examination has been thus completed, they proceed to'),
    ('56.1', 'The Archon, the King, and the Polemarch have each two'),
    ('56.2', 'As soon as the Archon enters office, he begins by'),
    ('56.3', 'Next he assigns Chorēgi to the tragic poets, choosing three'),
    ('56.4', 'He also superintends sacred processions, both that in honour of'),
    ('56.5', 'The Archon also superintends the procession at the Thargelia, and'),
    ('56.6', 'The suits and indictments which come before him, and which'),
    ('56.7', 'The Archon also has the care of orphans and wards'),
    ('57.1', 'The King in the first place superintends the mysteries, in'),
    ('57.2', 'Indictments for impiety come before him, or any disputes between'),
    ('57.3', 'Actions for homicide and wounding are heard, if the homicide'),
    ('57.4', 'All these cases, except those which are heard in the'),
    ('58.1', 'The Polemarch performs the sacrifices to Artemis the huntress and'),
    ('58.2', 'Only private actions come before him, namely those in which'),
    ('58.3', 'The Polemarch, however, brings up in person cases in which'),
    ('59.1', 'The Thesmothetae in the first place have the power of'),
    ('59.2', 'Moreover they introduce impeachments before the Assembly, and bring up'),
    ('59.3', 'All indictments also come before them in which a deposit'),
    ('59.4', 'They also bring up the examinations of all magistrates,'),
    ('59.5', 'Moreover they bring up certain private suits in cases of'),
    ('59.6', 'They ratify commercial treaties, and bring up the cases which'),
    ('59.7', 'The casting of lots for the jurors is conducted by'),
    ('60.1', 'There are also ten Commissioners of Games [Athlothĕtae], elected by'),
    ('60.2', 'This oil is collected from the sacred olives. The Archon'),
    ('60.3', 'When, then, the Archon has collected the oil for his'),
    ('61.1', 'All officers connected with military service are elected by open'),
    ('61.2', 'The appointment of these officers is submitted for confirmation in'),
    ('61.3', 'There are also ten Taxiarchs, one from each tribe, elected'),
    ('61.4', 'There are also two Hipparchs, elected by open vote from'),
    ('61.5', 'There are also ten Phylarchs, elected by open vote, one'),
    ('61.6', 'There is also a Hipparch for Lemnos, elected by open'),
    ('61.7', 'There is also a treasurer of the Paralus, and another'),
    ('62.1', 'Of the magistrates elected by lot, in former times some'),
    ('62.2', 'Pay is received for the following services. First the members'),
    ('62.3', 'The military offices may be held any number of times,'),
    ('63.1', 'The juries for the law-courts are chosen by lot by'),
    ('63.2', 'There are ten entrances into the courts, one for each'),
    ('63.3', 'All persons above thirty years of age are qualified to'),
    ('63.4', 'Each juror has his ticket of box-wood, on which is'),
    ('63.5', 'When the Thesmothetes has decided by lot which letters are'),
    ('64.1', 'The ten chests above mentioned are placed in front of'),
    ('64.2', 'The individual so selected is called the Ticket-hanger [Empēctes], and'),
    ('64.3', 'Then the Archon casts in the dice and thereby chooses'),
    ('64.4', 'Each juror, as he is chosen and answers to his'),
    ('64.5', 'For this purpose chests are placed near the Archon, as'),
    ('65.1', 'The juror thereupon, after showing his counter again to the'),
    ('65.2', 'Each court has a certain colour painted on the lintel'),
    ('65.3', 'So with their counters and their staves the selected jurors'),
    ('65.4', 'The public servants carry the chests from each tribe, one'),
    ('66.1', 'When all the courts are full, two ballot boxes are'),
    ('66.2', 'When the jurors have come in, and have been assigned'),
    ('66.3', 'The five who have not been selected for these duties'),
    ('67.1', 'These preliminaries being concluded, the cases are called on. If'),
    ('67.2', 'Water-clocks are provided, having small supply-tubes,'),
    ('67.3', 'The official chosen by lot to superintend the water-clock places'),
    ('67.4', 'The standard of measurement is the length of the days'),
    ('67.5', 'The measured day is employed in cases when imprisonment, death,'),
    ('68.1', 'Most of the courts consist of 500 members . .'),
    ('68.2', 'The ballot balls are made of brass with stems running'),
    ('68.3', 'Two urns, one of brass and the other of wood,'),
    ('68.4', 'When the jurors are about to vote, the crier demands'),
    ('69.1', 'When all the jurors have voted, the attendants take the'),
    ('69.2', 'Then, if damages have to be awarded, they vote again'),
]

# Punctuation differences from Gutenberg where the print, checked on the image,
# stands as transcribed: (our token, Gutenberg's token, why), tokens as
# _punct_tokens leaves them.
PUNCT_KNOWN = [
    ("Acastus',", "Acastus,'", "p372 img 'Acastus’,'"),
    ("Trittyes[=", "Trittyes", "p379 img '[= Thirds]'"),
    ("Thirds],", "[=Thirds],", "p379 img '[= Thirds]'"),
    ("of", "of?]", "p379 Gutenberg transcriber's note"),
    ("found,", "found.", "p382 img 'found,'"),
    ("Such,", "Such", "p383 img 'Such, then,'"),
    ("this", "this,", "p383 img 'After this it'"),
    ("Demiurgi;", "Demiurgi,", "p384 img 'Demiurgi;'"),
    ("honour,", "honour", "p393 the mark prints as a low dot; read as a comma (verse: 'an honour, befitting')"),
    ("troubles,", "troubles", "p395 img 'troubles,'"),
    ("Ceryces", "Ceryces,", "p415 img 'Cerȳces and'"),
    ("[Hieropoei],", "(Hieropoei)", "p434 img '[Hieropoei],'"),
    ("husbands);", "husbands),", "p437 img 'husbands) ;'"),
    ("Poseideon..........", "Poseideon.", "p447 Kenyon's lacuna, spaced dots"),
    ("members...;", "members;", "p447 Kenyon's lacuna, spaced dots"),
]

# Transcribed as printed and left for a ruling: (page, text, note).
MISPRINTS = [
    (372, "The successor of Medon,", "note ends in a comma"),
    (392, "in the the affair", "note: 'the' doubled"),
    (399, "presumbly", "note: for 'presumably'?"),
    (406, "Poloponnesian", "note: for 'Peloponnesian'?"),
    (420, "to control the while.", "text: for 'the whole'? Gutenberg also has 'while'"),
    (426, "Sir. J. Sandys", "note: full stop after 'Sir'"),
    (437, "It scare only ceased", "note: 'scare' makes no sense ('scarcely'?)"),
    (434, "the seers,", "doubtful reading: the third letter prints like c ('secrs'); Gutenberg 'seers'"),
]

# Every word-level difference from Gutenberg, each checked on the page image:
# (our words, Gutenberg's words, our two words before, why). Words as
# _norm_words leaves them. The check fails on any difference not listed here
# and on any entry here that no longer matches a difference.
GB_KNOWN = [
    ("were", "", "all loans", "p371 img 'All loans were secured'; Gutenberg drops 'were'"),
    ("", "may", "way it", "p373 img 'Whichever way it be'; Gutenberg adds 'may'"),
    ("appointed", "", "thesmothetae were", "p373 img 'The Thesmothetae were appointed'; Gutenberg drops it"),
    ("bucolium", "boculium", "as the", "p373 img 'Bucolium'; Gutenberg misspells"),
    ("of", "", "desperate condition", "p376 img 'condition of the country'; Gutenberg drops 'of'"),
    ("the exchequer", "", "eleven and", "p377 img 'and the Exchequer Clerks'; Gutenberg drops two words"),
    ("those", "", "property to", "p377 img 'To those who ranked'; Gutenberg drops 'those'"),
    ("anthemion", "athenion", "of diphilus", "p378 img 'Anthemion hight'; Gutenberg misreads"),
    ("", "transcribers note", "a time", "p379 a Project Gutenberg transcriber's note"),
    ("far", "for", "had sold", "p382 img 'Far from his god-built land'; Gutenberg misreads"),
    ("i", "", "goad as", "p383 img 'held the goad as I,' (READS p383); Gutenberg drops 'I'"),
    ("till", "til", "nor ceased", "p383 img 'Till he had robbed'; Gutenberg misspells"),
    ("athena", "athens", "rumour that", "p385 img 'a rumour that Athena'; Gutenberg misreads"),
    ("supposed", "suppposed", "alcmeonidae were", "p392 img 'supposed' (READS p392); Gutenberg misspells"),
    ("whence", "when", "the tyrants", "p393 img 'whence there came'; Gutenberg misreads"),
    ("", "of lysimachus and themistocles", "were aristides", "p397 img 'Aristides, son of Lysimachus, and Themistocles'; Gutenberg repeats words"),
    ("the", "", "of lysicrates", "p401 img 'Lysicrates, the thirty'; Gutenberg drops 'the'"),
    ("", "as they", "local justices", "p401 img 'as they were called'; Gutenberg doubles 'as they'"),
    ("in", "", "of antidotus", "p401 img 'Antidotus, in consequence'; Gutenberg drops 'in'"),
    ("the", "", "not transgress", "p404 img 'transgress the laws'; Gutenberg drops 'the'"),
    ("public", "pubic", "impeachments and", "p405 img 'public prosecutions'; Gutenberg misspells"),
    ("phylarchs", "phylarch", "hipparchs the", "p406 img 'Phylarchs' (READS p406); Gutenberg drops the s"),
    ("lacedaemon", "lacedaemonian", "ambassadors to", "p414 img 'to Lacedaemon'; Gutenberg 'Lacedaemonian'"),
    ("lacedaemon", "lacedaemonian", "envoys to", "p414 img 'to Lacedaemon'; Gutenberg 'Lacedaemonian'"),
    ("fulfilment", "fulfillment", "to a", "p415 img 'fulfilment'; Gutenberg's spelling"),
    ("lacedaemon", "lacedaemonian", "later from", "p415 img 'from Lacedaemon'; Gutenberg 'Lacedaemonian'"),
    ("enrolment", "enrollment", "of their", "p419 img 'enrolment'; Gutenberg's spelling"),
    ("enrolment", "enrollment", "of the", "p421 'enrolment' as on p419; Gutenberg's spelling"),
    ("the", "", "cooperates with", "p425 img 'co-operates with the other'; Gutenberg drops 'the'"),
    ("for ten", "", "special agreements", "p426 img 'for [ten?] years'; Gutenberg drops the bracketed words"),
    ("ninth", "", "in the", "p426 img 'in the [ninth] prytany'; Gutenberg drops the bracket"),
    ("stadia", "stradia", "within ten", "p429 img 'ten stadia'; Gutenberg misspells"),
    ("wilful", "willful", "wounding be", "p438 img 'wilful'; Gutenberg's spelling"),
    ("animals", "animal", "the lower", "p439 img 'the lower animals'; Gutenberg drops the s"),
    ("and", "", "the trierarchs", "p442 img 'trierarchs and arranges'; Gutenberg drops 'and'"),
    ("has", "as", "the court", "p444 img 'the court has imposed'; Gutenberg misreads"),
    ("supplytube", "supply tube", "on the", "p447 img 'supply-/tube' at a line end, kept as the print has 'supply-tubes' above; Gutenberg 'supply tube'"),
    ("while", "", "the purpose", "p447 img '[while ... before]'; Gutenberg drops the bracketed words"),
    ("before", "", "are brought", "p447 img '[while ... before]'; Gutenberg drops the bracketed words"),
    ("", "each juror receives two ballots and uses one to record his vote and throws the other away",
     "the defendant", "p449 Gutenberg runs the footnote into the text; here it is note 184"),
    ("", "the end", "the lot", "Gutenberg's closing line"),
]

# Every difference from the Genie OCR, each judged on the page image:
# (stream, ours, Genie's, our two words before, kind, why). Streams "text" and
# "notes" hold words as _genie_words leaves them; "text punct" and "notes
# punct" tokens as _punct_tokens leaves them. The check fails on any difference
# not listed here and on any entry here that no longer matches a difference.
GENIE_KNOWN = [
    ("text punct", "...[They", "[They", "", "spacing",
     "p371 img '. . . [They' with spaced dots, which Genie keeps apart from the word; here closed up, as in Gutenberg"),
    ("notes", "eupatridae", "eupatrid", "all the", "Genie misread",
     "p372 img 'Eupatridae' in separate letters; Genie 'Eupatridæ'"),
    ("notes punct", "Medon,", "Medon.", "successor of", "Genie corrects a misprint",
     "p372 img note 3 'The successor of Medon,' (MISPRINTS); Genie a full stop"),
    ("notes", "1", "i", "ch 8", "Genie misread",
     "p396 img old-style figure one in 'ch. 8, 1'; Genie reads it as the letter I"),
    ("notes", "presumbly", "presumably", "next clause", "Genie corrects a misprint",
     "p399 img 'presumbly' (MISPRINTS); Genie corrects it"),
    ("notes", "poloponnesian", "peloponnesian", "of the", "Genie corrects a misprint",
     "p406 img 'Poloponnesian' (MISPRINTS); Genie corrects it"),
    ("text", "", "siderable time apparently about six months elapsed between this event and the restoration of the democracy", "for the", "Genie misplaces a note",
     "p415 img the end of note 103 ('siderable time ... democracy.') heads the page's notes; Genie runs it into the text after 'fund for the'"),
    ("notes", "considerable time apparently about six months elapsed between this event and the restoration of the democracy", "con", "that a", "Genie misplaces a note",
     "p414-415 the same, seen from the notes: Genie ends note 103 at 'con-'"),
    ("notes punct", "parents.Ακτη=", "parents.'Ακτη=", "two citizen", "encoding",
     "p420 img 'Ἀκτή' with the breathing set before the capital; Genie types the breathing as an apostrophe"),
    ("text", "", "and in 325 bc they began to build quinqueremes as the latter are not mentioned here we seem to get a lower limit of date for the composition or revision of the treatise the upper limit is fixed by ch 54 7 as 329 bc", "the workable", "Genie misplaces a note",
     "p425 img the end of note 136 ('and in 325 B.C. ... as 329 B.C.') heads the page's notes; Genie runs it into the text after 'the workable'"),
    ("notes", "bc and in 325 bc they began to build quinqueremes as the latter are not mentioned here we seem to get a lower limit of date for the composition or revision of the treatise the upper limit is fixed by ch 54 7 as 329", "", "before 330", "Genie misplaces a note",
     "p424-425 the same, seen from the notes: Genie ends note 136 at '330 B.C.,'"),
    ("notes punct", "B.C.", "B.C.,", "as 329", "Genie misplaces a note",
     "p425 a consequence of the misplaced end of note 136: our '329 B.C.' set against Genie's '330 B.C.,'"),
    ("text", "of", "", "the power", "Genie misread",
     "p439 img 'have the power of' ending the line before the numeral 59; Genie drops 'of'"),
    ("text punct", "Poseideon..........", "Poseideon...........", "the month", "Genie misread",
     "p447 img ten leader dots after 'Poseideon⁴'; Genie eleven"),
]

if __name__ == "__main__" and "--dump" in sys.argv:
    pages = load_hocr()
    for n in sorted(pages):
        pg = classify(n, pages[n])
        ps = set(paragraph_starts(pg))
        print(f"=== PAGE {n} (n{n-1}) L={pg.L} R={pg.R} head={[l.text for l in pg.head]} sig={[l.text for l in pg.sig]}")
        marg = {}
        for w, i in pg.margin:
            marg.setdefault(i, []).append(f"{w.text}@{w.x0},h{w.y1-w.y0}")
        for i, l in enumerate(pg.body):
            print(f"{'P' if i in ps else ' '} {l.y0:5} {l.text}" + (f"   <<M {' '.join(marg[i])}" if i in marg else ""))
        print("--- notes")
        for l in pg.notes:
            print(f"  {l.x0 - pg.left(l.y0):4.0f} {l.text}")


if __name__ == "__main__" and "--text" in sys.argv:
    for n, (body, notes) in page_texts(load_hocr()).items():
        print(f"=== PAGE {n}")
        print(body)
        for k, t in enumerate(notes, 1):
            print(f"  #{k} {t}")


if __name__ == "__main__" and len(sys.argv) == 1:
    main()
