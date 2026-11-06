# Bonitz's Index Aristotelicus as an answer key for topic search

Read-only investigation, 2026-11-05. Repo: `/Users/johnboyer/Developer/bonitz-text` (call it BT). Nothing was edited, run on a GPU or OCR'd. Small Python calls reused BT's own `bonitz_pipeline.siglum_check` (`inventory`, `read`, `resolve`) on copies of the entries kept in the scratchpad.

## 1. Where each entry is, and what state it is in

Page numbering (`BT/docs/wiki/README.md`): `page-NNN` is the PDF page; printed page = PDF page - 12; columns `L`/`R`; a site is `NNN-C:line`. Stage table: `BT/docs/STATUS.md` and `BT/docs/wiki/corpus.md`.

| Entry | Where | Printed page | Text state | Text file |
|---|---|---|---|---|
| ἀγαθός (+ βελτίων, βέλτιστος, ἀμείνων, ἄριστος) | PDF 15-L:45 to 16-R:3 | 3-4 | **Applied** (PDF 15-117: adjudicated, John's rulings written in) | `BT/work/reconciled/page-015-L.txt`, `-015-R`, `-016-L`, `-016-R` |
| ἀναγκαῖος | PDF 54-L:50 to 55-L:26 | 42-43 | **Applied** | `BT/work/reconciled/page-054-L.txt`, `-054-R`, `-055-L` |
| ἀνάγκη | PDF 55-L:30 to 55-R:44 | 43 | **Applied** | `BT/work/reconciled/page-055-L.txt`, `-055-R` |
| οὐσία | PDF 556-L:6 to 557-R:~57 | 544-545 | **Not applied: one machine read, no adjudication** | `BT/work/tranche-432-581/txt/kraken-r9/page-556-L.txt` ... `page-557-R.txt` (other readers beside it: `kraken-r7`, `calamari-r3`, `calamari-r4`) |

Details on the state:

- `BT/docs/STATUS.md`: pages 15-281 are "adjudicated and applied"; 282-635 and 637-890 are "read but not transcribed". 1,014 reader-disagreement cards are still to rule across the book. `BT/BONITZ_HANDOFF.md` ("Where the work stands") says 432-581 has 728 cards still to John, in 8 sittings.
- "Applied" means the Opus adjudicator plus John's rulings, not that John read the page. `BT/docs/STATUS.md` counts "ground truth" (a line John read whole or ruled every word of) at 13 of 12,540 lines for 15-117 (0.1%) and 682 of 19,977 for 118-281 (3.4%). The ἀγαθός and ἀνάγκη text is the best in the repo, but it is machine-checked, not hand-verified.
- The οὐσία text is a single kraken round-9 read (the best reader; the other three are beside it) with unruled errors. Examples in 556-L: `ȣ̓͂ς θαλάττιον` and a truncated line with a replacement character. I did not measure its error rate.
- Orthography a search must normalise: Bonitz's `ȣ` is one sort for ου (`ȣ̓σία` = οὐσία, `τȣ͂` = τοῦ); `ϗ̀` = καί; the text is diplomatic (`BT/docs/wiki/corpus.md`, "House conventions"); line-end hyphens are kept.
- The PDF has a text layer, but it is the Internet Archive's OCR and is garbage for this book (`pdftotext -f 15 -l 15 -layout BT/book.pdf` gave `Ηχ8. 1095 Ρ2ὅ` and `ἡεηδ. 128 9011` where the page prints `Ηα 3. 1095b25` and `ηεη 5. 1239b11`). Not usable.

## 2. Structure of each entry

Each is a headword, then runs of Greek quotations, each followed by its citations. Sense heads and glosses are Latin; the abbreviations `syn`, `opp`, `dist`, `cf`, `sc`, `i e`, `al.`, `sqq`, `c inf`, `sive` are Bonitz's.

**ἀγαθός** (`work/reconciled/page-015-L.txt:45` onward). 152 full citations by `siglum_check.CITE` (130 explicit, 22 inherited), not counting bare continuations (`1363b13, 1364b17, 25`). Senses:

- `τὸ ἀγαθόν 1. notio.` (the concept: what everything aims at; the good and the best; the idea of the good refuted)
- `2. species τȣ͂ ἀγαθȣ͂ distinguuntur.` (kinds of good: καθ' αὑτά vs διὰ ταῦτα; the three classes ἐκτός/σῶμα/ψυχή; ἁπλῶς vs τινί; ἀγαθὰ ὁμολογȣ́μενα, ἔντιμα, περιμάχητα)
- `3. synonyma.` (ἀγαθόν against καλόν, ἡδύ, χρήσιμον/συμφέρον)
- then an unnumbered `ἀγαθός.` block for the adjective (good at X; good man vs good citizen; the "good" as upper class, syn εὐγενεῖς; τύχη ἀγαθή; adverbs ἀγαθῶς, ἀρίστως).
- Only 1-3 are numbered. Bonitz's dashes mark finer shifts, but the XML draft says the dash "also opens sub-lemmata and new constructions", so it is not a reliable sense mark (`BT/docs/xml-spec-draft.md`, "Harder than it looks").

**ἀναγκαῖος** (`work/reconciled/page-054-L.txt:50` to `page-055-L.txt:26`). A meta-line first (`τὸ ἀναγκαῖον ποσαχῶς λέγεται Μδ 5`), then:
1. logical/modal necessity (ἀναγκαῖον τὸ μὴ ἐνδεχόμενον ἄλλως; ἀναγκαία πρότασις, συλλογισμός in the Prior Analytics; Rhet.)
2. ἐξ ὑποθέσεως, the teleological necessity of natural science and politics (ἀναγκαῖον opp βέλτιον/καλόν; ἀναγκαῖα opp καλόν; ἀναγκαῖαι πράξεις)
3. ἀναγκαῖον τὸ βίαιον (compelled, painful)
4. causal necessity and logical consequence, including "usitatum in afferenda conclusione ἀναγκαῖον c inf", then `ἀναγκαίως`.

**ἀνάγκη** (`work/reconciled/page-055-L.txt:30` to `page-055-R.txt:44`). `ἀνάγκη (cf ἀναγκαῖος)`, an opening line on the word's origin and `ποσαχῶς λέγεται` (Αδ 11. 94b37; Ζμα 1. 639b21; Με 2. 1026b28), then 1-4:
1. ἀνάγκη = μὴ ἐνδέχεσθαι ἄλλως; ἐξ ἀνάγκης dist ὡς ἐπὶ τὸ πολύ / opp διὰ τύχην
2. ἐξ ὑποθέσεως
3. ἡ κατὰ τὸ βίαιον λεγομένη
4. ἀνάγκη ᾗ χρώμεθα ἐν τοῖς κατὰ τὰς ἀποδείξεις, and the material cause (ἐξ ἀνάγκης opp ἕνεκά τȣ, τȣ͂ βελτίονος ἕνεκα, Ζμδ 11. 692a3).
My slice from ἀναγκαῖος through ἀνάγκη (54-L:50 to 55-R:44, which also holds the short ἀναγκαστικός and ἀναγκοφαγία lines) gives 170 anchors (152 explicit, 18 inherited).

**οὐσία** (`work/tranche-432-581/txt/kraken-r9/page-556-L.txt:6` onward). My slice (first 235 lines, to the start of the `ȣ̓͂σα` entry) gives 280 anchors (194 explicit, 85 inherited, 1 page-inferred), from raw machine text:
1. res familiaris, opes, divitiae (property, wealth)
2. οὐσία i e τὸ εἶναι (being, existence; Φδ 12. 221b31; Ζμα 1. 640a18)
3. οὐσία id quod re vera est, τὸ ὄν: the main sense. A Latin paragraph says that to give its full usage "plene persequi esset ipsam Aristotelis philosophiam exponere". Italic lettered sub-heads: a. notae constitutivae (the Categories definition, Κ 5. 2a11), c. synonyma et opposita, d. ambitus notionis, e. substantia materialis, f. substantia formalis, and more after f. (I read a, c, d, e, f; I did not read the later ones.)
Italic section letters survive only as plain letters in the text (`BT/docs/xml-spec-draft.md`, "What the text does not hold").

**How citations are written.** House form (`BT/docs/wiki/corpus.md`, the first table): `{WORK}{BOOK} {CHAPTER}. {PAGE}{COLUMN}{LINE}`, e.g. `Ηα 1. 1094a3` (EN I.1), `Πδ 4. 1290b16`, `Μζ 12. 1038a19`. Work sigla are Bonitz's Greek letters, and case matters (`Η` EN, `ηε` EE, `Μ` Metaphysics, `Π` Politics, `Ρ` Rhetoric, `Ζμα` PA I, `Ζγα` GA I, `Αα` Prior Analytics I, `Κ` Categories, `Φ` Physics; list in `BT/work/sigla/work-sigla.json` and `BT/docs/front-matter.md`). Inheritance works at three levels: a bare book letter takes the last named work, a bare number takes the last book and gives a new chapter (`γ 5. 1278a19. 17. 1288a21`), a bare line suffix keeps page and column (`619a4. 34. 620a1`). Ranges appear: `1182b10-1183b8`, `a3-14`. A single citation gives one start line, no end line. `al.` and `sqq` mean "and more elsewhere", so each list is a sample, not a concordance. Fragment citations (`f 195. 1513a24`) and scholars' pages (`Vhl`, `Schol`) are not Bekker refs.

**Does the repo already parse citations into machine-readable Bekker refs?** In code, yes. As saved data, I found none.
- `BT/bonitz_pipeline/siglum_check.py`: the `CITE` regex, `read()` (reads a column as a stream, so line-wrapped citations work), `resolve()` (labels each citation explicit / inherited / page-inferred / unresolved, using the Bekker page to choose between work and book readings). `BT/bonitz_pipeline/bekker.py` and `BT/bonitz_pipeline/book_spans.py` (per-book spans derived from this repo's `build/dist`) are the range checks.
- `BT/docs/xml-spec-draft.md` with `BT/docs/xml-probe-2026-11-02/` (throwaway `probe.py` to `probe4.py`, `report.json`): a one-off parse of 15-281 collected 37,974 of 38,864 Bekker-shaped tokens, resolved 32,759 of 32,839 anchors to a work, found 29,494 anchor addresses that are real lines in our corpus and 84 with no such line (our text is a modern edition; many in Physics 242-248). It also expanded locator runs (bare lines, ranges).
- The XML itself is "drafted, nothing built" (`BT/BONITZ_HANDOFF.md`, "XML: spec drafted"; build planned around January). The `queue-citations-*` and `kept-citations-*` JSON files in `BT/work/` are review cards and rulings, not extractions (not read in detail; I did not search every `work/` subfolder).
- Not parsed: entries and senses. Entry starts come from indent geometry (4,417 starts, 2,928 lines "unknown"); accuracy is unmeasured. The spec leaves sense trees out ("Sense divisions out of the diplomatic release? Recommended: out").

## 3. Do sense divisions map to "about X" versus "just uses the word"?

Partly. Bonitz's heads mark the meaning the word has in the passage, not how central the topic is. A sense head is a good filter for homonyms and for the word as a formula, and a weak one for graded "aboutness". Examples (the readings of relevance are mine):

1. **ἀγαθός §1 `notio`**: `καλῶς ἀπεφήναντο τἀγαθόν, ȣ̔͂ πάντ' ἐφίεται ... Ηα 1. 1094a3. 5. 1097a18, 20. ε 7. 1131b23 ... Ρα 6. 1362a22 ... Πα 2. 1252b34 ... ΜΑ 3. 983a32 ... λ 10. 1075a37`; also `idea boni refutatur Ηα 4. ηεα 8. ημα 1. 1182b10-1183b8` and `τἀγαθὸν λέγεται ἰσαχῶς τῷ ὄντι Ηα 4. 1096a20, 23`. Passages that define or discuss the good itself. Highest relevance for a "good" topic.
2. **ἀγαθός §2 `species ... distinguuntur`**: `τἀγαθὰ τριχῇ, ἐκτός, περὶ σῶμα, περὶ ψυχήν Ηα 8. 1098b12. ι 9. 1169b10 ... Ρα 5. 1360b25`; `ἀγαθὰ ὁμολογȣ́μενα τίνα Ρα 6. 1362b10-29`; `τὸ ἀγαθὸν διχῶς, ἁπλῶς / τινί Ηη 13. 1152b27`. Still about the good, as kinds and divisions. Good for topic search ("types of goods").
3. **ἀγαθός §3 `synonyma`** (dist καλόν, ἡδύ, χρήσιμον): `ἀγαθόν, dist ἡδύ, χρήσιμον Ηθ 2. 1115b19. ηεη 2. 1236a13. ημβ 11. 1209a17. Αα 1. 24a22 ... Ρβ 13. 1390a1`. Passages that set the good beside other values. Related to the topic, but a given line may mention the word only in passing; I did not read those lines in the Greek text.
4. **ἀγαθός, unnumbered adjective block**: `ἵππος ἀγαθὸς δραμεῖν, μαθεῖν Ηβ 5. 1106a20. Ζιι 15. 616a11. ἀγαθοὶ φαγεῖν Ζιι 34. 619b31`; `βοτάνη ... ἄριστα θ 171. 847a2`. Pure "uses the word" cases ("good at", "good to eat"). The same block holds `ἀγαθὸς ἀνήρ, dist ἀγαθὸς πολίτης Ηε 5. 1130b29. Πδ 7. 1293b6` and `ὁ ἀγαθὸς φίλος Ηθ 5. 1157a18`, which are ethical and political discussion. This block mixes both kinds, so the head cannot separate them; the quoted phrase can.
5. **ἀναγκαῖος §2 versus §4** (necessity): §2 `ἀναγκαῖον ἐξ ὑποθέσεως Ζμα 1. 639b24 ... ὡς ἀναγκαῖον Ζμδ 9. 685a18 ... λέγω ἐξ ὑποθέσεως τἀναγκαῖα Πη 13. 1332a11` is about the notion (necessity against "for the sake of"). §4 `usitatum in afferenda conclusione ἀναγκαῖον c inf Φθ 6. 260a16. μα 3. 340b34. Πγ 11. 1281b30 al.` is the word as an inference formula ("it is necessary that"). Bonitz himself says so, so a filter on §4 removes mere uses. §4 also holds `κατὰ τὸ εἰκὸς ἢ τὸ ἀναγκαῖον πο 9. 1451a38` (a Poetics doctrine, so mixed).
6. **οὐσία §1 `res familiaris`**: `ȣ̓σία μακρά, μέση, ἱκανή ... Πδ 4. 1290b16, 1291b26. ζ 3. 1318a20 ...`. Property and wealth, a different topic under the same word. Sense heads stop a topic search from pulling Politics wealth passages into "substance"; §3 (sub-heads a-f) is the intended metaphysical sense. This is the best case for sense heads as a homonym screen.

Other points:
- Because the lists use `al.`, `sqq` and sampled runs, Bonitz's refs are a curated sample. They give positives for "this passage illustrates X" and say nothing about passages he left out. Fit for testing recall of known-relevant passages; unfit for proving a passage is not about X.
- Cross-references (`cf φύσις 2 c.`, `(cf ἀναγκαῖος 1)`) and quoted authors (`(Eur fr 183)`, `(secundum Platonem) f 623`) sit inside the lists and need filtering.
- The same passage can recur across senses and entries: `Μδ 5. 1015a20, 22` appears under ἀναγκαῖος §2; `Ζγα 4. 717a15-16` appears under both ἀγαθός §1 and ἀναγκαῖος §2.

## 4. Work to turn one entry into a list of Bekker refs

**Lettering pitfall.** Documented in the docstring of `BT/bonitz_pipeline/book_spans.py` ("BONITZ USES THREE LETTERING SYSTEMS") and in memory file `bonitz-three-book-lettering-systems.md` (settled by measurement 2026-08-09):
- **Plain alphabet** (α β γ δ ε ζ η θ ι κ ...) for every ordinary work (Physics 65/65, De caelo 43/43, Meteor. 53/53, De anima 35/35, GC 21/21, HA 122/127, EN 91/97).
- **The Metaphysics's own named series**: ΜΑ Μα Μβ Μγ ... Μν. ΜΑ is book 1, Μα is α-elatton, so Μν is the 14th book (100/108 against 10/97 for plain). So `Μζ 12` is book 7 (Z), `Μδ 5` book 5 (Δ), `Μλ 7` book 12.
- **Greek numerals with stigma at 6**: the Problemata only (πκϛ = 26, πλη = 38).
- `BOOK_LETTERS` in `siglum_check.py` encodes the numeral series and is wrong for every work except the Problemata (stigma displaces ζ and later letters by one; 74/127 on HA against 122 plain). Use `book_spans.series()` / `book_number()`, not `BOOK_LETTERS.index()`.
- Related: HA runs to book κ in Bonitz and only to ι in our corpus (book X held spurious); a citation to a book with no span is not checked (`BT/work/sigla/book-spans.json`).

Steps, with my estimate (not timed):
1. **Slice the entry and its sense heads.** The one step with no code. Numbered heads match `^\d\. ` and the italic letters are plain letters in the text; entry starts have no measured accuracy. I sliced the four entries here by hand in minutes.
2. **Resolve citations.** Already works: `siglum_check.read` plus `resolve` on my slices left 0 unresolved (ἀγαθός 152 anchors; ἀναγκαῖος+ἀνάγκη 170; οὐσία 280).
3. **Expand the bare continuations** (bare line suffixes `a16`, bare chapters, ranges `1182b10-1183b8`, `a3-14`, lists like `b34. 36`) into explicit refs. The probe's locator-expansion pass does this but was not saved as a module. Some falling bare lines are real, per the XML spec (`210a8, 3, 6`).
4. **Map Bonitz sigla to our site's works and books.** `BT/work/sigla/work-sigla.json` and `BT/work/sigla/book-spans.json` go to `build/dist/<Work>/book-NN.json` and `build/dist/bekker.json` in `/Users/johnboyer/Developer/aristotle-reader`. The mapping exists in `book_spans` provenance (`Η` EN, `ηε` EE, `Μ` Meta, `μ` Mete, `Π` Pol, `Ρ` Rhet, `Ζι` HA, `Ζγ` GA, `Ζμ` PA ...). The range check against our corpus exists and found 84 of 29,578 anchors with no line.
5. **Tag each ref with its sense** by nearest preceding head. Needs rules for cross-references, quoted authors, `al.`, and for a numbered head that interrupts a run (e.g. `... Πδ 4. 1290b16, 1291b26. 6. 1292b26`: the `6.` is a chapter, not a sense head). The `inherited` labels flag where a ref's work came from context.
6. **Spot-check by hand.** No human verdict beyond 13 lines exists for 15-117.

Estimate: about a day for the first applied entry such as ἀγαθός to get a working extractor and checker, mostly in steps 3 and 5; hours per further applied entry, mostly sense-tag review. οὐσία must first have its page adjudicated.

## 5. Verdict

- **ἀγαθός, ἀναγκαῖος, ἀνάγκη: usable now** as a seed answer key, with two limits. (a) It is a curated sample, so use it for recall of known-relevant passages and to test sense separation, not for precision over "all passages". (b) The text is machine-adjudicated; spot-check refs against the site (the range check already catches impossible refs).
- **οὐσία: later.** A raw single-reader read with unruled disagreement cards (728 to John for 432-581). Its citations resolve (280 anchors, none unresolved), but a misread book letter or digit is the usual error and nothing has caught those in this tranche yet. Use it to prototype, not as truth.
- **Not at all:** a complete list of passages that use a word (the index omits passages and says `al.`), and a key for a topic Bonitz does not index under a headword (the index is by lemma; "the good life" is spread over ἀγαθός, εὐδαιμονία, ζωή and others).
- **Coverage:** adjudicated text covers PDF 15-281 (printed 3-269), the first part of the alphabet. Words after that, οὐσία included, are not yet applied.

## Where the text was missing or unfinished

- οὐσία: no adjudicated text exists; I used raw `kraken-r9`.
- οὐσία §3 sub-heads after f: not read by me.
- No saved per-entry list of refs exists. I did not search every `work/` subfolder.
- Citation counts are full anchors only (`CITE` matches); bare continuations come on top, so refs per entry are higher (not counted).
- I did not run Bonitz refs for these entries against the site's Bekker lines; the 84-of-29,578 figure is the probe's, from `BT/docs/xml-spec-draft.md`.
