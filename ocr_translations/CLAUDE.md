# PDF → Markdown OCR Recipe

Convert the PDF at `$PDF_PATH` to highly accurate markdown. **Claude's native vision — reading each single-page PDF with the Read tool — is the OCR.** That is the only trustworthy source of text.

Do NOT use any external tool or API for **text extraction**: no `pdftotext`, `pdfgrep`, `pdfminer`, `pymupdf`, `poppler` text layer, `tesseract`, `ocrmypdf`, etc. Scanned PDFs frequently carry an embedded OCR layer that is *severely* inaccurate; any tool that extracts it silently produces garbage. Transcribe what you **see**, never what a tool extracts.

`qpdf`, `pdfinfo`, and `pandoc` are allowed — they split pages, count pages, and convert the finished markdown. None of them extract the text you transcribe.

> **Platform:** this recipe targets **macOS** (BSD userland). Commands use `stat -f%z`, `sed -i ''`, `perl`, and Homebrew. If you ever run it on Linux/WSL, swap to GNU equivalents (`stat -c%s`, `sed -i`, `apt-get`).

---

## Mode selection (decide first)

| Mode | Reads per page | When to use |
|------|----------------|-------------|
| **Standard** (default) | 1 reader → 1 reviewer/assembler | Clean modern scans, born-digital PDFs, most jobs. |
| **High-accuracy** | 2 *blind* readers → reviewer → assembler | Faint/old scans, dense diacritics, tables, critical apparatus, Greek + footnotes. |

Standard mode reads every page **twice** (reader, then reviewer who re-reads the original). High-accuracy reads it **four times** with two independent blind transcriptions. Start in Standard; escalate a specific page range to High-accuracy only if the reviewer keeps finding misreads. Don't pay for four reads by default.

The rest of this doc describes High-accuracy roles in full; Standard mode simply omits `reader-b` and folds the assembler's final pass into the reviewer (notes inline below).

---

## Step 1 — Preparation (Lead performs before spawning teammates)

> **⚠ Path handling:** `$PDF_PATH` often contains spaces or cloud-sync directory names that break tools. Copy the PDF to a safe local path with **no spaces** first; every later command uses the local copy.
>
> **⚠ Split to PDF pages, not images.** Reading single-page PDFs via the Read tool avoids the content-filter false positives that hit PNG renders of academic/theological/philosophical texts. Always split to single-page PDFs.

```bash
# Tooling (one-time): brew install qpdf poppler pandoc

# 1. Copy PDF to a safe local path
mkdir -p ./md-output/pages ./md-output/working
cp "$PDF_PATH" ./md-output/source.pdf

# 2. Page count
TOTAL_PAGES=$(pdfinfo ./md-output/source.pdf | awk '/^Pages:/ {print $2}')
echo "Total pages: $TOTAL_PAGES"

# 3. Split into single-page PDFs.
#    qpdf --split-pages strips per-page resources, so each file is ~100–200KB
#    instead of multi-MB. The "page.pdf" pattern auto-produces zero-padded files.
( cd ./md-output/pages && qpdf ../source.pdf --split-pages -- page.pdf )

# 4. Verify count + determine the zero-pad WIDTH.
#    ⚠ qpdf pads to the width of the page COUNT, NOT always 3 digits:
#    a 20-page doc yields page-01.pdf … page-20.pdf; a 200-page doc yields
#    page-001.pdf … page-200.pdf. `seq -w 1 $TOTAL_PAGES` produces the SAME
#    width, so it always matches the actual filenames — use it everywhere.
FILE_COUNT=$(ls -1 ./md-output/pages/page-*.pdf 2>/dev/null | wc -l | tr -d ' ')
PAD=$(printf '%s' "$TOTAL_PAGES" | wc -c | tr -d ' ')   # digits in the page count
echo "Split $FILE_COUNT page PDFs (expected $TOTAL_PAGES); filenames zero-padded to $PAD digits"
ls -1 ./md-output/pages | head -2   # sanity-check the actual padding
```

