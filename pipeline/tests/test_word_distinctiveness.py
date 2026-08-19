from collections import Counter
from pathlib import Path
from types import SimpleNamespace

import pytest

from aristotle_pipeline.offline.tlg_canon import CONTEMPORARY, STRICT_BEFORE
from aristotle_pipeline.offline import word_distinctiveness
from aristotle_pipeline.offline.word_distinctiveness import (
    CACHE_VERSION,
    aggregate_lemma_counts,
    build_table,
    cached_author_counts,
    derive_label,
    run,
)


@pytest.mark.parametrize(
    ("before", "contemporary", "in_aristotle", "expected"),
    [
        (0, 0, 2, None),
        (0, 0, 3, "coined by Aristotle"),
        (0, 1, 100, None),
        (1, 0, 10, "rare before Aristotle"),
        (4, 0, 10, "rare before Aristotle"),
        (5, 0, 10, None),
    ],
)
def test_label_thresholds(before, contemporary, in_aristotle, expected):
    assert derive_label(before, contemporary, in_aristotle) == expected


def test_counting_aggregation_streams_needed_analyses_and_uses_primary_lemma():
    form_counts = {
        STRICT_BEFORE: Counter({"a)retai/": 2, "lo/goi": 5}),
        CONTEMPORARY: Counter({"a)retai/": 1, "pra/ceis": 4}),
    }
    lines = iter(
        [
            "unused\t{9 9 unused,unused\tunused\tnom sg}\n",
            "a)retai/\t{1 9 a)retai/,a)reth/\tvirtue\tnom pl}"
            "{2 9 a)retai/,lo/gos\tword\tnom pl}\n",
            "lo/goi\t{3 9 lo/goi,lo/gos\tword\tnom pl}\n",
            "pra/ceis\t{4 9 pra/ceis,pra=cis\taction\tacc pl}\n",
        ]
    )

    totals = aggregate_lemma_counts(
        form_counts,
        set(),
        lines,
        {"a)reth/", "lo/gos", "pra=cis"},
    )

    assert totals == {
        "a)reth/": Counter({STRICT_BEFORE: 2, CONTEMPORARY: 1}),
        "lo/gos": Counter({STRICT_BEFORE: 5}),
        "pra=cis": Counter({CONTEMPORARY: 4}),
    }


def test_aggregation_uses_first_analysis_that_resolves_to_lsj():
    totals = aggregate_lemma_counts(
        {STRICT_BEFORE: Counter({"o(/lois": 2})},
        set(),
        [
            "o(/lois\t"
            "{1 9 o(/lois,o(/loc\tjunk\tdat pl}"
            "{2 9 o(/lois,o(/los\twhole\tdat pl}\n"
        ],
        {"o(/los"},
    )

    assert totals == {"o(/los": Counter({STRICT_BEFORE: 2})}


def test_aggregation_keeps_first_analysis_when_both_resolve():
    totals = aggregate_lemma_counts(
        {CONTEMPORARY: Counter({"form": 3})},
        set(),
        [
            "form\t"
            "{1 9 form,first\tfirst\tnom sg}"
            "{2 9 form,second\tsecond\tnom sg}\n"
        ],
        {"first", "second"},
    )

    assert totals == {"first": Counter({CONTEMPORARY: 3})}


def test_aggregation_drops_form_when_no_analysis_resolves():
    totals = aggregate_lemma_counts(
        {STRICT_BEFORE: Counter({"form": 4})},
        set(),
        [
            "form\t"
            "{1 9 form,junk-one\tjunk\tnom sg}"
            "{2 9 form,junk-two\tjunk\tnom sg}\n"
        ],
        {"known"},
    )

    assert totals == {}


