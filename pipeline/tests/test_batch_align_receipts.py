"""batch_align verifies by the bulk rule. A verify receipt that does not say so
predates that, and fetching it would write first-word answers over bulk ones in
the same verify_out slots (Codex), so fetch refuses it."""
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
