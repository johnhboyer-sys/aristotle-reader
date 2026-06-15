"""Stage 1c: second English translation (W. D. Ross) from the MIT Internet
Classics Archive HTML, distributed across the Bekker columns.

Unlike the Rackham TEI (which carries Bekker page/line milestones), the Ross
text is plain prose divided only by book and chapter — every chapter begins
with a bare number on its own line. We parse it to {(book, chapter): prose},
then spread each chapter's prose across the Bekker columns its Greek spans,
proportionally to each column's share of the chapter's Greek lines and snapped
to sentence boundaries so a column break never splits a sentence. The result
mirrors the Rackham per-segment structure so the reader can show either
translation; Ross is chapter-anchored (no per-line Bekker gutter).
"""

from __future__ import annotations

import html
import json
import re
from collections import defaultdict
from pathlib import Path

from .config import BUILD_DIR, SOURCES_DIR

# Confidence levels the aligner produces that we trust as *real* Bekker ticks
# (vs. pure interpolation). Validated on NE Book 1 review: chapter/column/
# half_column at these levels read good; "uncertain" is downgraded to approximate.
_REAL_CONF = {"certain", "reliable"}

_TAG = re.compile(r"<[^>]+>")
_ROSS_DIR = SOURCES_DIR / "ross"
# Sentence boundary in English prose: end punctuation (+ optional closing
# quote/paren) followed by whitespace.
_SENT = re.compile(r"[.?!][\"')\]]?\s")

# A chapter marker on its own line. The MIT Internet Classics Archive uses a few
# styles: a bare number (Ross's NE), "Part N" (Smith's De Anima, Ross's
# Metaphysics), or "Part <Roman>" (Jowett's Politics). Each is matched to a
# capture group holding the chapter number (Arabic or Roman).
_CHAPTER_MARKERS = {
    "number": re.compile(r"\d{1,2}"),
    "part": re.compile(r"Part\s+(\d{1,2})"),
    "part_roman": re.compile(r"Part\s+([IVXLC]+)"),
}

_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def _marker_int(s: str) -> int:
    """A chapter marker's value: an Arabic number as-is, else Roman numerals."""
    if s.isdigit():
        return int(s)
    total = prev = 0
    for ch in reversed(s):
        v = _ROMAN[ch]
        total += -v if v < prev else v
        prev = max(prev, v)
    return total


def _book_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8", errors="replace")
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw, flags=re.S | re.I)
    m = re.search(r"<body.*?</body>", raw, flags=re.S | re.I)
    body = m.group(0) if m else raw
    return html.unescape(_TAG.sub("\n", body))


def parse_book(path: Path, marker: str = "number") -> dict[int, str]:
    """{chapter_number: prose} for one archive book file. Chapters start with a
    standalone marker line (bare number, or "Part N") in ascending sequence;
    stray numbers in the prose (years, counts) aren't alone on a line in
    sequence and are ignored."""
    pat = _CHAPTER_MARKERS[marker]
    txt = _book_text(path)
    i = txt.find("Translated by")
    if i >= 0:
        txt = txt[i:]
    for end in ("Commentary:", "How to cite", "-THE END-", "Buy Books", "Browse and Comment"):
        j = txt.find(end, 200)
        if j > 0:
            txt = txt[:j]
    chapters: dict[int, str] = {}
    cur: int | None = None
    buf: list[str] = []
    started = False
    for ln in (l.strip() for l in txt.split("\n")):
        m = pat.fullmatch(ln)
        if m:
            num = _marker_int(m.group(m.lastindex or 0))
            if (cur is None and num == 1) or (cur is not None and num == cur + 1):
                if cur is not None:
                    chapters[cur] = " ".join(" ".join(buf).split())
                cur, buf, started = num, [], True
                continue
        if started and ln:
            buf.append(ln)
    if cur is not None:
        chapters[cur] = " ".join(" ".join(buf).split())
    return chapters


def parse_translation(src_dir: Path, books: int, marker: str = "number") -> dict[tuple[int, int], str]:
    """{(book, chapter): prose} across an archive translation's book files."""
    out: dict[tuple[int, int], str] = {}
    for n in range(1, books + 1):
        path = src_dir / f"book-{n:02d}.html"
        if not path.exists():
            continue
        for ch, text in parse_book(path, marker).items():
            out[(n, ch)] = text
    return out


def parse_ross() -> dict[tuple[int, int], str]:
    """{(book, chapter): prose} across all ten Ross book files."""
    return parse_translation(_ROSS_DIR, 10, "number")


