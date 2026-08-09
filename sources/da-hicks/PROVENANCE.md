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
| Grok 4.5 (`--effort high`) | **Not for ground truth.** See below. |

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
