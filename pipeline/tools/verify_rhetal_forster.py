"""Check sources/rhetal-forster/book-01.html against the raw OCR of the three
scans it was built from. Shares no code with build_rhetal_forster.py: a check
that reused the build's rules would compare the text with itself.

Two checks, each against all three scans (hOCR as archive.org serves it):

  words        Our text and each scan's page text, reduced to lowercase
               letters, are aligned word by word.
               - A word of ours that no scan has where we put it is reported
                 (a changed word or number, a stray word or figure). An
                 empty text is an error, not a pass.
               - Words that two scans have at one place and we lack are
                 reported (a lost word, line or sentence). Inside a page every
                 word counts; across a page break only the lines that run on
                 from our text at the usual pitch and type size, since the
                 running head, footnotes and signature fall there and we drop
                 them on purpose (see _in_text); a page lying wholly between
                 the two matched words counts but for its head line. Margin
                 figures and words that
                 are our neighbours misread ("aman") are set aside.
  punctuation  For each word of ours matched in two scans or more, the marks
               on it (quotes, stops, brackets, dashes) must equal what the
               scans read there, once call-out debris (^ * ° ®, glued
               figures) is set aside; where the scans disagree a trailing ! or
               ? may be a call-out too. Reports a lost quote, a stray mark.

ACCEPTED lists each place where the scans and our text differ because the
page image was read (PRINT_READS in the build script), with what the print
shows. Anything else fails, and so does an entry that accounts for no finding
(stale) or for more than one (too loose).

  --selftest  plants each of PLANTS (a lost word, sentence, line at a page's
              foot and at its head, a changed number word, a stray mark, a
              lost quote, an added figure), cuts a whole page, and empties the
              text, and fails unless every one is reported and the clean text
              reports nothing unaccepted.

Run from the repo root:
  python3 pipeline/tools/verify_rhetal_forster.py --ocr-dir build/rhetal/ocr [--selftest]
Standard library only.
"""
from __future__ import annotations

import argparse
import difflib
import html
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEXT = ROOT / "sources" / "rhetal-forster" / "book-01.html"
SCANS = {"A": ("worksofaristotle0011wrhy", 243), "B": ("worksofaristotle0011wdro_k5k3", 243),
         "C": ("worksofaristotle11arisuoft", 239)}  # hOCR page index of the Letter
PAGES = 74

# Differences the page images settle (worksofaristotle11arisuoft, leaf
# n238+k): (kind, text the report line carries, what the print shows).
ACCEPTED = [
    ("mark", "'cause' marks ''", "k=1: 'this cause¹ too', a call-out all three read as ’"),
    ("mark", "'Theodectes,' marks ','", "k=3: 'Theodectes,⁷', a call-out read as ’ or ”"),
    ("mark", "'names:' marks ':'", "k=38: a broken colon, read as . , and ;’"),
    ("mark", "'⟨are' marks '⟨'", "k=29: Forster's angle bracket, which the OCR reads as ("),
    ("mark", "'they⟩' marks '⟩'", "k=29: the closing angle bracket, read as )"),
    ("word", "'both' in no scan", "k=41: italic 'both', which all three read as 'doth'"),
    ("lost", "['doth'] missing", "the same"),
    ("lost", "['cfop'] missing", "k=64: a one-line footnote, ἀναλογιστέον (CFOP), set close under the text"),
    # Read on the page image after a diff against Genie's OCR (a fourth
    # witness) showed all three scans misreading alike; n<N> is archive.org's
    # page image of worksofaristotle0011wrhy, which shows hOCR page N+1.
    ("mark", "'another:' marks ':', scans {'!:': 2, \"':'\": 1}: …on the top of another: ‘If",
     "n259: 'another¹ :', the call-out read as !"),
    ("mark", "'⟨you' marks '⟨', scans {'¢': 1, '(': 2}: …distinction to good luck, ⟨you must",
     "n299: Forster's angle bracket, read as ( or ¢"),
    ("mark", "'years⟩,' marks '⟩,', scans {'),': 3}: …beginning from his earliest years⟩, observing",
     "n299: the closing angle bracket, read as )"),
    ("lost", "['new'] missing before …already described. Let us now deal",
     "n284: 'now', its o worn so that all three read 'new'"),
]


