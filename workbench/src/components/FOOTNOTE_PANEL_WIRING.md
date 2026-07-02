# FootnotePanel wiring (for the App.svelte owner)

The footnotes agent does not own `App.svelte`; apply these two changes there.
Everything else (autosave, save indicator, panel behavior) is self-contained —
no other wiring is needed.

## 1. Import

In `src/App.svelte`'s `<script>` block, next to the other component imports:

```ts
import FootnotePanel from './components/FootnotePanel.svelte';
```

## 2. Mount in the existing right-panel slot

In the `{#if footnotesOpen}` aside (the 320px `side-panel`), replace the
placeholder paragraph inside `.panel-body`:

```svelte
<div class="panel-body">
  <p class="placeholder-text">Footnotes for the current chapter will appear here.</p>
</div>
```

with:

```svelte
<div class="panel-body">
  <FootnotePanel />
</div>
```

No props. The panel talks to the mounted ChapterEditor through the session
bridge (`src/lib/editor/session.svelte.ts`):

- On mount it sets `session.fnPanelOpen = true` (this switches on the subtle
  always-on anchor highlight in the text) and clears it on unmount — so the
  existing `footnotesOpen` toggle in App is the only state App needs.
- It renders fine with no editor mounted (the "not onboarded" chapters): the
  footnote list is empty and all actions no-op.

## Notes for the orchestrator (behavior that already works without wiring)

- **Autosave** lives entirely inside `ChapterEditor` + `src/lib/library/`.
  The `{#key}`-based chapter switching in App already triggers
  commit-all-rows → flush on teardown; reopening a chapter awaits any
  in-flight write before reading (module-level pending-write registry), so no
  App changes are required for persistence.
- The save-state indicator ("Saving…"/"Saved") renders in the chapter header
  inside ChapterEditor.
- `session.footnotes`, `session.activeFootnoteId`, `session.fnFocusRequest`
  and `fnCommands` were added to the session bridge for the panel; nothing in
  App needs to read them.
- Known seam: the dev fixture's `workId` is `'meta'` while the manifest
  registry id is `'metaphysics'`, so work-wide footnote numbering currently
  uses the numeric book-order fallback (identical ordering for Metaphysics).
  When the corpus data layer replaces the fixture, pass a workId that
  `getWork()` knows and manifest book order applies automatically.
- Dev-only harness: `panel-smoke.html` + `src/dev/PanelSmoke.svelte` mount
  ChapterEditor + FootnotePanel side by side at
  `http://localhost:1421/panel-smoke.html` for testing the panel before App
  wiring lands. Delete both once the panel is wired, or keep them as a dev
  fixture — they are not part of `npm run build` (vite only bundles
  `index.html`).
