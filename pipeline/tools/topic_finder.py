#!/usr/bin/env python3
"""Deterministic candidate finder for topic search.

    cd pipeline && uv run python tools/topic_finder.py units
    cd pipeline && uv run python tools/topic_finder.py score --map <topic-map.yaml>
    cd pipeline && uv run python tools/topic_finder.py recall --key <key.json> --candidates <candidates.json>
    cd pipeline && uv run python tools/topic_finder.py parse-sorabji --table <md> --out <key.json>

units   one unit per English paragraph (a newline or a marker offset starts one; never across a book), with its Bekker
        span, its Greek lines and per-token lemma sets.
score   features per unit from a topic map, five rankers over them.
recall  how many of a scholar's key loci the rankers recover.

Every candidate carries the features that put it there. A check that examines
nothing (empty key, no units) fails.
"""

from __future__ import annotations

import argparse
import bisect
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.beta import to_beta_key  # noqa: E402
from aristotle_pipeline.stage6_search import fold_lemma  # noqa: E402

DEFAULT_DIST = ROOT / "build" / "dist"
DEFAULT_TOPICS = ROOT / "build" / "topics"
LONG_PARAGRAPH_MEDIAN = 400
TOP_N = 500
MAX_REVERSED = 10
RECALL_NS = (50, 100, 200, 300, 500)

# ---------------------------------------------------------------- Bekker refs

_REF = re.compile(r"^(\d+)([a-z])(\d+)$")
_COL = re.compile(r"^(\d+)([a-z])$")


def bekker_key(ref: str) -> tuple[int, int, int]:
    """Sort key for a Bekker ref like '1027a29': (page, column letter, line)."""
    m = _REF.match(ref)
    if not m:
        raise ValueError(f"not a Bekker ref: {ref!r}")
    return (int(m.group(1)), ord(m.group(2)), int(m.group(3)))


def col_line_key(column: str, line: int) -> tuple[int, int, int]:
    m = _COL.match(column)
    if not m:
        raise ValueError(f"not a Bekker column: {column!r}")
    return (int(m.group(1)), ord(m.group(2)), int(line))


def bekker_cmp(a: str, b: str) -> int:
    ka, kb = bekker_key(a), bekker_key(b)
    return (ka > kb) - (ka < kb)


def ranges_overlap(a: tuple[str, str], b: tuple[str, str]) -> bool:
    return bekker_key(a[0]) <= bekker_key(b[1]) and bekker_key(b[0]) <= bekker_key(a[1])


# ---------------------------------------------------------------------- units

_MARKUP = re.compile(r"\[\^[^\]]*\]|\[\[[^\]]*\]\]")
_WORD = re.compile(r"\w+(?:['’]\w+)*")


def clean_english(text: str) -> str:
    return _MARKUP.sub(" ", text)


def count_words(text: str) -> int:
    return len(_WORD.findall(clean_english(text)))


def key_ref(key: tuple[int, int, int]) -> str:
    return f"{key[0]}{chr(key[1])}{key[2]}"


def _chapter_int(ch: str) -> int | None:
    m = re.match(r"\d+", str(ch))
    return int(m.group()) if m else None


