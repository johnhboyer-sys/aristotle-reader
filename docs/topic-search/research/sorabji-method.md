# How Sorabji gathered his passages on necessity

Source: Richard Sorabji, *Necessity, Cause, and Blame* (Cornell 1980), read from the text layer of the PDF in `~/Documents/Papers Library/Sorabji/`. Check: Gail Fine's review, *Philosophical Review* 90 (1981) 561–579.

## What I could and could not read

- **There is no index locorum.** The book has a subject-and-name index (pp. 312–326) and nothing else; Fine's review (§XI) confirms this. So I built one: a script pulled every Bekker number from the text layer (pp. ix–298, footnotes included), resolved each to work, book and chapter through `build/dist/bekker.json` and each work's `chapters.json`, and also parsed chapter-only citations such as "Phys. II 9". Script and output are in the scratch dir (`cites.py`, `chapcites.py`, `agg.py`, `bekker_cites.json`, `agg.json`) and are not in the repo.
- Result: 1,326 Bekker citations (863 distinct line references) and 654 chapter-only citations, on about 345 distinct Aristotle chapters in 24 works.
- **OCR noise**, which means the counts are close but not exact:
  - Roman numerals are often misread: `n`, `u` or `11` for II, `m` or `111` for III, `vn` for VII, `vm` for VIII. I mapped the common forms. A few cites will have landed in the wrong book; "EE I 1" with no Bekker lines is one such artefact.
  - `~` stands in for lost characters (`1027a2~30`) and `&` for `a` (`1025&23`). Ranges with `~` were counted at the start column only.
  - *Magna Moralia* and *Problemata* are not in the repo's Bekker map, so their few cites (MM 1188b, 1195a) were dropped.
- **What I read in full:** Introduction; ch. 9 (pp. 143–154); the ch. 13 appendix on kinds of necessity (pp. 222–224); ch. 14 pp. 227–233; ch. 15 pp. 243–247; ch. 3 pp. 51–55; the first two pages of chs. 2, 3, 5, 8, 10, 12, 13, 16 and 17; all of Fine.
- **What I did not read in full:** most of chs. 1–8, 10–13 and 16–18. For those chapters the locus table rests on the citation counts and on the sub-ranges Sorabji cites. It does not rest on a close reading of his argument.
- Every Bekker range in the table below is one the book itself cites (I checked each against the extracted raw strings, and many in context). Chapter bounds come from the repo's `chapters.json`.

---

## 1. How did he find his passages?

### 1a. Terms tracked

Sorabji avoids Greek on purpose (Introduction, p. xiv). He tracks concepts in English and drops in a transliteration only at the decisive word. Counts of the transliterations in the body text are tiny: *ananke* 9, *tuche* 18, *eph' hemin* / *ep' autoi* 7, *hekousion* / *akousion* 10, *prohairesis* 14, *bia* 16, *arche* 22, *aitia* / *aition* 26, *dunamis* 79 (61 of them in ch. 10). Against these, English "necess-" occurs 1,658 times, "voluntar-" 331, "possib-" 330, "for the most part" 25 and "hypothetical necessity" 28.

Your list is right as a list of concepts. As a list of what he searches *lexically*, it is wrong. Corrections:

| Your term | Status in the book |
|---|---|
| ἀνάγκη, ἐξ ἀνάγκης, ἀναγκαῖον | Central, but tracked in English. He names the Greek only where it decides a case: *ananke* at Metaph. IX 5, 1048a6, a14; *dei* at APo II 16, 98b36–8. |
| ἐνδέχεσθαι, ἀδύνατον | Almost never named (once each). The modal syllogistic, where these words thicken, gets little space (see §5). |
| ὑποθετικὴ ἀνάγκη / ἐξ ὑποθέσεως | Only as "hypothetical necessity", 27 of 28 uses in ch. 9. |
| ἀεί / ὡς ἐπὶ τὸ πολύ | Tracked as "always" / "for the most part" (chs. 1, 3, 8, 9): the always=necessary equation (Cael I 12, GC II 11) and the claim that efficient causes can explain what holds only for the most part (Metaph. V 30, VI 2; Poet. 10, *eikos*). |
| ἀπὸ ταὐτομάτου, τύχη | Yes: *apo tuches*, *apo tou automatou*, *sunebe*, *apo sumptomaton* (Phys. II 8, 198b27–199a5). Mostly through κατὰ συμβεβηκός, 130 uses of "accident" in ch. 1 alone. |
| ἐφ' ἡμῖν, ἑκούσιον | Yes, chs. 14–17, with ἀρχὴ ἐν ἡμῖν. |

Terms he tracks that your list lacks:

