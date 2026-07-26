# Bonitz Index Aristotelicus — Operator Instructions (for the collaborator's Claude Code session)

You are the Claude Code session on the collaborator's machine. Your job is to run
the **three-reader OCR pipeline** on assigned pages of Bonitz's *Index
Aristotelicus* (Berlin 1870) and send the results back to John. Everything you
need — code, page images source, two of the three readers' raw output — comes in
the `bonitz/` folder John gives you. You supply the third reader (Opus vision
subagents) and the adjudication, both of which run on this machine's Max plan.

Read this whole file before doing anything. The design rationale lives in
`BONITZ_THREE_READER_HANDOFF.md` if you want it; this file alone is enough to
operate.

---

## 0. What you received / setup

From John, the `bonitz/` folder containing at least:

- `book.pdf` — the full 896-page scan (109 MB)
- `bonitz_pipeline/` — the pipeline package (plus `tests/`)
- `bonitz_llamaparse_pilot.py` — must sit in the PARENT directory of `bonitz/`
  (the pipeline imports it from there; if John shipped it inside `bonitz/`,
  move it up one level)
- `raw/genie/*.docx` — History Genie reads, **read-only, never modify**
- `raw/llamaparse/page-*.md` — LlamaParse reads for pages already done
- `raw/opus/page-*.txt` — Opus reads for pages already done (15–46)
- `work/` — flags, adjudications, reconciled text for pages already done

Setup checklist (run these, fix what fails):

```bash
cd bonitz
python3 --version                 # 3.10+
python3 -m pip install pillow numpy
pdftoppm -v                       # poppler; if missing: brew install poppler
python3 -m unittest discover -s tests -q    # must print OK (23 tests)
```

Hard rules, non-negotiable:

- **`raw/` is write-once.** Reader output is written exactly once and never
  edited afterward — not to fix typos, not for anything. Corrections happen
  only in `work/reconciled/` via the adjudication flow.
- **Never write the LlamaParse API key into any file.** John supplies it
  privately; it exists only as an exported environment variable.
- **This is a DIPLOMATIC transcription** (reproduce the print exactly, errors
  and all). No expansion, no normalization, no "obvious fixes". Expansion for
  the website happens later, on copies, on John's side.
- Batches must not span a History Genie chunk boundary. Chunks cover PDF pages
  1–200, 201–400, 401–600, 601–800, 801–896. (You'll mostly work inside one.)

Page numbering: everything is **PDF page numbers** (printed page = PDF − 12;
you never need the printed number). Index body = PDF 15–885.

---

## 1. The per-batch loop

Work in **2–3 page batches** (4–6 columns). John assigns the range; the next
one up is in his message to your operator. Every stage is idempotent — existing
outputs are skipped — so re-running after any interruption is always safe.

### Stage 1 — prep (mechanical, cheap)

```bash
python3 -m bonitz_pipeline.batch3 prep --pages 47-48
```

Renders 600 PPI TIFFs, splits columns, cuts 1400px-wide strips to
`images/strips/page-NNN-{L,R}/strip-NN.png`. Sanity-check: open one strip and
confirm it shows a clean single column, headword outdents intact at the left
edge.

### Stage 2 — LlamaParse (needs the API key from John)

```bash
export LLAMA_CLOUD_API_KEY=<key John gave you privately>
python3 -m bonitz_pipeline.batch3 llamaparse --pages 47-48
```

Writes `raw/llamaparse/page-NNN.md`. Costs ~54 credits/page; a free account
holds 10k credits (~185 pages). When a run fails with a credit error, tell
John — he creates a fresh free account and gives you a new key.

### Stage 3 — Opus readers (one subagent per column, in parallel)

Spawn one **Opus 4.8** subagent per column via the Agent/Task tool, all in one
parallel wave. Label each agent's description `[Opus 4.8] read pNN-C`. Use the
READER PROMPT template in §2 verbatim, substituting the page/column and the
actual strip count (check `ls images/strips/page-NNN-C/`).

Each agent writes `raw/opus/page-NNN-C.txt` and reports doubtful spots. Skim
the reports; you don't act on them (the comparator will catch real problems),
but flag in your notes to John anything systematic.

If an agent dies (session limit, crash): just relaunch it — but first check
whether its output file appeared anyway, and if you relaunch, make sure the
original isn't still running before the compare stage (a late finisher racing
a relaunch corrupts nothing in raw/ — last write wins — but you must not run
compare while either is still writing).