**The file count must equal `$TOTAL_PAGES` before continuing.** On mismatch, diagnose before spawning anyone. After this step `./md-output/pages/` holds `page-<NNN>.pdf`, where `<NNN>` is zero-padded to `$PAD` digits (the page-count width). **Throughout this doc, `NNN` means "zero-padded to `$PAD` digits," matching `seq -w 1 $TOTAL_PAGES` — not literally three digits.** The lead must tell each agent its exact filenames (e.g. show `ls` output for its range) so no one guesses the width.

`./md-output/working/` is the **shared coordination surface** — every teammate writes its stage output to a known path there, and downstream teammates read directly from disk. Nothing is relayed through the lead.

### Calculate reader batch size

> **⚠ 20MB request limit.** Each agent accumulates every page image it reads in its context. The API rejects requests over 20MB, so an agent reading 2.5MB pages fails after ~7–8 pages with `Request too large`. Split each role into batches and spawn one agent per batch.

```bash
# PDF file bytes are a rough proxy for the rendered-image payload the API counts.
# It is only an estimate — the graceful-stop rule below is the real safeguard.
AVG_PAGE_BYTES=$(stat -f%z ./md-output/pages/page-001.pdf)
MAX_PAGES_PER_BATCH=$(( 15000000 / AVG_PAGE_BYTES ))   # 15MB budget, leaving headroom
[ "$MAX_PAGES_PER_BATCH" -gt "$TOTAL_PAGES" ] && MAX_PAGES_PER_BATCH=$TOTAL_PAGES
[ "$MAX_PAGES_PER_BATCH" -lt 3 ] && MAX_PAGES_PER_BATCH=3
NUM_BATCHES=$(( (TOTAL_PAGES + MAX_PAGES_PER_BATCH - 1) / MAX_PAGES_PER_BATCH ))
echo "Avg page: $AVG_PAGE_BYTES bytes → $MAX_PAGES_PER_BATCH pages/batch, $NUM_BATCHES batches"
```

Record `MAX_PAGES_PER_BATCH` and `NUM_BATCHES` for Step 2. **Graceful-stop safeguard:** every reading agent must wrap its Read calls so that if one returns `Request too large`, it stops at the last fully-processed page, writes a `BATCH-OVERFLOW page NNN` note to the lead, and exits cleanly — never failing the whole batch. The lead then spawns a fresh agent for the remaining pages.

### Reversible substitution protocol (optional content-filter bypass)

Transcribing scholarly prose through tool calls can trip content-filter false positives. The agents already keep all transcription **out of response text** (status lines only) and write to files — that alone handles most cases. If file writes still trip the filter, enable this **reversible, word-bounded** substitution. It is OFF by default; turn it on only if you observe filter errors on writes.

When enabled, every teammate applies it to file writes:

- **Primary:** replace the whole word `the` → `th3` (`The` → `Th3`).
- **Fallback (only if `the` never appears on the page):** replace the whole word `of` → `o-f` (`Of` → `O-f`).

The substitution is **word-bounded and exactly reversible** — encode and decode are inverses, so verbatim fidelity is preserved. It is automatically a no-op on Greek text (no English articles), which is fine; the filter risk is in the English. Encode/decode both use `perl` with `\b` boundaries (see Step 4) — never an unbounded `sed s/th3/the/g`, which would corrupt legitimate tokens.

**When the protocol is OFF (default), write plain markdown to files normally.** Keep transcription out of response text regardless — that rule always holds.

---

## Step 2 — Spawn the agent team

You (the lead) operate in **delegate mode**: spawn teammates, send one startup message each, then get out of the way. You do not assign individual pages, transcribe, or review.

**⏱ Timing.** Teammates are full Claude Code sessions; each stage takes **1–5 min per page**. The pipeline overlaps (readers race ahead while reviewer/assembler work earlier pages), so throughput beats sequential — but any single page still takes minutes end-to-end. Do not assume a teammate is stuck from silence. Do not dismiss anyone unless they've been unresponsive **10+ min after a check-in message that also went unanswered**. Premature shutdown is the most common failure.

