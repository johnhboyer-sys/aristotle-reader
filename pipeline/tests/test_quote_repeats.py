"""strip_quote_repeats: MIT-archive verse/paragraph repeat quotation marks."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.config import SOURCES_DIR
from aristotle_pipeline.stage1_ross import parse_book, parse_translation

# Real 1000b lines from sources/meta-ross/book-03.html 470–500, wrapped as Part 1.
_PASSAGE_1000B = """<B>Part 1</B>
<A NAME="378"></A>For if the gods taste of nectar and ambrosia for their pleasure, these
<A NAME="379"></A>are in no wise the causes of their existence; and if they taste them to
<A NAME="380"></A>maintain their existence, how can gods who need food be eternal?-But into
<A NAME="381"></A>the subtleties of the mythologists it is not worth our while to inquire
<A NAME="382"></A>seriously; those, however, who use the language of proof we must cross-examine
<A NAME="383"></A>and ask why, after all, things which consist of the same elements are,
<A NAME="384"></A>some of them, eternal in nature, while others perish. Since these philosophers
<A NAME="385"></A>mention no cause, and it is unreasonable that things should be as they
<A NAME="386"></A>say, evidently the principles or causes of things cannot be the same. Even
<A NAME="387"></A>the man whom one might suppose to speak most consistently-Empedocles, even
<A NAME="388"></A>he has made the same mistake; for he maintains that strife is a principle
<A NAME="389"></A>that causes destruction, but even strife would seem no less to produce
<A NAME="390"></A>everything, except the One; for all things excepting God proceed from strife.
<A NAME="391"></A>At least he says:- "<BR><BR>
<A NAME="392"></A><BR><BR>"From which all that was and is and will be hereafter- <BR><BR>"Trees,
<A NAME="393"></A>and men and women, took their growth, <BR><BR>"And beasts and birds and
<A NAME="394"></A>water-nourished fish, <BR><BR>"And long-aged gods. "<BR><BR>
<A NAME="395"></A><BR><BR>"The implication is evident even apart from these words; for if
<A NAME="396"></A>strife had not been present in things, all things would have been one,
"""

_BEFORE = (
    'At least he says:- " "From which all that was and is and will be hereafter- '
    '"Trees, and men and women, took their growth, '
    '"And beasts and birds and water-nourished fish, '
    '"And long-aged gods. " "The implication is evident'
)

_AFTER = (
    'At least he says:- "From which all that was and is and will be hereafter- '
    'Trees, and men and women, took their growth, '
    'And beasts and birds and water-nourished fish, '
    'And long-aged gods. " The implication is evident'
)


def _write(tmp_path, body: str) -> Path:
    path = tmp_path / "book.html"
    path.write_text(
        f"<html><body>\nTranslated by W. D. Ross\n{body}\n</body></html>",
        encoding="utf-8",
    )
    return path


def test_1000b_flag_off_keeps_doubled_quotes(tmp_path):
    path = _write(tmp_path, _PASSAGE_1000B)
    text = parse_book(path, "part")[1]
    assert _BEFORE in text


def test_1000b_flag_on_merges_opener_and_strips_repeats(tmp_path):
    path = _write(tmp_path, _PASSAGE_1000B)
    text = parse_book(path, "part", strip_quote_repeats=True)[1]
    assert _AFTER in text
    span_start = text.index("At least he says:-")
    span_end = text.index("The implication is evident") + len("The implication is evident")
    span = text[span_start:span_end]
    assert span.count('"') == 2
    assert 'gods. " The implication' in text


def test_furniture_dropped_at_chapter_start(tmp_path):
    body = """<B>Part 1</B>
<A NAME="1"></A>First chapter prose.
<B>Part 2</B>
<A NAME="89"></A>"<BR><BR>
<A NAME="90"></A><BR><BR>"Since we are seeking this knowledge, we must inquire of what kind
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part", strip_quote_repeats=True)[2]
    assert text.startswith("Since we are seeking")
    assert '"' not in text


def test_lone_close_kept_hesiod(tmp_path):
    body = """<B>Part 1</B>
<A NAME="276"></A><BR><BR>"And Hesiod says:- "<BR><BR>
<A NAME="277"></A><BR><BR>"First of all things was chaos made, and then <BR><BR>"Broad-breasted
<A NAME="278"></A>earth... <BR><BR>"And love, 'mid all the gods pre-eminent,
<A NAME="279"></A>"<BR><BR>
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part", strip_quote_repeats=True)[1]
    # `_ends_sentence` treats `earth...` as terminal, so the following verse
    # line is a new paragraph (`\n`), not a same-paragraph space.
    assert 'And Hesiod says:- "First of all things was chaos made, and then Broad-breasted earth...' in text
    assert "And love, 'mid all the gods pre-eminent, \"" in text
    assert '" "First' not in text


def test_flag_off_keeps_jowett_paragraph_quotes(tmp_path):
    body = """<B>Part 1</B>
