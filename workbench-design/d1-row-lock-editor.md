# D1 — Row-lock editor architecture (SYNTHESIZED DECISION)

Status: **decided 2026-07-02** by orchestrator synthesis of two independent design memos
(deep-reasoner + Codex). Canonical spec for implementers. Deviations require orchestrator
sign-off.

## Model

- One row = one Bekker line. Row count is owned by the Greek spine; NOTHING the user does
  creates or destroys a row. No merging, ever (explicit user constraint).
- `ChapterModel` is the single source of truth: `rows: [{ address, greek, english: PMDocJSON }]`,
  `footnotes`, dirty tracking. Editors commit into it; autosave serializes from it.
- One TipTap (ProseMirror) instance per English cell. **Phase 1 mounts ALL rows live** with a
  deliberately lean plugin set. The English cell sits behind a component boundary
  (`EnglishCell` → `RowEditor`) so a mount-on-focus/static-HTML variant can be swapped in later
  without restructuring. Integration test must profile a ~300-row chapter; if chapter-open or
  typing latency is felt, implement mount-on-focus (focused row ±2 live, DOMSerializer-rendered
  static HTML elsewhere, synchronous mousedown hydrate with posAtCoords) — designed, not built.

## Component structure

```
workbench/src/lib/editor/
  ChapterEditor.svelte    # owns ChapterModel, undo stack, focus state, commitOnIdle
  RowGutter / GreekCell / EnglishCell (.svelte)   # cells of the chapter grid
  RowEditor.svelte        # one TipTap instance
  schema.ts               # restricted PM schema (below)
  plugins/rowKeymap.ts    # Enter/Backspace/Tab/Arrow/goal-column + paste handling
  plugins/greekInput.ts   # Greek-mode mark + Beta pending-buffer transform
  plugins/footnote.ts     # fnRef mark bookkeeping + active-anchor DecorationSet
  serialize.ts            # row-doc <-> one-line markup (lossless, round-trip asserted)
```

## Height sync: flat CSS grid (no measured spacers, no subgrid)

One grid for the whole chapter; each row's three cells are siblings placed on the same row track:

```css
.chapter-grid {
  display: grid;
  grid-template-columns: [grc] minmax(20rem, max-content) [gutter] 4ch [en] 1fr;
  align-items: start;
}
/* each cell: style="grid-row: N" (or nth-child flow), data-row="N" */
```

Track height = max(Greek, English) automatically; the next row starts at the same y in both
columns with zero JS. (Gutter column sits between Greek and English, numbers right-aligned
against the English cell, per the Scrivener-replacement layout; exact column order may be tuned
in the visual pass without touching the mechanism.)

- Editing row N only shifts rows > N (downward, usually below the fold) — no visible jump.
- Scroll anchoring: before any commit that can change heights, capture the caret's
  `getBoundingClientRect().top`; after layout, adjust `scrollTop` by the delta if it moved.
- ONE ResizeObserver on the grid container as a **settle guard only** (font-load reflow,
  post-paint nodeview changes): coalesce via dirty-flag + single rAF; its job is caret-visibility
  re-assert + gutter sticky recompute, never writing heights.
- Never write inline height styles during keystrokes. Preload both fonts (Cardo, EB Garamond)
  to avoid late reflow.
- Blur/idle (debounced ~400ms) = "settle": commit doc to model, undo-coalesce boundary, settle
  pass.

## Restricted schema

- Doc: single inline-content block (one logical line; soft-wrap only — no hard breaks exist in
  the schema, so a `\n` in a row is unrepresentable by construction).
- Marks: `bold`, `italic`, `underline`, `greek` (renders `<span lang="grc" class="grc">`, Greek
  font via CSS), `fnRef { id }` (footnote anchor phrase).
- Nodes: `footnoteMarker { id }` — inline, atomic, non-selectable; renders `<sup>` with the
  computed display number; sits at the END of the anchored phrase.
- NO `history()` plugin (undo is app-level), minimal base keymap + Cmd-B/I/U.

## Cross-row UX (rowKeymap)

- **Enter** (anywhere in a row): commit + focus next row, caret at end of its existing content.
  Matches the old Scrivener verse-mode muscle memory (Enter advances a line). Enter never splits
  or inserts anything.
- **Tab / Shift-Tab**: next / previous row (never inserts a tab character).
- **Backspace at row start / Delete at row end**: swallowed; subtle row flash + one-line status
  hint ("Bekker lines can't be merged"). A second Backspace within ~600ms moves the caret to the
  previous row's end (no deletion) — deliberate two-step so held-Backspace can't run through a
  boundary into the row above.
- **ArrowUp/Down at visual first/last line**: goal-column navigation — capture caret x via
  `coordsAtPos`, focus adjacent row, place via `posAtCoords({left: savedX, ...})`; `savedX`
  persists across consecutive vertical moves, clears on horizontal movement. Fallback: row
  start/end when posAtCoords misses (empty rows).
