"""Model test: Haiku 5.5 vs Sonnet 5.5 vs Opus 5.5 on the gloss aligner's two
model steps (gloss, verify), run through the Message Batches API.

Gold = a Bekker-milestoned Perseus English (Rackham for EN, Freese for Rhet),
treated as unmarked: each model's output is aligned onto that prose and scored
against the translation's own printed ticks (column starts + ~line 20).

Everything a model sees or is scored against is frozen into a fixture first, so
later steps don't depend on which work build/stage1 currently holds.

  uv run python tools/model_test.py prepare EN 1          # after `stage1 --work EN`
  uv run --with anthropic python tools/model_test.py submit gloss
  uv run --with anthropic python tools/model_test.py fetch <batch_id>
  uv run python tools/model_test.py score-gloss
  uv run --with anthropic python tools/model_test.py submit verify --source sonnet
  uv run --with anthropic python tools/model_test.py fetch <batch_id>
  uv run python tools/model_test.py score-verify --source sonnet
"""
import argparse
import json
import re
import statistics
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))

from aristotle_pipeline.align.aligner import align_chapter, split_sentences
from aristotle_pipeline.align.eval import gold_sentence_start
from aristotle_pipeline.align.reference import ChapterRef, GreekLine, RefAnchor

OUT = REPO / "build/align/model_test"
FIX = OUT / "fixtures"
MODELS = {"haiku": "claude-haiku-5-5", "sonnet": "claude-sonnet-5-5", "opus": "claude-opus-5-5"}
# $/MTok (input, output) at standard rates; the Batches API bills half.
PRICE = {"haiku": (0.10, 0.50), "sonnet": (2.00, 10.00), "opus": (4.00, 20.00)}
EFFORT = "high"
WORKS = {"EN": ("Nicomachean Ethics", "H. Rackham"), "Rhet": ("Rhetoric", "J. H. Freese")}


# ---- fixtures -------------------------------------------------------------
def prepare(work: str, book: int) -> None:
    from aristotle_pipeline.align.glossing import chapter_lines, tick_windows
    from aristotle_pipeline.align.reference import load_chapters
    spine = json.loads((REPO / "build/stage1/greek_spine.json").read_text(encoding="utf-8"))
    if spine.get("work") != work:
        sys.exit(f"build/stage1 holds {spine.get('work')!r}, not {work}: run stage1 --work {work}")
    # load_chapters only uses the target prose to choose chapters; the milestoned
    # English itself is the text we score on, so every chapter is wanted.
    greek_chapters = chapter_lines([book])
    mile = {(c.book, int(c.chapter)): c
            for c in load_chapters({(ch.book, ch.chapter): "-" for ch in greek_chapters})}
    chapters, skipped = [], []
    for ch in greek_chapters:
        mc = mile.get((ch.book, ch.chapter))
        if mc is None or not ch.lines:
            skipped.append(ch.chapter)
            continue
        chapters.append({
            "book": ch.book, "chapter": ch.chapter,
            "lines": [{"citation": ln.citation, "greek": ln.text} for ln in ch.lines],
            "windows": [{"tick": w.tick, "is_column_start": w.is_column_start,
                         "lines": [ln.citation for ln in w.lines]} for w in tick_windows(ch)],
            "text": mc.ref_text,
            "gold": [{"citation": a.citation, "off": a.off, "tier": a.tier}
                     for a in mc.ref_anchors if a.tier != "chapter"],
        })
    ticks = {w["tick"] for c in chapters for w in c["windows"]}
    gold = [g for c in chapters for g in c["gold"]]
    scorable = [g for g in gold if g["citation"] in ticks]
    if not scorable:
        sys.exit("no gold tick falls on a glossed tick: nothing could be scored")
    FIX.mkdir(parents=True, exist_ok=True)
    name = f"{work}-{book}"
    (FIX / f"{name}.json").write_text(json.dumps(
        {"work": work, "book": book, "chapters": chapters}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"{name}: {len(chapters)} chapters (skipped {skipped}), {len(ticks)} tick windows, "
          f"{len(gold)} gold ticks, {len(scorable)} on a glossed tick")


def fixtures() -> list[dict]:
    fx = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(FIX.glob("*.json"))]
    if not fx:
        sys.exit("no fixtures: run prepare first")
    return fx


# ---- prompts --------------------------------------------------------------
GLOSS_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["lines"],
    "properties": {"lines": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["citation", "english"],
        "properties": {"citation": {"type": "string"}, "english": {"type": "string"}}}}}}

