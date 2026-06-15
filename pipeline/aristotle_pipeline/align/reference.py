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
from ..stage1_ross import _chapter_segments, parse_ross

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
        """The text right *after* each anchor (its incipit), parallel to
        ref_anchors. An anchor marks a position, so the sentence(s) that begin
        there are its fingerprint — matching those to the target finds the
        boundary, not a representative sentence somewhere mid-span."""
        bounds = [a.off for a in self.ref_anchors] + [len(self.ref_text)]
        out = []
        for i in range(len(self.ref_anchors)):
            seg = self.ref_text[bounds[i]:bounds[i + 1]]
            sents = re.findall(r'[^.!?]*[.!?]+(?:["\')\]]+)?\s*', seg) or [seg]
            inc = sents[0]
            k = 1
            while len(inc) < 80 and k < len(sents):    # too short to fingerprint
                inc += sents[k]
                k += 1
            out.append(inc[:max_chars])
        return out


def _section_offset(chunk: dict, chapter: str) -> int:
    for m in chunk.get("markers", []):
        if m["kind"] == "section" and str(m["n"]) == str(chapter):
            return m["offset"]
    return 0


def load_chapters(translation: str = "ross") -> list[ChapterRef]:
    spine = json.loads((_STAGE1 / "greek_spine.json").read_text(encoding="utf-8"))
    eng = json.loads((_STAGE1 / "english_chunks.json").read_text(encoding="utf-8"))
    chunks = eng["chunks"]
    eng_chapters = eng["chapters"]
    ross = parse_ross()

    by_bc = {(c["book"], c["column"]): c for c in chunks}
    col_index = {(c["book"], c["column"]): i for i, c in enumerate(chunks)}

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
        start_idx = col_index[(book, start_col)]
        start_off = _section_offset(by_bc[(book, start_col)], chap)

        nxt = eng_chapters[i + 1] if i + 1 < len(eng_chapters) else None
        if nxt is not None:
            end_idx = col_index[(nxt["book"], nxt["column"])]
            end_off = _section_offset(by_bc[(nxt["book"], nxt["column"])], str(nxt["chapter"]))
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