- **δύναμις**: capacities that act of necessity "if nothing prevents" (Metaph. IX 5, 7; Phys. VIII 4; ch. 3 pp. 52–3).
- **ἀρχή**: he collects its uses for non-first links in a chain (EN VI 2, 1139a31–3; DA III 9; MA 1).
- **αἴτιον / διότι / διά**: cause as explanation.
- **βία**: the necessity of force, as against threats (EN III 1).
- **προαίρεσις, βούλευσις**: "we do not deliberate about what is necessary".
- **καθ' αὑτό, τί ἐστι**: necessity of essence, chs. 12–13.
- **εἰκός**: Poet. 10.
- **μέλλει vs ἔσται**: GC II 11, 337b3–7.
- **ἤδη**: the "yet" of Int. 9, 19a39.
- **κυρίως**: Phys. VIII 6, 259b7.
- **ἐπιείκεια, ἁμάρτημα, πρόνοια**: chs. 16–18, which belong to blame rather than necessity.

### 1b. Anchor texts, then outward

He does work outward from anchors, and the chapter titles name them:

- ch. 1: Metaph. VI 3
- ch. 5: Int. 9
- ch. 8: Int. 9, Cael. I 12, GC II 11, Metaph. IX
- ch. 9: GC II 11, PA I 1, Phys. II 9
- ch. 14: Int. 9, Phys. VIII, NE III 1–5

He reaches further passages from an anchor in five ways (each is a step in §4):

1. **Doublets and parallels.** Metaph. VI 2–3 is read with XI 8 and V 30. The EE II 6–10, NE III 1–5, NE V 8 and NE VII 3/10 treatments of voluntariness are laid side by side to track how Aristotle's view changed (ch. 17).
2. **Neighbouring chapters.** Ch. 9 notes that passages affirming necessity sit right next to those that deny it: Phys. II 7–8 before II 9, APo II 11 before II 12, the end of PA I 1.
3. **Denials against affirmations.** Ch. 9 is built as a list of passages where Aristotle denies necessity in nature, then a list where he affirms it, then attempts to reconcile them. Tension is the selection principle.
4. **One claim, every instance.** For a recurring claim he gathers all its occurrences in one footnote. "We do not deliberate about what is necessary" gets EN III 3, VI 1, VI 2, VI 5, VI 7, EE II 10 and Rhet. I 2 (p. 245). The irrevocability of the past gets Cael. I 12, 283b12–14; EN VI 2, 1139b7–9; Rhet. III 17, 1418a3–5; Metaph. VI 3; XI 8; Int. 9, 19a23–4 (p. 223 n. 43).
5. **A problem pulls in passages without the word.** The causal determinist's case pulls in Phys. II 3 (four causes) and APo I 13, II 16 (explanation). Responsibility pulls in EN III 5's argument on character and Phys. VIII's self-movers, where ἀνάγκη is not the issue.

### 1c. Prior scholarship as finding aid

This is heavy and open:

- **Ross** (49 mentions): his "fresh starts" claim about Int. 9, GC II 11 and NE III 5 sets the agenda of chs. 2, 9 and 14.
- **Hintikka** (82): his list of natural-tendency passages (Metaph. IX 5, 7; Phys. VIII 4; Long. 3; MA 4, 8; GA II 4; Rhet. II 19) is cited as such (p. 52 n. 28). Sorabji credits him with "drawing attention to suggestive interconnexions between widely scattered texts" (p. 128).
- **Balme** (25): his "sizeable collection" of ἐξ ἀνάγκης cases in the biology supplies the long footnote lists on pp. 149–150 (GA 788b9–789a4, 766a16–30, 743a36–b18, 776a15–777a3; PA 642a31–b4, 663b14, 677b21–36, and more).
- **Anscombe** (Metaph. IX 5), **Kirwan** (Metaph. V 30, VI 2), **Brody** (APo I 6, I 13) and **Furley** (Phys. VIII, NE III 5) each hand him a passage plus a reading to test.
- **Ancient commentators and successors:** Alexander *De Fato* (89 mentions); Boethius (34), Ammonius (17) and Simplicius (15) on Int. 9; Philoponus on GC 337b22 and Phys. 198b5–6; Michael of Ephesus on PA 640a4. They serve mainly to date rival readings ("as old as" the traditional one), and only now and then to find passages.
- Bonitz's *Index Aristotelicus* is named once, for an emendation, never as a search tool. If he used it, he did not say so.

### 1d. Central vs. peripheral

From what I read, a passage becomes central when one or more of these hold:

- (a) It is the **only** place making a claim. Metaph. VI 3 is "the one passage" where every effect is said to be necessitated (p. 52).
- (b) It **names the kind** of necessity. PA I 1, 642a31–b4 and APo II 11, 94b27–95a3 are singled out because they "specify the kind" (p. 150).
- (c) A **named interpreter** builds a thesis on it, so he must answer it: Ross on GC II 11, Furley on NE III 5, Hintikka on Cael. I 12.
- (d) It **conflicts** with another passage.

A passage stays peripheral when it is one more instance of a pattern already shown (the biology lists), or when its speaker is not Aristotle. He declines Phys. II 8, 198b1?–21 (OCR damaged) because the rain "of necessity" there is probably the opponents' view. He sets aside Rhet. II 19, 1392b19–20 as advice on special pleading.

