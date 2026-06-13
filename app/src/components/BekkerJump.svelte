<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchColumns, parseBekker, resolveBekker, type ColumnRef } from '../lib/data';

  let value = '';
  let error = '';
  let columns: Record<string, ColumnRef[]> | null = null;

  // Preload the column index so the first lookup is instant.
  onMount(() => { fetchColumns().then(c => (columns = c)).catch(() => {}); });

  async function go() {
    error = '';
    const raw = value;
    const ref = parseBekker(raw);
    if (!ref) {
      error = 'Enter a Bekker citation, e.g. 1097a15';
      return;
    }
    const cols = columns ?? (await fetchColumns().catch(() => null));
    if (!cols) { error = 'Could not load the index — try again'; return; }
    const book = resolveBekker(cols, ref.column, ref.line);
    if (book == null) {
      error = `${ref.column} is not in the Nicomachean Ethics`;
      return;
    }
    // Same-tab navigation; the reader snaps to the nearest line if exact is absent.
    window.location.href = `/book/${book}?loc=${ref.column}:${ref.line}`;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); go(); }
  }
</script>

<form class="bekker-jump" on:submit|preventDefault={go} role="search">
  <input
    type="text"
    bind:value
    on:keydown={onKey}
    on:input={() => (error = '')}
    placeholder="Go to 1097a15"
    aria-label="Jump to a Bekker citation"
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
  />
  <button type="submit" aria-label="Go to citation">Go</button>
  {#if error}<span class="bekker-err" role="alert">{error}</span>{/if}
</form>
