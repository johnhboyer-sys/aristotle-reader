// Editor session bridge — connects the ChapterEditor (which owns the rows,
// model and undo stack) to chrome that lives elsewhere in the app shell
// (EditorToolbar in the top bar, the status pill). Svelte 5 runes module:
// `session` is reactive display state; `commands` proxies to whichever
// ChapterEditor is currently mounted.

export interface ActiveMarks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  greek: boolean;
}

export interface StatusMsg {
  text: string;
  ts: number;
}

/** One footnote as the panel sees it (published by ChapterEditor). */
export interface FootnoteListEntry {
  /** Chapter-local id (stored in the file); never shown to the user. */
  id: string;
  /** Work-wide continuous display number; null while unanchored. */
  displayNumber: number | null;
  /** Text of the anchored phrase ('' when the marker has no phrase). */
  snippet: string;
  /** Body in serialize.ts row markup. */
  body: string;
  anchored: boolean;
  /** Row index of the anchor marker; null while unanchored. */
  row: number | null;
}

/** Shown when the open chapter changed on disk while there are unsaved edits
 * (Drive-folder sync, build spec §11) — the app shell renders the prompt;
 * ChapterEditor supplies the two resolutions. */
export interface ExternalChangePrompt {
  onKeepMine(): void;
  onLoadTheirs(): void;
}

export const session = $state({
  hasEditor: false,
  greekMode: false,
  activeMarks: { bold: false, italic: false, underline: false, greek: false } as ActiveMarks,
  status: null as StatusMsg | null,
  // ── footnote panel bridge ──
  /** True while FootnotePanel is mounted (drives the always-on anchor highlight). */
  fnPanelOpen: false,
  /** This chapter's footnotes in document order (unanchored ones last). */
  footnotes: [] as FootnoteListEntry[],
  /** The active (highlighted) footnote id, mirrored from the editor. */
  activeFootnoteId: null as string | null,
  /** Set after footnote creation so an open panel focuses the new body field. */
  fnFocusRequest: null as { id: string; ts: number } | null,
  // ── Drive-folder sync bridge (build spec §11) ──
  /** Non-null while the "keep mine / load theirs" choice is pending. */
  externalChangePrompt: null as ExternalChangePrompt | null,
});

export interface EditorCommands {
  toggleMark(name: 'bold' | 'italic' | 'underline'): void;
  toggleGreek(): void;
  insertFootnote(): void;
  undo(): void;
  redo(): void;
  copyCitation(): void;
}

/** Footnote actions the panel proxies to the mounted ChapterEditor. */
export interface FootnoteCommands {
  /** Highlight the footnote and scroll its anchor row into view. */
  focusFootnote(id: string): void;
  /** Remove marker + fnRef mark + body as ONE undo entry. */
  deleteFootnote(id: string): void;
  /** Re-anchor an unanchored footnote at the current selection. */
  reanchorFootnote(id: string): void;
  /** Commit a body edit (markup string); pushes its own undo entry. */
  updateFootnoteBody(id: string, body: string): void;
  setActiveFootnote(id: string | null): void;
}

/** Sync command the app shell drives on window focus (build spec §11). */
export interface SyncCommands {
  /** Stat the open chapter's file; reload seamlessly, prompt, or no-op per
   * the decision matrix in lib/library/sync.ts. Safe to call anytime;
   * no-ops if the file hasn't changed. */
  checkExternalChange(): Promise<void>;
}

let current: EditorCommands | null = null;
let currentFn: FootnoteCommands | null = null;
let currentSync: SyncCommands | null = null;

export function registerEditor(cmds: EditorCommands, fn?: FootnoteCommands, sync?: SyncCommands): void {
  current = cmds;
  currentFn = fn ?? null;
  currentSync = sync ?? null;
  session.hasEditor = true;
}

export function unregisterEditor(cmds: EditorCommands): void {
  if (current === cmds) {
    current = null;
    currentFn = null;
    currentSync = null;
    session.hasEditor = false;
    session.greekMode = false;
    session.activeMarks = { bold: false, italic: false, underline: false, greek: false };
    session.footnotes = [];
    session.activeFootnoteId = null;
    session.fnFocusRequest = null;
    session.externalChangePrompt = null;
  }
}

/** Safe to call from anywhere; no-ops when no editor is mounted. */
export const commands: EditorCommands = {
  toggleMark: (name) => current?.toggleMark(name),
  toggleGreek: () => current?.toggleGreek(),
  insertFootnote: () => current?.insertFootnote(),
  undo: () => current?.undo(),
  redo: () => current?.redo(),
  copyCitation: () => current?.copyCitation(),
};

/** Footnote-panel proxy; no-ops when no editor is mounted. */
export const fnCommands: FootnoteCommands = {
  focusFootnote: (id) => currentFn?.focusFootnote(id),
  deleteFootnote: (id) => currentFn?.deleteFootnote(id),
  reanchorFootnote: (id) => currentFn?.reanchorFootnote(id),
  updateFootnoteBody: (id, body) => currentFn?.updateFootnoteBody(id, body),
  setActiveFootnote: (id) => currentFn?.setActiveFootnote(id),
};

/** App-shell proxy for the sync check; no-op when no editor is mounted (e.g.
 * the empty state, or between chapter switches). */
export const syncCommands: SyncCommands = {
  checkExternalChange: async () => {
    await currentSync?.checkExternalChange();
  },
};

let statusTimer: ReturnType<typeof setTimeout> | undefined;

/** Transient one-line status hint / toast (bottom pill, auto-clears). */
export function setStatus(text: string, ms = 2600): void {
  session.status = { text, ts: Date.now() };
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    session.status = null;
  }, ms);
}