### Stage 4 — compare

```bash
python3 -m bonitz_pipeline.batch3 compare --pages 47-48
```

Needs all Opus columns present. Writes `work/flags-<range>.jsonl` and
`work/flags-by-col/page-NNN-C.json`. Expect roughly 10–25 flags per column.
A flag count wildly above that (50+) usually means a reader glitch — look at
the flags before spending adjudicator tokens; if one reader's stream is
garbage (wrong page, truncation), fix the input rather than adjudicating noise.

### Stage 5 — Opus adjudicators (one per column that has flags, in parallel)

Same mechanics as stage 3: one **Opus 4.8** subagent per column, parallel,
labels `[Opus 4.8] adjudicate pNN-C`. Use the ADJUDICATOR PROMPT template in
§3 verbatim. Each writes `work/adjudicated/page-NNN-C.json`.

### Stage 6 — reconcile + review page

```bash
python3 -m bonitz_pipeline.batch3 reconcile --pages 47-48
python3 -m bonitz_pipeline.review_html --pages 47-48
```

Reconcile applies high-confidence verdicts to a copy of the Opus text →
`work/reconciled/page-NNN-C.txt`, and queues everything else. Tolerated
oddities it handles by itself: verdict counts that don't match flag counts,
reordered verdicts, spans that straddle a column boundary (hyphenated word
continuing into the next column — queued, not edited).

After reconcile, spot-check for **insertion artifacts**: any edit that
*inserted* text (rather than replacing) can duplicate a word
(`ἀῆναιἀῆναι`-style). `grep` the reconciled files for doubled short strings if
any verdicts looked like pure insertions.

`review_html` produces `work/REVIEW.html` + `work/review_crops/` — a
self-contained page where every queued item shows the reconciled line, the
three readings, and an image crop centered on the line.

### Stage 7 — send back to John

Zip and send:

```
raw/opus/page-NNN-*.txt          (new pages only)
raw/llamaparse/page-NNN.md       (new pages only)
work/flags-*.jsonl  work/flags-by-col/page-NNN-*.json
work/adjudicated/page-NNN-*.json
work/reconciled/page-NNN-*.txt
work/REVIEW.html  work/review_crops/
```

plus a short note: flag counts, confidence breakdown, anything systematic the
readers/adjudicators reported. John reviews REVIEW.html and returns
corrections; those get applied on his side.

---

## 2. READER PROMPT (use verbatim; substitute PAGE, COL, STRIPCOUNT)

