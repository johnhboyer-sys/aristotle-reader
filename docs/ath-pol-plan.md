# Athenian Constitution (Ath. Pol.): sources and plan

Status: plan only, 2026-11-06. Nothing is built. John answered Q1 and Q3–Q8 the same
day (section 6). Q2 waits on the findings in section 9, and building waits on his go-ahead.

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

**John chose TLG (Q1, 2026-11-06); P1 records the cost.** What follows is the original recommendation, kept for the record. **Recommendation: Greek from the Perseus Kenyon OCT.** Its sections are exact, it is
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
| `stage1_greek.py:264-266` (`run`) | Calls `run_export` (Diogenes) before `parse_spine` | Mattered only for a Perseus loader; with TLG (John's Q1) the export runs as usual |
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

- **P1. Greek loader (TLG, John's Q1).** The export runs as for every other work (`run_export` unchanged). In `parse_spine`, `citation.scheme: chapter-section` reads the export's `<div type="Section" n=C>` / `<div type="subsection" n=S>` divs. It rejoins hyphenated words as the Bekker path does, then joins each subsection's printed lines into one spine line `{column: f"{C}a", n: S}`. That gives 69 columns and 298 lines. The Perseus TEI is not used.
- **What TLG costs, and how Kenyon's English lines up against it.** Measured against the OCT, whose sections Kenyon's margins follow:
  - **Chapter starts are nearly exact.** Oppermann starts chapters on a fresh line, so 61 of chapters 2–69 begin on the same word. Two begin 3 words early, and five have a differing reading at the edge, so I could not place them.
  - **Section starts inside a chapter are only line-exact.** Oppermann's subsection marker sits on the printed line where the section begins, so the tail of section S−1 rides into S.
    - Of 229 such starts, 51 fall on the same word and 150 fall early: median 4 words, mean 4.3, at most 20.
    - None falls late.
    - 28 could not be placed, because the readings differ at the boundary.
  - Beside Kenyon's English section S, then, the Greek line S usually opens with the last few words of S−1. An LSJ link to a word at the very end of a section can land one row below the word. Nothing is interpolated; the Greek is simply cut at Oppermann's line.
  - **No 49.5.** Oppermann prints the OCT's 49.5 inside 49.4, so the Greek has 298 sections against Kenyon's 299. Kenyon's 49.5 ("The Council also, speaking broadly, co-operates…") gets no anchor of its own: its English runs on inside 49.4, and Kenyon's margin "5" is lost at that spot. The manifest declares that one merge. LSJ never cites 49.5, so no link is lost.
  - **Ch. 64–69 are fuller in the Greek.** Oppermann prints supplements in the damaged fourth roll (1,750 words against the OCT's 1,280). Kenyon translated his own sparser reconstruction, which his 1921 preface says was "now translated for the first time". So in those chapters the Greek column carries words the English does not render.
  - **Not ruled out, not planned:** re-cutting Oppermann's lines at the OCT's word boundaries would remove the edge drift. It is a separate step with its own checks, and it is outside this plan unless John asks for it.
- **P2. Validation.** In `stage2_validate`, chapter-section takes the a-side column branch but keeps the strict gap check. In `preflight`, chapter-section counts as ordered (`bekker_native` true for it). The manifest pins two inventories:
  - the English one: 69 per-chapter counts, 299 sections, read off Kenyon's 1921 margins;
  - the Greek one: the same, except chapter 49 has 4, so 298 in all.
  - Stage 2 fails if the spine differs from the Greek inventory in any chapter, not only in total. The English inventory comes from the printed translation, a witness independent of the TLG text, and the only difference allowed between the two is the declared 49.5 merge.
- **P3. Manifest `manifests/AthPol.yaml`.** `work.authenticity` (Q2); `citation.scheme: chapter-section`; `bekker_range` 1a–69a; one book; `chapters.source: explicit`, 69 entries `{n: N, bekker: "Na1"}`; `english.primary` archive model, dir `athpol-kenyon`, `chapter_marker: part`.
- **P4. LSJ.** Add a second pattern in `stage5_lsj._bibl_href` for `tlg,0086,003:(\d+)(?::(\d+))?`, mapping to `/AthPol/book/1?loc={C}a:{S or 1}`. It goes through the same guards as the Bekker branch: `resolve_citation`, `Manifest.for_work` (no manifest, no link) and `book_for_line`. It also returns no link unless the section is in the pinned inventory, so the branch is dead until the map entry and the manifest both exist. Add `"003": "AthPol"` to `CITATION_WORKS`, with a "verified against LSJ" note giving these counts. The 10.7 citation stays an unlinked span (Q6).
- **P5. English source.** `sources/athpol-kenyon/book-01.html` with `Part N` markers, plus `anchors.yaml` holding 298 `{bekker: "49a3", at: phrase}` entries (compact refs: `stage1_archive` reads only an all-digit line part). There is one entry per Greek section, read from Kenyon's margins (his 49.5 has none; see P1), and the manifest names the file in `english.primary.anchors`. **Kenyon's footnotes are kept as notes** (John's Q3): `footnotes: true`, as on the Isagoge. Built by a script on the model of `build_spir_dobson.py`:
  - take the hOCR body text of n370–n448, with running heads dropped and footnotes split out by type size into the notes, keyed to their markers;
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
- **R6. ⌘K palette (John's Q7, in scope).** In `shared/lib/palette.ts`, a new pure parser `parseSectionCitation(q)` reads a work prefix followed by `C.S` or `C`.
  - The prefix is matched against the `abbr` and `id` of works whose scheme is chapter-section, folded to lower case with dots and spaces dropped, so "Ath. Pol. 56.6", "athpol 56.6" and "Ath.Pol. 56" all work.
  - It returns `{work, loc: "56a:6"}`, or a hash `56a` for a bare chapter. The target is checked against that work's entries in `bekker.json` (column 56a, lines 1–7), and a section out of range offers no jump.
  - Inside AthPol, a bare "56.6" jumps too.
  - `CommandPalette.svelte` tries this parser before the Bekker one (`:76`). A Bekker citation always carries a/b, so "56.6" can never parse as one and no existing input changes meaning.
  - Tests: every existing case in `palette.test.ts` passes unchanged; the new cases include an out-of-range section and a prefix that matches no work.
- **R5.** Lands with the manifest, at G2: the `works.ts` entry and `CATEGORIES` placement, and the `AthPol` slot in `desktop/src/lib/corpus.ts` turned into a built entry with `citationScheme: 'chapter'`. Desktop translation imports keep their tag syntax; AthPol imports use synthetic tags (`{49a3}`), documented, not parsed specially.

### Blast radius

- Every edit is a branch on `scheme === 'chapter-section'` or a new file.
- The shared helpers (R2 and the `nonBekker` flag) return the old values for bekker and busse, and unit tests pin that.
- No other manifest, source, alignment or anchor file changes.
- Files touched: those named in P1–P5 and R1–R6, plus their tests. Nothing else.
- Adding a work still changes some things corpus-wide, on purpose. Other works' text and per-work data must not change, but these do:
  - every reader page's work switcher, the home page and the search work list gain AthPol;
  - LSJ entries that cite Ath. Pol. gain links, wherever they are opened;
  - corpus-wide ngram scores and thresholds shift, because the corpus grew;
  - `bekker.json` gains AthPol's synthetic columns (the Bekker palette filters them out; R6 reads them for AthPol).
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
- **G4. Section spine.** The Greek spine must equal the pinned Greek inventory (P2) chapter by chapter, and the Greek inventory must equal the English one apart from the declared 49.5 merge.
  - Each of the 298 anchors is found exactly once, in its own chapter, in order.
  - Each Greek section's first words match a recorded boundary witness taken from the export.
  - The check prints 69 / 299 English / 298 Greek / 298 anchors / 1 declared merge.
  - Planted cases fail it: a shifted boundary, a missing first section, a missing last section, an undeclared merge, and a bad phrase.
- **G5. LSJ.**
  - LSJ never cites 49.5, so the merge costs no link. Its one 49.4 citation lands on Oppermann's 49.4, which also holds the OCT's 49.5.
  - Enumerate all 527 raw citations in `grc.lsj.xml`, independent of the build. For each, assert it is emitted as a link to `L{C}a-{S}` (526) or is the one declared exception (10.7). Report any citation whose entry was not emitted as a separate count, never as a pass.
  - Then `check-links.mjs` checks the emitted targets **exactly**: no nearest-line snap for AthPol.
  - A planted valid citation left as a span must fail.
- **G6. The usual.** `build:public` gates, shared-LSJ verify, link integrity at 0 broken, leak check, and the app built with `PUBLIC_SHOW_PRIVATE=0`.

### Home page

The home page groups works into the five numbered divisions plus the "Spurious Works" appendix (`shared/lib/works.ts` `CATEGORIES`). Placement and label wait on John (Q2); the findings and a recommendation are in section 9.

## 6. Questions and John's answers (2026-11-06)

1. **Q1 Greek: TLG** (Oppermann 1928), the same loader family as the other works. Its costs, and how Kenyon's sections line up against it, are under P1.
2. **Q2 Place and label: open.** John asked what the literature says; section 9 answers that, and he decides from it.
3. **Q3 Kenyon's footnotes: kept** as notes (P5).
4. **Q4 Fragments:** John asked why Kenyon doesn't translate them; section 10 answers. The plan leaves them out, as before, unless John says otherwise after reading section 10.
5. **Q5 Id: `AthPol`, shown as "Ath. Pol."**
6. **Q6 LSJ "Ath. 10.7": left unlinked.**
7. **Q7 ⌘K palette: in scope for v1** (R6).
8. **Q8 Parked, unchanged: synthetic Bekker long term.** This plan reuses the synthetic-column trick and leaves the citation model alone. The cost is a second scheme of fake columns ("49a" means chapter 49), on top of the Isagoge's, which commentaries would add to. Whether to replace the trick with a real non-Bekker citation type is John's later question, not this plan's.

## 7. What I could not verify

- All 299 of Kenyon's 1921 section marks. I sampled two pages; G4 settles the rest at build time.
- Rackham's US status (URAA, simultaneous publication). It doesn't affect the choice.
- How the reader lays out a paragraph-long Greek "line". The Isagoge's lines are printed lines, so no work yet has one Greek line per section. Wrapping and the `cont` continuation logic (`Reader.svelte:623`, and the `item.line.cont` rows below `:1520`) need a smoke render and a phone-landscape look (memory: the reader has a vision-impaired user) before R3 is called done.
- Bell 1891, Poste and Rackham OCR quality: not sampled, as none is recommended.

## 8. Codex review (GPT-6.1-Sol, medium, 2026-11-06)

Codex returned 18 findings. Its full text is in the side-session notes folder (`ath-pol-codex-review.txt`).

- I checked each one against the code. All 18 held, and every one is folded in above.
- The biggest fixes:
  - P1 must dispatch before the Diogenes export (moot once John chose TLG).
  - G1 cannot include the registry entry (Astro would fail on missing data).
  - G3 compared two builds that both carried the new code, so it could never catch a regression in it.
  - G2's undo-the-diff trick cannot work for corpus-wide ngram scores.
  - G4 and G5 needed independent witnesses (Kenyon's printed section inventory; a raw LSJ citation inventory) so they do not compare the source with itself or examine only what was emitted.
- It also caught a counting error of mine: the OCT has **299** sections in ch. 1–69, not 298. Oppermann has 298, because he lacks 49.5.
- It found six reader assumptions the first map missed: the Greek track width, print, centred jumps, the English-only scroll spy, chapter-span labels, and English search grouping.

## 9. Q2: what the literature says on authorship

**What I read myself:** Kenyon's introductions, the OCT preface, Aristotle's *Ethics*, the OCT fragments. **What I took from catalogues, publisher pages and reviews**, without reading the books: Wilamowitz, Rhodes 1981, Keaney. Each item says which it is.

- **Aristotle names the collection.** At *NE* X.9, 1181b17 (read in the TLG export) he plans to study "from the collected constitutions" (ἐκ τῶν συνηγμένων πολιτειῶν) what preserves and destroys cities. Ancient lists credit him with 158 *Politeiai*; the count is from Diogenes Laertius 5.27 as reported by secondary sources (I did not read the Greek of D.L.). Ath. Pol. is the one that survives nearly whole, on the British Museum papyrus.
- **Ancient testimony is all one way.** Every ancient writer who quotes it gives it to Aristotle. The lexicographers in the OCT's fragments cite "Ἀ[ριστοτέλης] ἐν τῇ Ἀθ[ηναίων] πολ[ιτείᾳ]" (Harpocration s.v. τριττύς). The 1911 *Britannica* article adds that no ancient writer questioned it (secondary).
- **Kenyon (1891; Bell 2nd ed. 1912, Introduction pp. xiv–xvii) leaves authorship open** (read).
  - Against Aristotle's own hand: so large a survey of constitutions "might easily have been committed by the master to some of his disciples", and competent judges miss Aristotle's compression of thought.
  - For it: the sober style, the impartial judgments and the unanimous ancient testimony.
  - His conclusion: if it is not Aristotle's own work, it was at least "composed under his direction and for his use" (p. xvi). He will call it Aristotle's "as being at least the outcome of his inspiration and direction" (p. xix).
- **Wilamowitz, *Aristoteles und Athen* (1893)** accepted Aristotle's authorship (secondary: Wikipedia and the 1911 *Britannica*; not read).
- **Rhodes, *A Commentary on the Aristotelian Athenaion Politeia* (Oxford 1981)** is the standard commentary. Its introduction has a section on "the place of the work in the Aristotelian school" (catalogue contents note). I could not read his argument.
  - His later editions name his view in their titles and blurbs. The Penguin translation (1984) is described as "probably written by a student of Aristotle" (publisher blurb).
  - His Liverpool edition (2017) is titled *The Athenian Constitution written in the School of Aristotle* (BMCR 2018.07.21).
  - The Valla edition he co-translated (2016) notes that its language and style differ from those of the genuine works (BMCR 2017.08.11).
- **Keaney, *The Composition of Aristotle's Athenaion Politeia* (OUP 1992)** defends Aristotle's own authorship on literary grounds, reading the work as a new genre (publisher abstract, Rutgers bio; the BMCR 3 (1992) 361–5 review not read).
- **Net:** the ancients are unanimous for Aristotle. Modern opinion is split: Wilamowitz and Keaney hold it is his; Rhodes, the standard commentator, gives it to a pupil in his school; Kenyon would not decide. No one argues it was falsely ascribed or written long after Aristotle; the dating (after 329, before 322 BC, Kenyon p. xvi n.) puts it in his lifetime.

**Recommendation**

- **Label `dubious`, not `spurious`.** This repo's rule (`docs/dubious-works.md`): `dubious` is for "genuinely contested works (e.g. Magna Moralia)"; `spurious` is for works "transmitted with Aristotle but not by him". Ath. Pol. is contested, not disowned. At worst it is a pupil's work done under Aristotle's direction for his own research programme.
- **Place: the appendix, beside the Magna Moralia.** That keeps one rule for the home page: the numbered divisions hold the works taken as Aristotle's own, and every work whose authorship is doubted sits in the appendix with its badge.
  - The appendix is titled "Spurious Works", which already misdescribes the Magna Moralia (the MM session flagged this). Retitling it "Doubtful and Spurious Works" fixes both. It changes the home page heading for every visitor, so it is John's call.
  - The case for Division IV instead: the work is the surviving piece of the research the *Politics* draws on (*NE* 1181b17). It would sit after the *Politics* with its `dubious` badge, the badge alone carrying the doubt.

## 10. Q4: why Kenyon does not translate the fragments

**What the fragments are** (Kenyon's OCT 1920, as Perseus encodes it: `frag_1`–`frag_4`, 8 pieces):

- They are later writers' summaries and quotations of the lost opening, which told of Ion and Theseus.
- frag. 1:
  - the epitome of Heraclides (Ἐκ τῶν Ἡρακλείδου περὶ πολιτειῶν: Athens first ruled by kings, Ion, Pandion's division of the realm);
  - Harpocration s.v. Ἀπόλλων πατρῷος;
  - the scholion on Aristophanes, *Birds* 1537.
- frag. 2: Plutarch, *Theseus* 25.
- frag. 3: on the γεννῆται and the old division into farmers and craftsmen:
  - the scholion on [Plato], *Axiochus* 371d;
  - the *Lexicon Patmense*;
  - Harpocration s.v. τριττύς.
- frag. 4: the Vatican scholion on Euripides, *Hippolytus* 11 (Theseus' death on Scyros).

**Kenyon's own words** (all read in the scans):

- **OCT 1920, Praefatio p. v:** the papyrus's first column is blank, and since the beginning of the work is missing, it was copied from a damaged exemplar: "Prima pagina sine scriptura est; sed, cum initium operis desit, patet papyrum nostram ex archetypo mutilo transcriptam esse."
- **OCT 1920, Praefatio pp. vi–vii:** he places the fragments *after* the text: "Fragmenta partis in initio libelli deperditae subieci; item epitomen, quam vocant, vel potius citationes quas Heraclides nescio quis hic illic e libro Aristotelico excerpsit." That is: "I have appended the fragments of the part lost at the start of the book; also the so-called epitome, or rather the citations that some Heraclides or other excerpted here and there from Aristotle's book."
- **OCT 1920, Praefatio p. vii:** his only aim was to set out the text as the London papyrus restored it: "Id tantum mihi proposui ut textum qualem nobis papyrus Londinensis … reddidit simplicem … exponerem."
- **Bell translation, Introduction** (1891 pp. xvi–xvii; 1912 pp. xix–xx): the part on Ion and Theseus "is still lost to us, for the newly-discovered MS. is imperfect at the beginning … the narrative now commences in the middle of a subject and even in the middle of a sentence." (In 1891 he thought the opening was "never transcribed"; by 1920 he held the scribe copied from an exemplar that had already lost it.)
- **Oxford 1921 preface** (vol. X, `/page/n364`): this is a translation of "the treatise" on the Oxford text. It says nothing about the fragments.

**Answer:** Kenyon never says in so many words why he leaves them untranslated. His prefaces do show why. He edits and translates the text the papyrus gives, and the fragments are not that text: they are other writers' paraphrases and quotations (Heraclides' summary, lexicon entries, scholia, Plutarch). In his own edition he prints them as an appendix after the text ("subieci"), and he calls even the "epitome" no more than excerpts. So the 1921 translation, which renders his OCT's text, stops where the papyrus stops. This is my reading of his prefaces, not a sentence of his.

**For the site:** the plan still leaves the fragments out (Q4 as first answered). If John wants them, they would be Greek-only testimonia before chapter 1, needing a column outside the 69 and a second Greek source: the TLG export does not have them (its text opens at 1.1, "— —Μύρωνος"), so they would come from the Perseus OCT.

**Do later translations include them?** (checked 2026-11-06)

Most later translations do, though only in part. Each one prints them apart from the text, usually after it, as Kenyon's OCT does. The exceptions are Rackham and Rhodes 2017, which print them before chapter 1. The Revised Oxford Translation, which is Kenyon revised, still leaves them out.

| Translation | Includes them? | Which | Where | How I know |
|---|---|---|---|---|
| Rackham, Loeb 1935 | Yes | Heraclides' epitome as Fr. 1–8, with the lexicon, scholia and Plutarch quotations put in angle brackets where they fill gaps in Heraclides. Rackham notes that he gives only the fragments of the lost early part. | Before ch. 1, Greek facing English, pp. 8–13 | Read in the archive.org scan `athenianconstitu00arisuoft` (full text) |
| von Fritz and Kapp, Hafner 1950 | Yes, both kinds | "The Epitome of Heracleides" (introduction and translation), then "Fragments of the Lost Beginning of Aristotle's Constitution of Athens", numbered: 1 Harpocration s.v. Ἀπόλλων πατρῷος; 2 Plutarch, *Theseus* 25; 3 *Lexicon Patmense*; there may be more | After the text and notes. The epitome starts about p. 203; the fragments, going by the index (Pandion and Cylon 205, Creusa and Xuthus 208), are about pp. 205–208 | Searched the full text of archive.org lending scan `aristotlesconsti0000kurt` (snippets and the contents page; I could not open the pages) |
| Moore, *Aristotle and Xenophon on Democracy and Oligarchy*, 1975 | Heraclides only | "An epitome of the lost early chapters", Heraclides' epitome, translated (the snippet "Pandion, who was king after Erechtheus, divided…" is Heraclides 1). I found no lexicon or scholia fragments; Harpocration appears only in the commentary, on Androtion | "Appendix to Part II", p. 311 (index: "Epitome of Heraclides 311f") | Searched the full text of archive.org lending scan `aristotlexenopho00ernm` (snippets and the contents page) |
| Rhodes, Penguin 1984 | Heraclides only | "The Epitome of Heraclides", a literal translation of Dilts's Greek, with notes on it at p. 164. Before ch. 1 he puts his own summary of the lost beginning ("A — The lost beginning … I Ion; II Theseus", p. 39), which draws on the fragments but does not translate them. Harpocration appears only in the introduction | Epitome after the text, pp. 117–18; summary p. 39 | Searched the full text of archive.org lending scan `athenianconstitu0000aris_x5g7` (snippets and the contents page) |
| Kenyon rev., *Complete Works* (Barnes), Princeton 1984 | No | The *Constitution of Athens* runs pp. 2341–2383 and opens at ch. 1. No Heraclides, Pandion, Creusa or Xuthus. The selected Fragments that follow (pp. 2384ff.) head "Historical works" with "F 381–644 R³" but begin at F 472, so they skip Rose's Ath. Pol. fragments (381–471) | — | Searched the full text of archive.org lending scan `completeworksofa0002unse_z3o6` (snippets and the contents page) |
| Rhodes, Aris & Phillips / Liverpool 2017 | Yes | "Six fragments of the lost beginning", numbered with sub-items, e.g. F 1(3) = schol. Ar. *Birds* 1527 [sic in the review], F 2 on the τριττύς, F 4(1). I could not tell whether Heraclides' epitome is among them; the reviewer cites it separately ("Heraclides' epitome (Pol. 4)") | Before ch. 1: "the edition begins with" them, Greek facing English | Review only: G. Verhasselt, BMCR 2018.07.21. Not seen in print or preview |

So when the site leaves the fragments out, it follows Kenyon's own translation and its 1984 revision. Rackham, von Fritz and Kapp, Moore and both Rhodes editions all include some of them. If John later wants them, Rackham's arrangement (Heraclides as the frame, the quotations slotted in) and the 2017 edition put them before ch. 1. The other three put them after the text. That bears on the column question above, not on v1.
