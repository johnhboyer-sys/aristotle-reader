<script lang="ts">
  // Gutter cell: the row's raw address (e.g. "1041a6"), small / right-aligned
  // / muted. Raw strings are opaque outside src/lib/citation — the gutter
  // shows them verbatim, it never parses them. Both segments of a
  // paragraph-split line show the SAME raw address (design doc D6 §5 — a
  // split is not a new line; no new ticks or stamps).
  let { gridRow, raw, focused }: { gridRow: number; raw: string; focused: boolean } = $props();
</script>

<div class="gutter" class:row-focus={focused} style="grid-row: {gridRow + 1}" data-row={gridRow}>{raw}</div>
