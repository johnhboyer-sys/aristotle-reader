<script module lang="ts">
  // The rail's input shapes (App builds these from manifests + corpus).
  import type { WorkManifest } from '../lib/works/manifest';
  import type { OutlineItem, OutlineNode } from '../lib/editor/outline';
  import { buildOutlineTree, groupOutlineByBooks } from '../lib/editor/outline';
  import type { BookContainer } from '../lib/works/bookContainers';
  import type { ChapterContainer } from '../lib/works/chapterContainers';
  import { chaptersInBook } from '../lib/works/chapterContainers';
  import { labelsSameBook } from '../lib/works/bookLetter';
  import type { NavRole } from '../lib/works/profile';
  import { groupWorksByAuthor } from '../lib/works/authorGroups';

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

  /** A chapter slot in a document-work Book container (D8 structure tools). */
  export interface RailContainerChapter {
    n: number;
    label: string;
    /** True once an import has written this slot's file; false = an empty slot. */
    filled: boolean;
  }

  /** A Book container in a document work — named, with named chapter slots. */
  export interface RailContainerBook {
    n: number;
    label: string;
    chapters: RailContainerChapter[];
  }

  export interface RailWork {
    work: WorkManifest;
    status: 'ready' | 'absent';
    books: RailBook[];
    /**
     * Corpus-free single-document work (D8: scheme.spineSource ===
     * 'document') with NO explicit containers — renders as one "Document" row
     * instead of a book/chapter tree. App sets this from the scheme CAPABILITY.
     */
    singleDocument?: boolean;
    /**
     * Corpus-free document with explicit Book/Chapter containers (D8 structure
     * tools) — renders a named Book › Chapter tree with empty-slot indicators.
     */
    container?: boolean;
    containerBooks?: RailContainerBook[];
    /** Chapter boundaries for a document work (works/chapterContainers). */
    chapterContainers?: ChapterContainer[];
    /**
     * Corpus-free document (marker-driven, D8): the lines marked in the text
     * ARE the Books & Chapters. The rail renders the live heading outline as
     * the navigation; clicking a node scrolls the editor there.
     */
    document?: boolean;
    /**
     * Saved Book CONTAINERS for a document work — boundaries over the outline,
     * never text. Empty = the rail renders the flat outline exactly as before.
     */
    bookContainers?: BookContainer[];
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
    levels = [],
    bookContainers = [],
    chapterContainers = [],
    onOutlineSelect,
    onOutlineRename,
    onOutlineSetLevel,
    onManageLevels,
    onWorkDetails,
    onWorkRemove,
    onDivide,
    onAddBookContainer,
    onAddBookContainerAfter,
    onRenameBookContainer,
    onRemoveBookContainer,
    onSetBookStart,
    onSelect,
    onAddWork,
    onNewDocument,
    onImportSource,
    onImportChapter,
    onImportReference,
  }: {
    railWorks: RailWork[];
    selected: RailSelection | null;
    /** Heading outline of the OPEN document-spine work (D8 heading tools):
     * the table-of-contents shown under its "Document" row, each entry labeled
     * by the heading's translation. Empty for corpus works / untagged docs. */
    outline?: OutlineItem[];
    /** The open document work's profile tiers, in order — labels the rail's
     * right-click "Mark as" menu (index + 1 = the level a row would carry).
     * The navRole rides along so Book tiers can be withheld: a Book is a
     * container now, and marking a row as one would write into the document. */
    levels?: { name: string; navRole?: NavRole }[];
    /** The open document work's saved Book containers, in document order.
     * Empty = no Books, and the outline renders flat (no visual change). */
    bookContainers?: BookContainer[];
    /** Chapter boundaries at rows (works/chapterContainers) — an imported work
     * gets these from the divisions table. Navigation only: clicking one jumps
     * the editor to that row, and no row is marked. */
    chapterContainers?: ChapterContainer[];
    /** Jump the editor to a heading row (rail outline click). */
    onOutlineSelect?: (rowIndex: number) => void;
    /** Set a heading's rail title override (double-click rename; '' clears). */
    onOutlineRename?: (rowIndex: number, title: string) => void;
    /** Re-tier (or clear) a heading from the rail right-click menu. */
    onOutlineSetLevel?: (rowIndex: number, level: number | null) => void;
    /** Open the "Manage levels…" profile editor for a document work. */
    onManageLevels?: (workId: string) => void;
    /** Open the work-details editor for a document work. */
    onWorkDetails?: (workId: string) => void;
    /** Remove a document work — its files and its registry entry. Offered
     * only for works the app itself owns (documents and imports); a corpus
     * work has no rail menu at all. */
    onWorkRemove?: (workId: string) => void;
    /** "Divide into chapters…" — split the open single document at its
     * Book/Chapter markers into one file per chapter (bulk shortcut). */
    onDivide?: (workId: string) => void;
    /** "+ Book" — create an empty Book CONTAINER. Inserts no text anywhere. */
    onAddBookContainer?: () => void;
    /** "Add Book after" from a Book's right-click menu (0-based index). */
    onAddBookContainerAfter?: (index: number) => void;
    /** Rename a Book container (inline rename on the Book row). */
    onRenameBookContainer?: (index: number, label: string) => void;
    /** Remove a Book container. Its chapters regroup; no text is touched. */
    onRemoveBookContainer?: (index: number) => void;
    /** Move a Book's boundary to a 1-based outline ROOT ordinal. */
    onSetBookStart?: (index: number, rootOrdinal: number) => void;
    onSelect: (workId: string, book: number, chapter: number) => void;
    onAddWork?: () => void;
    /** "New document…" — create a corpus-free document (D8 §6). Gated like
     * onImportChapter (Tauri or dev harness). */
    onNewDocument?: () => void;
    /** "Import a text…" — bring in any author from a TLG/PHI disc or from
     * Perseus, keeping the source's own citations. Tauri only: every route
     * reads a file, a disc, or the network. */
    onImportSource?: () => void;
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

  // Book containers partition the ROOT nodes of that tree. With none saved the
  // grouping is empty and the flat tree renders exactly as it always has.
  const outlineBooks = $derived(groupOutlineByBooks(outlineTree, bookContainers));

  /**
   * The row each rendered Book begins at (1-based), so a chapter boundary can
   * be placed in the Book that owns it. A Book's first outline root IS its
   * first row; a Book with no roots inherits the boundary of the one before it.
   */
  const bookStartRows = $derived.by(() => {
    const rows: number[] = [];
    for (const book of outlineBooks) {
      const first = book.nodes[0]?.item.rowIndex;
      rows.push(first === undefined ? (rows[rows.length - 1] ?? 1) : first + 1);
    }
    return rows;
  });

  /**
   * A Book's outline nodes, minus the printed title line the Book was named
   * after. "Book Α" over "ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α" says one thing twice; the Book
   * row is the one that stays, because it is the one that groups.
   *
   * Only the FIRST node, and only when the letters agree — a Book called
   * "Prima Pars" hides nothing, and a title line the user marked themselves
   * inside a book keeps its place.
   */
  function nodesUnderBook(book: { label: string; nodes: OutlineNode[] }): OutlineNode[] {
    const first = book.nodes[0];
    return first && first.children.length === 0 && labelsSameBook(book.label, first.item.label)
      ? book.nodes.slice(1)
      : book.nodes;
  }

  /** The chapters of the Book at `index`, by row span. */
  function chaptersOfBook(index: number): ChapterContainer[] {
    if (chapterContainers.length === 0) return [];
    const start = bookStartRows[index] ?? 1;
    const next = index + 1 < bookStartRows.length ? bookStartRows[index + 1] : null;
    return chaptersInBook(chapterContainers, start, next);
  }


  // The tiers a row can be MARKED as, keeping each tier's 1-based level. Book
  // tiers are withheld: a Book is a container the rail creates with "+ Book",
  // and marking a row as one would write heading metadata into the chapter
  // file — the text-mutating path this redesign exists to remove. A legacy
  // Book-marked row still renders and can still be re-tiered or removed.
  const markableLevels = $derived(
    levels.flatMap((lvl, i) => (lvl.navRole === 'book' ? [] : [{ ...lvl, level: i + 1 }])),
  );

  // rowIndex → 1-based root ordinal. Book boundaries are expressed in root
  // ordinals, so the right-click menu needs this to offer "Begin a book here"
  // on a root node (and to stay silent on a nested heading, which is no
  // boundary the model can express).
  //
  // Only a Book- or Chapter-marked root is offered. A heading can be a root too
  // (a heading mark before the document's first Chapter has nothing to nest
  // under), but the export never cuts the text at a heading — so a Book that
  // began there would show one grouping in this rail and compile to another.
  // The boundary has to be a place the document can actually be divided.
  const rootOrdinalByRow = $derived(
    new Map(
      outlineTree.flatMap((node, i) =>
        node.item.navRole === 'book' || node.item.navRole === 'chapter'
          ? [[node.item.rowIndex, i + 1] as const]
          : [],
      ),
    ),
  );

  // Works grouped under their author (#19). A library where nobody set an
  // author is one unlabeled group, i.e. exactly the flat list it was.
  const authorGroups = $derived(groupWorksByAuthor(railWorks.map((rw) => ({ ...rw, author: rw.work.author }))));

  // Works the user has folded away (#18). Open by default: a library only
  // needs collapsing once it has grown, and that is the user's call to make.
  let collapsedWorks = $state<Set<string>>(new Set());

  function toggleWork(workId: string) {
    const next = new Set(collapsedWorks);
    if (!next.delete(workId)) next.add(workId);
    collapsedWorks = next;
  }

  // Expanded books, keyed "workId:bookN". Start with the selected book open.
  let expanded = $state<Record<string, boolean>>(
    selected ? { [`${selected.workId}:${selected.book}`]: true } : {},
  );

  function toggleBook(workId: string, book: number) {
    const key = `${workId}:${book}`;
    expanded[key] = !expanded[key];
  }

  // Keep the selected book open — so landing on a chapter (e.g. just after an
  // import creates and selects a slot) reveals it without a
  // manual expand. Runs only when the selection itself changes (it reads
  // `selected`, not `expanded`), so it never fights a manual collapse of
  // another book.
  $effect(() => {
    if (selected) expanded[`${selected.workId}:${selected.book}`] = true;
  });

  // A work that is opened unfolds itself — otherwise selecting a chapter (an
  // import, say) would leave the rail looking as if nothing had happened.
  //
  // Only when the SELECTION changes, which is what `lastOpened` is for: the
  // effect reads collapsedWorks, so without the guard the user's own fold of
  // the open work re-ran it and unfolded the work again — the work you are
  // reading was the one work that could not be folded.
  let lastOpened: string | null = null;
  $effect(() => {
    const workId = selected?.workId ?? null;
    if (workId === lastOpened) return;
    lastOpened = workId;
    if (workId && collapsedWorks.has(workId)) {
      const next = new Set(collapsedWorks);
      next.delete(workId);
      collapsedWorks = next;
    }
  });

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

  // ── rail right-click menu: make a line a Book/Chapter/heading, rename, remove ─
  const RAIL_MENU_W = 230;
  const RAIL_MENU_MARGIN = 8;
  let railMenu = $state<{ rowIndex: number; level: number; label: string; rootOrdinal: number; x: number; y: number; maxHeight: number } | null>(null);
  let workMenu = $state<{
    workId: string;
    title: string;
    x: number;
    y: number;
    maxHeight: number;
    /** Second step of "Remove work…": the menu asks before anything is deleted. */
    confirmingRemove: boolean;
  } | null>(null);
  /** Clamp a menu to the viewport (shared by the heading and Book menus). */
  function menuAt(e: MouseEvent): { x: number; y: number; maxHeight: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.max(RAIL_MENU_MARGIN, Math.min(e.clientX, vw - RAIL_MENU_W - RAIL_MENU_MARGIN));
    const y = Math.max(RAIL_MENU_MARGIN, Math.min(e.clientY, vh - 120));
    return { x, y, maxHeight: Math.max(140, vh - y - RAIL_MENU_MARGIN) };
  }
  function openRailMenu(e: MouseEvent, rowIndex: number, level: number, label: string) {
    e.preventDefault();
    if (!onOutlineSetLevel || levels.length === 0) return;
    workMenu = null;
    bookMenu = null;
    railMenu = {
      rowIndex,
      level,
      label,
      // 0 = not a root node: only a root can begin a Book, because boundaries
      // are ordinals into the root list.
      rootOrdinal: rootOrdinalByRow.get(rowIndex) ?? 0,
      ...menuAt(e),
    };
  }
  function railMenuSetBookStart(bookIndex: number) {
    if (railMenu && railMenu.rootOrdinal > 0) onSetBookStart?.(bookIndex, railMenu.rootOrdinal);
    railMenu = null;
  }
  function railMenuPick(level: number | null) {
    if (railMenu) onOutlineSetLevel?.(railMenu.rowIndex, level);
    railMenu = null;
  }
  function railMenuRename() {
    if (!railMenu) return;
    const { rowIndex, label } = railMenu;
    railMenu = null;
    startRename(rowIndex, label); // reuses the inline rename input (no click-to-open race)
  }
  function onRailMenuKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      railMenu = null;
      bookMenu = null;
      workMenu = null;
    }
  }

  function openWorkMenu(e: MouseEvent, workId: string, title: string) {
    e.preventDefault();
    if (!onWorkDetails) return;
    railMenu = null;
    bookMenu = null;
    workMenu = { workId, title, ...menuAt(e), confirmingRemove: false };
  }

  function workMenuDetails() {
    if (!workMenu) return;
    const { workId } = workMenu;
    workMenu = null;
    onWorkDetails?.(workId);
  }

  function workMenuRemove() {
    if (!workMenu) return;
    const { workId } = workMenu;
    workMenu = null;
    onWorkRemove?.(workId);
  }

  // ── Book containers: expand key, inline rename, right-click menu ───────────
  // A Book is a boundary, not a row, so every action here is a pure container
  // edit — nothing below ever inserts, moves, or deletes translation text.
  const bookKey = (index: number) => `${selected?.workId ?? ''}:book:${index}`;
  /** Books start OPEN: they are the document's navigation, not a drawer. */
  const bookOpen = (index: number) => expanded[bookKey(index)] !== false;
  function toggleContainerBook(index: number) {
    expanded[bookKey(index)] = !bookOpen(index);
  }

  // Kept separate from editingRow so a Book and a heading can never both be
  // editing (the two rename inputs live in different lists).
  let editingBook = $state<number | null>(null);
  let bookEditValue = $state('');
  function startBookRename(index: number, current: string) {
    editingRow = null;
    editingBook = index;
    bookEditValue = current;
  }
  function commitBookRename(index: number) {
    if (editingBook !== index) return;
    editingBook = null;
    onRenameBookContainer?.(index, bookEditValue.trim());
  }
  function onBookRenameKey(e: KeyboardEvent, index: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitBookRename(index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editingBook = null;
    }
  }

  let bookMenu = $state<{ index: number; label: string; x: number; y: number; maxHeight: number } | null>(null);
  function openBookMenu(e: MouseEvent, index: number, label: string) {
    e.preventDefault();
    railMenu = null;
    workMenu = null;
    bookMenu = { index, label, ...menuAt(e) };
  }
  function bookMenuRename() {
    if (!bookMenu) return;
    const { index, label } = bookMenu;
    bookMenu = null;
    startBookRename(index, label);
  }
