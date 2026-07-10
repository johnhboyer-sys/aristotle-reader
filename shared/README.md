# shared/ — the reader core

The reading experience used by BOTH frontends: the static site (`app/`,
Astro) and the desktop app (`desktop/`, Tauri). One copy, imported by each
host via the `@shared` alias (configured in `app/astro.config.mjs`,
`app/tsconfig.json`, `desktop/vite.config.ts`, `desktop/vitest.config.ts`,
`desktop/tsconfig.json`). The translation workbench (`workbench/`) is
deliberately independent and does not import from here.

- `components/` — Reader, WordPopup, FootnotePopup, Search, BekkerJump
  (BekkerJump takes an optional `onJump` callback: the site navigates the
  tab, the desktop shell passes a handler).
- `lib/` — data, works, search, glossary, betacode, text.
- `styles/global.css` — the whole reader stylesheet. `desktop/src/desktop.css`
  layers overrides on top of it BY CLASS NAME; renaming classes here breaks
  desktop silently, so grep desktop.css before restructuring.
- `__tests__/` — the suite for everything above. Run from this directory
  (`npm ci && npm test`); CI runs it as the `shared` job.

Rules of the road:
- Nothing here may import from `app/`, `desktop/`, or any Tauri API.
  Host-specific behavior is injected (props, `globalThis.__ARISTOTLE_*__`
  hooks — see `lib/data.ts`).
- `import.meta.env.BASE_URL` and `import.meta.env.PUBLIC_SHOW_PRIVATE` are
  the two ambient build-time inputs; each host's bundler defines them
  (Astro's `base` on the site; a `define` block in `desktop/vite.config.ts`).
- This directory has its own strict tsconfig — it is the authoritative
  typecheck for these files (`npm run check`).
