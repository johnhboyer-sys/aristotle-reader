// greekSource.full marks titles with <i> for the work page (14 Nov). Where the
// reader prints it as text (the print footer, the desktop Greek masthead) it
// must come out as plain text, not with the tags showing.
import { describe, expect, it } from 'vitest';
import { WORKS, plainFull } from '../lib/works';

describe('plainFull', () => {
  it('drops the title tags and keeps the words', () => {
    expect(plainFull('W. D. Ross, ed. <i>Aristotelis politica</i>. Oxford: Clarendon Press, 1957.'))
      .toBe('W. D. Ross, ed. Aristotelis politica. Oxford: Clarendon Press, 1957.');
  });
  it('leaves no markup in any Greek entry', () => {
    expect(WORKS.filter(w => /[<>]/.test(plainFull(w.greekSource.full))).map(w => w.id)).toEqual([]);
  });
});