---

## 2. What the passage set looks like

**Size.** About 345 Aristotle chapters are cited at least once; a few are OCR artefacts, so call it 300–340. There are 863 distinct line references.

How many book pages cite each Aristotle chapter:

| Pages citing it | Number of Aristotle chapters |
|---|---|
| 1 page | 170 |
| 2–4 pages | 112 |
| 5–9 pages | 39 |
| 10 or more pages | 24 |

**By work** (chapters cited / book pages citing the work / chapters cited on 5+ pages):

| Work | Chapters | Pages | 5+ pages |
|---|---|---|---|
| EN | 59 | 68 | 13 |
| Metaph. | 43 | 83 | 9 |
| APo | 34 | 55 | 12 |
| Phys. | 24 | 64 | 8 |
| GA | 23 | 29 | 4 |
| Rhet. | 17 | 20 | 3 |
| Pol. | 17 | 8 | 0 |
| APr | 16 | 17 | 0 |
| PA | 14 | 38 | 4 |
| DA | 14 | 18 | 1 |
| Top. | 14 | 14 | 1 |
| EE | 13 | 35 | 4 |
| Meteor. | 12 | 9 | 0 |
| GC | 10 | 29 | 1 |
| MA | 7 | 8 | 0 |
| Int. | 6 | 36 | 1 |
| Cael. | 4 | 14 | 1 |
| Poet. | 4 | 7 | 0 |
| Cat. | 4 | 8 | 0 |

HA, SE, Sens., Mem. and Long. get passing mention.

**Spread across the book.** Each part of the book has its own small set of anchors. In ch. 3 the anchors are almost all APo (II 11, I 2, II 16, I 6). In ch. 10 they are almost all PA and GA. Chs. 16–18 rest on EN III 1, V 8 and EE II 8–9. Only Int. 9 and Metaph. VI 3 run through the whole book (cited in 10 and 11 of his 18 chapters).

### Locus table

Checked row by row against the book by Codex (GPT-6.1-Sol), 2026-11-05: `sorabji-table-check-codex.md`. Its six defects are fixed below (rows 1, 2, 9, 27, 39, 49).

How to read it:

- **Pages** = distinct book pages citing that Aristotle chapter, so it measures how wide the treatment is (a proxy, not exact).
- **S. ch.** = Sorabji's chapters, main ones first; ★ = the locus is named in a chapter title.
- **Bucket** = your 1–4; "B" = about blame, not necessity.
- **Locus** gives the range Sorabji cites. Where he works through the whole chapter, it gives the chapter bounds from the repo.

