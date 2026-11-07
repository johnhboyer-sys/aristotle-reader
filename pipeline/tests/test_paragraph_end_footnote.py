"""A paragraph that ends in a footnote marker still ends.

`_ends_sentence` decides whether a blank line between two lines of archive
prose is a paragraph break. It read `receptacle.[^2]` as a line that does not
end a sentence, so the paragraph after it was run into it: De Spiritu lost 15
of Dobson's 72 paragraphs that way, and Owen's Isagoge 9 (found by Codex,
2026-11-06)."""
from aristotle_pipeline.stage1_ross import _ends_sentence, parse_book


def test_marker_after_the_stop_ends_the_sentence():
    assert _ends_sentence("its vessel and receptacle.[^2]")
    assert _ends_sentence("surround its hollow passage.[^39]]")
    assert _ends_sentence("they designed to form connexions?[^5.2]")
    assert not _ends_sentence("the nutriment[^1]")


def test_paragraph_after_a_marker_is_kept(tmp_path):
    path = tmp_path / "book-01.html"
    path.write_text("Part 1\n\n<p>It grows into its receptacle.[^2]</p>\n<p>The air draws it.</p>\n",
                    encoding="utf-8")
    assert parse_book(path, "part")[1].split("\n")[:2] == ["It grows into its receptacle.[^2]",
                                                         "The air draws it."]
