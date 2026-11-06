import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "tools"))

import topic_finder as tf  # noqa: E402

DIST = Path(__file__).parent / "fixtures" / "topic_finder" / "dist"


# 1. Bekker order
def test_bekker_comparator_orders_columns_and_lines():
    assert tf.bekker_cmp("1027a29", "1027b1") < 0
    assert tf.bekker_cmp("1027b1", "1028a1") < 0
    assert tf.bekker_cmp("1028a1", "1027a29") > 0
    assert tf.bekker_cmp("1027a9", "1027a10") < 0  # lines compare as numbers
    assert tf.bekker_cmp("99b5", "100a1") < 0  # pages compare as numbers
    refs = ["1028a1", "1027b1", "1027a29"]
    assert sorted(refs, key=tf.bekker_key) == ["1027a29", "1027b1", "1028a1"]


# 2. paragraph across a segment boundary
@pytest.fixture()
def units(tmp_path):
    out = tmp_path / "units.jsonl"
    assert tf.main(["units", "--dist", str(DIST), "--out", str(out)]) == 0
    return out, tf.read_units(out)


def test_paragraph_crossing_a_segment_is_one_unit(units):
    _, us = units
    book1 = [u for u in us if u["book"] == 1]
    assert [u["english"] for u in book1] == [
        "First paragraph.",
        "Second paragraph runs on and crosses the line.",
        "Third paragraph.",
    ]
    cross = book1[1]
    assert (cross["start"], cross["end"]) == ("1027a31", "1027b1")
    assert cross["id"] == "Tst.1.2"
    assert cross["chapter"] == "2"
    # Greek: line 31 of 1027a through line 1 of 1027b only
    assert cross["greek"] == "ἐξ ἀνάγκης ἀνάγκη ξξξ"
    assert cross["n_greek_tokens"] == 4
    assert cross["lemmas"][0] == ["e)k"]
    assert cross["lemmas"][3] == []  # no analysis
    assert book1[2]["interp"] is True and book1[0]["interp"] is False
    # Greek line 30 lies between English anchors 29 and 31: it belongs to paragraph 1
    assert (book1[0]["start"], book1[0]["end"]) == ("1027a29", "1027a30")
    assert book1[0]["greek"] == "ἀνάγκη ἐστί τῶν γένεσις"
    assert (book1[2]["start"], book1[2]["end"]) == ("1027b2", "1027b2")


def test_units_never_cross_a_book_and_summary_counts_unanalysed(units, capsys):
    _, us = units
    assert [u["id"] for u in us if u["book"] == 2] == ["Tst.2.1"]
    tf.main(["units", "--dist", str(DIST), "--out", str(units[0])])
    assert "tokens with no analysis: 1" in capsys.readouterr().out


# 3. phrase gaps
def test_phrase_matches_with_three_gaps_not_four():
    a, b = {"A"}, {"B"}
    other = {"X"}
    words = [a, b]
    assert tf.match_phrase([a, other, other, other, b], words) == 1  # 3 between
    assert tf.match_phrase([a, other, other, other, other, b], words) == 0  # 4 between
    assert tf.match_phrase([a, b], words) == 1
    assert tf.match_phrase([b, a], words) == 0  # order matters
    assert tf.match_phrase([a, other, b, a, b], words) == 2


# 4. unresolved lemma stops score
def _map(tmp_path, lemma):
    p = tmp_path / "map.yaml"
    p.write_text(
        f"topic: t\ncore:\n  lemmas: [ἀνάγκη, {lemma}]\n  phrases: [ἐκ ἀνάγκη]\n  english: [necessity]\n"
        "problems: {}\nlogical_context: {lemmas: []}\nanchors: {a: [\"Tst 1.1\"]}\n",
        encoding="utf-8",
    )
    return p


def test_score_exits_nonzero_when_a_map_lemma_resolves_to_nothing(tmp_path, units, capsys):
    rc = tf.main(["score", "--map", str(_map(tmp_path, "ξξξξ")), "--dist", str(DIST),
                  "--units", str(units[0]), "--out-dir", str(tmp_path / "o")])
    assert rc != 0
    assert "ξξξξ" in capsys.readouterr().err
    assert not (tmp_path / "o" / "candidates.json").exists()


