import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runImportMock = vi.hoisted(() => vi.fn());
const dehyphenateMock = vi.hoisted(() => vi.fn());
const listReviewItemsMock = vi.hoisted(() => vi.fn());
const resolveReviewsMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/imports', () => {
  class ImportCollision extends Error {
    constructor(public work: string, public id: string) {
      super('collision');
    }
  }
  return { runImport: runImportMock, ImportCollision };
});

vi.mock('../lib/dehyphenate', () => ({
  dehyphenate: dehyphenateMock,
  listReviewItems: listReviewItemsMock,
  resolveReviews: resolveReviewsMock,
}));

import ImportDialog from '../components/ImportDialog.svelte';

type ImportReq = {
  raw: string;
  original: string;
  work: string;
  translator: string;
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
  await fireEvent.input(screen.getByPlaceholderText('e.g. Rackham'), { target: { value: 'Tester' } });
  await fireEvent.click(screen.getByLabelText('No'));
  await fireEvent.click(screen.getByRole('button', { name: 'Import' }));
}

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
