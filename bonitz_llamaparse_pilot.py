#!/usr/bin/env python3
"""
Bonitz Index Aristotelicus -> LlamaParse pilot runner.

WHAT THIS DOES
  Sends a small range of pages from book.pdf to LlamaParse on the Agentic tier,
  with all the Bonitz-specific settings and the custom prompt already filled in,
  and writes one Markdown file per page into ./llamaparse_pilot/.

WHY A SCRIPT (and not "Claude ran it")
  The cloud sandbox Claude runs in is network-locked and cannot reach the
  LlamaParse API. Your own machine can. So everything is pre-configured here;
  you just supply the key and run it locally.

SETUP (run these in Terminal — on macOS use python3 / pip3, not python/pip)
  pip3 install llama-parse
  export LLAMA_CLOUD_API_KEY="llx-...your key..."     # from cloud.llamaindex.ai
  python3 bonitz_llamaparse_pilot.py
  # (reads bonitz_test_page_1.pdf from the current folder — see PDF_PATH below)

  (The key is read from the environment on purpose — it never gets written into
   this file. You can revoke/rotate it anytime in the LlamaParse dashboard.)

NOTES
  - This pilots only a few pages so you can check quality and watch credit burn
    BEFORE spending on ~890 pages. Adjust TARGET_PAGES below.
  - The Agentic tier costs more credits per page than Fast/Cost Effective. Check
    your usage in the dashboard after this run.
  - If the installed SDK version rejects one of the keyword names below, it will
    print which one; the fix is usually a one-word rename (your local Claude Code
    can do it against the live SDK in seconds).
"""

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# CONFIG — edit these four things if needed
# ---------------------------------------------------------------------------
PDF_PATH = "bonitz_test_page_1.pdf"   # the single test page (sits in this folder)
OUT_DIR = "llamaparse_pilot"          # where the .md files land

# This test PDF is already a single page, so leave this EMPTY to parse the whole
# file. (If you later point PDF_PATH at the full book, set this to a 0-indexed page,
# e.g. "15" for the 16th PDF page.)
TARGET_PAGES = ""                     # empty = parse the whole file

# Language hint for LlamaParse's OCR pre-pass. NOTE: their OCR list does NOT include
# Greek at all (it's the EasyOCR set — la, en, etc., but no el). So leave this EMPTY
# and let the Agentic vision model read the Greek directly. (You could set "la" for
# the Latin, but leaving it off is cleanest and avoids biasing against Greek.)
LANGUAGES = ""

# Region. Leave "" for the default US endpoint. If your LlamaCloud dashboard is at
# eu.cloud.llamaindex.ai, your key is an EU key — set this to the EU URL:
#   BASE_URL = "https://api.cloud.eu.llamaindex.ai"
BASE_URL = ""
# ---------------------------------------------------------------------------

# The Bonitz custom prompt (keep in sync with the instructions doc).
CUSTOM_PROMPT = """\
This is Hermann Bonitz's "Index Aristotelicus" (Berlin 1870): a dense, two-column
scholarly index in polytonic Ancient Greek with Latin abbreviations. Transcribe it
VERBATIM — do not translate, summarize, modernize, correct, or explain anything.

1. COLUMNS: Each page has two columns. Read the LEFT column completely, top to
   bottom, then the RIGHT column. Never read across the two columns as if a single
   printed line spans both. This is running text, not a table.

2. GUTTER NUMBERS: Small numerals are printed in the vertical gutter between the two
   columns — these are line-reference guides ONLY, not part of either column's text.
   Omit them entirely. Do not attach them to a line, do not fold them into a Bekker
   citation, and never drop one into the middle of an entry or a Greek word.

3. RUNNING HEADS: Ignore the page number and section letter printed in the top
   margin of each page.

4. GREEK: Preserve every polytonic diacritic exactly as printed — acute, grave,
   circumflex, smooth and rough breathings, iota subscript, diaeresis. Output real
   Unicode Greek. Do not strip accents or Latinize any Greek.

5. LIGATURES: The text uses two special 19th-century characters. Keep them EXACTLY
   as printed, unchanged: "ϗ" (a stylized kai symbol) and "ȣ" (a joined ou digraph).
   Do NOT expand, translate, or substitute them (never turn ȣ into u, o, v, or υ;
   never turn ϗ into k or &).

6. ACCENTS ON THE LIGATURES: A ligature often has a mark printed directly on the
   glyph — an acute, grave, circumflex, an overline/macron, a smooth or rough
   breathing, or a diaeresis. Reproduce EXACTLY the mark that is actually printed,
   keeping it on that character. Do NOT add, remove, move, or invent a mark. If the
   ligature is printed BARE (no visible accent), transcribe it bare — even when the
   word would normally carry an accent. Never supply a "missing" accent.

7. CITATIONS: References look like 1094a1, 367b2, 1456b27 — a page number, then a
   small raised column letter "a" or "b", then a line number. Transcribe the raised
   a/b inline as an ordinary letter in sequence (write 367b2, not 367 2 or 3672).
   Copy every digit and letter exactly; never round, correct, or drop a citation.
   These references are the most important data on the page.

8. SUPERSCRIPTS: Small raised letters and numbers also appear in the work-reference
   abbreviations before citations (e.g. μβ8, Πη3, ηεα8). Keep the raised numbers
   inline as normal characters; do not treat any superscript as a footnote marker,
   exponent, or reference — just transcribe it in reading order.

9. ENTRIES: Each entry starts at the hard left margin with a bold Greek headword.
   Begin a new line at each such headword. Preserve the em-dashes (—) that divide
   long entries.

10. UNREADABLE: If a character or word is genuinely illegible, write [?] in its
    place. Never guess a word or invent a citation.

Output plain Markdown: left column then right column, one page after another.
"""


