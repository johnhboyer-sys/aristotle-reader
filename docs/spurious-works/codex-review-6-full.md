# Round 6 adversarial review

Reviewed HEAD `83e6b8fb41` against `4bdf8a3368`; the script and source books match `24dbee48d0`.

## Findings, most severe first

1. **Should-fix — 3.16: round 5 lowercases a real verse capital and gives false image evidence for it.** Ours reads “that wine mingles with the temper of the drinker”. Both raw scans read **Wine** (A58, B59). A58 shows an indented verse line beginning **Wine**, below “Is it true, as Chaeremon says, that”. This is a real capital within a sentence. The new PRINT_READS entry says “the print has lower case”; the new (c) allowance says “the print has lower-case 'wine'”. Both claims are false. The prior book had the correct capital. The explicit PRINT_READS entry causes this regression; `_case_choice` itself returns no choice when the scans agree in case. See `sheet-08.jpg` C15 and `detail.jpg`. Restoring the printed capital passes `--books`, but default-mode verification exits 1 solely for the now-unused `Wine -> wine` allowance. It reports no text finding. Thus the default check enforces the wrong reading.

2. **Should-fix — 10.7 and 23.16: `--verify --books` misses restored OCR capitals at line starts.** At 10.7, changing “locality, whereas with” to “locality, Whereas with” returns **0**, with no finding. A119 OCR reads `Whereas`; B lacks this stretch. A119's image has lower-case `whereas`. At 23.16, changing “over open spaces” to “Over Open spaces” also returns **0**, with no finding. Both scans read `Over Open`; A260's image has lower-case `over open`. These are fresh mutations, not Opus or selftest cases. The corresponding (c) findings disappear and `--books` skips unused allowances (script lines 3233–3238). A separate default-mode simulation of the 10.7 mutation rejects only its stale allowance, not the text. The skip therefore affects the requested adversarial check; it does not show that normal default verification accepts 10.7. Logs: `mutation-23.log`, `mutation-31.log`, `whereas-default.log`.

3. **Should-fix — 10.5: a new (f) allowance reason denies a question mark that the image plainly shows.** Its reason says: “after 'leprosy?' the print has a raised call-out and no '?'”. A119 shows **leprosy?¹ Is**. A OCR reads `leprosy?!`; B lacks the page. Ours correctly keeps `leprosy?`. The reason confuses the body question mark with the extra scan mark. This is bad evidence, not a live text error. See `sheet-03.jpg`, V105.

4. **Should-fix, unresolved evidence — 23.9: `ing -> in` still lacks a print check.** Ours reads “wind is in the north”; A has no page for this passage; B's hOCR reads `ing`, confidence **96**, at the end of line 30 on B258. Its box is **(1644,1985)–(1732,2038)**. The next line reads “the north than when it is **in** the south?”, with `in` at **(936,2045)–(976,2083)**, confidence **95**. Thus B itself supplies a matching grammatical construction immediately after the suspect word, beyond the later repetition already cited in the allowance. The suspect box is wider and extends lower than nearby non-descending body words; it is not a separate raised call-out box. This supports an editorial correction but does not prove that the print says `in`, or that the final glyph is a raised number. `B-ing.json` preserves the full line, next line, confidence and geometry. Classification: **unsure**, not image-confirmed.

5. **Nit — new PRINT_READS image references point to the wrong leaves.** 1.47 labels its evidence “A18-region”, but “those substances which” appears on **A33**. 4.8 cites **A78**, but “intercourse or vomit” appears on **A72**. Both output readings match the actual images. These references hinder the next image audit.

### Three dot removals remain unsure

At **1.40 `relaxes.`**, **11.15 `is.`**, and **30.1 `to.`**, A's image has a small ink dot after the word. A OCR includes the stop; B OCR omits it in all three places (B31, B147, B328). Ours omits it. The sentence syntax favours omission, and the dots may be specks; I cannot certify from A alone that no printed mark exists. These are **unsure**, not proved wrong readings. `detail.jpg` shows all three at larger scale. The broad stop-before-lowercase rule cannot itself settle this distinction.

