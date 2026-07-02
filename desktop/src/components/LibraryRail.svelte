<script lang="ts">
  // The persistent left library rail: the whole corpus grouped traditionally,
  // everything collapsed except the open work (expanded to its books, the open
  // book expanded to its chapters). Quick-filter narrows by title — this is
  // tree filtering, deliberately NOT full-text search.
  import { CORPUS_GROUPS, dataId, type CorpusEntry } from '../lib/corpus';
  import { getWork, bookLabel, isBookless } from '../../../app/src/lib/works';
  import { fetchChapters, type ChapterRef } from '../../../app/src/lib/data';

  export let currentWork: string;          // data id (works.ts id)
  export let currentBook: number;
  export let onOpenWork: (id: string, book?: number) => void;
  export let onOpenChapter: (book: number, chapter: string) => void;

  let filter = '';

  // Chapters of the open work, for the expanded tree (keyed by book).
  let chapters: Record<string, ChapterRef[]> = {};
  let chaptersFor = '';
  $: if (currentWork && currentWork !== chaptersFor) {
    chaptersFor = currentWork;
    chapters = {};
    fetchChapters(currentWork).then(c => {
      if (chaptersFor === currentWork) chapters = c;
    }).catch(() => { chapters = {}; });
  }

  const matches = (e: CorpusEntry, q: string) => {
    const hay = `${e.title} ${e.work} ${e.siteSlug ?? ''}`.toLowerCase();
    return q.split(/\s+/).every(t => hay.includes(t));
  };
  $: q = filter.trim().toLowerCase();
  $: groups = CORPUS_GROUPS
    .map(g => ({ ...g, entries: q ? g.entries.filter(e => matches(e, q)) : g.entries }))
    .filter(g => g.entries.length > 0);

  const metaOf = (e: CorpusEntry) => getWork(dataId(e));
  const bookList = (e: CorpusEntry) => {
    const m = metaOf(e);
    if (!m || isBookless(m)) return [];
    return Array.from({ length: m.books }, (_, i) => i + 1);
  };
</script>

<nav class="rail" aria-label="Library">
  <div class="rail-filter">
    <input
      type="search"
      bind:value={filter}
      placeholder="Filter works…"
      aria-label="Filter the library by title"
      spellcheck="false"
    />
  </div>

  {#each groups as group}
    <div class="rail-group">
      <div class="rail-group-label">{group.label}</div>
      <ul>
        {#each group.entries as entry}
          {@const id = dataId(entry)}
          {@const live = entry.live && !!metaOf(entry)}
          {@const isOpen = live && id === currentWork}
          <li class:open={isOpen}>
            {#if live}
              <button
                class="rail-work"
                class:current={isOpen}
                on:click={() => onOpenWork(id)}
              >
                <span class="rail-title">{entry.title}</span>
                {#if entry.author && entry.author !== 'aristotle'}
                  <span class="rail-badge author">{entry.author}</span>
                {/if}
                {#if entry.authenticity && entry.authenticity !== 'genuine'}
                  <span class="rail-badge {entry.authenticity}">{entry.authenticity}</span>
                {/if}
              </button>
            {:else}
              <span class="rail-work planned" title="Not yet in the corpus">
                <span class="rail-title">{entry.title}</span>
                {#if entry.authenticity && entry.authenticity !== 'genuine'}
                  <span class="rail-badge {entry.authenticity}">{entry.authenticity}</span>
                {/if}
                <span class="rail-badge planned-badge">planned</span>
              </span>
            {/if}

            {#if isOpen}
              {@const meta = metaOf(entry)}
              {#if meta && bookList(entry).length > 0}
                <ul class="rail-books">
                  {#each bookList(entry) as b}
                    <li>
                      <button
                        class="rail-book"
                        class:current={b === currentBook}
                        on:click={() => onOpenWork(id, b)}
                      >Book {bookLabel(meta, b)}</button>
                      {#if b === currentBook && (chapters[String(b)]?.length ?? 0) > 1}
                        <ul class="rail-chapters">
                          {#each chapters[String(b)] as ch}
                            <li>
                              <button class="rail-chapter" on:click={() => onOpenChapter(b, ch.chapter)}>
                                <span>Ch. {ch.chapter}</span>
                                <span class="rail-bek">{ch.bekker}</span>
                              </button>
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {:else if (chapters['1']?.length ?? 0) > 1}
                <!-- bookless work: chapters hang directly off the work -->
                <ul class="rail-chapters top">
                  {#each chapters['1'] as ch}
                    <li>
                      <button class="rail-chapter" on:click={() => onOpenChapter(1, ch.chapter)}>
                        <span>Ch. {ch.chapter}</span>
                        <span class="rail-bek">{ch.bekker}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  .rail {
    font-family: var(--font-ui);
    font-size: 0.86rem;
    padding: 0.75rem 0.6rem 2rem;
  }
  .rail-filter { position: sticky; top: 0; padding: 0.25rem 0 0.6rem; background: inherit; z-index: 2; }
  .rail-filter input {
    width: 100%; box-sizing: border-box;
    font: inherit; color: var(--text);
    background: var(--col-bg);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 0.4rem 0.6rem;
  }
  .rail-filter input:focus { outline: none; border-color: var(--accent); }

  .rail-group { margin-bottom: 0.9rem; }
  .rail-group-label {
    font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-light);
    padding: 0.3rem 0.5rem 0.2rem;
  }
  ul { list-style: none; margin: 0; padding: 0; }

  .rail-work {
    display: flex; align-items: baseline; gap: 0.4em; width: 100%;
    text-align: left; font: inherit; color: var(--text);
    background: none; border: none; border-radius: 6px;
    padding: 0.32rem 0.5rem; cursor: pointer;
  }
  .rail-work:hover { background: var(--border); }
  .rail-work.current { color: var(--accent); font-weight: 600; }
  .rail-work.planned { color: var(--text-light); cursor: default; }
  .rail-title { flex: 0 1 auto; min-width: 0; }

  .rail-badge {
    flex: none; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.04em;
    padding: 0.05em 0.45em; border-radius: 999px;
    border: 1px solid var(--border); color: var(--text-mid);
  }
  .rail-badge.spurious { color: var(--error); border-color: var(--error); opacity: 0.75; }
  .rail-badge.author { font-style: italic; }

  .rail-books { margin: 0.1rem 0 0.3rem 0.9rem; border-left: 1px solid var(--border); }
  .rail-book {
    display: block; width: 100%; text-align: left; font: inherit;
    color: var(--text-mid); background: none; border: none; border-radius: 6px;
    padding: 0.22rem 0.5rem; cursor: pointer;
  }
  .rail-book:hover { background: var(--border); color: var(--text); }
  .rail-book.current { color: var(--accent); font-weight: 600; }

  .rail-chapters { margin: 0.05rem 0 0.35rem 0.9rem; border-left: 1px solid var(--border); }
  .rail-chapters.top { margin-left: 0.9rem; }
  .rail-chapter {
    display: flex; justify-content: space-between; gap: 0.6em; width: 100%;
    text-align: left; font: inherit; font-size: 0.8rem;
    color: var(--text-mid); background: none; border: none; border-radius: 6px;
    padding: 0.18rem 0.5rem; cursor: pointer;
  }
  .rail-chapter:hover { background: var(--border); color: var(--text); }
  .rail-bek { font-variant-numeric: tabular-nums; color: var(--text-light); }
</style>
