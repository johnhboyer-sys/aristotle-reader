# Promotion gate, pages 53–62 — evidence for eight rulings

Both checks were re-run and both premises hold: quotecheck reports **7 of 335
checkable citations at overlap 0.00** over 53–62 (13 judged on Greek alone, 5
Latin spans skipped), and alphacheck reports **1 order violation in 150
headword candidates**. No item on the list has gone stale.

Everything below is mechanical. The reference text is `app/dist/data`; Bonitz's
text is `work/reconciled-auto`. Where a ruling needs the ink, it says so.

Convention in the Bonitz extracts: `»…«` marks the span quotecheck scored,
`【…】` marks the citation under test.

---

## A1. 053-R:53 — Φη3. 247 b21

### Bonitz

```
52| πειν εἰς τὸν ȣ̓ρανόν μα8. 346 a34. f 13. 1476 a26.
53| »ἀνάβλεψις ϗ̀ ἁφὴ πότερον γενέσεις εἰσίν« 【Φη3. 247 b21, 8.】
54| ἀναβλύζειν trans ἡ κρήνη ἀναβλύζει ἔλαιον θ113. 841 a17.
```

Note the citation is a **pair**: `247 b21` *and* `247 b8`.

### The cited passage

Our Physics 247b **stops at line 19**. Lines 20–24 do not exist in the
reference text, so the comparison window collapsed to a single line:

```
247b19  τὰ παιδία οὔτε μανθάνειν δύνανται οὔτε κατὰ τὰς αἰσθήσεις
247b20  — absent —
247b21  — absent —   ← CITED
247b22  — absent —
```

### Measured

Scored words `ἀναβλεψις, ποτερον, γενεσεις, εισιν`; matched none; **overlap
0.00** against a one-line window.

### Alternative-locus scan

The other half of Bonitz's own pair is exact:

```
247b7   πάλιν δὲ τῆς χρήσεως καὶ τῆς ἐνεργείας οὐκ ἔστι
247b8   γένεσις, εἰ μή τις καὶ τῆς ἀναβλέψεως καὶ τῆς ἁφῆς οἴεται
247b9   γένεσιν εἶναι· τὸ γὰρ χρῆσθαι καὶ τὸ ἐνεργεῖν ὅμοιον τούτοις. ἡ
```

`ἀναβλέψεως`, `ἁφῆς`, `γένεσιν`, `εἶναι` — the whole clause, in the genitive
where Bonitz normalises to the nominative. **247b8 is right.** Best score
elsewhere in the Physics is 0.50 (223b21, 191a21) and is noise.

### The seam, measured

Physics column lengths, 240a–250b (`*` = already excluded as non-contiguous):

```
240a:33  240b:33  241a:33  241b:44*  242a:69  242b:73  243a:40*  243b:20
244a:15  244b:15  245a:16  245b:16   246a:20  246b:20  247a:19   247b:19
248a:25  248b:25  249a:31  249b:31   250a:31  250b:31*
```

Two facts fix the mechanism:

- **242a holds lines 35–69, not 1–34.** Our text carries the *upper* numbering
  range of some columns and the *lower* range of others.
- **247b19 → 248a1 runs on without a break in sense** (`…οὔτε κατὰ τὰς
  αἰσθήσεις` / `ὁμοίως κρίνειν τοῖς πρεσβυτέροις·`). Nothing is missing from
  our text; the numbering simply skips b20–b35.

So in Bekker's 241b–248b each column's line numbers are shared between two
recensions, and our reference text carries only one of them at each point.
`247b21` is a real Bekker line belonging to the recension our text does not
hold there. Bonitz is citing **both** recensions in one breath — b21 and b8.

Only 241b, 243a and 250b were excluded, because the exclusion rule tests
contiguity and 247b's 1–19 *is* contiguous. Truncation at a column's tail
passes the test.

### Hypotheses

1. **(d) Recension difference — strongly supported.** The cited line is absent
   from our text by construction; the companion citation matches perfectly;
   the seam is measurable in the column lengths. Nothing here is a
   transcription defect.
2. **(a) Citation error — ruled out.** No nearby line scores above 0.50, and
   the correct locus is already printed in the same citation.
3. **(c) Mis-transcription — ruled out.** All four readers give `247 b21, 8`
   (llama400 misreads the siglum as `Φγ3`, not the digits).

