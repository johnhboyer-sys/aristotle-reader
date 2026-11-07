#!/usr/bin/env python3
"""Check sources/spir-dobson/book-01.html against two raw OCR reads of the print.

This is the second opinion on build_spir_dobson.py and shares none of its code
or rules: it parses the hOCR with html.parser, not regexes, fits its own page
geometry, and knows nothing of the build's READS or MARGIN tables.

The two readers, both of the Oxford sheets (Works III, 1914):
  T  Toronto worksofaristotle03arisuoft, hOCR leaves 452-468 (word boxes)
  A  Digital Library of India 2015.54389, the djvu plain text (no geometry)

Fetch them into build/spir-ocr/ as the build tool's docstring says.

Every text is cut into tokens (a word, or one punctuation mark), case-folded,
hyphens dropped, curly quotes folded to straight ones.  Ours is aligned against
each reader, and the readers against each other.  It fails on:

  extra    a token of ours that neither reader has at that place, or any
           character of ours outside letters and plain punctuation;
  missing  a token both readers agree on (or, for a word of three letters or
           more, spell nearly alike: "serum" / "scrum") where neither reader's
           copy is matched in ours, unless T's geometry puts it outside the
           text column: the running head, the margin (line numbers), a raised
           note figure, or the footnotes (the closer-set block under the text);
  furniture a token of ours matched to a T token in the head, margin or notes.

Places where Dobson's printed text is corrected (misprints, small capitals,
footnote marks the readers took for letters) are listed in ALLOW, each bound
to a phrase of ours that occurs once; an entry that is not used once fails.

It cannot see a word of ours that copies one reader's misreading where the
other reads true (ours "scrum" where T reads "serum"): one reader supports it.
Nor a loss where the readers garble a word in two unlike ways.  `--selftest`
plants only where the readers agree, and prints how much of ours that is.

    python3 pipeline/tools/verify_spir_dobson.py            # check
    python3 pipeline/tools/verify_spir_dobson.py --selftest # plant defects

Exit 0 clean, 1 failures, 2 when it examined nothing or a read is incomplete
(a leaf with almost no body text).
"""
from __future__ import annotations

import argparse
import difflib
import random
import re
import statistics
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OURS = ROOT / "sources" / "spir-dobson" / "book-01.html"
T_HOCR = ROOT / "build" / "spir-ocr" / "T_hocr_part.html"
A_TXT = ROOT / "build" / "spir-ocr" / "A_djvu.txt"
LEAVES = range(452, 469)

# Characters ours may contain in its paragraphs.
PLAIN = re.compile(r"[A-Za-z ,.;:?!—’‘“”()\[\]⟨⟩-]")

# (kind, token, phrase of ours that holds the place).  Each must be used once.
ALLOW: list[tuple[str, str, str]] = [
    # small capitals, which both readers garble
    ("extra", "what", "What is the mode of growth"),
    # Dobson's angle brackets, which both readers take for round ones
    ("extra", "⟨", "for ⟨performing it well"),
    ("extra", "⟩", "performing it well.⟩"),
    ("missing", "(", "for ⟨performing it well"),
    ("missing", ")", "performing it well.⟩"),
    # note marks both readers read as punctuation, fast to the word
    ("missing", "?", "process of emission? Through"),
    ("missing", "*", "and those leading from the bones"),
    ("missing", "*", "in a positive way are"),
]

WORD = re.compile(r"[^\W\d_]+(?:-[^\W\d_]+)*|\d+|\S")
QUOTES = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"'})


def tokens(text: str, base: int = 0) -> list[tuple[str, int, int]]:
    """(normalised token, start, end) for each token of text."""
    out = []
    for m in WORD.finditer(text):
        t = m.group().translate(QUOTES).casefold().replace("-", "")
        if t:
            out.append((t, base + m.start(), base + m.end()))
    return out


# ---------------------------------------------------------------- ours

