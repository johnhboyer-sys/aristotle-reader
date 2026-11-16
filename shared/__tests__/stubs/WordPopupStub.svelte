<script lang="ts">
  // Stands in for WordPopup in the search tests: shows what it was given.
  export let work: string;
  export let token: { t: string; o?: number; k: string };
  export let anchor: { x: number; y: number } | undefined = undefined;
  export let onClose: () => void;
</script>

<div class="word-sidebar" data-work={work} data-token={JSON.stringify(token)} data-anchored={!!anchor}>
  <button type="button" class="settings-close" on:click={onClose}>Close</button>
</div>
