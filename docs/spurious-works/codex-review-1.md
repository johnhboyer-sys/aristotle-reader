1. **Blocker — the cleaner deletes numbers from the prose.**  
   [build_prob_forster.py:357](pipeline/tools/build_prob_forster.py#L357) treats every standalone number as a footnote mark. This destroys musical ratios in Book 19:
   
   - **19.23**, `book-19.html:97`: both witnesses have “a length in the ratio of **3 to 2**”; ours has “a length in the ratio of **to**.”
   - **19.35**, line 145: ours twice reads “in the ratio of **to**.”
   - **19.41**, line 169: ours reads “a fifth is in the ratio of **to** and a fourth in that of **to 3**.”
   
   These are body text numbers. `--verify` applies `clean_word` to both witnesses and removes digits from comparison tokens, so it cannot detect this loss.

2. **Should-fix — Book 1.50 loses four words across a page break.**  
   `sources/prob-forster/book-01.html:205` ends:
   
   > “acted upon in the both dissolved and processes cause pain to the body.”
   
   Both raw witnesses continue:
   
   > “the stomach,—namely, both dissolved and heated—these processes cause pain to the body.”
   
   Ours lacks **“stomach namely”** and **“heated these.”** The first line on the next page contains the missing text. The shared layout code used by the build and verification can hide a body line that both classify incorrectly.

3. **Should-fix — the musical-term repair replaces a real verb.**  
   [build_prob_forster.py:816](pipeline/tools/build_prob_forster.py#L816), **19.44**, `book-19.html:181`:
   
   - Both witnesses: “the points which **verge** towards either end”
   - Ours: “the points which **nete** towards either end”
   
   Calling `repair_terms(["verge"])` returns `["nete"]`. Verification applies this same repair to both witnesses, making the error invisible.

4. **Should-fix — the word splitter breaks valid words and names.**  
   [build_prob_forster.py:764](pipeline/tools/build_prob_forster.py#L764) produces these changes, confirmed against both raw witnesses:
   
   | Place | Witnesses | Ours |
   |---|---|---|
   | 16.4, line 21 | “legs are **sheared**” | “legs are **she a red**” |
   | 20.20, line 85 | “in **Attica**” | “in **Attic a**” |
   | 23.5, line 25 | “Straits of **Messina**” | “Straits of **Messin a**” |
   | 26.17; 26.56 | “**Attica**” | “**Attic a**” — three occurrences |
   | 28.3, line 17 | “reason **informs** us” | “reason **in forms** us” |
   | 29.4, line 21 | “**betake** herself” | “**be take** herself” |
   | 30.1, line 9 | “it **abounds**” | “it **a bounds**” |
   
   The shared splitter also makes these changes in verification’s witnesses.

5. **Should-fix — verification exempts real words as possible margin numbers.**  
   [build_prob_forster.py:1091](pipeline/tools/build_prob_forster.py#L1091), and the exemption near line 1205, match **“all,” “are,” “or,” “so,” “he,” “she,” “be,” “as,” “for,” and “far.”** If both witnesses contain one of these words at a line edge and ours drops it, the gate suppresses the finding. This exceeds the stated margin-number exceptions. The gate also ignores missing spans of **five or six words**, because line 1196 limits checks to four.

6. **Should-fix — two anchor numbers point to one place.**  
   `sources/prob-forster/anchors.yaml:2578–2581` assigns both **956b20** and **956b30**:
   
   > “compete and a prize had been offered, they would have no one”
   
   That phrase occurs once in Book 30. The Greek distinguishes the locations:
   
   - **956b20:** “τας ἀγωνίζεσθαι καὶ ἆθλον προὐτέτακτο…”
   - **956b30:** “ἐστιν. ἔτι δὲ δεῖ τῆς ἀγωνίας τὸ ἆθλον κρεῖττον εἶναι…”
   
   The 956b30 anchor wrongly reuses the earlier phrase.

7. **Should-fix — the English contains added words or spellings supported by neither witness at that place.**
   
   - **3.28**, `book-03.html:117`: ours “which is **a** pleasanter”; both witnesses “which is pleasanter.”
   - **23.40**, `book-23.html:165`: ours “garments **oF For** water”; both witnesses “garments? **For** water.”
   - **26.30**, `book-26.html:125`: ours “early **mornSing**”; both witnesses “early **morning**.”

8. **Should-fix — quote stripping removes a real possessive apostrophe.**  
   [build_prob_forster.py:854](pipeline/tools/build_prob_forster.py#L854), **23.40**, `book-23.html:165`:
   
   - Both witnesses: “Hence **animals’ hoofs** have this effect”
   - Ours: “Hence **animals hoofs** have this effect”
   
   `postprocess` treats a trailing apostrophe as a closing quotation mark and drops it when no opening quote remains.

9. **Should-fix — the Greek skip accepts a damaged fragment as a numeral.**  
   [stage3_tokenize.py:49](pipeline/aristotle_pipeline/stage3_tokenize.py#L49) skips any token containing a numeral mark. In `tlg0086003.xml:2763`, the line reads:
   
   > “ἐστὶ **φ[αʹ** .............]σο..[..]ασιν· ὅταν”
   
   The requested edge stripping leaves `φ[αʹ`; stage 3’s inner-siglum removal makes it `φαʹ`. Either form skips silently. This is not a standalone numeral or reference part and should remain visible in `key_failures`. **I found no intact Greek word swallowed elsewhere in the scanned corpus.**

Checks completed: all **56 XML files, 118,387 `<l>` lines**, all **38 manifest extras**, the **37 chapter divisions affected by `skip`**, **38 English books / 889 Parts / 109,875 word tokens**, both raw witnesses (**136,483 / 139,809 tokens**), and **1,445 anchors**. No manifest coordinate mismatches found. Every anchor phrase occurs in its assigned book; entries follow Bekker order. The duplicate pair above is the only identical-phrase collision. Both texts survive each MERGE: Book 3’s 25/25a in Part 25, and Book 19’s 35a/35b in Part 35. I ran the independent comparison with `python3 -B` and standard-library code, without importing the builder’s cleaning rules. I changed no files and ran neither the pipeline nor `uv`.

<details>
<summary>Complete skipped-token inventory, grouped by count</summary>

`Nx` means each listed token occurs N times. Ranges include every integer token between their endpoints. These six files contain **3,412 skipped occurrences**; the other **50 files contain none**.

```text
tlg0086003.xml — 44 occurrences
1x: αʹ, φ[αʹ
2x: νʹ
3x: βʹ, γʹ, λʹ, φʹ, ϛʹ
5x: θʹ
6x: δʹ, ιʹ
8x: εʹ

tlg0086036.xml — 12 occurrences
1x: 4, 23, 941b, p, Ιϛ, Κϛ, Λϛ, βʹ, γʹ, δʹ, εʹ, ϛ

tlg0086048.xml — 101 occurrences
1x: 33–69
2x: 1–32

tlg0086051.xml — 3,100 occurrences
1x: 79,92,97,99,102,105,107,109–110,112–113,117,119–120,
122,124,133–134,139,141,145,148,151,154–157,159,163,170,
173,181,185–186,192,196–197,199–200,203,207–208,212,214,
219,221–225,231,240–242,244,247–248,252,254,263,266,268,
270–271,273–276,285,288,290–293,296–299,302–303,307–308,
313,318–319,325,327,332–334,336–339,341–342,353,358–361,
367,372,375,380,385,388,390–391,396–398,400,402,409,
414–416,419–420,422,425,429,441,444,452,455–457,464–466,
468,471,473,489–491,494,503–504,508,512,519,521,531–534,
538,541,543,547,553,557–558,568–569,573,581,584,601,608,
615,617,622–623,632–633,636,639,644,647,649,654–655,
660–661,665–667,674–675,679,688,693,696,699,706,710–711,
717–718,731,770,775,778,783,789–790,799,815,823,834,837,
901,905,911,917,922,925,946,983,988,991,998,1004–1005,
1031,1080,1094,1124,1150,1155,1177,1221,1242,1277,1283,
1310,1340,1342,1354,1365,1375,1379,1403,1408,1412,1419,
1421,1436,1463,1482,1499,1518,1526,1532,1534,1537,1566,
1574,1657,1682,1693,1706,1746,1796,1821,1824,1827,1842,
1853–1854,1861,1863–1864,1867,1870,1877,1881–1882,1884,
1900,1903,1939,1973,1977,2064,2403,2421,2506,2726,
1a,7a,14a,18a,21a–22a,27a,62a,65a,70a,78a,109a,131a,
133a–134a,263a,277a,287a,
6b,11b,13b,16b,21b,30b–33b,47b,50b,88b,90b,169b,172b,
175b,247b,254b,276b,279b,289b,293b,319b,326b,334b,378b,
409b,441b–442b,444b,491b–492b,497b,505b,521b,533b,540b,
543b,592b,612b,746b,767b,772b–774b,812b,927b,942b,987b,
1004b,1087b,1093b,1405b,1408b,1411b,ιϛ,ϛ·

2x: 69,76,78,80,82,84–85,89–91,96,101,104,114–116,128,
131,135,137,140,142,146–147,164,167–169,171,175,180,183,
191,193,198,213,233,235–236,243,245–246,249,251,261,269,
280,283,289,300,305–306,312,315,320–321,323,330,335,347,
349,352,355,362–363,368,371,374,376,387,404,408,410,424,
432,440,442–443,449,469,476,479,481,487–488,492,502,549,
551,576,578,583,590,598,613,631,634,638,684,722,741,786,
1513,1551,1852,1876,1880,1883,1885,276a,
2b,9b,25b,36b,86b,132b–133b,381b,584b,605b,990b,1410b

3x: 67–68,72–75,77,86,93,95,98,103,106,111,127,136,144,
150,153,165,174,188,206,216,226,229,239,250,258,281–282,
295,311,322,326,350,356,366,370,373,427,446,453–454,459,
497,670,672,997,1535,3a,3b,8b,24b,26b,35b,83b,104b,618b

4x: 43–44,50,70–71,108,118,126,130,143,152,194,218,234,
264,277–278,345,505,1527,1866,λϛ
5x: 45,51,58,64–66,83,129,257,369,395,436,585,1545,ϛ
6x: 52,55,57,59,132,279
7x: 34,41,48–49,53,56,62,87,161
8x: 54,60,88,310
9x: 24,35–36,40,42,61
10x: 39,46–47,63
11x: 21,23
12x: 29
13x: 31,33
14x: 38
15x: 27,30,32
16x: 37
17x: 25
18x: 26
20x: 18
22x: 28
24x: 22
26x: 16,19
28x: 11
30x: 14,17,20
31x: 15
32x: 10,12
38x: 13
53x: 7
56x: 6
58x: 9
64x: 5
65x: 4
88x: 3,8
92x: 1
103x: 2
727x: p

tlg0086055.xml — 25 occurrences
1x: 4–5,8,15,17,22,35,79,87,121,155,249,441,477,673
2x: 1,10,12,124,p

tlg0086056.xml — 30 occurrences
1x: 3–4,6–7,9–12,16,18,37,42,53,64,91,349
2x: 8,p
3x: 1,5
4x: 2
```

</details>

Codex session ID: 01a1b1a3-7898-7282-b141-11735639a4af
Resume in Codex: codex resume 01a1b1a3-7898-7282-b141-11735639a4af
