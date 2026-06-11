"""Manifest loading and path resolution.

Repo layout assumed:
    aristotle-reader/        <- repo root
      manifests/ne.yaml
      sources/               <- committable sources (Perseus TEI)
      build/                 <- pipeline output, gitignored
      pipeline/              <- this package
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml

from .refs import line_key

REPO_ROOT = Path(__file__).resolve().parents[2]
BUILD_DIR = REPO_ROOT / "build"
SOURCES_DIR = REPO_ROOT / "sources"


class Manifest:
    def __init__(self, data: dict, path: Path):
        self.data = data
        self.path = path

    @classmethod
    def load(cls, path: Path | None = None) -> "Manifest":
        path = path or REPO_ROOT / "manifests" / "ne.yaml"
        with open(path, encoding="utf-8") as f:
            return cls(yaml.safe_load(f), path)

    @property
    def work_id(self) -> str:
        return self.data["work"]["id"]

    @property
    def first_column(self) -> str:
        return self.data["bekker_range"]["first_column"]

    @property
    def last_column(self) -> str:
        return self.data["bekker_range"]["last_column"]

    @property
    def books(self) -> list[dict]:
        return self.data["books"]

    def tlg_dir(self) -> Path:
        src = self.data["sources"]
        env = os.environ.get(src["tlg_dir_env"])
        if env:
            return Path(env)
        return (REPO_ROOT / src["tlg_dir_default"]).resolve()

    def diogenes_server(self) -> Path:
        return Path(self.data["sources"]["diogenes_server"])

    def diogenes_data(self) -> Path:
        return Path(self.data["sources"]["diogenes_data"])

    def perseus_eng(self) -> Path:
        vendored = SOURCES_DIR / "tlg0086.tlg010.perseus-eng2.xml"
        if vendored.exists():
            return vendored
        return Path(self.data["sources"]["perseus_eng"])

    def book_for_line(self, column: str, line: int) -> int | None:
        """Book number containing Bekker position (column, line), or None
        if the position falls in an inter-book numbering gap."""
        pos = line_key(column, line)
        for b in self.books:
            m_start = _ref_to_key(b["start"])
            m_end = _ref_to_key(b["end"])
            if m_start <= pos <= m_end:
                return b["n"]
        return None


def _ref_to_key(ref: str):
    from .refs import ref_key

    return ref_key(ref)