| # | Locus | S. ch. | Pages | Bucket | Reason |
|---|---|---|---|---|---|
| 1 | Metaph. VI 3, 1027a29–b16 (cites a29–32, b1–14) | 1★, 3, 6, 9, 14, 15 | 34 | 1 | Takes it as obvious that not all things are of necessity; Sorabji argues from this that some causal chains stop short of the present (printed pp. 7–8). *Corrected after Codex check.* |
| 2 | Metaph. VI 2, 1026b22–1027a28 (b22–4, 1027a7–8, a19–26) | 1, 3, 8 | 16 | 2 | About accidental being; defines it as neither always nor for the most part. Uses the necessity/for-the-most-part split to fix Y. |
| 3 | Metaph. XI 8, 1064b33–1065a21 (1065a6–8, a14–21) | 1 | 9 | 1 | Doublet of VI 2–3; the chain argument against everything being necessary in short form. |
| 4 | Metaph. V 30, 1025a14–34 (a21–33) | 1, 3 | 8 | 2 | Dictionary entry on accident: "neither of necessity nor for the most part". |
| 5 | Int. 9, 18a28–19b4 (18b26–19a22; 19a22–b4; 19a23–4) | 5★, 8★, 6, 14★, 15 | 32 | 1 | The sea battle: whether future events are necessary because predictions are already true. 19a23–4 is the necessity of what is, when it is. |
| 6 | Cael. I 12, 281a28–283b22 (281b3–25; 283b12–14) | 8★, 13, 1 | 14 | 1 | Proof that what always is, is necessary and cannot perish; the past cannot be undone. |
| 7 | GC II 11, 337a34–338b19 (337b3–7; 337b35–338a3; 338a4–b19) | 8★, 9★ | 19 | 1 | Asks whether any coming to be is necessary; equates "always" with "necessary"; only cycles qualify. |
| 8 | GC II 10, 336a15–337a33 (336a26–9; 337a7–15) | 9, 3 | 3 | 4 | Sun's approach and retreat drives generation; "one cause, one effect" is assumed, not argued. |
| 9 | Phys. II 9, 199b34–200b8 (200a1–32) | 9★, 3 | 13 | 1 | In natural coming to be, the necessity is hypothetical (Sorabji allows other kinds elsewhere, printed pp. 145–146; corrected after Codex check); the matter needed for an end. |
| 10 | PA I 1, 639b21–640a9 and 642a1–b4 | 9★, 10 | 24 | 1 | States the kinds of necessity outright: unqualified vs hypothetical, force vs natural; respiration's necessity (642a31–b4). |
| 11 | PA I 1, 640a10–641a17 (640a33–b4) | 10, 9 | (same) | 3 | Explanation by final cause vs by stages of growth or matter; necessity is the rival mode. |
| 12 | APo II 11, 94b27–95a3 | 3, 9 | 23 | 1 | Many things come about both of necessity and for something; natural vs forced necessity. |
| 13 | APo II 11, 94a20–36 | 2, 3 | (same) | 2 | Four causes in demonstration; premises necessitate the conclusion, as material cause. |
| 14 | APo II 12, 95a10–96a19 (95a14–b1; 96a8–19) | 9, 3 | 9 | 2 | Inference between earlier and later events; always vs for the most part, in service of demonstration. |
| 15 | APo II 16, 98a35–98b38 (98b4–24; 98b36–8) | 3, 2 | 11 | 2 | Cause and effect must hold together; leaf-fall necessitated (*dei*) by sap setting. |
| 16 | APo II 8, 93a1–93b20 (93a20–33; 93b7–14) | 12, 3 | 9 | 4 | Seeking a definition (thunder); necessity of the quenching-noise link used as a premise, not discussed. |
| 17 | APo II 10, 93b29–94a19 (93b29–94a5) | 12 | 6 | 4 | Kinds of definition; necessity of the definition taken for granted. |
| 18 | APo I 2, 71b9–72b4 (71b9–16; 71b29–72a5) | 3, 12, 13 | 14 | 2 | Knowledge is of what cannot be otherwise; the chapter is about premises of demonstration. |
| 19 | APo I 4, 73a21–74a3 (73a34–b24) | 12, 13, 3 | 14 | 1 | What belongs *kath' hauto* belongs of necessity; necessity of essential predication. |
| 20 | APo I 6, 74b5–75a37 (74b5–12; 74b26–32; 75a28–37) | 3, 13, 12 | 14 | 1 | Demonstration is from necessary premises; essential links ground necessity. |
| 21 | APo I 8, 75b21–36 (75b33–6) | 1, 9 | 6 | 2 | Eternal demonstrations; intermittent kinds such as eclipse recur of necessity. |
| 22 | APo I 13, 78a22–79a16 (78a26–b4; 78b28–32) | 3, 2 | 7 | 3 | Fact vs reasoned fact; a valid deduction from universals need not explain (explanation vs necessitation). |
| 23 | Phys. II 3, 194b16–195b30 (194b18–195a20; 195b21–5) | 2, 12, 10 | 13 | 3 | Four causes; cause as explanation, the problem Sorabji sets against necessitation. |
| 24 | Phys. II 4, 195b36–196a24 | 1, 11, 15 | 5 | 3 | Predecessors who denied chance because everything has a cause: chance vs necessity. |
| 25 | Phys. II 5, 196b10–197a35 (196b10–17; 197a12–21) | 1, 15 | 12 | 3 | Chance as accidental cause outside "always or for the most part". |
| 26 | Phys. II 6, 198a2–13 | 1, 9 | 3 | 3 | Chance and spontaneity are posterior to nature and mind. |
| 27 | Phys. II 7, 198b5–9 | 3, 9 | 7 | 2 | "Necessary that this comes from this", in the account of the four causes. |
| 28 | Phys. II 8, 198b10–199a8 and 199b15–26 | 9, 11, 10 | 16 | 2 | Whether nature acts for an end; Empedocles' teeth; rain "of necessity" (opponent's voice); seeds develop "if nothing prevents". |
| 29 | GA V 8, 789b2–20 | 9, 10, 3 | 12 | 3 | Material causes necessitate but do not explain where an end is available (final vs material cause). |
| 30 | GA V 8, 788b9–789a4 | 9, 10 | (same) | 4 | Teeth grow and are shed of necessity; necessity used as a mode of explanation, not examined. |
| 31 | GA II 1, 734b9–735a4 | 10, 3 | 6 | 4 | Formation by what is already actual; dunamis needed at the start, assumed. |
| 32 | GA II 4, 738a33–b9; 739b26–30; 740b21–741a3 | 10, 9 | 8 | 4 | Embryo: matter flows and sets of necessity; applied, not discussed. |
| 33 | GA II 6, 742b17–743a1; 743a36–b18 | 10 | 7 | 4 | Parts harden or soften of necessity in growth. |
| 34 | GA IV 8, 776a15–777a3 | 10, 9 | 4 | 4 | Milk forms of necessity. |
| 35 | PA IV 2, 676b16–677a19 (677a17) | 1, 3, 9 | 7 | 4 | Bile as a necessary by-product of the liver; "when one holds, the other must" is assumed. |
| 36 | PA III 2, 663a1–6; 663b14–35 | 10, 9 | 6 | 4 | Horns shed both of necessity and for a purpose. |
| 37 | PA III 7, 670a30–b23 | 10, 1 | 6 | 4 | Spleen occurs of necessity, as counterpart of the liver. |
| 38 | PA II 2, 648a36–649a24 | 13, 12 | 4 | 3 | Blood hot in itself vs accidentally: essential vs accidental property. |
| 39 | DA II 4, 415a14–22; 416a9–18 | 10, 9 | 6 | 3 | Fire is not the cause of growth, soul is (final vs material cause). |
| 40 | Metaph. I 3, 983a25–b3; 984a16–b22 | 12, 9 | 5 | 3 | Predecessors relied on the material cause, which cannot explain. |
| 41 | GC II 6, 333b4–22 | 1, 9, 10 | 4 | 3 | Empedocles' chance and necessity attacked; no account of the end. |
| 42 | Metaph. V 5, 1015a20–b15 (1015a26–34; b9–15) | 1, 9, 13 | 5 | 1 | Aristotle's own list of the senses of "necessary". |
| 43 | Metaph. XII 7, 1072b11–13 | 13, 10 | 5 | 2 | Senses of necessity listed in the course of the prime mover's account. |
| 44 | Metaph. IX 3, 1046b29–1047a29 | 8★ | 4 | 3 | The Megarians on possibility: a deterministic account of the possible. |
| 45 | Metaph. IX 4, 1047b3–16 | 8 | 3 | 3 | Definition of the possible; impossible consequences. |
| 46 | Metaph. IX 5, 1047b35–1048a21 | 9, 3, 14 | 8 | 2 | Capacities: rational ones act of necessity (*ananke* 1048a6, a14) given desire and conditions. |
| 47 | Metaph. IX 7, 1048b37–1049a18 | 3, 8 | 4 | 2 | When a thing is potentially X; seeds and earth. |
| 48 | Metaph. IX 8, 1050b6–30 | 8, 9 | 4 | 2 | Priority of actuality; eternal things necessary; sun cannot stop. |
| 49 | Metaph. VII 15, 1039b27–1040a7 | 13, 9 | 5 | 2 | No definition or demonstration of perishable particulars; necessary vs contingent objects of knowledge. |
| 50 | APr I 13, 32a18–20; 32b4–13 | 8, 3, 13 | 4 | 1 | The contingent defined; "for the most part" vs indeterminate. |
| 51 | APr I 10, 30b31–40 | 1, 13 | 2 | 1 | Conclusion necessary given the premises, not unqualifiedly (relative necessity). Brief in S, but Fine leans on it. |
| 52 | SE 4, 166a23–31 | 12, 1, 13 | 6 | 2 | Fallacy of composition and division, with the modal example of walking while sitting (de re vs de dicto). |
| 53 | Phys. VIII 4, 255a30–b31 | 9, 3, 8 | 5 | 4 | Natural tendencies act "if nothing prevents"; applied to motion. |
| 54 | Phys. VIII 2, 253a7–21; VIII 5–6, 258a1–2, 258b12–32, 259b1–20 | 14★ | 2–3 each | 3 | Animals as self-movers: whether action is a "fresh start" (free will). |
| 55 | MA 7–9, 701a16; 702a10–17; 702b24 | 14, 9 | 4 + 3 | 2 | Physiology of animal motion; movement follows of necessity. |
| 56 | Poet. 7–10, 1450b27–1451a12; 1452a18–21 | 3, 14 | 4 | 4 | Plot events must follow "of necessity or likelihood"; a standard applied, not examined. |
| 57 | Rhet. I 10, 1368b35–1369b32 | 13, 9 | 5 | 2 | Seven causes of action; force and nature told apart in a list built for forensic use. |
| 58 | Rhet. III 17, 1418a3–5 | 13, 6 | 3 | 4 | The past is necessary, assumed in advice on rhetorical proof. |
| 59 | Rhet. I 2, 1357a8–34 | 3, 14, 15 | 6 | 2 | We deliberate about what can be otherwise; probable vs necessary premises in rhetoric. |
| 60 | EN III 1, 1109b30–1111b3 (1109b35–1110a3; 1110a4–b9; 1110b18–1111a24) | 16, 14★, 17 | 25 | 3 | Voluntary vs involuntary; force (*bia*) and acts done under threat, which Aristotle calls necessitated (1110a26–b1). |
| 61 | EN III 3, 1112a18–1113a14 (1112a21–31) | 14, 15 | 4 | 2 | Deliberation excludes the necessary and the eternal. |
| 62 | EN III 5, 1113b3–1115a5 (1113b7–30; 1114a4–31; 1114b3–25) | 14★, 15, 16, 17 | 29 | 3 | What is up to us; praise and blame; whether character is fixed. The free-will problem without the word. |
| 63 | EN VI 2, 1138b35–1139b13 (1139a31–b9) | 14, 18, 13 | 11 | 2 | Choice as origin; no deliberation about the past, which cannot be undone (1139b7–9). |
| 64 | EE II 6, 1222b15–1223a20 (1222b22–1223a10) | 14, 15 | 5 | 2 | Man as origin; analogy with necessity flowing from mathematical principles. |
| 65 | EE II 8, 1223b37–1225a33 (1224b26–36; 1225a2–33) | 16, 17 | 9 | 2 | Force vs compulsion; what is done "of necessity" under threat or by nature. |
| 66 | EE II 10, 1225b17–1227b11 (1226a20–30; 1226b30–6) | 14, 15, 18 | 11 | 2 | No deliberation about what is necessary; the one hedge, at 1226a26. |
| 67 | EN VII 3, 1146b31–1147b19 (1147a11–31) | 17, 14 | 7 | 2 | Akrasia; given the premises one must act at once "if nothing prevents" (1147a27–31). |
| 68 | EN VII 7–8, 1150a20–b22; 1151a13–20 | 14, 16, 17 | 10 + 7 | 3 | Weakness vs self-indulgence; fixed vs curable character. |
| 69 | EN X 9, 1179b4–1180a5 | 16, 14, 18 | 10 | 3 | Nature, habit and teaching; the law's compulsion. |
| 70 | EE II 9, 1225a34–1225b16 | 17, 16 | 13 | B | Voluntary defined via knowledge; negligence. |
| 71 | EN V 8, 1135a15–1136a9 | 17, 18, 16 | 26 | B | Classes of wrong (mistake, misfortune, injustice). Necessity enters only in the aside on natural processes (1135a33–b2). |
| 72 | Rhet. I 13, 1374a27–b10 | 17, 18, 16 | 6 | B | Equity and the grades of wrongdoing. |