### What a ruling does

- Confirm against Ross's edition that 247b21 sits in the recension Ross prints
  as the alternate; then **record a recension note** on the finding and close
  it. No corpus edit.
- Separately: the exclusion rule needs to test completeness, not just
  contiguity — 242a/242b/243b–248b are all seam columns that pass today. Code
  change, out of this gate's scope; naming it here so it is not lost.

---

## A2. 054-R:18 — Ζμδ9. 685 a18

### Bonitz

```
16| ἀναγκαῖον ποιεῖ ἢ διὰ τὸ βέλτιον Ζγα4. 717 a15. »ȣ̓χ ὡς
17| βέλτιστον, ἀλλ᾽ ὡς ἀναγκαῖον διὰ τὸν ἴδιον λόγον τῆς ȣ̓σίας«
18| 【Ζμδ9. 685 a18.】 ȣ̔͂ ἕνεκεν ϗ̀ βέλτιον, opp τὸ τȣ́τȣ ἕνεκεν ϗ̀
```

### The cited passage

```
685a16  μὲν γὰρ τοὺς ἄνωθεν τῶν ποδῶν μικροὺς ἔχουσι, καὶ τούτων
685a17  τοὺς ἐσχάτους δύο μείζους, τοὺς δὲ λοιποὺς τῶν ὀκτὼ δύο
685a18  κάτωθεν μεγίστους τούτων. Ὥσπερ γὰρ τοῖς τετράποσι τὰ   ← CITED
685a19  ὀπίσθια ἰσχυρότερα κῶλα, καὶ ταύταις μέγιστοι οἱ κάτωθεν·
685a20  τὸ γὰρ φορτίον οὗτοι ἔχουσι καὶ κινοῦσι μάλιστα, καὶ οἱ
```

