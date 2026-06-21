"""Build the per-chapter inputs the aligner matches.

Option-2 strategy: instead of translating Greek with an API, we use the
already-spine-anchored Rackham translation as the *reference*. Rackham carries
real Bekker ticks at the column start (line 1) and ~line 20 of every column, so
matching the unmarked Ross prose against Rackham can yield real Ross anchors at
the column / half-column tier — the honest ceiling, since Rackham itself is no
finer. Single lines below that are interpolated by Greek word-count.

Everything here is derived from existing stage-1 artifacts; nothing re-parses
the TLG and nothing hits the network.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from ..config import BUILD_DIR
from ..stage1_ross import _chapter_segments

_STAGE1 = BUILD_DIR / "stage1"


@dataclass
class RefAnchor:
    citation: str        # "1094a1", "1094a20"
    off: int             # char offset into the assembled chapter reference text
    tier: str            # "chapter" | "column" | "half_column"


@dataclass
class GreekLine:
    citation: str        # "1094a5"
    cum_words: int       # cumulative Greek words *before* this line, within chapter


@dataclass
class ChapterRef:
    book: int
    chapter: str
    citation: str               # chapter-start Bekker citation, e.g. "1094a18"
    ross_text: str              # clean Ross prose for this chapter
    ref_text: str               # assembled Rackham reference text for this chapter
    ref_anchors: list[RefAnchor]  # in order; ref_anchors[k] spans to ref_anchors[k+1]
    greek_lines: list[GreekLine] = field(default_factory=list)
    gloss_incipits: list | None = None  # gloss mode: fingerprints parallel to ref_anchors

    def ref_segments(self) -> list[str]:
        """Rackham text between consecutive anchors (parallel to ref_anchors)."""
        bounds = [a.off for a in self.ref_anchors] + [len(self.ref_text)]
        return [self.ref_text[bounds[i]:bounds[i + 1]] for i in range(len(self.ref_anchors))]

    def ref_incipits(self, max_chars: int = 240) -> list[str]:
        """Fingerprint each anchor, parallel to ref_anchors.

        Gloss mode: the fingerprints are the per-tick glosses themselves.
        Milestoned mode: the whole sentence *containing* each Bekker tick
        (extended if very short). Column-start ticks begin a sentence; line-20
        ticks fall mid-sentence, so anchoring on the enclosing sentence (not the
        raw fragment after the tick) gives the DP a clean unit to match."""
        if self.gloss_incipits is not None:
            return [g[:max_chars] for g in self.gloss_incipits]
        spans = [(m.start(), m.end()) for m in
                 re.finditer(r'[^.!?]*[.!?]+(?:["\')\]]+)?\s*', self.ref_text)]
        spans = [s for s in spans if self.ref_text[s[0]:s[1]].strip()] or [(0, len(self.ref_text))]
        out = []
        for a in self.ref_anchors:
            i = next((k for k, (s, e) in enumerate(spans) if s <= a.off < e), len(spans) - 1)
            fp = self.ref_text[spans[i][0]:spans[i][1]]
            while len(fp.strip()) < 80 and i + 1 < len(spans):   # too short to fingerprint
                i += 1
                fp += self.ref_text[spans[i][0]:spans[i][1]]
            out.append(fp.strip()[:max_chars])
        return out


def _section_offset(chunk: dict, chapter: str) -> int:
    for m in chunk.get("markers", []):
        if m["kind"] == "section" and str(m["n"]) == str(chapter):
            return m["offset"]
    return 0


def default_target(work_id: str) -> tuple[str, dict[tuple[int, int], str]]:
    """(version_id, prose) for a work's unmarked translation to align. Prefers the
    manifest's `english.secondary` (NE-style: Bekker-milestoned primary + unmarked
    secondary); for primary-only works (no secondary — e.g. APr/Jenkinson,
    Cat/Edghill) falls back to `english.primary`; finally to the NE Ross corpus."""
    from ..config import SOURCES_DIR, Manifest
    from ..stage1_ross import parse_translation
    try:
        eng = Manifest.for_work(work_id).data.get("english") or {}
    except (FileNotFoundError, OSError):
        eng = {}
    sec = eng.get("secondary")
    if sec:
        return sec.get("id", "sec"), parse_translation(
            SOURCES_DIR / sec["dir"], sec["books"], sec.get("marker", "number"))
    prim = eng.get("primary")
    if prim and prim.get("dir"):
        marker = prim.get("chapter_marker", prim.get("marker", "number"))
        return prim.get("id", "prim"), parse_translation(
            SOURCES_DIR / prim["dir"], prim["books"], marker)
    return "ross", parse_translation(SOURCES_DIR / "ross", 10, "number")


def load_chapters(target_prose: dict[tuple[int, int], str]) -> list[ChapterRef]:
    """Build per-chapter alignment inputs for the current work. `target_prose` is
    the unmarked translation to align, {(book, chapter): prose}; the reference is
    whatever Bekker-milestoned Perseus English was built into stage1 (Rackham for
    NE, Tredennick for Metaphysics, …). Reads the current work's build/stage1."""
    spine = json.loads((_STAGE1 / "greek_spine.json").read_text(encoding="utf-8"))
    eng = json.loads((_STAGE1 / "english_chunks.json").read_text(encoding="utf-8"))
    chunks = eng["chunks"]
    eng_chapters = eng["chapters"]
    ross = target_prose

    by_bc = {(c["book"], c["column"]): c for c in chunks}
    col_index = {(c["book"], c["column"]): i for i, c in enumerate(chunks)}

    def resolve_idx(book: int, column: str):
        """Chunk index for (book, column). When the English TEI omitted that
        Bekker page milestone (its text merged into the preceding column), snap
        to the nearest preceding chunk in the same book; None if none precedes."""
        if (book, column) in col_index:
            return col_index[(book, column)]
        from ..refs import column_key
        ck = column_key(column)
        cand = [i for (b, c), i in col_index.items()
                if b == book and column_key(c) <= ck]
        return max(cand, key=lambda i: column_key(chunks[i]["column"])) if cand else None

    # Greek line text + cumulative word counts, grouped per chapter (doc order).
    seg_lines = {
        s["id"]: {ln["n"]: ln["text"] for ln in s["lines"]} for s in spine["segments"]
    }
    seg_chapters, chapter_key = _chapter_segments(spine, eng_chapters)

    out: list[ChapterRef] = []
    for i, ch in enumerate(eng_chapters):
        book, chap = ch["book"], str(ch["chapter"])
        ross_text = ross.get((book, int(chap)), "")
        if not ross_text:
            continue

        start_col = ch["column"]
        start_idx = resolve_idx(book, start_col)
        if start_idx is None:
            continue
        start_off = _section_offset(by_bc.get((book, start_col), chunks[start_idx]), chap)

        nxt = eng_chapters[i + 1] if i + 1 < len(eng_chapters) else None
        end_idx = resolve_idx(nxt["book"], nxt["column"]) if nxt is not None else None
        if end_idx is not None and nxt is not None:
            end_off = _section_offset(
                by_bc.get((nxt["book"], nxt["column"]), chunks[end_idx]), str(nxt["chapter"]))
        else:
            end_idx = len(chunks) - 1
            end_off = len(chunks[-1]["text"])

        # Assemble the chapter's Rackham text and collect its real Bekker anchors.
        assembled = []
        anchors: list[RefAnchor] = []
        chap_citation = f"{start_col}{ch['line']}"
        anchors.append(RefAnchor(chap_citation, 0, "chapter"))
        base = 0
        for idx in range(start_idx, end_idx + 1):
            chunk = chunks[idx]
            if chunk["book"] != book:
                continue
            col = chunk["column"]
            text = chunk["text"]
            seg_start = start_off if idx == start_idx else 0
            seg_end = end_off if idx == end_idx else len(text)
            if seg_end <= seg_start:
                continue
            for tick in chunk.get("bekker", []):
                if not tick.get("real") or not (seg_start <= tick["offset"] < seg_end):
                    continue
                off = base + (tick["offset"] - seg_start)
                if off == 0:
                    continue  # coincides with the chapter anchor
                tier = "column" if tick["n"] == 1 else "half_column"
                anchors.append(RefAnchor(f"{col}{tick['n']}", off, tier))
            assembled.append(text[seg_start:seg_end])
            base += seg_end - seg_start
        anchors.sort(key=lambda a: a.off)

        # Greek lines (citation + cumulative word count) for this chapter.
        gidx = next((g for g, kv in chapter_key.items() if kv == (book, int(chap))), None)
        glines: list[GreekLine] = []
        cum = 0
        if gidx is not None:
            for seg_id, col, line_ns in seg_chapters[gidx]:
                for n in line_ns:
                    glines.append(GreekLine(f"{col}{n}", cum))
                    cum += len(seg_lines.get(seg_id, {}).get(n, "").split())

        out.append(ChapterRef(book, chap, chap_citation, ross_text,
                              "".join(assembled), anchors, glines))
    return out


