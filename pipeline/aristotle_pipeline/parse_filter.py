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
    entry is an object:

      surface        the token as the Morpheus table (Diogenes'
                     greek-analyses.txt) spells its key, in Perseus Beta Code:
                     "ou)k", "a)/n", "qew=n". Required; unique.
      lemma          a Morpheus lemma, spelled as the table spells it ("a)/n1",
                     "qeo/s"). If a reading with this lemma is among the
                     surface's analyses, the first such reading moves to the
                     front, whole: its parse and its LSJ keys come with it, and
                     the others keep their order. If the front reading already
                     has it, nothing moves. If no reading has it, the entry
                     does nothing (its gloss is not applied either).
      gloss          the gloss the front reading shows once the lemma rule has
                     run.
      justification  why, in a line an editor can check. Required.

    An entry needs lemma, gloss or both, all values non-empty strings, and no
    other field. Nothing here changes a reading's parse or LSJ keys, so an
    override never changes which dictionary entry a reading opens. Moerbeke
    reads this same file to apply the overrides over the raw Morpheus table.
    """
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise ValueError(f"{path}: expected a JSON list")

    overrides = {}
    required = {"surface", "justification"}
    allowed = required | {"lemma", "gloss"}
    for entry in entries:
        if not isinstance(entry, dict) or not required <= entry.keys():
            raise ValueError(f"{path}: every override needs surface and justification")
        if set(entry) - allowed or not ({"lemma", "gloss"} & entry.keys()):
            raise ValueError(f"{path}: invalid override fields for {entry.get('surface')}")
        if not all(isinstance(value, str) and value for value in entry.values()):
            raise ValueError(f"{path}: override values must be non-empty strings")
        surface = entry["surface"]
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
    """Apply a curated lemma/gloss repair after automatic resolution.

    Morpheus's order is the display order, and its first reading is what the
    word card shows. Where the right reading is in the list but not first (θεῶν
    under θέα "seeing"), it is promoted whole, keeping its own parse and LSJ
    keys. Where the right reading is first but its gloss is junk (οὐ "u"), the
    gloss is replaced. The lemma of a reading is never rewritten: if the entry
    names a lemma the list does not offer, nothing changes at all, since its
    gloss was written for a reading that is not there.
    """
    override = overrides.get(surface) if surface is not None else None
    if override is None or not parses:
        return parses

    corrected = list(parses)
    if lemma := override.get("lemma"):
        index = next(
            (i for i, parse in enumerate(corrected) if parse["lemma"] == lemma),
            None,
        )
        if index is None:
            return parses
        corrected = _promote(corrected, index)
    if gloss := override.get("gloss"):
        corrected[0] = {**corrected[0], "gloss": gloss}
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