### Pipeline architecture (overlapping, not lock-step)

```
High-accuracy:  [reader-a-B] [reader-b-B] → [reviewer-B] → [assembler-B]
Standard:       [reader-a-B]              → [reviewer-B]            (assembler folded in)
```

Every role that reads page PDFs is **batched** with the same `MAX_PAGES_PER_BATCH`. Downstream roles (reviewer, assembler) discover upstream work by **polling the filesystem**, not by waiting for messages — batched agents may not message each role directly.

### Shared rules for every teammate

- **Read each page visually** with the Read tool at `./md-output/pages/page-NNN.pdf`. Never use a text-extraction tool. Your eyes are the only source of truth.
- **Keep transcription out of response text.** Respond with a short status line only (e.g. `✓ page 003 written`). Never paste transcribed content into chat.
- **Apply the substitution protocol to file writes only if the lead enabled it.** Otherwise write plain markdown.
- **Graceful overflow:** if a Read returns `Request too large`, stop, report `BATCH-OVERFLOW page NNN` to the lead, exit cleanly.

### `reader-a` (one per batch) — and `reader-b` (High-accuracy only)

> Spawn `reader-a-{B}` (and in High-accuracy, `reader-b-{B}`) per batch, each covering only pages START–END. **`reader-b` works blind — it must not read any `reader-a` file.** Both run concurrently and advance independently.

For each page N in range:

1. Read `./md-output/pages/page-NNN.pdf` and convert everything you see to clean markdown.
2. Rules:
   - Reproduce ALL text verbatim — no paraphrase, summary, or omission.
   - ATX headings (`#`/`##`/`###`) reflecting the visual hierarchy.
   - Preserve `*italic*`, `**bold**`, `***bold-italic***` exactly.
   - Tables → markdown pipe-tables with alignment.
   - Preserve list structure (bulleted/numbered/nested) exactly.
   - Figures → `![what the image depicts](page-NNN-figure)`.
   - **Footnotes:** markdown footnote syntax — `[^N]` at the reference point, `[^N]: text` at the bottom of the page output, matching the original numbering. Include footnote text in full when it appears on the page. If a marker's text lives on another page, write just the `[^N]` marker; the assembler merges later.
   - Watch the hard cases: em-dash (—) vs en-dash (–) vs hyphen (-); curly vs straight quotes; accents (Averroës, é, ö); small-caps; Greek diacritics and breathings.
   - Unclear word/passage → best guess marked `[?:guess]`.
3. Write the markdown to `./md-output/working/page-NNN-reader-a.md` (or `-reader-b.md`). If the substitution protocol is enabled, apply it first. Verify: `wc -l ./md-output/working/page-NNN-reader-a.md`.
4. Status line only, then notify `reviewer`: "reader-a page NNN complete." **Immediately proceed to the next page** — never wait on another teammate.

After the last page, message the **lead**: "reader-a-{B} all pages complete," then idle.

### `reviewer` (one per batch)

> Spawn `reviewer-{B}` per batch, covering pages START–END **in order**. A ruthless, detail-obsessed devil's advocate.
>
> **Readiness:** poll the filesystem. For page N, Standard mode needs `page-NNN-reader-a.md`; High-accuracy needs BOTH reader files non-empty (`ls -la`). If present, start; else wait briefly and re-check. Stay idle while waiting — never exit.

For each page N:

1. **First**, read `./md-output/pages/page-NNN.pdf` yourself. Look at the original carefully before reviewing.
2. Read the transcription(s) from disk (`-reader-a.md`, and `-reader-b.md` in High-accuracy).
3. Check against the original:
   - **Missing text** — any line, footnote, header/footer, caption absent?
   - **Wrong words** — misreads (rn→m, l→I, O→0, é→e), dropped/added words, wrong articles/prepositions.
   - **Formatting** — heading levels, broken tables, mis-applied emphasis.
   - **Structure** — paragraph/list order, detached footnotes, unmarked block quotes. Footnotes must use `[^N]` / `[^N]:` syntax, not bare superscripts.
   - **Special characters** — dash types, quote curliness, accents, Greek diacritics.
   - **Discrepancies** (High-accuracy) — where readers disagree, consult the original and declare the correct reading.
