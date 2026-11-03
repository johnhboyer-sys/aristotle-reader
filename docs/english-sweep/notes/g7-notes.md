# Group 7: OCR and transcription errors (Ross Meta, Ross EN, Solomon EE/VV, Peters EN, Ostwald EN)

Results: `results/g7.json` (316 corrections) and `results/g7-rejected.json` (52 items: 37 detector
candidates that are fine, 15 scan differences deliberately not reported). Working files, scripts and
crops of page images are in `agents/g7/`.

## Counts

| dir | work | corrections | print-checked | scan-agrees | sense-only |
|---|---|---|---|---|---|
| meta-ross | Meta | 149 | 2 | 144 | 3 |
| ross | EN | 137 | 3 | 131 | 3 |
| ee-solomon | EE | 10 | 0 | 10 | 0 |
| dvv-solomon | VV | 0 | - | - | - |
| en-peters | EN | 12 | 6 | 6 | 0 |
| ostwald | EN | 8 | 0 | 0 | 8 |
| **total** | | **316** | 11 | 291 | 14 |

Rough kinds: dropped words 123, changed or garbled words 121, hyphen lost or line-end hyphen kept 29,
added or doubled words 17, stray characters (mostly margin numbers read as words) 12, split words 8,
garbled transliterations 6.

Detector candidates (`cands-g7.json`, 60): 23 led to corrections, 37 are fine (in the rejected file).

## Scans used

| dir | scans (archive.org) | what they are |
|---|---|---|
| meta-ross | `worksofaristotle0008wdro_z2x3`, `theworksofaristo08arisuoft` | Works vol. VIII, 2nd ed. 1928 (two copies). Also `worksofaristotle0008unse` (1st ed. 1908) and `worksofaristotle0008wdro_h7t3` (later reprint of 1928) for edition checks. |
| ross | `worksofaristotle0009wdro_l1v5`, `theworksofaristo09arisuoft` | Works vol. IX, 1925 (EN by Ross, first edition 1925). |
| ee-solomon, dvv-solomon | same two vol. IX scans | the 1925 issue of vol. IX reprints Solomon's 1915 EE and VV (1915 title pages kept inside). |
| en-peters | `nicomacheanethi00arisuoft`, `nicomacheanethic1893aris`; `nicomachethic00arisuoft` for comparison | 11th edition; 14th edition (text of the 5th ed., preface 1893); 1881 first edition. |
| ostwald | none | archive.org's only copy, `nicomacheanethic00aris`, is a lending item; its OCR text returns 401. Judged by sense only. |

Method: `scandiff` (a copy that also records site offsets) against both scans of each printing, then
the two diff lists merged: a difference where both scans agree against the site was read in full;
differences seen in one scan only were read where the words were real; differences where the other scan
matches the site were treated as OCR noise. A second, wider pass (up to 25 words, 2 words of context)
caught errors too close together or too long for the default pass (e.g. the scrambled end of Meta III
and doubled phrases at page turns). Separate checks: site words with no match in either scan or in the
whole corpus; compounds whose hyphen was lost (the default scandiff cannot see these, since it joins
line-end hyphens in the scan); print line-end hyphens kept inside a word on the site.

## Things to know before applying

1. **anchors.yaml.** 50 corrections (48 Meta, 2 EE) change words inside an `at:` phrase of
   `sources/<dir>/anchors.yaml`. Those phrases are matched exactly, so each such phrase must be updated
   with the correction or its gutter tick is lost (or, for a column's first line, the anchor cut
   raises). Each affected entry says which anchor in its `note`.
2. **The corrections test only reads public primaries.** `pipeline/tests/test_english_corrections.py`
   checks `find`/`replace` against each work's primary English. Meta (meta-ross), EE (ee-solomon) and
   VV are primaries, but for EN the primary is Rackham; the Ross, Peters and Ostwald entries need a
   dir-aware test (the `dir` field is there for that) before they can go into
   `sources/english-corrections.json`.
