"""Place paragraph breaks in a flat English translation, from an edition's
paragraph POSITIONS. Writes sources/<dir>/paragraphs.yaml, which
stage1_archive.build_english turns into {kind: "paragraph"} markers.

Our text is never changed, and the edition's prose is never stored: each entry
holds a chapter, a character offset in OUR prose, and OUR own first five words,
which the build checks. The edition is read only to learn where its paragraphs
open, so keep it out of the repo and pass its path.

Editions (--format):
  mit        Internet Classics Archive .mb.txt (blank line between paragraphs)
  wikisource parse-API JSON, one file per book, in order
  tei        Perseus TEI; only rend="align(indent)" opens a paragraph
  djvu       archive.org _djvu.xml; a first-line indent opens a paragraph
             (--pages FIRST-LAST, 1-based leaves in the scan)

Run from pipeline/:
  uv run python tools/place_paragraphs.py --manifest ../manifests/Cat-public.yaml \
      --format mit --source "URL for the header" --write /path/to/categories.mb.txt
"""
from __future__ import annotations

import argparse
import difflib
import html as _html
import json
import re
import sys
import unicodedata
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aristotle_pipeline import stage1_archive  # noqa: E402
from aristotle_pipeline.config import SOURCES_DIR  # noqa: E402

OPENING_WORDS = 10  # about the 55 characters the 2026-09-09 spike matched on
FUZZY_FLOOR = 0.82  # an OCR opening must read this like ours
FUZZY_MARGIN = 0.08  # and this much better than the next-best place
WINDOW_WORDS = 3000  # how far past the last hit a fuzzy search looks