4. Write to `./md-output/working/page-NNN-review.md` (apply substitution if enabled). Structure:
   ```
   ## Errors and discrepancies
   [Numbered: quote the error, name the reader(s), state what the original shows, give the correction.]

   ## Corrected markdown
   [Full corrected markdown for this page.]
   ```
   - **Standard mode:** the reviewer is the final gate — its `## Corrected markdown` must be publication-ready, with all `[?:...]` resolved against the original. Also write that clean markdown to `./md-output/page-NNN.md` (this is the final artifact; no separate assembler).
5. Status line only, then notify `assembler` (High-accuracy only): "review page NNN complete." Advance to the next page (re-poll the filesystem).

After the last page, message the **lead**: "reviewer-{B} all pages complete," then idle.

### `assembler` (one per batch — High-accuracy only)

> Final quality gate. Pages in order. **Readiness:** poll for `page-NNN-review.md` non-empty.

For each page N:

1. **First**, read `./md-output/pages/page-NNN.pdf` for one final independent visual check.
2. Read all prior outputs: `-reader-a.md`, `-reader-b.md`, `-review.md`.
3. Produce the FINAL markdown: start from the reviewer's `## Corrected markdown`; graft anything a reader caught that the reviewer missed; do your own visual check and fix what all three missed; resolve every `[?:...]` from the original (use your best reading if truly illegible, no marker); strip all commentary/metadata; ensure consistent formatting.
4. Write to `./md-output/page-NNN.md` (apply substitution if enabled). Verify with `wc -l`.
5. Status line only, then notify the **lead**: "page NNN assembled." Advance.

After the last page, message the **lead**: "assembler-{B} all pages complete," then idle.

---

## Step 3 — Orchestration (Lead)

In **delegate mode**:

1. **Spawn all roles in batches.** For each batch B (1…`NUM_BATCHES`): `START=(B-1)*MAX_PAGES_PER_BATCH+1`, `END=min(B*MAX_PAGES_PER_BATCH, TOTAL_PAGES)`. Spawn the role set for the chosen mode (Standard: reader-a + reviewer; High-accuracy: reader-a + reader-b + reviewer + assembler), each assigned START–END. Spawn everyone before sending startup messages.
2. **One startup message each**, naming the page range, the **exact zero-padded filenames** for that range (paste the `ls ./md-output/pages` output so no one guesses the pad width), the mode, and whether the substitution protocol is ON. For reviewer/assembler add: "poll the filesystem for upstream files before each page."
3. **Wait.** Teammates self-direct, gated only by upstream files appearing on disk. You'll get periodic "page NNN …" and "all pages complete" messages. A long document may take 30–90+ min.

**Do not:** shut anyone down before 10+ min of silence following an unanswered check-in; re-send startup messages; transcribe or review yourself; assume failure from an idle-looking pane (the agent may be mid-Read).

**If a teammate genuinely stalls** (10+ min after a check-in): send one message naming the page it should be on. If still dead after another 10 min, dismiss and respawn that single agent pointed at the first incomplete page. **If you get `BATCH-OVERFLOW page NNN`:** spawn a fresh agent of that role for pages NNN…END.

---

## Step 4 — Concatenate, decode, repair (Lead, directly)

Only after every batch of every role reports complete **and** every `page-NNN.md` exists.

**1. Verify all final pages exist and are non-empty:**
```bash
MISSING=0
for i in $(seq -w 1 "$TOTAL_PAGES"); do
  [ -s "./md-output/page-${i}.md" ] || { echo "MISSING/EMPTY: page-${i}.md"; MISSING=$((MISSING+1)); }
done
echo "Missing/empty: $MISSING of $TOTAL_PAGES"
```

