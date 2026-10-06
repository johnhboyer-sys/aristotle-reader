"""Drop spurious Morpheus secondary readings from a token's analyses.

Morpheus emits every homonym candidate it can generate, unranked. For Attic
prose like Aristotle this includes obvious noise — a Doric masculine reading of
a feminine proper noun (Εὐρώπης), a back-formed alternate lemma sharing the same
gloss as the real one (ἡδονά beside ἡδονή), etc. These surface in the word popup
as extra parse cards, often with no dictionary headword at all.

The filter is deliberately conservative. An analysis with no LSJ match is
removed only when BOTH:
  * the same token has at least one LSJ-backed reading (so something real
    remains), AND
  * the unresolved reading is redundant — it has no gloss, or its gloss exactly
    duplicates a resolved sibling's gloss.

Genuine alternative lemmas (an unresolved reading with a *distinct* gloss, e.g.
ἐφαιρέομαι beside πέλω) and wholly unresolved words (rare terms, proper names not
in LSJ) are always kept. No token is ever left with zero analyses.
"""

from __future__ import annotations

import json
from pathlib import Path

_OVERRIDE_PATH = Path(__file__).with_name("morphology_overrides.json")


def load_morphology_overrides(path: Path = _OVERRIDE_PATH) -> dict[str, dict]:
    """Load and validate the curated surface-form overrides.

    morphology_overrides.json is a plain JSON list, reviewed by hand. Each
    entry is an object with these fields; all strings are Perseus Beta Code
    or English, matched exactly (case-sensitive, no normalisation):

      surface        the token as the Morpheus table (Diogenes'
                     greek-analyses.txt) spells its key: "ou)k", "a)/n",
                     "qew=n". Required; unique in the file.
      lemma          a Morpheus lemma as the table spells it ("a)/n1", "qeo/s").
      parse          a Morpheus parse string exactly as the table spells it
                     ("pres ind act 3rd sg", "neut nom/voc/acc sg"), dialect
                     notes included. Only with lemma.
      gloss          the gloss the front reading shows.
      other_glosses  {lemma: gloss}: glosses for readings behind the front one.
      scope          optional; the only value is "aristotle". It marks an entry
                     whose choice rests on Aristotle's usage between two
                     legitimate readings (a majority or context pick, or a
                     parse chosen for his contexts). The pipeline ignores it:
                     every entry applies in aristotle-reader. A consumer that
                     applies the table to other authors (Moerbeke) leaves
                     these entries out. Junk-gloss fixes and promotions over a
                     wrong word carry no scope: they hold in any author.
      justification  why, in a line an editor can check. Required.

    An entry needs at least one of lemma, gloss and other_glosses, no other
    field, and non-empty strings throughout (other_glosses a non-empty object
    of them). An override fixes a wrong word or a junk gloss (one that is not a
    meaning of the word); it does not rewrite a gloss that names one sense of
    the right word.

    The rules apply in this order to the surface's readings, which are in
    Morpheus's order (the display order; the first is what the card shows):

      1. lemma (and parse): the target is the first reading whose lemma equals
         `lemma` and, when `parse` is given, whose parse equals `parse`. It
         moves to the front whole, with its own parse and LSJ keys; the others
         keep their order. If it is already first, nothing moves. If no
         reading matches, the whole entry does nothing: its gloss and
         other_glosses are not applied either.
      2. gloss: the front reading's gloss becomes `gloss`. This holds whether
         the front reading was promoted in rule 1 or was already first.
      3. other_glosses: every reading after the front one whose lemma is a key
         gets that key's gloss. The front reading is never touched by this
         rule, even if its lemma is a key.

    No rule rewrites a reading's lemma, parse or LSJ keys, so an override
    never changes which dictionary entry a reading opens. Moerbeke applies the
    same file, by these rules, over the raw Morpheus table.
    """
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise ValueError(f"{path}: expected a JSON list")

    overrides = {}
    required = {"surface", "justification"}
    actions = {"lemma", "gloss", "other_glosses"}
    allowed = required | actions | {"parse", "scope"}

    def text(value) -> bool:
        return isinstance(value, str) and bool(value)

    for entry in entries:
        if not isinstance(entry, dict) or not required <= entry.keys():
            raise ValueError(f"{path}: every override needs surface and justification")
        surface = entry.get("surface")
        if set(entry) - allowed or not (actions & entry.keys()):
            raise ValueError(f"{path}: invalid override fields for {surface}")
        if entry.get("scope", "aristotle") != "aristotle":
            raise ValueError(f"{path}: scope must be \"aristotle\" for {surface}")
        if "parse" in entry and "lemma" not in entry:
            raise ValueError(f"{path}: parse without lemma for {surface}")
        others = entry.get("other_glosses", {"-": "-"})
        if not (isinstance(others, dict) and others
                and all(text(k) and text(v) for k, v in others.items())):
            raise ValueError(f"{path}: other_glosses must map lemmas to glosses for {surface}")
        if not all(text(v) for k, v in entry.items() if k != "other_glosses"):
            raise ValueError(f"{path}: override values must be non-empty strings")
        if surface in overrides:
            raise ValueError(f"{path}: duplicate surface {surface}")
        overrides[surface] = entry
    return overrides


MORPHOLOGY_OVERRIDES = load_morphology_overrides()


def _promote(parses: list[dict], index: int) -> list[dict]:
    """Move one analysis to the front without disturbing any other order."""
    return [parses[index], *parses[:index], *parses[index + 1 :]]


def apply_morphology_override(
    parses: list[dict],
    surface: str | None,
    overrides: dict[str, dict] = MORPHOLOGY_OVERRIDES,
) -> list[dict]:
    """Apply the surface's curated override, by the rules in
    load_morphology_overrides: promote (lemma, parse), then gloss the front
    reading, then gloss the readings behind it (other_glosses). Returns the
    input unchanged when the surface has no entry or no reading matches the
    entry's lemma and parse; never mutates it.
    """
    override = overrides.get(surface) if surface is not None else None
    if override is None or not parses:
        return parses

    corrected = list(parses)
    if lemma := override.get("lemma"):
        parse = override.get("parse")
        index = next(
            (i for i, reading in enumerate(corrected)
             if reading["lemma"] == lemma
             and (parse is None or reading["parse"] == parse)),
            None,
        )
        if index is None:
            return parses
        corrected = _promote(corrected, index)
    if gloss := override.get("gloss"):
        corrected[0] = {**corrected[0], "gloss": gloss}
    others = override.get("other_glosses", {})
    corrected[1:] = [
        {**reading, "gloss": others[reading["lemma"]]}
        if reading["lemma"] in others else reading
        for reading in corrected[1:]
    ]
    return corrected


def filter_parses(parses: list[dict]) -> list[dict]:
    """Return `parses` with redundant unresolved readings removed.

    Each parse is a dict with at least `gloss` (str) and `lsj` (list) keys.
    """
    has_resolved = any(p["lsj"] for p in parses)
    if not has_resolved:
        return parses

    resolved_glosses = {
        p["gloss"].strip() for p in parses if p["lsj"] and p["gloss"].strip()
    }

    kept = []
    for p in parses:
        gloss = p["gloss"].strip()
        redundant = (not p["lsj"]) and (not gloss or gloss in resolved_glosses)
        if not redundant:
            kept.append(p)
    return kept
