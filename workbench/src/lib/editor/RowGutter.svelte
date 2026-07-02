<script lang="ts">
  // Gutter cell: the row's raw address (e.g. "1041a6"), small / right-aligned
  // / muted. Raw strings are opaque outside src/lib/citation — the gutter
  // shows them verbatim, it never parses them.
  let { index, raw }: { index: number; raw: string } = $props();
</script>

<div class="gutter" style="grid-row: {index + 1}" data-row={index}>{raw}</div>