def main() -> int:
    api_key = os.environ.get("LLAMA_CLOUD_API_KEY", "").strip()
    if not api_key:
        print("ERROR: set LLAMA_CLOUD_API_KEY first (export LLAMA_CLOUD_API_KEY=...).")
        return 2
    masked = f"{api_key[:6]}…{api_key[-4:]}" if len(api_key) > 12 else "(too short!)"
    print(f"Using API key {masked} (length {len(api_key)}) — it should start with 'llx-'.")
    pdf_path = os.path.expanduser(PDF_PATH)
    if not Path(pdf_path).exists():
        print(f"ERROR: {pdf_path} not found. Fix PDF_PATH at the top of this file.")
        return 2

    try:
        from llama_parse import LlamaParse
    except ImportError:
        print("ERROR: pip3 install llama-parse")
        return 2

    # Agentic-tier, vision-based parse with the Bonitz settings.
    parser_kwargs = dict(
        api_key=api_key,                 # pass explicitly (no ambiguity)
        result_type="markdown",
        premium_mode=True,               # vision agentic tier (highest quality)
        user_prompt=CUSTOM_PROMPT,       # the Bonitz instructions above
        do_not_unroll_columns=True,      # KEEP the two columns separate
        page_separator="\n\n===== PAGE {page_number} =====\n\n",
        verbose=True,
    )
    if TARGET_PAGES.strip():
        parser_kwargs["target_pages"] = TARGET_PAGES  # 0-indexed page subset
    if BASE_URL.strip():
        parser_kwargs["base_url"] = BASE_URL.strip()  # EU region endpoint, etc.
    if LANGUAGES.strip():
        parser_kwargs["language"] = LANGUAGES.strip()  # OCR pre-pass hint (no Greek option)

    try:
        parser = LlamaParse(**parser_kwargs)
    except TypeError as e:
        print("A keyword name may have changed in your SDK version:", e)
        print("Remove/rename the offending key above and re-run.")
        return 1

    where = f"page {TARGET_PAGES}" if TARGET_PAGES.strip() else "the page"
    print(f"Parsing {where} of {pdf_path} on the Agentic tier ...")
    docs = parser.load_data(pdf_path)

    out = Path(OUT_DIR)
    out.mkdir(exist_ok=True)
    for i, d in enumerate(docs):
        f = out / f"pilot-{i:02d}.md"
        f.write_text(d.text, encoding="utf-8")
        print(f"  wrote {f}  ({len(d.text)} chars)")

    print(f"\nDone. {len(docs)} page file(s) in ./{OUT_DIR}/")
    print("Now eyeball: columns not interleaved, no gutter numbers in the text,")
    print("ϗ/ȣ intact (bare where printed bare), accents present, citations like 367b2.")
    print("Then check credits used in your LlamaParse dashboard before scaling.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
