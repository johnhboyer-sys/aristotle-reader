# The next sweep validators — design, 2026-08-12

What can still be checked mechanically that nothing checks today. Grounded in
a full inventory of the existing rules (smyth_sweep A1–E3, bekker, quotecheck,
alphacheck, siglum_check, lexcheck, ngram_check, breathing_oracle,
accent_law): the three gaps below are confirmed unclaimed — no existing rule
touches them.

Standing design rules, from this pipeline's own failures:

- **Volume as well as verdict.** Every report states what was examined and
  what was skipped, by reason. A check that can answer "nothing" without
  distinguishing *found nothing* from *never looked* repeats the defect fixed
  four times already.
- **A finder, never a fixer.** Findings become cards; the diplomatic rule
  holds (a "wrong" form may be exactly what the printer set).
- **An authority claims no more than its evidence.** Absence from an index
  is absence from the index, not absence from the world.

## B2 — cited line number exists on the cited page  *(smallest, do first)*

**Claim.** `Ζιε13. 544a32` asserts Bekker page 544, column a, line 32. If the
corpus's column 544a ends at line 30, the citation is impossible — a digit
error in exactly the place OCR digit errors do the most harm.

**Nothing checks this.** `bekker.py` and `siglum_check.py` do not capture the
line number at all. `quotecheck.py` is the only parser that captures it
(CITE_RE), and when the cited line's window is empty it silently `continue`s
— the impossible address is the one case it structurally cannot report.

**Mechanics.** Parse citations with `quotecheck.CITE_RE` over
`work/reconciled`. Column inventory from the same corpus quotecheck reads
(`app/dist/data/*/book-*.json`): per column id, the set of line numbers
present. Flag: column absent from corpus (tier: `no-corpus`, expected for the
8 works with no Greek text — reported as skipped-with-reason, never as
clean), or line number absent from an existing column (tier: `finding`).
Fuzz: Bekker lines are John's "tick pegs to line bulk" — editions drift a
line or two, so flag only when the cited line exceeds the column's max by >2
or the column simply has no such line anywhere in ±2. Start strict-report,
measure the false-positive rate, tighten after.

## B1 — the headword occurs at the cited address  *(the index's own contract)*

**Claim.** Bonitz is an index verborum: an entry's citations point at places
where the headword (some inflection of it) occurs. A citation under ἀγγεῖον
pointing at a line with no ἀγγει-/ἀγγος- form is either a digit error, a
siglum error, or a misread headword.

**Nothing joins headword → citation → corpus line today.** alphacheck knows
headwords but only their order; quotecheck scores the quotation span, whose
8-word tail normally excludes the headword.

**Mechanics.**
- Headword per entry from alphacheck's identification (LlamaParse bold runs
  matched into reconciled text).
- Address lookup via the corpus quotecheck loads (line-keyed) — not
  `locate.py`'s stream, which is diacritic-stripped but offset-addressed.
- Matching: accent-blind skeleton (the lexcheck convention), ligatures
  expanded, and STEM-style prefix matching (quotecheck uses 5) to cover
  inflection. `morpheus.py` cannot help as-is — it discards the lemma column
  of greek-analyses.txt; a form→lemma map is a re-parse of the same file if
  stem matching proves too loose. Measure stem-only first.
- Window ±2 lines, same reasoning as B2.
- ⚠ False-positive classes to tier separately, not suppress: `cf`-citations
  (Bonitz cites for the CONCEPT), citations inside quotations of other
  works, entries whose headword is Latin, the 8 Greek-less works.

**This one is measured before it is trusted:** run it over pages 15–62 where
the corpus is ground truth, count how many flags a human confirms, and only
then decide its tier.

## B3 — Latin apparatus tokens against a lexicon  *(unclaimed territory)*

**Claim.** Bonitz's Latin prose (`significat`, `afferenda`, editor names,
`opp`/`cf`/`sim`) is invisible to every Greek sweep. An OCR error inside it
(`signifcat`, `aflerenda` — both shapes the engines actually produced on the
holdout) survives every existing gate.

**There is no Latin lexicon anywhere in the pipeline today.** Latin is only
handled as exclusion (quotecheck), chunk boundaries (ngram_check's ~30
abbreviations), or homoglyph encoding (latin_fix, siglum_check).

**Mechanics.** Non-Greek tokens from reconciled columns, checked against, in
order: Bonitz's own abbreviation key (pp. 11–12, transcribed in
work/kraken/NOTES.md), an editor/sigla allowlist (Vhl, Bk, Bz, Trdlbg, Spgl,
Wz, Nck …), German/French title words seen in citations, then a Latin word
list (the aristotle-reader repo carries a 116K-form Latin morphology from the
shared reader work — verify its path and license before wiring). Unknown
token → finding. ⚠ Allowlists fail silently: the report must print the
allowlist's size and hit counts, and a test pins that a known-good column
produces zero findings WITH the allowlist and nonzero without it.