That is **72 rows on 69 distinct passages**:

- 69 rows tagged with your buckets 1–4.
- Rows 10/11, 12/13 and 29/30 split one Aristotle chapter between two buckets.
- 3 rows (70–72) are "B", about blame not necessity; they are kept because Sorabji gives them so much space.

Bucket counts, out of the 69 tagged rows:

| Bucket | Rows |
|---|---|
| 1 | 13 |
| 2 | 24 |
| 3 | 18 |
| 4 | 14 |

Left out on purpose, as passing only (1–3 pages):

- Metaph. V 12, Int. 12–13, EN VI 3, EN VI 5 and EN VII 10.
- Phys. VIII 1.
- APo II 2, II 17 and I 22–24.
- Top. VI 4, Cat. 10 and 12.
- Pol. VII 13 and VII 15.

---

## 3. Where the four buckets fit or fail

**Fit.** Each of Sorabji's five Parts is one neighbouring problem: cause, time and truth, purpose, essence, blame. Inside each Part he finds the bucket-1 passages for that problem (Metaph. VI 3; Int. 9; Phys. II 9 with GC II 11 and PA I 1; APo I 4 and I 6; EN III 3 and III 5), then brings in bucket-2 and bucket-3 texts around them. So bucket 3 is his top-level axis, and bucket 1 is his centre within each Part. Your buckets describe his passages well. They do not describe his *order*: he sorts by problem first, and your buckets sort by closeness to X.