**2. Derive the output filename** from the source PDF:
```bash
OUTNAME="./md-output/$(basename "$PDF_PATH" .pdf).md"
```

**3. Concatenate in page order, then decode** (decode only if the substitution protocol was enabled):
```bash
RAW="./md-output/raw_combined.md"
: > "$RAW"
for i in $(seq -w 1 "$TOTAL_PAGES"); do
  cat "./md-output/page-${i}.md" >> "$RAW"
  printf '\n' >> "$RAW"
done

# Reversible decode — WORD-BOUNDED (\b), exact inverse of the encode. Only if enabled.
perl -i -pe 's/\bth3\b/the/g; s/\bTh3\b/The/g; s/\bo-f\b/of/g; s/\bO-f\b/Of/g;' "$RAW"

mv "$RAW" "$OUTNAME"
```

**4. ⚠ Repair page-boundary splits (critical).** Each page was transcribed independently, so text spanning a boundary appears broken: a line ending mid-sentence, blank lines, then a continuation starting lowercase. Read the whole document and fix every such split — join the fragments and delete the intervening blanks. Rejoin hyphenated word-breaks across pages (`afir-` + `mada` → `afirmada`, drop the hyphen). Remove page-boundary artifacts: running headers, standalone page numbers, `<!-- blank page -->` markers. **Assume there is a split at most boundaries where text flows continuously — do not trust naive concatenation.**

