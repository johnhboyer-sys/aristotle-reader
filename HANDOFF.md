# HANDOFF: spec day — LSJ citations shipped, the gate armed, 18 lines of Greek recovered
Generated: 2026-08-18 evening · Session focus: speccing the corpus-analysis features, then implementing and deploying the first two

## 1. Goal
Turn `docs/corpus-analysis-features.md` (the 2026-08-18 stylometry session's survey) into implementation-ready specs, then build the near-term ones. Four specs written and merged (#80); two implemented, reviewed cross-model, merged, and deployed the same day (#81 LSJ citations, #82+#85 text-quality gate).

## 2. Current State
- **DEPLOYED and LIVE:** gh-pages `5955ce62` → `f1e0c735`, from `origin/main` `e50527bb9`. Full record in `DEPLOY-STATUS.md` (read it before the next deploy — the recipe held: bonitz aside, full build, diff read by category, live-verified functionally including an in-browser popup click).
- **Live LSJ citations (#81):** ~21k Aristotle citations in dictionary entries link into the reader. Base-prefix contract: shards carry base-less hrefs, renderers prefix `BASE_URL` (`prefixLsjCitationHrefs` in `shared/lib/html.ts`, idempotent). The citation map (`pipeline/aristotle_pipeline/lsj_citation_map.py`) is keyed by LSJ's OWN numbers, not manifest `tlg_work` — SE is 039 (manifest 040), Juv is 018 (manifest 918), 001 splits APr/APo by column.
- **Text-quality gate armed (#82, #85):** stage3 fails a work's build on an unexpected breathing-position hit. Classifiers: lexical crasis (coronis U+0343 decomposes to U+0313 under NFD — mark detection impossible; prefix set incl. καλοκἀ-) and rho-breathing (spine writes medial ῤῥ). Manifest allowlist `illegal_breathing_allow` exists but no work needs one — corpus baseline is 7 flagged all classified, 0 unexpected.
- **18 restored lines (#83, child session from this session's task chip):** hyphen-range Bekker numbers (`n="13-14"`) were dropped as headings across PA/Cael/DM, masked by `expected_line_gaps`. Both De Caelo Empedocles quotations are back; κόρση and ἄξων are new lemmata. The gate's single genuine catch (PA 689a12 ὑποὑγρὰ) was the thread that unravelled this.
- **#86 (another session):** stage7 token pairing fixed for repeated unlettered line numbers; **#84:** bracketed-word rendering. Both rode this deploy.

## 3. Key Decisions (and why)
- **Compute on the disc, publish an integer** governs everything TLG-adjacent (feature 1's licence rule; recorded in the specs).
- **The gate mirrors the reader's contract, not exact ids:** `.lsj-bibl` links pass check-links if the COLUMN exists — LSJ cites its own editions' lineation (~48/21k differ) and the reader snaps to the nearest line. All other links stay strict.
- **Every lane cross-model reviewed:** Codex implemented #81/#82 from the specs; Grok reviewed both (its corpus-level findings — the crasis set matching nothing real, orthodox ῤῥ flagged — became classifier fixes with tests on the exact tokens). #83 (Claude-implemented) got BOTH Sol and Grok; Sol found the comma-compound merge silently changing Phys 226b, resolved by declaring it (the merged line is the better text — Grok replayed Ross's edition to prove it).
- **HARD_GATE flipped only after** the baseline ran clean corpus-wide AND the one genuine hit was root-caused and fixed — not allowlisted.

## 4. Traps (new this session — older ones still in DEPLOY-STATUS/CLAUDE.md)
- **Worktree builds:** `build:public` fails at stage1 in a fresh worktree (`tlg_dir_default` is relative; disc lives under `~/Documents/CLAUDE CODE ARISTOTLE PROJECT/`). rsync `build/export` from the main checkout. Pipeline tests run as `uv run --with pytest pytest` — pytest is deliberately not in the venv.
- **A raw `/EN/...` href passes check-links but 404s live** (crawler resolves against dist root; site serves under `/aristotle-reader`). The base-prefix rewrite is tested against the SANITIZED serialization — sanitizeHtml preserves source attribute order today and the round-trip test locks it.
- **`expected_line_gaps` can mask data loss** — the #83 drops sat behind declared gaps for weeks. An allowlist entry describes a gap; it never verifies the gap is legitimate.
- **Reversed comma compounds are real** (Phys 226b `n="27,23"`, Ross's marginal renumbering) — do not add range-order validation to stage1.

## 5. Open Work
- **Features 1+2 offline halves BUILT (PR #88, late session):** TLG canon parser
  (dates + work titles from DOCCAN2.TXT), 532-author counting run, committed
  table `pipeline/data/word_distinctiveness.json` (251 coined / 1,149 rare),
  quotation matcher + click-only curation page; Meta pilot = 87 candidates
  (Empedocles B109 top, Λ-close Il. 2.204 kept). Codex built F1, Grok F2;
  cross-family reviews both ways found 11 real defects, all fixed test-first —
  headliners: first-analysis-only lemma resolution minted 24 false coinages
  (ὅλος); DK Testimonia works quote Aristotle back and must never be quotation
  sources; ante/post canon dates. **Waiting on John:** distinctiveness rulings
  (xmt Q / Peripatetic school / proper nouns / Hesiod — packet delivered) and
  the 87-row Meta curation clicks (page delivered). Reader wiring for both
  features comes after; re-runs are minutes (exports cached, counts versioned).
- Older open items unchanged: Ostwald ticks outside Book I (need photographs), Owen note 44 (needs page images), footnote paragraph structure, desktop v0.2.0 draft release, `/bonitz` XSS fix.

---
## Prompt for the Fresh Agent
Read this file, then `DEPLOY-STATUS.md`. The site is live and current as of 2026-08-18 evening; nothing is held. The four specs in `docs/spec-*.md` are the roadmap; two are shipped, two await their sessions.
