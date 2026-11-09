import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
function resolvePlaywright() {
    const require = createRequire(import.meta.url);
    try {
        return require('playwright');
    }
    catch { }
    const npxRoot = join(homedir(), '.npm', '_npx');
    if (existsSync(npxRoot)) {
        for (const hash of readdirSync(npxRoot)) {
            const p = join(npxRoot, hash, 'node_modules', 'playwright');
            if (existsSync(p))
                return require(p);
        }
    }
    throw new Error('Playwright not found. Install it (npm i -D playwright) or run `npx playwright --version` once to populate the cache.');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
    if (existsSync(cache))
        process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}
if (!process.argv[2])
    throw Error('Usage: make-poster-golden.mjs <kit index.html>');
const source = readFileSync(new URL('../../shared/lib/works.ts', import.meta.url), 'utf8');
// Registry entries only, excluding translation ids and category references.
const ids = [...source.matchAll(/^    id: '([^']+)',/gm)].map(m => m[1]);
if (ids.length !== 47 || new Set(ids).size !== 47)
    throw Error(`Expected 47 work ids, got ${ids.length}`);
const browser = await resolvePlaywright().chromium.launch();
const output = { works: {}, home: {} };
try {
    for (const id of [...ids, 'home']) {
        const settings = {};
        for (const kind of ['desktop', 'phone']) {
            const page = await browser.newPage({ viewport: { width: kind === 'phone' ? 900 : 1600, height: 1000 } });
            await page.goto(pathToFileURL(resolve(process.argv[2])).href + '#' + (id === 'home' ? 'b-home' : `b-work:${id}`));
            await page.waitForTimeout(400);
            await page.click(`[data-width="${kind}"]`);
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(900);
            const oswald = await page.evaluate(() => [...document.fonts].some(f => f.family.replaceAll('"', '') === 'Oswald' && f.status === 'loaded'));
            if (!oswald)
                throw Error(`Oswald failed to load in reference ${id}/${kind}; refusing fallback metrics`);
            const selector = `.pane[data-pane="${kind}"] .b-po-t`;
            await page.waitForSelector(selector);
            settings[kind] = await page.locator(selector).evaluate(el => ({ lines: [...el.querySelectorAll('.ln')].map(l => l.textContent), set: el.dataset.set }));
            if (!settings[kind].lines.length || !settings[kind].set)
                throw Error(`Empty title ${id}/${kind}`);
            await page.close();
        }
        if (id === 'home')
            output.home = settings;
        else
            output.works[id] = settings;
        console.log(`GOLDEN ${id} examined=2`);
    }
    writeFileSync(new URL('./fixtures/poster-golden.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
}
finally {
    await browser.close();
}