def test_score_runs_when_all_lemmas_resolve(tmp_path, units):
    rc = tf.main(["score", "--map", str(_map(tmp_path, "γένεσις")), "--dist", str(DIST),
                  "--units", str(units[0]), "--out-dir", str(tmp_path / "o")])
    assert rc == 0
    cand = json.loads((tmp_path / "o" / "candidates.json").read_text("utf-8"))
    top = cand["rankers"]["greek_count"]["top"][0]
    assert top["id"] == "Tst.1.2"
    assert top["score"] == [3]  # two ἀνάγκη tokens + the ἐκ ἀνάγκη phrase
    assert top["features"]["anchor_near"] is True
    assert len(cand["rankers"]["combined"]["order"]) == cand["n_units"] == 4


def test_unparseable_anchor_fails_loudly(tmp_path, units):
    p = _map(tmp_path, "γένεσις")
    p.write_text(p.read_text("utf-8").replace('"Tst 1.1"', '"Tst one"'), encoding="utf-8")
    assert tf.main(["score", "--map", str(p), "--dist", str(DIST), "--units", str(units[0]),
                    "--out-dir", str(tmp_path / "o")]) != 0


# 5. recall
def _recall_setup(tmp_path, loci):
    units = [{"id": f"Tst.1.{i}", "work": "Tst", "start": f"1000a{i}", "end": f"1000a{i}"}
             for i in range(1, 401)]
    (tmp_path / "units.jsonl").write_text("\n".join(json.dumps(u) for u in units), encoding="utf-8")
    order = [u["id"] for u in units]  # rank = line number
    cand = {"topic": "t", "n_units": 400,
            "rankers": {"r": {"top": [{"id": i} for i in order[:50]], "order": order}}}
    cdir = tmp_path / "t"
    cdir.mkdir()
    (cdir / "candidates.json").write_text(json.dumps(cand), encoding="utf-8")
    key = tmp_path / "k.json"
    key.write_text(json.dumps({"source": "x", "loci": loci, "unparsed": []}), encoding="utf-8")
    return ["recall", "--key", str(key), "--candidates", str(cdir / "candidates.json"),
            "--units", str(tmp_path / "units.jsonl")], cdir


def _locus(row, a, b, core=True, work="Tst"):
    return {"row": row, "work": work, "book": 1, "chapter": "1", "ranges": [[a, b]],
            "pages": 10, "bucket": "1", "core": core}


def test_recall_found_missed_and_unresolved(tmp_path, capsys):
    argv, cdir = _recall_setup(tmp_path, [
        _locus(1, "1000a3", "1000a3"),      # rank 3: found at 50
        _locus(2, "1000a350", "1000a351"),  # best rank 350: missed at 300, found at 500
        _locus(3, "1000a900", "1000a901", core=False),  # no unit: unresolved, not core
    ])
    assert tf.main(argv) == 0  # unresolved non-core does not fail
    out = capsys.readouterr().out
    assert "examined 3 loci (2 core); unresolved 1; unparsed 0" in out
    assert "N=50 (12.50%)" in out
    assert ("| r | core 1/2 50%; all 1/2 50% | core 1/2 50%; all 1/2 50% | core 1/2 50%; all 1/2 50%"
            " | core 1/2 50%; all 1/2 50% | core 2/2 100%; all 2/2 100% |") in out
    assert "row 2" in out and "best rank 350" in out
    assert "row 1 " not in out.split("missed at N=300")[1]
    assert (cdir / "recall-k.md").exists()


def test_unresolved_core_locus_exits_nonzero(tmp_path, capsys):
    argv, _ = _recall_setup(tmp_path, [_locus(1, "1000a3", "1000a3"),
                                       _locus(2, "1000a900", "1000a901")])
    assert tf.main(argv) != 0
    assert "unresolved 1" in capsys.readouterr().out


def test_locus_in_another_work_does_not_match(tmp_path, capsys):
    argv, _ = _recall_setup(tmp_path, [_locus(1, "1000a3", "1000a3", work="Other")])
    assert tf.main(argv) != 0


