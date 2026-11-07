// Matching logic for the ⌘K command palette — pure functions so the ranking
// is unit-testable without mounting the component. The palette accepts three
// kinds of input: a Bekker citation (jump within the current work), a work
// name/abbreviation (open that work, resuming its saved position), or Greek
// (lemma lookup). Everything else falls through to corpus search.

import { WORKS, getWork, type Work } from './works';
import { greekFold } from './search';
import { citeLabel, isChapterSection, lineRef, parseBekker, type BekkerRef, type LemmaRef } from './data';

// "1103a14" (column+line), a lettered line "775a11a", or a bare column
// "1103a" — tolerant of spaces/case. One- and two-digit columns are citations
// too: the Categories runs 1a–15b. A lettered line comes from parseBekker; a
// bare column ("1103a" or "1103a.") is the extra case that function refuses.
export function parseCitation(q: string): { column: string; line: number | null; sub?: string } | null {
  const full = parseBekker(q);
  if (full) return { column: full.column, line: full.line, ...(full.sub ? { sub: full.sub } : {}) };
  const bare = q.trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{1,4})([ab])\.?$/);
  if (!bare) return null;
  return { column: bare[1] + bare[2], line: null };
}

// The palette jump for a parsed citation. A line keeps its letter in the loc
// (`775a:11a` → anchor L775a-11a). A bare column is a hash, not a loc.
export function citationTarget(
  cite: { column: string; line: number | null; sub?: string },
): { label: string; loc?: string; hash?: string } {
  if (cite.line == null) return { label: `Go to ${cite.column}`, hash: cite.column };
  const ref = lineRef(cite.line, cite.sub);
  return { label: `Go to ${cite.column}${ref}`, loc: `${cite.column}:${ref}` };
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

// A chapter.section citation (the Athenian Constitution): a work prefix, matched
// against the abbr and id of chapter-section works with case, dots and spaces
// folded away ("Ath. Pol. 56.6", "athpol 56.6", "Ath.Pol. 56"), then `C.S` or a
// bare `C`. Inside such a work a bare `C.S` cites it too. Chapter C is the
// synthetic column "Ca". A Bekker citation always carries a/b, so nothing this
// reads could have parsed as one.
export interface SectionCite { work: string; column: string; section: number | null }

export function parseSectionCitation(
  q: string,
  currentWork: string | null,
  works: readonly Work[] = WORKS,
): SectionCite | null {
  const m = q.trim().match(/^(.*?)(\d+)(?:\s*\.\s*(\d+))?$/);
  if (!m) return null;
  const fold = (s: string) => s.toLowerCase().replace(/[.\s]/g, '');
  const prefix = fold(m[1]);
  const sectioned = works.filter((w) => isChapterSection(w));
  const work = prefix
    ? sectioned.find((w) => fold(w.abbr) === prefix || fold(w.id) === prefix)
    : m[3] != null ? sectioned.find((w) => w.id === currentWork) : undefined;
  if (!work) return null;
  return { work: work.id, column: `${Number(m[2])}a`, section: m[3] != null ? Number(m[3]) : null };
}

const SECTIONED = { citation: { scheme: 'chapter-section' as const } };

// The jump for a parsed chapter.section citation, checked against the work's
// own entries in the corpus Bekker index: a chapter or section the work does
// not have offers no jump.
export function sectionTarget(
  cite: SectionCite,
  index: Record<string, BekkerRef[]>,
): { book: number; label: string; loc?: string; hash?: string } | null {
  const entries = (index[cite.column] ?? []).filter((e) => e.work === cite.work);
  if (cite.section == null) {
    return entries.length
      ? { book: entries[0].book, label: `Go to ${citeLabel(SECTIONED, cite.column)}`, hash: cite.column }
      : null;
  }
  const s = cite.section;
  const e = entries.find((x) => x.lo <= s && s <= x.hi);
  if (!e) return null;
  return { book: e.book, label: `Go to ${citeLabel(SECTIONED, cite.column, String(s))}`, loc: `${cite.column}:${s}` };
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
