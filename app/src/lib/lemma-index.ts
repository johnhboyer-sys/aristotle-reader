// One manifest read and one sort per build module, shared by all lemma pages.
import { readFileSync } from 'node:fs';
import { GLOSSARY_BODIES } from '@shared/lib/glossary';
import { alphabeticalLemmas, mapGlossary, resolveGlossaryBody, nearbyLemmas, type LemmaHead } from './lemma-view';
const manifest: Record<string, Omit<LemmaHead, 'key'>> = JSON.parse(readFileSync('public/data/lemmata.json', 'utf8'));
export const lemmaHeads = Object.entries(manifest).map(([key, e]) => ({ ...e, key }));
const sorted = alphabeticalLemmas(lemmaHeads);
export const glossaryMapping = mapGlossary(GLOSSARY_BODIES, lemmaHeads);
const bodies = new Map<string, ReturnType<typeof resolveGlossaryBody>>();
for (const match of glossaryMapping.matched) {
  const current = bodies.get(match.lemma.slug) ?? [];
  for (const body of resolveGlossaryBody(match.entry, GLOSSARY_BODIES)) if (!current.some(e => e.slug === body.slug)) current.push(body);
  bodies.set(match.lemma.slug, current);
}
export const ostwaldFor = (slug: string) => bodies.get(slug) ?? [];
export const nearbyFor = (slug: string) => nearbyLemmas(sorted, slug);