VERIFY_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["chapter", "ticks"],
    "properties": {"chapter": {"type": "string"}, "ticks": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["citation", "verdict", "phrase"],
        "properties": {"citation": {"type": "string"},
                       "verdict": {"enum": ["ok", "early", "late", "unsure"]},
                       "phrase": {"type": "string"}}}}}}


def gloss_prompt(fx: dict, ch: dict) -> str:
    greek = {ln["citation"]: ln["greek"] for ln in ch["lines"]}
    task = [{"tick": w["tick"], "is_column_start": w["is_column_start"],
             "lines": [{"citation": c, "greek": greek[c]} for c in w["lines"]]}
            for w in ch["windows"]]
    title = WORKS[fx["work"]][0]
    return f"""Translate ancient Greek (Aristotle, {title}, Book {ch['book']}, ch {ch['chapter']}) for a Bekker-line alignment tool. Precise and faithful — a scholar with good Greek checks this.
- The task below is a list of windows, each `lines` = {{citation, greek}} (line above the tick / tick line / line below; edge windows have 2). Use neighbours only to get a mid-sentence line's sense right.
- Output ONE English line per Greek line, keyed by its citation — verse mode, on its own line even if longer. Each citation appears once; do not merge, reorder, annotate.
- Each English line MUST BEGIN with the rendering of its Greek line's FIRST word. Don't pull a line's opening word up into the previous line or borrow the next line's; boundaries coincide with the Greek even if a line then starts mid-clause (Greek opens διαφέρειν → English starts "differ…"). The verifier anchors on this — a shifted boundary becomes a mis-placed tick.
- Standard scholarly terms, used consistently: ἀρετή=virtue, εὐδαιμονία=happiness, ἔργον=function, ἐνέργεια=activity, ἕξις=state, τέλος=end, λόγος=reason/account, προαίρεσις=choice, τέχνη=art, πρᾶξις=action. Proper names stay names (Καλλίας→Callias).
- Return every citation in the task once, as {{citation, english}} in the `lines` array.

Task:
{json.dumps(task, ensure_ascii=False, indent=1)}"""


def verify_prompt(fx: dict, task: dict) -> str:
    translator = WORKS[fx["work"]][1]
    return f"""Strict Greek-to-English alignment judge. Check Bekker line-marks in {translator}'s translation against the GREEK — the Greek is authoritative, the gloss is only a hint.
- The task below has `text` (full chapter prose) + `ticks` in Bekker order, each with `greek_above`/`greek_tick`/`greek_below` (raw Greek of the line before / tick / after), `gloss` (hint), `current_placement` (translation now sitting at the tick).
- For EACH tick, judge whether `current_placement` BEGINS exactly at the English of `greek_tick`'s FIRST word: `ok` = it does; `early` = begins on `greek_above` content (a line too high); `late` = a clause into `greek_tick` or onto `greek_below`; `unsure` = translation condenses/omits `greek_tick`.
- ALWAYS return `phrase`: a 5–10 word verbatim substring copied EXACTLY from `text`, beginning precisely where `greek_tick`'s first word is rendered (an exact search must find it; for `ok` it matches `current_placement`'s start). It must NOT include any `greek_above` rendering and must NOT start as late as `greek_below`.
- Judge by the GREEK, not by which reading sounds smoothest. Example: `greek_tick` opens διαφέρειν → start at the English for "differ", even if the gloss put it on the line above.
- Return every tick, with `chapter` set to the task's chapter. No explanations.

Task:
{json.dumps(task, ensure_ascii=False, indent=1)}"""


# ---- alignment from a fixture --------------------------------------------
def chapter_ref(ch: dict, gloss: dict) -> ChapterRef | None:
    """load_gloss_chapters, but on a fixture chapter and a given gloss dict."""
    if not gloss:
        return None
    lines = ch["lines"]
    chap_cit = lines[0]["citation"]
    anchors = [RefAnchor(chap_cit, 0, "chapter")]
    incipits = [gloss.get(chap_cit, "").strip()]
    parts, base = [], 0
    for w in ch["windows"]:
        if not gloss.get(w["tick"], "").strip() or w["tick"] == chap_cit:
            continue
        fp = " ".join(gloss.get(c, "").strip() for c in w["lines"]).strip()
        anchors.append(RefAnchor(w["tick"], base, "column" if w["is_column_start"] else "five_line"))
        incipits.append(fp)
        parts.append(fp)
        base += len(fp) + 1
    glines, cum = [], 0
    for ln in lines:
        glines.append(GreekLine(ln["citation"], cum))
        cum += len(ln["greek"].split())
    return ChapterRef(ch["book"], str(ch["chapter"]), chap_cit, ch["text"],
                      " ".join(parts), anchors, glines, gloss_incipits=incipits)


