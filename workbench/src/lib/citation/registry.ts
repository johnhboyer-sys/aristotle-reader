/**
 * Citation-scheme registry. General code looks schemes up by id here and
 * never branches on scheme id itself (see workbench-design/d2-citation-schemes.md).
 */

import type { CitationScheme, SchemeId } from './types';
import { bekkerStandard } from './schemes/bekkerStandard';
import { bekkerMetaphysics } from './schemes/bekkerMetaphysics';
import { aquinasStub } from './schemes/aquinasStub';
import { busseParagraph } from './schemes/busseParagraph';

const SCHEMES = new Map<SchemeId, CitationScheme>([
  [bekkerStandard.id, bekkerStandard],
  [bekkerMetaphysics.id, bekkerMetaphysics],
  [aquinasStub.id, aquinasStub],
  [busseParagraph.id, busseParagraph],
]);

/** Look up a citation scheme by id. Throws on an unknown scheme id. */
export function getScheme(id: SchemeId): CitationScheme {
  const scheme = SCHEMES.get(id);
  if (!scheme) {
    throw new Error(`unknown citation scheme: ${JSON.stringify(id)}`);
  }
  return scheme;
}

/** True if `id` is a registered scheme id (accepts arbitrary strings, e.g. from YAML/JSON). */
export function isKnownScheme(id: string): id is SchemeId {
  return SCHEMES.has(id as SchemeId);
}