</script>

<svelte:window onkeydown={onRailMenuKey} />

{#if railMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="rail-menu-backdrop"
    onclick={() => (railMenu = null)}
    oncontextmenu={(e) => {
      e.preventDefault();
      railMenu = null;
    }}
  ></div>
  <div
    class="rail-menu"
    role="menu"
    style={`left:${railMenu.x}px; top:${railMenu.y}px; max-height:${railMenu.maxHeight}px;`}
  >
    <div class="rail-menu-label">Make this a…</div>
    {#each markableLevels as lvl (lvl.level)}
      {@const i = lvl.level - 1}
      <button
        class="rail-menu-item"
        role="menuitemradio"
        aria-checked={railMenu.level === i + 1}
        onclick={() => railMenuPick(i + 1)}
      >
        <span class="rail-menu-check" aria-hidden="true">{railMenu.level === i + 1 ? '✓' : ''}</span>{lvl.name}
      </button>
    {/each}
    <div class="rail-menu-sep" aria-hidden="true"></div>
    <button class="rail-menu-item" role="menuitem" onclick={railMenuRename}>
      <span class="rail-menu-check" aria-hidden="true"></span>Rename…
    </button>
    <button class="rail-menu-item" role="menuitem" onclick={() => railMenuPick(null)}>
      <span class="rail-menu-check" aria-hidden="true"></span>Remove from outline
    </button>
    {#if outlineBooks.length > 1 && railMenu.rootOrdinal > 0}
      <!-- Moving a Book's boundary here is how chapters "move into" a Book:
           the Book simply begins at this chapter. No text moves. The FIRST Book
           is never offered — it always begins at the top of the document, so
           picking it could only be a no-op. -->
      <div class="rail-menu-sep" aria-hidden="true"></div>
      <div class="rail-menu-label">Begin a book here…</div>
      {#each outlineBooks.slice(1) as bk (bk.index)}
        <button class="rail-menu-item" role="menuitem" onclick={() => railMenuSetBookStart(bk.index)}>
          <span class="rail-menu-check" aria-hidden="true"></span>{bk.label}
        </button>
      {/each}
    {/if}
  </div>
{/if}

{#if bookMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="rail-menu-backdrop"
    onclick={() => (bookMenu = null)}
    oncontextmenu={(e) => {
      e.preventDefault();
      bookMenu = null;
    }}
  ></div>
  <div
    class="rail-menu"
    role="menu"
    style={`left:${bookMenu.x}px; top:${bookMenu.y}px; max-height:${bookMenu.maxHeight}px;`}
  >
    <div class="rail-menu-label">{bookMenu.label}</div>
    <button class="rail-menu-item" role="menuitem" onclick={bookMenuRename}>
      <span class="rail-menu-check" aria-hidden="true"></span>Rename…
    </button>
    <button
      class="rail-menu-item"
      role="menuitem"
      onclick={() => {
        const index = bookMenu?.index ?? 0;
        bookMenu = null;
        onAddBookContainerAfter?.(index);
      }}
    >
      <span class="rail-menu-check" aria-hidden="true"></span>Add Book after
    </button>
    <div class="rail-menu-sep" aria-hidden="true"></div>
    <button
      class="rail-menu-item"
      role="menuitem"
      onclick={() => {
        const index = bookMenu?.index ?? 0;
        bookMenu = null;
        onRemoveBookContainer?.(index);
      }}
    >
      <span class="rail-menu-check" aria-hidden="true"></span>Remove Book (chapters stay)
    </button>
  </div>
{/if}

{#if workMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="rail-menu-backdrop"
    onclick={() => (workMenu = null)}
    oncontextmenu={(e) => {
      e.preventDefault();
      workMenu = null;
    }}
  ></div>
  <div
    class="rail-menu"
    role="menu"
    style={`left:${workMenu.x}px; top:${workMenu.y}px; max-height:${workMenu.maxHeight}px;`}
  >
    <div class="rail-menu-label">{workMenu.title}</div>
    {#if workMenu.confirmingRemove}
      <!-- The whole work goes: its text, its translation, and every chapter
           file under it. Asked here rather than in a dialog so the answer is
           one click away from the question. -->
      <div class="rail-menu-warning">Remove this work and everything translated in it?</div>
      <button class="rail-menu-item" role="menuitem" onclick={() => (workMenu = null)}>
        <span class="rail-menu-check" aria-hidden="true"></span>Keep it
      </button>
      <button class="rail-menu-item" role="menuitem" onclick={workMenuRemove}>
        <span class="rail-menu-check" aria-hidden="true"></span>Remove it
      </button>
    {:else}
      <button class="rail-menu-item" role="menuitem" onclick={workMenuDetails}>
        <span class="rail-menu-check" aria-hidden="true"></span>Work details…
      </button>
      {#if onWorkRemove}
        <div class="rail-menu-sep" aria-hidden="true"></div>
        <button
          class="rail-menu-item"
          role="menuitem"
          onclick={() => {
            if (workMenu) workMenu = { ...workMenu, confirmingRemove: true };
          }}
        >
          <span class="rail-menu-check" aria-hidden="true"></span>Remove work…
        </button>
      {/if}
    {/if}
  </div>
{/if}

<!-- Recursive nav-tree of the open document's headings (D8): Book › Chapter ›
     heading, each node a jump-to button; children nest in their own <ul>. -->
<!-- Chapter boundaries: labels at rows, not marks. Clicking one jumps the
     editor to that row; nothing in the text is a title because of it. -->
{#snippet chapterRows(chapters: ChapterContainer[])}
  {#each chapters as chapter (chapter.row)}
    <li>
      <button
        class="chapter-row outline-row outline-chapter"
        title={`${chapter.label} — jump to it`}
        onclick={() => onOutlineSelect?.(chapter.row - 1)}
      >{chapter.label}</button>
    </li>
  {/each}
{/snippet}

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
            title={`${node.item.label} — right-click to make it a Book/Chapter, rename, or remove`}
            onclick={() => onOutlineSelect?.(ri)}
            ondblclick={() => startRename(ri, node.item.label)}
            oncontextmenu={(e) => openRailMenu(e, ri, node.item.level, node.item.label)}
          >
            {node.item.label}
          </button>
        {/if}
      </div>
      {#if node.subtitle}
        <button
          class="outline-subtitle"
          title={node.subtitle.label}
          onclick={() => onOutlineSelect?.(node.subtitle.rowIndex)}
        >{node.subtitle.label}</button>
      {/if}
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

  {#each authorGroups as group (group.author)}
    {#if group.author}
      <div class="author-head">{group.author}</div>
    {/if}
    {#each group.works as rw (rw.work.id)}
    {@const folded = collapsedWorks.has(rw.work.id)}
    <div class="work">
      <div class="work-head">
        <span class="work-name">
        <button
          class="work-toggle"
          onclick={() => toggleWork(rw.work.id)}
          aria-expanded={!folded}
          aria-label={folded ? `Expand ${rw.work.title}` : `Collapse ${rw.work.title}`}
        >
          <svg
            class="chevron"
            class:open={!folded}
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
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="work-title"
          title={rw.document && onWorkDetails
            ? `${rw.work.title} — right-click for work details`
            : undefined}
          oncontextmenu={rw.document && onWorkDetails
            ? (e) => openWorkMenu(e, rw.work.id, rw.work.title)
            : undefined}
        >{rw.work.title}</span>
        </span>
        {#if !folded && rw.status === 'ready' && (onImportChapter || onImportReference)}
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

      {#if folded}
        <!-- Folded: the work's own row stays, everything under it waits. -->
      {:else if rw.status === 'ready' && rw.document}
        <!-- Corpus-free document (marker-driven, D8): the lines you mark in the
             text ARE the Books & Chapters. The rail mirrors the live outline —
             click a node to jump there; right-click to make it a Chapter,
             rename, or remove. "+ Book" adds a CONTAINER over those chapters —
             it never writes a line into the text. -->
        <ul class="chapters doc-nav">
          {#if !isSelected(rw.work.id, 1, 1)}
            <li>
              <button class="chapter-row doc-open" onclick={() => onSelect(rw.work.id, 1, 1)}>
                Open
              </button>
            </li>
          {:else}
            {#if outlineBooks.length > 0}
              <!-- Books are CONTAINERS: boundaries over the same outline nodes,
                   rendered by the same snippet. Nothing here is a text row. -->
              {#each outlineBooks as bk (bk.index)}
                <li class="book">
                  {#if editingBook === bk.index}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      class="outline-rename"
                      type="text"
                      bind:value={bookEditValue}
                      use:focusOnMount
                      onkeydown={(e) => onBookRenameKey(e, bk.index)}
                      onblur={() => commitBookRename(bk.index)}
                    />
                  {:else}
                    <button
                      class="book-row"
                      onclick={() => toggleContainerBook(bk.index)}
                      oncontextmenu={(e) => openBookMenu(e, bk.index, bk.label)}
                      aria-expanded={bookOpen(bk.index)}
                      title={`${bk.label} — right-click to rename, add a Book after, or remove it`}
                    >
                      <svg
                        class="chevron"
                        class:open={bookOpen(bk.index)}
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
                      <span class="book-label">{bk.label}</span>
                    </button>
                  {/if}
                  {#if bookOpen(bk.index)}
                    {@const bookChapters = chaptersOfBook(bk.index)}
                    {@const bookNodes = nodesUnderBook(bk)}
                    <ul class="outline-children">
                      {#if bookNodes.length > 0}
                        {@render outlineNodes(bookNodes)}
                      {/if}
                      {#if bookChapters.length > 0}
                        {@render chapterRows(bookChapters)}
                      {/if}
                      {#if bk.nodes.length === 0 && bookChapters.length === 0}
                        <li>
                          {#if bk.index === 0}
                            <!-- The first Book always begins at the top, so it can
                                 only be empty because the NEXT Book starts there
                                 too — that is the boundary to move. -->
                            <p class="doc-hint">No chapters yet — right-click the chapter where the next Book should begin and choose “Begin a book here…”.</p>
                          {:else}
                            <p class="doc-hint">No chapters yet — right-click a chapter and choose “Begin a book here…”, then “{bk.label}”.</p>
                          {/if}
                        </li>
                      {/if}
                    </ul>
                  {/if}
                </li>
              {/each}
            {:else if outlineTree.length > 0 || chapterContainers.length > 0}
              {#if outlineTree.length > 0}
                {@render outlineNodes(outlineTree)}
              {/if}
              {#if chapterContainers.length > 0}
                {@render chapterRows(chapterContainers)}
              {/if}
            {:else}
              <li>
                <p class="doc-hint">No Chapter marks yet. Right-click a line in the text to mark one — it becomes a chapter here.</p>
              </li>
            {/if}
            <li class="doc-controls">
              {#if onAddBookContainer}
                <button class="add-slot" title="Add a Book — a container over the chapters; it writes no text" onclick={() => onAddBookContainer?.()}>+ Book</button>
              {/if}
              {#if onManageLevels}
                <button class="manage-levels" onclick={() => onManageLevels?.(rw.work.id)}>Manage levels…</button>
              {/if}
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
  {/each}

  {#if onAddWork || onNewDocument || onImportSource}
    <div class="rail-foot">
      {#if onAddWork}
        <button class="add-work" onclick={onAddWork}>Add work…</button>
      {/if}
      {#if onNewDocument}
        <button class="add-work" onclick={onNewDocument}>New document…</button>
      {/if}
      {#if onImportSource}
        <button class="add-work" onclick={onImportSource}>Import a text…</button>
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

  /* Marker-driven document nav: the outline tree IS the navigation, sitting
     directly under the work title. A document work has no book/chapter file
     level — the marks in the text provide the hierarchy. */
  .doc-nav {
    margin-left: var(--space-2);
    padding-left: var(--space-2);
    border-left: none;
  }
  .doc-open {
    font-style: italic;
    color: var(--text-light);
  }
  .doc-hint {
    margin: var(--space-1) var(--space-2) var(--space-2);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--text-light);
  }
  .doc-controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
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
    /* Each nesting level steps in from its parent. The reset is not
       inherited here: the browser's own `ul ul` rule applies directly to a
       nested list and puts a hollow bullet back. */
    list-style: none;
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
  /* A 'subtitle' tier (e.g. an Article's "Utrum…" title): shown UNDER its parent
     heading, indented to align under the label, not nested as a child row. */
  .outline-subtitle {
    display: block;
    width: 100%;
    margin: 0 0 1px calc(16px + var(--space-2, 6px));
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-style: italic;
    color: var(--text-light);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .outline-subtitle:hover {
    color: var(--text-mid);
  }
  /* Rail right-click "Mark as" menu (re-tier a heading from the sidebar). */
  .rail-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
  }
  .rail-menu {
    position: fixed;
    z-index: 61;
    min-width: 180px;
    max-width: 210px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px;
    background: var(--surface, #fff);
    border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
    font-family: var(--font-ui);
  }
  /* The one destructive question the rail asks: it wraps, unlike a menu item,
     because it is a sentence and not a label. */
  /* An author's name over their works — a label for a run of the list, so it
     reads like the "Library" head above it rather than like a work. */
  .author-head {
    padding: 10px 8px 2px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-light);
  }
  /* Fold control and title travel together, so the work's actions still sit
     at the far edge of the row. */
  .work-name {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
  }
  .work-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-light);
    cursor: pointer;
  }
  .rail-menu-warning {
    padding: 4px 8px 6px;
    max-width: 15rem;
    font-size: 0.78rem;
    line-height: 1.3;
    color: var(--text-mid);
  }
  .rail-menu-label {
    padding: 4px 8px 2px;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-light);
  }
  .rail-menu-item {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    background: none;
    text-align: left;
    font-family: inherit;
    font-size: 0.8rem;
    color: var(--text-mid);
    cursor: pointer;
    border-radius: 5px;
  }
  .rail-menu-item:hover {
    background: var(--hover, rgba(0, 0, 0, 0.06));
    color: var(--text-strong, var(--text-mid));
  }
  .rail-menu-check {
    display: inline-block;
    width: 0.9em;
    flex: none;
    color: var(--accent);
  }
  .rail-menu-sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border, rgba(0, 0, 0, 0.1));
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
  /* "+ Book" add-a-container affordance (doc-controls). */
  .add-slot {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-light);
    background: transparent;
    border: none;
    border-radius: 5px;
    padding: 0.28rem var(--space-2);
    cursor: pointer;
  }
  .add-slot:hover {
    color: var(--accent);
    background: var(--ui-hover);
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
