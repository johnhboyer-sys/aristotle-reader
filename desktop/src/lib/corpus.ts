// The desktop corpus registry — the data model from the v1 build plan.
//
// This EXTENDS the website's registry (app/src/lib/works.ts, which stays the
// source of truth for everything about a built work: books, translations,
// Greek source, citation scheme details). What it adds is what the website
// never needed:
//
//  - canonical `work` slugs where they differ from the site's URL slug
//    (Metaph vs Meta, Isag vs Isa) with `siteSlug` carrying the bridge — the
//    site slug is ALSO the data-directory name, so everything that touches
//    data or works.ts goes through `dataId()`;
//  - the not-yet-built works of the traditional corpus (manifest slots only,
//    so the model never assumes the corpus is fixed at its current size);
//  - the `authenticity` facet (genuine | disputed | spurious), meaningful only
//    for works traditionally attributed to Aristotle — shown as a badge,
//    never used to hide anything by default;
//  - a separate Companion Texts section for works ABOUT Aristotle by other
//    authors (Porphyry's Isagoge today; an Aquinas commentary is anticipated —
//    hence `citationScheme: 'lecture'` and `originalLanguage: 'la'` existing
//    in the schema now, unused).

export type Authenticity = 'genuine' | 'disputed' | 'spurious';

export interface CorpusEntry {
  /** Canonical slug — standard classicist abbreviation. */
  work: string;
  /** The live site's URL/data-directory slug, only when it differs. */
  siteSlug?: string;
  title: string;
  /** CTS URN (textgroup.work). */
  tlg: string;
  /** Defaults to 'aristotle'; companion texts override. */
  author?: string;
  /** Only meaningful when author is Aristotle. Defaults to 'genuine'. */
  authenticity?: Authenticity;
  /** Extra search words for the rail's quick-filter — common scholarly
   *  shorthand and alternate English titles that don't already appear in
   *  `title`/`work`/`siteSlug` (e.g. "NE"/"Ethics" for Nicomachean Ethics). */
  aliases?: string;
  /** Defaults to 'bekker'. 'lecture' is anticipated for Aquinas (liber.lectio, n. ##,
   *  paragraph numbers continuous through each book — they do NOT reset per lectio). */
  citationScheme?: 'bekker' | 'chapter' | 'lecture';
  /** Defaults to 'grc'. 'la' anticipated for Latin commentaries. */
  originalLanguage?: 'grc' | 'la';
  /** Built data exists in the corpus (mirrors works.ts membership). */
  live: boolean;
}

export interface CorpusGroup {
  label: string;
  /** Extra search words for the rail's quick-filter — the traditional label
   *  and the common English name don't always coincide (Organon = logic). */
  aliases?: string;
  entries: CorpusEntry[];
}

/** The works.ts / data-directory id for an entry. */
export const dataId = (e: CorpusEntry): string => e.siteSlug ?? e.work;

const W = (
  work: string, title: string, tlg: string,
  opts: Partial<CorpusEntry> = {},
): CorpusEntry => ({ work, title, tlg, live: true, ...opts });

const slot = (
  work: string, title: string, tlg: string,
  opts: Partial<CorpusEntry> = {},
): CorpusEntry => ({ work, title, tlg, live: false, ...opts });

