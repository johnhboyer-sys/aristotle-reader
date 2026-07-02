<script lang="ts">
  // Read-only Greek spine cell — one Bekker line. Direct grid child (the
  // flat-grid height sync depends on the three cells of a row being siblings
  // on the same explicit row track).
  let { index, greek, flash }: { index: number; greek: string; flash: boolean } = $props();
</script>

<div class="grc-cell" class:row-flash={flash} style="grid-row: {index + 1}" data-row={index} lang="grc">
  {greek}
</div>