Same subject (the cephalopods' limbs), different sentence.

### Measured

Scored `βελτιστον, αναγκαιον, ιδιον, λογον, ουσιας`; matched none; **0.00**.
No line anywhere in 685a scores above zero.

### Alternative-locus scan

**Verbatim, one column over:**

```
685b13  δὲ τὸ μῆκος καὶ ἡ λεπτότης τῆς φύσεως αὐτῶν· μονοκότυλον
685b14  γὰρ ἀναγκαῖον εἶναι τὸ στενόν. Οὐκ οὖν ὡς βέλτιστον ἔχουσιν,
685b15  ἀλλ' ὡς ἀναγκαῖον διὰ τὸν ἴδιον λόγον τῆς οὐσίας.
685b16  Πτερύγιον δ' ἔχουσι ταῦτα πάντα κύκλῳ περὶ τὸ κῦτος.
```

Bonitz's clause is word-for-word 685b14–15. Scoring 1.00 at b12, b13, b14,
b15, b16 (their windows all reach b14–15); 0.80 at b17. Both citations lie in
PA IV.9, so the chapter siglum `Ζμδ9` is right either way — only the column
letter and line number are in question. A printed `b18` would *not* resolve
it (its window starts at b16); the resolving values are **b13–b16**.

### Hypotheses

1. **(a) Citation error — strongly supported.** A verbatim match one column
   away, inside the cited chapter, with a zero everywhere in the cited column.
   Two glyphs are wrong: `a`→`b` and `18`→`14/15`.
2. **(b) Paraphrase — ruled out.** Word order, inflection and article are
   identical; only Bonitz's `ȣ̓χ` for `Οὐκ οὖν` differs, which is his normal
   compression of the connective.
3. **(c) Mis-transcription — open, needs the ink.** Three readers agree
   (`opus`: `685 ª18`; `llama400` and `llama-best`: `685 a18`), but they read
   the same scan, so agreement is not independence. Two coupled changes are
   more than a single-glyph slip usually needs.

### What a ruling does

- **John reads the ink at 054-R:18.** If it prints `b15` (or b13/b14/b16),
  the transcription is wrong → correct the citation in the corpus toward the
  ink.
- If it prints `a18`, the error is Bonitz's → keep as printed (diplomatic) and
  **record a corrigendum** noting the true locus 685b15.

---

## A3. 054-R:28 — Πη14. 1332 b32

### Bonitz

```
26| ἀναγκαῖαι, dist ἁπλῶς κάλλισται Πη13. 1332 a13, 16. »τῶν
27| πρακτῶν τὰ μὲν [εἰς τὰ] ἀναγκαῖα ϗ̀ χρήσιμα, τὰ δὲ [εἰς
28| τὰ] καλά· τὰ ἀναγκαῖα ϗ̀ χρήσιμα τῶν καλῶν ἕνεκεν« 【Πη14.
29| 1332 b32, a36.】 μαθήσεις ἀναγκαῖαι ϗ̀ χάριν ἄλλων, opp
```

Again a **pair**: `1332 b32` and `1332 a36`.

### The cited passage

```
1332b30  βουλόμενοι πάντες οἱ κατὰ τὴν χώραν, τοσούτους τε εἶναι
1332b31  τοὺς ἐν τῷ πολιτεύματι τὸ πλῆθος ὥστ' εἶναι κρείττους πάντων
1332b32  τούτων ἕν τι τῶν ἀδυνάτων ἐστίν. ἀλλὰ μὴν ὅτι γε   ← CITED
1332b33  δεῖ τοὺς ἄρχοντας διαφέρειν τῶν ἀρχομένων, ἀναμφιςβήτητον.
1332b34  πῶς οὖν ταῦτ' ἔσται καὶ πῶς μεθέξουσι, δεῖ σκέψασθαι
```

And the companion, 1332a36, is no better — it is about ἀνὴρ σπουδαῖος:

```
1332a35  μετέχουσι τῆς πολιτείας. τοῦτ' ἄρα σκεπτέον, πῶς ἀνὴρ γίνεται
1332a36  σπουδαῖος. καὶ γὰρ εἰ πάντας ἐνδέχεται σπουδαίους
```

### Measured

Scored `πρακτων, αναγκαια, χρησιμα, καλα, αναγκαια, χρησιμα, καλων, ενεκεν`;
matched none; **0.00**.

### Alternative-locus scan

Both halves of Bonitz's quote sit on the next page, and — decisively — **at
the same two line numbers, 32 and 36**:

```
1333a31  βίος εἰς ἀσχολίαν καὶ σχολὴν καὶ εἰς πόλεμον καὶ εἰρήνην,
1333a32  καὶ τῶν πρακτῶν τὰ μὲν [εἰς τὰ] ἀναγκαῖα καὶ χρήσιμα
1333a33  τὰ δὲ [εἰς τὰ] καλά. περὶ ὧν ἀνάγκη τὴν αὐτὴν
1333a34  αἵρεσιν εἶναι καὶ τοῖς τῆς ψυχῆς μέρεσι καὶ ταῖς πράξεσιν
1333a35  αὐτῶν, πόλεμον μὲν εἰρήνης χάριν, ἀσχολίαν δὲ
1333a36  σχολῆς, τὰ δ' ἀναγκαῖα καὶ χρήσιμα τῶν καλῶν ἕνεκεν.
```

Bonitz's first clause = 1333a32–33 (including his bracketed `[εἰς τὰ]`, which
our reference text also brackets). His second clause = 1333a36 verbatim.
Scores: 1.00 at 1333a33/a34, 0.75 at a30–a32.

So `b32, a36` maps onto `a32, …36` with **both line numbers preserved**. The
only differences are the page digit (1332→1333) and the first column letter
(b→a). Under the reading `1333 a32, 36` the comma takes Bonitz's ordinary
same-column sense, as at line 26 above (`1332 a13, 16`).

Both readings stay inside Politics VII.14, so `Πη14` is right either way.

### Hypotheses

1. **(a) Citation error — strongly supported.** Two verbatim matches at the
   preserved line numbers, zero at both printed loci. A compositor repeating
   the `1332` he had just set twice in the same entry is the ordinary form of
   this slip.
2. **(c) Mis-transcription — open, needs the ink.** `opus` reads
   `1332 b32, ª36`; `llama400` and `llama-best` read `1332 b32, a36`. Agreed,
   but not independent.
3. **(b) Paraphrase — ruled out.** Verbatim, brackets and all.

### What a ruling does

- **John reads the ink at 054-R:29.** If it prints `1333 a32, 36` → correct
  the citation in the corpus toward the ink.
