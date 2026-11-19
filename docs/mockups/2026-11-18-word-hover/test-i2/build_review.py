"""Build the items John rules on, for the I.2 alignment benchmark.

  python3 -I build_review.py   # writes review-items.json, prints counts

An item is one Greek token. It is up for ruling when the independent
alignments of it disagree: my reference, Opus and Codex (Haiku is too thin to
trigger an item by itself, but its answer is offered when it differs). A random
sample of 20 tokens on which all three agree is added as spot checks, to
measure how often shared agreement is wrong. Options are shown blind: the page
never says which aligner proposed which.
"""
import json, random, re, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from gold import G, GROUPS

d = json.loads((HERE / "i2.json").read_text())
eng = d["english"]
spans = [(m.start(), m.end()) for m in re.finditer(r"[A-Za-z’'-]+", eng)]
assert [eng[a:b] for a, b in spans] == d["words"], "word list out of step with the English"
order = [g for g, _ in d["greek"]]
form = dict(d["greek"])


def load(name):
    p = HERE / f"out-{name}.json"
    if not p.exists():
        return None
    a = {}
    for l in json.loads(p.read_text()).get("links") or []:
        ws = {w for w in l["e"] if 0 <= w < len(spans)}
        if l["g"] in form and ws:
            a.setdefault(l["g"], set()).update(ws)
    return a


ref = {k: set(v) for k, v in G.items()}
# my reference's extents, from its groups: words in a one-token group beyond the core
ref_ext = {g[0]: set(e) - ref.get(g[0], set()) for g, e in GROUPS if len(g) == 1}
voices = {"ref": ref, "opus": load("claude-opus-5-5"), "codex": load("codex"), "haiku": load("claude-haiku-5-5")}
missing = [k for k, v in voices.items() if v is None]
if missing:
    sys.exit(f"missing alignments: {missing}")

# Greek sentences, split at . · ; after a token
sent_of, cur, pos_in_line = {}, 0, {}
by_line = {}
for g in order:
    by_line.setdefault(g.split(".")[0], []).append(g)
greek_pieces = {}  # token -> text that follows it, up to the next token
for ln, toks in by_line.items():
    text, pos = d["lines"][ln], 0
    for j, g in enumerate(toks):
        at = text.index(form[g], pos)
        end = at + len(form[g])
        nxt = text.index(form[toks[j + 1]], end) if j + 1 < len(toks) else len(text)
        tail = text[end:nxt] + ("" if j + 1 < len(toks) else " ")
        if g == order[-1]:  # the chapter ends mid-line: stop at its last stop, not the next chapter's words
            m = re.search(r"[.··;;]", tail)
            tail = tail[:m.end()] if m else tail
        greek_pieces[g] = tail
        sent_of[g] = cur
        if re.search(r"[.\u00b7\u0387;\u037e]", text[end:nxt]):
            cur += 1
        pos = end
sents = {}
for g in order:
    sents.setdefault(sent_of[g], []).append(g)


def eng_span(s):
    """English word range for Greek sentence s: every word any voice links to
    it, widened to the English sentence stops on each side."""
    ws = {w for v in voices.values() for g in sents[s] for w in v.get(g, ())}
    ws |= {w for g in sents[s] for w in ref_ext.get(g, ())}
    lo, hi = min(ws), max(ws)
    while lo > 0 and not re.search(r"[.;?!]", eng[spans[lo - 1][1]:spans[lo][0]]):
        lo -= 1
    while hi + 1 < len(spans) and not re.search(r"[.;?!]", eng[spans[hi][1]:spans[hi + 1][0]]):
        hi += 1
    return lo, hi


def last_tail(hi):
    """The text after the sentence's last word, through its closing stop."""
    rest = eng[spans[hi][1]:spans[hi + 1][0]] if hi + 1 < len(spans) else eng[spans[hi][1]:]
    m = re.search(r"[.;?!]\S*", rest)
    return rest[:m.end()] if m else rest.rstrip()


def phrase(ws):
    ws = sorted(ws)
    out = []
    for i, w in enumerate(ws):
        if i and w != ws[i - 1] + 1:
            out.append("…")
        out.append(d["words"][w])
    return " ".join(out)


rng = random.Random(1094)
agreed = [g for g in order if voices["ref"].get(g, set()) == voices["opus"].get(g, set()) == voices["codex"].get(g, set())]
disputed = [g for g in order if g not in agreed]
checks = set(rng.sample([g for g in agreed if voices["ref"].get(g)], 20))

items, sent_cache = [], {}
for g in order:
    if g not in disputed and g not in checks:
        continue
    s = sent_of[g]
    if s not in sent_cache:
        lo, hi = eng_span(s)
        sent_cache[s] = {
            "greek": [[t, form[t], greek_pieces[t]] for t in sents[s]],
            "eng": [[i, d["words"][i], eng[spans[i][1]:spans[i + 1][0]] if i + 1 <= hi else last_tail(hi)] for i in range(lo, hi + 1)],
        }
    opts, seen = [], {}
    for name in ("ref", "opus", "codex", "haiku"):
        core = sorted(voices[name].get(g, set()))
        ext = sorted(ref_ext.get(g, set())) if name == "ref" else []
        key = (tuple(core), tuple(ext))
        if name == "haiku" and key not in seen and g in agreed:
            continue  # a spot check offers only the agreed answer (plus "No English")
        if key in seen:
            seen[key]["by"].append(name)
            continue
        seen[key] = {"core": core, "ext": ext, "by": [name]}
        opts.append(seen[key])
    rng.shuffle(opts)  # blind: the page shows letters, never sources
    items.append({"g": g, "word": form[g], "line": g.split(".")[0], "sent": s, "kind": "dispute" if g in disputed else "check",
                  "opts": [{"core": o["core"], "ext": o["ext"], "by": o["by"], "text": phrase(o["core"] + o["ext"]) if o["core"] or o["ext"] else ""} for o in opts]})

out = {"sents": {str(k): v for k, v in sent_cache.items()}, "items": items}
(HERE / "review-items.json").write_text(json.dumps(out, ensure_ascii=False))
page = (HERE / "review-template.html").read_text().replace("__ITEMS__", json.dumps(out, ensure_ascii=False))
(HERE / "review").mkdir(exist_ok=True)
(HERE / "review" / "index.html").write_text(page)
print(f"{len(order)} tokens; agreed by ref/opus/codex {len(agreed)}; disputed {len(disputed)}; spot checks {len(checks)}; items {len(items)}")