# 6. an empty key examined nothing
def test_recall_with_empty_key_fails(tmp_path, capsys):
    argv, _ = _recall_setup(tmp_path, [])
    assert tf.main(argv) != 0
    assert "examined 0 loci" in capsys.readouterr().out


# 7. Sorabji rows
@pytest.mark.parametrize("cell,work,book,ranges", [
    ("Metaph. VI 3, 1027a29–b16 (cites a29–32, b1–14)", "Meta", 6, [["1027a29", "1027b16"]]),
    ("PA I 1, 639b21–640a9 and 642a1–b4", "PA", 1, [["639b21", "640a9"], ["642a1", "642b4"]]),
    ("Phys. VIII 2, 253a7–21; VIII 5–6, 258a1–2, 258b12–32, 259b1–20", "Phys", 8,
     [["253a7", "253a21"], ["258a1", "258a2"], ["258b12", "258b32"], ["259b1", "259b20"]]),
    ("MA 7–9, 701a16; 702a10–17; 702b24", "MA", 1,
     [["701a16", "701a16"], ["702a10", "702a17"], ["702b24", "702b24"]]),
])
def test_sorabji_locus_cells(cell, work, book, ranges):
    got = tf.parse_locus(cell)
    assert (got["work"], got["book"], got["ranges"]) == (work, book, ranges)


def test_sorabji_unparseable_cells_are_listed_not_guessed():
    md = ("### Locus table\n\n| # | Locus | S. ch. | Pages | Bucket | Reason |\n|---|---|---|---|---|---|\n"
          "| 1 | Metaph. VI 3, 1027a29–b16 | 1 | 34 | 1 | r |\n"
          "| 2 | Foo. I 1, 12a1–5 | 1 | (same) | 2 | r |\n"
          "| 3 | PA I 1, see the whole chapter | 1 | 5 | 2 | r |\n\nAfter.\n\n| 9 | 13 |\n")
    key = tf.parse_sorabji_table(md)
    assert [l["row"] for l in key["loci"]] == [1]
    assert [u["row"] for u in key["unparsed"]] == [2, 3]
    assert key["unparsed"][0]["cell"] == "Foo. I 1, 12a1–5"


@pytest.mark.parametrize("cell,prev,want", [("34", None, 34), ("(same)", 24, 24), ("10 + 7", None, 17),
                                            ("2–3 each", None, 3), ("4 + 3", None, 7)])
def test_sorabji_pages(cell, prev, want):
    assert tf.parse_pages(cell, prev) == want


def test_core_means_eight_pages_and_not_bucket_b():
    md = ("### Locus table\n\n| # | Locus | S. ch. | Pages | Bucket | Reason |\n|---|---|---|---|---|---|\n"
          "| 1 | Metaph. VI 3, 1027a29–b16 | 1 | 8 | 1 | r |\n"
          "| 2 | Metaph. VI 3, 1027a29–b16 | 1 | 7 | 1 | r |\n"
          "| 3 | Metaph. VI 3, 1027a29–b16 | 1 | 30 | B | r |\n")
    assert [l["core"] for l in tf.parse_sorabji_table(md)["loci"]] == [True, False, False]


# 8. paragraphs from markers (works with no newline in the English)
def _marker_book(markers, text="Alpha one. Beta two. Gamma three.", markers2=()):
    seg = {"column": "1000a", "greek": [{"n": n, "text": "x", "tokens": []} for n in (1, 5, 9)],
           "english": {"text": text, "markers": markers,
                       "bekker": [{"n": 1, "offset": 0}, {"n": 5, "offset": 11}, {"n": 9, "offset": 21}]}}
    return {"book": 1, "segments": [seg]}


def _units_of(doc):
    us, _ = tf.build_book_units("Tst", 1, doc, [], {})
    return [(u["english"], u["start"], u["end"]) for u in us]


def test_markers_split_a_text_with_no_newline():
    doc = _marker_book([{"kind": "paragraph", "n": 1, "offset": 11},
                        {"kind": "section", "n": 2, "offset": 21}])
    assert _units_of(doc) == [("Alpha one.", "1000a1", "1000a4"),
                              ("Beta two.", "1000a5", "1000a8"),
                              ("Gamma three.", "1000a9", "1000a9")]


