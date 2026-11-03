# Group 1 notes: Oxford *Works of Aristotle* vol. I (1928)

Translations: cat-edghill, int-edghill (E. M. Edghill), apr-jenkinson (A. J. Jenkinson),
apo-mure (G. R. G. Mure), top-pickard, sr-pickard (W. A. Pickard-Cambridge).

## Scans used

All six translations are in one volume, so two scans of that volume covered everything.

| scan | what it is | coverage |
|---|---|---|
| `worksofaristotle0001unse_w4d6` | *The Works of Aristotle translated into English*, vol. I, Oxford, Clarendon Press, 1928 (the scan the existing SE correction cites) | all six texts except two missing leaves: Int. 16a22 to 17a6, and APr. II.11 (about 61b10 to 62a28) |
| `worksofaristotle0001unse_b4y9` | another copy of the same 1928 printing (same pages, same line breaks; its leaf numbers run 0 to 2 behind) | all six texts except one missing leaf: APr. II.2, 53b11 to 54a13 |

Every passage of the six texts is covered by at least one scan; nearly all are covered by both.

Downloads are under `agents/g1/dl/<id>/` (`scan.txt` = `_djvu.txt`, `djvu.xml`), not `dl/<id>/`, to stay inside my
assigned folders. Page images I looked at (`page/n<i>.jpg` of `worksofaristotle0001unse_w4d6`, cropped in
`agents/g1/img/`): n20, n170, n211, n370, n383, n544, n580, n582, n594, n604, n605. Leaf numbers in `source`
are those page indices (verified against n20).

No translation was without a scan.

## Method

1. `tools/scandiff.py` against the first scan gave 2,022 differences (cat 84, int 53, apr 771, apo 382,
   top 485, sr 247). It aligned only 91 to 99% of each text. The footnotes push its window off the end of
   the chunk, and it misses whole stretches of APr, APo and Int. So I did the rest my own way (scripts in
   `agents/g1/bin/`):
2. From each scan's `djvu.xml` I kept only body text, dropping running heads, footnotes (smaller type at the
   foot of the page, found by word height and character width) and margin numbers (position). I joined
   line-end hyphens. Note: `djvu.xml` marks some body lines `<LINE x-struct="header">`, so a parser that
   matches only `<LINE>` loses them.
3. I aligned each site text with each scan using unique 8-word anchors, kept the longest monotonic chain
   and diffed between anchors (`align2.py`). This aligned 98 to 100% per scan, and 100% with both together.
   Wherever either scan differed from the site, I recorded what each scan reads there.
4. Set aside by rule (`triage.py`, 2,565 places): 1,537 places where one scan reads exactly as the site,
   which is the other scan's OCR noise; places where the OCR runs words together ("Cis", "ina"); places
   where only line-end hyphens, margin numbers or 'e. g.' differ; places where the OCR drops or garbles
   lone italic term letters (about 400, mostly APr); and one-word OCR garbles that are non-words within
   two letters of the site's word. I spot-checked every rule's output. Those spot checks turned up
   'can, not', 'sub. stance' and the 'not man' / 'not-man' cases, and I widened the rules to send such
   places to review.
5. I reviewed the remaining 899 places by hand, plus separate passes for: hyphens and stray
   punctuation inside words (`innerpunct.py`); missing `(n)` labels and unbalanced brackets; MIT section
   rules; and the detector's 25 candidates.
6. Each correction: `find` is checked to be unique in its book (chapters joined, whitespace collapsed, as
   `pipeline/tests/test_english_corrections.py` reads it). `replace` is checked to be unique once the fix
   is made. No two finds overlap. All 356 applied in sequence leave every find absent and every replace
   present. The letters of 319 of the 356 replacements occur in the scan text as they stand; I checked
   the other 37 by eye (scan OCR garbles, page breaks or footnotes between the words).
7. `column` and the line in `source` come from `anchors.yaml`, interpolated by character offset
   (across a column end, too), so the line can be off by one or two. Int's anchors are sparse, so its
   lines are rougher; I spot-checked its columns against the print's margins.

## Counts

| translation | corrections | dropped words | added/stray words | changed/garbled words | spacing, hyphen, punctuation | other |
|---|---|---|---|---|---|---|
| cat-edghill | 32 | 12 | 6 | 8 | 4 | 2 section rules |
| int-edghill | 28 | 16 | 1 | 2 | 8 | 1 section rule |
| apr-jenkinson | 83 | 42 | 12 | 24 | 4 | 1 section rule |
| apo-mure | 40 | 17 | 2 | 14 | 6 | 1 section rule |
| top-pickard | 110 | 49 | 6 | 29 | 17 | 6 section rules, 1 scrambled passage, 2 transliterations |
| sr-pickard | 63 | 27 | 5 | 14 | 13 | 2 section rules, 2 transliterations |
| **total** | **356** | 163 | 32 | 91 | 52 | 18 |

