"""Stage 9: one search index for the whole corpus, sharded by a word's first
two letters.

A search over every work used to fetch every work's index: an English query
about 98 files and 7.2 MB gzipped, a Greek one 3.8 MB. On a phone that is
seconds of waiting, and a burst that size is what makes Safari drop requests.
A word's postings in every work now sit in one shard, so a query fetches only
the shards its words can fall in: "happiness" is one shard of about 80 KB.

A corpus-wide stage, like stage 8: it reads the per-work indexes stage 7 left
in build/dist and writes

  build/dist/search-shards/index.json
      {"streams": {stream: {"shards": [name, ...],
                            "sources": {source: sha256-prefix, ...}}}}

  build/dist/search-shards/<stream>/<shard>.json
      {word: {source: postings}}

Streams and the per-work files they copy:
  lemma    search/greek_lemma.json, source = the work id
  form     search/greek_form.json,  source = the work id
  english  search/english.json and search/english-<slot>.json,
           source = "<work>/english" for the primary, "<work>/<slot>" beyond it

Postings are copied unchanged, so a seg_idx still counts positions in that
work's meta.json and the reader's matching code runs on them as it always
has. A source's hash is of the per-work file it was copied from: the deploy
check recomputes it to refuse shards older than the indexes beside them.
The per-work files stay: combo and grammatical search still read them, and the
reader falls back to them for a source the shards do not list.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from collections import defaultdict
from pathlib import Path

from .config import BUILD_DIR

SHARD_DIR = "search-shards"
GREEK_FILES = {"lemma": "greek_lemma.json", "form": "greek_form.json"}
STREAMS = (*GREEK_FILES, "english")


def shard_name(word: str) -> str:
    """The shard a word is filed under: its first two characters, each a-z
    kept and anything else (an apostrophe, or no character at all in a
    one-letter word) written as '_'. Mirrored by shardName() in
    shared/lib/search.ts and pinned by tests/fixtures/search_shards.json."""
    return "".join(c if "a" <= c <= "z" else "_" for c in (word + "__")[:2])


def index_sources(work_dir: Path) -> list[tuple[str, str, Path]]:
    """(stream, source, path) for every per-work index a work carries. The
    Greek indexes and the primary English one are always emitted, so their
    absence is an error the caller reports; the translations beyond the
    primary are whatever english-<slot>.json files stage 7 wrote."""
    search = work_dir / "search"
    work = work_dir.name
    out = [(stream, work, search / name) for stream, name in GREEK_FILES.items()]
    out.append(("english", f"{work}/english", search / "english.json"))
    for path in sorted(search.glob("english-*.json")):
        out.append(("english", f"{work}/{path.stem[len('english-'):]}", path))
    return out


def source_hash(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()[:16]


def run(dist: Path | None = None) -> Path:
    dist = dist or BUILD_DIR / "dist"
    works = sorted(p.parent.parent for p in dist.glob("*/search/meta.json"))
    if not works:
        raise ValueError(f"stage9: no work in {dist} has a search index — run stage7 first")

    # Each word's postings are kept as the compact JSON text they will be
    # written as, not as lists of pairs: the corpus holds millions of postings,
    # and as Python lists they would cost gigabytes.
    shards: dict[str, dict[str, dict[str, dict[str, str]]]] = {
        stream: defaultdict(dict) for stream in STREAMS
    }
    sources: dict[str, dict[str, str]] = {stream: {} for stream in STREAMS}
    postings = {stream: 0 for stream in STREAMS}
    for work_dir in works:
        for stream, source, path in index_sources(work_dir):
            if not path.exists():
                raise ValueError(f"stage9: {work_dir.name} has no search/{path.name}")
            raw = path.read_bytes()
            sources[stream][source] = source_hash(raw)
            for word, plist in json.loads(raw).items():
                shards[stream][shard_name(word)].setdefault(word, {})[source] = (
                    json.dumps(plist, separators=(",", ":"))
                )
                postings[stream] += len(plist)

    out = dist / SHARD_DIR
    if out.exists():
        shutil.rmtree(out)
    index: dict[str, dict] = {"streams": {}}
    for stream in STREAMS:
        (out / stream).mkdir(parents=True)
        for name, words in shards[stream].items():
            body = ",".join(
                json.dumps(word, ensure_ascii=False) + ":{"
                + ",".join(f"{json.dumps(src)}:{text}" for src, text in by_source.items())
                + "}"
                for word, by_source in sorted(words.items())
            )
            (out / stream / f"{name}.json").write_text("{" + body + "}", encoding="utf-8")
        index["streams"][stream] = {
            "shards": sorted(shards[stream]),
            "sources": sources[stream],
        }
    (out / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    summary = {
        "works": len(works),
        "streams": {
            stream: {
                "sources": len(sources[stream]),
                "shards": len(shards[stream]),
                "words": sum(len(w) for w in shards[stream].values()),
                "postings": postings[stream],
            }
            for stream in STREAMS
        },
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    return out
