import { describe, expect, it } from 'vitest';
import { flushForQuit, onQuitCommit, onQuitFlush } from '../quit';

// ⌘Q used to end the app with an edit still inside the autosave debounce, so
// the last thing typed was lost. Quit now waits on every open editor's save.

describe('flushForQuit', () => {
  it('waits for every registered save to finish', async () => {
    const done: string[] = [];
    const off1 = onQuitFlush(() => new Promise((r) => setTimeout(() => (done.push('a'), r()), 20)));
    const off2 = onQuitFlush(async () => void done.push('b'));
    await flushForQuit();
    expect(done.sort()).toEqual(['a', 'b']);
    off1();
    off2();
  });

  it('a failed save does not stop the others or the quit', async () => {
    const done: string[] = [];
    const off1 = onQuitFlush(async () => {
      throw new Error('disk full');
    });
    const off2 = onQuitFlush(async () => void done.push('b'));
    expect(await flushForQuit()).toBe(false);
    expect(done).toEqual(['b']);
    off1();
    off2();
  });

  it('a closed editor is no longer flushed', async () => {
    let calls = 0;
    const off = onQuitFlush(async () => void calls++);
    off();
    await flushForQuit();
    expect(calls).toBe(0);
  });

  it('reports success when every save landed', async () => {
    const off = onQuitFlush(async () => {});
    expect(await flushForQuit()).toBe(true);
    off();
  });

  // A footnote body commits on its own timer; its commit must reach the model
  // before any editor writes the file, or the file is written without it.
  it('runs every pending commit before any save starts', async () => {
    const order: string[] = [];
    const offSave = onQuitFlush(async () => void order.push('save'));
    const offCommit = onQuitCommit(() => void order.push('commit'));
    await flushForQuit();
    expect(order).toEqual(['commit', 'save']);
    offSave();
    offCommit();
  });

  // A hung save must not make the app impossible to quit: it counts as a
  // failure, and the user is asked.
  it('a save that never finishes counts as failed after the timeout', async () => {
    const off = onQuitFlush(() => new Promise(() => {}));
    expect(await flushForQuit(20)).toBe(false);
    off();
  });
});
