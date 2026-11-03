# Group 3 notes: Physics, De Caelo, De Gen. et Corr., Meteorologica, De Mundo

## Scans used

| dir | site edition | scans compared (archive.org id) | remarks |
|---|---|---|---|
| phys-hardie | Hardie & Gaye, Oxford 1930 | `worksofaristotle0002unse_d7s9`, `bwb_Y0-EGZ-910` (two copies of Works vol. II, 1930) | Clean tesseract OCR; italic words garbled (`zs`, `gua`), Greek labels read as Latin lookalikes. |
| cael-stocks | Stocks, Oxford 1922 | `decaeloleofric00arisuoft` (the 1922 fascicle), plus `bwb_Y0-EGZ-910`, `worksofaristotle0002unse_d7s9` (vol. II, 1930) | The 1922 and 1930 printings agree wherever checked. Page images n57 and n61 of the fascicle viewed. |
| gc-joachim | Joachim, Oxford 1922 | `bwb_Y0-EGZ-910`, `worksofaristotle0002unse_d7s9` (vol. II, 1930) | The 1922 translation fascicle is not on archive.org: `oncomingtobepass00arisuoft` and `aristotelousperi00arisuoft` are Joachim's Greek text and commentary (about 355 images), not the translation. Vol. II reprints it. `_d7s9` loses letters at the gutter in GC, so `bwb_Y0-EGZ-910` is the main witness there. |
| mete-webster | Webster, Oxford 1923 | `worksofaristotle03arisuoft` (the existing `dl/w03`), `meteorologica00aris` (two copies of Works vol. III, 1931) | No separate 1923 fascicle found; `meteorologica00aris` is the whole 1931 vol. III (478 images), as the existing correction's source says. |
| dm-forster | Forster, Oxford 1914 | `demundoarisrich` (the 1914 fascicle; poor old OCR), plus `worksofaristotle03arisuoft`, `meteorologica00aris` (1931) | No errors found beyond the three detector candidates, all of which match the print. |

Following the brief, downloads are in `dl/<id>/scan.txt` (shared folder), with the two page images under `dl/decaeloleofric00arisuoft/img/`. Working files are in `agents/g3/`.

## Counts (results/g3.json: 424 corrections, all `scan-agrees`)

| dir | corrections | dropped words | changed/garbled words | extra words on site | hyphen/spacing/stray char | label case |
|---|---|---|---|---|---|---|
| phys-hardie | 159 | 60 | 45 | 15 | 31 | 8 |
| gc-joachim | 109 | 14 | 36 | 1 | 58 (24 are mis-joined `passingaway`/`come-tobe` compounds) | 0 |
| cael-stocks | 81 | 33 (2 of them over 10 words) | 33 | 2 | 10 | 3 |
| mete-webster | 75 | 26 | 34 | 0 | 9 | 6 |
| dm-forster | 0 | | | | | |

`scan-agrees` here means that every scan copy covering the place shows the printed reading: two or three independent copies, all of the same printing except for Cael and DM. Every `find` is unique in its book. Applying all 424 in sequence leaves every `find` absent and every `replace` present, with one exception noted below. `agents/g3/verify.py` checks this.

Detector candidates: 32, all listed in `results/g3-rejected.json` except those corrected.
- 17 were corrected as flagged.
- 13 match the print.
- 2 doubled words are right as printed ("contrary contrary", "changes changes"), but a neighbouring word was wrong in each sentence ("motion" for "motions"; "in" dropped). Those neighbours are corrected.

## Findings that need more than find/replace

