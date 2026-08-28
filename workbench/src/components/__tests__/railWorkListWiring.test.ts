// The rail's work list: works fold away, and they sit under their author.
// Source-scan style, like railBooksWiring.test.ts — the rail is a Svelte
// component with no headless DOM here, so what is checked mechanically is the
// wiring; the grouping itself is unit-tested in works/__tests__/authorGroups.
import { beforeAll, describe, expect, it } from 'vitest';

let railSource = '';

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  railSource = fs.readFileSync(
    nodeUrl.fileURLToPath(new URL('../LibraryRail.svelte', import.meta.url)),
    'utf-8',
  );
});

describe('works grouped by author', () => {
  it('renders through groupWorksByAuthor, not its own bucketing', () => {
    expect(railSource).toContain("import { groupWorksByAuthor } from '../lib/works/authorGroups'");
    expect(railSource).toContain('{#each authorGroups as group (group.author)}');
  });

  it('prints no heading for the anonymous run', () => {
    expect(railSource).toContain('{#if group.author}');
    expect(railSource).toContain('<div class="author-head">{group.author}</div>');
  });
});

describe('a work folds away', () => {
  it('the toggle reports its state to a screen reader', () => {
    expect(railSource).toContain('class="work-toggle"');
    expect(railSource).toContain('aria-expanded={!folded}');
  });

  it('folding hides the body, and the work row itself stays', () => {
    expect(railSource).toContain('{#if folded}');
    expect(railSource).toContain("{:else if rw.status === 'ready' && rw.document}");
  });

  it('opening a work unfolds it, so a new selection is never hidden', () => {
    expect(railSource).toContain('if (workId && collapsedWorks.has(workId))');
  });

  it('unfolds only when the selection changes — the open work folds like any other', () => {
    // The effect reads collapsedWorks, so without this guard the user's own
    // fold re-ran it and undid itself: the work you were reading was the one
    // work in the rail that could not be folded.
    expect(railSource).toContain('if (workId === lastOpened) return;');
  });
});
