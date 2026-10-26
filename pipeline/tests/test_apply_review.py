"""tools/apply_review.py turns the review pages' JSON exports into John's
committed rulings. Run as a copy under a temp root (its outputs hang off the
script's own path) against Long's real map and text."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from aristotle_pipeline.align.reference import default_target

PIPELINE = Path(__file__).resolve().parents[1]
REPO = PIPELINE.parent


def setup(tmp: Path):
    tools = tmp / "pipeline" / "tools"
    tools.mkdir(parents=True)
    shutil.copy(PIPELINE / "tools" / "apply_review.py", tools)
    (tmp / "pipeline" / "aristotle_pipeline").symlink_to(PIPELINE / "aristotle_pipeline")
    res = tmp / "alignment-results" / "ross"
    res.mkdir(parents=True)
    shutil.copy(REPO / "alignment-results/ross/Long_ross_gloss_map.json", res)
    return tools / "apply_review.py", res / "rulings" / "Long.json"


def run(script, *exports):
    env = {k: v for k, v in os.environ.items() if k != "ALIGN_SLOT"}
    return subprocess.run([sys.executable, str(script), "Long", *map(str, exports)],
                          capture_output=True, text=True, env=env, timeout=120)


def test_an_export_becomes_rulings(tmp_path):
    script, rulings = setup(tmp_path)
    text = default_target("Long")[1][(1, 1)]
    clicked = text[393 + 30: 393 + 110]          # John clicked a word 30 chars on
    export = tmp_path / "review-Long-ross-book01.json"
    export.write_text(json.dumps({"464b25": {"verdict": "late", "phrase": clicked},
                                  "464b30": {"verdict": "ok"},
                                  "465a5": {"verdict": "early"}}))
    r = run(script, export)
    assert r.returncode == 0, r.stderr
    got = json.loads(rulings.read_text())["1:1"]
    assert got["464b25"]["phrase"] == clicked and got["464b25"]["near"] == 423
    assert got["464b30"]["verdict"] == "ok" and text[726:].startswith(got["464b30"]["phrase"])
    assert got["465a5"] == {"verdict": "early", "export": export.name}
    assert "465a5" in r.stdout                   # named as still needing a place
    seed = json.loads((tmp_path / "build/align/Long_ross_gloss_overrides.json").read_text())
    assert seed["1:1"]["464b20"] == 70           # the shipped placements, for pass 2


def test_a_chapter_start_tick_cannot_be_ruled(tmp_path):
    script, rulings = setup(tmp_path)
    export = tmp_path / "review-Long-ross-book01.json"
    export.write_text(json.dumps({"464b19": {"verdict": "late", "phrase": "anything"}}))
    r = run(script, export)
    assert r.returncode != 0 and "464b19" in r.stderr
    assert not rulings.exists()


def test_an_export_for_another_work_is_refused(tmp_path):
    script, rulings = setup(tmp_path)
    export = tmp_path / "review-EN-ross-book01.json"
    export.write_text(json.dumps({"1094a5": {"verdict": "ok"}}))
    r = run(script, export)
    assert r.returncode != 0 and not rulings.exists()


def test_a_click_outside_the_passage_the_page_showed_is_refused(tmp_path):
    script, rulings = setup(tmp_path)
    text = default_target("Long")[1][(1, 1)]
    export = tmp_path / "review-Long-ross-book01.json"
    # 464b20 sits at 70; its page showed text[0:620]. A phrase from the chapter's
    # end cannot have been clicked there.
    export.write_text(json.dumps({"464b20": {"verdict": "late", "phrase": text[-90:-10]}}))
    r = run(script, export)
    assert r.returncode != 0 and "464b20" in r.stderr and not rulings.exists()