- If it prints `1332 b32, a36` → keep as printed and **record a corrigendum**
  giving the true locus 1333a32, 36.

---

## A4. 057-R:23 — Αα14. 33a12

### Bonitz

```
22| ἀναιρεῖν ἐναντίως Αβ9. 60a16 Wz. »ὁ καταφατικὸς συλ-
23| λογισμὸς ἀναιρεῖται τῷ στερητικῷ« 【Αα14. 33a12.】 ἀναιρεῖν
24| τὸ πρόβλημα. τὸ προκείμενον. τὸν ὁρισμόν, τὴν ἐρώτησιν, τὴν
```

### The cited passage

```
33a10  ἐνδέχεται καὶ παντὶ ὑπάρχειν· τοῦτο δ' εἴρηται πρότερον.
33a11  ὥστ' εἰ τὸ μὲν Β παντὶ τῷ Γ, τὸ δ' Α παντὶ τῷ Β,
33a12  πάλιν ὁ αὐτὸς γίνεται συλλογισμός. ὁμοίως δὲ καὶ εἰ πρὸς   ← CITED
33a13  ἀμφοτέρας τὰς προτάσεις ἡ ἀπόφασις τεθείη μετὰ τοῦ ἐνδέχεσθαι.
33a14  λέγω δ' οἷον εἰ τὸ Α ἐνδέχεται μηδενὶ τῷ Β καὶ
```

### Measured

Scored `καταφατικος, λογισμος, αναιρειται, στερητικω`; matched none; **0.00**.
(`λογισμος` is an artefact of Bonitz's own line break `συλ-`/`λογισμὸς`; the
word is `συλλογισμός`.)

### Alternative-locus scan

**Verbatim, one column over:**

```
33b9   οὐδεὶς γίνεται συλλογισμός. ἢ γὰρ τοῦ ὑπάρχειν ἢ τοῦ ἐξ
33b10  ἀνάγκης ἢ τοῦ ἐνδέχεσθαι πᾶς ἐστὶ συλλογισμός. τοῦ μὲν
33b11  οὖν ὑπάρχειν καὶ τοῦ ἀναγκαίου φανερὸν ὅτι οὐκ ἔστιν· ὁ μὲν
33b12  γὰρ καταφατικὸς ἀναιρεῖται τῷ στερητικῷ, ὁ δὲ στερητικὸς   ← TRUE LOCUS
33b13  τῷ καταφατικῷ. λείπεται δὴ τοῦ ἐνδέχεσθαι εἶναι· τοῦτο δ'
```

Reported 0.75 at 33b9–b14. The missing quarter is only the broken-word token
`λογισμος`; `συλλογισμός` itself stands at 33b9 and 33b10, inside the window.
On the real words the match is **4 of 4**.

`33a12` and `33b12` both lie in An. Pr. I.14, so `Αα14` is right either way.
**This is a single-glyph difference: `a` → `b`.**

### Hypotheses

1. **(a) Citation error — strongly supported, and the cleanest of the set.**
   One glyph, verbatim match, same chapter, zero at the printed locus.
2. **(c) Mis-transcription — open, needs the ink, and likelier here than in
   A2/A3** precisely because it is a single letter. All four readers give
   `33 a12`, but a raised `a`/`b` in this type is the classic confusion.
3. **(b) Paraphrase — ruled out.** Verbatim.

### What a ruling does

- **John reads the raised letter at 057-R:23.** If it is `b` → correct the
  citation in the corpus toward the ink.
- If it is `a` → keep and **record a corrigendum** giving 33b12.

---

## A5. 057-R:31 — Μκ5. 1062b11

### Bonitz

```
29| 1173a1. ἀναιρεῖν »τὸ διαλέγεσθαι, τȣ̀ς λόγȣς, τὸ ἐπίστα-
30| σθαι, τὰ εἴδη, τὴν ȣ̓σίαν, τὰς ἀρχάς, πολλὰ τῶν ἐνδόξων«
31| sim 【Μκ5. 1062b11.】 6. 1063b11. γ4. 1006a26. 8. 1012
32| b15. 4. 1007a20. α2. 994b20. Α9. 992b9, 990b18. μ4.
33| 1079a14. 8. 1082b33. θ3. 1047a20. Φα2. 185a2. 8. 191
34| b12. β4. 196a14. γ6. 206a17. Οα12. 283a6. γ4. 303
35| a23. ατ969a20.
```