Confidence: 14 `print-checked`, 342 `scan-agrees`. A `scan-agrees` correction has both scans reading the
print's text against the site, or the one scan that has the leaf, for Int. 16a22-17a6 and APr. II.2/II.11.
Detector candidates: 12 confirmed (in `g1.json`), 13 rejected (in `g1-rejected.json`, with 13 notable
scan-flagged non-errors).

## Corrections that change the sense

- SE 173a: "a king should be happy" for the print's "should not be happy" (print-checked).
- SE 180b-181a (print-checked), three eye-skips at a page break: "decide in favour of him who says what
  is [just, or of him who says what is] unjust?"; "and these [were unjust.' But these] are fallacies";
  "not therefore preferable [to just; but, absolutely, just ways are preferable]".
- APr 66a: "a false syllogism cannot be drawn from two premisses" for "true premisses"
  (and "as we proved" for "as was proved"; print-checked).
- APr 36a "the possibility of [not] belonging"; APr 37a "'A [may] belong to all B'"; APr 33a "if the major
  premiss is [particular,] the minor universal"; APr 34a "third degree" for "third figure"; and some 20
  dropped term letters ("For since [A] necessarily belongs ...").
- APo 95a "from the [prior] event we cannot reason"; APo 90a "'What ratio makes a high and a low note
  concordant?'" for "What reason"; APo 91a "if A is ['peculiar'] to C".
- Int 20a: "'not man does not enjoy health'", "'every man is not just'", "'not every man is not just'" for
  the print's indefinite 'not-man' / 'not-just'; the logical form differs. Also "'every' and ['no' have]
  no additional significance", "a white [white] man [and] so on".
- Cat 6b "great in comparison with son with another"; 13a "does not grow his grow a new set"; 14b "that he
  is [is] true" twice; 2b "underlie every. else".
- Top 124b (at a page break) and 128a: doubled phrases. Top 139a: the lines of one sentence are scrambled
  (the site interleaves two print lines). Top 101b and 135b: label "(h)" for "(b)". Top 102b: "(i) ...
  (something" for "(1) ... (2) something". Top 140b: "'conation-for-the-pleasant [for the pleasant]'", which
  is the very redundancy the example is about. Top 121a: "'slow' and 'swan'" for "'snow'".

## Unsure, or choices for the user

- **Greek**: the house convention is transliteration, but four transliterations are garbled.
  - Top 106a "Barhu" (x2) for the print's βαρύ, and SE 177b "eros and eros" for ὄρος and ὅρος: here the
    breathing is the whole point of the sentence. For these I put the Greek, as the existing PA
    'olugos' correction does; 'baru' and 'oros and horos' are the transliteration alternatives.
  - SE 173b "Kopiskos/Kopiskon" (rho read as p): fixed to "Koriskos/Koriskon", to match the rest of that
    passage.
- **The print's own misprints are not copied**: APr 50b5 prints "it they have been established" (page
  image). The site's "if" is kept. APo 88a and Top 152a show the same 'it' in both scans and are kept as
  'if' too.
- **Trivial spelling and hyphenation** (included, notes say "hyphen dropped" or "spelling only"): co-ordinate
  (3), two-fold (3), non-existent, non-inclusion, non-necessary, plane-tree, bone-formed, wine-skin,
  snub-ness, bandy-shaped, starting-point(s), so-and-so, good-tempered, case-relationships, judgments
  (APo 89a, where the print has 'judgments' once among many 'judgement's), fulfilment, some one, inasmuch,
  moreover. The print itself varies (it has 'coordinate' 3 times and 'twofold' 5 times), so I included only
  places where both scans show the hyphen mid-line at that spot. Drop these if mechanical spelling is not
  wanted.
- **MIT section rules**: 13 corrections remove a 70-dash line, in SE with "SECTION 2" or "SECTION 3", at the
  end of a chapter (Cat 6 and 8, Int 10, APr I.46, APo I.34, Top books I-VII, SE 10 and 20). A 14th, at the
  end of Top V, is folded into the 139a scramble fix, because the two finds would overlap.
  `stage1_ross._strip_furniture` does not remove these rules, so other archive texts probably carry them
  too. A parser rule would cover them all, but that is outside this brief.
- Two finds are longer than 10 words because they cannot be shorter. Top 128a: the doubled stretch itself is
  12 words, so the find is 14. Top 139a: the scramble spans the whole sentence, plus the section rule.
- **Blind spots of the method**: digits are left out of the alignment (margin numbers), so a dropped number
  shows only if it leaves a bare '(' ('(If', '(something', '(secondly' were found that way). A wrong italic
  term letter where the OCR also fails is only caught when the scans read a clean, different letter. In
  every such case (N/V, R/X, E/Z, D/J, B/A) I judged the scans wrong by the argument. Punctuation-only
  differences were not reported unless they joined words or misplaced a quote ('wing"the', "from' the",
  "'a body 'and' a note'").
- The SE duplicated paragraph (168b) already in `english-corrections.json` is fixed in the source, and
  nothing here repeats it. None of my finds overlaps an existing correction.
