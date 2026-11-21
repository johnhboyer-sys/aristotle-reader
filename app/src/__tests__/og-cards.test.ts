// Share cards: every work has its own (public/og/<Work>.jpg, from scripts/make-og-cards.mjs),
// 1200×630 as the og:image tags declare, and its landing and book pages name it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import plates from '../data/plates.json';
import record from '../data/og-cards.json';
import { getWork } from '@shared/lib/works';
import { shareCard } from '../lib/og';

const root = resolve(__dirname, '../..');
const works = Object.keys(plates).filter(id => id !== 'home' && id !== '404');
const cards = record as Record<string, { title: string; greek: string; line: string; sha256: string }>;
const sha = (f: string) => createHash('sha256').update(readFileSync(resolve(root, f))).digest('hex');

function jpegSize(b: Buffer): [number, number] {
  expect(b.readUInt16BE(0)).toBe(0xffd8);
  for (let p = 2; p < b.length;) {
    if (b[p] !== 0xff) { p++; continue; }
    const m = b[p + 1];
    if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(p + 7), b.readUInt16BE(p + 5)];
    p += 2 + b.readUInt16BE(p + 2);
  }
  return [0, 0];
}

describe('share cards', () => {
  it('has one 1200×630 card per work and no others', () => {
    expect(works.length).toBeGreaterThan(40);
    const files = readdirSync(resolve(root, 'public/og')).sort();
    expect(files).toEqual(works.map(id => `${id}.jpg`).sort());
    for (const id of works) expect(jpegSize(readFileSync(resolve(root, `public/og/${id}.jpg`))), id).toEqual([1200, 630]);
  });

  it('draws each card from its own work, as recorded when it was drawn', () => {
    expect(Object.keys(cards).sort()).toEqual(['home', ...works].sort());
    for (const id of works) {
      const work = getWork(id)!;
      expect(cards[id].title, id).toBe(work.title);
      expect(cards[id].greek, id).toBe(work.greekTitle);
      // The translator the work page opens with (Landing.astro's `primary`), as the public site shows it.
      const editions = work.translations.filter(t => !t.private);
      const primary = editions.find(t => t.id === work.defaultTranslation) ?? editions.find(t => t.slot === 'english') ?? editions[0];
      expect(cards[id].line, id).toBe(`Greek and English · ${primary.short}`);
      // A card swapped with another, or redrawn without its record, has another hash.
      expect(sha(`public/og/${id}.jpg`), id).toBe(cards[id].sha256);
    }
    expect(sha('public/og-default.png')).toBe(cards.home.sha256);
    expect(new Set(Object.values(cards).map(c => c.sha256)).size).toBe(works.length + 1);
  });

  it('keeps the site card at 1200×630', () => {
    const b = readFileSync(resolve(root, 'public/og-default.png'));
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it('gives each card an address that changes when its picture does', () => {
    expect(shareCard()).toBe(`og-default.png?v=${cards.home.sha256.slice(0, 8)}`);
    for (const id of works) expect(shareCard(id), id).toBe(`og/${id}.jpg?v=${cards[id].sha256.slice(0, 8)}`);
    // A work with no card of its own, and the home's own key, get the site card.
    expect(shareCard('NoSuchWork')).toBe(shareCard());
    expect(shareCard('home')).toBe(shareCard());
    expect(shareCard('constructor')).toBe(shareCard());
  });

  it('fills every page\'s share tags from shareCard', () => {
    const tagged = (readdirSync(resolve(root, 'src'), { recursive: true }) as string[])
      .filter(f => /\.(astro|svelte|ts|js|mjs|html)$/.test(f) && !f.startsWith('__tests__'))
      .filter(f => /(og|twitter):image["']/.test(readFileSync(resolve(root, 'src', f), 'utf8')));
    // support.astro has a card of its own (public/og-support.png), outside the record.
    const pages = tagged.filter(f => f !== 'pages/support.astro');
    expect(tagged.length).toBe(pages.length + 1);
    expect(pages.length).toBeGreaterThan(10);
    const own = ['components/Landing.astro', 'components/ReaderShell.astro'];
    expect(pages).toEqual(expect.arrayContaining(own));
    for (const f of pages) {
      const s = readFileSync(resolve(root, 'src', f), 'utf8');
      // The only tags that name a share image are these two, and they carry ogImage,
      const tags = [...s.matchAll(/<meta\b[^>]*>/g)].map(m => m[0]).filter(t => /(og|twitter):image["']/.test(t));
      expect(tags, f).toEqual(['<meta property="og:image" content={ogImage} />', '<meta name="twitter:image" content={ogImage} />']);
      // which is built once, from shareCard: the work's card on its own pages, else the site's.
      const set = (name: string) => [...s.matchAll(new RegExp(`\\b${name} =([^;]*);`, 'g'))].map(m => m[1].replace(/\s+/g, ' ').trim());
      const card = own.includes(f) ? 'ogCard' : 'shareCard()';
      expect(set('ogImage'), f).toEqual(['Astro.site ? new URL(`${base}/${' + card + '}`, Astro.site).href : undefined']);
      expect(set('ogCard'), f).toEqual(own.includes(f) ? ['shareCard(workId)'] : []);
    }
  });
});