- **Paste with newlines**: if the paste has N segments and the current row is the first of N
  consecutive rows whose remainder is EMPTY → inline confirm ("Paste N lines into the next N
  rows?") then distribute as ONE undo group. Otherwise flatten newlines to spaces into the
  current row + toast ("Line breaks flattened — rows are fixed to Bekker lines"). Never
  creates/destroys rows; nothing silent, nothing destructive.
- **Cross-row selection (Phase 1)**: browser-native selection may span rows for READING;
  a document-level copy handler walks the selected rows and emits plain text joined by newlines.
  All editing/formatting/footnote commands require a single-row selection (quiet "Select within
  one row" hint otherwise). Cross-row cut/replace: not in Phase 1.

## Undo/redo: app-level stack (PM history off)

```ts
type UndoEntry = {
  edits: { rowIndex: number; before: PMDocJSON; after: PMDocJSON }[];  // 1 row normally;
  fnBefore?: FootnoteTable; fnAfter?: FootnoteTable;                    // n rows for paste
  selBefore: SelRef; selAfter: SelRef;
}
```

- Row docs are one Bekker line — whole-doc snapshots are bytes, not KB; no step inversion.
- Coalesce a typing burst in one row into one entry (new entry on ~500ms idle, row change, or
  any non-typing command). Cross-row paste = one entry.
- Undo/redo restores the model, updates the live view (`updateState`), and re-focuses the
  affected row so the user sees where it landed. Redo stack clears on new edit.
- Survives any future mount/unmount lifecycle because it lives on the model, not the views.

## Greek insertion + Beta Code (greekInput plugin)

- **Greek is a MARK, not an atomic node.** The spec's "atomic" wording is intent (a visually and
  semantically distinct span), and atomicity contradicts live typing; both independent memos
  reached the same reading. The mark renders in the Greek font with `lang="grc"`.
- **Unicode is canonical** — in the doc and on disk. Beta Code is an input method only.
- Greek mode: explicit toggle (toolbar button + Cmd-G); sets storedMarks so subsequent typing
  carries the `greek` mark. Never inferred from content (English "to" must not trigger it).
- Transform mechanism: the plugin owns transient state — `{ rawBuffer, renderedFrom, renderedTo }`
  for the current typing run. On each ASCII input inside Greek mode (via handleTextInput):
  append to `rawBuffer`, run the existing `betaToGreek(rawBuffer)` (adapted verbatim from
  app/src/lib/betacode.ts) over the WHOLE buffer, replace `[renderedFrom, renderedTo)` with the
  result in the same transaction as the keystroke (one Cmd-Z = char + transform together).
  Whole-buffer re-decode is mandatory: suffix diacritics (`h` → `)` → `=`) and final-sigma
  (σ↔ς flips when the next char lands) make incremental transforms wrong by construction.
- Backspace inside a pending run pops `rawBuffer` and re-decodes. Buffer commits (and resets) on
  word boundary (space/punctuation), caret leaving the run, blur, or mode toggle-off. Direct
  Unicode Greek input (system keyboard) is accepted as-is and resets the buffer.
- **IME guard**: no transform while `view.composing`; run on `compositionend` only. macOS dead
  keys otherwise corrupt input.
- Acceptance phrase: typing `to\ ti/ h)=n ei)=nai` in Greek mode yields τὸ τί ἦν εἶναι.

## Footnotes

- Anchor = `fnRef { id }` mark applied over the selected phrase: ProseMirror maps mark
  boundaries through edits automatically — anchors survive editing with no bookkeeping.
- Marker = `footnoteMarker { id }` atomic node inserted at the anchor range's end.
- If the marker node is deleted by the user, the footnote is removed from the row but its body
  goes to an "unanchored" state in the panel (recoverable), never silently destroyed.
- Active highlight while the panel is open: `DecorationSet` (inline decoration over the
  `fnRef` range) — view-only, not in the doc, not in undo.
- Display numbers are computed (work-wide continuous, per build-spec §3/§7), never stored in
  the node; the node holds only the chapter-local id.

## Serialization (serialize.ts) — lossless, human-readable, diffable

One physical line per row; row order = Bekker order; NO inline Bekker refs in the working file
(they're stamped only at export, per build spec §8). Inline syntax:

| feature | syntax | note |
|---|---|---|
| bold / italic | `**text**` / `*text*` | standard Markdown |
| underline | `++text++` | CriticMarkup-style; MD has no underline |
| Greek span | `{grc:τὸ τί ἦν εἶναι}` | literal Unicode inside; greppable, readable |
| footnote anchor+marker | `{^3:anchored phrase}` | wraps the phrase; marker implicitly at its end |

`[FOOTNOTES]` block entries: `3: body text…` (chapter-local ids, per build spec §3).
Escapes: backslash before literal `*`, `+`, `{`, `[`, `^`; `\}` inside `{...}` spans. Keep the
table tiny.

Round-trip guarantee: `parse(serialize(doc)) deepEquals doc` asserted in dev builds on every
commit, and property-tested in vitest (random docs from the restricted schema).

## Known pitfalls (verify during implementation)

- Font-load desync → preload; container RO settles.
- Scroll anchoring around commits (above).
- `view.composing` guard for ALL text-transform plugins.
- The `{grc:…}` parser must re-apply the greek mark exactly; `{^id:…}` must re-apply fnRef and
  re-insert the marker node — round-trip tests are the enforcement.
- Static-vs-live render parity only matters if mount-on-focus is later enabled; keep the
  DOMSerializer output path shared from day one (cheap now, essential then).