def test_count_cache_filename_is_versioned_and_ignores_legacy_cache(tmp_path, monkeypatch):
    legacy = tmp_path / "0001.json"
    legacy.write_text('{"counts":{"stale":99},"capitalized":[]}', encoding="utf-8")
    calls = []

    def fake_count(paths):
        calls.append(list(paths))
        return Counter({"fresh": 2}), {"fresh"}

    monkeypatch.setattr(word_distinctiveness, "count_exported_tokens", fake_count)

    counts, capitalized = cached_author_counts("0001", [Path("work.xml")], tmp_path)

    assert counts == Counter({"fresh": 2})
    assert capitalized == {"fresh"}
    assert calls == [[Path("work.xml")]]
    assert (tmp_path / f"0001.v{CACHE_VERSION}.json").is_file()


def test_limit_run_writes_smoke_output_not_canonical(tmp_path, monkeypatch):
    canonical = tmp_path / "word_distinctiveness.json"
    smoke = tmp_path / "word_distinctiveness.smoke.json"
    canonical.write_text("full table\n", encoding="utf-8")
    analyses_dir = tmp_path / "diogenes-data"
    analyses_dir.mkdir()
    (analyses_dir / "greek-analyses.txt").write_text("", encoding="utf-8")
    canon = tmp_path / "canon.bin"
    canon.write_bytes(b"")
    manifest = SimpleNamespace(
        diogenes_server=lambda: tmp_path,
        tlg_dir=lambda: tmp_path,
        diogenes_data=lambda: analyses_dir,
    )

    monkeypatch.setattr(
        word_distinctiveness,
        "parse_canon",
        lambda data: {"0001": {"name": "EARLY", "bucket": STRICT_BEFORE}},
    )
    monkeypatch.setattr(word_distinctiveness, "export_author", lambda *args: [])
    monkeypatch.setattr(
        word_distinctiveness,
        "cached_author_counts",
        lambda *args: (Counter(), set()),
    )
    monkeypatch.setattr(
        word_distinctiveness,
        "load_lemma_inputs",
        lambda path: ({"lemma"}, {"lemma": 3}),
    )
    monkeypatch.setattr(word_distinctiveness, "OUTPUT_PATH", canonical)
    monkeypatch.setattr(word_distinctiveness, "SMOKE_OUTPUT_PATH", smoke)

    written = run(canon, manifest, limit=1)

    assert written == smoke
    assert smoke.is_file()
    assert canonical.read_text(encoding="utf-8") == "full table\n"


def test_explicit_output_overrides_limit_smoke_path(tmp_path, monkeypatch):
    custom = tmp_path / "custom.json"
    canon = tmp_path / "canon.bin"
    canon.write_bytes(b"")
    monkeypatch.setattr(word_distinctiveness, "parse_canon", lambda data: {})
    analyses_dir = tmp_path / "diogenes-data"
    analyses_dir.mkdir()
    (analyses_dir / "greek-analyses.txt").write_text("", encoding="utf-8")
    manifest = SimpleNamespace(diogenes_data=lambda: analyses_dir)
    monkeypatch.setattr(
        word_distinctiveness,
        "load_lemma_inputs",
        lambda path: ({"lemma"}, {"lemma": 3}),
    )

    written = run(canon, manifest, limit=1, output_path=custom)

    assert written == custom
    assert custom.is_file()


def test_build_table_uses_aristotle_counts_and_lsj_intersection():
    table = build_table(
        {"a)reth/", "lo/gos", "external"},
        {"a)reth/": 3, "lo/gos": 20, "raw-fallback": 7},
        {
            "a)reth/": Counter(),
            "lo/gos": Counter({STRICT_BEFORE: 4}),
            "external": Counter({STRICT_BEFORE: 1}),
        },
    )

    assert list(table) == ["a)reth/", "lo/gos"]
    assert table["a)reth/"] == {
        "in_aristotle": 3,
        "before_aristotle": 0,
        "contemporary": 0,
        "label": "coined by Aristotle",
    }
    assert table["lo/gos"]["label"] == "rare before Aristotle"
