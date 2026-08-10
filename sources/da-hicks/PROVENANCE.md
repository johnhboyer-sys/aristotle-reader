# Hicks, *Aristotle De Anima* (Cambridge, 1907) — vendored scan

Greek text, facing English translation, apparatus criticus, and a line-keyed
commentary. The first target for the commentary layer, and the first candidate
for a Kraken model trained on a mixed polytonic-Greek/English page.

## Copyright

First published 1907 (Cambridge University Press), so public domain in the US on
publication date alone — no renewal search needed. Hicks died in 1929, so the
UK/EU life+70 term expired in 1999. Recorded against item 10 of the unknowns
register in `docs/commentary-layer-plan.md`.

## What was vendored, and why this copy

Chosen: Internet Archive item **`in.ernet.dli.2015.154226`** (Digital Library of
India), 600 ppi, 719 pages.

Candidates compared on a sample page each, at native resolution:

| Item | Source | Res | Verdict |
|---|---|---|---|
| `in.ernet.dli.2015.154226` | DLI | 600 ppi, 3449×5186 | **Chosen.** Crisp black on white, diacritics intact, no reader marks. |
| `aristotledeanima005947mbp` | RMSC-IIITH | 3449×5185 | Equal quality; appears to be the same underlying scan re-uploaded. Only bitonal TIFF is offered, no JP2. Backup. |
| `aristotledeanim00hickgoog` | Google / U. Michigan | 3270×5814 | Sharp, but that copy is covered in a previous reader's pencil underlining straight through the type. Unusable as ground truth. |
| `aristotledeanima0000rdhi` | IA Cebu | 360 ppi, 1694×2773 | Lowest resolution, warm/yellowed cast. |
| `aristotledeanima0000aris` | IA Cebu | 360 ppi | A Kessinger print-on-demand reprint, i.e. a scan of a scan. |

A second DLI copy exists at `in.ernet.dli.2015.156974` if this one turns out to
have gaps.

Files in `scan/` (all gitignored — re-fetchable from the identifier above):

- `hicks-1907_jp2.zip` — the JP2 page masters, the raster to train and segment on
- `hicks-1907.pdf` — reading copy
- `hicks-1907_ia-ocr.txt` — the Internet Archive's own OCR, kept as a baseline
- `hicks-1907_ia-metadata.json` — item metadata as fetched

## No usable OCR of Hicks exists