> You are a diplomatic transcriber of Bonitz's Index Aristotelicus (1870,
> Greek+Latin scholarly index). Transcribe ONE column of one page from image
> strips.
>
> You are an EYE, not a philologist. If a mark is not visibly present in the
> image, do NOT write it, even if the word is grammatically impossible
> without it. If you cannot tell, write [?] for that character. A
> transcription with fifteen [?] marks is far more valuable than one with
> fifteen confident inferences, because a later adjudicator compares your
> reading against two other independent readers and the image — your guesses
> corrupt that vote and can outvote the truth. Never reason from what a word
> "should" be: a reader that assigned breathings "per standard Greek grammar"
> wrote ȣ̔κ with a rough breathing where οὐ in fact takes a smooth one. In
> your final report, say for each doubtful spot whether you judged it from
> the GLYPH SHAPE alone; if you catch yourself writing "based on the standard
> spelling" or "grammatically it must be", stop and write [?] instead.
>
> Input images (read each in order):
> <ABSOLUTE PATH>/bonitz/images/strips/page-PAGE-COL/strip-01.png through
> strip-STRIPCOUNT.png. Consecutive strips overlap by ~110px (~2 printed
> lines) — de-duplicate the overlap when assembling.
>
> Rules:
> 1. VERBATIM/DIPLOMATIC: reproduce exactly what is printed. Judge ONLY from
> these images — never consult other transcription files, the rest of the
> corpus, or any "house style". Never drop a visible mark, never add an absent
> one.
> 2. One printed line per output line. Keep end-of-line hyphenation exactly as
> printed.
> 3. Ligatures stay RAW: ϗ (kai) and ȣ (ou) — INCLUDING the exact diacritics
> printed on the glyph. CRITICAL: the ϗ ligature is virtually always printed
> WITH an accent (ϗ̀ mid-phrase, ϗ́ before a pause) — look for it and record
> it; bare ϗ is rare. The ȣ ligature very frequently carries printed
> breathings and/or accents (ȣ̓, ȣ̔, ȣ͂, ȣ̀, ȣ́, combinations like ȣ̔́, ȣ̓͂)
> — these are the #1 missed marks; inspect every ȣ closely. τȣς is usually
> printed τȣ̀ς or τȣ́ς.
> 4. Trap list: (a) italic κ can look like Latin x/χ; italic α in work sigla
> is x-shaped and mimics κ (sanity-check the book letter against the work:
> e.g. Politics = Π + books α–θ only, so Πκ is impossible); italic ν can look
> like κ. (b) The HA siglum Ζι followed by book-letter ι fuses into a u-like
> shape — it is ιι (but Ζμ's subscript μ also looks like u; disambiguate by
> the work cited). (c) A leading chapter iota (e.g. ι41) is NOT digit 1;
> conversely a chapter number like 15 uses a short digit 1 that resembles
> iota — decide from context whether the position is a Greek book letter or an
> Arabic chapter numeral. (d) θ upright, not ϑ. (e) Latin "opp" in roman type,
> not Greek ρρ. (f) stigma ϛ appears in numerals. (g) ὔ (upsilon with smooth
> breathing + acute) can look like the ȣ ligature — ȣ is a tall o-over-u
> stack. (h) Latin vs Greek homoglyphs in sigla: distinguish a/α, I/Ι, i/ι,
> P/Ρ by context.
> 5. Raised a/b in Bekker citations are written inline: 1456b27. Copy digits
> exactly as printed — never "correct" a citation number. Note: four-digit
> numbers in the 1470–1590 range are normal (fragment citations, usually
> preceded by "f" and a fragment number); nothing above about 1590 exists in
> Bekker at all. When you meet a four-digit citation above 1590, it is either
> a misread digit or one of Bonitz's own misprints — we have confirmed two
> real misprints of this class (p49 prints 1835 where EN V.10 requires 1135;
> p50 prints 1820 where Politics VI.5 requires 1320), so do NOT assume a
> reader error. In this font 8 is a closed double loop and 3 is open-topped:
> zoom in, compare against unambiguous 8s and 3s elsewhere in the column,
> transcribe what the ink shows, and report the spot so it can be recorded as
> a source misprint rather than silently corrected.
> 6. Ignore the marginal gutter line numbers (5, 10, 15...) and any fragments
> of the neighboring column at the crop edge. Ignore running heads and bottom
> printer's signature marks.
> 7. If a character is truly illegible write [?] — never guess silently.
> 8. Output ONLY the transcription text, no commentary or headers.
>
> Write the result with the Write tool to
> <ABSOLUTE PATH>/bonitz/raw/opus/page-PAGE-COL.txt
>
> Then report: the file path, the line count, and any spots you were doubtful
> about (with line numbers).

## 3. ADJUDICATOR PROMPT (use verbatim; substitute PAGE, COL, STRIPCOUNT)

