# Group 4: notes

Translations: DA (J. A. Smith, Oxford 1931; Edwin Wallace, Cambridge 1882), and the
Parva Naturalia from Oxford vol. III: Sens, Mem, Somn, Insomn, DivSomn (J. I. Beare),
Long, Juv (G. R. T. Ross).

Results: `results/g4.json` (271 corrections), `results/g4-rejected.json` (26 entries:
the 6 detector candidates judged fine, one wrong suggestion, and the main classes of
scan differences set aside). Working files are in `agents/g4/` (diffs, triage lists,
page crops, contact sheets, and `imgcheck.txt`, a log of what each page image shows).

## Scans used

| dir | scan | notes |
|---|---|---|
| da-smith | `worksofaristotle03arisuoft` (vol. III, Oxford 1931) | scan.txt was already at `dl/w03/`; page images from the same item. |
| sens-, mem-, somn-, insomn-, divsomn-beare; long-, juv-ross | `worksofaristotle03arisuoft` | This 1931 volume reprints the 1908 Parva Naturalia, with its 1908 preface. I found no scan of the separate 1908 printing on archive.org (searched by title, by Beare, and checked one 1908 Google volume, which was the Rhetoric). The existing Sens correction already cites this item. |
| da-wallace | `aristotelsperip00wallgoog` (Google scan of the 1882 Cambridge edition) | The site's Wallace text comes from Wikisource (see `manifests/DA.yaml`), which explains its OCR-style errors. Three other scans of this edition (`peripsychesarist00arisuoft`, `b24866660`, `aristotlespsych02arisgoog`) were OCR'd in Greek mode, so their English is unreadable. tools/scandiff.py on them reports "0 differences" because it found no chunk to align, not because the texts agree. |

Page images: `https://archive.org/download/<id>/page/n<index>.jpg`, with the index
taken from the item's `_djvu.xml`. Every `print-checked` entry names its page image.
In the Google Wallace scan the left edge of some pages is lost in the gutter. At 3.11
(n317) "force", "that" and "thought" each lose their first letter in the image, but the
rest of each word is clear.

## Counts

| dir | corrections | print-checked | scan-agrees | of which punctuation-only |
|---|---|---|---|---|
| da-smith | 71 | 66 | 5 | 7 (dropped dashes, one sentence-breaking full stop) |
| da-wallace | 108 | 32 | 76 | 38 (34 lost full stops or a full stop for a comma, 4 lost question marks) |
| sens-beare | 17 | 14 | 3 | 0 |
| mem-beare | 18 | 18 | 0 | 1 (a dropped dash) |
| somn-beare | 12 | 10 | 2 | 0 |
| insomn-beare | 13 | 4 | 9 | 0 |
| divsomn-beare | 8 | 8 | 0 | 0 |
| long-ross | 2 | 2 | 0 | 0 |
| juv-ross | 22 | 17 | 5 | 0 |

Detector candidates: 32. Of these, 26 were real errors and are in g4.json, and 6 were fine
(see rejected). One of the 26, "hat", had the wrong suggestion: it should be "that", not
"hot".

Punctuation-only entries all have notes that start with `punctuation:`. They are
included because each one leaves the text broken: a run-on sentence with a stray
capital, a question read as a statement, or two clauses run together where a dash was
dropped. If punctuation is out of scope, they can be filtered out on that prefix.

## Head start (mem-beare): confirmed

All three were checked on the page images:
- 450a31 "involved **in** the act of perception" (n341)
- 452a28 "in which it moved **when** first having" (n352)
- 453a30 "yet again **and again** they find" (n357)

## Most important finds (dropped or changed words, sense changed)

- Juv. 473b21: a whole line of the Empedocles verse is missing: "Pressing within on the
  dense orifices, checks it," (n419). Also "air's" missing at 473b23 and "to the to the"
  for "too" at 474a2. tools/scandiff.py could not show the missing line, because its
  --max 6 limit drops any gap longer than 6 words.
- Sens. 449a30: "visible and invisible **their objects, whether regarded in general or** at
  the same time", where the bold words are copied in from the next sentence (n336).
  Also 446a10, "the [subjective] **increment** of sense-perception": the subject was dropped.
- Somn. 454a7: "when they are awake, or sleep," is doubled. 455a24 "[touch]", 457a32
  "[bile]", 457b21 "is" and 454a18 "[sc. from to threptikon]" were dropped; at 456a3
  "ill" stands for "in".
- DivSomn. 464a7: "[the portion moved] moves another" was dropped, so the sentence has
  no verb. 464a9 "movent" (the mover) has become "movement"; 463b24 "toms" stands for
  "symptoms".
