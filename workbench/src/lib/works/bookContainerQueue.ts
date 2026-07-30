/**
 * Serializer for Book-container edits. Every rail action is a pure transform of
 * the work's saved container list, so two actions fired before the first save
 * and reload complete would both read the SAME stale list and the later write
 * would silently drop the earlier one ("+ Book" twice in a row = one Book).
 *
 * The queue keeps the latest INTENDED list in memory, hands it to the next
 * transform instead of the stale saved copy, and chains the writes so they land
 * in the order the user made them. It holds no Svelte state — the caller owns
 * the reload — which is what makes the ordering testable.
 */

import type { BookContainer } from './bookContainers';

export interface BookContainerQueue {
  /**
   * Apply `transform` to the newest list (the one still in flight if a save is
   * pending, else `saved`), then persist and reload behind any earlier edit.
   * Resolves when THIS edit has been written and reloaded.
   */
  edit(
    saved: BookContainer[],
    transform: (current: BookContainer[]) => BookContainer[],
  ): Promise<void>;
}

export function createBookContainerQueue(
  commit: (containers: BookContainer[]) => Promise<void>,
): BookContainerQueue {
  // The list the user has asked for but which may not be saved yet; null once
  // everything queued has landed, so the next edit reads real saved state again.
  let pending: BookContainer[] | null = null;
  let chain: Promise<void> = Promise.resolve();

  return {
    edit(saved, transform) {
      const next = transform(pending ?? saved);
      pending = next;
      const run = chain.then(async () => {
        try {
          await commit(next);
        } finally {
          // Only the LAST queued edit clears the pending list; an earlier one
          // finishing must not make a later, still-unsaved edit invisible.
          if (pending === next) pending = null;
        }
      });
      // The caller sees the failure; the QUEUE swallows it, so one bad write
      // (storage offline mid-session) cannot wedge every later Book edit.
      chain = run.catch(() => {});
      return run;
    },
  };
}