def read_ours(html: str) -> tuple[str, list[tuple[str, int, int]]]:
    """The paragraphs' text joined by newlines, and its tokens."""
    paras = re.findall(r"<p>(.*?)</p>", html, re.S)
    text = "\n".join(paras)
    return text, tokens(text)


# ---------------------------------------------------------------- T (hOCR)

@dataclass
class Word:
    text: str
    leaf: int
    line: int          # index of its OCR line
    box: tuple[int, int, int, int]
    n: int = 0         # order in the file


@dataclass
class Line:
    leaf: int
    box: tuple[int, int, int, int]
    xsize: float
    words: list[Word]


class HocrLines(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lines: list[Line] = []
        self.leaf = -1
        self.word: Word | None = None
        self.count = 0

    @staticmethod
    def title_fields(attrs) -> tuple[str, dict[str, str]]:
        a = dict(attrs)
        fields = {}
        for part in (a.get("title") or "").split(";"):
            k, _, v = part.strip().partition(" ")
            fields[k] = v
        return a.get("class") or "", fields | {"id": a.get("id") or ""}

    def handle_starttag(self, tag, attrs):
        cls, f = self.title_fields(attrs)
        if cls == "ocr_page":
            self.leaf = int(f["id"].split("_")[1])
        elif cls == "ocr_line" or cls == "ocr_caption" or cls == "ocr_header" or cls == "ocr_textfloat":
            box = tuple(int(x) for x in f["bbox"].split())
            self.lines.append(Line(self.leaf, box, float(f.get("x_size", "0") or 0), []))
        elif cls == "ocrx_word":
            box = tuple(int(x) for x in f["bbox"].split())
            self.word = Word("", self.leaf, len(self.lines) - 1, box, self.count)
            self.count += 1

    def handle_data(self, data):
        if self.word is not None:
            self.word.text += data

    def handle_endtag(self, tag):
        if tag == "span" and self.word is not None:
            self.lines[-1].words.append(self.word)
            self.word = None


@dataclass
class TTok:
    t: str
    leaf: int
    zone: str      # body | head | margin | notes


def edge(points: list[tuple[float, float]]):
    """Fit x = a + b*y to a column edge (the scans are skewed), dropping
    outliers: indented first lines, line numbers in the margin."""
    pts = points
    for _ in range(4):
        n = len(pts)
        my = sum(y for y, _ in pts) / n
        mx = sum(x for _, x in pts) / n
        b = sum((y - my) * (x - mx) for y, x in pts) / (sum((y - my) ** 2 for y, _ in pts) or 1)
        a = mx - b * my
        res = [abs(x - (a + b * y)) for y, x in pts]
        cut = max(10.0, 3 * statistics.median(res))
        keep = [p for p, r in zip(pts, res) if r <= cut]
        if len(keep) == n:
            break
        pts = keep
    return lambda y: a + b * y


def rows_of(words: list[Word]) -> list[list[Word]]:
    """Printed lines.  Each OCR line is split where its words' bottom edges
    jump (it sometimes packs two printed lines into one); the pieces are then
    joined to any piece on the same level (a line number the OCR set apart).
    Within a piece the OCR's word order stands: its boxes for punctuation
    overlap the next word's."""
    lines: dict[int, list[Word]] = {}
    for w in words:
        lines.setdefault(w.line, []).append(w)
    pieces: list[list[Word]] = []
    for ws in lines.values():
        ws = sorted(ws, key=lambda w: w.box[3])
        cut = [0] + [k for k in range(1, len(ws)) if ws[k].box[3] - ws[k - 1].box[3] > 40] + [len(ws)]
        pieces += [sorted(ws[i:j], key=lambda w: w.n) for i, j in zip(cut, cut[1:])]
    level = lambda pc: statistics.median(w.box[3] for w in pc)
    rows: list[list[list[Word]]] = []
    for pc in sorted(pieces, key=level):
        if rows and level(pc) - level(rows[-1][0]) < 40:
            rows[-1].append(pc)
        else:
            rows.append([pc])
    return [[w for pc in sorted(r, key=lambda pc: pc[0].box[0]) for w in pc] for r in rows]


def zones(lines: list[Line]) -> tuple[list[Word], dict[int, str]]:
    """The leaf's words in reading order, and each word's zone by geometry:
    body, head (above the text), margin (outside the column), notes (the
    small-type block under the text), mark (a raised small figure)."""
    xsize = {id(w): ln.xsize for ln in lines for w in ln.words}
    rows = rows_of([w for ln in lines for w in ln.words])
    if not rows:
        return [], {}
    full = [r for r in rows if len(r) >= 5]
    size = statistics.median(statistics.median(xsize[id(w)] for w in r) for r in full)
    mid = lambda w: (w.box[1] + w.box[3]) / 2
    left = edge([(mid(r[0]), r[0].box[0]) for r in full])
    right = edge([(mid(r[-1]), r[-1].box[2]) for r in full])
    first = rows.index(full[0])
    # the notes: below the first wide gap in the lower half of the page after
    # which the lines are set closer (or, for one line, the type is smaller)
    tops = [statistics.median(w.box[1] for w in r) for r in rows]
    bots = [statistics.median(w.box[3] for w in r) for r in rows]
    gaps = [tops[k] - bots[k - 1] for k in range(first + 1, len(rows))]
    notes = len(rows)
    if gaps:
        usual = statistics.median(gaps)
        lower = [k for k in range(first + 1, len(rows)) if tops[k] > (tops[first] + bots[-1]) / 2]
        pitch = statistics.median(tops[k] - tops[k - 1] for k in range(first + 1, len(rows)))
        for k in lower:
            if tops[k] - bots[k - 1] <= 1.5 * usual:
                continue
            if len(rows) - k >= 2:
                small = statistics.median(tops[m] - tops[m - 1] for m in range(k + 1, len(rows))) < 0.8 * pitch
            else:
                small = statistics.median(xsize[id(w)] for w in rows[k]) < 0.93 * size
            if small:
                notes = k
                break
    zone: dict[int, str] = {}
    for k, r in enumerate(rows):
        heights = statistics.median(w.box[3] - w.box[1] for w in r)
        for w in r:
            y = mid(w)
            if k < first:
                z = "head"
            elif k >= notes:
                z = "notes"
            elif w.box[2] < left(y) - 4 or w.box[0] > right(y) + 4:
                z = "margin"
            elif (w.box[3] - w.box[1] < 0.65 * heights and w.box[3] < bots[k] - 0.2 * heights
                  and not re.search(r"[^\W\d_]{2}", w.text)):
                z = "mark"
            else:
                z = "body"
            zone[id(w)] = z
    return [w for r in rows for w in r], zone


def read_t(path: Path) -> list[TTok]:
    p = HocrLines()
    p.feed(path.read_text(encoding="utf-8"))
    out: list[TTok] = []
    for leaf in LEAVES:
        seq, zone = zones([ln for ln in p.lines if ln.leaf == leaf and ln.words])
        rows = rows_of(seq)
        ends = {id(r[-1]) for r in rows}
        body_ends = {id([w for w in r if zone[id(w)] == "body"][-1])
                     for r in rows if any(zone[id(w)] == "body" for w in r)}
        i = 0
        while i < len(seq):
            w = seq[i]
            text, z = w.text.strip(), zone[id(w)]
            # a body word broken at the line end runs on into the next body
            # word; a line number met on the way keeps its own place
            while text.endswith("-") and id(w) in body_ends and z == "body":
                j = i + 1
                while j < len(seq) and zone[id(seq[j])] in ("margin", "mark"):
                    j += 1
                if j >= len(seq) or zone[id(seq[j])] != "body":
                    break
                for k in range(i + 1, j):
                    out += [TTok(t, leaf, zone[id(seq[k])]) for t, _, _ in tokens(seq[k].text)]
                i = j
                w = seq[i]
                text = text[:-1] + w.text.strip()
            out += [TTok(t, leaf, z) for t, _, _ in tokens(text)]
            i += 1
    return out


# ---------------------------------------------------------------- A (djvu text)

def read_a(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    start = next(i for i, s in enumerate(lines)
                 if s.strip() == "DE SPIRITU" and any(x.startswith("I W") for x in lines[i + 1:i + 6]))
    end = next(i for i in range(start, len(lines)) if "their opposites." in lines[i])
    text, out = "", []
    for s in lines[start:end + 1]:
        s = s.strip()
        if text.endswith("-") and s:
            num = re.match(r"(\d+)\s+(.*)", s)
            lead, s = (num.group(1) + " ", num.group(2)) if num else ("", s)
            head, _, last = text.rpartition(" ")
            text = (head + " " if head else "") + lead + last[:-1] + s
        else:
            out.append(text)
            text = s
    out.append(text)
    return [t for line in out for t, _, _ in tokens(line)]


# ---------------------------------------------------------------- the check

def matches(a: list[str], b: list[str]) -> dict[int, int]:
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    m = {}
    for i, j, n in sm.get_matching_blocks():
        for k in range(n):
            m[i + k] = j + k
    return m


def partners(a: list[str], b: list[str]) -> dict[int, int]:
    """Where the two readers read the same word: identical tokens, and also,
    in a run where they differ token for token, a pair of words of three or
    more letters spelt nearly alike (T "serum", A "scrum")."""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    m = {}
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            m.update({i1 + k: j1 + k for k in range(i2 - i1)})
        elif op == "replace" and i2 - i1 == j2 - j1:
            for k in range(i2 - i1):
                x, y = a[i1 + k], b[j1 + k]
                if (len(x) >= 3 and x.isalpha() and y.isalpha()
                        and difflib.SequenceMatcher(None, x, y).ratio() >= 0.6):
                    m[i1 + k] = j1 + k
    return m


MIN_SHARED = 0.8
MIN_LEAF = 150   # body tokens: the shortest leaf (468, the ending) has 175


def coverage(T: list["TTok"], A: list[str]) -> list[str]:
    """What the readers failed to give: a leaf of T with (almost) no body
    text, or a leaf's text that A does not have."""
    out = []
    for leaf in LEAVES:
        n = sum(1 for x in T if x.leaf == leaf and x.zone == "body")
        if n < MIN_LEAF:
            out.append(f"T leaf {leaf}: {n} body tokens — the read is incomplete")
    # A has no leaves of its own: a leaf of T's text that A barely shares is
    # one A lost (every leaf shares 97% or more as read on 2026-11-06)
    pa = partners([x.t for x in T], A)
    for leaf in LEAVES:
        body = [j for j, x in enumerate(T) if x.leaf == leaf and x.zone == "body"]
        if body and sum(j in pa for j in body) < MIN_SHARED * len(body):
            out.append(f"A shares under {MIN_SHARED:.0%} of T leaf {leaf}'s text — the read is incomplete")
    return out


@dataclass
class Fail:
    kind: str
    at: int          # character offset in ours
    token: str
    note: str = ""


def check(text: str, T: list[TTok], A: list[str], verbose: bool = True) -> tuple[list[Fail], dict]:
    ours = tokens(text)
    o = [t for t, _, _ in ours]
    tt = [x.t for x in T]
    o_t = matches(o, tt)
    o_a = matches(o, A)
    t_a = partners(tt, A)
    a_o = {j: i for i, j in o_a.items()}
    t_o = {j: i for i, j in o_t.items()}
    fails: list[Fail] = []

    for m in re.finditer(r"[^\n]", text):
        if not PLAIN.fullmatch(m.group()):
            fails.append(Fail("extra", m.start(), m.group(), "character outside plain text"))

    both = one = 0
    for i, (t, s, _) in enumerate(ours):
        in_t, in_a = i in o_t, i in o_a
        both += in_t and in_a
        one += in_t != in_a
        if not (in_t or in_a):
            fails.append(Fail("extra", s, t, "neither reader has it here"))
        if in_t and T[o_t[i]].zone != "body":
            fails.append(Fail("furniture", s, t, f"T {T[o_t[i]].zone}, leaf {T[o_t[i]].leaf}"))

    # where in ours a missing T token would sit: just after the last of ours
    # matched before it
    agreed = 0
    prev_end = 0
    for j, x in enumerate(T):
        if j in t_o:
            prev_end = ours[t_o[j]][2]
        if j not in t_a:
            continue
        agreed += 1
        # missing when neither reader's copy of the word is matched in ours.
        # A's copy counts only if the token of ours it matched is not one T
        # places elsewhere: on a tie the alignment can pair A's closing quote
        # with our opening one.
        i = a_o.get(t_a[j])
        if j not in t_o and (i is None or i in o_t) and x.zone == "body":
            fails.append(Fail("missing", prev_end, x.t, f"both readers, leaf {x.leaf}"))

    # the allowlist: each entry excuses one failure inside its phrase
    for kind, tok, phrase in ALLOW:
        n = text.count(phrase)
        lo = text.find(phrase)
        hits = [f for f in fails if f.kind == kind and f.token == tok and n == 1
                and lo <= f.at <= lo + len(phrase)]
        if len(hits) == 1:
            fails.remove(hits[0])
        else:
            fails.append(Fail("allow", max(lo, 0), tok,
                              f"entry ({kind}, {phrase!r}) used {len(hits)} times, phrase found {n}"))

    stats = dict(ours=len(o), T=len(tt), A=len(A), both=both, one=one,
                 neither=len(o) - both - one, agreed=agreed)
    return sorted(fails, key=lambda f: f.at), stats


def show(text: str, fails: list[Fail]) -> None:
    for f in fails:
        ctx = text[max(0, f.at - 40):f.at + 40].replace("\n", " ¶ ")
        print(f"  {f.kind:9} {f.token!r:8} {f.note}\n            …{ctx}…")


# ---------------------------------------------------------------- self-test

NUMBERS = ["one", "two", "three", "four", "five", "first", "second", "third", "both", "half"]


def plants(text: str, ours, agreed_tok: set[int], rng: random.Random, n: int):
    """Yield (kind, mutated text, char offset of the plant)."""
    words = [k for k in agreed_tok if ours[k][0].isalpha()]
    commas = [k for k in agreed_tok if ours[k][0] == ","]
    quotes = [k for k in agreed_tok if ours[k][0] in "'\""]
    stops = [k for k in agreed_tok if ours[k][0] == "."]
    for k in rng.sample(sorted(words), n):
        s, e = ours[k][1], ours[k][2]
        yield "lost word", text[:s] + text[e:].lstrip(" ") if s and text[s - 1] == " " else text[:s] + text[e:], s
    for kind, pool in (("lost comma", commas), ("lost quote", quotes), ("lost stop", stops)):
        for k in rng.sample(sorted(pool), min(n, len(pool))):
            s, e = ours[k][1], ours[k][2]
            yield kind, text[:s] + text[e:], s
    sents = [m for m in re.finditer(r"[^.?!\n]+[.?!]+[’”]?\s*", text) if len(m.group()) > 20]
    for m in rng.sample(sents, n):
        yield "lost sentence", text[:m.start()] + text[m.end():], m.start()
    nums = [m for m in re.finditer(r"\b(" + "|".join(NUMBERS) + r")\b", text)]
    for m in rng.sample(nums, min(n, len(nums))):
        new = rng.choice([w for w in NUMBERS if w != m.group()])
        yield "changed number", text[:m.start()] + new + text[m.end():], m.start()
    spaces = [m.start() for m in re.finditer(r" ", text)]
    for s in rng.sample(spaces, n):
        mark = rng.choice(["*", "®", "1", "†", "°", "’", ",", "|", "!", "“"])
        yield "stray mark", text[:s] + mark + text[s:], s


def selftest(text: str, T, A, n: int, seed: int) -> int:
    base, _ = check(text, T, A)
    if base:
        print(f"self-test needs a clean baseline; it has {len(base)} failures")
        return 1
    ours = tokens(text)
    o_t = matches([t for t, _, _ in ours], [x.t for x in T])
    t_a = partners([x.t for x in T], A)
    # the words a deletion can be caught at: ours matched to a T word the
    # readers agree on (exactly or nearly)
    agreed_tok = {i for i, j in o_t.items() if j in t_a}
    print(f"  plant pool: {len(agreed_tok)} of {len(ours)} tokens of ours")
    rng = random.Random(seed)
    tally: dict[str, list[int]] = {}
    missed = []
    for kind, mutated, at in plants(text, ours, agreed_tok, rng, n):
        fails, _ = check(mutated, T, A)
        hit = any(abs(f.at - at) <= 60 and f.kind != "allow" for f in fails)
        tally.setdefault(kind, [0, 0])
        tally[kind][0] += 1
        tally[kind][1] += hit
        if not hit:
            missed.append((kind, at, text[max(0, at - 40):at + 40].replace("\n", " ¶ ")))
    # a lost leaf: the read itself incomplete
    for leaf in (LEAVES[0], LEAVES[-1], 460):
        tally.setdefault("lost leaf", [0, 0])
        tally["lost leaf"][0] += 1
        hit = bool(coverage([x for x in T if x.leaf != leaf], A))
        tally["lost leaf"][1] += hit
        if not hit:
            missed.append(("lost leaf", leaf, f"T without leaf {leaf}"))
    # a lost leaf in A: cut the span of A that holds a T leaf's text
    pa = partners([x.t for x in T], A)
    for leaf in (LEAVES[0], LEAVES[-1], 454):
        span = [pa[j] for j, x in enumerate(T) if x.leaf == leaf and j in pa]
        hit = bool(coverage(T, A[:min(span)] + A[max(span) + 1:]))
        tally.setdefault("lost A leaf", [0, 0])
        tally["lost A leaf"][0] += 1
        tally["lost A leaf"][1] += hit
        if not hit:
            missed.append(("lost A leaf", leaf, f"A without leaf {leaf}"))
    for kind, (planted, caught) in tally.items():
        print(f"  {kind:15} planted {planted:3}  caught {caught:3}")
    for kind, at, ctx in missed:
        print(f"  MISSED {kind} at {at}: …{ctx}…")
    total = sum(p for p, _ in tally.values())
    if total == 0:
        print("self-test planted nothing")
        return 2
    return 1 if missed else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("-n", type=int, default=30, help="plants per kind")
    ap.add_argument("--seed", type=int, default=1914)
    args = ap.parse_args()
    for p in (T_HOCR, A_TXT):
        if not p.exists():
            sys.exit(f"missing {p} — fetch the scans first (see build_spir_dobson.py)")
    text, _ = read_ours(OURS.read_text(encoding="utf-8"))
    T, A = read_t(T_HOCR), read_a(A_TXT)
    short = coverage(T, A)
    if short:
        print("\n".join(short))
        return 2
    fails, st = check(text, T, A)
    print(f"ours {st['ours']} tokens; T {st['T']}; A {st['A']}; readers agree on {st['agreed']}")
    print(f"ours tokens found in both readers {st['both']}, in one {st['one']}, in neither {st['neither']}")
    if st["ours"] == 0 or st["agreed"] == 0:
        print("examined nothing")
        return 2
    if args.selftest:
        return selftest(text, T, A, args.n, args.seed)
    show(text, fails)
    print(f"{len(fails)} failures" if fails else "clean")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
