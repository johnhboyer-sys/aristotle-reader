"""Emit per-SENTENCE Greek gloss tasks (one full Greek sentence per item), so a
sub-agent writes one coherent English gloss per sentence — the complete fingerprint
the interpolation aligner wants (vs the sparse per-tick-line glosses).

Writes build/align/sent_gloss_tasks/<WORK>/1-<chapter>.json =
  [{ "index": <sentence index in chapter>, "bekker": "<first line citation>",
     "greek": "<full Greek sentence text>" }, ...]

Agents then write build/align/sent_glosses/<WORK>/1-<chapter>.json = {index: english}.
Read-only emit (writes only the gitignored build/align task dir).

Usage:  uv run python tools/emit_sent_gloss_tasks.py --work Cat
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aristotle_pipeline.align.glossing import chapter_lines
from aristotle_pipeline.config import BUILD_DIR
from sentence_spike import segment_greek


def main(work_id: str, batch_size: int | None = None):
    out = BUILD_DIR / "align" / "sent_gloss_tasks" / work_id
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    files = 0
    for ch in chapter_lines():
        gsents, _ls, _l2s = segment_greek(ch.lines, {}, soft=False)
        items = [{"index": i, "bekker": s.lines[0], "greek": s.text}
                 for i, s in enumerate(gsents)]
        if batch_size and batch_size > 0:
            for batch_num, start in enumerate(range(0, len(items), batch_size), start=1):
                batch_items = items[start:start + batch_size]
                path = out / f"1-{ch.chapter}-batch-{batch_num}.json"
                path.write_text(
                    json.dumps(batch_items, ensure_ascii=False, indent=1), encoding="utf-8")
                files += 1
        else:
            (out / f"1-{ch.chapter}.json").write_text(
                json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
            files += 1
        total += len(items)
    print(f"{work_id}: wrote {files} sentence-gloss task file(s), {total} sentences -> {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="Cat")
    ap.add_argument("--batch-size", type=int, default=0,
                    help="If >0, split each chapter into numbered batch files")
    a = ap.parse_args()
    main(a.work, a.batch_size)
