# Athenian Constitution (Ath. Pol.): sources and plan

Status: plan only, 2026-11-06. Nothing is built. John approves before any code.

The work has no Bekker numbers: the papyrus came to light in 1890, after Bekker.
It is cited by chapter and section (69 chapters, 298 sections in Kenyon's OCT,
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
- **Margin numbers are the weak point.** A naive pass over hOCR word boxes finds 257 margin numerals. Footnote numbers pollute that count, and some marks are garbled ("wb 3" on n427). The work needs 298 section starts (69 chapter starts and 229 later sections), so every section mark has to be read off the 79 page images. This is the Bekker rule applied here: section numbers come from Kenyon's print, never from interpolation.
- Hard leaf fact: archive.org's `/page/nN` image is hOCR page index N+1 in `_hocr.html` (`/page/n428` shows the text the hOCR file holds at index 429). Anyone cutting pages must use one index or the other, not both.

### Numbering against the standard

- The 1921 margins follow Kenyon's OCT (1920), the same editor and year; the preface says the translation was revised "into conformity with the text as now established".
- On the sampled pages, the sections match the OCT, including 49.5, which Oppermann's Teubner lacks (below).
- The 1921 text starts at ch. 1 ("…[They were tried] by a court") and ends at 69.2. It does not translate the four fragments.
- I did not check all 298 section marks. The build gate below does that.

### Recommendation: Kenyon, Oxford 1921

1. It is the only clearly public-domain translation that prints sections, which is the citation unit LSJ and every modern reader use.
2. It is Kenyon's last revision, made against his own 1920 OCT. If the Greek also comes from that OCT (section 2), the two columns are one editor's text, which no other pairing gives us.
3. It sits in a scan we already use (Oeconomica), with good OCR and a hand-typed second witness (Gutenberg) to diff against.

Bell 1891/1912 is an earlier draft of the same translation, with chapters only. Poste is freer and has chapters only. Rackham's US status is unclear, and it is no better for our use.

## 2. Greek

| Source | Edition | Structure | Licence | Notes |
|---|---|---|---|---|
| TLG 0086.**003** (cached export, `build/export/Diogenes-Resources/xml/tlg/tlg0086003.xml`; this worktree has no `build/`, I read it in `nice-dubinsky-1ea5fd`) | Oppermann, Teubner 1928 (repr. 1968) | `<div type="Section">` × 69, `<div type="subsection">` × 298, 2,070 printed lines numbered within each subsection, 98 `<pb/>` | Derived text may ship; raw export may not | Section breaks fall **at line starts**: 186 of 298 sections begin up to a line away from where the OCT starts them (e.g. 2.2 starts "καὶ τὸ πλῆθος…" here, "ἦν γὰρ αὐτῶν…" in the OCT). **No 49.5**: its sentence sits inside 49.4. Prints more supplements in the damaged last columns (ch. 64–69: 1,750 words against the OCT's 1,280). |
| Perseus `tlg0086.tlg003.perseus-grc2.xml` (canonical-greekLit) | **Kenyon, OCT 1920** | `textpart` section × 73 (1–69 plus `frag_1`–`frag_4`), subsection × 307 (298 plus 9 in the fragments); every chapter has the OCT's section count | **CC BY-SA 4.0** | Exact section breaks. No printed lines (no `<lb>`). 9 Perseus `<note>`s and a few stray numerals in the text (e.g. "ἑκατόν. ι ἦν") to clean. |
| First1KGreek `tlg0086.tlg003.1st1K-grc1.xml` | Kenyon, Berlin (Suppl. Arist. III.2) 1903 | 69 `paragraph` divs, **no sections**; 613 notes, `<lb>` | CC BY-SA | Not usable as a section spine. `grc2` holds the fragments only. |

Section counts per chapter, OCT against Oppermann: identical in all 69 chapters
except 49 (5 against 4).

**Recommendation: Greek from the Perseus Kenyon OCT.** Its sections are exact, it is
the edition LSJ's numbering follows, and it is the text Kenyon translated. The cost
is a small Greek loader of its own (section 3, step P1), because every other work's
Greek comes from the TLG export. If John prefers to keep TLG as the one Greek source,
Oppermann works, but sections are only line-exact and 49.5 has no Greek of its own.
This is open question Q1.

## 3. LSJ

`grc.lsj.xml` cites the work as `Perseus:abo:tlg,0086,003:C:S`, shown as "Arist. Ath. C.S":

- **527** citations: 516 chapter:section, 11 chapter only (e.g. `003:48`, shown "Arist. Ath. 48").
- No other work number carries "Ath." citations, and LSJ has no "Ath.Fr." citations.
- Display forms: 439 "Arist. Ath. N.N", 37 bare "N.N", 20 "Id. Ath. N.N", 20 "Ath. N.N", plus the chapter-only forms.
- Against the OCT's 298 sections, 515 of the 516 chapter:section citations exist. The odd one is δίδραχμον, "Arist. Ath. 10.7": ch. 10 has two sections and the word is in 10.2. It looks like an LSJ misprint (Q6).
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
| `desktop/src/lib/annotations.ts:650` | Annotation cite label | **Change**, or accept "49a3" on desktop (R2) |

## 5. Design

**One new scheme, riding the Isagoge's road.** Chapter N becomes synthetic column "Na",
section S becomes line S, so `?loc=49a:3` is Ath. Pol. 49.3. Each section is one
Greek "line". Every place that would show a column or line to a reader goes through
one formatter that prints "49.3" for this scheme and the old string for every other.

### Pipeline (P)

- **P1. Greek loader.** In `stage1_greek.parse_spine`, `citation.scheme: chapter-section` with `greek.source: perseus_tei` reads `sources/tlg0086.tlg003.perseus-grc2.xml`. It takes each `section`/`subsection` div's text (Perseus notes dropped, stray numerals cleaned) as one spine line, `{column: f"{chapter}a", n: section}`, fragments skipped. The output dict has the same shape as the TLG path. If John picks TLG instead (Q1), the branch reads `Section`/`subsection` divs from the export and joins each subsection's printed lines into one line.
- **P2. Validation.** In `stage2_validate`, chapter-section takes the a-side column branch but keeps the strict gap check. In `preflight`, chapter-section counts as ordered (`bekker_native` true for it). The manifest pins `section_spine: {count: 298}`, plato-reader's pattern, and stage 2 fails if the spine count differs.
- **P3. Manifest `manifests/AthPol.yaml`.** `work.authenticity` (Q2); `citation.scheme: chapter-section`; `bekker_range` 1a–69a; one book; `chapters.source: explicit`, 69 entries `{n: N, bekker: "Na1"}`; `english.primary` archive model, dir `athpol-kenyon`, `chapter_marker: part`.
- **P4. LSJ.** Add a second pattern in `stage5_lsj._bibl_href` for `tlg,0086,003:(\d+)(?::(\d+))?`, mapping to `/AthPol/book/1?loc={C}a:{S or 1}`. Add `"003": "AthPol"` to `CITATION_WORKS`, with a "verified against LSJ" note giving these counts. The 10.7 citation stays an unlinked span (Q6).
- **P5. English source.** `sources/athpol-kenyon/book-01.html` with `Part N` markers, plus `anchors.yaml` holding 298 `{bekker: "Na S", at: phrase}` entries, one per section, read from Kenyon's margins. Built by a script on the model of `build_spir_dobson.py`:
  - take the hOCR body text of n370–n448, with footnotes cut by type size and running heads dropped;
  - diff it against Gutenberg #26095 and rule each disagreement against the page image;
  - record corrections to the 1921 print in a READS list.
  - Scans go in gitignored `build/athpol-ocr/`.

### Reader (R)

- **R1.** Add `'chapter-section'` to the `citation.scheme` union in `shared/lib/works.ts`, plus the work entry.
- **R2.** Add one helper in `shared/lib/data.ts`: `citeLabel(work, column, lineRef)`. It returns `${column}${lineRef}` unchanged for bekker and busse, and `${N}.${S}` for chapter-section. Use it at `Search.svelte:941`, `lemma-view.ts:54`, the desktop cite (`App.svelte:923`) and `annotations.ts:650`. The URL hash stays `#49a3`; changing the hash format would touch the scroll spy and saved positions for every work, which is not worth it. (Codex may argue otherwise; see the review section.)
- **R3.** In Reader.svelte add a `nonBekker` flag (busse or chapter-section). It hides the column label, the chapter span and the BekkerJump. `showLineNum` prints every section for chapter-section. The `busse` flag keeps its sidenotes and figures role and nothing else changes for the Isagoge.
- **R4.** In `ReaderShell.astro` and `Landing.astro`, the same three conditionals; the Landing wording reads "chapter and section".
- **R5.** In `desktop/src/lib/corpus.ts`, turn the `AthPol` slot into a built entry; no desktop code beyond R2 and the BekkerJump hide.

### Blast radius

- Every edit is a branch on `scheme === 'chapter-section'` or a new file.
- The two shared helpers (R2 and the `nonBekker` flag) return the old values for bekker and busse, and unit tests pin that.
- No other manifest, source, alignment or anchor file changes.
- Files touched: those named in P1–P5 and R1–R5, plus their tests. Nothing else.

### Gates (a check must say what it examined; write the failing case first)

- **G1. Code-only no-op.** Land P1, P2, P4 (the 003 map entry left out) and R1–R5 **without** `AthPol.yaml`. Run `npm run build:public` and compare sha256 of every file under `build/dist`, before and after: zero differences, and the report states the file count. This proves the new code paths are dead for every existing work. The same step runs the full pytest, scripts and shared vitest suites, and `npm run smoke`.
- **G2. Adding the work.** With the manifest and the 003 map entry in, rebuild and compare again.
  - Every `build/dist/<work>/` other than `AthPol/` must be byte-identical.
  - The corpus-wide files may change only in these ways:
    - `lsj/*.json`: added keys, plus `<span class="lsj-bibl">` becoming `<a class="lsj-bibl" href="/AthPol/…">` on 003 citations only;
    - the search shards and ngram streams: AthPol postings added.
  - A script checks this by undoing exactly those changes and requiring the rest to match the G1 build. It prints how many entries it rewrote, so "0 rewritten" cannot pass silently.
  - Note: the LSJ merge is last-writer-wins (`stage7_emit.py:510-532`), so G2 must run on a full rebuild.
- **G3. Static pages.** Diff `app/dist/**/*.html` for every other work between G1 and G2 with hashed asset names masked: zero differences.
- **G4. Section spine.** 298 sections, chapter by chapter equal to the OCT's counts. Each of the 298 anchors is found exactly once, in its own chapter, in order. The check prints 69/298/298, and a planted bad anchor makes it fail.
- **G5. LSJ.** Of the 527 citations, 526 link and resolve to an existing `L{C}a-{S}` id **exactly**: no nearest-line snap for AthPol in `check-links.mjs`. The one declared unlinked citation is the 10.7. The check prints its counts.
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

## 7. What I could not verify

- All 298 of Kenyon's 1921 section marks. I sampled two pages; G4 settles the rest at build time.
- Rackham's US status (URAA, simultaneous publication). It doesn't affect the choice.
- How the reader lays out a paragraph-long Greek "line". The Isagoge's lines are printed lines, so no work yet has one Greek line per section. Wrapping and the `cont` continuation logic (`Reader.svelte:623`, and the `item.line.cont` rows below `:1520`) need a smoke render and a phone-landscape look (memory: the reader has a vision-impaired user) before R3 is called done.
- Bell 1891, Poste and Rackham OCR quality: not sampled, as none is recommended.
