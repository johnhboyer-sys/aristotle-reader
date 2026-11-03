# Group 5 notes: ha-thompson (D'Arcy Wentworth Thompson, Historia Animalium, Oxford 1910)

## Scans used

| scan | what it is | coverage |
|---|---|---|
| `worksofaristotle04arisuoft` | Oxford *Works of Aristotle* vol. IV (1910), University of Toronto copy | whole text except one leaf in 2.1 (about 498b8 to 499a20) and one in 3.11 to 3.12 (about 518b26 to 519a18), which are missing from the scan |
| `worksofaristotle0004jasm` | the same edition, a later impression ("Printed in England"), same typesetting (same line breaks) | complete |

Both scans have OCR text at `dl/<id>/scan.txt`, and `dl/worksofaristotle04arisuoft/djvu.xml` gives the page and line positions. I looked at 10 page images of `worksofaristotle04arisuoft` (n31, n75, n232, n255, n259, n310, n320, n370, n396, n421).

## Method

1. I ran `tools/scandiff.py` against the Toronto scan. It found 737 differences, but it aligned only about 90% of the text: the long footnotes push its 1,900-token window past the end of each chunk. I went through all 737. 221 of them are not covered by the steps below, and every one of those 221 is OCR noise in the Toronto scan that the second scan reads correctly.
2. I then aligned the whole text against each scan, anchoring on unique 6-word sequences and diffing between anchors (`agents/g5/align.py`). This matched 98.3% of site words to the Toronto scan and 99.3% to the later impression. I reviewed only the places where neither scan agrees with the site:
   - 452 runs of site words that neither scan matches;
   - insertions present in both scans: 106 short ones, 62 that look like margin numbers and 407 long ones, nearly all footnotes;
   - 29 insertions in one scan where the other scan has no text at that point;
   - footnote blocks whose first or last words sit on a body line. This is how I found the dropped 'eggs' at the bottom of a page in 6.10.
3. I made three further comparisons of the aligned words in both scans:
   - hyphenation;
   - square brackets, which the archive gives as round ones;
   - sentence punctuation.
4. I judged all 38 detector candidates in context.
5. Bekker columns come from `anchors.yaml`. Where an error falls near a column boundary, I checked the column and line against the printed margin numbers using the djvu coordinates (`agents/g5/pagelines.py`).

Every `find` is unique in the parsed book text, built the way `pipeline/tests/test_english_corrections.py` builds it. I applied all 324 corrections together and checked that every `find` is gone and every `replace` is present. Three `find`s are longer than 10 words because the error itself is that long: the stray fragment in 5.19, the copyright footer in 9.50, and the dash rules, which are a single 70-hyphen token.

## Counts

- **`results/g5.json`: 324 corrections.** 10 were checked on a page image; the other 314 have the printed reading in both scans' OCR (4 rest on the later impression alone, see below).
  - **195 substantive corrections.**
    - 186 are textual: 86 dropped words, 33 changed words or word order, 22 garbled words, 18 added or stray words, 10 stray characters, 6 split words, 2 missing spaces, and 9 punctuation, bracket or hyphen losses that change the reading. (The split 'wood pecker' is counted with the dropped words, because it shares a fix with the dropped 'the' before 'kite'.)
    - 9 are page furniture; see below.
  - **129 hyphen-only corrections.** Each note begins `hyphen dropped:`, so they can be filtered out. These are compounds the print hyphenates but the site splits with a space (e.g. 'cloven footed') or runs together (e.g. 'turtledove', 'nighttime'). The brief counts punctuation-only differences only when the sense changes, but groups 6 and 7 record hyphen losses as corrections, so I did too. Drop them if policy says otherwise. 11 of them break at a line end in the print; for those the note says so and gives the form the print uses mid-line where it has one.
  - Two hyphen losses change the sense, and they have their own notes: 'shepard' for 'she-pard' and 'kneecap' (folded into the 'sliding part of the' fix).
  - 17 detector candidates are among the hyphen-only corrections.
- **Detector candidates (38):** 6 are substantive corrections ('it it it', 'I I is', 'lat', 'a a habit', 'does does', 'the the'). 17 are hyphen-only corrections. 15 are fine and listed in `results/g5-rejected.json`.
- **`results/g5-rejected.json`** also has 10 scandiff items I considered and kept. Among them are three print misprints that the site silently corrects ('yoke', 'eight month', 'rest'), and the archive's '(See diagram.)' notes.