<A NAME="52"></A>they are a community of slaves, male and female. Wherefore the poets say,
<A NAME="53"></A><BR><BR>"It is meet that Hellenes should rule over barbarians;
<A NAME="54"></A>"<BR><BR>
<A NAME="55"></A>as if they thought that the barbarian and the slave were by nature
one.
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part")[1]
    assert '"It is meet that Hellenes should rule over barbarians;' in text
    assert text.count('"') >= 2


def test_verse_opener_kept_when_paragraph_repeat_coincides(tmp_path):
    # sources/meta-ross/book-03.html 410–414 (1000b "But when strife").
    body = """<B>Part 1</B>
<A NAME="409"></A>that things are so by nature. <BR><BR>"But when strife at last waxed great
<A NAME="411"></A>in the limbs of the <BR><BR>"Sphere, <BR><BR>"And sprang to assert its
<A NAME="412"></A>rights as the time was fulfilled <BR><BR>"Which is fixed for them in turn
<A NAME="413"></A>by a mighty oath. "<BR><BR>
<A NAME="414"></A><BR><BR>"This implies that change was necessary; but he shows no cause
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part", strip_quote_repeats=True)[1]
    assert 'nature.\n"But when strife' in text
    assert 'oath. " This implies' in text
    assert '"Sphere' not in text
    span_start = text.index('"But when strife')
    span_end = text.index("This implies") + len("This implies")
    assert text[span_start:span_end].count('"') == 2


def test_paragraph_final_furniture_close_dropped(tmp_path):
    body = """<B>Part 1</B>
<A NAME="1000"></A>truly; e.g. eight may be described as a double number by the use of the
<A NAME="1001"></A>definition of two. "<BR><BR>
<A NAME="1002"></A><BR><BR>"These things, then, are called false in these senses
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part", strip_quote_repeats=True)[1]
    assert "definition of two." in text
    assert "two. \"" not in text
    assert not text.rstrip().endswith('"')


def test_chapter_final_lone_quote_dropped(tmp_path):
    body = """<B>Part 1</B>
<A NAME="22"></A>it is of being as being that we also must grasp the first causes.
<A NAME="23"></A>"<BR><BR>
<B>Part 2</B>
<A NAME="25"></A><BR><BR>"There are many senses in which a thing may be said to 'be'
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part", strip_quote_repeats=True)[1]
    assert text.rstrip().endswith("first causes.")
    assert '"' not in text


def test_lone_quote_kept_as_detached_dangling_opener(tmp_path):
    # sources/meta-ross/book-14.html 229–233: `Parmenides:` + lone `"` opens
    # the verse; the verse line's own leading `"` is the repeat.
    body = """<B>Part 1</B>
<A NAME="141"></A>itself), if one did not join issue with and refute the saying of Parmenides:
<A NAME="142"></A>"<BR><BR>
<A NAME="143"></A><BR><BR>"'For never will this he proved, that things that are not are.'
<A NAME="144"></A>"<BR><BR>
<A NAME="145"></A><BR><BR>"They thought it necessary to prove that that which is not is;
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part", strip_quote_repeats=True)[1]
    assert "Parmenides: \" 'For never" in text
    assert "not are.' \"" in text
    assert text.count('"') == 2


def test_same_line_dangler_marks_leading_quote_as_repeat(tmp_path):
    # sources/meta-ross/book-04.html 597–601: `"And elsewhere he says that:- "`
    # carries a paragraph repeat AND the verse's real opener; the leading mark
    # must be stripped, never kept by the look-ahead.
    body = """<B>Part 1</B>
<A NAME="502"></A>their knowledge; "<BR><BR>
<A NAME="503"></A><BR><BR>"For wisdom increases in men according to what is before them.
<A NAME="504"></A>"<BR><BR>
<A NAME="505"></A><BR><BR>"And elsewhere he says that:- "<BR><BR>
<A NAME="506"></A><BR><BR>"So far as their nature changed, so far to them always <BR><BR>"Came
<A NAME="507"></A>changed thoughts into mind. "<BR><BR>
"""
    path = _write(tmp_path, body)
    text = parse_book(path, "part", strip_quote_repeats=True)[1]
    assert 'And elsewhere he says that:- "So far' in text
    assert '" "' not in text
    assert 'into mind. "' in text


def test_meta_ross_corpus_quote_parity():
    p = parse_translation(SOURCES_DIR / "meta-ross", 14, "part",
                          strip_quote_repeats=True)
    odd = {k: p[k].count('"') for k in p if p[k].count('"') % 2}
    assert not odd, odd
    assert 'oath. " This implies' in p[(3, 4)]
    assert 'nature.\n"But when strife' in p[(3, 4)]
    # The full inventory of surviving marks: the genuine quotations of
    # (1,4), (3,4), (4,5), (5,4), (14,2) and the "this" term pair in (10,1).
    assert 'that:- "So far as their nature changed' in p[(4, 5)]
    assert "Parmenides: \" 'For never" in p[(14, 2)]
    assert sum(t.count('"') for t in p.values()) == 22
    assert not any('" "' in t for t in p.values())