> You are an adjudicator for a three-reader OCR pipeline on Bonitz's Index
> Aristotelicus. Three independent readers (opus, genie, llama) disagreed at
> specific spots in one column; you settle each flag by looking at the page
> image.
>
> Read the flag file:
> <ABSOLUTE PATH>/bonitz/work/flags-by-col/page-PAGE-COL.json
> Each flag has: ctx (whitespace-free canonical context around the disputed
> span), opus/genie/llama (the three disputed readings), spine_off. The ctx is
> whitespace-free — locate it in the image by its distinctive letters,
> ignoring spacing.
>
> The column images:
> <ABSOLUTE PATH>/bonitz/images/strips/page-PAGE-COL/strip-01.png through
> strip-STRIPCOUNT.png (overlapping ~2 lines).
>
> For each flag, in order:
> 1. Locate the disputed spot in the strips (use the ctx).
> 2. Judge ONLY from the image — never from what "should" be there, EXCEPT:
> for work-siglum book letters you may sanity-check against the Bekker number
> (e.g. Politics = Π + books α–θ only; HA siglum Ζι + book ι fuses into a
> u-shape = ιι; 610a-b = HA book 9).
> 3. Key traps: (a) the ϗ ligature is virtually always printed WITH an accent
> (ϗ̀ mid-phrase, ϗ́ before pause) — if a reader wrote bare ϗ, check for the
> mark; (b) the ȣ ligature very often carries printed breathings/accents
> (ȣ̓ ȣ̔ ȣ͂ ȣ̀ ȣ́, stacks like ȣ̔́ ȣ̓͂) — these are the most-missed marks,
> zoom in; (c) digit-1 vs iota: decide from context whether the position is a
> Greek book letter (ι5) or Arabic chapter numeral (15); (d) italic siglum
> confusions: α looks x-shaped like κ, ν like κ, κ like χ; (e) ὔ can look
> like ȣ; (f) θ upright not ϑ.
> 4. "uncertain" is an encouraged answer when the print is genuinely
> ambiguous. NEVER invent citation digits.
>
> Write a JSON array to
> <ABSOLUTE PATH>/bonitz/work/adjudicated/page-PAGE-COL.json
> with EXACTLY one verdict object per flag, in the SAME ORDER as the flags
> (never merge or skip). Each object: {"ctx": "<first 30 chars of the flag's
> ctx, copied verbatim>", "verdict": "<the correct reading of the disputed
> span, same span the readers gave>", "agrees_with":
> "opus"|"genie"|"llama"|"multiple"|"none", "confidence":
> "high"|"medium"|"uncertain", "note": "<short reason>"}
>
> Then report: file path, number of verdicts, and how many were
> medium/uncertain.

---

## 4. Known gotchas (each cost us real time once)

- **Session usage limit mid-wave.** If your plan's limit kills agents
  mid-flight, nothing is lost: relaunch the missing columns after the reset.
  Check which output files exist first.
- **Late finishers.** An agent presumed dead may still complete minutes later.
  Before running compare, confirm no reader for the batch is still running.
- **Reader rule-drift.** Two failure modes we've caught: an agent consulting
  the existing corpus to decide a faint accent ("house style"), and an agent
  transcribing by sense rather than glyph. The prompt forbids both; if an
  agent's report admits either, re-run that column.
- **Genie slice fallbacks.** compare prints a note when it used a fuzzy or
  proportional anchor for the Genie slice. That's fine; trailing junk flags at
  the batch edge get voted down in adjudication.
- **Splitter edge cases.** If a reader reports a clipped headword initial at
  the far left of a strip, the column split cut into the outdent — tell John
  rather than working around it (the splitter has been fixed for this twice;
  a new case is diagnostic).
- **Cost expectation.** A 2-page batch ≈ 8 Opus subagents ≈ 550k output
  tokens. Size batches to what the plan comfortably absorbs; the loop
  parallelizes per-column, so smaller batches just mean more turns of the
  crank.

## 5. Assignment state

- Done and reviewed by John: PDF pages **15–46**.
- Your queue starts at **47–48**, then continue in 2–3 page batches toward
  **60** (end of the α-section redo). Check with John before crossing 60.
