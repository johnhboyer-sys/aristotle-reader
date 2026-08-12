"""Render a parallel/interpolated edition chapter from LLM bead files.

Reads the task units (build/align/interp_tasks/<WORK>/<book>-<ch>.json: soft Greek clauses
+ fine English units) and the bead grouping (build/align/interp_out/<WORK>/<book>-<ch>.json),
and emits a side-by-side HTML where each ROW is one bead — the Greek clause(s) beside the
English unit(s) that translate them. This is the artifact the parallel edition is made of.

Read-only; writes only build/align/_sentence_interp/<WORK>-<book>-<ch>.html (gitignored scratch).
Usage:  uv run python tools/render_interp.py --work Cat --chapters 1,5
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from aristotle_pipeline.config import BUILD_DIR

_CSS = """
body{font:16px/1.6 Georgia,serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#222}
h1{font-size:1.4rem;border-bottom:2px solid #888;padding-bottom:.3rem}
.meta{color:#666;font-size:.85rem;margin-bottom:1.5rem}
table{border-collapse:collapse;width:100%}
tr{border-bottom:1px solid #eee}
tr:hover{background:#fafaf5}
td{vertical-align:top;padding:.55rem .9rem}
.g{width:46%;font-family:'GFS Didot',Georgia,serif;color:#1a1a2e}
.e{width:46%;color:#333}
.n{width:8%;color:#bbb;font-size:.75rem;text-align:right;white-space:nowrap}
.card{color:#b22;font-weight:bold}
.lac{color:#999;font-style:italic}
ul{padding-left:1.2rem}
a{color:#246}
"""


def _task_files(work: str, chapters: set[int] | None = None) -> list[tuple[int, int, Path]]:
    tdir = BUILD_DIR / "align" / "interp_tasks" / work
    files = []
    for p in tdir.glob("*.json"):
        try:
            book, chap = (int(x) for x in p.stem.split("-", 1))
        except ValueError:
            continue
        if chapters and chap not in chapters:
            continue
        files.append((book, chap, p))
    return sorted(files)


def render_chapter(work: str, book: int, chap: int, task_path: Path) -> tuple[Path, int, int]:
    task = json.loads(task_path.read_text("utf-8"))
    _cor = BUILD_DIR / "align" / "interp_corrections" / work / f"{book}-{chap}.json"
    _bpath = _cor if _cor.exists() else (BUILD_DIR / "align" / "interp_out" / work / f"{book}-{chap}.json")
    beads = json.loads(_bpath.read_text("utf-8"))["beads"]
    g = {i: t for i, t in enumerate(task["greek"])}
    e = {i: t for i, t in enumerate(task["english"])}

    rows = []
    for b in beads:
        gi, ej = b.get("g", []), b.get("e", [])
        gtxt = " ".join(g.get(i, "") for i in gi).strip()
        etxt = " ".join(e.get(j, "") for j in ej).strip()
        card = f"{len(gi)}:{len(ej)}"
        cls = " card" if (len(gi) > 1 or len(ej) > 1) else ""
        gcell = html.escape(gtxt) or '<span class="lac">—</span>'
        ecell = html.escape(etxt) or '<span class="lac">—</span>'
        rows.append(
            f'<tr><td class="g">{gcell}</td>'
            f'<td class="e">{ecell}</td>'
            f'<td class="n{cls}">{card}</td></tr>'
        )

    nmm = sum(1 for b in beads if len(b.get("g", [])) > 1 or len(b.get("e", [])) > 1)
    body = (
        f"<h1>{work} — book {book}, chapter {chap} · interpolated edition</h1>"
        f'<div class="meta">{len(beads)} beads · {len(task["greek"])} Greek clauses · '
        f'{len(task["english"])} English units · {nmm} non-1:1 (red cardinality)</div>'
        f"<table>{''.join(rows)}</table>"
    )
    out = BUILD_DIR / "align" / "_sentence_interp" / f"{work}-{book}-{chap}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(f"<!doctype html><meta charset=utf-8><style>{_CSS}</style>{body}", "utf-8")
    return out, len(beads), nmm


def render(work: str, chapters: set[int] | None = None) -> list[Path]:
    rows = []
    paths = []
    for book, chap, task_path in _task_files(work, chapters):
        out, nbeads, nmm = render_chapter(work, book, chap, task_path)
        paths.append(out)
        rows.append((book, chap, out.name, nbeads, nmm))
    index = BUILD_DIR / "align" / "_sentence_interp" / f"{work}-index.html"
    index.parent.mkdir(parents=True, exist_ok=True)
    links = "".join(
        f'<li><a href="{html.escape(name)}">book {book}, chapter {chap}</a> '
        f'<span class="meta">{nbeads} beads · {nmm} non-1:1</span></li>'
        for book, chap, name, nbeads, nmm in rows
    )
    body = f"<h1>{work} · interpolated edition index</h1><ul>{links}</ul>"
    index.write_text(f"<!doctype html><meta charset=utf-8><style>{_CSS}</style>{body}", "utf-8")
    return paths + [index]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="Cat")
    ap.add_argument("--chapters", default="")
    a = ap.parse_args()
    chapters = {int(x) for x in a.chapters.split(",") if x} if a.chapters else None
    for path in render(a.work, chapters):
        print(path)
