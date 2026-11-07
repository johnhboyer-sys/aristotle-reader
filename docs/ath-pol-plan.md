# Athenian Constitution (Ath. Pol.): sources and plan

Status: plan only, 2026-11-06. Nothing is built. John approves before any code.

The work has no Bekker numbers: the papyrus came to light in 1890, after Bekker.
It is cited by chapter and section (69 chapters, 299 sections in Kenyon's OCT,
plus four fragments of the lost opening). Every part of the reader assumes
Bekker, so this doc does two things: picks the texts, and finds the smallest
change that lets one work cite by chapter.section without moving a byte of
any other work's output.

## 1. English translation

| Candidate | Published | US status | On archive.org | Numbering | OCR |
|---|---|---|---|---|---|
| **Kenyon, Oxford *Works* vol. X (1921)** | Oxford, 1921 | Public domain: published 1921, before 1931 | `worksofaristotle0010wdro_x8m2` (our Oeconomica scan). Ath. Pol. is in it: preface `/page/n364`, contents n366–n369, text **n370–n448**, index n449– | Chapter **and section** numbers in the margin; the index says "References are to chapters and sections" | Good; see below |
| Kenyon, Bell (1891; 2nd ed. 1892; reprints 1907, 1912) | London, 1891 | Public domain | `aristotleonathen00arisrich` (1891), `aristotleonathen00arisuoft` (1912) | Chapter numbers only ("49. The Council…"); no sections | Not sampled closely |
| Poste (1891) | Macmillan, 1891 | Public domain | `aristotleonconst00arisiala` | Chapter numbers only; freer wording ("The inspection of cavalry horses is a work of the senate") | Not sampled closely |
| Rackham, Loeb 285 (1935; rev. 1952) | Heinemann / Harvard, 1935 | **Unclear.** No renewal for Rackham's Aristotle in the Stanford Copyright Renewal Database (searched "Rackham", "Athenian constitution", "Eudemian", "Aristotle": 34 Aristotle hits, none his). But a book first published in London may have had its US copyright restored in 1996 (URAA): Rackham died 1944, so the UK term ran to 2014, past the 1996 cut-off; a restored term runs 95 years, to the end of 2030. That turns on whether the Harvard issue counts as simultaneous US publication, which I could not settle. Perseus files its English under `copyright/`, and this repo already gates Rackham in the leak check. | `athenianconstitu00arisuoft` | Chapter and section | Not sampled |
| Gutenberg #26095 (Kenyon) | 2008 transcription | Public domain | n/a | "Part N" chapters, no sections, no notes, no source edition named | Hand-typed |

Gutenberg #26095 has the 1921 Oxford wording (it matches the scan sentence for
sentence), so it is a second witness to the same text, not a different translation.

### OCR quality of the 1921 scan (sampled)

- I read two pages against the page images (`/page/n370`: ch. 2.2–3.3; `/page/n428`: ch. 49.3–51.2). Body text is right word for word, apart from these slips:
  - vowels printed with a breve lose it or change (Astynŏmi → "Astyndmi", Metronŏmi → "Metronémi");
  - some words run together ("inthe", "Ifa", "ina");
  - footnote markers come out as "!", "?" or "*".
- Measured against Gutenberg over the whole work, 98.6% of Gutenberg's 24,688 words match the OCR. Most of the 1.4% residue is end-of-line hyphenation and the breve letters, which my tokenizer split. Gutenberg has its own slips (it prints "Boculium" where the scan has "Bucolium"), so the scan is the authority and Gutenberg only flags places to look.
- **Kenyon's footnotes sit on every page.** They must be cut out. Their type is smaller, which the hOCR word height shows (see memory note on hOCR type size).
- **Margin numbers are the weak point.** A naive pass over hOCR word boxes finds 257 margin numerals. Footnote numbers pollute that count, and some marks are garbled ("wb 3" on n427). The work needs 299 section starts (69 chapter starts and 230 later sections), so every section mark has to be read off the 79 page images. This is the Bekker rule applied here: section numbers come from Kenyon's print, never from interpolation.
- Hard leaf fact: archive.org's `/page/nN` image is hOCR page index N+1 in `_hocr.html` (`/page/n428` shows the text the hOCR file holds at index 429). Anyone cutting pages must use one index or the other, not both.

### Numbering against the standard

