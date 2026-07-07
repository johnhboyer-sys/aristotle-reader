/**
 * Per-work spine-parsing configuration for onboarding: the canonical Bekker
 * book ranges (and edition attribution) parseSpine needs to assign TLG lines
 * to books. Mirrors the `books:` tables in the repo's pipeline manifests
 * (manifests/Meta.yaml, manifests/APo.yaml) — these are public-domain
 * citation facts, NOT TLG-derived text, so committing them is fine.
 *
 * Keyed by the workbench work id (src/lib/works/manifests/<id>.yaml).
 */

import type { SpineManifest } from '../corpus/spine';

export const SPINE_CONFIG: Record<string, SpineManifest> = {
  metaphysics: {
    work_id: 'Meta',
    greek_edition: "Ross, Aristotle's Metaphysics (OCT, 1924)",
    books: [
      { n: 1, start: '980a21', end: '993a29' },
      { n: 2, start: '993a30', end: '995a20' },
      { n: 3, start: '995a24', end: '1003a17' },
      { n: 4, start: '1003a21', end: '1012b31' },
      { n: 5, start: '1012b34', end: '1025a34' },
      { n: 6, start: '1025b3', end: '1028a6' },
      { n: 7, start: '1028a10', end: '1041b33' },
      { n: 8, start: '1042a3', end: '1045b23' },
      { n: 9, start: '1045b27', end: '1052a11' },
      { n: 10, start: '1052a15', end: '1059a14' },
      { n: 11, start: '1059a18', end: '1069a14' },
      { n: 12, start: '1069a18', end: '1076a4' },
      { n: 13, start: '1076a8', end: '1087a25' },
      { n: 14, start: '1087a29', end: '1093b29' },
    ],
  },
  'posterior-analytics': {
    work_id: 'APo',
    greek_edition: 'Ross, Aristotelis Analytica Priora et Posteriora (OCT, 1964)',
    books: [
      { n: 1, start: '71a1', end: '89b22' },
      { n: 2, start: '89b23', end: '100b17' },
    ],
  },
};
