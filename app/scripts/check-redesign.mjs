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
// Stage 1 checks run against Astro's built output. Later stages add gate functions here.
const args = process.argv.slice(2);
const flag = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const BASE = flag('--base') || 'http://localhost:4329';
const only = flag('--only') || flag('--prove');
const prove = flag('--prove');
if (flag('--stage') && flag('--stage') !== '1')
    throw Error('Only stage 1 is implemented');
const app = fileURLToPath(new URL('../', import.meta.url));
const dist = join(app, 'dist');
const walk = (dir, ext) => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(join(dir, d.name), ext) : ext.test(d.name) ? [join(dir, d.name)] : []);
const assert = (ok, msg) => { if (!ok)
    throw Error(msg); };
const sizes = { D1440: [1440, 900], D1280: [1280, 800], D961: [961, 800], S844: [844, 390], S960: [960, 540], P390: [390, 844], P360: [360, 780] };
let browser;
async function open(size = 'D1440', theme = 'light', path = '/', seed = false, fresh = false) {
    browser ||= await resolvePlaywright().chromium.launch();
    const [width, height] = sizes[size];
    const touch = /^[SP]/.test(size);
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, colorScheme: theme });
    await context.addInitScript(({ theme, seed, fresh }) => {
        if (!fresh) localStorage.setItem('ne-theme', theme);
        if (seed) {
            localStorage.setItem('reader-recent', JSON.stringify({ EN: Date.now() }));
            localStorage.setItem('reader-book-EN', '1');
            localStorage.setItem('reader-loc-EN', '1095b30');
        }
    }, { theme, seed, fresh });
    const page = await context.newPage();
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Wait for the title fitter only where there is a poster, so the gates can
    // also run against the old design (the failing-first runs).
    if (await page.locator('.b-po-t').count())
        await page.waitForFunction(() => document.querySelector('.b-po-t')?.dataset.set);
    return page;
}
const close = page => page.context().close();
const style = (page, css) => page.addStyleTag({ content: css });
async function geometry(page) {
    return page.evaluate(() => {
        const title = document.querySelector('.b-po-t'), img = document.querySelector('.b-po img'), po = document.querySelector('.b-po');
        const t = title.getBoundingClientRect(), i = img.getBoundingClientRect(), p = po.getBoundingClientRect();
        // Measure the title's content edge: B puts the 20px gap inside its box.
        const paddingLeft = parseFloat(getComputedStyle(title).paddingLeft);
        const contentWidth = title.clientWidth - paddingLeft - parseFloat(getComputedStyle(title).paddingRight);
        return { gap: t.left + paddingLeft - i.right, width: title.clientWidth, right: p.right - t.right, fit: getComputedStyle(img).objectFit, position: getComputedStyle(img).objectPosition, phone: img.currentSrc.includes('/plates/phone/'), overflow: [...title.querySelectorAll('.ln')].filter(l => l.scrollWidth > contentWidth + 1).map(l => l.textContent), plateLeft: i.left, titleTop: t.top, plateTop: i.top };
    });
}
const controls = 'a[href],button,summary,input,select,[role="button"],[tabindex="0"]';
const tokens = {
    light: ['#f4f4f1', '#fbfbf9', '#141413', '#5d5c57', '#6c6b66', '#d9d8d2', '#e6e5e0', '#e2382e', '#b42419', '#e9e8e3', '#f3e2a4'],
    dark: ['#121211', '#171716', '#ecebe6', '#a7a59e', '#8d8b85', '#2d2c29', '#22211f', '#ff5a4d', '#ff7b70', '#24231f', '#5a4917']
};
const names = ['bg', 'paper', 'ink', 'mid', 'faint', 'line', 'line2', 'red', 'red-ink', 'soft', 'hl'];
const gates = {
    'R-T1-home': async () => {
        const golden = JSON.parse(readFileSync(join(app, 'scripts/fixtures/poster-golden.json'), 'utf8')).home;
        if (prove) {
            // Change only this in-memory copy; never rewrite the reference file.
            const lines = golden.phone.lines;
            assert(lines.length > 1, 'phone golden needs at least two lines for proof');
            lines.splice(0, 2, lines[0] + ' ' + lines[1], '');
        }
        let examined = 0;
        for (const [viewport, kind] of [['D1440', 'desktop'], ['P390', 'phone']]) {
            const expected = golden[kind];
            assert(expected?.lines?.length, `${kind} golden has no lines`);
            const expectedSizes = expected.set.split(',').map(Number);
            assert(expectedSizes.length === expected.lines.length && expectedSizes.every(n => Number.isFinite(n) && n > 0), `${kind} invalid golden sizes`);
            const page = await open(viewport);
            try {
                const actual = await page.locator('.b-po-t').evaluate(el => ({
                    lines: [...el.querySelectorAll('.ln')].map(line => line.textContent),
                    set: el.dataset.set,
                }));
                assert(actual.lines.length > 0, `${viewport} examined=0 title lines`);
                assert(JSON.stringify(actual.lines) === JSON.stringify(expected.lines), `${viewport} home lines=${JSON.stringify(actual.lines)} expected=${JSON.stringify(expected.lines)}`);
                const sizes = actual.set?.split(',').map(Number) || [];
                assert(sizes.length === expectedSizes.length, `${viewport} home data-set=${actual.set} expected=${expected.set}`);
                for (let i = 0; i < sizes.length; i++) {
                    assert(Number.isFinite(sizes[i]) && Math.abs(sizes[i] - expectedSizes[i]) <= 1, `${viewport} home line ${i + 1} size=${sizes[i]} expected=${expectedSizes[i]} ±1px`);
                    examined++;
                }
            } finally {
                await close(page);
            }
        }
        return examined;
    },
    'R-C1': async () => {
        const css = walk(join(dist, '_astro'), /\.css$/);
        assert(css.length, 'no built CSS');
        assert(css.some(f => readFileSync(f, 'utf8').includes('--greek-w')), '--greek-w absent from built CSS');
        const p = await open();
        if (prove)
            await style(p, '.dir-b .b-po-t{color:black!important}');
        const color = await p.locator('.b-po-t').evaluate(el => getComputedStyle(el).color);
        await close(p);
        assert(color === 'rgb(226, 56, 46)', `home title color=${color}`);
        return css.length + 1;
    },
    'R-C2': async () => {
        const files = walk(join(dist, '_astro'), /\.(css|js)$/);
        const bad = files.filter(f => /--gw\b/.test(readFileSync(f, 'utf8')));
        if (prove && /--gw\b/.test('fixture {width:var(--gw, max-content)}'))
            bad.push('injected fixture var(--gw,)');
        assert(!bad.length, `legacy width token: ${bad.join(', ')}`);
        return files.length;
    },
    'R-F1': async () => {
        const p = await open();
        if (prove)
            await p.evaluate(() => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Anton'; document.head.append(l); });
        const links = await p.locator('link[rel="stylesheet"]:not([media="print"])').evaluateAll(els => els.map(l => l.href).filter(h => h.includes('fonts.googleapis.com')));
        const requested = await p.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('fonts.googleapis.com')));
        const urls = [...new Set([...links, ...requested])];
        const families = urls.flatMap(u => new URL(u).searchParams.getAll('family').map(f => f.split(':')[0]));
        await close(p);
        assert(links.length === 1, `screen font links=${links.length}`);
        for (const f of families)
            assert(['Oswald', 'Sofia Sans', 'Literata', 'Gentium Book Plus'].includes(f), `screen font ${f}`);
        for (const f of ['Oswald', 'Sofia Sans', 'Literata', 'Gentium Book Plus'])
            assert(families.includes(f), `missing font ${f}`);
        return families.length;
    },
    'R-F2': async () => {
        let n = 0;
        for (const theme of ['light', 'dark']) {
            const p = await open('D1440', theme);
            if (prove)
                await style(p, '.frame.dir-b{--bg:#ffffff!important}');
            const got = await p.locator('.frame.dir-b').evaluate((el, names) => names.map(k => getComputedStyle(el).getPropertyValue('--' + k).trim()), names);
            await close(p);
            names.forEach((key, i) => { assert(got[i] === tokens[theme][i], `${theme} --${key}=${got[i]} expected ${tokens[theme][i]}`); n++; });
        }
        return n;
    },
    'R-P4': async () => {
        let n = 0;
        for (const size of ['D1440', 'P390'])
            for (const theme of ['light', 'dark']) {
                const p = await open(size, theme);
                if (prove && theme === 'dark')
                    await style(p, '.dir-b .b-po.pl img{filter:invert(1)!important}');
                const got = await p.locator('.b-po img').evaluateAll(els => els.map(el => { const s = getComputedStyle(el); return { mask: s.maskImage, blend: s.mixBlendMode, filter: s.filter, loaded: el.complete && el.naturalWidth > 0 }; }));
                await close(p);
                for (const s of got) {
                    assert(s.loaded, `${size}/${theme} image failed to load`);
                    assert(s.mask === 'none', `${size}/${theme} mask=${s.mask}`);
                    assert(s.blend === (theme === 'dark' ? 'normal' : 'multiply'), `${size}/${theme} blend=${s.blend}`);
                    assert(s.filter === (theme === 'dark' ? 'sepia(0.45) brightness(0.76) contrast(1.06)' : 'none'), `${size}/${theme} filter=${s.filter}`);
                    n++;
                }
            }
        return n;
    },
    'R-T3': async () => {
        let n = 0;
        for (const size of ['D1440', 'D1280', 'D961']) {
            const p = await open(size);
            if (prove)
                await style(p, '.dir-b .b-po.tp-side.pl-l img{width:calc(100% - 586px)!important}');
            const g = await geometry(p);
            await close(p);
            assert(Math.abs(g.gap - 56) <= 1, `${size} home gap=${g.gap}, expected 56`);
            assert(g.width === 470 && Math.abs(g.right - 72) <= 1 && g.plateLeft === 0, `${size} home geometry ${JSON.stringify(g)}`);
            n++;
        }
        return n;
    },
    'R-T4': async () => {
        let n = 0;
        for (const size of ['P390', 'P360'])
            for (const theme of ['light', 'dark']) {
                const p = await open(size, theme);
                if (prove)
                    await style(p, '.dir-b .b-po.pl.tp-side.hp-p-side img{object-fit:contain!important}');
                const g = await geometry(p);
                await close(p);
                assert(Math.abs(g.gap - 20) <= 1, `${size}/${theme} home gap=${g.gap}`);
                assert(g.fit === 'cover', `${size}/${theme} object-fit=${g.fit}`);
                assert(g.position === '50% 50%', `${size}/${theme} object-position=${g.position}`);
                n++;
            }
        return n;
    },
    'R-T5': async () => {
        let n = 0;
        for (const size of ['S844', 'S960']) {
            const p = await open(size);
            try {
                if (prove)
                    await style(p, '.dir-b .b-works{grid-template-columns:repeat(2,minmax(0,1fr))!important}');
                const g = await geometry(p);
                assert(Math.abs(g.gap - 20) <= 1, `${size} home gap=${g.gap}`);
                assert(g.phone, `${size} desktop plate loaded`);
                assert(!g.overflow.length, `${size} title overflow: ${g.overflow}`);
                const desktopLinks = await p.locator('.b-links > a:not(.b-only-s)').evaluateAll(els => ({
                    count: els.length,
                    displayed: els.filter(el => el.getClientRects().length && getComputedStyle(el).display !== 'none').map(el => el.textContent),
                }));
                assert(desktopLinks.count > 0, `${size} examined=0 desktop nav links`);
                assert(!desktopLinks.displayed.length, `${size} desktop nav links displayed: ${desktopLinks.displayed}`);
                assert(await p.locator('.b-links > a.b-only-s[aria-label="Search"]').isVisible(), `${size} phone search icon hidden`);
                assert(await p.locator('.b-sm summary[aria-label="Menu"]').isVisible(), `${size} phone menu hidden`);
                const layout = await p.evaluate(() => {
                    const failures = [];
                    const intro = document.querySelector('.b-intro');
                    const introStyle = getComputedStyle(intro);
                    const introBox = intro.getBoundingClientRect();
                    const search = intro.querySelector('.b-search').getBoundingClientRect();
                    const lead = intro.querySelector('.b-lead').getBoundingClientRect();
                    if (introStyle.gridTemplateColumns.trim().split(/\s+/).length !== 1 || lead.bottom > search.top + 1)
                        failures.push('home line is not above the search box');
                    if (Math.abs(search.left - introBox.left - parseFloat(introStyle.paddingLeft)) > 1 ||
                        Math.abs(introBox.right - parseFloat(introStyle.paddingRight) - search.right) > 1)
                        failures.push('search box does not span the intro content width');
                    const divisions = [...document.querySelectorAll('.b-div')];
                    let rows = 0;
                    let fields = 0;
                    let rowLeft;
                    for (const division of divisions) {
                        const heading = division.querySelector('.b-dh');
                        const firstRow = division.querySelector('.b-works a');
                        const label = heading?.textContent.trim();
                        if (!heading || !firstRow) {
                            failures.push(`${label || 'division'}: examined=0 heading/rows`);
                            continue;
                        }
                        if (heading.getBoundingClientRect().bottom > firstRow.getBoundingClientRect().top + 1)
                            failures.push(`${label}: division heading is beside its works`);
                        for (const list of division.querySelectorAll('.b-works')) {
                            const links = [...list.querySelectorAll('li > a')];
                            if (!links.length) failures.push(`${label}: examined=0 work rows`);
                            if (getComputedStyle(list).gridTemplateColumns.trim().split(/\s+/).length !== 1)
                                failures.push(`${label}: works grid has more than one column`);
                            for (const row of links) {
                                rows++;
                                const name = row.dataset.work || row.textContent.trim();
                                const left = row.getBoundingClientRect().left;
                                rowLeft ??= left;
                                if (Math.abs(left - rowLeft) > 1)
                                    failures.push(`${name}: work rows have different left edges`);
                                const title = row.querySelector('.b-wt');
                                const greek = row.querySelector('.b-wg');
                                const extent = row.querySelector('.b-we');
                                if (!title || !greek || !extent) {
                                    failures.push(`${name}: missing title, Greek title or extent`);
                                    continue;
                                }
                                for (const el of [title, greek, extent]) {
                                    fields++;
                                    if (el.scrollWidth > el.clientWidth)
                                        failures.push(`${name} .${el.className}: overflow ${el.scrollWidth}>${el.clientWidth}`);
                                }
                                const extentBox = extent.getBoundingClientRect();
                                for (const el of [title, greek]) {
                                    const box = el.getBoundingClientRect();
                                    if (Math.min(box.right, extentBox.right) > Math.max(box.left, extentBox.left) &&
                                        Math.min(box.bottom, extentBox.bottom) > Math.max(box.top, extentBox.top))
                                        failures.push(`${name}: extent overlaps .${el.className}`);
                                }
                            }
                        }
                    }
                    return { failures, divisions: divisions.length, rows, fields };
                });
                assert(layout.divisions > 0 && layout.rows > 0 && layout.fields > 0, `${size} examined=0 divisions/rows/text fields`);
                assert(!layout.failures.length, `${size} ${layout.failures.join('; ')}`);
                n++;
            } finally {
                await close(p);
            }
        }
        return n;
    },
    'R-H1': async () => {
        let n = 0;
        for (const size of ['D1440', 'P390']) {
            const p = await open(size);
            if (prove)
                await p.locator('#touch-verb').evaluate(el => el.textContent = 'Click');
            assert(await p.locator('.b-brand').textContent() === 'Aristotle Reader', 'brand mismatch');
            const menu = p.locator('summary[aria-label="Menu"]');
            assert(await menu.isVisible() === (size === 'P390'), `${size} menu visibility`);
            const desktopLinks = await p.locator('.b-links > a:not(.b-only-s)').evaluateAll(els => els.filter(el => el.getClientRects().length).length);
            assert(desktopLinks === (size === 'P390' ? 0 : 5), `${size} visible desktop nav links=${desktopLinks}`);
            assert(await p.locator('.theme-toggle').count() === 1, 'theme control count');
            const expected = `Parallel Greek–English editions of every work of Aristotle. ${size === 'P390' ? 'Tap' : 'Click'} any Greek word to parse it and see its definition. Search the corpus in Greek and English.`;
            assert(await p.locator('.b-lead').textContent() === expected, `${size} home line mismatch`);
            assert(!await p.locator('#resume-card').isVisible(), `${size} resume with empty storage`);
            const order = await p.evaluate(() => ['.b-nav', '.b-po', '.b-lead', '.b-search', '.b-div', '.b-foot'].map(s => document.querySelector(s).getBoundingClientRect().top + scrollY));
            assert(order.every((v, i) => !i || v >= order[i - 1]), `${size} content order ${order}`);
            const nav = await p.locator('.b-links > a:not(.b-only-s)').evaluateAll(els => els.map(a => [a.textContent, new URL(a.href).pathname]));
            assert(JSON.stringify(nav) === JSON.stringify([['Works', '/'], ['Search', '/search'], ['Lexicon', '/lemma/'], ['Phrases', '/phrases'], ['Support', '/support']]), `nav ${JSON.stringify(nav)}`);
            await p.locator('.b-search input').fill('justice');
            await p.locator('.b-search button').click();
            await p.waitForURL('**/search?q=justice');
            await close(p);
            n++;
        }
        const p = await open('D1440', 'light', '/', true);
        assert(await p.locator('#resume-card').isVisible(), 'seeded resume absent');
        const label = await p.locator('#resume-link').textContent();
        assert(label.includes('Nicomachean Ethics') && label.includes('1095b30'), `resume label ${label}`);
        const href = await p.locator('#resume-link').getAttribute('href');
        assert((await p.request.get(BASE + href)).status() === 200, `resume link ${href}`);
        await close(p);
        return n + 1;
    },
    'R-H2': async () => {
        const p = await open();
        if (prove)
            await p.evaluate(() => document.querySelector('[data-division="V"] .b-works').append(document.querySelector('[data-work="AthPol"]').parentElement));
        const heads = await p.locator('.b-dh').allTextContents();
        assert(JSON.stringify(heads) === JSON.stringify(['Logic', 'Natural philosophy', 'Metaphysics', 'Ethics and politics', 'Rhetoric and poetics', 'Dubious and spurious works']), `division heads ${heads}`);
        for (const [div, wanted] of [['IV', ['EN', 'EE', 'Pol', 'AthPol']], ['V', ['Rhet', 'Poet']]]) {
            const got = await p.locator(`[data-division="${div}"] [data-work]`).evaluateAll(els => els.map(e => e.dataset.work));
            assert(JSON.stringify(got) === JSON.stringify(wanted), `${div} ids=${got}`);
        }
        assert(await p.locator('a[href="/Isa/"]').count() === 0, 'Isagoge on home');
        const links = await p.locator('.b-works a').evaluateAll(els => els.map(a => a.href));
        for (const href of links)
            assert((await p.request.get(href)).status() === 200, `work link ${href}`);
        await close(p);
        return links.length;
    },
    'R-H3': async () => {
        const files = walk(dist, /\.html$/);
        let bad = [];
        const inputs = files.map(f => [f, readFileSync(f, 'utf8')]);
        if (prove)
            inputs.push(['footer fixture', '<footer><a href="#">Picture credits</a></footer>']);
        for (const [f, html] of inputs)
            if (/href\s*=\s*["']#["']|data-noop\b/.test(html))
                bad.push(f);
        assert(!bad.length, `placeholder links in ${bad.slice(0, 10).join(', ')}`);
        const creditsMissing = !existsSync(join(dist, 'picture-credits/index.html'));
        if (creditsMissing) console.log('EXPECTED-MISSING R-H3 /picture-credits/ (stage 2)');
        const p = await open();
        const links = await p.locator('.b-foot a').evaluateAll(els => els.map(a => [a.textContent, new URL(a.href).href]));
        const expected = [['The Plato Reader', 'https://plato.johnhboyer.com/'], ['The Homer Reader', 'https://homer.johnhboyer.com/'], ['The Greek Drama Reader', 'https://greekdrama.johnhboyer.com/'], ['Grammata', 'https://grammata.pages.dev/'], ['Texts & licences', BASE + '/attribution'], ['Picture credits', BASE + '/picture-credits/'], ['Support', BASE + '/support'], ['Desktop app', BASE + '/desktop'], ['Play a game', BASE + '/game/']];
        assert(JSON.stringify(links) === JSON.stringify(expected), `footer destinations ${JSON.stringify(links)}`);
        for (const [label, href] of links) {
            const response = await p.request.get(href, { timeout: 30000 });
            if (label === 'Picture credits' && response.status() === 404 && creditsMissing) {
                continue;
            }
            assert(response.ok(), `${label} ${href} HTTP ${response.status()}`);
        }
        await close(p);
        return files.length + links.length;
    },
    'R-A1': async () => {
        console.log('R-A1 footnotes: not applicable to home');
        let n = 0;
        for (const size of ['D1440', 'S844', 'P390']) {
            const p = await open(size);
            if (size === 'P390')
                await p.locator('summary[aria-label="Menu"]').click();
            if (prove)
                await style(p, '.dir-b .theme-toggle{width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important}');
            const got = await p.locator(controls).evaluateAll(els => els.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => ({ tag: el.tagName, text: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 65), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })));
            for (const g of got) {
                assert(g.w >= 39.99 && g.h >= 39.99, `${size} ${g.tag} ${g.text} ${g.w}×${g.h}`);
                n++;
            }
            await close(p);
        }
        return n;
    },
    'R-A2': async () => {
        let n = 0;
        for (const size of ['D1440', 'P390']) {
            const p = await open(size);
            if (size === 'P390')
                await p.locator('summary[aria-label="Menu"]').click();
            if (prove)
                await style(p, '.dir-b .b-search input:focus-visible{outline:none!important;box-shadow:none!important}');
            const count = await p.locator(controls).count();
            const seen = new Set();
            for (let i = 0; i < count + 5; i++) {
                await p.keyboard.press('Tab');
                const got = await p.evaluate(() => { const el = document.activeElement; if (!el || el === document.body)
                    return null; const s = getComputedStyle(el); return { key: el.outerHTML.slice(0, 200), outline: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow }; });
                if (!got)
                    continue;
                if (seen.has(got.key))
                    break;
                seen.add(got.key);
                assert((got.outline !== 'none' && got.width >= 2) || got.shadow !== 'none', `${size} focus missing ${got.key}`);
                n++;
            }
            await close(p);
        }
        return n;
    },
    'R-A3': async () => {
        let n = 0;
        const failures = [];
        for (const theme of ['light', 'dark']) {
            const p = await open('D1440', theme);
            if (prove)
                await style(p, '.dir-b .b-sub.sub-label{color:var(--red)!important}');
            const result = await p.evaluate(() => {
                const rgb = s => { const m = s.match(/[\d.]+/g)?.map(Number); return m ? [m[0], m[1], m[2], m[3] ?? 1] : [0, 0, 0, 0]; };
                const mix = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3]));
                const lum = a => a.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
                const walker = document.createTreeWalker(document.querySelector('.dir-b'), NodeFilter.SHOW_TEXT);
                let node;
                const out = [];
                while (node = walker.nextNode()) {
                    if (!node.textContent.trim())
                        continue;
                    const el = node.parentElement;
                    if (el.closest('script,style,[hidden]'))
                        continue;
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    if (!range.getBoundingClientRect().width)
                        continue;
                    const cs = getComputedStyle(el);
                    if (cs.visibility === 'hidden')
                        continue;
                    const chain = [];
                    for (let a = el; a; a = a.parentElement)
                        chain.unshift(a);
                    let bg = [255, 255, 255], opacity = 1;
                    for (const a of chain) {
                        const s = getComputedStyle(a);
                        bg = mix(rgb(s.backgroundColor), bg);
                        opacity *= Number(s.opacity);
                    }
                    const fg = rgb(cs.color);
                    fg[3] *= opacity;
                    const ink = mix(fg, bg);
                    const l1 = lum(ink), l2 = lum(bg), ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
                    const large = parseFloat(cs.fontSize) >= (Number(cs.fontWeight) >= 700 ? 18.66 : 24);
                    const min = large ? 3 : 4.5;
                    out.push({ text: node.textContent.trim().slice(0, 60), element: el.tagName + '.' + el.className, ratio, min, color: cs.color, opacity });
                }
                return out;
            });
            for (const g of result) {
                n++;
                if (g.ratio + .001 < g.min)
                    failures.push(`${theme} ${g.element} "${g.text}" ratio=${g.ratio.toFixed(3)} expected>=${g.min} color=${g.color} opacity=${g.opacity}`);
            }
            await close(p);
        }
        assert(!failures.length, `examined=${n}; ${failures.join('; ')}`);
        return n;
    },
    'R-E1': async () => {
        const files = walk(dist, /\.html$/);
        const forbidden = ['In this mockup', 'No analysis', 'will appear here', 'keeps its own Bekker', 'Tap any Greek word', 'Click any Greek word'];
        let bad = [];
        const inputs = prove ? forbidden.map(s => ['HTML fixture ' + s, `<p>${s}</p>`]) : files.map(f => [f, null]);
        for (const [f, source] of inputs) {
            const html = source ?? readFileSync(f, 'utf8');
            for (const s of forbidden) {
                let body = html;
                if (f === join(dist, 'index.html') && /^(Tap|Click) any Greek word$/.test(s))
                    body = body.replace(/<p class="b-lead">[\s\S]*?<\/p>/, '');
                if (body.includes(s))
                    bad.push(`${f}: ${s}`);
            }
        }
        assert(!bad.length, `examined=${prove ? inputs.length : files.length} violations=${bad.length}; ` + bad.slice(0, 12).join('; '));
        const p = await open();
        const empty = await p.locator('.b-div h2,.b-div h3').evaluateAll(els => els.filter(el => !el.nextElementSibling?.textContent.trim()).map(el => el.textContent));
        await close(p);
        assert(!empty.length, `empty home divisions ${empty}`);
        return files.length;
    },
    'R-E2': async () => {
        let n = 0;
        const fails = [];
        for (const size of ['D1440', 'P390'])
            for (const path of ['/', '/Cat/', '/EN/book/1']) {
                const p = await open(size, 'light', path, false, true);
                if (prove)
                    // A real first-visit toast sits in view (fixed), as the old .reader-tip did.
                    await p.evaluate(() => { const el = document.createElement('div'); el.className = 'reader-tip'; el.role = 'status'; el.textContent = 'First visit tip'; el.style.cssText = 'position:fixed;left:16px;bottom:16px;padding:12px;background:#fff'; document.body.append(el); });
                await p.waitForTimeout(3000);
                const bad = await p.evaluate(() => {
                    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden'; };
                    const alerts = [...document.querySelectorAll('[role="status"],[role="alert"],[role="dialog"],[aria-live],.reader-tip')].filter(el => visible(el) && el.textContent.trim());
                    // These are the existing reader header, its contents bar and the site's nav.
                    const allow = ['.page-header', '.simple-header', '.reader-controls', '.b-nav'];
                    const fixed = [...document.querySelectorAll('body *')].filter(el => visible(el) && ['fixed', 'sticky'].includes(getComputedStyle(el).position) && !allow.some(s => el.matches(s)));
                    return [...alerts, ...fixed].map(el => el.tagName + '.' + el.className + ' ' + el.textContent.replace(/\s+/g, ' ').trim().slice(0, 70));
                });
                await close(p);
                if (bad.length) fails.push(`${path} ${size} unsolicited overlay: ${bad.join('; ')}`);
                n++;
            }
        assert(!fails.length, `examined=${n}; ` + fails.join(' | '));
        return n;
    }
};
if (only && !gates[only])
    throw Error(`Unknown gate ${only}`);
let failed = 0;
try {
    for (const [id, run] of Object.entries(gates)) {
        if (only && only !== id)
            continue;
        try {
            const n = await run();
            assert(n > 0, 'examined=0');
            console.log(`PASS ${id} examined=${n}`);
            if (prove) {
                console.error(`FAIL ${id} proof mutation was not caught`);
                failed++;
            }
        }
        catch (e) {
            failed++;
            console.error(`FAIL ${id} ${e.message.split('\n')[0]}${e.message.includes('Permission denied (1100)') ? ' — sandbox: bootstrap_check_in Permission denied (1100)' : ''}`);
        }
    }
}
finally {
    if (browser)
        await browser.close();
}
process.exitCode = failed ? 1 : 0;
