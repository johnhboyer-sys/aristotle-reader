"""Embedding test for topic search: rank paragraph units by similarity of their
English to a topic's queries, and measure recall against an answer key alone
and in union with a lexical ranker from topic_finder.py.

Usage (cd pipeline):
  uv run --extra align python tools/topic_embed.py embed            # -> build/topics/emb-<model>.npy
  uv run --extra align python tools/topic_embed.py embed --model BAAI/bge-m3 --field greek --device cuda
  uv run --extra align python tools/topic_embed.py eval --topic necessity --lexical combined

`--field greek` embeds the units' Greek instead of their English; its files carry
a `-greek` suffix. On a GPU machine, tools/jetstream_embed.sh runs every model.

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
WIN = 250

# Per-model prompts, from each model card. A model not listed gets no prompts.
# "st_prompts" models define their own in config_sentence_transformers.json and
# are called through encode_document / encode_query (sentence-transformers >= 5).
MODELS = {
    "BAAI/bge-base-en-v1.5": {
        "query_prefix": "Represent this sentence for searching relevant passages: "},
    "BAAI/bge-m3": {},
    "voyageai/voyage-4-nano": {"st_prompts": True, "trust_remote_code": True, "truncate_dim": 1024},
}


def load_model(name: str, device: str):
    from sentence_transformers import SentenceTransformer
    spec = MODELS.get(name, {})
    kw = {}
    if spec.get("trust_remote_code"):
        kw["trust_remote_code"] = True
    if spec.get("truncate_dim"):
        kw["truncate_dim"] = spec["truncate_dim"]
    m = SentenceTransformer(name, device=device, **kw)
    if spec.get("st_prompts") and not hasattr(m, "encode_document"):
        sys.exit(f"{name} needs sentence-transformers >= 5 (encode_document/encode_query)")
    return m, spec


def encode(m, spec, texts, kind: str, batch_size: int = 8):
    """kind is "document" or "query"; returns unit-length float32 rows."""
    kw = dict(batch_size=batch_size, normalize_embeddings=True, convert_to_numpy=True)
    if spec.get("st_prompts"):
        fn = m.encode_document if kind == "document" else m.encode_query
        return fn(texts, **kw).astype(np.float32)
    if kind == "query" and spec.get("query_prefix"):
        texts = [spec["query_prefix"] + t for t in texts]
    return m.encode(texts, **kw).astype(np.float32)


def load_units(path: Path = UNITS):
    return [json.loads(l) for l in path.open()]


def windows(text: str) -> list[str]:
    w = text.split()
    if len(w) <= WIN + 50:
        return [text]
    return [" ".join(w[i:i + WIN]) for i in range(0, len(w), WIN)]


def model_slug(name: str, field: str = "english") -> str:
    slug = name.split("/")[-1]
    return slug if field == "english" else f"{slug}-{field}"


def cmd_embed(args):
    units = load_units(args.units)
    texts, owner = [], []
    for i, u in enumerate(units):
        text = u[args.field]
        if not text.strip():
            continue                 # a unit with no Greek (or no English) gets no window and scores -1
        for t in windows(text):
            texts.append(t)
            owner.append(i)
    if not texts:
        sys.exit(f"examined nothing: no unit has {args.field} text")
    print(f"units {len(units)}; field {args.field}; windows {len(texts)}", flush=True)
    import torch
    m, spec = load_model(args.model, args.device)
    m.max_seq_length = 512
    out = args.out_dir / f"emb-{model_slug(args.model, args.field)}"
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
            e = encode(m, spec, texts[i:i + CHUNK], "document", args.batch_size)
            np.save(p, e)
            if args.device == "mps":
                torch.mps.empty_cache()
            elif args.device == "cuda":
                torch.cuda.empty_cache()
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
    units = load_units()
    ids = [u["id"] for u in units]
    words = {u["id"]: u["n_english_words"] for u in units}
    total = sum(words.values())
    slug = model_slug(args.model)
    emb = np.load(ROOT / f"build/topics/emb-{slug}.npy")
    owner = np.load(ROOT / f"build/topics/emb-{slug}-owner.npy")
    q = yaml.safe_load((ROOT / f"docs/topic-search/{args.topic}/queries.yaml").read_text())
    queries = list(q["core"]) + list(q["senses"].values()) + list(q["problems"].values())
    m, spec = load_model(args.model, args.device)
    qe = encode(m, spec, queries, "query")
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
    e.add_argument("--device", default="mps", choices=["mps", "cuda", "cpu"])
    e.add_argument("--field", default="english", choices=["english", "greek"])
    e.add_argument("--batch-size", type=int, default=8)
    e.add_argument("--units", type=Path, default=UNITS)
    e.add_argument("--out-dir", type=Path, default=ROOT / "build/topics")
    e.add_argument("--max-chunks", type=int, default=0, help="stop after embedding this many new chunks (0 = all)")
    v = sub.add_parser("eval")
    v.add_argument("--model", default=MODEL)
    v.add_argument("--device", default="mps", choices=["mps", "cuda", "cpu"])
    v.add_argument("--topic", default="necessity")
    v.add_argument("--key", default="sorabji")
    v.add_argument("--lexical", default="combined")
    a = ap.parse_args()
    {"embed": cmd_embed, "eval": cmd_eval}[a.cmd](a)


if __name__ == "__main__":
    main()
