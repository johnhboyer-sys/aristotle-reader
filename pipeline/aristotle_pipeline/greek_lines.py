"""The committed Greek: one line-level file per work, corpus/greek/<Work>.tsv.

The build reads these for a work's Greek (two works read XML vendored under
sources/ instead: De Plantis and the Rhetoric to Alexander); it never runs
Diogenes and never sees the TLG. `python -m aristotle_pipeline.extract` makes
them, on a machine that has the TLG (HANDOFF-PORTABILITY.md, decision 1).

A file is the printed lines of one work, in reading order, each under the
labels of the divisions it sits in:

    # work: Cat
    # edition: Minio-Paluello, Aristotelis Categoriae … (OCT, 1949)
    # columns: Bekker-page	n	text
    1a	1	Ὁμώνυμα λέγεται ὧν ὄνομα μόνον κοινόν, ὁ δὲ κατὰ τοὔ-
    1a	2	νομα λόγος τῆς οὐσίας ἕτερος, …

`n` is the line's own number as printed ("12", "5a", "8,9", "23t"), or empty.
The text is the line's characters with runs of white space made one space,
and nothing else changed: hyphens, "|" line-break marks and Greek punctuation
are as the edition has them, and stage 1 does the parsing. No markup, no beta
code, no Diogenes XML: pipeline/tests/test_corpus_greek.py holds that line.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import NamedTuple

from lxml import etree

from .config import REPO_ROOT, Manifest

CORPUS_DIR = REPO_ROOT / "corpus" / "greek"


class Row(NamedTuple):
    labels: tuple[str, ...]   # one per level, outermost first
    n: str | None             # the line's own number; None when it has none
    text: str


# Which divisions of the export a work's lines are cited by.
_LEVELS = {
    "bekker": ("Bekker-page",),
    "busse": ("page",),
    "chapter-section": ("Section", "subsection"),
}
# A text with no Bekker numbers of its own (Magna Moralia) is relineated from
# its edition's book, chapter and section; see stage1_relineate.
_LINEATED = ("Book", "chapter", "section")


def levels_for(manifest: Manifest) -> tuple[str, ...]:
    if (manifest.data.get("greek") or {}).get("lineation"):
        return _LINEATED
    scheme = (manifest.data.get("citation") or {}).get("scheme", "bekker")
    return _LEVELS[scheme]


def corpus_path(manifest: Manifest) -> Path:
    return CORPUS_DIR / f"{manifest.work_id}.tsv"


def _flat(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def rows_from_xml(xml_path: Path, levels: tuple[str, ...]) -> list[Row]:
    """Every <l> that sits inside a division of each level, in document order.

    Raises where the line file could not say what the XML says: a level nested
    in itself, a division with no label, or two divisions in a row with the
    same labels (the file marks a new division only by a change of label)."""
    tree = etree.parse(str(xml_path))
    rows: list[Row] = []
    last_divs: list | None = None
    for line in tree.iter("{*}l"):
        divs = []
        for level in levels:
            found = [a for a in line.iterancestors("{*}div") if a.get("type") == level]
            if len(found) > 1:
                raise ValueError(f"{xml_path.name}: a {level} division inside another")
            divs.append(found[0] if found else None)
        if any(d is None for d in divs):
            continue
        # Each level sits directly inside the one before it. A wrapper between
        # them, or the levels in another order, is a shape no reader of this
        # corpus has met; stop, do not guess.
        for outer, inner in zip(divs, divs[1:]):
            if inner.getparent() is not outer:
                raise ValueError(f"{xml_path.name}: a {inner.get('type')} division that is not directly inside its {outer.get('type')}")
        labels = tuple(d.get("n") for d in divs)
        if any(not (label or "").strip() for label in labels):
            raise ValueError(f"{xml_path.name}: a {'/'.join(levels)} division with no n")
        if last_divs is not None and any(a is not b for a, b in zip(divs, last_divs)) and rows[-1].labels == labels:
            raise ValueError(f"{xml_path.name}: two divisions in a row are both {labels}")
        last_divs = divs
        n = line.get("n")
        if n == "":
            raise ValueError(f"{xml_path.name}: a line with an empty n under {labels}")
        rows.append(Row(labels, n, _flat("".join(line.itertext()))))
    return rows


_FIELD_BREAK = re.compile(r"[\t\n\r]")


def format_tsv(rows: list[Row], levels: tuple[str, ...], work: str, edition: str) -> str:
    out = [f"# work: {_flat(work)}", f"# edition: {_flat(edition)}", "# columns: " + "\t".join([*levels, "n", "text"])]
    for row in rows:
        fields = [*row.labels, row.n or "", row.text]
        if len(row.labels) != len(levels) or any(_FIELD_BREAK.search(f) for f in fields):
            raise ValueError(f"{work}: a field of {row.labels} {row.n!r} holds a tab or a line break, or has the wrong labels")
        if row.text != _flat(row.text):
            raise ValueError(f"{work}: the text of {row.labels} {row.n!r} is not flat")
        out.append("\t".join(fields))
    return "\n".join(out) + "\n"


def parse_tsv(text: str, levels: tuple[str, ...], name: str = "line file") -> list[Row]:
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    # Three heading lines and no more: a fourth "# " line would be a place to
    # keep anything at all.
    head = 2
    want = "# columns: " + "\t".join([*levels, "n", "text"])
    if len(lines) < 3 or not lines[0].startswith("# work: ") or not lines[1].startswith("# edition: ") or lines[2] != want:
        raise ValueError(f"{name}: expected # work, # edition, and then the line {want!r}")
    rows = []
    width = len(levels) + 2
    for i, line in enumerate(lines[head + 1:], head + 2):
        fields = line.split("\t")
        if len(fields) != width or "\r" in line:
            raise ValueError(f"{name} line {i}: expected {width} tab-separated fields")
        labels = tuple(fields[:len(levels)])
        if any(not label for label in labels):
            raise ValueError(f"{name} line {i}: an empty label")
        rows.append(Row(labels, fields[-2] or None, fields[-1]))
    if not rows:
        raise ValueError(f"{name}: no lines of text")
    return rows


def load(path: Path, levels: tuple[str, ...]) -> list[Row]:
    """A committed line file, or XML of the export's shape (the works vendored
    under sources/, and the tests' fixtures)."""
    if path.suffix == ".tsv":
        return parse_tsv(path.read_text(encoding="utf-8"), levels, path.name)
    return rows_from_xml(path, levels)


