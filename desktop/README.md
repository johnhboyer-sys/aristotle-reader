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

## Not built yet (per the v1 plan's build order)

4. Right rail (Annotations/Parse tabs; WordPopup is currently the site's
   slide-in, which already behaves close to the target), Lexicon port
   (`/lemma`, glossary).
5. Translation file format + TS port of the TF-IDF+DP aligner.
6. Import flow (picker/drag-drop, metadata form, dehyphenation + review queue,
   completion summary).
7. Annotations (W3C model, plain-file storage, Bekker-anchored Greek /
   token-anchored English).
8. Updater (signed manifest on GitHub Releases), library export,
   Report-a-Problem. Also: search overlay (reuse `Search.svelte`) + the new
   accent-sensitive index, bundling a corpus into `$RESOURCE/corpus`, and a
   real `tauri dev` smoke test on the Mac.
