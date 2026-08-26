import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runImportMock = vi.hoisted(() => vi.fn());
const dehyphenateMock = vi.hoisted(() => vi.fn());
const listReviewItemsMock = vi.hoisted(() => vi.fn());
const resolveReviewsMock = vi.hoisted(() => vi.fn());
const fetchChaptersMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/imports', () => {
  class ImportCollision extends Error {
    constructor(public work: string, public id: string) {
      super('collision');
    }
  }
  class DivisionGapError extends Error {
    constructor(public audit: unknown) {
      super('division gaps');
    }
  }
  return { runImport: runImportMock, ImportCollision, DivisionGapError };
});

vi.mock('@shared/lib/data', () => ({ fetchChapters: fetchChaptersMock }));

vi.mock('../lib/dehyphenate', () => ({
  dehyphenate: dehyphenateMock,
  listReviewItems: listReviewItemsMock,
  resolveReviews: resolveReviewsMock,
}));

import ImportDialog from '../components/ImportDialog.svelte';
import { clarendonFourPages } from '../lib/pdf-import/__tests__/fixtures/clarendon-geometry';

type ImportReq = {
  raw: string;
  original: string;
  work: string;
  translator: string;
  booksCovered: number[];
  footnotePlacement?: 'page-bottom' | 'endnote';
  footnotePlacementOverride?: 'page-bottom' | 'endnote';
  waiveDivisionGaps?: boolean;
  replace?: boolean;
  idOverride?: string;
  preClean?: {
    warnings: string[];
    stripCounts: { folioParagraphs: number; strayHeadingNumerals: number };
  };
};

const lastRequest = () => runImportMock.mock.calls[0][0] as ImportReq;

beforeEach(() => {
  runImportMock.mockReset();
  dehyphenateMock.mockReset();
  listReviewItemsMock.mockReset();
  resolveReviewsMock.mockReset();
  fetchChaptersMock.mockReset();
  fetchChaptersMock.mockResolvedValue(Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [String(index + 1), [{
      chapter: '1', column: `${1094 + index}a`, line: '1', bekker: `${1094 + index}a1–${1094 + index}b20`,
    }]]),
  ));
  dehyphenateMock.mockImplementation(async (text: string) => ({
    text: text.replace('exam-\nple', 'example'),
    decisions: text.includes('exam-\nple')
      ? [{ original: 'exam-\nple', closed: 'example', hyphenated: 'exam-ple', action: 'joined', context: '' }]
      : [],
    reviewCount: 0,
    ran: text.includes('exam-\nple'),
  }));
  listReviewItemsMock.mockReturnValue([]);
  resolveReviewsMock.mockImplementation((text: string) => text);
  runImportMock.mockImplementation(async (req: ImportReq) => ({
    meta: {
      formatVersion: 1,
      work: req.work,
      translator: req.translator,
      license: 'public-domain',
      language: 'en',
      id: 'test-en',
    },
    density: 'chapter-only',
    warnings: req.preClean?.warnings ?? [],
    chapters: 1,
    tagged: 1,
    placed: 0,
    interpolated: 0,
    replaced: false,
    divisionAudit: {
      booksCovered: req.booksCovered,
      bookLabels: Array.from({ length: 10 }, (_, index) => String(index + 1)),
      booksFound: req.booksCovered.length,
      booksExpected: req.booksCovered.length,
      chaptersFound: req.booksCovered.length,
      chaptersExpected: req.booksCovered.length,
      chapterKeysFound: Object.fromEntries(req.booksCovered.map(book => [book, [1]])),
      gaps: [],
    },
    stripCounts: req.preClean?.stripCounts,
  }));
});

// Three bare numerals in cadence — the shortest run S2 will now propose.
const FOLIO_RUN = [
  '{1.1} Opening sentence.', '10', 'Middle sentence.', '12',
  'Later sentence.', '14', 'Closing sentence.',
].join('\n\n');

// Hard-wrapped prose in two blank-line-delimited blocks: the shape whose
// single newlines are physical wraps and whose blank lines are paragraphs.
const WRAP_SHAPED = [
  '{1.1} The first paragraph of this scan was wrapped by a machine',
  'at the printed measure, so the lines',
  'break in the middle of clauses,',
  'and it goes on that way until it has run out of words.',
  '',
  'A third paragraph, wrapped the same way, continues past the end',
  'of its first line and stops when it runs out.',
].join('\n');

