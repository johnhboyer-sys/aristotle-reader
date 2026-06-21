"""Vendor J. Solomon's Eudemian Ethics (Oxford 1915) from Wikisource — the
human-proofread transcription of the Works of Aristotle vol. IX scan — into the
reader's archive HTML format. Far cleaner than the archive.org djvu OCR dump.

Wikisource structure (matching Solomon's 1915 edition):
  Book 1 -> EE Book I   (chs 1-8)
  Book 2 -> EE Book II  (chs 1-11)
  Book 3 -> EE Book III (chs 1-7)
  Book 7 -> EE Book VII (chs 1-12) AND Book VIII (chs 13-15) — Solomon printed
            VIII as VII §§13-15 (one manuscript tradition). We split it back out:
            chs 1-12 -> file-04 (Book VII), chs 13-15 -> file-05 (Book VIII, 1-3).
The common books IV-VI (= Nicomachean Ethics V-VII) are not in Solomon's text.

Chapters are <b>N</b> markers; footnotes are <sup class="reference"> + a
trailing reference list — both stripped. Run from pipeline/:
  uv run python tools/build_ee_solomon.py
"""
from __future__ import annotations

import html as _html
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "sources" / "ee-solomon"
API = ("https://en.wikisource.org/w/api.php?action=parse&page=Eudemian_Ethics/"
       "Book_{n}&prop=text&format=json&formatversion=2")

# Wikisource book -> our (file index, chapter-range) targets.
PLAN = {
    1: [(1, range(1, 99))],                       # Book I  -> file-01
    2: [(2, range(1, 99))],                       # Book II -> file-02
    3: [(3, range(1, 99))],                       # Book III-> file-03
    7: [(4, range(1, 13)), (5, range(13, 99))],   # VII 1-12 -> file-04; 13-15 -> file-05
}


def fetch_html(n: int) -> str:
    req = urllib.request.Request(API.format(n=n), headers={"User-Agent": "aristotle-reader/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["parse"]["text"]


def split_chapters(html: str) -> dict[int, str]:
    """{chapter_n: clean prose} from one Wikisource book page."""
    # Drop everything from the footnote/reference list onward.
    html = re.split(r'<(?:ol|div)[^>]*class="[^"]*references', html, 1)[0]
    html = re.split(r'<div[^>]*class="[^"]*reflist', html, 1)[0]
    # Drop style blocks, inline footnote sups, page-number/anchor spans, edit links.
    html = re.sub(r"<style.*?</style>", "", html, flags=re.S)
    html = re.sub(r"<sup[^>]*>.*?</sup>", "", html, flags=re.S)
    html = re.sub(r'<span[^>]*class="[^"]*(?:pagenum|pageNumber|ws-pagenum)[^"]*"[^>]*>.*?</span>',
                  "", html, flags=re.S)
    # Chapter markers <b>N</b> -> sentinel we can split on.
    html = re.sub(r"<b>\s*(\d{1,2})\s*</b>", r"\n@@CH\1@@\n", html)
    # Strip all remaining tags to text.
    text = re.sub(r"<[^>]+>", " ", html)
    text = _html.unescape(text)
    # Remove the running title if present.
    text = text.replace("ETHICA EUDEMIA", " ")
    # Strip editorial obeli/transposition daggers (†) Solomon prints to flag
    # corrupt or relocated Greek — display noise in a reading text. Solomon's own
    # bracketed glosses [..] and "&c." are genuine and kept.
    text = text.replace("†", " ")
    text = re.sub(r"\s+([.,;:)\]])", r"\1", text)   # tidy space before punctuation
    # Split on chapter sentinels.
    parts = re.split(r"@@CH(\d{1,2})@@", text)
    # parts[0] = preamble before ch1 (book heading); then (num, body) pairs.
    chapters: dict[int, str] = {}
    for i in range(1, len(parts), 2):
        num = int(parts[i])
        body = re.sub(r"\s+", " ", parts[i + 1]).strip()
        chapters[num] = body
    return chapters


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    summary = []
    for src_book, targets in PLAN.items():
        chapters = split_chapters(fetch_html(src_book))
        for fileno, rng in targets:
            picked = [(c, chapters[c]) for c in sorted(chapters) if c in rng]
            if not picked:
                summary.append(f"  file-{fileno:02d}: NO CHAPTERS from Book {src_book}")
                continue
            parts = ["<html><body>", "Translated by J. Solomon"]
            for newn, (orig, body) in enumerate(picked, start=1):
                parts.append(str(newn))
                parts.append(f"<p>{body}</p>")
            (OUT / f"book-{fileno:02d}.html").write_text(
                "\n".join(parts) + "\n", encoding="utf-8")
            origs = [c for c, _ in picked]
            summary.append(
                f"  file-{fileno:02d} <- WS Book {src_book} chs {origs[0]}-{origs[-1]} "
                f"({len(picked)} ch, renumbered 1-{len(picked)})")
    print("Solomon EE re-sourced from Wikisource:")
    print("\n".join(summary))


if __name__ == "__main__":
    main()
