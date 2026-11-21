"""The build's two inputs from outside the repo, and the check that they are
the files the site was built from.

    python -m aristotle_pipeline.inputs check [--dir FOLDER]
    python -m aristotle_pipeline.inputs fetch [--dir FOLDER]

Stage 4 reads the Morpheus analyses table (greek-analyses.txt) and stage 5 the
LSJ (grc.lsj.xml). Both ship with Diogenes 4.7.2 (https://d.iogen.es, GPL;
the LSJ file is Perseus's, CC BY-SA). Neither is in this repo: together they
are 236 MB. The folder that holds them is named by the DIOGENES_DATA
environment variable; without it, by each manifest's sources.diogenes_data,
which is the path inside Diogenes.app on a Mac and is a local default only.

`check` hashes both files against the pins below and fails on a missing file
or a changed byte, so a build made with another table or another LSJ cannot
pass for this one. The full build runs it once, before the first work.

`fetch` is for a machine without Diogenes: it downloads the pinned public
release, takes the two files out of it, and holds the archive and each file
to its pin. It writes to --dir or $DIOGENES_DATA and nowhere else, and never
over a file.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import stat
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
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

# The public copy: Diogenes's own 4.7.2 release, the Mac zip. A zip, because
# Python reads one without help; the release's Linux package is Zstandard
# under an .xz name. On 2026-11-21 the two files in it matched the pins above
# byte for byte.
ARCHIVE = {
    "url": "https://github.com/pjheslin/diogenes/releases/download/4.7.2/diogenes-mac-arm64-4.7.2.zip",
    "sha256": "98a8aad0ea049e9cd8065d92e1e63ef04c097854cc8c1840c8650becc7ce5899",
    "bytes": 186076987,
    "folder": "Diogenes.app/Contents/dependencies/data",
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


def _download(dest: Path) -> list[str]:
    """The archive's bytes into `dest`. Problems if they are not the pinned
    ones; the read stops at the first byte past the pinned length."""
    url = ARCHIVE["url"]
    digest = hashlib.sha256()
    size = 0
    request = urllib.request.Request(url, headers={"User-Agent": "aristotle-pipeline"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response, open(dest, "wb") as out:
            for block in iter(lambda: response.read(1 << 20), b""):
                size += len(block)
                if size > ARCHIVE["bytes"]:
                    return [f"{url} is more than {ARCHIVE['bytes']} bytes, the pinned archive's length"]
                digest.update(block)
                out.write(block)
    except (urllib.error.URLError, OSError) as e:
        return [f"could not read {url}: {e}"]
    if size != ARCHIVE["bytes"]:
        return [f"{url} is {size} bytes; the pinned archive is {ARCHIVE['bytes']}"]
    if digest.hexdigest() != ARCHIVE["sha256"]:
        return [f"{url} has sha256 {digest.hexdigest()}; the pinned archive has {ARCHIVE['sha256']}"]
    return []


def _unpack(archive: Path, into: Path) -> list[str]:
    """Each pinned file out of the archive into `into`, read as bytes and never
    extracted by its own path. Problems unless every one is there once, is a
    plain file, and is the pinned file."""
    problems: list[str] = []
    with zipfile.ZipFile(archive) as z:
        for name, pin in PINNED.items():
            members = [i for i in z.infolist() if i.filename == f"{ARCHIVE['folder']}/{name}"]
            if len(members) != 1:
                problems.append(f"{name} is {'not in the archive' if not members else f'in the archive {len(members)} times'}")
                continue
            member = members[0]
            # A zip keeps a link as a member whose mode says so; its bytes
            # would be the link's target path.
            kind = stat.S_IFMT(member.external_attr >> 16)
            if member.is_dir() or kind not in (0, stat.S_IFREG):
                problems.append(f"{name} in the archive is not a plain file")
                continue
            if member.file_size != pin["bytes"]:
                problems.append(f"{name} in the archive is {member.file_size} bytes; the pinned file is {pin['bytes']}")
                continue
            digest = hashlib.sha256()
            with z.open(member) as src, open(into / name, "wb") as out:
                for block in iter(lambda: src.read(1 << 20), b""):
                    digest.update(block)
                    out.write(block)
            if digest.hexdigest() != pin["sha256"]:
                problems.append(f"{name} in the archive has sha256 {digest.hexdigest()}; the pinned file has {pin['sha256']}")
    return problems


def fetch(folder: Path) -> list[str]:
    """Download the public archive and put the pinned files in `folder`.
    Problems, or none when every pinned file is now there. On any failure the
    folder is as it was: no file of the set, no work folder, and not the
    folder itself if this call made it. It makes one folder, not a path."""
    there = [folder / name for name in PINNED if os.path.lexists(folder / name)]
    if there:
        return [f"{path} is already there; fetch does not write over a file" for path in there]
    made = not os.path.lexists(folder)
    work = None
    placed: list[Path] = []
    try:
        if made:
            folder.mkdir()
        work = Path(tempfile.mkdtemp(prefix=".fetch-", dir=folder))
        problems = _download(work / "archive") or _unpack(work / "archive", work)
        if problems:
            return problems
        for name in PINNED:
            # A hard link, where a rename would write over a file that came
            # into being since the look above, or over a dangling link.
            os.link(work / name, folder / name)
            placed.append(folder / name)
        return []
    except OSError as e:
        for path in placed:
            path.unlink()
        return [f"could not write to {folder}: {e}"]
    finally:
        if work is not None:
            shutil.rmtree(work, ignore_errors=True)
        if made and folder.is_dir() and not any(folder.iterdir()):
            folder.rmdir()


def folders() -> list[Path]:
    """Every folder the build will read the two files from: $DIOGENES_DATA
    when set, else each distinct sources.diogenes_data the manifests name
    (stages 4 and 5 ask the work's own manifest)."""
    from .config import REPO_ROOT, Manifest
    found = {Manifest.load(p).diogenes_data() for p in sorted((REPO_ROOT / "manifests").glob("*.yaml"))}
    return sorted(found)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="aristotle_pipeline.inputs", description=__doc__.split("\n")[0])
    parser.add_argument("command", choices=["check", "fetch"])
    parser.add_argument("--dir", type=Path, help=f"the folder (default: ${ENV}; for check, else every folder the manifests name)")
    args = parser.parse_args(argv)
    if args.command == "fetch":
        folder = args.dir or (Path(os.environ[ENV]) if os.environ.get(ENV) else None)
        if folder is None:
            print(f"FAIL fetch needs --dir or ${ENV}: it does not write to the folder a manifest names")
            return 2
        said = "already there, nothing fetched"
        if check(folder)[0]:
            problems = fetch(folder)
            if problems:
                print(f"FAIL {folder}: nothing fetched")
                for p in problems:
                    print(f"  {p}")
                return 1
            said = f"fetched from {ARCHIVE['url']}"
        problems, matched = check(folder)
        print(f"{'FAIL' if problems else 'ok  '} {folder}: {matched} of {len(PINNED)} files match their pins; {said}")
        for p in problems:
            print(f"  {p}")
        return 1 if problems else 0
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
