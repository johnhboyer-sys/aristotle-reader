"""Build sources/cat-taylor/ and sources/int-taylor/ from Thomas Taylor's own 1812 print.

Taylor, The Works of Aristotle, vol. I (London: R. Wilks, 1812), archive.org `works00taylgoog`
(Google scan; the only scan of this volume found, so the page image is the sole authority).
Categories: printed pp. 57-131 (leaves n72-n146). On Interpretation: pp. 141-187 (n156-n202).
Leaf N is https://archive.org/download/works00taylgoog/page/nN.jpg.

Reads
  pipeline/data/taylor1812/nNN.txt   a line-for-line transcript of each page, as printed:
      `=== body` / `=== notes` sections, one line per printed line, line-end hyphens kept,
      `¶` opening a line that the print indents (a new paragraph), `[^m]` for a printed note
      mark (raised numeral, *, †), `*...*` for italic. Each was made from a blind read of the
      page image, compared word by word with the archive.org OCR; every place the two
      disagree is listed in judged.tsv with how it was settled (see --verify).
  pipeline/data/taylor1812/judged.tsv  leaf, section, line, OCR words, print words, how judged.

Writes
  sources/{cat,int}-taylor/book-01.html   `Part N` per Taylor chapter (Cat I-XV, Int I-XIV),
                                          paragraphs as printed, `[^N]` note markers
  sources/{cat,int}-taylor/footnotes.json {N: html}; Taylor's notes, numbered 1.. per work

Rules applied in the build (the only changes from the transcript):
  - a word broken at a line end is joined, and its hyphen dropped unless the print sets the
    hyphenated word mid-line somewhere in these pages (non-being; see compounds);
  - `CHAPTER N.` headings become `Part N`; a chapter's opening word, printed in capitals,
    is set in sentence case (THINGS -> Things);
  - note marks are renumbered 1.. through each work, in page order, since the print's own
    marks restart (1-9, then again) and some are * and †; the mark in the body and the note
    it opens are paired in order, on the mark's page or, where a long note fills the foot of
    the next pages, on the first page where notes open again, and the build exits if marks
    are left over. A mark inside a note opens a sub-note, which is appended to the note that carries
    it; a mark on a chapter heading (Int. XIV) is set before the chapter's first word;
  - a table (`left<TAB>right` rows under group numbers) becomes one paragraph per numbered
    group, in number order (see untable);
  - in notes, `*...*` becomes <em>, a `¶` line a new <p>.

usage (repo root):
  python3 pipeline/tools/build_taylor_1812.py              write the four files
  python3 pipeline/tools/build_taylor_1812.py --check      exit 1 if the files differ from a build
  python3 pipeline/tools/build_taylor_1812.py --verify --ocr-dir DIR
        DIR holds works00taylgoog_djvu.xml
        (https://archive.org/download/works00taylgoog/works00taylgoog_djvu.xml). Fails on any transcript word that differs from the
        OCR and is not in judged.tsv, on any judged.tsv entry that no longer matches, and if
        it compared nothing.
  python3 pipeline/tools/build_taylor_1812.py --selftest --ocr-dir DIR
        mutates a fresh copy of the transcripts and checks --verify catches each mutation.
Needs only the standard library.
"""
from __future__ import annotations

import argparse
import contextlib
import difflib
import io
import html
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "pipeline" / "data" / "taylor1812"
WORKS = {
    "cat": {"dir": "cat-taylor", "leaves": range(72, 147), "chapters": 15},
    "int": {"dir": "int-taylor", "leaves": range(156, 203), "chapters": 14},
}
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50}
CHAPTER = re.compile(r"CHAPTER\s+([IVXL]+)(\[\^[^\]]+\])?\.?")
MARK = re.compile(r"\[\^([^\]]+)\]")
# Note marks the printer got wrong, seen on the page images: (leaf, mark printed on the note)
# -> the body mark it answers. Int: "Hence⁵" (p. 163, n178); its note on p. 164 (n179) is
# printed ⁶, and p. 165 (n180) has its own ⁶ in text and notes.
MARK_MISPRINTS = {("n179", "6"): "5"}
# Pages whose notes open with text that runs on, after a page where more than one note ended
# with a stop: the note it continues, by the mark printed on that note. Cat n81: "It is also
# necessary to observe ... the ten genera" goes on with Simplicius in note 7 (n79-n80), not
# with the two-line note on the word *essence* that follows it on n80.
NOTE_RUNS_ON = {"n81": "7"}


