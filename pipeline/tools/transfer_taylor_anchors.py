"""Carry Taylor's Bekker anchors from the old (CLAA) text to the 1812 text by word alignment.

How sources/cat-taylor/anchors.yaml, sources/int-taylor/anchors.yaml and
alignment-results/taylor/Int_taylor_gloss_map.json were made on 2026-11-07, OLD_REV = 8c5f2529dd.
Then by hand: Cat 1a25 -> "cannot exist without that in which it is", 2a35 -> "of the first
essences, as subjects, or are in them", 3b5 lengthened to be unique; the rest of the report
checked and kept.

usage (repo root as cwd, pipeline venv): python3 pipeline/tools/transfer_taylor_anchors.py OLD_REV OUT_DIR
Reads sources/{cat,int}-taylor/book-01.html (new) and OLD_REV's copies (old), the old
sources/cat-taylor/anchors.yaml, sources/int-taylor/anchors.yaml and
alignment-results/taylor/Int_taylor_gloss_map.json. Writes the transferred files into OUT_DIR
and a report of every anchor not inside an exactly matching run of words (hand check).
"""
import difflib, json, re, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, "pipeline")
import yaml
from aristotle_pipeline.stage1_ross import parse_translation
from aristotle_pipeline.stage1_archive import _find_phrase

rev, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

def prose(d, old):
    if old:
        tmp = Path(tempfile.mkdtemp())
        (tmp / "book-01.html").write_text(subprocess.run(
            ["git", "show", f"{rev}:sources/{d}/book-01.html"], capture_output=True, text=True,
            check=True).stdout, encoding="utf-8")
        return {c: t for (b, c), t in parse_translation(tmp, 1, "part").items()}
    return {c: t for (b, c), t in parse_translation(Path("sources") / d, 1, "part").items()}

def git_show(path):
    return subprocess.run(["git", "show", f"{rev}:{path}"], capture_output=True, text=True,
                          check=True).stdout

def words(t):
    return [(m.group(0), m.start()) for m in re.finditer(r"\S+", t)]

def norm(w):
    w = re.sub(r"\[\^\d+\]", "", w)
    return re.sub(r"[^\w]", "", w.lower())

class Mapper:
    def __init__(self, old, new):
        self.ow, self.nw = words(old), words(new)
        sm = difflib.SequenceMatcher(None, [norm(w) for w, _ in self.ow],
                                     [norm(w) for w, _ in self.nw], autojunk=False)
        self.ops = sm.get_opcodes()
        self.new = new
    def map(self, off):
        """old char offset -> (new char offset, how)"""
        i = max(k for k, (_, o) in enumerate(self.ow) if o <= off) if off > 0 else 0
        for tag, i1, i2, j1, j2 in self.ops:
            if i1 <= i < i2 or (i1 == i2 == i):
                if tag == "equal":
                    j, how = j1 + (i - i1), "exact"
                elif tag == "replace" and i2 - i1 == j2 - j1:
                    j, how = j1 + (i - i1), "same-size swap"
                else:
                    # inside a rewritten stretch: the nearest exact word after it, if close
                    j, how = j1, f"{tag} {i2 - i1}->{j2 - j1}"
                j = min(j, len(self.nw) - 1)
                return self.nw[j][1], how
        return len(self.new), "end"

def phrase_at(text, off, n=10):
    ws = text[off:].split()
    k = n
    while k < len(ws) and text.count(" ".join(ws[:k])) > 1:
        k += 2
    return " ".join(ws[:k])

report = []
dropped = []
for work, d in (("Cat", "cat-taylor"), ("Int", "int-taylor")):
    old, new = prose(d, True), prose(d, False)
    assert sorted(old) == sorted(new), (work, sorted(old), sorted(new))
    maps = {c: Mapper(old[c], new[c]) for c in old}
    entries = yaml.safe_load(git_show(f"sources/{d}/anchors.yaml"))   # the OLD anchors
    outs = []
    cur = (min(old), 0)        # anchors run in text order: search from the last hit on
    for e in entries:
        hit = None
        for c in sorted(old):
            if c < cur[0]:
                continue
            start = cur[1] if c == cur[0] else 0
            o = _find_phrase(old[c][start:], e["at"])
            if o >= 0:
                hit = (c, start + o)
                break
        if hit is None:
            report.append((work, e["bekker"], "old phrase not found after the last anchor", e["at"], ""))
            outs.append({"bekker": str(e["bekker"]), "at": e["at"], "_chapter": None})
            continue
        c, o = hit
        cur = hit
        no, how = maps[c].map(o)
        at = phrase_at(new[c], no)
        if how != "exact":
            report.append((work, e["bekker"], how, e["at"], at))
        outs.append({"bekker": str(e["bekker"]), "at": at, "_chapter": c})
    (out / f"{d}-anchors.json").write_text(json.dumps(outs, ensure_ascii=False, indent=1))
    if work == "Int":
        gm = json.loads(git_show("alignment-results/taylor/Int_taylor_gloss_map.json"))
        for k, v in gm.items():
            c = int(k.split(":")[1])
            v["ross_len"] = len(new[c])
            kept = []
            for a in v["anchors"]:
                no, how = maps[c].map(a["offset"])
                if how not in ("exact", "same-size swap"):
                    if a["tier"] == "line":      # a rewritten stretch: no line tick, not a guess
                        dropped.append((work, a["citation"]))
                        continue
                    report.append((work, a["citation"], "gloss " + a["tier"] + " " + how,
                                   old[c][a["offset"]:a["offset"] + 60], new[c][no:no + 60]))
                a["offset"] = no
                kept.append(a)
            v["anchors"] = kept
        (out / "Int_taylor_gloss_map.json").write_text(json.dumps(gm, ensure_ascii=False, indent=1))
    for c in old:
        r = difflib.SequenceMatcher(None, [norm(w) for w, _ in words(old[c])],
                                    [norm(w) for w, _ in words(new[c])], autojunk=False).ratio()
        print(work, c, "word agreement old/new %.2f" % r)
(out / "report.tsv").write_text("".join("\t".join(map(str, r)) + "\n" for r in report))
print(len(report), "anchors to check by hand;", len(dropped), "line ticks dropped:", dropped)
