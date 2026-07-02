<script module lang="ts">
  // The rail's input shapes (App builds these from manifests + corpus).
  import type { WorkManifest } from '../lib/works/manifest';

  export interface RailBook {
    n: number;
    label: string;
    chapters: number[];
  }

  export interface RailWork {
    work: WorkManifest;
    status: 'ready' | 'absent';
    books: RailBook[];
  }

  export interface RailSelection {
    workId: string;
    book: number;
    chapter: number;
  }
</script>

<script lang="ts">
  // Library tree over ALL works from the manifests. A corpus-ready work
  // expands into its books/chapters (real chapter counts from chapters.json);
  // a work whose corpus isn't on this machine shows one quiet line instead —
  // no buttons, no jargon, nothing demanding attention. Selection is lifted
  // to App. The optional "Add work…" affordance at the bottom appears only
  // when the host passes onAddWork (Tauri only — the browser harness never
  // sees it).
  let {
    railWorks,
    selected,
    onSelect,
    onAddWork,
  }: {
    railWorks: RailWork[];
    selected: RailSelection | null;
    onSelect: (workId: string, book: number, chapter: number) => void;
    onAddWork?: () => void;
  } = $props();

  // Expanded books, keyed "workId:bookN". Start with the selected book open.
  let expanded = $state<Record<string, boolean>>(
    selected ? { [`${selected.workId}:${selected.book}`]: true } : {},
  );

  function toggleBook(workId: string, book: number) {
    const key = `${workId}:${book}`;
    expanded[key] = !expanded[key];
  }

  function isSelected(workId: string, book: number, chapter: number): boolean {
    return (
      selected?.workId === workId && selected?.book === book && selected?.chapter === chapter
    );
  }
</script>

<nav class="library" aria-label="Library">
  <div class="library-head">
    <span class="library-title">Library</span>
  </div>

  {#each railWorks as rw (rw.work.id)}
    <div class="work">
      <span class="work-title">{rw.work.title}</span>

      {#if rw.status === 'ready'}
        <ul class="books">
          {#each rw.books as book (book.n)}
            <li class="book">
              <button
                class="book-row"
                onclick={() => toggleBook(rw.work.id, book.n)}
                aria-expanded={!!expanded[`${rw.work.id}:${book.n}`]}
              >
                <svg
                  class="chevron"
                  class:open={expanded[`${rw.work.id}:${book.n}`]}
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
                <span class="book-label">Book {book.label}</span>
              </button>

              {#if expanded[`${rw.work.id}:${book.n}`]}
                <ul class="chapters">
                  {#each book.chapters as chapter (chapter)}
                    <li>
                      <button
                        class="chapter-row"
                        class:selected={isSelected(rw.work.id, book.n, chapter)}
                        onclick={() => onSelect(rw.work.id, book.n, chapter)}
                      >
                        Chapter {chapter}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="work-absent">Not on this Mac yet</p>
      {/if}
    </div>
  {/each}

  {#if onAddWork}
    <div class="rail-foot">
      <button class="add-work" onclick={onAddWork}>Add work…</button>
    </div>
  {/if}
</nav>

<style>
  .library {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding-bottom: var(--space-4);
  }

  .library-head {
    padding: var(--space-3) var(--space-4) var(--space-2);
  }
  .library-title {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-light);
  }

  .work {
    padding: 0 var(--space-2);
  }
  .work + .work {
    margin-top: var(--space-3);
  }
  /* Work titles in the reading serif — the library shelf reads as books,
     not as a settings tree. Books/chapters below stay in the UI face. */
  .work-title {
    display: block;
    font-family: var(--font-english);
    font-size: 1.02rem;
    font-weight: 600;
    letter-spacing: 0.005em;
    color: var(--text);
    padding: var(--space-2) var(--space-2) var(--space-1);
  }

  .work-absent {
    font-family: var(--font-english);
    font-size: 0.85rem;
    font-style: italic;
    color: var(--text-light);
    padding: 0 var(--space-2) var(--space-2) calc(var(--space-2) + 0.2rem);
  }

  .books {
    list-style: none;
    padding-left: var(--space-2);
  }

  .book-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-mid);
    background: transparent;
    border: none;
    border-radius: 5px;
    padding: 0.35rem var(--space-2);
    cursor: pointer;
  }
  .book-row:hover {
    background: var(--ui-hover);
    color: var(--text);
  }

  .chevron {
    flex: none;
    transition: transform 0.12s ease;
    color: var(--text-light);
  }
  .chevron.open {
    transform: rotate(90deg);
  }

  /* Chapters hang off a hairline guide aligned under the book chevron. */
  .chapters {
    list-style: none;
    margin-left: calc(var(--space-2) + 5px);
    padding-left: calc(var(--space-3) + 2px);
    border-left: 1px solid var(--border);
  }

  .chapter-row {
    display: block;
    width: 100%;
    text-align: left;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--text-mid);
    background: transparent;
    border: none;
    border-radius: 5px;
    padding: 0.28rem var(--space-2);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .chapter-row:hover {
    background: var(--ui-hover);
    color: var(--text);
  }
  .chapter-row.selected {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 500;
  }

  .rail-foot {
    margin-top: auto;
    padding: var(--space-4) var(--space-3) 0;
  }
  .add-work {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-light);
    background: transparent;
    border: none;
    border-radius: 5px;
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
  }
  .add-work:hover {
    color: var(--text);
    background: var(--ui-hover);
  }
</style>
