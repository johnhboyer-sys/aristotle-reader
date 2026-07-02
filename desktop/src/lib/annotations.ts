// Annotations: highlights and notes, modelled on the W3C Web Annotation Data
// Model — ONE underlying type (a highlight is an annotation with an empty
// body), filterable in the UI, never two systems.
//
// Anchor rules (deliberate design, not implementation detail):
//   - GREEK targets anchor to the Bekker citation (column + line + word index
//     within the line) — the stable spine every translation maps onto.
//   - ENGLISH targets anchor to character offsets within ONE specific
//     translation's prose for one column segment — never to a Bekker estimate.
//     This decouples annotation stability from alignment accuracy: refining a
//     translation's alignment later cannot move an English-side annotation.
//   - `layer` says where the annotation lives: 'greek' | 'translation:<id>' |
//     'both'. The panel always shows greek/both; annotations on a translation
//     other than the active one are DIMMED, not hidden.
//
// Storage: one plain JSON file per work ($APPDATA/annotations/<work>.json;
// localStorage in the browser harness) — inspectable, backupable files.
//
// Rendering uses the CSS Custom Highlight API: anchors are resolved to Ranges
// after the Reader renders and registered under ::highlight() names — the
// Reader's DOM is never mutated.

export interface GreekTarget {
  kind: 'greek';
  book: number;
  start: { column: string; line: number; word: number };  // word = .tok index in line
  end: { column: string; line: number; word: number };    // inclusive
}

export interface EnglishTarget {
  kind: 'english';
  book: number;
  translation: string;   // translation id whose wording was annotated
  column: string;        // segment column the selection lived in
  start: number;         // char offsets into the column's prose textContent
  end: number;           //   (concatenated .bk-seg text — Bekker numerals excluded)
}

export interface Annotation {
  id: string;
  work: string;
  created: string;       // ISO 8601
  body: string;          // '' = highlight; text = note
  layer: 'greek' | `translation:${string}` | 'both';
  target: GreekTarget | EnglishTarget;
  exact: string;         // the selected text, quoted verbatim at creation time
}

// ── storage ──────────────────────────────────────────────────────────────────

import { isTauri } from './runtime';

interface AnnStore {
  read(work: string): Promise<Annotation[]>;
  write(work: string, anns: Annotation[]): Promise<void>;
}

const browserStore: AnnStore = {
  async read(work) {
    try { return JSON.parse(localStorage.getItem(`annotations:${work}`) ?? '[]'); }
    catch { return []; }
  },
  async write(work, anns) {
    localStorage.setItem(`annotations:${work}`, JSON.stringify(anns));
  },
};

async function tauriStore(): Promise<AnnStore> {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const fs = await import('@tauri-apps/plugin-fs');
  const dir = await join(await appDataDir(), 'annotations');
  return {
    async read(work) {
      try { return JSON.parse(await fs.readTextFile(await join(dir, `${work}.json`))); }
      catch { return []; }
    },
    async write(work, anns) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeTextFile(await join(dir, `${work}.json`), JSON.stringify(anns, null, 1));
    },
  };
}

let _store: Promise<AnnStore> | null = null;
const store = () => (_store ??= isTauri() ? tauriStore() : Promise.resolve(browserStore));

const _cache = new Map<string, Annotation[]>();

export async function listAnnotations(work: string): Promise<Annotation[]> {
  if (!_cache.has(work)) _cache.set(work, await (await store()).read(work));
  return _cache.get(work)!;
}

export async function addAnnotation(a: Annotation): Promise<void> {
  const anns = await listAnnotations(a.work);
  anns.push(a);
  await (await store()).write(a.work, anns);
}

export async function updateAnnotation(work: string, id: string, body: string): Promise<void> {
  const anns = await listAnnotations(work);
  const a = anns.find(x => x.id === id);
  if (!a) return;
  a.body = body;
  await (await store()).write(work, anns);
}

export async function deleteAnnotation(work: string, id: string): Promise<void> {
  const anns = await listAnnotations(work);
  const i = anns.findIndex(x => x.id === id);
  if (i >= 0) anns.splice(i, 1);
  await (await store()).write(work, anns);
}

export function newId(): string {
  return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── capture: DOM selection → target ─────────────────────────────────────────

const lineIdOf = (el: Element | null): { column: string; line: number } | null => {
  const host = el?.closest?.('.greek-line[id], tr[id^="L"]');
  const m = host?.id.match(/^L(.+?)-(\d+)(?:-c)?$/);
  return m ? { column: m[1], line: Number(m[2]) } : null;
};

const nodeEl = (n: Node): Element | null =>
  n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;

/** Index of the .tok containing (or nearest before) a range boundary, within its line. */
function wordIndexAt(container: Node, lineHost: Element): number {
  const toks = [...lineHost.querySelectorAll('.tok')];
  const el = nodeEl(container)?.closest('.tok');
  if (el) return Math.max(0, toks.indexOf(el));
  // Boundary sits between tokens: count toks that end before it.
  let idx = 0;
  for (const t of toks) {
    const cmp = t.compareDocumentPosition(container);
    if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) idx += 1;
    else break;
  }
  return Math.max(0, Math.min(idx, toks.length - 1));
}

