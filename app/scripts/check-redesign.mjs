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
let proofCase = 'default';
const stage = Number(flag('--stage') || 1);
if (![1,2].includes(stage)) throw Error('Stage must be 1 or 2');
const app = fileURLToPath(new URL('../', import.meta.url));
const dist = join(app, 'dist');
const ts = createRequire(import.meta.url)('typescript');
const registrySource = readFileSync(new URL('../../shared/lib/works.ts', import.meta.url), 'utf8').replaceAll('import.meta.env.PUBLIC_SHOW_PRIVATE', "'0'");
const registryJS = ts.transpileModule(registrySource, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}}).outputText;
const registry = await import('data:text/javascript;base64,'+Buffer.from(registryJS).toString('base64'));
const workIds = registry.WORKS.map(w=>w.id);
const publicPages = stage === 2 ? ['/','/Cat/','/picture-credits/'] : ['/'];
const accessPages = stage === 2 ? [...publicPages,'/EN/'] : ['/'];
const plates = JSON.parse(readFileSync(new URL('../src/data/plates.json',import.meta.url),'utf8'));
const chaptersOf = id => JSON.parse(readFileSync(join(app,'public/data',id,'chapters.json'),'utf8'));
const divisionName = id => {
 const category = registry.CATEGORIES.find(c=>[...(c.works||[]),...(c.subcategories||[]).flatMap(g=>g.works)].some(w=>w.id===id));
 return category ? registry.DIVISION_NAMES[category.title] : 'Commentary';
};

const walk = (dir, ext) => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(join(dir, d.name), ext) : ext.test(d.name) ? [join(dir, d.name)] : []);
const assert = (ok, msg) => { if (!ok)
    throw Error(msg); };
const sizes = { D1440: [1440, 900], D1920: [1920, 1080], G1440: [1440, 1400], D1280: [1280, 800], D961: [961, 800], S844: [844, 390], S960: [960, 540], P390: [390, 844], P360: [360, 780] };
let browser;
async function open(size = 'D1440', theme = 'light', path = '/', seed = false, fresh = false, stubPosterResize = false) {
    browser ||= await resolvePlaywright().chromium.launch();
    const [width, height] = sizes[size];
    const touch = /^[SP]/.test(size);
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, colorScheme: theme });
    await context.addInitScript(({ theme, seed, fresh, stubPosterResize }) => {
        if (stubPosterResize) {
            window.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            };
        }
        if (!fresh) localStorage.setItem('ne-theme', theme);
        if (seed) {
            const saved = typeof seed === 'object' ? seed : {work:'EN',book:1,cite:'1095b30'};
            localStorage.setItem('reader-recent',JSON.stringify({[saved.work]:Date.now()}));
            localStorage.setItem(`reader-book-${saved.work}`,String(saved.book));
            if(saved.cite)localStorage.setItem(`reader-loc-${saved.work}`,saved.cite);
        }
    }, { theme, seed, fresh, stubPosterResize });
    const page = await context.newPage();
    page.fontFileRequests = [];
    page.fontSheetReads = [];
    page.on('request', request => {
        if (request.resourceType() === 'font') page.fontFileRequests.push(request.url());
    });
    page.on('response', response => {
        if (response.request().resourceType() === 'stylesheet') {
            page.fontSheetReads.push(response.text().then(text => ({url: response.url(), text})).catch(() => ({url: response.url(), text: ''})));
        }
    });
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
        const t = title.getBoundingClientRect(), image = img.getBoundingClientRect(), p = po.getBoundingClientRect();
        const isWork = po.classList.contains('work');
        const i = isWork && matchMedia('(min-width: 961px)').matches ? po.querySelector('picture').getBoundingClientRect() : image;
        // Measure the title's content edge: B puts the 20px gap inside its box.
        const paddingLeft = parseFloat(getComputedStyle(title).paddingLeft);
        const contentWidth = title.clientWidth - paddingLeft - parseFloat(getComputedStyle(title).paddingRight);
        return { gap: isWork && matchMedia('(min-width: 961px)').matches ? i.left-t.right : t.left+paddingLeft-i.right, titleLeft:t.left, titleBottom:t.bottom, imageTop:image.top, width: title.clientWidth, right: p.right - t.right, fit: getComputedStyle(img).objectFit, position: getComputedStyle(img).objectPosition, phone: img.currentSrc.includes('/plates/phone/'), overflow: [...title.querySelectorAll('.ln')].filter(l => l.scrollWidth > contentWidth + 1).map(l => l.textContent), plateLeft: i.left, titleTop: t.top, plateTop: i.top };
    });
}
const controls = 'a[href],button,summary,input,select,textarea,[role="button"],[tabindex="0"]';
async function* accessStates(page, size) {
    yield {name: 'closed', root: '.dir-b'};
    if (await page.locator('.b-bk').count()) {
        await page.locator('[data-books-open]').click();
        yield {name:'books-open',root:'.dir-b'};
        await page.locator('[data-books-close]').click();
    }
    if (size === 'P390' || size === 'S844') {
        const menu = page.locator('.b-sm summary');
        await menu.click();
        assert(await page.locator('.b-sm').evaluate(el => el.open), `${size} phone menu did not open`);
        yield {name: 'menu-open', root: '.dir-b'};
        await menu.click();
    }
    await page.locator('[data-feedback-open]').click();
    assert(await page.locator('#feedback-modal').evaluate(el => el.open), `${size} feedback dialog did not open`);
    yield {name: 'feedback-open', root: '#feedback-modal'};
    await page.locator('#fb-cancel').click();
}

