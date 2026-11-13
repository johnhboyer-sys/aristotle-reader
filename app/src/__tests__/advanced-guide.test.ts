// The search guide (/advanced) names the search page's controls as the page
// labels them (finding 7 of the search build's review: S4b renamed "Save" to
// "Save search" and the rail's "Works" to "Works with hits", and the guide
// kept the old names). Each name the results section gives a control must be
// that control's label in the component.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// vitest runs from app/ (see package.json).
const guide = readFileSync(path.resolve('src/pages/advanced.astro'), 'utf8');
const search = readFileSync(path.resolve('../shared/components/Search.svelte'), 'utf8');
const section = (id: string) => {
  const from = guide.indexOf(`<section id="${id}">`);
  expect(from, id).toBeGreaterThan(0);
  return guide.slice(from, guide.indexOf('</section>', from)).replace(/\s+/g, ' ');
};

describe('the guide names the results controls as the page does', () => {
  const results = section('results');
  it('calls the rail\'s works list and the save button by their labels', () => {
    expect(results).toContain('<em>Works with hits</em>');
    expect(results).toContain('<em>Save search</em>');
    expect(results).not.toMatch(/<em>(Works|Save)<\/em>/);
  });
  it('and those labels are the page\'s', () => {
    expect(search).toContain('<span class="k">Works with hits <small>by count</small></span>');
    expect(search).toMatch(/Save<span class="sx-save-w">\{' '\}search<\/span>/);
    for (const name of ['Forms', 'Translations', 'Grammar']) expect(search).toContain(`<span class="k">${name}`);
    for (const name of ['Group by', 'Sort', 'Context', 'Per page']) expect(search).toContain(`{@render displayMenu('${name}'`);
    for (const name of ['Apply', 'Export results as CSV']) expect(search).toContain(name);
  });
});
