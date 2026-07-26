# Bonitz *Index Aristotelicus* — Three-Reader Transcription & Comparison (Handoff)

*Hand this whole file to a fresh session. It is self-contained. Goal: transcribe the
remaining pages of Bonitz's* Index Aristotelicus *(Berlin 1870) by running three
independent readers — Opus, History Genie, and LlamaParse — and comparing them, so a
human only ever reviews the spots where they disagree or a check fails.*
Prepared 2026-07-21.

---

## 0. TL;DR

Three different OCR/transcription engines read each column independently. Where all
three agree, trust it. Where they disagree, flag it and let an Opus adjudicator settle
it against the page image. A separate, non-AI "deterministic pass" checks facts about
the book (real Greek words, real citations, alphabetical order) to catch mistakes the
readers *share*. The human works only the flag queue. Target: residual errors well
under 1%, hand-correction measured in hours of triage, not weeks of transcription.

**Read these existing files first for full context:**
`bonitz/BONITZ_PROJECT.md`, `bonitz/BONITZ_HANDOFF.md`, `bonitz/pilot/PILOT_REPORT.md`,
and the pipeline modules in `bonitz/bonitz_pipeline/`.

---

## 1. Where things stand

- Source: `bonitz/book.pdf` — the full scan (~896 PDF pages). Index body = printed
  pages **15–885**; Addenda **886–890**. Two dense columns per page.
- **Pages 15–60 (α section) already exist** in `bonitz/output/` **but must be redone.**
  They were transcribed with ligature-expansion folded into the reading step (which
  corrupted a number of forms with no raw original kept), and every file has wrong
  internal page/column metadata (the model guessed the page number because the running
  head was cropped out). So treat 15–60 as *not done*.
- Everything else (61–890) is fresh.
- **Printed page = PDF page − 12** (confirmed 2026-07-21: PDF 16 carries printed
  number 4; PDF 201 carries 189). PDF 14 = abbreviation key, PDF 15 = α section
  start (printed 3). **File naming stays in PDF pages** (`page-NNN` = PDF page,
  as everywhere on disk); use the −12 mapping only when reading printed running
  heads/page numbers. Index body = PDF 15–885, Addenda = PDF 886–890.

## 2. Core principles (do not violate)

1. **Read faithfully first; keep the raw read immutable.** Each reader's raw output is
   saved once and never edited in place. All cleanup happens on copies.
2. **Do not fold expansion into reading.** Ligatures (ϗ, ȣ) are kept raw in the read.
   Expanding/accenting them is a separate, clearly-labeled later step. (Folding
   expansion into the read is what corrupted the α batch.)
3. **Three genuinely independent readers.** Their value is that they fail in different
   places. Do not substitute a second Opus pass for a real third engine.
4. **Inject page/column; never let a model guess them.** The batch loop knows the page
   and column — set them in the metadata directly. Do not ask the reader to emit them.
5. **Deterministic checks are the safety net** for errors the readers share.
6. **Escalate effort only where needed** — light pass everywhere, heavy adjudication
   only where readers disagree or a check fails.

---

## 3. The three readers

### 3a. Opus (Claude vision)
- Use a **faithful/diplomatic** prompt: transcribe verbatim, **keep ϗ and ȣ raw**, do
  NOT expand or accent them, do NOT emit page/col (injected separately). This is a
  *different* prompt from the old `transcribe.py` one, which expanded during reading —
  do not reuse that.
- Strongest single reader in the pilot (≈9% CER, ~94% Bekker recall). It is also the
  **adjudicator** in §5 — a good use of its image-reading strength.

### 3b. History Genie (Stanford CHURRO)
- A vision-language model built for historical documents (`history.genie.stanford.edu`).
- Independent of Opus and LlamaParse — different training, different failure modes.
- **Access method (confirmed):** per-file **web UI upload**, returns a **.docx**. The
  book was split into ~5 files for upload. **It hangs on overly long files** — so keep
  each upload modest, split any file that stalls into smaller ones, and **keep a
  page-range map** (which printed pages are in which file) so outputs can be aligned to
  Opus/LlamaParse later. No batch API in use.
- **Export options:** `.docx` or `.txt`, each in **"full text"** (reflowed) or **"line
  breaks as is"** (one printed line per line) mode. **Recommended: "line breaks as is"** —
  it isolates the page-boundary junk (running heads, signatures, gutter numbers, stray
  column-top lemmas) onto their own lines, where the normalizer strips them cleanly;
  "full text" reflow risks blending that junk into real entries and doing its own
  cross-column merge. Rejoin end-of-line hyphens deterministically. Prefer `.docx` (keeps
  bold lemmata, useful for the alphabetical-order check); `.txt` is simpler and has the
  same text.
- Published accuracy on hard historical text is ~76%; treat it as one independent vote,
  not ground truth. Quality on clean pages (e.g. page 15) is high; see §4b for its
  systematic quirks — especially its page-boundary behavior, which is the "column
  trip-up" to watch for.

