// The form panel beside the search results: every Greek form the result is
// made of, with its count and a tick box, and the result set that is left
// when some are set aside. The forms themselves come from greekHitForms
// (lib/search); this file only counts and filters, from the result set, so
// ticking a box asks the network for nothing.
//
// A form here is the index's folded key ("logon"): the index does not tell
// λόγον from a differently accented spelling, so neither can the panel.
import { cutPositions } from './result-views';
import type { HitForms, LangOp, SearchResult } from './search';

export interface FormRow { form: string; count: number }
/** The forms under one headword. `headword` is null where there is none to
 * name: a search by form, or forms no headword claims. */
export interface FormGroup { headword: string | null; forms: FormRow[]; count: number }

const keyOf = (r: SearchResult) => `${r.work}:${r.meta.id}`;

/** Every form found in `results`, commonest first, each hit counted once.
 * They are grouped under their headword, a lone one too (John, 2026-11-10:
 * the headword stands over its forms); where a typed inflection belongs to
 * several, under each, and a form two headwords share stands under both. Count them from the results as searched, before any form is set
 * aside, so a form set aside is still listed. `keep` passes over the hits
 * another filter has removed (the grammar facets, lib/result-views). */
export function formGroups(
  results: SearchResult[],
  forms: HitForms,
  keep?: (r: SearchResult, i: number) => boolean,
): FormGroup[] {
  const counts = new Map<string, number>();
  for (const r of results) {
    if (!r.grkMatch) continue;
    const own = forms.byResult.get(keyOf(r));
    r.grkPositions.forEach((_, i) => {
      if (keep && !keep(r, i)) return;
      const form = own?.[i];
      if (form) counts.set(form, (counts.get(form) ?? 0) + 1);
    });
  }
  const rows = (keys: string[]): FormRow[] => keys
    .map(form => ({ form, count: counts.get(form)! }))
    .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form));
  const total = (list: FormRow[]) => list.reduce((n, f) => n + f.count, 0);

  const found = [...counts.keys()];
  const heads = new Set(found.flatMap(form => forms.headwords.get(form) ?? []));
  if (!heads.size) {
    const all = rows(found);
    return all.length ? [{ headword: null, forms: all, count: total(all) }] : [];
  }
  const groups: FormGroup[] = [...heads].map(headword => {
    const own = rows(found.filter(form => forms.headwords.get(form)?.includes(headword)));
    return { headword, forms: own, count: total(own) };
  });
  const loose = rows(found.filter(form => !forms.headwords.get(form)?.length));
  if (loose.length) groups.push({ headword: null, forms: loose, count: total(loose) });
  return groups.sort((a, b) => b.count - a.count || (a.headword ?? '').localeCompare(b.headword ?? ''));
}

/** `results` without the hits whose form is in `excluded`. A passage left
 * with no Greek hit stays only if its English matched and the two queries
 * were joined by "either", as a narrowed translation does (Search narrow). */
export function excludeForms(
  results: SearchResult[],
  forms: HitForms,
  excluded: ReadonlySet<string>,
  langOp: LangOp,
): SearchResult[] {
  if (!excluded.size) return results;
  return results.flatMap(r => {
    const own = forms.byResult.get(keyOf(r));
    if (!r.grkMatch || !own) return [r];
    const keep = r.grkPositions.map((_, i) => !excluded.has(own[i]));
    if (keep.every(Boolean)) return [r];
    const left = cutPositions(r, keep);
    if (left.grkPositions.length) return [left];
    return r.engMatch && langOp === 'or' ? [{ ...left, grkMatch: false }] : [];
  });
}
