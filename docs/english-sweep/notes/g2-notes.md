# Group 2 — notes (Owen Organon, Taylor 1812, Bouchier 1901)

## Scans used

| translation | dirs | archive.org scan | notes |
|---|---|---|---|
| O. F. Owen, *The Organon*, vol. I (Bohn, 1853) | cat-owen, int-owen, apr-owen, apo-owen | `organonorlogicalt01aris` (Robarts/Toronto, 1853 vol. I; title page "MDCCCLIII") | Vol. I holds Cat., Int., APr. **and APo.** (it ends "END OF VOL. I." after APo. II.19) |
| O. F. Owen, *The Organon*, vol. II (Bohn, 1853) | top-owen, se-owen, isa-owen | `bub_gb_cm4TmBSZEn8C` (1853 vol. II, Google scan) | Vol. II holds Top., SE and Porphyry's Introduction (Owen moved the Isagoge to the end) |
| Thomas Taylor, *Works of Aristotle* vol. I (London: R. Wilks, 1812) | cat-taylor, int-taylor | `works00taylgoog` (vol. 1 pt. 1) | Cat., Int., APr. |
| E. S. Bouchier, *Aristotle's Posterior Analytics* (Oxford: Blackwell, 1901) | apo-bouchier | `aristotlesposte00arisgoog` | the scan lacks printed pp. 1–2 |

All downloads are in `dl/<id>/` (scan.txt = `_djvu.txt`; djvu.xml for the three scans used for word geometry; `img/` page images).
26 page images were fetched (vol. I leaves n33 n66 n83 n84 n93 n154 n185 n240 n242 n273 n285 n289 n294 n337;
vol. II leaves n37 n39 n81 n93 n109 n132 n200 n201 n202 n223 n235; Bouchier n5).

## Method

1. Judged all 35 detector candidates (`cands-g2.json`) against the scans: 17 are errors (now corrections), 18 are fine
   (`results/g2-rejected.json`, together with 15 scandiff items I checked and kept).
2. Ran `tools/scandiff.py` on all ten texts (outputs `agents/g2/<dir>-diff.json`: cat-owen 290, int-owen 133,
   apr-owen 1175, apo-owen 905, top-owen 1383, se-owen 381, isa-owen 156, cat-taylor 150, int-taylor 104,
   apo-bouchier 134 lines). The Bohn Owen pages carry cut-in analytical sidenotes that the OCR interleaves with the
   body text, so most of those lines are sidenote noise. To see through it I also built a cleaned scan from each
   volume's `_djvu.xml` (word coordinates: running heads, chapter titles and footnotes dropped, sidenote words
   marked by their position in the cut-in column) and aligned it globally against the site text
   (`agents/g2/bin/clean_owen.py`, `gdiff.py`; outputs `agents/g2/<dir>-gdiff.json`). Every remaining difference was
   reviewed (about 2,400 items, triaged by likelihood), checking the raw djvu.txt line for each possible error and
   the page image where the OCR was unclear. A cross-check confirmed that every scandiff line with a non-word on the
   site is either corrected or benign.
3. Also searched the site texts directly for non-words, split words, he/be and or/of slips, stray numbers, and
   leaked sidenote/footnote text.

## Corrections (results/g2.json): 124

| dir | n | print-checked | scan-agrees |
|---|---|---|---|
| apr-owen | 28 | 6 | 22 |
| top-owen | 22 | 6 | 16 |
| cat-taylor | 21 | 0 | 21 |
| se-owen | 19 | 5 | 14 |
| apo-owen | 13 | 1 | 12 |
| int-taylor | 9 | 0 | 9 |
| isa-owen | 5 | 0 | 5 |
| apo-bouchier | 4 | 1 | 3 |
| int-owen | 2 | 0 | 2 |
| cat-owen | 1 | 0 | 1 |
| **total** | **124** | **19** | **105** |

No entry is `sense-only`: every one was checked against a scan.

Checks run on the file:
- Every `find` occurs exactly once in its book, with the chapters joined as `test_english_corrections.py` does.
- Applying all corrections book by book, in either order, leaves no `find` behind and every `replace` present.
- Every `replace` also occurs only once after the fix, with one exception: Cat. 7, "with reference to something else;
  for it is" (that phrase recurs in the book; the `find` with "somethings" is unique).

