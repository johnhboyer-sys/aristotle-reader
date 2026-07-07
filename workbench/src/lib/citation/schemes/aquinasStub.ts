/**
 * aquinas-tbd — stub scheme for the (Phase 3) Aquinas commentary citation
 * scheme. Implements the full CitationScheme interface so the registry and
 * general code compile against it — compile-time proof the contract fits a
 * non-Bekker scheme — but every behavioral method throws until Phase 3.
 *
 * Phase 1 scope fence: chapter creation for scheme 'aquinas-tbd' is
 * disabled at the call site; this stub only needs to exist and throw.
 */

import type { CitationScheme } from '../types';

const NOT_IMPLEMENTED = () => {
  throw new Error('Aquinas citation support is Phase 3');
};

export const aquinasStub: CitationScheme = {
  id: 'aquinas-tbd',
  parseAddress: NOT_IMPLEMENTED,
  compareAddress: NOT_IMPLEMENTED,
  bookLabel: NOT_IMPLEMENTED,
  formatRange: NOT_IMPLEMENTED,
  formatCitation: NOT_IMPLEMENTED,
  gutter: {
    rowUnit: 'paragraph',
    gutterMode: 'structural',
  },
};
