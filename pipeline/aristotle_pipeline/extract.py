"""Make the committed Greek line files: python -m aristotle_pipeline.extract

A LOCAL step, for a machine that has Diogenes and the TLG. It is the only
code in the build's path that runs Diogenes; the build reads what this writes
(corpus/greek/, see greek_lines) and never runs it. HANDOFF-PORTABILITY.md, decision 1.

    python -m aristotle_pipeline.extract --all
    python -m aristotle_pipeline.extract --work EN

For each work: export its TLG author with Diogenes (verse mode) into
build/export unless that is already there, read the work's lines out of the
export, and write corpus/greek/<Work>.tsv. The export itself, and the TLG's own
files, never enter the repo: build/ is git-ignored and must stay so.

TLG_DIR names the folder the TLG is in (each manifest's sources.tlg_dir_env).
Works whose Greek is vendored under sources/ (work.greek_lines, work.spine_tei)
have nothing to extract and are skipped.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

from . import greek_lines
from .config import BUILD_DIR, REPO_ROOT, Manifest

EXPORT_DIR = BUILD_DIR / "export"
_XML_DIR = EXPORT_DIR / "Diogenes-Resources" / "xml" / "tlg"
# On Youth … and Respiration is two TLG works (018 and 037) spliced into one
# spine under a work number the TLG does not use; tools/merge_juv.py does it.
_SPLICED = {"918": ("018", "037")}


def exported_xml_path(manifest: Manifest) -> Path:
    w = manifest.data["work"]
    return _XML_DIR / f"tlg{w['tlg_author']}{w['tlg_work']}.xml"


def run_export(manifest: Manifest) -> None:
    """Diogenes xml-export.pl, verse mode (-y), for the work's whole author."""
    # Diogenes 4.7.2 stops with "Could not find user profile dir" without HOME.
    home = os.environ.get("HOME")
    if not home:
        raise RuntimeError("HOME is not set, and Diogenes will not run without it")
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["perl", "xml-export.pl", "-c", "tlg", "-n", manifest.data["work"]["tlg_author"],
         "-y", "-o", str(EXPORT_DIR)],
        cwd=manifest.diogenes_server(),
        env={"TLG_DIR": str(manifest.tlg_dir()), "HOME": home, "PATH": "/usr/bin:/bin"},
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Diogenes export failed ({result.returncode}): {result.stderr.strip()[-600:]}")


def _splice_juv() -> None:
    spec = importlib.util.spec_from_file_location("merge_juv", REPO_ROOT / "pipeline" / "tools" / "merge_juv.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.merge_spine()


def ensure_export(manifest: Manifest) -> Path:
    w = manifest.data["work"]
    out = exported_xml_path(manifest)
    if out.exists():
        return out
    parts = _SPLICED.get(w["tlg_work"])
    if parts:
        if not all((_XML_DIR / f"tlg{w['tlg_author']}{p}.xml").exists() for p in parts):
            run_export(manifest)
        _splice_juv()
    else:
        run_export(manifest)
    if not out.exists():
        raise FileNotFoundError(f"the export ran but {out} is missing")
    return out


def line_file(manifest: Manifest) -> tuple[str, int] | None:
    """The work's line file as (text, lines), checked; nothing is written.
    None for a work whose Greek is vendored under sources/."""
    w = manifest.data["work"]
    if w.get("greek_lines") or w.get("spine_tei"):
        return None
    levels = greek_lines.levels_for(manifest)
    rows = greek_lines.rows_from_xml(ensure_export(manifest), levels)
    if not rows:
        raise ValueError(f"{manifest.work_id}: the export holds no lines under {'/'.join(levels)}")
    text = greek_lines.format_tsv(rows, levels, manifest.work_id, w["greek_edition"])
    problems = greek_lines.forbidden(text)
    if problems:
        raise ValueError(f"{manifest.work_id}: refusing to write a line file with {problems[:3]}")
    # Read it back before it replaces anything: what the build will read must
    # be what the export says.
    if greek_lines.parse_tsv(text, levels, manifest.work_id) != rows:
        raise ValueError(f"{manifest.work_id}: the line file does not read back as written")
    return text, len(rows)


def lost_lines(manifest: Manifest, lines: int) -> str | None:
    """Why a new file of `lines` lines may not replace the committed one: it
    has fewer. A cut-short export would otherwise shrink a work, and every
    check on the result would still pass."""
    out = greek_lines.corpus_path(manifest)
    if not out.exists():
        return None
    had = len(greek_lines.load(out, greek_lines.levels_for(manifest)))
    if lines >= had:
        return None
    return (f"{manifest.work_id}: the new file has {lines} lines and the committed one {had}; "
            "pass --allow-fewer-lines if the text did lose lines")


def write_all(made: list[tuple[Manifest, str, int]]) -> list[dict]:
    """Replace the committed files, all or none. Every file is first written
    beside its place under a temporary name; only when all are on disk is any
    moved into place, so a write that fails leaves the old files as they were."""
    staged: list[tuple[Path, Path]] = []
    try:
        for manifest, text, _lines in made:
            out = greek_lines.corpus_path(manifest)
            out.parent.mkdir(parents=True, exist_ok=True)
            tmp = out.with_suffix(".tsv.tmp")
            tmp.write_text(text, encoding="utf-8")
            staged.append((tmp, out))
    except BaseException:
        for tmp, _out in staged:
            tmp.unlink(missing_ok=True)
        raise
    for tmp, out in staged:
        tmp.replace(out)
    return [{"work": m.work_id, "lines": lines, "bytes": len(text.encode("utf-8"))} for m, text, lines in made]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="aristotle_pipeline.extract", description=__doc__.split("\n")[0])
    which = parser.add_mutually_exclusive_group(required=True)
    which.add_argument("--work", help="work slug = manifest filename stem")
    which.add_argument("--all", action="store_true", help="every work with a manifest")
    parser.add_argument("--allow-fewer-lines", action="store_true",
                        help="let a new file replace a committed one that has more lines")
    args = parser.parse_args(argv)
    works = [args.work] if args.work else sorted(
        p.stem for p in (REPO_ROOT / "manifests").glob("*.yaml") if not p.stem.endswith("-public"))
    # Make and check every file before the first is written, and write them
    # all or none: a run that fails at the thirtieth work must not leave
    # twenty-nine new files beside old ones.
    made, skipped = [], []
    for work in works:
        manifest = Manifest.for_work(work)
        result = line_file(manifest)
        if result is None:
            skipped.append(work)
        else:
            made.append((manifest, *result))
    problems = [] if args.allow_fewer_lines else [p for m, _t, n in made if (p := lost_lines(m, n))]
    if problems:
        print("FAIL nothing was written:\n  " + "\n  ".join(problems))
        return 1
    done = write_all(made)
    for counts in done:
        print(f"  {counts['work']}: {counts['lines']} lines, {counts['bytes']} bytes")
    print(f"wrote {len(done)} line files, {sum(c['lines'] for c in done)} lines, {sum(c['bytes'] for c in done)} bytes"
          f" to {greek_lines.CORPUS_DIR}; vendored and skipped: {', '.join(skipped) or 'none'}")
    if not done:
        print("wrote nothing")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
