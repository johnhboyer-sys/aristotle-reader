"""Record the Athenian Constitution's Greek section inventory and the opening
words of every section, from the TLG export (Oppermann, Teubner 1928), for
stage 2's section check (manifests/AthPol.yaml `citation`).

This reads the export directly and does not call stage1_greek: the witness is
meant to catch the loader moving a section boundary, so it must not be the
loader's own output. A word hyphenated across a section break belongs to the
earlier section (the loader keeps it whole there), so a section whose previous
section ends in "-" loses its first token here too.

Run from pipeline/:
  uv run python tools/athpol_greek_starts.py          # write the starts file, print the inventory
  uv run python tools/athpol_greek_starts.py --check  # exit 1 if the file is stale
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
EXPORT = ROOT / "build" / "export" / "Diogenes-Resources" / "xml" / "tlg" / "tlg0086003.xml"
OUT = ROOT / "sources" / "athpol-greek-starts.yaml"
WORDS = 3


def sections(path: Path) -> list[tuple[int, int, list[str]]]:
    """[(chapter, section, [printed line texts])] in document order."""
    tree = etree.parse(str(path))
    out = []
    for chap in tree.iter("{*}div"):
        if chap.get("type") != "Section":
            continue
        for sub in chap.iter("{*}div"):
            if sub.get("type") != "subsection":
                continue
            lines = [re.sub(r"\s+", " ", "".join(l.itertext()).replace("|", "")).strip()
                     for l in sub.iter("{*}l")]
            out.append((int(chap.get("n")), int(sub.get("n")), lines))
    return out


def starts(secs) -> dict[str, str]:
    got = {}
    prev_hyphen = False
    for chap, sec, lines in secs:
        words = " ".join(lines).split()
        if prev_hyphen:
            words = words[1:]
        got[f"{chap}a{sec}"] = " ".join(words[:WORDS])
        prev_hyphen = bool(lines) and lines[-1].endswith("-")
    return got


def render(got: dict[str, str]) -> str:
    head = ("# Opening words of each Greek section of the Athenian Constitution (TLG\n"
            "# 0086.003, Oppermann 1928), written by pipeline/tools/athpol_greek_starts.py.\n"
            "# Stage 2 requires each spine section to begin with these words.\n")
    body = "".join(f'"{k}": "{v}"\n' for k, v in got.items())
    return head + body


def main() -> int:
    secs = sections(EXPORT)
    got = starts(secs)
    by_chap: dict[int, list[int]] = {}
    for chap, sec, _ in secs:
        by_chap.setdefault(chap, []).append(sec)
    bad = {c: s for c, s in by_chap.items() if s != list(range(1, len(s) + 1))}
    if bad or sorted(by_chap) != list(range(1, len(by_chap) + 1)):
        raise SystemExit(f"export sections are not 1..n in every chapter 1..N: {bad}")
    inv = {c: len(s) for c, s in by_chap.items()}
    print(f"chapters={len(inv)} sections={len(secs)}")
    print("greek_sections:", [inv[c] for c in sorted(inv)])
    text = render(got)
    if "--check" in sys.argv:
        ok = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("starts file", "current" if ok else "STALE")
        return 0 if ok else 1
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(got)} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
