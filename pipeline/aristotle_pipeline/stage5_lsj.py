"""Stage 5: LSJ entries for corpus-occurring lemmata only.

Streams grc.lsj.xml (110MB, 116,728 div2 entries) with iterparse, keeping
just the entries whose key matches a lemma in the Stage 4 analyses (exact
match first, then digit/macron-stripped base match, which also picks up all
homonyms a)1, a)2, ...). Entry bodies are converted from Perseus TEI to
compact HTML and sharded by initial letter.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from html import escape
from pathlib import Path

from lxml import etree

from .config import BUILD_DIR, Manifest

# Letter-class spans keep the CSS in charge of presentation.
_TAG_MAP = {
    "head": ("b", "lsj-head"),
    "orth": ("b", "lsj-orth"),
    "gen": ("span", "lsj-gen"),
    "etym": ("span", "lsj-etym"),
    "i": ("i", None),
    "tr": ("span", "lsj-tr"),
    "foreign": ("span", "lsj-greek"),
    "quote": ("span", "lsj-quote"),
    "cit": ("span", "lsj-cit"),
    "bibl": ("span", "lsj-bibl"),
    "author": ("span", "lsj-author"),
    "title": ("i", "lsj-title"),
    "sense": ("div", "lsj-sense"),
}

_BASE_STRIP = re.compile(r"[0-9_^\-]")
_FOLD_STRIP = re.compile(r"[0-9_^\-/=\\|+]")


def base_key(key: str) -> str:
    return _BASE_STRIP.sub("", key)


def fold_key(key: str) -> str:
    """Accent/diaeresis/macron/hyphen-insensitive form; breathings kept."""
    return _FOLD_STRIP.sub("", key)


def lemma_candidates(lemma: str) -> list[tuple[str, str]]:
    """Ranked (index, value) lookups for a lemma against LSJ keys.

    Fallbacks cover Morpheus lemmatizations LSJ heads differently:
    adverbs in -ws live under the adjective (a)kribw=s -> a)kribh/s),
    verbal adjectives in -teos are headed as -teon, and synthetic
    compounds carry hyphens and extra accents (a)nti/-bla/ptw).
    """
    cands = [("exact", lemma), ("base", base_key(lemma))]
    fold = fold_key(lemma)
    cands.append(("fold", fold))
    if fold.endswith("ws"):
        cands.append(("fold", fold[:-2] + "hs"))
    if fold.endswith("teos"):
        cands.append(("fold", fold[:-4] + "teon"))
    return cands


def shard_letter(key: str) -> str:
    for ch in key:
        if ch.isalpha():
            return ch
    return "_"


def _to_html(el) -> str:
    tag = el.tag if isinstance(el.tag, str) else None
    parts = []
    if tag == "sense":
        level = el.get("level") or "1"
        n = el.get("n") or ""
        parts.append(f'<div class="lsj-sense" data-level="{escape(level)}">')
        if n:
            parts.append(f'<b class="lsj-sense-n">{escape(n)}.</b> ')
        body_open = True
    elif tag in _TAG_MAP:
        html_tag, cls = _TAG_MAP[tag]
        cls_attr = f' class="{cls}"' if cls else ""
        parts.append(f"<{html_tag}{cls_attr}>")
        body_open = True
    elif tag is None:
        body_open = False
    else:
        parts.append(f'<span class="lsj-{escape(tag)}">')
        body_open = True
    if tag is not None and el.text:
        parts.append(escape(el.text))
    for child in el:
        parts.append(_to_html(child))
    if body_open:
        if tag == "sense":
            parts.append("</div>")
        else:
            html_tag = _TAG_MAP.get(tag, ("span", None))[0]
            parts.append(f"</{html_tag}>")
    if el.tail:
        parts.append(escape(el.tail))
    return "".join(parts)


def entry_html(div2) -> str:
    parts = []
    if div2.text:
        parts.append(escape(div2.text))
    for child in div2:
        parts.append(_to_html(child))
    return "".join(parts).strip()


def needed_lemmata(analyses: dict) -> set[str]:
    lemmata = set()
    for groups in analyses.values():
        for g in groups:
            if g["lemma"]:
                lemmata.add(g["lemma"])
    return lemmata


def run(manifest: Manifest) -> Path:
    analyses = json.loads(
        (BUILD_DIR / "stage4" / "analyses.json").read_text(encoding="utf-8")
    )
    lemmata = needed_lemmata(analyses)

    # grc.lsj.xml is not one XML document (no root element); it is a
    # stream of <div2> fragments, so it is scanned line-wise.
    lsj_path = manifest.diogenes_data() / "grc.lsj.xml"
    key_re = re.compile(r'<div2 [^>]*key="([^"]*)"')

    # Pass 1: every LSJ key, plus base/fold indexes for fallback matching.
    all_keys: set[str] = set()
    base_index: dict[str, list[str]] = defaultdict(list)
    fold_index: dict[str, list[str]] = defaultdict(list)
    with open(lsj_path, encoding="utf-8") as f:
        for line in f:
            if "<div2 " not in line:
                continue
            m = key_re.search(line)
            if not m:
                continue
            key = m.group(1)
            all_keys.add(key)
            base_index[base_key(key)].append(key)
            fold_index[fold_key(key)].append(key)

    # Match lemmata to LSJ keys by the ranked candidate list.
    lemma_map: dict[str, list[str]] = {}
    missing: list[str] = []
    for lemma in sorted(lemmata):
        matched: list[str] | None = None
        for kind, value in lemma_candidates(lemma):
            if kind == "exact" and value in all_keys:
                matched = [value]
            elif kind == "base" and base_index.get(value):
                matched = sorted(base_index[value])
            elif kind == "fold" and fold_index.get(value):
                matched = sorted(fold_index[value])
            if matched:
                break
        if matched:
            lemma_map[lemma] = matched
        else:
            missing.append(lemma)
    wanted = {k for keys in lemma_map.values() for k in keys}

    # Pass 2: extract and convert just the wanted entries.
    shards: dict[str, dict] = defaultdict(dict)
    n_kept = 0
    buf: list[str] = []
    want = False
    key = ""
    with open(lsj_path, encoding="utf-8") as f:
        for line in f:
            if "<div2 " in line:
                m = key_re.search(line)
                key = m.group(1) if m else ""
                want = key in wanted
                buf = []
            if want:
                buf.append(line)
                if "</div2>" in line:
                    fragment = "".join(buf)
                    start = fragment.index("<div2 ")
                    end = fragment.rindex("</div2>") + len("</div2>")
                    div2 = etree.fromstring(fragment[start:end])
                    head = div2.findtext("head") or key
                    shards[shard_letter(key)][key] = {
                        "key": key,
                        "head": head,
                        "html": entry_html(div2),
                    }
                    n_kept += 1
                    want = False

    out_dir = BUILD_DIR / "stage5"
    (out_dir / "lsj").mkdir(parents=True, exist_ok=True)
    for letter, entries in sorted(shards.items()):
        (out_dir / "lsj" / f"{letter}.json").write_text(
            json.dumps(entries, ensure_ascii=False), encoding="utf-8"
        )
    (out_dir / "lemma_map.json").write_text(
        json.dumps(lemma_map, ensure_ascii=False), encoding="utf-8"
    )
    (out_dir / "missing_lemmata.json").write_text(
        json.dumps(missing, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    summary = {
        "lemmata_needed": len(lemmata),
        "lsj_entries_kept": n_kept,
        "shards": len(shards),
        "lemmata_without_entry": len(missing),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=1))
    return out_dir
