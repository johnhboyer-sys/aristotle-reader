<script lang="ts">
  // Formatting toolbar (top-bar right slot): B / I / U · Greek · Footnote.
  // Buttons proxy through the session bridge to the mounted ChapterEditor;
  // active states reflect the current selection (synced on every dispatch).
  // mousedown is prevented so clicking a button never steals the row's focus.
  import { session, commands } from './session.svelte';

  const keepFocus = (e: MouseEvent) => e.preventDefault();
</script>

<div class="ed-toolbar" role="group" aria-label="Formatting">
  <button
    class="tb-btn tb-bold"
    class:active={session.activeMarks.bold}
    disabled={!session.hasEditor}
    onmousedown={keepFocus}
    onclick={() => commands.toggleMark('bold')}
    title="Bold (⌘B)"
    aria-label="Bold"
    aria-pressed={session.activeMarks.bold}
  >B</button>

  <button
    class="tb-btn tb-italic"
    class:active={session.activeMarks.italic}
    disabled={!session.hasEditor}
    onmousedown={keepFocus}
    onclick={() => commands.toggleMark('italic')}
    title="Italic (⌘I)"
    aria-label="Italic"
    aria-pressed={session.activeMarks.italic}
  >I</button>

  <button
    class="tb-btn tb-underline"
    class:active={session.activeMarks.underline}
    disabled={!session.hasEditor}
    onmousedown={keepFocus}
    onclick={() => commands.toggleMark('underline')}
    title="Underline (⌘U)"
    aria-label="Underline"
    aria-pressed={session.activeMarks.underline}
  >U</button>

  <span class="tb-sep" aria-hidden="true"></span>

  <button
    class="tb-btn tb-greek"
    class:active={session.greekMode}
    disabled={!session.hasEditor}
    onmousedown={keepFocus}
    onclick={() => commands.toggleGreek()}
    title="Greek input — Beta Code (⌘G)"
    aria-label="Toggle Greek input"
    aria-pressed={session.greekMode}
  >αβ</button>

  <button
    class="tb-btn tb-fn"
    disabled={!session.hasEditor}
    onmousedown={keepFocus}
    onclick={() => commands.insertFootnote()}
    title="Footnote on selection"
    aria-label="Insert footnote"
  >n<sup>1</sup></button>

  <span class="tb-sep" aria-hidden="true"></span>

  <button
    class="tb-btn tb-cite"
    disabled={!session.hasEditor}
    onmousedown={keepFocus}
    onclick={() => commands.copyCitation()}
    title="Copy with citation (⌘⇧C)"
    aria-label="Copy with citation"
  >“ ”</button>
</div>

<style>
  .ed-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.9rem;
    height: 1.9rem;
    padding: 0 0.4rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-mid);
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
  }
  .tb-btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--ui-hover);
  }
  .tb-btn.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .tb-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .tb-bold {
    font-weight: 700;
  }
  .tb-italic {
    font-style: italic;
  }
  .tb-underline {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .tb-greek {
    font-size: 0.85rem;
    letter-spacing: 0.02em;
  }
  .tb-fn {
    font-size: 0.82rem;
  }
  .tb-fn sup {
    font-size: 0.62em;
    color: var(--accent);
    margin-left: 1px;
  }
  .tb-cite {
    font-size: 0.85rem;
    letter-spacing: 0.05em;
  }

  .tb-sep {
    width: 1px;
    height: 1.1rem;
    background: var(--border);
    margin: 0 var(--space-1);
  }
</style>
