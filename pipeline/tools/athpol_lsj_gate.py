"""Gates G5 and G2-LSJ of docs/ath-pol-plan.md: the Athenian Constitution's
LSJ citations, checked against the raw dictionary, not against the build.

G5. Every raw citation tlg,0086,003 in grc.lsj.xml is enumerated here, with no
    pipeline code. For each entry the build emitted, its AthPol links must be
    exactly the raw citations in order (C:S -> loc=Ca:S, chapter-only C ->
    loc=Ca:1), minus the declared exceptions (citations of a section the Greek
    does not have). Citations in entries the build did not emit (no lemma in
    the corpus) are counted separately, never as a pass.

G2-LSJ (with --before DIR). Comparing the shards of a build without AthPol
    (DIR) with this one: keys may be added; an existing entry may change only
    by <span class="lsj-bibl">…</span> becoming an AthPol link. Each link is
    undone and the entry must then equal the old one byte for byte. Prints how
    many it rewrote; zero rewrites fails (it would mean it examined nothing).

Run from pipeline/:
  uv run python tools/athpol_lsj_gate.py --dist ../build/dist [--before OLD/dist]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

LSJ = Path("/Applications/Diogenes.app/Contents/dependencies/data/grc.lsj.xml")
KEY = re.compile(r'<div2 [^>]*key="([^"]*)"')
RAW = re.compile(r'n="Perseus:abo:tlg,0086,003:(\d+)(?::(\d+))?"')
LINK = re.compile(r'<a class="lsj-bibl" href="/AthPol/book/1\?loc=(\d+a:\d+)">(.*?)</a>', re.S)
# A citation of a section the Greek has no number for (plan Q6): left unlinked.
DECLARED = {"10a:7"}


def raw_citations() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    with open(LSJ, encoding="utf-8") as f:
        for line in f:
            if "tlg,0086,003:" not in line:
                continue
            m = KEY.search(line)
            if not m:
                raise SystemExit(f"a 003 citation outside a <div2 key> line: {line[:120]}")
            locs = [f"{c}a:{s or 1}" for c, s in RAW.findall(line)]
            out.setdefault(m.group(1), []).extend(locs)
    return out


def shards(dist: Path) -> dict[str, str]:
    out = {}
    for p in sorted((dist / "lsj").glob("*.json")):
        for key, e in json.loads(p.read_text(encoding="utf-8")).items():
            out[key] = e["html"]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", type=Path, required=True)
    ap.add_argument("--before", type=Path)
    a = ap.parse_args()
    ok = True

    raw = raw_citations()
    emitted = shards(a.dist)
    n_raw = sum(len(v) for v in raw.values())
    linked = declared = unemitted = 0
    bad = []
    for key, locs in raw.items():
        if key not in emitted:
            unemitted += len(locs)
            continue
        want = [l for l in locs if l not in DECLARED]
        declared += len(locs) - len(want)
        got = [m.group(1) for m in LINK.finditer(emitted[key])]
        if got != want:
            bad.append((key, want, got))
        linked += len(got)
    print(f"G5: raw 003 citations={n_raw} in {len(raw)} entries; "
          f"emitted entries hold {n_raw - unemitted}: linked={linked} declared-unlinked={declared}; "
          f"in entries not emitted={unemitted}; mismatched entries={len(bad)}")
    for key, want, got in bad[:20]:
        print(f"  {key}: want {want} got {got}")
    if bad or linked == 0:
        ok = False

    if a.before:
        old = shards(a.before)
        added = sorted(set(emitted) - set(old))
        dropped = sorted(set(old) - set(emitted))
        rewrote, changed = 0, []
        for key in sorted(set(old) & set(emitted)):
            new = emitted[key]
            if new == old[key]:
                continue
            undone, k = LINK.subn(lambda m: f'<span class="lsj-bibl">{m.group(2)}</span>', new)
            rewrote += k
            if undone != old[key]:
                changed.append(key)
        print(f"G2-LSJ: entries before={len(old)} after={len(emitted)} added={len(added)} "
              f"dropped={len(dropped)}; links undone={rewrote}; entries changed otherwise={len(changed)}")
        for key in (dropped + changed)[:20]:
            print(f"  {key}")
        if dropped or changed or rewrote == 0:
            ok = False

    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