### 3c. LlamaParse (Agentic tier)
- Script already on disk: `bonitz_llamaparse_pilot.py` (repo root). It uses the classic
  `llama-parse` SDK on the Agentic tier (`premium_mode=True`) with the Bonitz custom
  prompt, `do_not_unroll_columns=True`, markdown output.
- The full custom prompt also lives in `bonitz-llamaparse-instructions.md`.
- **Operational gotchas already discovered:**
  - Run with `python3` / `pip3` (macOS has no `python`).
  - `export LLAMA_CLOUD_API_KEY="llx-..."` — a **LlamaCloud** key. Account is **US
    region** (`cloud.llamaindex.ai`), so leave `BASE_URL` empty.
  - **Their OCR language list has NO Greek** (`el` is rejected). Leave `language`
    unset; the Agentic vision model reads the Greek directly.
  - The `llama-parse` package is deprecated (warning is harmless); migrating to
    `llama-cloud-services` is optional later.
  - `target_pages` is 0-indexed.
  - **Credits:** ~10,000 free credits available. Agentic tier costs more per page —
    measure credits-used on a small pilot and multiply by ~890 before committing; the
    budget may not cover the whole book at the top tier.

## 4. Per-reader quirks to normalize (from the page-15 pilots)

Each reader has its own *systematic* deviations. Catalog them once and a normalizer
turns each reader's raw output into a common, comparable form. Opus (faithful prompt)
should be cataloged the same way from its own pilot.

### 4-pre. Print-level traps (bite ALL readers — belongs in every reader AND adjudicator prompt)

- **The kai-ligature is ACCENTED in the print** (John confirmed 2026-07-22;
  unaccented καί barely exists in Greek): `ϗ̀` in running text, `ϗ́` expected
  before a pause. Readers must record the mark; most agents in pages 15–44
  silently dropped it and one recorded acutes for graves. Reconciled output
  was repaired deterministically (grave everywhere; no pre-pause instance
  occurred in 15–44). Adjudicators: bare `ϗ` agreement across readers is NOT
  evidence the print is bare.
- **ὔ vs ȣ:** upsilon with smooth breathing + acute (αὔταρκες) can look like the
  ȣ ligature. ȣ is a tall o-stacked-over-u; a small double mark above a plain υ is
  ὔ. (Found by John on p15R: two readers wrote αȣταρκες.)
- **Italic α in work sigla is x-shaped and mimics κ.** Adjudicators judged `Πα2`
  as `Πκ2` twice (p15R, p23R) even against a correct dissent. Sanity-check the
  book letter against the work's book count: *Politics* = Π + α–θ ONLY, so `Πκ`
  is impossible. Weigh citation plausibility, not just glyph shape — a 2-1
  majority can be systematically wrong on italic sigla.

### 4a. LlamaParse
The pilot was high quality (columns clean, accents intact, ϗ kept raw, full coverage),
but with **systematic, scriptable** deviations. A normalizer must handle these:

- **It expands ȣ → ου** (did not keep it raw), though it keeps ϗ raw. Its expansions
  looked accentually plausible but must be treated as *suggestions*, not trusted.
- **Column letter `a` comes out as markdown `<sup>a</sup>`** while `b` is inline; strip
  the `<sup>` tags so both are plain inline letters.
- **Stray spaces in citations and abbreviations** (`367 b2`, `1458 <sup>a</sup>12`,
  `μβ 8`) — normalize to `367b2`, `1458a12`, `μβ8`.
- **Occasional gutter line-number leak** — e.g. a bare `35` dropped into the ἄβρωτος
  entry. Scan for and strip stray isolated 2-digit numbers that match the gutter
  sequence (…5,10,15,20…).
- **Grabs the bottom printer's signature** (e.g. `A 2`) — drop it.

### 4b. History Genie (CHURRO, hosted web UI)
High-quality Greek and accents, and *within* a page correct column order (page 15 is
clean). But heavy, systematic markup plus page-boundary junk:

- **Page-boundary "column trip-up" (the main issue).** At each page top it emits, as
  stray standalone lines: a `---` separator, the printer's signature (`Β 2`, `C`, `D 2`),
  the running head (`ἀγορανομία — ἀγών`), a **leaked gutter number** (5, 7, 8, 11…), and
  **the two column-top lemmas as isolated fragments** (e.g. `’Αγαπήνωρ` /
  `ἀγκιστροφάγος`). ~17 such boundaries in the first upload file. Strip all of it; the
  stray lemmas duplicate the real entries that follow.
- **Expands BOTH ligatures** (ϗ→καὶ, ȣ→ου) and marks the expanded letters with markdown
  underscores/italics (`κ_αὶ_`, `καθόλ_ο_υ`). Strip the underscores; treat expansions as
  suggestions — it mis-expands sometimes (`ἀθρόος` for `ἀθρόου`, `τὰς` for `τοὺς`).
- **LaTeX-math markup** for abbreviation letters and superscripts (`$\mu\beta$`, `$^b$`,
  sometimes `$^\text{b}$`), and sometimes real Unicode superscripts (`ᵃ/ᵇ`) instead —
  inconsistent. Convert all to plain inline (`μβ`, `b`).