def build_book_units(work: str, book: int, book_doc: dict, chapters: list[dict],
                     analyses: dict) -> tuple[list[dict], Counter]:
    """Units of one book. `stats` counts tokens and tokens without analysis."""
    stats: Counter = Counter()
    text = ""
    anchors: list[tuple[int, str, int, bool]] = []  # (global offset, column, n, real)
    marker_cuts: set[int] = set()  # global offsets where a marker opens a paragraph
    seg_starts: list[tuple[int, str]] = []  # (global offset of a segment's English, column)
    greek_lines: list[tuple[tuple[int, int, int], dict]] = []
    for seg in book_doc["segments"]:
        col = seg["column"]
        for g in seg.get("greek") or []:
            greek_lines.append((col_line_key(col, g["n"]), g))
        eng = seg.get("english") or {}
        t = eng.get("text") or ""
        if text and t and not (text[-1].isspace() or t[0].isspace()):
            text += " "  # segments run together; a space keeps the words apart
        base = len(text)
        if t:
            seg_starts.append((base, col))
        for a in eng.get("bekker") or []:
            anchors.append((base + a["offset"], col, a["n"], bool(a.get("real", True))))
        for m in eng.get("markers") or []:
            marker_cuts.add(base + m["offset"])
        text += t
    greek_lines.sort(key=lambda kv: kv[0])
    line_keys = [k for k, _ in greek_lines]
    anchors.sort(key=lambda a: a[0])
    a_off = [a[0] for a in anchors]
    seg_off = [o for o, _ in seg_starts]

    def last_greek_line_of(col: str):
        """Key of the last Greek line of column `col`, or None."""
        m = _COL.match(col)
        hi = bisect.bisect_right(line_keys, (int(m.group(1)), ord(m.group(2)), 10**9))
        if hi and line_keys[hi - 1][:2] == (int(m.group(1)), ord(m.group(2))):
            return line_keys[hi - 1]
        return None
    if text.strip() and not anchors:
        raise ValueError(f"{work} book {book}: English text but no Bekker anchors")

    chap_marks = sorted(
        (bekker_key(c["column"] + str(c["line"])), c["chapter"]) for c in chapters
    )
    chap_keys = [k for k, _ in chap_marks]

    def anchor_at(pos: int):
        i = bisect.bisect_right(a_off, pos) - 1
        return anchors[max(i, 0)]

    units = []
    pos = 0
    idx = 0
    # A paragraph ends at a newline or where any marker (section, subsection,
    # paragraph) begins. Works without newlines keep their paragraphs only in
    # the markers.
    cuts = sorted({0, len(text)} | {i + 1 for i, c in enumerate(text) if c == "\n"}
                  | {c for c in marker_cuts if 0 <= c <= len(text)})
    for p_start, p_end in zip(cuts, cuts[1:]):
        para = text[p_start:p_end]
        pos = p_end
        stripped = para.strip()
        if not stripped:
            continue
        first = p_start + (len(para) - len(para.lstrip()))
        last = first + len(stripped) - 1
        a0, a1 = anchor_at(first), anchor_at(last)
        s_key = col_line_key(a0[1], a0[2])
        # The Greek runs to the line before the next anchor; the English that
        # follows the last anchor in the paragraph still translates those lines.
        ni = bisect.bisect_right(a_off, last)
        extra = {}
        next_key = None
        if ni < len(anchors) and anchors[ni][2] > 1:
            next_key = col_line_key(anchors[ni][1], anchors[ni][2])
            e_key = col_line_key(anchors[ni][1], anchors[ni][2] - 1)
        else:
            si = max(bisect.bisect_right(seg_off, last) - 1, 0)
            e_key = last_greek_line_of(seg_starts[si][1]) or s_key
        if next_key is not None and next_key < s_key:
            # the next anchor lies before the start: the source anchors are out of order
            stats["end_before_start"] += 1
            extra = {"reversed": True, "orig_start": key_ref(s_key), "orig_end": key_ref(e_key)}
        e_key = max(e_key, s_key)  # one line when the next anchor is on the start line
        start, end = key_ref(s_key), key_ref(e_key)
        lo = bisect.bisect_left(line_keys, s_key)
        hi = bisect.bisect_right(line_keys, e_key)
        lines = [g for _, g in greek_lines[lo:hi]]
        lemmas: list[list[str]] = []
        for g in lines:
            for tok in g.get("tokens") or []:
                got = analyses.get(tok.get("k")) or []
                ls = sorted({a["lemma"] for a in got if a.get("lemma")})
                if not ls:
                    stats["no_analysis"] += 1
                lemmas.append(ls)
        ci = bisect.bisect_right(chap_keys, s_key) - 1
        chapter = chap_marks[max(ci, 0)][1] if chap_marks else None
        idx += 1
        units.append({
            "id": f"{work}.{book}.{idx}",
            "work": work, "book": book, "index": idx, "chapter": chapter,
            "start": start, "end": end,
            "interp": not (a0[3] and a1[3]),
            "greek": " ".join(g["text"] for g in lines),
            "lemmas": lemmas,
            "english": stripped,
            "n_greek_tokens": len(lemmas),
            "n_english_words": count_words(stripped),
            **extra,
        })
    return units, stats


def load_work_names(dist: Path) -> list[str]:
    return sorted(p.parent.name for p in dist.glob("*/manifest.json"))


