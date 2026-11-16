"""The running-text file the search page's running-text mode reads.

Its offset map is implicit: the n-th run of token characters is global token
n, which offsets.json places in a segment and line. These tests pin that the
runs come out one per stage3 token, in order, and round-trip to the segment,
line and token they came from.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

import pytest  # noqa: E402

from aristotle_pipeline.running_text import (  # noqa: E402
    build_running_text,
    check_alignment,
    gap_text,
    line_pieces,
    token_beta,
    token_spans,
)
from aristotle_pipeline.stage3_tokenize import tokenize  # noqa: E402


def _spine():
    return {
        "work": "Test",
        "segments": [
            {"id": "1:17a", "book": 1, "column": "17a", "lines": [
                {"n": 1, "text": "Ὅτι μὲν ὑμεῖς, ὦ ἄνδρες Ἀθηναῖοι, πεπόνθατε"},
                {"n": 2, "text": "ὑπὸ τῶν ἐμῶν κατηγόρων, οὐκ οἶδα· ἐγὼ δ' οὖν"},
            ]},
            {"id": "1:17b", "book": 1, "column": "17b", "lines": [
                {"n": 1, "text": "[καὶ] ἀ<μφι>γνοεῖν — \"Τί δή;\" ᾧ (ὡς) δοκεῖ."},
                {"n": 2, "text": ""},
                {"n": 3, "text": "—"},
                {"n": 4, "text": "τί λέγεις;’ ἔφη."},
            ]},
        ],
    }


def _offsets(segments):
    """offsets.json's coordinates for the same segments, as stage6 counts them."""
    base, running = [], 0
    for seg in segments:
        base.append(running)
        running += sum(len(line["tokens"]) for line in seg["lines"])
    return base, running


def _one_line_spine(text, work="T"):
    return {"work": work, "segments": [
        {"id": "x", "book": 1, "column": "x", "lines": [{"n": 1, "text": text}]}]}


@pytest.mark.parametrize("text,count", [("", 0), ("- : .", 0), ("lo/gos", 0), ("", 1)])
def test_alignment_refuses_zero_count_or_no_token_runs(text, count):
    with pytest.raises(ValueError, match="Empty work.*global token 0"):
        check_alignment("Empty work", text, [], count)


def test_alignment_refuses_a_work_with_only_punctuation():
    spine = _one_line_spine("— · .", "Empty work")
    segments = tokenize(spine)[0]["segments"]
    text = build_running_text(segments, spine)
    with pytest.raises(ValueError, match="Empty work.*global token 0"):
        check_alignment(spine["work"], text, segments, 0)


@pytest.mark.parametrize("raw,expected", [
    ('κρίνατε".', 'kri/nate".'),
    ("εἰρημένον· **.", "ei)rhme/non: ."),
    ("— — λόγος", "- - lo/gos"),
    ('  — — λόγος".  ', '- - lo/gos".'),
])
def test_work_edges_keep_the_printed_punctuation(raw, expected):
    spine = _one_line_spine(raw)
    segments = tokenize(spine)[0]["segments"]
    text = build_running_text(segments, spine)
    assert text == expected
    assert [text[a:b] for a, b in token_spans(text)] == [
        token_beta(tok["t"]) for tok in segments[0]["lines"][0]["tokens"]
    ]
    check_alignment("T", text, segments, _offsets(segments)[1])


@pytest.mark.parametrize("raw,expected,tokens", [
    ("μὴ 'πιχεῖν", "mh\\ 'pixei=n", ["μὴ", "'πιχεῖν"]),
    ("’κάλει’", "'ka/lei'", ["’κάλει’"]),
    ("μὴ ’κάλει’ λόγος", "mh\\ 'ka/lei' lo/gos", ["μὴ", "’κάλει’", "λόγος"]),
])
def test_leading_apostrophes_belong_only_to_the_token(raw, expected, tokens):
    spine = _one_line_spine(raw)
    segments = tokenize(spine)[0]["segments"]
    assert [tok["t"] for tok in segments[0]["lines"][0]["tokens"]] == tokens
    assert [value for kind, value in line_pieces(raw) if kind == "tok"] == tokens
    text = build_running_text(segments, spine)
    assert text == expected
    check_alignment("T", text, segments, len(tokens))


def test_token_beta_keeps_marks_in_one_order_and_grave_as_printed():
    assert token_beta("ἔτη") == "e)/th"
    assert token_beta("ᾧ") == "w(=|"
    assert token_beta("ΐ") == "i+/"
    assert token_beta("Ἀθηναῖοι") == "a)qhnai=oi"
    assert token_beta("δὲ") == "de\\"
    assert token_beta("δ'") == "d'"
    assert token_beta("δ’") == "d'"