**Fail, or blur:**

1. **2 vs 4 is hard to call** in the biology. "Horns are shed of necessity and for a purpose" uses necessity as a mode of explanation without discussing it. That is bucket 4 by your definition, yet Sorabji treats these lines as evidence *about* what Aristotle thought necessity was. A passage moves from 4 toward 2 when a reader puts it to work in the argument about X. Your buckets classify the passage alone; his relevance depends on what question is put to it.
2. **Kind of necessity** is a second axis the buckets lack. His appendix (pp. 222–4) lists ten kinds:
   - (i) essential (blood hot in itself);
   - (ii) composite vs divided, i.e. de dicto vs de re;
   - (iii) relative necessity of a conclusion;
   - (iv) hypothetical necessity;
   - (v) the irrevocable past and present;
   - (vi) natural necessity;
   - (vii) necessity against nature (force);
   - (viii) the necessity of what always is;
   - (ix) necessity of essential predication;
   - (x) necessity under threat.

   Many of his moves are "this passage concerns kind (iv), not kind (vi)". A topic tool for necessity needs a kind tag on every bucket-1 and bucket-2 locus.
3. **Stance** (affirms / denies / defines / reports) is a third axis. Ch. 9 is built on pairs of denials against affirmations. The buckets cannot show a **tension pair**: two loci that matter *because* they conflict.
4. **Doublets and development.** Metaph. VI 2–3 against XI 8; EE II 6–10 against NE III 1–5 and NE V 8. A locus can matter as a variant of another, which is neither "about X" nor "a nearby problem".
5. **Relevance by reception.** Phys. VIII's self-movers and the end of NE III 5 are in the set because Ross, Furley and Hardie read "fresh starts" into them. Sorabji then argues they are *not* about breaks in causation. Some loci are included in order to be ruled out, and a curated list should say so.
6. **Lexical evidence.** He collects places only to fix a word's range: ἀρχή used of non-first members; μέλλει vs ἔσται; κυρίως. These belong in a "word-sense evidence" bucket, not 1–4.
7. **Speaker.** He excludes Phys. II 8, 198b1?–21 (OCR damaged) because the necessity there is the opponents'. The buckets need a voice tag: Aristotle, opponent, *endoxa*.
8. **Argument from silence.** He counts as evidence that Int. 9 and GC II 11 *omit* causal necessitation (pp. 144, 146). Fine (§VII) objects that silence is not denial. A machine should never score absence as a finding.
9. **Outside Aristotle.** Diodorus, the Stoics, Alexander, Boethius and modern authors fill chs. 4, 6 and 7. None of your buckets is meant to hold them; I note it only as a reason those chapters cite few Aristotle loci.

