/**
 * Serializer for Book-container edits. Every rail action is a pure transform of
 * the work's saved container list, so two actions fired before the first save
 * and reload complete would both read the SAME stale list and the later write
 * would silently drop the earlier one ("+ Book" twice in a row = one Book).
 *
 * The queue keeps the latest INTENDED list in memory, hands it to the next
 * transform instead of the stale saved copy, and chains the writes so they land
 * in the order the user made them. Everything is keyed by work id: the id is
 * captured when the edit is MADE, not when its write finally runs, so opening
 * another work mid-save can never write one document's Books onto another.
 *
 * It holds no Svelte state — the caller owns the reload — which is what makes
 * the ordering testable.
 */

import type { BookContainer } from './bookContainers';

export interface BookContainerQueue {
  /**
   * Apply `transform` to the newest list for `workId` (the one still in flight
   * if a save is pending, else `saved`), then persist behind any earlier edit to
   * that same work. Resolves when THIS edit has been committed.
   */
  edit(
    workId: string,
    saved: BookContainer[],
    transform: (current: BookContainer[]) => BookContainer[],
  ): Promise<void>;
}

export function createBookContainerQueue(
  commit: (workId: string, containers: BookContainer[]) => Promise<void>,
): BookContainerQueue {
  // Per work: the list the user has asked for but which may not be saved yet.
  // The entry is dropped once everything queued for that work has landed, so
  // the next edit reads real saved state again.
  const pending = new Map<string, BookContainer[]>();
  const chains = new Map<string, Promise<void>>();

  return {
    edit(workId, saved, transform) {
      const next = transform(pending.get(workId) ?? saved);
      pending.set(workId, next);
      const run = (chains.get(workId) ?? Promise.resolve()).then(async () => {
        try {
          await commit(workId, next);
        } finally {
          // Only the LAST queued edit clears the pending list; an earlier one
          // finishing must not make a later, still-unsaved edit invisible.
          if (pending.get(workId) === next) pending.delete(workId);
        }
      });
      // The caller sees the failure; the QUEUE swallows it, so one bad write
      // (storage offline mid-session) cannot wedge every later Book edit.
      chains.set(
        workId,
        run.catch(() => {}),
      );
      return run;
    },
  };
}
