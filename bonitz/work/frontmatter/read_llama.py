"""LlamaParse over the three front-matter tables.

`bonitz_pipeline.llama400` cannot do this: it is keyed to
`work/scan400/page-NNN.jpg`, which starts at index page 15, and its prompt is
written for the index body. The front matter is not in that scan at all — it is
rendered here from book.pdf — and printed VII/VIII are a Latin bibliography, not
Greek lemmata.

Settings are carried over verbatim from `bonitz_llamaparse_pilot.py` so this run
is comparable with every other llama read: premium (agentic vision) tier,
markdown out, and `do_not_unroll_columns` so the two printed columns are not
interleaved. Only the prompt differs, and it differs because the material does.

    LLAMA_CLOUD_API_KEY=... uv run --with llama-parse --with img2pdf \
        python work/frontmatter/read_llama.py fm-KEY fm-VII fm-VIII

Writes read/llama/<page>.md. Existing files are skipped — the API is metered.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

PROMPT = """\
This is a leaf from the front matter of Bonitz, INDEX ARISTOTELICUS (Berlin
1870). Transcribe it EXACTLY as printed. This is a diplomatic transcription:
record what is on the page, never what should have been printed. If the
compositor set an error, keep the error.

LAYOUT
- The page is set in TWO columns. Keep them separate and give the left column
  in full before the right. Never interleave them.
- One printed line per output line. Do not reflow, do not join wrapped lines.
- Where the page is a two-part table (a siglum at the left, then a title),
  output the siglum, then a TAB, then the title. Every row has both parts; if a
  row's siglum is blank on the page, write the tab anyway.

GREEK
- ȣ is a single sort, the ou-ligature. Write ȣ. Never write "ου" for it and
  never flatten it to a plain υ. Both destroy the character.
- ϗ is a standalone abbreviation for καί. It stands between words, never inside
  one.
- Keep every breathing and accent, including ones that look wrong.
- A dash standing for a repeated title (— ὕστερα, — μεγάλα) is an em dash on
  the page. Keep it.

LATIN AND GERMAN
- The bibliography pages carry German and French: ü ö ä é è ç. Keep the
  diacritics.
- Names are letterspaced for emphasis (A u b e r t). Write them closed up:
  Aubert.
- Superscript figures on a siglum (Bk2, Bk3) are printed raised. Write them as
  plain digits directly after the letters: Bk2, Bk3.
- Keep abbreviations exactly: Lpz., Lips., Berol., sqq., rec., ed.

Output plain text only. No commentary, no headings you invent, no markdown
tables.
"""


def page_pdf(name: str, tmp: Path) -> Path:
    src = HERE / 'pages' / f'{name}.tif'
    if not src.exists():
        sys.exit(f'{src} missing')
    dst = tmp / f'{name}.pdf'
    subprocess.run(['img2pdf', '--imgsize', '400dpi', '--title', f'bonitz-{name}',
                    str(src), '-o', str(dst)], check=True, capture_output=True)
    return dst


def main() -> int:
    from llama_parse import LlamaParse

    key = os.environ.get('LLAMA_CLOUD_API_KEY')
    if not key:
        sys.exit('LLAMA_CLOUD_API_KEY not set')
    out = HERE / 'read' / 'llama'
    out.mkdir(parents=True, exist_ok=True)

    parser = LlamaParse(
        api_key=key,
        result_type='markdown',
        premium_mode=True,
        user_prompt=PROMPT,
        do_not_unroll_columns=True,
        page_separator='\n\n===== PAGE {page_number} =====\n\n',
        verbose=False,
    )
    failed: list[str] = []
    with tempfile.TemporaryDirectory() as td:
        for name in sys.argv[1:]:
            dst = out / f'{name}.md'
            if dst.exists():
                print(f'{name}: exists, skip')
                continue
            docs = parser.load_data(str(page_pdf(name, Path(td))))
            text = '\n'.join(d.text for d in docs)
            # ⚠ NEVER WRITE AN EMPTY READ. `load_data` swallows an API error —
            # out of credits, bad key, rate limit — and hands back a document
            # whose text is ''. Writing that produces a reader file that is
            # indistinguishable from a page with nothing on it, which is the
            # failure this project keeps paying for. Refuse, and say why.
            if not text.strip():
                failed.append(name)
                print(f'{name}: EMPTY — the API returned nothing. Not written.')
                continue
            dst.write_text(text, encoding='utf-8')
            print(f'{name}: {len(text)} chars, {len(text.splitlines())} lines '
                  f'-> {dst}')
    if failed:
        print(f'\n{len(failed)} page(s) produced no text: {", ".join(failed)}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