- **Spaces out** abbreviation letters and citations (`Η γ 2`, `1179 ᵇ18`) — collapse.
- **Line-per-paragraph:** each printed line is its own paragraph, end-of-line hyphenation
  kept (`φθέγ-/γονται`). Rejoin lines to rebuild entries. (LlamaParse instead reflows to
  entries — the opposite quirk.)
- **Occasional misreads** (`Bkᵃ`→`Bk¹`, `codd`→`cod`) — ordinary reader noise the
  comparison/adjudication catches.

**Mitigation worth trying:** feed CHURRO **pre-split single columns** (crop with
`bonitz_pipeline/split_columns.py`, which already trims running heads / gutter / margins)
assembled into a one-column-per-page PDF. If it never sees the two-column layout or the
gutter numbers, the page-boundary junk largely disappears *at the source* — cleaner than
removing it afterward. Works whether CHURRO is hosted or run locally.

---

## 5. Comparison & reconciliation workflow

1. **Run all three readers** on the same columns.
2. **Canonicalize for comparison only** (keep each reader's raw output archived
   untouched). For the diff: NFC-normalize; strip markup (`<sup>`, etc.); normalize
   citation spacing to `NNNNa/bLL`; and **map all three to a common ligature form**
   (expand ȣ→ου and ϗ→καί/καὶ in *every* reader's copy) so that "raw ȣ vs expanded ου"
   doesn't register as a fake disagreement. Canonicalization is for diffing; it is not
   the archival text.
3. **Diff the three canonical streams**, token by token / citation by citation.
   - **All three agree →** accept (high confidence).
   - **Two agree, one differs →** provisionally take the majority, but flag if the odd
     one out is on a Bekker citation (citations are the highest-value data).
   - **All three differ →** flag for adjudication.
4. **Adjudicate flags with Opus against the page image.** The adjudicator picks the
   correct reading and is explicitly allowed to output **"uncertain"** rather than
   guess. Uncertain items go to the human queue.
5. **Run the deterministic pass** (§6) over the reconciled text; its flags join the
   queue.
6. **Human reviews only the queue.** Everything else is considered done.

Scoring/among-reader agreement can reuse the Bekker-citation comparison logic already in
`bonitz/bonitz_pipeline/compare.py` and `digit_guard.py` (Kraken-era, but the citation
multiset comparison generalizes to any pair of readers).

## 6. The deterministic pass (safety net)

Free, instant, repeatable, image-blind — catches errors the readers share. Build in two
layers. A partial version already exists in `bonitz/bonitz_pipeline/validate_column.py`
(NFC, no raw ligatures, Bekker-shape regex, bare-ου warning, empty-entry check) — extend
it.

**Layer 1 — transcript only:**
- Entries in Greek alphabetical order (out-of-order lemma = likely misread first letter).
- No stray gutter numbers; no bare unaccented "ου" after expansion.
- Every citation matches the Bekker shape (page + a/b + line); NFC.
- No empty/malformed entries; page/column metadata matches the filename.

**Layer 2 — needs the Aristotle corpus (already in the reader project):**
- Each headword is a real Greek word attested in Aristotle's text (unattested = suspect).
- Each citation **resolves** to a real work/Bekker page/line (resolves-to-nowhere = flag).
  This is the same work as the planned website citation-linking, doubling as an error net.

## 7. Open items to resolve (in rough order)

1. **History Genie column mitigation** — access is settled (web-UI `.docx`, ~5 files;
   §3b). Remaining question: feed it **pre-split single-column PDFs** to kill the
   page-boundary junk at the source (§4b), vs. cleaning it after in the normalizer.
   (Self-hosting CHURRO — `stanford-oval/churro-3B` — is possible but needs more than a
   small laptop; it's a 3B vision model. See discussion.)
2. **LlamaParse credit budget** — measure per-page cost, project against 10k credits.
3. **Write the normalizer + comparator** (§4–5) and the Opus adjudicator prompt.
4. **Parse page 14** (Bonitz's abbreviation key) and expand the work-abbreviation table
   in `expand_abbrevs.py` — one-time, covers the whole index.
5. **Bekker range table** (page ranges → work IDs) to power Layer-2 citation resolution.
6. **Redo pages 15–60** through this pipeline once it's proven.

## 8. Suggested execution order

1. Pilot all three readers on the **same ~5 pages** (include one dense entry page like
   ἀγαθόν). Archive each reader's raw output.
2. Catalog each reader's systematic quirks (§4) and write the normalizer.
3. Build the comparator + adjudicator; produce a flag queue for the pilot pages.
4. Run the deterministic pass; review the combined queue by hand; measure the real error
   rate and the human-effort-per-page.
5. Only then scale — in page order, resumable, sending batches as you go — starting with
   the α redo (15–60), then 61–890, then Addenda (886–890).

---

*Guiding rule for whoever picks this up: the readers are probabilistic and will share
mistakes; the deterministic checks and the human queue are what drive the last errors
out. Keep every raw read untouched, expand only on copies, and never let a model invent
a page number or a citation.*
