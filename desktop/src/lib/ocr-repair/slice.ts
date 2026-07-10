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
  lineIndex: number;
}

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function findBoundary(
  segments: string[],
  pattern: string,
  startPage: number,
  corpusId: string,
  nextLinePattern?: string
): BoundaryMatch {
  const re = new RegExp(pattern);
  const nextRe = nextLinePattern ? new RegExp(nextLinePattern) : undefined;
  for (let page = startPage; page < segments.length; page += 1) {
    const lines = segments[page].split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const testLine = stripCr(lines[i]);
      if (!re.test(testLine)) continue;
      if (nextRe) {
        // The pair rule: the next NON-BLANK line must match too. A lone
        // running head that happens to look like the heading has body prose
        // (or nothing) after it and fails here.
        let j = i + 1;
        while (j < lines.length && stripCr(lines[j]).trim() === '') j += 1;
        if (j >= lines.length || !nextRe.test(stripCr(lines[j]))) continue;
      }
      return { page, line: testLine, lineIndex: i };
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

/**
 * Remove front-matter prose printed on the body-start page above the opening
 * heading: every non-blank line strictly between the running head (first
 * non-blank line — always kept, the converter strips page line 1 as the
 * head) and the matched bodyStart line. One blank line is left between head
 * and heading so the page skeleton stays intact.
 */
function trimPreamble(
  segment: string,
  boundary: BoundaryMatch
): { segment: string; removed: string[]; headIndex: number } | null {
  const lines = segment.split('\n');
  let head = 0;
  while (head < lines.length && stripCr(lines[head]).trim() === '') head += 1;
  const removed = lines
    .slice(head + 1, boundary.lineIndex)
    .filter((l) => stripCr(l).trim() !== '');
  if (removed.length === 0) return null;
  const rebuilt = [
    ...lines.slice(0, head + 1),
    '',
    ...lines.slice(boundary.lineIndex),
  ].join('\n');
  return { segment: rebuilt, removed: removed.map(stripCr), headIndex: head };
}

export function slicePages(raw: string, config: CorpusConfig): SliceOutcome {
  if (!config.slice) return { text: raw, changes: [], frontMatter: '', backMatter: '' };

  const segments = raw.split('\f');
  const bodyStart = findBoundary(
    segments,
    config.slice.bodyStart,
    0,
    config.id,
    config.slice.bodyStartNextLine
  );
  const backMatterStart = config.slice.backMatterStart
    ? findBoundary(segments, config.slice.backMatterStart, bodyStart.page + 1, config.id)
    : { page: segments.length, line: '', lineIndex: 0 };

  const changes: ChangeRecord[] = [];
  const kept = segments.slice(bodyStart.page, backMatterStart.page);

  if (config.slice.trimBodyStartPreamble) {
    const trimmed = trimPreamble(kept[0], bodyStart);
    if (trimmed) {
      kept[0] = trimmed.segment;
      changes.push({
        id: makeChangeId(bodyStart.page, trimmed.headIndex + 1),
        stage: 1,
        tier: 1,
        rule: 'slice',
        page: bodyStart.page,
        line: trimmed.headIndex + 1,
        evidence: {
          kind: 'body-start-preamble',
          linesRemoved: trimmed.removed.length,
          removedLines: trimmed.removed,
          matched: bodyStart.line.trim(),
        },
      });
    }
  }

  const frontMatter = segments.slice(0, bodyStart.page).join('\f');
  const text = kept.join('\f');
  const backMatter = segments.slice(backMatterStart.page).join('\f');

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
