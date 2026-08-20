"""_strip_furniture: the MIT archive's Home/Search/Help nav must not leak.

The archive footer renders each nav word on its own line with a no-break-space
line under it and runs of blank lines between them. The old _NAV_WEAK required
the words on strictly consecutive lines, so the footer never matched and every
book's last chapter ended "... Home Search Help" (and page-break footers leaked
"Home Search" mid-book in multi-page works).
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.stage1_ross import parse_book

# The footer shape of sources/meta-ross/book-08.html as _book_text yields it:
# strong markers (Table of Contents, Browse and Comment, Buy Books, © year)
# interleaved with the weak words, each over an &nbsp; line, blank runs between.
_ARCHIVE_FOOTER = """&nbsp;&nbsp;&nbsp;


Table of Contents


&nbsp;&nbsp;&nbsp;




Home
&nbsp;


Browse and
Comment


Search
&nbsp;


Buy Books and
CD-ROMs


Help
&nbsp;


&copy; 1994-2009
"""


def _write(tmp_path, body: str) -> Path:
    path = tmp_path / "book.html"
    path.write_text(
        f"<html><body>\nTranslated by W. D. Ross\n{body}\n</body></html>",
        encoding="utf-8",
    )
    return path


def test_trailing_footer_dropped(tmp_path):
    body = f"""<B>Part 1</B>
All things which have no matter are without qualification essentially unities.
{_ARCHIVE_FOOTER}"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part")[1]
    assert text.rstrip().endswith("essentially unities.")
    for word in ("Home", "Search", "Help"):
        assert word not in text


def test_page_break_footer_dropped_mid_document(tmp_path):
    # A long work is served across several pages: the footer repeats before a
    # fresh "Translated by" header, inside the document (Pol, Juv, Sens).
    body = f"""<B>Part 1</B>
So much for the first page of the treatise.
{_ARCHIVE_FOOTER}
Translated by W. D. Ross
<B>Part 2</B>
The second page continues the argument.
"""
    path = _write(tmp_path, body)
    parsed = parse_book(path, "part")
    assert parsed[1].rstrip().endswith("first page of the treatise.")
    assert "Home" not in parsed[1] and "Search" not in parsed[1]
    assert parsed[2].rstrip().endswith("continues the argument.")


def test_lone_nav_word_in_prose_kept(tmp_path):
    # A single nav word alone never matches — only two or more together go.
    body = """<B>Part 1</B>
The argument proceeds as follows.
Search
for the middle term is the heart of demonstration.
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part")[1]
    assert "Search" in text


def test_nav_words_split_by_prose_kept(tmp_path):
    # Two nav words with a genuine prose line between them are not a footer.
    body = """<B>Part 1</B>
Home
is where the hearth is, and the hearth is prior by nature.
Search
for causes begins from wonder.
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part")[1]
    assert "Home" in text and "Search" in text