- DA (Smith): 402a8 "taught" for "thought"; 402a15 a misplaced bracket ("(as we are
  endeavouring to ascertain there is"); 405b29 "refrigeration" dropped; 410b15 "is" and
  410b20 "are" dropped; 417a "is so" moved into the wrong sentence; 426b "movements" for
  "moments"; 430a14 "it is what" doubled; 431a25-b1 the letter A dropped 4 times; 433b30
  "an animals" for "all animals"; 435b9 "animal" dropped; DA 3.3 the numbered points (2),
  (3), (4), (5) are garbled to "(" or dropped.
- DA (Wallace): 406a "if it be pot merely incidentally", where "pot" reverses the sense
  of "not"; 3.11 "are not bought to have opinion" ("thought"); 3.11 "motive Dree"
  ("force"); 3.2 "(/"perception" for italic "if"; 3.10 "desire, //" for italic "it";
  plus about 30 garbled words ("inter\'enes", "tsvo", "zvhat", "aixehood", "rjite",
  "niagnitude" ...).
- Mem.: 449b9 "these objects" for "the objects"; 450a26 "(The question arises)" for
  "This question"; 451b15 "may have been frequently" for "seen"; 451b28 "pralmata" for
  "pragmata".
- Sens.: 437b31 "Shines along his threshold **old** incessant beams" for "with"; 443a17
  "the metals" added; 443a20 "water" for "watery"; 443a29 "in" for "into"; and "is",
  "its", "he" and "in" each dropped once.
- Long.: 464b20 "the" dropped, and 465a2 "and" added.
- Insomn.: 459b10 "motion" and 461b27 "so" dropped, plus nine run-together words.

## Things I was unsure of, or that need the owner's decision

1. **DA 419a15, "from the object to the organ"**: the 1931 print reads "from the object
   **of** the organ" (n241). The site's "to" reads more naturally and may be a deliberate
   emendation, so it is recorded with a note.
2. **Parva Naturalia, 1908 against 1931**: the comparison is against the 1931 reprint. A
   few of the reported differences are plausible readings rather than nonsense, and I
   could not rule out that the 1908 printing reads like the site: Mem. 449b9
   "these/the", 450a26 "The/This question", Insomn. 458b20 "experience(s)", DivSomn.
   463b10 "coincidence(s)" and Sens. 444a29 "animal(s)". All the others are plain
   transcription errors.
3. **The Wallace corrections cannot be checked by the existing test.**
   `pipeline/tests/test_english_corrections.py` reads only each work's *primary*
   English, and da-wallace is DA's *secondary*. Recording these in
   `sources/english-corrections.json` would need the test to honour a `dir` field (every
   entry here carries `dir`). Otherwise the Wallace entries would be checked against
   Smith's text and fail.
4. **Wallace Bekker columns** come from `da-wallace/anchors.yaml`, which the manifest
   describes as machine-placed (Tier 1). They are close but not exact.
5. **Line numbers**: a line without "c." was read from the margin numbers on the page
   image. "c." marks an estimate from the anchors file, usually within 2 lines.
6. **Removing "Section 2" (Sens. 442b, Juv. 474a)**: this is the archive's page-split
   heading, which the parser keeps at the end of Sens ch. 4 and Juv ch. 13. The fix is to
   delete the heading line in the source HTML. The find/replace spans the chapter join,
   which is fine for the test because it joins chapters with a space.
7. **Mem. 452b22 "(See diagram.)"** is the archive's own wording. The print has the
   figure beside the text and the site shows no figure. I listed its removal separately,
   so it can be kept if a figure is added instead.

## Found but not expressible as find/replace

- **Insomn. 459b27 to 460a23**: Beare printed this passage (the menstruating woman and
  the mirror) **in Latin**. The site has an English version instead ("If a woman chances
  during her menstrual period to look into a highly polished mirror ... but only smudge
  the surface."). It is not Beare's wording and its source is unknown. The owner may want
  to check where it comes from, for example whether it is a modern, copyrighted revision,
  since the site gates some modern translations.
- **Mid-sentence paragraph breaks**: the archive's source has a blank line after an
  abbreviation, so the site starts a new paragraph inside a sentence. The fix is to join
  the lines in the source HTML; whitespace-collapsed find/replace cannot express it.
  - Sens 1.2 "the pupil, i.e. / the eye proper"
  - Sens 1.2 "in this way, i.e. / by correlating"
  - Sens 1.3 "two points of view, i.e. / either as actual"
  - Sens 1.3 "too [i.e. / as well as No. 3 infra]"
  - Sens 1.5 "these [e.g. / those of a certain food]"
  - Sens 1.5 "odour [i.e. / that connected with nutrition]"
  - Juv 1.16 "in the water, e.g. / the class of water-snakes"
- **"On the Soul" for the print's "de Anima"** (10 places in Sens, Mem, Insomn, Juv) is
  the archive's practice. It is not reported singly, but it is not the print's wording.

## Method

1. Every detector candidate was judged in context against the scan and, where needed,
   the page image.
2. I did not rely on tools/scandiff.py alone, for two reasons: it silently skips any
   chunk it cannot locate, and it drops gaps longer than 6 words. I used
   `agents/g4/scandiff2.py` instead, which takes smaller chunks, reports coverage per
   chapter (it flags the unreadable scans), and also writes the larger gaps. The large
   gaps were sorted into alignment artefacts, footnotes and real omissions by checking
   their 6-grams against the site text; that is how the Juv. verse line was found. Apart
   from the Insomn. mirror passage (see above), the site text that did not align came in
   short stretches of a few words, and I checked each one.
3. Further checks: unknown words and odd characters in the site text; brackets that are
   never closed (this found the DA 3.3 numbering losses); lost hyphens in compounds that
   the print hyphenates mid-line; and sentence punctuation compared token by token with
   the scan (this found Wallace's lost full stops and question marks).
4. Wherever the scan was unclear, or a word looked dropped or changed, I looked at the
   page image. About 200 crops in all, mostly viewed as contact sheets, are logged in
   `agents/g4/imgcheck.txt`.
5. Every find occurs exactly once in its book. Applying all 271 corrections in sequence
   to the parsed texts produced no conflicts: afterwards every find is gone and every
   replace is present.
