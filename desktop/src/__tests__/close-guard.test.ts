// Closing the window must wait for annotation saves still queued, or the last
// one never reaches disk. Tauri destroys the window once the close-requested
// handler returns, so the handler itself has to hold until the drain is done.

import { describe, expect, it, vi } from 'vitest';
import { holdCloseUntil } from '../lib/runtime';

const win = vi.hoisted(() => ({
  handler: null as null | ((e: { preventDefault(): void }) => Promise<void>),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (h: (e: { preventDefault(): void }) => Promise<void>) => {
      win.handler = h;
      return () => {};
    },
  }),
}));

const closeEvent = () => ({ preventDefault: vi.fn() });

describe('holdCloseUntil', () => {
  it('holds the close until the drain settles, and does not cancel it', async () => {
    let release!: () => void;
    const drain = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    await holdCloseUntil(drain);
    const e = closeEvent();
    let done = false;
    const closing = win.handler!(e).then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(drain).toHaveBeenCalledOnce();
    expect(done).toBe(false);
    release();
    await closing;
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('lets the window close when the drain hangs past the limit', async () => {
    await holdCloseUntil(() => new Promise<void>(() => {}), 10);
    await win.handler!(closeEvent());
  });

  it('lets the window close when the drain rejects', async () => {
    await holdCloseUntil(() => Promise.reject(new Error('disk gone')));
    await win.handler!(closeEvent());
  });
});
