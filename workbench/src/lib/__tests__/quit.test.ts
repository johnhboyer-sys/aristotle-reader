import { describe, expect, it } from 'vitest';
import { flushForQuit, onQuitFlush } from '../quit';

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
    await expect(flushForQuit()).resolves.toBeUndefined();
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
});
