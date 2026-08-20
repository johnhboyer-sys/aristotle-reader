# HANDOFF: reader wiring for word-distinctiveness + quotation citations

Generated: 2026-08-20 · Session focus: wire the two already-committed corpus features into the reader. Branch `claude/reader-wiring`; uncommitted working-tree changes, not pushed.

## 1. Goal

Make the committed distinctiveness table and Metaphysics quotation file visible in the reader: popup label, lemma-page numbers, quotation glyph + popup, emit copy, and the link gate.

## 2. Current State

Working tree on `claude/reader-wiring`. All five success-criteria commands passed. No commit, no deploy.

- Distinctiveness rows attach beside `bonitz` on per-lemma JSON; non-null `label` copies to `lemmata.json` as `distinctiveness_label`.
- Word popup shows that label when present; ordinary words stay silent.
- Lemma page shows label + in-Aristotle / before-him / contemporaries counts when `distinctiveness` is present.
- `stage7_emit.copy_quotations` copies `pipeline/data/quotations/<work>.json` to `<out>/quotations.json` if it exists.
- Reader loads quotations per work and marks each start line with a marginal siglum, edition-style — "Emp." in the gutter, Greek serif italic, accent (John rejected every symbol glyph: the Ross text prints its own quotation marks, so a quote-shaped mark doubles what's on the page). A Bekker number on the same line keeps its slot (John's ruling); the siglum slides left of it (`.quotation-sigla.has-num`) — real cases 1000b:1 and 1009b:20. Watch item: on phone-landscape the shifted siglum sits ~1px from the viewport edge; a longer siglum (Parm.+) colliding with a number would clip there — no pilot case does. Click opens a thin popup with a real `<a target="_blank" rel="noopener">`.
- `check-links.mjs` validates per-work `quotations.json` shape. `Meta.json` was copied by hand into `build/dist/Meta/quotations.json` (pipeline not re-run).

## 3. Key Decisions (and why)

- Distinctiveness join is exact `b.key` lookup — the same LSJ / lemma-beta fallback the concordance already buckets on. No new normalization, no threshold logic in JS.
- `copy_quotations` is a named helper (same style as `emit_third_titles`) so the present/absent cases can be tested without running full `run()`.
- `fetchQuotations` follows `fetchLemmata` (`r.ok ? r.json() : []`, un-cache on failure). It never throws on a missing file.
- Quotation popup lives inside `QuotationMarker.svelte` (glyph + ephemeral dialog). The cite is a Svelte-template anchor, not `sanitizeHtml`.
- Lemma page renders numbers whenever the full row is present, even when `label` is null (οὐσία). The popup stays silent because the manifest omits `distinctiveness_label`. `lsj` / `overridden` are stored, not shown.

## 4. Traps

- `cd pipeline && uv run --with pytest pytest` is required. From the worktree root, pytest collects `bonitz/` and misses the pipeline venv (`yaml` / `lxml`).
- Shared tests: `cd shared && npm test`. Root `npm test` has no script. Do not use `vi.resetModules()` in Svelte 5 tests (`effect_orphan`).
- App-only build does not emit `quotations.json`; copy `pipeline/data/quotations/Meta.json` to `build/dist/Meta/quotations.json` before `npm run build` in `app/`.
- `/bonitz` still builds; keep it off live until the XSS fix. `data/reports` is still deleted by an app-only build.
- **Svelte component `<style>` blocks are dead in the built site.** Reader pages load only `global.css`; WordPopup's scoped rules (`.lemma-link` included) never ship. Styles for shared Svelte components go in `shared/styles/global.css` — the label styles were moved there after a browser pass caught the unstyled line (Claude fix on top of Grok's implementation).

## 5. Open Work

- Matcher, distinctiveness computation, and curated tables were already committed; this session is reader wiring only.
- Full-corpus quotation curation is still later work. Only Meta ships a quotations file.
- John still reviews label wording / thresholds / author list before deploy (spec step 7).
- No deploys, no commits from this session.

---
## Prompt for the Fresh Agent

Read this file, then the uncommitted diff on `claude/reader-wiring`. The five gates already passed; next step is review/commit if John wants it, then a deploy only after the usual `DEPLOY-STATUS.md` recipe (and the `data/reports` trap).
