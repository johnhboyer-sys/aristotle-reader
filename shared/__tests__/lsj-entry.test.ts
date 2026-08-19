// LSJ entries are the one place in the corpus where the markup carries an
// ARGUMENT: LSJ's A → I → 1 → a hierarchy is how the lexicon divides a word's
// senses. Until 2026-08-19 the sanitizer dropped every <div>, so the hierarchy
// never reached the page — the stylesheet's .lsj-sense rules had nothing to
// match and entries rendered as one wall of prose. These lock the structure in.
import { describe, expect, it } from 'vitest';
import { outlineLsjSenses, prefixLsjCitationHrefs, sanitizeHtml } from '../lib/html';

// The shape stage5_lsj.py emits (nested senses, sense number in a leading <b>).
const ENTRY = [
  '<b class="lsj-head">λόγος</b>, <span class="lsj-gen">ὁ</span>, ',
  '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> ',
  'computation, reckoning ',
  '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">I.</b> ',
  'account of money handled ',
  '<div class="lsj-sense" data-level="3"><b class="lsj-sense-n">2.</b> ',
  'generally, <i>account</i> ',
  '<a class="lsj-bibl" href="/EN/book/1?loc=1094a:5">1094a5</a>',
  '</div></div></div>',
  '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">B.</b> ',
  'relation, correspondence &amp; proportion</div>',
  '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">C.</b> ',
  'explanation</div>',
].join('');

describe('sanitizeHtml on LSJ sense structure', () => {
  it('keeps the sense divs and their depth', () => {
    const out = sanitizeHtml(ENTRY);
    expect(out).toContain('<div class="lsj-sense" data-level="1">');
    expect(out).toContain('<div class="lsj-sense" data-level="3">');
    // Nesting survives: three opens before the first close.
    expect(out.indexOf('data-level="3"')).toBeLessThan(out.indexOf('</div>'));
    expect(out.match(/<\/div>/g)).toHaveLength(5);
  });

  it('accepts data-level only as a small integer', () => {
    expect(sanitizeHtml('<div data-level="12">x</div>')).toBe('<div data-level="12">x</div>');
    for (const bad of ['foo', '', '123', '-1', '1 2', '1;background:red']) {
      expect(sanitizeHtml(`<div data-level="${bad}">x</div>`)).toBe('<div>x</div>');
    }
    // A quote closed early inside the value cannot smuggle a second attribute:
    // the parser sees data-level="1" and a separate onload, which is dropped.
    expect(sanitizeHtml('<div data-level="1"onload="steal()">x</div>'))
      .toBe('<div data-level="1">x</div>');
  });

  it('still refuses script, handlers and other data-* attributes', () => {
    expect(sanitizeHtml('<div onclick="steal()" data-href="/x">x</div>'))
      .toBe('<div>x</div>');
    expect(sanitizeHtml('<div><script>alert(1)</script>ok</div>'))
      .toBe('<div>ok</div>');
  });
});

describe('outlineLsjSenses', () => {
  const sanitized = sanitizeHtml(ENTRY);

  it('lists only the top-level senses, with their numbers', () => {
    const { senses } = outlineLsjSenses(sanitized);
    expect(senses.map((s) => s.n)).toEqual(['A', 'B', 'C']);
  });

  it('labels each sense with its own prose, not its sub-senses', () => {
    const { senses } = outlineLsjSenses(sanitized);
    expect(senses[0].label).toBe('computation, reckoning');
    // Entities are decoded for the plain-text label.
    expect(senses[1].label).toBe('relation, correspondence & proportion');
  });

  it('truncates a long label on a word boundary', () => {
    const long = sanitizeHtml(
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> ' +
      'the word or outward form by which the inward thought is expressed' +
      '</div>',
    );
    const { senses } = outlineLsjSenses(long);
    expect(senses[0].label.length).toBeLessThanOrEqual(57);
    expect(senses[0].label).toMatch(/…$/);
    expect(senses[0].label).not.toMatch(/\s…$/);
    expect(long).toContain(senses[0].label.replace('…', '').trim());
  });

  it('stamps a unique anchor id on each top-level sense and nowhere else', () => {
    const { html, senses } = outlineLsjSenses(sanitized);
    expect(senses.map((s) => s.id)).toEqual(['lsj-sense-a', 'lsj-sense-b', 'lsj-sense-c']);
    for (const sense of senses) {
      expect(html).toContain(`<div id="${sense.id}" class="lsj-sense" data-level="1">`);
    }
    expect(html.match(/ id="/g)).toHaveLength(3);
    // Everything else is byte-identical to the input.
    expect(html.replace(/ id="lsj-sense-[a-z0-9-]+"/g, '')).toBe(sanitized);
  });

  it('never collides ids, even when LSJ repeats or omits a sense number', () => {
    const { html, senses } = outlineLsjSenses(sanitizeHtml(
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> one</div>' +
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> two</div>' +
      '<div class="lsj-sense" data-level="1">unnumbered</div>',
    ));
    expect(senses.map((s) => s.id)).toEqual(['lsj-sense-a', 'lsj-sense-a-2', 'lsj-sense-3']);
    expect(senses[2].n).toBe('');
    expect(senses[2].label).toBe('unnumbered');
    expect(html.match(/ id="/g)).toHaveLength(3);
  });

  it('reads a flat sibling entry the same way as a nested one', () => {
    const { senses } = outlineLsjSenses(sanitizeHtml(
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> first</div>' +
      '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">I.</b> under A</div>' +
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">B.</b> second</div>',
    ));
    expect(senses.map((s) => s.label)).toEqual(['first', 'second']);
  });

  it('returns an entry with no senses untouched', () => {
    const plain = sanitizeHtml('<b class="lsj-head">ἀγαθός</b>, good');
    expect(outlineLsjSenses(plain)).toEqual({ html: plain, senses: [] });
  });

  it('leaves the citation-link rewrite intact in either order', () => {
    const { html } = outlineLsjSenses(sanitized);
    expect(prefixLsjCitationHrefs(html, '/aristotle-reader'))
      .toContain('<a class="lsj-bibl" href="/aristotle-reader/EN/book/1?loc=1094a:5">');
  });
});
