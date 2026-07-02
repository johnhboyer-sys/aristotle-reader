<script lang="ts">
  // English cell: wraps the live RowEditor and hosts the inline paste-confirm
  // bar for this row. Direct grid child on the same explicit row track as its
  // Greek and gutter siblings.
  import RowEditor from './RowEditor.svelte';
  import type { RowViewHost } from './ChapterEditor.svelte';

  let {
    index,
    host,
    flash,
    pasteConfirm,
    onPasteConfirm,
    onPasteCancel,
  }: {
    index: number;
    host: RowViewHost;
    flash: boolean;
    pasteConfirm: number | null; // segment count when a confirm is pending here
    onPasteConfirm: () => void;
    onPasteCancel: () => void;
  } = $props();
</script>

<div class="en-cell" class:row-flash={flash} style="grid-row: {index + 1}" data-row-en={index}>
  <RowEditor {index} {host} />

  {#if pasteConfirm !== null}
    <div class="paste-confirm" role="alertdialog" aria-label="Confirm multi-line paste">
      <span class="paste-confirm-text">Paste {pasteConfirm} lines into the next {pasteConfirm} rows?</span>
      <button class="paste-btn paste-btn-primary" onclick={onPasteConfirm}>Paste {pasteConfirm} lines</button>
      <button class="paste-btn" onclick={onPasteCancel}>Cancel</button>
    </div>
  {/if}
</div>