// Traditional arrangement of the corpus; not-yet-built slots sit inline in
// their traditional group (greyed in the rail), not in a ghetto of their own.
export const CORPUS_GROUPS: CorpusGroup[] = [
  {
    label: 'Organon',
    aliases: 'logic',
    entries: [
      W('Cat', 'Categories', 'tlg0086.tlg006'),
      W('Int', 'De Interpretatione', 'tlg0086.tlg017', { aliases: 'on interpretation peri hermeneias' }),
      W('APr', 'Prior Analytics', 'tlg0086.tlg001'),
      W('APo', 'Posterior Analytics', 'tlg0086.tlg001'),
      W('Top', 'Topics', 'tlg0086.tlg044'),
      W('SE', 'Sophistical Refutations', 'tlg0086.tlg040', { aliases: 'sophistici elenchi' }),
    ],
  },
  {
    label: 'Natural Philosophy',
    entries: [
      W('Phys', 'Physics', 'tlg0086.tlg031'),
      W('Cael', 'On the Heavens', 'tlg0086.tlg005', { aliases: 'de caelo' }),
      W('GC', 'On Generation and Corruption', 'tlg0086.tlg013', { aliases: 'de generatione' }),
      W('Mete', 'Meteorology', 'tlg0086.tlg026', { aliases: 'meteorologica' }),
      W('DA', 'On the Soul', 'tlg0086.tlg002', { aliases: 'de anima' }),
      slot('Mu', 'On the Cosmos', 'tlg0086.tlg028', { authenticity: 'spurious' }),
      slot('Mech', 'Mechanics', 'tlg0086.tlg023', { authenticity: 'spurious' }),
      slot('Probl', 'Problems', 'tlg0086.tlg036', { authenticity: 'disputed' }),
      slot('Col', 'On Colors', 'tlg0086.tlg007', { authenticity: 'spurious' }),
      slot('Aud', 'On Things Heard', 'tlg0086.tlg004', { authenticity: 'spurious' }),
      slot('Physiogn', 'Physiognomonics', 'tlg0086.tlg032', { authenticity: 'disputed' }),
      slot('Plant', 'On Plants', 'tlg0086.tlg051x02', { authenticity: 'spurious' }),
      slot('Mirab', 'On Marvellous Things Heard', 'tlg0086.tlg027', { authenticity: 'spurious' }),
    ],
  },
  {
    label: 'Parva Naturalia',
    aliases: 'pn short works on nature natural philosophy',
    entries: [
      W('Sens', 'Sense and Sensibilia', 'tlg0086.tlg041'),
      W('Mem', 'On Memory and Recollection', 'tlg0086.tlg024'),
      W('Somn', 'On Sleep and Waking', 'tlg0086.tlg042'),
      W('Insomn', 'On Dreams', 'tlg0086.tlg016'),
      W('DivSomn', 'On Divination in Sleep', 'tlg0086.tlg008'),
      W('Long', 'On Length and Shortness of Life', 'tlg0086.tlg020'),
      W('Juv', 'On Youth, Old Age, Life and Death', 'tlg0086.tlg018'),
      slot('Resp', 'On Respiration', 'tlg0086.tlg037'),
      slot('Spir', 'On Breath', 'tlg0086.tlg043', { authenticity: 'disputed' }),
    ],
  },
  {
    label: 'Biology',
    aliases: 'animals natural philosophy',
    entries: [
      W('HA', 'History of Animals', 'tlg0086.tlg014'),
      W('PA', 'Parts of Animals', 'tlg0086.tlg030'),
      W('MA', 'Movement of Animals', 'tlg0086.tlg021'),
      W('IA', 'Progression of Animals', 'tlg0086.tlg015'),
      W('GA', 'Generation of Animals', 'tlg0086.tlg012'),
    ],
  },
  {
    label: 'First Philosophy',
    aliases: 'metaphysics',
    entries: [
      W('Metaph', 'Metaphysics', 'tlg0086.tlg025', { siteSlug: 'Meta', aliases: 'meta' }),
    ],
  },
  {
    label: 'Ethics & Politics',
    entries: [
      W('EN', 'Nicomachean Ethics', 'tlg0086.tlg010', { aliases: 'ne ethics' }),
      W('EE', 'Eudemian Ethics', 'tlg0086.tlg009', { aliases: 'eudemian' }),
      W('Pol', 'Politics', 'tlg0086.tlg035'),
      slot('MM', 'Magna Moralia', 'tlg0086.tlg022', { authenticity: 'disputed' }),
      slot('AthPol', 'Constitution of the Athenians', 'tlg0086.tlg003'),
      slot('Oec', 'Economics', 'tlg0086.tlg029', { authenticity: 'disputed' }),
      slot('VV', 'On Virtues and Vices', 'tlg0086.tlg045', { authenticity: 'disputed' }),
    ],
  },
  {
    label: 'Rhetoric & Poetics',
    entries: [
      W('Rhet', 'Rhetoric', 'tlg0086.tlg038'),
      W('Poet', 'Poetics', 'tlg0086.tlg034'),
    ],
  },
  {
    // Texts ABOUT Aristotle by other identifiable authors — their own CTS
    // textgroup, no authenticity tier (nobody ever attributed these to him).
    label: 'Companion Texts',
    aliases: 'commentary porphyry',
    entries: [
      W('Isag', 'Isagoge', 'tlg2034.tlg007', {
        siteSlug: 'Isa',
        author: 'Porphyry',
        citationScheme: 'chapter',
      }),
      // Anticipated, deliberately NOT an entry yet (schema check only):
      // Aquinas, Sententia Libri Ethicorum — citationScheme 'lecture',
      // originalLanguage 'la'. The whole Greek ingestion pipeline (TLG export,
      // Beta Code, Morpheus, LSJ) does not apply to a Latin source; building
      // that is a distinct, later project.
    ],
  },
];

export const ALL_ENTRIES: CorpusEntry[] = CORPUS_GROUPS.flatMap(g => g.entries);

export function entryByDataId(id: string): CorpusEntry | undefined {
  return ALL_ENTRIES.find(e => dataId(e) === id);
}
