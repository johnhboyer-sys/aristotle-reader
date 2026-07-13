# Deploy Status

Live site: https://johnhboyer-sys.github.io/aristotle-reader/ (custom domain aristotle.lyceum.institute pending — DNS/cert not yet live, do not link it).
Deploy recipe: build `app/dist` (`PUBLIC_HIDE_PRIVATE=1 npm run build`, Node 22, `bonitz.astro` moved aside during the build), then commit incrementally onto a fresh `gh-pages` clone (rsync + commit + push) — never `rm -rf .git && git init` at this size, it times out.

## Latest deploy — 2026-07-13 (c · website-review fixes + Isagoge lexicon exclusion)

- **gh-pages:** `b3938d7f` → `7bf65538`
- **Source:** `origin/main` `f40a18a20` (5 commits pushed direct to main, no PR: `f5f4169b2`, `bef16ba2b`, `58b326f54`, `671a813d5`, `f40a18a20`)
- **What shipped (from a Codex adversarial website review):**
  - **Search highlight** no longer corrupts its own `<mark>` markup — the old term-by-term pass re-matched tags an earlier term inserted (any 2nd+ term starting with "m" — mind/matter — hit the injected `<mark>`); now a single pass over the raw text. Regression tests added.
  - **Isagoge attributed to Porphyry** (not Aristotle) in `<title>`, meta description, and JSON-LD `author` on both the reader (`ReaderShell`) and the work landing (`Landing`) — derived from `work.author`. Site-level labels ("The Aristotle Reader", home breadcrumb) left as-is.
  - **Service-worker cache cleanup** scoped to the `aristotle-reader-` prefix, so a sibling PWA on the same origin can't be wiped on activate.
  - **LSJ/footnote/endnote HTML** routed through the shared sanitizer (was raw `{@html}`); `sanitizeHtml` moved to `shared/lib/html.ts` as the single source of truth. Figures deliberately excluded (need a wider allowlist).
  - **Lexicon concordance excludes non-Aristotle works** — Porphyry's Isagoge no longer folds into counts shown "across Aristotle's works" (`build-lemmata.mjs` filters by manifest author). 26 Isagoge-only lemma pages removed; surviving words' counts drop by their Isagoge occurrences (e.g. γένος 1,536, Aristotle-only).
- **Build:** app-only `PUBLIC_SHOW_PRIVATE=0 npm run build` (Node 22) — **not** `build:public`, since no corpus data changed. `build/dist` confirmed public-clean first (0 Ackrill/Rackham/Tredennick refs in data). Link-integrity **0 broken** (6,607 pages / 541,856 links / 428,659 anchors).
- **Deploy diff:** 993 files (936 M / 2 A / 54 D / 1 R). JS-bundle rehash (`text`/`Search` = highlight fix, `Reader` = sanitizer) propagated to every page's `<script>`; 26 Isagoge-only lemma pages + data deleted; `lemmata/_index.json` + lemma index regenerated; `sw.js` + Isa reader/landing HTML updated.
- **bonitz:** removed `app/dist/bonitz/` before rsync (app build still emits it) → `/bonitz` 404 confirmed live.
- **Leak-check:** clean, identical to prior-live baseline — Ackrill only the Cat/Int in-print "Find in print →" citation; Tredennick 0; Rackham only EN page-metadata (0 data refs, no `ross` files, Ostwald is the served text).
- **Live-verified (functional):** home / `/Isa/` / `/Isa/book/1/` / `/Cat/book/1/` / `/EN/book/1/` / `/lemma/` all 200; `/bonitz/` 404; deleted `/lemma/peripatos/` 404; surviving `/lemma/genos/` 200 (count 1,536, Aristotle-only); Isagoge `<title>` "Porphyry"; Categories "Read Aristotle's"; live `sw.js` deletes by `startsWith(CACHE_PREFIX)`.

## Previous deploy — 2026-07-13 (b · word-sidebar margin fix)