- The 1921 margins follow Kenyon's OCT (1920), the same editor and year; the preface says the translation was revised "into conformity with the text as now established".
- On the sampled pages, the sections match the OCT, including 49.5, which Oppermann's Teubner lacks (below).
- The 1921 text starts at ch. 1 ("…[They were tried] by a court") and ends at 69.2. It does not translate the four fragments.
- I did not check all 299 section marks. The build gate below does that.

### Recommendation: Kenyon, Oxford 1921

1. It is the only clearly public-domain translation that prints sections, which is the citation unit LSJ and every modern reader use.
2. It is Kenyon's last revision, made against his own 1920 OCT. If the Greek also comes from that OCT (section 2), the two columns are one editor's text, which no other pairing gives us.
3. It sits in a scan we already use (Oeconomica), with good OCR and a hand-typed second witness (Gutenberg) to diff against.

Bell 1891/1912 is an earlier draft of the same translation, with chapters only. Poste is freer and has chapters only. Rackham's US status is unclear, and it is no better for our use.

## 2. Greek

| Source | Edition | Structure | Licence | Notes |
|---|---|---|---|---|
| TLG 0086.**003** (cached export, `build/export/Diogenes-Resources/xml/tlg/tlg0086003.xml`; this worktree has no `build/`, I read it in `nice-dubinsky-1ea5fd`) | Oppermann, Teubner 1928 (repr. 1968) | `<div type="Section">` × 69, `<div type="subsection">` × 298, 2,070 printed lines numbered within each subsection, 98 `<pb/>` | Derived text may ship; raw export may not | Section breaks fall **at line starts**: of the 298 sections both editions share, 186 begin up to a line away from where the OCT starts them (e.g. 2.2 starts "καὶ τὸ πλῆθος…" here, "ἦν γὰρ αὐτῶν…" in the OCT). **No 49.5**: its sentence sits inside 49.4. Prints more supplements in the damaged last columns (ch. 64–69: 1,750 words against the OCT's 1,280). |
| Perseus `tlg0086.tlg003.perseus-grc2.xml` (canonical-greekLit) | **Kenyon, OCT 1920** | `textpart` section × 73 (1–69 plus `frag_1`–`frag_4`), subsection × 307 (**299** in ch. 1–69, plus 8 in the fragments) | **CC BY-SA 4.0** | Exact section breaks. No printed lines (no `<lb>`). 9 Perseus `<note>`s and a few stray numerals in the text (e.g. "ἑκατόν. ι ἦν") to clean. |
| First1KGreek `tlg0086.tlg003.1st1K-grc1.xml` | Kenyon, Berlin (Suppl. Arist. III.2) 1903 | 69 `paragraph` divs, **no sections**; 613 notes, `<lb>` | CC BY-SA | Not usable as a section spine. `grc2` holds the fragments only. |

Section counts per chapter, OCT against Oppermann: identical in all 69 chapters
except 49 (5 against 4), so 299 against 298.

**Recommendation: Greek from the Perseus Kenyon OCT.** Its sections are exact, it is
the edition LSJ's numbering follows, and it is the text Kenyon translated. The cost
is a small Greek loader of its own (section 3, step P1), because every other work's
Greek comes from the TLG export. If John prefers to keep TLG as the one Greek source,
Oppermann can serve, but not under this plan's gates. Its sections are only line-exact,
and it has 298 sections, not 299: 49.5 has no Greek of its own, so LSJ's and Kenyon's
49.5 would have nothing to land on. Choosing TLG means adding a step that re-cuts
Oppermann's text at the OCT's section starts, word by word, and rewriting G4 and G5
for that. It is a separate scope, not a drop-in. This is open question Q1.

## 3. LSJ

`grc.lsj.xml` cites the work as `Perseus:abo:tlg,0086,003:C:S`, shown as "Arist. Ath. C.S":

- **527** citations: 516 chapter:section, 11 chapter only (e.g. `003:48`, shown "Arist. Ath. 48").
- No other work number carries "Ath." citations, and LSJ has no "Ath.Fr." citations.
- Display forms: 439 "Arist. Ath. N.N", 37 bare "N.N", 20 "Id. Ath. N.N", 20 "Ath. N.N", plus the chapter-only forms.
- Against the OCT's 299 sections, 515 of the 516 chapter:section citations exist. The odd one is δίδραχμον, "Arist. Ath. 10.7": ch. 10 has two sections and the word is in 10.2. It looks like an LSJ misprint (Q6).
- `stage5_lsj.py:46-48` (`_BIBL_REF`) accepts only `(\d+[ab]):(\d+)`, and `lsj_citation_map.py:9-49` has no `"003"` entry, so today none of these link.

## 4. Where the code assumes Bekker

There is already a non-Bekker work: Porphyry's Isagoge. Its manifest sets `citation.scheme: busse` and maps Busse page N onto a **synthetic Bekker column "Na"** (a-side only), so `refs.py`, stage 1–9 and the reader's column:line machinery run unchanged, and the front end relabels or hides a handful of displays. plato-reader took the other road: it widened `refs.py` to letters a–e for Stephanus and dispatches on scheme in stages 1, 2 and 7 (`plato-reader/pipeline/plato_pipeline/refs.py`), and it pins a `section_spine: {count, sha256}` per manifest. Stephanus is still page+letter+line, so plato's change does not fit chapter.section. The Busse road does.

Below, every place the Bekker model shows. "OK" means the synthetic column "Na" with line = section passes through unchanged.

### Pipeline

| Where | What it assumes | For chapter.section |
|---|---|---|
| `pipeline/aristotle_pipeline/refs.py:12` | `^(\d+)([ab])(\d+)?$` | OK: "49a3" parses |
| `config.py:56-62` (`bekker_range`), `:86-96` (`book_for_line`) | Bekker columns | OK with `first_column: "1a"`, `last_column: "69a"`, one book `1a1`–`69a2` |
| `stage1_greek.py:143-158` | Reads `Bekker-page` divs; busse reads `page` divs | **Change**: new branch (P1) |
| `stage2_validate.py:369`, `:380-384` | Expects a+b columns; busse expects a-side only | **Change**: chapter-section takes the a-side branch |
| `stage2_validate.py:435-437` | busse marks every line gap as expected | **Must not inherit**: sections run 1..n with no gaps, so a gap is a real error |
| `preflight.py:198-204` | `bekker_native = scheme in (None, "", "bekker")` skips order and anchor checks for busse | **Change**: chapter-section keeps those checks, since its synthetic columns do order correctly |
| `preflight.py:119,138,141,166` | Manifest fields "must be a Bekker ref string" | OK: synthetic refs pass |
| `stage5_lsj.py:46-72`, `lsj_citation_map.py:9-49` | `(\d+[ab]):(\d+)`; no 003 | **Change** (P4) |
| `stage6_search.py:439` | Busse heading-line snap | OK (does not fire: no heading lines) |
| `stage7_emit.py:211-262` | Chapter span label, e.g. "49a1–5" | Emitted but must not be shown (R3) |
| `stage1_archive.py` + `sources/*/anchors.yaml` (`bekker: "71a1"`, `at:`) | Bekker refs on English ticks | OK: `bekker: "49a3"` at each section start |
| `scripts/check-links.mjs:162-185` | `loc=` as `col:line`; LSJ links snap to the nearest line | OK for format. **Change**: snapping must not cover AthPol (G5) |
| `app/scripts/build-bekker-index.mjs:10` | Aggregates all `columns.json` | OK: the palette filters by scheme at query time |

### Front end (`shared/` is copied into plato-reader and homer, so these edits stay local and port per hunk)

| Where | What it does | For chapter.section |
|---|---|---|
| `shared/lib/works.ts:71` | `scheme: 'bekker' \| 'busse'` | **Change**: add `'chapter-section'` |
| `shared/components/Reader.svelte:40-41` | `busse` flag; also drives sidenotes and figures (`:44`, `:47`, `:1559`, `:1582`) | **Don't reuse `busse`**: add a separate flag |
| `Reader.svelte:1181-1188` (`showLineNum`) | Prints line 1 and every 5th | **Change**: print every section |
| `Reader.svelte:1314` | Chapter head shows "(1094a1–17)" unless busse | **Change**: hide |
| `Reader.svelte:1447` | "approximate ticks" note | OK: fully anchored, so it never shows |
| `Reader.svelte:1476-1480` | Column label above each segment ("1094a") unless busse | **Change**: hide (column = chapter, and the chapter head already says so) |
| `Reader.svelte:1358,1381` (`bk-num`) | English margin shows the tick's line number | OK: shows the section number, as Kenyon's margin does |
| `Reader.svelte:1016-1025`, `:1090`; `shared/lib/data.ts:283-310` | `loc=col:line`, anchor ids `L49a-3`, URL hash `#49a3` | OK internally; the hash reads "49a3" (R2) |
| `shared/components/Search.svelte:941` | Hit label `${column}${line}` → "49a3" | **Change**: show "49.3" |
| `app/src/lib/lemma-view.ts:54` | Same label in the lemma concordance | **Change** |
| `shared/lib/palette.ts:30,46-47` | ⌘K jump; filters to scheme `bekker` | OK: AthPol is left out (Q7) |
| `app/src/components/ReaderShell.astro:35,269,323` | Hides BekkerJump for busse | **Change**: hide for chapter-section |
| `ReaderShell.astro:302` | Chapter tooltip "· 1094a1–17" | **Change**: hide |
| `app/src/components/Landing.astro:205` | "exact Bekker citation" / "page" | **Change**: "chapter and section" |
| `desktop/src/App.svelte:52,923,1070` | busse flag; cite string; BekkerJump | **Change**: cite "Arist. Ath. Pol. 49.3"; hide jump |
| `desktop/src/components/LibraryRail.svelte:88` | Active chapter by column position | OK: "49a" orders |
| `desktop/src/lib/corpus.ts:42,143` | `citationScheme?: 'bekker' \| 'chapter' \| 'lecture'`; slot `AthPol` (tlg0086.tlg003) | Promote slot to a built entry with `citationScheme: 'chapter'` (already in the union) |
| `desktop/src/lib/annotations.ts:650,654` | Annotation cite labels; `:654` prints the raw column for English annotations | **Change** (R2) |
| *Added after the Codex review:* | | |
| `stage1_greek.py:264-266` (`run`) | Calls `run_export` (Diogenes) before `parse_spine` | **Change**: dispatch on the Greek source in `run`, before the export (P1) |
| `stage1_archive.py:62-64`, `:380` | An anchor ref's line part must be all digits; anchors load only from `english.primary.anchors` | Spell anchors "49a3" and name the anchors file in the manifest (P5) |
| `app/src/pages/[work]/index.astro:10`, `Landing.astro:34` | Builds a page for every `WORKS` entry and reads its `chapters.json` | The registry entry must land with the data (G1/G2) |
| `shared/components/WorkSwitcher.svelte` | Lists every `WORKS` entry on every reader page | Other works' pages gain an AthPol option: an intended change (G3) |
| `shared/lib/greek-track.ts:32-37`, `desktop/src/desktop.css:47` | Greek column width = widest unwrapped `.greek-line` (`max-content`) | **Change**: a section-long line would make the Greek track thousands of px wide; give chapter-section a bounded track (R3) |
| `shared/styles/global.css:2777,2789` (print) | `.line-text { white-space: nowrap }`, `.greek-line { break-inside: avoid }` | **Change**, scoped to chapter-section: wrap, and allow breaks (R3) |
| `Reader.svelte:528`, `:1085` | Jumps center the target line (`block: 'center'`) | **Change**: a section taller than the screen would open mid-section; align to the top for chapter-section (R3) |
| `Reader.svelte:484-485`; `data.ts:311-312` | With Greek hidden, the scroll spy watches `.segment` only, so the hash becomes `#49a` | **Change**: watch English section ticks for chapter-section (R3) |
| `ReaderShell.astro:345,368`; `Search.svelte:1927`; `LemmaPage.astro:244,266`; `LibraryRail.svelte:188,208` | Print the chapter span `c.bekker` ("49a1–5") | **Change**: format or hide (R2) |
| `Search.svelte:968-982` | English hits: `ref: seg.column`, one row per chapter | **Change**: group by section, label with the formatter (R2) |
| `desktop/src/lib/translation-file.ts:357,432` | An import tag `{49.3}` parses as book 49, chapter 3 | Out of scope for v1: AthPol imports would need synthetic tags (`{49a3}`); say so in the importer docs |

## 5. Design

**One new scheme, riding the Isagoge's road.** Chapter N becomes synthetic column "Na",
section S becomes line S, so `?loc=49a:3` is Ath. Pol. 49.3. Each section is one
Greek "line". Every place that would show a column or line to a reader goes through
one formatter that prints "49.3" for this scheme and the old string for every other.

### Pipeline (P)

- **P1. Greek loader.** Dispatch in `stage1_greek.run`, before `run_export`, so the Perseus path never calls Diogenes; a test runs it with no export cache present. `citation.scheme: chapter-section` with `greek.source: perseus_tei` reads `sources/tlg0086.tlg003.perseus-grc2.xml`. It takes each `section`/`subsection` div's text (Perseus notes dropped, stray numerals cleaned) as one spine line, `{column: f"{chapter}a", n: section}`, fragments skipped. The output dict has the same shape as the TLG path. If John picks TLG instead (Q1), the branch reads `Section`/`subsection` divs from the export and joins each subsection's printed lines into one line.
- **P2. Validation.** In `stage2_validate`, chapter-section takes the a-side column branch but keeps the strict gap check. In `preflight`, chapter-section counts as ordered (`bekker_native` true for it). The manifest pins the section inventory: 69 per-chapter counts (299 in all), read off Kenyon's 1921 margins and checked by hand against the OCT. Stage 2 fails if the spine differs in any chapter, not only in total. The count comes from the printed English, a witness independent of the TEI, so the check does not compare the source with itself.
- **P3. Manifest `manifests/AthPol.yaml`.** `work.authenticity` (Q2); `citation.scheme: chapter-section`; `bekker_range` 1a–69a; one book; `chapters.source: explicit`, 69 entries `{n: N, bekker: "Na1"}`; `english.primary` archive model, dir `athpol-kenyon`, `chapter_marker: part`.
- **P4. LSJ.** Add a second pattern in `stage5_lsj._bibl_href` for `tlg,0086,003:(\d+)(?::(\d+))?`, mapping to `/AthPol/book/1?loc={C}a:{S or 1}`. It goes through the same guards as the Bekker branch: `resolve_citation`, `Manifest.for_work` (no manifest, no link) and `book_for_line`. It also returns no link unless the section is in the pinned inventory, so the branch is dead until the map entry and the manifest both exist. Add `"003": "AthPol"` to `CITATION_WORKS`, with a "verified against LSJ" note giving these counts. The 10.7 citation stays an unlinked span (Q6).
- **P5. English source.** `sources/athpol-kenyon/book-01.html` with `Part N` markers, plus `anchors.yaml` holding 299 `{bekker: "49a3", at: phrase}` entries (compact refs: `stage1_archive` reads only an all-digit line part). There is one entry per section, read from Kenyon's margins, and the manifest names the file in `english.primary.anchors`. Built by a script on the model of `build_spir_dobson.py`:
  - take the hOCR body text of n370–n448, with footnotes cut by type size and running heads dropped;
  - diff it against Gutenberg #26095 and rule each disagreement against the page image;
  - record corrections to the 1921 print in a READS list.
  - Scans go in gitignored `build/athpol-ocr/`.

### Reader (R)

- **R1.** Add `'chapter-section'` to the `citation.scheme` union in `shared/lib/works.ts`. The work's own entry lands later, with its data (R5), because Astro builds a page for every entry and needs its `chapters.json`.
- **R2.** Add one helper in `shared/lib/data.ts`, `citeLabel(work, column, lineRef)`, and a chapter-span formatter. They return the old strings unchanged for bekker and busse, and "49.3" / "49" for chapter-section. Use them at every site the section 4 table marks R2:
  - `Search.svelte:941,982,1927` (English hits are also grouped by section, not chapter);
  - `lemma-view.ts:54` and `LemmaPage.astro:244,266`;
  - `ReaderShell.astro:302,345,368` and `LibraryRail.svelte:188,208`;
  - the desktop cite (`App.svelte:923`) and `annotations.ts:650,654`.
  - Where a helper today has no work in hand (e.g. `instanceLabel`), its signature gains one.
  - The URL hash stays `#49a3`. Changing its format would touch the scroll spy and saved positions for every work.
- **R3.** Reader changes, all behind `scheme === 'chapter-section'`:
  - A new `nonBekker` flag (busse or chapter-section) hides the column label, the chapter span and the BekkerJump. The `busse` flag keeps its sidenotes and figures role, so nothing changes for the Isagoge.
  - `showLineNum` prints every section.
  - The Greek track is bounded instead of `max-content`, so a section-long line wraps (`greek-track.ts`, `desktop.css:47`).
  - Print wraps those lines and lets them break across pages (`global.css:2777,2789`).
  - Citation jumps align to the top, not the center (`Reader.svelte:528,1085`).
  - With Greek hidden, the scroll spy watches English section ticks, so English-only reading still saves `#49a3`, not `#49a` (`Reader.svelte:484`).
  - Checked by eye at large type, phone landscape, desktop with rails open and closed, and a section taller than the screen.
- **R4.** In `ReaderShell.astro` and `Landing.astro`, the same conditionals; the Landing wording reads "chapter and section".
- **R5.** Lands with the manifest, at G2: the `works.ts` entry and `CATEGORIES` placement, and the `AthPol` slot in `desktop/src/lib/corpus.ts` turned into a built entry with `citationScheme: 'chapter'`. Desktop translation imports keep their tag syntax; AthPol imports use synthetic tags (`{49a3}`), documented, not parsed specially.

### Blast radius

- Every edit is a branch on `scheme === 'chapter-section'` or a new file.
- The shared helpers (R2 and the `nonBekker` flag) return the old values for bekker and busse, and unit tests pin that.
- No other manifest, source, alignment or anchor file changes.
- Files touched: those named in P1–P5 and R1–R5, plus their tests. Nothing else.
- Adding a work still changes some things corpus-wide, on purpose. Other works' text and per-work data must not change, but these do:
  - every reader page's work switcher, the home page and the search work list gain AthPol;
  - LSJ entries that cite Ath. Pol. gain links, wherever they are opened;
  - corpus-wide ngram scores and thresholds shift, because the corpus grew;
  - `bekker.json` gains AthPol's synthetic columns (the palette filters them out).
- The gates name each of these changes and allow nothing else.

### Gates (a check must say what it examined; write the failing case first)

- **G1. Code-only no-op.** Land P1, P2, P4 (the 003 map entry left out) and R1–R4 **without** `AthPol.yaml` or the R5 registry entries.
  - Run `npm run build:public` on the base commit and on this one.
  - Compare sha256 of every file under `build/dist`: zero differences, and the report states the file count. This proves the new code paths are dead for every existing work.
  - Run the full pytest, scripts, shared vitest and desktop test suites.
  - This repo has no `npm run smoke`; the render check is G3.
- **G2. Adding the work.** With the manifest, the 003 map entry and R5 in, run a full rebuild (the LSJ merge is last-writer-wins, `stage7_emit.py:510-532`) and compare with G1. Each artifact has its own rule:
  - **Every `build/dist/<work>/` other than `AthPol/`**: byte-identical.
  - **`lsj/*.json`**: keys may be added; an existing entry may change only by `<span class="lsj-bibl">` becoming `<a class="lsj-bibl" href="/AthPol/…">` on a 003 citation. A script undoes exactly that and requires the rest to match G1. It prints how many it rewrote (expected: the entries holding 003 citations; zero fails).
  - **Ngram streams, `lemma-map` and the search shards**: these are recomputed over the whole corpus (`stage8_ngrams.py:225-249,287-296`), so removing AthPol cannot restore the old bytes. The rule: on the G2 commit, with `AthPol.yaml` moved aside, rebuild them and require that to match G1 byte for byte. That proves the 003 map entry and R5 change nothing by themselves, so the remaining difference comes from adding the work alone. The diff summary is then written into the PR, not waved through.
  - **`bekker.json`**: G1's content plus AthPol's 69 synthetic columns, nothing else.
- **G3. Pages and rendering.**
  - (a) Base commit against G1: `app/dist/**/*.html` identical for every route with asset hashes masked. The route count is printed and must equal the base's.
  - (b) Because masking hides changes inside shared JS and CSS, open a fixed sample of rendered reader pages in a browser on both builds and compare their DOM text: two Bekker works, the Isagoge, a lettered-line page (Phys 244b), and a lemma page.
  - (c) G1 against G2: other works' HTML may differ only where the work switcher, home page and search lists add AthPol.
- **G4. Section spine.** The per-chapter inventory pinned in P2 (69 counts, 299 sections, from Kenyon's print) must equal the Greek spine chapter by chapter. Each of the 299 anchors is found exactly once, in its own chapter, in order, and each section's first Greek words match a recorded boundary witness. The check prints 69/299/299. Planted cases fail it: a shifted boundary, a missing first section, a missing last section, and a bad phrase.
- **G5. LSJ.**
  - Enumerate all 527 raw citations in `grc.lsj.xml`, independent of the build. For each, assert it is emitted as a link to `L{C}a-{S}` (526) or is the one declared exception (10.7). Report any citation whose entry was not emitted as a separate count, never as a pass.
  - Then `check-links.mjs` checks the emitted targets **exactly**: no nearest-line snap for AthPol.
  - A planted valid citation left as a span must fail.
- **G6. The usual.** `build:public` gates, shared-LSJ verify, link integrity at 0 broken, leak check, and the app built with `PUBLIC_SHOW_PRIVATE=0`.

### Home page

The home page groups works into the five numbered divisions plus the "Spurious Works" appendix (`shared/lib/works.ts` `CATEGORIES`). Ath. Pol. is a Bekker-less work of the Aristotelian school whose authorship is disputed. There are two plain homes for it:

- (a) the "Spurious Works" appendix with a `dubious` badge;
- (b) Division IV, Moral and Political Philosophy, after the Politics, with a `dubious` badge.

John decides the place and the label (Q2).

## 6. Open questions for John

1. **Q1 Greek.** Perseus Kenyon OCT 1920 (recommended: exact sections, Kenyon's own text, CC BY-SA, needs its own loader), or TLG Oppermann 1928 (same loader family as every other work, sections only line-exact, no 49.5, fuller supplements in ch. 64–69)?
2. **Q2 Place and label.** Spurious appendix or Division IV? `dubious` or `spurious`? (Most now hold it a work of Aristotle's school, not his own hand; the Magna Moralia precedent is `dubious`.)
3. **Q3 Kenyon's footnotes.** Keep them as notes (the archive model supports `footnotes: true`, as on the Isagoge), or strip them like most Oxford sources?
4. **Q4 Fragments.** Leave out the four opening fragments (Kenyon 1921 does not translate them), or show them Greek-only?
5. **Q5 Id and abbreviation.** `AthPol` (the desktop slot's id) with abbreviation "Ath. Pol."? LSJ prints "Ath.".
6. **Q6 LSJ "Ath. 10.7".** Leave unlinked (recommended), or link to 10.2, where δίδραχμον stands?
7. **Q7 ⌘K palette.** Out of scope for v1 (it filters to Bekker works). Should "Ath. Pol. 56.6" jump later?
8. **Q8 Parked: synthetic Bekker long term.** This plan reuses the synthetic-column trick and leaves the citation model alone. The cost is a second scheme of fake columns ("49a" means chapter 49), on top of the Isagoge's, which commentaries would add to. Whether to replace the trick with a real non-Bekker citation type is John's later question, not this plan's.

## 7. What I could not verify

- All 299 of Kenyon's 1921 section marks. I sampled two pages; G4 settles the rest at build time.
- Rackham's US status (URAA, simultaneous publication). It doesn't affect the choice.
- How the reader lays out a paragraph-long Greek "line". The Isagoge's lines are printed lines, so no work yet has one Greek line per section. Wrapping and the `cont` continuation logic (`Reader.svelte:623`, and the `item.line.cont` rows below `:1520`) need a smoke render and a phone-landscape look (memory: the reader has a vision-impaired user) before R3 is called done.
- Bell 1891, Poste and Rackham OCR quality: not sampled, as none is recommended.

## 8. Codex review (GPT-6.1-Sol, medium, 2026-11-06)

Codex returned 18 findings. Its full text is in the side-session notes folder (`ath-pol-codex-review.txt`).

- I checked each one against the code. All 18 held, and every one is folded in above.
- The biggest fixes:
  - P1 must dispatch before the Diogenes export.
  - G1 cannot include the registry entry (Astro would fail on missing data).
  - G3 compared two builds that both carried the new code, so it could never catch a regression in it.
  - G2's undo-the-diff trick cannot work for corpus-wide ngram scores.
  - G4 and G5 needed independent witnesses (Kenyon's printed section inventory; a raw LSJ citation inventory) so they do not compare the source with itself or examine only what was emitted.
- It also caught a counting error of mine: the OCT has **299** sections in ch. 1–69, not 298. Oppermann has 298, because he lacks 49.5.
- It found six reader assumptions the first map missed: the Greek track width, print, centred jumps, the English-only scroll spy, chapter-span labels, and English search grouping.
