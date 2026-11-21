"""The build's two inputs from outside the repo, and the check that they are
the files the site was built from.

    python -m aristotle_pipeline.inputs check [--dir FOLDER]

Stage 4 reads the Morpheus analyses table (greek-analyses.txt) and stage 5 the
LSJ (grc.lsj.xml). Both ship with Diogenes 4.7.2 (https://d.iogen.es, GPL;
the LSJ file is Perseus's, CC BY-SA). Neither is in this repo: together they
are 236 MB. The folder that holds them is named by the DIOGENES_DATA
environment variable; without it, by each manifest's sources.diogenes_data,
which is the path inside Diogenes.app on a Mac and is a local default only.

`check` hashes both files against the pins below and fails on a missing file
or a changed byte, so a build made with another table or another LSJ cannot
pass for this one. The full build runs it once, before the first work.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

ENV = "DIOGENES_DATA"

# Diogenes 4.7.2, dependencies/data/. Hashed 2026-11-20 from the copy every
# build to that date had read.
PINNED = {
    "greek-analyses.txt": {
        "sha256": "dfca7ef1d1f69a447f072216d6094c7b00bbc6e28a77a23d54ef0734847140f4",
        "bytes": 120783066,
    },
    "grc.lsj.xml": {
        "sha256": "af72685a84a97c2be4e7e00d98132a7978d5da64fffff25696903820a76bba72",
        "bytes": 115550101,
    },
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def check(folder: Path) -> tuple[list[str], int]:
    """(problems, files that match their pins). No problems and every pinned
    file matched is a pass."""
    problems: list[str] = []
    matched = 0
    for name, pin in PINNED.items():
        path = folder / name
        if not path.is_file():
            problems.append(f"{path} is missing")
            continue
        size = path.stat().st_size
        if size != pin["bytes"]:
            problems.append(f"{path} is {size} bytes; the pinned file is {pin['bytes']}")
            continue
        got = _sha256(path)
        if got != pin["sha256"]:
            problems.append(f"{path} has sha256 {got}; the pinned file has {pin['sha256']}")
            continue
        matched += 1
    if not PINNED:
        problems.append("examined nothing: no file is pinned")
    return problems, matched


def folders() -> list[Path]:
    """Every folder the build will read the two files from: $DIOGENES_DATA
    when set, else each distinct sources.diogenes_data the manifests name
    (stages 4 and 5 ask the work's own manifest)."""
    from .config import REPO_ROOT, Manifest
    found = {Manifest.load(p).diogenes_data() for p in sorted((REPO_ROOT / "manifests").glob("*.yaml"))}
    return sorted(found)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="aristotle_pipeline.inputs", description=__doc__.split("\n")[0])
    parser.add_argument("command", choices=["check"])
    parser.add_argument("--dir", type=Path, help=f"the folder to check (default: ${ENV}, else every folder the manifests name)")
    args = parser.parse_args(argv)
    targets = [args.dir] if args.dir else folders()
    bad = 0
    for folder in targets:
        problems, matched = check(folder)
        print(f"{'FAIL' if problems else 'ok  '} {folder}: {matched} of {len(PINNED)} files match their pins")
        for p in problems:
            print(f"  {p}")
        bad += bool(problems)
    if not targets:
        print("FAIL no folder to check: examined nothing")
        return 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