3. **Peters is mislabelled.** The site calls it "F. H. Peters (Kegan Paul, 1881)", but the text is
   Peters's revised translation (5th edition, 1893, and later printings; Standard Ebooks). Against the
   1881 scan there are many real-word differences that are Peters's own revisions (e.g. 'exercise' /
   'labour', 'right angle' / 'straight line'), not errors. It matches the 11th-edition printing closely,
   including that scan's own OCR slips ('Mesara', 'held' for 'field', 'clear' for 'dear', 'passions of'):
   the page images show the print reads 'Megara', 'field', 'dear', 'or', so these are OCR errors carried
   into the site's source. Suggest relabelling the slot (e.g. "Kegan Paul, revised ed. 1893").
   Standard Ebooks house style (closed-up compounds such as 'moneymaking', 'wellborn', 'everyone';
   'loath', 'forever'; Greek kept in Greek letters) is applied throughout and was not reported.
   'farther'/'further' differ between printings and were not reported.
4. **Editions confirmed.** Meta follows the 1928 2nd ed. as labelled (1,389 small differences against
   it versus 2,573 against 1908; the 1908 text differs throughout). Ross EN follows the 1925 text (there
   is no earlier Ross EN). EE/VV follow Solomon's 1915 text.
5. **Ostwald** find/replace are snippets of the stored Markdown (`sources/ostwald/ostwald-ethics.md`),
   with line numbers and footnote marks as stored. The 'suchand 10-such' fix puts the margin number back
   as its own token so the parser still reads it as a line tick. Six of the eight are in Ostwald's notes.
6. **Transliterations.** Greek in transliteration is the archive's convention and was left alone, but
   six garbled transliterations are included and say so in the note: Meta 'arhchai' (archai), "Kath' d"
   (kath' ho), 'n+I/n' (n+1/n); EN 'sikaion/sicha/sichaion/sikastes/sichastes' (delta rendered as s,
   which hides Aristotle's dikaion/dicha pun), 'epiekes', 'epieikestebon', 'sozousa tan phronsin'.
   Drop them if transliteration is out of scope.
7. **Print misprints the site silently fixes** were left alone (rejected file): Meta 'that which
   contains hold' (print), EN 'a rational principles' (print), Peters 'he sometimes take less' (print).

## Most important corrections (sense changes)

- Meta X. 4: "one thing have more than one contrary" → "one thing cannot have more than one contrary" (page image).
- Meta XI. 11: "the contrary of movement is rest" → "is movement or rest".
- Meta III. 6 (end of book): a whole sentence scrambled; restored (page image).
- Meta IV. 4: "much more different" → "much more opposed" (1908 and 1928 both read 'opposed').
- Meta XIII. 7: "no other in the 10 but the 10 itself" → "no other 10 in the 10 but itself".
- Meta IX. 2 and XIV. 5: phrases doubled at page turns.
- EN V. 10 (Ross): "the error is in the law" → "the error is not in the law" (page image).
- EN III. 12 (Ross): "craves for the things be ought, as he ought, as when he ought; and when he ought" → "...he ought, as he ought, and when he ought" (page image).
- EN X. 9 (Ross): "and and the opposite pains" → "and avoid the opposite pains" (page image).
- EN V. 3 (Ross): "And since the equall intermediate" → "And qua intermediate", and the second 'qua' restored.
- EN VIII. 6 (Ross): "these are thou to be ... friendship productive of it ... while men become friends" → "thought ... and most productive ... while young men".
- EN I. 7 (Ross): "'so-and-so-and ... e.g. a lyre, and a good lyre-player" → "'a so-and-so' and ... e.g. a lyre-player and a good lyre-player".
- EE VII. 3: "for this is The lover does frequently ... not perceive" → words displaced at a page turn.
- EE (4 places) and Peters (2 places): margin line or section numbers read as the words 'to'/'To'/'a'.
- Peters VIII. 7: "then each friendship" → "then such friendship"; X. 8: "clear to themselves" → "dear" (page image).

## Unsure or approximate

- `column` comes from anchors.yaml (interpolated between anchors) for Meta/EE, from the Ross EN alignment
  map for Ross, and by position within the chapter for Peters; near a column boundary it can be off by
  one column. Ostwald columns come from the Markdown's own page labels.
- 'scan-agrees' rests on two independent OCRs of the same printing reading alike; only 11 entries were
  checked on the page image.
- Ostwald note 487: '1196a5' is plainly wrong for Book I, chap. 5; it may be Ostwald's own misprint
  rather than a transcription slip.
- Line-end hyphens: where the print breaks a compound at a line end, the book's own usage elsewhere
  decided it ('dog-days', 'praiseworthy', 'twofold', 'racecourse'); those notes say so.
- VV: 14 small differences, all scan noise; no corrections.