// The same shape, arranged so that every pre-clean review step has something
// to show: a wrap to join, a sentence split across a blank line for N1, and a
// three-number folio cadence for S2.
const WRAP_SHAPED_WITH_FOLIOS = [
  '{1.1} The first paragraph of this scan was wrapped by a machine',
  'at the printed measure, so the lines',
  'break in the middle of clauses,',
  '',
  'and the sentence carries on into what the scan broke off as a',
  'second block, though it is really one sentence,',
  '',
  '10',
  '',
  'a paragraph after the folio number,',
  '',
  '12',
  '',
  'another paragraph after a folio,',
  '',
  '14',
  '',
  'and a closing paragraph.',
].join('\n');

const SYNTHETIC_LAYOUT = [
  'FRONT HEAD\nNeutral contents page.',
  [
    'SYNTHETIC WORK',
    '',
    '                  BOOK ONE',
    '             CHAPTER I',
    '100a       A neutral term 1 appears in body with enough words.',
    '5          Another synthetic sentence keeps the gutter cadence.',
    '',
    '1 Reading a synthetic variant.',
    '    78',
  ].join('\n'),
  [
    'SYNTHETIC WORK',
    '100b       A second page contains neutral prose for conversion.',
    '5          Its next line keeps the same made-up cadence.',
  ].join('\n'),
  'COMMENTARY\nNeutral back matter.',
].join('\f');

const SYNTHETIC_LAYOUT_NO_NOTES = SYNTHETIC_LAYOUT
  .replace('A neutral term 1 appears in body with enough words.', 'A neutral term appears in body with enough words.')
  .replace('\n\n1 Reading a synthetic variant.\n    78', '');

const SYNTHETIC_SEAM_LAYOUT = SYNTHETIC_LAYOUT
  .replace('BOOK ONE', 'BOOK TEN')
  .replace(
    'SYNTHETIC WORK\n100b',
    'SYNTHETIC WORK\n\n                  BOOK ONE\n             CHAPTER I\n100b',
  );

function mount(raw: string) {
  return render(ImportDialog, {
    props: {
      file: { name: 'synthetic.md', text: raw },
      presetWork: 'EN',
      onClose: vi.fn(),
    },
  });
}

// N1 proposes joins wherever a line ends mid-clause; excluding all of them
// keeps a mode-1 declaration's line breaks exactly as the file wrote them.
async function excludeEveryJoin() {
  for (const row of screen.getAllByRole('button', { name: /Join here/ })) {
    await fireEvent.click(row);
  }
  await fireEvent.click(screen.getByRole('button', { name: 'Apply 0 selected joins' }));
}

async function submitMetadata() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
  await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await fillAndImport();
}

async function fillAndImport() {
  await fireEvent.input(screen.getByPlaceholderText('e.g. Rackham'), { target: { value: 'Tester' } });
  await fireEvent.click(screen.getByLabelText('No'));
  await fireEvent.click(screen.getByRole('button', { name: 'Import' }));
}

async function selectValue(label: string, value: string) {
  const select = screen.getByLabelText(label) as HTMLSelectElement;
  select.value = value;
  await fireEvent.change(select);
}