def test_gap_keeps_punctuation_and_drops_sigla_and_parentheses():
    assert gap_text(", ") == ", "
    assert gap_text("· ") == ": "
    assert gap_text(";\" ") == ";\" "
    assert gap_text(" — ") == " - "
    assert gap_text(" [") == " "
    assert gap_text(") (") == " "
    assert gap_text("  \t ") == " "


def test_line_pieces_cut_the_words_stage3_cuts():
    text = _spine()["segments"][1]["lines"][0]["text"]
    toks = [v for k, v in line_pieces(text) if k == "tok"]
    stage3 = [t["t"] for t in tokenize({"work": "T", "segments": [
        {"id": "x", "book": 1, "column": "x", "lines": [{"n": 1, "text": text}]}]})[0]["segments"][0]["lines"][0]["tokens"]]
    assert toks == stage3 == ["καὶ", "ἀμφιγνοεῖν", "Τί", "δή", "ᾧ", "ὡς", "δοκεῖ"]


def test_running_text_crosses_words_with_their_punctuation():
    spine = _spine()
    segments = tokenize(spine)[0]["segments"]
    text = build_running_text(segments, spine)
    assert text == (
        "o(/ti me\\n u(mei=s, w)= a)/ndres a)qhnai=oi, pepo/nqate u(po\\ tw=n e)mw=n "
        "kathgo/rwn, ou)k oi)=da: e)gw\\ d' ou)=n kai\\ a)mfignoei=n - \"ti/ dh/;\" w(=| w(s dokei=. - "
        "ti/ le/geis' e)/fh."
    )


def test_a_line_of_no_words_keeps_its_punctuation():
    """17b's third line is a lone dash: it stands between δοκεῖ. and τί."""
    spine = _spine()
    text = build_running_text(tokenize(spine)[0]["segments"], spine)
    assert "dokei=. - ti/" in text


def test_apostrophes_follow_aristotles_tokenizer_even_after_a_stop():
    # Unlike Plato, Aristotle's _clean keeps ;’ in the token. Do not change
    # its token boundary or emit that apostrophe a second time as a gap.
    spine = _spine()
    segments = tokenize(spine)[0]["segments"]
    assert segments[1]["lines"][-1]["tokens"][1]["t"] == "λέγεις;’"
    text = build_running_text(segments, spine)
    assert "le/geis' e)/fh" in text
    assert gap_text(";’ ") == ';" '
    assert token_beta("δ’") == "d'"


def test_offset_map_round_trips_to_segment_line_and_token():
    spine = _spine()
    segments = tokenize(spine)[0]["segments"]
    text = build_running_text(segments, spine)
    spans = token_spans(text)
    base, count = _offsets(segments)
    assert len(spans) == count
    for si, seg in enumerate(segments):
        pos = 0
        for line in seg["lines"]:
            for tok in line["tokens"]:
                start, end = spans[base[si] + pos]
                assert text[start:end] == token_beta(tok["t"]), (seg["id"], line["n"], tok)
                pos += 1


def test_a_spine_that_cuts_differently_from_stage3_is_refused():
    spine = _spine()
    segments = tokenize(spine)[0]["segments"]
    spine["segments"][0]["lines"][0]["text"] = "Ὅτι μὲν ὑμεῖς ὦ"
    with pytest.raises(ValueError, match="cuts into"):
        build_running_text(segments, spine)


def test_token_spans_refuses_a_character_neither_word_nor_gap():
    with pytest.raises(ValueError, match="unexpected character"):
        token_spans("lo/gos [kai")


def test_shared_fixture_is_what_the_writer_writes():
    """The ported fixture follows Aristotle stage3, including its quote rule."""
    fixture = json.loads(
        (ROOT / "pipeline" / "tests" / "fixtures" / "running_text.json").read_text(encoding="utf-8")
    )
    spine = fixture["spine"]
    segments = tokenize(spine)[0]["segments"]
    assert build_running_text(segments, spine) == fixture["running"]["text"]
    assert fixture["running"]["token_count"] == len(token_spans(fixture["running"]["text"]))


def test_alignment_refuses_a_missing_run_with_work_and_first_token():
    segments = tokenize(_spine())[0]["segments"]
    text = build_running_text(segments, _spine())
    count = _offsets(segments)[1]
    with pytest.raises(ValueError, match=r"Test.*global token 1.*μὲν"):
        check_alignment("Test", text.replace(" me\\n", "", 1), segments, count)


def test_alignment_refuses_a_wrong_declared_count():
    segments = tokenize(_spine())[0]["segments"]
    text = build_running_text(segments, _spine())
    count = _offsets(segments)[1]
    with pytest.raises(ValueError, match=rf"Test.*global token {count - 1}"):
        check_alignment("Test", text, segments, count - 1)


