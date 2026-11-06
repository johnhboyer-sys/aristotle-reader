# How Owens gathered his passages on being and οὐσία

Read-only study, 2026-11-05. Source: Joseph Owens, *The Doctrine of Being in the Aristotelian Metaphysics*, 3rd ed. (PIMS 1978; core text 1951, notes revised to 1976), 576 PDF pages, `~/Documents/Papers Library/Owens/Owens-1978-…-PIMS.pdf`. Printed page = PDF page − 37.

**The "supplement_1" file is not a supplement.** `Owens-1978-…_supplement_1.pdf` has the same MD5 (`00ab5c1e…`) as the main PDF. It is a duplicate copy.

**What I read and what I did not.**
- Read in full: table of contents; Gilson's preface; author's foreword; foreword to the 2nd ed. (pp. xiii–xxiv); end of ch. 1 (pp. 66–68); ch. 2b (methodical sequence, pp. 83–90); ch. 3 (equivocals, pp. 107–136); ch. 4 (translation, pp. 137–156); ch. 5 pp. 180–184 (τὸ τί ἦν εἶναι); ch. 16 opening (pp. 415–417); ch. 19 §§1–5 (pp. 455–462); the Greek-terms index (from page images, pp. 505–506); the index of persons (parsed).
- Parsed in full by script: the index of Aristotelian texts (pp. 519–539). The text layer is OCR with errors (`l`/`!`/`I` for 1, `O` for 0, Greek book letters garbled), so counts below are ±5%.
- Not read: the body of chs. 5–18, roughly 300 pages. I placed loci in buckets from the index (where each passage is cited, in text or note, translated or not), the section headings, and the chapters I did read. A bucket call on a chapter I did not read is my judgment, not Owens's.
- Greek in the running text is lost in the text layer (blanks or junk like `TO TI r\v slvai`). Nothing in this file depends on reading Greek from the body; the Greek index I read from rendered page images.

Scratch outputs (session-only, will not survive reboot): parsed index `…/scratchpad/owens/recs.json`, per-chapter spans `…/scratchpad/owens/spans.txt`, under `/private/tmp/claude-501/-Users-johnboyer-Developer-aristotle-reader/58d050f0-8433-4a90-9766-1bdf1fec74f6/scratchpad/`.

## 1. How he found his passages

### 1a. The frame is the reading order, not a word search