describe('ImportDialog Edition preflight', () => {
  it('puts Edition before the tagged metadata and review flow, with Other and all books selected', async () => {
    mount('{1.1} A synthetic chapter.');

    expect(screen.getByRole('heading', { name: 'Edition' })).toBeInTheDocument();
    expect(screen.getByLabelText('Publisher')).toHaveValue('other');
    expect(screen.queryByPlaceholderText('e.g. Rackham')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    const covered = screen.getAllByRole('checkbox');
    expect(covered).toHaveLength(10);
    expect(covered.every(input => (input as HTMLInputElement).checked)).toBe(true);

    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByPlaceholderText('e.g. Rackham')).toBeInTheDocument();
  });

  it('puts Edition before layout conversion and the metadata form', async () => {
    mount(clarendonFourPages);

    expect(screen.getByRole('heading', { name: 'Edition' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Rackham')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByPlaceholderText('e.g. Rackham')).toBeInTheDocument();
  });

  it('runs configured stages and conversion only after Edition, then opens the form', async () => {
    mount(SYNTHETIC_LAYOUT);

    expect(screen.getByRole('heading', { name: 'Edition' })).toBeInTheDocument();
    await selectValue('Publisher', 'clarendon');
    await fireEvent.click(screen.getByText('Edition override'));
    expect(screen.getByLabelText('Slice front and back matter before conversion')).toBeChecked();
    expect(screen.getByLabelText('Body-start pattern')).toHaveValue(
      '^\\s{5,}BOOK\\s+([A-Z]+|\\d{1,2})\\s*$',
    );
    expect(screen.getByLabelText('Trim preamble on the body-start page')).toBeChecked();
    expect(screen.getByLabelText('Back-matter pattern')).toHaveValue('^\\s*COMMENTARY\\s*$');
    expect(screen.getByLabelText('Normalize layout spacing')).toBeChecked();
    expect(screen.getByLabelText('Normalize page-bottom footnotes')).toBeChecked();
    expect(screen.queryByPlaceholderText('e.g. Rackham')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByPlaceholderText('e.g. Rackham')).toBeInTheDocument();
  });

  it('shows a stage/config error before conversion instead of importing unsliced text', async () => {
    mount('HEAD\nNo declared body boundary.\fHEAD\n100a     Neutral line.');
    await selectValue('Publisher', 'clarendon');
    await fireEvent.click(screen.getByText('Edition override'));
    await fireEvent.input(screen.getByLabelText('Body-start pattern'), {
      target: { value: '^CUSTOM BODY$' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('heading', { name: 'Import failed' })).toBeInTheDocument();
    expect(screen.getByText(/stage 1 \(slice\).*slice\.bodyStart/u)).toBeInTheDocument();
    expect(screen.getByText(/Clarendon \/ OUP boundary pattern “\^CUSTOM BODY\$” was not found/u)).toBeInTheDocument();
    expect(screen.queryByText(/corpus/u)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Rackham')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Back to Edition' }));
    expect(screen.getByRole('heading', { name: 'Edition' })).toBeInTheDocument();
    expect(screen.getByLabelText('Publisher')).toHaveValue('clarendon');
    expect(screen.getByLabelText('Body-start pattern')).toHaveValue('^CUSTOM BODY$');
  });

  it('refuses a seamed layout at the named work boundary and returns to Edition', async () => {
    mount(SYNTHETIC_SEAM_LAYOUT);
    await selectValue('Publisher', 'clarendon');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('heading', { name: 'Import failed' })).toBeInTheDocument();
    expect(screen.getByText(/book sequence restarts at Book 1/u)).toBeInTheDocument();
    expect(runImportMock).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: 'Back to Edition' }));
    expect(screen.getByRole('heading', { name: 'Edition' })).toBeInTheDocument();
  });

  it('imports an unseamed layout through the same conversion boundary', async () => {
    mount(SYNTHETIC_LAYOUT_NO_NOTES);
    await selectValue('Publisher', 'clarendon');
    await submitMetadata();

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { name: 'Imported Tester' })).toBeInTheDocument();
  });

  it('reports that configured layout stages did not run for default Other', async () => {
    mount(SYNTHETIC_LAYOUT);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Import with page-level anchors only' }));
    await fillAndImport();

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Configured layout stages: not run')).toBeInTheDocument();
    expect(screen.queryByText(/marker-glue site/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/slice changes/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/lines re-spaced/u)).not.toBeInTheDocument();
  });

  it('includes a legitimate zero marker-glue count after Clarendon stage 6 ran', async () => {
    mount(SYNTHETIC_LAYOUT_NO_NOTES);
    await selectValue('Publisher', 'clarendon');
    await submitMetadata();

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/marker-glue sites flagged, not fixed/u).closest('li'))
      .toHaveTextContent('0 marker-glue sites flagged, not fixed — the app has no witness');
  });

  it('threads the witness-free marker flag count to Done without fixing the site', async () => {
    mount(SYNTHETIC_LAYOUT);
    await selectValue('Publisher', 'clarendon');
    await submitMetadata();

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/marker-glue site flagged, not fixed/u).closest('li'))
      .toHaveTextContent('1 marker-glue site flagged, not fixed');
    expect(screen.getByText('Configured layout stages: slice → skeleton → spacing → footnotes'))
      .toBeInTheDocument();
    expect(screen.getByText(/slice changes/u).closest('li')).toHaveTextContent(/\d+ slice changes/u);
    expect(screen.getByText(/slice\.bodyStart:/u).closest('li')).toHaveTextContent('BOOK ONE');
    expect(screen.getByText(/slice\.backMatterStart:/u).closest('li')).toHaveTextContent('COMMENTARY');
    expect(screen.getByText(/running-head placeholders inserted/u).closest('li')).toHaveTextContent(/^\d+/u);
    expect(screen.getByText(/folios repaired or stripped/u).closest('li')).toHaveTextContent(/^\d+/u);
    expect(screen.getByText((_, element) => element?.tagName === 'LI'
      && /^\d+ headings normalized$/u.test(element.textContent ?? ''))).toHaveTextContent(/^\d+/u);
    expect(screen.getByText(/lines re-spaced; display lines kept by shape only/u).closest('li'))
      .toHaveTextContent('the app has no per-copy preserve list');
  });

  it('keeps retained-publisher defaults in sync after choosing another file', async () => {
    const view = mount(SYNTHETIC_LAYOUT);
    await selectValue('Publisher', 'clarendon');
    await fireEvent.click(screen.getByText('Edition override'));
    await fireEvent.click(screen.getByLabelText('Slice front and back matter before conversion'));
    expect(screen.getByLabelText('Slice front and back matter before conversion')).not.toBeChecked();

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Import a translation' })).toBeInTheDocument();
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    await fireEvent.change(input, {
      target: { files: [new File([SYNTHETIC_LAYOUT], 'second-layout.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByRole('heading', { name: 'Edition' })).toBeInTheDocument();
    expect(screen.getByLabelText('Publisher')).toHaveValue('clarendon');
    await fireEvent.click(screen.getByText('Edition override'));
    expect(screen.getByLabelText('Slice front and back matter before conversion')).toBeChecked();
    expect(screen.getByLabelText('Body-start pattern')).toHaveValue(
      '^\\s{5,}BOOK\\s+([A-Z]+|\\d{1,2})\\s*$',
    );
    expect(screen.getByLabelText('Trim preamble on the body-start page')).toBeChecked();
    expect(screen.getByLabelText('Normalize layout spacing')).toBeChecked();
    expect(screen.getByLabelText('Normalize page-bottom footnotes')).toBeChecked();
  });

  it('sends a partial books-covered declaration to R6', async () => {
    mount('{1.1} A synthetic chapter.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByLabelText('Book II'));
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fillAndImport();

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().booksCovered).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('applies Peripatetic endnotes unconditionally as the publisher default', async () => {
    mount('{1.1} A synthetic chapter.');
    await selectValue('Publisher', 'peripatetic');
    await fireEvent.click(screen.getByText('Edition override'));
    expect(screen.getByRole('option', { name: 'Publisher default (endnotes)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Note display')).toHaveValue('');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fillAndImport();
    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().footnotePlacement).toBe('endnote');
    expect(lastRequest().footnotePlacementOverride).toBeUndefined();
  });

  it('keeps the publisher selected when an Edition field is overridden', async () => {
    mount('{1.1} A synthetic chapter.');
    await selectValue('Publisher', 'peripatetic');
    await fireEvent.click(screen.getByText('Edition override'));
    await selectValue('Note display', 'page-bottom');
    expect(screen.getByLabelText('Publisher')).toHaveValue('peripatetic');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fillAndImport();
    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().footnotePlacement).toBe('endnote');
    expect(lastRequest().footnotePlacementOverride).toBe('page-bottom');
  });

  it('returns from the form to Edition, changes work, and moves forward again', async () => {
    mount('{1.1} A synthetic chapter.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByPlaceholderText('e.g. Rackham')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Edition' })).toBeInTheDocument();
    fetchChaptersMock.mockResolvedValueOnce(Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => [String(index + 1), [{
        chapter: '1', column: `${640 + index}a`, line: '1', bekker: `${640 + index}a1–${640 + index}b20`,
      }]]),
    ));
    await selectValue('Work', 'PA');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);

    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fillAndImport();
    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().work).toBe('PA');
  });
});

