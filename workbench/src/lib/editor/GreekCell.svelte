<script lang="ts">
  // Read-only Greek spine cell — one DISPLAY row (a whole Bekker line, or one
  // segment's slice of a paragraph-split line, design doc D6). Direct grid
  // child (the flat-grid height sync depends on the three cells of a row
  // being siblings on the same explicit row track). Continuation segments
  // indent ~1.5em (reader-site precedent). Right-click opens the split/merge
  // context menu (handled by ChapterEditor; the cell content stays a SINGLE
  // text node so the click's caret offset maps straight into the Greek).
  let {
    gridRow,
    greek,
    continuation,
    flash,
    focused,
    chunkStart = false,
    headingLevel = undefined,
    subtitle = false,
    onContext,
  }: {
    gridRow: number;
    greek: string;
    continuation: boolean;
    flash: boolean;
    focused: boolean;
    /** First row of a paragraph chunk (D8 §5 line-doc grouping) — adds top
     * spacing so chunks read as paragraphs. No-op outside paragraph view. */
    chunkStart?: boolean;
    /** Heading level (D8 heading tools): renders the spine text as a title,
     * deeper levels progressively smaller. Absent = ordinary row. */
    headingLevel?: number;
    /** The heading tier is the 'subtitle' nav-role — render as a small subtitle
     * under its heading, not a big title. */
    subtitle?: boolean;
    onContext: (e: MouseEvent) => void;
  } = $props();
</script>

<!-- The spine cell is reference text, not a control: right-click only opens
     the split/merge menu (the keyboardless gesture John chose in d6 §4.1),
     so no interactive ARIA role applies. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="grc-cell"
  class:cont={continuation}
  class:row-flash={flash}
  class:row-focus={focused}
  class:chunk-start={chunkStart}
  class:row-heading={!!headingLevel && !subtitle}
  class:row-subtitle={subtitle}
  data-heading-level={subtitle ? undefined : (headingLevel ?? undefined)}
  style="grid-row: {gridRow + 1}"
  data-row={gridRow}
  lang="grc"
  oncontextmenu={onContext}
>{greek}</div>
