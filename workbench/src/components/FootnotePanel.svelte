<script lang="ts">
  // Footnotes panel (design doc D1 §"Footnotes" + build spec §7).
  //
  // Non-modal list of the open chapter's footnotes in document order:
  // work-wide display number, anchored-phrase snippet, and an editable body.
  // Clicking an entry highlights its anchor in the text (the plugin's
  // DecorationSet) and scrolls the anchor row into view. Unanchored notes
  // (marker deleted in the text — body kept, never silently destroyed) sit in
  // a quiet section below with re-anchor / delete actions.
  //
  // Body fields are restricted single-block ProseMirror instances reusing the
  // row schema (bold/italic via ⌘B/⌘I only; Enter swallowed; paste
  // flattened), serialized with serialize.ts markup into the footnote body.
  // Edits commit on ~400ms idle or blur through fnCommands.updateFootnoteBody,
  // which pushes its own app-level undo entry and rides the autosave.
  //
  // While mounted, the panel sets session.fnPanelOpen so every anchored
  // phrase in the text gets the subtle always-on highlight. All state flows
  // through the session bridge — the panel never touches the editor directly.
  import { onMount } from 'svelte';
  import { EditorState, Plugin } from '@tiptap/pm/state';
  import { EditorView } from '@tiptap/pm/view';
  import { keymap } from '@tiptap/pm/keymap';
  import { toggleMark } from '@tiptap/pm/commands';
  import { rowSchema } from '../lib/editor/schema';
  import { parseRow, serializeRow } from '../lib/editor/serialize';
  import { session, commands, fnCommands } from '../lib/editor/session.svelte';
  import type { FootnoteListEntry } from '../lib/editor/session.svelte';

  const anchored = $derived(session.footnotes.filter((f) => f.anchored));
  const unanchored = $derived(session.footnotes.filter((f) => !f.anchored));

  const bodyViews = new Map<string, EditorView>();

  onMount(() => {
    session.fnPanelOpen = true;
    return () => {
      session.fnPanelOpen = false;
    };
  });

  // After footnote creation the editor requests focus for the new body field.
  $effect(() => {
    const req = session.fnFocusRequest;
    if (!req) return;
    const view = bodyViews.get(req.id);
    if (view) {
      session.fnFocusRequest = null;
      view.focus();
    }
  });

  const keepFocus = (e: MouseEvent) => e.preventDefault();

  // ── restricted single-block body field (Svelte action) ─────────────────
  function bodyField(node: HTMLElement, entry: FootnoteListEntry) {
    const id = entry.id;
    let lastKnown = entry.body;
    let commitTimer: ReturnType<typeof setTimeout> | null = null;

    const commitNow = () => {
      if (commitTimer !== null) {
        clearTimeout(commitTimer);
        commitTimer = null;
      }
      const markup = serializeRow(view.state.doc);
      if (markup === lastKnown) return;
      lastKnown = markup;
      fnCommands.updateFootnoteBody(id, markup);
    };

    const scheduleCommit = () => {
      if (commitTimer !== null) clearTimeout(commitTimer);
      commitTimer = setTimeout(commitNow, 400);
    };

    const makeState = (body: string) =>
      EditorState.create({
        doc: parseRow(body),
        plugins: [
          keymap({
            'Mod-b': toggleMark(rowSchema.marks.bold),
            'Mod-i': toggleMark(rowSchema.marks.italic),
            // Single-block field: Enter never inserts anything.
            Enter: () => true,
            'Shift-Enter': () => true,
            'Mod-Enter': () => true,
            // App-level undo; commit the pending body burst first so the
            // entry being undone is the one on the stack.
            'Mod-z': () => {
              commitNow();
              commands.undo();
              return true;
            },
            'Shift-Mod-z': () => {
              commitNow();
              commands.redo();
              return true;
            },
            'Mod-y': () => {
              commitNow();
              commands.redo();
              return true;
            },
          }),
          new Plugin({
            props: {
              handlePaste(v, event) {
                event.preventDefault();
                const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/\s*\r?\n\s*/g, ' ');
                if (text) v.dispatch(v.state.tr.insertText(text));
                return true;
              },
            },
          }),
        ],
      });

    const view = new EditorView(node, {
      state: makeState(entry.body),
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        if (tr.docChanged) scheduleCommit();
      },
      handleDOMEvents: {
        focus: () => {
          fnCommands.setActiveFootnote(id);
          return false;
        },
        blur: () => {
          commitNow();
          return false;
        },
      },
    });
    bodyViews.set(id, view);

    return {
      update(next: FootnoteListEntry) {
        // External body change (undo/redo, hydration) → reset the field;
        // our own commits set lastKnown first, so typing never resets.
        if (next.body !== lastKnown) {
          lastKnown = next.body;
          view.updateState(makeState(next.body));
        }
      },
      destroy() {
        commitNow();
        if (bodyViews.get(id) === view) bodyViews.delete(id);
        view.destroy();
      },
    };
  }
