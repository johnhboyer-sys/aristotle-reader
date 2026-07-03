<script lang="ts">
  // English cell: wraps the live RowEditor and hosts the inline paste-confirm
  // bar for this row, plus the un-split confirm (design doc D6 — shown on
  // segment 0 of the line being merged). Direct grid child on the same
  // explicit row track as its Greek and gutter siblings. Identity is
  // (row, segment); `gridRow` is only the current grid ordinal (track
  // placement + DOM row resolution).
  import RowEditor from './RowEditor.svelte';
  import type { RowViewHost } from './ChapterEditor.svelte';

  let {
    gridRow,
    row,
    segment,
    host,
    flash,
    pasteConfirm,
    onPasteConfirm,
    onPasteCancel,
    unsplitConfirm,
    onUnsplitConfirm,
    onUnsplitCancel,
  }: {
    gridRow: number;
    row: number;
    segment: number;
    host: RowViewHost;
    flash: boolean;
    pasteConfirm: number | null; // segment count when a confirm is pending here
    onPasteConfirm: () => void;
    onPasteCancel: () => void;
    unsplitConfirm: boolean; // the un-split confirm is pending on this cell
    onUnsplitConfirm: () => void;
    onUnsplitCancel: () => void;
  } = $props();
</script>

<div class="en-cell" class:row-flash={flash} style="grid-row: {gridRow + 1}" data-row-en={gridRow}>
  <RowEditor {row} {segment} {host} />

  {#if pasteConfirm !== null}
    <div class="paste-confirm" role="alertdialog" aria-label="Confirm multi-line paste">
      <span class="paste-confirm-text">Paste {pasteConfirm} lines into the next {pasteConfirm} rows?</span>
      <button class="paste-btn paste-btn-primary" onclick={onPasteConfirm}>Paste {pasteConfirm} lines</button>
      <button class="paste-btn" onclick={onPasteCancel}>Cancel</button>
    </div>
  {/if}

  {#if unsplitConfirm}
    <div class="paste-confirm" role="alertdialog" aria-label="Confirm paragraph merge">
      <span class="paste-confirm-text">Merge these two English paragraphs back into one line?</span>
      <button class="paste-btn paste-btn-primary" onclick={onUnsplitConfirm}>Merge</button>
      <button class="paste-btn" onclick={onUnsplitCancel}>Cancel</button>
    </div>
  {/if}
</div>
