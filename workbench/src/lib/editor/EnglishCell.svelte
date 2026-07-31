<script lang="ts">
  // English cell: wraps the live RowEditor and hosts the inline paste-confirm
  // bar for this row, plus the un-split confirm (design doc D6 — shown on
  // segment 0 of the line being merged). Direct grid child on the same
  // explicit row track as its Greek and gutter siblings. Identity is
  // (row, segment); `gridRow` is only the current grid ordinal (track
  // placement + DOM row resolution).
  import RowEditor from './RowEditor.svelte';
  import type { RowViewHost, EditLayer } from './ChapterEditor.svelte';

  let {
    gridRow,
    row,
    segment,
    host,
    layer = 'sentence',
    sentenceText = null,
    flash,
    chunkStart = false,
    headingLevel = undefined,
    subtitle = false,
    pasteConfirm,
    onPasteConfirm,
    onPasteCancel,
    unsplitConfirm,
    unsplitMessage = null,
    onUnsplitConfirm,
    onUnsplitCancel,
    onContext,
  }: {
    gridRow: number;
    row: number;
    segment: number;
    host: RowViewHost;
    /** Which English layer the hosted editor edits (D8 §4): 'sentence' (grid /
     * line views) or 'para' (paragraph-unit view → englishPara). */
    layer?: EditLayer;
    /** Heading level (D8 heading tools): styles the editable cell as a title,
     * deeper levels progressively smaller. Absent = ordinary row. */
    headingLevel?: number;
    /** The heading tier is the 'subtitle' nav-role — render as a small subtitle. */
    subtitle?: boolean;
    /** Read-only sentence-layer translation to show beneath the paragraph
     * field when this row also has one (§4 "text stays at its unit"). Null
     * outside the paragraph-unit view or when the row has no sentence English. */
    sentenceText?: string | null;
    flash: boolean;
    /** First row of a paragraph chunk (line-doc grouping, §5). */
    chunkStart?: boolean;
    pasteConfirm: number | null; // segment count when a confirm is pending here
    onPasteConfirm: () => void;
    onPasteCancel: () => void;
    unsplitConfirm: boolean; // the un-split confirm is pending on this cell
    /** Confirm wording override (D8 §3 sentence join); null → the D6 line
     * un-split sentence below. */
    unsplitMessage?: string | null;
    onUnsplitConfirm: () => void;
    onUnsplitCancel: () => void;
    onContext: (e: MouseEvent) => void; // right-click → the row's AI menu
  } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="en-cell"
  class:row-flash={flash}
  class:chunk-start={chunkStart}
  class:row-heading={!!headingLevel && !subtitle}
  class:row-subtitle={subtitle}
  data-heading-level={subtitle ? undefined : (headingLevel ?? undefined)}
  style="grid-row: {gridRow + 1}"
  data-row-en={gridRow}
  oncontextmenu={onContext}
>
  <RowEditor {row} {segment} {host} {layer} />

  {#if sentenceText !== null}
    <!-- Read-only sentence-layer translation (D8 §4 "text stays at its unit"):
         subdued, selectable/copyable, labelled — never editable. Shown only in
         the paragraph-unit view when the row also carries sentence English, so
         switching views never moves or destroys it. -->
    <div class="sentence-layer" role="note">
      <span class="sentence-layer-label">Sentence-layer translation</span>
      <p class="sentence-layer-text">{sentenceText}</p>
    </div>
  {/if}

  {#if pasteConfirm !== null}
    <div class="paste-confirm" role="alertdialog" aria-label="Confirm multi-line paste">
      <span class="paste-confirm-text">Paste {pasteConfirm} lines into the next {pasteConfirm} rows?</span>
      <button class="paste-btn paste-btn-primary" onclick={onPasteConfirm}>Paste {pasteConfirm} lines</button>
      <button class="paste-btn" onclick={onPasteCancel}>Cancel</button>
    </div>
  {/if}

  {#if unsplitConfirm}
    <div class="paste-confirm" role="alertdialog" aria-label="Confirm paragraph merge">
      <span class="paste-confirm-text">{unsplitMessage ?? 'Merge these two English paragraphs back into one line?'}</span>
      <button class="paste-btn paste-btn-primary" onclick={onUnsplitConfirm}>Merge</button>
      <button class="paste-btn" onclick={onUnsplitCancel}>Cancel</button>
    </div>
  {/if}
</div>