/** Char offset of a range boundary within a column's prose (.bk-seg text only). */
function proseOffsetAt(col: Element, container: Node, offset: number): number {
  let acc = 0;
  const walker = document.createTreeWalker(col, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      nodeEl(n)?.closest('.bk-num, .eng-table') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === container) return acc + offset;
    const cmp = n.compareDocumentPosition(container);
    if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) acc += n.textContent!.length;
    else break; // container precedes this text node
  }
  return acc;
}

export interface CaptureResult {
  target: GreekTarget | EnglishTarget;
  exact: string;
  layer: Annotation['layer'];
}

/**
 * Turn the current selection into an anchor. `activeTranslation` is the
 * translation currently filling the English column (capture is disabled in
 * compare view — the shell enforces that before calling).
 */
export function captureSelection(book: number, activeTranslation: string): CaptureResult | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const exact = sel.toString().trim();
  if (!exact) return null;

  const startLine = lineIdOf(nodeEl(range.startContainer));
  const endLine = lineIdOf(nodeEl(range.endContainer));
  if (startLine && endLine) {
    const startHost = nodeEl(range.startContainer)!.closest('.greek-line, tr[id^="L"]')!;
    const endHost = nodeEl(range.endContainer)!.closest('.greek-line, tr[id^="L"]')!;
    return {
      exact,
      layer: 'greek',
      target: {
        kind: 'greek',
        book,
        start: { ...startLine, word: wordIndexAt(range.startContainer, startHost) },
        end: { ...endLine, word: wordIndexAt(range.endContainer, endHost) },
      },
    };
  }

  const engCol = nodeEl(range.startContainer)?.closest('.english-col');
  const seg = nodeEl(range.startContainer)?.closest('.segment');
  const colId = seg?.id.match(/^col-(.+)$/)?.[1];
  if (engCol && colId && engCol.contains(range.endContainer)) {
    const start = proseOffsetAt(engCol, range.startContainer, range.startOffset);
    const end = proseOffsetAt(engCol, range.endContainer, range.endOffset);
    if (end > start) {
      return {
        exact,
        layer: `translation:${activeTranslation}`,
        target: {
          kind: 'english', book, translation: activeTranslation,
          column: colId, start, end,
        },
      };
    }
  }
  return null; // mixed/unanchorable selection (spans columns, chrome, …)
}

// ── resolve: target → Range, and paint via CSS Custom Highlights ───────────

function greekRange(t: GreekTarget): Range | null {
  const hostOf = (column: string, line: number): Element | null =>
    document.getElementById(`L${column}-${line}`) ?? document.getElementById(`L${column}-${line}-c`);
  const sh = hostOf(t.start.column, t.start.line);
  const eh = hostOf(t.end.column, t.end.line);
  if (!sh || !eh) return null;
  const sToks = [...sh.querySelectorAll('.tok')];
  const eToks = [...eh.querySelectorAll('.tok')];
  const sTok = sToks[Math.min(t.start.word, sToks.length - 1)];
  const eTok = eToks[Math.min(t.end.word, eToks.length - 1)];
  if (!sTok || !eTok) return null;
  const r = new Range();
  r.setStartBefore(sTok);
  r.setEndAfter(eTok);
  return r;
}

function englishRange(t: EnglishTarget, activeTranslation: string): Range | null {
  // Only resolvable when the annotated translation is the one on screen.
  if (t.translation !== activeTranslation) return null;
  const seg = document.getElementById(`col-${t.column}`);
  const col = seg?.querySelector('.english-col');
  if (!col) return null;
  const locate = (target: number): [Node, number] | null => {
    let acc = 0;
    const walker = document.createTreeWalker(col, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        nodeEl(n)?.closest('.bk-num, .eng-table') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const len = n.textContent!.length;
      if (acc + len >= target) return [n, target - acc];
      acc += len;
    }
    return null;
  };
  const s = locate(t.start);
  const e = locate(t.end);
  if (!s || !e) return null;
  const r = new Range();
  r.setStart(s[0], s[1]);
  r.setEnd(e[0], e[1]);
  return r;
}

/**
 * Re-resolve every annotation for the current view and register the ranges
 * under ::highlight(ann-highlight) / ::highlight(ann-note). Safe to call
 * repeatedly (idempotent); no-op where the API is unsupported.
 */
export function paintAnnotations(anns: Annotation[], activeTranslation: string): void {
  const css = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS;
  if (!css?.highlights || typeof Highlight === 'undefined') return;
  const hi: Range[] = [];
  const notes: Range[] = [];
  for (const a of anns) {
    const r = a.target.kind === 'greek'
      ? greekRange(a.target)
      : englishRange(a.target, activeTranslation);
    if (r) (a.body ? notes : hi).push(r);
  }
  css.highlights.set('ann-highlight', new Highlight(...hi));
  css.highlights.set('ann-note', new Highlight(...notes));
}

/** A short citation label for the panel, e.g. "1097a15–1097b2" or "1097a (Ostwald)". */
export function annotationLabel(a: Annotation): string {
  if (a.target.kind === 'greek') {
    const s = `${a.target.start.column}${a.target.start.line}`;
    const e = `${a.target.end.column}${a.target.end.line}`;
    return s === e ? s : `${s}–${e}`;
  }
  return `${a.target.column} (${a.target.translation})`;
}