def cmd_units(args) -> int:
    dist = Path(args.dist)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    per_work: dict[str, list[int]] = {}
    zero_greek = 0
    no_analysis = 0
    tokens = 0
    reversed_ids: list[str] = []
    total = 0
    with out.open("w", encoding="utf-8") as fh:
        for work in load_work_names(dist):
            manifest = json.loads((dist / work / "manifest.json").read_text("utf-8"))
            chapters = json.loads((dist / work / "chapters.json").read_text("utf-8"))
            analyses = json.loads((dist / work / "analyses.json").read_text("utf-8"))
            for b in manifest["books"]:
                book = b["book"]
                doc = json.loads((dist / work / f"book-{book:02d}.json").read_text("utf-8"))
                units, st = build_book_units(work, book, doc, chapters.get(str(book), []), analyses)
                no_analysis += st["no_analysis"]
                for u in units:
                    fh.write(json.dumps(u, ensure_ascii=False) + "\n")
                    per_work.setdefault(work, []).append(u["n_english_words"])
                    if u.get("reversed"):
                        reversed_ids.append(u["id"])
                    tokens += u["n_greek_tokens"]
                    zero_greek += u["n_greek_tokens"] == 0
                    total += 1
    print(f"units: {total}  ({out})")
    print("per work (units, median English words, max):")
    for w, ws in per_work.items():
        print(f"  {w:8s} {len(ws):6d}  median {statistics.median(ws):7.1f}  max {max(ws)}")
    print(f"units with zero Greek tokens: {zero_greek}")
    print(f"Greek tokens: {tokens}; tokens with no analysis: {no_analysis}")
    print(f"reversed: {len(reversed_ids)} (end before start in the source; end set to start)")
    for uid in reversed_ids:
        print(f"  reversed {uid}")
    for w, ws in per_work.items():
        if statistics.median(ws) > LONG_PARAGRAPH_MEDIAN:
            print(f"WARN long paragraphs: {w}")
    if total == 0:
        print("no units built", file=sys.stderr)
        return 1
    if len(reversed_ids) > MAX_REVERSED:
        print(f"{len(reversed_ids)} reversed units exceed the limit of {MAX_REVERSED}", file=sys.stderr)
        return 1
    return 0


def read_units(path: Path) -> list[dict]:
    with Path(path).open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


# -------------------------------------------------------------- phrase matching


def match_phrase(token_sets: list, words: list, max_gap: int = 3) -> int:
    """Number of start tokens from which `words` match in order, with at most
    `max_gap` tokens between consecutive words. token_sets[i] is the set of
    lemma keys of token i; words[j] is the set of corpus keys for word j."""
    n = len(token_sets)

    def hit(i: int, j: int) -> bool:
        return not words[j].isdisjoint(token_sets[i])

    def chain(i: int, j: int) -> bool:  # token i matched word j
        if j == len(words) - 1:
            return True
        for k in range(i + 1, min(i + 2 + max_gap, n)):
            if hit(k, j + 1) and chain(k, j + 1):
                return True
        return False

    return sum(1 for i in range(n) if hit(i, 0) and chain(i, 0))


# --------------------------------------------------------------------- anchors

_ANCHOR = re.compile(r"^(?P<work>[A-Za-z]+)\s+(?P<spec>[\d.\-–]+)$")


def parse_anchor(text: str, work_books: dict[str, int]) -> tuple[str, int | None, int, int]:
    """'Meta 6.3' -> (Meta, 6, 3, 3); 'Phys 2.4-8' -> (Phys, 2, 4, 8);
    'Int 9' -> (Int, 1, 9, 9). Raises ValueError on anything else."""
    m = _ANCHOR.match(text.strip())
    if not m:
        raise ValueError(f"cannot parse anchor {text!r}")
    work, spec = m.group("work"), m.group("spec").replace("–", "-")
    if work not in work_books:
        raise ValueError(f"anchor {text!r}: unknown work {work!r}")
    if work_books[work] == 1:
        mm = re.match(r"^(\d+)(?:-(\d+))?$", spec)
        if not mm:
            raise ValueError(f"cannot parse anchor {text!r} (single-book work wants a chapter)")
        return work, 1, int(mm.group(1)), int(mm.group(2) or mm.group(1))
    mm = re.match(r"^(\d+)\.(\d+)(?:-(\d+))?$", spec)
    if not mm:
        raise ValueError(f"cannot parse anchor {text!r} (multi-book work wants Book.Chapter)")
    return work, int(mm.group(1)), int(mm.group(2)), int(mm.group(3) or mm.group(2))


# ------------------------------------------------------------------ score


def english_regex(entries: list[str]):
    if not entries:
        return None
    alts = sorted({e.strip() for e in entries if e.strip()}, key=lambda s: (-len(s), s))
    body = "|".join(r"\s+".join(re.escape(w) for w in a.split()) for a in alts)
    return re.compile(rf"(?<!\w)(?:{body})(?!\w)", re.IGNORECASE)


def collect_corpus_keys(dist: Path) -> set[str]:
    """Every raw lemma key over every analyses.json."""
    raw: set[str] = set()
    for work in load_work_names(dist):
        analyses = json.loads((dist / work / "analyses.json").read_text("utf-8"))
        for entries in analyses.values():
            for a in entries:
                if a.get("lemma"):
                    raw.add(a["lemma"])
    return raw


