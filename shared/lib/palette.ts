// Matching logic for the ⌘K command palette — pure functions so the ranking
// is unit-testable without mounting the component. The palette accepts three
// kinds of input: a Bekker citation (jump within the current work), a work
// name/abbreviation (open that work, resuming its saved position), or Greek
// (lemma lookup). Everything else falls through to corpus search.

import { WORKS, type Work } from './works';
import { greekFold } from './search';
import type { LemmaRef } from './data';

// "1103a14" (column+line) or a bare column "1103a" — tolerant of spaces/case.
export function parseCitation(q: string): { column: string; line: number | null } | null {
  const m = q.trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{3,4})([ab])\.?(\d+)?$/);
  if (!m) return null;
  return { column: m[1] + m[2], line: m[3] ? Number(m[3]) : null };
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
