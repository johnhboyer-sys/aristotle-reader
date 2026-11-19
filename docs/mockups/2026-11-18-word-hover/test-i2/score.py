"""Score each model's I.2 alignment against the reference (gold.py) and price it.

Link level: each (Greek token, English word) pair is one link; precision,
recall, F1 against the reference. Token level: share of Greek tokens whose
English set matches the reference exactly. Sentence level (what the Sentence
style shows): for each Greek sentence, overlap of the English words its tokens
link to, as Jaccard against the reference, averaged.
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from gold import G

# Batch prices, $ per million tokens (half of list), from the claude-api skill table cached 2026-11-03.
PRICE = {"claude-haiku-5-5": (0.05, 0.25), "claude-sonnet-5-5": (1.0, 5.0), "claude-opus-5-5": (2.0, 10.0)}

d = json.loads((HERE / "i2.json").read_text())
order = [g for g, _ in d["greek"]]
nwords = len(d["words"])

# Greek sentences, from the line texts: a token closes one when . · or ; follows it.
lines = d["lines"]
sent_of, cur = {}, 0
toks_by_line = {}
for g, f in d["greek"]:
    toks_by_line.setdefault(g.split(".")[0], []).append((g, f))
for ln, toks in toks_by_line.items():
    text, pos = lines[ln], 0
    for j, (g, f) in enumerate(toks):
        at = text.find(f, pos); end = at + len(f)
        nxt = text.find(toks[j + 1][1], end) if j + 1 < len(toks) else len(text)
        sent_of[g] = cur
        if re.search(r"[.\u00b7\u0387;\u037e]", text[end:nxt]): cur += 1
        pos = end


def pairs(a): return {(g, e) for g, es in a.items() for e in es}


def load(slug):
    r = json.loads((HERE / f"out-{slug}.json").read_text())
    a = {}
    for link in r.get("links") or []:
        ws = {w for w in link["e"] if 0 <= w < nwords}
        if link["g"] in sent_of and ws: a.setdefault(link["g"], set()).update(ws)
    return r, {k: sorted(v) for k, v in a.items()}


def by_sentence(a):
    out = {}
    for g, es in a.items(): out.setdefault(sent_of[g], set()).update(es)
    return out


gp, gs = pairs(G), by_sentence(G)
print(f"Reference: {len(G)} of {len(order)} Greek tokens linked, {len(gp)} links, {max(sent_of.values()) + 1} sentences\n")
rows = []
for slug, (pin, pout) in PRICE.items():
    r, a = load(slug)
    mp = pairs(a)
    tp = len(gp & mp)
    prec, rec = tp / len(mp) if mp else 0, tp / len(gp)
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
    exact = sum(1 for g in order if sorted(G.get(g, [])) == sorted(a.get(g, []))) / len(order)
    ms = by_sentence(a)
    jac = [len(gs[s] & ms.get(s, set())) / len(gs[s] | ms.get(s, set())) for s in gs]
    u = r["usage"]
    cost = u["input_tokens"] / 1e6 * pin + u["output_tokens"] / 1e6 * pout
    rows.append((slug, len(a), len(mp), prec, rec, f1, exact, sum(jac) / len(jac), u["input_tokens"], u["output_tokens"],
                 (u.get("output_tokens_details") or {}).get("thinking_tokens"), cost))

hdr = "model              tokens links  prec   rec    F1  exact  sent   in_tok out_tok think   cost"
print(hdr)
for s, nt, nl, p, rc, f, ex, sj, it, ot, th, c in rows:
    print(f"{s:18} {nt:6} {nl:5} {p:5.2f} {rc:5.2f} {f:5.2f} {ex:6.2f} {sj:5.2f} {it:8} {ot:7} {th!s:>5} ${c:.4f}")
json.dump([dict(zip(["model", "tokens", "links", "precision", "recall", "f1", "exact", "sentence", "in", "out", "thinking", "cost"], r))
           for r in rows], open(HERE / "scores.json", "w"), indent=1)