# What a line file must never hold: the Diogenes XML, the TLG's own beta
# code, or anything that is not a line of Greek. The rule that does the work:
# every character of a line of text is a Greek one (its Unicode name says so:
# the letters, and the Greek marks · ; ʹ) or one of the marks in _MARKS, which
# are all the others this corpus's editions print. Beta code writes Greek in
# Latin letters (mh=nin a)/eide), and markup needs Latin names and attributes,
# so neither survives, with or without punctuation around the words; nor does
# a Latin letter in another dress (ⓐ, ａ, a combining a). A character outside
# both sets fails the file. An editor's new sign is added here by hand, after
# someone has looked at it.
_MARKS = frozenset(" \"'()*,-.<>[]|«»—‖‘’†⌜⌝⌞⌟⎪⟦⟧\u0323")
# The lines below are the whole corpus's exceptions, each named: an editor's
# cross-reference printed in the text.
NOT_GREEK_OK = {
    ("Prob", "944a", "9"): "δὲ—χρόνος. (p. 941b 4—23.)",
}
# Editors' angle brackets around Greek (<καὶ>) are text. These are markup that
# needs no Latin letter: a closing or empty tag, a declaration, a character
# reference.
_TAG = re.compile(r"</|<[?!]|/>|&#|&[A-Za-z]")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f\x80-\x9f\u2028\u2029]")
# A division's label or a line's number: "24a", "1", "t", "38t", "t1",
# "12t1", "25,26", "25-26".
_LABEL = re.compile(r"(?:[0-9]+[a-z]?[0-9]*|[a-z][0-9]*)(?:[,-][0-9]+)*")
_WORK = re.compile(r"# work: [A-Za-z0-9]+")
# The columns lines there are, and how many fields a row under each has.
_COLUMNS = {"# columns: " + "\t".join([*levels, "n", "text"]): len(levels) + 2
            for levels in (*_LEVELS.values(), _LINEATED)}


def _not_greek(text: str) -> list[str]:
    return [ch for ch in text if ch not in _MARKS and not unicodedata.name(ch, "").startswith("GREEK")]


def forbidden(text: str) -> list[str]:
    """Problems with a line file's contents; empty when it is clean. Every
    line of the file is examined: the three heading lines, each label and
    number, and each line of text. The edition line is free text (an editor, a
    title, a year) and gets only the markup and control checks; the corpus
    test holds it to the manifest's own words."""
    problems: list[str] = []
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    if len(lines) < 4 or not _WORK.fullmatch(lines[0]) or not lines[1].startswith("# edition: ") \
            or lines[2] not in _COLUMNS:
        return ["not a line file: it must open with # work, # edition and a known # columns line, then lines of text"]
    work, width = lines[0][len("# work: "):], _COLUMNS[lines[2]]
    for name, pattern in (("markup", _TAG), ("a control character", _CONTROL)):
        hits = [line for line in lines if pattern.search(line)]
        if hits:
            problems.append(f"{name} in {len(hits)} lines, first: {hits[0][:80]!r}")
    bad_fields, not_greek, letters = [], [], 0
    for line in lines[3:]:
        *fields, body = line.split("\t")
        if len(fields) != width - 1 or any(f and not _LABEL.fullmatch(f) for f in fields) or not all(fields[:-1]):
            bad_fields.append(line)
        letters += sum(ch.isalpha() for ch in body)
        if _not_greek(body) and NOT_GREEK_OK.get((work, *fields)) != body:
            not_greek.append(line)
    if bad_fields:
        problems.append(f"a label or line number that is not one, or the wrong number of fields, in {len(bad_fields)} lines, first: {bad_fields[0][:80]!r}")
    if not_greek:
        problems.append(f"characters that are not Greek in {len(not_greek)} lines, first: {not_greek[0][:80]!r}")
    if not letters:
        problems.append("no letters at all")
    return problems
