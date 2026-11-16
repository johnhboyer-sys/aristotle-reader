import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initReturningLayout, resolveHomePlace, updateTouchVerb } from '../lib/home-resume';

afterEach(() => { document.body.replaceChildren(); });

describe('returning home layout', () => {
  it('restores each heading and card position across phone and desktop changes', () => {
    document.body.innerHTML = `<div class="b-top"><section class="b-po"><h1 data-title="The complete works of Aristotle">The complete works of Aristotle</h1></section><section class="b-intro"><p class="b-lead"><span id="touch-verb">Click</span></p><div class="b-intro-r"></div><div class="b-resume-work"></div></section></div>`;
    const top = document.querySelector<HTMLElement>('.b-top')!;
    const lead = top.querySelector('.b-lead')!;
    const card = top.querySelector('.b-resume-work')!;
    const band = new EventTarget() as MediaQueryList;
    Object.defineProperty(band, 'matches', { value: true, writable: true });
    initReturningLayout(top, band);
    expect(top.querySelector('.b-intro')!.firstElementChild).toBe(card);
    expect(() => updateTouchVerb(top, true)).not.toThrow();
    const resize = (phone: boolean) => {
      Object.assign(band, { matches: phone });
      band.dispatchEvent(new Event('change'));
    };
    for (let i = 0; i < 2; i++) {
      resize(false);
      expect([...top.querySelectorAll('.b-masthead-line')].map(el => el.textContent)).toEqual(['The', 'Complete', 'Works of', 'Aristotle']);
      expect(top.querySelector('.b-intro')!.firstElementChild).toBe(lead);
      expect(top.querySelector('.b-intro-r')!.nextElementSibling).toBe(card);
      resize(true);
      expect(top.querySelector('h1')!.textContent).toBe('The complete works of Aristotle');
      expect(top.querySelectorAll('.b-masthead-line')).toHaveLength(0);
      expect(top.querySelector('.b-intro')!.firstElementChild).toBe(card);
      expect(top.querySelector<HTMLElement>('.b-po')!.style.getPropertyValue('--cap')).toBe('');
    }
  });
});

// CI has no built corpus: the EN chapter and column maps come from it.
const dataPresent = existsSync(resolve('public/data/EN/chapters.json'));
const load = (file: string) => JSON.parse(readFileSync(resolve(`public/data/EN/${file}.json`), 'utf8'));
const chapters = dataPresent ? load('chapters') : null;
const columns = dataPresent ? load('columns') : null;
describe.skipIf(!dataPresent)('home saved place (needs the built corpus)', () => {
  it('moves an EN citation from stale Book I to Book II chapter 3', () => {
    expect(resolveHomePlace(1, '1104b3', chapters, columns)).toEqual({ book: 2, cite: '1104b3', chapter: '3' });
  });
  it('drops citations outside every book, including shared-column gaps and past the final line', () => {
    for (const cite of ['1a1', '1103a12', '9999b99', '1181b999', 'bad']) {
      expect(resolveHomePlace(1, cite, chapters, columns)).toEqual({ book: 1, cite: null, chapter: undefined });
    }
  });
  it('keeps valid citations and resolves both sides of a shared column', () => {
    expect(resolveHomePlace(1, '1094a1', chapters, columns)).toEqual({ book: 1, cite: '1094a1', chapter: '1' });
    expect(resolveHomePlace(2, '1103a10', chapters, columns).book).toBe(1);
    expect(resolveHomePlace(1, '1103a14', chapters, columns).book).toBe(2);
    expect(resolveHomePlace(1, null, chapters, columns)).toEqual({ book: 1, cite: null, chapter: undefined });
  });
});
