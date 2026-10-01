// Quit waits for saves. ⌘Q is our own menu item (src-tauri/src/lib.rs): it
// emits `quit-requested`, App flushes every open editor through here, then
// calls `quit_now`. The macOS built-in Quit ended the app with the last edit
// still inside the autosave debounce, and that edit was lost.

const flushers = new Set<() => Promise<void>>();

/** Register a save to run before quit; returns the unregister call. */
export function onQuitFlush(flush: () => Promise<void>): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

/** Run every registered save and wait for all of them. Never rejects. */
export async function flushForQuit(): Promise<void> {
  const results = await Promise.allSettled([...flushers].map((f) => f()));
  for (const r of results) if (r.status === 'rejected') console.error('save before quit failed', r.reason);
}
