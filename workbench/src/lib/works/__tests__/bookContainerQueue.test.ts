import { describe, expect, it } from 'vitest';
import { createBookContainerQueue } from '../bookContainerQueue';
import { withAddedBookContainer, withRenamedBookContainer } from '../bookContainers';
import type { BookContainer } from '../bookContainers';

/** A commit that only resolves when the test releases it, so a second edit can
 * be fired while the first is still saving — the real lost-update window. */
/** Let queued microtasks run, so a commit that was chained has actually started. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferredCommit() {
  const writes: { workId: string; containers: BookContainer[] }[] = [];
  const releases: (() => void)[] = [];
  const commit = (workId: string, containers: BookContainer[]) => {
    writes.push({ workId, containers });
    return new Promise<void>((resolve) => releases.push(resolve));
  };
  return { writes, releases, commit };
}

describe('Book container edit queue', () => {
  it('does not lose the second of two edits fired before the first save lands', async () => {
    const { writes, releases, commit } = deferredCommit();
    const queue = createBookContainerQueue(commit);
    const saved: BookContainer[] = [];

    // Both clicks read the same SAVED list — the stale snapshot that used to
    // make the second "+ Book" overwrite the first.
    const first = queue.edit('summa', saved, (current) => withAddedBookContainer(current, 'Book 1', 4));
    const second = queue.edit('summa', saved, (current) => withAddedBookContainer(current, 'Book 2', 4));

    await flush();
    expect(writes).toHaveLength(1); // the second write waits its turn
    releases[0]();
    await first;
    await flush();
    releases[1]();
    await second;

    expect(writes).toHaveLength(2);
    expect(writes[1].containers).toEqual([
      { label: 'Book 1', start: 1 },
      { label: 'Book 2', start: 5 },
    ]);
  });

  it('keeps writes in the order the user made them', async () => {
    const { writes, releases, commit } = deferredCommit();
    const queue = createBookContainerQueue(commit);
    const saved: BookContainer[] = [{ label: 'Book 1', start: 1 }];

    const rename = queue.edit('summa', saved, (c) => withRenamedBookContainer(c, 0, 'Prima Pars'));
    const add = queue.edit('summa', saved, (c) => withAddedBookContainer(c, 'Book 2', 3));

    await flush();
    releases[0]();
    await rename;
    await flush();
    releases[1]();
    await add;

    expect(writes.map((w) => w.containers.map((b) => b.label))).toEqual([
      ['Prima Pars'],
      ['Prima Pars', 'Book 2'],
    ]);
  });

  it('reads saved state again once everything queued has landed', async () => {
    const { releases, commit } = deferredCommit();
    const queue = createBookContainerQueue(commit);
    const first = queue.edit('summa', [], (c) => withAddedBookContainer(c, 'Book 1', 2));
    await flush();
    releases[0]();
    await first;

    // A later edit must see the caller's freshly reloaded list, not the stale
    // in-flight copy (which would resurrect a Book the user has since removed).
    const seen: BookContainer[][] = [];
    const second = queue.edit('summa', [{ label: 'Renamed elsewhere', start: 1 }], (current) => {
      seen.push(current);
      return current;
    });
    await flush();
    releases[1]();
    await second;
    expect(seen).toEqual([[{ label: 'Renamed elsewhere', start: 1 }]]);
  });

  it('writes each edit to the work it was made in, even after switching works', async () => {
    const { writes, releases, commit } = deferredCommit();
    const queue = createBookContainerQueue(commit);

    // Two Books added to the Summa while its first save is still in flight…
    const a1 = queue.edit('summa', [], (c) => withAddedBookContainer(c, 'Prima', 3));
    const a2 = queue.edit('summa', [], (c) => withAddedBookContainer(c, 'Secunda', 3));
    await flush();
    // …then the user opens a different document and adds a Book there.
    const b1 = queue.edit('ethics', [], (c) => withAddedBookContainer(c, 'Book I', 5));
    await flush();

    // Release repeatedly: the Summa's second write only starts (and only then
    // registers its own release) once the first has resolved.
    for (let i = 0; i < 4; i += 1) {
      releases.forEach((release) => release());
      await flush();
    }
    await Promise.all([a1, a2, b1]);

    // The Summa's last edit must still carry BOTH its Books and land on the
    // Summa; the other work must not inherit them.
    const summa = writes.filter((w) => w.workId === 'summa');
    const ethics = writes.filter((w) => w.workId === 'ethics');
    expect(summa[summa.length - 1].containers.map((b) => b.label)).toEqual(['Prima', 'Secunda']);
    expect(ethics).toHaveLength(1);
    expect(ethics[0].containers.map((b) => b.label)).toEqual(['Book I']);
  });

  it('a failed save does not wedge the queue', async () => {
    const attempts: BookContainer[][] = [];
    const queue = createBookContainerQueue(async (_workId, containers) => {
      attempts.push(containers);
      if (attempts.length === 1) throw new Error('storage offline');
    });
    await expect(queue.edit('summa', [], (c) => withAddedBookContainer(c, 'Book 1', 2))).rejects.toThrow(
      'storage offline',
    );
    await queue.edit('summa', [], (c) => withAddedBookContainer(c, 'Book 1', 2));
    expect(attempts).toHaveLength(2);
  });
});
