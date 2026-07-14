<script lang="ts">
  // Non-modal AI-assist popover (design doc D4 divergence B): anchored under
  // the target row's English cell (rendered by RowEditor inside the
  // position:relative .en-cell; layout in editor.css, same quiet chrome as
  // the paste-confirm bar). Three states:
  //   thinking   — "Thinking…" with Cancel (dismiss = abort the request)
  //   suggestion — the text + Insert / Dismiss
  //   message    — ONE vetted plain sentence from src/lib/assist/messages.ts
  //                (this component never composes its own error text)
  // Esc dismisses too — handled by ChapterEditor's root keydown so it works
  // while the caret stays in the row.
  import type { AssistUiState } from '../lib/editor/assistController';

  let {
    state,
    onInsert,
    onDismiss,
    anchor = null,
  }: {
    state: AssistUiState;
    onInsert: () => void;
    onDismiss: () => void;
    /** Viewport point to pin the popover under (the clicked word). Null = the
     * default placement: absolute, under the target English cell. */
    anchor?: { x: number; y: number } | null;
  } = $props();

  // When anchored to a click point, pin the popover there (fixed) just below the
  // cursor; otherwise it stays absolute under the cell (editor.css).
  const anchorStyle = $derived(
    anchor ? `position: fixed; left: ${anchor.x}px; top: ${anchor.y + 12}px;` : '',
  );

  // Keep the popover inside the window. Measure after render and nudge it back
  // via transform (leaving the anchor intact): always clamp the right/left edge
  // (a wide suggestion in the full-width flows would overflow); for a
  // click-anchored popover clamp the bottom/top too. Re-runs when the content
  // (and thus size) changes — thinking → suggestion.
  let el = $state<HTMLDivElement>();
  $effect(() => {
    void state;
    void anchor;
    const node = el;
    if (!node || typeof window === 'undefined') return;
    node.style.transform = '';
    const rect = node.getBoundingClientRect();
    const MARGIN = 8;
    let dx = 0;
    let dy = 0;
    const overRight = rect.right - (window.innerWidth - MARGIN);
    if (overRight > 0) dx = -overRight;
    if (rect.left + dx < MARGIN) dx = MARGIN - rect.left;
    if (anchor) {
      const overBottom = rect.bottom - (window.innerHeight - MARGIN);
      if (overBottom > 0) dy = -(overBottom + rect.height + 24); // flip above the click
      if (rect.top + dy < MARGIN) dy = MARGIN - rect.top;
    }
    if (dx !== 0 || dy !== 0) node.style.transform = `translate(${dx}px, ${dy}px)`;
  });
</script>

<div
  class="assist-popover"
  role="dialog"
  aria-label="Translation suggestion"
  bind:this={el}
  style={anchorStyle}>
  {#if state.kind === 'thinking'}
    <span class="assist-note">Thinking…</span>
    <button class="assist-btn" type="button" onclick={onDismiss}>Cancel</button>
  {:else if state.kind === 'suggestion'}
    <p class="assist-text">{state.text}</p>
    <div class="assist-actions">
      <button class="assist-btn assist-btn-primary" type="button" onclick={onInsert}>Insert</button>
      <button class="assist-btn" type="button" onclick={onDismiss}>Dismiss</button>
    </div>
  {:else}
    <span class="assist-note">{state.text}</span>
    <button class="assist-btn" type="button" onclick={onDismiss}>OK</button>
  {/if}
</div>
