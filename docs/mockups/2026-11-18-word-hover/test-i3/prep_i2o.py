"""Cut Ostwald's NE I.2 (1094a18-1094b10) to sit beside Rackham's: the same
numbered Greek tokens as test-i2/i2.json, Ostwald's words numbered fresh.

  python3 -I prep_i2o.py <book-01.json>   # writes i2o.json

His chapter comes in two pieces (1094a and 1094b). Footnote markers are
removed and his printed Bekker ticks kept, offsets moved to match (as prep.py).
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
j = json.load(open(sys.argv[1]))
s0, s1 = j["segments"][0], j["segments"][1]
i2 = json.loads((HERE.parent / "test-i2" / "i2.json").read_text())

pieces = [(c, "1094a" if seg is s0 else "1094b") for seg in (s0, s1) for c in seg["third"] if c["chapter"] == "2"]
assert [p[0]["cont"] for p in pieces] == [False, True], "expected Ostwald's I.2 in two pieces"
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
assert "[^" not in english and "[[" not in english, "markup left in English"
words = [m.group() for m in re.finditer(r"[A-Za-z’'-]+", english)]
json.dump({"greek": i2["greek"], "lines": i2["lines"], "english": english, "words": words, "ticks": ticks,
           "translator": "Martin Ostwald, 1962"},
          open(HERE / "i2o.json", "w"), ensure_ascii=False, indent=1)
print(len(i2["greek"]), "greek tokens;", len(words), "english words (Rackham", len(i2["words"]), ");", len(ticks), "ticks")
print(english[:160], "…", english[-120:])
print([(t[0], english[t[1]:t[1] + 25]) for t in ticks])
