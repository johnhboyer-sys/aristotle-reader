<script lang="ts">
  // Svelte port of the site's ThemeToggle.astro: moon in light mode, sun in
  // dark. Persists to the same 'ne-theme' key the reader/site already uses.
  import { onMount } from 'svelte';

  let theme: 'light' | 'dark' = 'light';
  onMount(() => {
    theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  });

  function toggle() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ne-theme', theme); } catch { /* fine */ }
  }
</script>

<button class="dt-theme" on:click={toggle} title="Toggle light / dark" aria-label="Toggle theme">
  {#if theme === 'dark'}
    <!-- sun -->
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  {:else}
    <!-- moon -->
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  {/if}
</button>

<style>
  .dt-theme {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 6px;
    border: 1px solid var(--border); background: transparent;
    color: var(--text-mid); cursor: pointer;
  }
  .dt-theme:hover { color: var(--text); border-color: var(--text-light); }
</style>