def load_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def gloss_dir(source: str) -> Path:
    return OUT / "gloss" / source


def load_gloss(source: str, fx: dict, ch: dict) -> dict:
    if source == "prod":   # the glosses the shipped EN alignment used (4.x era)
        if fx["work"] != "EN":
            return {}
        return load_json(REPO / f"build/align/glosses/EN/{ch['book']}-{ch['chapter']}.json")
    return load_json(gloss_dir(source) / fx["work"] / f"{ch['book']}-{ch['chapter']}.json")


# ---- scoring --------------------------------------------------------------
def skip_space(text: str, off: int) -> int:
    while off < len(text) and text[off].isspace():
        off += 1
    return off


def snap(starts: list[int], off: int) -> int:
    return max((s for s in starts if s <= off), default=starts[0])


def score(placed: dict, fx_list: list[dict]) -> dict:
    """placed: {(work, book, chapter): {citation: offset}}. Scores every gold tick
    that sits on a glossed tick; a gold tick with no placement counts as missing."""
    rows, missing = [], 0
    for fx in fx_list:
        for ch in fx["chapters"]:
            ticks = {w["tick"] for w in ch["windows"]}
            starts = [s for s, _ in split_sentences(ch["text"])] or [0]
            got = placed.get((fx["work"], ch["book"], ch["chapter"]), {})
            for g in ch["gold"]:
                if g["citation"] not in ticks:
                    continue
                if g["citation"] not in got:
                    missing += 1
                    continue
                p = got[g["citation"]]
                gold = gold_sentence_start(ch["text"], starts, g["off"])
                rows.append({"tier": g["tier"], "raw": abs(p - skip_space(ch["text"], g["off"])),
                             "same_sentence": snap(starts, p) == gold})
    if not rows:
        return {"n": 0, "missing": missing}
    # A missing placement counts as wrong: percentages are over every gold tick.
    total = len(rows) + missing
    raw = [r["raw"] for r in rows]
    col = [r for r in rows if r["tier"] == "column"]
    return {"n": len(rows), "missing": missing,
            "same_sentence_pct": round(100 * sum(r["same_sentence"] for r in rows) / total, 1),
            "column_same_sentence_pct": round(100 * sum(r["same_sentence"] for r in col) / len(col), 1) if col else None,
            "within_30_pct": round(100 * sum(e <= 30 for e in raw) / total, 1),
            "median_chars": statistics.median(raw), "mean_chars": round(statistics.mean(raw), 1)}


def pass1(source: str, fx: dict, ch: dict, overrides: dict | None = None):
    cr = chapter_ref(ch, load_gloss(source, fx, ch))
    if cr is None:
        return None, []
    return cr, [a for a in align_chapter(cr, "lexical", overrides) if a.tier in ("column", "five_line")]


def score_gloss(sources: list[str]) -> None:
    fx_list = fixtures()
    for src in sources:
        for fx in fx_list + [None]:
            fl = fx_list if fx is None else [fx]
            placed = {}
            for f in fl:
                for ch in f["chapters"]:
                    _cr, anchors = pass1(src, f, ch)
                    placed[(f["work"], ch["book"], ch["chapter"])] = {a.citation: a.offset for a in anchors}
            label = "ALL" if fx is None else f"{fx['work']}-{fx['book']}"
            print(f"{src:7} {label:7} {json.dumps(score(placed, fl))}")


# ---- verify: tasks, fold, score -------------------------------------------
def verify_task(source: str, fx: dict, ch: dict) -> dict | None:
    cr, anchors = pass1(source, fx, ch)
    if cr is None:
        return None
    greek = {ln["citation"]: ln["greek"] for ln in ch["lines"]}
    wins = {w["tick"]: w["lines"] for w in ch["windows"]}
    gloss = load_gloss(source, fx, ch)
    ticks = []
    for a in anchors:
        cits = wins.get(a.citation, [a.citation])
        ti = cits.index(a.citation) if a.citation in cits else 0
        ticks.append({
            "citation": a.citation,
            "greek_above": greek.get(cits[ti - 1], "") if ti > 0 else "",
            "greek_tick": greek.get(cits[ti], ""),
            "greek_below": greek.get(cits[ti + 1], "") if ti + 1 < len(cits) else "",
            "gloss": (gloss.get(a.citation, "") or "").strip(),
            "current_placement": ch["text"][a.offset:a.offset + 90],
        })
    return {"chapter": f"{ch['book']}:{ch['chapter']}", "ticks": ticks, "text": ch["text"],
            "_pass1": {a.citation: a.offset for a in anchors}}


