<script lang="ts">
  // One unit of the INTERPOLATED view (D8 §5): a single-column stack block —
  // the English field on top, the display-only original directly beneath it,
  // and a compact gutter-style address label above. The field is the SAME
  // EnglishCell the grid mounts (identical typing/commit/undo/assist/paste
  // behavior; view identity stays (row, segment, layer)), so behavior parity
  // is inherited, not re-implemented.
  //
  // The original is STRICTLY non-editable, display-only text (§5): a plain
  // div, never a TipTap node. user-select stays on — it is not adjacent to
  // another editable column here, so the two-column DOM-grouping selection
  // invariant does not apply (documented in the design; it remains mandatory
  // for the grid/paragraph views). Right-click on the ORIGINAL opens the
  // same structure menu as the work's two-column views (refinement pass —
  // onSourceContext, offset-mapped through the display slices); the FIELD
  // keeps the AI-only menu (onContext), like every English cell.
  import EnglishCell from './EnglishCell.svelte';
  import type { RowViewHost, EditLayer } from './ChapterEditor.svelte';

  let {
    gridRow,
    row,
    segment,
    host,
    layer = 'sentence',
    addr,
    slices,
    paraText = null,
    sentenceText = null,
    flash,
    focused,
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
    onSourceContext = null,
  }: {
    gridRow: number;
    row: number;
    segment: number;
    host: RowViewHost;
    /** Which English layer the field edits (D8 §4): 'sentence' (line docs /
     * sentence granularity) or 'para' (unit granularity → englishPara). */
    layer?: EditLayer;
    /** The unit's address, shown verbatim as a compact label (¶N / line n /
     * Bekker addr — raw strings stay opaque, same as the grid gutter). */
    addr: string;
    /** Display slices of the original: one per sentence division (unit
     * granularity renders a subtle separator between them), or a single
     * slice. Empty text ⇒ the source block is omitted. */
    slices: string[];
    /** Read-only paragraph-layer translation shown ABOVE the field on the
     * row's first block in sentence granularity (§4 "text stays at its
     * unit"). Null when absent / not this row's first block / unit view. */
    paraText?: string | null;
    /** Read-only sentence-layer translation under the englishPara field in
     * unit granularity — exactly D1's paragraph-view block (via EnglishCell). */
    sentenceText?: string | null;
    flash: boolean;
    /** This unit's cell holds the focus (drives the unit-level whisper). */
    focused: boolean;
    /** First unit of a paragraph chunk/group (§3/§5 grouping). */
    chunkStart?: boolean;
    /** Heading level (D8 heading tools): renders the unit as a title, deeper
     * levels progressively smaller. Absent = ordinary row. */
    headingLevel?: number;
    /** The heading tier is the 'subtitle' nav-role — render as a small subtitle. */
    subtitle?: boolean;
    pasteConfirm: number | null;
    onPasteConfirm: () => void;
    onPasteCancel: () => void;
    unsplitConfirm: boolean;
    /** Confirm wording override (D8 §3) — passed through to EnglishCell. */
    unsplitMessage?: string | null;
    onUnsplitConfirm: () => void;
    onUnsplitCancel: () => void;
    onContext: (e: MouseEvent) => void;
    /** Structure-aware menu for the ORIGINAL (refinement pass): falls back
     * to onContext (AI-only) when the host doesn't wire it. */
    onSourceContext?: ((e: MouseEvent) => void) | null;
  } = $props();

  const sourceText = $derived(slices.join(''));
</script>

<section
  class="interp-unit"
  class:row-focus={focused}
  class:chunk-start={chunkStart}
  class:row-heading={!!headingLevel && !subtitle}
  class:row-subtitle={subtitle}
  data-heading-level={subtitle ? undefined : (headingLevel ?? undefined)}
  data-row={gridRow}
>
  <div class="interp-addr">{addr}</div>

  {#if paraText !== null}
    <!-- Read-only paragraph-layer translation (D8 §4 "text stays at its
         unit"): same .sentence-layer family as D1's block — labelled,
         selectable/copyable, never editable, never moved or destroyed. -->
    <div class="sentence-layer interp-cross-layer" role="note">
      <span class="sentence-layer-label">Paragraph-layer translation</span>
      <p class="sentence-layer-text">{paraText}</p>
    </div>
  {/if}

  <EnglishCell
    {gridRow}
    {row}
    {segment}
    {host}
    {layer}
    {sentenceText}
    {flash}
    {pasteConfirm}
    {onPasteConfirm}
    {onPasteCancel}
    {unsplitConfirm}
    {unsplitMessage}
    {onUnsplitConfirm}
    {onUnsplitCancel}
    {onContext}
  />

  {#if sourceText.trim().length > 0}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="interp-source" lang="grc" oncontextmenu={onSourceContext ?? onContext}>{#each slices as s, i (i)}{#if i > 0}<span class="interp-sep" aria-hidden="true"></span>{/if}{s}{/each}</div>
  {/if}
</section>
