"""Embedding test for topic search: rank paragraph units by similarity of their
English to a topic's queries, and measure recall against an answer key alone
and in union with a lexical ranker from topic_finder.py.

Usage (cd pipeline):
  uv run --extra align python tools/topic_embed.py embed            # -> build/topics/emb-<model>.npy
  uv run --extra align python tools/topic_embed.py eval --topic necessity --lexical combined

Long units are cut into ~250-word windows; a unit's score is its best window.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import yaml

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "build/topics/units.jsonl"
MODEL = "BAAI/bge-base-en-v1.5"
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
WIN = 250


def load_units():
    return [json.loads(l) for l in UNITS.open()]


def windows(text: str) -> list[str]:
    w = text.split()
    if len(w) <= WIN + 50:
        return [text]
    return [" ".join(w[i:i + WIN]) for i in range(0, len(w), WIN)]


def model_slug(name: str) -> str:
    return name.split("/")[-1]


def cmd_embed(args):
    from sentence_transformers import SentenceTransformer
    units = load_units()
    texts, owner = [], []
    for i, u in enumerate(units):
        for t in windows(u["english"]):
            texts.append(t)
            owner.append(i)
    print(f"units {len(units)}; windows {len(texts)}", flush=True)
    import torch
    m = SentenceTransformer(args.model, device=args.device)
    m.max_seq_length = 512
    out = ROOT / f"build/topics/emb-{model_slug(args.model)}"
    parts_dir = Path(f"{out}-parts")
    parts_dir.mkdir(exist_ok=True)
    CHUNK = 500                      # save after each chunk; a rerun resumes (8 GB shared memory)
    parts, new = [], 0
    for c, i in enumerate(range(0, len(texts), CHUNK)):
        p = parts_dir / f"{c:04d}.npy"
        if not p.exists():
            if args.max_chunks and new >= args.max_chunks:
                print(f"stopped after {new} new chunks"); return
            new += 1
            e = m.encode(texts[i:i + CHUNK], batch_size=8, normalize_embeddings=True,
                         convert_to_numpy=True).astype(np.float32)
            np.save(p, e)
            if args.device == "mps":
                torch.mps.empty_cache()
            print(f"chunk {c} ({i + len(e)}/{len(texts)})", flush=True)
        parts.append(np.load(p))
    emb = np.concatenate(parts)
    if emb.shape[0] != len(texts):
        sys.exit(f"embedded {emb.shape[0]} of {len(texts)} windows")
    np.save(f"{out}.npy", emb)
    np.save(f"{out}-owner.npy", np.array(owner, dtype=np.int32))
    print(f"wrote {out}.npy {emb.shape}")


def bk(r: str):
    m = re.match(r"(\d+)([ab])(\d+)$", r)
    if not m:
        raise ValueError(f"bad Bekker ref {r!r}")
    return (int(m[1]), m[2], int(m[3]))


def best_ranks(units, order, key):
    rank = {uid: i for i, uid in enumerate(order)}
    out = []
    for L in key["loci"]:
        best = None
        for u in units:
            if u["work"] != L["work"] or u["book"] != L["book"] or u["id"] not in rank:
                continue
            for s, e in L["ranges"]:
                if bk(u["start"]) <= bk(e) and bk(s) <= bk(u["end"]):
                    r = rank[u["id"]]
                    best = r if best is None else min(best, r)
        out.append(best)
    return out


def cmd_eval(args):
    from sentence_transformers import SentenceTransformer
    units = load_units()
    ids = [u["id"] for u in units]
    words = {u["id"]: u["n_english_words"] for u in units}
    total = sum(words.values())
    slug = model_slug(args.model)
    emb = np.load(ROOT / f"build/topics/emb-{slug}.npy")
    owner = np.load(ROOT / f"build/topics/emb-{slug}-owner.npy")
    q = yaml.safe_load((ROOT / f"docs/topic-search/{args.topic}/queries.yaml").read_text())
    queries = list(q["core"]) + list(q["senses"].values()) + list(q["problems"].values())
    m = SentenceTransformer(args.model, device="mps")
    qe = m.encode([QUERY_PREFIX + s for s in queries], normalize_embeddings=True, convert_to_numpy=True)
    sim = emb @ qe.T                                   # windows x queries
    win_best = sim.max(axis=1)
    unit_score = np.full(len(units), -1.0, dtype=np.float32)
    np.maximum.at(unit_score, owner, win_best)
    emb_order = [ids[i] for i in np.argsort(-unit_score, kind="stable")]

    cand = json.loads((ROOT / f"build/topics/{args.topic}/candidates.json").read_text())
    lex_order = cand["rankers"][args.lexical]["order"]
    key = json.loads((ROOT / f"docs/topic-search/{args.topic}/keys/{args.key}.json").read_text())
    loci = key["loci"]
    if not loci:
        sys.exit("examined nothing: key has no loci")
    n_core = sum(L["core"] for L in loci)

    def union_order(lex_n, emb_n):
        seen, out = set(), []
        for uid in lex_order[:lex_n] + emb_order[:emb_n]:
            if uid not in seen:
                seen.add(uid)
                out.append(uid)
        return out

    def report(label, sel):
        sel_set = set(sel)
        r = best_ranks(units, sel, key)
        core = sum(1 for L, b in zip(loci, r) if L["core"] and b is not None)
        allf = sum(1 for b in r if b is not None)
        w = sum(words[u] for u in sel_set)
        print(f"{label:<34} units {len(sel_set):>5} ({100*w/total:4.1f}% words)  core {core}/{n_core}  all {allf}/{len(loci)}")
        return r

    print(f"examined {len(loci)} loci ({n_core} core); queries {len(queries)}; model {args.model}")
    for n in (300, 500, 1000, 1500):
        report(f"embedding top {n}", emb_order[:n])
    for n in (500, 1000, 1500):
        report(f"lexical:{args.lexical} top {n}", lex_order[:n])
    for ln, en in ((500, 500), (1000, 500), (1000, 1000)):
        report(f"union lex {ln} + emb {en}", union_order(ln, en))

    er = best_ranks(units, emb_order, key)
    lr = best_ranks(units, lex_order, key)
    print("\ncore loci missed by lexical top 1000 — embedding best rank:")
    for L, a, b in zip(loci, lr, er):
        if L["core"] and (a is None or a >= 1000):
            print(f"  row {L['row']:>2} {L['work']} {L['book']}.{L['chapter']:<6} lexical {a}  embedding {b}")
    out = ROOT / f"build/topics/{args.topic}/emb-order-{slug}.json"
    out.write_text(json.dumps({"model": args.model, "queries": queries, "order": emb_order}))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("embed")
    e.add_argument("--model", default=MODEL)
    e.add_argument("--device", default="mps", choices=["mps", "cpu"])
    e.add_argument("--max-chunks", type=int, default=0, help="stop after embedding this many new chunks (0 = all)")
    v = sub.add_parser("eval")
    v.add_argument("--model", default=MODEL)
    v.add_argument("--topic", default="necessity")
    v.add_argument("--key", default="sorabji")
    v.add_argument("--lexical", default="combined")
    a = ap.parse_args()
    {"embed": cmd_embed, "eval": cmd_eval}[a.cmd](a)


if __name__ == "__main__":
    main()