_ACCENT_ETC = re.compile(r"[/\\=^]|\d+$")
_LENGTH = re.compile(r"[\^_]")
_HOMOGRAPH = re.compile(r"(\d+)$")
_ENTRY_DIGIT = re.compile(r"^(.*?)(\d+)$")


def _breathing_key(beta: str) -> str:
    """Beta key without accents, `^` or a trailing homograph digit: what is
    left is letters, breathings, iota subscripts and diaereses."""
    return _ACCENT_ETC.sub("", beta)


def _exact_key(raw: str) -> tuple[str, str]:
    """(key without length marks and homograph digit, the digit or '')."""
    m = _HOMOGRAPH.search(raw)
    digit = m.group(1) if m else ""
    return _LENGTH.sub("", raw[: len(raw) - len(digit)]), digit


def breathing_collisions(word: str, keys: set[str]) -> list[str]:
    """Corpus keys the map word matched only after fold_lemma dropped a
    difference (a breathing: ἐξ against ἕξ)."""
    want = _breathing_key(to_beta_key(_ENTRY_DIGIT.sub(r"\1", word)))
    return sorted(k for k in keys if _breathing_key(k) != want)


class CorpusIndex:
    def __init__(self, raw: set[str]):
        self.exact: dict[str, set[str]] = defaultdict(set)
        self.folded: dict[str, set[str]] = defaultdict(set)
        for k in raw:
            self.exact[_exact_key(k)[0]].add(k)
            self.folded[fold_lemma(k)].add(k)


def resolve_word(word: str, index: CorpusIndex) -> tuple[set[str], str]:
    """(keys, mode): mode is 'exact' or 'fallback'. Exact keeps accents and
    breathings; fold_lemma matching runs only when exact finds nothing. An
    entry ending in a digit matches only that homograph."""
    m = _ENTRY_DIGIT.match(word)
    base, digit = (m.group(1), m.group(2)) if m else (word, "")
    beta = to_beta_key(base)
    pool = index.exact.get(_LENGTH.sub("", beta), set())
    got = {k for k in pool if not digit or _exact_key(k)[1] == digit}
    if got:
        return got, "exact"
    pool = index.folded.get(fold_lemma(beta), set())
    return {k for k in pool if not digit or _exact_key(k)[1] == digit}, "fallback"


def resolve_map(tm: dict, corpus: set[str]):
    """Resolve every lemma and phrase word of the map. Returns
    (spec, table, failures, notes): spec has per-section lemma key sets and
    phrase word-set lists; table rows are (entry, sorted keys); notes are the
    FALLBACK and AMBIGUOUS lines."""
    index = corpus if isinstance(corpus, CorpusIndex) else CorpusIndex(corpus)
    table: list[tuple[str, list[str]]] = []
    failures: list[str] = []
    notes: list[str] = []
    cache: dict[str, set[str]] = {}

    def word(w: str, where: str) -> set[str]:
        if w not in cache:
            keys, mode = resolve_word(w, index)
            cache[w] = keys
            table.append((w, sorted(keys)))
            if keys and mode == "fallback":
                notes.append(f"FALLBACK {w} -> {', '.join(sorted(keys))}")
                for k in breathing_collisions(w, keys):
                    failures.append(f"{where}: {w} collides with corpus key {k} (breathing differs)")
            if len({_exact_key(k)[0] for k in keys}) == 1 and len(keys) > 1 and not _ENTRY_DIGIT.match(w):
                notes.append(f"AMBIGUOUS {w} -> {', '.join(sorted(keys))}")
        if not cache[w]:
            failures.append(f"{where}: {w}")
        return cache[w]

    def section(sec: dict, where: str) -> dict:
        lem: set[str] = set()
        for w in sec.get("lemmas") or []:
            lem |= word(w, f"{where} lemma")
        phr = []
        for p in sec.get("phrases") or []:
            phr.append((p, [word(w, f"{where} phrase '{p}'") for w in p.split()]))
        eng = [str(e) for e in sec.get("english") or []]
        for e in eng:
            if not e.strip():
                failures.append(f"{where}: blank English entry {e!r}")
        return {"lemmas": lem, "phrases": phr, "english": eng}

    spec = {"core": section(tm.get("core") or {}, "core"), "problems": {}, "logical": set()}
    for name, sec in (tm.get("problems") or {}).items():
        spec["problems"][name] = section(sec, name)
    for w in (tm.get("logical_context") or {}).get("lemmas") or []:
        spec["logical"] |= word(w, "logical_context lemma")
    return spec, table, failures, notes


