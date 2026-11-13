import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
function resolvePlaywright() {
  try { return require('playwright'); } catch {}
  const root = join(homedir(), '.npm', '_npx');
  if (existsSync(root)) for (const hash of readdirSync(root)) {
    const p = join(root, hash, 'node_modules', 'playwright');
    if (existsSync(p)) return require(p);
  }
  throw new Error('Playwright not found in the project or npm cache');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}
const args = process.argv.slice(2);
const flag = name => args[args.indexOf(name) + 1];
if (!args.includes('--base') || !args.includes('--out')) throw new Error('Usage: --base URL --out FILE.json');
const queries = [
  ['Greek any form', { g: 'ἀρετή' }],
  ['English virtue', { e: 'virtue' }],
  ['Greek any word', { g: 'ἀρετή ἕξις', gm: 'any' }],
  ['Exact phrase', { g: 'τὸ τί ἦν εἶναι', gm: 'phrase', m: 'form' }],
  ['Virtue near habit', [['c', 'l:areth'], ['c', 'l:ecis'], ['cw', '10']]],
  ['Accents observed', { g: 'ἀρετή', acc: '1' }],
  ['Running text', { g: 'λογ', m: 'text' }],
  ['Genitive plural near virtue', [['c', 'g:case.gen,number.pl'], ['c', 'l:areth'], ['cw', '10']]],
  ['Authentic works', { g: 'ἀρετή', w: 'auth' }],
  ['Mock-up authentic list (Isagoge kept)', { g: 'ἀρετή', w: '-Oec,MM,Prob,VV,DM,Mech,Col,Phgn,Plant,MXG,Aud,Lin,Spir,Vent,Mirab,RhetAl' }],
];
const browser = await resolvePlaywright().chromium.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage();
  for (const [name, params] of queries) {
    try {
      const url = new URL(`/search?${new URLSearchParams(params)}`, flag('--base')).href;
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const status = document.querySelector('[role="status"]')?.textContent?.trim();
        if (document.querySelector('.search-error')) throw new Error(document.querySelector('.search-error').textContent);
        return status && (status === 'No passages found.' || /^\d[\d,]* instances?/.test(status));
      }, null, { timeout: 120000 });
      const counts = await page.evaluate(() => {
        const status = document.querySelector('[role="status"]').textContent.trim();
        const match = status.match(/^([\d,]+) instances?/);
        if (!match && status !== 'No passages found.') throw new Error(`Unreadable count: ${status}`);
        const pages = status.match(/page \d+ of (\d+)/i);
        const separate = {};
        for (const el of document.querySelectorAll('.result-count, .lang-count')) {
          for (const m of el.textContent.matchAll(/([\d,]+)\s+(Greek|English)/gi)) separate[m[2].toLowerCase()] = Number(m[1].replaceAll(',', ''));
        }
        return { total: match ? Number(match[1].replaceAll(',', '')) : 0, pages: pages ? Number(pages[1]) : match ? 1 : 0, ...separate, shown: status };
      });
      results.push({ name, url, ...counts });
      console.log(name, counts);
    } catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
  }
  writeFileSync(flag('--out'), JSON.stringify(results, null, 2) + '\n');
} finally { await browser.close(); }