def _plain(s: str) -> str:
    return " ".join(_html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def mit_openings(paths: list[Path]) -> list[str]:
    txt = paths[0].read_text(encoding="utf-8", errors="replace")
    txt = txt[txt.index("Part 1"):]
    txt = txt.split("THE END")[0].split("The Internet Classics Archive")[0]
    out = []
    for block in re.split(r"\n\s*\n", txt):
        block = " ".join(block.split())
        if block and not re.fullmatch(r"(Part \d+|SECTION \d+|-+)", block):
            out.append(block)
    return out


def wikisource_openings(paths: list[Path]) -> list[str]:
    out = []
    for path in paths:
        h = json.loads(path.read_text(encoding="utf-8"))["parse"]["text"]
        h = re.split(r'<(?:ol|div)[^>]*class="[^"]*(?:references|reflist)', h, maxsplit=1)[0]
        h = re.sub(r"<style.*?</style>", "", h, flags=re.S)
        h = re.sub(r"<sup[^>]*>.*?</sup>", "", h, flags=re.S)
        h = re.sub(r"<b>\s*\d{1,2}\s*</b>", "", h)
        for p in re.findall(r"<p\b[^>]*>(.*?)</p>", h, flags=re.S):
            t = _plain(p).replace("†", " ")
            if len(t.split()) >= 4:
                out.append(" ".join(t.split()))
    return out


def tei_openings(paths: list[Path]) -> list[str]:
    s = paths[0].read_text(encoding="utf-8")
    s = re.sub(r"<note\b.*?</note>", "", s, flags=re.S)
    return [_plain(p) for p in re.findall(r'<p rend="align\(indent\)">(.*?)</p>', s, flags=re.S)]


_DJVU_WORD = re.compile(r'<WORD coords="(\d+),(\d+),(\d+),(\d+)[^"]*"[^>]*>([^<]*)</WORD>')
_MARGIN_NUM = re.compile(r"\d{1,3}|\d{3}[abab°ᵃᵇ]?\W?")


def djvu_openings(paths: list[Path], first: int, last: int) -> list[str]:
    """A line opens a paragraph if it starts about one em right of the page's
    text edge, and the line before it ended a sentence."""
    s = paths[0].read_text(encoding="utf-8")
    pages = re.findall(r"<OBJECT\b.*?</OBJECT>", s, flags=re.S)[first - 1:last]
    out: list[str] = []
    prev_end = "."
    for page in pages:
        lines = []
        for raw in re.findall(r"<LINE>(.*?)</LINE>", page, flags=re.S):
            words = [(int(a), int(b), int(d), _html.unescape(w))
                     for a, b, _c, d, w in _DJVU_WORD.findall(raw)]
            # A line number or Bekker page set out in the margin is not the line.
            while len(words) > 1 and _MARGIN_NUM.fullmatch(words[0][3]) \
                    and words[1][0] - words[0][0] > 90:
                words = words[1:]
            while len(words) > 1 and _MARGIN_NUM.fullmatch(words[-1][3]):
                words = words[:-1]
            if words:
                lines.append(words)
        if not lines:
            continue
        heights = sorted(w[1] - w[2] for ln in lines for w in ln)
        body_h = heights[len(heights) // 2]
        edge_votes: dict[int, int] = {}
        for ln in lines:
            edge_votes[ln[0][0] // 8] = edge_votes.get(ln[0][0] // 8, 0) + 1
        edge = max(edge_votes, key=lambda k: (edge_votes[k], -k)) * 8
        body = [ln for ln in lines
                if sorted(w[1] - w[2] for w in ln)[len(ln) // 2] >= body_h * 0.8]
        for i, ln in enumerate(body):
            indent = ln[0][0] - edge
            text = " ".join(w[3] for w in ln)
            if i == 0 and len(ln) <= 6 and text.isupper():
                continue  # running head
            if 0.45 * body_h <= indent <= 2.2 * body_h and re.search(r'[.?!:;"’”)]$', prev_end):
                follow = " ".join(w[3] for k in body[i:i + 4] for w in k)
                out.append(follow)
            prev_end = text
    return out


_EXTRACT = {"mit": mit_openings, "wikisource": wikisource_openings, "tei": tei_openings}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "", s)


class Corpus:
    """Our chapters as one word stream, each word knowing where it came from."""

    def __init__(self, prose: dict[tuple[int, int], str]):
        self.prose = prose
        self.words: list[str] = []
        self.where: list[tuple[tuple[int, int], int]] = []
        self.sentence_start: list[bool] = []
        for key in sorted(prose):
            prior = ""
            for m in re.finditer(r"\S+", prose[key]):
                n = _norm(m.group())
                if not n:
                    continue
                self.words.append(n)
                self.where.append((key, m.start()))
                self.sentence_start.append(not prior or bool(re.search(r'[.?!:;]["\')’”\]]*$', prior)))
                prior = m.group()
        self.joined = "".join(self.words)
        self.char_to_word: dict[int, int] = {}
        at = 0
        for i, w in enumerate(self.words):
            self.char_to_word[at] = i
            at += len(w)

    def find(self, opening: str, cursor: int) -> tuple[int | None, str]:
        """(word index, how) for a paragraph opening, searching on from `cursor`."""
        ws = [n for n in map(_norm, opening.split()) if n][:OPENING_WORDS]
        if len(ws) < 3:
            return None, "too short"
        target = "".join(ws)
        at = self.joined.find(target, sum(len(w) for w in self.words[:cursor]))
        while at >= 0:
            i = self.char_to_word.get(at)
            if i is not None and self.words[i:i + len(ws)] == ws:
                if i - cursor <= WINDOW_WORDS:
                    return i, "exact"
                break  # too far on to trust, and taking it would strand the rest
            at = self.joined.find(target, at + 1)
        scored = []
        for i in range(cursor, min(cursor + WINDOW_WORDS, len(self.words))):
            if self.sentence_start[i]:
                cand = "".join(self.words[i:i + len(ws)])
                if abs(len(cand) - len(target)) <= len(target) // 3:
                    scored.append((difflib.SequenceMatcher(None, target, cand).ratio(), i))
        scored.sort(reverse=True)
        if scored and scored[0][0] >= FUZZY_FLOOR and (
                len(scored) < 2 or scored[0][0] - scored[1][0] >= FUZZY_MARGIN):
            return scored[0][1], f"fuzzy {scored[0][0]:.2f}"
        return None, f"best {scored[0][0]:.2f}" if scored else "no candidates"


def place(prose: dict[tuple[int, int], str], openings: list[str],
          sentence_only: bool = False) -> dict:
    """`sentence_only` drops a hit that does not open a sentence in our text: an
    OCR edition's line can read as indented by accident, a typed one's cannot."""
    corpus = Corpus(prose)
    entries, unmatched, not_sentence, fuzzy = [], [], [], []
    chapter_open = already = 0
    cursor = 0
    for op in openings:
        i, how = corpus.find(op, cursor)
        if i is None:
            unmatched.append((op[:60], how))
            continue
        key, off = corpus.where[i]
        text = prose[key]
        if sentence_only and not corpus.sentence_start[i]:
            not_sentence.append((key, off, text[max(0, off - 40):off + 30]))
            continue  # a rejected hit must not move the cursor past real openings
        cursor = i + 1
        if off == 0:
            chapter_open += 1
            continue
        if text[off - 1] == "\n":
            already += 1  # the source already breaks here
            continue
        if not corpus.sentence_start[i]:
            not_sentence.append((key, off, text[max(0, off - 40):off + 30]))
        if how != "exact":
            fuzzy.append((how, op[:50], text[off:off + 50]))
        entries.append({"book": key[0], "chapter": key[1], "offset": off,
                        "at": " ".join(text[off:].split()[:5])})
    return {"entries": entries, "unmatched": unmatched, "not_sentence": not_sentence,
            "fuzzy": fuzzy, "chapter_open": chapter_open, "already": already,
            "openings": len(openings)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--slot", default="primary")
    ap.add_argument("--format", required=True, choices=[*_EXTRACT, "djvu"])
    ap.add_argument("--source", required=True, help="edition, named in the output header")
    ap.add_argument("--pages", help="djvu only: FIRST-LAST")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("edition", nargs="+", type=Path)
    a = ap.parse_args()

    cfg = yaml.safe_load(Path(a.manifest).read_text(encoding="utf-8"))["english"][a.slot]
    prose = stage1_archive._load_prose(cfg)
    if a.format == "djvu":
        first, last = map(int, a.pages.split("-"))
        openings = djvu_openings(a.edition, first, last)
    else:
        openings = _EXTRACT[a.format](a.edition)
    r = place(prose, openings, sentence_only=a.format == "djvu")

    print(f"{cfg['dir']}: {r['openings']} edition paragraphs -> {len(r['entries'])} placed, "
          f"{r['chapter_open']} at a chapter opening, {r['already']} already broken in the "
          f"source, {len(r['unmatched'])} unmatched")
    for op, how in r["unmatched"]:
        print(f"  UNMATCHED [{how}] {op}")
    for key, off, ctx in r["not_sentence"]:
        print(f"  NOT AT A SENTENCE START {key}@{off}: {ctx!r}")
    for how, op, ours in r["fuzzy"]:
        print(f"  {how}: {op!r} -> {ours!r}")
    if a.write:
        if not r["entries"]:
            raise SystemExit("nothing placed: not writing an empty paragraphs.yaml")
        out = SOURCES_DIR / cfg["dir"] / "paragraphs.yaml"
        head = (f"# Paragraph openings in OUR text, placed by tools/place_paragraphs.py.\n"
                f"# Positions from: {a.source}\n"
                f"# offset = characters into the chapter's prose; at = our own opening words.\n")
        body = "".join(
            f"- {{book: {e['book']}, chapter: {e['chapter']}, offset: {e['offset']}, "
            f"at: {json.dumps(e['at'], ensure_ascii=False)}}}\n"
            for e in r["entries"])
        out.write_text(head + body, encoding="utf-8")
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
