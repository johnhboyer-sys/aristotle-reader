// LSJ entries are the one place in the corpus where the markup carries an
// ARGUMENT: LSJ's A → I → 1 → a hierarchy is how the lexicon divides a word's
// senses. Until 2026-08-19 the sanitizer dropped every <div>, so the hierarchy
// never reached the page — the stylesheet's .lsj-sense rules had nothing to
// match and entries rendered as one wall of prose. These lock the structure in.
import { describe, expect, it } from 'vitest';
import {
  outlineLsjSenses,
  stampSenseDepth,
  prefixLsjCitationHrefs,
  renderLsjEntry,
  sanitizeHtml,
} from '../lib/html';

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
    // The sanitizer alone: data-depth is stamped later, by renderLsjEntry.
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
    // Two sections, because one is not a division and gets no list at all.
    const long = sanitizeHtml(
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> ' +
      'the word or outward form by which the inward thought is expressed' +
      '</div>' +
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">B.</b> second</div>',
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
      expect(html).toContain(`<div id="${sense.id}" data-depth="1" class="lsj-sense" data-level="1">`);
    }
    expect(html.match(/ id="/g)).toHaveLength(3);
    // Everything else is byte-identical to the input.
    expect(
      html.replace(/ id="lsj-sense-[a-z0-9-]+"/g, '').replace(/ data-depth="\d"/g, ''),
    ).toBe(sanitized);
  });

  it('never collides ids when two different numbers share an anchor', () => {
    // "A." and "a." are different sections but reduce to the same slug; the
    // second takes a suffix. (A REPEATED number is a different matter: that
    // means the run is not one division, and the list is refused entirely.)
    const { html, senses } = outlineLsjSenses(sanitizeHtml(
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> one</div>' +
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">a.</b> two</div>' +
      '<div class="lsj-sense" data-level="1">unnumbered</div>',
    ));
    expect(senses.map((s) => s.id)).toEqual(['lsj-sense-a', 'lsj-sense-a-2']);
    // The unnumbered div is not a section and is left out — δέκα otherwise
    // published eleven blank rows.
    expect(senses.every((sense) => /[A-Za-z0-9]/.test(sense.n))).toBe(true);
    expect(html.match(/ id="/g)).toHaveLength(2);
  });

  it('refuses a list whose numbers repeat', () => {
    const { senses } = outlineLsjSenses(sanitizeHtml(
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">II.</b> one</div>' +
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">II.</b> two</div>' +
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">III.</b> three</div>',
    ));
    expect(senses).toEqual([]);
  });

  it('refuses a list drawn from more than one parent', () => {
    // ἀναιρέω published "II, III, II, III" — two headings' subdivisions run
    // together and labelled the entry's main senses.
    const two = (n: string) =>
      `<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">${n}.</b> t</div>`;
    const { senses } = outlineLsjSenses(sanitizeHtml(
      '<div class="lsj-sense" data-level="1">holder one</div>' + two('II') + two('III') +
      '<div class="lsj-sense" data-level="1">holder two</div>' + two('IV') + two('V'),
    ), 'lsj-sense', 3);
    expect(senses).toEqual([]);
  });

  it('keeps level 0 from displacing the real sections', () => {
    // ὅς and ποιέω open with a level-0 usage note; ranking it pushed their
    // A/B/C down a level and out of the list.
    const out = stampSenseDepth(sanitizeHtml(
      '<div class="lsj-sense" data-level="0"><b class="lsj-sense-n">•</b> usage note</div>' +
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> first</div>' +
      '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">I.</b> under A</div>',
    ));
    expect(out).toContain('<div data-depth="1" class="lsj-sense" data-level="0">');
    expect(out).toContain('<div data-depth="1" class="lsj-sense" data-level="1">');
    expect(out).toContain('<div data-depth="2" class="lsj-sense" data-level="2">');
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

// renderLsjEntry is the whole contract a host implements — the site's lemma
// page and word popup, the desktop lexicon, and any sibling reader that copies
// shared/ call this one function and get identical typography. Everything it
// needs to know is in its arguments; nothing about Aristotle is.
describe('renderLsjEntry', () => {
  it('sanitizes, wraps, and keeps the sense hierarchy in one call', () => {
    const out = renderLsjEntry(`${ENTRY}<script>alert(1)</script>`);
    expect(out.startsWith('<div class="lsj-entry">')).toBe(true);
    expect(out.endsWith('</div>')).toBe(true);
    expect(out).toContain('<div data-depth="3" class="lsj-sense" data-level="3">');
    expect(out).not.toContain('alert(1)');
  });

  it('prefixes citation links with the host\'s deploy base', () => {
    expect(renderLsjEntry(ENTRY, { base: '/aristotle-reader' }))
      .toContain('href="/aristotle-reader/EN/book/1?loc=1094a:5"');
    // A host served at the root (the desktop app) passes no base and keeps the
    // shard's own hrefs.
    expect(renderLsjEntry(ENTRY)).toContain('href="/EN/book/1?loc=1094a:5"');
  });

  it('renders nothing at all for a missing or empty entry', () => {
    // The shard lookup for a lemma with no dictionary entry yields undefined;
    // the host's own `{#if}` keys off the empty string this returns.
    for (const empty of ['', '   ', '<script>x</script>', undefined as unknown as string]) {
      expect(renderLsjEntry(empty)).toBe('');
    }
  });

  it('adds the outline only when asked, and only when it earns its place', () => {
    expect(renderLsjEntry(ENTRY)).not.toContain('lsj-outline');
    const withOutline = renderLsjEntry(ENTRY, { outline: true });
    expect(withOutline).toContain('<p class="lsj-outline-label">3 main senses</p>');
    expect(withOutline).toContain('<a href="#lsj-sense-a">');
    // Two senses are a list, not an outline.
    const two = '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> one</div>'
      + '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">B.</b> two</div>';
    expect(renderLsjEntry(two, { outline: true })).not.toContain('lsj-outline');
    expect(renderLsjEntry(two, { outline: true, outlineMin: 2 })).toContain('lsj-outline');
  });

  it('escapes sense text on its way into the outline', () => {
    const nasty = '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> '
      + 'a &amp; b &lt;script&gt;alert(1)&lt;/script&gt;</div>'
      + '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">B.</b> two</div>'
      + '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">C.</b> three</div>';
    const out = renderLsjEntry(nasty, { outline: true });
    expect(out).toContain('a &amp; b &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('takes the page scale for a reference view and the popup scale by default', () => {
    expect(renderLsjEntry(ENTRY, { scale: 'page' }))
      .toContain('<div class="lsj-entry lsj-entry-page">');
    expect(renderLsjEntry(ENTRY)).toContain('<div class="lsj-entry">');
  });

  it('keeps anchor ids distinct when one view renders several entries', () => {
    const a = renderLsjEntry(ENTRY, { outline: true, idPrefix: 'e1' });
    const b = renderLsjEntry(ENTRY, { outline: true, idPrefix: 'e2' });
    expect(a).toContain('id="e1-a"');
    expect(b).toContain('id="e2-a"');
    expect(a).not.toContain('id="e2-a"');
  });
});

// The deployed shards are a FLAT sibling run and an entry does not have to
// start at level 1: 759 of 14,047 entries do not, λόγος among them. Keying the
// typography and the jump list off the absolute data-level set those entries'
// real sections in sub-sense type and published no jump list for them at all.
describe('an entry that does not start at level 1', () => {
  // λόγος as the shard actually holds it: no level-1 sense, I/II at level 2.
  const LOGOS = [
    '<b class="lsj-head">λόγος</b>, <span class="lsj-gen">ὁ</span>, ',
    '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">I.</b> computation</div>',
    '<div class="lsj-sense" data-level="3"><b class="lsj-sense-n">2.</b> a sub-sense</div>',
    '<div class="lsj-sense" data-level="4"><b class="lsj-sense-n">b.</b> a leaf</div>',
    '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">II.</b> relation</div>',
    '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">III.</b> explanation</div>',
  ].join('');

  it('makes the entry\'s own shallowest level its top level', () => {
    const html = stampSenseDepth(sanitizeHtml(LOGOS));
    // level 2 → depth 1, so I/II/III take the section accent, not sub-sense grey
    expect(html).toContain('<div data-depth="1" class="lsj-sense" data-level="2">');
    expect(html).toContain('<div data-depth="2" class="lsj-sense" data-level="3">');
    expect(html).toContain('<div data-depth="3" class="lsj-sense" data-level="4">');
    expect(html).not.toContain('data-depth="4"');
  });

  it('lists those sections in the jump list', () => {
    const { senses } = outlineLsjSenses(sanitizeHtml(LOGOS), 'lsj-sense', 3);
    expect(senses.map((sense) => sense.n)).toEqual(['I', 'II', 'III']);
  });

  it('renders the jump list through renderLsjEntry', () => {
    const out = renderLsjEntry(LOGOS, { outline: true, scale: 'page' });
    expect(out).toContain('<nav class="lsj-outline"');
    expect(out).toContain('3 main senses');
    // every anchor the list emits is stamped in the same pass
    for (const href of out.match(/href="#([^"]+)"/g) ?? []) {
      expect(out).toContain(`id="${href.slice(7, -1)}"`);
    }
  });

  it('stamps depth on the popup path too, which shows no jump list', () => {
    const out = renderLsjEntry(LOGOS, {});
    expect(out).toContain('data-depth="1"');
    expect(out).not.toContain('<nav class="lsj-outline"');
  });

  it('publishes no blank rows for an entry of unnumbered holders', () => {
    // δέκα: eleven level-1 divs, none of them numbered — eleven empty rows.
    const deka = Array.from({ length: 11 }, (_, i) =>
      `<div class="lsj-sense" data-level="1">compound ${i}</div>`).join('');
    const out = renderLsjEntry(deka, { outline: true });
    expect(out).not.toContain('lsj-outline');
    expect(out).not.toContain('main senses');
  });
});

// Levels skip a rank in 1,836 deployed entries — 1,621 of them run 1 → 3.
// Subtracting the shallowest level left those a step too deep, so this pins
// compression specifically: reverting to subtraction must fail here.
describe('an entry that skips a rank', () => {
  const skipped = (a: number, b: number) =>
    `<div class="lsj-sense" data-level="${a}"><b class="lsj-sense-n">A.</b> top</div>` +
    `<div class="lsj-sense" data-level="${b}"><b class="lsj-sense-n">1.</b> under it</div>`;

  it('gives the child the next depth, not the next level', () => {
    const out = stampSenseDepth(sanitizeHtml(skipped(1, 3)));
    expect(out).toContain('<div data-depth="1" class="lsj-sense" data-level="1">');
    expect(out).toContain('<div data-depth="2" class="lsj-sense" data-level="3">');
    expect(out).not.toContain('data-depth="3"');
  });

  it('compresses a run that starts deep AND skips', () => {
    const out = stampSenseDepth(sanitizeHtml(skipped(3, 5)));
    expect(out).toContain('<div data-depth="1" class="lsj-sense" data-level="3">');
    expect(out).toContain('<div data-depth="2" class="lsj-sense" data-level="5">');
  });

  it('never lets prose suppress stamping for the whole entry', () => {
    // The guard reads each sense tag, not the entry string, so a quotation
    // mentioning the attribute cannot switch depth off.
    const out = stampSenseDepth(sanitizeHtml(
      '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> data-depth="1" as prose</div>' +
      '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">I.</b> under</div>',
    ));
    // Assert the TAG carries it — the prose contains that text either way, so
    // a bare substring check would pass even with the old whole-string guard.
    expect(out).toContain('<div data-depth="1" class="lsj-sense" data-level="1">');
    expect(out).toContain('<div data-depth="2" class="lsj-sense" data-level="2">');
  });
});

// A depth holding ONE numbered section is not a division. Listing the level
// below it side by side would mix sub-senses from different parents and call
// them the entry's main senses.
describe('choosing which depth the jump list indexes', () => {
  const numbered = (level: number, n: string) =>
    `<div class="lsj-sense" data-level="${level}"><b class="lsj-sense-n">${n}.</b> text</div>`;

  it('does not skip past a real division to list its children', () => {
    const html = numbered(1, 'A') + numbered(2, '1') + numbered(2, '2') +
      numbered(2, '3') + numbered(1, 'B') + numbered(2, '4') + numbered(2, '5');
    const out = renderLsjEntry(html, { outline: true, outlineMin: 3 });
    // A and B are a division but there are only two of them: no list, rather
    // than a list of 1,2,3,4,5 drawn from under both of them.
    expect(out).not.toContain('lsj-outline');
  });

  it('descends when the level above is a single section', () => {
    const html = numbered(1, 'A') + numbered(2, 'I') + numbered(2, 'II') + numbered(2, 'III');
    const { senses } = outlineLsjSenses(sanitizeHtml(html), 'lsj-sense', 3);
    expect(senses.map((sense) => sense.n)).toEqual(['I', 'II', 'III']);
  });
});