def roman(s: str) -> int:
    total = prev = 0
    for ch in reversed(s):
        v = ROMAN[ch]
        total += -v if v < prev else v
        prev = max(prev, v)
    return total


def read_page(path: Path) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {"body": [], "notes": []}
    sec = None
    for ln in path.read_text(encoding="utf-8").splitlines():
        m = re.fullmatch(r"=== (body|notes)\s*", ln)
        if m:
            sec = m.group(1)
            continue
        if ln.strip():
            if sec is None:
                raise SystemExit(f"{path.name}: text before a section header")
            out[sec].append(ln.rstrip())
    return out


def compounds(data: Path) -> set[str]:
    """Hyphenated words the print sets mid-line somewhere (non-being, non-man): broken at a
    line end, they keep their hyphen. Every other line-end hyphen joins the word."""
    found = set()
    for path in sorted(data.glob("n*.txt")):
        for ln in path.read_text(encoding="utf-8").splitlines():
            for m in re.finditer(r"\b([A-Za-z]+)-([A-Za-z]+)\b", ln.rstrip()):
                found.add(m.group(0).lower())
    return found


def join_lines(lines: list[str], keep: set[str] = frozenset()) -> str:
    """Join printed lines into running text: a line-end hyphen joins the word, unless the
    print sets the hyphenated word mid-line elsewhere (`keep`)."""
    out = ""
    for ln in lines:
        ln = ln.strip()
        if out.endswith("-*") and ln.startswith("*"):    # an italic word broken: *gar-* / *ment*
            out, ln = out[:-1], ln[1:]
        if out.endswith("-") and not out.endswith("--"):
            head = re.search(r"([\w*]+)-$", out)
            tail = re.match(r"[\w*]+", ln)
            word = (head.group(1) if head else "") + "-" + (tail.group(0) if tail else "")
            if word.replace("*", "").lower() in keep:
                out += ln
            else:
                out = out[:-1] + ln
        else:
            out = (out + " " + ln) if out else ln
    return out


def untable(lines: list[str]) -> list[str]:
    """Taylor's tables of modal consequences (Int. 13 and two notes) print two columns of
    four-line groups headed by numbers (1 and 3 over 2 and 4); the transcript keeps a row as
    `left<TAB>right`. Prose has no columns, so each numbered group becomes a paragraph of its
    own, in number order, and the text after the table opens a new paragraph."""
    out: list[str] = []
    k = 0
    while k < len(lines):
        if "\t" not in lines[k]:
            out.append(lines[k])
            k += 1
            continue
        groups: dict[int, list[str]] = {}
        heads: list[int] = []
        while k < len(lines) and "\t" in lines[k]:
            cells = [c.strip() for c in lines[k].lstrip("¶").split("\t")]
            if len(cells) != 2:
                raise SystemExit(f"table row with {len(cells)} cells: {lines[k]!r}")
            if all(re.fullmatch(r"\d+", c) for c in cells):
                heads = [int(c) for c in cells]
            elif not heads:
                raise SystemExit(f"table row before its group numbers: {lines[k]!r}")
            else:
                for h, c in zip(heads, cells):
                    groups.setdefault(h, []).append(c)
            k += 1
        out += [f"¶{h} " + " ".join(groups[h]) for h in sorted(groups)]
        if k < len(lines) and not lines[k].startswith("¶"):
            lines[k] = "¶" + lines[k]
    return out


def sentence_case_opening(text: str) -> str:
    """A chapter's opening words are set in capitals and small capitals (THINGS, A NOUN):
    typesetting, not text, so the run of capitals is set in sentence case."""
    lead = re.match(r"\[\^[^\]]+\]\s*", text)     # a note mark carried from the heading
    if lead:
        return lead.group(0) + sentence_case_opening(text[lead.end():])
    m = re.match(r"((?:[A-Z]+\b[ ,]*)+)", text)
    if not m or not re.search(r"[A-Z]{2}", m.group(1)):
        return text
    run = m.group(1)
    return run[0] + run[1:].lower() + text[m.end(1):]


