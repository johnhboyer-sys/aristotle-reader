import type { CorpusConfig } from './corpus-config';
import { makeChangeId } from './changelist';
import type { ChangeRecord } from './changelist';

export interface SliceOutcome {
  text: string;
  changes: ChangeRecord[];
  frontMatter: string;
  backMatter: string;
}

interface BoundaryMatch {
  page: number;
  line: string;
}

function findBoundary(
  segments: string[],
  pattern: string,
  startPage: number,
  corpusId: string
): BoundaryMatch {
  const re = new RegExp(pattern);
  for (let page = startPage; page < segments.length; page += 1) {
    for (const line of segments[page].split('\n')) {
      const testLine = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (re.test(testLine)) return { page, line: testLine };
    }
  }
  throw new Error(`slice boundary not found for corpus "${corpusId}" using pattern "${pattern}"`);
}

function makeSliceChange(
  page: number,
  kind: 'front-matter' | 'back-matter',
  pages: string,
  matched: string
): ChangeRecord {
  return {
    id: makeChangeId(page),
    stage: 1,
    tier: 1,
    rule: 'slice',
    page,
    evidence: { kind, pages, matched },
  };
}

export function slicePages(raw: string, config: CorpusConfig): SliceOutcome {
  if (!config.slice) return { text: raw, changes: [], frontMatter: '', backMatter: '' };

  const segments = raw.split('\f');
  const bodyStart = findBoundary(segments, config.slice.bodyStart, 0, config.id);
  const backMatterStart = config.slice.backMatterStart
    ? findBoundary(segments, config.slice.backMatterStart, bodyStart.page + 1, config.id)
    : { page: segments.length, line: '' };

  const frontMatter = segments.slice(0, bodyStart.page).join('\f');
  const text = segments.slice(bodyStart.page, backMatterStart.page).join('\f');
  const backMatter = segments.slice(backMatterStart.page).join('\f');
  const changes: ChangeRecord[] = [];

  if (bodyStart.page > 0) {
    changes.push(
      makeSliceChange(0, 'front-matter', `0-${bodyStart.page - 1}`, bodyStart.line.trim())
    );
  }

  if (backMatterStart.page < segments.length) {
    changes.push(
      makeSliceChange(
        backMatterStart.page,
        'back-matter',
        `${backMatterStart.page}-${segments.length - 1}`,
        backMatterStart.line.trim()
      )
    );
  }

  return { text, changes, frontMatter, backMatter };
}