def test_marker_at_offset_zero_or_on_a_newline_makes_no_empty_unit():
    doc = _marker_book([{"kind": "paragraph", "n": 1, "offset": 0},
                        {"kind": "subsection", "n": 1, "offset": 11}],
                       text="Alpha one. \nBeta two. Gamma three.")
    # the marker at 11 sits right after the newline at 10
    assert [u[0] for u in _units_of(doc)] == ["Alpha one.", "Beta two. Gamma three."]


def test_marker_at_a_later_segment_start_begins_a_paragraph():
    d = _marker_book([])
    seg2 = {"column": "1000a", "greek": [],
            "english": {"text": "Delta four.", "markers": [{"kind": "paragraph", "n": 2, "offset": 0}],
                        "bekker": [{"n": 12, "offset": 0}]}}
    d["segments"].append(seg2)
    got = _units_of(d)
    assert [u[0] for u in got] == ["Alpha one. Beta two. Gamma three.", "Delta four."]
    assert got[1][1:] == ("1000a12", "1000a12")


# 9. fold_lemma drops breathings; a map entry must not resolve across one
def _score_with(tmp_path, dist, lemma, units):
    return tf.main(["score", "--map", str(_map(tmp_path, lemma)), "--dist", str(dist),
                    "--units", str(units[0]), "--out-dir", str(tmp_path / "o")])


def test_map_breathing_collision_fails(tmp_path, units, capsys):
    import shutil
    dist = tmp_path / "dist"
    shutil.copytree(DIST, dist)
    path = dist / "Tst" / "analyses.json"
    a = json.loads(path.read_text("utf-8"))
    a["e(/c"] = [{"lemma": "e(/c", "gloss": "state"}]  # ἕξ; the corpus has no e)c lemma
    path.write_text(json.dumps(a), encoding="utf-8")
    assert _score_with(tmp_path, dist, "ἐξ", units) != 0
    err = capsys.readouterr().err
    assert "ἐξ" in err and "e(/c" in err
    assert not (tmp_path / "o" / "candidates.json").exists()


def test_map_entry_matching_same_breathing_passes(tmp_path, units):
    assert _score_with(tmp_path, DIST, "ἐκ", units) == 0  # ἐκ -> e)k


# 10. a paragraph's Greek runs to the line before the next anchor
def _sparse_doc(text, anchors, lines, col="1000a"):
    seg = {"column": col, "greek": [{"n": n, "text": f"g{n}", "tokens": []} for n in lines],
           "english": {"text": text, "markers": [],
                       "bekker": [{"n": n, "offset": o} for n, o in anchors]}}
    return {"book": 1, "segments": [seg]}


def test_paragraph_runs_to_the_line_before_the_next_anchor():
    # EN.3.1 shape: anchors 30 and 36 are far apart; paragraph one lies between
    doc = _sparse_doc("Para one text.\nPara two text.", [(30, 0), (36, 15)], range(30, 38))
    us, _ = tf.build_book_units("Tst", 1, doc, [], {})
    assert (us[0]["start"], us[0]["end"]) == ("1000a30", "1000a35")
    assert us[0]["greek"] == "g30 g31 g32 g33 g34 g35"
    assert (us[1]["start"], us[1]["end"]) == ("1000a36", "1000a37")  # no next anchor: last line


def test_paragraph_containing_an_anchor_still_ends_before_the_next_one():
    doc = _sparse_doc("Para one text.\nPara two text.", [(30, 0), (33, 5), (36, 15)], range(30, 38))
    us, _ = tf.build_book_units("Tst", 1, doc, [], {})
    assert (us[0]["start"], us[0]["end"]) == ("1000a30", "1000a35")


def test_next_anchor_at_line_one_of_a_new_column_ends_at_the_last_greek_line():
    segs = [
        {"column": "1000a", "greek": [{"n": n, "text": f"g{n}", "tokens": []} for n in (1, 2, 3, 4, 5)],
         "english": {"text": "Alpha.\n", "markers": [], "bekker": [{"n": 1, "offset": 0}]}},
        {"column": "1000b", "greek": [{"n": 1, "text": "h1", "tokens": []}],
         "english": {"text": "Beta.", "markers": [], "bekker": [{"n": 1, "offset": 0}]}},
    ]
    us, _ = tf.build_book_units("Tst", 1, {"book": 1, "segments": segs}, [], {})
    assert (us[0]["start"], us[0]["end"]) == ("1000a1", "1000a5")
    assert (us[1]["start"], us[1]["end"]) == ("1000b1", "1000b1")