const tokens = {
    light: ['#f4f4f1', '#fbfbf9', '#141413', '#5d5c57', '#6c6b66', '#d9d8d2', '#e6e5e0', '#e2382e', '#b42419', '#e9e8e3', '#f3e2a4'],
    dark: ['#121211', '#171716', '#ecebe6', '#a7a59e', '#8d8b85', '#2d2c29', '#22211f', '#ff5a4d', '#ff7b70', '#24231f', '#5a4917']
};
const names = ['bg', 'paper', 'ink', 'mid', 'faint', 'line', 'line2', 'red', 'red-ink', 'soft', 'hl'];
const gates = {
    'R-T1-home': async () => {
        const golden = JSON.parse(readFileSync(join(app, 'scripts/fixtures/poster-golden.json'), 'utf8')).home;
        if (prove && proofCase === 'golden-line') {
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
                const got = actual.set?.split(',').map(Number) || [];
                assert(got.length === expectedSizes.length, `${viewport} home data-set=${actual.set} expected=${expected.set}`);
                for (let i = 0; i < got.length; i++) {
                    assert(Number.isFinite(got[i]) && Math.abs(got[i] - expectedSizes[i]) <= 1, `${viewport} home line ${i + 1} size=${got[i]} expected=${expectedSizes[i]} ±1px`);
                    examined++;
                }
            } finally {
                await close(page);
            }
        }
        const sideways = await open('S844', 'light', '/', false, false, prove && proofCase === 'resize-observer');
        try {
            const read = () => sideways.locator('.b-po-t').evaluate(el => {
                const css = getComputedStyle(el);
                return {real: el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight), used: Number(el.dataset.fitWidth), set: el.dataset.set};
            });
            const before = await read();
            assert(before.real > 0 && before.used === before.real, `S844 initial fitter width=${before.used} content width=${before.real}`);
            await sideways.setViewportSize({width: 960, height: 540});
            // Report an assertion failure, rather than count a timeout as a caught proof.
            await sideways.waitForFunction(previous => {
                const el = document.querySelector('.b-po-t');
                return Number(el?.dataset.fitWidth) !== previous.used && el?.dataset.set !== previous.set;
            }, before, {timeout: 3000}).catch(() => {});
            const after = await read();
            assert(before.real !== after.real, 'S844 → S960 did not change the real title content width');
            assert(before.used !== after.used && before.set !== after.set && after.used === after.real,
                `S844 → S960 fitter did not re-fit: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
            examined += 2;
        } finally { await close(sideways); }
        return examined;
    },
    'R-C1': async () => {
        const css = walk(join(dist,'_astro'),/\.css$/);
        assert(css.length && css.some(f=>readFileSync(f,'utf8').includes('--greek-w')),'--greek-w absent from built CSS');
        let n=css.length;
        for(const path of publicPages){
            const p=await open('D1440','light',path);
            try{
                if(prove)await style(p,'.dir-b .b-po-t{color:black!important}');
                const selector=path==='/picture-credits/'?'.b-pc-h':'.b-po-t';
                const color=await p.locator(selector).evaluate(el=>getComputedStyle(el).color);
                assert(color===(path==='/picture-credits/'?'rgb(180, 36, 25)':'rgb(226, 56, 46)'),`${path==='/'?'home':path} title color=${color}`);n++;
            }finally{await close(p);}
        }return n;
    },
    'R-C2': async () => {
        const files = walk(join(dist, '_astro'), /\.(css|js)$/);
        const samples = ['index.html', 'Cat/index.html', 'EN/book/1/index.html', 'search/index.html'];
        const lemma = walk(join(dist, 'lemma'), /\.html$/).find(f => f !== join(dist, 'lemma/index.html'));
        assert(lemma, 'no built lemma sample');
        const attributes = html => [...html.matchAll(/<[a-z][^>]*>/gi)].flatMap(tag =>
            [...tag[0].matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(m => m[1] ?? m[2] ?? m[3])
        ).join('\n');
        const inputs = files.map(file => [file, readFileSync(file, 'utf8')]);
        for (const file of [...samples.map(f => join(dist, f)), lemma]) {
            const html = readFileSync(file, 'utf8');
            const inline = [...html.matchAll(/<(style|script)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => m[2]).join('\n');
            inputs.push([file + ' inline style/script', inline]);
            inputs.push([file + ' style attributes', attributes(html)]);
        }
        if (prove) inputs.push(['injected fixture style attribute', attributes('<p style="width:var(--gw, max-content)">fixture</p>')]);
        const bad = inputs.filter(([,text]) => /--gw\b/.test(text)).map(([file]) => file);
        assert(!bad.length, `legacy width token: ${bad.join(', ')}`);
        return inputs.length;
    },
    'R-F1': async () => {
        let n=0;
        for(const path of publicPages){
        const p = await open('D1440','light',path);
        try {
            if (prove)
                await p.evaluate(() => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Anton'; document.head.append(l); });
            const links = await p.locator('link[rel="stylesheet"]:not([media="print"])').evaluateAll(els => els.map(l => l.href).filter(h => h.includes('fonts.googleapis.com')));
            const requested = await p.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('fonts.googleapis.com')));
            const urls = [...new Set([...links, ...requested])];
            const families = urls.flatMap(u => new URL(u).searchParams.getAll('family').map(f => f.split(':')[0]));
            const allowed = ['Oswald', 'Sofia Sans', 'Literata', 'Gentium Book Plus'];
            for (const family of families) assert(allowed.includes(family), `screen font ${family}`);
            assert(links.length === 1, `screen font links=${links.length}`);
            for (const family of allowed) assert(families.includes(family), `missing font ${family}`);
            const loaded = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/^['"]|['"]$/g, '')));
            assert(loaded.length > 0, 'examined=0 loaded font families');
            for (const family of loaded) assert(allowed.includes(family), `loaded screen font ${family}`);
            const fileFamilies = new Map();
            for (const sheet of await Promise.all(p.fontSheetReads)) {
                for (const block of sheet.text.matchAll(/@font-face\s*\{([^}]+)\}/gi)) {
                    const family = block[1].match(/font-family:\s*['"]?([^;'"}]+)/i)?.[1].trim();
                    for (const url of block[1].matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)) {
                        if (family) fileFamilies.set(new URL(url[1], sheet.url).href, family);
                    }
                }
            }
            assert(p.fontFileRequests.length > 0, 'examined=0 font-file requests');
            for (const url of p.fontFileRequests) {
                const family = fileFamilies.get(url);
                assert(family, `unmapped font-file request ${url}`);
                assert(allowed.includes(family), `font-file request family ${family}: ${url}`);
            }
            n += families.length + loaded.length + p.fontFileRequests.length;
        } finally { await close(p); }
        }return n;
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
        for(const path of (stage===2?['/',...workIds.map(id=>`/${id}/`)]:['/'])) for (const size of ['D1440', 'P390'])
            for (const theme of ['light', 'dark']) {
                const p = await open(size, theme,path);
                if (prove && theme === 'dark')
                    await style(p, '.dir-b .b-po.pl img{filter:invert(1)!important}');
                const got = await p.locator('.b-po img').evaluateAll(els => els.map(el => { const s = getComputedStyle(el); return { mask: s.maskImage, blend: s.mixBlendMode, filter: s.filter, loaded: el.complete && el.naturalWidth > 0 }; }));
                await close(p);
                assert(got.length===1,`${path} ${size} examined=${got.length} plates, expected 1`);
                for (const s of got) {
                    assert(s.loaded, `${size}/${theme} image failed to load`);
                    assert(s.mask === 'none', `${size}/${theme} mask=${s.mask}`);
                    assert(s.blend === (theme === 'dark' ? 'normal' : 'multiply'), `${size}/${theme} blend=${s.blend}`);
                    assert(s.filter === (theme === 'dark' ? 'sepia(0.45) brightness(0.76) contrast(1.06)' : 'none'), `${size}/${theme} filter=${s.filter}`);
                    n++;
                }
            }
        assert(n===(stage===2?192:4),`plate count=${n}`);
        return n;
    },
    'R-T3': async () => {
        let n = 0;
        for(const path of (stage===2?['/','/Cat/','/EN/']:['/'])) for (const theme of ['light', 'dark']) for (const size of ['D1440', 'D1280', 'D961']) {
            const p = await open(size, theme,path);
            try {
                if (prove) await style(p, '.dir-b .b-po.tp-side.pl-l img{width:calc(100% - 586px)!important}');
                const g = await geometry(p);
                assert(Math.abs(g.gap - 56) <= 1, `${size} home gap=${g.gap}, expected 56`);
                assert(g.width === 470 && (path==='/' ? Math.abs(g.right - 72)<=1 && g.plateLeft===0 : Math.abs(g.titleLeft-72)<=1 && Math.abs(g.plateLeft-598)<=1), `${size} home geometry ${JSON.stringify(g)}`);
                const opacity = await p.locator('.b-po-t').evaluate(el => ({value: Number(getComputedStyle(el).opacity), token: Number(getComputedStyle(el).getPropertyValue('--po-op'))}));
                const expected = theme === 'dark' ? .86 : .82;
                assert(Math.abs(opacity.value - expected) < .001 && Math.abs(opacity.value - opacity.token) < .001, `${size}/${theme} title opacity=${opacity.value} --po-op=${opacity.token} expected=${expected}`);
                n++;
            } finally { await close(p); }
        }
        return n;
    },
    'R-T4': async () => {
        let n = 0;
        for(const path of (stage===2?['/','/Cat/','/EN/','/Int/','/AthPol/']:['/'])) for (const size of ['P390', 'P360'])
            for (const theme of ['light', 'dark']) {
                const p = await open(size, theme,path);
                if (prove)
                    await style(p, '.dir-b .b-po.pl.tp-side.hp-p-side img{object-fit:contain!important}');
                const g = await geometry(p);
                await close(p);
                if(path==='/'){
                assert(Math.abs(g.gap - 20) <= 1, `${size}/${theme} home gap=${g.gap}`);
                assert(g.fit === 'cover', `${size}/${theme} object-fit=${g.fit}`);
                assert(g.position === '50% 50%', `${size}/${theme} object-position=${g.position}`);
                }else{assert(g.titleBottom<=g.imageTop+1,`${path} ${size} title overlaps plate`);assert(g.phone,`${path} ${size} desktop plate loaded`);}
                n++;
            }
        return n;
    },
    'R-T5': async () => {
        let n = 0;
        for (const size of ['S844', 'S960']) {
            const p = await open(size);
            try {
                if (prove) {
                    if (proofCase === 'desktop-poster') {
                        await style(p, '.dir-b .b-po.pl.tp-side.hp-p-side{display:block!important;aspect-ratio:1440/652!important;height:auto!important}.dir-b .b-po.tp-side.pl-l img{position:absolute!important;inset:0!important;width:calc(100% - 598px)!important;height:100%!important;object-fit:contain!important}.dir-b .b-po.pl.tp-side.hp-p-side .b-po-t{position:absolute!important;left:auto!important;right:72px!important;top:30px!important;bottom:26px!important;width:470px!important;padding:0!important;flex:none!important}');
                    } else {
                        await style(p, '.dir-b .b-works{grid-template-columns:repeat(2,minmax(0,1fr))!important}');
                    }
                }
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
        if(stage===2)for(const size of ['S844','S960'])for(const id of ['Cat','EN','Int','AthPol']){
            const p=await open(size,'light',`/${id}/`);
            try{const g=await geometry(p);assert(g.titleBottom<=g.imageTop+1,`${id} ${size} title overlaps plate`);assert(g.phone,`${id} ${size} desktop plate loaded`);assert(!g.overflow.length,`${id} ${size} title overflow: ${g.overflow}`);n++;}finally{await close(p);}
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
            assert(await p.locator('[data-theme-toggle]').count() === 1, 'theme control count');
            const expected = `Parallel Greek–English editions of every work of Aristotle. ${size === 'P390' ? 'Tap' : 'Click'} any Greek word to parse it and see its definition. Search the corpus in Greek and English.`;
            assert(await p.locator('.b-lead').textContent() === expected, `${size} home line mismatch`);
            assert(await p.locator('#resume-card').count() === 0, `${size} resume with empty storage`);
            const resumeNodes = await p.evaluate(() => {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node; let count = 0;
                while (node = walker.nextNode()) if (!node.parentElement.closest('script,style') && node.textContent.includes('Continue reading')) count++;
                return count;
            });
            assert(resumeNodes === 0, `${size} Continue reading exists in empty-storage DOM`);
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
        await p.waitForFunction(() => document.querySelector('#resume-link')?.textContent.includes('chapter'));
        // innerText is the text as drawn: textContent kept a space that
        // inline-flex layout dropped on screen ("Continue readingNicomachean").
        const label = await p.locator('#resume-link').innerText();
        assert(label === 'Continue reading Nicomachean Ethics, Book I, chapter 5', `resume label ${label}`);
        assert(await p.locator('#resume-link i').textContent() === 'Nicomachean Ethics', 'resume work title is not italic');
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
        assert(await p.locator('a[href]').evaluateAll(els => els.filter(a => /^\/Isa\/?$/.test(new URL(a.href).pathname)).length) === 0, 'Isagoge on home');
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
        let examined=files.length;
        for(const path of publicPages){
        const p = await open('D1440','light',path);
        const links = await p.locator('.b-foot a').evaluateAll(els => els.map(a => [a.textContent, new URL(a.href).href]));
        const expected = [['The Plato Reader', 'https://plato.johnhboyer.com/'], ['The Homer Reader', 'https://homer.johnhboyer.com/'], ['The Greek Drama Reader', 'https://greekdrama.johnhboyer.com/'], ['Grammata', 'https://grammata.pages.dev/'], ['Texts & licences', BASE + '/attribution'], ['Picture credits', BASE + '/picture-credits/'], ['Support', BASE + '/support'], ['Desktop app', BASE + '/desktop'], ['Report an error', 'mailto:jhboyer@loyno.edu?subject=Aristotle%20Reader%3A%20Bug%20Report'], ['Play a game', BASE + '/game/']];
        assert(JSON.stringify(links) === JSON.stringify(expected), `footer destinations ${JSON.stringify(links)}`);
        assert(await p.locator('[data-feedback-open]').count() === 1, 'feedback footer link missing');
        await p.locator('[data-feedback-open]').click();
        assert(await p.locator('#feedback-modal').evaluate(el => el.open), 'feedback form did not open');
        assert(await p.locator('#feedback-modal input[name="fb-type"]').count() === 2, 'feedback choices missing');
        assert(await p.locator('#feedback-modal input[value="bug"]').isChecked(), 'Report an error did not select the error choice');
        await p.locator('#fb-cancel').click();
        for (const [label, href] of links) {
            if (href.startsWith('mailto:')) continue;
            const response = await p.request.get(href, { timeout: 30000 });
            assert(response.ok(), `${label} ${href} HTTP ${response.status()}`);
        }
        await close(p);
        examined+=links.length;
        }return examined;
    },
    'R-A1': async () => {
        console.log('R-A1 footnotes: not applicable to home');
        let n = 0;
        for(const path of accessPages) for (const size of ['D1440', 'S844', 'P390']) {
            const p = await open(size,'light',path);
            try {
                if (prove)
                    await style(p, '.dir-b [data-theme-toggle]{width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important}');
                for await (const state of accessStates(p, size)) {
                    const got = await p.locator(state.root).locator(controls).evaluateAll(els => els.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => ({tag: el.tagName, text: el.getAttribute('aria-label') || el.textContent?.trim().slice(0,65), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height})));
                    assert(got.length > 0, `${size} ${state.name} examined=0 controls`);
                    for (const control of got) {
                        assert(control.w >= 39.99 && control.h >= 39.99, `${size} ${control.tag} ${control.text} ${control.w}×${control.h} state=${state.name}`);
                        n++;
                    }
                }
            } finally { await close(p); }
        }
        return n;
    },
    'R-A2': async () => {
        let n = 0;
        for(const path of accessPages) for (const size of ['D1440', 'S844', 'P390']) {
            const p = await open(size,'light',path);
            try {
                if (prove)
                    await style(p, '.dir-b .b-search input:focus-visible{outline:none!important;box-shadow:none!important}');
                for await (const state of accessStates(p, size)) {
                    // Start each walk at its root, including the modal's native focus trap.
                    await p.locator(state.root).evaluate(el => {
                        const old = el.getAttribute('tabindex');
                        el.tabIndex = -1; el.focus();
                        if (old === null) el.removeAttribute('tabindex'); else el.setAttribute('tabindex', old);
                    });
                    const count = await p.locator(state.root).locator(controls).count();
                    const seen = new Set();
                    for (let i = 0; i < count + 5; i++) {
                        await p.keyboard.press('Tab');
                        const got = await p.evaluate(({controls, root}) => {
                            const el = document.activeElement;
                            if (!el || el === document.body) return null;
                            const css = getComputedStyle(el);
                            return {key: [...document.querySelectorAll(controls)].indexOf(el), html: el.outerHTML.slice(0,200), inside: document.querySelector(root).contains(el), outline: css.outlineStyle, width: parseFloat(css.outlineWidth), shadow: css.boxShadow};
                        }, {controls, root: state.root});
                        if (!got) continue;
                        assert(got.inside, `${size} ${state.name} focus left its root: ${got.html}`);
                        if (seen.has(got.key)) break;
                        seen.add(got.key);
                        assert((got.outline !== 'none' && got.width >= 2) || got.shadow !== 'none', `${size} ${state.name} focus missing ${got.html}`);
                        n++;
                    }
                    assert(seen.size > 0, `${size} ${state.name} examined=0 focused controls`);
                }
            } finally { await close(p); }
        }
        return n;
    },
    'R-A3': async () => {
        let n = 0;
        const failures = [];
        for (const theme of ['light', 'dark']) for(const path of accessPages) for (const size of ['D1440', 'S844', 'P390']) {
            const p = await open(size, theme,path);
            try {
                if (prove) await style(p, '.dir-b .b-sub.sub-label{color:var(--red)!important}');
                for await (const state of accessStates(p, size)) {
                    const result = await p.evaluate(root => {
                        const rgb = s => {
                            const m = s.match(/[\d.]+/g)?.map(Number);
                            return m ? [m[0], m[1], m[2], m[3] ?? 1] : [0,0,0,0];
                        };
                        const mix = (a,b) => a.slice(0,3).map((v,i) => v*a[3] + b[i]*(1-a[3]));
                        const lum = a => a.map(v=>v/255).map(v=>v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
                        const out = [];
                        const examine = (el,text,pseudo=false) => {
                            const cs = getComputedStyle(el,pseudo ? '::placeholder' : null);
                            const chain = [];
                            for (let a=el; a; a=a.parentElement) chain.unshift(a);
                            let bg=[255,255,255], opacity=pseudo ? Number(cs.opacity) : 1;
                            for (const a of chain) {
                                const css=getComputedStyle(a);
                                bg=mix(rgb(css.backgroundColor),bg); opacity*=Number(css.opacity);
                            }
                            const fg=rgb(cs.color); fg[3]*=opacity;
                            const l1=lum(mix(fg,bg)), l2=lum(bg);
                            const ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
                            const large=parseFloat(cs.fontSize)>=(Number(cs.fontWeight)>=700 ? 18.66 : 24);
                            out.push({text:text.trim().slice(0,60), element:el.tagName+'.'+el.className+(pseudo?'::placeholder':''), ratio, min:large?3:4.5, color:cs.color, opacity});
                        };
                        const host=document.querySelector(root);
                        const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);
                        let node;
                        while (node=walker.nextNode()) {
                            if (!node.textContent.trim()) continue;
                            const el=node.parentElement;
                            if (el.closest('script,style,[hidden]') || getComputedStyle(el).visibility==='hidden') continue;
                            const range=document.createRange(); range.selectNodeContents(node);
                            if (range.getBoundingClientRect().width) examine(el,node.textContent);
                        }
                        for (const el of host.querySelectorAll('input[placeholder],textarea[placeholder]')) {
                            if (!el.value && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden') examine(el,el.placeholder,true);
                        }
                        return out;
                    }, state.root);
                    assert(result.length > 0, `${size}/${theme} ${state.name} examined=0 text elements`);
                    for (const g of result) {
                        n++;
                        if (g.ratio+.001 < g.min) failures.push(`${theme} ${g.element} "${g.text}" ratio=${g.ratio.toFixed(3)} expected>=${g.min} color=${g.color} opacity=${g.opacity} viewport=${size} state=${state.name}`);
                    }
                }
            } finally { await close(p); }
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
        for(const path of publicPages){
        const p = await open('D1440','light',path);
        const empty = await p.locator('.b-div h2,.b-div h3,[data-section] > h2,.b-pc h2').evaluateAll(els => els.filter(el => !el.nextElementSibling?.textContent.trim()).map(el => el.textContent));
        await close(p);
        assert(!empty.length, `empty home divisions ${empty}`);
        }return files.length;
    },
    'R-E2': async () => {
        let n = 0;
        const fails = [];
        for (const size of ['D1440', 'P390'])
            for (const path of (stage===2?['/','/Cat/','/EN/book/1','/picture-credits/']:['/','/Cat/','/EN/book/1'])) {
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
if(stage===2) Object.assign(gates, {
 'R-W1': async()=>{
  let n=0;
  for(const id of workIds){
   const p=await open('D1440','light',`/${id}/`);
   try{
    if(prove&&id==='AthPol')await p.locator('.b-crumb span').evaluate(el=>el.textContent='Rhetoric and poetics');
    const work=registry.getWork(id);
    const crumb=(await p.locator('.b-crumb').textContent()).replace(/\s+/g,' ').trim();
    assert(crumb===`Works / ${divisionName(id)}`,`${id} crumb=${crumb}`);
    const sections=[['print',registry.furtherReading(id).length>0],['resources',registry.resourcesFor(id).length>0],['commentary',id==='Cat']];
    for(const [section,wanted]of sections)assert(await p.locator(`[data-section="${section}"]`).count()===(wanted?1:0),`${id} ${section} presence mismatch`);
    const selectors=['.b-nav','.b-crumb','.b-po',...(work.greekTitle?['.b-wk-gt']:[]),'.b-wk-blurb','.b-ctas','[data-section="facts"]','[data-section="books"]',...sections.filter(([,yes])=>yes).map(([section])=>`[data-section="${section}"]`),'[data-section="sources"]','.b-foot'];
    const order=await p.evaluate(selectors=>{
     const els=selectors.map(selector=>document.querySelector(selector));
     return els.every((el,i)=>el&&(!i||Boolean(els[i-1].compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)));
    },selectors);
    assert(order,`${id} sections out of order`);
    assert(await p.locator('.b-po-t').getAttribute('data-title')===work.title,`${id} title mismatch`);
    assert((await p.locator('.b-wk-blurb').textContent()).startsWith(work.blurb),`${id} blurb mismatch`);
    assert(await p.locator('.support-card').count()===0,`${id} old support card remains`);
    assert(await p.locator('[data-section="sources"] a[href="/attribution"]').count()===1,`${id} Sources link absent`);
    if(id==='Cat')assert(await p.locator('[data-section="commentary"] a').getAttribute('href')==='/Isa','Cat commentary must link to Isa');
    if(id==='EN')assert(await p.locator('a[href="/EN/glossary"]').count()===1,'EN glossary link was lost');
    for(const resource of registry.resourcesFor(id)){
     const section=p.locator('[data-section="resources"]');
     const text=await section.textContent();
     const links=await section.locator('a').evaluateAll(els=>els.map(a=>a.href));
     assert(links.includes(resource.url)&&links.includes(resource.authorUrl)&&text.includes(resource.label)&&text.includes(resource.blurb)&&text.includes(resource.authorName),`${id} live resource content/link was lost`);
     if(resource.exercises)assert(text.includes(resource.exercises),`${id} resource exercises were lost`);
    }
    const heading=await p.locator('[data-section="books"] > h2').textContent();
    assert(heading===(work.books>1?'Books and chapters':'Chapters'),`${id} books heading=${heading}`);
    const totals=Object.values(chaptersOf(id)).reduce((sum,chapters)=>sum+chapters.length,0);
    const extent=`${work.books>1?`${work.books} books, `:''}${totals} chapter${totals===1?'':'s'}`;
    assert((await p.locator('.b-facts dd').last().textContent())===extent,`${id} extent mismatch`);
    const titlePath=join(app,'public/data',id,'third-titles.json');
    const source=existsSync(titlePath)?JSON.parse(readFileSync(titlePath,'utf8')):{};
    const primary=registry.visibleTranslations(work).find(t=>t.id===work.defaultTranslation)||registry.visibleTranslations(work).find(t=>t.slot==='english')||registry.visibleTranslations(work)[0];
    const named=primary?.id==='ostwald'&&Object.values(source.ostwald||{}).some(chapters=>Object.keys(chapters).length);
    assert(await p.locator('.b-note3').count()===(named?1:0),`${id} chapter-title source note mismatch`);
    n++;
   }finally{await close(p);}
  }return n;
 },
 'R-W2':async()=>{
  let n=0;
  for(const id of workIds){
   const p=await open('D1440','light',`/${id}/`);
   try{
    if(prove&&id==='Cat')await p.locator('[data-start]').evaluate(el=>el.href='/EN/book/1');
    const work=registry.getWork(id), editions=registry.visibleTranslations(work);
    const primary=editions.find(t=>t.id===work.defaultTranslation)||editions.find(t=>t.slot==='english')||editions[0];
    const href=await p.locator('[data-start]').getAttribute('href');
    const target=new URL(href,BASE);
    assert(target.pathname===`/${id}/book/1`,`${id} Start reading target=${target.pathname}`);
    assert(target.searchParams.get('trans')===(primary?.id||null),`${id} default translation mismatch`);
    const greek=await p.locator('[data-greek]').getAttribute('href');
    assert(new URL(greek,BASE).pathname===`/${id}/book/1`&&new URL(greek,BASE).searchParams.get('view')==='greek',`${id} Greek-only target mismatch`);
    assert(await p.locator('[data-compare]').count()===(editions.length>=2?1:0),`${id} Compare presence mismatch`);
    if(editions.length>=2){const compare=new URL(await p.locator('[data-compare]').getAttribute('href'),BASE);assert(compare.pathname===`/${id}/book/1`&&compare.searchParams.get('trans')==='compare',`${id} Compare target mismatch`);}
    assert(await p.locator('[data-resume]').count()===0,`${id} resume with empty storage`);
    await p.goto(target.href,{waitUntil:'networkidle'});
    assert(await p.locator('body').getAttribute('data-work')===id,`${id} Start reading opened wrong reader`);
    if(primary)await p.waitForSelector(`.reader-body.trans-${primary.id}`);
    await p.goto(new URL(greek,BASE).href,{waitUntil:'networkidle'});
    assert(await p.locator('body').getAttribute('data-work')===id&&new URL(p.url()).searchParams.get('view')==='greek',`${id} Greek reader route failed`);
    await p.waitForSelector('.reader-body.view-greek');
    n++;
   }finally{await close(p);}
   const chapter=chaptersOf(id)['1'][0];
   const saved=await open('D1440','light',`/${id}/`,{work:id,book:1,cite:chapter.column+chapter.line});
   try{
    const link=saved.locator('[data-resume]');
    const work=registry.getWork(id);
    const expected=`Resume at ${work.books>1?`Book ${work.bookLabels[0]}, `:''}chapter ${chapter.chapter}`;
    assert(await link.textContent()===expected,`${id} resume label=${await link.textContent()}`);
    assert(new URL(await link.getAttribute('href'),BASE).pathname===`/${id}/book/1`,`${id} saved link points elsewhere`);
    n++;
   }finally{await close(saved);}
  }
  const foreign=await open('D1440','light','/Cat/',true);
  try{assert(await foreign.locator('[data-resume]').count()===0,'Cat rendered EN saved place');n++;}finally{await close(foreign);}
  return n;
 },
 'R-W3':async()=>{
  let n=0;
  for(const id of workIds){
   const p=await open('D1440','light',`/${id}/`);
   try{
    if(prove&&id==='Cat')await p.locator('.b-chs a').first().evaluate(el=>el.hash='#ch-1-999');
    const work=registry.getWork(id), chapters=chaptersOf(id);
    assert(await p.locator('.b-bk[open]').count()===0,`${id} books open initially`);
    assert(await p.locator('.b-bk').count()===(work.books>1?work.books:0),`${id} book count mismatch`);
    if(work.books>1){
     const labels=await p.locator('.b-bkn').allTextContents();
     assert(JSON.stringify(labels)===JSON.stringify(work.bookLabels.map(label=>'Book '+label)),`${id} Book labels=${labels}`);
     const red=await p.locator('.b-bkn').evaluateAll(els=>els.every(el=>getComputedStyle(el).color==='rgb(226, 56, 46)'));
     assert(red,`${id} book numbers are not red`);
     await p.locator('[data-books-open]').click();assert(await p.locator('.b-bk[open]').count()===work.books,`${id} Open all books failed`);
     await p.locator('[data-books-close]').click();assert(await p.locator('.b-bk[open]').count()===0,`${id} Close all failed`);
    }
    const links=await p.locator('.b-chs a').evaluateAll(els=>els.map(a=>({href:a.href,book:a.dataset.book,chapter:a.dataset.chapter})));
    const expected=Object.entries(chapters).flatMap(([book,cs])=>cs.map(c=>({book,chapter:c.chapter})));
    assert(links.length===expected.length&&links.length>0,`${id} examined=${links.length} chapter links expected ${expected.length}`);
    const htmls=new Map();
    for(let i=0;i<links.length;i++){
     const link=links[i], target=new URL(link.href), chapter=expected[i];
     assert(target.pathname===`/${id}/book/${chapter.book}`&&target.hash===`#ch-${chapter.book}-${chapter.chapter}`,`${id} wrong chapter target: ${target.pathname}${target.hash} expected book ${chapter.book} chapter ${chapter.chapter}`);
     if(['EN','Meta','AthPol','Isa'].includes(id)){
      if(!htmls.has(target.pathname)){const response=await p.request.get(BASE+target.pathname);assert(response.ok(),`${id} chapter reader HTTP ${response.status()}`);htmls.set(target.pathname,await response.text());}
      assert(htmls.get(target.pathname).includes(`id="${target.hash.slice(1)}"`),`${id} chapter anchor ${target.hash} is absent from reader`);
     }n++;
    }
   }finally{await close(p);}
  }return n;
 },
 'R-K1':async()=>{
  const p=await open('D1440','light','/picture-credits/');
  try{
   if(prove)await p.locator('[data-plate="EN"] [data-record]').evaluate(el=>el.href='#');
   const ids=['home',...registry.CATEGORIES.flatMap(c=>[...(c.works||[]).map(w=>w.id),...(c.subcategories||[]).flatMap(g=>g.works.map(w=>w.id)),...(c.numeral==='I'?['Isa']:[])])];
   const got=await p.locator('[data-plate]').evaluateAll(els=>els.map(el=>el.dataset.plate));
   assert(got.length===48&&JSON.stringify(got)===JSON.stringify(ids),`credits row order/count ${got.length}`);
   let credits=0;
   for(const id of ids){
    const row=p.locator(`[data-plate="${id}"]`), data=plates[id];
    const record=await row.locator('[data-record]').getAttribute('href');
    assert(record===data.url,`${id} Record href=${record} expected=${data.url}`);
    for(const field of ['who','what','when','how','where'])assert(await row.locator(`[data-credit-part="${field}"]`).textContent()===data[field],`${id} ${field} mismatch`);
    assert(await row.locator('[data-licence]').textContent()===data.lic,`${id} licence mismatch`);
    assert(await row.locator('[data-holder-credit]').count()===(data.credit===null?0:1),`${id} holder credit presence mismatch`);
    if(data.credit!==null){assert(await row.locator('[data-holder-credit]').textContent()===data.credit,`${id} holder credit mismatch`);credits++;}
    assert(await row.locator(':scope > a').getAttribute('href')===(id==='home'?'/':`/${id}`),`${id} work link mismatch`);
   }
   assert(credits===Object.values(plates).filter(p=>p.credit!==null).length,`holder credit count=${credits}`);
   return got.length;
  }finally{await close(p);}
 },
 'R-T1':async()=>{
  const golden=JSON.parse(readFileSync(join(app,'scripts/fixtures/poster-golden.json'),'utf8')).works;
  if(prove){const lines=golden.Cat.desktop.lines;lines.splice(0,1,lines[0].slice(0,3),lines[0].slice(3));}
  let n=0;
  for(const id of ['Cat',...workIds.filter(id=>id!=='Cat')])for(const [size,kind] of [['G1440','desktop'],['P390','phone']]){
   const p=await open(size,'light',`/${id}/`);
   try{
    const actual=await p.locator('.b-po-t').evaluate(el=>({lines:[...el.querySelectorAll('.ln')].map(l=>l.textContent),set:el.dataset.set}));
    const expected=golden[id][kind];
    assert(actual.lines.length>0&&JSON.stringify(actual.lines)===JSON.stringify(expected.lines),`${id} ${size} poster lines=${JSON.stringify(actual.lines)} expected=${JSON.stringify(expected.lines)}`);
    const sizes=actual.set.split(',').map(Number), target=expected.set.split(',').map(Number);
    assert(sizes.length===target.length&&sizes.every((v,i)=>Math.abs(v-target[i])<=1),`${id} ${size} poster sizes=${actual.set} expected=${expected.set}`);n++;
   }finally{await close(p);}
  }assert(n===94,`poster golden count=${n}`);return n;
 },
 'R-T2':async()=>{
  let n=0;
  for(const id of ['Cat',...workIds.filter(id=>id!=='Cat')])for(const size of ['D1440','D1280','D1920','P390','S844']){
   const p=await open(size,'light',`/${id}/`);
   try{
    if(prove&&id==='Cat'&&size==='D1440')await style(p,'.dir-b.pg-work .b-po.work{height:calc(100vw * 652 / 1440)!important}');
    const box=await p.evaluate(()=>{
     const poster=document.querySelector('.b-po.work').getBoundingClientRect(), start=document.querySelector('[data-start]').getBoundingClientRect(), img=document.querySelector('.b-po img').getBoundingClientRect(), title=document.querySelector('.b-po-t');
     return {height:innerHeight,bottom:start.bottom,posterHeight:poster.height,navHeight:document.querySelector('.b-nav').offsetHeight,titleHeight:title.clientHeight,ratio:img.width/img.height,phone:matchMedia('(max-width:960px)').matches};
    });
    if(size==='S844')assert(box.posterHeight<=box.height-box.navHeight+1,`${id} ${size} poster height=${box.posterHeight} exceeds viewport minus nav`);
    else assert(box.bottom<=box.height-16+1,`${id} ${size} Start reading bottom=${box.bottom} viewport=${box.height}`);
    const expected=box.phone?640/558:1280/914;
    assert(Math.abs(box.ratio/expected-1)<=.01,`${id} ${size} plate ratio=${box.ratio} expected ${expected}`);
    if(!box.phone)assert(Math.abs(box.titleHeight-(box.posterHeight-56))<=1,`${id} ${size} title height=${box.titleHeight} poster=${box.posterHeight}`);
    n++;
   }finally{await close(p);}
  }assert(n===235,`poster cap count=${n}`);return n;
 },
});