def note_html(lines: list[str], where: str, keep: set[str] = frozenset()) -> list[str]:
    """A note's printed lines as <p> paragraphs; a `¶` line opens a new one."""
    paras, buf = [], []
    for ln in untable(list(lines)):
        if ln.startswith("¶") and buf:
            paras.append(buf)
            buf = []
        buf.append(ln.lstrip("¶ ").strip())
    if buf:
        paras.append(buf)
    out = []
    for p in paras:
        t = html.escape(join_lines(p, keep), quote=False)
        subs = MARK.findall(t)                                   # marks for sub-notes; a * mark
        t = MARK.sub("\x00", t)                                 # must not pair with italics
        t = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", t)
        if "*" in t or "{?" in t:
            raise SystemExit(f"{where}: unbalanced italic or doubt mark: {t[:80]}")
        for mk in subs:
            t = t.replace("\x00", f"<sup>{mk}</sup>", 1)
        out.append(f"<p>{t}</p>")
    return out


def build(work: str, data: Path = DATA) -> tuple[str, dict[str, str]]:
    """The book file and the notes for one work.

    Each note opens on the page that carries its mark. A mark in the body opens a note of the
    site's own, numbered as its mark is (1.. in text order); a mark inside a note (Taylor's
    notes have notes) opens a sub-note, printed at the end of the note that carries its mark,
    after the mark as printed (the site's popup cannot open a note from inside a note).
    Note text at the head of a page with no mark of its own runs on from the page before: it
    continues the one note there left unfinished (no closing stop), or the note NOTE_RUNS_ON
    names; with neither, and more than one note on the page before, the build exits.
    """
    cfg = WORKS[work]
    keep = compounds(data)
    chapters: dict[int, list[str]] = {}
    cur = 0
    heading_mark = ""        # a note mark printed on a chapter heading (Int. XIV)
    notes: list[dict] = []   # {mark, leaf, lines, parent}
    # Marks waiting for their note: (mark, where, k): k is the body mark's number in text
    # order, or for a mark inside a note the index of that note. A note opens on its mark's
    # page, unless a long note fills the foot of the following pages; then the marks wait, and
    # must all be paired on the first page where a note to the text opens.
    avail: list[tuple[str, str, int]] = []
    seq = 0                  # body marks so far
    current = None           # the note that text without a mark of its own runs on into
    touched: list[int] = []  # notes with text on the page before
    for leaf in cfg["leaves"]:
        page = read_page(data / f"n{leaf}.txt")
        carried = len(avail)
        opened = False
        before = list(dict.fromkeys(touched))
        unfinished = [i for i in before        # no closing stop, italic or a mark after it allowed
                      if not re.search(r"[.?!”)\]]\*?(\[\^[^\]]+\])?\s*$", notes[i]["lines"][-1])]
        if f"n{leaf}" in NOTE_RUNS_ON:
            current = next(i for i in before if notes[i]["mark"] == NOTE_RUNS_ON[f"n{leaf}"])
        elif len(unfinished) == 1:
            current = unfinished[0]
        elif len(before) > 1 and page["notes"] and not re.match(r"¶?\s*\[\^", page["notes"][0]):
            raise SystemExit(f"n{leaf}: notes run on, but which of {len(before)} notes? "
                             "Name it in NOTE_RUNS_ON")
        touched = []
        for ln in page["body"]:
            m = CHAPTER.fullmatch(ln.strip())
            if m:
                n = roman(m.group(1))
                if n != cur + 1:
                    raise SystemExit(f"n{leaf}: CHAPTER {m.group(1)} after chapter {cur}")
                cur = n
                chapters[cur] = []
                heading_mark = m.group(2) or ""
                if heading_mark:
                    seq += 1
                    avail.append((MARK.fullmatch(heading_mark).group(1), "body", seq))
                continue
            if not cur:
                raise SystemExit(f"n{leaf}: text before CHAPTER I.")
            for mk in MARK.findall(ln):
                seq += 1
                avail.append((mk, "body", seq))
            if heading_mark:       # the heading's mark stands before the chapter's first word
                ln = ("¶" if ln.startswith("¶") else "") + heading_mark + " " + ln.lstrip("¶ ")
                heading_mark = ""
            chapters[cur].append(ln)
        # Short notes can share a printed line (n157: "* See Harris's Hermes, p. 338. † In
        # the Greek ..."): a waiting mark standing after a full stop opens a note of its own.
        queue = list(page["notes"])
        while queue:
            ln = queue.pop(0)
            waiting = "|".join(re.escape(a[0]) for a in avail)
            if waiting:
                head, *tail = re.split(rf"(?<=[.?!”] )(?=\[\^(?:{waiting})\])", ln, maxsplit=1)
                if tail and head.strip() and not re.fullmatch(r"¶?\s*\[\^[^\]]+\]\s*", head):
                    ln = head.rstrip()
                    queue.insert(0, tail[0])
            lead = re.match(r"¶?\s*\[\^([^\]]+)\]\s*", ln)
            if lead:
                mk = MARK_MISPRINTS.get((f"n{leaf}", lead.group(1)), lead.group(1))
                hit = next((j for j, a in enumerate(avail) if a[0] == mk), None)
                if hit is None:
                    raise SystemExit(f"n{leaf}: note [^{mk}] has no mark on its page")
                _, where, k = avail.pop(hit)
                carried -= hit < carried
                opened |= where == "body"
                notes.append({"mark": mk, "leaf": leaf, "lines": [ln[lead.end():]],
                              "num": k if where == "body" else None,
                              "parent": None if where == "body" else k})
                current = len(notes) - 1
                rest = ln[lead.end():]
            elif current is not None:
                notes[current]["lines"].append(ln)    # runs on, perhaps from the page before
                rest = ln
            else:
                raise SystemExit(f"n{leaf}: note text before any note opens")
            touched.append(current)
            for mk in MARK.findall(rest):
                avail.append((mk, "note", current))
        if avail and (opened and carried or leaf == cfg["leaves"][-1]):
            raise SystemExit(f"n{leaf}: marks with no note: {[a[0] for a in avail]}")
    if cur != cfg["chapters"]:
        raise SystemExit(f"{work}: {cur} chapters, expected {cfg['chapters']}")
    top = [i for i, n in enumerate(notes) if n["parent"] is None]
    if sorted(notes[i]["num"] for i in top) != list(range(1, seq + 1)):
        raise SystemExit(f"{work}: {seq} marks in the text, notes for {len(top)}")
    counter = iter(range(1, seq + 1))
    parts = []
    for n in sorted(chapters):
        paras, buf = [], []
        for ln in untable(chapters[n]):
            if ln.startswith("¶") and buf:
                paras.append(buf)
                buf = []
            buf.append(ln.lstrip("¶ ").strip())
        if buf:
            paras.append(buf)
        text = "\n\n".join(join_lines(p, keep) for p in paras)
        # Body marks are numbered in text order, the order `seq` counted them in.
        text = MARK.sub(lambda m: f"[^{next(counter)}]", sentence_case_opening(text))
        # The site's prose is plain text: italic in the body is not carried (notes keep it).
        text = re.sub(r"\*([^*\n]+)\*", r"\1", text)
        if "*" in text or "{?" in text:
            raise SystemExit(f"{work} chapter {n}: italic or doubt mark left in the prose")
        parts.append(f"Part {n}\n\n{text}")
    page = "<HTML><BODY>\nTranslated by Thomas Taylor\n\n" + "\n\n".join(parts) + "\n</BODY></HTML>\n"
    rendered = {i: note_html(n["lines"], f"{work} n{n['leaf']} note [^{n['mark']}]", keep)
                for i, n in enumerate(notes)}
    for i in range(len(notes) - 1, -1, -1):        # sub-notes onto their parents
        par = notes[i]["parent"]
        if par is not None:
            body = rendered[i]
            body[0] = body[0].replace("<p>", f"<p><sup>{notes[i]['mark']}</sup> ", 1)
            rendered[par] += body
    out_notes = {str(notes[i]["num"]): "".join(rendered[i])
                 for i in sorted(top, key=lambda i: notes[i]["num"])}
    return page, out_notes


