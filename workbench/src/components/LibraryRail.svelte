<script module lang="ts">
  // The rail's input shapes (App builds these from manifests + corpus).
  import type { WorkManifest } from '../lib/works/manifest';

  export interface RailChapterStatus {
    /** Not yet downloaded to this Mac (iCloud "Optimize Mac Storage" stub). */
    isPlaceholder: boolean;
    /** Conflicted-copy filenames shadowing this chapter (Drive/Dropbox/iCloud). */
    conflictCount: number;
  }

  export interface RailBook {
    n: number;
    label: string;
    chapters: number[];
    /** Chapter n → sync status; absent entries are ordinary chapters. */
    status?: Record<number, RailChapterStatus>;
  }

  export interface RailWork {
    work: WorkManifest;
    status: 'ready' | 'absent';
    books: RailBook[];
    /**
     * Corpus-free single-document work (D8: scheme.spineSource ===
     * 'document', v1 = one document) — renders as one "Open" row instead of
     * a book/chapter tree. App sets this from the scheme CAPABILITY.
     */
    singleDocument?: boolean;
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
    onNewDocument,
    onImportChapter,
    onImportReference,
  }: {
    railWorks: RailWork[];
    selected: RailSelection | null;
    onSelect: (workId: string, book: number, chapter: number) => void;
    onAddWork?: () => void;
    /** "New document…" — create a corpus-free document (D8 §6). Gated like
     * onImportChapter (Tauri or dev harness). */
    onNewDocument?: () => void;
    /** "Import chapter…" for a ready work (Tauri only — App gates the prop
     * the same way onAddWork is gated). Receives the work id so the dialog
     * can default its work picker to the one the user clicked from. */
    onImportChapter?: (workId: string) => void;
    /** "Import reference…" for a ready work — a private, local-only
     * reference translation (design doc D5 §5). Gated exactly like
     * onImportChapter (Tauri or dev harness). */
    onImportReference?: (workId: string) => void;
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
      <div class="work-head">
        <span class="work-title">{rw.work.title}</span>
        {#if rw.status === 'ready' && (onImportChapter || onImportReference)}
          <span class="work-actions">
            {#if onImportChapter}
              <button
                class="import-chapter"
                onclick={() => onImportChapter?.(rw.work.id)}
                title="Import a chapter file for {rw.work.title}"
              >
                Import chapter…
              </button>
            {/if}
            {#if onImportReference}
              <button
                class="import-chapter"
                onclick={() => onImportReference?.(rw.work.id)}
                title="Import a reference translation for {rw.work.title} (stays on this Mac)"
              >
                Import reference…
              </button>
            {/if}
          </span>
        {/if}
      </div>

      {#if rw.status === 'ready' && rw.singleDocument}
        <!-- Corpus-free document: no book/chapter tree, one quiet row. -->
        <ul class="chapters doc-row">
          <li>
            <button
              class="chapter-row"
              class:selected={isSelected(rw.work.id, 1, 1)}
              onclick={() => onSelect(rw.work.id, 1, 1)}
            >
              Document
            </button>
          </li>
        </ul>
      {:else if rw.status === 'ready'}
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
                    {@const status = book.status?.[chapter]}
                    <li>
                      {#if status?.isPlaceholder}
                        <span class="chapter-row placeholder" title="This chapter hasn't downloaded to this Mac yet — open the folder in Finder to download it.">
                          Chapter {chapter}
                          <span class="badge badge-placeholder">not downloaded</span>
                        </span>
                      {:else}
                        <button
                          class="chapter-row"
                          class:selected={isSelected(rw.work.id, book.n, chapter)}
                          onclick={() => onSelect(rw.work.id, book.n, chapter)}
                        >
                          Chapter {chapter}
                          {#if status?.conflictCount}
                            <span class="badge badge-conflict">conflicted copy</span>
                          {/if}
                        </button>
                      {/if}
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

  {#if onAddWork || onNewDocument}
    <div class="rail-foot">
      {#if onAddWork}
        <button class="add-work" onclick={onAddWork}>Add work…</button>
      {/if}
      {#if onNewDocument}
        <button class="add-work" onclick={onNewDocument}>New document…</button>
      {/if}
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
  .work-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
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

  /* The 260px rail can't fit two inline import affordances next to a work
     title — stack them, right-aligned, keeping each one quiet. */
  .work-actions {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  /* Quiet text-affordance, matching .add-work's understatement — importing
     is a secondary action next to the work's own chapter tree. */
  .import-chapter {
    flex: none;
    font-family: var(--font-ui);
    font-size: 0.7rem;
    color: var(--text-light);
    background: transparent;
    border: none;
    border-radius: 5px;
    padding: var(--space-1) var(--space-2);
    margin-right: var(--space-1);
    cursor: pointer;
    white-space: nowrap;
  }
  .import-chapter:hover {
    color: var(--accent);
    background: var(--ui-hover);
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

  /* A single-document work has no book level — its one row sits directly
     under the title, no hairline guide. */
  .doc-row {
    margin-left: var(--space-2);
    padding-left: var(--space-2);
    border-left: none;
  }

  /* Chapters hang off a hairline guide aligned under the book chevron. */
  .chapters {
    list-style: none;
    margin-left: calc(var(--space-2) + 5px);
    padding-left: calc(var(--space-3) + 2px);
    border-left: 1px solid var(--border);
  }

  .chapter-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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

  /* Not-yet-downloaded (iCloud placeholder stub): greyed, unclickable, no
     hover affordance — this is a <span>, not a <button>. */
  .chapter-row.placeholder {
    color: var(--text-light);
    font-style: italic;
    cursor: default;
  }

  .badge {
    flex: none;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }
  .badge-placeholder {
    color: var(--text-light);
    background: var(--ui-hover);
  }
  .badge-conflict {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
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