def _norm(t: str) -> str:
    t = t.lower().replace("æ", "ae")
    t = re.sub(r"(?<=[a-z])\d+$", "", re.sub(r"[^a-z0-9]", "", t))
    return t


_DEBRIS = re.compile(r"[\^*°®§|~_]|(?<=\D)\d+(?=\W*$)")


def _marks(t: str, scan: bool) -> str:
    """The marks on a token: quotes folded to ' and ", letters dropped."""
    t = t.replace("‘", "'").replace("’", "'").replace("`", "'").replace("“", '"').replace("”", '"')
    t = t.replace("''", '"').replace("–", "—").replace("--", "—")
    if scan:
        t = _DEBRIS.sub("", t)
    return re.sub(r"[A-Za-z0-9\-]", "", t)


# ------------------------------------------------------------- the scans

_PAGE = re.compile(r"<div class=.ocr_page")
_LINE = re.compile(r"<span class=.ocr_(?:line|caption|header|textfloat)\b[^>]*?bbox \d+ (\d+) \d+ (\d+)"
                   r"(?:[^>]*?baseline [-\d.]+ (-?\d+))?")
_WORD = re.compile(r"<span class=.ocrx_word.[^>]*?bbox (\d+) (\d+) (\d+) (\d+)[^>]*>(.*?)</span>", re.S)


def _split(t: str) -> list[str]:
    """A dash between words parts them: "son?’—‘Yes," -> "son?’—", "‘Yes,"."""
    return [x for x in re.split(r"(?<=—)(?=\S)", t) if x]


def _lines(page: str) -> list[tuple[int, int, list[tuple[int, int, str]]]]:
    """Each OCR line as (baseline, bottom, words); a word is (x0, x1, text)."""
    marks = list(_LINE.finditer(page))
    out = []
    for m, nxt in zip(marks, marks[1:] + [None]):
        chunk = page[m.start():nxt.start() if nxt else len(page)]
        ws = [(int(x0), int(x1), html.unescape(re.sub(r"<[^>]+>", "", t)).strip())
              for x0, _, x1, _, t in _WORD.findall(chunk)]
        base = int(m.group(2)) + int(m.group(3) or 0)  # bottom plus the baseline offset
        out.append((base, int(m.group(2)), [w for w in ws if w[2]]))
    return out