---

## 4. His method as machine steps

The corpus here already has the needed parts: a lemma index (`build/dist/lemmata`, `lemma-map`), n-grams (`build/dist/ngrams`), chapter bounds and a Bekker map. Bonitz's *Index Aristotelicus* (in `~/Developer/bonitz-text`) groups uses of ἀνάγκη by sense.

1. **Seed by lemma.**
   - Pull every chapter with core lemmas: ἀνάγκη, ἀναγκαῖος, ἀναγκάζω, δεῖ (modal use), ἐνδέχομαι, δυνατός / ἀδύνατος, δύναμις, ἀεί + ὡς ἐπὶ τὸ πολύ, ἐξ ὑποθέσεως, ἁπλῶς, βία / βίαιος.
   - Needs: lemma index.
   - Fails: ἀνάγκη floods APr and APo through the logical "necessarily follows". δεῖ is mostly "one must" (advice). Raw counts point at the Analytics and miss Metaph. VI 3, which is short.
   - Fix: filter "syllogistic necessity" by context ("the conclusion", term letters) and normalise by chapter length.
2. **Rank anchors.**
   - Score chapters by density of core lemmas *and* by co-occurrence with a second family: causal (αἴτιον, ἀρχή, ἕνεκα), temporal (ἔσται, μέλλει, γενόμενον) or voluntary (ἑκούσιον, ἐφ' ἡμῖν, προαιρέσις, βουλεύομαι). Take the top 10–15 as anchor candidates.
   - Check them against Int. 9, Metaph. VI 3, GC II 11, Phys. II 9, PA I 1, Cael. I 12, APo II 11, Metaph. V 5.
   - Needs: lemma index, chapter bounds.
   - Fails: Int. 12–13 and the APr modal chapters will rank high though Sorabji barely uses them. That is a fact about his bias, not a scoring error; keep them and flag them.
3. **Find doublets.**
   - For each anchor, search the whole corpus for passages with high n-gram or English-translation overlap: Metaph. VI 2–3 ↔ XI 8 ↔ V 30; Phys. II 4–6 ↔ Metaph. VI 2; EE II 6–10 ↔ EN III 1–5 ↔ EN V 8.
   - Needs: n-grams, English text, embeddings optional.
   - Fails: close paraphrase in different words is missed; common formulae give false hits.
4. **Pull in neighbours.**
   - Add the chapters before and after each anchor. Sorabji found affirmations of necessity beside the denials (Phys. II 7–8 → II 9; APo II 11 → II 12).
   - Needs: chapter order.
   - Fails: over-inclusion. Keep a neighbour only if it scores on step 1 or step 5.
5. **Expand by problem map.**
   - Use a hand-made map of problems where X is at stake. For necessity:
     - chance, spontaneity and accident (τύχη, αὐτόματον, συμβεβηκός);
     - the four causes and final vs material cause (ἕνεκα, ὕλη, τέλος);
     - capacities (δύναμις, "if nothing prevents", μηδενὸς ἐμποδίζοντος);
     - essence (καθ' αὑτό, τί ἐστι, ὁρισμός);
     - the past and future (γεγονός, ἔσται, ἀληθές);
     - deliberation and voluntariness (βουλεύομαι, ἐφ' ἡμῖν, ἑκούσιον, βία).
   - Search for chapters dense in problem terms *whether or not* ἀνάγκη occurs.
   - Needs: the problem map (judgment, made once per topic by John or an LLM and reviewed), lemma index.
   - Fails: the map *is* the thesis. A map drawn from Sorabji will find Sorabji's book, so build it from several sources.
6. **Mine collections.**
   - Import existing lists as candidates: Bonitz s.v. ἀνάγκη (by sense), Balme's biology list, Hintikka's natural-tendency list, the commentators' lemmata (CAG) on the anchors.
   - Mark each candidate with its source.
   - Needs: OCR of Bonitz (exists) and of commentators (not here).
   - Fails: inherits the selection and errors of the source. Bonitz OCR has its own known misreadings; see the bonitz repo memory.
7. **Tag the kind of necessity.**
   - For each candidate passage, an LLM pass with Greek and English assigns one or more of Sorabji's ten kinds, or "logical-syllogistic", or "advisory δεῖ".
   - Needs: Greek, translation, judgment.
   - Fails: translations hide the word ("must", "inevitably", "bound to"), so tag from the Greek. Hypothetical and natural necessity are easy to confuse. Ask for the line that decides the tag.
8. **Tag stance and speaker.**
   - Does Aristotle affirm, deny, define, distinguish, or just use X here? Who speaks: Aristotle, a named opponent, or *endoxa*?
   - Then pair passages whose stances conflict on the same kind: **tension pairs**.
   - Needs: judgment, the context paragraph either side.
   - Fails: reported opinions read as Aristotle's own (Phys. II 8, 198b1?–21 (OCR damaged)); aporetic chapters (Metaph. III) read as doctrine.
9. **Assign the bucket.**
   - Bucket 1: the passage's thesis is about X (defines it, divides it, or argues whether something is necessary).
   - Bucket 2: main topic Y, with an explicit distinction or claim about X made in passing to settle Y.
   - Bucket 3: the passage is on the problem map, and X is not explicitly treated.
   - Bucket 4: X-words used as a premise or a mode of explanation with no comment.
   - Record the reason line.
   - Needs: tags from steps 7–8, judgment.
   - Fails: 2 vs 4 in the biology (see §3.1). Allow a second bucket, and let a reviewer settle disputes, not the model.
10. **Draw locus edges.**
    - Merge adjacent paragraphs that keep the same tags into one locus; stop where density and topic drop. Snap to Bekker lines.
    - Needs: paragraph segmentation, Bekker line map.
    - Fails: argument runs across chapter breaks (GC II 10 → 11; EN III 1 → 5). Do not force chapter bounds.
11. **Weight.**
    - Score centrality from: uniqueness of claim (step 8: no other passage asserts it), kind named explicitly, number of tension links, number of independent sources from step 6.
    - Check the score against Sorabji's page counts (table above) as one external yardstick, not as truth.
    - Needs: graph of links.
    - Fails: tuning weights until they match Sorabji turns his bias into the tool's. Hold some of the yardstick out.
12. **Report the gaps.**
    - List high-scoring chapters no step kept, and kept loci with no Greek hit, and say for each why: speaker, logical use, or problem-map only.
    - The check must say how many chapters it examined.
    - Needs: nothing new.
    - Fails: a gap report that says "none" when it looked at nothing. Print the count examined.

---

## 5. Verdict

**Usable as a partial answer key for "necessity": yes, for buckets 1–3 in physics, metaphysics, biology and ethics; no as a complete list.** The 30-odd loci on 8+ pages are a good core:

- Metaph. VI 2–3 and XI 8;
- Int. 9;
- Cael. I 12;
- GC II 11;
- Phys. II 3–9;
- PA I 1;
- APo I 2, I 4, I 6, II 11–12 and II 16;
- GA V 8;
- Metaph. IX 5;
- EN III 1, III 3, III 5 and VI 2;
- EE II 8–10.

A tool that missed one of these would be missing something real.

**Biases to correct for:**

1. **Driven by a thesis.** The book argues three things: Aristotle is an indeterminist, cause and necessitation come apart, and responsibility is incompatible with necessity. Passages enter as evidence for or against that case. Fine argues each of the three can be read the other way (a compatibilist Aristotle who keeps the Metaph. VI 3 principle). A key built from Sorabji will over-weight passages on causal determinism and under-weight necessity that bears on none of it.
2. **Modal logic is thin.** Int. 12–13 (zero cites found), APr I 3 and I 8–22 (a few pages), and Metaph. V 12 (passing) get little or nothing. Fine points to Int. 13, 23a15 on the unqualified necessity of eternal things, and to APr I 10, 30b31–40. For a topic page on necessity these are bucket 1, and the key will lack them.
3. **Phys. II 4–6 gets little attention**, by Fine's account (n. 4), though Sorabji's chance argument depends on it. My counts agree: II 5 on 12 pages, mostly brief, and II 4 and II 6 on 5 and 3.
4. **Fine's other ethics loci** (EE 1225b32–37; EN III 3, 1112b27 on "possible things") barely appear. Sorabji's reading of "we do not deliberate about the necessary" may have kept these hedges at the edge.
5. **Weighted to the Posterior Analytics in Part IV.** Chs. 12–13 pull in a dozen APo chapters for the necessity of essence. That is bucket 1 for "necessity" in a logical sense, but it reflects a dialogue with Kripke and Quine, not Aristotle's own weighting.
6. **The blame chapters (16–18)** give EN V 8, EN III 1, EE II 9 and Rhet. I 13 large page counts while saying little about necessity. Do not read page count as relevance to necessity there.
7. **Leans on earlier collections** (Balme, Hintikka, Ross), so their blind spots carry over. He never cites Bonitz as a search tool. No sign of a systematic lemma search.

**How to use it:** treat Sorabji's loci as a recall check ("did the tool find these?") and his ten-kind appendix as a draft tag set. Do not treat his omissions as negatives, and do not use his page counts to rank.
