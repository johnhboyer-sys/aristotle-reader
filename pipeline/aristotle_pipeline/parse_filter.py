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