_TERM_LETTER = re.compile(r"^[Α-Ω]$")


def term_letter_count(greek: str) -> int:
    return sum(1 for t in re.split(r"[\s,.;:·]+", greek) if _TERM_LETTER.match(t))


def section_hits(sec: dict, lemmas: list[list[str]]):
    sets = [set(l) for l in lemmas]
    lemma_hits = sum(1 for s in sets if not sec["lemmas"].isdisjoint(s))
    phrase_hits = sum(match_phrase(sets, words) for _, words in sec["phrases"] if words)
    return lemma_hits, phrase_hits


def unit_features(u: dict, spec: dict, en_core, en_prob: dict, anchor_set: set) -> dict:
    core = spec["core"]
    lh, ph = section_hits(core, u["lemmas"])
    clean = clean_english(u["english"])
    eh = len(en_core.findall(clean)) if en_core else 0
    ntok, nw = u["n_greek_tokens"], u["n_english_words"]
    probs = {}
    for name, sec in spec["problems"].items():
        a, b = section_hits(sec, u["lemmas"])
        rx = en_prob.get(name)
        probs[name] = a + b + (len(rx.findall(clean)) if rx else 0)
    sets = [set(l) for l in u["lemmas"]]
    logical = any(not spec["logical"].isdisjoint(s) for s in sets) or term_letter_count(u["greek"]) >= 2
    ch = _chapter_int(u["chapter"]) if u["chapter"] is not None else None
    near = ch is not None and any((u["work"], u["book"], c) in anchor_set for c in (ch - 1, ch, ch + 1))
    return {
        "id": u["id"], "work": u["work"], "book": u["book"], "chapter": u["chapter"],
        "start": u["start"], "end": u["end"],
        "n_greek_tokens": ntok, "n_english_words": nw,
        "core_lemma_hits": lh, "core_phrase_hits": ph, "core_en_hits": eh,
        "core_density": (lh + ph) * 100.0 / ntok if ntok else 0.0,
        "problems": probs, "logical": bool(logical), "anchor_near": bool(near),
    }


def _n_probs(f: dict) -> int:
    return sum(1 for v in f["problems"].values() if v >= 2)


def _bilingual(f: dict) -> float:
    en = f["core_en_hits"] * 100.0 / f["n_english_words"] if f["n_english_words"] else 0.0
    return f["core_density"] + en


RANKERS = {
    "greek_density": lambda f: (f["core_density"], f["core_lemma_hits"]),
    "greek_count": lambda f: (f["core_lemma_hits"] + f["core_phrase_hits"],),
    "bilingual": lambda f: (_bilingual(f),),
    "problem_only": lambda f: (
        (1, _n_probs(f), sum(f["problems"].values()))
        if f["core_lemma_hits"] + f["core_phrase_hits"] + f["core_en_hits"] == 0
        else (0, 0, 0)
    ),
    "combined": lambda f: (_bilingual(f) + 0.5 * _n_probs(f),),
}


def _score_tuple(name: str, f: dict) -> tuple:
    return RANKERS[name](f)


def unit_order_key(f: dict) -> tuple:
    return (f["work"], f["book"], int(f["id"].rsplit(".", 1)[1]))


def rank_units(feats: list[dict], name: str) -> list[dict]:
    """Full ordering: score descending, ties by unit id (work, book, index)."""
    def key(f):
        t = _score_tuple(name, f)
        return tuple(-x for x in t), unit_order_key(f)
    return sorted(feats, key=key)


