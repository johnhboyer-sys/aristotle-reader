"""O. F. Owen's Organon came from Wikisource with its page-number templates'
JSON left in the HTML. In the Categories that markup ran chapters 13-15 into
chapter 12; elsewhere it parsed harmlessly but fragilely. It is gone from the
sources, and must stay gone."""
from pathlib import Path

from aristotle_pipeline.stage1_ross import parse_book

SOURCES = Path(__file__).resolve().parents[2] / "sources"


def test_the_owen_files_are_found():
    assert len(list(SOURCES.glob("*-owen/book-*.html"))) >= 15


def test_no_wiki_template_markup_is_left():
    left = [p.relative_to(SOURCES).as_posix() for p in sorted(SOURCES.glob("*-owen/book-*.html"))
            if '{"template":' in p.read_text(encoding="utf-8")]
    assert left == []


def test_owen_categories_has_fifteen_chapters():
    assert sorted(parse_book(SOURCES / "cat-owen" / "book-01.html", "part")) == list(range(1, 16))
