# Answer keys in John's Papers Library

Library: `/Users/johnboyer/Documents/Papers Library/` (4,270 PDFs). Surveyed 2026-11-05 from filenames, then opened the candidates below with `pdfinfo` and `pdftotext -layout`. I read index pages and a few sample pages, not whole books. "Selective" and "exhaustive" are judged from the index format and the book's design, not from a full read.

Page numbers are PDF pages (what `pdftotext -f/-l` takes), not printed pages. Loci counts are rough: I counted Bekker-shaped tokens (`\d{3,4}[ab]\d+`) in the index pages, which undercounts short forms such as `90 b34` and overcounts repeats.

## Practical warnings

1. **Most files are iCloud placeholders** (`ls -lO` shows `dataless`). Reading one from a shell hangs. Run `brctl download "<file>"` and wait 10-60 seconds until the flag clears. `Bonitz` (117 MB) and `Kenny` (261 MB) are the large ones.
2. **Many "books" are excerpts.** Gill, Witt, King, Bowin and Cooper are 4 to 30 page chapters or fragments. Check `pdfinfo` before counting on an index.
3. **Coverage is thin on ethics and politics.** No Hardie, Urmson, Kraut, Nussbaum *Fragility*, Cooper *Reason and Human Good*, Hintikka *Time and Necessity* (only his articles) or Sorabji-style ethics monograph is present. The strong holdings are metaphysics, physics, teleology and soul. Concepts such as φρόνησις, μεσότης, φιλία, ἡδονή and ἀκρασία have no good key here. Pellegrin's dictionary covers them thinly.
4. No post-TLG "list every occurrence" monograph turned up among the candidates. All the books below are discussion-based. Their indexes list loci the author treats, which is the selective kind of key John wants. The exhaustive items are Bonitz and, in effect, the edited collections.

## Ranked table

| # | Path (under the library root) | Concept | Selective / exhaustive | Index locorum (PDF pp) | Loci estimate | Text layer OK? | Note |
|---|---|---|---|---|---|---|---|
| 1 | `Irwin-1988-Aristotle's First Principles_1.pdf` (721 pp; also `Irwin-Aristotle's First Principles-1988-Oxford University Press.pdf`) | First principles, dialectic, method; also substance, form, ethical foundations | **Selective, and ranked.** The index marks "the more important references" with an asterisk. | 680-701 (printed 661-682) | ~2,200+ Bekker tokens; ~600 starred | Yes; clean, born-digital | Best candidate. Starred loci give a built-in top tier. The topic is broad, so score only the chapters that match the concept. Index is keyed `chapter n. note` as well as page. |
| 2 | `Bechler-2011-Aristotle's Theory Of Actuality.pdf` (221 pp; SUNY 1995) | ἐνέργεια / ἐντελέχεια / actuality | **Selective, and ranked.** An emphasised page number means the passage is quoted and treated in detail. | 193-214 | ~410 lines | Yes; ebook-style OCR, spacing odd (`71a 13`) | Single-concept monograph. Bekker refs have a space before the letter, so normalise before parsing. Emphasis marks may not survive OCR; check before relying on them. |
| 3 | `Johansen-2012-The Powers of Aristotle's Soul.pdf` (313 pp) | ψυχή as a set of powers; De Anima | Selective | 307-313 (General Index at 304) | ~490 | Yes | Clean, compact index in `Work / book.chapter / Bekker page` nesting. De Anima centred, so it tests ψυχή and perception lists well. |
| 4 | `Charles-2002-Aristotle on Meaning and Essence.pdf` (427 pp) | Essence, definition, meaning (Posterior Analytics II, Metaphysics Z) | Selective | 416-422 | ~410 | Yes | Index entries carry full Bekker ranges with page lists, so deep discussion shows as many pages per locus. Good for οὐσία / τὸ τί ἦν εἶναι / ὁρισμός. |
| 5 | `Wedin-2000-Aristotle's Theory of Substance.pdf` (497 pp; also `_1` and `_supplement_1` copies) | οὐσία in Categories and Metaphysics Z | Selective | 480-~490 | ~360 | Yes | Tight scope (Cat. + Met. Z), so a narrow but dependable key. |
| 6 | `Leunissen-2010-Explanation and Teleology in Aristotle's Science of Nature.pdf` (266 pp) | Teleology, necessity, explanation (biology, Physics II) | Selective, but the index is long | 257-266 | ~840 | Yes | Good for τέλος and "for the sake of". The long list means many peripheral cites; weight by pages-per-locus. |
| 7 | `Gotthelf-Teleology, First Principles, and Scientific Method in Aristotle's Biology-2012-Oxford University Press.pdf` (also `Gotthelf-2012-Teleology...pdf`, 459 pp) | Teleology and final cause (PA, GA, Physics II) | Selective by discussion; an essay collection, so topic drift | 434-446 | ~1,050 | Yes | Lists by work and chapter first, then Bekker line. Pairs well with #6 for τέλος. |
| 8 | `Ward-2008-Aristotle on Homonymy.pdf` (230 pp) | Homonymy / focal meaning (πολλαχῶς λέγεται) | Selective | 225-228 | ~190 | Yes | Short, clean index. Small key, useful for a "senses of X" concept. |
| 9 | `Shields-2002-Order in Multiplicity.pdf` (305 pp; also `Shields-Order in Multiplicity-2002-Oxford University Press.pdf`) | Homonymy and core-dependent meaning; soul and body | Selective | 296-301 | ~500 | Yes | Overlaps Ward. Strong on De Anima and Categories. |
| 10 | `Pellegrin/Pellegrin-2007-Dictionnaire Aristote-Ellipses Marketing.pdf` (199 pp) | A concept dictionary: an alphabetical set of entries (acte, âme, amitié, bonheur, contemplation, continence...) | **Selective**; each entry cites only a few passages | No index. Entries run alphabetically, contents on the first pages. | ~250 Bekker cites in the body | Partly: Latin letters and Bekker numbers read well; Greek is garbled | The only concept-keyed reference here that spans ethics and politics. It gives roughly 2 to 3 anchor passages per concept, so it is a thin but independent check. French. |
| 11 | `Unknown-2004-A Commentary on Aristotle's Metaphysics, Or, -A Most Ample Index to The Metaphysics of Aristotle- (Index Locupeltissimus in Metaphysicam Aristotelis).pdf` (430 pp) | Suárez's topic index to the *Metaphysics*, tr. J. P. Doyle | Selective by design (a scholastic topic-by-text index) | None; text is organised by Metaphysics book (contents p. ~7) | n/a; topic-to-text mapping | Yes | Historical, Metaphysics only. Keys questions to text segments by chapter ("Text N"), not Bekker lines, so mapping is by hand. Interesting as a pre-modern concept key. |
| 12 | `Waterlow-1988-Nature, Change, and Agency in Aristotle's Physics.pdf` (276 pp; also `Waterlow/...Clarendon Press.pdf`) | φύσις, change, agency (Physics I-III, VIII) | Selective | **None.** General index only, 267-276. | n/a | OCR; usable, with errors in numerals | Subject index lists topics with printed page numbers, not Bekker lines. Good concept coverage, weak as a scoring key without extra work. |
| 13 | `Bonitz-1870-Index Aristotelicus.pdf` (1,156 pp; also `Bonitz/Bonitz-1870-Index Aristotelicus-Berloni.pdf`) | Lexicon of every lemma | **Exhaustive** | n/a; alphabetical lexicon | tens of thousands | **No.** OCR of the Greek is garbage on the pages I sampled; line cites partly legible | Right authority, wrong file. Exhaustive per lemma, with senses grouped. Needs a better scan or the Bonitz repo's own pipeline (`~/Developer/bonitz-text`). |

