import { render, fireEvent, screen } from '@testing-library/svelte';
import { resolve } from 'node:path';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { vi, it, expect } from 'vitest';
import Search from '../components/Search.svelte';
const DIST = resolve(process.cwd(), '../build/dist');
const dataPresent = existsSync(DIST + '/EN/book-01.json');
const evidence = (s: string) => { console.log(s); appendFileSync('/private/tmp/s1-round3-evidence.txt', s+'\n'); };
vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const path = String(url).split('/data/')[1]?.split('?')[0];
  try { const bytes = readFileSync(DIST + '/' + path); return { ok: true, status: 200, json: async () => JSON.parse(bytes.toString()), text: async () => bytes.toString(), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; }
  catch { return { ok: false, status: 404, json: async () => { throw new Error('404'); } }; }
}));
it.skipIf(!dataPresent)('csv (needs the built corpus)', async () => {
  window.history.replaceState(null, '', '/search?' + (process.env.Q ?? 'g=ἀρετή&w=EN'));
  const { container } = render(Search);
  await vi.waitFor(() => expect(container.querySelector('li.instance')).not.toBeNull(), { timeout: 120000, interval: 200 });
  await new Promise(r => setTimeout(r, 300));
  let csv: Blob | undefined;
  URL.createObjectURL = vi.fn(blob => { csv = blob as Blob; return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await fireEvent.click(screen.getByRole('button', { name: 'Export results as CSV' }));
  await vi.waitFor(() => expect(csv).toBeDefined(), { timeout: 120000 });
  const content = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(csv!); });
  const lines = content.replace(/^﻿/, '').split('\r\n');
  expect(lines.length - 1).toBe(273);
  evidence('EVIDENCE CSV ?g=ἀρετή&w=EN: '+(lines.length-1)+' rows');
}, 120000);

const words12 = (el: Element | null) => (el?.textContent ?? '').trim().split(/\s+/).slice(0,12).join(' ');
async function real(q: string) {
 window.history.replaceState(null, '', '/search?' + q);
 const page = render(Search);
 await vi.waitFor(() => expect(page.container.querySelector('li.instance')).not.toBeNull(), {timeout:120000});
 return page;
}
it.skipIf(!dataPresent)('renders real Bekker pairings and merges translation rows by span (needs the built corpus)', async () => {
 const book = JSON.parse(readFileSync(DIST+'/EN/book-01.json','utf8'));
 const seg = book.segments.find((s: any) => s.column === '1095b');
  let page = await real('g=ἀρετή&w=EN&ctx=1');
 const greek = page.container.querySelector('a.inst-ref[href*="loc=1095b:29"]')!.closest('li')!;
 expect(greek.querySelector('.inst-pair[lang="en"]')?.textContent).toContain('virtue');
 evidence('EVIDENCE Greek EN1095b29, ref '+greek.querySelector('.inst-ref')?.textContent+' | '+words12(greek.querySelector('.inst-snippet'))+' | Rackham: '+words12(greek.querySelector('.inst-pair-text')));
 page.unmount();
 page = await real('e=virtue&w=EN&ctx=1');
 const english = page.container.querySelector('a.inst-ref[href*="loc=1095b:25"]')!.closest('li')!;
 expect(english.querySelector('.inst-pair[lang="grc"]')?.textContent).toContain(seg.greek.find((l: any) => l.n === 28).text.split(' ')[0]);
 expect(english.querySelector('.inst-pair[lang="grc"]')?.textContent).not.toContain(seg.greek[0].text);
 // S4a (ruling 18): one translation's English at a time, a switch for each
 // translation with hits here; each, shown, holds its hit.
 const names = [...english.querySelectorAll<HTMLButtonElement>('.tr-names button')];
 expect(names.length).toBeGreaterThan(1);
 for (const name of names) {
   await fireEvent.click(name);
   await vi.waitFor(() => expect(name).toHaveAttribute('aria-pressed', 'true'));
   const label = name.textContent;
   const snippet = english.querySelector('.inst-rows .inst-snippet');
   evidence('EVIDENCE '+label+': '+words12(snippet));
   const pieces = label === 'Ross' ? seg.ross : label === 'Ostwald' ? seg.third : null;
   if (!pieces) continue;
   expect(snippet?.textContent).toContain('virtue');
   expect(wordCount(shown(snippet))).toBeLessThanOrEqual(80);
 }
 evidence('EVIDENCE English EN1095b28, ref '+english.querySelector('.inst-ref')?.textContent+' | Greek: '+words12(english.querySelector('.inst-pair')));
 page.unmount();
 page = await real('g=ἀρετή&e=virtue&w=EN&ctx=1');
 expect(page.container.querySelector('a.inst-ref[href*="loc=1095b:29"]')!.closest('li')!.querySelectorAll('.inst-rows').length).toBeGreaterThan(0);
 expect(page.container.querySelector('a.inst-ref[href*="loc=1095b:25"]')).toBeNull();
 page.unmount();
 page = await real('e=virtue&w=Cat&ctx=1');
 const cat = page.container.querySelector('li.instance')!;
 evidence('EVIDENCE Categories '+cat.querySelector('.inst-ref')?.textContent+' | Greek: '+words12(cat.querySelector('.inst-pair')));
 for (const row of cat.querySelectorAll('.inst-rows')) evidence('EVIDENCE '+row.querySelector('.tr-names')?.textContent+': '+words12(row.querySelector('.inst-snippet')));
 expect(cat.querySelector('.inst-pair[lang="grc"]')).not.toBeNull();
},120000);