def write(check: bool) -> int:
    stale = []
    for work, cfg in WORKS.items():
        page, notes = build(work)
        d = ROOT / "sources" / cfg["dir"]
        files = {d / "book-01.html": page,
                 d / "footnotes.json": json.dumps(notes, ensure_ascii=False, indent=1) + "\n"}
        for path, text in files.items():
            if check:
                if not path.exists() or path.read_text(encoding="utf-8") != text:
                    stale.append(str(path.relative_to(ROOT)))
            else:
                path.write_text(text, encoding="utf-8")
        print(f"{work}: {cfg['chapters']} Parts, {len(notes)} notes, "
              f"{len(re.sub(r'<[^>]+>', ' ', page).split())} words of text")
    if stale:
        print("not what the transcripts build: " + ", ".join(stale))
        return 1
    return 0


# ---------------------------------------------------------------- verify against the OCR

def ocr_pages(ocr_dir: Path) -> dict[int, dict[str, list[list[str]]]]:
    """Per leaf, the OCR's body and note lines (word lists), told apart by type size."""
    xml = (ocr_dir / "works00taylgoog_djvu.xml").read_text(encoding="utf-8")
    objs = re.split(r"<OBJECT ", xml)[1:]
    want = {n for cfg in WORKS.values() for n in cfg["leaves"]}
    out = {}
    for i, o in enumerate(objs):
        if i not in want:
            continue
        lines = []
        for l in re.findall(r"<LINE>(.*?)</LINE>", o, re.S):
            ws = re.findall(r'<WORD coords="(\d+),(\d+),(\d+),(\d+)[^"]*"[^>]*>([^<]*)</WORD>', l)
            if ws:
                top = min(int(w[3]) for w in ws)
                h = sorted(int(w[1]) - int(w[3]) for w in ws)[len(ws) // 2]
                # Only &quot; and &amp; are decoded: &lt;/&gt; in this OCR are noise glyphs, and are
                # compared as the XML spells them.
                words = [w[4].replace("&quot;", '"').replace("&amp;", "&") for w in ws]
                lines.append((top, h, words, int(ws[0][0])))
        lines.sort()
        # running head and specks: above the first full line, except a chapter heading
        k = next((j for j, l in enumerate(lines) if len(l[2]) >= 5), len(lines))
        lines = [l for l in lines[:k] if re.search(r"C[A-Za-z]{2,5}ER", " ".join(l[2]))] + lines[k:]
        first_body = min((l[0] for l in lines if l[1] >= 71), default=0)
        notes_top = min((l[0] for l in lines if l[1] < 71 and len(l[2]) >= 3 and l[0] > first_body),
                        default=None)
        # page furniture at the foot: catchword and signature, short lines set right of centre
        last_full = max((j for j, l in enumerate(lines) if len(l[2]) >= 5), default=-1)
        lines = lines[:last_full + 1] + [l for l in lines[last_full + 1:]
                                         if not (len(l[2]) <= 3 and l[3] > 1500)]
        out[i] = {"body": [l[2] for l in lines if notes_top is None or l[0] < notes_top],
                  "notes": [l[2] for l in lines if notes_top is not None and l[0] >= notes_top]}
    return out


def tokens(s: str) -> list[str]:
    s = re.sub(r"\*(?![^\[]*\])", "", s.replace("¶", " "))   # italics, not the * note mark
    return re.findall(r"\[\^[^\]]*\]|[\w'’\-]+|[^\w\s]", s)   # a hyphen stays with its word


def key(t: str) -> str:
    # Case is kept: a capital-letter error is a disagreement like any other.
    return t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')


def disagreements(data: Path, ocr) -> tuple[list[tuple], int]:
    found, examined = [], 0
    for work, cfg in WORKS.items():
        for leaf in cfg["leaves"]:
            # The whole page as one stream: the OCR's split of body from notes by type size
            # fails on worn pages, and both witnesses run body first, then notes.
            page = read_page(data / f"n{leaf}.txt")
            rw = [(t, (sec, n)) for sec in ("body", "notes")
                  for n, ln in enumerate(page[sec]) for t in tokens(ln)]
            ow = [t for sec in ("body", "notes") for ws in ocr[leaf][sec] for w in ws for t in tokens(w)]
            examined += len(rw)
            a, b = [key(t) for t, _ in rw], [key(t) for t in ow]
            sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == "equal":
                    continue
                if i2 > i1:
                    where = rw[i1][1]
                else:   # an OCR word the transcript lacks: placed after the word before it
                    where = rw[i1 - 1][1] if i1 > 0 else (rw[0][1] if rw else ("body", 0))
                found.append((f"n{leaf}", where[0], where[1], " ".join(ow[j1:j2]),
                              " ".join(t for t, _ in rw[i1:i2])))
    return found, examined


def load_judged(data: Path) -> list[tuple]:
    rows = []
    for ln in (data / "judged.tsv").read_text(encoding="utf-8").splitlines()[1:]:
        if ln.strip():
            leaf, sec, line, ocr, prt, how = ln.split("\t")[:6]
            rows.append((leaf, sec, int(line), ocr, prt, how))
    return rows


def verify(data: Path, ocr) -> int:
    found, examined = disagreements(data, ocr)
    if examined == 0:
        print("verify: examined nothing")
        return 2
    judged = load_judged(data)
    jset = {r[:5] for r in judged}
    fset = set(found)
    unjudged = [f for f in found if f not in jset]
    stale = [r for r in judged if r[:5] not in fset]
    bad_how = [r for r in judged if r[5] not in ("read", "image")]
    for f in unjudged[:30]:
        print("UNJUDGED", "\t".join(map(str, f)))
    for r in stale[:30]:
        print("STALE", "\t".join(map(str, r)))
    for r in bad_how[:30]:
        print("BAD HOW", "\t".join(map(str, r)))
    print(f"verify: {examined} transcript words compared with the OCR; {len(found)} disagreements, "
          f"{sum(r[5] == 'image' for r in judged)} judged on an image crop, "
          f"{sum(r[5] == 'read' for r in judged)} where the OCR is not a reading; "
          f"{len(unjudged)} unjudged, {len(stale)} stale")
    return 1 if (unjudged or stale or bad_how) else 0


def selftest(ocr) -> int:
    """Each mutation, on a fresh copy, must make --verify fail."""
    mutations = [
        ("n72", "the definition of essence", "the definition of substance"),   # word swap
        ("n80", " and ", " or "),                                              # real-word slip
        ("n160", ",", ""),                                                     # dropped comma
        ("n200", " not ", " "),                                                # dropped word
        ("n100", " the ", " the the "),                                        # inserted word
        ("n73", " essence", " Essence"),                                       # capital letter
    ]
    ok = True
    for leaf, old, new in mutations:
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "t"
            shutil.copytree(DATA, d)
            p = d / f"{leaf}.txt"
            s = p.read_text(encoding="utf-8")
            if old not in s:
                print(f"selftest: {leaf} has no {old!r} to mutate")
                ok = False
                continue
            p.write_text(s.replace(old, new, 1), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                rc = verify(d, ocr)
            print(f"selftest {leaf} {old!r}->{new!r}: {'caught' if rc else 'MISSED'}")
            ok &= rc != 0
    with contextlib.redirect_stdout(io.StringIO()):
        clean = verify(DATA, ocr)
    if clean:
        print("selftest: the unmutated transcripts do not verify")
        ok = False
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--ocr-dir", type=Path)
    a = ap.parse_args()
    if a.verify or a.selftest:
        if not a.ocr_dir:
            ap.error("--verify and --selftest need --ocr-dir")
        ocr = ocr_pages(a.ocr_dir)
        return verify(DATA, ocr) if a.verify else selftest(ocr)
    return write(a.check)


if __name__ == "__main__":
    sys.exit(main())