</script>

<div class="fn-panel">
  {#if anchored.length === 0 && unanchored.length === 0}
    <p class="fn-empty">
      No footnotes yet. Select a phrase in a row and use the footnote button (n<sup>1</sup>) in the toolbar.
    </p>
  {:else}
    <ul class="fn-list">
      {#each anchored as entry (entry.id)}
        <li class="fn-entry" class:active={session.activeFootnoteId === entry.id}>
          <button
            class="fn-entry-head"
            onclick={() => fnCommands.focusFootnote(entry.id)}
            title="Show this footnote's anchor in the text"
          >
            <span class="fn-num">{entry.displayNumber ?? '?'}</span>
            <span class="fn-snippet">{entry.snippet || '(no anchored phrase)'}</span>
          </button>
          <div class="fn-body" use:bodyField={entry} aria-label="Footnote {entry.displayNumber} body"></div>
          <div class="fn-actions">
            <button
              class="fn-action"
              onmousedown={keepFocus}
              onclick={() => fnCommands.deleteFootnote(entry.id)}
              title="Delete footnote (marker, anchor and body — one undo step)"
            >Delete</button>
          </div>
        </li>
      {/each}
    </ul>

    {#if unanchored.length > 0}
      <h3 class="fn-section">Unanchored</h3>
      <p class="fn-section-sub">Markers deleted in the text — bodies kept. Re-anchor places one at your selection.</p>
      <ul class="fn-list">
        {#each unanchored as entry (entry.id)}
          <li class="fn-entry fn-unanchored" class:active={session.activeFootnoteId === entry.id}>
            <div class="fn-body" use:bodyField={entry} aria-label="Unanchored footnote body"></div>
            <div class="fn-actions">
              <button
                class="fn-action"
                onmousedown={keepFocus}
                onclick={() => fnCommands.reanchorFootnote(entry.id)}
                title="Anchor this footnote at the current selection"
              >Re-anchor</button>
              <button
                class="fn-action"
                onmousedown={keepFocus}
                onclick={() => fnCommands.deleteFootnote(entry.id)}
                title="Delete footnote body (one undo step)"
              >Delete</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .fn-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .fn-empty {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.6;
    font-style: italic;
    color: var(--text-light);
  }
  .fn-empty sup {
    font-style: normal;
  }

  .fn-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .fn-entry {
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: var(--space-2) var(--space-3) var(--space-2);
    background: var(--col-bg);
  }
  .fn-entry.active {
    border-color: var(--accent);
  }

  .fn-entry-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 0 0 var(--space-2);
    cursor: pointer;
    min-width: 0;
  }

  .fn-num {
    flex: none;
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    min-width: 1.1em;
  }

  .fn-snippet {
    font-family: var(--font-english);
    font-size: 0.82rem;
    font-style: italic;
    color: var(--text-mid);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .fn-entry-head:hover .fn-snippet {
    color: var(--text);
  }

  .fn-body {
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: var(--space-1) var(--space-2);
    background: var(--page-bg);
  }
  .fn-body :global(.ProseMirror) {
    outline: none;
    font-family: var(--font-english);
    font-size: 0.85rem;
    line-height: 1.5;
    min-height: 1.3rem;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    caret-color: var(--accent);
  }
  .fn-body:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent);
  }

  .fn-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding-top: var(--space-2);
  }

  .fn-action {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-light);
    background: transparent;
    border: none;
    padding: 0.1rem 0.2rem;
    cursor: pointer;
  }
  .fn-action:hover {
    color: var(--accent);
  }

  .fn-section {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-light);
    margin-top: var(--space-2);
  }
  .fn-section-sub {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-light);
    line-height: 1.5;
  }

  .fn-unanchored {
    border-style: dashed;
  }
</style>