def cmd_score(args) -> int:
    import yaml

    dist = Path(args.dist)
    tm = yaml.safe_load(Path(args.map).read_text("utf-8"))
    topic = tm["topic"]
    spec, table, failures, notes = resolve_map(tm, collect_corpus_keys(dist))
    print("lemma resolution (map entry -> corpus lemma keys):")
    for entry, keys in table:
        print(f"  {entry} -> {', '.join(keys) if keys else 'NONE'}")
    for n in notes:
        print(n)
    if failures:
        print("\nUNRESOLVED, COLLIDING or BLANK map entries:", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1

    work_books = {}
    for w in load_work_names(dist):
        work_books[w] = len(json.loads((dist / w / "manifest.json").read_text("utf-8"))["books"])
    anchor_set: set = set()
    bad = []
    for group, items in (tm.get("anchors") or {}).items():
        for item in items:
            try:
                work, book, c0, c1 = parse_anchor(item, work_books)
            except ValueError as e:
                bad.append(str(e))
                continue
            anchor_set.update((work, book, c) for c in range(c0, c1 + 1))
    if bad:
        print("unparseable anchors:", file=sys.stderr)
        for b in bad:
            print(f"  {b}", file=sys.stderr)
        return 1

    en_core = english_regex(spec["core"]["english"])
    en_prob = {n: english_regex(s["english"]) for n, s in spec["problems"].items()}

    units_path = Path(args.units)
    units = read_units(units_path)
    if not units:
        print("units file is empty", file=sys.stderr)
        return 1
    feats = [unit_features(u, spec, en_core, en_prob, anchor_set) for u in units]
    del units

    out_dir = Path(args.out_dir) if args.out_dir else DEFAULT_TOPICS / topic
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "features.jsonl").open("w", encoding="utf-8") as fh:
        for f in feats:
            fh.write(json.dumps(f, ensure_ascii=False) + "\n")

    by_id = {f["id"]: f for f in feats}
    rankers = {}
    for name in RANKERS:
        order = rank_units(feats, name)
        rankers[name] = {
            "top": [
                {"id": f["id"], "score": _score_tuple(name, f), "features": f}
                for f in order[:TOP_N]
            ],
            "order": [f["id"] for f in order],
        }
    cand = {"topic": topic, "n_units": len(feats), "rankers": rankers}
    (out_dir / "candidates.json").write_text(json.dumps(cand, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(feats)} units scored; wrote {out_dir}/candidates.json and features.jsonl")
    for name, r in rankers.items():
        top = by_id[r["top"][0]["id"]]
        print(f"  {name}: top unit {top['id']} {top['start']}-{top['end']}")
    return 0


# ------------------------------------------------------------ Sorabji table

WORKS = {
    "Metaph.": "Meta", "Phys.": "Phys", "Int.": "Int", "Cael.": "Cael", "GC": "GC",
    "PA": "PA", "APo": "APo", "APr": "APr", "GA": "GA", "DA": "DA", "SE": "SE",
    "MA": "MA", "Poet.": "Poet", "Rhet.": "Rhet", "EN": "EN", "EE": "EE",
}
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50}


def roman_to_int(s: str) -> int:
    total = 0
    for i, ch in enumerate(s):
        v = _ROMAN[ch]
        total += -v if i + 1 < len(s) and _ROMAN[s[i + 1]] > v else v
    return total


_DASH = re.compile(r"[–—]")
_FULL = re.compile(r"^(\d+)([ab])(\d+)$")
_COLLINE = re.compile(r"^([ab])(\d+)$")
_LINE = re.compile(r"^(\d+)$")


def _parse_range(tok: str) -> tuple[str, str]:
    """'1027a29-b16' -> ('1027a29', '1027b16'); an abbreviated end takes the
    start's page (and column). The start must be a full ref."""
    parts = tok.strip().split("-")
    m = _FULL.match(parts[0])
    if not m or len(parts) > 2:
        raise ValueError(f"bad range {tok!r}")
    page, col, line = m.groups()
    start = f"{page}{col}{line}"
    if len(parts) == 1:
        return start, start
    e = parts[1]
    if _FULL.match(e):
        end = e
    elif _COLLINE.match(e):
        end = f"{page}{e}"
    elif _LINE.match(e):
        end = f"{page}{col}{e}"
    else:
        raise ValueError(f"bad range end {tok!r}")
    if bekker_key(end) < bekker_key(start):
        raise ValueError(f"range ends before it starts: {tok!r}")
    return start, end


_PAREN = re.compile(r"\([^()]*\)")
_CHAP = re.compile(r"^(?:(?P<roman>[IVXL]+)\s+)?(?P<chap>\d+(?:-\d+)?),\s*(?P<rest>.*)$")


def parse_locus(cell: str) -> dict:
    """Parse a Locus cell into work, book, chapter and ranges. Raises
    ValueError when any part cannot be read. Parenthetical cites are sub-ranges
    Sorabji names inside the passage; they are dropped, not matched."""
    raw = cell.strip()
    text = _DASH.sub("-", _PAREN.sub("", raw))
    text = re.sub(r"\s+", " ", text).strip()
    m = re.match(r"^(\S+)\s+(.*)$", text)
    if not m or m.group(1) not in WORKS:
        raise ValueError(f"unknown work in {raw!r}")
    work, body = WORKS[m.group(1)], m.group(2)
    chunks = re.split(r";\s*(?=[IVXL]+\s+\d)", body)
    book = None
    chapters = []
    ranges: list[tuple[str, str]] = []
    for chunk in chunks:
        cm = _CHAP.match(chunk)
        if not cm:
            raise ValueError(f"no chapter in {chunk!r}")
        if book is None:
            book = roman_to_int(cm.group("roman")) if cm.group("roman") else 1
        chapters.append(cm.group("chap"))
        for tok in re.split(r"\s*(?:;|,|\band\b)\s*", cm.group("rest").strip()):
            if tok:
                ranges.append(_parse_range(tok))
    if not ranges:
        raise ValueError(f"no ranges in {raw!r}")
    return {"work": work, "book": book, "chapter": "; ".join(chapters),
            "ranges": [list(r) for r in ranges]}


