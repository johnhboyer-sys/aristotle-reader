<script module lang="ts">
  // What a RowEditor needs from the chapter — kept minimal so the row side
  // can later become mount-on-focus without touching this contract.
  export interface RowViewHost {
    createView(index: number, el: HTMLElement): void;
    destroyView(index: number): void;
  }
</script>

<script lang="ts">
  // ChapterEditor — owns the ChapterModel, the app-level undo stack, focus
  // state and the commit-on-idle cycle (design doc D1). One flat CSS grid for
  // the whole chapter: each row's three cells (Greek, gutter, English) are
  // siblings on the same explicit row track, so track height = max(Greek,
  // English) with zero JS.
  //
  // Persistence (this is user data — nothing typed may ever be silently
  // lost): on open the chapter hydrates from its saved chapter file when one
  // exists (the FILE is canonical; see lib/library/autosave.ts); every model
  // commit schedules a debounced autosave; chapter switch, window blur and
  // visibilitychange→hidden flush immediately. The saved file is written
  // through the pinned libraryStorage() contract.
  import { onMount, tick } from 'svelte';
  import { EditorState, TextSelection } from '@tiptap/pm/state';
  import type { Transaction } from '@tiptap/pm/state';
  import { EditorView } from '@tiptap/pm/view';
  import type { Node as PMNode } from '@tiptap/pm/model';
  import { toggleMark } from '@tiptap/pm/commands';

  import type { FixtureChapter } from '../../dev/fixture-meta-z17';
  import { modelFromFixture, nextFootnoteId, cloneFootnotes, displayNumbers } from './model';
  import type { ChapterModel } from './model';
  import { rowSchema, docFromJSON, markerIdsIn } from './schema';
  import { serializeRow, assertRoundTrip, buildRowDoc, runsOf, orphanFnRefIds } from './serialize';
  import type { InlineRun } from './serialize';
  import { AppHistory } from './history';
  import type { SelRef, UndoEntry } from './history';
  import { rowPlugins, isTypingTransaction } from './plugins/rowKeymap';
  import type { RowContext } from './plugins/rowKeymap';
  import { greekInput, resetGreekRun } from './plugins/greekInput';
  import { footnotePlugin, FN_REFRESH } from './plugins/footnote';
  import { session, registerEditor, unregisterEditor, setStatus } from './session.svelte';
  import type { EditorCommands, FootnoteCommands, FootnoteListEntry, SyncCommands } from './session.svelte';
  import { hasChanged, decideReload, snapshotOf } from '../library/sync';
  import type { FileSnapshot } from '../library/sync';
  import { parseChapterFile } from '../chapterfile';
  import { buildCitationClipboardText } from './copyCitation';
  import type { CitationRowInput } from './copyCitation';
  import { getScheme } from '../citation/registry';
  import type { WorkMeta } from '../citation/types';
  import { isTauri } from '../runtime';
  import { libraryStorage, chapterFileName } from '../library/storage';
  import {
    createAutosave,
    loadChapterFile,
    hydrateFromFile,
    serializeModel,
    spansFromModel,
    anchoredFootnoteCount,
  } from '../library/autosave';
  import type { AutosaveHandle, ChapterSpans, SaveState } from '../library/autosave';
  import {
    loadFootnoteIndex,
    precedingFootnoteCount,
    updateFootnoteCount,
    onFootnoteIndexChange,
  } from '../library/footnoteIndex';
  import type { BookOrder } from '../library/footnoteIndex';
  import { getWork } from '../works/manifest';
  import GreekCell from './GreekCell.svelte';
  import RowGutter from './RowGutter.svelte';
  import EnglishCell from './EnglishCell.svelte';
  import './editor.css';

  let { fixture }: { fixture: FixtureChapter } = $props();

  // ── model + non-reactive machinery ─────────────────────────────────────
  const model: ChapterModel = modelFromFixture(fixture);
  const history = new AppHistory();
  const storage = libraryStorage();
  const fileName = chapterFileName(fixture.book, fixture.chapter);
  let views: (EditorView | null)[] = []; // sized once the model is hydrated

  let rootEl = $state<HTMLDivElement>(); // the scroll container
  let gridEl = $state<HTMLDivElement>();

  let focusedRow = -1; // last row that held focus (toolbar targets it)
  let savedX: number | null = null; // goal column for cross-row Arrow moves
  let activeFn: string | null = null;
  let fnDisplay = new Map<string, number>(); // chapter-local order (1-based)
  let fnBase = 0; // work-wide offset: footnotes in all preceding chapters
  let pendingFn: { before: ReturnType<typeof cloneFootnotes>; after: ReturnType<typeof cloneFootnotes> } | null = null;
  const commitTimers = new Map<number, ReturnType<typeof setTimeout>>();

  let autosave: AutosaveHandle | null = null;
  let spans: ChapterSpans = spansFromModel(model);
  let destroyed = false;

  // ── Drive-folder sync (build spec §11) ──────────────────────────────────
  // The snapshot (mtime + content hash) as of the last load or successful
  // save — what checkExternalChange() compares the live disk file against.
  // Null until initChapter() sets it (no file yet, or still loading).
  let lastSnapshot: FileSnapshot | null = null;
  let checkingExternal = false;

  // Books in manifest order for work-wide numbering; null → numeric fallback
  // (the dev fixture's workId isn't in the manifest registry yet).
  let workBooks: BookOrder = null;
  try {
    workBooks = getWork(model.workId).books;
  } catch {
    workBooks = null;
  }

  // WorkMeta for scheme.formatCitation (copy-as-citation). Prefer the real
  // manifest; fall back to a synthetic single-book WorkMeta built from the
  // model/fixture fields (same "manifest lookup can miss" case as workBooks
  // above — the dev fixture's workId isn't registered yet).
  let citationWork: WorkMeta;
  try {
    citationWork = getWork(model.workId);
  } catch {
    citationWork = {
      id: model.workId,
      title: model.workTitle,
      author: '',
      scheme: model.scheme,
      books: [{ n: model.book, label: model.bookLabel }],
    };
  }

  // ── reactive UI state ──────────────────────────────────────────────────
  let ready = $state(false);
  let flashRowIdx = $state(-1);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let greekMode = $state(false);
  let pendingPaste = $state<{ row: number; segments: string[] } | null>(null);
  let saveState = $state<SaveState>('idle');
  let saveBlocked = $state(false);
  let loadNotice = $state<string | null>(null);

  const saveLabel = $derived(
    saveBlocked
      ? 'Autosave off'
      : saveState === 'saving'
        ? 'Saving…'
        : saveState === 'saved'
          ? 'Saved'
          : saveState === 'error'
            ? 'Save failed — will retry'
            : '',
  );

  // ── helpers ────────────────────────────────────────────────────────────
  function viewAt(i: number): EditorView | null {
    return views[i] ?? null;
  }
  function focusedView(): EditorView | null {
    return focusedRow >= 0 ? viewAt(focusedRow) : null;
  }
  function docSize(i: number): number {
    return viewAt(i)?.state.doc.content.size ?? 0;
  }
  /** Row i's current doc: the live view when mounted, else the committed model. */
  function rowDoc(i: number): PMNode {
    return viewAt(i)?.state.doc ?? docFromJSON(model.rows[i].english);
  }

  function selRefOf(i: number, state: EditorState): SelRef {
    return { row: i, anchor: state.selection.anchor, head: state.selection.head };
  }

  function flash(i: number) {
    flashRowIdx = -1;
    clearTimeout(flashTimer);
    // Re-set on the next frame so a repeated flash restarts the animation.
    requestAnimationFrame(() => {
      flashRowIdx = i;
      flashTimer = setTimeout(() => (flashRowIdx = -1), 400);
    });
  }

  function syncToolbar(state: EditorState) {
    const marks = { bold: false, italic: false, underline: false, greek: false };
    const { from, to, empty } = state.selection;
    const fromResolved = state.selection.$from;
    for (const name of ['bold', 'italic', 'underline', 'greek'] as const) {
      const type = rowSchema.marks[name];
      if (empty) {
        marks[name] = !!type.isInSet(state.storedMarks ?? fromResolved.marks());
      } else {
        marks[name] = state.doc.rangeHasMark(from, to, type);
      }
    }
    session.activeMarks = marks;
  }

  // ── persistence: dirty tracking + commit-to-model (blur / ~400ms idle) ──
  function markModelDirty() {
    model.dirty = true;
    autosave?.markDirty();
  }

  function commitRowNow(i: number, changed = false) {
    const view = viewAt(i);
    // Ingest DOM mutations ProseMirror hasn't observed yet (its DOMObserver
    // batches the tail of a typing burst for ~20ms). Without this, a commit
    // fired by an instant chapter-switch/blur could read a stale doc and drop
    // the last keystrokes. This may dispatch (and schedule a commit timer),
    // so it runs BEFORE the timer check. domObserver is internal but stable.
    if (view) {
      (view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
    }
    const timer = commitTimers.get(i);
    if (timer !== undefined) {
      clearTimeout(timer);
      commitTimers.delete(i);
      changed = true; // a scheduled commit only ever follows a doc change
    }
    if (!view) return;
    const doc = view.state.doc;
    model.rows[i].english = doc.toJSON();
    history.breakCoalescing();
    if (changed) {
      markModelDirty();
      publishFootnotes(); // anchored-phrase snippets follow the text
    }
    if (import.meta.env.DEV) assertRoundTrip(doc); // round-trip asserted on every commit
  }

  function scheduleCommit(i: number) {
    clearTimeout(commitTimers.get(i));
    commitTimers.set(
      i,
      setTimeout(() => commitRowNow(i), 400),
    );
  }

  /** Commit anything pending and save NOW (chapter switch / blur / hidden). */
  function flushPending() {
    for (const i of [...commitTimers.keys()]) commitRowNow(i);
    void autosave?.flush();
  }

  // ── chapter open: hydrate from the saved file (the file is canonical) ───
  async function initChapter() {
    const res = await loadChapterFile(storage, model.workId, fileName);
    if (destroyed) return;

    let fresh = false;
    if (res.error) {
      // A file EXISTS but can't be parsed. Never autosave over it — that
      // could destroy the very data that made it unreadable.
      saveBlocked = true;
      loadNotice = 'Saved chapter file could not be read — autosave is off so it won’t be overwritten.';
      console.error(`chapter load: ${fileName}: ${res.error}`);
    } else if (res.file) {
      const h = hydrateFromFile(res.file, fixture.lines, model.scheme);
      model.rows = h.rows;
      model.footnotes = h.footnotes;
      spans = h.spans;
      loadNotice = h.notice;
    } else {
      fresh = true;
    }

    try {
      const index = await loadFootnoteIndex(storage, model.workId);
      fnBase = precedingFootnoteCount(index, workBooks, model.book, model.chapter);
    } catch {
      /* regenerable cache — numbering self-heals on next save */
    }
    if (destroyed) return;

    views = Array(model.rows.length).fill(null);
    fnDisplay = displayNumbers(model.rows.flatMap((_, i) => markerIdsIn(rowDoc(i))));

    if (!saveBlocked) {
      autosave = createAutosave({
        workId: model.workId,
        fileName,
        storage,
        snapshot: () => serializeModel(model, spans),
        onState: (s) => {
          if (!destroyed) saveState = s;
        },
        onSaved: () => {
          void updateFootnoteCount(storage, model.workId, model.book, model.chapter, anchoredFootnoteCount(model));
          void refreshSnapshot(); // our own save moved the file — track its new state
        },
      });
      if (fresh) {
        // Write the initial file immediately so it exists from first open.
        autosave.markDirty();
        void autosave.flush();
      }
    }

    await refreshSnapshot();

    ready = true;
    await tick();
    publishFootnotes();
    requestAnimationFrame(() => focusRowEnd(0));
  }

  /** Re-read the file's current mtime + content as the sync baseline (called
   * after load and after every successful save — see initChapter/onSaved). */
  async function refreshSnapshot(): Promise<void> {
    try {
      const [mtime, content] = await Promise.all([
        storage.mtime(model.workId, fileName),
        storage.read(model.workId, fileName),
      ]);
      if (destroyed) return;
      lastSnapshot = snapshotOf(mtime, content ?? '');
    } catch {
      /* best-effort baseline only; a failed stat just means the next check
         re-tries from whatever lastSnapshot already holds */
    }
  }

  /** Drive-folder sync check (build spec §11): called on window focus. Stats
   * the open chapter's file; reloads seamlessly, prompts, or no-ops per the
   * decision matrix. Never runs concurrently with itself. */
  async function checkExternalChange(): Promise<void> {
    if (checkingExternal || destroyed || !ready || saveBlocked || !lastSnapshot) return;
    checkingExternal = true;
    try {
      const [mtime, content] = await Promise.all([
        storage.mtime(model.workId, fileName),
        storage.read(model.workId, fileName),
      ]);
      if (destroyed || content === null) return;
      const changed = hasChanged(lastSnapshot, mtime, content);
      const decision = decideReload(changed, model.dirty);
      if (decision.kind === 'none') return;

      if (decision.kind === 'reload-seamless') {
        reloadFromDisk(content, mtime);
        setStatus('Updated from the shared folder.');
        return;
      }

      // decision.kind === 'ask' — do not clobber either side.
      session.externalChangePrompt = {
        onKeepMine: () => {
          session.externalChangePrompt = null;
          // Local edits win: mark dirty so the next autosave overwrites the
          // incoming version, and adopt the disk snapshot so we don't keep
          // re-prompting for the same external change.
          lastSnapshot = snapshotOf(mtime, content);
          markModelDirty();
        },
        onLoadTheirs: () => {
          session.externalChangePrompt = null;
          reloadFromDisk(content, mtime);
        },
      };
    } finally {
      checkingExternal = false;
    }
  }

  /** Discard whatever's live and re-hydrate the model from `content` (the
   * file just read off disk). Used by both the seamless path and "Load
   * theirs". Clears any pending commit timers first so a stale scheduled
   * commit can't stomp the freshly loaded rows a moment later. */
  function reloadFromDisk(content: string, mtime: number | null) {
    for (const timer of commitTimers.values()) clearTimeout(timer);
    commitTimers.clear();

    let parsed: ReturnType<typeof parseChapterFile> | null = null;
    try {
      parsed = parseChapterFile(content, fileName);
    } catch (err) {
      console.error(`sync reload: ${fileName} failed to parse`, err);
      setStatus("The shared folder's version of this chapter couldn't be read.");
      return;
    }
    const h = hydrateFromFile(parsed, fixture.lines, model.scheme);
    model.rows = h.rows;
    model.footnotes = h.footnotes;
    model.dirty = false;
    spans = h.spans;
    loadNotice = h.notice;
    lastSnapshot = snapshotOf(mtime, content);

    // Rebuild every row view still mounted from the reloaded model (mirrors
    // applyEntry's replaceWith for the undo/redo path). Rows beyond the new
    // model length (or a row count change entirely) fall through to the
    // views-array resize below — the {#each} key on row index+address
    // remounts the grid for those.
    const commonRows = Math.min(views.length, model.rows.length);
    for (let i = 0; i < commonRows; i++) {
      const view = views[i];
      if (!view) continue;
      const newDoc = docFromJSON(model.rows[i].english);
      view.dispatch(
        view.state.tr
          .replaceWith(0, view.state.doc.content.size, newDoc.content)
          .setMeta('appHistoryIgnore', true)
          .setMeta(FN_REFRESH, true),
      );
    }
    if (model.rows.length !== views.length) {
      // Row count changed underneath us (rare: corpus spine drift on the
      // collaborator's saved file) — resize the views array to match; the
      // {#each} key (index + address) remounts rows that moved or are new.
      views = Array(model.rows.length).fill(null);
    }
    fnDisplay = displayNumbers(model.rows.flatMap((_, i) => markerIdsIn(rowDoc(i))));
    history.clear();
    refreshFnDisplay();
  }

  // ── footnote bookkeeping (model side; the plugin is view-only) ─────────
  function refreshFnDisplay() {
    const order: string[] = [];
    for (let i = 0; i < model.rows.length; i++) {
      order.push(...markerIdsIn(rowDoc(i)));
    }
    fnDisplay = displayNumbers(order);
    for (const view of views) {
      view?.dispatch(view.state.tr.setMeta(FN_REFRESH, true).setMeta('appHistoryIgnore', true));
    }
    publishFootnotes();
  }

  function setActiveFootnote(id: string | null) {
    activeFn = id;
    session.activeFootnoteId = id;
    for (const view of views) {
      view?.dispatch(view.state.tr.setMeta(FN_REFRESH, true).setMeta('appHistoryIgnore', true));
    }
  }

  /** Work-wide display number for a chapter-local id (plugin + panel). */
  function fnDisplayNumber(id: string): number | undefined {
    const local = fnDisplay.get(id);
    return local === undefined ? undefined : fnBase + local;
  }

  /** Publish the panel's view of this chapter's footnotes (document order). */
  function publishFootnotes() {
    const phrases = new Map<string, string>();
    const markerRow = new Map<string, number>();
    const order: string[] = [];
    for (let i = 0; i < model.rows.length; i++) {
      for (const run of runsOf(rowDoc(i))) {
        if (run.kind === 'marker') {
          if (!markerRow.has(run.id)) {
            markerRow.set(run.id, i);
            order.push(run.id);
          }
        } else if (run.marks.fnRef !== undefined) {
          phrases.set(run.marks.fnRef, (phrases.get(run.marks.fnRef) ?? '') + run.text);
        }
      }
    }
    const entries: FootnoteListEntry[] = [];
    for (const id of order) {
      const fn = model.footnotes.find((f) => f.id === id);
      entries.push({
        id,
        displayNumber: fnDisplayNumber(id) ?? null,
        snippet: phrases.get(id) ?? '',
        body: fn?.body ?? '',
        anchored: true,
        row: markerRow.get(id) ?? null,
      });
    }
    for (const fn of model.footnotes) {
      if (markerRow.has(fn.id)) continue;
      entries.push({ id: fn.id, displayNumber: null, snippet: '', body: fn.body, anchored: false, row: null });
    }
    session.footnotes = entries;
  }

  /** Re-read the per-work index (another chapter's count changed). */
  async function reloadFnBase() {
    try {
      const index = await loadFootnoteIndex(storage, model.workId);
      const next = precedingFootnoteCount(index, workBooks, model.book, model.chapter);
      if (!destroyed && next !== fnBase) {
        fnBase = next;
        refreshFnDisplay();
      }
    } catch {
      /* keep the current base */
    }
  }

  // ── the dispatch pipeline ──────────────────────────────────────────────
  function dispatchFor(i: number) {
    return (tr: Transaction) => {
      const view = viewAt(i);
      if (!view) return;
      const oldState = view.state;
      const newState = oldState.apply(tr);
      view.updateState(newState);

      if (tr.docChanged && !tr.getMeta('appHistoryIgnore')) {
        savedX = null;
        afterDocChange(i, oldState, tr);
        scheduleCommit(i);
      }
      if (view.hasFocus() || focusedRow === i) syncToolbar(view.state);
    };
  }

  function afterDocChange(i: number, oldState: EditorState, tr: Transaction) {
    const view = viewAt(i)!;
    const beforeDoc = oldState.doc;

    // Footnote invariant upkeep: markers deleted by this edit unanchor their
    // footnotes; fnRef runs whose marker is gone lose the mark (see
    // serialize.ts header — orphaned anchors are unrepresentable).
    const beforeIds = markerIdsIn(beforeDoc);
    const afterIds = new Set(markerIdsIn(view.state.doc));
    const removed = beforeIds.filter((id) => !afterIds.has(id));

    let fnBefore = pendingFn?.before;
    let fnAfter = pendingFn?.after;
    pendingFn = null;

    if (removed.length > 0) {
      fnBefore ??= cloneFootnotes(model.footnotes);
      for (const id of removed) {
        const fn = model.footnotes.find((f) => f.id === id);
        if (fn) fn.anchored = false;
        if (activeFn === id) setActiveFootnote(null);
      }
      fnAfter = cloneFootnotes(model.footnotes);
      setStatus(removed.length === 1 ? 'Footnote unanchored — body kept in the footnote table' : `${removed.length} footnotes unanchored — bodies kept`);
    }

    const orphans = orphanFnRefIds(view.state.doc);
    if (orphans.length > 0) {
      const cleanup = view.state.tr;
      view.state.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        const mark = node.marks.find((m) => m.type === rowSchema.marks.fnRef && orphans.includes(String(m.attrs.id)));
        if (mark) cleanup.removeMark(pos, pos + node.nodeSize, mark);
        return true;
      });
      cleanup.setMeta('appHistoryIgnore', true);
      view.dispatch(cleanup);
    }

    const afterDoc = view.state.doc;
    const coalesceKey =
      !tr.getMeta('noCoalesce') && (tr.getMeta('coalesce') === 'typing' || isTypingTransaction(tr))
        ? `typing:${i}`
        : null;

    history.push(
      {
        edits: [{ row: i, before: beforeDoc, after: afterDoc }],
        fnBefore,
        fnAfter,
        selBefore: selRefOf(i, oldState),
        selAfter: selRefOf(i, view.state),
      },
      { coalesceKey },
    );

    if (removed.length > 0 || markerIdsIn(afterDoc).length !== beforeIds.length) refreshFnDisplay();
  }

  // ── undo/redo ──────────────────────────────────────────────────────────
  function applyEntry(entry: UndoEntry, dir: 'undo' | 'redo') {
    const firstRow = entry.edits[0]?.row ?? focusedRow;
    withScrollAnchor(firstRow, () => {
      for (const edit of entry.edits) {
        const view = viewAt(edit.row);
        if (!view) continue;
        const doc = dir === 'undo' ? edit.before : edit.after;
        const tr = view.state.tr
          .replaceWith(0, view.state.doc.content.size, doc.content)
          .setMeta('appHistoryIgnore', true)
          .setMeta(FN_REFRESH, true);
        view.dispatch(tr);
        commitRowNow(edit.row, true);
      }
      const fnTable = dir === 'undo' ? entry.fnBefore : entry.fnAfter;
      if (fnTable) {
        model.footnotes = cloneFootnotes(fnTable);
        markModelDirty();
      }
      refreshFnDisplay();
      const sel = dir === 'undo' ? entry.selBefore : entry.selAfter;
      if (sel) focusSel(sel);
    });
  }

  function undo() {
    const entry = history.undo();
    if (!entry) {
      setStatus('Nothing to undo');
      return;
    }
    applyEntry(entry, 'undo');
  }

  function redo() {
    const entry = history.redo();
    if (!entry) {
      setStatus('Nothing to redo');
      return;
    }
    applyEntry(entry, 'redo');
  }

  function focusSel(sel: SelRef) {
    const view = viewAt(sel.row);
    if (!view) return;
    const size = view.state.doc.content.size;
    const anchor = Math.min(sel.anchor, size);
    const head = Math.min(sel.head, size);
    view.focus();
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, anchor, head))
        .scrollIntoView()
        .setMeta('appHistoryIgnore', true),
    );
    focusedRow = sel.row;
  }

  // ── scroll anchoring (design doc D1 §"Height sync") ────────────────────
  function withScrollAnchor(row: number, fn: () => void) {
    const cellEl = gridEl?.querySelector<HTMLElement>(`[data-row-en="${row}"]`);
    const before = cellEl?.getBoundingClientRect().top ?? null;
    fn();
    if (before === null || !cellEl) return;
    requestAnimationFrame(() => {
      const after = cellEl.getBoundingClientRect().top;
      const delta = after - before;
      if (delta !== 0 && rootEl) rootEl.scrollTop += delta;
    });
  }

  // ── focus / navigation ─────────────────────────────────────────────────
  function focusRowEnd(i: number) {
    const view = viewAt(i);
    if (!view) return;
    view.focus();
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size))
        .scrollIntoView()
        .setMeta('appHistoryIgnore', true),
    );
    focusedRow = i;
  }

  function focusRowAtX(i: number, edge: 'first' | 'last', x: number) {
    const view = viewAt(i);
    if (!view) return;
    view.focus();
    const rect = view.dom.getBoundingClientRect();
    const y = edge === 'first' ? rect.top + 2 : rect.bottom - 2;
    const clampedX = Math.min(Math.max(x, rect.left + 1), rect.right - 1);
    const found = view.posAtCoords({ left: clampedX, top: y });
    const pos = found ? found.pos : edge === 'first' ? 0 : view.state.doc.content.size;
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, Math.min(pos, view.state.doc.content.size)))
        .scrollIntoView()
        .setMeta('appHistoryIgnore', true),
    );
    focusedRow = i;
  }

  // ── cross-row selection helpers ────────────────────────────────────────
  function rowOfDomNode(node: Node | null): number {
    if (!node) return -1;
    const el = node instanceof Element ? node : node.parentElement;
    const cell = el?.closest('[data-row-en]');
    return cell ? Number((cell as HTMLElement).dataset.rowEn) : -1;
  }

  /** Same row lookup, but recognizes Greek/gutter cells too (`data-row`), for
   * copy-as-citation's "selection may sit in Greek cells" case. */
  function anyRowOfDomNode(node: Node | null): number {
    if (!node) return -1;
    const el = node instanceof Element ? node : node.parentElement;
    const cell = el?.closest('[data-row-en], [data-row]');
    if (!cell) return -1;
    const raw = (cell as HTMLElement).dataset.rowEn ?? (cell as HTMLElement).dataset.row;
    return raw !== undefined ? Number(raw) : -1;
  }

  function crossRowSelection(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    const a = rowOfDomNode(range.startContainer);
    const b = rowOfDomNode(range.endContainer);
    return a >= 0 && b >= 0 && a !== b;
  }

  function onCopy(e: ClipboardEvent) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startRow = rowOfDomNode(range.startContainer);
    const endRow = rowOfDomNode(range.endContainer);
    if (startRow < 0 || endRow < 0 || startRow === endRow) return; // single row → PM handles

    const parts: string[] = [];
    for (let r = startRow; r <= endRow; r++) {
      const view = viewAt(r);
      if (!view) continue;
      const size = view.state.doc.content.size;
      let from = 0;
      let to = size;
      try {
        if (r === startRow) from = Math.max(0, Math.min(view.posAtDOM(range.startContainer, range.startOffset), size));
        if (r === endRow) to = Math.max(0, Math.min(view.posAtDOM(range.endContainer, range.endOffset), size));
      } catch {
        /* keep full-row fallback */
      }
      parts.push(view.state.doc.textBetween(from, to, undefined, ''));
    }
    e.clipboardData?.setData('text/plain', parts.join('\n'));
    e.preventDefault();
  }

  function onCut(e: ClipboardEvent) {
    if (crossRowSelection()) {
      e.preventDefault();
      setStatus('Select within one row to edit — cross-row selections are read-only');
    }
  }

  // ── copy as citation (build spec §10) ──────────────────────────────────
  // Row range = every row touched by the native selection, whether it sits
  // in English or Greek cells; caret-only → the focused row alone. Assembly
  // (English/Greek extraction, the exact clipboard string, scheme.formatCitation)
  // is pure and lives in copyCitation.ts — this only resolves DOM selection
  // to row indices and per-row englishSelected text, mirroring onCopy above.
  async function writeClipboardText(text: string): Promise<void> {
    if (isTauri()) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
  }

  async function copyCitation() {
    const sel = window.getSelection();
    let startRow: number;
    let endRow: number;
    let range: Range | null = null;

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      range = sel.getRangeAt(0);
      startRow = anyRowOfDomNode(range.startContainer);
      endRow = anyRowOfDomNode(range.endContainer);
      if (startRow < 0 || endRow < 0) {
        // Selection isn't inside the chapter grid at all — fall back to the
        // focused row, same as caret-only.
        range = null;
        startRow = endRow = focusedRow;
      } else if (startRow > endRow) {
        [startRow, endRow] = [endRow, startRow];
      }
    } else {
      startRow = endRow = focusedRow;
    }

    if (startRow < 0 || endRow < 0) {
      setStatus('Click into a row first');
      return;
    }

    const rows: CitationRowInput[] = [];
    for (let r = startRow; r <= endRow; r++) {
      const doc = rowDoc(r);
      // englishSelected only when a selection ENDPOINT sits in this row's
      // English cell (rowOfDomNode is English-specific). Every other touched
      // row — interior rows, endpoints sitting in a Greek cell — stays null
      // and contributes its FULL English inside buildCitationClipboardText.
      let englishSelected: string | null = null;
      if (range) {
        const view = viewAt(r);
        const startsHere = r === startRow && rowOfDomNode(range.startContainer) === r;
        const endsHere = r === endRow && rowOfDomNode(range.endContainer) === r;
        if (view && (startsHere || endsHere)) {
          const size = doc.content.size;
          let from = 0;
          let to = size;
          try {
            if (startsHere) {
              from = Math.max(0, Math.min(view.posAtDOM(range.startContainer, range.startOffset), size));
            }
            if (endsHere) {
              to = Math.max(0, Math.min(view.posAtDOM(range.endContainer, range.endOffset), size));
            }
          } catch {
            /* keep full-row fallback for this row */
          }
          englishSelected = doc.textBetween(from, to, ' ', '');
        }
      }
      rows.push({
        address: model.rows[r].address,
        greek: model.rows[r].greek,
        englishDoc: doc,
        englishSelected,
      });
    }

    const scheme = getScheme(model.scheme);
    const result = buildCitationClipboardText({
      rows,
      scheme,
      work: citationWork,
      book: model.book,
      chapter: model.chapter,
    });

    if (result.kind === 'empty') {
      setStatus('Nothing to cite — the selected rows have no English yet.');
      return;
    }

    try {
      await writeClipboardText(result.text);
      setStatus('Citation copied.');
    } catch {
      setStatus('Could not copy — try again.');
    }
  }

  // ── commands (toolbar + shortcuts) ─────────────────────────────────────
  function applyMark(name: 'bold' | 'italic' | 'underline') {
    if (crossRowSelection()) {
      setStatus('Select within one row');
      return;
    }
    const view = focusedView();
    if (!view) {
      setStatus('Click into a row first');
      return;
    }
    history.breakCoalescing();
    toggleMark(rowSchema.marks[name])(view.state, view.dispatch);
    view.focus();
    syncToolbar(view.state);
  }

  function toggleGreek() {
    greekMode = !greekMode;
    session.greekMode = greekMode;
    const view = focusedView();
    if (view) {
      resetGreekRun(view);
      const greek = rowSchema.marks.greek;
      const stored = view.state.storedMarks ?? view.state.selection.$head.marks();
      const marks = greekMode
        ? greek.isInSet(stored)
          ? [...stored]
          : [...stored, greek.create()]
        : stored.filter((m) => m.type !== greek);
      view.dispatch(view.state.tr.setStoredMarks(marks).setMeta('appHistoryIgnore', true));
      view.focus();
      syncToolbar(view.state);
    }
    setStatus(greekMode ? 'Greek input on — Beta Code decodes as you type (⌘G to leave)' : 'Greek input off');
  }

  function insertFootnote() {
    if (crossRowSelection()) {
      setStatus('Select within one row');
      return;
    }
    const view = focusedView();
    if (!view) {
      setStatus('Click into a row first');
      return;
    }
    const sel = view.state.selection;
    if (sel.empty) {
      setStatus('Select the phrase to footnote');
      return;
    }
    const i = focusedRow;
    const id = nextFootnoteId(model.footnotes);
    const before = cloneFootnotes(model.footnotes);
    model.footnotes.push({ id, body: '', anchored: true });
    pendingFn = { before, after: cloneFootnotes(model.footnotes) };

    history.breakCoalescing();
    const marker = rowSchema.nodes.footnoteMarker.create({ id });
    const tr = view.state.tr
      .addMark(sel.from, sel.to, rowSchema.marks.fnRef.create({ id }))
      .insert(sel.to, marker);
    tr.setSelection(TextSelection.create(tr.doc, sel.to + marker.nodeSize));
    tr.setMeta('noCoalesce', true);
    view.dispatch(tr);
    view.focus();

    setActiveFootnote(id);
    refreshFnDisplay();
    commitRowNow(i);
    // An open panel focuses the new entry's body field.
    session.fnFocusRequest = { id, ts: Date.now() };
  }

  // ── footnote panel commands ────────────────────────────────────────────
  function anchorRowOf(id: string): number {
    for (let i = 0; i < model.rows.length; i++) {
      if (markerIdsIn(rowDoc(i)).includes(id)) return i;
    }
    return -1;
  }

  function focusFootnote(id: string) {
    setActiveFootnote(id);
    const row = anchorRowOf(id);
    if (row < 0) return;
    gridEl
      ?.querySelector(`[data-row-en="${row}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /** Delete marker + fnRef mark + body as ONE undo entry. */
  function deleteFootnote(id: string) {
    const fnIdx = model.footnotes.findIndex((f) => f.id === id);
    const row = anchorRowOf(id);
    if (fnIdx < 0 && row < 0) return;

    history.breakCoalescing();
    const fnBefore = cloneFootnotes(model.footnotes);
    if (fnIdx >= 0) model.footnotes.splice(fnIdx, 1);
    const fnAfter = cloneFootnotes(model.footnotes);

    if (row >= 0) {
      const view = viewAt(row);
      if (view) {
        const oldState = view.state;
        const before = oldState.doc;
        const runs: InlineRun[] = runsOf(before)
          .filter((r) => !(r.kind === 'marker' && r.id === id))
          .map((r) =>
            r.kind === 'text' && r.marks.fnRef === id ? { ...r, marks: { ...r.marks, fnRef: undefined } } : r,
          );
        const after = buildRowDoc(runs);
        view.dispatch(
          view.state.tr
            .replaceWith(0, before.content.size, after.content)
            .setMeta('appHistoryIgnore', true)
            .setMeta(FN_REFRESH, true),
        );
        commitRowNow(row, true);
        history.push({
          edits: [{ row, before, after }],
          fnBefore,
          fnAfter,
          selBefore: selRefOf(row, oldState),
          selAfter: selRefOf(row, view.state),
        });
      }
    } else {
      history.push({ edits: [], fnBefore, fnAfter, selBefore: null, selAfter: null });
      markModelDirty();
    }

    if (activeFn === id) setActiveFootnote(null);
    refreshFnDisplay();
    setStatus('Footnote deleted');
  }

  /** Re-anchor an unanchored footnote at the current selection. */
  function reanchorFootnote(id: string) {
    const fn = model.footnotes.find((f) => f.id === id);
    if (!fn || fn.anchored) return;
    if (crossRowSelection()) {
      setStatus('Select within one row');
      return;
    }
    const view = focusedView();
    if (!view) {
      setStatus('Click into a row first — the footnote anchors at your selection');
      return;
    }
    const sel = view.state.selection;

    history.breakCoalescing();
    const before = cloneFootnotes(model.footnotes);
    fn.anchored = true;
    pendingFn = { before, after: cloneFootnotes(model.footnotes) };

    const marker = rowSchema.nodes.footnoteMarker.create({ id });
    const tr = view.state.tr;
    if (!sel.empty) tr.addMark(sel.from, sel.to, rowSchema.marks.fnRef.create({ id }));
    tr.insert(sel.to, marker);
    tr.setSelection(TextSelection.create(tr.doc, sel.to + marker.nodeSize));
    tr.setMeta('noCoalesce', true);
    view.dispatch(tr);
    view.focus();

    setActiveFootnote(id);
    refreshFnDisplay();
    commitRowNow(focusedRow);
    setStatus('Footnote re-anchored');
  }

  /** Body edit from the panel: its own undo entry, rides autosave. */
  function updateFootnoteBody(id: string, body: string) {
    const fn = model.footnotes.find((f) => f.id === id);
    if (!fn || fn.body === body) return;
    const fnBefore = cloneFootnotes(model.footnotes);
    fn.body = body;
    const fnAfter = cloneFootnotes(model.footnotes);
    history.breakCoalescing();
    history.push({ edits: [], fnBefore, fnAfter, selBefore: null, selAfter: null });
    markModelDirty();
    publishFootnotes();
  }

  // ── paste distribution ─────────────────────────────────────────────────
  function requestPasteDistribute(row: number, segments: string[]) {
    pendingPaste = { row, segments };
  }

  function confirmPaste() {
    const pending = pendingPaste;
    pendingPaste = null;
    if (!pending) return;
    const { row, segments } = pending;
    const edits: UndoEntry['edits'] = [];

    const firstView = viewAt(row);
    if (!firstView) return;
    const selBefore = selRefOf(row, firstView.state);

    withScrollAnchor(row, () => {
      for (let k = 0; k < segments.length; k++) {
        const view = viewAt(row + k);
        if (!view) break;
        const before = view.state.doc;
        const runs: InlineRun[] =
          k === 0
            ? [...runsOf(before), { kind: 'text', text: segments[k], marks: {} }]
            : [{ kind: 'text', text: segments[k], marks: {} }];
        const after = buildRowDoc(runs);
        edits.push({ row: row + k, before, after });
        view.dispatch(
          view.state.tr
            .replaceWith(0, view.state.doc.content.size, after.content)
            .setMeta('appHistoryIgnore', true),
        );
        commitRowNow(row + k, true);
      }
      const last = edits[edits.length - 1];
      history.breakCoalescing();
      history.push({
        edits,
        selBefore,
        selAfter: last ? { row: last.row, anchor: last.after.content.size, head: last.after.content.size } : null,
      });
      if (last) focusRowEnd(last.row);
    });
    setStatus(`Pasted ${segments.length} lines into ${segments.length} rows`);
  }

  function cancelPaste() {
    const row = pendingPaste?.row ?? -1;
    pendingPaste = null;
    if (row >= 0) focusRowEnd(row);
  }

  // ── per-row plugin wiring ──────────────────────────────────────────────
  function rowContext(index: number): RowContext {
    return {
      index,
      rowCount: () => model.rows.length,
      isRowEmpty: (k) => docSize(k) === 0,
      focusRowEnd,
      focusRowAtX,
      getSavedX: () => savedX,
      setSavedX: (x) => (savedX = x),
      clearSavedX: () => (savedX = null),
      flash,
      hint: setStatus,
      toast: setStatus,
      toggleGreek,
      undo,
      redo,
      insertFootnote,
      requestPasteDistribute,
    };
  }

  const host: RowViewHost = {
    createView(index, el) {
      const state = EditorState.create({
        doc: docFromJSON(model.rows[index].english),
        plugins: [
          greekInput({ isGreekMode: () => greekMode }),
          ...rowPlugins(rowContext(index)),
          footnotePlugin({
            displayNumber: fnDisplayNumber,
            activeFootnoteId: () => activeFn,
            setActiveFootnote,
            showAllAnchors: () => session.fnPanelOpen,
          }),
        ],
      });
      const view = new EditorView(el, {
        state,
        dispatchTransaction: dispatchFor(index),
        handleDOMEvents: {
          focus: (v) => {
            focusedRow = index;
            syncToolbar(v.state);
            return false;
          },
          blur: () => {
            commitRowNow(index);
            return false;
          },
        },
      });
      views[index] = view;
    },
    destroyView(index) {
      commitRowNow(index);
      views[index]?.destroy();
      views[index] = null;
    },
  };

  // ── lifecycle ──────────────────────────────────────────────────────────
  const editorCommands: EditorCommands = {
    toggleMark: applyMark,
    toggleGreek,
    insertFootnote,
    undo,
    redo,
    copyCitation,
  };

  const footnoteCommands: FootnoteCommands = {
    focusFootnote,
    deleteFootnote,
    reanchorFootnote,
    updateFootnoteBody,
    setActiveFootnote,
  };

  const syncCommandsImpl: SyncCommands = {
    checkExternalChange,
  };

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.altKey) return;
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (e.key === 'y') {
      e.preventDefault();
      redo();
    } else if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      void copyCitation();
    }
  }

  function onWindowBlur() {
    flushPending();
  }

  function onVisibilityHidden() {
    if (document.visibilityState === 'hidden') flushPending();
  }

  function onRootKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && pendingPaste) {
      e.preventDefault();
      cancelPaste();
    }
  }

  // Panel open/close: repaint anchor highlights on every row.
  $effect(() => {
    const open = session.fnPanelOpen;
    if (!ready) return;
    for (const view of views) {
      view?.dispatch(view.state.tr.setMeta(FN_REFRESH, true).setMeta('appHistoryIgnore', true));
    }
    if (open) publishFootnotes();
  });

  // Settle guard: ONE ResizeObserver on the grid container — caret
  // visibility re-assert only, coalesced through a single rAF. It never
  // writes heights (the flat grid owns those).
  $effect(() => {
    if (!ready || !gridEl) return;
    let settleQueued = false;
    const ro = new ResizeObserver(() => {
      if (settleQueued) return;
      settleQueued = true;
      requestAnimationFrame(() => {
        settleQueued = false;
        const view = focusedView();
        if (view?.hasFocus()) {
          view.dispatch(view.state.tr.scrollIntoView().setMeta('appHistoryIgnore', true));
        }
      });
    });
    ro.observe(gridEl);
    return () => ro.disconnect();
  });

  onMount(() => {
    registerEditor(editorCommands, footnoteCommands, syncCommandsImpl);
    session.greekMode = false;

    const unsubIndex = onFootnoteIndexChange((workId) => {
      if (workId === model.workId) void reloadFnBase();
    });

    window.addEventListener('keydown', onWindowKeydown);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityHidden);

    void initChapter();

    return () => {
      destroyed = true;
      window.removeEventListener('keydown', onWindowKeydown);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityHidden);
      unsubIndex();
      // Chapter switch: commit every row, then flush BEFORE the next chapter
      // loads (loadChapterFile awaits this write via the pending registry).
      for (let i = 0; i < views.length; i++) if (views[i]) commitRowNow(i);
      void autosave?.dispose();
      unregisterEditor(editorCommands);
    };
  });
</script>

<div
  class="chapter-editor"
  bind:this={rootEl}
  oncopy={onCopy}
  oncut={onCut}
  onkeydown={onRootKeydown}
>
  {#if ready}
    <header class="chapter-head">
      <h1>
        {model.workTitle}
        <span class="chapter-head-ref">{model.bookLabel}.{model.chapter} · {model.bekkerRange}</span>
      </h1>
      {#if saveLabel}
        <span class="save-state" data-state={saveBlocked ? 'blocked' : saveState} role="status">{saveLabel}</span>
      {/if}
      {#if loadNotice}
        <p class="load-notice">{loadNotice}</p>
      {/if}
    </header>

    <div class="chapter-grid" bind:this={gridEl}>
      {#each model.rows as row, i (`${i}:${row.address.raw}`)}
        <GreekCell index={i} greek={row.greek} flash={flashRowIdx === i} />
        <RowGutter index={i} raw={row.address.raw} />
        <EnglishCell
          index={i}
          {host}
          flash={flashRowIdx === i}
          pasteConfirm={pendingPaste?.row === i ? pendingPaste.segments.length : null}
          onPasteConfirm={confirmPaste}
          onPasteCancel={cancelPaste}
        />
      {/each}
    </div>
  {/if}

  {#if session.status}
    <div class="status-pill" role="status">{session.status.text}</div>
  {/if}
</div>
