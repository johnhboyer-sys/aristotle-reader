"""Build the two mock-up pages from template.html.

  python3 -I build.py <book-01.json>

index.html          NE I.1, hand alignment (data.json, align.py)
test-i2/index.html  NE I.2, reference alignment + each model's (test-i2/out-*.json)
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
TPL = (HERE / "template.html").read_text()
WORD = re.compile(r"[A-Za-z’'-]+")
MODEL_NAMES = {"claude-haiku-5-5": "Haiku 5.5", "claude-sonnet-5-5": "Sonnet 5.5", "claude-opus-5-5": "Opus 5.5", "codex": "GPT-6.1 Sol"}


def page(data, out, title):
    html = TPL.replace("<title>Word Hover, NE I.1</title>", f"<title>{title}</title>")
    out.write_text(html.replace("__DATA__", json.dumps(data, ensure_ascii=False)))


def i1():
    d = json.loads((HERE / "data.json").read_text())
    lab = lambda n: "1094a" if n == 1 else (str(n) if n % 5 == 0 else "")
    return {
        "head": {"where": "Book I · Chapter 1", "num": "1", "title": "The good as the aim of action",
                 "bekker": "1094a1–17", "translator": "H. Rackham, 1926"},
        "greek": [{"id": str(l["n"]), "label": lab(l["n"]), "text": l["text"],
                   "toks": [[t, o, i] for i, (t, o) in enumerate(l["toks"])]} for l in d["greek"]],
        "english": d["english"], "paras": d["paras"],
        "ticks": [["1094a" if n == 1 else str(n), o, r] for n, o, r in d["ticks"]],
        "aligns": {"Reference": d["align"]},
    }


def i2(book):
    s0, s1 = book["segments"][0], book["segments"][1]
    greek = []
    for seg, col, colname in ((s0, "a", "1094a"), (s1, "b", "1094b")):
        for l in seg["greek"]:
            text = l["text"]
            # stage-3 `o` is the start of the raw run, sigla included ("(πρόεισι"),
            # so find the bare word from there, as shared/lib/line-parts.ts does
            toks = [[t["t"], text.index(t["t"], t["o"]), i] for i, t in enumerate(l["tokens"])]
            if col == "a":
                if l["n"] < 18: continue
                if l["n"] == 18:            # chapter 2 opens at token 4
                    cut = toks[4][1]
                    text = text[cut:]
                    toks = [[t, o - cut, i] for t, o, i in toks[4:]]
            else:
                if l["n"] > 11: break
                if l["n"] == 11:            # chapter 3 opens at token 7
                    end = toks[6][1] + len(toks[6][0]) + 1
                    text, toks = text[:end], toks[:7]
            n = l["n"]
            label = colname if n == 1 else (str(n) if n % 5 == 0 else "")
            greek.append({"id": f"{col}{n}", "label": label, "text": text, "toks": toks})
    e0raw, e1raw = s0["english"]["text"][1551:], s1["english"]["text"][:1010]
    lead0, lead1 = len(e0raw) - len(e0raw.lstrip()), len(e1raw) - len(e1raw.lstrip())
    e0, e1 = e0raw.strip(), e1raw.strip()
    english = e0 + " " + e1
    base1 = len(e0) + 1
    ticks, paras = [], []
    for t in s0["english"]["bekker"]:
        if t["offset"] >= 1551 + lead0:
            ticks.append([str(t["n"]), t["offset"] - 1551 - lead0, t["real"]])
    for t in s1["english"]["bekker"]:
        if t["offset"] < 1010:
            ticks.append(["1094b" if t["n"] == 1 else str(t["n"]), base1 + max(0, t["offset"] - lead1), t["real"]])
    for m in s0["english"]["markers"]:
        if m["kind"] == "paragraph" and m["offset"] > 1551 + lead0:
            paras.append(m["offset"] - 1551 - lead0)
    for m in s1["english"]["markers"]:
        if m["kind"] == "paragraph" and m["offset"] < 1010:
            paras.append(base1 + m["offset"] - lead1)
    nwords = len(WORD.findall(english))
    ids = {f"{l['id']}.{i}" for l in greek for _, _, i in l["toks"]}

    sys.path.insert(0, str(HERE / "test-i2"))
    from gold import G, GROUPS, UNITS
    for g, e in GROUPS:
        assert all(k in ids for k in g) and all(0 <= i < nwords for i in e), (g, e)
    aligns = {"Reference": G}
    for slug, name in MODEL_NAMES.items():
        f = HERE / "test-i2" / f"out-{slug}.json"
        if not f.exists(): continue
        r = json.loads(f.read_text())
        if not r.get("links"): continue
        a = {}
        for link in r["links"]:
            ws = sorted({w for w in link["e"] if 0 <= w < nwords})
            if link["g"] in ids and ws: a.setdefault(link["g"], []).extend(ws)
        aligns[name] = {k: sorted(set(v)) for k, v in a.items()}
    return {
        "head": {"where": "Book I · Chapter 2", "num": "2", "title": "Politics as the master science of the good",
                 "bekker": "1094a18–1094b10", "translator": "H. Rackham, 1926"},
        "greek": greek, "english": english, "paras": paras, "ticks": ticks, "aligns": aligns,
        "groups": {"Reference": [[g, e] for g, e in GROUPS]},
        "units": UNITS,
        # Correct mode: the words to check are the ruling page's items (disputed + spot checks)
        "correct": {"todo": [it["g"] for it in json.loads((HERE / "test-i2" / "review-items.json").read_text())["items"]]},
    }


REVIEWS = {
    "i3": {"where": "Book I · Chapter 3", "num": "3", "title": "The limitations of ethics and politics",
           "bekker": "1094b11–1095a13", "cols": ("1094b", "1095a"), "page": "Alignment Review, NE I.3"},
    "i2o": {"where": "Book I · Chapter 2", "num": "2", "title": "Politics as the master science of the good",
            "bekker": "1094a18–1094b10", "cols": ("1094a", "1094b"), "page": "Alignment Review, NE I.2 (Ostwald)"},
}


def review_from(ch, files, base, seed=1095):
    """A review page that starts from one aligner's reading (`base`, a label in
    `files`) for every unit. Dotted: units where `base` and the first other
    aligner in `files` disagree. John checks every word regardless."""
    T3 = HERE / "test-i3"
    cfg = REVIEWS[ch]
    d = json.loads((T3 / f"{ch}.json").read_text())
    form = dict(d["greek"])
    greek = review_greek(d, cfg)
    got = {}
    for label, f in files.items():
        r = json.loads((T3 / f).read_text())
        lit, loose, units = {}, {}, []
        for x in r.get("units") or []:
            g = [k for k in x["g"] if k in form]
            if len(g) > 1: units.append(tuple(g))
            for k in g:
                lit[k] = sorted(set(x["lit"])); loose[k] = sorted(set(x["loose"]) - set(x["lit"]))
        got[label] = (lit, loose, units)
    aligns = {label: {k: v for k, v in lit.items() if v} for label, (lit, _, _) in got.items()}
    groups = {label: [[[k], sorted(set(lit[k]) | set(loose[k]))] for k in loose if loose[k]] for label, (lit, loose, _) in got.items()}
    bl, bo, bunits = got[base]
    other = next(l for l in files if l != base)
    ol, oo, _ = got[other]
    unit_of = {k: u for u in bunits for k in u}
    todo, seen = [], set()
    for g, _ in d["greek"]:
        u = unit_of.get(g, (g,))
        if u in seen: continue
        seen.add(u)
        if not all(bl.get(k) == ol.get(k) and bo.get(k) == oo.get(k) for k in u):
            todo.extend(u)
    order = [base] + [l for l in files if l != base]
    return {
        "head": {"where": cfg["where"], "num": cfg["num"], "title": cfg["title"],
                 "bekker": cfg["bekker"], "translator": "Martin Ostwald, 1962", "cols": list(cfg["cols"])},
        "greek": greek, "english": d["english"], "paras": [i + 1 for i, c in enumerate(d["english"]) if c == "\n"],
        "ticks": d["ticks"], "aligns": {l: aligns[l] for l in order}, "groups": {l: groups[l] for l in order},
        "units": [list(u) for u in bunits], "base": base, "correct": {"todo": todo},
    }, {"units": len(seen), "dotted_units": len({unit_of.get(k, (k,)) for k in todo}), "dotted_tokens": len(todo)}


def review_greek(d, cfg):
    by_line = {}
    for g, f in d["greek"]:
        by_line.setdefault(g.split(".")[0], []).append((g, f))
    greek = []
    for ln, toks in by_line.items():
        text = d["lines"][ln]
        if int(toks[0][0].split(".")[1]) > 0:
            text = text[text.index(toks[0][1]):]
        pos, out = 0, []
        for g, f in toks:
            at = text.index(f, pos); out.append([f, at, int(g.split(".")[1])]); pos = at + len(f)
        if re.search(r"\w", text[pos:]):
            text = text[:pos + 1]
        n = int(ln[1:])
        label = cfg["cols"][0 if ln[0] == d["greek"][0][0][0] else 1] if n == 1 else (str(n) if n % 5 == 0 else "")
        greek.append({"id": ln, "label": label, "text": text, "toks": out})
    return greek


def review(ch="i3"):
    """A chapter against Ostwald, from the prompt-v2 outputs. The page starts from the
    reading Opus and Codex agree on, unit by unit; where they differ it starts
    blank and the unit is dotted for John, with 20 agreed units as spot checks."""
    import random
    T3 = HERE / "test-i3"
    cfg = REVIEWS[ch]
    d = json.loads((T3 / f"{ch}.json").read_text())
    form = dict(d["greek"])
    by_line = {}
    for g, f in d["greek"]:
        by_line.setdefault(g.split(".")[0], []).append((g, f))
    greek = []
    for ln, toks in by_line.items():
        text = d["lines"][ln]
        if int(toks[0][0].split(".")[1]) > 0:   # the chapter opens mid-line
            text = text[text.index(toks[0][1]):]
        pos, out = 0, []
        for g, f in toks:
            at = text.index(f, pos); out.append([f, at, int(g.split(".")[1])]); pos = at + len(f)
        if re.search(r"\w", text[pos:]):          # the next chapter opens mid-line: keep the stop
            text = text[:pos + 1]
        n = int(ln[1:])
        label = cfg["cols"][0 if ln[0] == d["greek"][0][0][0] else 1] if n == 1 else (str(n) if n % 5 == 0 else "")
        greek.append({"id": ln, "label": label, "text": text, "toks": out})

    def per_token(name):
        r = json.loads((T3 / f"out2-{ch}-{name}.json").read_text())
        lit, loose, units = {}, {}, []
        for x in r.get("units") or []:
            g = [k for k in x["g"] if k in form]
            if len(g) > 1: units.append(tuple(g))
            for k in g:
                lit[k] = sorted(set(x["lit"])); loose[k] = sorted(set(x["loose"]) - set(x["lit"]))
        return lit, loose, units

    names = {"claude-opus-5-5": "Opus 5.5", "codex": "GPT-6.1 Sol", "claude-sonnet-5-5": "Sonnet 5.5"}
    got = {n: per_token(n) for n in names}
    aligns, groups = {}, {}
    for n, label in names.items():
        lit, loose, _ = got[n]
        aligns[label] = {k: v for k, v in lit.items() if v}
        groups[label] = [[[k], sorted(set(lit[k]) | set(loose[k]))] for k in loose if loose[k]]
    # units both Opus and Codex returned
    units = sorted(set(got["claude-opus-5-5"][2]) & set(got["codex"][2]))
    unit_of = {k: u for u in units for k in u}
    ol, oo, _ = got["claude-opus-5-5"]; cl, co, _ = got["codex"]
    agreed_lit, agreed_grp, todo, agreed_units = {}, [], [], []
    seen = set()
    for g, _ in d["greek"]:
        u = unit_of.get(g, (g,))
        if u in seen: continue
        seen.add(u)
        same = all(ol.get(k) == cl.get(k) and oo.get(k) == co.get(k) for k in u)
        if same:
            for k in u:
                if ol.get(k): agreed_lit[k] = ol[k]
                if oo.get(k): agreed_grp.append([[k], sorted(set(ol.get(k, [])) | set(oo[k]))])
            if any(ol.get(k) or oo.get(k) for k in u): agreed_units.append(u)
        else:
            todo.extend(u)
    checks = random.Random(1095).sample(agreed_units, min(20, len(agreed_units)))
    todo += [k for u in checks for k in u]
    aligns = {"Agreed": agreed_lit, **aligns}
    groups = {"Agreed": agreed_grp, **groups}

    eng = d["english"]
    paras = [i + 1 for i, c in enumerate(eng) if c == "\n"]
    return {
        "head": {"where": cfg["where"], "num": cfg["num"], "title": cfg["title"],
                 "bekker": cfg["bekker"], "translator": "Martin Ostwald, 1962"},
        "greek": greek, "english": eng, "paras": paras, "ticks": d["ticks"], "aligns": aligns,
        "groups": groups, "units": [list(u) for u in units], "base": "Agreed",
        "correct": {"todo": todo},
    }, {"units_agreed": len(units), "todo_tokens": len(todo), "disputed_units": len(seen) - len(agreed_units) - sum(1 for u in seen if u not in agreed_units and not any(ol.get(k) == cl.get(k) and oo.get(k) == co.get(k) for k in u)) , "units_total": len(seen)}


if __name__ == "__main__":
    book = json.load(open(sys.argv[1]))
    page(i1(), HERE / "index.html", "Word Hover, NE I.1")
    d2 = i2(book)
    page(d2, HERE / "test-i2" / "index.html", "Alignment Test, NE I.2")
    print("I.2 alignments:", list(d2["aligns"]))
    # I.3 for John's own review (2026-11-19): every unit starts at Opus's v4 reading
    V4 = {"Opus 5.5": "out4s-i3-claude-opus-5-5.json", "GPT-6.1 Sol": "out4-i3-codex.json", "Sonnet 5.5": "out4s-i3-claude-sonnet-5-5.json"}
    if all((HERE / "test-i3" / f).exists() for f in V4.values()):
        dr, info = review_from("i3", V4, "Opus 5.5")
        page(dr, HERE / "test-i3" / "page" / "index.html", REVIEWS["i3"]["page"])
        print("i3 from Opus v4", info)
    for ch, cfg in REVIEWS.items():
        if ch == "i3" and all((HERE / "test-i3" / f).exists() for f in V4.values()): continue
        if not (HERE / "test-i3" / f"out2-{ch}-codex.json").exists(): continue
        dr, info = review(ch)
        out = HERE / "test-i3" / ("page" if ch == "i3" else f"page-{ch}")
        out.mkdir(exist_ok=True)
        page(dr, out / "index.html", cfg["page"])
        print(ch, info, "alignments:", list(dr["aligns"]))
