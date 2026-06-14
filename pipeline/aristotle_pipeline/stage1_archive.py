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
from pathlib import Path

import yaml

from . import stage1_perseus
from .config import BUILD_DIR, SOURCES_DIR, Manifest
from .stage1_english import add_bekker_gutter, build_alignment
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
        SOURCES_DIR / cfg["dir"], cfg["books"], cfg.get("chapter_marker", "number")
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
            off = c["text"].find(phrase)
            if off >= 0:
                hit = (c["id"], off)
                break
        if hit and n is not None:
            line_ms.setdefault(hit[0], []).append((n, hit[1]))
        else:
            missing.append(ref)
    if missing:
        print(f"  anchors: {len(missing)} unresolved: {missing[:8]}")
    return line_ms


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
    add_bekker_gutter(english, spine)   # interpolates; real ticks only where anchored
    english.pop("_line_ms", None)
    return english


def run(manifest: Manifest, spine: dict, chapters: list[dict]) -> tuple[Path, Path]:
    eng_cfg = manifest.data["english"]
    english = build_english(manifest, spine, chapters, eng_cfg["primary"])
    out_dir = BUILD_DIR / "stage1"
    out_dir.mkdir(parents=True, exist_ok=True)
    eng_path = out_dir / "english_chunks.json"
    eng_path.write_text(json.dumps(english, ensure_ascii=False, indent=1), encoding="utf-8")
    align_path = out_dir / "alignment.json"
    align_path.write_text(
        json.dumps(build_alignment(spine, english), ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    # Secondary (compare) translation fills the same slot as Ross does for EN.
    # Always (re)write ross_chunks.json so a prior EN build can't leak through
    # this shared scratch file; empty when the work has only one translation.
    sec = eng_cfg.get("secondary")
    ross = build_chunks(spine, chapters, _load_prose(sec)) if sec else {}
    (out_dir / "ross_chunks.json").write_text(
        json.dumps(ross, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return eng_path, align_path