This is **not a quotation**. It is a list of objects governed by `ἀναιρεῖν`,
followed by a run of eighteen citations covering them. quotecheck's
running-prose gate fired on the list articles `τὸ / τȣ̀ς / τὰ / τὴν / τὰς`,
which here are list morphology, not prose. The span it then scored is the
list's *tail*; the first citation answers to the list's *head*.

### The cited passage

```
1062b9   ἀληθῆ κατάφασιν ὑπάρχειν. εἰ δ' ἔστι τι, λύοιτ' ἂν τὸ
1062b10  λεγόμενον ὑπὸ τῶν τὰ τοιαῦτα ἐνισταμένων καὶ παντελῶς
1062b11  ἀναιρούντων τὸ διαλέγεσθαι.   ← CITED
1062b12  Παραπλήσιον δὲ τοῖς εἰρημένοις ἐστὶ καὶ τὸ λεχθὲν ὑπὸ
```

`ἀναιρούντων τὸ διαλέγεσθαι` — verb and first list item, exactly.

### Measured

Scored `λογους, επιστα, σθαι, ειδη, ουσιαν, αρχας, πολλα, ενδοξων`; matched
none; **0.00**. (`επιστα`/`σθαι` is again the hyphen-break artefact for
`ἐπίστασθαι`.) Best alternative anywhere is 0.50 and is noise.

### Every citation in the run checks out

Each locus carries `ἀναιρεῖν` with one of the listed objects:

| citation | reference text | list item |
|---|---|---|
| 1062b11 | ἀναιρούντων **τὸ διαλέγεσθαι** | τὸ διαλέγεσθαι |
| 1063b11 | ἀναιροῦσι **τὸ διαλέγεσθαι** καὶ ὅλως λόγον | τὸ διαλέγεσθαι |
| 1006a26 | **ἀναιρῶν** γὰρ **λόγον** ὑπομένει λόγον | τȣ̀ς λόγȣς |
| 1012b15 | αὐτοὺς ἑαυτοὺς **ἀναιρεῖν** | τȣ̀ς λόγȣς |
| 1007a20 | **ἀναιροῦσιν** οἱ τοῦτο λέγοντες **οὐσίαν** καὶ τὸ τί ἦν εἶναι | τὴν ȣ̓σίαν |
| 994b20 | **τὸ ἐπίστασθαι ἀναιροῦσιν** οἱ οὕτως λέγοντες | τὸ ἐπίστασθαι |
| 992b9 | κινήσεται **τὰ εἴδη** … **ἀνῄρηται** σκέψις | τὰ εἴδη |
| 990b18 | **ἀναιροῦσιν** οἱ περὶ **τῶν εἰδῶν** λόγοι | τὰ εἴδη |
| 1079a14 | **ἀναιροῦσιν** οἱ περὶ **τῶν εἰδῶν** λόγοι | τὰ εἴδη |
| 1082b33 | **πολλὰ** γὰρ **ἀναιροῦσιν** | πολλά |
| 1047a20 | οὐ μικρόν τι ζητοῦσιν **ἀναιρεῖν** | — |
| 185a2 | πρὸς τὸν **ἀνελόντα τὰς ἀρχάς** | τὰς ἀρχάς |

Twelve of twelve. Nothing in this entry is wrong.

### Hypotheses

1. **(b) Not a quotation — established, not merely likely.** The entry is an
   analytical object-list; the head item is verbatim at the head citation, and
   every citation sampled carries its own list item. The zero is an artefact
   of scoring the list's tail against the head citation's line.
2. (a), (c), (d) — not reached. No citation is in question.

### What a ruling does

- **Mark the finding adjudicated-benign (analytical list, not a quotation).**
  No corpus edit, no ink read needed. This one can be ruled from the table
  above alone.

---

## A6. 061-R:59 — Μγ4. 1007b25 *(greek-only, 2-word denominator)*

### Bonitz

```
57| ȣ̓ γιγνώσκεσθαι τὸ ὅμοιον ὑπὸ τȣ͂ ὁμοίȣ resp ψα2. 405b14
58| Trdlbg. Anaxagorea doctrina, »τῷ μεμῖχθαι πᾶν ἐν παντί.«
59| tolli principium contradictionis Ar colligit 【Μγ4. 1007b25.】
60| 5. 1009a27. 7. 1012a26. κ6. 1063b25-30. — (Ἀναξαγό-
61| ρας certa emendatione restitutum est ξ2. 976a14).
```