def parse_pages(cell: str, previous: int | None) -> int:
    t = _DASH.sub("-", cell.strip())
    if t == "(same)":
        if previous is None:
            raise ValueError("'(same)' with no previous row")
        return previous
    if re.fullmatch(r"\d+", t):
        return int(t)
    if re.fullmatch(r"\d+(?: \+ \d+)+", t):
        return sum(int(x) for x in t.split("+"))
    m = re.fullmatch(r"\d+-(\d+) each", t)
    if m:
        return int(m.group(1))
    raise ValueError(f"cannot parse pages {cell!r}")


def parse_sorabji_table(md: str) -> dict:
    sec = md.split("### Locus table", 1)
    if len(sec) < 2:
        raise ValueError("no '### Locus table' section")
    loci, unparsed = [], []
    prev_pages = None
    for line in sec[1].splitlines():
        if line.startswith("## ") or line.startswith("### "):
            break
        if not re.match(r"^\|\s*\d+\s*\|", line):
            if loci or unparsed:
                break  # the table ended
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        row, locus_cell, bucket = int(cells[0]), cells[1], cells[4]
        try:
            pages = parse_pages(cells[3], prev_pages)
            prev_pages = pages
            loc = parse_locus(locus_cell)
        except ValueError as e:
            unparsed.append({"row": row, "cell": locus_cell, "pages_cell": cells[3], "error": str(e)})
            continue
        loci.append({"row": row, **loc, "pages": pages, "bucket": bucket,
                     "core": pages >= 8 and bucket != "B"})
    return {"source": "docs/topic-search/research/sorabji-method.md, Locus table",
            "loci": loci, "unparsed": unparsed}


def cmd_parse_sorabji(args) -> int:
    key = parse_sorabji_table(Path(args.table).read_text("utf-8"))
    if not key["loci"] or key["unparsed"]:
        for u in key["unparsed"]:
            print(f"  unparsed row {u['row']}: {u['cell']}  ({u['error']})", file=sys.stderr)
        print(f"{len(key['loci'])} loci parsed, {len(key['unparsed'])} unparsed: key not written",
              file=sys.stderr)
        return 1
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(key, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(key['loci'])} loci ({sum(l['core'] for l in key['loci'])} core); "
          f"{len(key['unparsed'])} unparsed -> {args.out}")
    for u in key["unparsed"]:
        print(f"  unparsed row {u['row']}: {u['cell']}  ({u['error']})")
    return 0


# ------------------------------------------------------------------ recall


