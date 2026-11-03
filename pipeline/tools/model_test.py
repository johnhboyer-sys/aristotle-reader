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
WORKS = {"EN": ("Nicomachean Ethics", "H. Rackham"), "Rhet": ("Rhetoric", "J. H. Freese"),
         "ENo": ("Nicomachean Ethics", "Martin Ostwald")}
MAX_LINE = 80   # longer than one printed Ostwald line: two lines merged in the transcription


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


def prepare_ostwald(book: int) -> None:
    """Gold from Ostwald's printed margin: the tick belongs in the printed line a
    Bekker number labels. A right-margin number ends its line ("... capacity:
    the 10"), so the line is [line start, number); a left-margin number opens
    its line ("15 had better give up ..."), so it is [number, line end). Only
    lines the transcription keeps whole (≤ MAX_LINE chars) qualify — after the
    opening pages it runs paragraphs together and the line extents are lost.
    Taken from the parser's raw marker offsets, NOT bekker_corrections.json
    (those positions were placed by an Opus 4.8 reading pass)."""
    from aristotle_pipeline import stage1_ostwald as so
    from aristotle_pipeline.align.glossing import chapter_lines, tick_windows
    from aristotle_pipeline.config import SOURCES_DIR
    for name in ("greek_spine.json", "english_chunks.json"):
        held = json.loads((REPO / "build/stage1" / name).read_text(encoding="utf-8")).get("work")
        if held != "EN":
            sys.exit(f"build/stage1/{name} holds {held!r}: run stage1 --work EN")
    md = SOURCES_DIR / "ostwald" / "ostwald-ethics.md"
    prose, align, *_ = so.parse_ostwald(md)
    # (book, chapter, citation) -> ("right", words before the number on its
    # printed line) or ("left", words after it, when it opens a whole line)
    segs, bk, chap, page = {}, None, None, None
    for raw in md.read_text(encoding="utf-8").splitlines():
        line = so._strip_markup(raw)
        if line == "## Footnotes" or so._FOOTNOTE_DEF.match(line):
            break
        if (mb := so._BOOK.match(line)):
            bk, chap = so._roman_int(mb.group(1)), None
            continue
        if (mc := so._CHAPTER.match(line)):
            chap = int(mc.group(1))
            continue
        if chap is None:
            continue
        words, toks = [], line.split()
        for i, tok in enumerate(toks):
            cit = None
            if so._PAGE.match(tok) and so._PAGE_LO <= int(tok[:-1]) <= so._PAGE_HI:
                page = tok
                cit = f"{page}1"
            elif (ml := so._LINE.match(tok)) and page is not None:
                cit = f"{page}{ml.group(1)}"
                if ml.group(2) and words:
                    words[-1] += ml.group(2)
            if cit is None:
                words.append(tok)
                continue
            if words:
                segs.setdefault((bk, chap, cit), []).append(("right", " ".join(words)))
            elif i == 0 and len(line) <= MAX_LINE:
                rest = []
                for t in toks[1:]:
                    if so._LINE.match(t) or so._PAGE.match(t):
                        break
                    rest.append(t)
                segs.setdefault((bk, chap, cit), []).append(("left", " ".join(rest)))
            else:
                segs.setdefault((bk, chap, cit), []).append(("right", ""))
            words = []       # what follows starts the next printed line
    chapters, kept, dropped = [], 0, {"merged_or_empty": 0, "text_mismatch": 0, "duplicate": 0}
    for ch in chapter_lines([book]):
        text = prose.get((ch.book, ch.chapter), "")
        windows = tick_windows(ch)
        ticks = {w.tick for w in windows}
        raw_off = {}
        for a in align.get(f"{ch.book}:{ch.chapter}", {}).get("anchors", []):
            raw_off.setdefault(a["citation"], []).append(a["offset"])
        gold = []
        for cit, offs in raw_off.items():
            # the chapter's first line is pinned structurally, never placed
            if cit not in ticks or cit == ch.lines[0].citation:
                continue
            seg_list = segs.get((ch.book, ch.chapter, cit), [])
            if len(offs) != 1 or len(seg_list) != 1:
                dropped["duplicate"] += 1
                continue
            side, seg = seg_list[0]
            if not seg or len(seg) > MAX_LINE:
                dropped["merged_or_empty"] += 1
                continue
            start, end = line_interval(text, side, offs[0], seg)
            if " ".join(text[start:start + len(seg)].split()) != seg:
                dropped["text_mismatch"] += 1
                continue
            n = int(re.match(r"\d+[ab](\d+)", cit).group(1))
            gold.append({"citation": cit, "start": start, "end": end,
                         "tier": "column" if n == 1 else "five_line"})
            kept += 1
        chapters.append({
            "book": ch.book, "chapter": ch.chapter,
            "lines": [{"citation": ln.citation, "greek": ln.text} for ln in ch.lines],
            "windows": [{"tick": w.tick, "is_column_start": w.is_column_start,
                         "lines": [ln.citation for ln in w.lines]} for w in windows],
            "text": text, "gold": gold})
    if not kept:
        sys.exit("no Ostwald gold interval survived: nothing could be scored")
    d = FIX / "ostwald"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"ENo-{book}.json").write_text(json.dumps(
        {"work": "ENo", "gloss_work": "EN", "book": book, "chapters": chapters},
        ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"ENo-{book}: {len(chapters)} chapters, {kept} gold lines kept, dropped {dropped}")


def line_interval(text: str, side: str, off: int, seg: str) -> tuple[int, int]:
    """[start, end) of the printed line `seg` that a margin number labels. A left
    number sits at the line's start. A right number's offset is where the NEXT
    printed line begins, so the line ends at the whitespace before it: a space
    mid-paragraph, a newline (or nothing) at a paragraph's end."""
    if side == "left":
        return off, off + len(seg)
    e = off
    while e > 0 and text[e - 1].isspace():
        e -= 1
    return e - len(seg), off


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


def gloss_prompt(title: str, ch: dict) -> str:
    greek = {ln["citation"]: ln["greek"] for ln in ch["lines"]}
    task = [{"tick": w["tick"], "is_column_start": w["is_column_start"],
             "lines": [{"citation": c, "greek": greek[c]} for c in w["lines"]]}
            for w in ch["windows"]]
    return f"""Translate ancient Greek (Aristotle, {title}, Book {ch['book']}, ch {ch['chapter']}) for a Bekker-line alignment tool. Precise and faithful — a scholar with good Greek checks this.
- The task below is a list of windows, each `lines` = {{citation, greek}} (line above the tick / tick line / line below; edge windows have 2). Use neighbours only to get a mid-sentence line's sense right.
- Output ONE English line per Greek line, keyed by its citation — verse mode, on its own line even if longer. Each citation appears once; do not merge, reorder, annotate.
- Each English line MUST BEGIN with the rendering of its Greek line's FIRST word. Don't pull a line's opening word up into the previous line or borrow the next line's; boundaries coincide with the Greek even if a line then starts mid-clause (Greek opens διαφέρειν → English starts "differ…"). The verifier anchors on this — a shifted boundary becomes a mis-placed tick.
- Standard scholarly terms, used consistently: ἀρετή=virtue, εὐδαιμονία=happiness, ἔργον=function, ἐνέργεια=activity, ἕξις=state, τέλος=end, λόγος=reason/account, προαίρεσις=choice, τέχνη=art, πρᾶξις=action. Proper names stay names (Καλλίας→Callias).
- Return every citation in the task once, as {{citation, english}} in the `lines` array.

Task:
{json.dumps(task, ensure_ascii=False, indent=1)}"""


BULK_RULE = """- For EACH tick, judge whether `current_placement` BEGINS where the translation renders the BULK of `greek_tick` — the clause or phrase that carries most of that Greek line's content — not merely its first word. When the translator keeps the Greek order these coincide. When they don't, follow the bulk: if the line opens with the last word or two of a sentence begun on `greek_above` and the rest of the line is a new clause, the tick goes at the start of that new clause; if the translator moves the line's main clause elsewhere in the sentence, the tick goes where that clause is rendered. `ok` = it does; `early` = begins on content belonging to `greek_above`, or before the start of `greek_tick`'s bulk; `late` = begins after the start of `greek_tick`'s bulk, or on `greek_below`; `unsure` = translation condenses/omits `greek_tick`.
- ALWAYS return `phrase`: a 5–10 word verbatim substring copied EXACTLY from `text`, beginning precisely at the start (a word boundary) of the English that renders `greek_tick`'s bulk (an exact search must find it; for `ok` it matches `current_placement`'s start). It must NOT start as late as `greek_below`.
- Judge by the GREEK, not by which reading sounds smoothest."""


def verify_prompt(translator: str, task: dict, rule: str = "first") -> str:
    if rule == "bulk":
        head, sep, rest = _first_word_prompt(translator, task).partition("- For EACH tick")
        tail = rest[rest.index("- Return every tick"):]
        return head + BULK_RULE + "\n" + tail
    return _first_word_prompt(translator, task)


def _first_word_prompt(translator: str, task: dict) -> str:
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
        if fx.get("gloss_work", fx["work"]) != "EN":
            return {}
        return load_json(REPO / f"build/align/glosses/EN/{ch['book']}-{ch['chapter']}.json")
    # glosses are of the Greek, so a second translation reuses its work's glosses
    return load_json(gloss_dir(source) / fx.get("gloss_work", fx["work"])
                     / f"{ch['book']}-{ch['chapter']}.json")


# ---- scoring --------------------------------------------------------------
def skip_space(text: str, off: int) -> int:
    while off < len(text) and text[off].isspace():
        off += 1
    return off


def snap(starts: list[int], off: int) -> int:
    return max((s for s in starts if s <= off), default=starts[0])


def score_interval(placed: dict, fx_list: list[dict]) -> dict:
    """Interval gold (Ostwald): a placement is right when it falls inside the
    printed line the margin number labels, [start, end)."""
    rows, missing = [], 0
    for fx in fx_list:
        for ch in fx["chapters"]:
            ticks = {w["tick"] for w in ch["windows"]}
            got = placed.get((fx["work"], ch["book"], ch["chapter"]), {})
            for g in ch["gold"]:
                if g["citation"] not in ticks:
                    continue
                if g["citation"] not in got:
                    missing += 1
                    continue
                p = got[g["citation"]]
                side = "early" if p < g["start"] else "late" if p >= g["end"] else "in"
                dist = g["start"] - p if side == "early" else p - g["end"] + 1 if side == "late" else 0
                rows.append({"side": side, "dist": dist, "len": g["end"] - g["start"]})
    if not rows:
        return {"n": 0, "missing": missing}
    total = len(rows) + missing
    pct = lambda k: round(100 * k / total, 1)  # noqa: E731
    return {"n": len(rows), "missing": missing,
            "in_line_pct": pct(sum(r["side"] == "in" for r in rows)),
            "near_30_pct": pct(sum(r["dist"] <= 30 for r in rows)),
            "early_pct": pct(sum(r["side"] == "early" for r in rows)),
            "late_pct": pct(sum(r["side"] == "late" for r in rows)),
            "median_dist": statistics.median(r["dist"] for r in rows),
            "median_line_chars": statistics.median(r["len"] for r in rows)}


def score(placed: dict, fx_list: list[dict]) -> dict:
    """placed: {(work, book, chapter): {citation: offset}}. Scores every gold tick
    that sits on a glossed tick; a gold tick with no placement counts as missing."""
    if any("start" in g for fx in fx_list for ch in fx["chapters"] for g in ch["gold"]):
        return score_interval(placed, fx_list)
    rows, missing, missing_col = [], 0, 0
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
                    missing_col += g["tier"] == "column"
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
    col_total = len(col) + missing_col
    return {"n": len(rows), "missing": missing,
            "same_sentence_pct": round(100 * sum(r["same_sentence"] for r in rows) / total, 1),
            "column_same_sentence_pct": round(100 * sum(r["same_sentence"] for r in col) / col_total, 1) if col_total else None,
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


def correct_task(source: str, fx: dict, ch: dict, tag: str) -> dict | None:
    """Recipe §5b as fixed in PR #170: re-judge only the ticks `tag` marked
    early/late, showing it the pass-2 placement its own answers produced.
    None when there is nothing to re-judge."""
    task = verify_task(source, fx, ch)
    first = load_json(OUT / "verify" / source / tag / fx["work"] / f"{ch['book']}-{ch['chapter']}.json")
    if task is None or not first:
        return None
    ovr, _ = fold(ch["text"], task["_pass1"], first)
    _cr, anchors = pass1(source, fx, ch, ovr)
    pos = {a.citation: a.offset for a in anchors}
    verdict = {t["citation"]: t.get("verdict") for t in first.get("ticks", [])}
    ticks = [dict(t, current_placement=ch["text"][pos[t["citation"]]:pos[t["citation"]] + 90])
             for t in task["ticks"] if verdict.get(t["citation"]) in ("early", "late")]
    if not ticks:
        return None
    return {"chapter": task["chapter"], "ticks": ticks, "text": ch["text"]}


def merge_ticks(first: dict, corr: dict) -> dict:
    new = {t["citation"]: t for t in corr.get("ticks", [])}
    return {"chapter": first.get("chapter"),
            "ticks": [new.get(t["citation"], t) for t in first.get("ticks", [])]}


def score_verify(source: str) -> None:
    fx_list = fixtures()
    vdir = OUT / "verify" / source
    tags = list(MODELS) + [f"{t}+c" for t in MODELS if (vdir / "tasks" / f"{t}+c").exists()]
    tags += sorted(d.name for d in (vdir / "tasks").glob("*@*") if d.is_dir())
    base, by_model = {}, {}
    stats = {}
    for fx in fx_list:
        for ch in fx["chapters"]:
            k = (fx["work"], ch["book"], ch["chapter"])
            task = verify_task(source, fx, ch)
            if task is None:
                continue
            base[k] = task["_pass1"]
            for tag in tags:
                name = f"{ch['book']}-{ch['chapter']}.json"
                sent = load_json(vdir / "tasks" / tag / fx["work"] / name)
                if tag.endswith("+c"):
                    ct = correct_task(source, fx, ch, tag[:-2])
                    if (ct or {}) != sent:
                        sys.exit(f"{k}: {tag}'s inputs changed since its batch was sent")
                    # no early/late ticks -> nothing re-judged, the first pass stands
                    out = load_json(vdir / (tag if ct else tag[:-2]) / fx["work"] / name)
                else:
                    out = load_json(vdir / tag / fx["work"] / name)
                    if out and sent != task:
                        sys.exit(f"{k}: {tag}'s answer has no matching snapshot of what it was sent")
                st = stats.setdefault(tag, {"chapters_missing": 0, "unplaced": 0, "verdicts": {}})
                if not out:
                    st["chapters_missing"] += 1
                    continue
                for t in out.get("ticks", []):
                    st["verdicts"][t.get("verdict")] = st["verdicts"].get(t.get("verdict"), 0) + 1
                ovr, unplaced = fold(ch["text"], task["_pass1"], out)
                st["unplaced"] += unplaced
                _cr, anchors = pass1(source, fx, ch, ovr)
                # a tick the verifier did not place counts as missing, not as pass 1
                by_model.setdefault(tag, {})[k] = {a.citation: a.offset for a in anchors
                                                   if a.citation in ovr}
    print(f"pass1   ALL     {json.dumps(score(base, fx_list))}")
    for fx in fx_list:
        print(f"pass1   {fx['work']}-{fx['book']:<4} {json.dumps(score(base, [fx]))}")
    for tag in tags:
        placed = by_model.get(tag, {})
        print(f"{tag:7} ALL     {json.dumps(score(placed, fx_list))}  {json.dumps(stats[tag])}")
        for fx in fx_list:
            print(f"{tag:7} {fx['work']}-{fx['book']:<4} {json.dumps(score(placed, [fx]))}")


# ---- batches --------------------------------------------------------------
def snapshot(snap: Path, answer: Path, task: dict) -> None:
    """Record what a request is sent, and drop any earlier answer in its slot:
    scoring checks the answer against this snapshot, so an old answer left
    beside a new snapshot would be scored as if it answered the new task."""
    answer.unlink(missing_ok=True)
    snap.parent.mkdir(parents=True, exist_ok=True)
    snap.write_text(json.dumps(task, ensure_ascii=False, indent=1), encoding="utf-8")


def submit(stage: str, source: str | None, models: list[str],
           only: set | None = None, max_tokens: int = 32000,
           names: set | None = None, rule: str = "first") -> None:
    if stage == "correct" and rule != "first":
        sys.exit("correction reads, prompts and snapshots first-word answers only")
    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    reqs, receipt = [], {}
    for fx in fixtures():
        if names and f"{fx['work']}-{fx['book']}" not in names:
            continue
        for ch in fx["chapters"]:
            if stage == "gloss":
                prompt, schema = gloss_prompt(WORKS[fx["work"]][0], ch), GLOSS_SCHEMA
            elif stage == "correct":
                pass   # per model below: each corrects its own first pass
            else:
                task = verify_task(source, fx, ch)
                if task is None:
                    print(f"  no {source} gloss for {fx['work']} {ch['book']}-{ch['chapter']}: skipped")
                    continue
                sent_task = task
                task = {k: v for k, v in task.items() if k != "_pass1"}
                prompt, schema = verify_prompt(WORKS[fx["work"]][1], task, rule), VERIFY_SCHEMA
            for tag in models:
                variant = tag if rule == "first" else f"{tag}@{rule}"
                cid = f"{stage[0]}-{tag}-{fx['work']}-{ch['book']}-{ch['chapter']}"
                if only and cid not in only:
                    continue
                if stage == "correct":
                    sent_task = correct_task(source, fx, ch, tag)
                    if sent_task is None:
                        continue
                    prompt, schema = verify_prompt(WORKS[fx["work"]][1], sent_task), VERIFY_SCHEMA
                    name = f"{ch['book']}-{ch['chapter']}.json"
                    vdir = OUT / "verify" / source
                    snapshot(vdir / "tasks" / f"{tag}+c" / fx["work"] / name,
                             vdir / f"{tag}+c" / fx["work"] / name, sent_task)
                if stage == "verify":
                    # snapshot what this model sees, so scoring can refuse changed inputs
                    name = f"{ch['book']}-{ch['chapter']}.json"
                    vdir = OUT / "verify" / source
                    snapshot(vdir / "tasks" / variant / fx["work"] / name,
                             vdir / variant / fx["work"] / name, sent_task)
                receipt[cid] = {"stage": stage, "source": source, "model": tag, "variant": variant,
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
        elif meta["stage"] == "correct":
            dest = OUT / "verify" / meta["source"] / f"{tag}+c" / meta["work"]
        else:
            dest = OUT / "verify" / meta["source"] / meta.get("variant", tag) / meta["work"]
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
        elif meta["stage"] == "correct":
            data = merge_ticks(load_json(OUT / "verify" / meta["source"] / tag / meta["work"]
                                         / out_file.name), data)
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
    p.add_argument("--set", help="fixture set under fixtures/, e.g. ostwald (default: the Perseus set)")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("prepare"); a.add_argument("work"); a.add_argument("book", type=int)
    a = sub.add_parser("submit"); a.add_argument("stage", choices=["gloss", "verify", "correct"])
    a.add_argument("--source"); a.add_argument("--models", default="haiku,sonnet,opus")
    a.add_argument("--only", help="comma-separated custom_ids to resend")
    a.add_argument("--max-tokens", type=int, default=32000)
    a.add_argument("--fixtures", help="comma-separated fixture names, e.g. EN-2,EN-3")
    a.add_argument("--rule", choices=["first", "bulk"], default="first",
                   help="verify placement rule: first word (recipe) or bulk of the line (John)")
    a = sub.add_parser("fetch"); a.add_argument("batch_id")
    a = sub.add_parser("score-gloss"); a.add_argument("--sources", default="prod,haiku,sonnet,opus")
    a = sub.add_parser("score-verify"); a.add_argument("--source", required=True)
    a = sub.add_parser("prepare-ostwald"); a.add_argument("books", nargs="+", type=int)
    args = p.parse_args()
    if args.set:
        global FIX
        FIX = FIX / args.set
    if args.cmd == "prepare-ostwald":
        for b in args.books:
            prepare_ostwald(b)
    elif args.cmd == "prepare":
        prepare(args.work, args.book)
    elif args.cmd == "submit":
        if args.stage in ("verify", "correct") and not args.source:
            sys.exit("verify needs --source (whose glosses give the first pass)")
        submit(args.stage, args.source, args.models.split(","),
               set(args.only.split(",")) if args.only else None, args.max_tokens,
               set(args.fixtures.split(",")) if args.fixtures else None, args.rule)
    elif args.cmd == "fetch":
        fetch(args.batch_id)
    elif args.cmd == "score-gloss":
        score_gloss(args.sources.split(","))
    else:
        score_verify(args.source)


if __name__ == "__main__":
    main()
