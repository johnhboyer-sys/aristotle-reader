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

## LSJ entries

An LSJ entry is the one piece of corpus HTML with real STRUCTURE in it —
LSJ divides a word's senses A → I → 1 → a, and that division is the argument
of the entry. The pipeline emits it as a FLAT run of sibling
`<div class="lsj-sense" data-level="N">` — depth is carried on the attribute,
not by nesting — with the sense number in a leading `<b class="lsj-sense-n">`;
`lib/html.ts` allows exactly those through the sanitizer and
`styles/global.css` typesets them. Drop either half and the entry renders as
one wall of prose.

`data-level` is absolute across the dictionary and an entry need not start at
level 1: 759 of 14,047 entries have no level-1 sense, λόγος among them (it
opens at level 2, so its I/II/III are its real sections). `renderLsjEntry`
therefore stamps `data-depth`, the level made relative to the shallowest one
that entry uses, and the stylesheet indents off that. The jump list follows
the same rule — it indexes the shallowest depth carrying enough NUMBERED
sections to be worth listing, so an unnumbered compound-holder never produces
a blank row.

Hosts do not reimplement any of that. One call renders an entry:

```ts
import { renderLsjEntry } from '@shared/lib/html';

// sidebar/popup scale, links prefixed for a site served under a base
renderLsjEntry(shard[key].html, { base });
// full-width reference view, with a jump list over the top-level senses
renderLsjEntry(shard[key].html, { base, scale: 'page', outline: true });
```

It sanitizes, prefixes the shards' root-relative citation hrefs, stamps
anchor ids, and returns a complete `<div class="lsj-entry">…</div>` (empty
string when the lemma has no entry, so `{#if}` on the result). Everything it
needs is in its arguments — nothing about Aristotle, his work ids, or Bekker
numbers is in the LSJ path.

**Porting to the sibling readers** (plato-reader, homer-reader,
classical-philosophy-reader, which copy this directory): copying `lib/html.ts`
and `styles/global.css` carries the whole presentation. Then point each host's
entry view at `renderLsjEntry` and delete its local `.lsj` rules. The only
precondition is that the sibling's pipeline emits the `lsj-sense` /
`data-level` markup above — an entry without it still renders, just flat.

Rules of the road:
- Nothing here may import from `app/`, `desktop/`, or any Tauri API.
  Host-specific behavior is injected (props, `globalThis.__ARISTOTLE_*__`
  hooks — see `lib/data.ts`).
- `import.meta.env.BASE_URL` and `import.meta.env.PUBLIC_SHOW_PRIVATE` are
  the two ambient build-time inputs; each host's bundler defines them
  (Astro's `base` on the site; a `define` block in `desktop/vite.config.ts`).
- This directory has its own strict tsconfig — it is the authoritative
  typecheck for these files (`npm run check`).