The Greek is Bonitz's statement of the Anaxagorean **doctrine**, in apposition
to `Anaxagorea doctrina`; the sentence then says Aristotle infers from it the
abolition of the principle of contradiction, and gives four loci. Note the
three llama readers set a **comma** after `παντί`, not the period our
reconciled text carries — which makes the appositive reading plainer still.

### The cited passage

```
1007b23  λέγουσι λόγον. εἰ γάρ τῳ δοκεῖ μὴ εἶναι τριήρης ὁ
1007b24  ἄνθρωπος, δῆλον ὡς οὐκ ἔστι τριήρης· ὥστε καὶ ἔστιν, εἴπερ
1007b25  ἡ ἀντίφασις ἀληθής. καὶ γίγνεται δὴ τὸ τοῦ Ἀναξαγόρου,   ← CITED
1007b26  ὁμοῦ πάντα χρήματα· ὥστε μηθὲν ἀληθῶς ὑπάρχειν. τὸ
1007b27  ἀόριστον οὖν ἐοίκασι λέγειν, καὶ οἰόμενοι τὸ ὂν λέγειν περὶ
```

This is **exactly** where Aristotle draws the inference the Latin sentence
describes. The citation is correct for the claim it supports.

### Measured

Scored `μεμιχθαι, παντι` (Latin-dominated tail, so a 2-word denominator);
matched none; **0.00**.

### Alternative-locus scan

The verbatim source of Bonitz's Greek is **his own next citation**:

```
1009a27  Ἀναξαγόρας μεμῖχθαι πᾶν ἐν παντί φησι καὶ Δημόκριτος·
```

Score 1.00. Corpus-wide, `μεμῖχθαι` occurs 17 times; `μεμῖχθαι … ἐν παντί`
only here. So the doctrine-phrase belongs to `Μγ5. 1009a27`, the second
citation in the same run, and quotecheck scored it against the first only
because its quote span is "text since the previous citation".

### Hypotheses

1. **(b) Not a quotation of the cited line — established.** The Greek is a
   doctrine statement whose verbatim source is the very next citation; the
   cited line carries the inference the Latin sentence attributes to it. Both
   citations are right.
2. (a), (c), (d) — not reached.

### What a ruling does

- **Mark adjudicated-benign (span belongs to the following citation).** No
  corpus edit, no ink read. Rulable from this page.

---

## A7. 062-R:7 — ψα1. 402b21 *(greek-only, 2-word denominator)*

### Bonitz

```
 6| Πα5. 1254b9. τζ6. 145b12. 4. 141b9, 142a4. »de con-
 7| verso τȣ͂ αἰτίȣ et τȣ͂ αἰτιατȣ͂ ordine« 【ψα1. 402b21.】 Φβ9.
 8| 200a19. Ρα7. 1364a14. de inversa propositionum syllo-
 9| gismi ratione, ἀνάπαλιν τεθέντος τȣ͂ στερητικȣ, ἀνάπαλιν
```

The two Greek words are genitives governed by Bonitz's Latin
(`de converso … ordine`): this is his own analytic frame, not a quoted clause.

### The cited passage

```
402b19  μαθήμασι τί τὸ εὐθὺ καὶ τὸ καμπύλον, ἢ τί γραμμὴ καὶ ἐπίπεδον,
402b20  πρὸς τὸ κατιδεῖν πόσαις ὀρθαῖς αἱ τοῦ τριγώνου γωνίαι
402b21  ἴσαι), ἀλλὰ καὶ ἀνάπαλιν τὰ συμβεβηκότα συμβάλλεται   ← CITED
402b22  μέγα μέρος πρὸς τὸ εἰδέναι τὸ τί ἐστιν· ἐπειδὰν γὰρ ἔχωμεν
402b23  ἀποδιδόναι κατὰ τὴν φαντασίαν περὶ τῶν συμβεβηκότων,
```

