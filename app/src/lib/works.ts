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
    id: 'Meta',
    title: 'Metaphysics',
    abbr: 'Met.',
    author: 'Aristotle',
    books: 14,
    // Scholarly convention labels the books by Greek letter; Book 2 is the
    // "lesser alpha" (α elatton), distinct from Book 1 (Α).
    bookLabels: ['Α','α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν'],
    greekEdition: 'Ross, Aristotle’s Metaphysics (OCT, 1924)',
    translations: [
      { id: 'tredennick', name: 'Hugh Tredennick (Loeb, 1933)', short: 'Tredennick', slot: 'english' },
      { id: 'ross', name: 'W. D. Ross (Oxford, 1924)', short: 'Ross', slot: 'ross' },
    ],
    blurb: 'Aristotle’s inquiry into being, substance, and the unmoved mover, in fourteen books.',
  },
  {
    id: 'Pol',
    title: 'Politics',
    abbr: 'Pol.',
    author: 'Aristotle',
    books: 8,
    bookLabels: ROMAN.slice(0, 8),
    greekEdition: 'Ross, Aristotelis Politica (OCT, 1957)',
    translations: [
      { id: 'rackham', name: 'H. Rackham (Loeb, 1932)', short: 'Rackham', slot: 'english' },
      { id: 'jowett', name: 'Benjamin Jowett (Oxford, 1885)', short: 'Jowett', slot: 'ross' },
    ],
    blurb: 'Aristotle on the city, citizenship, constitutions, and the best life, in eight books.',
  },
  {
    id: 'Rhet',
    title: 'Rhetoric',
    abbr: 'Rhet.',
    author: 'Aristotle',
    books: 3,
    bookLabels: ROMAN.slice(0, 3),
    greekEdition: 'Ross, Aristotelis Ars Rhetorica (OCT, 1959)',
    translations: [
      { id: 'freese', name: 'J. H. Freese (Loeb, 1926)', short: 'Freese', slot: 'english' },
    ],
    blurb: 'Aristotle on persuasion — ēthos, pathos, logos, and the art of the orator, in three books.',
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