## Checked and rejected (do not spend more time)

| Path | Why |
|---|---|
| `Judson aristotle's physics.pdf` (422 pp) | Essay collection (OUP 1991). The PDF lacks its end matter; no locorum index found. |
| `FORTENBAUGH-2006-Aristotle's Practical Side.pdf` (494 pp) | Essay collection on ethics, rhetoric and politics. Ancient-sources index at about 455-484 (printed 443-472), 30 pages, no ranking. Topics too varied for one concept. |
| `Ferejohn-1991-The Origins of Aristotelian Science_1.pdf` | 93-page excerpt with no text layer. |
| `Lennox-2001-Aristotle's Philosophy of Biology- Studies in the Origins of Life Science.pdf` | 46 pages, no text layer. |
| `Elders-1972-Aristotle's Theology.pdf` (151 pp) | No text layer. |
| `Halper-2005-One and Many in Aristotle's Metaphysics.pdf` (569 pp) | General index only (558-568); no locorum index. |
| `Lear-1988-Aristotle- The Desire to Understand.pdf`, `Bolotin-1998-An Approach to Aristotle's Physics.pdf`, `Bostock-2006-Space, Time, Matter, and Form- Essays on Aristotle's Physics.pdf` | No locorum index found in the last 60 pages. |
| `Cooper-2009-Knowledge, Nature, and the Good.pdf` (372 pp) | No locorum index found in the last 60 pages (an extract of the book, not checked further). |
| `Koehn-2014-Cause and Necessity in Aristotle (DISS).pdf` (120 pp) | Partial dissertation; no locorum index found. |
| `Gill-2005-Aristotle's Metaphysics Reconsidered.pdf` (30 pp), `Witt-2018-POWER, ACTIVITY, AND BEING.pdf` (8 pp), `King-2014-Aristotle's Concept of Chance...pdf` (4 pp), `Bowin-2018-Aristotelian Infinity.pdf` (18 pp) | Excerpts, not monographs. |
| `Aristotle-1924-Aristotle's Metaphysics.pdf` (535 pp) | Ross's commentary text is readable, but this copy has no locorum index; it is a commentary (passage-ordered), not a topic key. |

## Not opened (promising, but not verified)

- `Broadie-1982-Passage and possibility- a study of Aristotle's modal concepts.pdf` (73 MB, ἐνδεχόμενον / modality): not downloaded.
- `Kenny-2016-The Aristotelian Ethics.pdf` (261 MB, the only large EE study here): not downloaded.
- `David Charles - Aristotle's Philosophy of Action-Duckworth Publishing (1998).pdf` (30 MB, action): not downloaded.
- `Sorabji-1980-Necessity, Cause and Blame.pdf` and `Owens-1978-The Doctrine of Being in the Aristotelian Metaphysics.pdf`: skipped on instruction.
- `Hintikka`: only articles in the library, not *Time and Necessity*.

## Recommendation

Use #1 (Irwin) first because its starred loci are a ranked answer key. Then pair one single-concept book per concept: Bechler for ἐνέργεια, Johansen for ψυχή, Charles for essence and definition, Wedin for οὐσία, Leunissen and Gotthelf for τέλος, Ward and Shields for homonymy. Use Pellegrin as a topic-to-passage cross-check for ethics concepts the library does not cover otherwise. Treat Bonitz as the exhaustive baseline only after a better scan exists.
