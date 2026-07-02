# The Aristotle Reader — Desktop (v1 foundations)

A Tauri (Rust shell + WebKit webview) desktop port of the website. **Not a
rewrite**: the reading experience is the website's own Svelte components,
imported directly from `../app/src` — `Reader.svelte`, `WordPopup.svelte`,
`FootnotePopup.svelte`, `data.ts`, `works.ts`, `search.ts`, `global.css` are
all consumed unchanged. What this project adds is the desktop chrome and a
runtime data layer.

## Running

```sh
# Dev (browser or Tauri window). Data is served at runtime from the pipeline's
# build/dist — set ARISTOTLE_DATA_DIR if it lives elsewhere.
cd desktop
npm install
npm run dev          # frontend only, in a browser at :1420
npm run app:dev      # the actual Tauri window (needs Rust: rustup toolchain)

npm run build        # frontend bundle check
npm run app:build    # package .app/.dmg (unsigned — Gatekeeper warning is accepted for v1)
```

## Architecture decisions (v1)

- **Data loading boundary** — the one deliberate change to site code:
  `app/src/lib/data.ts` reads its data root lazily from
  `globalThis.__ARISTOTLE_DATA_ROOT__` (falling back to the site's `/data`).
  `src/lib/runtime.ts` sets that root at startup: in the packaged app it points
  at an on-disk corpus directory (`$APPDATA/corpus` first — where the future
  import flow writes — then bundled `$RESOURCE/corpus`) served over Tauri's
  `asset:` protocol; in dev a Vite middleware serves `/data` from `build/dist`.
  Same shard directory shape everywhere (`book-NN.json`, `analyses.json`,
  shared `/lsj`, `search/`, `chapters.json`, `columns.json`).
- **Corpus registry** (`src/lib/corpus.ts`): canonical classicist slugs with
  `siteSlug` bridges (`Metaph`→`Meta`, `Isag`→`Isa`), `authenticity`
  (genuine/disputed/spurious) badges, not-yet-built works as greyed "planned"
  slots inline in their traditional groups, and a separate Companion Texts
  section (Porphyry; Aquinas `lecture`/`la` anticipated in the schema only).
  `app/src/lib/works.ts` remains the source of truth for built works.
- **Navigation**: state + keyed remount of `Reader`. Jump-ins reuse the
  Reader's existing URL contract (`?loc=col:line`, `#hash`) via
  `history.replaceState`, so the Reader needed no changes. `BekkerJumpDesktop`
  is a thin variant of the site's `BekkerJump` whose navigation is a callback
  instead of `window.location`.
- **Copy Citation** (new, desktop-only): a desktop window has no address bar,
  so the site's live-URL-hash-as-citation gets a real control — formats
  "Arist. EN 1103a14, trans. Ostwald" from the scroll-spy's current hash +
  the active translation, via the Tauri clipboard plugin (navigator.clipboard
  in browser dev).
- **Fonts** are bundled via @fontsource (Cardo, EB Garamond) — no Google Fonts
  fetch at runtime; the app must work offline.
- **Rust is minimal by design**: Tauri core + official plugins (fs, dialog,
  clipboard). No bespoke commands yet.
- **Theme**: same `ne-theme` localStorage key and light-default behavior as the
  site (`ThemeInit.astro` mirrored inline in `index.html`).

## Verified working (dev server, 2026-07-01)

Reader with Bekker gutter/chapter heads/settings; word popup with morphology +
shared LSJ + lemma-count link (full runtime data path); work switching across
the corpus incl. the Isagoge (busse scheme: Bekker chrome hidden, sidenotes,
curated chapter titles); Bekker jump resolving across books (1103a14 → EN II,
line centered + tinted); scroll-spy hash tracking; copy-citation toast; light/
dark; rail filter/badges/planned slots; lemma links intercepted (Lexicon not
ported yet). `cargo check` passes (which also validates the capability file).

## Also done since the scaffold

- **Lexicon** (step 4): `/lemma` index + per-lemma entries as a full-pane
  overlay (own scroll — the reader keeps its position); concordance chips
  jump into the reader with highlight; the word popup's "Appears N×" link
  opens the entry. Parse remains the site's slide-in WordPopup, which already
  matches the plan's target behavior.
- **Aligner port + format** (step 5): `src/lib/aligner/` with EXACT parity to
  the Python engine — `node scripts/parity.mjs EN` compares both on identical
  inputs (116 chapters, 4,886 anchors, zero mismatches; `Cat` likewise).
  `translation-file.ts` implements the {b.c}/{1094a}/{20} tag format with
  scanned (never trusted) density detection.
- **Import flow** (step 6): dialog + drag-and-drop, metadata form with the
  restrictive-default license question, hunspell dehyphenation with the
  tap-through review queue (en_US data vendored under `src/assets/dict-en/`),
  density-driven alignment, honest completion summary, Replace-or-Keep-Both
  collisions. Imports are plain files under `$APPDATA/translations/` and
  reach the untouched Reader via the two runtime hooks in data.ts/works.ts.

- **Search** (overlay + ⌘K): the site's `Search.svelte` mounted whole, plus
  the new accent-sensitivity toggle (instance-level post-filter on matched
  surface tokens; result bar honestly reports index counts as "before
  accent filtering") — a shared feature, on the site as of the next deploy.
  Result links navigate in-app.
- **Annotations** (step 7): highlights + notes as one W3C-modelled type;
  Greek targets Bekker-anchored, English targets char-anchored within one
  translation's prose (alignment refinements can't move them); `layer`
  dimming in the panel; one JSON file per work; painted via the CSS Custom
  Highlight API with zero Reader DOM mutation. Select text → Highlight/Note.
- **Library export + Report a Problem** (step 8, partial): rail footer.
  Export bundles annotations + imported translations into one JSON via the
  native save dialog; Report opens a pre-filled GitHub issue in the system
  browser — user-initiated, nothing sent automatically, ever.

## Releasing a distributable build

```sh
node scripts/build-public.mjs      # repo root: rebuild build/dist from -public manifests
cd desktop && npm run app:package  # gate → stage corpus → public tauri build
```

`app:package` hard-refuses a corpus containing the private translations
(Ackrill Cat / Rackham EE markers), stages it into `src-tauri/corpus`
(gitignored), and builds with `DESKTOP_PUBLIC=1` (private registry entries
compiled out) + `tauri.public.conf.json` (adds the corpus to bundle
resources — dev builds never touch either). Upload the .dmg from
`src-tauri/target/release/bundle/` to a GitHub Release. Before the FIRST
public release: generate the updater signing key (below) and note the
Gatekeeper right-click→Open step on the download page.

Status: the gate and corpus staging are verified; the final `tauri build`
leg has not yet been exercised end to end — expect to babysit the first run.

## Not built yet

- **Updater** — the one step-8 piece deliberately left unwired: it requires
  a signing keypair whose custody is the owner's, not something a build
  session should generate silently. When ready: `npm run tauri signer
  generate -- -w ~/.tauri/aristotle-reader.key` (choose a password, keep the
  key OUT of the repo), put the printed public key + a GitHub-Releases
  `latest.json` endpoint under `plugins.updater` in tauri.conf.json, add
  tauri-plugin-updater to Cargo.toml/lib.rs and `"updater:default"` to the
  capability file. The manifest signature matters regardless of the
  (deferred) code-signing decision — it is what stops a fake "update".
- Bundling a corpus into `$RESOURCE/corpus` for a distributable .app.
- A native-window pass over Lexicon / import / search / annotations
  (verified in the browser harness so far).
- Annotation capture in compare view (ambiguous column in v1).
