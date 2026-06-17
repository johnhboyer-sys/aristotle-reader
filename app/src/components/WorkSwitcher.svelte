<script lang="ts">
  import { WORKS, workPath } from '../lib/works';

  // The work currently open in the reader. Switching navigates to that work,
  // resuming the last book (and Bekker position) read there if known.
  export let work: string = 'EN';
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  function go(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    if (id === work) return;
    let book = '1';
    let loc = '';
    try {
      book = localStorage.getItem(`reader-book-${id}`) || '1';
      loc = localStorage.getItem(`reader-loc-${id}`) || '';
    } catch {}
    window.location.href = `${base}${workPath(id, Number(book))}${loc ? `#${loc}` : ''}`;
  }
</script>

<select class="work-switcher" value={work} on:change={go} aria-label="Choose a work">
  {#each WORKS as w}
    <option value={w.id}>{w.title}</option>
  {/each}
</select>
