import { fetchChapters, type ChapterRef } from '@shared/lib/data';
import { WORKS } from '@shared/lib/works';

export type PublisherPresetId = 'other' | 'clarendon' | 'peripatetic';
export type FootnotePlacement = 'page-bottom' | 'endnote';

/** App import defaults. This type stays separate from the CLI CorpusConfig. */
export interface PublisherPreset {
  presetId?: Exclude<PublisherPresetId, 'other'>;
  headingStyle?: {
    bookOrdinal?: 'greek-letter';
    chapterNumeral?: 'bare';
  };
  side?: 'verso' | 'recto' | 'alternating';
  endnotes?: { source: 'witness-commentary' };
  witnessStructure?: { format: 'genie-markdown' };
  footnotePlacement?: FootnotePlacement;
  strayNumeralStyle?: 'roman' | 'arabic';
  interiorRunningHeads?: { pattern?: string };
}

export interface PublisherPresetOption {
  id: PublisherPresetId;
  label: string;
  preset: PublisherPreset;
}

/** Bundled registry. `other` is deliberately empty and remains the default. */
export const PUBLISHER_PRESETS: readonly PublisherPresetOption[] = [
  { id: 'other', label: 'Other / plain text', preset: {} },
  {
    id: 'clarendon',
    label: 'Clarendon / OUP',
    preset: {
      presetId: 'clarendon',
      footnotePlacement: 'page-bottom',
      strayNumeralStyle: 'roman',
    },
  },
  {
    id: 'peripatetic',
    label: 'Peripatetic Press',
    preset: {
      presetId: 'peripatetic',
      headingStyle: { bookOrdinal: 'greek-letter', chapterNumeral: 'bare' },
      side: 'verso',
      endnotes: { source: 'witness-commentary' },
      witnessStructure: { format: 'genie-markdown' },
      footnotePlacement: 'endnote',
      strayNumeralStyle: 'arabic',
    },
  },
] as const;

export const DEFAULT_PUBLISHER_PRESET_ID: PublisherPresetId = 'other';

export function getPublisherPreset(id: PublisherPresetId): PublisherPreset {
  const option = PUBLISHER_PRESETS.find(item => item.id === id);
  if (!option) throw new Error(`Unknown publisher preset: ${id}`);
  return option.preset;
}

export interface ResolvedWorkStructure {
  workId: string;
  workTitle: string;
  runningHeadPlaceholder: string;
  books: number;
  bookLabels: string[];
  chaptersPerBook: number[];
  chapterKeysByBook: Record<number, number[]>;
  bekkerStart: string;
  bekkerEnd: string;
}

function fail(workId: string, detail: string): never {
  throw new Error(`Cannot load import structure for ${workId}: ${detail}`);
}

function refsInBook(
  workId: string,
  chapters: Record<string, ChapterRef[]>,
  book: number,
): ChapterRef[] {
  const refs = chapters[String(book)];
  if (!Array.isArray(refs) || refs.length === 0) {
    fail(workId, `chapters.json has no chapters for book ${book}.`);
  }
  return refs;
}

function chapterKeys(workId: string, book: number, refs: ChapterRef[]): number[] {
  const keys = refs.map(ref => Number(ref.chapter));
  if (keys.some(key => !Number.isInteger(key) || key < 1)) {
    fail(workId, `chapters.json has a non-numeric chapter key in book ${book}.`);
  }
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i] !== i + 1) {
      fail(workId, `chapters.json has an incomplete or unordered chapter sequence in book ${book}.`);
    }
  }
  return keys;
}

function firstBekkerColumn(workId: string, ref: ChapterRef): string {
  const match = /\d{1,4}[ab]/u.exec(ref.bekker || ref.column);
  if (!match) fail(workId, 'chapters.json has no readable starting Bekker column.');
  return match[0];
}

function lastBekkerColumn(workId: string, ref: ChapterRef): string {
  const matches = [...(ref.bekker || ref.column).matchAll(/\d{1,4}[ab]/gu)];
  if (!matches.length) fail(workId, 'chapters.json has no readable ending Bekker column.');
  return matches.at(-1)![0];
}

/** Resolve and validate the runtime work data used by Edition and R6. */
export async function resolveWorkStructure(
  workId: string,
  loadedChapters?: Record<string, ChapterRef[]>,
): Promise<ResolvedWorkStructure> {
  const work = WORKS.find(item => item.id === workId);
  if (!work) fail(workId, 'the work is not present in WORKS.');

  let chapters = loadedChapters;
  if (!chapters) {
    try {
      chapters = await fetchChapters(workId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(workId, `chapters.json could not be loaded (${message}).`);
    }
  }
  if (!chapters || typeof chapters !== 'object') {
    fail(workId, 'chapters.json is missing or invalid.');
  }

  const numericBooks = Object.keys(chapters)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  const expectedBooks = Array.from({ length: work.books }, (_, index) => index + 1);
  if (numericBooks.length !== expectedBooks.length
      || numericBooks.some((book, index) => book !== expectedBooks[index])) {
    fail(
      workId,
      `WORKS declares ${work.books} book${work.books === 1 ? '' : 's'}, but chapters.json covers ${numericBooks.length}.`,
    );
  }

  const chapterKeysByBook: Record<number, number[]> = {};
  const chaptersPerBook = expectedBooks.map(book => {
    const keys = chapterKeys(workId, book, refsInBook(workId, chapters, book));
    chapterKeysByBook[book] = keys;
    return keys.length;
  });
  const firstRef = refsInBook(workId, chapters, 1)[0];
  const finalRefs = refsInBook(workId, chapters, work.books);
  const finalRef = finalRefs.at(-1)!;

  return {
    workId,
    workTitle: work.title,
    runningHeadPlaceholder: work.title,
    books: work.books,
    bookLabels: [...work.bookLabels],
    chaptersPerBook,
    chapterKeysByBook,
    bekkerStart: firstBekkerColumn(workId, firstRef),
    bekkerEnd: lastBekkerColumn(workId, finalRef),
  };
}