it.skipIf(!dataPresent)('widens both languages and keeps English rows in section context (needs the built corpus)', async () => {
 let page = await real('g=ἀρετή&e=virtue&w=EN&ctx=1');
 const short = page.container.querySelector('a.inst-ref[href*="loc=1095b:29"]')!.closest('li')!;
 const greekWords = short.querySelector('.inst-snippet')!.textContent!.length;
 const englishWords = short.querySelector('.inst-rows .inst-snippet')!.textContent!.length;
 page.unmount();
 page = await real('g=ἀρετή&e=virtue&w=EN&ctx=3');
 const wide = page.container.querySelector('a.inst-ref[href*="loc=1095b:29"]')!.closest('li')!;
 expect(wide.querySelector('.inst-snippet')!.textContent!.length).toBeGreaterThan(greekWords);
 expect(wide.querySelector('.inst-rows .inst-snippet')!.textContent!.length).toBeGreaterThan(englishWords);
 page.unmount();
 page = await real('g=ἀρετή&e=virtue&w=EN&ctx=s');
 const section = page.container.querySelector('a.inst-ref[href*="loc=1095b:"]')!.closest('li')!;
 // Several translations with hits in the section: a switch for each.
 expect(section.querySelectorAll('.tr-names button').length).toBeGreaterThan(1);
 expect(section.textContent).toContain('virtue');
},120000);

const shown = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const wordCount = (text: string) => text.split(/\s+/).filter(w => w !== '…' && w).length;
it.skipIf(!dataPresent)('clamps paired rows around hits and leaves sections full (needs the built corpus)', async () => {
 let page = await real('e=virtue&w=Cat');
 const cat = page.container.querySelector('a.inst-ref[href*="loc=2b:15"]')!.closest('li')!;
 const en = cat.querySelector('.inst-rows .inst-snippet')!;
 const gr = cat.querySelector('.inst-pair[lang="grc"]')!;
 expect(wordCount(shown(en))).toBeLessThanOrEqual(80);
 expect(en.querySelector('mark')?.textContent).toBe('virtue');
 expect(shown(en)).toMatch(/^… | …$/);
 expect(shown(gr)).toContain('πρῶται οὐσίαι');
 const catSeg = JSON.parse(readFileSync(DIST+'/Cat/book-01.json', 'utf8')).segments.find((s: any) => s.column === '2b');
 const tokens = catSeg.greek.flatMap((l: any) => l.tokens.map(() => l.n));
 expect(new Set([...gr.querySelectorAll('button.gw')].map(el => tokens[Number(el.getAttribute('data-i'))])).size).toBeLessThanOrEqual(3);
 evidence('ROUND4 e=virtue Cat 2b15 EN: '+shown(en));
 evidence('ROUND4 e=virtue Cat 2b15 GR: '+shown(gr));
 page.unmount();
 page = await real('g=ἀρετή&w=EN');
 // S4a: the hits at 1095b29, 1095b30 and 1095b33 share their lines (three
 // a hit, the section ending at b33), so they are one instance, all marked,
 // cited first line to last.
 const inst = page.container.querySelector('a.inst-ref[href*="loc=1095b:29"]')?.closest('li');
 expect(inst).toBeTruthy();
 expect(shown(inst!.querySelector('.inst-ref'))).toBe('1095b29–33');
 expect(inst!.querySelectorAll('.inst-snippet.greek mark').length).toBe(3);
 expect(page.container.querySelector('a.inst-ref[href*="loc=1095b:30"]')).toBeNull();
 expect(page.container.querySelector('a.inst-ref[href*="loc=1095b:33"]')).toBeNull();
 const english = shown(inst!.querySelector('.inst-pair-text'));
 expect(wordCount(english)).toBeLessThanOrEqual(80);
 expect(english).toContain('ground of virtue');
 evidence('ROUND4 g=ἀρετή EN 1095b29–33 EN: '+english);
 evidence('ROUND4 g=ἀρετή EN 1095b29–33 GR: '+shown(inst!.querySelector('.inst-snippet')));
 page.unmount();
 page = await real('e=virtue&w=Cat&ctx=s');
 const section = page.container.querySelector('a.inst-ref[href*="loc=2b:"]')!.closest('li')!;
 expect(wordCount(shown(section.querySelector('.inst-rows .inst-snippet')))).toBeGreaterThan(80);
}, 120000);