## B4 — a diacritic that should sit ON the ȣ ligature  *(measured, not guessed)*

Added 2026-08-21, out of a reader-error correlation study run once 15–106 was
fully adjudicated and ground truth existed for the first time.

**Claim.** `ȣ` expands to ου, and a Greek accent frequently falls on that ου —
`τοῦ`, `Μοῦσαι`, `ἀκολουθοῦσι`. The ligature has no precomposed accented form,
so the mark must be a combining sequence after it. **Every text reader tends to
drop it**, and nothing checks that it is there.

**The evidence this exists, before a line is written.** Scoring `opus`, `genie`
and `llama` against the adjudicated verdicts at 1,703 disputed sites: opus 84.9%
correct, llama 37.0%, genie 21.3%. Opus and llama agree on the *same wrong*
character only **12 times in 1,703** — their errors are effectively
decorrelated despite both being Claude-family (LlamaParse agent mode is a
`sonnet-3.5` wrapper). But **7 of those 12 are a dropped combining mark on ȣ**:
`ἀκολȣθȣ͂σι` read as `ȣθȣ` five times, `Μȣ̃σαι` as `ȣσιΜȣ`, `τȣ̀ς` as `ȣ`. This
is the one residual SHARED blind spot, and it is the class John's 103-R:32
correction (`δȣλοις` → `δȣ́λοις`) belongs to. DeepSeek's vision model failed the
same class independently.

**Scale.** 4,342 ȣ in 15–106; **2,719 (62.6%) carry a combining mark** — 1,311
perispomeni, 771 smooth, 285 acute, 227 grave, 93 rough, 32 combining tilde.
1,623 are bare (939 word-medial, 683 word-final, 1 initial). Most bare ones are
correct: `λόγȣ` = λόγου, `ἀνθρώπȣ` = ἀνθρώπου, `ἔχȣσιν` = ἔχουσιν all accent
elsewhere in the word.

**Nothing checks this.** `lexcheck` tests ȣ against plain υ — whether the
LIGATURE is there — never whether it kept its accent. `accent_law` works on
precomposed Greek vowels and cannot see a mark on a Latin-block ligature.
`diacritic_sweep` compares against LlamaParse, which is one of the two readers
that drops it. A bare ȣ where a mark belongs is invisible to every existing rule.

**Mechanics, three tiers, cheapest first.**

1. `self-inconsistency` — **needs no lexicon and is the strongest signal.** The
   corpus writes a form both ways. Standalone `τȣ` is bare 69 times while
   `τȣ͂` appears 689 times; every sampled bare context is the genitive article
   (`τȣ γευστȣ`, `τȣ ἐλέγχȣ`, `τȣ ἀδικήματος`, `i e τȣ πράττειν`). Rule: for
   each bare-ȣ token, if the same token with a mark is attested elsewhere in
   the corpus at a ratio above some floor, flag it with both counts.
2. `accentuation` — expand ȣ→ου and look the word up in the ACCENTED Aristotle
   text (`app/dist/data`, 49 works — not `work/aristotle-forms.json`, which is
   accent-stripped by `lexcheck.bare()`). Flag when the attested accentuation
   puts the mark on the ου. ⚠ Bonitz's accentuation differs from the TLG often
   enough that `lexcheck` deliberately ignores accents; so this tier is a
   candidate generator, never a verdict.
3. `cold-reader` — kraken emits marks on the ligature (786 marked vs 480 bare
   over 60 sampled columns), was trained on this typeface, and is genuinely
   independent of the Claude family. Where kraken reads a mark and the corpus
   is bare, that is the strongest single piece of evidence available.

**Report volume as well as verdict**: bare ȣ examined, by word position; skipped
with reason (token not in the Aristotle text; column not segmented, so no cold
reader). A count of zero must distinguish *found nothing* from *never looked*.

**A finder, never a fixer.** Bonitz may simply have set it bare, and the
diplomatic rule holds: findings become cards and John rules from the 400 dpi ink.

**One free by-product.** 17 sites write `τȣ` + COMBINING TILDE where 689 write
COMBINING GREEK PERISPOMENI. `john_rulings.canon()` already unifies the two for
comparison — precisely because `verdict_drift` once reported 82 ligature rulings
as lost over it — but the corpus itself is inconsistent. Worth normalising in
the same pass, as a separate report: it is an encoding question, not a reading
one, and no ruling is needed.

## Also confirmed while inventorying (not new work)

- Grave-before-pause exists as B2/§154a for `. · ;` only; the comma is
  excluded deliberately (Bonitz prints `Ἀδριαναὶ,`). Leave it.
- breathing_oracle's generalise-from-absence defect (Grok, 2026-08-10) is
  still the top open item on the existing-rules side: require positive LSJ
  support before condemning. Costs coverage — measure first.
