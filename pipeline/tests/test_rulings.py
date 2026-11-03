"""John's review rulings (alignment-results/<vid>/rulings/<WORK>.json) pin
ticks word-exact on every pass 2. A ruling must land exactly where he clicked,
never be dragged by a machine neighbour (the June Poetics pins "snapped back"),
and never touch a chapter-start tick, which the Greek fixes."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import model_test as mt  # noqa: E402
from aristotle_pipeline.align import rulings  # noqa: E402
from aristotle_pipeline.align.aligner import align_chapter  # noqa: E402

TEXT = ("First comes a sentence about art. Then one about inquiry and choice. "
        "A third concerns the good. A fourth concerns ends. A fifth concerns crafts.")


def test_locate_matches_across_line_breaks_and_never_guesses_between_copies():
    text = "the good is aimed at.\nAnd again the good\nis aimed at."
    assert rulings.locate("One. the good\nis aimed at.", "the good is aimed at.") == 5
    assert rulings.locate(text, "the good is aimed at.") is None       # two copies, no context
    second = text.index("good\nis") - 4
    ctx = rulings.ruling_context(text, second, "the good is aimed at.")
    assert rulings.locate(text, "the good is aimed at.", **ctx) == second
    assert rulings.locate(text, "nowhere in it") is None


def test_a_ruling_whose_phrase_left_the_text_fails_by_name():
    with pytest.raises(ValueError, match="1094a5"):
        rulings.offsets({"1:1": {"1094a5": {"verdict": "late", "phrase": "not here", "near": 0}}},
                        {(1, 1): TEXT})


def test_a_ruling_without_a_phrase_places_nothing():
    assert rulings.offsets({"1:1": {"1094a5": {"verdict": "early"}}}, {(1, 1): TEXT}) == {}


def chapter():
    lines = [{"citation": f"1094a{n}", "greek": f"λέξις{n} ἄλλη{n}"} for n in range(1, 13)]
    ch = {"book": 1, "chapter": 1, "lines": lines, "text": TEXT,
          "windows": [{"tick": "1094a5", "is_column_start": False, "lines": ["1094a4", "1094a5", "1094a6"]},
                      {"tick": "1094a10", "is_column_start": False, "lines": ["1094a9", "1094a10", "1094a11"]}]}
    gloss = {f"1094a{n}": g for n, g in [(1, "art"), (4, "then inquiry"), (5, "and choice"), (6, "the good"),
                                         (9, "ends"), (10, "a fifth"), (11, "crafts")]}
    return mt.chapter_ref(ch, gloss)


def by_cit(anchors):
    return {a.citation: a for a in anchors}


def test_a_ruling_lands_exactly_and_is_marked():
    off = TEXT.index("inquiry and choice")
    a = by_cit(align_chapter(chapter(), "lexical", None, {"1094a5": off}))["1094a5"]
    assert (a.offset, a.confidence) == (off, "confirmed") and "ruled" in a.flags


def test_a_machine_neighbour_gives_way_to_a_ruling():
    # rule 1094a10 earlier than the machine placed 1094a5: 1094a5 is pulled
    # back to it; the ruling does not move
    first = by_cit(align_chapter(chapter(), "lexical"))
    target = max(0, first["1094a5"].offset - 5)
    got = by_cit(align_chapter(chapter(), "lexical", None, {"1094a10": target}))
    assert got["1094a10"].offset == target
    assert got["1094a5"].offset <= target and "clamped_by_ruling" in got["1094a5"].flags


def test_rulings_out_of_order_with_each_other_fail():
    with pytest.raises(ValueError, match="out of order"):
        align_chapter(chapter(), "lexical", None, {"1094a5": 60, "1094a10": 10})


def test_nothing_moves_a_chapter_start_tick():
    for ovr, ruled in (({"1094a1": 40}, None), (None, {"1094a1": 40})):
        a = by_cit(align_chapter(chapter(), "lexical", ovr, ruled))["1094a1"]
        assert (a.offset, a.tier) == (0, "chapter")


def test_a_click_is_placed_inside_the_passage_the_page_showed():
    # The export carries the clicked text, not its position (Codex). The page
    # shows a fixed window around the tick, so the click is the copy inside it;
    # none there, or two, is refused rather than guessed.
    text = "alpha beta. " * 3 + "the good is aimed at. " + "gamma delta. " * 40 + "the good is aimed at. "
    first = text.index("the good")
    assert rulings.place_click(text, "the good is aimed at.", 0, 300) == first
    with pytest.raises(ValueError, match="0 times"):
        rulings.place_click(text, "the good is aimed at.", 100, 300)
    with pytest.raises(ValueError, match="2 times"):
        rulings.place_click(text, "the good is aimed at.", 0, len(text))


def test_a_click_matches_whole_words_only():
    # Grok: a short phrase from the window's end ("and") also matched inside
    # "standard", and the click was refused as ambiguous.
    text = "a standard view, and so on"
    assert rulings.place_click(text, "and", 0, len(text)) == text.index(" and") + 1


def test_a_click_with_its_position_is_checked_against_the_text():
    text = "the same words. other. the same words."
    second = text.rindex("the same")
    assert rulings.place_click(text, "the same words.", 0, len(text), at=second) == second
    with pytest.raises(ValueError):
        rulings.place_click(text, "the same words.", 0, len(text), at=second + 1)


def test_a_ruling_keeps_to_its_own_copy_when_the_text_shifts():
    # Grok: "nearest to near" jumped to the other copy once text before it
    # grew. The ruling's preceding words pick its copy instead.
    text = ("Alpha one. Here the good. Beta two. "
            "Gamma three, delta four, epsilon five. There the good. End.")
    second = text.rindex("the good")
    r = {"phrase": "the good.", "near": second, **rulings.ruling_context(text, second, "the good.")}
    shifted = text.replace("Beta two.", "Beta two, " + "and much more " * 80 + "two.")
    assert rulings.offsets({"1:1": {"1094a5": r}}, {(1, 1): shifted})["1:1"]["1094a5"] == shifted.rindex("the good")
    # an edit to the words that identify the copy: refused by name, not guessed
    reworded = text.replace("epsilon five.", "zeta six.")
    with pytest.raises(ValueError, match="1094a5"):
        rulings.offsets({"1:1": {"1094a5": r}}, {(1, 1): reworded})


def test_an_edit_to_a_shared_preamble_is_refused_not_moved_to_the_other_copy():
    # Grok: two copies with the same 40-character lead-in; edit the ruled
    # copy's lead-in and the other copy still matched it. The context is now
    # lengthened at ruling time until it tells the copies apart.
    shared = "and so, as was said, iota kappa lambda mu, "
    text = "First start. " + shared + "the phrase repeats. Then second start. " + shared + "the phrase repeats. End."
    second = text.rindex("the phrase")
    ctx = rulings.ruling_context(text, second, "the phrase repeats.")
    assert rulings.locate(text, "the phrase repeats.", **ctx) == second
    edited = text[:text.rindex(shared)] + shared.replace("kappa", "kapa") + text[second:]
    assert rulings.locate(edited, "the phrase repeats.", **ctx) is None


def test_ruling_the_earlier_copy_when_the_shared_lead_in_reaches_the_start():
    # Grok, third pass: the earlier copy's whole prefix is also the tail of the
    # later copy's lead-in, so no context length tells them apart by suffix. A
    # context that reaches the chapter start must then match it exactly.
    shared = "As was said, iota kappa, "
    text = shared + "the phrase repeats. Then more words follow here. " + shared + "the phrase repeats. End."
    first = text.index("the phrase")
    ctx = rulings.ruling_context(text, first, "the phrase repeats.")
    assert ctx["from_start"] is True
    assert rulings.locate(text, "the phrase repeats.", **ctx) == first
    edited = shared.replace("kappa", "kapa") + text[len(shared):]
    assert rulings.locate(edited, "the phrase repeats.", **ctx) is None



def test_deleting_the_ruled_copy_does_not_move_the_tick_to_the_survivor():
    # Grok, fourth pass: with one copy left, locate skipped the context check.
    text = "PRE the phrase here. JUNK the phrase here."
    ctx = rulings.ruling_context(text, text.index("the phrase"), "the phrase here.")
    edited = text.replace("PRE the phrase here.", "PRE XXXX.")
    assert rulings.locate(edited, "the phrase here.", **ctx) is None


def test_a_unique_phrase_needs_no_context():
    text = "Only once does the phrase occur here."
    assert rulings.ruling_context(text, text.index("the phrase"), "the phrase occur") == {}


def test_a_lead_in_full_of_spaces_still_identifies_its_copy():
    # Grok: a 3*n raw window that collapses below n characters looked at too
    # little text.
    text = "Alpha beta gamma delta epsilon zeta eta" + " " * 400 + "the phrase. Theta iota kappa lambda mu nu xi" + " " * 400 + "the phrase."
    for off in (text.index("the phrase"), text.rindex("the phrase")):
        ctx = rulings.ruling_context(text, off, "the phrase.")
        assert rulings.locate(text, "the phrase.", **ctx) == off