def _body(lines: list) -> tuple[list[tuple[int, list[str]]], float]:
    """Each line as (baseline, tokens without the margin figures, median
    width per letter: the type size), and the page's line pitch. Margin figures (Bekker line numbers, chapter numerals) are
    tokens wholly outside the text column, whose edges are the median first
    and last x of the page's longer lines."""
    full = [ln for _, _, ln in lines if len(ln) >= 5]
    if not full:
        return [(y0, [w[2] for w in ln], 0.0) for y0, _, ln in lines], 0.0
    left = sorted(ln[0][0] for ln in full)[len(full) // 2]
    right = sorted(ln[-1][1] for ln in full)[len(full) // 2]
    tops = sorted(y0 for y0, _, ln in lines if len(ln) >= 5)
    steps = sorted(b - a for a, b in zip(tops, tops[1:]))
    pitch = steps[len(steps) // 2] if steps else 0.0
    out = []
    for y0, _, ln in lines:
        ws = [(x0, x1, t) for x0, x1, t in ln if x1 >= left - 5 and x0 <= right - 5]
        per = sorted((x1 - x0) / len(t) for x0, x1, t in ws if len(re.sub(r"\W", "", t)) >= 3)
        out.append((y0, [t for _, _, t in ws], per[len(per) // 2] if per else 0.0))
    return out, pitch


def scan_words(path: Path, first: int) -> list[tuple]:
    """(normalized word, raw token, page, line baseline, page's line pitch, first
    line of its page, its line's type size) for every word on the work's pages, in reading order. A
    word broken at a line end is joined to its rest; a token of marks alone
    is joined to its neighbour."""
    s = path.read_text(encoding="utf-8")
    starts = [m.start() for m in _PAGE.finditer(s)] + [len(s)]
    out: list[list] = []  # [norm, raw, page, baseline, pitch, head line, line number, type]
    line = 0
    for k in range(PAGES):
        lines, pitch = _body(_lines(s[starts[first + k]:starts[first + k + 1]]))
        top = min((y0 for y0, toks, _ in lines if toks), default=0)
        for y0, toks, per in lines:
            line += 1
            toks = [x for t in toks for x in _split(t)]
            for i, t in enumerate(toks):
                n = _norm(t)
                if not n:
                    if out and out[-1][6] == line and t[:1] not in "‘“(":
                        out[-1][1] += t  # "intention ;" -> "intention;"
                    elif i + 1 < len(toks):
                        toks[i + 1] = t + toks[i + 1]
                    continue
                prev = out[-1] if out else None
                if (prev and prev[2] == k and prev[6] < line and n.isalpha()
                        and re.search(r"[a-z]-\W*$", prev[1])):
                    prev[1] = re.sub(r"-(\W*)$", r"\1", prev[1]) + t  # broken at the line end
                    prev[0] = _norm(prev[1])
                    prev[6] = line
                    continue
                if n.isdigit():
                    continue  # margin figures; the text itself has none
                out.append([n, t, k, y0, pitch, y0 == top, line, per])
    return [tuple(w[:6]) + (w[7],) for w in out]


# ------------------------------------------------------------- our text

def our_words(text: str) -> list[tuple[str, str, bool]]:
    """(normalized word, token, whether Forster's Greek stood just before it)."""
    text = re.sub(r"<h3>.*?</h3>|Translated by E\. S\. Forster|Part \d+", " ", text)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    out: list = []
    greek = False
    for t in (x for t in text.split() for x in _split(t)):
        if re.search(r"[\u0370-\u03ff\u1f00-\u1fff]", t):
            greek = True  # Forster's Greek: the scans read it as Latin letters
            continue
        if not _norm(t):
            if out:
                out[-1] = (out[-1][0], out[-1][1] + t, out[-1][2])
            continue
        out.append((_norm(t), t, greek))
        greek = False
    return out


# ------------------------------------------------------------- the checks

def _marks_ok(mine: str, scans: Counter) -> bool:
    """Where the scans read a word's marks alike, ours must be the same. Where
    they differ, a call-out stands there (the OCR reads it as ! ? ' or ") and
    ours may be any scan's reading, or one with such debris cut from its end."""
    if len(scans) == 1:
        return mine in scans
    for r in scans:
        for x in (r, re.sub(r"(?<=['\"])[!?]+", "", r)):  # "so’²;" read as so'?;
            if x == mine or (x.startswith(mine) and re.fullmatch(r"[!?]+", x[len(mine):])):
                return True
    return False


def _read_as(w: str, near: list[str]) -> bool:
    """A scan word that is our neighbouring words misread, not lost: two run
    together ("aman"), one misspelt ("shali"), or the tail of a word broken
    over a line ("ruptions")."""
    pairs = [a + b for a, b in zip(near, near[1:])]
    return (w in pairs or any(x.endswith(w) and len(w) >= 4 for x in near)
            or any(difflib.SequenceMatcher(None, w, x).ratio() >= 0.8 for x in near + pairs))


def _in_text(sw: list, j: int, before: int, after: int) -> bool:
    """Whether scan word j, in a gap between the matched words `before` and
    `after`, stands in the text and not in a running head or footnote. Inside
    a page, every word in the gap does. Across a page break the gap also holds
    the head, the notes and the printer's signature, so only words on the
    matched words' own lines, or on a line next to them at the usual pitch
    (within 1.1) and in the same type (width per letter within 0.95), count:
    the notes are in smaller type, the head is a page's first line. Measured
    on this book, a note line comes 1.0-1.5 pitches down at 0.84-0.94 of the
    text's width; "proem." alone on the last line of leaf 50 at 1.0 and 1.07."""
    w = sw[j]
    lo = sw[before][2] if 0 <= before < len(sw) else -1
    hi = sw[after][2] if 0 <= after < len(sw) else PAGES
    if lo < w[2] < hi and not w[5]:
        return True  # a page our text skips whole: all but its head line count
    for m in (before, after):
        if not 0 <= m < len(sw) or sw[m][2] != w[2]:
            continue
        if sw[before][2] == sw[after][2] if 0 <= before and after < len(sw) else False:
            return True
        if (not w[5] and abs(w[3] - sw[m][3]) <= 1.1 * w[4]
                and w[6] and sw[m][6] and w[6] >= 0.95 * sw[m][6]):
            return True
    return False


def check(text: str, scans: dict[str, list]) -> list[tuple[str, int, str]]:
    ours = our_words(text)
    if not ours:
        raise ValueError("our text has no words")
    keys = [w for w, _, _ in ours]
    found = [0] * len(ours)          # how many scans have our word i
    agree = [Counter() for _ in ours]  # the scans' marks on our word i
    lost: dict[int, Counter] = {}    # words scans have just before our word i
    for s, sw in scans.items():
        sm = difflib.SequenceMatcher(None, keys, [w[0] for w in sw], autojunk=False)
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal":
                for d in range(i2 - i1):
                    found[i1 + d] += 1
                    agree[i1 + d][_marks(sw[j1 + d][1], True)] += 1
            elif j2 > j1:
                for j in range(j1, j2):
                    if _in_text(sw, j, j1 - 1, j2):
                        lost.setdefault(i1, Counter())[sw[j][0]] += 1
    report = []
    for i, (w, t, _) in enumerate(ours):
        ctx = " ".join(x for _, x, _ in ours[max(0, i - 4):i + 4])
        if not found[i]:
            report.append(("word", i, f"{t!r} in no scan: …{ctx}…"))
        elif found[i] >= 2 and not _marks_ok(_marks(t, False), agree[i]):
            report.append(("mark", i, f"{t!r} marks {_marks(t, False)!r}, scans {dict(agree[i])}: …{ctx}…"))
    for i, c in sorted(lost.items()):
        if ours[i][2] if i < len(ours) else False:
            continue  # the scans' reading of Forster's Greek
        near = keys[max(0, i - 2):i + 2]
        gone = [w for w, n in c.items() if n >= 2 and not _read_as(w, near)]
        if gone:
            ctx = " ".join(x for _, x, _ in ours[max(0, i - 4):i + 4])
            report.append(("lost", i, f"{gone} missing before …{ctx}…"))
    return report


def load_scans(d: Path) -> dict[str, list]:
    return {s: scan_words(d / f"{ident}_hocr.html", first) for s, (ident, first) in SCANS.items()}


def unaccepted(report: list) -> list:
    return [r for r in report if not any(r[0] == k and a in r[2] for k, a, _ in ACCEPTED)]


def stale_or_loose(report: list) -> list:
    """Each ACCEPTED entry must account for exactly one finding: one that
    matches none has gone stale, one that matches more is too loose."""
    return [(k, a, n) for k, a, _ in ACCEPTED
            if (n := sum(1 for r in report if r[0] == k and a in r[2])) != 1]


# ------------------------------------------------------------- self-test

PLANTS = [  # (name, what our text has, what the planted copy has)
    ("lost word", "pay the closest attention when", "pay the attention when"),
    ("lost sentence", " These are the means which we must employ to avert a war which is likely to occur.", ""),
    ("changed number", "common to all seven kinds of oratory", "common to all eight kinds of oratory"),
    ("stray mark", "with proems; for the proem", "with proems; for the proem*"),
    ("lost quote", "the so-called ‘articles’ in the proper", "the so-called ‘articles in the proper"),
    ("lost line at a page foot", "narratives of facts in our proem.</p>", "narratives of facts in our</p>"),
    ("lost line at a page head", "infallible signs can only be constructed from contrarieties of word and deed",
     "infallible deed"),
    ("added figure", "common to all seven kinds of oratory", "common to all 7 seven kinds of oratory"),
]
# A lost page: page 21 of the work cut out exactly, from its first text word
# in scan A to the next page's, so the words on either side of the gap stand
# on pages 20 and 22 and nothing on 21 sits on a matched word's page.
LOST_PAGE = 21


def _cut_page(text: str, sw: list, page: int) -> str:
    ours = our_words(text)
    sm = difflib.SequenceMatcher(None, [w for w, _, _ in ours], [w[0] for w in sw], autojunk=False)
    first: dict[int, int] = {}
    for a, b, n in sm.get_matching_blocks():
        for d in range(n):
            if not sw[b + d][5]:
                first.setdefault(sw[b + d][2], a + d)
    at = []
    for i in (first[page], first[page + 1]):
        pat = r"(?:\s|<[^>]+>)+".join(re.escape(t) for _, t, _ in ours[i:i + 6])
        hits = [m.start() for m in re.finditer(pat, text)]
        assert len(hits) == 1, (i, hits)
        at.append(hits[0])
    return text[:at[0]] + text[at[1]:]


def selftest(text: str, scans: dict) -> bool:
    clean = unaccepted(check(text, scans))
    ok = not clean
    print(f"clean text: {len(clean)} unaccepted findings")
    for name, old, new in PLANTS:
        if text.count(old) != 1:
            print(f"  PLANT {name}: {old!r} occurs {text.count(old)} times, want once")
            ok = False
            continue
        got = [r for r in unaccepted(check(text.replace(old, new), scans)) if r not in clean]
        print(f"  {'caught' if got else 'MISSED'}: {name}" + (f" -> {got[0][2][:90]}" if got else ""))
        ok = ok and bool(got)
    cut = _cut_page(text, scans["A"], LOST_PAGE)
    got = [r for r in unaccepted(check(cut, scans)) if r not in clean]
    print(f"  {'caught' if got else 'MISSED'}: lost page ({len(text) - len(cut)} characters, page {LOST_PAGE})"
          + (f" -> {got[0][2][:90]}" if got else ""))
    ok = ok and bool(got)
    try:
        check("", scans)
        print("  MISSED: empty text")
        ok = False
    except ValueError:
        print("  caught: empty text")
    return ok


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ocr-dir", required=True)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    text = TEXT.read_text(encoding="utf-8")
    scans = load_scans(Path(a.ocr_dir))
    for s, sw in scans.items():
        if len(sw) < 15000:
            print(f"scan {s}: only {len(sw)} words read; wrong page index?")
            return 1
    if a.selftest:
        ok = selftest(text, scans)
        print("selftest", "PASS" if ok else "FAIL")
        return 0 if ok else 1
    report = check(text, scans)
    bad = unaccepted(report)
    print(f"{len(our_words(text))} words checked against {', '.join(f'{s} {len(w)}' for s, w in scans.items())}"
          f" scan words; {len(report)} differences, {len(report) - len(bad)} accepted, {len(bad)} not")
    for kind, i, msg in bad:
        print(f"  {kind}: {msg}")
    loose = stale_or_loose(report)
    for kind, a, n in loose:
        print(f"  ACCEPTED {kind} {a[:60]!r} matches {n} findings, want one")
    return 1 if bad or loose else 0


if __name__ == "__main__":
    sys.exit(main())
