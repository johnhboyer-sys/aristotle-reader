/**
 * bekker-metaphysics — identical to bekker-standard except for `id` (and a
 * defensive book-label fallback). Labels for Metaphysics come from the work
 * manifest (Α, α, Β, Γ, …), so the Roman-numeral fallback should never
 * actually fire in practice — kept only so bookLabel never throws if a
 * manifest is missing an entry. This scheme exists to prove the interface
 * supports a second scheme cheaply: it is a spread of bekkerStandard.
 */

import type { CitationScheme } from '../types';
import { bekkerStandard } from './bekkerStandard';

export const bekkerMetaphysics: CitationScheme = {
  ...bekkerStandard,
  id: 'bekker-metaphysics',
  parseAddress: (raw) => ({ ...bekkerStandard.parseAddress(raw), scheme: 'bekker-metaphysics' }),
  formatCitation: (span, work) => bekkerStandard.formatCitation(span, work),
};
