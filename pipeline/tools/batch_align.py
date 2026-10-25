"""Run the gloss aligner's two model steps through the Message Batches API.

The recipe (docs/gloss-aligner-recipe.md) ran §2 (gloss) and §4/§5b (verify)
as Claude Code sub-agents. This sends the same prompts by batch and writes the
results where the recipe's own tools read them:
  gloss  -> build/align/glosses/<WORK>/<b>-<c>.json      ({citation: english})
  verify -> build/align/verify_out/<WORK>/<b>-<c>.json   ({chapter, ticks:[...]})
Every other step (align, verify_gather, verify_to_offsets, persist_book, ...)
is unchanged. Models follow the 2026-10-25 test (PR #168): Haiku glosses,
Opus verifies.

  uv run --with anthropic python tools/batch_align.py gloss Cael           # build/stage1 = Cael
  uv run --with anthropic python tools/batch_align.py verify Cael 1 2 3 4  # after verify_gather
  uv run --with anthropic python tools/batch_align.py verify Cael 1 --correction
  uv run --with anthropic python tools/batch_align.py fetch <batch_id>
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from model_test import GLOSS_SCHEMA, MODELS, PRICE, VERIFY_SCHEMA, gloss_prompt, verify_prompt

ALIGN = REPO / "build/align"
BATCHES = ALIGN / "batches"
EFFORT = "high"
MAX_TOKENS = 100000   # Haiku thinks long; 32k cut off long chapters in the test


def translator(work: str) -> str:
    """Name of the translation default_target aligns (the one verify judges)."""
    from aristotle_pipeline.align.reference import default_target
    from aristotle_pipeline.config import Manifest
    vid, _ = default_target(work)
    data = Manifest.for_work(work).data
    eng = data.get("english") or {}
    for slot in ("primary", "secondary"):
        if (eng.get(slot) or {}).get("id") == vid:
            return eng[slot].get("name") or data["work"]["english_translation"]
    sys.exit(f"{work}: no english slot has id {vid!r}")


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def gloss_requests(work: str, model: str, books) -> tuple[list, dict]:
    from aristotle_pipeline.align.glossing import chapter_lines, tick_windows
    from aristotle_pipeline.config import Manifest
    spine = json.loads((REPO / "build/stage1/greek_spine.json").read_text(encoding="utf-8"))
    if spine.get("work") != work:
        sys.exit(f"build/stage1 holds {spine.get('work')!r}, not {work}: run stage1 --work {work}")
    title = Manifest.for_work(work).data["work"]["title"]
    reqs, receipt = [], {}
    for ch in chapter_lines(books):
        windows = tick_windows(ch)
        if not windows:
            continue
        task = {"book": ch.book, "chapter": ch.chapter,
                "lines": [{"citation": ln.citation, "greek": ln.text} for ln in ch.lines],
                "windows": [{"tick": w.tick, "is_column_start": w.is_column_start,
                             "lines": [ln.citation for ln in w.lines]} for w in windows]}
        cid = f"g-{model}-{work}-{ch.book}-{ch.chapter}"
        prompt = gloss_prompt(title, task)
        reqs.append((cid, prompt, GLOSS_SCHEMA))
        receipt[cid] = {"kind": "gloss", "work": work, "book": ch.book, "chapter": ch.chapter,
                        "model": model}
    return reqs, receipt


def verify_requests(work: str, model: str, books, correction: bool) -> tuple[list, dict]:
    name = translator(work)
    reqs, receipt = [], {}
    for b in books:
        files = sorted((ALIGN / "verify_tasks" / work).glob(f"{b}-*.json"),
                       key=lambda p: int(p.stem.split("-")[1]))
        if not files:
            sys.exit(f"no verify tasks for {work} book {b}: run verify_gather first")
        for f in files:
            raw = f.read_text(encoding="utf-8")
            task = json.loads(raw)
            if "text" not in task:
                sys.exit(f"{f}: no chapter text — gather with VERIFY_ALL=1")
            cp = int(f.stem.split("-")[1])
            cid = f"v-{model}-{work}-{b}-{cp}"
            reqs.append((cid, verify_prompt(name, task), VERIFY_SCHEMA))
            # the task hash lets fetch refuse answers to a task that was re-gathered since
            receipt[cid] = {"kind": "verify", "work": work, "book": b, "chapter": cp,
                            "model": model, "correction": correction, "task_sha": sha(raw)}
    return reqs, receipt


def submit(reqs: list, receipt: dict, model: str) -> None:
    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    batch = anthropic.Anthropic().messages.batches.create(requests=[
        Request(custom_id=cid, params=MessageCreateParamsNonStreaming(
            model=MODELS[model], max_tokens=MAX_TOKENS,
            output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": prompt}]))
        for cid, prompt, schema in reqs])
    BATCHES.mkdir(parents=True, exist_ok=True)
    (BATCHES / f"{batch.id}.json").write_text(json.dumps(
        {"id": batch.id, "requests": receipt}, indent=1))
    print(f"batch {batch.id}: {len(reqs)} requests")


def merge_verify(path: Path, data: dict) -> dict:
    """Correction pass: overwrite only the re-judged ticks (recipe §5b)."""
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"ticks": []}
    new = {t["citation"]: t for t in data["ticks"]}
    ticks = [new.pop(t["citation"], t) for t in old.get("ticks", [])] + list(new.values())
    return {"chapter": data.get("chapter", old.get("chapter")), "ticks": ticks}


def fetch(batch_id: str) -> None:
    import anthropic
    rec_path = BATCHES / f"{batch_id}.json"
    rec = json.loads(rec_path.read_text())
    if rec.get("fetched"):
        sys.exit(f"{batch_id} already fetched")
    client = anthropic.Anthropic()
    b = client.messages.batches.retrieve(batch_id)
    if b.processing_status != "ended":
        print(f"{batch_id}: {b.processing_status} {b.request_counts}")
        return
    fails, usage, written = [], {}, 0
    for r in client.messages.batches.results(batch_id):
        meta = rec["requests"][r.custom_id]
        work, bk, cp = meta["work"], meta["book"], meta["chapter"]
        sub = "glosses" if meta["kind"] == "gloss" else "verify_out"
        out = ALIGN / sub / work / f"{bk}-{cp}.json"
        correction = meta.get("correction")
        if not correction:
            # a failure must leave the chapter missing, never an older answer
            out.unlink(missing_ok=True)
        if meta["kind"] == "verify":
            task = ALIGN / "verify_tasks" / work / f"{bk}-{cp}.json"
            if not task.exists() or sha(task.read_text(encoding="utf-8")) != meta["task_sha"]:
                fails.append(f"{r.custom_id}: task re-gathered since submit, answer dropped")
                continue
        if r.result.type != "succeeded":
            fails.append(f"{r.custom_id}: {r.result.type}")
            continue
        m = r.result.message
        u = usage.setdefault(meta["model"], {"input": 0, "output": 0})
        u["input"] += m.usage.input_tokens
        u["output"] += m.usage.output_tokens
        if m.stop_reason != "end_turn":
            fails.append(f"{r.custom_id}: stop_reason {m.stop_reason}")
            continue
        data = json.loads(next(blk.text for blk in m.content if blk.type == "text"))
        if meta["kind"] == "gloss":
            data = {ln["citation"]: ln["english"] for ln in data["lines"]}
        elif correction:
            data = merge_verify(out, data)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        written += 1
    dollars = {t: round((u["input"] * PRICE[t][0] + u["output"] * PRICE[t][1]) / 1e6 / 2, 4)
               for t, u in usage.items()}
    rec["fetched"] = {"written": written, "usage": usage, "dollars": dollars, "failures": fails}
    rec_path.write_text(json.dumps(rec, indent=1))
    print(json.dumps(rec["fetched"], indent=1))
    if fails:
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("gloss"); a.add_argument("work")
    a.add_argument("--books", default=""); a.add_argument("--model", default="haiku")
    a = sub.add_parser("verify"); a.add_argument("work"); a.add_argument("books", nargs="+", type=int)
    a.add_argument("--model", default="opus"); a.add_argument("--correction", action="store_true")
    a = sub.add_parser("fetch"); a.add_argument("batch_id")
    args = p.parse_args()
    if args.cmd == "gloss":
        books = [int(x) for x in args.books.split(",") if x] or None
        reqs, receipt = gloss_requests(args.work, args.model, books)
        submit(reqs, receipt, args.model)
    elif args.cmd == "verify":
        reqs, receipt = verify_requests(args.work, args.model, args.books, args.correction)
        submit(reqs, receipt, args.model)
    else:
        fetch(args.batch_id)


if __name__ == "__main__":
    main()
