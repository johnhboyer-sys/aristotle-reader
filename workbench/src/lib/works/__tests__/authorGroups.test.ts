import { describe, expect, it } from 'vitest';
import { groupWorksByAuthor } from '../authorGroups';

const w = (title: string, author?: string) => ({ title, ...(author !== undefined ? { author } : {}) });

describe('grouping the rail by author', () => {
  it('gathers an author’s works, in the order the author first appears', () => {
    const groups = groupWorksByAuthor([
      w('Metaphysics', 'Aristotle'),
      w('Summa', 'Aquinas'),
      w('Physics', 'Aristotle'),
    ]);
    expect(groups.map((g) => [g.author, g.works.map((x) => x.title)])).toEqual([
      ['Aristotle', ['Metaphysics', 'Physics']],
      ['Aquinas', ['Summa']],
    ]);
  });

  it('puts anonymous works last, under no author at all', () => {
    const groups = groupWorksByAuthor([w('Notes'), w('Physics', 'Aristotle'), w('Fragment', '  ')]);
    expect(groups).toEqual([
      { author: 'Aristotle', works: [w('Physics', 'Aristotle')] },
      { author: '', works: [w('Notes'), w('Fragment', '  ')] },
    ]);
  });

  it('reads the same name whatever the spacing around it', () => {
    const groups = groupWorksByAuthor([w('A', 'Aristotle'), w('B', ' Aristotle ')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].works.map((x) => x.title)).toEqual(['A', 'B']);
  });

  it('gives an empty library no groups', () => {
    expect(groupWorksByAuthor([])).toEqual([]);
  });
});
