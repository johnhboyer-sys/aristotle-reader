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
  // The print edition the TLG text was digitised from, in two lengths: `short`
  // for the reader's bilingual strip, `full` for the Greek-only strip and the
  // Texts & Licences page (both driven off this one field so they can't drift).
  greekSource: { short: string; full: string };
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
    greekSource: {
      short: 'Minio-Paluello (OCT, 1949)',
      full: 'L. Minio-Paluello, ed. Aristotelis categoriae et liber de interpretatione. Oxford: Clarendon Press, 1949.',
    },
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
    greekSource: {
      short: 'Minio-Paluello (OCT, 1949)',
      full: 'L. Minio-Paluello, ed. Aristotelis categoriae et liber de interpretatione. Oxford: Clarendon Press, 1949.',
    },
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
    id: 'Phys',
    title: 'Physics',
    abbr: 'Phys.',
    author: 'Aristotle',
    books: 8,
    bookLabels: ROMAN.slice(0, 8),
    greekEdition: 'Ross, Aristotelis Physica (OCT, 1950)',
    greekSource: {
      short: 'Ross (OCT, 1950)',
      full: 'W. D. Ross, ed. Aristotelis Physica. Oxford: Clarendon Press (Oxford Classical Texts), 1950.',
    },
    translations: [
      { id: 'hardie', name: 'R. P. Hardie and R. K. Gaye (Oxford, 1930)', short: 'Hardie & Gaye', slot: 'english' },
    ],
    blurb: 'Aristotle on nature, change, place, time, and the prime mover, in eight books.',
  },
  {
    id: 'Cael',
    title: 'On the Heavens',
    abbr: 'Cael.',
    author: 'Aristotle',
    books: 4,
    bookLabels: ROMAN.slice(0, 4),
    greekEdition: 'Moraux, Aristote: Du ciel (Budé, 1965)',
    greekSource: {
      short: 'Moraux (Budé, 1965)',
      full: 'P. Moraux, ed. Aristote: Du ciel. Paris: Les Belles Lettres (Budé), 1965.',
    },
    translations: [
      { id: 'stocks', name: 'J. L. Stocks (Oxford, 1922)', short: 'Stocks', slot: 'english' },
    ],
    blurb: 'Aristotle on the cosmos, the elements, and the eternity of the heavens, in four books.',
  },
  {
    id: 'GC',
    title: 'On Generation and Corruption',
    abbr: 'GC',
    author: 'Aristotle',
    books: 2,
    bookLabels: ROMAN.slice(0, 2),
    greekEdition: 'Joachim, Aristotelis De Generatione et Corruptione (Oxford, 1922)',
    greekSource: {
      short: 'Joachim (Oxford, 1922)',
      full: 'H. H. Joachim, ed. Aristotle on Coming-to-be and Passing-away (De Generatione et Corruptione). Oxford: Clarendon Press, 1922.',
    },
    translations: [
      { id: 'joachim', name: 'H. H. Joachim (Oxford, 1922)', short: 'Joachim', slot: 'english' },
    ],
    blurb: 'Aristotle on coming-to-be, passing-away, mixture, and the elements, in two books.',
  },
  {
    id: 'Mete',
    title: 'Meteorology',
    abbr: 'Mete.',
    author: 'Aristotle',
    books: 4,
    bookLabels: ROMAN.slice(0, 4),
    greekEdition: 'Fobes, Aristotelis Meteorologicorum libri quattuor (1919)',
    greekSource: {
      short: 'Fobes (1919)',
      full: 'F. H. Fobes, ed. Aristotelis meteorologicorum libri quattuor. Cambridge, Mass.: Harvard University Press, 1919; repr. 1967.',
    },
    translations: [
      { id: 'webster', name: 'E. W. Webster (Oxford, 1923)', short: 'Webster', slot: 'english' },
    ],
    blurb: 'Aristotle on the phenomena of the upper air and the earth — weather, comets, rivers, and the sea, in four books.',
  },
  {
    id: 'DA',
    title: 'De Anima',
    abbr: 'DA',
    author: 'Aristotle',
    books: 3,
    bookLabels: ['I', 'II', 'III'],
    greekEdition: 'Ross, Aristotelis De Anima (OCT, 1956)',
    greekSource: {
      short: 'Ross (OCT, 1956)',
      full: 'W. D. Ross, ed. Aristotle, De Anima. Oxford: Clarendon Press (Oxford Classical Texts), 1956.',
    },
    translations: [
      { id: 'smith', name: 'J. A. Smith (Oxford, 1931)', short: 'Smith', slot: 'english' },
    ],
    blurb: 'Aristotle on the soul, perception, and intellect, in three books.',
  },
  // The Parva Naturalia — Aristotle's short treatises on psycho-physical
  // topics. All single-book (bookless) works whose TLG Greek comes from Ross's
  // OCT Parva Naturalia (1955); the Oxford translations (Beare / G. R. T. Ross,
  // 1908) are public domain. "On Youth…" (Juv) splices the TLG's De juventute
  // and De respiratione into one continuous treatise (see manifests/Juv.yaml).
  {
    id: 'Sens',
    title: 'Sense and Sensibilia',
    abbr: 'Sens.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Ross, Aristotle: Parva Naturalia (OCT, 1955)',
    greekSource: {
      short: 'Ross (OCT, 1955)',
      full: 'W. D. Ross, ed. Aristotle: Parva Naturalia. Oxford: Clarendon Press, 1955; repr. 1970.',
    },
    translations: [
      { id: 'beare', name: 'J. I. Beare (Oxford, 1908)', short: 'Beare', slot: 'english' },
    ],
    blurb: 'Aristotle on perception and its objects — colour, sound, flavour, and smell.',
  },
  {
    id: 'Mem',
    title: 'On Memory',
    abbr: 'Mem.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Ross, Aristotle: Parva Naturalia (OCT, 1955)',
    greekSource: {
      short: 'Ross (OCT, 1955)',
      full: 'W. D. Ross, ed. Aristotle: Parva Naturalia. Oxford: Clarendon Press, 1955; repr. 1970.',
    },
    translations: [
      { id: 'beare', name: 'J. I. Beare (Oxford, 1908)', short: 'Beare', slot: 'english' },
    ],
    blurb: 'Aristotle on memory and recollection.',
  },
  {
    id: 'Somn',
    title: 'On Sleep',
    abbr: 'Somn.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Ross, Aristotle: Parva Naturalia (OCT, 1955)',
    greekSource: {
      short: 'Ross (OCT, 1955)',
      full: 'W. D. Ross, ed. Aristotle: Parva Naturalia. Oxford: Clarendon Press, 1955; repr. 1970.',
    },
    translations: [
      { id: 'beare', name: 'J. I. Beare (Oxford, 1908)', short: 'Beare', slot: 'english' },
    ],
    blurb: 'Aristotle on sleep and waking.',
  },
  {
    id: 'Insomn',
    title: 'On Dreams',
    abbr: 'Insom.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Ross, Aristotle: Parva Naturalia (OCT, 1955)',
    greekSource: {
      short: 'Ross (OCT, 1955)',
      full: 'W. D. Ross, ed. Aristotle: Parva Naturalia. Oxford: Clarendon Press, 1955; repr. 1970.',
    },
    translations: [
      { id: 'beare', name: 'J. I. Beare (Oxford, 1908)', short: 'Beare', slot: 'english' },
    ],
    blurb: 'Aristotle on dreams and their causes.',
  },
  {
    id: 'DivSomn',
    title: 'On Divination in Sleep',
    abbr: 'Div. Somn.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Ross, Aristotle: Parva Naturalia (OCT, 1955)',
    greekSource: {
      short: 'Ross (OCT, 1955)',
      full: 'W. D. Ross, ed. Aristotle: Parva Naturalia. Oxford: Clarendon Press, 1955; repr. 1970.',
    },
    translations: [
      { id: 'beare', name: 'J. I. Beare (Oxford, 1908)', short: 'Beare', slot: 'english' },
    ],
    blurb: 'Aristotle on prophecy and divination through dreams.',
  },
  {
    id: 'Long',
    title: 'On Length and Shortness of Life',
    abbr: 'Long.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Ross, Aristotle: Parva Naturalia (OCT, 1955)',
    greekSource: {
      short: 'Ross (OCT, 1955)',
      full: 'W. D. Ross, ed. Aristotle: Parva Naturalia. Oxford: Clarendon Press, 1955; repr. 1970.',
    },
    translations: [
      { id: 'ross', name: 'G. R. T. Ross (Oxford, 1908)', short: 'Ross', slot: 'english' },
    ],
    blurb: 'Aristotle on why some living things are long-lived and others short-lived.',
  },
  {
    id: 'Juv',
    title: 'On Youth, Old Age, Life and Death, and Respiration',
    abbr: 'Juv.',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Ross, Aristotle: Parva Naturalia (OCT, 1955)',
    greekSource: {
      short: 'Ross (OCT, 1955)',
      full: 'W. D. Ross, ed. Aristotle: Parva Naturalia. Oxford: Clarendon Press, 1955; repr. 1970.',
    },
    translations: [
      { id: 'ross', name: 'G. R. T. Ross (Oxford, 1908)', short: 'Ross', slot: 'english' },
    ],
    blurb: 'Aristotle on youth and old age, life and death, and the role of respiration.',
  },
  {
    id: 'HA',
    title: 'History of Animals',
    abbr: 'HA',
    author: 'Aristotle',
    // The TLG/Bekker text carries ten books, but Book X (on the causes of
    // sterility) is spurious and untranslated; like modern editions we present
    // the genuine Books I–IX.
    books: 9,
    bookLabels: ROMAN.slice(0, 9),
    greekEdition: 'Louis, Aristote: Histoire des animaux (Budé, 1964–69)',
    greekSource: {
      short: 'Louis (Budé, 1964–69)',
      full: 'P. Louis, ed. Aristote: Histoire des animaux. 3 vols. Paris: Les Belles Lettres (Budé), 1964–69.',
    },
    translations: [
      { id: 'thompson', name: 'D’Arcy Wentworth Thompson (Oxford, 1910)', short: 'Thompson', slot: 'english' },
    ],
    blurb: 'Aristotle’s great survey of animal life — anatomy, reproduction, habits, and behaviour — in nine books.',
  },
  {
    id: 'PA',
    title: 'Parts of Animals',
    abbr: 'PA',
    author: 'Aristotle',
    books: 4,
    bookLabels: ROMAN.slice(0, 4),
    greekEdition: 'Louis, Aristote: Les parties des animaux (Budé, 1956)',
    greekSource: {
      short: 'Louis (Budé, 1956)',
      full: 'P. Louis, ed. Aristote: Les parties des animaux. Paris: Les Belles Lettres (Budé), 1956.',
    },
    translations: [
      { id: 'ogle', name: 'William Ogle (Oxford, 1912)', short: 'Ogle', slot: 'english' },
    ],
    blurb: 'Aristotle’s study of the causes and functions of animal parts — the foundational work of his biology — in four books.',
  },
  {
    id: 'MA',
    title: 'Movement of Animals',
    abbr: 'MA',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Jaeger, Aristotelis De animalium motione (Teubner, 1913)',
    greekSource: {
      short: 'Jaeger (Teubner, 1913)',
      full: 'W. Jaeger, ed. Aristotelis de animalium motione et de animalium incessu. Leipzig: Teubner, 1913.',
    },
    translations: [
      { id: 'farquharson', name: 'A. S. L. Farquharson (Oxford, 1912)', short: 'Farquharson', slot: 'english' },
    ],
    blurb: 'Aristotle on the common cause of all animal locomotion — what moves the moving animal.',
  },
  {
    id: 'IA',
    title: 'Progression of Animals',
    abbr: 'IA',
    author: 'Aristotle',
    books: 1,
    bookLabels: ['1'],
    greekEdition: 'Jaeger, Aristotelis De animalium incessu (Teubner, 1913)',
    greekSource: {
      short: 'Jaeger (Teubner, 1913)',
      full: 'W. Jaeger, ed. Aristotelis de animalium motione et de animalium incessu. Leipzig: Teubner, 1913.',
    },
    translations: [
      { id: 'farquharson', name: 'A. S. L. Farquharson (Oxford, 1912)', short: 'Farquharson', slot: 'english' },
    ],
    blurb: 'Aristotle on the parts animals use to move — why they have the number and kind of limbs they do.',
  },
  {
    id: 'GA',
    title: 'Generation of Animals',
    abbr: 'GA',
    author: 'Aristotle',
    books: 5,
    bookLabels: ROMAN.slice(0, 5),
    greekEdition: 'Drossaart Lulofs, Aristotelis De Generatione Animalium (OCT, 1965)',
    greekSource: {
      short: 'Drossaart Lulofs (OCT, 1965)',
      full: 'H. J. Drossaart Lulofs, ed. Aristotelis de generatione animalium. Oxford: Clarendon Press (Oxford Classical Texts), 1965; repr. 1972.',
    },
    translations: [
      { id: 'platt', name: 'Arthur Platt (Oxford, 1910)', short: 'Platt', slot: 'english' },
    ],
    blurb: 'Aristotle on animal reproduction — the sexes, semen, heredity, and the formation of the embryo — in five books.',
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
    greekSource: {
      short: 'Ross (OCT, 1953)',
      full: 'W. D. Ross, ed. Aristotle’s Metaphysics. 2 vols. Oxford: Clarendon Press, 1953.',
    },
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
    greekSource: {
      short: 'Ross (OCT, 1964)',
      full: 'W. D. Ross, ed. Aristotelis analytica priora et posteriora. Oxford: Clarendon Press, 1964.',
    },
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
    greekSource: {
      short: 'Ross (OCT, 1964)',
      full: 'W. D. Ross, ed. Aristotelis analytica priora et posteriora. Oxford: Clarendon Press, 1964.',
    },
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
    greekSource: {
      short: 'Ross (OCT, 1958)',
      full: 'W. D. Ross, ed. Aristotelis topica et sophistici elenchi. Oxford: Clarendon Press, 1958.',
    },
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
    greekSource: {
      short: 'Ross (OCT, 1958)',
      full: 'W. D. Ross, ed. Aristotelis topica et sophistici elenchi. Oxford: Clarendon Press, 1958.',
    },
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
    greekSource: {
      short: 'Bywater (OCT, 1894)',
      full: 'Ingram Bywater, ed. Aristotelis Ethica Nicomachea. Oxford: Clarendon Press (Oxford Classical Texts), 1894; repr. 1962.',
    },
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
    greekSource: {
      short: 'Ross (OCT, 1957)',
      full: 'W. D. Ross, ed. Aristotelis politica. Oxford: Clarendon Press, 1957.',
    },
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
    greekSource: {
      short: 'Ross (OCT, 1959)',
      full: 'W. D. Ross, ed. Aristotelis ars rhetorica. Oxford: Clarendon Press, 1959.',
    },
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
    greekSource: {
      short: 'Kassel (OCT, 1966)',
      full: 'R. Kassel, ed. Aristotelis de arte poetica liber. Oxford: Clarendon Press, 1965; repr. 1968 [of 1966 corr. edn.].',
    },
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
          { id: 'Phys' },
          { id: 'Cael' },
          { id: 'GC' },
          { id: 'Mete' },
          { id: 'DA' },
        ],
      },
      {
        ref: 'II.b',
        label: 'Short Works on Nature (Parva Naturalia)',
        works: [
          { id: 'Sens' },
          { id: 'Mem' },
          { id: 'Somn' },
          { id: 'Insomn' },
          { id: 'DivSomn' },
          { id: 'Long' },
          { id: 'Juv' },
        ],
      },
      {
        ref: 'II.c',
        label: 'Biological Works',
        works: [
          { id: 'HA' },
          { id: 'PA' },
          { id: 'MA' },
          { id: 'IA' },
          { id: 'GA' },
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

// A named group of works for the search "works to include" selector: one entry
// per home-page (sub)division, in home-page order, holding only the existing
// works (placeholders dropped). Categories with subcategories contribute one
// group per subcategory; categories without contribute a single group.
export interface WorkGroup {
  ref: string;    // 'I', 'II.a', … (the numeral or subcategory ref)
  label: string;  // the division's title/label
  ids: string[];  // existing work ids in this group, in order
}

export const WORK_GROUPS: WorkGroup[] = (() => {
  const groups: WorkGroup[] = [];
  const ids = (ws: CategoryWork[]) => ws.filter(w => w.id && BY_ID.has(w.id)).map(w => w.id!);
  for (const cat of CATEGORIES) {
    if (cat.works) {
      const g = ids(cat.works);
      if (g.length) groups.push({ ref: cat.numeral, label: cat.title, ids: g });
    }
    for (const sub of cat.subcategories ?? []) {
      const g = ids(sub.works);
      if (g.length) groups.push({ ref: sub.ref, label: sub.label, ids: g });
    }
  }
  return groups;
})();

// Cross-work ordering for search results, matching the home page's CATEGORIES
// flatten order (which differs from the raw WORKS/corpus order). Any real work
// not referenced by CATEGORIES is appended in WORKS order so every searchable
// work has a defined index.
export const WORK_ORDER: Map<string, number> = (() => {
  const order: string[] = [];
  for (const g of WORK_GROUPS) for (const id of g.ids) order.push(id);
  for (const w of WORKS) if (!order.includes(w.id)) order.push(w.id);
  return new Map(order.map((id, i) => [id, i]));
})();