# 11. a reversed range is flagged, not hidden
def _reversed_doc():
    return _sparse_doc("Alpha.\nBeta.", [(20, 0), (10, 7)], range(5, 25))


def test_reversed_range_is_flagged_with_original_endpoints():
    us, st = tf.build_book_units("Tst", 1, _reversed_doc(), [], {})
    u = us[0]
    assert u["reversed"] is True
    assert (u["orig_start"], u["orig_end"]) == ("1000a20", "1000a9")
    assert (u["start"], u["end"]) == ("1000a20", "1000a20")
    assert "reversed" not in us[1] or us[1]["reversed"] is False


def test_next_anchor_on_the_start_line_is_one_line_not_reversed():
    doc = _sparse_doc("Alpha.\nBeta.", [(20, 0), (20, 7)], range(5, 25))
    us, _ = tf.build_book_units("Tst", 1, doc, [], {})
    assert (us[0]["start"], us[0]["end"]) == ("1000a20", "1000a20")
    assert "reversed" not in us[0]


def test_units_lists_reversed_ids_and_fails_above_the_limit(tmp_path, monkeypatch, capsys):
    import shutil
    dist = tmp_path / "dist"
    shutil.copytree(DIST, dist)
    (dist / "Tst" / "book-02.json").write_text(json.dumps(_reversed_doc() | {"book": 2}), encoding="utf-8")
    out = tmp_path / "u.jsonl"
    assert tf.main(["units", "--dist", str(dist), "--out", str(out)]) == 0
    text = capsys.readouterr().out
    assert "reversed: 1" in text and "Tst.2.1" in text
    monkeypatch.setattr(tf, "MAX_REVERSED", 0)
    assert tf.main(["units", "--dist", str(dist), "--out", str(out)]) != 0


# 12. lemma resolution keeps accents and breathings
def _raw_corpus_dist(tmp_path, lemmas):
    import shutil
    import tempfile
    dist = Path(tempfile.mkdtemp(dir=tmp_path)) / "dist"
    shutil.copytree(DIST, dist)
    path = dist / "Tst" / "analyses.json"
    a = json.loads(path.read_text("utf-8"))
    for i, l in enumerate(lemmas):
        a[f"zz{i}"] = [{"lemma": l, "gloss": "x"}]
    path.write_text(json.dumps(a), encoding="utf-8")
    return dist


def _resolve(tmp_path, lemmas, entry):
    dist = _raw_corpus_dist(tmp_path, lemmas)
    tm = {"core": {"lemmas": [entry]}}
    spec, table, failures, notes = tf.resolve_map(tm, tf.collect_corpus_keys(dist))
    return spec["core"]["lemmas"], failures, notes


def test_eimi_does_not_match_eimi_go(tmp_path):
    keys, _, _ = _resolve(tmp_path, ["ei)mi/", "ei)=mi"], "εἰμί")
    assert keys == {"ei)mi/"}


def test_tis_does_not_match_indefinite_tis(tmp_path):
    keys, _, _ = _resolve(tmp_path, ["ti/s", "tis"], "τίς")
    assert keys == {"ti/s"}


def test_homographs_are_ambiguous_unless_the_entry_has_a_digit(tmp_path):
    keys, _, notes = _resolve(tmp_path, ["ne/w1", "ne/w2", "ne/w3"], "νέω")
    assert keys == {"ne/w1", "ne/w2", "ne/w3"}
    assert any(n.startswith("AMBIGUOUS νέω ->") for n in notes)
    keys, _, notes = _resolve(tmp_path, ["ne/w1", "ne/w2", "ne/w3"], "νέω2")
    assert keys == {"ne/w2"}
    assert not any(n.startswith("AMBIGUOUS") for n in notes)