## Mutation table

Each test starts from a fresh HEAD book, changes just one passage, and invokes the standalone script's `verify` function with the scratch books path (the same path taken by `--verify --books`). The driver imports that file directly; it imports no pipeline package. All runs use `python3 -B`. The first CLI run of default `--verify` also exited 0. `baseline.log` records a second clean default-mode run. No tracked files changed.

**30 new defects: 28 CAUGHT, 2 MISSED.** One extra control restores correct print and is excluded from that total. Every CAUGHT defect below has at least one finding that names the changed word or mark; none relies solely on an unrelated allowance losing its context. Some tests also produce such secondary findings. The table gives the direct finding, and each full log retains all findings. IDs are stable scratch test IDs; 26 was re-pinned to its first occurrence after the initial phrase matched twice. Test 24 removes a final question mark without a call-out; test 29 supplies the separate final-question-plus-call-out case requested.

| ID | Place | Plant (old → new) | Result | Direct finding / does it name the defect? |
|---|---|---|---|---|
| 1 | 1.2 | `causes of the disease` → `causes. of the disease` | CAUGHT | Yes: (g) [causes .] …patient. Is it because the [causes.] of the disease are opposites @A16… |
| 2 | 6.3 | `can settle; for then` → `can settle. for then` | CAUGHT | Yes: (f) [settle ;] …a place where they can [settle.] for then there is less @A99… |
| 3 | 8.4 | `air, since it` → `air. since it` | CAUGHT | Yes: (f) [air ,] …is easily accessible to the [air.] since it is permeable and @A106… |
| 4 | 9.1 | `condition adheres` → `condition Adheres` | CAUGHT | Yes: (c) [adheres -> Adheres] …owing to its glutinous condition [Adheres] and at the same time @A113… |
| 5 | 10.4 | `are dense and` → `are and` | CAUGHT | Yes: (a) [dense] …and the bodies of boys are [ours: ] and do not allow the passage @A118… |
| 6 | 10.8 | `heat is productive of growth` → `heat is of growth` | CAUGHT | Yes: (a) [productive] …they are hotter, and heat is [ours: ] of growth? Or is it because @A120… |
| 7 | 10.12 | `become crushed and bent` → `become and bent` | CAUGHT | Yes: (a) [crushed] …are confined the straight lines become [ours: ] and bent. So pygmies are like @A121… |
| 8 | 23.8 | `are very numerous and wide` → `are very and wide` | CAUGHT | Yes: (a) [numerous] …are direct interstices which are very [ours: ] and wide? Fresh water, therefore, has @A?… |
| 9 | 23.10 | `it has little moisture` → `it has moisture` | CAUGHT | Yes: (a) [little] …and earthy? Since, therefore, it has [ours: ] moisture in it, it dries more @A?… |
| 10 | 31.14 | `hard and wrinkled surface` → `hard and surface` | CAUGHT | Yes: (a) [wrinkled] …their eyes have a hard and [ours: ] surface, and so the vision is @A345… |
| 11 | 31.18 | `is equally acute` → `is acute` | CAUGHT | Yes: (a) [equally] …the sight of both eyes is [ours: ] acute? Is it because the parts @A346… |
| 12 | 15.3 | `count up to 10` → `count up to 11` | CAUGHT | Yes: (a) [10] …and Greeks alike, count up to [ours: 11] and not up to any other @A182… |
| 13 | 19.20 | `such as τε and` → `such as δέ and` | CAUGHT | Yes: (a) [such as τε and καί,] …A216: Greek particles… |
| 14 | 19.28 | `‘nomes’ (νόμοι)` → `‘nomes’ (νόμοις)` | CAUGHT | Yes: (b) [νόμοις] …character. Why are the ‘nomes’ [(νόμοις)] which are sung so called? @A218… |
| 15 | 30.14 | `(ἵστησι)` → `(ἵστημι)` | CAUGHT | Yes: (b) [ἵστημι] …that knowledge checks the mind [(ἵστημι)] since when it is in @A338… |
| 16 | 6.3 | `stomach concocts food` → `stomach ‘concocts food` | CAUGHT | Yes: (e) [unclosed opening quote] …Is it because the stomach [‘concocts] food more quickly when it @A99… |
| 17 | 8.4 | `easily accessible to the air` → `easily accessible’ to the air` | CAUGHT | Yes: (e) [unmatched closing quote] …Such a condition is easily [accessible’] to the air, since it @A106… |
| 18 | 15.3 | `‘one-five’,` → `‘one-five,` | CAUGHT | Yes: (e) [unclosed opening quote] …5 and then repeating them, [‘one-five,] ‘two-five’, just as they say @A182… |
| 19 | 9.1 | `prevent swelling` → `prevent prevent swelling` | CAUGHT | Yes: (b) [repeated prevent] …glutinous consistency cause adhesion and [prevent] prevent swelling (their effect resembling @A113… |
| 20 | 31.18 | `the sight is passive?` → `the sight is passive` | CAUGHT | Yes: (f) [passive ?] …passivity, and the sight is [passive] Why is it that when @A346… |
| 21 | 23.8 | `sea is clearer?` → `sea is clearer` | CAUGHT | Yes: (f) [clearer ?] …it because the sea is [clearer] For there is no earth @A?… |
| 22 | 2.24 | `all out at once.` → `all out at once,` | CAUGHT | Yes: (g) [once ,] …relaxed comes all out at [once,] Why is it that, when @A45… |
| 23 | 10.7 | `locality, whereas` → `locality, Whereas` | MISSED | No finding; exit 0. |
| 24 | 25.10 | `depth?</p>` → `depth</p>` | CAUGHT | Yes: (f) [depth ?] …can never penetrate into its [depth] Why is the air from @A278… |
| 25 | 30.1 | `‘the sacred disease’` → `‘the sacred disease` | CAUGHT | Yes: (e) [unclosed opening quote] …were called by the ancients [‘the] sacred disease after him. That @A326… |
| 26 | 23.9 | `transparent when the wind is in the north` → `transparent when the wind is the north` | CAUGHT | Yes: (a) [ing] …more transparent when the wind is [ours: ] the north than when it is @A?… |
| 27 | 26.32 | `941b 6-23` → `942b 6-23` | CAUGHT | Yes: (a) [941] …is hot. And since, &c. (as [ours: 942 b] 6-23). Why does the West wind @A295… |
| 28 | 22.14 | `the spaces between` → `the Spaces between` | CAUGHT | Yes: (c) [spaces -> Spaces] …soft, insinuate themselves into the [Spaces] between the teeth, and, being @A255… |
| 29 | 3.4 | `body and consistency?</p>` → `body and consistency</p>` | CAUGHT | Yes: (f) [consistency !?] …when it has body and [consistency] Why do drunkards tremble, and @A53… |
| 30 | 3.16 | `that wine mingles` → `that Wine mingles` | Control: accepted | No text finding; this restores the real printed capital. Default mode fails only on a stale allowance. |
| 31 | 23.16 | `over open spaces` → `Over Open spaces` | MISSED | No finding; exit 0. |

## New allowance sample

Literal comparison with `4bdf8a3368` finds **432 new allowance tuples**: a 32, b 12, c 66, d 70, e 3, f 147, g 102. I checked **34**: a 5, b 5, c 6, d 5, e 3, f 5, g 5. **32 agree with the image and the stated print reading; 2 fail** (3.16 case, 10.5 reason). “Clean” here concerns the print and output; the generated prose about which neighbouring OCR token is run together is often clumsy and is not a substitute for the image.

`Vn` is the zero-based index in `new-tables.json`'s new allowance list, not the full VERIFY_ALLOW index. Script lines identify the full entries. Sheets 00–04 contain the stratified sample; C15 and `detail.jpg` supply the added 3.16 check. A27's full footnotes are in `notes27.jpg`; I checked them rather than relying only on the short body crop. Crops match the quoted page text; short phrases that located another occurrence were checked again in the proper passage.

| Sample | Place / kind | Scan complaint | Script line | Image / judgement |
|---|---|---|---|---|
| V2 | 1.34 (a) | `oc ate een en rib gondapersed nasties cok see below chapter 34 the teubner text omits dvev before éoyapdceas cp chapter 32 above` | 1516 | A27: clean |
| V90 | 8.6 (a) | `pcy chiplen 22 2 cp chapter τὸ` | 1695 | A106: clean |
| V181 | 15.10 (a) | `ζ εν enomon b` | 1895 | A189: clean |
| V327 | 26.52 (a) | `zs` | 2270 | A302: clean |
| V392 | 31.18 (a) | `7` | 2407 | A346: clean |
| V80 | 5.37 (b) | `heat` | 1675 | A96: clean |
| V89 | 7.1 (b) | `why` | 1694 | A101: clean |
| V255 | 19.42 (b) | `nete` | 2115 | A225: clean |
| V348 | 26.52 (b) | `is` | 2321 | A302: clean |
| V388 | 30.1 (b) | `aleïan` | 2401 | A326: clean |
| V12 | 1.25 (c) | `While -> while` | 1531 | A25: clean |
| V104 | 10.4 (c) | `A -> a` | 1728 | A119: clean |
| V195 | 16.5 (c) | `Over -> over` | 1957 | A195: clean |
| V316 | 25.15 (c) | `Opposite -> opposite` | 2254 | A279: clean |
| V426 | 37.3 (c) | `Wasting -> wasting` | 2468 | A371: clean |
| V0 | 1.7 (d) | `ina -> in a` | 1510 | A17: clean |
| V101 | 10.52 (d) | `itselfas -> itself as` | 1721 | A136: clean |
| V210 | 19.9 (d) | `ofa -> of a` | 1989 | A212: clean |
| V325 | 26.49 (d) | `libyaas -> libya as` | 2265 | A301: clean |
| V428 | 38.5 (d) | `surfacea -> surface a` | 2473 | A375: clean |
| V135 | 11.7 (e) | `‘they` | 1793 | A145: clean |
| V136 | 11.7 (e) | `is’` | 1794 | A146: clean |
| V378 | 30.1 (e) | `mortals’` | 2373 | A326: clean |
| V3 | 1.3 (f) | `kind ?` | 1517 | A16: clean |
| V105 | 10.5 (f) | `leprosy !` | 1729 | A119: WRONG reason: image has body ? plus raised 1; ours is correct |
| V200 | 16.8 (f) | `if ?` | 1969 | A198: clean |
| V332 | 26.27 (f) | `evening ?` | 2287 | A292: clean |
| V431 | 38.9 (f) | `thing ?` | 2480 | A376: clean |
| V5 | 1.5 (g) | `take .` | 1519 | A17: clean |
| V121 | 10.54 (g) | `smell .` | 1772 | A138: clean |
| V223 | 19.16 (g) | `antiphonal ’` | 2021 | A214: clean |
| V300 | 23.31 (g) | `fresh .` | 2223 | A264: clean |
| V429 | 38.2 (g) | `reddish .` | 2476 | A374: clean |
| V45 | 3.16 (c) | `Wine -> wine` | 1602 | A58: WRONG: real capital Wine; ours and reason disagree with verse |

## New PRINT_READS checks

Compared with the prior script, **72 tuples are new** (including replacements for earlier entries); HEAD has 120 entries. I checked **23** against the image: the first 20 new tuples, plus the Wine change and the two faulty leaf references. **20 are clean; 1 changes correct text; 2 have wrong image references while the output text is correct.** The 23.9 entry received an hOCR check, not an image check, and is excluded from these 23.

`Pn` uses the zero-based new-tuple list in `new-tables.json`. For short ambiguous phrases, the C change crop, rather than the first automatically located P crop, supplies the confirmed passage (notably P0, P1, P2, P5, P8 and P12).

| Sample | Place | Reading | Actual image | Result |
|---|---|---|---|---|
| P0, line 150 | 10.11 | `greenish,t` → `greenish,` | A120 | clean |
| P1, line 151 | 11.7 | `‘They` → `They` | A145 | clean |
| P2, line 152 | 11.7 | `air is’` → `air is` | A146 | clean |
| P3, line 153 | 30.1 | `‘the sacred disease after` → `‘the sacred disease’ after` | A326 | clean |
| P4, line 154 | 30.1 | `mortals.’` → `mortals.` | A326 | clean |
| P5, line 155 | 30.1 | `Aleian` → `Aleïan` | A326 | clean |
| P6, line 156 | 26.27 | `it, When the South wind begins and` → `it, ‘When the South wind begins …’), and` | A293 | clean |
| P7, line 157 | 26.32 | `(as 941 6-23).` → `(as 941b 6-23).` | A295 | clean |
| P8, line 158 | 10.62 | `body ’—in` → `body —in` | A140 | clean |
| P9, line 159 | 1.19 | `autumn, If` → `autumn. If` | A23 | clean |
| P10, line 160 | 1.35 | `copper: has: a` → `copper has a` | A28 | clean |
| P11, line 161 | 2.24 | `all out at once,` → `all out at once.` | A45 | clean |
| P12, line 162 | 2.32 | `and, penetrates` → `and penetrates` | A48 | clean |
| P13, line 163 | 3.18 | `the: taste` → `the taste` | A60 | clean |
| P14, line 164 | 4.12 | `is salty, Now` → `is salty. Now` | A73 | clean |
| P15, line 165 | 4.31 | `into semen,` → `into semen.` | A82 | clean |
| P16, line 166 | 5.29 | `against a wall,` → `against a wall.` | A93 | clean |
| P17, line 167 | 10.32 | `because some: quickly` → `because some quickly` | A128 | clean |
| P18, line 168 | 10.54 | `is due: quite` → `is due quite` | A138 | clean |
| P19, line 169 | 10.59 | `others moist. Animals` → `others moist, Animals` | A139 | clean |
| P34, line 184 | 1.47 | `those Substances which` → `those substances which` | A33 | wrong leaf reference; text correct |
| P35, line 185 | 3.16 | `that Wine mingles` → `that wine mingles` | A58 | wrong capital; image Wine |
| P36, line 186 | 4.8 | `intercourse Or vomit` → `intercourse or vomit` | A72 | wrong leaf reference; text correct |

## All-book change sweep

I compared all **38** HEAD books with `git show 4bdf8a3368:sources/prob-forster/book-NN.html`, then split the paragraph text on whitespace and listed every non-equal span. This yields **134 spans**, including punctuation-only changes: **129 correct against A's image, 1 wrong, 4 unsure**. No other changed proper noun or capital after a colon proved wrong. The comma/full-stop replacements checked here match their images, including the unusual printed comma before “Animals” at 10.59. The explicit part-scoped PRINT_READS replacements do not run globally; the broad case and stop rules still need independent print checks as the Wine error and the four unsure spans show.

The expanded crops in `extra-0.jpg` and `extra-1.jpg` correct repeated-phrase locations for C13, C23, C24, C43, C47, C57, C58, C63, C67 and C131. In particular, C13 belongs on A55, not the similar question on A60; C23 is A94, C24 A95, C47 A148, and C131 A369. C83 has **no matching A page**: the automatic A279 crop is a different passage and provides no evidence for 23.9. Likewise, unused short-phrase P crops on other pages are not evidence. The table below gives the checked location, not those rejected search hits.

The `missing_region` change caught all **8** planted word losses in the three named one-scan ranges (10.4, 10.8, 10.12, 23.8, 23.9, 23.10, 31.14, 31.18). Its extra findings did not substitute for the actual missing-word finding. The unused-allowance rule changes no text, but the Wine control demonstrates that it can reject a correction when the allowance encodes a wrong reading. Its `--books` skip leaves the two missed case regressions above.

| Change | Place | Prior → HEAD | Checked leaf | Class |
|---|---|---|---|---|
| C0 | 1.3 | `Dogstar,}` → `Dogstar,` | A17 | correct (image) |
| C1 | 1.19 | `autumn,` → `autumn.` | A23 | correct (image) |
| C2 | 1.24 | `light?)` → `light?` | A25 | correct (image) |
| C3 | 1.25 | `While` → `while` | A25 | correct (image) |
| C4 | 1.25 | `them,?` → `them,` | A25 | correct (image) |
| C5 | 1.26 | `Over` → `over` | A25 | correct (image) |
| C6 | 1.31 | `change?;` → `change?` | A27 | correct (image) |
| C7 | 1.35 | `copper: has:` → `copper has` | A28 | correct (image) |
| C8 | 1.37 | `colour.` → `colour` | A28 | correct (image) |
| C9 | 1.40 | `relaxes.` → `relaxes` | A30 | unsure: small ink dot in A; B OCR has no stop |
| C10 | 1.47 | `Substances` → `substances` | A33 | correct (image) |
| C11 | 2.24 | `once,` → `once.` | A45 | correct (image) |
| C12 | 2.32 | `and,` → `and` | A48 | correct (image) |
| C13 | 3.8 | `Water` → `water` | A55 | correct (image) |
| C14 | 3.8 | `Sensitive` → `sensitive` | A55 | correct (image) |
| C15 | 3.16 | `Wine` → `wine` | A58 | wrong: verse capital |
| C16 | 3.18 | `the:` → `the` | A60 | correct (image) |
| C17 | 4.8 | `Or` → `or` | A72 | correct (image) |
| C18 | 4.12 | `salty,` → `salty.` | A73 | correct (image) |
| C19 | 4.23 | `fulcrum.}` → `fulcrum.` | A78 | correct (image) |
| C20 | 4.31 | `semen,` → `semen.` | A82 | correct (image) |
| C21 | 5.13 | `because.` → `because` | A87 | correct (image) |
| C22 | 5.29 | `wall,` → `wall.` | A93 | correct (image) |
| C23 | 5.34 | `the.` → `the` | A94 | correct (image) |
| C24 | 5.34 | `boiled` → `boiled.` | A95 | correct (image) |
| C25 | 5.37 | `heat’and` → `heat and` | A96 | correct (image) |
| C26 | 6.5 | `work,` → `work.` | A100 | correct (image) |
| C27 | 7.1 | `Wuy` → `Why` | A101 | correct (image) |
| C28 | 7.8 | `rest?)` → `rest?` | A104 | correct (image) |
| C29 | 8.9 | `One` → `one` | A107 | correct (image) |
| C30 | 9.3 | `Is.` → `Is` | A113 | correct (image) |
| C31 | 9.6 | `cold‘),` → `cold),` | A115 | correct (image) |
| C32 | 10.7 | `Whereas` → `whereas` | A119 | correct (image) |
| C33 | 10.11 | `greenish,t` → `greenish,` | A120 | correct (image) |
| C34 | 10.27 | `I s` → `Is` | A126 | correct (image) |
| C35 | 10.32 | `some:` → `some` | A128 | correct (image) |
| C36 | 10.36 | `Other` → `other` | A129 | correct (image) |
| C37 | 10.37 | `occasionally,` → `occasionally.` | A130 | correct (image) |
| C38 | 10.45 | `condition?#` → `condition?` | A132 | correct (image) |
| C39 | 10.54 | `due:` → `due` | A138 | correct (image) |
| C40 | 10.59 | `moist.` → `moist,` | A139 | correct (image) |
| C41 | 10.62 | `’—in` → `—in` | A140 | correct (image) |
| C42 | 10.62 | `whereas.` → `whereas` | A140 | correct (image) |
| C43 | 10.62 | `birds.` → `birds` | A140 | correct (image) |
| C44 | 10.64 | `unhealthy,` → `unhealthy.` | A141 | correct (image) |
| C45 | 11.7 | `‘They` → `They` | A145 | correct (image) |
| C46 | 11.7 | `is’` → `is` | A146 | correct (image) |
| C47 | 11.15 | `is.` → `is` | A148 | unsure: small ink dot in A; B OCR has no stop |
| C48 | 11.15 | `the.` → `the` | A148 | correct (image) |
| C49 | 11.18 | `it?)` → `it?` | A149 | correct (image) |
| C50 | 11.27 | `Without` → `without` | A153 | correct (image) |
| C51 | 11.28 | `imperceptible,` → `imperceptible.` | A154 | correct (image) |
| C52 | 11.32 | `in.` → `in` | A155 | correct (image) |
| C53 | 11.36 | `Which` → `which` | A157 | correct (image) |
| C54 | 11.37 | `OVer` → `over` | A157 | correct (image) |
| C55 | 11.44 | `because,` → `because` | A159 | correct (image) |
| C56 | 13.4 | `hot,?` → `hot,` | A173 | correct (image) |
| C57 | 14.1 | `Wuy` → `Why` | A177 | correct (image) |
| C58 | 15.1 | `Wuy` → `Why` | A182 | correct (image) |
| C59 | 15.6 | `acone,` → `a cone,` | A186 | correct (image) |
| C60 | 16.1 | `sunlight?)` → `sunlight?` | A192 | correct (image) |
| C61 | 16.5 | `Over` → `over` | A195 | correct (image) |
| C62 | 16.8 | `waterwill` → `water will` | A197 | correct (image) |
| C63 | 17.1 | `Wuy` → `Why` | A202 | correct (image) |
| C64 | 18.7 | `for.` → `for` | A207 | correct (image) |
| C65 | 19.5 | `unfamiliar,` → `unfamiliar.` | A210 | correct (image) |
| C66 | 19.9 | `lyre?)` → `lyre?` | A212 | correct (image) |
| C67 | 19.14 | `octave,` → `octave.` | A213 | correct (image) |
| C68 | 19.15 | `reason.` → `reason` | A213 | correct (image) |
| C69 | 19.34 | `fifth?` → `fifth` | A219 | correct (image) |
| C70 | 19.42 | `ze?ze,` → `nete,` | A225 | correct (image) |
| C71 | 19.42 | `sound?` → `sound` | A225 | correct (image) |
| C72 | 19.42 | `Which` → `which` | A225 | correct (image) |
| C73 | 19.43 | `pomegranates,` → `pomegranates.` | A226 | correct (image) |
| C74 | 19.48 | `chorus?)` → `chorus?` | A228 | correct (image) |
| C75 | 20.12 | `prevail.` → `prevail` | A233 | correct (image) |
| C76 | 20.25 | `salt?)` → `salt?` | A239 | correct (image) |
| C77 | 21.1 | `whiter,` → `whiter.` | A243 | correct (image) |
| C78 | 21.8 | `becomes:` → `becomes` | A245 | correct (image) |
| C79 | 21.14 | `it,` → `it.` | A248 | correct (image) |
| C80 | 21.22 | `gluing` → `‘gluing` | A250 | correct (image) |
| C81 | 21.22 | `water '—and` → `water’—and` | A250 | correct (image) |
| C82 | 22.14 | `Spaces` → `spaces` | A255 | correct (image) |
| C83 | 23.9 | `ing` → `in` | none; B258 hOCR only | unsure: no A page |
| C84 | 23.12 | `arise?)` → `arise?` | A259 | correct (image) |
| C85 | 23.15 | `not` → `not?` | A259 | correct (image) |
| C86 | 23.16 | `Over Open` → `over open` | A260 | correct (image) |
| C87 | 23.19 | `sea.` → `sea` | A261 | correct (image) |
| C88 | 23.23 | `ripple?)` → `ripple?` | A262 | correct (image) |
| C89 | 23.23 | `it..` → `it.` | A262 | correct (image) |
| C90 | 23.31 | `fresh,` → `fresh.` | A264 | correct (image) |
| C91 | 23.34 | `ascrops` → `crops` | A265 | correct (image) |
| C92 | 24.9 | `distance,` → `distance.` | A270 | correct (image) |
| C93 | 24.9 | `are:` → `are` | A270 | correct (image) |
| C94 | 24.13 | `the]` → `the` | A271 | correct (image) |
| C95 | 24.14 | `more.` → `more` | A271 | correct (image) |
| C96 | 25.10 | `depth?:` → `depth?` | A278 | correct (image) |
| C97 | 25.15 | `Opposite` → `opposite` | A279 | correct (image) |
| C98 | 26.31 | `north‘),` → `north),` | A294 | correct (image) |
| C99 | 26.31 | `wind,’` → `wind,` | A295 | correct (image) |
| C100 | 26.32 | `941` → `941b` | A295 | correct (image) |
| C101 | 26.36 | `acalm.` → `a calm.` | A297 | correct (image) |
| C102 | 26.40 | `Open` → `open` | A298 | correct (image) |
| C103 | 26.45 | `towards.` → `towards` | A299 | correct (image) |
| C104 | 26.50 | `nature,` → `nature` | A301 | correct (image) |
| C105 | 26.52 | `zs` → `is` | A302 | correct (image) |
| C106 | 26.55 | `for,` → `for` | A304 | correct (image) |
| C107 | 26.56 | `winds,` → `winds.` | A305 | correct (image) |
| C108 | 29.8 | `choose.` → `choose` | A319 | correct (image) |
| C109 | 29.10 | `A.` → `A` | A319 | correct (image) |
| C110 | 29.13 | `them?.` → `them?` | A320 | correct (image) |
| C111 | 29.13 | `SO` → `so` | A321 | correct (image) |
| C112 | 29.14 | `Shall` → `shall` | A323 | correct (image) |
| C113 | 29.14 | `others..` → `others.` | A323 | correct (image) |
| C114 | 29.14 | `trom` → `from` | A324 | correct (image) |
| C115 | 30.1 | `disease` → `disease’` | A326 | correct (image) |
| C116 | 30.1 | `Aleian` → `Aleïan` | A326 | correct (image) |
| C117 | 30.1 | `mortals.’` → `mortals.` | A326 | correct (image) |
| C118 | 30.1 | `making.` → `making` | A327 | correct (image) |
| C119 | 30.1 | `to.` → `to` | A327 | unsure: small ink dot in A; B OCR has no stop |
| C120 | 30.1 | `which,` → `which` | A330 | correct (image) |
| C121 | 30.1 | `characters,` → `characters.` | A332 | correct (image) |
| C122 | 30.5 | `hands..` → `hands.` | A334 | correct (image) |
| C123 | 31.5 | `Originally` → `originally` | A341 | correct (image) |
| C124 | 31.15 | `Vision,` → `vision,` | A345 | correct (image) |
| C125 | 31.28 | `On` → `on` | A349 | correct (image) |
| C126 | 32.2 | `soft?)` → `soft?` | A351 | correct (image) |
| C127 | 33.2 | `OWing` → `owing` | A355 | correct (image) |
| C128 | 35.1 | `Whuy` → `Why` | A366 | correct (image) |
| C129 | 35.6 | `it?)` → `it?` | A367 | correct (image) |
| C130 | 35.10 | `fingers,` → `fingers.` | A368 | correct (image) |
| C131 | 36.2 | `Shown` → `shown` | A369 | correct (image) |
| C132 | 37.3 | `Wasting` → `wasting` | A371 | correct (image) |
| C133 | 38.5 | `surface,a` → `surface, a` | A375 | correct (image) |

## Checks found clean and limits

- Default verification: 889 Parts, 109,539 output words; all 971 allowances used; exit 0. `baseline.log` contains the full output.
- Fresh defect tests: 28 direct catches; all 8 word losses in the specified one-scan regions, all 3 fresh Greek changes, the doubled word, the two added quote marks, both lost closing-quote tests, the changed numbers, and the final question beside A53's call-out were caught. The two missed capitals remain findings.
- New allowance sample: 32 of 34 clean. New print-reading sample: 20 of 23 fully clean, with the 3 failures stated above.
- All-book diff: 129 of 134 spans image-confirmed; every span appears in the table, including the 1 wrong and 4 unsure.
- Scratch scripts, copies, logs, JSON and images live only in this directory. No network, uv, pytest, pipeline package, mutating build command, or supplied selftest ran. I did not rerun Opus's harness: these tests use new changes and keep each finding visible. No tracked file was edited, created or deleted.
