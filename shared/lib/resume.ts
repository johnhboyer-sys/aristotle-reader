// Reading-position resume. The Reader has long persisted per-work position
// for the work-switcher — `reader-book-<work>` (book number) and
// `reader-loc-<work>` (Bekker citation like "1103a14") — but nothing recorded
// WHEN, so no host could offer "continue where you left off". This module
// adds one key, `reader-recent` ({workId: epoch-ms}), and read helpers that
// join the three keys into a resume point. Storage failures (private mode,
// SSR) degrade to "no resume", never throw.

const RECENT_KEY = 'reader-recent';
const MAX_RECENT = 50;

export interface ResumePoint {
  work: string;
  book: number;
  cite: string | null; // Bekker citation ("1103a14") or null if never scrolled
  at: number;          // epoch ms of the last visit
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function recentMap(s: Storage): Record<string, number> {
  try {
    const raw = s.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      }
      return out;
    }
  } catch { /* corrupted value → start fresh */ }
  return {};
}

// Mark a work as the most recently read. Called by the Reader when it opens
// (alongside its reader-book-<work> write).
export function touchRecent(work: string): void {
  const s = store();
  if (!s) return;
  const map = recentMap(s);
  map[work] = Date.now();
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, MAX_RECENT);
  try { s.setItem(RECENT_KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* full */ }
}

// The saved position within one work, if any: {book, cite}.
export function resumeFor(work: string): { book: number; cite: string | null } | null {
  const s = store();
  if (!s) return null;
  let book: string | null = null;
  let cite: string | null = null;
  try {
    book = s.getItem(`reader-book-${work}`);
    cite = s.getItem(`reader-loc-${work}`);
  } catch { return null; }
  if (book == null && cite == null) return null;
  const n = Number(book);
  return { book: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1, cite: cite || null };
}

// The most recently read work across the corpus, joined with its position —
// the "Continue reading" affordance. `known` (when given) filters to works the
// caller can actually resolve (e.g. the works built into this site).
export function lastRead(known?: (work: string) => boolean): ResumePoint | null {
  const s = store();
  if (!s) return null;
  const entries = Object.entries(recentMap(s)).sort((a, b) => b[1] - a[1]);
  for (const [work, at] of entries) {
    if (known && !known(work)) continue;
    const pos = resumeFor(work);
    if (pos) return { work, at, ...pos };
  }
  return null;
}
