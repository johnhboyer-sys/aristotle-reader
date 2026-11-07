"""Explicit chapter lists can span books: De Plantis has two (7 + 10 chapters,
starts read off Bekker's printed chapter numbers). An entry without `book`
stays in book 1, as every single-book work's list does."""

from aristotle_pipeline.stage1_chapters import extract_chapters_explicit

SPINE = {"segments": [{"column": "1a"}, {"column": "1b"}, {"column": "2a"}]}


def test_entries_carry_their_book_and_each_book_starts():
    chs = extract_chapters_explicit(SPINE, [
        {"n": 1, "bekker": "1a1"}, {"n": 2, "bekker": "1b4"},
        {"n": 1, "bekker": "2a12", "book": 2}, {"n": 2, "bekker": "2a30", "book": 2}])
    assert [(c["book"], c["chapter"], c["bookstart"]) for c in chs] == [
        (1, "1", True), (1, "2", False), (2, "1", True), (2, "2", False)]


def test_without_book_everything_is_book_one():
    chs = extract_chapters_explicit(SPINE, [{"n": 1, "bekker": "1a1"}, {"n": 2, "bekker": "2a3"}])
    assert [(c["book"], c["bookstart"]) for c in chs] == [(1, True), (1, False)]
