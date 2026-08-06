# Run notes — Bonitz PDF pages 52–91 (40 pages)

Session of 2026-08-05/06. Worktree: `aristotle-worktrees/bonitz-40`, branch
`claude/loving-agnesi-ca09ab`. All prior Bonitz work lives on that branch; the
main checkout was on `claude/source-import` and had only the loose p52
artifacts.

## Config used

- **Reader slot: Opus 5.** Not Sonnet. The reader-slot defect memo measured
  Sonnet at 9.3 ȣ→υ misreads/page against Opus 0.64 — a 14× gap — and Haiku
  and Codex/`gpt-5.6-sol` both confabulate the ligature outright.
- **Adjudicator slot: Sonnet 5**, per the p47–49 bake-off.
- **Third/fourth readers: already on disk.** LlamaParse `raw/llamaparse/`
  covers 15–171; History Genie chunk `Bonitz 1-200-3.docx` covers PDF 1–200.
  No API key and no credits were needed for this range.
- **Sol (`gpt-5.6-sol`): adversarial reviewer only**, never a reader.

## Pre-flight findings

### LlamaParse ligature damage in this range (cannot be re-run — no key)

`raw/llamaparse/LIGATURE-HEALTH.json`, pages 52–91:

| page | ligatures kept | flattened to plain υ | verdict |
|---|---|---|---|
| **54** | **0** | **9** | worst: LlamaParse read no ligature at all on this page |
| **74** | 10 | 8 | heavily degraded |
| **89** | 14 | 4 | degraded |
| 56 | 25 | 4 | watch |
| 77 | 31 | 3 | watch |
| 52, 53, 57, 60, 64, 67–70, 72, 78, 79, 87 | healthy | 1–2 | normal |

Why it matters: LlamaParse is the reader the comparator leans on for this
character. A flattened vote lets all three readers "agree" on υ with nothing
flagged. This is the exact silent-leak path that `compare3.py:115` used to
hide. Mitigation in place: the fixed flag rule, plus
`lexcheck --scan-reconciled` after every reconcile, which finds words that
*no* reader read as a ligature by testing them against 56k corpus wordforms.
Pages 54, 74 and 89 get named scrutiny in the review.

## Page 52 (was adjudicated but never reconciled)

Finished first. The Opus recheck had flagged **2 overrides of Sonnet
HIGH-confidence verdicts**, both patched in before reconciling (Sonnet
originals preserved as `*.sonnet.json`):

- **052-R** `ὁποτερȣ͂` → `ὁποτερȣȣ͂`. Two adjacent ou-ligatures, not one;
  gives ὁποτερουοῦν, gen. of ὁποτεροσοῦν — the form at Pol. Ζ4 1319b9, and
  the one the entry needs. All three readers dropped a ligature and the
  adjudicator ratified the majority. Shared-blind-spot class.
- **052-L** `Ρβά13` → `Ρβἀ13`. Opus pixel-dumped the mark: horizontal bar
  descending right then curling back left = breathing hook, not the
  monotonic diagonal this font uses for an acute. Semantically odd either
  way; diplomatic rule says record the ink.

Reconcile: 4 edits, 2 items queued. Deterministic checks all clean —
lexcheck 0, breathing 0 strong, bekker 0 impossible, alphacheck 0
violations, family 0.

**This contradicts the standing cost argument.** The p49 measurement that
justified all-Sonnet adjudication was "0 overrides on Sonnet's 30
HIGH-confidence verdicts". On p52 the Opus recheck overrode **2 of 20**
high-confidence verdicts, and both were real. The silent-leak rate for the
Sonnet adjudicator slot is not zero. Flagged for John's ruling.

## STANDING RULE (John, 2026-08-06): max 5 reader agents at once

Launch Opus reader waves **5 columns at a time**, waiting for each group to
land before starting the next. Set after the 2026-08-05 night run launched two
10-column waves back to back; the session limit hit at 2:10am and killed **9
readers mid-read**, destroying ~35 minutes and ~200k tokens of unbanked work
apiece.

The cap does not prevent limit hits — it bounds the blast radius. Completed
columns are safe the moment they reach `raw/opus/` (write-once); only in-flight
reads are lost.

Throughput cost, stated plainly: 80 columns at 5-wide is ~16 waves. Do not
quietly widen the wave to catch up.

**Extended 2026-08-06: the cap applies to adjudicators too** (John: "cap them
as well"). Adjudicators load the same 6-7 strips per column, so a wide wave
risks the same unbanked loss. Max 5 agents at once, both slots.