def cmd_recall(args) -> int:
    key = json.loads(Path(args.key).read_text("utf-8"))
    loci = key.get("loci") or []
    unparsed = key.get("unparsed") or []
    cand_path = Path(args.candidates)
    cand = json.loads(cand_path.read_text("utf-8"))
    keyname = Path(args.key).stem
    n_core = sum(1 for l in loci if l["core"])
    header = f"examined {len(loci)} loci ({n_core} core); unresolved {{u}}; unparsed {len(unparsed)}"
    if not loci:
        print(header.format(u=0))
        print("key has no loci: nothing examined", file=sys.stderr)
        return 1

    units = read_units(Path(args.units) if args.units else DEFAULT_TOPICS / "units.jsonl")
    total = len(units)
    if total == 0:
        print("no units: nothing examined", file=sys.stderr)
        return 1
    rankers = cand.get("rankers") or {}
    if not rankers:
        print("candidates have no rankers: nothing examined", file=sys.stderr)
        return 1
    for name, r in rankers.items():
        if not r.get("order"):
            print(f"ranker {name} has an empty order: nothing examined", file=sys.stderr)
            return 1
    feat_path = Path(args.features) if args.features else cand_path.parent / "features.jsonl"
    feats = {}
    if feat_path.exists():
        for f in read_units(feat_path):
            feats[f["id"]] = f

    by_work = defaultdict(list)
    for u in units:
        by_work[u["work"]].append((u["id"], u["start"], u["end"]))

    hit_units: dict[int, set[str]] = {}
    unresolved = []
    for l in loci:
        ids = set()
        for uid, s, e in by_work.get(l["work"], ()):
            if any(ranges_overlap((s, e), tuple(r)) for r in l["ranges"]):
                ids.add(uid)
        hit_units[l["row"]] = ids
        if not ids:
            unresolved.append(l)
    resolved = [l for l in loci if hit_units[l["row"]]]
    res_core = [l for l in resolved if l["core"]]

    out = [header.format(u=len(unresolved)), ""]
    if unresolved:
        out.append("UNRESOLVED (no unit overlaps the range; a data or parsing error, not a miss):")
        for l in unresolved:
            out.append(f"  row {l['row']} {l['work']} {l['book']}.{l['chapter']} "
                       f"{l['ranges']}{' [core]' if l['core'] else ''}")
        out.append("")
    if unparsed:
        out.append("UNPARSED rows:")
        for u in unparsed:
            out.append(f"  row {u['row']}: {u['cell']}")
        out.append("")
    out.append(f"Recall over resolved loci ({len(res_core)} core, {len(resolved)} all); "
               f"{total} units in all.")
    out.append("")
    head = "| ranker | " + " | ".join(f"N={n} ({100.0 * n / total:.2f}%)" for n in RECALL_NS) + " |"
    out += [head, "|---|" + "---|" * len(RECALL_NS)]

    best: dict[str, dict[int, int | None]] = {}
    for name, r in cand["rankers"].items():
        rank = {uid: i + 1 for i, uid in enumerate(r["order"])}
        best[name] = {}
        for l in resolved:
            ranks = [rank[u] for u in hit_units[l["row"]] if u in rank]
            best[name][l["row"]] = min(ranks) if ranks else None

        def frac(group, n):
            if not group:
                return "n/a"
            k = sum(1 for l in group if best[name][l["row"]] is not None and best[name][l["row"]] <= n)
            return f"{k}/{len(group)} {100.0 * k / len(group):.0f}%"
        cells = [f"core {frac(res_core, n)}; all {frac(resolved, n)}" for n in RECALL_NS]
        out.append(f"| {name} | " + " | ".join(cells) + " |")

    out += ["", "Core loci missed at N=300 (best rank anywhere in the full order; features of that best unit):"]
    for name in cand["rankers"]:
        missed = [l for l in res_core
                  if best[name][l["row"]] is None or best[name][l["row"]] > 300]
        out.append("")
        out.append(f"{name}: {len(missed)} missed")
        for l in missed:
            br = best[name][l["row"]]
            f = None
            if br is not None:
                rank_order = cand["rankers"][name].get("order") or []
                uid = rank_order[br - 1] if rank_order else None
                f = feats.get(uid)
            desc = f"  row {l['row']} {l['work']} {l['book']}.{l['chapter']} p{l['pages']} b{l['bucket']}: best rank {br}"
            if f:
                desc += (f"; core hits {f['core_lemma_hits']}+{f['core_phrase_hits']} Greek, "
                         f"{f['core_en_hits']} English; problem hits {f['problems']}; "
                         f"logical {f['logical']}; anchor_near {f['anchor_near']}")
            out.append(desc)

    text = "\n".join(out) + "\n"
    print(text)
    (cand_path.parent / f"recall-{keyname}.md").write_text(text, encoding="utf-8")
    if any(l["core"] for l in unresolved):
        print("unresolved core loci", file=sys.stderr)
        return 1
    return 0


# -------------------------------------------------------------------- main


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    u = sub.add_parser("units")
    u.add_argument("--dist", default=str(DEFAULT_DIST))
    u.add_argument("--out", default=str(DEFAULT_TOPICS / "units.jsonl"))
    u.set_defaults(fn=cmd_units)
    s = sub.add_parser("score")
    s.add_argument("--map", required=True)
    s.add_argument("--dist", default=str(DEFAULT_DIST))
    s.add_argument("--units", default=str(DEFAULT_TOPICS / "units.jsonl"))
    s.add_argument("--out-dir")
    s.set_defaults(fn=cmd_score)
    r = sub.add_parser("recall")
    r.add_argument("--key", required=True)
    r.add_argument("--candidates", required=True)
    r.add_argument("--units")
    r.add_argument("--features")
    r.set_defaults(fn=cmd_recall)
    p = sub.add_parser("parse-sorabji")
    p.add_argument("--table", required=True)
    p.add_argument("--out", required=True)
    p.set_defaults(fn=cmd_parse_sorabji)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
