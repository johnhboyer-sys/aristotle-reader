// ⌘Q must wait for annotation saves still queued, as closing the window does.
// Our own Quit menu item (src-tauri/src/lib.rs) emits `quit-requested` and
// quits by itself unless the page answers `quit_ack` within 5 s; once it has,
// the page must call `quit_now` whatever the drain does.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { quitAfter } from '../lib/runtime';

const tauri = vi.hoisted(() => ({
  handlers: new Map<string, () => Promise<void>>(),
  /** Invokes and drain starts, in the order they happened. */
  calls: [] as string[],
  /** Holds quit_ack's reply until released, when set. */
  ackGate: null as null | Promise<void>,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, h: () => Promise<void>) => {
    tauri.handlers.set(name, h);
    return () => {};
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => {
    tauri.calls.push(cmd);
    if (cmd === 'quit_ack' && tauri.ackGate) await tauri.ackGate;
  },
}));

beforeEach(() => {
  tauri.handlers.clear();
  tauri.calls.length = 0;
  tauri.ackGate = null;
});

describe('quitAfter', () => {
  it('acks before draining, then quits only after the drain settles', async () => {
    let ackReplied!: () => void;
    tauri.ackGate = new Promise<void>((resolve) => { ackReplied = resolve; });
    let release!: () => void;
    const drain = vi.fn(() => {
      tauri.calls.push('drain');
      return new Promise<void>((resolve) => { release = resolve; });
    });
    await quitAfter(drain);
    const quitting = tauri.handlers.get('quit-requested')!();
    await new Promise((r) => setTimeout(r, 0));
    // Rust holds its 5 s deadline back only once the ack lands; a drain
    // started first could delay the ack past it.
    expect(tauri.calls).toEqual(['quit_ack']);
    ackReplied();
    await new Promise((r) => setTimeout(r, 0));
    expect(tauri.calls).toEqual(['quit_ack', 'drain']);
    release();
    await quitting;
    expect(tauri.calls).toEqual(['quit_ack', 'drain', 'quit_now']);
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