def test_length_marks_are_ignored(tmp_path):
    keys, _, _ = _resolve(tmp_path, ["lo/gos^"], "λόγος")
    assert keys == {"lo/gos^"}


def test_fold_fallback_is_reported(tmp_path, capsys):
    keys, failures, notes = _resolve(tmp_path, ["ti/s"], "τις")  # accent differs: fallback only
    assert keys == {"ti/s"} and not failures
    assert any(n.startswith("FALLBACK τις -> ti/s") for n in notes)


def test_score_prints_fallback_and_ambiguous(tmp_path, units, capsys):
    dist = _raw_corpus_dist(tmp_path, ["ne/w1", "ne/w2", "ti/s"])
    p = _map(tmp_path, "νέω")
    p.write_text(p.read_text("utf-8").replace("ἐκ ἀνάγκη]", "ἐκ ἀνάγκη]").replace("ἀνάγκη, νέω", "ἀνάγκη, νέω, τις"),
                 encoding="utf-8")
    tf.main(["score", "--map", str(p), "--dist", str(dist), "--units", str(units[0]),
             "--out-dir", str(tmp_path / "o")])
    out = capsys.readouterr().out
    assert "AMBIGUOUS νέω -> ne/w1, ne/w2" in out
    assert "FALLBACK τις -> ti/s" in out


# 13. a blank English entry is refused
def test_blank_english_entry_fails_naming_it(tmp_path, units, capsys):
    p = _map(tmp_path, "γένεσις")
    p.write_text(p.read_text("utf-8").replace("english: [necessity]", 'english: [necessity, " "]'),
                 encoding="utf-8")
    assert _score_with_map(tmp_path, p, units) != 0
    err = capsys.readouterr().err
    assert "blank" in err and "core" in err
    assert not (tmp_path / "o" / "candidates.json").exists()


def _score_with_map(tmp_path, p, units):
    return tf.main(["score", "--map", str(p), "--dist", str(DIST), "--units", str(units[0]),
                    "--out-dir", str(tmp_path / "o")])


# 14. recall that ranks nothing fails
def test_recall_with_no_rankers_fails(tmp_path, capsys):
    argv, cdir = _recall_setup(tmp_path, [_locus(1, "1000a3", "1000a3")])
    cand = json.loads((cdir / "candidates.json").read_text("utf-8"))
    cand["rankers"] = {}
    (cdir / "candidates.json").write_text(json.dumps(cand), encoding="utf-8")
    assert tf.main(argv) != 0
    assert "ranker" in capsys.readouterr().err


def test_recall_with_an_empty_ranker_order_fails(tmp_path, capsys):
    argv, cdir = _recall_setup(tmp_path, [_locus(1, "1000a3", "1000a3")])
    cand = json.loads((cdir / "candidates.json").read_text("utf-8"))
    cand["rankers"]["empty"] = {"top": [], "order": []}
    (cdir / "candidates.json").write_text(json.dumps(cand), encoding="utf-8")
    assert tf.main(argv) != 0
    assert "empty" in capsys.readouterr().err


# 15. parse-sorabji that parses nothing, or leaves rows over, fails
_HEAD = "### Locus table\n\n| # | Locus | S. ch. | Pages | Bucket | Reason |\n|---|---|---|---|---|---|\n"


def _parse(tmp_path, rows):
    md = tmp_path / "t.md"
    md.write_text(_HEAD + rows, encoding="utf-8")
    return tf.main(["parse-sorabji", "--table", str(md), "--out", str(tmp_path / "k.json")])


def test_parse_sorabji_with_no_loci_fails(tmp_path):
    assert _parse(tmp_path, "") != 0
    assert _parse(tmp_path, "| 1 | Foo. I 1, 12a1–5 | 1 | 5 | 2 | r |\n") != 0


def test_parse_sorabji_with_an_unparsed_row_fails(tmp_path):
    rows = ("| 1 | Metaph. VI 3, 1027a29–b16 | 1 | 34 | 1 | r |\n"
            "| 2 | Foo. I 1, 12a1–5 | 1 | 5 | 2 | r |\n")
    assert _parse(tmp_path, rows) != 0
    assert _parse(tmp_path, rows.split("\n")[0] + "\n") == 0
