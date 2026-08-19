from aristotle_pipeline.offline.quotation_matching import (
    DEFAULT_N,
    dedup_clusters,
    find_runs,
    is_function_lemma,
    iter_export_lines,
    score_run,
    surface_key,
)


def test_exact_ngram_emits_one_maximal_run():
    ari = list("abcde")
    ext = list("xxabcdeyy")
    assert find_runs(ari, ext, n=DEFAULT_N) == [(0, 5, 2, 7)]


def test_substrings_are_not_emitted_beside_the_maximal_run():
    ari = list("abcdef")
    ext = list("abcdef")
    runs = find_runs(ari, ext, n=4)
    assert runs == [(0, 6, 0, 6)]


def test_memory_quote_one_substitution_in_six_still_matches():
    ari = list("abcdef")
    ext = list("abxdef")
    assert find_runs(ari, ext, n=4) == [(0, 6, 0, 6)]


def test_one_substitution_in_four_does_not_match():
    assert find_runs(list("abcd"), list("abxd"), n=4) == []


def test_function_word_run_is_down_weighted():
    articles = ["o(", "o(", "o(", "o("]
    content = ["a)reth/", "dikaiosu/nh", "sofi/a", "nou=s"]
    assert score_run(articles) < score_run(content)
    assert score_run(articles) == 0


def test_four_content_lemmata_clear_default_floor():
    content = ["a)reth/", "dikaiosu/nh", "sofi/a", "nou=s"]
    assert score_run(content) >= 10


def test_six_function_heavy_lemmata_do_not_clear_floor():
    words = ["ou(=tos", "su/", "oi(=os", "o(", "kai/", "de/"]
    assert all(is_function_lemma(w) for w in words)
    assert score_run(words) < 10


def test_elision_marks_share_one_key():
    # Literal inventory — must not be derived from ELISION_MARKS.
    marks = ("\u02bc", "\u2019", "\u0027", "\u1fbd", "\u1fbf", "\u1ffd")
    keys = {surface_key("δ" + mark) for mark in marks}
    assert keys == {"d'"}


def test_accent_collision_lemmata_do_not_match():
    # ἀλλά vs ἄλλα fold to the same string; matching must keep them distinct.
    alla = ["a)lla/", "lo/gos", "a)gaqo/s", "a)nh/r"]
    alla_n = ["a)/lla", "lo/gos", "a)gaqo/s", "a)nh/r"]
    assert find_runs(alla, alla, n=4) == [(0, 4, 0, 4)]
    assert find_runs(alla, alla_n, n=4) == []


def test_dedup_keeps_one_best_window_per_site():
    rows = [
        {"column": "985a", "lo": 20, "hi": 23, "score": 249,
         "source_author": "Empedocles", "source_work": "003"},
        {"column": "985a", "lo": 20, "hi": 24, "score": 250,
         "source_author": "Empedocles", "source_work": "003"},
        {"column": "985a", "lo": 21, "hi": 24, "score": 250,
         "source_author": "Empedocles", "source_work": "003"},
        {"column": "1076a", "lo": 4, "hi": 4, "score": 11,
         "source_author": "Homer", "source_work": "001"},
        {"column": "987b", "lo": 1, "hi": 2, "score": 6,
         "source_author": "Plato", "source_work": "030"},
    ]
    kept = dedup_clusters(rows, min_score=10)
    assert len(kept) == 2
    best = next(r for r in kept if r["column"] == "985a")
    # max score wins; widest span breaks the tie
    assert (best["score"], best["lo"], best["hi"]) == (250, 20, 24)
    assert any(r["column"] == "1076a" for r in kept)   # floor keeps score 11
    assert not any(r["column"] == "987b" for r in kept)  # score 6 dropped


def test_dedup_keeps_nonoverlapping_spans_in_same_column():
    rows = [
        {"column": "985a", "lo": 1, "hi": 2, "score": 12,
         "source_author": "Homer", "source_work": "001"},
        {"column": "985a", "lo": 20, "hi": 21, "score": 12,
         "source_author": "Homer", "source_work": "001"},
    ]
    kept = dedup_clusters(rows, min_score=10)
    spans = sorted((r["lo"], r["hi"]) for r in kept)
    assert spans == [(1, 2), (20, 21)]


def test_extension_ends_at_last_exact_match():
    # Six exact matches earn one error; a trailing mismatch must not stay.
    ari = list("abcdefX")
    ext = list("abcdefY")
    assert find_runs(ari, ext, n=4) == [(0, 6, 0, 6)]


def test_legal_gap_at_stream_boundary_joins_maximal_run():
    runs = find_runs(list("aaaaaa"), list("aaaaa"), n=4)
    assert (0, 6, 0, 5) in runs


def test_apparatus_hi_small_and_notes_excluded_from_export_text(tmp_path):
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<TEI>
 <text>
  <body>
   <div type="Fragment" n="21">
    <l n="1">πῦρ καὶ ὕδωρ <hi rend="small">ARISTOT. Metaph. A 4. 985a 21</hi> γῆ</l>
    <l n="2">ἄλλα ἔπη <note>cf. ARISTOT. Metaph. 985a21</note> μένει</l>
    <l n="3">ἔτι <bibl>ARISTOT. Metaph. A 4</bibl> ῥήμα</l>
   </div>
  </body>
 </text>
</TEI>
"""
    path = tmp_path / "tlg1342003.xml"
    path.write_text(xml, encoding="utf-8")
    lines = iter_export_lines(path)
    blob = " ".join(row["text"] for row in lines)
    assert "ARISTOT" not in blob
    assert "Metaph" not in blob
    assert "985a" not in blob
    assert "πῦρ καὶ ὕδωρ" in blob
    assert "γῆ" in blob
    assert "ἄλλα ἔπη" in blob
    assert "μένει" in blob
    assert "ἔτι" in blob
    assert "ῥήμα" in blob


def test_frequency_ceiling_marks_hyperfrequent_lemmata_as_function(monkeypatch):
    from aristotle_pipeline.offline import quotation_matching as qm

    monkeypatch.setattr(qm, "_ARISTOTLE_COUNTS", {"ei)mi/": 28269, "u(/dwr": 1003})
    # The copula is grammar at any ceiling; water stays content — it carries
    # the real Empedocles B109 match.
    assert qm.is_function_lemma("ei)mi/")
    assert not qm.is_function_lemma("u(/dwr")
    # Correlative conjunctions come from the static list (287x — under any
    # sane ceiling — yet pure grammar): the Meno 90b false-quote case.
    assert qm.is_function_lemma("ei)/te")
    assert qm.score_run(["ei)/te", "ei)mi/", "ei)/te", "mh/", "ei)mi/", "kai/"]) == 0
