# Translation Workbench

A Tauri (Rust shell + WebKit webview) desktop app for editing translations of
the Aristotle corpus — a sibling to `../desktop` (the reader), but a
different product: an editor rather than a reading experience. It will
eventually drive Diogenes' Perl exporter and pandoc as subprocesses (via
`tauri-plugin-shell`) to pull source text and convert manuscript formats, with
a TipTap-based editor pane for producing aligned translations.

## Running

```sh
cd workbench
npm install
npm run dev          # frontend only, in a browser at :1421 (no Tauri needed)
npm run app:dev       # the actual Tauri window (needs Rust: rustup toolchain)

npm run build         # frontend bundle check (vite build)
npm run app:build     # package .app/.dmg (unsigned)

npm test              # vitest run
```

## Status

Chrome-only scaffold: top bar (breadcrumb + toolbar slot + panel toggles),
collapsible library rail, center editor viewport, right footnotes panel and
bottom lexicon drawer are all wired up with placeholder content. No editor,
data layer, or subprocess integration yet.
