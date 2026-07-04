<script module lang="ts">
  import type { AssistUiState } from './assistController';

  // What a RowEditor needs from the chapter — kept minimal so the row side
  // can later become mount-on-focus without touching this contract.
  // View identity is (row, segment) — the model (Bekker-line) row index plus
  // the English segment index (design doc D6): a paragraph-split line mounts
  // one editor per segment, and both indexes are stable across the grid
  // ordinal shifts a split causes.
  export interface RowViewHost {
    createView(row: number, segment: number, el: HTMLElement): void;
    destroyView(row: number, segment: number): void;
    // ── AI-assist (design doc D4) ──
    /** Suggest-for-row entry point (the row glyph; ⌘⏎ arrives via rowKeymap). */
    requestAssist(row: number, segment: number): void;
    /** Popover state for cell (row, segment); null unless assist targets it. Reactive. */
    assistStateFor(row: number, segment: number): AssistUiState | null;
    /** THE one editor mutation assist may perform, surfaced to the popover
     * as RowEditor.insertSuggestion — a normal transaction on the cell's
     * view, through the same dispatch path as typing. */
    insertSuggestion(row: number, segment: number, text: string): void;
    dismissAssist(): void;
  }
</script>

<script lang="ts">
  // ChapterEditor — owns the ChapterModel, the app-level undo stack, focus
  // state and the commit-on-idle cycle (design doc D1). One flat CSS grid for
  // the whole chapter: each row's three cells (Greek, gutter, English) are
  // siblings on the same explicit row track, so track height = max(Greek,
  // English) with zero JS.
  //
  // Line splits (design doc D6): the grid renders DISPLAY rows — expandRows
  // (gridRows.ts) expands each paragraph-split Bekker line into one grid row
  // per English segment, all sharing the line's one address. The MODEL row
  // stays the commit/autosave/undo unit; navigation (Enter/Tab/Arrows) walks
  // display rows. The split gesture is a right-click on the Greek cell
  // ("Start new paragraph here"); un-split is the explicit "Merge paragraph
  // back" command, confirm-guarded only when both English cells hold text.
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
  import { modelFromFixture, nextFootnoteId, cloneFootnotes, displayNumbers, segmentCount, englishDocsOf } from './model';
  import type { ChapterModel } from './model';
  import { rowSchema, docFromJSON, markerIdsIn, emptyRowDocJSON } from './schema';
  import type { PMDocJSON } from './schema';
  import { assertRoundTrip, buildRowDoc, runsOf, orphanFnRefIds, joinRowDocs } from './serialize';
  import type { InlineRun } from './serialize';
  import { AppHistory } from './history';
  import type { SelRef, UndoEntry, RowSnapshot } from './history';
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
  import { resolveEndpointPos } from './citationSelection';
  import { expandRows, snapToWordStart, splitUnsplitRow, mergeSegments, mergeNeedsConfirm } from './gridRows';
  import type { DisplayRow } from './gridRows';
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
  import { loadSettings, updateSettings } from '../settings';
  import {
    AssistController,
    buildAssistContext,
    buildInsertTransaction,
    plainRowText,
    resolveTauriAssistProvider,
  } from './assistController';
  import { buildClipboardPayload } from '../assist/clipboardPayload';
  import { NO_LINE_MESSAGE, GENERIC_ERROR_MESSAGE } from '../assist/messages';
  import { ClipboardProvider } from '../assist/clipboardProvider';
  import type { AssistContext, AssistProvider, AssistResult } from '../assist/provider';
  import type { RunInvokeFn } from '../assist/cliProvider';
  import GreekCell from './GreekCell.svelte';
  import RowGutter from './RowGutter.svelte';
  import EnglishCell from './EnglishCell.svelte';
  import ReferencePopup from '../../components/ReferencePopup.svelte';
  import './editor.css';

  let { fixture }: { fixture: FixtureChapter } = $props();

  // ── model + non-reactive machinery ─────────────────────────────────────
  const model: ChapterModel = modelFromFixture(fixture);
  const history = new AppHistory();
  const storage = libraryStorage();
  const fileName = chapterFileName(fixture.book, fixture.chapter);
  // Live views keyed by `${row}:${segment}` — (row, segment) is the stable
  // view identity (see RowViewHost above); grid ordinals are never keys.
  const views = new Map<string, EditorView>();
  const vkey = (row: number, segment: number) => `${row}:${segment}`;

  let rootEl = $state<HTMLDivElement>(); // the scroll container
  let gridEl = $state<HTMLDivElement>();

  let focusedRow = -1; // last MODEL row that held focus (toolbar targets it)
  let focusedSegment = 0; // …and the segment within it
  let savedX: number | null = null; // goal column for cross-row Arrow moves
  let activeFn: string | null = null;
  let fnDisplay = new Map<string, number>(); // chapter-local order (1-based)
  let fnBase = 0; // work-wide offset: footnotes in all preceding chapters
  let pendingFn: { before: ReturnType<typeof cloneFootnotes>; after: ReturnType<typeof cloneFootnotes> } | null = null;
  const commitTimers = new Map<number, ReturnType<typeof setTimeout>>(); // keyed by MODEL row

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

  // Work metadata for the assist prompt (design doc D4): prefer the real
  // manifest (title/author/scheme/originalLanguage), fall back to the
  // model/fixture fields — same "manifest lookup can miss" case as
  // citationWork above. Lazy: read at request time, inside a closure.
  function assistWorkMeta(): AssistContext['work'] {
    try {
      const w = getWork(model.workId);
      return {
        title: w.title,
        author: w.author,
        originalLanguage: w.originalLanguage ?? 'greek',
        scheme: w.scheme,
      };
    } catch {
      return {
        title: model.workTitle,
        author: fixture.author,
        originalLanguage: 'greek',
        scheme: model.scheme,
      };
    }
  }

  // ── reactive UI state ──────────────────────────────────────────────────
  let ready = $state(false);
  // The flat display-row list the grid renders (design doc D6). Derived from
  // the model EXPLICITLY (the model itself is non-reactive): refreshed on
  // hydration, reload, split/un-split and structural undo/redo.
  let displayRows = $state<DisplayRow[]>([]);
  function refreshDisplayRows() {
    displayRows = expandRows(model.rows);
  }
  let flashRowIdx = $state(-1); // grid ordinal
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let greekMode = $state(false);
  let pendingPaste = $state<{ grid: number; segments: string[] } | null>(null);
  // Greek-cell context menu (design doc D6 §4): split on unsplit lines,
  // merge on split ones. `offset` is the snapped split point (null = the
  // click found no valid word gap → the status line, never a silent split).
  let ctxMenu = $state<{ x: number; y: number; row: number; segment: number; merge: boolean; offset: number | null } | null>(null);
  let pendingUnsplit = $state<{ row: number; boundary: number } | null>(null);
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
  function viewAt(row: number, segment = 0): EditorView | null {
    return views.get(vkey(row, segment)) ?? null;
  }
  function focusedView(): EditorView | null {
    return focusedRow >= 0 ? viewAt(focusedRow, focusedSegment) : null;
  }
  /** Grid ordinal of cell (row, segment); -1 when it isn't displayed. */
  function gridOrdinalOf(row: number, segment: number): number {
    return displayRows.findIndex((d) => d.rowIndex === row && d.segment === segment);
  }
  function focusedGrid(): number {
    return focusedRow >= 0 ? gridOrdinalOf(focusedRow, focusedSegment) : -1;
  }
  /** Cell (row, segment)'s current doc: live view when mounted, else the committed model. */
  function segmentDoc(row: number, segment: number): PMNode {
    const view = viewAt(row, segment);
    if (view) return view.state.doc;
    const r = model.rows[row];
    return docFromJSON(segment === 0 ? r.english : (r.english2?.[segment - 1] ?? emptyRowDocJSON()));
  }
  /** All of row i's segment docs in document order (live views win). */
  function rowDocs(i: number): PMNode[] {
    return englishDocsOf(model.rows[i]).map((_, s) => segmentDoc(i, s));
  }
  function rowDocsJSON(i: number): PMDocJSON[] {
    return rowDocs(i).map((d) => d.toJSON());
  }
  /** The whole Bekker line's English as ONE doc — segments joined by the
   * app's single-space convention (d6 §7 call-site folding). */
  function joinedRowDoc(i: number): PMNode {
    return docFromJSON(joinRowDocs(rowDocsJSON(i)));
  }
  function gridDocSize(g: number): number {
    const d = displayRows[g];
    return d ? segmentDoc(d.rowIndex, d.segment).content.size : 0;
  }
  /** The row's full structural state for an undo payload (docs + offsets). */
  function snapshotRow(i: number): RowSnapshot {
    const offsets = model.rows[i].splitOffsets;
    return {
      docs: rowDocs(i),
      ...(offsets && offsets.length > 0 ? { splitOffsets: offsets.slice() } : {}),
    };
  }

  function selRefOf(row: number, segment: number, state: EditorState): SelRef {
    return { row, segment, anchor: state.selection.anchor, head: state.selection.head };
  }

  function focusedSelRef(): SelRef | null {
    const view = focusedView();
    if (!view || focusedRow < 0) return null;
    return selRefOf(focusedRow, focusedSegment, view.state);
  }

  function flash(g: number) {
    flashRowIdx = -1;
    clearTimeout(flashTimer);
    // Re-set on the next frame so a repeated flash restarts the animation.
    requestAnimationFrame(() => {
      flashRowIdx = g;
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

  /** Commit MODEL ROW i — every mounted segment view's doc lands in
   * english/english2[k] (the model row is the commit unit, design doc D6). */
  function commitRowNow(i: number, changed = false) {
    const row = model.rows[i];
    if (!row) return;
    const count = segmentCount(row);
    // Ingest DOM mutations ProseMirror hasn't observed yet (its DOMObserver
    // batches the tail of a typing burst for ~20ms). Without this, a commit
    // fired by an instant chapter-switch/blur could read a stale doc and drop
    // the last keystrokes. This may dispatch (and schedule a commit timer),
    // so it runs BEFORE the timer check. domObserver is internal but stable.
    for (let s = 0; s < count; s++) {
      const view = viewAt(i, s);
      if (view) (view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
    }
    const timer = commitTimers.get(i);
    if (timer !== undefined) {
      clearTimeout(timer);
      commitTimers.delete(i);
      changed = true; // a scheduled commit only ever follows a doc change
    }
    let sawView = false;
    for (let s = 0; s < count; s++) {
      const view = viewAt(i, s);
      if (!view) continue;
      sawView = true;
      const doc = view.state.doc;
      if (s === 0) row.english = doc.toJSON();
      else row.english2![s - 1] = doc.toJSON();
      if (import.meta.env.DEV) assertRoundTrip(doc); // round-trip asserted on every commit
    }
    if (!sawView) return;
    history.breakCoalescing();
    if (changed) {
      markModelDirty();
      publishFootnotes(); // anchored-phrase snippets follow the text
    }
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

    refreshDisplayRows();
    fnDisplay = displayNumbers(model.rows.flatMap((_, i) => rowDocs(i).flatMap((d) => markerIdsIn(d))));

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

    // Rebuild every cell view that still exists in the reloaded model
    // (mirrors applyEntry's replaceWith for the undo/redo path). Cells whose
    // row/segment vanished (row-count drift, un-split in the incoming file)
    // fall through to the keyed {#each} remount below — their components
    // unmount and destroyView skips the stale commit.
    for (const [key, view] of views) {
      const [r, s] = key.split(':').map(Number);
      if (r >= model.rows.length || s >= segmentCount(model.rows[r])) continue;
      const row = model.rows[r];
      const newDoc = docFromJSON(s === 0 ? row.english : row.english2![s - 1]);
      view.dispatch(
        view.state.tr
          .replaceWith(0, view.state.doc.content.size, newDoc.content)
          .setMeta('appHistoryIgnore', true)
          .setMeta(FN_REFRESH, true),
      );
    }
    refreshDisplayRows();
    fnDisplay = displayNumbers(model.rows.flatMap((_, i) => rowDocs(i).flatMap((d) => markerIdsIn(d))));
    history.clear();
    refreshFnDisplay();
  }

  // ── footnote bookkeeping (model side; the plugin is view-only) ─────────
  function refreshFnDisplay() {
    const order: string[] = [];
    for (let i = 0; i < model.rows.length; i++) {
      // Segments walked in document order — a marker can live in a
      // continuation segment of a split row (design doc D6).
      for (const doc of rowDocs(i)) order.push(...markerIdsIn(doc));
    }
    fnDisplay = displayNumbers(order);
    for (const view of views.values()) {
      view.dispatch(view.state.tr.setMeta(FN_REFRESH, true).setMeta('appHistoryIgnore', true));
    }
    publishFootnotes();
  }

  function setActiveFootnote(id: string | null) {
    activeFn = id;
    session.activeFootnoteId = id;
    for (const view of views.values()) {
      view.dispatch(view.state.tr.setMeta(FN_REFRESH, true).setMeta('appHistoryIgnore', true));
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
      for (const doc of rowDocs(i)) {
        for (const run of runsOf(doc)) {
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
  function dispatchFor(row: number, segment: number) {
    return (tr: Transaction) => {
      const view = viewAt(row, segment);
      if (!view) return;
      const oldState = view.state;
      const newState = oldState.apply(tr);
      view.updateState(newState);

      if (tr.docChanged && !tr.getMeta('appHistoryIgnore')) {
        savedX = null;
        afterDocChange(row, segment, oldState, tr);
        scheduleCommit(row);
      }
      if (view.hasFocus() || (focusedRow === row && focusedSegment === segment)) syncToolbar(view.state);
    };
  }

  function afterDocChange(row: number, segment: number, oldState: EditorState, tr: Transaction) {
    const view = viewAt(row, segment)!;
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
        ? `typing:${row}.${segment}`
        : null;

    // Undo payload = the row's SEGMENT BUNDLE (design doc D6): the edited
    // segment's before/after doc plus the sibling segments as they stand.
    const offsets = model.rows[row].splitOffsets;
    const beforeDocs = rowDocs(row);
    beforeDocs[segment] = beforeDoc;
    const afterDocs = rowDocs(row); // segment's view already holds afterDoc

    history.push(
      {
        edits: [
          {
            row,
            before: { docs: beforeDocs, ...(offsets ? { splitOffsets: offsets.slice() } : {}) },
            after: { docs: afterDocs, ...(offsets ? { splitOffsets: offsets.slice() } : {}) },
          },
        ],
        fnBefore,
        fnAfter,
        selBefore: selRefOf(row, segment, oldState),
        selAfter: selRefOf(row, segment, view.state),
      },
      { coalesceKey },
    );

    if (removed.length > 0 || markerIdsIn(afterDoc).length !== beforeIds.length) refreshFnDisplay();
  }

  // ── undo/redo ──────────────────────────────────────────────────────────
  function applyEntry(entry: UndoEntry, dir: 'undo' | 'redo') {
    const firstRow = entry.edits[0]?.row ?? focusedRow;
    withScrollAnchor(firstRow >= 0 ? gridOrdinalOf(firstRow, 0) : -1, () => {
      for (const edit of entry.edits) {
        const snap = dir === 'undo' ? edit.before : edit.after;
        const row = model.rows[edit.row];
        if (!row) continue;
        // Restore the row's structural state (docs + offsets) — one ⌘Z fully
        // reverses a split/un-split (design doc D6).
        row.english = snap.docs[0].toJSON();
        if (snap.docs.length > 1) row.english2 = snap.docs.slice(1).map((d) => d.toJSON());
        else delete row.english2;
        if (snap.splitOffsets && snap.splitOffsets.length > 0) row.splitOffsets = snap.splitOffsets.slice();
        else delete row.splitOffsets;
        // Refresh surviving mounted views; vanished/new segments remount via
        // the keyed {#each} after refreshDisplayRows below.
        for (let s = 0; s < snap.docs.length; s++) {
          const view = viewAt(edit.row, s);
          if (!view) continue;
          view.dispatch(
            view.state.tr
              .replaceWith(0, view.state.doc.content.size, snap.docs[s].content)
              .setMeta('appHistoryIgnore', true)
              .setMeta(FN_REFRESH, true),
          );
        }
        markModelDirty();
      }
      history.breakCoalescing();
      refreshDisplayRows();
      const fnTable = dir === 'undo' ? entry.fnBefore : entry.fnAfter;
      if (fnTable) {
        model.footnotes = cloneFootnotes(fnTable);
        markModelDirty();
      }
      refreshFnDisplay();
      const sel = dir === 'undo' ? entry.selBefore : entry.selAfter;
      // tick(): a structural undo/redo may mount the target segment's view
      // on the next flush — focus once it exists.
      if (sel) void tick().then(() => focusSel(sel));
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
    const view = viewAt(sel.row, sel.segment);
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
    focusedSegment = sel.segment;
  }

  // ── scroll anchoring (design doc D1 §"Height sync") ────────────────────
  function withScrollAnchor(grid: number, fn: () => void) {
    const cellEl = grid >= 0 ? gridEl?.querySelector<HTMLElement>(`[data-row-en="${grid}"]`) : null;
    const before = cellEl?.getBoundingClientRect().top ?? null;
    fn();
    if (before === null || !cellEl) return;
    requestAnimationFrame(() => {
      const after = cellEl.getBoundingClientRect().top;
      const delta = after - before;
      if (delta !== 0 && rootEl) rootEl.scrollTop += delta;
    });
  }

  // ── focus / navigation (grid ordinals — display rows, design doc D6) ───
  function focusGridSel(g: number, pos: 'start' | 'end') {
    const d = displayRows[g];
    if (!d) return;
    const view = viewAt(d.rowIndex, d.segment);
    if (!view) return;
    view.focus();
    const target = pos === 'end' ? view.state.doc.content.size : 0;
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, target))
        .scrollIntoView()
        .setMeta('appHistoryIgnore', true),
    );
    focusedRow = d.rowIndex;
    focusedSegment = d.segment;
  }

  function focusRowEnd(g: number) {
    focusGridSel(g, 'end');
  }

  function focusRowStart(g: number) {
    focusGridSel(g, 'start');
  }

  function focusRowAtX(g: number, edge: 'first' | 'last', x: number) {
    const d = displayRows[g];
    if (!d) return;
    const view = viewAt(d.rowIndex, d.segment);
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
    focusedRow = d.rowIndex;
    focusedSegment = d.segment;
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
    for (let g = startRow; g <= endRow; g++) {
      const d = displayRows[g];
      if (!d) continue;
      const view = viewAt(d.rowIndex, d.segment);
      if (!view) continue;
      const size = view.state.doc.content.size;
      let from = 0;
      let to = size;
      try {
        if (g === startRow) from = Math.max(0, Math.min(view.posAtDOM(range.startContainer, range.startOffset), size));
        if (g === endRow) to = Math.max(0, Math.min(view.posAtDOM(range.endContainer, range.endOffset), size));
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
  // Row range = every MODEL row touched by the native selection, whether it
  // sits in English or Greek cells; caret-only → the focused row alone. A
  // paragraph-split line is ONE citable row (design doc D6 §7): both segment
  // cells fold back into a single CitationRowInput — one address, englishDoc
  // = the segments joined (joinRowDocs). Assembly (English/Greek extraction,
  // the exact clipboard string, scheme.formatCitation) is pure and lives in
  // copyCitation.ts — this only resolves DOM selection to rows and per-row
  // englishSelected text, mirroring onCopy above.
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
    let startG: number;
    let endG: number;
    let range: Range | null = null;

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      range = sel.getRangeAt(0);
      startG = anyRowOfDomNode(range.startContainer);
      endG = anyRowOfDomNode(range.endContainer);
      if (startG < 0 || endG < 0) {
        // Selection isn't inside the chapter grid at all — fall back to the
        // focused row, same as caret-only.
        range = null;
        startG = endG = focusedGrid();
      } else if (startG > endG) {
        [startG, endG] = [endG, startG];
      }
    } else {
      startG = endG = focusedGrid();
    }

    if (startG < 0 || endG < 0) {
      setStatus('Click into a row first');
      return;
    }

    const startRow = displayRows[startG].rowIndex;
    const endRow = displayRows[endG].rowIndex;

    const rows: CitationRowInput[] = [];
    for (let r = startRow; r <= endRow; r++) {
      // A split line folds to ONE citable row: full English = segments
      // joined by a single space (the app's one join convention).
      const englishDoc = joinedRowDoc(r);
      // englishSelected only when the selection PARTIALLY covers this row's
      // English (an endpoint inside an English cell, or a segment of a split
      // line outside the selected grid range). Fully covered / interior /
      // Greek-endpoint rows stay null and contribute their FULL English
      // inside buildCitationClipboardText.
      let englishSelected: string | null = null;
      if (range) {
        const parts: string[] = [];
        let partial = false;
        const count = segmentCount(model.rows[r]);
        for (let s = 0; s < count; s++) {
          const g = gridOrdinalOf(r, s);
          if (g < startG || g > endG) {
            partial = true; // this segment sits outside the selection
            continue;
          }
          const doc = segmentDoc(r, s);
          const size = doc.content.size;
          let from = 0;
          let to = size;
          const view = viewAt(r, s);
          const startsHere = g === startG && rowOfDomNode(range.startContainer) === g;
          const endsHere = g === endG && rowOfDomNode(range.endContainer) === g;
          if (view && (startsHere || endsHere)) {
            // Element-level endpoints (e.g. a triple-clicked paragraph, whose
            // Range boundary sits on the cell wrapper rather than inside a
            // text node) never get handed to posAtDOM: its default bias can
            // resolve a boundary offset back to an empty point, which — via
            // buildCitationClipboardText's "all-empty is nothing to cite"
            // check — surfaced as a false-negative "Nothing to cite" even
            // though rows were visibly selected. Treat such an endpoint as
            // full coverage of this cell from its edge instead.
            // resolveEndpointPos duck-types nodes as DomNodeLike (so it can be
            // unit-tested without jsdom); here the containers are real DOM
            // nodes, so the cast back to Node is sound.
            if (startsHere) {
              from = resolveEndpointPos(range.startContainer, range.startOffset, size, 'start', (node, offset) =>
                view.posAtDOM(node as unknown as Node, offset),
              );
            }
            if (endsHere) {
              to = resolveEndpointPos(range.endContainer, range.endOffset, size, 'end', (node, offset) =>
                view.posAtDOM(node as unknown as Node, offset),
              );
            }
            if (from > 0 || to < size) partial = true;
          }
          parts.push(doc.textBetween(from, to, ' ', ''));
        }
        if (partial) englishSelected = parts.join(' ').trim();
      }
      rows.push({
        address: model.rows[r].address,
        greek: model.rows[r].greek,
        englishDoc,
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

  // ── AI-assist (design doc D4, build spec §12 — UI slice) ────────────────
  // Lazy, first-use only: nothing here runs until the glyph or ⌘⏎ fires.
  // (assistRow, assistSeg) anchors the popover under that CELL — a request
  // from a continuation segment targets that segment for Insert, but the
  // context is assembled per ADDRESS (a split line is one context line, its
  // draft = segments joined; the ±6 window counts Bekker LINES — d6 §7).
  let assistRow = $state(-1);
  let assistSeg = $state(0);
  let assistUi = $state<AssistUiState | null>(null);

  // ── AI reference popups (right-click Greek → "AI reference") ──────────────
  // Independent of the translate flow: the AI's own translation appears in a
  // FLOATING popup that never touches the English cell and stays open until
  // the user closes it. Multiple can coexist, so this is an ARRAY; each entry
  // owns its own AbortController (closing a popup aborts its in-flight
  // request). All are torn down on chapter switch / unmount.
  type RefPopupState =
    | { kind: 'thinking' }
    | { kind: 'text'; text: string }
    | { kind: 'error'; text: string };
  interface RefPopup {
    id: number;
    x: number;
    y: number;
    state: RefPopupState;
    abort: AbortController;
  }
  let refPopups = $state<RefPopup[]>([]);
  let refPopupSeq = 0;

  const assistCtl = new AssistController({
    getProvider: getAssistProvider,
    copyPayload: async (ctx) => {
      try {
        await writeClipboardText(buildClipboardPayload(ctx));
        return true;
      } catch {
        return false;
      }
    },
    onState: (s) => {
      assistUi = s;
    },
  });

  /** Suggest-for-row (glyph click / ⌘⏎). Guards run BEFORE any provider
   * work: no active cell → no-op; no Greek on the LINE → NO_LINE_MESSAGE. */
  function invokeAssist(row: number, segment: number) {
    if (row < 0 || row >= model.rows.length || !viewAt(row, segment)) return;
    assistRow = row;
    assistSeg = segment;
    if (model.rows[row].greek.trim().length === 0) {
      assistCtl.cancel();
      assistUi = { kind: 'message', text: NO_LINE_MESSAGE };
      return;
    }
    void runAssist(row, segment);
  }

  async function runAssist(row: number, segment: number) {
    const settings = await loadSettings(); // includeDraft (John: default ON)
    if (destroyed || assistRow !== row || assistSeg !== segment) return;
    const ctx = buildAssistContext({
      rowCount: model.rows.length,
      rowAt: (i) => ({ address: model.rows[i].address.raw, greek: model.rows[i].greek }),
      // Live views when mounted, committed model otherwise — the draft the
      // user SEES is the draft that goes out as context. A split line is ONE
      // context line: its segments joined (d6 §7 call-site folding).
      draftAt: (i) => plainRowText(joinedRowDoc(i)),
      targetIndex: row,
      includeDraft: settings.assist?.includeDraft ?? true,
      work: assistWorkMeta(),
      book: { index: model.book, label: model.bookLabel },
      chapter: model.chapter,
    });
    await assistCtl.request(ctx);
  }

  function dismissAssist() {
    assistCtl.cancel();
    assistUi = null;
    assistRow = -1;
    assistSeg = 0;
  }

  /** Right-click the Greek → "AI reference": run the SAME provider the
   * translate flow uses, but with `mode: 'reference'`, and show the result in
   * a floating popup that never touches the English cell. Guards run first
   * (row valid, Greek non-empty → else a brief status). Positions the popup at
   * the click point (x, y). Multiple popups coexist; each has its own
   * AbortController so closing one aborts only its request. */
  function invokeReference(row: number, segment: number, x: number, y: number) {
    if (row < 0 || row >= model.rows.length || !viewAt(row, segment)) return;
    if (model.rows[row].greek.trim().length === 0) {
      setStatus(NO_LINE_MESSAGE);
      return;
    }
    const id = ++refPopupSeq;
    const abort = new AbortController();
    refPopups = [...refPopups, { id, x, y, state: { kind: 'thinking' }, abort }];
    void runReference(id, row, abort.signal);
  }

  function setRefPopupState(id: number, state: RefPopupState) {
    refPopups = refPopups.map((p) => (p.id === id ? { ...p, state } : p));
  }

  async function runReference(id: number, row: number, signal: AbortSignal) {
    let provider: AssistProvider;
    try {
      provider = await getAssistProvider();
    } catch {
      if (!signal.aborted) setRefPopupState(id, { kind: 'error', text: GENERIC_ERROR_MESSAGE });
      return;
    }
    if (signal.aborted || destroyed) return;

    const settings = await loadSettings();
    if (signal.aborted || destroyed) return;

    const ctx: AssistContext = {
      mode: 'reference',
      ...buildAssistContext({
        rowCount: model.rows.length,
        rowAt: (i) => ({ address: model.rows[i].address.raw, greek: model.rows[i].greek }),
        draftAt: (i) => plainRowText(joinedRowDoc(i)),
        targetIndex: row,
        includeDraft: settings.assist?.includeDraft ?? true,
        work: assistWorkMeta(),
        book: { index: model.book, label: model.bookLabel },
        chapter: model.chapter,
      }),
    };

    let result: AssistResult;
    try {
      result = await provider.suggest(ctx, signal);
    } catch {
      if (!signal.aborted && !destroyed) setRefPopupState(id, { kind: 'error', text: GENERIC_ERROR_MESSAGE });
      return;
    }
    if (signal.aborted || destroyed) return;

    if (result.kind === 'suggestion') {
      setRefPopupState(id, { kind: 'text', text: result.text });
    } else {
      // clipboard fallback or error — both carry one vetted plain sentence.
      setRefPopupState(id, { kind: 'error', text: result.message });
    }
  }

  /** Close a reference popup: abort its in-flight request and drop it. */
  function closeRefPopup(id: number) {
    const p = refPopups.find((q) => q.id === id);
    p?.abort.abort();
    refPopups = refPopups.filter((q) => q.id !== id);
  }

  /** Copy a reference popup's text to the clipboard (only in the text state). */
  async function copyRefPopup(id: number) {
    const p = refPopups.find((q) => q.id === id);
    if (!p || p.state.kind !== 'text') return;
    try {
      await writeClipboardText(p.state.text);
      setStatus('Reference copied.');
    } catch {
      setStatus('Could not copy — try again.');
    }
  }

  /** The assist→editor mutation (RowEditor.insertSuggestion delegates here):
   * ONE normal transaction on the target CELL's view, dispatched through
   * dispatchFor — the exact same pipeline as typing (app undo, dirty
   * tracking, commit-on-idle). */
  function insertSuggestionIntoRow(row: number, segment: number, text: string) {
    const view = viewAt(row, segment);
    if (!view) return;
    const tr = buildInsertTransaction(view.state, text);
    if (!tr) return;
    history.breakCoalescing();
    resetGreekRun(view);
    view.dispatch(tr);
    view.focus();
    focusedRow = row;
    focusedSegment = segment;
  }

  /** Dev-only browser-harness hookup (mirrors ImportDialog's devHarness
   * gating): set `window.__assistFake` at localhost:1421 to exercise the
   * full popover/Insert flow without Tauri —
   *   true            → a canned suggestion
   *   'some text'     → that suggestion text
   *   { kind: ... }   → any AssistResult (error/clipboard/suggestion)
   * Optional `window.__assistFakeDelayMs` (default 600) exercises Thinking….
   * The import.meta.env.DEV gate strips all of this from production builds. */
  async function devFakeAssistProvider(): Promise<AssistProvider | null> {
    if (!import.meta.env.DEV || isTauri()) return null;
    const w = window as unknown as { __assistFake?: unknown; __assistFakeDelayMs?: number };
    const raw = w.__assistFake;
    if (raw === undefined || raw === null || raw === false) return null;
    const { FakeProvider } = await import('../assist/fakeProvider');
    const result: AssistResult =
      typeof raw === 'string'
        ? { kind: 'suggestion', text: raw }
        : typeof raw === 'object' && 'kind' in (raw as object)
          ? (raw as AssistResult)
          : { kind: 'suggestion', text: 'and this is the substance and actuality of each thing.' };
    return new FakeProvider({ result, delayMs: w.__assistFakeDelayMs ?? 600 });
  }

  /** Provider for THIS request: dev fake (browser harness) → Tauri flow
   * (cached cliPath / resolution ladder / clipboard floor, see
   * assistController.resolveTauriAssistProvider) → plain browser clipboard. */
  async function getAssistProvider(): Promise<AssistProvider> {
    const fake = await devFakeAssistProvider();
    if (fake) return fake;
    if (!isTauri()) {
      return new ClipboardProvider({ writeText: writeClipboardText });
    }
    const [{ invoke }, fs, path] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/plugin-fs'),
      import('@tauri-apps/api/path'),
    ]);
    return resolveTauriAssistProvider({
      loadSettings,
      updateSettings,
      exists: (p) => fs.exists(p),
      home: () => path.homeDir(),
      invokeRun: ((cmd, args) => invoke(cmd, args)) as RunInvokeFn,
      invokeWhich: (candidates, binName) =>
        invoke<string | null>('assist_which', { candidates, binName }),
      writeClipboard: writeClipboardText,
    });
  }

  // ── line split / un-split (design doc D6 §4) ───────────────────────────
  /** Code-unit offset of the right-click position within the Greek cell's
   * text (WebKit caretRangeFromPoint / Firefox caretPositionFromPoint);
   * null when the click missed the text. Resolved via a Range from the
   * cell's start rather than the raw node-local offset: the cell normally
   * holds a single text node, but App.svelte's click-to-parse flash can
   * transiently split it into siblings (same gotcha its caretOffsetInCell
   * documents), and a fragment-local offset would then be wrong. */
  function caretOffsetFromPoint(e: MouseEvent): number | null {
    const cell = e.currentTarget as HTMLElement | null;
    if (!cell) return null;
    const doc = document as Document & {
      caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?(x: number, y: number): Range | null;
    };
    let node: Node | null = null;
    let offset = 0;
    if (typeof doc.caretPositionFromPoint === 'function') {
      const p = doc.caretPositionFromPoint(e.clientX, e.clientY);
      if (p) {
        node = p.offsetNode;
        offset = p.offset;
      }
    } else if (typeof doc.caretRangeFromPoint === 'function') {
      const r = doc.caretRangeFromPoint(e.clientX, e.clientY);
      if (r) {
        node = r.startContainer;
        offset = r.startOffset;
      }
    }
    if (!node || !cell.contains(node)) return null;
    try {
      const full = document.createRange();
      full.selectNodeContents(cell);
      full.setEnd(node, offset);
      return full.toString().length;
    } catch {
      return null;
    }
  }

  function onGreekContextMenu(e: MouseEvent, g: number) {
    e.preventDefault();
    const d = displayRows[g];
    if (!d) return;
    const row = model.rows[d.rowIndex];
    if (segmentCount(row) > 1) {
      // Already split (Phase-1 UI is single-split): offer the merge.
      ctxMenu = { x: e.clientX, y: e.clientY, row: d.rowIndex, segment: d.segment, merge: true, offset: null };
      return;
    }
    // Split gesture (John's §4.1): the offset is the click's nearest word
    // gap, snapped BEFORE the clicked word; isValidSplitOffset (via
    // snapToWordStart) rejects offset 0 and the line end.
    const within = caretOffsetFromPoint(e);
    const offset = within === null ? null : snapToWordStart(row.greek, d.greekStart + within);
    ctxMenu = { x: e.clientX, y: e.clientY, row: d.rowIndex, segment: d.segment, merge: false, offset };
  }

  function menuSplit() {
    const m = ctxMenu;
    ctxMenu = null;
    if (!m || m.merge) return;
    if (m.offset === null) {
      setStatus('Choose the Greek word where the new paragraph starts.');
      return;
    }
    performSplit(m.row, m.offset);
  }

  function menuMerge() {
    const m = ctxMenu;
    ctxMenu = null;
    if (!m || !m.merge) return;
    requestUnsplit(m.row, m.segment);
  }

  /** Right-click the Greek → "Translate with AI" (the discoverable entry
   * point; the hover glyph + ⌘⏎ still work). Translates the whole Bekker
   * line via the same per-row assist flow; the suggestion lands in this
   * row's English cell. */
  function menuAssist() {
    const m = ctxMenu;
    ctxMenu = null;
    if (!m) return;
    invokeAssist(m.row, m.segment);
  }

  /** Right-click the Greek → "AI reference": open a floating reference popup
   * near the click point. Independent of the translate/cell flow. */
  function menuReference() {
    const m = ctxMenu;
    ctxMenu = null;
    if (!m) return;
    invokeReference(m.row, m.segment, m.x, m.y);
  }

  /** Split model row r at a validated Greek offset — ONE undo entry that
   * captures the row's structural before/after (offsets + both English
   * docs) and restores focus on ⌘Z. */
  function performSplit(r: number, offset: number) {
    const row = model.rows[r];
    if (!row) return;
    commitRowNow(r); // live edits land in the model before the snapshot
    const before = snapshotRow(r);
    const selBefore = focusedSelRef();
    // English division (John's §4.2): at the caret when it's currently in
    // THIS row's English cell; otherwise all existing English stays in
    // segment 0 and the continuation starts empty.
    const caret = focusedRow === r && focusedSegment === 0 ? (viewAt(r, 0)?.state.selection.head ?? null) : null;
    const result = splitUnsplitRow(row, offset, caret);
    if (!result) {
      setStatus('Choose the Greek word where the new paragraph starts.');
      return;
    }
    dismissAssist();
    history.breakCoalescing();

    row.english = result.english;
    row.english2 = result.english2;
    row.splitOffsets = result.splitOffsets;
    refreshDisplayRows();

    // Segment 0 keeps its mounted view (stable key) — push the divided doc
    // into it; the continuation mounts fresh from the model.
    const seg0 = viewAt(r, 0);
    if (seg0) {
      seg0.dispatch(
        seg0.state.tr
          .replaceWith(0, seg0.state.doc.content.size, docFromJSON(result.english).content)
          .setMeta('appHistoryIgnore', true)
          .setMeta(FN_REFRESH, true),
      );
    }

    const selAfter: SelRef = { row: r, segment: 1, anchor: 0, head: 0 };
    history.push({
      edits: [{ row: r, before, after: snapshotRow(r) }],
      selBefore,
      selAfter,
    });
    markModelDirty();
    refreshFnDisplay();
    void tick().then(() => focusSel(selAfter));
  }

  /** Un-split entry point (context menu on either segment). Confirms ONLY
   * when both English cells hold text (John's adopted default); an empty
   * side rejoins silently. */
  function requestUnsplit(r: number, segment: number) {
    const row = model.rows[r];
    if (!row || segmentCount(row) < 2) return;
    const boundary = Math.min(segment === 0 ? 0 : segment - 1, segmentCount(row) - 2);
    commitRowNow(r);
    if (mergeNeedsConfirm(row, boundary)) {
      pendingUnsplit = { row: r, boundary };
      return;
    }
    performUnsplit(r, boundary);
  }

  function confirmUnsplit() {
    const p = pendingUnsplit;
    pendingUnsplit = null;
    if (p) performUnsplit(p.row, p.boundary);
  }

  function cancelUnsplit() {
    pendingUnsplit = null;
  }

  /** Merge segments boundary/boundary+1 back into one — English rejoined
   * with a single space (joinRowDocs), ONE undo entry. NOT the forbidden
   * Bekker merge: both segments share one address. */
  function performUnsplit(r: number, boundary: number) {
    const row = model.rows[r];
    if (!row) return;
    commitRowNow(r);
    const before = snapshotRow(r);
    const selBefore = focusedSelRef();
    const merged = mergeSegments(row, boundary);
    if (!merged) return;
    dismissAssist();
    history.breakCoalescing();

    row.english = merged.english;
    if (merged.english2) row.english2 = merged.english2;
    else delete row.english2;
    if (merged.splitOffsets) row.splitOffsets = merged.splitOffsets;
    else delete row.splitOffsets;
    refreshDisplayRows();

    // The surviving segment keeps its view — push the merged doc into it;
    // the vanished continuation unmounts (destroyView skips the stale commit).
    const keep = viewAt(r, boundary);
    if (keep) {
      const json = boundary === 0 ? row.english : row.english2![boundary - 1];
      keep.dispatch(
        keep.state.tr
          .replaceWith(0, keep.state.doc.content.size, docFromJSON(json).content)
          .setMeta('appHistoryIgnore', true)
          .setMeta(FN_REFRESH, true),
      );
    }

    const selAfter: SelRef = { row: r, segment: boundary, anchor: merged.joinPos, head: merged.joinPos };
    history.push({
      edits: [{ row: r, before, after: snapshotRow(r) }],
      selBefore,
      selAfter,
    });
    markModelDirty();
    refreshFnDisplay();
    void tick().then(() => focusSel(selAfter));
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
  /** The (row, segment) whose doc holds footnote id's marker, if any. */
  function anchorLocOf(id: string): { row: number; segment: number } | null {
    for (let i = 0; i < model.rows.length; i++) {
      const docs = rowDocs(i);
      for (let s = 0; s < docs.length; s++) {
        if (markerIdsIn(docs[s]).includes(id)) return { row: i, segment: s };
      }
    }
    return null;
  }

  function focusFootnote(id: string) {
    setActiveFootnote(id);
    const loc = anchorLocOf(id);
    if (!loc) return;
    const g = gridOrdinalOf(loc.row, loc.segment);
    if (g < 0) return;
    gridEl
      ?.querySelector(`[data-row-en="${g}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /** Delete marker + fnRef mark + body as ONE undo entry. */
  function deleteFootnote(id: string) {
    const fnIdx = model.footnotes.findIndex((f) => f.id === id);
    const loc = anchorLocOf(id);
    if (fnIdx < 0 && !loc) return;

    history.breakCoalescing();
    const fnBefore = cloneFootnotes(model.footnotes);
    if (fnIdx >= 0) model.footnotes.splice(fnIdx, 1);
    const fnAfter = cloneFootnotes(model.footnotes);

    if (loc) {
      const view = viewAt(loc.row, loc.segment);
      if (view) {
        const oldState = view.state;
        const offsets = model.rows[loc.row].splitOffsets;
        const beforeDocs = rowDocs(loc.row); // marker still present here
        const runs: InlineRun[] = runsOf(oldState.doc)
          .filter((r) => !(r.kind === 'marker' && r.id === id))
          .map((r) =>
            r.kind === 'text' && r.marks.fnRef === id ? { ...r, marks: { ...r.marks, fnRef: undefined } } : r,
          );
        const after = buildRowDoc(runs);
        view.dispatch(
          view.state.tr
            .replaceWith(0, oldState.doc.content.size, after.content)
            .setMeta('appHistoryIgnore', true)
            .setMeta(FN_REFRESH, true),
        );
        commitRowNow(loc.row, true);
        history.push({
          edits: [
            {
              row: loc.row,
              before: { docs: beforeDocs, ...(offsets ? { splitOffsets: offsets.slice() } : {}) },
              after: snapshotRow(loc.row),
            },
          ],
          fnBefore,
          fnAfter,
          selBefore: selRefOf(loc.row, loc.segment, oldState),
          selAfter: selRefOf(loc.row, loc.segment, view.state),
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
  function requestPasteDistribute(grid: number, segments: string[]) {
    pendingPaste = { grid, segments };
  }

  function confirmPaste() {
    const pending = pendingPaste;
    pendingPaste = null;
    if (!pending) return;
    const { grid, segments } = pending;

    const first = displayRows[grid];
    if (!first) return;
    const firstView = viewAt(first.rowIndex, first.segment);
    if (!firstView) return;
    const selBefore = selRefOf(first.rowIndex, first.segment, firstView.state);

    withScrollAnchor(grid, () => {
      // Group edits per MODEL row (the undo payload is the row's segment
      // bundle) while distributing text per DISPLAY row.
      const touched: number[] = [];
      const beforeByRow = new Map<number, RowSnapshot>();
      let applied = 0;
      for (let k = 0; k < segments.length; k++) {
        const d = displayRows[grid + k];
        if (!d) break;
        const view = viewAt(d.rowIndex, d.segment);
        if (!view) break;
        if (!beforeByRow.has(d.rowIndex)) {
          beforeByRow.set(d.rowIndex, snapshotRow(d.rowIndex));
          touched.push(d.rowIndex);
        }
        const beforeDoc = view.state.doc;
        const runs: InlineRun[] =
          k === 0
            ? [...runsOf(beforeDoc), { kind: 'text', text: segments[k], marks: {} }]
            : [{ kind: 'text', text: segments[k], marks: {} }];
        const after = buildRowDoc(runs);
        view.dispatch(
          view.state.tr
            .replaceWith(0, view.state.doc.content.size, after.content)
            .setMeta('appHistoryIgnore', true),
        );
        applied++;
      }
      const edits: UndoEntry['edits'] = touched.map((r) => {
        commitRowNow(r, true);
        return { row: r, before: beforeByRow.get(r)!, after: snapshotRow(r) };
      });
      history.breakCoalescing();
      const lastG = grid + applied - 1;
      const lastD = applied > 0 ? displayRows[lastG] : null;
      history.push({
        edits,
        selBefore,
        selAfter: lastD
          ? {
              row: lastD.rowIndex,
              segment: lastD.segment,
              anchor: segmentDoc(lastD.rowIndex, lastD.segment).content.size,
              head: segmentDoc(lastD.rowIndex, lastD.segment).content.size,
            }
          : null,
      });
      if (lastD) focusRowEnd(lastG);
    });
    setStatus(`Pasted ${segments.length} lines into ${segments.length} rows`);
  }

  function cancelPaste() {
    const grid = pendingPaste?.grid ?? -1;
    pendingPaste = null;
    if (grid >= 0) focusRowEnd(grid);
  }

  // ── per-row plugin wiring ──────────────────────────────────────────────
  // The context is bound to the CELL identity (row, segment); its `index` is
  // a live getter for the current grid ordinal, so navigation stays correct
  // when a split above shifts the grid (design doc D6, deep-reasoner §3).
  function rowContext(row: number, segment: number): RowContext {
    return {
      get index() {
        return gridOrdinalOf(row, segment);
      },
      rowCount: () => displayRows.length,
      isRowEmpty: (k) => gridDocSize(k) === 0,
      isContinuation: (k) => displayRows[k]?.continuation ?? false,
      focusRowEnd,
      focusRowStart,
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
      requestAssist: () => invokeAssist(row, segment),
    };
  }

  const host: RowViewHost = {
    createView(row, segment, el) {
      const r = model.rows[row];
      const json = segment === 0 ? r.english : (r.english2?.[segment - 1] ?? emptyRowDocJSON());
      const state = EditorState.create({
        doc: docFromJSON(json),
        plugins: [
          greekInput({ isGreekMode: () => greekMode }),
          ...rowPlugins(rowContext(row, segment)),
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
        dispatchTransaction: dispatchFor(row, segment),
        handleDOMEvents: {
          focus: (v) => {
            focusedRow = row;
            focusedSegment = segment;
            syncToolbar(v.state);
            return false;
          },
          blur: () => {
            commitRowNow(row);
            return false;
          },
        },
      });
      views.set(vkey(row, segment), view);
    },
    destroyView(row, segment) {
      const view = views.get(vkey(row, segment));
      if (!view) return;
      // Commit only while the model still HAS this segment — after an
      // un-split the stale continuation unmounts and must not clobber the
      // freshly merged row.
      if (row < model.rows.length && segment < segmentCount(model.rows[row])) commitRowNow(row);
      view.destroy();
      views.delete(vkey(row, segment));
    },
    requestAssist: (row, segment) => invokeAssist(row, segment),
    assistStateFor: (row, segment) => (assistRow === row && assistSeg === segment ? assistUi : null),
    insertSuggestion: (row, segment, text) => insertSuggestionIntoRow(row, segment, text),
    dismissAssist,
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
    if (e.key === 'Escape' && ctxMenu) {
      e.preventDefault();
      ctxMenu = null;
      return;
    }
    if (e.key === 'Escape' && pendingUnsplit) {
      e.preventDefault();
      cancelUnsplit();
      return;
    }
    if (e.key === 'Escape' && assistUi) {
      e.preventDefault();
      dismissAssist();
      return;
    }
    if (e.key === 'Escape' && pendingPaste) {
      e.preventDefault();
      cancelPaste();
    }
  }

  // Context menu: any mousedown outside it closes it (capture phase so a
  // click that also focuses a row still closes the menu first).
  $effect(() => {
    if (!ctxMenu) return;
    const close = (ev: MouseEvent) => {
      const target = ev.target as Element | null;
      if (!target?.closest('.ctx-menu')) ctxMenu = null;
    };
    window.addEventListener('mousedown', close, true);
    return () => window.removeEventListener('mousedown', close, true);
  });

  // Panel open/close: repaint anchor highlights on every row.
  $effect(() => {
    const open = session.fnPanelOpen;
    if (!ready) return;
    for (const view of views.values()) {
      view.dispatch(view.state.tr.setMeta(FN_REFRESH, true).setMeta('appHistoryIgnore', true));
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
      assistCtl.cancel(); // in-flight suggestion can never land in a gone chapter
      // Abort every open reference popup's in-flight request and drop them.
      for (const p of refPopups) p.abort.abort();
      refPopups = [];
      window.removeEventListener('keydown', onWindowKeydown);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityHidden);
      unsubIndex();
      // Chapter switch: commit every row, then flush BEFORE the next chapter
      // loads (loadChapterFile awaits this write via the pending registry).
      for (let i = 0; i < model.rows.length; i++) commitRowNow(i);
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
      {#each displayRows as d, g (d.key)}
        <GreekCell
          gridRow={g}
          greek={d.greekSlice}
          continuation={d.continuation}
          flash={flashRowIdx === g}
          onContext={(e) => onGreekContextMenu(e, g)}
        />
        <RowGutter gridRow={g} raw={d.address.raw} />
        <EnglishCell
          gridRow={g}
          row={d.rowIndex}
          segment={d.segment}
          {host}
          flash={flashRowIdx === g}
          pasteConfirm={pendingPaste?.grid === g ? pendingPaste.segments.length : null}
          onPasteConfirm={confirmPaste}
          onPasteCancel={cancelPaste}
          unsplitConfirm={pendingUnsplit?.row === d.rowIndex && d.segment === 0}
          onUnsplitConfirm={confirmUnsplit}
          onUnsplitCancel={cancelUnsplit}
        />
      {/each}
    </div>
  {/if}

  {#if ctxMenu}
    <div class="ctx-menu" role="menu" style="left: {ctxMenu.x}px; top: {ctxMenu.y}px">
      <button class="ctx-menu-item" type="button" role="menuitem" onclick={menuAssist}>Translate with AI</button>
      <button class="ctx-menu-item" type="button" role="menuitem" onclick={menuReference}>AI reference</button>
      {#if ctxMenu.merge}
        <button class="ctx-menu-item" type="button" role="menuitem" onclick={menuMerge}>Merge paragraph back</button>
      {:else}
        <button class="ctx-menu-item" type="button" role="menuitem" onclick={menuSplit}>Start new paragraph here</button>
      {/if}
    </div>
  {/if}

  {#each refPopups as p (p.id)}
    <ReferencePopup
      x={p.x}
      y={p.y}
      body={p.state}
      onClose={() => closeRefPopup(p.id)}
      onCopy={() => void copyRefPopup(p.id)}
    />
  {/each}

  {#if session.status}
    <div class="status-pill" role="status">{session.status.text}</div>
  {/if}
</div>