Lengths:
- 122 `find`s are 4–10 words (most about 8).
- Two are longer, because the text they delete is itself longer than 10 words. Both are leaked sidenotes in APr.,
  at I.1 (24 words) and I.28 (31 words), and each note says "[find is N words]".
- The Int. 14 opening sentence (Taylor) is restored by three adjacent entries. They work in either order.

Columns:
- Owen's columns come from the reference gloss maps (Mure, Jenkinson, Pickard, Ackrill, Edghill), by position in the
  chapter. Taylor's come from `anchors.yaml`, and the Isagoge's from the Busse section starts in `manifests/Isa.yaml`.
- Five are set by hand: Cat. 14b, APr. 51a, SE 166a, Int. 18a and Int. 22a. At Int. 18a and 22a the nearest
  preceding anchor gave the wrong column.
- A column near a column boundary may be one off.

**Recording these needs a test change.** `pipeline/tests/test_english_corrections.py` looks for each `find`/`replace` in
the work's *primary* English only (`english.primary` in the manifest). Of these ten translations only isa-owen is a
primary; APr is jenkinson, APo mure, Top/SE pickard, Cat/Int edghill. So the test would need to pick the text by the
`dir` field, which every entry here carries. Its hard-coded count (62) and work set would also change.

Kinds of error found:
- **Leaked analytical sidenotes**: Owen APr. I.1 (twice) and APr. I.28 (at the chapter start). Also a **leaked
  footnote** at Cat. 12 ("In the text,") and **stray footnote numbers** in Taylor ("23." Cat. 6, "10." Int. 11).
- **Words split across a page break, with the first half lost**: "tive" for nega|tive, "ject" for sub|ject,
  "versally" for uni|versally, "tain" for cer|tain, "metic" for arith|metic, "perty" for pro|perty,
  "pothesis" for hy|pothesis, "spect" for re|spect.
- **Line-end hyphens left as a space**: "how ever", "can not", "what ever", "con clusion", "as serted", "opi nions",
  "num ber", "re mains".
- **Real-word slips that change the sense**:
  - or/of (8), it/if/is (5), he/be (5);
  - not/by, conducted/concluded, our/one, air/are, most/must, mast/must, on/one, falsify/falsity, results/result;
  - "will be O" for "will O be";
  - extra words: "less to be less avoided", "it is possible" for "is possible", "of the same of the same", and in
    Isag. 2 an added "are predicated";
  - Taylor: "things" for "thing" (7×), "others", "numbers", "relative".
