"""verify_to_offsets folds each chapter's verify answer into overrides. It
merged into whatever the overrides file held from earlier runs, so a chapter
whose new answer was missing (a failed batch request: fetch deletes the slot)
kept the old run's placements, and pass 2 marked them confirmed (Codex). Each
chapter's overrides now come only from its current answer, and a gathered
chapter with no answer is named and fails the run."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from aristotle_pipeline.align.reference import default_target

PIPELINE = Path(__file__).resolve().parents[1]


def run_fold(tmp: Path):
    tools = tmp / "pipeline" / "tools"
    tools.mkdir(parents=True)
    shutil.copy(PIPELINE / "tools" / "verify_to_offsets.py", tools)
    (tmp / "pipeline" / "aristotle_pipeline").symlink_to(PIPELINE / "aristotle_pipeline")
    env = {**{k: v for k, v in os.environ.items() if k != "ALIGN_SLOT"}, "WORK": "Long"}
    return subprocess.run([sys.executable, str(tools / "verify_to_offsets.py"), "1"],
                          capture_output=True, text=True, env=env, timeout=120)


def test_a_chapter_without_an_answer_keeps_no_stale_overrides(tmp_path):
    vid, prose = default_target("Long")
    align = tmp_path / "build" / "align"
    (align / "verify_out" / "Long").mkdir(parents=True)
    (align / f"verify_meta_Long.json").write_text(json.dumps({
        "1:1|464b20": {"a_offset": 0}, "1:2|465a5": {"a_offset": 0}}))
    (align / f"Long_{vid}_gloss_overrides.json").write_text(json.dumps({
        "1:1": {"464b20": 999999, "464b25": 888888}, "1:2": {"465a5": 12345}}))
    phrase = prose[(1, 1)][200:245]
    (align / "verify_out" / "Long" / "1-1.json").write_text(json.dumps(
        {"chapter": "1:1", "ticks": [{"citation": "464b20", "verdict": "ok", "phrase": phrase}]}))
    r = run_fold(tmp_path)
    ovr = json.loads((align / f"Long_{vid}_gloss_overrides.json").read_text())
    assert ovr["1:1"] == {"464b20": prose[(1, 1)].index(phrase)}   # stale 464b25 gone too
    assert "1:2" not in ovr
    assert r.returncode != 0 and "1:2" in r.stderr
