"""The gloss eval snaps each gold tick to the start of its sentence. A Perseus
milestone often sits on the space *before* a sentence; snapped as-is, that space
belongs to the previous sentence, so a correct placement scores as a miss."""
from aristotle_pipeline.align.aligner import split_sentences
from aristotle_pipeline.align.eval import gold_sentence_start

TEXT = "One thing is so. Another thing follows."


def test_milestone_on_the_space_before_a_sentence_belongs_to_that_sentence():
    starts = [s for s, _ in split_sentences(TEXT)]
    space = TEXT.index(" Another")
    assert gold_sentence_start(TEXT, starts, space) == TEXT.index("Another")


def test_milestone_inside_a_sentence_snaps_to_its_start():
    starts = [s for s, _ in split_sentences(TEXT)]
    assert gold_sentence_start(TEXT, starts, TEXT.index("follows")) == TEXT.index("Another")
    assert gold_sentence_start(TEXT, starts, TEXT.index("thing")) == 0
