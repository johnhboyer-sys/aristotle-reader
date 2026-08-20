"""Stage 1b (archive variant): a chapter-anchored English translation as the
*primary* parallel text, for works with no Bekker-milestoned Perseus TEI.

EN's Rackham comes from a TEI carrying real Bekker line milestones. De Anima's
Smith is plain MIT-archive prose divided only by book/chapter, so we distribute
each chapter's prose across the Bekker columns its Greek spans (reusing the Ross
machinery) and produce the same per-column EnglishChunk shape stage7/the reader
already consume. The Bekker gutter is interpolated (every tick estimated) unless
a hand-keyed anchors file pins specific Bekker lines to phrases in the text — in
which case those ticks become real and interpolation only fills the gaps.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

from . import stage1_perseus
from .config import BUILD_DIR, SOURCES_DIR, Manifest
from .stage1_english import add_bekker_gutter, build_alignment
from .stage1_common import write_json
from .stage1_ross import build_chunks, parse_translation


def _load_prose(cfg: dict) -> dict[tuple[int, int], str]:
    """Chapter-keyed prose {(book, chapter): text} for a translation config,
    from either a Perseus TEI (`model: perseus_tei`) or MIT-archive HTML."""
    if cfg.get("model") == "perseus_tei":
        return stage1_perseus.chapter_prose(
            SOURCES_DIR / cfg["source"],
            cfg.get("chapter_subtype", "chapter"),
            cfg.get("book_subtype", "book"),
        )
    return parse_translation(
        SOURCES_DIR / cfg["dir"], cfg["books"], cfg.get("chapter_marker", "number"),
        strip_quote_repeats=cfg.get("strip_quote_repeats", False),
    )


def _resolve_anchors(rel: str, chunks: list[dict]) -> dict[str, list]:
    """Hand-keyed Bekker anchors → {chunk_id: [(line, offset), ...]}.

    anchors file is a YAML list of {bekker: "412a10", at: "verbatim phrase"}.
    Each phrase is located in the chunk(s) of its Bekker column; the resulting
    (line, offset) becomes a real gutter tick. Unresolved anchors are reported.
    """
    path = SOURCES_DIR / rel
    if not path.exists():
        return {}
    entries = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    by_col: dict[str, list[dict]] = {}
    for c in chunks:
        by_col.setdefault(c["column"], []).append(c)
    line_ms: dict[str, list] = {}
    missing = []
    for e in entries:
        ref = str(e["bekker"]).strip()
        col, _, line = ref.partition("a") if "a" in ref else ref.partition("b")
        column = ref[: len(ref) - len(line)] if line else ref
        n = int(line) if line.isdigit() else None
        phrase = e["at"].strip()
        hit = None
        for c in by_col.get(column, []):
            off = _find_phrase(c["text"], phrase)
            if off >= 0:
                hit = (c["id"], off)
                break
        if hit and n is not None:
            line_ms.setdefault(hit[0], []).append((n, hit[1]))
        elif n is not None and by_col.get(column) and any(phrase in c["text"] for c in chunks):
            # An end-of-column line (e.g. 11b38, the last line of 11b) whose
            # sentence the proportional cut spilled into the next column. The
            # phrase is elsewhere, but the line genuinely belongs at the END of
            # its own column, so pin a real tick to this column's last sentence
            # boundary rather than mislabel it under the next column's gutter.
            chunk = by_col[column][-1]
            t = chunk["text"]
            bounds = [m.end() for m in re.finditer(r'[.?!][")\']?\s', t)]
            line_ms.setdefault(chunk["id"], []).append((n, bounds[-1] if bounds else len(t)))
        else:
            missing.append(ref)
    if missing:
        print(f"  anchors: {len(missing)} unresolved: {missing[:8]}")
    return line_ms


_BEKKER = re.compile(r"^(\d{1,4}[ab])(\d{1,3})$")


def _find_phrase(text: str, phrase: str) -> int:
    """Offset of `phrase` in `text`, falling back to progressively shorter
    word-prefixes when the full phrase isn't found verbatim — e.g. when the
    proportional column cut split the anchor phrase across two chunks. Returns
    -1 if even a 4-word prefix is absent.

    Anchor phrases are stored whitespace-COLLAPSED (see
    tools/gloss_map_to_anchors.py `_phrase`), so a phrase spanning a paragraph
    break carries a space where the prose has a newline and no amount of
    prefix-shortening finds it — every prefix straddles the break too. Matching
    on `\\s+` between words fixes 66 of the 68 anchors that genuinely failed to
    resolve corpus-wide (HA 24, Phys 24, DA 8, Mete 3, ...), which were being
    written off as column straddles. The remaining 2 are real straddles.
    """
    off = text.find(phrase)
    if off >= 0:
        return off
    words = phrase.split()
    for k in (None, 8, 6, 5, 4):
        part = words if k is None else words[:k]
        if k is not None and len(words) <= k:
            continue
        m = re.search(r"\s+".join(re.escape(w) for w in part), text)
        if m:
            return m.start()
    return -1


def _inject_real_ticks(chunks: dict[str, list[dict]], anchors_rel: str,
                       label: str) -> None:
    """Replace each overlay piece's interpolated gutter with REAL Bekker ticks
    located by hand-keyed anchors. `anchors` is a YAML list of
    {bekker: "2a4", at: "verbatim phrase"}; the phrase is found in the piece of
    its Bekker column and becomes a real tick at that offset. Dense anchors give
    a secondary/third translation the same precise gutter the primary gets from
    _resolve_anchors. Pieces with no anchor render as a single un-numbered row."""
    path = SOURCES_DIR / anchors_rel
    entries = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else []
    for pieces in chunks.values():           # drop the proportional interpolation
        for p in pieces:
            p["bekker"] = []
    missing = []
    for e in entries or []:
        ref = str(e["bekker"]).strip()
        m = _BEKKER.match(ref)
        if not m:
            missing.append(ref)
            continue
        column, line = m.group(1), int(m.group(2))
        phrase = e["at"].strip()
        # Segment ids are "{book}:{column}", so the old `chunks[f"1:{column}"]`
        # only ever matched book 1 — every anchor in books 2+ fell through to the
        # any-piece scan below. Match on the column suffix instead, which also
        # picks up both pieces of a mid-column book start (DA's 424b).
        own = [p for sid, ps in chunks.items() if sid.endswith(f":{column}") for p in ps]
        hit = None
        for p in own:
            off = _find_phrase(p["text"], phrase)
            if off >= 0:
                hit = (p, off)
                break
        if not hit:
            # The phrase spilled past the proportional column cut. Do NOT drop the
            # tick into another column's piece: pieces carry no column of their
            # own, so the reader would label it with the host column and cite the
            # wrong Bekker line — and two such ticks sharing a line number would
            # silently overwrite each other. Pin it to the end of its own column,
            # as _resolve_anchors does for the same case.
            if not own:
                missing.append(ref)
                continue
            p = own[-1]
            bounds = [m.end() for m in re.finditer(r'[.?!][")\']?\s', p["text"])]
            off = bounds[-1] if bounds else len(p["text"])
        p["bekker"] = [t for t in p["bekker"] if t["n"] != line]
        p["bekker"].append({"n": line, "offset": off, "real": True})
        p["bekker"].sort(key=lambda t: t["offset"])
    if missing:
        print(f"  {label} anchors: {len(missing)}/{len(entries or [])} unresolved: {missing[:10]}")
    else:
        print(f"  {label} anchors: all {len(entries or [])} resolved")


def _attach_tables(chunks: dict[str, list[dict]], cfg: dict) -> None:
    """Attach structured diagram tables (sources/<dir>/tables.json, a list of
    {bekker, rows}) to the overlay piece that owns each table's Bekker line, so
    the reader can render them as grids (e.g. Ackrill's squares of opposition).
    The piece is the one carrying a real tick at that line."""
    if not cfg.get("dir"):
        return
    path = SOURCES_DIR / cfg["dir"] / "tables.json"
    if not path.exists():
        return
    for tbl in json.loads(path.read_text(encoding="utf-8")):
        m = _BEKKER.match(str(tbl["bekker"]).strip())
        if not m:
            continue
        column, line = m.group(1), int(m.group(2))
        # Same "{book}:{column}" id shape as _inject_real_ticks — a hardcoded
        # book 1 would silently drop every table in books 2+.
        for p in [p for sid, ps in chunks.items() if sid.endswith(f":{column}") for p in ps]:
            if any(t["n"] == line for t in p.get("bekker", [])):
                p.setdefault("tables", []).append({"n": line, "rows": tbl["rows"]})
                break


def build_overlay(spine: dict, chapters: list[dict], cfg: dict,
                  work_id: str | None = None) -> dict[str, list[dict]]:
    """A secondary/third translation as chapter-anchored overlay pieces
    ({seg_id: [{chapter, text, cont, bekker, tables?}]}), with a dense real-anchor
    gutter. Prefers a gloss-aligner map (every-5-line ticks) when one exists for
    this work/version; falls back to the hand-keyed anchors.yaml."""
    from .stage1_ross import _load_align_map
    align_map = _load_align_map(work_id, cfg["id"]) if work_id else {}
    chunks = build_chunks(spine, chapters, _load_prose(cfg), align_map or None)
    if cfg.get("anchors") and not align_map:
        _inject_real_ticks(chunks, cfg["anchors"], cfg.get("id", "overlay"))
    _attach_tables(chunks, cfg)
    return chunks


def build_english(manifest: Manifest, spine: dict, chapters: list[dict],
                  cfg: dict) -> dict:
    """Primary English chunks (EnglishChunk shape) from an archive translation."""
    prose = _load_prose(cfg)
    pieces = build_chunks(spine, chapters, prose)

    chunks: list[dict] = []
    for seg in spine["segments"]:
        text = ""
        markers: list[dict] = []
        for p in pieces.get(seg["id"], []):
            if text and not text.endswith(" "):
                text += " "
            if not p["cont"]:  # a chapter that begins in this column → heading anchor
                markers.append({"kind": "section", "n": p["chapter"], "offset": len(text)})
            text += p["text"]
        chunks.append({
            "id": seg["id"], "book": seg["book"], "column": seg["column"],
            "text": text, "notes": [], "markers": markers,
        })

    english = {
        "work": manifest.work_id,
        "source": cfg.get("dir") or cfg.get("source", ""),
        "translation": cfg["name"],
        "chunks": [c for c in chunks if c["text"].strip()],
        "chapters": chapters,
        "_line_ms": _resolve_anchors(cfg["anchors"], chunks) if cfg.get("anchors") else {},
    }
    # Dense gutter (tick at every resolved anchor line) when the translation is
    # hand-anchored per Bekker segment; otherwise the plain 5-line cadence.
    add_bekker_gutter(english, spine, dense=bool(cfg.get("anchors")))
    english.pop("_line_ms", None)
    return english


def run(manifest: Manifest, spine: dict, chapters: list[dict]) -> tuple[Path, Path]:
    eng_cfg = manifest.data["english"]
    english = build_english(manifest, spine, chapters, eng_cfg["primary"])
    out_dir = BUILD_DIR / "stage1"
    out_dir.mkdir(parents=True, exist_ok=True)
    eng_path = out_dir / "english_chunks.json"
    write_json(eng_path, english)
    align_path = out_dir / "alignment.json"
    write_json(align_path, build_alignment(spine, english))
    # Secondary (compare) translation fills the same slot as Ross does for EN.
    # Always (re)write ross_chunks.json so a prior EN build can't leak through
    # this shared scratch file; empty when the work has only one translation.
    sec = eng_cfg.get("secondary")
    ross = build_overlay(spine, chapters, sec, manifest.work_id) if sec else {}
    write_json(out_dir / "ross_chunks.json", ross)
    # Optional third translation (e.g. Categories: Ackrill alongside Edghill +
    # Taylor). Same overlay shape; emitted to third_chunks.json. Always rewritten
    # (empty when absent) so a prior work's third overlay can't leak through.
    third = eng_cfg.get("third")
    third_chunks = build_overlay(spine, chapters, third, manifest.work_id) if third else {}
    write_json(out_dir / "third_chunks.json", third_chunks)
    run_overlays(manifest, spine, chapters)
    return eng_path, align_path


def run_overlays(manifest: Manifest, spine: dict, chapters: list[dict]) -> dict:
    """Build any *additional* overlay translations (the 4th onward, beyond the
    english/ross/third slots) declared as `english.overlays: [cfg, ...]`, and
    write them keyed by translation id to build/stage1/overlays.json
    ({id: {seg_id: [pieces]}}). Each is an archive chapter-marker overlay (same
    build_overlay path as ross/third), so a work can carry an unbounded number of
    chapter-anchored secondary translations. Always (re)written — empty {} when a
    work declares none — so a prior work's overlays can't leak through the shared
    scratch file. Requires the grc chapter spine; with no chapters (no override)
    overlays are skipped.
    """
    out_dir = BUILD_DIR / "stage1"
    out_dir.mkdir(parents=True, exist_ok=True)
    overlays: dict[str, dict] = {}
    cfgs = (manifest.data.get("english") or {}).get("overlays") or []
    if cfgs and chapters:
        for cfg in cfgs:
            overlays[cfg["id"]] = build_overlay(spine, chapters, cfg, manifest.work_id)
    write_json(out_dir / "overlays.json", overlays)
    return overlays