describe('ImportDialog step 0 and tagged pre-clean gates', () => {
  it('passes the byte-identical upload as original when dehyphenation changes working text', async () => {
    const raw = '{1.1} A neutral exam-\nple sentence.';
    mount(raw);
    await submitMetadata();

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().raw).toBe('{1.1} A neutral example sentence.');
    expect(lastRequest().original).toBe(raw);
    expect(screen.getByText(/folio paragraphs stripped/).closest('li')).toHaveTextContent('0 folio paragraphs stripped');
    expect(screen.getByText(/stray heading numerals stripped/).closest('li')).toHaveTextContent('0 stray heading numerals stripped');
    expect(screen.getByText(/Division audit:/)).toHaveTextContent('0 missing chapters');
  });

  it('takes the tagged path through the hyphenation review queue', async () => {
    const raw = '{1.1} A neutral exam-\nple sentence.';
    dehyphenateMock.mockImplementation(async (text: string) => ({
      text, decisions: [], reviewCount: 1, ran: true,
    }));
    listReviewItemsMock.mockReturnValue([
      { index: 0, closed: 'example', hyphenated: 'exam-ple', context: 'A neutral exam-ple sentence' },
    ]);
    resolveReviewsMock.mockImplementation((text: string) => text.replace('exam-\nple', 'example'));
    mount(raw);
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: 'Hyphenation check' })).toBeInTheDocument();
    expect(runImportMock).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: 'example' }));
    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    // The review resolved the BODY, and the rebuilt file carries the result.
    expect(resolveReviewsMock).toHaveBeenCalledWith(raw, expect.any(Map));
    expect(lastRequest().raw).toBe('{1.1} A neutral example sentence.');
    expect(lastRequest().original).toBe(raw);
  });

  it('refuses untagged plain text at file acceptance with format help', () => {
    mount('A neutral paragraph with no chapter anchor.');

    expect(screen.getByRole('heading', { name: "Couldn't read this file" })).toBeInTheDocument();
    expect(screen.getByText(/No \{book\.chapter\} tags found/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Rackham')).not.toBeInTheDocument();
  });

  it('refuses a frontmattered file whose only tag sits inside its notes block, and offers the pick step back', async () => {
    const raw = [
      '---',
      'formatVersion: 1',
      'work: PA',
      'translator: Synthetic',
      'license: user-supplied',
      'language: en',
      'id: synthetic-en',
      '---',
      '',
      'A paragraph with a marker[^1] and no chapter anchor anywhere in the body.',
      '',
      '<!-- footnotes scope=continuous -->',
      '[^1]: A synthetic note that happens to mention {1.1} in its own text.',
    ].join('\n');
    mount(raw);

    expect(screen.getByRole('heading', { name: "Couldn't read this file" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
    expect(screen.getByRole('heading', { name: 'Import a translation' })).toBeInTheDocument();
    expect(screen.queryByText(/No \{book\.chapter\} tags found\. Add a chapter tag/)).not.toBeInTheDocument();
  });

  it('shows every N1 proposal without typing and lets a click exclude the join', async () => {
    const raw = '{1.1} A sentence continues\n\nwith more neutral words.';
    mount(raw);
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: 'Page-break sentence joins' })).toBeInTheDocument();
    expect(runImportMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: /Join here/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Apply 0 selected joins' }));
    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().raw).toContain('continues\nwith');
  });

  it('always stops on the full proposed-deletion list before writing', async () => {
    mount(FOLIO_RUN);
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: 'Proposed paragraph deletions' })).toBeInTheDocument();
    expect(screen.getByText(/3 of 7 paragraphs flagged/)).toBeInTheDocument();
    for (const folio of ['10', '12', '14']) {
      expect(screen.getByText(folio)).toBeInTheDocument();
    }
    expect(runImportMock).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: 'Accept all proposed deletions' }));
    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    for (const folio of ['10', '12', '14']) {
      expect(lastRequest().raw).not.toContain(`\n${folio}\n`);
    }
    expect(lastRequest().original).toBe(FOLIO_RUN);
  });

  it('applies a mixed accept/exclude deletion set and reports what it kept', async () => {
    mount(FOLIO_RUN);
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: 'Proposed paragraph deletions' })).toBeInTheDocument();
    // Nothing applies until every proposal has a decision.
    expect(screen.getByRole('button', { name: 'Apply reviewed choices' })).toBeDisabled();

    await fireEvent.click(screen.getAllByRole('button', { name: 'Accept deletion' })[0]);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Accept deletion' })[1]);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Keep paragraph' })[2]);
    await fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed choices' }));

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().raw).not.toContain('\n10\n');
    expect(lastRequest().raw).not.toContain('\n12\n');
    expect(lastRequest().raw).toContain('\n14\n');
    expect(lastRequest().preClean?.stripCounts).toEqual({ folioParagraphs: 2, strayHeadingNumerals: 0 });
    expect(lastRequest().preClean?.warnings).toEqual([
      'Proposed deletion “14” was excluded during review.',
    ]);
    expect(screen.getByText(/folio paragraphs stripped/).closest('li')).toHaveTextContent('2 folio paragraphs stripped');
  });

  it('keeps every proposal on one click, without abandoning the import', async () => {
    mount(FOLIO_RUN);
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: 'Proposed paragraph deletions' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep all — delete nothing' }));

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    for (const folio of ['10', '12', '14']) {
      expect(lastRequest().raw).toContain(`\n${folio}\n`);
    }
    expect(lastRequest().preClean?.stripCounts).toEqual({ folioParagraphs: 0, strayHeadingNumerals: 0 });
    expect(lastRequest().preClean?.warnings).toHaveLength(3);
  });

  it('offers one R6 waiver click and threads it into the recorded import request', async () => {
    const { DivisionGapError } = await import('../lib/imports');
    const audit = {
      booksCovered: [1],
      bookLabels: ['I'],
      booksFound: 1,
      booksExpected: 1,
      chaptersFound: 1,
      chaptersExpected: 2,
      chapterKeysFound: { 1: [1] },
      gaps: [{ book: 1, chapter: 2 }],
    };
    runImportMock.mockRejectedValueOnce(new DivisionGapError(audit));
    mount('{1.1} A synthetic incomplete copy.');
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: 'Missing chapters in this copy' })).toBeInTheDocument();
    expect(screen.getByText(/\{1\.2\}/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', {
      name: 'Import anyway — this copy is known incomplete',
    }));

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(2));
    expect((runImportMock.mock.calls[1][0] as ImportReq).waiveDivisionGaps).toBe(true);
  });

  it('changes wrong coverage after R6 without rerunning reviews or recording a waiver', async () => {
    const { DivisionGapError } = await import('../lib/imports');
    runImportMock.mockRejectedValueOnce(new DivisionGapError({
      booksCovered: Array.from({ length: 10 }, (_, index) => index + 1),
      bookLabels: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'],
      booksFound: 1,
      booksExpected: 10,
      chaptersFound: 1,
      chaptersExpected: 10,
      chapterKeysFound: { 1: [1] },
      gaps: Array.from({ length: 9 }, (_, index) => ({ book: index + 2, chapter: 1 })),
    }));
    mount('{1.1} A synthetic single-book copy.');
    await submitMetadata();
    expect(await screen.findByRole('heading', { name: 'Missing chapters in this copy' })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Change books covered' }));
    expect(screen.getByRole('heading', { name: 'Change books covered' })).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox').slice(1)) {
      await fireEvent.click(checkbox);
    }
    await fireEvent.click(screen.getByRole('button', { name: 'Retry import' }));

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(2));
    const retry = runImportMock.mock.calls[1][0] as ImportReq;
    expect(retry.booksCovered).toEqual([1]);
    expect(retry.waiveDivisionGaps).toBeUndefined();
    expect(dehyphenateMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Incomplete-copy waiver recorded/)).not.toBeInTheDocument();
  });

  it('keeps Replace intent when a replacement needs the division waiver', async () => {
    const { DivisionGapError, ImportCollision } = await import('../lib/imports');
    const audit = {
      booksCovered: [1],
      bookLabels: ['I'],
      booksFound: 1,
      booksExpected: 1,
      chaptersFound: 1,
      chaptersExpected: 2,
      chapterKeysFound: { 1: [1] },
      gaps: [{ book: 1, chapter: 2 }],
    };
    runImportMock
      .mockRejectedValueOnce(new ImportCollision('EN', 'test-en'))
      .mockRejectedValueOnce(new DivisionGapError(audit));
    mount('{1.1} A synthetic replacement.');
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: 'Already in your library' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Replace it' }));
    expect(await screen.findByRole('heading', { name: 'Missing chapters in this copy' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', {
      name: 'Import anyway — this copy is known incomplete',
    }));

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(3));
    const waivedReplace = runImportMock.mock.calls[2][0] as ImportReq;
    expect(waivedReplace.replace).toBe(true);
    expect(waivedReplace.waiveDivisionGaps).toBe(true);
  });
});