def test_real_aristotle_lines_keep_elision_sigla_diaeresis_and_raised_dot():
    # VV 1250a21–22 and APo 71a1, copied from the emitted Greek.
    spine = {"work": "Aristotle samples", "segments": [
        {"id": "VV:1250a", "book": 1, "column": "1250a", "lines": [
            {"n": 21, "text": "καθ' ἣν αἱροῦνται τὰς φαύλας ἡδονάς. [περὶ μὲν τῆς ἀκρατείας"},
            {"n": 22, "text": "οὐδέν· οὕτω δὲ σὺ δύνασαι ὁρίζειν.] ἀκράτεια δ' ἐστὶ"},
        ]},
        {"id": "APo:71a", "book": 1, "column": "71a", "lines": [
            {"n": 1, "text": "Πᾶσα διδασκαλία καὶ πᾶσα μάθησις διανοητικὴ ἐκ προϋπαρχούσης"},
        ]},
    ]}
    tokens, sigla, failures = tokenize(spine)
    assert not failures
    assert sigla
    segments = tokens["segments"]
    text = build_running_text(segments, spine)
    check_alignment(spine["work"], text, segments, _offsets(segments)[1])
    assert text.startswith("kaq' h(\\n")
    assert "ou)de/n: ou(/tw" in text
    assert "prou+parxou/shs" in text
    assert "[" not in text and "]" not in text


def test_lettered_and_repeated_lines_keep_their_own_tokens():
    spine = {"work": "T", "segments": [
        {"id": "1:244b", "book": 1, "column": "244b", "lines": [
            {"n": 5, "text": "τὸ πρῶτον"},
            {"n": 5, "sub": "a", "text": "ὑπόκειται γὰρ"},
            {"n": 6, "text": "καὶ χρόνῳ"},
            {"n": 6, "text": "ἡ δὲ στιγμὴ"},
        ]}]}
    segments = tokenize(spine)[0]["segments"]
    text = build_running_text(segments, spine)
    assert text == "to\\ prw=ton u(po/keitai ga\\r kai\\ xro/nw| h( de\\ stigmh\\"
    check_alignment("T", text, segments, 9)


def test_numerals_references_and_extra_sigla_follow_aristotle_stage3():
    raw = "βʹ (p. 941b 4—23.) ⟦λόγος⟧ ‖ {καὶ} φ[αʹ ι[ϛ]"
    spine = {"work": "T", "segments": [
        {"id": "x", "book": 1, "column": "x", "lines": [{"n": 1, "text": raw}]}]}
    segments = tokenize(spine)[0]["segments"]
    assert [t["t"] for t in segments[0]["lines"][0]["tokens"]] == ["λόγος", "καὶ", "φαʹ", "ιϛ"]
    text = build_running_text(segments, spine)
    # The client's token alphabet has no numeral signs or lacuna dots.
    assert [text[a:b] for a, b in token_spans(text)] == ["lo/gos", "kai\\", "fa", "i"]
    check_alignment("T", text, segments, 4)
    assert token_beta("λ̣ό.γος") == "lo/gos"


@pytest.mark.parametrize("text,count,index", [("", 1, 0), ("lo/gos kai", 1, 1), ("lo/gos", 2, 1)])
def test_alignment_refuses_short_extra_and_wrong_count(text, count, index):
    segments = [{"id": "x", "lines": [{"n": 1, "tokens": [{"t": "λόγος"}]}]}]
    with pytest.raises(ValueError, match=rf"T.*global token {index}"):
        check_alignment("T", text, segments, count)


def test_backfill_from_emitted_books_checks_offsets_before_writing(tmp_path):
    # The one-off backfill module was never committed (stage 6 now writes running.json).
    backfill = pytest.importorskip("aristotle_pipeline.backfill_running_text").backfill

    fixture = json.loads((ROOT / "pipeline/tests/fixtures/running_text.json").read_text())
    work = tmp_path / "Test"
    search = work / "search"
    search.mkdir(parents=True)
    (work / "book-01.json").write_text(json.dumps(fixture["book"]))
    (search / "meta.json").write_text(json.dumps(fixture["meta"]))
    (search / "offsets.json").write_text(json.dumps(fixture["offsets"]))
    chars = backfill(work)
    running_path = search / "running.json"
    assert json.loads(running_path.read_text()) == fixture["running"]
    assert chars == len(fixture["running"]["text"])
    previous = running_path.read_bytes()
    fixture["offsets"]["token_count"] += 1
    (search / "offsets.json").write_text(json.dumps(fixture["offsets"]))
    with pytest.raises(ValueError, match="Test.*offsets disagree"):
        backfill(work)
    assert running_path.read_bytes() == previous
