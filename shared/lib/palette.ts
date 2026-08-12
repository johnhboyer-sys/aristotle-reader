// Matching logic for the ⌘K command palette — pure functions so the ranking
// is unit-testable without mounting the component. The palette accepts three
// kinds of input: a Bekker citation (jump within the current work), a work
// name/abbreviation (open that work, resuming its saved position), or Greek
// (lemma lookup). Everything else falls through to corpus search.

import { WORKS, getWork, type Work } from './works';
import { greekFold } from './search';
import type { BekkerRef, LemmaRef } from './data';

// "1103a14" (column+line) or a bare column "1103a" — tolerant of spaces/case.
// One- and two-digit columns are citations too: the Categories runs 1a–15b.
export function parseCitation(q: string): { column: string; line: number | null } | null {
  const m = q.trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{1,4})([ab])\.?(\d+)?$/);
  if (!m) return null;
  return { column: m[1] + m[2], line: m[3] ? Number(m[3]) : null };
}

// Which work (and book) a Bekker citation belongs to, corpus-wide — the palette
// jumps to a citation from anywhere on the site, not only from the work that
// happens to be open. A column shared by two works or two books is decided by
// the line, snapping to the nearer range when the line falls in a gap; the work
// being read wins a tie so a citation you're looking at doesn't send you away.
// Works paginated by another editor (the Isagoge's Busse pages) are skipped:
// their page numbers collide with real Bekker columns but mean something else.
export function citationTargets(
  index: Record<string, BekkerRef[]>,
  column: string,
  line: number,
  currentWork: string | null,
): { work: string; book: number }[] {
  const entries = (index[column] ?? []).filter(
    (e) => (getWork(e.work)?.citation?.scheme ?? 'bekker') === 'bekker',
  );
  if (!entries.length) return [];
  const dist = (e: BekkerRef) => (line < e.lo ? e.lo - line : line > e.hi ? line - e.hi : 0);
  const best = new Map<string, { e: BekkerRef; d: number }>();
  for (const e of entries) {
    const d = dist(e);
    const cur = best.get(e.work);
    if (!cur || d < cur.d) best.set(e.work, { e, d });
  }
  return [...best.values()]
    .sort((a, b) =>
      Number(b.e.work === currentWork) - Number(a.e.work === currentWork) || a.d - b.d,
    )
    .map(({ e }) => ({ work: e.work, book: e.book }));
}

export function hasGreek(q: string): boolean {
  return /[Ͱ-Ͽἀ-῿]/.test(q);
}

// Rank works for a query: prefix-of-title/abbr/id first, then substring
// matches; alphabetical within a tier. Abbr/id match case-insensitively
// ("ne" → Nicomachean Ethics via abbr "EN"? no — abbr is EN; "en" matches).
export function rankWorks(q: string, works: readonly Work[] = WORKS, limit = 6): Work[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const tier = (w: Work): number => {
    const title = w.title.toLowerCase();
    const abbr = w.abbr.toLowerCase();
    const id = w.id.toLowerCase();
    if (abbr === needle || id === needle) return 0;
    if (title.startsWith(needle)) return 1;
    // Word-start match inside the title ("ethics" → Nicomachean Ethics).
    if (title.includes(` ${needle}`)) return 2;
    if (abbr.startsWith(needle) || id.startsWith(needle)) return 3;
    if (title.includes(needle)) return 4;
    return -1;
  };
  return works
    .map((w) => ({ w, t: tier(w) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || a.w.title.localeCompare(b.w.title))
    .slice(0, limit)
    .map((x) => x.w);
}

// Rank lemmata for a Greek query: fold-prefix matches on the headword,
// most frequent first.
export function rankLemmata(
  q: string,
  lemmata: Record<string, LemmaRef>,
  limit = 5,
): LemmaRef[] {
  const needle = greekFold(q.trim());
  if (!needle) return [];
  const out: LemmaRef[] = [];
  for (const ref of Object.values(lemmata)) {
    if (greekFold(ref.head).startsWith(needle)) out.push(ref);
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit);
}
