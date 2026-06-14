"""Stage 6: build the search index for the Astro frontend.

Emits these files under build/stage6/:

  greek_lemma.json — {fold_lemma: [[seg_idx, token_pos], ...]}
                 keyed by the token's dictionary HEADWORD (lemma), so a query
                 finds every inflected form of a word. fold_lemma strips all
                 accents, breathings, iotasubscript, macrons from the Beta Code
                 key (only base letters remain), so wildcard prefix matching
                 works uniformly.

  greek_form.json — {fold(surface): [[seg_idx, token_pos], ...]}
                 keyed by the SURFACE form as written (the inflected token), so
                 a query can match the exact form rather than the whole lemma.

  english.json — {word: [seg_idx, ...]}
                 Lowercased, punctuation-stripped English words.
                 Phrase search is handled at query time via string inclusion
                 on the (small) English chunk texts in meta.json, so
                 positions are not stored here.

  meta.json    — [{id, book, column, greek_head, english_head}]
                 Ordered list of segment metadata, indexed by seg_idx.
                 greek_head: first line of text (for result preview).
                 english_head: first 180 chars of English chunk.

All three files are copied to build/dist/ne/search/ by stage7.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from .config import BUILD_DIR, Manifest

_FOLD = re.compile(r"[^a-z']")  # keep only base letters and apostrophe
_EN_WORD = re.compile(r"[a-z']+")


def fold_lemma(beta_key: str) -> str:
    """Strip all Beta Code diacritics; keep only base letters + apostrophe."""
    return _FOLD.sub("", beta_key.lower())


def run(manifest: Manifest) -> Path:
    tokens_doc = json.loads(
        (BUILD_DIR / "stage3" / "tokens.json").read_text(encoding="utf-8")
    )
    key_map = json.loads(
        (BUILD_DIR / "stage4" / "key_map.json").read_text(encoding="utf-8")
    )
    analyses = json.loads(
        (BUILD_DIR / "stage4" / "analyses.json").read_text(encoding="utf-8")
    )
    english = json.loads(
        (BUILD_DIR / "stage1" / "english_chunks.json").read_text(encoding="utf-8")
    )

    # Ordered segment list for index keys
    segments = tokens_doc["segments"]
    seg_idx = {s["id"]: i for i, s in enumerate(segments)}

    eng_by_id = {c["id"]: c for c in english["chunks"]}

    # Token fold sequences per segment — needed by the client for phrase search.
    # One space-separated string of fold lemma keys in document order.
    fold_seq_by_id: dict[str, str] = {}
    for seg in segments:
        folds = []
        for line in seg["lines"]:
            for tok in line["tokens"]:
                key = tok.get("k")
                stored = key_map.get(key) if key else None
                if stored:
                    lemmata = [a["lemma"] for a in analyses.get(stored, []) if a["lemma"]]
                    if lemmata:
                        folds.append(fold_lemma(lemmata[0]))
                    else:
                        folds.append(fold_lemma(stored))
                elif key:
                    folds.append(fold_lemma(key))
        fold_seq_by_id[seg["id"]] = " ".join(folds)

    # -- Greek inverted indexes ----------------------------------------------
    # Two parallel indexes, both fold_lemma -> [(seg_idx, token_pos), ...]:
    #   lemma_posts: keyed by each token's dictionary headword(s) — "all forms".
    #   form_posts:  keyed by the token's surface form as written — "exact form".
    lemma_posts: dict[str, list] = defaultdict(list)
    form_posts: dict[str, list] = defaultdict(list)
    for seg in segments:
        si = seg_idx[seg["id"]]
        pos = 0
        for line in seg["lines"]:
            for tok in line["tokens"]:
                key = tok.get("k")
                if key:
                    sf = fold_lemma(key)  # surface form as written
                    if sf:
                        form_posts[sf].append([si, pos])
                stored = key_map.get(key) if key else None
                if stored:
                    for a in analyses.get(stored, []):
                        fl = fold_lemma(a["lemma"]) if a["lemma"] else fold_lemma(stored)
                        if fl:
                            lemma_posts[fl].append([si, pos])
                pos += 1

    # Deduplicate each index (a lemma may repeat from homonym analyses; a
    # surface key is added once per token but dedupe defensively).
    def _dedupe(posts: dict[str, list]) -> dict[str, list]:
        out: dict[str, list] = {}
        for fl, plist in posts.items():
            seen: set[tuple] = set()
            deduped = []
            for pair in plist:
                t = tuple(pair)
                if t not in seen:
                    seen.add(t)
                    deduped.append(pair)
            out[fl] = deduped
        return out

    greek_lemma = _dedupe(lemma_posts)
    greek_form = _dedupe(form_posts)

    # -- English inverted index -----------------------------------------------
    # word -> sorted list of unique seg_idxs
    eng_posts: dict[str, set] = defaultdict(set)
    for seg in segments:
        eng = eng_by_id.get(seg["id"])
        if not eng:
            continue
        si = seg_idx[seg["id"]]
        for word in _EN_WORD.findall(eng["text"].lower()):
            eng_posts[word].add(si)
    english_idx = {w: sorted(idxs) for w, idxs in eng_posts.items()}

    # -- Segment metadata -----------------------------------------------------
    meta = []
    for seg in segments:
        # Greek head: join first two lines of surface text
        lines = seg["lines"]
        greek_head = " ".join(
            " ".join(t["t"] for t in l["tokens"])
            for l in lines[:2]
        )
        eng = eng_by_id.get(seg["id"])
        english_head = eng["text"][:500] if eng else ""
        meta.append(
            {
                "id": seg["id"],
                "book": seg["book"],
                "column": seg["column"],
                "greek_head": greek_head,
                "greek_tokens": fold_seq_by_id.get(seg["id"], ""),
                "english_head": english_head,
            }
        )

    out_dir = BUILD_DIR / "stage6"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "greek_lemma.json").write_text(
        json.dumps(greek_lemma, ensure_ascii=False), encoding="utf-8"
    )
    (out_dir / "greek_form.json").write_text(
        json.dumps(greek_form, ensure_ascii=False), encoding="utf-8"
    )
    (out_dir / "english.json").write_text(
        json.dumps(english_idx, ensure_ascii=False), encoding="utf-8"
    )
    (out_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    summary = {
        "greek_lemmata": len(greek_lemma),
        "greek_forms": len(greek_form),
        "english_terms": len(english_idx),
        "segments": len(meta),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=1))
    return out_dir