describe('ImportDialog declared line mode', () => {
  it('asks which shape the file is and keeps every paragraph when told one per line', async () => {
    mount(WRAP_SHAPED);
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: "How are this file's lines broken?" })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // The heuristic only preselects; both answers are one click away.
    expect(screen.getByRole('button', { name: 'Lines wrapped as printed; blank lines separate paragraphs' }))
      .toHaveClass('imp-primary');

    await fireEvent.click(screen.getByRole('button', { name: 'Each paragraph is one line' }));
    await excludeEveryJoin();
    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().raw).toContain('at the printed measure, so the lines\nbreak');
  });

  it('joins the wraps when told the lines are wrapped as printed', async () => {
    mount(WRAP_SHAPED);
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: "How are this file's lines broken?" })).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Lines wrapped as printed; blank lines separate paragraphs' }),
    );

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().raw).toContain('at the printed measure, so the lines break');
    // The blank-line paragraph boundary survives the join as a paragraph newline.
    expect(lastRequest().raw).toContain('has run out of words.\nA third paragraph');
  });

  it('never asks when both answers give the same bytes', async () => {
    mount('{1.1} A single unbroken paragraph with nothing to join.');
    await submitMetadata();

    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: "How are this file's lines broken?" })).not.toBeInTheDocument();
  });

  it('walks back from the deletion list to the join list to the mode question', async () => {
    mount(WRAP_SHAPED_WITH_FOLIOS);
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: "How are this file's lines broken?" })).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Lines wrapped as printed; blank lines separate paragraphs' }),
    );

    expect(await screen.findByRole('heading', { name: 'Page-break sentence joins' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));

    expect(await screen.findByRole('heading', { name: 'Proposed paragraph deletions' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Page-break sentence joins' })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: "How are this file's lines broken?" })).toBeInTheDocument();
    expect(runImportMock).not.toHaveBeenCalled();

    // The N1 joins accepted before Back were undone with it: declaring the
    // other mode now produces the unjoined shape, not a doubly-joined one.
    await fireEvent.click(screen.getByRole('button', { name: 'Each paragraph is one line' }));
    await excludeEveryJoin();
    expect(await screen.findByRole('heading', { name: 'Proposed paragraph deletions' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep all — delete nothing' }));
    await waitFor(() => expect(runImportMock).toHaveBeenCalledTimes(1));
    expect(lastRequest().raw).toContain('at the printed measure, so the lines\nbreak');
  });

  it('offers the drop zone back from a failed import, not only Close', async () => {
    runImportMock.mockRejectedValueOnce(new Error('Duplicate chapter key {1.2} would replace earlier prose.'));
    mount('{1.1} A single unbroken paragraph with nothing to join.');
    await submitMetadata();

    expect(await screen.findByRole('heading', { name: 'Import failed' })).toBeInTheDocument();
    expect(screen.getByText(/Duplicate chapter key/)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
    expect(screen.getByRole('heading', { name: 'Import a translation' })).toBeInTheDocument();
    expect(screen.queryByText(/Duplicate chapter key/)).not.toBeInTheDocument();
  });
});
