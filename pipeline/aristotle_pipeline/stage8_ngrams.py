"""Stage 8: recurrent phrases across the whole corpus.

The pipeline's first CROSS-WORK stage. Every other stage builds one manifest per
invocation, but a phrase that appears once in the Physics and once in the
Metaphysics recurs in Aristotle and is exactly the kind a reader wants; deciding
that needs all the works at once. Stage 6 leaves each work's fold streams in
build/ngrams/<work>.json; this merges them.

Sharded by the phrase's fold-initial letter — the pattern the LSJ and the lemma
picker already use — and split again by what a reader actually needs when. The
browse list needs every phrase; only an EXPANDED phrase needs its offsets, and
keeping the two together made one shard 10.4 MB, which defeats the point of
sharding at all.

  build/dist/ngrams/<stream>/<letter>.json          the browse list
      { "<fold phrase>": [n, count, score, works] }

  build/dist/ngrams/<stream>/occ/<letter>-<n>.json  fetched on expand
      { "<fold phrase>": { "EN": [1204, 88, 310], "Meta": [90211] } }

Occurrences are per-work global offsets, delta-encoded after the first. The work
map doubles as the per-work breakdown, so a reader can be told "37 times across
5 works" from the browse list alone, without loading a single offset.

Rules, none of them re-derived here:
  * A phrase never spans a BOOK edge. Book bounds come from the same
    offsets.json the search uses.
  * A phrase never spans a token no index can key (a stage 3 key failure).
  * A phrase is kept only if it occurs at least twice CORPUS-WIDE.
  * Chapter straddling is NOT filtered at build time. It is a query-time toggle
    defaulting to keep, and dropping the occurrences here would make the toggle
    unimplementable. Each phrase records how many of its occurrences cross a
    chapter so the UI can say so.

Both streams are indexed: `form` (the surface word as written) and `lemma`. A
position licensing several lemmas contributes EVERY reading, not a chosen one —
excluding a reading here would put it beyond the reach of any later filter.
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from .config import BUILD_DIR

NS = (2, 3, 4, 5)
MIN_COUNT = 2          # corpus-wide; the whole point of a cross-work stage
STREAMS = ("form", "lemma")


def _shard_letter(phrase: str) -> str:
    first = phrase[0] if phrase else ""
    return first if "a" <= first <= "z" else "_"


def _readings(entry, limit: int = 0):
    """Every phrase a window of positions licenses, not a chosen one.

    19% of positions license more than one lemma. Picking one would make the
    other readings unfindable — and unlike a ranking, no later filter could
    recover them, because the phrase would never have been indexed. Expanding
    every combination costs 2.15x the n-gram occurrences measured corpus-wide,
    and the recurrence rule then prunes most of the exotic readings, since a
    phrase built from an unlikely lemma usually occurs once.
    """
    combos = [[]]
    for options in entry:
        combos = [c + [o] for c in combos for o in options]
        if limit and len(combos) > limit:
            return combos[:limit]
    return combos


def _phrases(stream: list, books: list[int], total: int):
    """Yield (gram, offset) for every n-gram that respects the boundaries.

    `stream` holds one LIST of options per position — a single item for the
    surface form, one or more lemmas where a token is ambiguous.
    """
    edges = books + [total]
    for b in range(len(edges) - 1):
        lo, hi = edges[b], edges[b + 1]
        for n in NS:
            for i in range(lo, hi - n + 1):
                window = stream[i:i + n]
                if any(o is None for o in window):
                    continue
                for reading in _readings(window):
                    yield " ".join(reading), i


def run() -> Path:
    source = BUILD_DIR / "ngrams"
    files = sorted(source.glob("*.json"))
    if not files:
        raise ValueError(
            "stage8: no per-work streams in build/ngrams — run stage6 for every work first"
        )

    counts: dict[str, Counter] = {s: Counter() for s in STREAMS}
    offsets: dict[str, dict[str, dict[str, list[int]]]] = {
        s: defaultdict(lambda: defaultdict(list)) for s in STREAMS
    }
    straddles: dict[str, Counter] = {s: Counter() for s in STREAMS}
    unigrams: dict[str, Counter] = {s: Counter() for s in STREAMS}
    tokens: dict[str, int] = {s: 0 for s in STREAMS}
    works: list[str] = []

    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        work, total = doc["work"], doc["token_count"]
        works.append(work)
        if len(doc["form"]) != total or len(doc["lemma"]) != total:
            raise ValueError(
                f"stage8: {work} stream length disagrees with its token_count "
                f"({len(doc['form'])}/{len(doc['lemma'])} vs {total}) — stale build"
            )
        books = [b["start"] for b in doc["book_bounds"]]
        chapters = {c["start"] for c in doc["chapter_bounds"]}

        for stream_name in STREAMS:
            # One list of options per position, so both streams n-gram the
            # same way: the form stream simply never has more than one.
            raw = doc[stream_name]
            stream = [
                None if e is None else ([e] if isinstance(e, str) else e)
                for e in raw
            ]
            for options in stream:
                if not options:
                    continue
                # Counted per licensed reading, matching how the phrases are
                # built, so the score's independence baseline is consistent.
                for token in options:
                    unigrams[stream_name][token] += 1
                    tokens[stream_name] += 1
            for gram, at in _phrases(stream, books, total):
                counts[stream_name][gram] += 1
                offsets[stream_name][gram][work].append(at)
                if any(x in chapters for x in range(at + 1, at + gram.count(" ") + 1)):
                    straddles[stream_name][gram] += 1

    summary: dict = {"works": len(works), "streams": {}}
    out_root = BUILD_DIR / "dist" / "ngrams"
    for stream_name in STREAMS:
        kept = {g: c for g, c in counts[stream_name].items() if c >= MIN_COUNT}
        total_tokens = tokens[stream_name]
        shards: dict[str, dict] = defaultdict(dict)
        occ_shards: dict[tuple, dict] = defaultdict(dict)
        for gram, count in kept.items():
            words = gram.split(" ")
            # Frequency-weighted pointwise mutual information: how much more
            # often the phrase occurs than independent words would predict,
            # weighted by how often it actually occurs so that a pair of rare
            # words meeting twice does not outrank a real formula. Generalises
            # to any n, unlike the 2x2 log-likelihood ratio.
            expected = total_tokens
            for word in words:
                expected *= unigrams[stream_name][word] / total_tokens
            score = count * math.log2(count / expected) if expected > 0 else 0.0
            per_work = {}
            for work, at in offsets[stream_name][gram].items():
                at.sort()
                per_work[work] = [at[0]] + [at[i] - at[i - 1] for i in range(1, len(at))]
            letter = _shard_letter(gram)
            n = len(words)
            # Browse row, positional to keep the list small: length, corpus
            # count, score, how many works, and how many occurrences straddle a
            # chapter (the query-time toggle needs to be able to say so).
            row = [n, count, round(score, 1), len(per_work)]
            straddle = straddles[stream_name][gram]
            if straddle:
                row.append(straddle)
            shards[letter][gram] = row
            occ_shards[(letter, n)][gram] = per_work

        out_dir = out_root / stream_name
        occ_dir = out_dir / "occ"
        occ_dir.mkdir(parents=True, exist_ok=True)
        for existing in list(out_dir.glob("*.json")) + list(occ_dir.glob("*.json")):
            existing.unlink()
        for letter, data in shards.items():
            (out_dir / f"{letter}.json").write_text(
                json.dumps(data, ensure_ascii=False), encoding="utf-8"
            )
        for (letter, n), data in occ_shards.items():
            (occ_dir / f"{letter}-{n}.json").write_text(
                json.dumps(data, ensure_ascii=False), encoding="utf-8"
            )
        by_n = Counter(len(g.split(" ")) for g in kept)
        summary["streams"][stream_name] = {
            "distinct": len(counts[stream_name]),
            "kept": len(kept),
            "occurrences": sum(kept.values()),
            "shards": len(shards),
            "by_n": {str(n): by_n[n] for n in NS},
        }

    (out_root / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    return out_root
