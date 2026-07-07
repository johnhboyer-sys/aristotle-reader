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
  }: {
    state: AssistUiState;
    onInsert: () => void;
    onDismiss: () => void;
  } = $props();
</script>

<div class="assist-popover" role="dialog" aria-label="Translation suggestion">
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
