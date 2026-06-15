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

    def ref_segments(self) -> list[str]:
        """Rackham text between consecutive anchors (parallel to ref_anchors)."""
        bounds = [a.off for a in self.ref_anchors] + [len(self.ref_text)]
        return [self.ref_text[bounds[i]:bounds[i + 1]] for i in range(len(self.ref_anchors))]

    def ref_incipits(self, max_chars: int = 240) -> list[str]:
        """Fingerprint each anchor by the whole sentence *containing* its Bekker
        tick (extended if very short), parallel to ref_anchors. Column-start
        ticks begin a sentence; line-20 ticks fall mid-sentence, so anchoring on
        the enclosing sentence (not the raw fragment after the tick) gives the DP
        a clean unit to match against the target's sentences."""
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
    """(version_id, prose) for a work's secondary (unmarked) translation, from
    its manifest `english.secondary` block; falls back to the NE Ross corpus."""
    from ..config import SOURCES_DIR, Manifest
    from ..stage1_ross import parse_translation
    try:
        sec = (Manifest.for_work(work_id).data.get("english") or {}).get("secondary")
    except (FileNotFoundError, OSError):
        sec = None
    if sec:
        return sec.get("id", "sec"), parse_translation(
            SOURCES_DIR / sec["dir"], sec["books"], sec.get("marker", "number"))
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