`ἀλλὰ καὶ ἀνάπαλιν τὰ συμβεβηκότα συμβάλλεται … πρὸς τὸ εἰδέναι τὸ τί ἐστιν`
— the accidents contribute to knowing the essence, i.e. the order of cause and
caused runs backwards. The citation is exactly on point, and the headword of
the whole entry is `ἀνάπαλιν`, which stands at 402b21. The two companion loci
agree: `Φβ9. 200a19` = `ἐν δὲ τοῖς γιγνομένοις ἕνεκά του ἀνάπαλιν`;
`Ρα7. 1364a14` = `καὶ ἀνάπαλιν δὲ δυοῖν ἀρχαῖν…`.

### Measured

Scored `αιτιου, αιτιατου`; matched none; **0.00**.

### Alternative-locus scan

**No alternative locus exists.** Corpus-wide, `αἰτιατ-` occurs nine times, and
only four are the noun: `76a20 αἰτιατῶν`, `98a36 αἰτιατόν`, `98b3 αἰτιατόν`
(An. Post.) and `1065a11 αἰτιατοῦ` (Metaph.). The rest are `αἰτιᾶται` /
`αἰτιατέον`. **`αἰτιατ-` never occurs in the de Anima**, so the span cannot be
a quotation of any line in the cited work. The 0.50 hits the scan reports at
413a21, 417b21 etc. are STEM-5 false positives — `αιτιατου[:5]` = `αιτια`,
matching `αἰτίαν` / `αἴτιον`.

### Hypotheses

1. **(b) Not a quotation — established.** Bonitz's own Latin-framed
   terminology; the word is absent from the whole work cited; the citation is
   correct for the sense.
2. (a), (c), (d) — ruled out by the corpus-wide absence.

### What a ruling does

- **Mark adjudicated-benign (Bonitz's analytic Latin, not a quotation).** No
  corpus edit, no ink read. Rulable from this page.

---

## B. 059-L:39 — ἀνακύπτειν flagged out of alphabetical order

alphacheck reports: `page-059-L:39 ἀνακύπτειν out of run [ἀνακομίζειν …
ἀνακȣφίζει]`.

### The headword sequence in our text

```
p59-L:19  ἀνακομιδή, reditus, opp παραγίνεσθαι Ζιθ12. 597b9.
p59-L:20  ἀνακομίζειν τιμὴν πρὸς αὑτὸν ἐκέλευσεν οβ1347a9.
p59-L:21  ἀνακόπτω. νέφη ἀνακοπέντα κ4. 394a34.
p59-L:22  ἀνακȣφίζει ϗ̀ κωλύει κάτω φέρεσθαι πκε13. 939a35.
p59-L:23  ἀνακρίνειν τȣ̀ς ἐπαγγελλομένȣς τέχνην τι11. 172a32.
p59-L:26  ἀνάκρισις …
p59-L:28  ἀνακτᾶσθαι. ἀνεκτήσατο τȣ̀ς πολίτας οβ1349a31.
p59-L:32  ἀνακυΐσκειν. τὰ πρόβατα …
p59-L:34  ἀνακυκλεῖν. intrans ἀνάγκη ἀνακυκλεῖν ϗ̀ ἀνακάμπτειν …
p59-L:38  Ἀνακυνδαράξης, Σαρδαναπάλλȣ πατήρ f 77. 1488b10.
p59-L:39  ἀνακύπτειν. τὰς περιστερὰς μὴ ἀνακύπτειν πινȣ́σας Ζιι7.   ← FLAGGED
p59-L:41  ἀνακύπτων (i e ἀναδυόμενος ἐκ τῆς θαλάττης) Ζιι34. 620a9.
p59-L:42  ἀνακωχεύειν Οδ6. 313a23.
p59-L:43  ἀναλαμβάνειν, opp ἐκβάλλειν Ζιι34. 619b26.
```

Under alphacheck's own sort key (accents ignored, final sigma folded, `ȣ`
spelled out) this runs:

```
ανακομιδη · ανακομιζειν · ανακοπτω · ανακουφιζει · ανακρινειν · ανακρισισ ·
ανακτασθαι · ανακυισκειν · ανακυκλειν · ανακυνδαραξησ · ανακυπτειν ·
ανακυπτων · ανακωχευειν · αναλαμβανειν
```

**Strictly ascending — verified mechanically.** `ἀνακύπτειν` is exactly where
it belongs, between `Ἀνακυνδαράξης` and `ἀνακύπτων`. There is no order
violation in our text.