def cit_key(cit: str):
    m = re.match(r"(\d+)([ab])(\d+)", cit)
    return (int(m.group(1)), m.group(2), int(m.group(3))) if m else (0, "", 0)


def find_from(text, phrase, start):
    words = phrase.split()
    for k in range(len(words), min(len(words), 3) - 1, -1):
        i = text.find(" ".join(words[:k]), start)
        if i != -1:
            return i
    return None


def find_nearest(text, phrase, near):
    words = phrase.split()
    for k in range(len(words), min(len(words), 3) - 1, -1):
        sub = " ".join(words[:k])
        i, best = text.find(sub), None
        while i != -1:
            if best is None or abs(i - near) < abs(best - near):
                best = i
            i = text.find(sub, i + 1)
        if best is not None:
            return best
    return None


def fold(text: str, pass1_off: dict, out: dict) -> tuple[dict, int]:
    """verify_to_offsets for one chapter: phrases → monotonic overrides."""
    phrases = {t["citation"]: t.get("phrase", "") for t in out.get("ticks", [])}
    overrides, cursor, unplaced = {}, 0, 0
    for cit in sorted(pass1_off, key=cit_key):
        phrase = (phrases.get(cit) or "").strip()
        off = find_from(text, phrase, cursor) if phrase else None
        if off is None and phrase:
            off = find_nearest(text, phrase, pass1_off[cit])
        if off is None or off < cursor:
            unplaced += 1
            continue
        overrides[cit] = off
        cursor = off
    return overrides, unplaced


def score_verify(source: str) -> None:
    fx_list = fixtures()
    vdir = OUT / "verify" / source
    base, by_model = {}, {}
    stats = {}
    for fx in fx_list:
        for ch in fx["chapters"]:
            k = (fx["work"], ch["book"], ch["chapter"])
            task = verify_task(source, fx, ch)
            if task is None:
                continue
            sent = load_json(vdir / "tasks" / fx["work"] / f"{ch['book']}-{ch['chapter']}.json")
            if sent != task:
                sys.exit(f"{k}: the inputs changed since the verify batch was sent")
            base[k] = task["_pass1"]
            for tag in MODELS:
                out = load_json(vdir / tag / fx["work"] / f"{ch['book']}-{ch['chapter']}.json")
                st = stats.setdefault(tag, {"chapters_missing": 0, "unplaced": 0, "verdicts": {}})
                if not out:
                    st["chapters_missing"] += 1
                    continue
                for t in out.get("ticks", []):
                    st["verdicts"][t.get("verdict")] = st["verdicts"].get(t.get("verdict"), 0) + 1
                ovr, unplaced = fold(ch["text"], task["_pass1"], out)
                st["unplaced"] += unplaced
                _cr, anchors = pass1(source, fx, ch, ovr)
                by_model.setdefault(tag, {})[k] = {a.citation: a.offset for a in anchors}
    print(f"pass1   ALL     {json.dumps(score(base, fx_list))}")
    for fx in fx_list:
        print(f"pass1   {fx['work']}-{fx['book']:<4} {json.dumps(score(base, [fx]))}")
    for tag in MODELS:
        placed = by_model.get(tag, {})
        print(f"{tag:7} ALL     {json.dumps(score(placed, fx_list))}  {json.dumps(stats[tag])}")
        for fx in fx_list:
            print(f"{tag:7} {fx['work']}-{fx['book']:<4} {json.dumps(score(placed, [fx]))}")


# ---- batches --------------------------------------------------------------
def submit(stage: str, source: str | None, models: list[str],
           only: set | None = None, max_tokens: int = 32000,
           names: set | None = None) -> None:
    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    reqs, receipt = [], {}
    for fx in fixtures():
        if names and f"{fx['work']}-{fx['book']}" not in names:
            continue
        for ch in fx["chapters"]:
            if stage == "gloss":
                prompt, schema = gloss_prompt(fx, ch), GLOSS_SCHEMA
            else:
                task = verify_task(source, fx, ch)
                if task is None:
                    print(f"  no {source} gloss for {fx['work']} {ch['book']}-{ch['chapter']}: skipped")
                    continue
                # snapshot what the models see, so scoring can refuse changed inputs
                snap_dir = OUT / "verify" / source / "tasks" / fx["work"]
                snap_dir.mkdir(parents=True, exist_ok=True)
                (snap_dir / f"{ch['book']}-{ch['chapter']}.json").write_text(
                    json.dumps(task, ensure_ascii=False, indent=1), encoding="utf-8")
                task = {k: v for k, v in task.items() if k != "_pass1"}
                prompt, schema = verify_prompt(fx, task), VERIFY_SCHEMA
            for tag in models:
                cid = f"{stage[0]}-{tag}-{fx['work']}-{ch['book']}-{ch['chapter']}"
                if only and cid not in only:
                    continue
                receipt[cid] = {"stage": stage, "source": source, "model": tag,
                                "work": fx["work"], "book": ch["book"], "chapter": ch["chapter"]}
                reqs.append(Request(custom_id=cid, params=MessageCreateParamsNonStreaming(
                    model=MODELS[tag], max_tokens=max_tokens,
                    output_config={"effort": EFFORT,
                                   "format": {"type": "json_schema", "schema": schema}},
                    messages=[{"role": "user", "content": prompt}])))
    batch = anthropic.Anthropic().messages.batches.create(requests=reqs)
    (OUT / "batches").mkdir(parents=True, exist_ok=True)
    (OUT / "batches" / f"{batch.id}.json").write_text(json.dumps(
        {"id": batch.id, "stage": stage, "source": source, "requests": receipt}, indent=1))
    print(f"batch {batch.id}: {len(reqs)} requests ({stage}, models {models})")


