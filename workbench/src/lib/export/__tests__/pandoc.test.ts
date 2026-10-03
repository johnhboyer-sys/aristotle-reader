import { describe, expect, it } from 'vitest';
import { pandocDocxArgs } from '../pandoc';
import type { PandocDocxJob } from '../pandoc';

describe('pandocDocxArgs', () => {
  it('builds the sandboxed markdown→docx argv, reference-doc optional', () => {
    const job: PandocDocxJob = { markdownPath: '/tmp/in.md', docxPath: '/tmp/out.docx' };
    expect(pandocDocxArgs(job)).toEqual(['--sandbox', '-f', 'markdown', '-t', 'docx', '-o', '/tmp/out.docx', '/tmp/in.md']);
    expect(pandocDocxArgs({ ...job, referenceDocPath: '/r.docx' })).toEqual([
      '--sandbox', '-f', 'markdown', '-t', 'docx', '-o', '/tmp/out.docx', '--reference-doc', '/r.docx', '/tmp/in.md',
    ]);
  });
});
