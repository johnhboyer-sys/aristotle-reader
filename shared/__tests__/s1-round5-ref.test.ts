// S1 round 5: a Greek hit cites its own line, not its Bekker-tick span's
// start; an English-only hit cites its column (John, 13 Nov: "for now the
// column. once every work is properly aligned, the line"), its link the
// span's line. Real corpus only.
import { render, fireEvent, screen } from '@testing-library/svelte';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { vi, it, expect } from 'vitest';
import Search from '../components/Search.svelte';
const DIST = resolve(process.cwd(), '../build/dist');
const dataPresent = existsSync(DIST + '/EN/book-01.json') && existsSync(DIST + '/Cat/book-01.json');
vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const path = String(url).split('/data/')[1]?.split('?')[0];
  try { const bytes = readFileSync(DIST + '/' + path); return { ok: true, status: 200, json: async () => JSON.parse(bytes.toString()), text: async () => bytes.toString(), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; }
  catch { return { ok: false, status: 404, json: async () => { throw new Error('404'); } }; }
}));
const shown = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
async function real(q: string) {
  window.history.replaceState(null, '', '/search?' + q);
  const page = render(Search);
  await vi.waitFor(() => expect(page.container.querySelector('li.instance')).not.toBeNull(), { timeout: 120000, interval: 200 });
  await new Promise(r => setTimeout(r, 300));
  return page;
}
const refs = (c: HTMLElement) => [...c.querySelectorAll('li.instance a.inst-ref')] as HTMLAnchorElement[];

it.skipIf(!dataPresent)('a Greek hit is labelled, linked, and exported at its own line (needs the built corpus)', async () => {
  const page = await real('g=ἀρετή&w=EN');
  const first = refs(page.container)[0];
  console.log('ROUND5 g=ἀρετή&w=EN first five: ' + refs(page.container).slice(0, 5).map(a => shown(a)).join(', '));
  // Its own line, not its tick span's first (1095b25); the hits at 1095b30
  // and 1095b33 share its lines and its instance, cited to the last (S4a).
  expect(shown(first)).toBe('1095b29–33');
  expect(first.getAttribute('href')).toMatch(/loc=1095b:29(&|$)/);
  expect(shown(first.closest('li')!.querySelector('.inst-snippet'))).toContain('ἐπ');

  let csv: Blob | undefined;
  URL.createObjectURL = vi.fn(blob => { csv = blob as Blob; return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await fireEvent.click(screen.getByRole('button', { name: 'Export results as CSV' }));
  await vi.waitFor(() => expect(csv).toBeDefined(), { timeout: 120000 });
  const content = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(csv!); });
  const rows = content.replace(/^﻿/, '').split('\r\n').map(line => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
  const greek = rows.filter(r => r[4] === 'Greek' && /loc=1095b:29(&|$)/.test(r[7] ?? ''));
  expect(greek.length).toBeGreaterThan(0);
  for (const r of greek) expect(r[3]).toBe('1095b29');
  page.unmount();
}, 240000);

it.skipIf(!dataPresent)('an English row under a Greek hit exports its column (needs the built corpus)', async () => {
  // Both languages: a Greek and an English hit in one unit are one instance,
  // cited at the Greek line; its English rows cite the column (John, 13 Nov).
  const page = await real('g=ἀρετή&e=virtue&w=EN');
  let csv: Blob | undefined;
  URL.createObjectURL = vi.fn(blob => { csv = blob as Blob; return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await fireEvent.click(screen.getByRole('button', { name: 'Export results as CSV' }));
  await vi.waitFor(() => expect(csv).toBeDefined(), { timeout: 120000 });
  const content = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(csv!); });
  const rows = content.replace(/^\uFEFF/, '').split('\r\n').map(line => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
  const greek = rows.filter(r => r[4] === 'Greek');
  const english = rows.filter(r => r[4] === 'English');
  expect(greek.some(r => /^\d{1,4}[ab]\d/.test(r[3]))).toBe(true);
  expect(english.length).toBeGreaterThan(0);
  for (const r of english) expect(r[3]).toMatch(/^\d{1,4}[ab]$/);
  page.unmount();
}, 240000);

it.skipIf(!dataPresent)('a Greek hit on a lettered line keeps its letter (needs the built corpus)', async () => {
  // Categories 2b5 and 2b6b both hold ὑποκειμέναις. At three lines 2b5 draws
  // lines 4, 5, 6 and 2b6b draws 6a, 6b, 6c: no line is shared, so they are
  // two instances, each with its own word, 2b6b cited and linked with its
  // letter. (They merged once only because 6b was read as line 6; Codex R8b.)
  const page = await real('g=ὑποκειμέναις&m=form&w=Cat');
  const a = refs(page.container).find(el => /loc=2b:5(&|$)/.test(el.getAttribute('href') ?? ''));
  const b = refs(page.container).find(el => /loc=2b:6b(&|$)/.test(el.getAttribute('href') ?? ''));
  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  expect(shown(a!)).toBe('2b5');
  expect(shown(b!)).toBe('2b6b');
  for (const el of [a!, b!]) expect(shown(el.closest('li')!.querySelector('.inst-snippet'))).toContain('ὑποκειμέναις');
  page.unmount();
}, 240000);

it.skipIf(!dataPresent)('an English-only hit cites its column and links its span line (needs the built corpus)', async () => {
  const page = await real('e=virtue&w=Cat');
  const labels = refs(page.container).map(a => shown(a));
  console.log('ROUND5 e=virtue&w=Cat first five: ' + labels.slice(0, 5).join(', '));
  expect(labels.slice(0, 4)).toEqual(['2b', '5a', '5b', '6b']);
  expect(refs(page.container)[0].getAttribute('href')).toMatch(/loc=2b:15(&|$)/);
  page.unmount();
}, 240000);