def load_gloss_chapters(target_prose: dict[tuple[int, int], str],
                        work_id: str = "EN", books=None) -> list[ChapterRef]:
    """Gloss-provider inputs: the reference is the per-tick Greek glosses Claude
    Code produced (read from `build/align/glosses/<work>/`), not a milestoned
    English. Each tick (line 1 + every 5th line) becomes a `column`/`five_line`
    anchor whose fingerprint is its own gloss; the DP places it in `target_prose`.
    Chapters with no gloss file are skipped (they fall back to the milestoned
    path / interpolation elsewhere)."""
    from .glossing import chapter_lines, load_gloss, tick_windows

    out: list[ChapterRef] = []
    for ch in chapter_lines(books):
        book, chap = ch.book, ch.chapter
        ross_text = target_prose.get((book, chap), "")
        gloss = load_gloss(work_id, book, chap)
        if not ross_text or not gloss or not ch.lines:
            continue

        chap_citation = ch.lines[0].citation       # first line of the chapter
        anchors: list[RefAnchor] = [RefAnchor(chap_citation, 0, "chapter")]
        incipits: list[str] = [gloss.get(chap_citation, "").strip()]
        ref_parts: list[str] = []
        base = 0
        for w in tick_windows(ch):
            if not gloss.get(w.tick, "").strip() or w.tick == chap_citation:
                continue  # skip empty tick + the chapter-coincident tick
            # Fingerprint = the whole glossed window (line above + tick + below).
            # The tick alone often begins mid-sentence; the window disambiguates
            # and tames the worst mismatches (verified on the eval harness).
            fp = " ".join(gloss.get(ln.citation, "").strip() for ln in w.lines).strip()
            tier = "column" if w.is_column_start else "five_line"
            anchors.append(RefAnchor(w.tick, base, tier))
            incipits.append(fp)
            ref_parts.append(fp)
            base += len(fp) + 1

        glines = []
        cum = 0
        for ln in ch.lines:
            glines.append(GreekLine(ln.citation, cum))
            cum += len(ln.text.split())

        out.append(ChapterRef(book, str(chap), chap_citation, ross_text,
                              " ".join(ref_parts), anchors, glines,
                              gloss_incipits=incipits))
    return out
