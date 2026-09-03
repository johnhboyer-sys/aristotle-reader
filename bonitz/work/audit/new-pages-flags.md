# Flagged sites, pages 63-102 (Opus wave reads, 2026-08-16)

Not audit cards yet — these pages are not reconciled, so there is no queue to
put them in. This is the holding list, written down as the readers reported so
it does not die in a transcript. Feed it into the queue when 63+ is reconciled.

## Needs John's ruling

| site | question |
|---|---|
| page-071-R:33 | `ȣ?τοι` — three readers, three answers. Opus `ȣ͂τοι` (perispomeni, no breathing); kraken r3 `ȣτοι` (bare); my own read of the ink at 9x: a narrow mark that is NOT a perispomeni. οὗτοι would want rough+perispomeni. |
| page-096-R:34 | `πις13` or `πιϛ13` — final sigma or stigma. ⚠ THE READER CHANGED THIS ONE "for consistency", which is not evidence. Sense favours stigma (Problemata book numbers use the numeral series; ς has no numeral value, ϛ = 6). The ink is ambiguous: the glyph closely matches the `ς` ending ὁμοίας and γωνίας on the same line. |
| page-096-L:22 | `661,a10` — a comma-shaped mark with a descender stands where a period belongs. Reader's own flag; period is the alternative. |

## Recorded as printed, deliberately uncorrected (corrigenda candidates)

Sigla that disagree with their Bekker numbers:
- page-081-L:11 `Φθ8. 363a1.`  (363a1 is Meteorologica, Φ is Physica)
- page-067-R `Πβ6. 1383b26` (Π, not Ρ); `Ηδ3.` with no number following
- page-068-L `Ηγ8. 1150b17` (γ, not η)
- page-068-R `Ζιδ8. 596b2` (δ, not θ)
- page-070-R `Ζμγ7. 516a17`, `Ζμδ10. 628a12`, `Ζμα16. 494b28` (μ where ι expected)
- page-075-L:8 `Ηιι8. 1178a30` (two iotas, not the x-shaped κ used elsewhere)
- page-076-R:6 `Ζμδ3. 768a26` (Ζγδ3 expected)
- page-077-L:47 `Ηη15. 1163a1` (Ηθ15 elsewhere)
- page-078-L:49 `Κ5. 2b61.`
- page-096-L:29 `Οδ3. 310b03 Prtl.` (three digits, confirmed at zoom)

Compositor's slips:
- page-063-R:33 `ζωστοκεῖ` for ζῳοτοκεῖ (glyph unambiguously σ)
- page-073-L:18 `κάπνον` for καπνόν (accent over the alpha)
- page-075-L:38 `τὸ μόρια` for τὰ μόρια
- page-078-L:39 `yel` for vel (well-formed y with descender; `vel` prints cleanly one line below)
- page-078-R:14 `ἀντιστέφειν` (ρ dropped)
- page-078-R:51 `ἀντιστραμμένως` amid `ἀντεστραμμένως`
- page-079-R:23 `ταȣ̓τȣ͂` — ou-ligature where υ belongs (line 10 has normal `ταὐτȣ͂`)
- page-064-L:10 `Ζιι46: 630b29.` — colon for period
- page-066-R:61 `947b11-11. 949a20.`
- page-063-L:8 `ϗ` printed BARE twice in one line, where every other kai on these pages carries its grave

## Resolved, no action

- The isolated bold `V.` at the foot of a left column is the PRINTER'S SIGNATURE
  (volume mark, Band V), on an exact 8-page gathering interval — verified in the
  ink at pages 21, 29, 37, 45, 53, 61, 69, 77. It is furniture. Two had reached
  the ground truth (page-029-L, page-045-L) and were removed 2026-08-16;
  page-069-L's was removed from the wave read. [[absence-rendered-as-clean]]

## Corpus decision, not a defect

**Printed overbar at page-085-R:56 — `ἀπε͞ικά-`** (U+035E COMBINING DOUBLE MACRON
as encoded by the reader). A crisp straight bar spans the `ει`, at accent
height, verified in the ink at 6x — not bleed, not show-through. It is the ONLY
overbar of any kind in the whole of raw/opus.

⚠ TWO SEPARATE QUESTIONS, DO NOT LET THEM MERGE.
  1. What is it? A macron over a diphthong is odd. Candidates: a length mark on
     spurious `ει`, a corrigendum mark, or a lifted piece of rule that took ink.
     This is a question about Bonitz's practice, not about pixels.
  2. How is it encoded? U+035E spans two letters, which matches what is printed.
     The alternatives are U+0304 on each letter separately, or one U+0304 on the
     iota. Whatever is chosen, it is a NEW CODEPOINT in the corpus and moves the
     codec, exactly like the angle brackets above.

**Angle brackets `⟨ ⟩` (U+27E8/U+27E9) enter the corpus at page-090-L:15.**
Bonitz sets them for a variant reading — `ἀπὸ ⟨? Simpl ὑπὸ⟩ τȣ͂ μέσȣ` — and in
the ink they are visibly angular against the ordinary curved `(` and `)` on the
SAME line, so this is not a misread parenthesis.

The settled 96 columns of 15-62 contain none: only `( )` (733/736) and `[ ]`
(4/4). So these are two new characters, and they extend the alphabet the
recogniser is trained on — round 5's codec is 243 entries, and a rebuilt corpus
covering page 90 would make it 245.

⚠ That is a decision, not an accident: it changes the codec size, and codec size
is one of the things checked when comparing training rounds. Note it in the next
export rather than discovering it in a parameter table.

## Defect in filter_kraken_lines.py — head_short eats real lines

`page-090-R` line 1 is `364a29.`, a Bekker citation continuing from the foot of
page-090-L. The filter dropped it under `head_short`, leaving 60 lines where the
column has 61. Opus kept it; that one column is the ONLY line-count disagreement
between Opus and kraken across all 80 columns of pages 63-102.

Rule 4 was written to drop a short stub "at head or foot". At the foot that is
right — the printer's signature. At the HEAD it is wrong often enough to matter,
because Bonitz's citations run across the column break and a continuation line
is legitimately short.

⚠ The two cases are not symmetric and the rule treats them as if they were. A
foot stub completes nothing; a head stub completes the previous column. Fixing
it needs the previous column's last line, which the filter does not currently
read. Until then `head_short` should be reported and NOT dropped.
