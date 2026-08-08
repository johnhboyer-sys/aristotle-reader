# Corrigenda — Bonitz's errors, recorded and preserved

John's ordering, 2026-08-07: **diplomatic transcription first; mechanical
correction against TLG later, for a separate "revised and corrected" edition.**

So a sweep hit is not a licence to edit.  Every one gets checked against the
400 dpi ink and lands in exactly one of three classes:

    (a) misprint in Bonitz       -> PRESERVE in work/reconciled; record here
    (b) misread by our readers   -> FIX in work/reconciled; nothing recorded here
    (c) Bonitz quoting a variant -> PRESERVE; signposted in the line itself by
                                    vl / ci / codd / fort / Bk / Bz

Only (b) is ours to correct.  (a) is the edition's own error and belongs to the
revised edition, which is why it is banked rather than fixed — and why a
"correction" that moves away from the ink is the worst outcome available here.
Two of John's rulings were silently overwritten that way and had to be reverted
on 2026-08-08 (`ἀλίσκεται`, `ἀλίζειν`, both 044-R).

## Files

`entries.json` — one object per recorded error:

    {"page": 29, "col": "R", "line": 59,
     "printed": "οἴες",            # what the ink actually has
     "correct": "ὄϊες",            # what the revised edition should print
     "rule": "A6 §167c",           # which sweep found it, or "hand"
     "authority": "...",            # why `correct` is right — grammar, TLG, parallel
     "checked": "400dpi 2026-08-08",
     "note": "..."}

`printed` must match `work/reconciled` exactly.  A test asserts that: if a
later pass edits a line recorded here, the corpus and the register disagree and
the register is the one that saw the page.
