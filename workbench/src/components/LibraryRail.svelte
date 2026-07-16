<script module lang="ts">
  // The rail's input shapes (App builds these from manifests + corpus).
  import type { WorkManifest } from '../lib/works/manifest';
  import type { OutlineItem } from '../lib/editor/outline';
  import { buildOutlineTree } from '../lib/editor/outline';

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
    outline = [],
    onOutlineSelect,
    onOutlineRename,
    onManageLevels,
    onSelect,
    onAddWork,
    onNewDocument,
    onImportChapter,
    onImportReference,
  }: {
    railWorks: RailWork[];
    selected: RailSelection | null;
    /** Heading outline of the OPEN document-spine work (D8 heading tools):
     * the table-of-contents shown under its "Document" row, each entry labeled
     * by the heading's translation. Empty for corpus works / untagged docs. */
    outline?: OutlineItem[];
    /** Jump the editor to a heading row (rail outline click). */
    onOutlineSelect?: (rowIndex: number) => void;
    /** Set a heading's rail title override (double-click rename; '' clears). */
    onOutlineRename?: (rowIndex: number, title: string) => void;
    /** Open the "Manage levels…" profile editor for a document work. */
    onManageLevels?: (workId: string) => void;
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

  // The flat outline, grouped into a nested Book › Chapter › heading tree by
  // the tiers' nav-roles (buildOutlineTree). Pure derivation of the prop.
  const outlineTree = $derived(buildOutlineTree(outline));

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

  // ── outline collapse (per open work) + inline rename ──────────────────────
  // Collapsed heading nodes, keyed `${workId}:${rowIndex}` so state never bleeds
  // across documents (no reset needed). Not persisted across sessions.
  let collapsedOutline = $state<Set<string>>(new Set());
  const collapseKey = (rowIndex: number) => `${selected?.workId ?? ''}:${rowIndex}`;
  function toggleOutline(rowIndex: number) {
    const key = collapseKey(rowIndex);
    const next = new Set(collapsedOutline);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    collapsedOutline = next;
  }

  let editingRow = $state<number | null>(null);
  let editValue = $state('');
  function startRename(rowIndex: number, current: string) {
    editingRow = rowIndex;
    editValue = current;
  }
  function commitRename(rowIndex: number) {
    if (editingRow !== rowIndex) return;
    editingRow = null;
    onOutlineRename?.(rowIndex, editValue.trim());
  }
  function cancelRename() {
    editingRow = null;
  }
  function onRenameKey(e: KeyboardEvent, rowIndex: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename(rowIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  }
  /** Focus + select the rename input the instant it mounts. */
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<!-- Recursive nav-tree of the open document's headings (D8): Book › Chapter ›
     heading, each node a jump-to button; children nest in their own <ul>. -->
{#snippet outlineNodes(nodes: import('../lib/editor/outline').OutlineNode[])}
  {#each nodes as node (node.item.rowIndex)}
    {@const ri = node.item.rowIndex}
    {@const hasChildren = node.children.length > 0}
    {@const isCollapsed = collapsedOutline.has(collapseKey(ri))}
    <li>
      <div class="outline-line">
        {#if hasChildren}
          <button
            class="outline-toggle"
            onclick={() => toggleOutline(ri)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              class="chevron"
              class:open={!isCollapsed}
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
          </button>
        {:else}
          <span class="outline-toggle-spacer" aria-hidden="true"></span>
        {/if}
        {#if editingRow === ri}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="outline-rename"
            type="text"
            bind:value={editValue}
            use:focusOnMount
            onkeydown={(e) => onRenameKey(e, ri)}
            onblur={() => commitRename(ri)}
          />
        {:else}
          <button
            class="chapter-row outline-row"
            class:outline-book={node.item.navRole === 'book'}
            class:outline-chapter={node.item.navRole === 'chapter'}
            class:outline-heading={node.item.navRole === 'heading'}
            title={`${node.item.label} — double-click to rename`}
            onclick={() => onOutlineSelect?.(ri)}
            ondblclick={() => startRename(ri, node.item.label)}
          >
            {node.item.label}
          </button>
        {/if}
      </div>
      {#if hasChildren && !isCollapsed}
        <ul class="outline-children">
          {@render outlineNodes(node.children)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

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
        <!-- Corpus-free document: no book/chapter tree, one quiet row, plus a
             heading outline (D8) for the OPEN doc, labeled by translations. -->
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
          {#if isSelected(rw.work.id, 1, 1) && outlineTree.length > 0}
            {@render outlineNodes(outlineTree)}
          {/if}
          {#if isSelected(rw.work.id, 1, 1) && onManageLevels}
            <li>
              <button class="manage-levels" onclick={() => onManageLevels?.(rw.work.id)}>
                Manage levels…
              </button>
            </li>
          {/if}
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

  /* Navigation tree (D8): Book › Chapter › heading, nested by nav-role. Indent
     comes from structural nesting (each .outline-children steps in), and the
     nav-role sets the weight/size — a Book reads bolder than a heading. Labels
     can be long translations, so clamp to one line with an ellipsis. */
  /* One outline row = [disclosure toggle | label], on a flex line so the
     chevron aligns and the label ellipsizes in the remaining space. */
  .outline-line {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .outline-toggle {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .outline-toggle:hover {
    background: var(--ui-hover);
  }
  /* Keeps leaf labels aligned with those that have a chevron. */
  .outline-toggle-spacer {
    flex: none;
    width: 16px;
    height: 16px;
  }
  .outline-row {
    flex: 1;
    min-width: 0;
    display: block;
    font-size: 0.8rem;
    color: var(--text-mid);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .outline-rename {
    flex: 1;
    min-width: 0;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--text);
    background: var(--surface, #fff);
    border: 1px solid var(--accent);
    border-radius: 5px;
    padding: 0.18rem var(--space-2);
    margin: 1px 0;
  }
  .outline-rename:focus {
    outline: none;
  }
  .outline-children {
    /* Each nesting level steps in from its parent. */
    padding-left: var(--space-3);
  }
  .outline-row.outline-book {
    font-weight: 600;
    color: var(--text-strong, var(--text-mid));
  }
  .outline-row.outline-chapter {
    font-weight: 500;
    color: var(--text-mid);
  }
  .outline-row.outline-heading {
    font-size: 0.76rem;
    color: var(--text-light);
  }
  .manage-levels {
    display: block;
    width: 100%;
    text-align: left;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    color: var(--text-light);
    background: none;
    border: none;
    padding: var(--space-1) var(--space-2);
    padding-left: var(--space-3);
    margin-top: 2px;
    cursor: pointer;
  }
  .manage-levels:hover {
    color: var(--accent);
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