Checked 2026-08-08: no transcription of this edition has been published. Not on
Wikisource (which has no Hicks text at all — its Aristotle *On the Soul* is a
different translation), not in Perseus (whose De Anima Greek is Ross and Bekker,
not Hicks's text), not in Open Greek and Latin. HathiTrust holds another scan of
the same book but no transcription. What exists everywhere is page images plus
the same commodity OCR.

That OCR is fine on the English and fails exactly where this edition matters. In
the shipped `_djvu.txt`, Bekker references lose their column letter to a Greek
lookalike (`408 b` read as `408 Ὁ`), Greek words come back with the wrong vowel
or wrong breathing, and short Latin abbreviations in the apparatus are read as
Greek. The apparatus criticus — dense sigla, abbreviations and single Greek words
— is the worst-served part of the page and the part the commentary layer needs
most.

So: ground truth has to be made. The Bonitz work is the precedent — a Kraken
model trained on hand-adjudicated lines, with the house-style/damage separation
kept intact.

## Which model transcribes the ground truth (bake-off, 2026-08-08/09)

Four models were given the same two pages, cut into six overlapping bands each:
p. 95 (English translation over a critical apparatus) and p. 314 (continuous
commentary with inline Greek). Same diplomatic brief every time — reproduce the
printer's errors, never normalise toward correct Greek.

| Model | Verdict |
|---|---|
| Haiku 4.5 | **Rejected.** Read smooth breathings for rough (`ἀπτὸν`, `ἀπλοῦν` for `ἁπτὸν`, `ἁπλοῦν`) in the p. 95 apparatus. Cheapest by a wide margin and wrong exactly where the page is hard. |
| Sonnet 5 | **Usable.** Got the p. 95 breathings right. One invented character: inserted a full stop after a comma the page does not print. |
| Opus 5 | **Best.** No confirmed error. Costs about 1.6× Sonnet on this pattern. One disagreement with Sonnet unresolved — `ἐστίν` vs `ἐστὶν` in the p. 145 apparatus, where the crop clipped the accent. |
| Grok 4.5 (`--effort high`) | **Usable offline; never online.** See below — the first run's failures were caused by the network, and did not survive its removal. |

Grok fails in a way the others did not. On p. 95 it could not resolve the
apparatus from the image, so it web-searched and fetched
`aristotledeanima005947mbp_djvu.txt` from the Internet Archive — the commodity
OCR this file documents as broken on exactly that material — and grepped it for
the strings it was trying to read. The transcription stopped being a reading of
the ink. It then reported `ἀπτὸν`, `ἀπλοῦν` and `ἄπουν` as three PRINTER'S
ERRORS, "smooth breathing clearly printed"; the ink shows rough. On p. 314 it
flagged `ἀκίνητόν ἐστι` as a printer's error expecting an accent on the eta —
the extra acute is the ordinary enclitic accent (Smyth §183a), and the accent it
proposed is not a possible accentuation of the word.

### The offline rerun settles it (2026-08-10)

Ten pages were then read with `--disable-web-search`, sampled across all five
page types and including both earlier pages as controls. Outputs, prompts and
the driver are in `work/grok-2026-08-10/`. No session touched the network.

The p. 95 control clears Grok of everything above. Offline it read `ἁπτὸν`,
`ἁπλοῦν`, `ἅπουν` — rough, agreeing with Sonnet and Opus — and withdrew all
three fabricated printer's errors. The p. 314 control reproduced its earlier
body text almost exactly, dropped the false `ἀκίνητόν` claim, and corrected
`ἕν` to `ἓν`, which is what the ink shows. **Every failure in the first run was
caused by the archive fetch, not by the model's eyes.** Grok cannot be trusted
to stay off the network on its own — it reached for it unprompted, and only on
the page that was hard — so the flag is not optional.

Two of its printer's-error claims were checked against the ink at 12× and both
hold: p. 314 prints a bare `η` where the sense demands `ἢ`, and the p. 614 index
headword prints `μυκτὴρ` with a grave where an isolated headword wants
`μυκτήρ`. It also read the index's old-style figures correctly — `21 b 16`,
`4 b 15`, where `1` prints as `I` and `4` as `+` — which is the trap that page
was chosen to set.

Still unresolved: whether the p. 95 apparatus prints `ἄπουν` or `ἅπουν`. Grok's
two runs disagree, alpha-privative argues for smooth, and the breathing is a
two-pixel feature that this 600 ppi scan does not settle. It needs a better
image or the book.

So Grok earns a place as a **second reader** — a genuinely independent set of
eyes whose disagreements with Opus are worth adjudicating, and whose uncertainty
register is the most detailed of the four. It is not the model of record.

**Constrain it with flags, not with prose.** The prompt for all ten pages said
"Do not write scripts to re-crop or process the images. Read them." All ten ran
shell anyway, and most wrote their own zoom crops to a scratch directory; that
is where the tool-call counts (22 to 170 a page) and most of the ~900k tokens
went. The network came off only because `--disable-web-search` blocks it, not
because the prompt forbade it. Assume any instruction that merely asks Grok to
refrain will be ignored on a vision task, and reach for a hard block or a
stripped toolset instead — `--disallowed-tools` for the terminal if the crops
are not wanted, though letting it crop is cheap enough to tolerate.

Manufacturing corrigenda is worse than misreading, because a misreading is
caught by a second pass and a fabricated printer's error survives into the
apparatus. Grok is a plausible **second reader** — its uncertainty register was
the most detailed of the four, and it caught real typographic facts the others
missed (the thin space inside `686 b 28`, the space before the colon in
"in it : salt") — but only with `--disable-web-search`, and never as the model
of record. p. 314, where it stayed ink-only, was its good page; the network is
what it reaches for when the page gets hard.

## Cost, in tokens

Image input is fixed: six bands at 1568px wide is about 5,650 tokens a page.
Everything above that is the agent loop — each band read in its own turn resends
the whole accumulated context, so band 1's image is billed roughly six times.
Measured on two pages: Opus ~60k tokens/page over 115 tool calls, Sonnet ~37k
over 21, Haiku ~21k over 12, Grok highest of all (73 and 130 tool calls, most of
it spent writing its own crop scripts).

A single call carrying all six bands at once costs about 6,300 input plus ~2,500
output per page — roughly 5× cheaper, and the way the real runs should be made.
At that rate the whole ground-truth programme is under $10 on Opus. Token cost
is not the constraint here; adjudication is.

## Open questions before training

- **Page taxonomy.** This book has at least four page types — Greek text with
  apparatus, English translation, continuous commentary with inline Greek, and
  index. They may not want one model, and they certainly don't want one
  segmentation.
- **How much ground truth.** Working estimate: 40–80 pages, starting with 20 and
  letting the learning curve decide — transcribe 20 across the page types,
  adjudicate, train, measure CER on a held-out 10, add 20, re-measure, stop when
  held-out error stops falling. Hicks runs ~45 lines a page, so the Bonitz corpus
  (4,612 lines) is about 100 Hicks pages equivalent, but fine-tuning from the
  Bonitz model should need far less. Sample weighted toward the apparatus, not
  evenly: it is both the hardest region and the one the commentary layer needs.
  Segmentation is a separate and cheaper job — 10–20 pages.
- **Whether the existing Bonitz model transfers** as a starting point, or whether
  the Greek face here is different enough to warrant training from scratch.
- **A character-set spec** should be settled before further transcription —
  apparatus separator, elision apostrophe, quotation marks, spacing inside
  quotes — so adjudicated pages don't disagree with each other.