1. **Truncated source files.** Several ICA pages in `sources/` were cut off at about 101.5 KB, apparently by a download size cap:
   - `cael-stocks/book-01.html` (101,499 bytes) stops at "as these do, F and H coincident," (282b28). The rest of I.12, 282b28–283b22 (about 760 words), is missing from the site. The correction appends the passage, transcribed from the print: page n57 was checked against the image, and the rest agrees word for word in all three scans. Because it appends at the very end of the book, its `find` necessarily survives as the start of the `replace`, so the "find absent" test needs an exception for it. Re-fetching `heavens.1.i.html` from the ICA is the clean fix.
   - `mete-webster/book-02.html` (101,481 bytes) ends mid-tag. The site loses the end of II.9 ("thunder and lightning and the other phenomena of the same nature. So much for thunder and lightning.") and shows a stray `</A`. This one is corrected normally.
   - Outside group 3, the same check turns up `pol-jowett/book-02.html` (101,496 bytes, ends "The inhabitants still point out their tombs, whic") and `pol-jowett/book-05.html` (101,497 bytes, ends "let it b"), both cut off mid-text. `pol-jowett/book-07.html` is cut off only in the page footer; its text reaches the ICA's `end` anchor. `meta-ross/book-07.html` already carries a note that it was spliced from the full-text dump. **Group 8 should know about the two Politics books.** The check used was: ICA HTML files without a closing `</HTML>`.
2. **Dropped printed line** in Cael I.11 (281a12-13): "capable of a certain amount as maximum must also be capable of that which lies". This is corrected.
3. **Systematic slips in the ICA text**, worth knowing when reading the list:
   - Italic *be* typed as *he*: Phys ×5, GC ×7.
   - "movent" turned into "movement": Phys ×5.
   - "that that which" tripled to "that that that which": Phys ×8.
   - "clements" for "elements": Cael, GC, Mete.
   - GC compounds joined at the print's line-end hyphens: 14 `passingaway`, 3 `passedaway`, 8 `-tobe`.
4. **Lines of 70 dashes** from the ICA .txt layout appear as paragraphs at book ends: Phys ×8, GC ×2. They are not reported as corrections; stripping them in the parser is simpler.
5. **Stray apostrophes left by footnote marks**: about 40 in GC (e.g. "explain later' which", "elsewhere,' that"). They are not reported individually, and were removed only where they fell inside a corrected snippet.

## Not reported (details in g3-rejected.json)

- House conventions:
  - GC's Latinized names (the print has Empedokles, Demokritos, Leukippos, Sokrates, Lynkeus).
  - Transliterated Greek figure labels (Δ→D, Γ→G, Θ→O, Π→P or I, Ρ→Rh, Χ→Ch).
  - "(See diagram.)" inserted by the archive.
  - Mete III.4: the rainbow colours relabelled R/G/V/Y, where the print has Γ, Δ, Ε, Ζ.
- Punctuation only:
  - About 40 dashes dropped to a space.
  - Five possible stray hyphens that read as dashes (GC "sense-a", Mete "touch-by", Phys "place-or", "change-that", "outset-why").
- Print misprints that the site silently corrects: GC "ether" for "either" ×2; Phys "such that that there is".
- Unresolved: the Mete III.5 labels YX/YXM/YM, where the print may have Ω.
- Not reviewed systematically: punctuation-only differences other than missing spaces, stray characters and garbled abbreviations (e.g. 'e,g,', 'e.g..').

## Method

- Every candidate in `cands-g3.json` was checked in context against the scan lines.
- `tools/scandiff.py` was run as given. `agents/g3/mdiff.py` then reran the same alignment with three changes:
  - It accepts several scans at once, and drops a difference wherever any copy agrees with the site.
  - The alignment window is wider, because scandiff's window left the ends of chunks unaligned in footnote-heavy Cael.
  - It needs only 2 matching words around a difference instead of 5, which exposed clustered errors.
- Every remaining difference was read. Phys alone had about 700.
- Further checks, all run against the scans:
  - Long scan-only runs: each sorted into page-break footnotes or text the site had dropped.
  - Digits, which scandiff ignores. This found the dropped "4" in Phys IV.8.
  - Letter case, which scandiff also ignores (Ab, Dz, Lm, Ce, Ag, Mk ...).
  - Hyphenation differences inside aligned words.
  - Site words that never occur in any scan (cfpies, bodiesimitate, solidigied, mosture ...).
- Doubtful readings were checked line by line with `agents/g3/ctx.py`, which shows the scan lines at any site position.
- Network use: 5 archive.org searches, 5 djvu.txt downloads (`dl/w03` was already present), 2 page images.
