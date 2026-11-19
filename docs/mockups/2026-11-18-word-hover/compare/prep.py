"""An NE chapter in Greek (split into sentences) beside its four translations in
the corpus: Rackham 1926, Ross 1925, Ostwald 1962, Peters 1893.

  python3 -I prep.py <book-01.json>        # I.2: writes i2-four.json and input.txt
  python3 -I prep.py <book-01.json> 3      # I.3: writes i3-four.json and input-i3.txt
"""
import json, re, sys
from pathlib import Path
HERE = Path(__file__).parent
j = json.load(open(sys.argv[1]))
CH = sys.argv[2] if len(sys.argv) > 2 else "2"
s0, s1 = j["segments"][int(CH) - 2], j["segments"][int(CH) - 1]
# Rackham's chapter spans by character offset in the "english" text of the two segments
RACKHAM = {"2": (1551, 1010), "3": (1010, 1107)}[CH]
FN = re.compile(r"\[\^[^\]]+\]")
def chap(pieces):
    return re.sub(r"\s+", " ", " ".join(FN.sub("", c["text"]).strip() for c in pieces)).strip()
tr = {
    "Rackham": re.sub(r"\s+", " ", s0["english"]["text"][RACKHAM[0]:].strip() + " " + s1["english"]["text"][:RACKHAM[1]].strip()),
    "Ross": chap([c for s in (s0, s1) for c in s["ross"] if c["chapter"] == CH]),
    "Ostwald": chap([c for s in (s0, s1) for c in s["third"] if c["chapter"] == CH]),
    "Peters": chap([c for s in (s0, s1) for c in s["overlays"]["peters"] if c["chapter"] == CH]),
}
for k, v in tr.items():
    assert "[^" not in v and "[[" not in v, k
i2 = json.loads((HERE.parent / ("test-i2/i2.json" if CH == "2" else "test-i3/i3.json")).read_text())
toks = i2["greek"]
lines = i2["lines"]
sents, cur, pos = [], [], {}
for gid, form in toks:
    ln = gid.split(".")[0]; text = lines[ln]
    at = text.index(form, pos.get(ln, 0)); pos[ln] = at + len(form)
    cur.append([gid, form])
    after = text[at + len(form):at + len(form) + 2]
    if re.match(r"\s?[.··;;]", after) or gid == toks[-1][0]:
        sents.append(cur); cur = []
S = [{"n": i + 1, "ids": [g for g, _ in s], "greek": " ".join(f for _, f in s)} for i, s in enumerate(sents)]
json.dump({"sentences": S, "translations": tr}, open(HERE / f"i{CH}-four.json", "w"), ensure_ascii=False, indent=1)
BEKKER = {"2": "1094a18–1094b10", "3": "1094b11–1095a13"}[CH]
with open(HERE / ("input.txt" if CH == "2" else f"input-i{CH}.txt"), "w") as f:
    f.write(f"Aristotle, Nicomachean Ethics I.{CH} ({BEKKER}). Greek in numbered sentences (token ids in brackets), then four English translations of the whole chapter.\n\n<greek_sentences>\n")
    for s in S:
        f.write(f"S{s['n']}: " + " ".join(f"{fm}[{g}]" for g, fm in zip(s["ids"], s["greek"].split(" "))) + "\n")
    f.write("</greek_sentences>\n\n")
    for k, v in tr.items():
        f.write(f"<translation name=\"{k}\">\n{v}\n</translation>\n\n")
print(len(S), "Greek sentences"); [print(f"S{s['n']}", s["greek"][:90]) for s in S]
print({k: len(v.split()) for k, v in tr.items()})
