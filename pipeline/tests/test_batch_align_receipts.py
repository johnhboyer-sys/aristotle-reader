"""batch_align verifies by the bulk rule. A verify receipt that does not say so
predates that, and fetching it would write first-word answers over bulk ones in
the same verify_out slots (Codex), so fetch refuses it."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import batch_align as ba  # noqa: E402


def test_a_verify_receipt_without_the_bulk_rule_is_refused():
    meta = {"kind": "verify", "work": "Cael", "book": 1, "chapter": 1,
            "model": "opus", "task_sha": "x", "hash": "json"}
    with pytest.raises(SystemExit, match="bulk"):
        ba.current(meta)


def test_gloss_receipts_need_no_rule():
    assert ba.current({"kind": "gloss", "work": "Cael", "book": 1, "chapter": 1})


def test_a_new_verify_receipt_carries_the_bulk_rule_and_fetch_accepts_it(tmp_path, monkeypatch):
    # Codex: without this, dropping "rule" from verify_requests passes the tests
    # above while fetch refuses every new batch.
    tasks = tmp_path / "verify_tasks" / "Cael"
    tasks.mkdir(parents=True)
    (tasks / "1-1.json").write_text(json.dumps({"book": 1, "chapter": 1, "text": "x", "ticks": []}))
    monkeypatch.setattr(ba, "ALIGN", tmp_path)
    monkeypatch.setattr(ba, "translator", lambda work: "J. L. Stocks")
    _reqs, receipt = ba.verify_requests("Cael", "opus", [1])
    (meta,) = receipt.values()
    assert meta["rule"] == "bulk"
    assert ba.current(meta) is True
