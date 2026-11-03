"""ALIGN_SLOT is for the aligner tools. Left exported, it would reach stage1's
own default_target calls (EN, Meta, Pol: it raises there, but not saying why);
the pipeline CLI refuses to start instead."""
import pytest

from aristotle_pipeline.__main__ import main


def test_pipeline_refuses_to_run_with_align_slot_set(monkeypatch):
    monkeypatch.setenv("ALIGN_SLOT", "primary")
    with pytest.raises(SystemExit, match="ALIGN_SLOT"):
        main(["stage1", "--work", "EN"])
