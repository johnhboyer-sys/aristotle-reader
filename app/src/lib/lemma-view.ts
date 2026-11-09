import { greekFold } from '@shared/lib/search';
import { WORKS } from '@shared/lib/works';
import { emptyUrlSearch, encodeSearchUrl } from '@shared/lib/search-url';

export interface LemmaHead { slug: string; head: string; key: string; }
export interface GlossBody { slug: string; terms: string[]; greek: string[]; bodyHtml: string; }
export const foldGreek = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');

// Ostwald cites the neuter / feminine noun / infinitive; the lemma index has the headword.
const OSTWALD_HEADWORDS: Record<string, string> = {
  'ἑκούσιον': 'hekousios',
  'πολιτική': 'politikos',
  'θεωρεῖν': 'theoreo',
};

// Explicit overrides precede NFC and unique folded matches; never guess a stem.
export function mapGlossary(entries: GlossBody[], lemmas: LemmaHead[]) {
  const exact = new Map<string, LemmaHead[]>(), folded = new Map<string, LemmaHead[]>();
  for (const lemma of lemmas) for (const [map, key] of [[exact, lemma.head.normalize('NFC')], [folded, foldGreek(lemma.head)]] as const) {
    map.set(key, [...(map.get(key) ?? []), lemma]);
  }
  const matched: { form: string; lemma: LemmaHead; entry: GlossBody }[] = [];
  const unmatched: string[] = [], ambiguous: string[] = [];
  for (const entry of entries) for (const form of entry.greek) {
    const override = OSTWALD_HEADWORDS[form.normalize('NFC')];
    const candidates = override ? lemmas.filter(lemma => lemma.slug === override)
      : exact.get(form.normalize('NFC')) ?? folded.get(foldGreek(form)) ?? [];
    if (candidates.length === 1) matched.push({ form, lemma: candidates[0], entry });
    else (candidates.length ? ambiguous : unmatched).push(form);
  }
  return { matched, unmatched, ambiguous };
}

const foldTerm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// See-only entries borrow each target's body and cite each target's anchor.
export function resolveGlossaryBody(entry: GlossBody, entries: GlossBody[], seen = new Set<string>()): GlossBody[] {
  if (seen.has(entry.slug)) throw new Error(`Glossary reference cycle: ${entry.slug}`);
  const refs = entry.bodyHtml.match(/^See ((?:<em>[^<]+<\/em>)(?: and <em>[^<]+<\/em>)?)\.$/);
  if (!refs) return [entry];
  const next = new Set([...seen, entry.slug]);
  return [...refs[1].matchAll(/<em>([^<]+)<\/em>/g)].flatMap(([, term]) => {
    const target = entries.find(e => e.terms.some(t => foldTerm(t.replace(/\.$/, '')) === foldTerm(term)));
    if (!target) throw new Error(`Unknown glossary reference: ${term}`);
    return resolveGlossaryBody(target, entries, next);
  });
}

export function alphabeticalLemmas(lemmas: LemmaHead[]): LemmaHead[] {
  const collator = new Intl.Collator('el', { sensitivity: 'base' });
  return [...lemmas].sort((a, b) => collator.compare(a.head, b.head) || a.slug.localeCompare(b.slug));
}
export function nearbyLemmas(sorted: LemmaHead[], slug: string): LemmaHead[] {
  const i = sorted.findIndex(e => e.slug === slug);
  if (i < 0) throw new Error(`Unknown lemma: ${slug}`);
  const start = Math.max(0, Math.min(i - 9, sorted.length - 18));
  return sorted.slice(start, start + 18);
}
const workIds = WORKS.map(w => w.id);
export function lemmaWorkHref(base: string, key: string, work: string): string {
  return `${base}/search?${encodeSearchUrl({ ...emptyUrlSearch(workIds), lemmas: [greekFold(key)], works: [work] }, workIds)}`;
}
