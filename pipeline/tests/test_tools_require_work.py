"""verify_gather, verify_to_offsets and persist_book act on the work named by
WORK. They defaulted to EN, so a forgotten WORK= gathered or folded EN's ticks
and persist_book overwrote EN's tracked results, all without an error. Each
must now refuse to start. (Run as copies under a temp root: their outputs hang
off the script's own path, so an unfixed copy writes only there.)"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("tool", ["verify_gather", "verify_to_offsets", "persist_book"])
def test_refuses_to_run_without_work(tmp_path, tool):
    tools = tmp_path / "pipeline" / "tools"
    tools.mkdir(parents=True)
    shutil.copy(PIPELINE / "tools" / f"{tool}.py", tools)
    (tmp_path / "pipeline" / "aristotle_pipeline").symlink_to(PIPELINE / "aristotle_pipeline")
    env = {k: v for k, v in os.environ.items() if k not in ("WORK", "ALIGN_SLOT")}
    r = subprocess.run([sys.executable, str(tools / f"{tool}.py"), "1"],
                       capture_output=True, text=True, env=env, timeout=120)
    assert r.returncode != 0
    assert "WORK" in r.stderr.splitlines()[-1]
    assert not (tmp_path / "alignment-results").exists()