Owens does not start from a term and collect its occurrences. He reads the Metaphysics book by book in the order he holds Aristotle meant it to be taught, and follows "the patient pursuit of a problem throughout a long text" (author's foreword). The book's parts are the books of the Metaphysics:

- Part 2: A, B, Γ, E 1 (chs. 5–7).
- Part 3: E 2–4 as the hinge, then Z, H (being as in the categories, chs. 8–13), then Θ 1–9, Θ 10, I (being as act, truth, unity, chs. 14–16).
- Part 4: M, N, Λ (separate entity, chs. 17–18), then a conclusion (ch. 19).

He derives that order (ch. 2b, pp. 83–90) from internal evidence only: the cross-references between books, the doublets, and inserted fragments. The result is the "main series" A B Γ E 1 (Δ) E 2–4 Z H Θ 1–9 Θ 10 I M 1–9 M 9–10. α, Λ and N sit outside it (no certain references to or from it); K 1–8 is a summary of B Γ E and is used as a parallel witness; Δ enters between E 1 and E 2 because E 2 and Z 1 refer back to it. Chronology (Jaeger's development theory) is set aside as unproven; the "methodical order is a datum. It is given in the cross-references" (2nd-ed. foreword, p. xv).

So the anchor texts are whole books, taken in a fixed sequence. Inside each book he goes chapter by chapter and often line by line.

### 1b. The terms and formulae he tracks

From the Greek index (pp. 505–506; bold page numbers there mark the main discussion) and the vocabulary summary in ch. 19 §2:

| Greek | Owens's English | Main discussion |
|---|---|---|
| οὐσία | Entity (capitalized; "substance" and "essence" rejected, ch. 4) | pp. 138–153 |
| τὸ ὄν | Being | scattered |
| ὂν ᾗ ὄν | Being qua Being | foreword xvii–xxviii; ch. 7 |
| πρὸς ἕν (with ἀφ' ἑνός, πρὸς μίαν φύσιν) | reference, "πρὸς ἕν equivocals" | pp. 116–121 and 30+ later pages |
| πολλαχῶς λέγεται | things expressed in various ways | pp. 108–110, 114–115 |
| ὁμώνυμα / συνώνυμα, κατ' ἀναλογίαν | equivocals / univocals, by analogy | ch. 3 |
| τὸ τί ἦν εἶναι | what-IS-Being | pp. 181–188 |
| τὸ τί ἐστι | what-is | p. 180 |
| τόδε τι | a 'this' | pp. 386–389n |
| χωριστόν | separate | pp. 383–384n |
| εἶδος | form | p. 159 |
| καθόλου / καθ' ἕκαστον | universal / singular | p. 160 |
| ὕλη, ὑποκείμενον | matter, substrate | ch. 9 |
| ἐνέργεια / ἐντελέχεια | act | p. 334, 405n |
| πρώτη οὐσία, πρώτη φιλοσοφία, θεολογική | primary Entity, Primary Philosophy, theology | pp. 18–20 |
| ὄντως ὄν | (Platonic) really real | pp. 222–223 |

The brief's list is right, with three corrections. ὂν ᾗ ὄν gets few index entries but carries whole chapters (7a, 7b, the 2nd-ed. foreword). πρὸς ἕν is the most indexed Greek item by far: it is his instrument, not one term among others. And he tracks τόδε τι, χωριστόν, καθόλου/καθ' ἕκαστον as closely as οὐσία, because his thesis turns on whether form is universal or individual (ch. 1, p. 68).

He also tracks formulae as grammar. For τὸ τί ἦν εἶναι (pp. 181–183, n. 83) he construes the phrase by comparing the longer forms elsewhere in the corpus: PA II 3, 649b22 (τί ἦν αὐτῷ τῷ αἵματι εἶναι), PA I 1, 640a34, IA 8, 708a11–12, Z 17, 1041b6, and Bonitz's *Index* 764a–765a. Relevance here is by wording, not topic.

### 1c. Homonymy: how he decides which occurrences count

Chapter 3 is the method chapter. Its rules, in his terms:

1. Equivocity belongs first to **things**, not words (Cat 1, 1a1–6: "things are called equivocal whose name alone is common"). Words and definitions are equivocal only by reference to the things they signify.
2. Types (from EN I 6, 1096b26–29, with Top I 15 and Γ 2): (a) **by chance** — the senses share nothing (ζῷον = animal and painting); (b) **by reference**, πρὸς ἕν / ἀφ' ἑνός — one primary instance, the others named from their relation to it (healthy, medical, being); (c) **by analogy** — a four-term proportion. Also act/potency and per accidens as further ways. Chance equivocals "can be disregarded" (p. 118).
3. Aristotle does not fix a sense and then apply the word. He looks at the things, sees how they are alike and unlike, and lets the word follow. "Things are first considered and the name then applied" (p. 121). The sense of a given occurrence is settled from the context; "a simple 'yes' or 'no' cannot be said" until it is (Top I 15).
4. When Aristotle contrasts πρὸς ἕν with "equivocal", "equivocal" means only chance equivocity (p. 122).

Applied to selection, this means: an occurrence of οὐσία or τὸ ὄν counts if its referent falls inside the πρὸς ἕν family of being (substance, matter, form, composite, separate mover, accidents as derivative, the true, the per accidens). It drops out only if the use is a chance homonym. Owens never states that last step as a filter; it follows from his types and from what the index omits (no entry for οὐσία as property or wealth anywhere).

Chapter 4 adds the translation rule. A translating word must point to the **primary** instance and be able to carry the secondary ones in their order. "Substance" points to the substrate, a secondary instance; "essence" imports a contrast with existence the Greek lacks. Hence "Entity". The point matters for John's plan (section 4): standard English versions cut οὐσία into two words along a line that is the translator's, not Aristotle's.

### 1d. Moving out from the Metaphysics

He does pull in other works, in four ways (index counts below):

- **The logic of homonymy**: Cat 1; Top I 15–18 (29 refs, mostly ch. 3); EN I 6; Int 1, 16a3–8; SE 17. These define how to read "said in many ways".
- **Principles the central books borrow**: "the principles used in these Books … are taken from the Physics and the logical works" (p. 416). Phys I 7–9 and II 1–3 for matter, form, nature, the four causes; APo II 1–10 (43 refs, ch. 7b) for what-is and whether-it-is, definition and demonstration; APo II 19 for grasp of first principles; Cat 5 for primary and secondary οὐσία.
- **Completing what the Metaphysics leaves undone**: ch. 19 holds that no extant treatise shows how being passes from separate entity to sensible things. He reconstructs it from DA II 4, 415a26–b7, GC II 10, 336a31–337a17, GA II 1, 731b31–35, Cael I 9, 279a17–30, plus Phys VIII 6 and DA III 4–8 for the movers and for intellect.
- **Wording parallels** for a formula (PA, IA above).

Counts from the parsed index (distinct citations / citation-page pairs):

| Work | Distinct | Pairs |
|---|---|---|
| Metaphysics | ~1,300 | ~1,525 |
| Posterior Analytics | 84 | 86 |
| Physics | 65 | 76 |
| Topics | 64 | 68 |
| De Anima | 37 | 44 |
| Categories | 27 | 32 |
| Nicomachean Ethics | 26 | 27 |
| De Caelo | 21 | 22 |
| Gen. et Corr. | 18 | 19 |
| Parts of Animals | 16 | 21 |
| De Interpretatione | 9 | 10 |
| Others (Mete, EE, APr, GA, SE, Rhet, Pol, Poet, HA, IA, MM, fragments) | 41 | 41 |
| **Total** | **~1,710** | **~1,973** |

Grouped to chapter level (John's "locus"), that is 268 chapter-units: 119 in the Metaphysics (almost every chapter of every book is cited at least once), 28 in APo, 22 in Phys, 17 in Top, 15 in EN, 14 in DA, the rest scattered. 1,691 of 1,973 references (86%) sit in footnotes.

The non-Meta citations cluster by chapter of Owens: ch. 3 (equivocals) has more outside citations (76) than Meta ones (62); ch. 7b (E 1, demonstration of being) has 44 outside vs 50 Meta; ch. 18b (Λ) 41 vs 75; ch. 19, 21 vs 35. Elsewhere the outside works are thin.

### 1e. Commentators and scholars as finding aids

- **Greek commentators** (Alexander of Aphrodisias ~48 mentions in the body, Asclepius 18, Syrianus 8, Ps.-Alexander 5). Used to establish the interpretive tradition (being qua being = separate entity, the reading Book K already gives) and to check readings, not to find passages.
- **Bonitz**: the commentary (*Arist. Metaph.*) and the *Index Aristotelicus* (~29 *Ind. Arist.* citations). The *Index* serves as a usage dictionary for formulae and words: ὁμώνυμος 514a–b, λόγος 433a–437b, ἀναλογία 47b–48b, τὸ τί ἦν εἶναι 764a–765a, εἶναι 221a, γε μήν 147a (to test K's style). He cites it to settle how a word is used, not to harvest loci.
- **Ross** (~156 mentions) for the text (Ross's text is the base; departures noted), parallels, and the cross-reference list. **Jaeger** (~192) for the structure of the treatises (*Studien*) and as the chief opponent on chronology. **Schwegler**'s excursus on τὸ τί ἦν εἶναι, Trendelenburg, Zeller, Natorp, Aubenque, the Mansions, Merlan: chs. 1 and the forewords are a survey of interpretations since Natorp, which tells him which passages are contested (E 1, 1026a23–32; Γ 1–2; K 7; Λ). The contested passages become anchors.
- Translation base: the Oxford translation, altered where it breaks the vocabulary of being; some help from Tredennick.

### 1f. Central vs peripheral

He never states a rule. What the book shows:

1. A passage in the main series outranks one outside it. α, Δ, Λ, N, K are read as satellites of the series, though Λ supplies the only treatment of separate entity.
2. A passage he translates in the running text is central; one cited in a footnote is peripheral. The index marks translations with "t"; 311 of 1,973 references are in the running text or translated.
3. A passage that "expressly" states a doctrine (ch. 19 §3, "Expressly Stated Doctrines") outranks one that implies it.
4. A passage that raises or settles an aporia of Book B is central to its book. He reads Z H Θ as preparing the "solution" of the fifth aporia (are there non-sensible entities?) and I as solving the eleventh (are being and one entities?).

## 2. His passage set

**Count.** ~1,710 distinct Aristotelian citations; ~268 chapter-level loci; ~1,300 distinct citations in the Metaphysics. The table below lists 78 loci he treats at length, grouped to chapter or chapter-run.

**How the citations were checked.** Each "cited span" is the first to last Bekker line Owens himself cites inside that locus, computed from the parsed index; where a range also appears whole in his text I give it. A span ending at the chapter end (rather than his last cited line) is marked ¶. Book numbers for works other than the Metaphysics were wrongly carried in the OCR'd index (it prints GC II 10 under "I"), so I set those by the Bekker page. "Refs" = citation-page pairs in the index that fall inside the span (approximate; OCR).

Buckets for the topic **being / οὐσία**: 1 direct; 2 discussed in service of another issue; 3 nearby problem; 4 applied, undiscussed. "T" marks a tool text (about homonymy itself), a kind the buckets lack (see section 3).

### Metaphysics

| # | Locus | Cited span (Owens) | Owens ch. (pp.) | Refs | B | Reason |
|---|---|---|---|---|---|---|
| 1 | Meta A 1–2 | 980a21–982b10 (cited whole, p. 157) | 5 (157–169) | 45 | 3 | Wisdom as knowledge of first causes: the science whose subject being turns out to be; being not yet named. |
| 2 | Meta A 2 | 982b11–983a23 | 5 (169–173) | 12 | 3 | Goal of the science; "divine" science; sets up the theology question. |
| 3 | Meta A 3 | 983a24–b6 ¶ (cites a27–30) | 5 (177–188) | 14 | 2 | Four causes listed; οὐσία and τὸ τί ἦν εἶναι named as the formal cause. Topic is the causes; his longest gloss of τὸ τί ἦν εἶναι sits here. |
| 4 | Meta A 3–5 | 983b6–987a26 | 5 (189–197) | 35 | 3 | Predecessors' principles; rival accounts of what is, incl. the Eleatic one (986b18–21). |
| 5 | Meta A 6 | 987a29–988a14 | 5 (198–200) | 21 | 3 | Plato's Forms and numbers as the rival candidate for οὐσία. |
| 6 | Meta A 9 | 990b1–993a2 | 5; 17a (422–424) | 14 | 2 | Critique of the Forms; at 992b18–24 the error of not distinguishing the senses of being (p. 109n). |
| 7 | Meta α 1 | 993b23–31 | 10, 13, 18b (notes) | 6 | 4 | "As each thing stands to being, so to truth": a degree-of-being principle applied to argue about truth and causes. |
| 8 | Meta B 1 | 995a24–996a17 | 6 (213–219) | 42 | 3 | The aporia method and the list of aporiae, most of which concern οὐσία. |
| 9 | Meta B 2 | 996a18–998a19 (cites 996a18–29, 997a34–998a19) | 6 (220–235) | 47 | 3 | Aporiae 1–5: one science of causes, of οὐσία, of axioms? are there non-sensible οὐσίαι? |
| 10 | Meta B 3 | 998a20–999a23 (cited whole, p. 416n) | 6 (236–237); 16 | 10 | 2 | Are genera principles? Argument turns on being and one not being genera (998b22–27). |
| 11 | Meta B 4 | 999a24–b24 ¶ (cites a24–32, b4–16) | 6 (237–245); 13 (390) | 32 | 3 | Eighth aporia: is anything apart from singulars? The form/universal problem his thesis turns on. |
| 12 | Meta B 4 | 1001a4–b25 (cited whole) | 6 (247–248); 16 (416) | 11 | 1 | Eleventh aporia: are being and one the οὐσία of things? |
| 13 | Meta B 5 | 1001b26–1002b11 (cited whole) | 6 (249) | 12 | 3 | Are numbers and figures οὐσίαι? |
| 14 | Meta B 6 | 1002b12–1003a17 | 6 (250–251); 17b | 20 | 3 | Are principles universal or individual? Answered in M 10. |
| 15 | Meta Γ 1 | 1003a21–32 | 7a (259–264) | 11 | 1 | A science of being qua being. |
| 16 | Meta Γ 2 | 1003a33–b19 (cited a33–b17, foreword xx) | 3 (119–121); 7a (265–273) | 34 | 1 | Being said πρὸς ἕν, like "healthy"; the primary nature is οὐσία. His central text. |
| 17 | Meta Γ 2 | 1003b19–1005a18 (cited whole) | 7a (275–279) | 43 | 1 | Being and one; "as many forms of being as of οὐσία"; parts of philosophy. |
| 18 | Meta Γ 3 | 1005a19–b8 | 7a (280–281); foreword xviii | 14 | 2 | Axioms belong to the student of primary οὐσία; topic is the axioms. |
| 19 | Meta Γ 4 | 1006a28–1008a34 | 7a (283–284) | 16 | 2 | Defence of non-contradiction; its deniers "do away with οὐσία and τὸ τί ἦν εἶναι" (1007a20–21). |
| 20 | Meta Δ 2 | 1013a24–b16 ¶ (cites 1013b4–7) | 3 (112) | 2 | 2 | Causes "said in many ways": his proof that things, not words, are equivocal. |
| 21 | Meta Δ 6 | 1016b31–1017a3 | 3 (124) | 2 | 2 | One in number, species, genus, by analogy: source for analogy as a type. |
| 22 | Meta Δ 7 | 1017a7–b9 | Intro III (307, 316); 15 | 12 | 1 | The senses of being: per accidens, categories, true, potency/act. Sets the plan of Part 3. |
| 23 | Meta Δ 8 | 1017b10–26 | 4 (138–140); 8 (322–325) | 13 | 1 | The senses of οὐσία. |
| 24 | Meta Δ 11 | 1018b9–1019a11 | 8 (320) | 9 | 2 | Priority; priority in οὐσία (1019a1–4) used for οὐσία's primacy. |
| 25 | Meta Δ 18 | 1022a14–32 | 5 (160, 179–182); 10 (349) | 9 | 2 | Καθ' αὑτό; first sense is τὸ τί ἦν εἶναι. Topic is "in virtue of itself". |
| 26 | Meta E 1 | 1025b3–1026a32 (key 1026a23–32) | 7b (287–298); foreword xvii–xix | 32 | 1 | Theology is first philosophy and universal because first; studies being qua being. The disputed text. |
| 27 | Meta E 2 | 1026a33–1027a28 ¶ (cites to 1027a22) | Intro III (307–310); foreword xv | 23 | 1 | Senses of being; being per accidens. |
| 28 | Meta E 4 | 1027b17–1028a6 (cites 1027b17–34, 1028a3–4) | Intro III (310–311); 15; 19 | 5 | 1 | Being as true set aside; return to being in the categories. |
| 29 | Meta Z 1 | 1028a10–b6 | 8 (316–322) | 27 | 1 | Being is primarily οὐσία; "what is being" is "what is οὐσία". |
| 30 | Meta Z 2 | 1028b8–32 (cites b8–15, b15–27, b32) | 8 (322–327) | ~9 | 1 | Received candidates for οὐσία. |
| 31 | Meta Z 3 | 1028b33–1029b12 | 8 (325); 9 (329–347) | 29 | 1 | Four candidates; substrate; matter as ultimate subject. |
| 32 | Meta Z 4–5 | 1029b12–1031a12 | 10 (347–351) | 22 | 1 | Τὸ τί ἦν εἶναι; primarily of οὐσία, secondarily of the rest. |
| 33 | Meta Z 6 | 1031a15–1032a10 | 10 (352–354) | 26 | 1 | Each thing and its τὸ τί ἦν εἶναι are the same. |
| 34 | Meta Z 7–9 | 1032a12–1034b19 | 9 (339–343); 10 | 47 | 2 | Topic is coming-to-be; form and matter are distinguished to explain it (form not generated). |
| 35 | Meta Z 10–11 | 1034b28–1037b7 | 9; 10 (336–343, 361) | 42 | 1 | Parts of definition vs parts of thing; sensible and intelligible matter; closes with a summary of what οὐσία is. |
| 36 | Meta Z 12 | 1037b8–1038a35 | 10 (362); 19 (459) | 12 | 2 | Unity of definition (from the Analytics); last differentia is the οὐσία. |
| 37 | Meta Z 13 | 1038b2–1039a23 | 11 (366–370) | 15 | 1 | No universal is οὐσία. |
| 38 | Meta Z 14–16 | 1039a24–1041a5 | 11 (371–374) | 19 | 1 | Forms as οὐσίαι refuted; singulars indefinable; being and one not οὐσία. |
| 39 | Meta Z 17 | 1041a7–b28 (cited 1041a10–b9) | 12 (375–378) | 18 | 1 | Οὐσία as cause; a fresh start from the "why". |
| 40 | Meta H 1 | 1042a3–b8 | 13 (379–381); 8 (326) | 28 | 1 | Summary; sensible οὐσίαι; matter. |
| 41 | Meta H 2–3 | 1042b9–1044a6 | 9 (334–339); 13 | 33 | 1 | Differentiae as analogues of οὐσία; form vs composite. |
| 42 | Meta H 6 | 1045a7–b23 (cited a7–35) | 10 (343, 363–364) | 15 | 2 | Topic is unity of definition; settled by potency and act. |
| 43 | Meta Θ 1 | 1045b27–1046a21 | 14 (403) | 7 | 1 | Being as potency and act; reference to οὐσία. |
| 44 | Meta Θ 6 | 1048a30–b35 | 14 (404–405) | 4 | 1 | Act grasped by analogy, not defined. |
| 45 | Meta Θ 7 | 1049a1–b2 | 9 (334, 338, 344) | 9 | 2 | Topic is when a thing is potentially; the "thaten" predication reveals substrate and matter. |
| 46 | Meta Θ 8 | 1049b10–1051a2 | 14 (406–408); 19 | 20 | 1 | Act prior in οὐσία; eternal prior to perishable. |
| 47 | Meta Θ 10 | 1051a34–1052a11 | 15 (411–414) | 13 | 1 | Being as true; simples. |
| 48 | Meta I 1–2 | 1052a15–1053b25 | 16 (415–417); 19 (456) | 15 | 4 | Topic is unity; applies Z 13–16 (no universal is οὐσία) "with express citation" to show one is not οὐσία. |
| 49 | Meta K 1–2 | 1059a18–1060b30 (cited whole) | 6 (211, 220–231) | 37 | 3 | The aporiae again (doublet of B). |
| 50 | Meta K 3 | 1060b31–1061b15 | 3 (119); 7a (267); foreword xx | 26 | 1 | Being πρὸς ἕν (doublet of Γ 2); "being qua being" said of sensible οὐσία (1061a8–10). |
| 51 | Meta K 7 | 1063b36–1064b14 (cited b6–14) | 7b (299); 19 | 11 | 1 | Science of separate being is universal (doublet of E 1). |
| 52 | Meta K 8 | 1064b15–1065a26 ¶ (cites 1065a21–33) | Intro III (308–311) | 5 | 1 | Being per accidens (doublet of E 2–3). |
| 53 | Meta Λ 1 | 1069a18–33 | 18b (438) | 8 | 1 | Inquiry is about οὐσία; three kinds. |
| 54 | Meta Λ 2–5 | 1069b3–1071b2 ¶ (cites 1070a11–19, 1071a3–11) | 13 (387–389); 18b | 5 | 2 | Principles of sensible οὐσία, the same by analogy; topic is principles and causes. |
| 55 | Meta Λ 6 | 1071b12–1072a5 | 18b (438–440) | 10 | 1 | There must be an eternal unmoved οὐσία. |
| 56 | Meta Λ 7 | 1072a21–1073a13 | 18b (442–444); 19 (451, 470) | 20 | 1 | Unmoved mover as final cause; heaven and nature depend on it. |
| 57 | Meta Λ 8 | 1073a14–1074b10 (cited 1073a14–1074a17) | 18b (446–450) | 18 | 1 | How many separate οὐσίαι. |
| 58 | Meta Λ 9 | 1074b15–1075a10 (cited whole) | 3 (128–129); 18b (444) | 5 | 3 | Divine thinking; 1074b35–36 is his source for the doctrine of cognition. |
| 59 | Meta Λ 10 | 1075a11–1076a4 | 18b (452–453) | 13 | 3 | Good and order of the universe. |
| 60 | Meta M 1–5 | 1076a9–1080a6 | 17a (421–424); 7b (296) | 33 | 3 | Mathematicals and Forms as candidate οὐσίαι; critique. |
| 61 | Meta M 9–10 | 1085b34–1087b16 (cited 1086a21–32, 1087a10–25) | 17b (426–433) | 28 | 3 | Are principles universal? Knowledge is of the universal yet bears on the singular (answers B 6). |
| 62 | Meta N 1–2 | 1087a29–1090a2 | 18a (435–437); 19 | 22 | 2 | Against Platonist generation of number; their "archaic" Parmenidean error about being (1088b35–1089a15). |

### Other works

| # | Locus | Cited span (Owens) | Owens ch. (pp.) | Refs | B | Reason |
|---|---|---|---|---|---|---|
| 63 | Cat 1 | 1a1–15 | 3 (110–112) | ~10 | T | Definition of equivocals, univocals, paronyms. Method text. |
| 64 | Cat 5 | 2a11–4a21 | 9 (329); 11 (367–369); 13 (387) | 17 | 1 | Primary and secondary οὐσία; "this". |
| 65 | Int 1 | 16a3–13 | 3 (120); 4 (138) | 4 | T | Words signs of affections, affections likenesses of things: grounds the "things first" rule. |
| 66 | Top I 15–18 | 106a1–108b31 (cited whole) | 3 (108–124) | 29 | T | How to detect and sort "things said in many ways". |
| 67 | EN I 6 | 1096a11–b29 (key b23–29) | 3 (116–117) | 6 | 2 | Topic is the good; distinguishes chance, πρὸς ἕν and analogical equivocity; good said in as many ways as being. |
| 68 | APo II 1–10 | 89b23–94a19 (cited whole) | 7b (287–292) | 43 | 3 | What-is and whether-it-is; how a science "shows" being and οὐσία. |
| 69 | APo II 19 | 99b20–100b5 | 5 (158–161, 204); 6 | 8 | 3 | How first principles are grasped from perception. |
| 70 | Phys I 2–3 | 185a3–186a25 | 3 (109); 7a (272) | 5 | 2 | Against the Eleatics: being said in many ways (186a24–25). |
| 71 | Phys I 7–9 | 190b7–192b2 | 5 (174); 9; 18b | 17 | 2 | Topic is change; substrate and form distinguished; matter known by analogy (191a7–12). |
| 72 | Phys II 1–3 | 192b13–195a21 | 5 (173–186); 13 | 14 | 2 | Topic is nature and cause; form as nature; four causes. |
| 73 | Phys VIII 6 | 258b11–260a19 | 18b (439–450) | 9 | 3 | Eternal unmoved mover argued from motion. |
| 74 | DA II 1 | 412a6–11 ¶ (cites a8–9) | 13 (388–389) | 2 | 4 | Matter, form, composite as senses of οὐσία applied to define soul. |
| 75 | DA II 4 | 415a24–b21 (key a26–b7) | 13 (388); 19 (461) | 5 | 4 | Living things share the eternal and divine by reproducing; Owens's key text for how being passes from the divine. |
| 76 | DA III 4–8 | 429a17–432a14 | 3 (128–135); 17a | 21 | 3 | Mind becomes its object; underwrites his "things first" reading. |
| 77 | Cael I 9 | 278a6–279b3 (key 279a17–30) | 19 (462) | 8 | 4 | Being and life of all things derive from the divine "duration" (αἰών), stated in passing in a cosmology. |
| 78 | GC II 10 | 336a31–337a24 | 19 (461n, 463n) | 9 | 4 | "Being better than not being" applied to explain perpetual generation. |

Also cited at some length but left out of the table: PA I 1, 640a15–641a9 (form and τὸ τί ἦν εἶναι in biology; wording parallel for the formula); GA II 1, 731b31–35; EE I 8, 1217b25–35 and VII 2 (good and friendship said in many ways, πρὸς ἕν); Γ 5, 1009a6–1010a15 (Protagoras, Cratylus); A 10; H 4–5.

## 3. Where the four buckets fit and where they fail

**Where they fit.** Bucket 1 is Owens's spine: Γ 1–2, E, Z, H, Θ, K's doublets, Λ 1 and 6–8, Cat 5. Bucket 2 matches the places where he catches Aristotle drawing distinctions about οὐσία to settle something else: A 3 (causes), Γ 3–4 (axioms), Z 7–9 (generation), Z 12 and H 6 (unity of definition), Θ 7, EN I 6, Phys I–II. Bucket 3 covers the aporiae, the predecessors, M, APo II. Bucket 4 is thin but real: I 2 applies Z's result; DA II 1 and II 4, GC II 10, Cael I 9 assume the doctrine. John's bucket-2 example, the causes in GC II, barely appears: GC II 9 is cited once (335b6, p. 177n) and GC II 10 only for perpetual generation.

**Where they fail.**

1. **Tool texts.** Cat 1, Int 1, Top I 15–18 and much of Δ are about homonymy itself: how anything, being included, is said in many ways. They are not about being, not in service of a question about being, and do not apply being. For Owens they come first because they govern how every later occurrence is read. A fifth kind, "method", is needed.
2. **Which instance.** Under πρὸς ἕν, a passage can be direct and still be about a secondary instance (accidents, the true, the per accidens, matter). Owens's whole argument is about which instance is primary. Bucket 1 needs a sense tag (primary οὐσία, sensible οὐσία, form, matter, composite, separate, category, the true, per accidens).
3. **Doublets.** K 1–8 restates B Γ E; Λ 1–5 runs parallel to Z H Θ. Owens uses the pairs as witnesses against each other. The buckets cannot record that two loci say the same thing.
4. **Aporia and solution.** B raises; Z H Θ I M answer. Relevance comes in pairs (B 4 1001a4–b25 ↔ Z 16, I 2; B 6 ↔ M 10). Bucket 3 holds the question and loses the link.
5. **Structure texts.** Cross-references (B 1, 995b5; E 2, 1026a34; Z 1, 1028a10–11; Θ 1, 1045b28) matter because they fix the reading order, which for Owens fixes the meaning. They carry no doctrine.
6. **Rival doctrines.** The Eleatics, Plato, the Academy (A 3–9, M, N, Phys I 2–3) are relevant as positions being defined against. "Nearby problem" undersells them; "in service of" misdescribes them.
7. **Wording parallels.** PA II 3, 649b22 is cited to construe τὸ τί ἦν εἶναι, not for its biology. That is philological relevance, which none of the buckets name.
8. **Order.** The buckets are a set. Owens's list is a sequence, and he holds that a passage's sense depends on where it falls in the series. A topic page that wants to follow him would need a reading order as well as buckets.
9. **Absence.** Ch. 19's finding is that the treatise required by A–E 1 does not exist. He then pulls in DA, GC, Cael to fill the gap. Those loci are "relevant because the Metaphysics is silent", a kind the buckets cannot show.

## 4. His method as steps a machine could run

Inputs assumed: lemmatized Greek with Bekker line ids; an aligned English translation per work, with the translator known; the Bonitz *Index* (bonitz-text repo; οὐσία entry not yet adjudicated, see `bonitz-as-answer-key.md`); a bibliography of secondary literature with loci.

1. **Fix the text and the base translation.** One edition (Owens: Ross), one translation (Owens: Oxford), with every departure logged. *Needs*: corpus metadata. *Goes wrong*: mixing translators across works hides vocabulary shifts as sense shifts.

2. **Harvest the contested loci from the scholarship.** Collect loci cited by the main interpreters on the topic (for being: Natorp, Jaeger, Ross, Aubenque, Mansion, Merlan). These become anchors. *Needs*: citation extraction from secondary texts. *Goes wrong*: inherits the field's blind spots; over-weights loci famous for being disputed.

3. **Recover the reading order from cross-references.** Detect back- and forward-references (ἐν τοῖς διαπορήμασιν, ἐν τοῖς περὶ τοῦ ποσαχῶς, εἴρηται, διώρισται, πρότερον / ὕστερον ἐροῦμεν, ἐν τοῖς φυσικοῖς, ἐν τοῖς ἀναλυτικοῖς) and resolve each to a target book. Build the series graph; mark doublets by high English-side similarity of whole chapters (K vs B Γ E). *Needs*: Greek regex plus a hand-checked target map; embeddings for doublets. *Goes wrong*: vague referents ("as was said"), references to lost works, and similarity that pairs any two chapters on the same subject.

4. **Load the homonymy texts first.** Mark Cat 1, Top I 15–18, Δ, EN I 6, Γ 2 and any passage with πολλαχῶς / ποσαχῶς λέγεται, ὁμώνυμος, συνώνυμος, πρὸς ἕν, ἀφ' ἑνός, πρὸς μίαν φύσιν, κατ' ἀναλογίαν as tool texts. *Needs*: lemma search. *Goes wrong*: πολλαχῶς used loosely, without a doctrine attached.

5. **Find every occurrence of the term family, by phrase.** οὐσία, τὸ ὄν / τὰ ὄντα, ὂν ᾗ ὄν, πρώτη οὐσία, τὸ τί ἦν εἶναι, τὸ τί ἐστι, τόδε τι, χωριστόν, εἶδος, ὕλη, ὑποκείμενον, ἐνέργεια, ἐντελέχεια, καθόλου, καθ' ἕκαστον. Formulae must match with insertions (τὸ τί ἦν αὐτῷ τῷ αἵματι εἶναι; τὸ τί ἦν εἶναι ἑκάστῳ) and with the article varied. *Needs*: lemma index, a phrase matcher that allows gaps. *Goes wrong*: exact-string matching misses the dative forms Owens leans on; lemma-only matching floods τὸ ὄν with copulas and participles.

6. **Separate the senses, using the English to filter.** This is the step John asked about. Owens's rules give the shape: decide by the thing referred to, sort first into chance homonyms (drop) and the related family (keep), then tag which instance. Concretely:
   - a. **Greek-side form test first.** For εἶναι: substantive τὸ ὄν / τὰ ὄντα / τοῦ ὄντος keep; bare finite ἐστί and circumstantial participles (ὤν, ὄντος in a genitive absolute) drop unless an LLM judges them existential or veridical in a passage already flagged. For τὸ τί ἦν εἶναι the dative of the possessor is part of the formula, not noise.
   - b. **English rendering as a provisional sense label**, with a table per translator. For the Oxford (Ross) Metaphysics: οὐσία → "substance" (thing, substrate, composite, category, separate mover) or "essence" (form, τί ἦν εἶναι, "the οὐσία of X"); "property", "wealth", "estate", "means" → chance homonym, drop (Pol, Rhet, EN IV). εἶδος → "form" keep; "species" keep, tagged logical; "Form/Idea" capitalized → Platonic, tag rival; "kind, shape, figure, appearance" → drop. ὕλη → "matter" keep; "timber, wood" → drop. λόγος → "definition, formula" keep; "argument, account, ratio, speech" → drop or route to judgment (Bonitz lists the heads at *Ind.* 433–437).
   - c. **Context features** to confirm or overrule the English: nearby συμβεβηκός, ποιόν, ποσόν (οὐσία as category); ὕλη, εἶδος, σύνολον, ὑποκείμενον (οὐσία candidates); ἀκίνητος, χωριστή, ἀΐδιος (separate οὐσία); χρήματα, κτῆσις (property).
   - d. **LLM pass only where a, b and c disagree**: give the Greek sentence, the English, and the candidate senses; ask for the referent (what thing is being called οὐσία here), not a dictionary sense. That is Owens's "things first" rule turned into a prompt.
   - e. **Bonitz's sense heads as a second witness** where the entry is clean.
   
   *Needs*: word-level Greek–English alignment; translator-specific tables; an LLM. *Goes wrong*: (i) Owens's own ch. 4 point: "substance" vs "essence" is the translator's cut, and the Oxford team switches to "essence" where "substance" reads badly, so the English split is interpretation, not evidence; (ii) one English word hides several Greek ones ("essence" renders οὐσία, τὸ τί ἦν εἶναι and τὸ τί ἐστι); (iii) alignment drift on long periods; (iv) translators differ by work, so a table for the Metaphysics is wrong for the Categories; (v) Owens's line between chance and related homonyms is drawn by doctrine (he holds that being qua being is separate entity), so a filter built on his tags carries his thesis.

7. **Mark the focal statements.** Passages that state the πρὸς ἕν relation itself (Γ 2, Z 1, Z 4 1030a29–b6, Θ 1, K 3, EE VII 2, EN I 6) are bucket 1 regardless of length. *Needs*: phrase search plus judgment. *Goes wrong*: πρὸς ἕν is also used for friendship and goodness; keep those as bucket 2.

8. **Pull in outside works by rule, not by similarity alone.** (a) explicit citation from a Meta passage to another work; (b) the principles the passage uses but does not argue (matter and form from Phys I–II, definition from APo II, categories from Cat); (c) passages Owens needs because the Metaphysics is silent (derivation of being from separate entity); (d) wording parallels for a formula, via Bonitz. *Needs*: citation cues, Bonitz lookups, embeddings as a last resort. *Goes wrong*: similarity search returns thematically close but unrelated passages; rule (c) needs a thesis to know what is missing.

9. **Rank central vs peripheral.** Score: in the main series (+); translated or quoted in a study (+); states the doctrine "expressly" (+); raises or settles a B aporia (+); only a footnote citation in the scholarship (−); a single-line citation about text, style or date (−, e.g. K's γε μήν, cited only to argue authorship). *Needs*: series graph (step 3), the aporia map, citation counts. *Goes wrong*: "translated in the text" measures a scholar's emphasis, not Aristotle's.

10. **Assign buckets.** Direct if the passage's own question is about X; 2 if its question is Y and it draws distinctions about X; 3 if X is at stake but neither defined nor applied; 4 if X is used as a premise without discussion. Add the missing kinds from section 3 as tags (method, doublet-of, aporia↔solution, rival view, wording parallel). *Needs*: an LLM given the chapter's opening and closing sentences (to fix the passage's own question) plus the occurrence list. *Goes wrong*: chapter-level calls blur mixed chapters (Γ 2 is bucket 1 for a third of its length and about contraries for the rest); a paragraph-level pass is safer.

## 5. Verdict

**Usable as a partial answer key for being / οὐσία in the Metaphysics: yes.** Recall inside the Metaphysics is near total at chapter level (119 chapters cited, ~1,300 distinct citations), the core loci are clear from where he translates and how often he returns, and each Bekker citation in the index can be checked. Treat the 78-row table above as the high-confidence set and the 268 chapter-units as the full set.

**Biases to correct for:**

1. **Metaphysics-centred.** Outside it the list is thin and selective: Cat has 27 distinct citations, Int 9, Phys 65, DA 37. Being in the logical works (the copula, existence, Int 3 and 10–12) is barely present. It is a poor key for the Organon or for being in the biology.
2. **Thesis-shaped.** He holds the Greek commentators' reading: being qua being is, in its primary instance, separate entity, and all else is being by reference to it. That pulls in Λ 6–8, E 1, K 7, DA II 4, GC II 10, Cael I 9 and pushes the reading of Z toward form as act. A key built on him will over-score the theological texts.
3. **Order-shaped.** Relevance depends on place in his methodical series; α, Δ, Λ, N are demoted as outside it, though Λ is where separate entity is treated.
4. **Index ≠ relevance.** The index (made by C. J. O'Neil and helpers, not Owens) lists every citation, including footnotes on the text, style, and dating (86% of entries are in notes). Many are not about being at all. Filter by "t" or main-text pages, or by count.
5. **Translation-shaped.** His sense-splitting is built against the Oxford English, and he coined "Entity" and "what-IS-Being" to avoid it. His tags will not line up with an English-based filter on the Oxford text; that mismatch is informative, not an error to fix.
6. **Dated.** Core 1951, notes revised to 1976. G. E. L. Owen's "focal meaning" is noted (ch. 3 notes) but does not change the method; nothing after 1976 on Z or on εἶναι.
7. **OCR.** My counts come from an OCR'd index and are ±5%; a few book numbers outside the Metaphysics were mis-carried in parsing and set by hand from Bekker pages.