### Where the flag comes from

`reconciled_headwords` matches each LlamaParse bold run to a line-initial word
by fuzzy ratio, greedily. LlamaParse's bold candidates for page 59, in page
order, begin:

```
ἀνακομιδή · ἀνακομίζειν · ἀνακόπτειν · ἀνακυφίζει · ἀνακρίνειν · …
… ἀνακυκλεῖν · Ἀνακυνδαράξης · ἀνακύπτειν · ἀνακωχεύειν · …
```

LlamaParse's third candidate is **ἀνακόπτειν**. Against our line 21
(`ἀνακόπτω`) it scores lower than against our line 39 (`ἀνακύπτειν`) — one
letter apart, `ο`/`υ`, with the whole `-πτειν` ending shared. So the greedy
matcher assigned candidate #3 to line 39 and marked it used; the real
`ἀνακύπτειν` candidate then fell through to line 41 (`ἀνακύπτων`). Line 39,
now sitting at sequence position 21 between `ἀνακομίζειν` and `ἀνακȣφίζει`,
cannot join the ascending run and is reported.

**The flag is a matcher artefact, not an order error.**

### But it surfaced a real reader split

The readers disagree 2–2 at **059-L:21**:

| reader | 059-L:21 |
|---|---|
| opus | **ἀνακόπτω**. νέφη ἀνακοπέντα κ4. 394a34. |
| llama400 | **ἀνακόπτω**. νέφη ἀνακοπέντα κ4. 394 a34. |
| llamaparse | **ἀνακόπτειν**. νέφη ἀνακοπέντα κ4. 394 a34. |
| llama-best | **ἀνακόπτειν**. νέφη ἀνακοπέντα κ4. 394 a34. |

The corpus currently carries `ἀνακόπτω`. Alphabetical order does **not**
decide it: the sequence is ascending under either reading (verified). The
surrounding entries are mostly infinitives (`ἀνακομίζειν`, `ἀνακρίνειν`,
`ἀνακτᾶσθαι`, `ἀνακυΐσκειν`, `ἀνακωχεύειν`), which argues for `ἀνακόπτειν` —
but the very next line is `ἀνακȣφίζει`, a third-singular indicative, so Bonitz
demonstrably does print non-infinitive headwords in this stretch.

### Hypotheses

1. **The alphacheck violation is a candidate-matching artefact — established.**
   Our page-059-L headword order is strictly alphabetical under alphacheck's
   own key.
2. **A genuine open question at 059-L:21**, `ἀνακόπτω` vs `ἀνακόπτειν`, split
   2–2 across readers and undecidable by order.

### What a ruling does

- **Dismiss the 059-L:39 flag** as a matcher artefact. No corpus edit at
  line 39, no corrigendum.
- **John reads the ink at 059-L:21.** Whichever way it goes, set the headword
  toward the ink; if the ink shows `ἀνακόπτειν`, that is also a corpus fix,
  not merely a note.

---

## Summary of what each ruling costs

| # | item | needs the ink? | likeliest action |
|---|---|---|---|
| A1 | Φη3. 247 b21 | no — needs Ross | record recension note, close |
| A2 | Ζμδ9. 685 a18 | **yes** (054-R:18) | fix citation toward ink, or corrigendum → 685b15 |
| A3 | Πη14. 1332 b32 | **yes** (054-R:29) | fix citation toward ink, or corrigendum → 1333a32, 36 |
| A4 | Αα14. 33a12 | **yes** (057-R:23) | fix citation toward ink, or corrigendum → 33b12 |
| A5 | Μκ5. 1062b11 | no | mark adjudicated-benign (analytical list) |
| A6 | Μγ4. 1007b25 | no | mark adjudicated-benign (span belongs to next citation) |
| A7 | ψα1. 402b21 | no | mark adjudicated-benign (Bonitz's analytic Latin) |
| B | ἀνακύπτειν | **yes** (059-L:**21**, not :39) | dismiss the flag; rule ἀνακόπτω / ἀνακόπτειν |

Four items (A1, A5, A6, A7) can be ruled from this document alone. Four need
the 400 dpi ink, and three of those are a single question each: what raised
letter and what digits does the citation actually print.
