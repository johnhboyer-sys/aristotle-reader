"""Cut NE I.3 (1094b11-1095a13) from the live book-01.json into numbered
Greek tokens and numbered words of Ostwald's translation (the corpus's third
NE translation; John prefers it to Rackham, 2026-11-18).

  python3 -I prep.py <book-01.json>   # writes i3.json

Ostwald's chapter text comes in two pieces (1094b and 1095a). Footnote
markers ([^1.12]) are removed; his printed Bekker ticks are kept, with their
offsets moved to match.
"""
import json, re, sys

j = json.load(open(sys.argv[1]))
s1, s2 = j["segments"][1], j["segments"][2]
greek = []   # [id, form]; id = "<col><line>.<tok>", col a/b of the Bekker page
for seg, col, lo, hi in ((s1, "b", (11, 7), None), (s2, "a", None, (14, 0))):
    for l in seg["greek"]:
        for i, t in enumerate(l["tokens"]):
            if lo and (l["n"], i) < lo: continue
            if hi and (l["n"], i) >= hi: continue
            greek.append([f"{col}{l['n']}.{i}", t["t"]])
used = {g.split(".")[0] for g, _ in greek}
lines = {f"{col}{l['n']}": l["text"] for seg, col in ((s1, "b"), (s2, "a")) for l in seg["greek"] if f"{col}{l['n']}" in used}

pieces = [(c, "1094b" if seg is s1 else "1095a") for seg in (s1, s2) for c in seg["third"] if c["chapter"] == "3"]
assert [p[0]["cont"] for p in pieces] == [False, True], "expected Ostwald's I.3 in two pieces"
FN = re.compile(r"\[\^[^\]]+\]")
english, ticks = "", []
for c, page in pieces:
    raw = c["text"]
    keep = [True] * len(raw)
    for m in FN.finditer(raw):
        for i in range(m.start(), m.end()): keep[i] = False
    newpos, n = [], 0
    for i in range(len(raw) + 1):
        newpos.append(n)
        if i < len(raw) and keep[i]: n += 1
    text = "".join(ch for ch, k in zip(raw, keep) if k)
    lead = len(text) - len(text.lstrip())
    base = len(english) + (1 if english else 0)
    for t in c["bekker"]:
        label = page if t["n"] == 1 else str(t["n"])
        ticks.append([label, base + max(0, newpos[t["offset"]] - lead), t["real"]])
    english = (english + " " if english else "") + text.strip()
english = re.sub(r"\s+", " ", english) if "\n" not in english else english
assert "[^" not in english and "[[" not in english, "markup left in English"
words = [m.group() for m in re.finditer(r"[A-Za-z’'-]+", english)]
json.dump({"greek": greek, "lines": lines, "english": english, "words": words, "ticks": ticks,
           "translator": "Martin Ostwald, 1962"},
          open("i3.json", "w"), ensure_ascii=False, indent=1)
print(len(greek), "greek tokens;", len(words), "english words;", len(ticks), "ticks")
print(english[:200], "…", english[-150:])
print([(t[0], english[t[1]:t[1] + 25]) for t in ticks])
