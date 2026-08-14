# HANDOFF: the phone-landscape reader, and the deploy that released the Ostwald hold
Generated: 2026-08-13 23:35 CDT · Session focus: porting homer-reader's pared-down landscape UI, then shipping it along with everything held

## 1. Goal
Make the reader usable on a phone held sideways for a vision-impaired user who reads that way — less furniture, not smaller text — and then deploy, which meant releasing the Ostwald hold that had stood since 2026-08-12.

## 2. Why This Matters / Background
Every phone rule in `shared/styles/global.css` is keyed on `max-width: 680px`. A phone in landscape is WIDE — an iPhone Pro Max is 932×430 — so it matched none of them and was served the full desktop chrome. Measured: **221 px of furniture on a 430 px screen (51%)**, with the first line of Greek at y=375. One visible line of text. homer-reader had already solved this with an `(orientation: landscape) and (max-height: 500px)` block; this session ported it and adapted it to this reader's header and sticky control strip.

## 3. Current State
- DONE and LIVE: gh-pages `4de53972` → `5955ce62`, from `origin/main` `6c11c5313`. Full `build:public` (46 works, all PASS), every gate green, live-verified functionally at 932×430 and 1280×800. Full record in `DEPLOY-STATUS.md`.
- DONE: PR #76 — the short-landscape block. Header collapses to one 55 px row; nav panel and control strip dropped; what they carried re-homed in the Contents drawer and Settings sidebar.
- DONE: PR #77 — a pipeline bug the deploy diff caught (see §5).
- DONE: PR #75 — the 18-commit `claude/source-import` branch (commentary-layer plan + UX survey, Hicks 1907 vendored, workbench source import). Deploy-neutral.
- DONE: the Ostwald apparatus work (#70–#74) is live. The hold is released.
- NOT STARTED: ~30 Ostwald ticks outside Book I remain interpolated, awaiting photographs of those columns' margins. Method established, no code needed.
- UNRESOLVED: Owen/Isagoge note numbering diverges from the Wikisource transcription at 42–43, so the apparent gap at note 44 may be a missing note or a numbering difference. Needs page images.
- KNOWN, NOT ACTED ON: footnote HTML has no paragraph structure, so note 502 is ~2,300 characters unbroken in the popup. Nobody has made that rendering decision.

## 4. Key Decisions (and why)
- **`max-height: 500px`, not a width breakpoint.** Height is the scarce dimension on a phone in landscape, and no desktop window is that short — so the block cannot reach a mouse-driven browser. Confirmed live: 1280×800 measures identical to before.
- **Type size deliberately NOT cut.** The portrait block shrinks `--fs-greek`/`--fs-english` for a 375 px column; landscape has 932 px of width and no such squeeze, and the reader this was built for is vision impaired. Less furniture, same size text. Tap targets held at 40 px.
- **Two additions the straight port needed.** The Contents drawer hides its Bekker jump and Help row above 681 px because "the header carries them" — this block removes both from the header, so they had to be re-shown or a landscape phone would have had no route to either. Likewise the translation picker / view toggle / print live in the Settings sidebar only below 681 px; hiding the control strip without re-homing them would have made the Greek/English toggle unreachable.
- **The drawer gave up two rows of its own** — the explanatory sublines and the repeated work title — buying the chapter outline 52 px on a 430 px screen.
- **Full `build:public`, not the app-only build.** `build/dist` is not tracked, and the pipeline plus the Ostwald/Owen/Wallace sources had changed since the last deploy. An app-only build would have shipped the new reader code over stale Ethics data.
- **The deploy diff is a gate, not a formality.** Reading it line by line is what caught both defects in §5. Neither would have been caught by any automated check that exists.

## 5. Traps & Dead Ends
- **`build/stage1` is scratch SHARED by every work and `build-public.mjs` does NOT clean it** (it cleans `build/dist` and `app/dist` only). stage7's guard asked *whether* a work declares a third translation; Posterior Analytics declares one of its own (Owen), so it passed the guard and copied the Ethics' `third_titles.json` left in the scratch — "The good as the aim of action" over the Posterior Analytics. The guard caught the case it was written for (the Isagoge, no third at all) and missed this one. Fixed in #77 by gating on the file's own translator key. **The general shape: a guard that asks whether a thing exists is not a guard on whether it belongs.**
- **Do NOT deploy by deleting `app/dist/bonitz` after the build.** That removes the page but leaves `_astro/bonitz.*.css`, which no previous deploy has ever shipped. Move `app/src/pages/bonitz.astro` aside during the build, as the recipe says. Caught in the diff this session.
- `DEPLOY-STATUS.md`'s recipe line named `PUBLIC_HIDE_PRIVATE`, which sets nothing. Corrected to `PUBLIC_SHOW_PRIVATE=0`.
- Browser-pane screenshots work fine (the previous handoff said they returned blank) — verified repeatedly this session at several viewports, live and local.
- Playwright is NOT installed for the repo's own `app/scripts/shoot.mjs` path — `npx playwright` browsers are missing, so that script fails. Browser-pane screenshots are the working route.
- A phone in landscape can match BOTH this block and the `max-width: 680px` portrait block (an iPhone SE is 667×375). The `.page-header`-prefixed selectors in the landscape block exist to out-specify the portrait two-row split. Do not "simplify" them to bare class selectors.

## 6. Relevant Files & Pointers
- `shared/styles/global.css` — the short-landscape block is the last block in the file, ~130 lines, heavily commented with the reasoning above.
- `pipeline/aristotle_pipeline/stage7_emit.py` — `emit_third_titles()`, extracted so it can be tested without running stage7 over a whole work.
- `pipeline/tests/test_third_titles_scope.py` — 5 tests, written failing first.
- `.claude/launch.json` — the dev server now passes `--host`, so `astro dev` binds all interfaces and the site is reachable from a phone on the same Wi-Fi (`http://<LAN-IP>:4321/aristotle-reader`). Gitignored, local only. Note the dev server runs `PUBLIC_SHOW_PRIVATE=1` and therefore serves the gated translations — fine on a home network, not on a shared one.
- `DEPLOY-STATUS.md` — the 2026-08-13 entry, with the full gate/diff/live-verification record.
- PRs #75, #76, #77 — full rationale per change; not duplicated here.

## 7. Open Work (status, with dependencies)
- ~30 interpolated Ostwald ticks outside Book I depend on photographs of those columns' margins.
- Owen note 44 depends on page images of the Bohn edition; the Wikisource numbering does not line up, so inference is not safe.
- Footnote paragraph structure (note 502 reads as one long block) is an unmade rendering decision.
- ~~The landscape block lives in this repo's `shared/` copy only.~~ DONE 2026-08-14: ported to both siblings, which had the same two gaps. plato-reader PR #26, merged and **deployed** (its 22nd, gh-pages `270066b55` → `425bed57`). classical-philosophy-reader merged to its local `main` (`6d4a723`) but **not deployed** — it has no git remote and its Cloudflare Pages + R2 hosting was never provisioned (`docs/cloudflare-setup.md` is an unstarted nine-step checklist; the account, the ~$10/yr data domain and the R2 token are John's to do). Worth knowing: on both siblings the citation jump (Stephanus / Diels–Kranz) had NO route on a phone in landscape — the landscape block drops the nav row that holds it while `@media (min-width: 681px)` hides the drawer's copy. That had been live on plato since its 21st deploy. Also note the specificity trap: in this repo the block is at the END of global.css so the drawer re-show wins on source order; in both siblings the block sits ~350–400 lines ABOVE the 681px rule, so the re-show needs `.toc-sidebar`-prefixed selectors or it silently does nothing.
- Desktop app v0.2.0 signed release is still a DRAFT GitHub Release, held for the reader-layout pass.
- `/bonitz` stays off live; the XSS fix is still outstanding.

---
## Prompt for the Fresh Agent
This file lives at the repo root as `HANDOFF.md`. Read it, then `DEPLOY-STATUS.md` for the deploy recipe and the last recorded deploy. The site is live and current as of 2026-08-13 23:35 CDT; nothing is held.
