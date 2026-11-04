// A save or delete the disk refuses must reach the user as a message, not
// vanish as an unhandled rejection. The editor stays open on a failed save so
// the typed note is not lost.

import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnnotationsPanel from '../components/AnnotationsPanel.svelte';
import { listAnnotations, setAnnotationStoreForTests, type Annotation } from '../lib/annotations';

const work = 'panel-work';
const note: Annotation = {
  id: 'A', work, created: '2026-01-01T00:00:00.000Z', body: 'old note', layer: 'greek', exact: 'logos',
  target: { kind: 'greek', book: 1, start: { column: '1094a', line: 1, word: 0 }, end: { column: '1094a', line: 1, word: 0 } },
};

beforeEach(async () => {
  setAnnotationStoreForTests({
    async read() { return { anns: [note] }; },
    async write() { throw new Error('disk full'); },
  });
  await listAnnotations(work);
});

function renderPanel() {
  const onError = vi.fn();
  const onChanged = vi.fn();
  const view = render(AnnotationsPanel, {
    props: { work, shown: [], annotations: [note], onChanged, onError, onJump: vi.fn(), onClose: vi.fn() },
  });
  return { ...view, onError, onChanged };
}

describe('AnnotationsPanel write failures', () => {
  it('a delete the disk refuses is reported', async () => {
    const { getByText, onError, onChanged } = renderPanel();
    await fireEvent.click(getByText('Delete'));
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError.mock.calls[0][0]).toMatch(/not deleted.*disk full/i);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a save the disk refuses is reported and leaves the editor open with the text', async () => {
    const { getByText, container, onError, onChanged } = renderPanel();
    await fireEvent.click(getByText('Edit note'));
    const box = container.querySelector('textarea')!;
    await fireEvent.input(box, { target: { value: 'new note' } });
    await fireEvent.click(getByText('Save'));
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError.mock.calls[0][0]).toMatch(/not saved.*disk full/i);
    expect(onChanged).not.toHaveBeenCalled();
    expect(container.querySelector('textarea')?.value).toBe('new note');
  });
});