## Pipeline-level findings (worth fixing at the source, not per correction)

1. **The MIT copyright footer is shown as part of HA 9.50.** The footer reads "---- Copyright statement: The Internet Classics Archive by Daniel C. Stevenson ... Thomas Bushnell, BSG." It leaks because `sources/ha-thompson/book-09.html` has neither 'Commentary:' nor 'How to cite', so `_DOC_ENDS` in `stage1_ross.py` never cuts it off. It is one entry in g5.json. A more robust fix is to add 'Copyright statement:' to `_DOC_ENDS`. No other translation's parsed text carries the footer.
2. **The archive's horizontal rule is shown as a paragraph at the end of every book.** It is a line of 70 hyphens, and it appears at the end of all nine HA books (8 entries in g5.json, plus the one with the footer). `texts/` shows the same rule in phys-hardie (8), top-pickard (7), cat-edghill, gc-joachim, poet-butcher, rhet-roberts, sr-pickard (2 each), apo-mure, apr-jenkinson and int-edghill (1 each). Dropping dash-only lines in `_strip_furniture` would clear all of them.

## Patterns in the archive's HA text

- **Dropped short words** are the commonest error (86): 'a', 'the', 'be', 'of', 'is', 'as' and similar. Several of them change the sense: 'oviparous' (2.17), 'naturally' (4.2), 'eggs' (6.10), 'eight' metretae (8.9), 'dogs' (8.22), 'spittle' (8.29), 'food' (9.1), 'honey' supply (9.40), 'wasps' (9.41).
- **Words at the edges of square brackets are lost.** Examples: '[Some ... so.]' (1.1), '[and ... gullet]' (1.12), '[from the great vein]' (3.3), '[and ... or gut]' (3.20), '[There ... soft.]' (4.4), '[two]' (5.6), '[lunar]' (7.4). In two places a stray comma stands where '] [' was (5.15, 6.4).
- **Sense-changing word swaps:**
  - 'ingested' for 'undigested' (2.17)
  - 'snipes' for 'cnipes' (4.8)
  - 'instruction' for 'destruction' (9.29)
  - 'Lybia' for 'Lydia' (9.24)
  - 'cases' for 'case' (9.37)
  - 'friendship or the' for 'friendship or enmity' (9.1)
  - 'mute' for 'minute' fishes (5.16)
  - 'bills' for 'hills' (9.1)
  - 'had' for 'has', 'near' for 'nearer', 'at' for 'past' (1.17, 1.16, 3.3)
- **Stray text:**
  - 'nor yet a tal' (2.8)
  - 'their lying still' (4.11)
  - 'occasion, when a' (9.40)
  - 'animal' (2.1)
  - 'membrane, same' (4.1)
  - 'oesophagus' (1.16)
  - 'sequently' (6.2)
  - a misplaced fragment of 6.2 at the end of 5.19 ('but if the latter impregnation takes placeduring the change of the yellow')

## Uncertain or policy calls

- **'nest' (site) against 'rest' (print), 9.14, 616a26.** The page image reads 'rest', but the Greek is about cutting the nest, so it looks like a misprint. I kept the site's reading and listed it in the rejected file.
- **'49B' (9.50).** This is the print's marginal chapter number, inline on the site. I report removing it; the parent may prefer to keep it as a marker.
- **Small spelling-level restorations, reported as print differences:** 'mould' (site 'mold'), 'towards' ('toward'), 'all round' ('all around'), "heav'nly" in the Homer verse ('heavenly'), 'whether or no' ('whether or not'), 'a-coming' ('coming').
- **Bracket and dash restorations:** the two '[And all this ... remarkably keen.]' brackets (4.8) and the dash in 'first-even at this stage-it' (5.19). These are punctuation, kept because they change the reading. Other dropped dashes are not reported.
- **Scan-2-only checks.** Four corrections rest only on `worksofaristotle0004jasm`, because the Toronto scan lacks those pages: 'foot' and 'animal' (2.1, 498b), 'as is the case' (2.1, 498b), and 'amimal' (3.11, 518b).