- **gh-pages:** `b7314319` → `b3938d7f`
- **Source:** `origin/main` `8e83c3be4` (PR #51 merge)
- **What shipped:** one app-only CSS change — the LSJ word sidebar now reserves the empty page margin instead of shrinking the reading columns. `.reader-body.word-open` uses `margin-right` gated to `@media (681px–1800px)` instead of an unconditional `padding-right`. Ported from plato-reader PR #16 (`93af609a0`) per `plato-reader/docs/word-sidebar-margin-fix-handoff.md`; Aristotle's values re-derived and identical (measure 1080, panel `min(22rem,86vw)`=352, threshold `1080+2×352→1800px`, mobile 680px).
- **Build:** full `build:public`, all gates green (preflight ok, LSJ ok, link-integrity **0 broken** / 6,633 pages). Deploy diff = CSS bundle rehash (`global.D4bZILl4 → DiDMJTJA`) propagated to every page's `<link>`; **0 data files changed**.
- **bonitz:** removed `app/dist/bonitz/` before rsync again (build:public still builds it) → `/bonitz` 404.
- **Live-verified (headless, functional — no screenshots):** ran a Playwright probe against the live site across Both / Compare-3col / Greek-only at 1920/1500/1300px — all PASS (≥1800px: rightmost column width unchanged on open; never covered by the panel; no h-overflow; graceful narrowing below threshold). Negative control with the old rule restored correctly FAILS at 1920px (508→332), proving the probe detects the bug. Probe recipe: Playwright 1.61.1 at `~/.npm/_npx/*/node_modules/playwright` + ms-playwright cached chromium; drive `astro dev` (:4321, base `/aristotle-reader`), click `.seg-row .greek-col .tok`, measure `.greek-col/.english-col/.ross-col`.

## Previous deploy — 2026-07-13 (a · corpus: Mech 35 / Mirab spans / endnote sidebar)

- **gh-pages:** `a0a53316` → `b7314319`
- **Source:** `origin/main` `c967de015` (PR #50 merge)
- **Built via:** one clean `npm run build:public` (full 41-work rebuild), all gates green in a single run.
- **What shipped (since 2026-07-10, PRs #45–#50):**
  - **Chapter-corruption fixes** — no chapter renders blank. De Mechanica now a clean **35** problems (#49): `skip: [8, 27]` drops First1KGreek's spurious div 8 (the split of problem 8's answer) + its misaligning div 27, and `extra` re-pins Part 27 at 857a22. De Mirabilibus' backwards Bekker spans repaired (#50): degenerate single-point spans for the one-sentence marvels that share a Greek line (1:123/124, 1:148/149, 1:153/154/155).
  - Chapter English-offset de-collision (#48 / d34033da3) — the corruption fix that made 40/41 works pass; Mech #49 brought it to 41/41.
  - **Endnote sidebar** (#47) — commentary-class notes slide in from the right on tap.
  - Apostle-import / projection-garble data hardening (#45/#46).
- **All gates (build:public):** preflight ok (41/41); **verify_shared_lsj ok** (14,025 entries / 63,202 keys). This deploy REGENERATED the shared LSJ shards clean over all works, so **the 2026-07-10 shard gotcha is resolved — main's local `build/dist/lsj` is now complete and deployable.** Astro built `PUBLIC_SHOW_PRIVATE=0`; link-integrity **0 broken** (6,633 pages / 545,080 links / 431,140 anchors).
- **Leak-check:** clean — Tredennick 0; Ackrill only the 2 legit Cat/Int landing citations; Rackham only page-metadata (EN's canonical primary name) + Ostwald's scholarly footnote citations (identical to prior live). No gated translation prose in the data JSON.
- **⚠️ bonitz gotcha (for next deploy):** `build:public` does NOT move `bonitz.astro` aside (the recipe line above is stale on this point), so `/bonitz` gets built into `app/dist`. Removed `app/dist/bonitz/` before the rsync → `/bonitz` 404 confirmed live. (The 6,465 `Bonitz`-the-scholar lemma sections, `lx-bonitz`, are the unrelated Index Aristotelicus feature — they stay.)
- **Live-verified:** home 200, `/EN/book/1/` 200, `/Mech/` + `/Mech/book/1/` 200 (35 chapters, last `858b4–31`), `/Mirab/book/1/` 200 (ch123 → `842b1`, ch153/154 degenerate), `/bonitz/` 404.

## Previous deploy — 2026-07-10

- **gh-pages:** `3e59fff1` → `a0a53316`
- **Source:** `origin/main` `4f67b7294` (PR #44 merge)
- **What shipped (PRs #33–#44, the improvement-sequence day):**
  - Reading-position **resume** (#41): "Continue reading" card on home, "Resume at ‹cite›" on work landings, desktop parity; column-level citation hashes now scroll on open.
  - **⌘K command palette** (#43): Bekker citations, work names (with resume), Greek lemma lookup, corpus-search handoff (`/search?g=/?e=` prefill+autorun); `[`/`]` book keys; ⌘K hint chip.
  - **Offline PWA** (#44): cache-as-you-read service worker (network-first HTML **and** data — fresh deploys never pair with stale cached JSON; cached copies offline), installable manifest + icons, offline fallback page. Users gain offline from their second visit; a breaking deploy bumps `VERSION` in `sw.js`.
  - **Rhet books 2–3 chapter-1 anchors** fixed (#36) + data rebuilt.
  - Infrastructure (not user-visible): reader core extracted to `shared/` (#35); claude-review CI un-vacuoused + workbench CI job + **link-integrity deploy gate** (#33/#39) — this deploy is the first gated one: **6,633 pages, 545,076 links, 0 broken**.
- **⚠️ LSJ shard gotcha (important for the NEXT deploy):** the main checkout's `build/dist/lsj/` shards were regenerated by a session without the 10 spuria loaded — `verify_shared_lsj` FAILS against them (1,373 missing refs). This deploy kept the previous deploy's live shards + grafted the 1 new Rhet key (`misqo/foros`); coverage re-verified 0 missing across 41 works. **Do not deploy main's local lsj/ shards until the shared LSJ is regenerated over all 45 works.**
- **Leak-check:** clean (EE/Rackham 0, Meta/Tredennick 0, Cat ackrill data 0; the 2 Cat/Int landing-page "Ackrill" hits are the legitimate in-print citation). `PUBLIC_SHOW_PRIVATE=0` (the recipe line above says `PUBLIC_HIDE_PRIVATE=1` — the actual env var is `PUBLIC_SHOW_PRIVATE`, unset/0 = hidden). `bonitz.astro` moved aside (`/bonitz` 404).
- **Live-verified:** see session log 2026-07-10 (home + reader + sw.js + manifest + Rhet `ch-2-1` + /bonitz 404).

## Previous deploy — 2026-07-09

- **gh-pages:** `d175d6eb` → `90766a22` (PR #27) → `3e59fff1` (PR #28)
- **Source:** `origin/main` `304e62e4c` (PR #28 merge; PR #27 was `ee10e3b19`)
- **PR #28 (home layout):** grouped all 11 spurious works into a dedicated **"Spurious Works"** section rendered *outside* the numbered corpus divisions (no numeral, top rule, italic header; cards keep their Spurious badge). Live-verified: home 200, appendix section + 11 Spurious badges present. Small changeset (homepage + re-hashed search/CSS bundle).
- **What shipped (PR #27):** **10 spurious/dubious works** added to the reader, each `spurious`-badged with parallel Greek‖public-domain-English: De Virtutibus et Vitiis (`VV`, Solomon 1915), De Mundo (`DM`, Forster 1914), Mechanica (`Mech`, Forster 1913), De Coloribus (`Col`), Physiognomonica (`Phgn`), De Melisso Xenophane Gorgia (`MXG`) [Loveday & Forster 1913], De Audibilibus (`Aud`), De Lineis Insecabilibus (`Lin`, Joachim 1908), Ventorum Situs (`Vent`, Forster 1913), De Mirabilibus Auscultationibus (`Mirab`, Dowdall 1909, 178 marvels). All Codex-cleaned from cached archive OCR; pipeline green + Opus-reviewed.
- **Leak-check:** clean — the 10 new works reference only their PD translators; gated Ackrill/Tredennick/Rackham still hidden (Pol/EE/Meta serve Jowett/Solomon/Ross publicly). `build PUBLIC_HIDE_PRIVATE=1`, `bonitz.astro` moved aside (`/bonitz` 404).
- **Live-verified:** home 200 + lists De Mundo, `/VV/` 200 + "Spurious" badge + Greek (Ἐπαινετὰ) ‖ Solomon, `/DM/book/1/` 200, `/Mirab/book/1/` 200, `/Col/` 200, `/bonitz/` 404.
- **Built from the `dubious-spuria` worktree** (mirrors origin/main `ee10e3b19`); its `build/dist` already held all 45 works' data (the new works' pipeline data is gitignored, produced this session).
- **Still pending** (not built/deployed): Magna Moralia, Athenian Constitution (both need the non-Bekker spine), Problemata (21.5k-line chunked clean), De Spiritu (English PD only 2027-01-01).

## Previous deploy — 2026-07-08

- **gh-pages:** `284edf2b` → `d175d6eb` (built by GitHub Pages in ~66s, no incident)
- **Source:** `origin/main` `c66b652a`
- **What shipped (backlog since the last deploy, 2026-07-02 `284edf2b`):**
  - PR #26 — Organon Resources section (Ars Syllogistica link) on Organon landing pages
  - PR #25 — Workbench D8 (isolated to `workbench/`, no site impact)
  - PR #24 — PDF importer (desktop-only, no site impact)
  - PR #23 — History of Animals / D'Arcy Thompson §5b correction (Books 8–9)
  - PR #22 — De Anima / J. A. Smith Tier 2 gloss alignment
  - PR #21 — Dubious/spurious works labeling layer + first dubious work, Oeconomica (`Oec`)
  - PR #20 — Translation Workbench (isolated to `workbench/`, no site impact)
  - PR #16 — Ostwald NE paragraph-break fixes (37 stray page-boundary breaks + orphaned footnote 277)
- **Leak-check:** 0 Ackrill/Tredennick/Rackham-in-Pol/EE/Meta in data JSON, JS bundles, and reader HTML (live-verified post-deploy). The 2 "Ackrill" hits in `Cat`/`Int` landing-page HTML are the legitimate in-print commentary citation, not the gated translation — expected, not a leak.
- **Live-verified:** home 200, `/Oec/` 200 + "Spurious" badge, `/DA/book/1/` 200, `/HA/book/8/` 200, `/APr/` has the Resources section, `/bonitz/` 404.
- **build/dist used as-is** (not regenerated from Diogenes this round) — it already reflected all of the above from the 2026-07-06 alignment/Oeconomica sessions and the 2026-07-02 Ostwald fix; verified by diffing each work's last data-touching commit timestamp against its `build/dist` mtime before deploying.

## Not yet deployed / known gaps
- Desktop app v0.2.0 signed release still sits as a DRAFT GitHub Release (publishing held for the reader-layout pass — see memory `aristotle-desktop-app`).
- Bonitz reader (`/bonitz`) deliberately kept off live — XSS fix still outstanding.