def _snap_word(text: str, off: int) -> int:
    """Snap a char offset to the nearest word start (so a gutter tick never
    splits a word)."""
    off = max(0, min(off, len(text)))
    if off <= 0 or off >= len(text):
        return off
    if text[off] == " ":
        return off + 1
    left = text.rfind(" ", 0, off)
    right = text.find(" ", off)
    cands = [c + 1 for c in (left, right) if c != -1]
    return min(cands, key=lambda c: abs(c - off)) if cands else off


def _ross_ticks(text: str, line_ns: list[int]) -> list[dict]:
    """Bekker line ticks down a Ross slice. Ross carries no Bekker milestones,
    so every tick is an estimate (real=False): the slice spans the Greek lines
    `line_ns` of its column, and ticks at the Greek cadence (line 1, then every
    5th) are placed proportionally by character offset, word-snapped."""
    L = len(text)
    if not line_ns or L == 0:
        return []
    first, last = line_ns[0], line_ns[-1]
    if last <= first:
        return [{"n": first, "offset": 0, "real": False}]
    start5 = ((first + 4) // 5) * 5
    targets = list(range(start5, last + 1, 5))
    if first <= 1 and 1 not in targets:
        targets.insert(0, 1)
    ticks, seen = [], set()
    for t in targets:
        off = _snap_word(text, round((t - first) / (last - first) * L))
        off = max(0, min(off, L))
        if off in seen:
            continue
        seen.add(off)
        ticks.append({"n": t, "offset": off, "real": False})
    ticks.sort(key=lambda x: x["offset"])
    return ticks


def _snap(text: str, target: int, low: int) -> int:
    """A cut position > `low`, near `target`, preferring a sentence boundary,
    then a word boundary, so a column break falls between sentences/words."""
    target = max(low + 1, min(target, len(text)))
    bounds = [m.end() for m in _SENT.finditer(text) if low < m.end() <= len(text)]
    cand = [b for b in bounds]
    if cand:
        best = min(cand, key=lambda b: abs(b - target))
        if best > low:
            return best
    sp = text.rfind(" ", low + 1, target)
    if sp > low:
        return sp + 1
    sp = text.find(" ", target)
    if sp > low:
        return sp + 1
    return target


def _chapter_segments(spine: dict, chapters: list[dict]):
    """Per book, walk segments in order and assign each Greek line to the
    running chapter, yielding {chapter_global_index: [(segment_id, column,
    [line_n, ...]), ...]} in document order, plus {global_index: (book, chapter)}.
    The line numbers let each Ross slice carry an interpolated Bekker gutter."""
    # Order chapters per book by their Greek start (column then line).
    by_book: dict[int, list[dict]] = defaultdict(list)
    for ch in chapters:
        by_book[ch["book"]].append(ch)

    segs_by_book: dict[int, list[dict]] = defaultdict(list)
    for seg in spine["segments"]:
        segs_by_book[seg["book"]].append(seg)

    result: dict[int, list[tuple[str, str, list[int]]]] = defaultdict(list)
    chapter_key: dict[int, tuple[int, int]] = {}  # global idx -> (book, chapter)
    gidx = 0
    for book, chs in by_book.items():
        segs = segs_by_book[book]
        col_order = {seg["column"]: i for i, seg in enumerate(segs)}
        chs_sorted = sorted(chs, key=lambda c: (col_order.get(c["column"], 0), int(c["line"])))
        # Each chapter gets a global index; record its (book, chapter).
        idx_of = {}
        for c in chs_sorted:
            idx_of[c["chapter"]] = gidx
            chapter_key[gidx] = (book, int(c["chapter"]))
            gidx += 1
        # Boundaries as (col_index, line) for advancing the running chapter.
        bounds = [(col_order.get(c["column"], 0), int(c["line"]), idx_of[c["chapter"]]) for c in chs_sorted]
        bi = 0
        cur = bounds[0][2] if bounds else None
        for ci, seg in enumerate(segs):
            run: list[int] = []
            for line in seg["lines"]:
                # Advance to the last chapter whose start is <= (ci, line.n).
                while bi + 1 < len(bounds) and (bounds[bi + 1][0], bounds[bi + 1][1]) <= (ci, line["n"]):
                    if run:
                        result[cur].append((seg["id"], seg["column"], run))
                        run = []
                    bi += 1
                    cur = bounds[bi][2]
                run.append(line["n"])
            if run and cur is not None:
                result[cur].append((seg["id"], seg["column"], run))
    return result, chapter_key


def _load_align_map(work_id: str, version_id: str) -> dict:
    """The aligner's standoff map {("book:chapter"): {anchors:[...]}} if present.
    Absent → empty, and we fall back to pure proportional interpolation."""
    path = BUILD_DIR / "align" / f"{work_id}_{version_id}_map.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return {}
    return {}


def _real_ticks(piece: str, lns: list[int], column: str,
                anchors: dict[str, dict], piece_start: int) -> list[dict]:
    """Bekker ticks for a translation piece, upgrading the column-start (line 1)
    and line-20 ticks to `real` where the alignment map has a confident anchor
    for them; the rest stay interpolated. `piece_start` is the piece's offset in
    the chapter's prose, so map offsets can be rebased into the piece."""
    by_n = {t["n"]: t for t in _ross_ticks(piece, lns)}
    for n in (1, 20):
        a = anchors.get(f"{column}{n}")
        if not a:
            continue
        rel = a["offset"] - piece_start
        if 0 <= rel <= len(piece):
            by_n[n] = {"n": n, "offset": _snap_word(piece, rel), "real": True}
    return sorted(by_n.values(), key=lambda t: t["offset"])


def build_chunks(spine: dict, chapters: list[dict],
                 prose: dict[tuple[int, int], str],
                 align_map: dict | None = None) -> dict[str, list[dict]]:
    """{segment_id: [{chapter, text, cont}]} for any chapter-keyed prose dict.
    `cont` marks the slice of a chapter that began in an earlier column (a
    continuation block). When `align_map` is present, column boundaries and the
    line 1/20 ticks come from real anchors; otherwise everything is
    proportionally interpolated."""
    seg_chapters, chapter_key = _chapter_segments(spine, chapters)
    ross = prose
    amap = align_map or {}
    by_seg: dict[str, list[dict]] = defaultdict(list)
    for gidx, segs in seg_chapters.items():
        book, chap = chapter_key[gidx]
        text = ross.get((book, chap), "")
        anchors = {a["citation"]: a
                   for a in (amap.get(f"{book}:{chap}") or {}).get("anchors", [])
                   if a.get("confidence") in _REAL_CONF}
        total = sum(len(lns) for _, _, lns in segs) or 1
        # Piece-end offsets: a column's start anchor where confident, else the
        # proportional estimate (kept strictly increasing).
        cuts = [0]
        cum = 0
        for i, (_seg_id, column, lns) in enumerate(segs):
            cum += len(lns)
            if i == len(segs) - 1:
                cuts.append(len(text))
                continue
            nxt_col = segs[i + 1][1]
            a = anchors.get(f"{nxt_col}1")
            cut = a["offset"] if a else None
            if cut is None or not (cuts[-1] < cut < len(text)):
                cut = _snap(text, round(len(text) * cum / total), cuts[-1])
            cuts.append(cut)
        for i, (seg_id, column, lns) in enumerate(segs):
            raw = text[cuts[i]:cuts[i + 1]]
            lead = len(raw) - len(raw.lstrip())
            piece = raw.strip()
            by_seg[seg_id].append({
                "chapter": str(chap),
                "text": piece,
                "cont": i > 0,
                "bekker": _real_ticks(piece, lns, column, anchors, cuts[i] + lead),
                "_g": gidx,
            })
    # Keep each segment's pieces in document (chapter) order; drop the sort key.
    out: dict[str, list[dict]] = {}
    for seg_id, pieces in by_seg.items():
        pieces.sort(key=lambda p: p["_g"])
        for p in pieces:
            p.pop("_g", None)
        out[seg_id] = pieces
    return out


def build_ross_chunks(spine: dict, chapters: list[dict],
                      work_id: str = "EN", version_id: str = "ross") -> dict[str, list[dict]]:
    """{segment_id: [{chapter, text, cont}]} for the NE Ross translation."""
    return build_chunks(spine, chapters, parse_ross(),
                        _load_align_map(work_id, version_id))


def run(manifest, spine: dict, english: dict) -> Path:
    # The secondary (unmarked) translation + its version id come from the
    # manifest's english.secondary block (NE Ross fallback); the aligner map for
    # this work/version, if built, upgrades column/line-20 ticks to real.
    from .align.reference import default_target

    version_id, prose = default_target(manifest.work_id)
    align_map = _load_align_map(manifest.work_id, version_id)
    chunks = build_chunks(spine, english.get("chapters", []), prose, align_map)
    out_dir = BUILD_DIR / "stage1"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "ross_chunks.json"
    path.write_text(json.dumps(chunks, ensure_ascii=False, indent=1), encoding="utf-8")
    return path
