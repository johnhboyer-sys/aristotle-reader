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
  slot: 'english' | 'ross' | 'third';
  // Copyright-encumbered translations carried only in the local/full build.
  // The public deploy sets PUBLIC_HIDE_PRIVATE=1 to drop them from the registry
  // (and is built from the work's -public manifest, so their text is absent too).
  private?: boolean;
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

// The public deploy sets PUBLIC_HIDE_PRIVATE=1; this is a compile-time constant
// (Vite inlines import.meta.env.PUBLIC_*), so gating a copyright-encumbered
// translation entry behind it lets the minifier drop the entry — and its
// citation — from the public bundle entirely, not just hide it at runtime.
const HIDE_PRIVATE = import.meta.env.PUBLIC_HIDE_PRIVATE === '1';
const ACKRILL: TranslationRef[] = HIDE_PRIVATE ? [] : [
  { id: 'ackrill', name: 'J. L. Ackrill (Oxford, 1963)', short: 'Ackrill', slot: 'third', private: true },
];

// Display order follows the traditional arrangement of the corpus: the Organon
// (Categories, De Interpretatione, …) first, then De Anima, Metaphysics, the
// Ethics, Politics, Rhetoric, and Poetics. Everything else keys off `id`, so
// this array's order only controls the home index, search, and work switcher.
export const WORKS: Work[] = [
  {
    id: 'Cat',
    title: 'Categories',
    abbr: 'Cat.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Minio-Paluello, Aristotelis Categoriae (OCT, 1949)',
    // Edghill (1928) + Taylor (1812) are public domain and ship publicly. Ackrill
    // (1963) is US-copyright: carried in Cat.yaml for the local build and gated
    // out of the public deploy (private flag + Cat-public.yaml). All three are
    // keyed to Bekker via Ackrill's per-paragraph stamps.
    translations: [
      { id: 'edghill', name: 'E. M. Edghill (Oxford, 1928)', short: 'Edghill', slot: 'english' },
      { id: 'taylor', name: 'Thomas Taylor (London, 1812)', short: 'Taylor', slot: 'ross' },
      ...ACKRILL,   // dropped from the public build (see HIDE_PRIVATE above)
    ],
    blurb: 'Aristotle on the ten kinds of predication — the opening work of the Organon.',
  },
  {
    id: 'Int',
    title: 'De Interpretatione',
    abbr: 'Int.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Minio-Paluello, Aristotelis De Interpretatione (OCT, 1949)',
    // Edghill (1928) + Taylor (1812) public domain; Ackrill (1963) US-copyright,
    // local build only (same gating as Categories). Taylor ch14 reconstructed
    // from the 1812 Organon scan (CLAA's ch14 page was a broken duplicate).
    translations: [
      { id: 'edghill', name: 'E. M. Edghill (Oxford, 1928)', short: 'Edghill', slot: 'english' },
      { id: 'taylor', name: 'Thomas Taylor (London, 1812)', short: 'Taylor', slot: 'ross' },
      ...ACKRILL,   // dropped from the public build (see HIDE_PRIVATE above)
    ],
    blurb: 'Aristotle on statements, truth, negation, and future contingents — the second work of the Organon.',
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
    // Public build ships the public-domain Ross (1924) only. The copyrighted
    // Tredennick (Loeb 1933) primary + aligned-Ross overlay live in Meta.yaml
    // for the local/private build and are NOT deployed (see publish-plan).
    translations: [
      { id: 'ross', name: 'W. D. Ross (Oxford, 1924)', short: 'Ross', slot: 'english' },
    ],
    blurb: 'Aristotle’s inquiry into being, substance, and the unmoved mover, in fourteen books.',
  },
  {
    id: 'APr',
    title: 'Prior Analytics',
    abbr: 'APr.',
    author: 'Aristotle',
    books: 2,
    bookLabels: ROMAN.slice(0, 2),
    greekEdition: 'Ross, Aristotelis Analytica Priora et Posteriora (OCT, 1964)',
    translations: [
      { id: 'jenkinson', name: 'A. J. Jenkinson (Oxford, 1928)', short: 'Jenkinson', slot: 'english' },
    ],
    blurb: 'Aristotle’s theory of the syllogism and deductive inference, in two books.',
  },
  {
    id: 'APo',
    title: 'Posterior Analytics',
    abbr: 'APo.',
    author: 'Aristotle',
    books: 2,
    bookLabels: ROMAN.slice(0, 2),
    greekEdition: 'Ross, Aristotelis Analytica Priora et Posteriora (OCT, 1964)',
    translations: [
      { id: 'mure', name: 'G. R. G. Mure (Oxford, 1928)', short: 'Mure', slot: 'english' },
    ],
    blurb: 'Aristotle on demonstration, scientific knowledge, and first principles, in two books.',
  },
  {
    id: 'Top',
    title: 'Topics',
    abbr: 'Top.',
    author: 'Aristotle',
    books: 8,
    bookLabels: ROMAN.slice(0, 8),
    greekEdition: 'Ross, Aristotelis Topica et Sophistici Elenchi (OCT, 1958)',
    translations: [
      { id: 'pickard', name: 'W. A. Pickard-Cambridge (Oxford, 1928)', short: 'Pickard-Cambridge', slot: 'english' },
    ],
    blurb: 'Aristotle’s manual of dialectical argument and the topoi, in eight books.',
  },
  {
    id: 'SE',
    title: 'Sophistical Refutations',
    abbr: 'SE',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Ross, Aristotelis Topica et Sophistici Elenchi (OCT, 1958)',
    translations: [
      { id: 'pickard', name: 'W. A. Pickard-Cambridge (Oxford, 1928)', short: 'Pickard-Cambridge', slot: 'english' },
    ],
    blurb: 'Aristotle on fallacies and sophistical argument — the closing work of the Organon, in thirty-four chapters.',
  },
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
    id: 'Pol',
    title: 'Politics',
    abbr: 'Pol.',
    author: 'Aristotle',
    books: 8,
    bookLabels: ROMAN.slice(0, 8),
    greekEdition: 'Ross, Aristotelis Politica (OCT, 1957)',
    // Public build ships the public-domain Jowett (1885) only. The copyrighted
    // Rackham (Loeb 1932) primary + aligned-Jowett overlay live in Pol.yaml for
    // the local/private build and are NOT deployed (see publish-plan).
    translations: [
      { id: 'jowett', name: 'Benjamin Jowett (Oxford, 1885)', short: 'Jowett', slot: 'english' },
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

// A single-book work (Categories, Poetics) is a single treatise divided only
// into chapters — it has no book level, so it lives at /<work> with no
// /book/<n> subfolder, and the reader hides all book-level navigation.
export function isBookless(work: Work): boolean {
  return work.books === 1;
}

// The base-relative path to a work's reader (caller prepends BASE_URL). Bookless
// works route at /<work>; multi-book works at /<work>/book/<n>. The single
// source of truth for reader URLs — used by the home index, work switcher,
// Bekker jump, search jumps, and cross-book outline links.
export function workPath(workId: string, book = 1): string {
  const w = BY_ID.get(workId);
  return w && isBookless(w) ? `/${workId}` : `/${workId}/book/${book}`;
}

// Translations visible in the current build. Private (copyright-encumbered)
// entries are already dropped from WORKS at compile time in the public build
// (see HIDE_PRIVATE / ACKRILL above); this filter is a runtime backstop.
export function visibleTranslations(work: Work): TranslationRef[] {
  return work.translations.filter(t => !t.private || !HIDE_PRIVATE);
}

// ---------------------------------------------------------------------------
// Home-page taxonomy. The corpus is organised into the five traditional
// divisions of the Aristotelian corpus (Logic, Natural Philosophy,
// Metaphysics, Moral & Political Philosophy, Rhetoric & Poetics), some with
// sub-divisions. A `CategoryWork` is either an existing work (`id`, resolved
// against WORKS) or a not-yet-added work shown as a "coming soon" placeholder
// (`title` only). This drives only the home index; routing/search are unchanged.

export interface CategoryWork {
  id?: string;      // an existing work (in WORKS) — clickable
  title?: string;   // a planned work — greyed-out placeholder
}

export interface SubCategory {
  ref: string;      // e.g. 'II.a'
  label: string;    // e.g. 'Major Works on Nature'
  works: CategoryWork[];
}

export interface Category {
  numeral: string;  // 'I'
  title: string;    // 'Logic (Organon)'
  works?: CategoryWork[];          // direct works (no sub-division)
  subcategories?: SubCategory[];
}

export const CATEGORIES: Category[] = [
  {
    numeral: 'I',
    title: 'Logic (Organon)',
    works: [
      { id: 'Cat' },
      { id: 'Int' },
      { id: 'APr' },
      { id: 'APo' },
      { id: 'Top' },
      { id: 'SE' },
    ],
  },
  {
    numeral: 'II',
    title: 'Natural Philosophy',
    subcategories: [
      {
        ref: 'II.a',
        label: 'Major Works on Nature',
        works: [
          { title: 'Physics' },
          { title: 'On the Heavens' },
          { title: 'On Generation and Corruption' },
          { title: 'Meteorology' },
          { id: 'DA' },
        ],
      },
      {
        ref: 'II.b',
        label: 'Short Works on Nature (Parva Naturalia)',
        works: [
          { title: 'Sense and Sensibilia' },
          { title: 'On Memory' },
          { title: 'On Sleep' },
          { title: 'On Dreams' },
          { title: 'On Divination in Sleep' },
          { title: 'On Length and Shortness of Life' },
          { title: 'On Youth, Old Age, Life and Death, and Respiration' },
        ],
      },
      {
        ref: 'II.c',
        label: 'Biological Works',
        works: [
          { title: 'History of Animals' },
          { title: 'Parts of Animals' },
          { title: 'Movement of Animals' },
          { title: 'Progression of Animals' },
          { title: 'Generation of Animals' },
        ],
      },
    ],
  },
  {
    numeral: 'III',
    title: 'Metaphysics',
    works: [
      { id: 'Meta' },
    ],
  },
  {
    numeral: 'IV',
    title: 'Moral and Political Philosophy',
    works: [
      { id: 'EN' },
      { title: 'Eudemian Ethics' },
      { id: 'Pol' },
    ],
  },
  {
    numeral: 'V',
    title: 'Rhetoric and Poetics',
    works: [
      { id: 'Rhet' },
      { id: 'Poet' },
    ],
  },
];