- **Dropped words or passages**:
  - Top. IV.5: Empedocles' verse "— the water putrified in wood."
  - SE 4: five gaps. The Greek examples and verses are missing, along with about 120 words of English ("…but he sees
    a pillar … some one else knows letters."). None of it is in the source HTML.
  - Isag. 2: "of" dropped twice.
  - Single words: APo. I.23 "E", APo. II.2 "it", APo. II.5 "in", Top. I.18 "be", Top. IV.2 "it", SE 17 "it" and "to".
  - Taylor (eye-skips): Cat. 7 (the mountain clause), Cat. 8 (science "moderately possessed"), Cat. 10 (affirmation
    and negation), Int. 7, 9 (twice), 11 and 12, and the Int. 14 opening.
- **Garbled letters**: tney, ihird, thf, cf, ot (2×), conlirm, eonnascent, conseqence, tripartate, obiect, peirastie,
  suifer, tirst, Lacedaeæmonian, opposltes, syllogisticaliy, middie, separatedly, somethings. Lost hyphens:
  noninesse, noninherent.
- **Missing spaces**: "existence.I", "(eligible)(with", "simply(called)", "commonattribute".
- **Bouchier APo. I.2**: the Greek "[πρῶτον]" and "[ἀρχή]" have lost their accented letters ("[πρτον]", "[ρχή]").
- Minor, matching the print's word division: "any thing" (2×) and "every thing", where the site has "anything" and
  "everything"; Bouchier's "farther".

Not reported, though they differ from the print:
- **APo. I.12 "[,]" (twice)**: punctuation only. The print has no commas there, only the sidenote marks ‡ §. See
  the rejected file.
- **Misprints in the print itself**, which the site follows or silently fixes: Top. I.11 "necesary"; SE 33 "not to
  despised"; APr. I.22 "it it".

## Translations with partial or no scan coverage

- **Bouchier APo. I.1**: the Google scan starts at printed p. 3, so about the first 58% of I.1 could not be compared.
  Every other chapter aligned at 90% or more.
- **Owen vol. II** (`bub_gb_cm4TmBSZEn8C`): the OCR often loses the first words of lines next to a sidenote. A word
  the site drops at such a line start could go unseen. Where a site word looked suspect there, I checked the page image.
- **Taylor**: the site's text is **not a transcription of the 1812 print**. The source header says
  "Translated by VENDOR" and the manifest calls it "CLAA".
  - It is a modernized, edited version of Taylor. For example: essence→Substance, first/second essences→primary/secondary
    Substances, "a certain"→"an individual" (about 50×), colour→color, reason→definition, "any thing"→"anything".
  - Its editor also added things the print does not have: the Latin/Greek category list in Cat. 4, "vs." layouts in
    Int. 7, and paraphrases in Int. 5.
  - Hundreds of these editorial differences were **not** reported. Only typos and accidental omissions were.
  - Int. 14 is the chapter the manifest says was reconstructed from the 1812 scan. Its opening sentence still
    differed from the print; that is now corrected.
  - **If the site wants to present "Thomas Taylor (London, 1812)" faithfully, the source needs re-transcribing
    from `works00taylgoog`.**

## Structural problems that are not find/replace fixes (please review)

1. **cat-owen chapters 13–15 are not split.** The site's chapter 12 carries "Part 13 …", "Part 14 …" and "Part 15 …"
   inline.
   - `sources/cat-owen/book-01.html` has "Part 13/14/15" on their own lines.
   - Leftover MediaWiki template JSON (`<span>",{"template":{"target":{"wt":":MediaWiki:Proofreadpage_pagenum_template"…`,
     around lines 89–91) evidently breaks the line structure during the parse.
   - The same template junk appears in 12 other Owen book files: apo-owen 01–02, apr-owen 01–02, se-owen 01, and
     top-owen 01–06 and 08. It does not show in the parsed text there, but it is fragile.
2. **cat-owen ends with Owen's footnotes as text.** The source's "Notes" section is appended to the end of chapter 12
   (Cat. 15): "Notes Summa decem: Substantia, … To fast in us unused."
   - In the print these are footnotes. The "Summa decem … in tunicâ" verses are a footnote to Cat. 4 (djvu.txt
     l. 515–518). The two Shakespeare quotations, King John III.1 and Hamlet IV.4, are footnotes to Cat. 10 (print
     pp. 36 and 38, l. 2306–2308 and 2421–2425).
   - The site leaves footnotes out, so this block should be removed. It is about 75 words, too long for a find/replace.
   - If it is kept, two words differ from the print: "grows indirect" (print "grows direct") and "That capacity"
     (print "That capability").
3. **int-owen Int. 13: the printed table of modal consecutions is missing.** The site reads "…may be seen from the
   following description: Therefore the impossible…". The print (leaves n83–n84, print pp. 72–73) has four numbered
   groups:
   - 1: It is possible to be / It may happen to be / It is not impossible to be / It is not necessary to be.
   - 3: It is not possible to be / It may not happen to be / It is impossible to be / It is necessary not to be.
   - 2: It is possible not to be / It may happen not to be / It is not impossible not to be / It is not necessary not to be.
   - 4: It is not possible not to be / It may happen not to be [sic] / It is impossible not to be / It is necessary to be.

   How to lay this out is left to the maintainers, so it is not in g2.json.
4. **se-owen SE 4.** The indented Greek examples and verses, and an English passage, were missing from the source.
   - They are in g2.json as five corrections.
   - The Greek was transcribed from the page images (n200–n202). **Check the accents before applying.**
   - The Greek elsewhere in the Owen texts is present.

## Detector candidates

35 in all. 17 are errors: #3, 5, 6, 7, 8, 10, 13, 15, 16, 17, 19, 26, 27, 28, 32, 33, 34.
- #8 "tive" is "negative" with its first half lost at a page break, not "five" as the detector suggested.
- #10's sentence also has "cf" for "of".

18 are fine (`results/g2-rejected.json`). That file also lists 15 scandiff items I checked and kept, with reasons.
