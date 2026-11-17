// Share cards: every work has its own (public/og/<Work>.jpg, from scripts/make-og-cards.mjs),
// 1200×630 as the og:image tags declare, and its landing and book pages name it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import plates from '../data/plates.json';

const root = resolve(__dirname, '../..');
const works = Object.keys(plates).filter(id => id !== 'home' && id !== '404');

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

  it('keeps the site card at 1200×630', () => {
    const b = readFileSync(resolve(root, 'public/og-default.png'));
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it('points the landing and book pages at the work card', () => {
    for (const f of ['src/components/Landing.astro', 'src/components/ReaderShell.astro']) {
      const s = readFileSync(resolve(root, f), 'utf8');
      expect(s, f).toMatch(/og\/\$\{workId\}\.jpg/);
      expect(s, f).toMatch(/new URL\(`\$\{base\}\/\$\{ogCard\}`/);
    }
  });
});