def fetch(batch_id: str) -> None:
    import anthropic
    rec_path = OUT / "batches" / f"{batch_id}.json"
    rec = json.loads(rec_path.read_text())
    client = anthropic.Anthropic()
    b = client.messages.batches.retrieve(batch_id)
    if b.processing_status != "ended":
        print(f"{batch_id}: {b.processing_status} {b.request_counts}")
        return
    cost, fails, usage = {}, [], {}
    for r in client.messages.batches.results(batch_id):
        meta = rec["requests"][r.custom_id]
        tag = meta["model"]
        if meta["stage"] == "gloss":
            dest = gloss_dir(tag) / meta["work"]
        else:
            dest = OUT / "verify" / meta["source"] / tag / meta["work"]
        out_file = dest / f"{meta['book']}-{meta['chapter']}.json"
        # a failure must not leave an earlier run's answer behind to be scored
        out_file.unlink(missing_ok=True)
        if r.result.type != "succeeded":
            fails.append(f"{r.custom_id}: {r.result.type}")
            continue
        m = r.result.message
        u = usage.setdefault(tag, {"input": 0, "output": 0})
        u["input"] += m.usage.input_tokens
        u["output"] += m.usage.output_tokens
        if m.stop_reason != "end_turn":
            fails.append(f"{r.custom_id}: stop_reason {m.stop_reason}")
            continue
        data = json.loads(next(blk.text for blk in m.content if blk.type == "text"))
        if meta["stage"] == "gloss":
            data = {ln["citation"]: ln["english"] for ln in data["lines"]}
        dest.mkdir(parents=True, exist_ok=True)
        out_file.write_text(
            json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    for tag, u in usage.items():
        pi, po = PRICE[tag]
        cost[tag] = round((u["input"] * pi + u["output"] * po) / 1e6 / 2, 4)
    rec["fetched"] = {"usage": usage, "dollars": cost, "failures": fails}
    rec_path.write_text(json.dumps(rec, indent=1))
    print(json.dumps(rec["fetched"], indent=1))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("prepare"); a.add_argument("work"); a.add_argument("book", type=int)
    a = sub.add_parser("submit"); a.add_argument("stage", choices=["gloss", "verify"])
    a.add_argument("--source"); a.add_argument("--models", default="haiku,sonnet,opus")
    a.add_argument("--only", help="comma-separated custom_ids to resend")
    a.add_argument("--max-tokens", type=int, default=32000)
    a.add_argument("--fixtures", help="comma-separated fixture names, e.g. EN-2,EN-3")
    a = sub.add_parser("fetch"); a.add_argument("batch_id")
    a = sub.add_parser("score-gloss"); a.add_argument("--sources", default="prod,haiku,sonnet,opus")
    a = sub.add_parser("score-verify"); a.add_argument("--source", required=True)
    args = p.parse_args()
    if args.cmd == "prepare":
        prepare(args.work, args.book)
    elif args.cmd == "submit":
        if args.stage == "verify" and not args.source:
            sys.exit("verify needs --source (whose glosses give the first pass)")
        submit(args.stage, args.source, args.models.split(","),
               set(args.only.split(",")) if args.only else None, args.max_tokens,
               set(args.fixtures.split(",")) if args.fixtures else None)
    elif args.cmd == "fetch":
        fetch(args.batch_id)
    elif args.cmd == "score-gloss":
        score_gloss(args.sources.split(","))
    else:
        score_verify(args.source)


if __name__ == "__main__":
    main()
