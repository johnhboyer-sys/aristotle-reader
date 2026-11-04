// ⌘Q must wait for annotation saves still queued, as closing the window does.
// Our own Quit menu item (src-tauri/src/lib.rs) emits `quit-requested` and
// quits by itself unless the page answers `quit_ack`; once it has, the page
// owns the quit and must call `quit_now` whatever the drain does.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { quitAfter } from '../lib/runtime';

const tauri = vi.hoisted(() => ({
  handlers: new Map<string, () => Promise<void>>(),
  calls: [] as string[],
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, h: () => Promise<void>) => {
    tauri.handlers.set(name, h);
    return () => {};
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => { tauri.calls.push(cmd); },
}));

beforeEach(() => {
  tauri.handlers.clear();
  tauri.calls.length = 0;
});

describe('quitAfter', () => {
  it('acks at once, then quits only after the drain settles', async () => {
    let release!: () => void;
    const drain = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    await quitAfter(drain);
    const quitting = tauri.handlers.get('quit-requested')!();
    await new Promise((r) => setTimeout(r, 0));
    expect(drain).toHaveBeenCalledOnce();
    expect(tauri.calls).toEqual(['quit_ack']);
    release();
    await quitting;
    expect(tauri.calls).toEqual(['quit_ack', 'quit_now']);
  });

  it('quits anyway when the drain hangs past the limit', async () => {
    await quitAfter(() => new Promise<void>(() => {}), 10);
    await tauri.handlers.get('quit-requested')!();
    expect(tauri.calls).toEqual(['quit_ack', 'quit_now']);
  });

  it('quits anyway when the drain rejects', async () => {
    await quitAfter(() => Promise.reject(new Error('disk gone')));
    await tauri.handlers.get('quit-requested')!();
    expect(tauri.calls).toEqual(['quit_ack', 'quit_now']);
  });
});
