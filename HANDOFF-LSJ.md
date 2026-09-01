# HANDOFF: LSJ presentation

Rewritten: 2026-08-30 evening. This is the LSJ-track handoff for aristotle-reader.
Rewrite it (don't append) when this track advances. Do not create a bare
`HANDOFF.md` — see CLAUDE.md.

## 1. What is live, as of 2026-08-30

Deployed to gh-pages `b2f3f9df` from `origin/main cd86d7f34`. Full record in
DEPLOY-STATUS.md; read that before any deploy.

**The word popup's dictionary is served by grammata, not rendered here.** The
site fetches entries from `https://grammata.pages.dev/t8/lookup.js`. One
grammata deploy updates every reader site — that is the architecture, decided
2026-08-29. Do not vendor, proxy, pin or cache-bust the module URL; its deploys
ARE the update mechanism.

**Cards are keyed by dictionary entry**, not by morphological analysis. 15,041
cards → 9,847 corpus-wide; νοῦν 17 → 4. The entry opens under the card tapped.

**The website fetches no LSJ shards.** `data/lsj-heads.json` (14,047 keys, 139
KB gzipped, built by `app/scripts/build-lsj-heads.mjs`) supplies the headword
and homograph letter. The desktop app still reads the shards.

**Two forms-block repairs are live**, both visible on `/lemma/<slug>` pages:
the label-then-form line break, and quantity marks opening the forms table on
the lemma.

## 2. The four rules the presentation follows (John's, ruled 2026-08-30)

1. **Aligned columns** — parse left, exception right, as the LSJ forms block sets it.
2. **Attic is the default and never printed.** A form with NO Attic reading says
   what it is limited to. The cut is on Attic's PRESENCE, not on how many
   dialects are named: `(attic)` alone would otherwise flag, and `(epic ionic)`
   would otherwise stay silent, which is backwards. 2,007 of 15,041 flag.
3. **Homographs are not folded.** Each dictionary entry gets its own card,
   carrying **LSJ's own letter** read from the entry text — never derived from
   the key's trailing digit (`ka/r2` is LSJ's (A); 32% of numbered keys carry
   no letter and must show none).
4. **The entry opens under the card tapped**, never below the whole stack.

## 3. Where the code lives

- `shared/components/WordPopup.svelte` — the cards, the grouping, the widget call.
- `shared/lib/data.ts` — `fetchLsjHeads`, and `lookupWord(work, key, { withLsj })`.
  `withLsj` defaults **true**; only the website passes false.
- `shared/lib/html.ts` — `renderLsjEntry` / `buildFormsBlock`. **Still live**:
  the desktop app and the `/lemma/<slug>` pages both render through it.
- `shared/styles/global.css` — ALL popup styles.
- `app/scripts/build-lsj-heads.mjs` — the manifest, wired into `npm run build`.

## 4. Traps, all paid for

- **A component `<style>` block ships NOWHERE.** Reader pages load `global.css`
  and nothing else. It works in `astro dev`, so every local check passes while
  production gets unstyled markup. Verify against `app/dist/_astro`, not the
  dev server. This is why `.lemma-link` had no styling in production for weeks.
- **Never pass a surface form to grammata.** It re-analyses from scratch and
  discards this reader's disambiguation: εἰσὶ returns ἵημι, εἰμί and εἶμι with
  ἵημι FIRST. Pass `{ key: a.lsj[0] }` — their pack keys are Perseus betacode,
  identical to ours. Their article order is arbitrary; never present it as ranked.
- **An analysis can name several entries.** Its gloss then belongs to none of
  them in particular. A non-empty exact gloss wins; an empty exact clears a
  fanned-out gloss but never a real one; a fan-out only fills a hole. Verified
  order-independent over all 122,540 tokens.
- **Corpus frequency cannot rank the readings.** νόος appears 110× in
  Aristotle, νέω 126×, so frequency puts the wrong lemma first for νοῦν. The
  counts are per-lemma across all forms, not per-form. Group, don't guess.
- **`lemmata.json` is the lemma-PAGE manifest**, not a headword table: 6,214 of
  14,047 keys, missing ὁ, καί, δέ, γάρ, μέν. Use `lsj-heads.json`.
- **A quantity mark is notation, not a form.** Known by its brackets, in both
  shapes LSJ writes them. NOT by length (ὕβρις marks quantity in forty
  characters; ἦν is a form in two), and square brackets only (a parenthesis
  there opens an etymology).
- **Never shrink reading type, and never truncate.** The reader is vision
  impaired and reads on a phone in landscape. Control labels are not reading
  text — the "Show LSJ definition" line is 0.9rem by John's own call.
- **`shared/lib/html.ts` flows FROM here to plato and homer.** A fix left
  unmade here is reverted in both on the next patch-forward.

## 5. Open

- **Plato and homer have neither forms-block repair on main** (0 `.lsj-forms`
  rules in both). Aristotle is upstream; port from `main`.
- **Neither sibling has the grammata popup.** Porting instructions were sent to
  their sessions 2026-08-30.
- **3 quantity-mark survivors**, all `lsj-cit` spans. κάτειμι is CORRECT as it
  stands (`[κάτε]ιτι` is an epigraphic restoration inside a real form) — do not
  extend the rule to citation spans. κέρας and θνῄσκω are genuine misses.
- **949 entries in THIS corpus** (measured 2026-08-31; homer counts 749 in
  theirs) whose first form-label still opens with the headword — `αἱρέω, impf.`
  where the label should be `impf.`, `ἀληθεύω, fut.`, `ἀνάγω, fut.`. The cause
  is the 22-character lead-cut threshold in `buildFormsBlock`, not `formAt`:
  when the lead before the first citation is short, no cut happens and the
  headword stays in the label. Confirmed by the length distribution — 810 of
  the 949 sit in the 10–20 character buckets, just under the threshold.
  τίθημι looks like this family but is not: its mark is tagged `lsj-pron`,
  which `formAt` never reads.
  **Not attempted, deliberately.** The likely fix is to cut whenever the lead
  begins with the headword rather than on length — but `buildFormsBlock` has
  produced unclosed spans twice at two different layers (90 entries, then 84),
  and both today's forms-block fixes needed a cross-family review round to
  land. Do this one with a review in hand and a full-corpus audit (unbalanced
  tags, senses lost, non-whitespace character count) the way the quantity-mark
  fix was done, not as a quick change.
- **`buildFormsBlock` is NOT dead code.** It still runs on `/lemma/<slug>` and
  in the desktop app. An earlier claim that it was is corrected in PR #104.
- **Question #2 — the entry inside the popup — is now BUILT**, not merely
  designed. What remains unbuilt is the sense-head skeleton for forest entries
  (λόγος is 64 senses); see the memory note `lsj-entry-redesign`.

## 6. Prompt for the next session

Read this file, then DEPLOY-STATUS.md's latest entry. Verify every claim here
against the code before relying on it — several statements in the version of
this file that preceded it were true when written and false by evening.
