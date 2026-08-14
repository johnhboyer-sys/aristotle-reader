"""A work must never emit another translator's chapter titles.

build/stage1 is scratch SHARED by every work, and build-public.mjs cleans
build/dist and app/dist but NOT build/stage1 — so third_titles.json written by
the last work that had them is still on disk when the next work is emitted.
stage7 already gated the read on "does this manifest declare a third
translation", which is not enough: a work with a third translation of its OWN
(Posterior Analytics has Owen) passes that gate and copies whatever titles the
scratch happens to hold. The 2026-08-13 full rebuild shipped Ostwald's Ethics
titles into data/APo/third-titles.json that way.

The file is keyed {transId: {book: {chapter: title}}}, so it can say whose
titles it holds. The gate is that key matching the manifest's third id.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline import stage7_emit  # noqa: E402

OSTWALD_TITLES = {"ostwald": {"1": {"1": "The good as the aim of action"}}}


def _emit(tmp_path, third_id, scratch_titles):
    """Run the titles step alone against a fake stage1 scratch dir."""
    stage1 = tmp_path / "stage1"
    stage1.mkdir(parents=True)
    (stage1 / "third_titles.json").write_text(
        json.dumps(scratch_titles), encoding="utf-8"
    )
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    third = {"id": third_id} if third_id else None
    stage7_emit.emit_third_titles(
        build_dir=tmp_path,
        out_dir=out_dir,
        third=third,
    )
    out = out_dir / "third-titles.json"
    return json.loads(out.read_text(encoding="utf-8")) if out.exists() else None


def test_titles_from_another_translator_are_not_emitted(tmp_path):
    # Posterior Analytics: has a third translation (Owen), but the scratch
    # holds the Ethics' Ostwald titles left by an earlier work.
    assert _emit(tmp_path, "owen", OSTWALD_TITLES) is None


def test_the_translators_own_titles_are_emitted(tmp_path):
    assert _emit(tmp_path, "ostwald", OSTWALD_TITLES) == OSTWALD_TITLES


def test_no_third_translation_emits_nothing(tmp_path):
    assert _emit(tmp_path, None, OSTWALD_TITLES) is None


def test_only_the_matching_translator_survives_a_mixed_file(tmp_path):
    mixed = dict(OSTWALD_TITLES)
    mixed["owen"] = {"1": {"1": "Of the necessity of pre-existent knowledge"}}
    assert _emit(tmp_path, "owen", mixed) == {"owen": mixed["owen"]}


def test_a_stale_file_from_a_previous_build_is_removed(tmp_path):
    stage1 = tmp_path / "stage1"
    stage1.mkdir(parents=True)
    (stage1 / "third_titles.json").write_text(
        json.dumps(OSTWALD_TITLES), encoding="utf-8"
    )
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    stale = out_dir / "third-titles.json"
    stale.write_text(json.dumps(OSTWALD_TITLES), encoding="utf-8")

    stage7_emit.emit_third_titles(
        build_dir=tmp_path, out_dir=out_dir, third={"id": "owen"}
    )

    assert not stale.exists()