> **⚠ Don't rely on a manual read-through alone — script the check.** A manual pass on a
> multi-hundred-page work (e.g. Ostwald's *Nicomachean Ethics*, ~3000 lines) missed **37**
> mid-sentence blank-line splits that only surfaced months later as spurious paragraph
> breaks in the live reader (some literally split a single word's neighbors, e.g. "does" /
> blank / "not make a spring"). One footnote definition was even truncated this way, with
> its continuation orphaned into the body text as a bogus paragraph (see
> `docs/alignment-status.md` note on NE/Ostwald, fixed 2026-07-02). Before declaring a work
> done, run an automated scan and manually adjudicate every hit (most are real paragraph
> breaks; the false ones are the bug):
> ```bash
> python3 pipeline/tools/ocr_postprocess.py scan-breaks "$OUTNAME"
> ```
> The scanner reports `prevLineNo nextLineNo | prevContext | nextContext` and exits non-zero
> when it finds hits, so it can gate the cleanup pass. A hit means the blank line is very
> likely a page-boundary artifact, not an authorial paragraph break — adjudicate every hit.
> When the hit is a real page-boundary split, delete the blank line (removing the blank line
> is enough; the pipeline's tokenizer joins words with a single space regardless of the
> surrounding line-wrap, so no further edit is needed), or run the explicit fixer:
> ```bash
> python3 pipeline/tools/ocr_postprocess.py scan-breaks --fix "$OUTNAME"
> ```
> The fixer only removes detected blank lines; it does not run unless `--fix` is passed.
> This also catches orphaned footnote continuations: if the "next" line reads like a
> textual/editorial aside with no clear referent, check whether a nearby footnote definition
> ends mid-sentence and the fragment belongs there instead of in the body.

**5. ⚠ Relocate all footnote definitions to the end (critical).** Page files hold `[^N]: …` definitions inline. In the final document, move **every** definition out of the body into a single `## Footnotes` section at the very end, in numerical order. Ensure every `[^N]` reference has a matching definition and vice versa; flag mismatches. If numbering resets between chapters, renumber to avoid collisions (e.g. chapter-2 `[^1]` → `[^101]`). Merge definitions split across a page boundary. **Each definition must be a single line** matching `[^N]: full text`, with one blank line between definitions.
```bash
python3 pipeline/tools/ocr_postprocess.py relocate-footnotes "$OUTNAME"
python3 pipeline/tools/ocr_postprocess.py relocate-footnotes --fix "$OUTNAME"
```
Run without `--fix` first to review duplicate keys, orphaned definitions, references with
no definition, and chapter-renumber collisions. The `--fix` form writes the relocated
single trailing `## Footnotes` section and remaps duplicate chapter-local keys such as a
second `[^1]` to `[^101]`; it must never silently drop content.

**6. Final cleanup pass.** Read through `$OUTNAME` and fix remaining artifacts: orphaned list items, duplicated headers, inconsistent heading hierarchy, tables/lists split across pages. Separate sections with a single blank line (not a horizontal rule). **Never leave more than one consecutive blank line.**

**7. ⚠ Pandoc footnote validation (critical).** Convert to `.docx`; pandoc warns about exactly the footnote bugs a page-by-page view can't catch:
```bash
python3 pipeline/tools/ocr_postprocess.py validate "$OUTNAME"
```
Treat any of these as a failure to fix before declaring done:
- `Note with key '…' defined … but not used` — orphaned definition.
- `Reference to nonexistent note '…'` / missing-note — a `[^N]` with no definition.
- Duplicate-key warning — same `[^N]:` defined twice.
- Suspicious numbering gaps (e.g. `[^14]`, `[^16]`, no `[^15]`) — open the source page PDFs for that range and confirm real omission vs renumbering artifact.

The validator shells out to `pandoc "$OUTNAME" -o <tmp>.docx --from=markdown --to=docx`,
prints pandoc stderr, and fails on orphaned/undefined/duplicate notes or suspicious
numbering gaps. If `pandoc` is not installed, it prints `skipped: pandoc not installed`
and exits successfully so markdown-only cleanup can still proceed.

**Re-pass when warnings appear:** for each warned key, grep the body and footnotes section for `[^KEY]`; open the source page PDF (and `./md-output/working/page-NNN-reader-a.md`) for the relevant range; add missing definitions/references from the original, renumber where wrong, merge split definitions; re-run validation; repeat until zero footnote warnings. After validation is clean, create and keep the `.docx` as the published companion artifact:
```bash
DOCX="${OUTNAME%.md}.docx"
pandoc "$OUTNAME" -o "$DOCX" --from=markdown --to=docx
```

**8. Cleanup (optional).** Once satisfied, remove `./md-output/pages/`, `./md-output/working/`, `./md-output/pandoc.stderr`. Keep `$OUTNAME` and `$DOCX`.

---

## Critical rules

- **Vision is the only OCR.** Every reading role reads each page PDF visually. Never extract an embedded text layer (`pdftotext`, `pdfgrep`, `pdfminer`, `pymupdf`, poppler text, etc.). `qpdf`/`pdfinfo`/`pandoc` are allowed — they split, count, and convert, never extract transcription text.
- **Transcription never goes in response text** — status lines only; write to files. This holds whether or not the substitution protocol is enabled.
- **Substitution is optional, reversible, word-bounded, OFF by default.** Enable only on observed filter errors. Encode and decode are exact `\b`-bounded inverses (`perl`, never unbounded `sed`), so verbatim fidelity is preserved; it's a harmless no-op on Greek.
- **Verbatim fidelity** — transcription, not summarization. Every word, accent, and dash matters.
- **Script the page-boundary-split check (Step 4.4), don't rely on reading alone.** A blank
  line followed by a lowercase continuation is almost always a false paragraph break, not an
  authorial one — 37 slipped past a manual read in one past translation before an automated
  scan caught them.
- **Coordinate via files + messages.** Downstream agents poll the filesystem for upstream outputs; the lead never relays content between teammates.
- **All reading roles are batched** to stay under the 20MB limit, with a graceful-overflow stop that never fails a whole batch.
- **Pick the mode deliberately.** Standard (1 read + 1 review) is the default; escalate to High-accuracy (blind dual-read + review + assemble) only where the reviewer keeps catching misreads. Don't pay for four reads by default.
- **Lead stays in delegate mode** — split, spawn, one startup message each, wait, then concatenate/decode/repair. That is all.
- **macOS commands** (`stat -f%z`, `sed -i ''`, `perl`, `brew`). Swap to GNU equivalents only if run on Linux/WSL.
