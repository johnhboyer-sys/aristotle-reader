// The corpus registry — the single source of truth for which works the site
// carries. Adding a work is one entry here (plus its pipeline data under
// build/dist/<id>/). Everything else — routing, the home index, the reader's
// work switcher, unified search — is driven off this list.
//
// `id` is the URL slug AND the data directory name; it uses the standard
// scholarly abbreviation (EN = Ethica Nicomachea, DA = De Anima).
//
// `translations[].slot` says which emitted field the reader renders for that
// translation: 'english' is the primary parallel chunk (Rackham / Smith),
// 'ross' is the secondary chapter-anchored overlay (Ross / Hicks).

export interface TranslationRef {
  id: string;
  name: string;     // full citation, for the picker + attribution
  short: string;    // chip label
  slot: 'english' | 'ross';
}

export interface Work {
  id: string;       // slug + data dir, e.g. 'EN'
  title: string;
  abbr: string;     // display abbreviation (may differ from id styling)
  author: string;
  books: number;
  bookLabels: string[];   // per-book display labels (Roman for EN, Arabic for DA)
  greekEdition: string;
  translations: TranslationRef[];
  blurb: string;    // one line for the home index
}

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];

export const WORKS: Work[] = [
  {
    id: 'EN',
    title: 'Nicomachean Ethics',
    abbr: 'EN',
    author: 'Aristotle',
    books: 10,
    bookLabels: ROMAN.slice(0, 10),
    greekEdition: 'Bywater, Aristotelis Ethica Nicomachea (OCT, 1894)',
    translations: [
      { id: 'rackham', name: 'H. Rackham (Loeb, 1926)', short: 'Rackham', slot: 'english' },
      { id: 'ross', name: 'W. D. Ross (Oxford, 1908)', short: 'Ross', slot: 'ross' },
    ],
    blurb: 'Aristotle’s central work of moral philosophy, in ten books.',
  },
  {
    id: 'DA',
    title: 'De Anima',
    abbr: 'DA',
    author: 'Aristotle',
    books: 3,
    bookLabels: ['I', 'II', 'III'],
    greekEdition: 'Ross, Aristotelis De Anima (OCT, 1956)',
    translations: [
      { id: 'smith', name: 'J. A. Smith (Oxford, 1931)', short: 'Smith', slot: 'english' },
    ],
    blurb: 'Aristotle on the soul, perception, and intellect, in three books.',
  },
  {
    id: 'Poet',
    title: 'Poetics',
    abbr: 'Poet.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Kassel, Aristotelis De Arte Poetica (OCT, 1965)',
    translations: [
      { id: 'fyfe', name: 'W. H. Fyfe (Loeb, 1932)', short: 'Fyfe', slot: 'english' },
    ],
    blurb: 'Aristotle on poetry and tragedy — the founding work of literary theory.',
  },
];

const BY_ID = new Map(WORKS.map((w) => [w.id, w]));

export function getWork(id: string): Work | undefined {
  return BY_ID.get(id);
}

export function bookLabel(work: Work, n: number): string {
  return work.bookLabels[n - 1] ?? String(n);
}