if (only && !gates[only])
    throw Error(`Unknown gate ${only}`);
// A proof is valid only when its own mutation causes the named assertion.
const proofMessages = {
    'R-W1': /AthPol crumb=Works \/ Rhetoric and poetics/,
    'R-W2': /Cat Start reading target=\/EN\/book\/1/,
    'R-W3': /Cat wrong chapter target:/,
    'R-K1': /EN Record href=#/,
    'R-T1': /Cat G1440 poster lines=/,
    'R-T2': /Cat D1440 Start reading bottom=/,
    'R-C1': /home title color=rgb\(0, 0, 0\)/,
    'R-C2': /legacy width token:.*injected fixture/,
    'R-F1': /screen font Anton/,
    'R-F2': /light --bg=#ffffff expected #f4f4f1/,
    'R-P4': /dark filter=invert\(1\)/,
    'R-T3': /D1440 home gap=.*expected 56/,
    'R-T4': /P390\/light object-fit=contain/,
    'R-H1': /P390 home line mismatch/,
    'R-H2': /IV ids=EN,EE,Pol$/,
    'R-H3': /placeholder links in .*footer fixture/,
    'R-A1': /D1440 BUTTON.*34×34/,
    'R-A2': /focus missing .*b-search|focus missing .*name="q"/,
    'R-A3': /light H3\.b-sub sub-label .*ratio=.*color=rgb\(226, 56, 46\)/,
    'R-E1': /examined=6 violations=6; HTML fixture In this mockup/,
    'R-E2': /unsolicited overlay:.*reader-tip/,
};
const homeTitleProofs = {
    'golden-line': /P390 home lines=/,
    'resize-observer': /S844 → S960 fitter did not re-fit/,
};
const sidewaysProofs = {
    'desktop-poster': /S844 home gap=/,
    'two-columns': /S844 .*works grid has more than one column/,
};
let failed = 0;
let proofFailed = false;
try {
    for (const [id, run] of Object.entries(gates)) {
        if (only && only !== id) continue;
        const variants = id === 'R-T5' ? sidewaysProofs : id === 'R-T1-home' ? homeTitleProofs : null;
        const cases = prove && variants ? Object.keys(variants) : ['default'];
        for (const variant of cases) {
            proofCase = variant;
            const expected = variants ? variants[variant] : proofMessages[id];
            try {
                const n = await run();
                assert(n > 0, 'examined=0');
                if (prove) {
                    proofFailed = true;
                    console.error(`FAIL ${id} proof=${variant}: mutation was not caught`);
                } else console.log(`PASS ${id} examined=${n}`);
            } catch (e) {
                failed++;
                if (prove) {
                    if (expected && expected.test(e.message)) {
                        console.log(`PROVE-CAUGHT ${id} case=${variant} expected=${expected}`);
                    } else {
                        proofFailed = true;
                        console.error(`PROVE-FAILED ${id} case=${variant}: unrelated failure; expected ${expected}`);
                    }
                }
                console.error(`FAIL ${id} ${e.message.split('\n')[0]}${e.message.includes('Permission denied (1100)') ? ' — sandbox: bootstrap_check_in Permission denied (1100)' : ''}`);
            }
        }
    }
} finally {
    if (browser) await browser.close();
}
// Expected fixture failure remains non-zero (1). An invalid proof is distinct (2).
process.exitCode = prove ? (proofFailed ? 2 : 1) : (failed ? 1 : 0);
