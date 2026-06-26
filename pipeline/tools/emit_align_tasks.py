"""Emit per-chapter sentence-alignment tasks for an LLM bead aligner/verifier.

Writes build/align/interp_tasks/<WORK>/1-<chapter>.json =
  { "chapter": <n>,
    "greek":   [{"i": 0, "text": "<soft-segmented Greek clause>"}, ...],
    "english": [{"j": 0, "text": "<fine-segmented English unit>"}, ...] }

An agent reads it and returns the monotonic bead grouping (which Greek clauses go
with which English units), written to build/align/interp_out/<WORK>/1-<chapter>.json
= { "beads": [ {"g": [i,...], "e": [j,...]}, ... ] }.

Read-only emit (writes only the gitignored build/ task dir).
Usage:  uv run python tools/emit_align_tasks.py --work Cat [--trans edghill] [--chapters 1]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import sentence_interp as si
from sentence_spike import segment_greek
from aristotle_pipeline.align.glossing import chapter_lines


def main(work_id: str, vid: str, chapters, examples: bool = False):
    man = si.Manifest.for_work(work_id).data["english"]
    slot = {man[s]["id"]: s for s in ("primary", "secondary", "third") if man.get(s)}
    _id, prose, _anc = si.load_translation(work_id, slot[vid])
    out = si.BUILD_DIR / "align" / "interp_tasks" / work_id
    out.mkdir(parents=True, exist_ok=True)

    gch = {ch.chapter: ch.lines for ch in chapter_lines()}
    n = 0
    for chap, lines in gch.items():
        if chapters and chap not in chapters:
            continue
        if (1, chap) not in prose:
            continue
        gsents, _ls, _l2s = segment_greek(lines, {}, soft=True, examples=examples)
        esents, _starts = si.eng_sentences(prose[(1, chap)], fine=True)
        task = {
            "chapter": chap,
            "greek": [{"i": i, "text": s.text} for i, s in enumerate(gsents)],
            "english": [{"j": j, "text": t} for j, (_o, t) in enumerate(esents)],
        }
        (out / f"1-{chap}.json").write_text(
            json.dumps(task, ensure_ascii=False, indent=1), encoding="utf-8")
        n += 1
    print(f"{work_id}/{vid}: wrote {n} align-task files -> {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="Cat")
    ap.add_argument("--trans", default="edghill")
    ap.add_argument("--chapters", default="")
    ap.add_argument("--examples", action="store_true", help="split Greek before comma-bound οἷον")
    a = ap.parse_args()
    chs = [int(x) for x in a.chapters.split(",") if x] if a.chapters else None
    main(a.work, a.trans, chs, a.examples)
