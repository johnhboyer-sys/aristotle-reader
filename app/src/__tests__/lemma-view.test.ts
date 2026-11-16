import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GLOSSARY_BODIES } from '@shared/lib/glossary';
import { WORKS } from '@shared/lib/works';
import { decodeSearchUrl } from '@shared/lib/search-url';
import { alphabeticalLemmas, nearbyLemmas, mapGlossary, resolveGlossaryBody, lemmaWorkHref, type GlossBody } from '../lib/lemma-view';
const body = (slug: string, greek: string[], bodyHtml = 'A body.'): GlossBody => ({slug, greek, terms: [slug], bodyHtml});
const lemma = (slug: string, head: string) => ({slug, head, key: slug});
it('prefers exact NFC, accepts only unique folded matches, and never stems', () => {
  const mapped = mapGlossary([body('a', ['αρετη', 'ἀρετή', 'ἀκούσιον', 'ἀγνωστός', 'σοφια', 'ἕξις'.normalize('NFD')])], [lemma('a','ἀρετή'),lemma('b','ἀρετῇ'),lemma('c','ἀκούσιος'),lemma('d','σοφία'),lemma('e','ἕξις')]);
  expect(mapped.matched.map(m=>m.lemma.slug)).toEqual(['a','d','e']);
  expect(mapped.ambiguous).toEqual(['αρετη']);
  expect(mapped.unmatched).toEqual(['ἀκούσιον','ἀγνωστός']);
});
it('folds final sigma and resolves See-only bodies to each cited source', () => {
  expect(mapGlossary([body('a',['λογοσ'])],[lemma('l','λόγος')]).matched).toHaveLength(1);
  const entries = [body('a',[], 'See <em>b</em> and <em>c</em>.'),body('b',[], 'See <em>c</em>.'),body('c',[], 'Actual body.'),body('d',[], 'See <em>c</em>. More text.')];
  expect(resolveGlossaryBody(entries[0],entries).map(e=>e.slug)).toEqual(['c','c']);
  expect(resolveGlossaryBody(entries[3],entries)).toEqual([entries[3]]);
  expect(()=>resolveGlossaryBody(body('c',[],'See <em>c</em>.'),entries)).toThrow('cycle');
});
it('sorts Greek heads and clamps the 18 neighbors at both ends', () => {
  const sorted = alphabeticalLemmas(Array.from({length:30},(_,i)=>lemma(String(i),String.fromCodePoint(0x3b1+i))).reverse());
  const collator = new Intl.Collator('el',{sensitivity:'base'});
  expect(sorted.every((e,i)=>i===0||collator.compare(sorted[i-1].head,e.head)<=0)).toBe(true);
  expect(nearbyLemmas(sorted,sorted[15].slug)).toEqual(sorted.slice(6,24));
  expect(nearbyLemmas(sorted,sorted[0].slug)).toEqual(sorted.slice(0,18));
  expect(nearbyLemmas(sorted,sorted[29].slug)).toEqual(sorted.slice(12));
});
it('encodes one lemma key and one work for Search to restore', () => {
  const url = new URL(lemmaWorkHref('/base','a)reth/','EN'),'https://example.test');
  expect(url.pathname).toBe('/base/search');
  const state = decodeSearchUrl(url.searchParams,WORKS.map(w=>w.id));
  expect(state.lemmas).toEqual(['areth']);
  expect(state.works).toEqual(['EN']);
  expect(state.grk).toBe('');
  expect(state.workFilter).toBeNull();
});
// CI has no built corpus. With it built (s1-corpus-check's marker), a missing lemmata.json fails.
it.skipIf(!existsSync('public/data/EN/search/offsets.json'))('maps all real glossary forms and reports forms needing a ruling (needs the built corpus)', () => {
  const manifest = JSON.parse(readFileSync('public/data/lemmata.json','utf8'));
  const heads = Object.entries(manifest).map(([key,e])=>({...e as {slug:string;head:string},key}));
  const mapping = mapGlossary(GLOSSARY_BODIES,heads);
  expect(mapping.matched).toHaveLength(50);
  expect(mapping.unmatched).toEqual(['ἀκούσιον','σωφροσύνη']);
  expect(mapping.ambiguous).toEqual([]);
  expect(mapping.matched.length+mapping.unmatched.length+mapping.ambiguous.length).toBe(GLOSSARY_BODIES.flatMap(e=>e.greek).length);
  for (const match of mapping.matched) expect(resolveGlossaryBody(match.entry,GLOSSARY_BODIES).every(e=>e.bodyHtml.length>0)).toBe(true);
  console.log('OSTWALD', JSON.stringify({matched:mapping.matched.length,entries:new Set(mapping.matched.map(m=>m.entry.slug)).size,unmatched:mapping.unmatched,ambiguous:mapping.ambiguous}));
});

it('uses the three Ostwald overrides and leaves corpus defects unmatched', () => {
  const mapping = mapGlossary([body('a', ['ἑκούσιον', 'πολιτική', 'θεωρεῖν', 'ἀκούσιον', 'σωφροσύνη'])], [
    lemma('hekousios', 'ἑκούσιος'), lemma('politikos', 'πολιτικός'), lemma('theoreo', 'θεωρέω'),
    lemma('sophronos', 'σωφρόσυνος'),
  ]);
  expect(mapping.matched.map(m => [m.form, m.lemma.slug])).toEqual([
    ['ἑκούσιον', 'hekousios'], ['πολιτική', 'politikos'], ['θεωρεῖν', 'theoreo'],
  ]);
  expect(mapping.unmatched).toEqual(['ἀκούσιον', 'σωφροσύνη']);
  expect(mapGlossary([body('a', ['θεωρεῖν'])], []).unmatched).toEqual(['θεωρεῖν']);
});
