"""Cut NE I.2 (1094a18-1094b10) from the live book-01.json into numbered
Greek tokens and numbered Rackham words. Writes i2.json."""
import json, re, sys

j = json.load(open(sys.argv[1]))
s0, s1 = j["segments"][0], j["segments"][1]
greek = []   # [id, form]; id = "<col>.<line>.<tok>"
for seg, col, lo, hi in ((s0, "a", (18, 4), None), (s1, "b", None, (11, 7))):
    for l in seg["greek"]:
        for i, t in enumerate(l["tokens"]):
            if lo and (l["n"], i) < lo: continue
            if hi and (l["n"], i) >= hi: continue
            greek.append([f"{col}{l['n']}.{i}", t["t"]])
lines = {}
for seg, col in ((s0, "a"), (s1, "b")):
    for l in seg["greek"]:
        lines[f"{col}{l['n']}"] = l["text"]
eng = s0["english"]["text"][1551:].strip() + " " + s1["english"]["text"][:1010].strip()
assert "[^" not in eng and "[[" not in eng, "markup in English"
words = [m.group() for m in re.finditer(r"[A-Za-z’'-]+", eng)]
json.dump({"greek": greek, "lines": lines, "english": eng, "words": words},
          open("i2.json", "w"), ensure_ascii=False, indent=1)
print(len(greek), "greek tokens;", len(words), "english words")
print(eng[:200], "...", eng[-200:])
