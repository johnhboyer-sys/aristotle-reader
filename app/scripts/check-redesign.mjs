import { expandSearch, settleFonts, readSearchRefs, searchRefOnOneLine, searchRefBeforeColumn, readControlBoxes, measureGreekLines, readReadingSizes, searchRefFormat, rawGlossaryBodies, readReaderOverlaps, readFootnoteTargets } from './redesign-browser.mjs';
import { Window } from 'happy-dom';
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
const BASE = flag('--base') || 'http://127.0.0.1:4329';
const only = flag('--only') || flag('--prove');
const prove = flag('--prove');
let proofCase = 'default';
const stage = Number(flag('--stage') || 1);
if (![1,2,3,4,5].includes(stage)) throw Error('Stage must be 1, 2, 3, 4 or 5');
const app = fileURLToPath(new URL('../', import.meta.url));
const dist = join(app, 'dist');
const ts = createRequire(import.meta.url)('typescript');
const registrySource = readFileSync(new URL('../../shared/lib/works.ts', import.meta.url), 'utf8').replaceAll('import.meta.env.PUBLIC_SHOW_PRIVATE', "'0'");
const registryJS = ts.transpileModule(registrySource, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}}).outputText;
const registry = await import('data:text/javascript;base64,'+Buffer.from(registryJS).toString('base64'));
const workIds = registry.WORKS.map(w=>w.id);
// Load production helpers for mappings and URL parsing. Expected glossary
// body text comes from a separate raw Markdown reading below.
const sourceModules = new Map();
async function loadSource(file) {
    file = resolve(file);
    if (sourceModules.has(file)) return sourceModules.get(file);
    let source = readFileSync(file, 'utf8').replaceAll('import.meta.env.PUBLIC_SHOW_PRIVATE', "'0'").replaceAll('import.meta.env.BASE_URL', "'/'");
    source = source.replace(/import (\w+) from ['"]([^'"]+\?raw)['"];?/g, (_, name, path) =>
        `const ${name} = ${JSON.stringify(readFileSync(resolve(file, '..', path.replace(/\?raw$/, '')), 'utf8'))};`);
    let js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext,removeComments:true}}).outputText;
    for (const m of [...js.matchAll(/from ['"]([^'"]+)['"]/g)]) {
        const target = m[1].startsWith('@shared/') ? resolve(app, '../shared', m[1].slice(8)) : resolve(file, '..', m[1]);
        const url = await loadSource(target + '.ts');
        js = js.replace(m[0], `from '${url}'`);
    }
    const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
    sourceModules.set(file, url);
    return url;
}
const lemmaManifest = JSON.parse(readFileSync(join(app, 'public/data/lemmata.json'), 'utf8'));
const lemmaIndex = JSON.parse(readFileSync(join(app, 'public/data/lemmata/_index.json'), 'utf8'));
const lemmaHeads = lemmaIndex.map(e => ({...lemmaManifest[e.key], key:e.key}));
const longestLemma = lemmaHeads.reduce((a,b) => [...a.head].length >= [...b.head].length ? a : b);
const arete = lemmaHeads.find(e => e.head === 'ἀρετή');
assertLemmaData();
function assertLemmaData() { if (!arete || lemmaHeads.length < 20) throw Error('Missing lemma gate data'); }
const LEMMA = `/lemma/${arete.slug}/`;
const lemmaSample = [...new Map([arete, longestLemma, ...lemmaHeads].map(e => [e.slug,e])).values()].slice(0,20);
const lemmaHelpers = await import(await loadSource(join(app, 'src/lib/lemma-view.ts')));
const searchUrl = await import(await loadSource(join(app, '../shared/lib/search-url.ts')));
const searchHelpers = await import(await loadSource(join(app, '../shared/lib/search.ts')));
const glossary = await import(await loadSource(join(app, '../shared/lib/glossary.ts')));
const publicPages = stage >= 2 ? ['/','/Cat/','/picture-credits/'] : ['/'];
const accessPages = stage >= 2 ? [...publicPages,'/EN/',...(stage >= 3 ? ['/EN/book/1'] : []),...(stage >= 4 ? ['/search?q=ἀρετή'] : []),...(stage >= 5 ? [LEMMA,'/lemma/'] : [])] : ['/'];
// Stage 3: the reader.
const READER = '/EN/book/1';
const SEARCH = '/search?q=ἀρετή';
// Round 9's returning reader: Nicomachean Ethics, Book II at 1104b3 (chapter 3); a second saved work, Politics.
const r9Seed = () => ({storage: {'reader-book-EN': '2', 'reader-loc-EN': '1104b3', 'reader-recent': JSON.stringify({EN: Date.now()})}});
const r9SeedTwo = () => ({storage: {...r9Seed().storage, 'reader-book-Pol': '1', 'reader-loc-Pol': '1252a1', 'reader-recent': JSON.stringify({EN: Date.now(), Pol: Date.now() - 60000})}});
const plates = JSON.parse(readFileSync(new URL('../src/data/plates.json',import.meta.url),'utf8'));
const chaptersOf = id => JSON.parse(readFileSync(join(app,'public/data',id,'chapters.json'),'utf8'));
const divisionName = id => {
 const category = registry.CATEGORIES.find(c=>[...(c.works||[]),...(c.subcategories||[]).flatMap(g=>g.works)].some(w=>w.id===id));
 return category ? registry.DIVISION_NAMES[category.title] : 'Commentary';
};

const walk = (dir, ext) => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(join(dir, d.name), ext) : ext.test(d.name) ? [join(dir, d.name)] : []);
let gateContext = {path: 'source files', size: 'n/a', theme: 'n/a'};
let gatePage = null;
const failureMessage = msg => {
    if (msg.startsWith('[page=')) return msg;
    let {path, size, theme} = gateContext;
    if (gatePage) {
        // These getters also work after close(), when a gate's finally has run.
        const viewport = gatePage.viewportSize();
        if (viewport) size = Object.entries(sizes).find(([, [w,h]]) => w === viewport.width && h === viewport.height)?.[0] || `${viewport.width}×${viewport.height}`;
        const url = new URL(gatePage.url());
        if (/^https?:$/.test(url.protocol)) path = url.pathname + url.search;
    }
    return `[page=${path} size=${size} theme=${theme}] ${msg}`;
};
const assert = (ok, msg) => { if (!ok)
    throw Error(failureMessage(msg)); };
const sizes = { D1440: [1440, 900], D1920: [1920, 1080], G1440: [1440, 1400], D1280: [1280, 800], D961: [961, 800], S844: [844, 390], S960: [960, 540], P390: [390, 844], P360: [360, 780], W1200: [1200, 800], W900: [900, 800],
    // D26: the two windows the home and work designs were drawn at, and the widths spec §8.10 names for the grid.
    D1525: [1525, 896], D1152: [1152, 663], D1024: [1024, 700], D1366: [1366, 768] };
let browser;
async function open(size = 'D1440', theme = 'light', path = '/', seed = false, fresh = false, stubPosterResize = false, block = null) {
    gateContext = {path, size, theme};
    gatePage = null;
    browser ||= await resolvePlaywright().chromium.launch();
    const [width, height] = sizes[size];
    const touch = /^[SP]/.test(size);
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, colorScheme: theme });
    // block: a URL glob whose requests fail, set before the first request.
    let blocked = 0;
    if (block) await context.route(block, route => { blocked++; return route.abort(); });
    await context.addInitScript(({ theme, seed, fresh, stubPosterResize }) => {
        if (stubPosterResize) {
            window.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            };
        }
        if (!fresh) localStorage.setItem('ne-theme', theme);
        // {storage: {...}} seeds raw localStorage entries (round 9: several saved works).
        if (seed?.storage) for (const [key, value] of Object.entries(seed.storage)) localStorage.setItem(key, value);
        else if (seed) {
            const saved = typeof seed === 'object' ? seed : {work:'EN',book:1,cite:'1095b30'};
            localStorage.setItem('reader-recent',JSON.stringify({[saved.work]:Date.now()}));
            localStorage.setItem(`reader-book-${saved.work}`,String(saved.book));
            if(saved.cite)localStorage.setItem(`reader-loc-${saved.work}`,saved.cite);
        }
    }, { theme, seed, fresh, stubPosterResize });
    const page = await context.newPage();
    page.blockedRequests = () => blocked;
    gatePage = page;
    page.fontFileRequests = [];
    page.fontSheetReads = [];
    page.fontFailures = [];
    page.imageRequests = [];
    page.on('requestfailed', request => {
        if (['font','stylesheet'].includes(request.resourceType())) page.fontFailures.push(`${request.url()}: ${request.failure()?.errorText}`);
    });
    page.on('request', request => {
        if (request.resourceType() === 'font') page.fontFileRequests.push(request.url());
        if (request.resourceType() === 'image') page.imageRequests.push(request.url());
    });
    page.on('response', response => {
        if (['font','stylesheet'].includes(response.request().resourceType()) && response.status() >= 400) page.fontFailures.push(`${response.url()}: HTTP ${response.status()}`);
        if (response.request().resourceType() === 'stylesheet') {
            page.fontSheetReads.push(response.text().then(text => ({url: response.url(), text})).catch(() => ({url: response.url(), text: ''})));
        }
    });
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    // Wait for the title fitter only where there is a poster, so the gates can
    // also run against the old design (the failing-first runs).
    // Round 9: desktop work titles mark data-fs, not data-set, and the
    // returning desktop home masthead is not fitted at all.
    if (await page.locator('.b-po-t').count())
        await page.waitForFunction(() => { const t = document.querySelector('.b-po-t'); return !document.documentElement.classList.contains('poster-fitting') && !!(t?.dataset.set || t?.dataset.fs || t?.closest('.b-returning')); });
    if (stage >= 4 && path.startsWith('/search?')) await searchReady(page);
    else await settleFonts(page);
    if (stage >= 5 && await page.locator('.b-wp').count()) await page.waitForFunction(() => document.querySelector('.b-wp')?.dataset.fitted === 'true');
    return page;
}
async function checkSearchHashes(page, label) {
    const count = await page.locator('a[href="#"]').count();
    assert(count === 0, `${label} search href="#" count=${count}`);
}
async function searchReady(page) {
    await page.waitForFunction(() => document.querySelector('.b-search-page')?.dataset.searchBusy === 'false' && !!document.querySelector('.b-sr-big'), null, {timeout: 120000});
    await settleFonts(page);
}
const close = page => page.context().close();
const style = (page, css) => page.addStyleTag({ content: css });
async function geometry(page) {
    return page.evaluate(() => {
        // Two pictures, one per theme: measure the plate on show.
        const title = document.querySelector('.b-po-t'), img = [...document.querySelectorAll('.b-po img')].find(el => el.getClientRects().length), po = document.querySelector('.b-po');
        const t = title.getBoundingClientRect(), image = img.getBoundingClientRect(), p = po.getBoundingClientRect();
        const isWork = po.classList.contains('work');
        const css=getComputedStyle(img);
        const pl=parseFloat(css.paddingLeft), pr=parseFloat(css.paddingRight), pt=parseFloat(css.paddingTop), pb=parseFloat(css.paddingBottom);
        const bl=parseFloat(css.borderLeftWidth), br=parseFloat(css.borderRightWidth), bt=parseFloat(css.borderTopWidth), bb=parseFloat(css.borderBottomWidth);
        const cw=image.width-pl-pr-bl-br, ch=image.height-pt-pb-bt-bb;
        let iw=cw, ih=ch;
        if(css.objectFit==='contain') {const scale=Math.min(cw/img.naturalWidth,ch/img.naturalHeight);iw=img.naturalWidth*scale;ih=img.naturalHeight*scale;}
        const position=css.objectPosition.split(/\s+/);
        const fraction=(value,axis)=>value==='center'?.5:value===axis?1:parseFloat(value)/100||0;
        const i={left:image.left+bl+pl+(cw-iw)*fraction(position[0],'right'),top:image.top+bt+pt+(ch-ih)*fraction(position[1]||'50%','bottom'),width:iw,height:ih};
        i.right=i.left+iw;i.bottom=i.top+ih;
        const desktopWork=isWork&&matchMedia('(min-width:961px)').matches;
        const expectedWidth=Math.min(p.width-598,p.height*1280/914);
        const paddingLeft = parseFloat(getComputedStyle(title).paddingLeft);
        const contentWidth = title.clientWidth - paddingLeft - parseFloat(getComputedStyle(title).paddingRight);
        return {gap:desktopWork?i.left-t.right:t.left+paddingLeft-image.right,titleLeft:t.left,titleBottom:t.bottom,imageTop:i.top,width:title.clientWidth,right:p.right-t.right,fit:css.objectFit,position:css.objectPosition,phone:/\/plates\/(dark\/)?phone\//.test(img.currentSrc),overflow:[...title.querySelectorAll('.ln')].filter(l=>l.scrollWidth>contentWidth+1).map(l=>l.textContent),plateLeft:desktopWork?i.left:image.left,titleTop:t.top,plateTop:i.top,plateRight:i.right,plateWidth:i.width,plateHeight:i.height,expectedPlateLeft:p.right-expectedWidth,expectedPlateRight:p.right,expectedPlateTop:p.top+(p.height-expectedWidth*914/1280)/2,expectedPlateWidth:expectedWidth};
    });
}
const controls = 'a[href],button,summary,input,select,textarea,[role="button"],[tabindex="0"]';
// The reader page: its menus and panels open in turn. Their roots are not
// modal (focus may leave them); `modal: false` lets the focus walk stop there.
async function* readerStates(page, size) {
    yield {name: 'closed', root: '.dir-b'};
    await page.locator('[data-toc-toggle]').click();
    assert(await page.locator('#toc-sidebar').isVisible(), `${size} contents did not open`);
    yield {name: 'contents-open', root: '#toc-sidebar', modal: false};
    await page.keyboard.press('Escape');
    await page.locator('[data-aa]').click();
    await page.locator('.b-aa').waitFor({timeout: 3000});
    yield {name: 'aa-open', root: '.b-aa', modal: false};
    await page.keyboard.press('Escape');
    if (await page.locator('[data-reader-picker]').isVisible()) {
        await page.locator('[data-reader-picker]').click();
        await page.locator('.b-pk').waitFor({timeout: 3000});
        yield {name: 'picker-open', root: '.b-pk', modal: false};
        await page.keyboard.press('Escape');
    }
    await page.locator('.b-gc .tok >> visible=true').first().click();
    await page.locator('.b-side').waitFor({timeout: 3000});
    yield {name: 'panel-open', root: '.b-side', modal: false};
    await page.keyboard.press('Escape');
}
async function* accessStates(page, size) {
    for await (const state of accessStatesInner(page, size)) {
        await settleFonts(page);
        yield state;
    }
}
async function* accessStatesInner(page, size) {
    if (await page.locator('.b-rh').count()) { yield* readerStates(page, size); return; }
    yield {name: 'closed', root: '.dir-b'};
    if (await page.locator('.b-search-page').count()) {
        await expandSearch(page);
        yield {name:'search-hits',root:'.dir-b'};
        await page.locator('.b-options-toggle').click();
        yield {name:'search-options',root:'.dir-b'};
        await page.locator('.works-trigger').click();
        yield {name:'search-works',root:'.dir-b'};
        await page.locator('.works-trigger').click();
        await page.locator('.advanced-trigger').click();
        yield {name:'search-advanced',root:'.dir-b'};
        await page.locator('.lemma-panel > summary').click();
        yield {name:'search-lemma',root:'.dir-b'};
        await page.locator('.lemma-panel > summary').click();
        await page.locator('.combo-panel > summary').click();
        yield {name:'search-combo',root:'.dir-b'};
        await page.getByLabel('Kind for term 2',{exact:true}).selectOption('grammatical');
        yield {name:'search-grammar',root:'.dir-b'};
        await page.locator('.combo-proximity select').selectOption('line');
        yield {name:'search-window-disabled',root:'.dir-b'};
        await page.locator('.combo-proximity select').selectOption('words');
        await page.locator('.combo-panel > summary').click();
        await page.locator('.advanced-trigger').click();
        await page.locator('.b-search-options .help-btn:visible').click();
        yield {name:'search-help',root:'.help-modal'};
        await page.keyboard.press('Escape');
        await page.locator('.b-options-toggle').click();
    }
    if (await page.locator('.b-bk').count()) {
        await page.locator('[data-books-open]').click();
        yield {name:'books-open',root:'.dir-b'};
        // Round 9 draws no "Close all" button; close the books as a reader would, one by one.
        await page.locator('.b-bk').evaluateAll(els => els.forEach(el => { el.open = false; }));
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
        let examined = 0;
        // D26: from 961px the title stands in one list column (spec §3.2): four lines
        // at 82.5px in a 1525 window and 70.3px in a 1152 window. The old poster's
        // 106px desktop golden is retired; the phone golden below is unchanged.
        for (const [viewport, size] of [['D1525', 82.5], ['D1152', 70.3]]) {
            const page = await open(viewport);
            try {
                if (prove && proofCase === 'desktop-size') await style(page, '.dir-b.pg-home .b-po-t .ln{font-size:60px!important}');
                const actual = await page.locator('.b-po-t').evaluate(el => ({
                    lines: [...el.querySelectorAll('.ln')].map(line => line.textContent),
                    set: el.dataset.set,
                    drawn: [...el.querySelectorAll('.ln')].map(line => parseFloat(getComputedStyle(line).fontSize)),
                }));
                assert(actual.lines.length > 0, `${viewport} examined=0 title lines`);
                assert(actual.lines.length === 4 && actual.lines.join(' ') === 'THE COMPLETE WORKS OF ARISTOTLE', `${viewport} home lines=${JSON.stringify(actual.lines)} expected 4 lines of THE COMPLETE WORKS OF ARISTOTLE`);
                const got = actual.set?.split(',').map(Number) || [];
                assert(got.length === 4, `${viewport} home data-set=${actual.set} expected 4 sizes`);
                for (let i = 0; i < got.length; i++) {
                    assert(Number.isFinite(got[i]) && Math.abs(got[i] - size) <= 1, `${viewport} home line ${i + 1} size=${got[i]} expected=${size} ±1px (spec §3.2)`);
                    assert(Math.abs(actual.drawn[i] - size) <= 1, `${viewport} home line ${i + 1} drawn size=${actual.drawn[i]} expected=${size} ±1px (spec §3.2)`);
                    examined += 2;
                }
            } finally {
                await close(page);
            }
        }
        for (const [viewport, kind] of [['P390', 'phone']]) {
            const expected = golden[kind];
            assert(expected?.lines?.length, `${kind} golden has no lines`);
            const expectedSizes = expected.set.split(',').map(Number);
            assert(expectedSizes.length === expected.lines.length && expectedSizes.every(n => Number.isFinite(n) && n > 0), `${kind} invalid golden sizes`);
            const page = await open(viewport);
            try {
                // Break the page, never the fixture: join the first two drawn lines.
                if (prove && proofCase === 'golden-line') await page.locator('.b-po-t').evaluate(el => { const [a, b] = el.querySelectorAll('.ln'); a.textContent += ' ' + b.textContent; b.remove(); });
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
                if(prove&&(proofCase==='home'||proofCase==='default'))await style(p,'.dir-b .b-po-t{color:black!important}');
                const selector=path==='/picture-credits/'?'.b-pc-h':'.b-po-t';
                const color=await p.locator(selector).evaluate(el=>getComputedStyle(el).color);
                // D26: colour B. From 961px the home and work titles are --ink (spec §4); R-C3 checks the rest.
                assert(color===(path==='/picture-credits/'?'rgb(180, 36, 25)':RGB.ink),`${path==='/'?'home':path} title color=${color}`);n++;
            }finally{await close(p);}
        }
        if(stage>=3){
            const p=await open('D1440','light',READER);
            try{
                if(prove&&proofCase==='reader')await style(p,'.dir-b .b-rh{height:auto!important}');
                const height=await p.locator('.b-rh').evaluate(el=>getComputedStyle(el).height);
                assert(height==='60px',`reader .b-rh height=${height}`);n++;
            }finally{await close(p);}
        }
        if(stage>=4){
            const p=await open('D1440','light',SEARCH);
            try {
                if(prove&&proofCase==='search')await style(p,'.dir-b .b-sr-big{color:black!important}');
                const color=await p.locator('.b-sr-big').evaluate(el=>getComputedStyle(el).color);
                assert(color==='rgb(226, 56, 46)',`search .b-sr-big color=${color}`);n++;
            }finally{await close(p);}
        }
        if(stage>=5) {
            const p=await open('D1440','light',LEMMA);
            try {
                if(prove&&proofCase==='lemma') await style(p,'.dir-b .b-wp{font-family:serif!important}');
                const family=await p.locator('.b-wp').evaluate(el=>getComputedStyle(el).fontFamily);
                assert(/^['"]?Gentium Book Plus/.test(family),`lemma .b-wp font-family=${family}`);n++;
            } finally {await close(p);}
        }
        const remaining = ['/404.html','/attribution/','/phrases/','/support/','/desktop/','/advanced/','/EN/glossary/', ...(stage >= 5 ? ['/lemma/'] : [])];
        for (const path of remaining) {
            const p = await open('D1440', 'light', path);
            try {
                if (prove && proofCase === 'aux-css' && path === '/404.html')
                    await p.evaluate(() => { for (const sheet of document.styleSheets) sheet.disabled = true; });
                const sentinel = await p.evaluate(() => {
                    const flatten = rules => [...rules].flatMap(r => [r, ...(r.cssRules ? flatten(r.cssRules) : [])]);
                    const sheets = [...document.styleSheets].filter(sheet => {
                        try { return flatten(sheet.cssRules).some(r => r.cssText.includes('--greek-w')); } catch { return false; }
                    });
                    // Older page kinds have no B frame. A temporary frame tests
                    // a real B rule in the loaded sheet and its computed token.
                    const probe = document.createElement('div'); probe.className = 'frame dir-b'; document.body.append(probe);
                    try {
                        const matches = sheets.some(sheet => !sheet.disabled && flatten(sheet.cssRules).some(r =>
                            r.selectorText && probe.matches(r.selectorText) && r.style?.getPropertyValue('--red')));
                        return {sheets: sheets.length, matches, red: getComputedStyle(probe).getPropertyValue('--red').trim()};
                    } finally { probe.remove(); }
                });
                assert(sentinel.sheets > 0 && sentinel.matches && sentinel.red === '#e2382e', `${path} B CSS sentinel missing: ${JSON.stringify(sentinel)}`);
                n++;
            } finally { await close(p); }
        }
        return n;
    },
    'R-C2' : async () => {
        let files = walk(join(dist, '_astro'), /\.(css|js)$/);
        if (prove && proofCase === 'no-css') files = files.filter(f => !f.endsWith('.css'));
        if (prove && proofCase === 'no-js') files = files.filter(f => !f.endsWith('.js'));
        const cssCount = files.filter(f => f.endsWith('.css')).length, jsCount = files.filter(f => f.endsWith('.js')).length;
        console.log(`R-C2 built CSS files=${cssCount} JS files=${jsCount}`);
        assert(cssCount > 0 && jsCount > 0, `R-C2 missing built assets: CSS files=${cssCount} JS files=${jsCount}`);
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
        if (prove && !['no-css','no-js'].includes(proofCase)) inputs.push(['injected fixture style attribute', attributes('<p style="width:var(--gw, max-content)">fixture</p>')]);
        const bad = inputs.filter(([,text]) => /--gw\b/.test(text)).map(([file]) => file);
        assert(!bad.length, `legacy width token: ${bad.join(', ')}`);
        return inputs.length;
    },
    'R-F1': async () => {
        let n=0;
        for(const path of (stage>=3?[...publicPages,READER,...(stage>=4?[SEARCH]:[]),...(stage>=5?[LEMMA,'/lemma/']:[])]:publicPages)){
        const p = await open('D1440','light',path);
        try {
            if (prove)
                await p.evaluate(() => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Anton'; document.head.append(l); });
            const links = await p.locator('link[rel="stylesheet"]:not([media="print"])').evaluateAll(els => els.map(l => l.href).filter(h => h.includes('fonts.googleapis.com')));
            // The reader's print masthead fonts (media="print") are not screen fonts;
            // the loaded-font check below still fails them if they reach the screen.
            const requested = await p.evaluate(() => {
                const print = new Set([...document.querySelectorAll('link[rel="stylesheet"][media="print"]')].map(l => l.href));
                return performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('fonts.googleapis.com') && !print.has(n));
            });
            const urls = [...new Set([...links, ...requested])];
            const families = urls.flatMap(u => new URL(u).searchParams.getAll('family').map(f => f.split(':')[0]));
            const allowed = ['Oswald', 'Sofia Sans', 'Literata', 'Gentium Book Plus'];
            for (const family of families) assert(allowed.includes(family), `screen font ${family}`);
            assert(links.length === 1, `screen font links=${links.length}`);
            for (const family of allowed) assert(families.includes(family), `missing font ${family}`);
            await settleFonts(p);
            const fontState = await p.evaluate(() => ({status: document.fonts.status, faces: [...document.fonts].map(f => ({family: f.family.replace(/^['"]|['"]$/g, ''), status: f.status}))}));
            const loaded = fontState.faces.filter(f => f.status === 'loaded').map(f => f.family);
            console.log(`R-F1 ${path} D1440 status=${fontState.status} registered=${fontState.faces.length} loaded=${JSON.stringify([...new Set(loaded)])} failures=${JSON.stringify(p.fontFailures)}`);
            assert(loaded.length > 0, `examined=0 loaded font families; fonts=${JSON.stringify(fontState)} failures=${JSON.stringify(p.fontFailures)}`);
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
        // Round 9 (r9.css, "Dark: one red. Rules a step lighter"): the home and work pages set
        // three dark tokens of their own. Every other page keeps the base set; the reader shows it.
        const r9Dark = {'line': '#45433f', 'line2': '#302f2c', 'red-ink': '#e0574b'};
        const pages = [['/', true], ...(stage >= 2 ? [['/Cat/', true]] : []), ...(stage >= 3 ? [[READER, false]] : [])];
        for (const theme of ['light', 'dark']) for (const [path, homeOrWork] of pages) {
            const p = await open('D1440', theme, path);
            try {
                if (prove && ['bg','default'].includes(proofCase) && theme === 'light' && path === '/') await style(p, '.frame.dir-b{--bg:#ffffff!important}');
                if (prove && proofCase === 'dark-line' && theme === 'dark' && path === '/Cat/') await style(p, '.frame.dir-b{--line:#2d2c29!important}');
                if (prove && proofCase === 'reader-line' && theme === 'dark' && path === READER) await style(p, '.frame.dir-b{--line:#45433f!important}');
                const got = await p.locator('.frame.dir-b').evaluate((el, names) => names.map(k => getComputedStyle(el).getPropertyValue('--' + k).trim()), names);
                names.forEach((key, i) => {
                    const want = theme === 'dark' && homeOrWork && r9Dark[key] || tokens[theme][i];
                    assert(got[i] === want, `${theme} ${path} --${key}=${got[i]} expected ${want}`); n++;
                });
            } finally { await close(p); }
        }
        return n;
    },
    'R-P4': async () => {
        // Each theme shows its own plate file (dark plates ruled 12 Nov): light the JPEG, dark the
        // WebP with its tone baked in, which no filter, blend, mask or fade may touch. The dark
        // plate stands in the light plate's box, a page fetches only its own theme's plate, and
        // the moon button swaps the plate without a reload.
        let n = 0;
        const shown = page => page.evaluate(() => [...document.querySelectorAll('.b-po img')].filter(el => el.getClientRects().length).map(el => {
            const s = getComputedStyle(el), pic = el.closest('picture'), ps = getComputedStyle(pic);
            let opacity = 1;
            for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
            // In page coordinates: a scroll is not a layout move.
            const r = el.getBoundingClientRect(), q = pic.getBoundingClientRect(), x = scrollX, y = scrollY;
            return {src: el.currentSrc, loaded: el.complete && el.naturalWidth > 0, mask: s.maskImage, blend: s.mixBlendMode, pictureBlend: ps.mixBlendMode, filter: s.filter, pictureFilter: ps.filter, opacity, scroll: y, box: [r.left + x, r.top + y, r.width, r.height, q.left + x, q.top + y, q.width, q.height]};
        }));
        const settle = page => page.waitForFunction(() => [...document.querySelectorAll('.b-po img')].filter(el => el.getClientRects().length).every(el => el.complete), null, {timeout: 15000});
        const check = (label, got, theme, band, id) => {
            assert(got.length === 1, `${label}/${theme} examined=${got.length} plates shown, expected 1`);
            const s = got[0], src = new URL(s.src || 'about:blank').pathname, want = theme === 'dark' ? `/plates/dark/${band}/${id}.webp` : `/plates/${band}/${id}.jpg`;
            assert(src.endsWith(want), `${label}/${theme} plate src=${src}, expected ${want}`);
            assert(s.loaded, `${label}/${theme} plate failed to load`);
            assert(s.mask === 'none', `${label}/${theme} mask=${s.mask}`);
            assert(s.filter === 'none' && s.pictureFilter === 'none', `${label}/${theme} filter=${s.filter} picture filter=${s.pictureFilter}`);
            assert(s.blend === (theme === 'dark' ? 'normal' : 'multiply'), `${label}/${theme} blend=${s.blend}`);
            if (theme === 'dark') assert(s.pictureBlend === 'normal' && Math.abs(s.opacity - 1) < .001, `${label}/dark picture blend=${s.pictureBlend} opacity=${s.opacity}`);
            return s;
        };
        const sameBox = (label, a, b) => assert(a.box.every((v, i) => Math.abs(v - b.box[i]) <= 1), `${label} dark plate box=${b.box.map(f1)} differs from light box=${a.box.map(f1)} (scrollY ${a.scroll}, ${b.scroll})`);
        // Every page at D1440 and P390; the sideways phone and D1152 on the owner's shot list.
        const sample = ['/', '/EN/', '/GA/', '/Mirab/', '/APr/', '/Juv/', '/Poet/', '/MM/'];
        const runs = stage >= 2 ? [...['D1440', 'P390'].flatMap(size => ['/', ...workIds.map(id => `/${id}/`)].map(path => [path, size])), ...['D1152', 'S844'].flatMap(size => sample.map(path => [path, size]))] : [['/', 'D1440'], ['/', 'P390']];
        for (const [path, size] of runs) {
            const id = path === '/' ? 'home' : path.slice(1, -1), band = sizes[size][0] <= 960 ? 'phone' : 'desk', label = `${path} ${size}`;
            const got = {};
            for (const theme of ['light', 'dark']) {
                const p = await open(size, theme, path);
                try {
                    const proof = c => prove && proofCase === c;
                    if (proof('no-plate') && path === '/' && size === 'D1440' && theme === 'light') await p.evaluate(() => document.querySelectorAll('.b-po picture').forEach(el => el.remove()));
                    if ((proof('sepia') || proof('default')) && path === '/' && size === 'D1440' && theme === 'dark') await style(p, '.dir-b .b-po.pl img{filter:sepia(.45) brightness(.76) contrast(1.06)!important}');
                    if (proof('light-in-dark') && path === '/EN/' && size === 'D1440' && theme === 'dark') await style(p, ':root[data-theme="dark"] .dir-b .b-po picture.th-light{display:block!important}:root[data-theme="dark"] .dir-b .b-po picture.th-dark{display:none!important}');
                    if (proof('eager-light') && path === '/Juv/' && size === 'P390' && theme === 'dark') {
                        await p.evaluate(() => document.querySelector('.b-po picture.th-light img').removeAttribute('loading'));
                        await p.waitForFunction(() => document.querySelector('.b-po picture.th-light img').complete);
                    }
                    if (proof('box-moved') && path === '/Mirab/' && size === 'D1152' && theme === 'dark') await style(p, '.dir-b .b-po picture.th-dark{margin-top:12px!important}');
                    await settle(p);
                    got[theme] = check(label, await shown(p), theme, band, id);
                    const stray = p.imageRequests.filter(u => u.includes('/plates/') && (theme === 'dark') !== u.includes('/plates/dark/'));
                    assert(!stray.length, `${label}/${theme} fetched the other theme's plate: ${stray.map(u => new URL(u).pathname).join(', ')}`);
                    n++;
                } finally { await close(p); }
            }
            sameBox(label, got.light, got.dark);
        }
        // The moon button: light to dark and back, no reload.
        if (stage >= 2) for (const [path, size] of [['/', 'D1440'], ['/EN/', 'D1440'], ['/', 'P390'], ['/EN/', 'P390']]) {
            const id = path === '/' ? 'home' : path.slice(1, -1), band = sizes[size][0] <= 960 ? 'phone' : 'desk', label = `${path} ${size} toggled`;
            const p = await open(size, 'light', path);
            try {
                await p.evaluate(() => { window.__noReload = true; });
                await settle(p);
                const light = check(label, await shown(p), 'light', band, id);
                for (const theme of ['dark', 'light']) {
                    await p.locator('[data-theme-toggle]:visible').first().click();
                    await p.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
                    if (prove && proofCase === 'toggle-stale' && path === '/EN/' && size === 'P390' && theme === 'dark') await style(p, ':root[data-theme="dark"] .dir-b .b-po picture.th-light{display:flex!important}:root[data-theme="dark"] .dir-b .b-po picture.th-dark{display:none!important}');
                    await settle(p);
                    const now = check(label, await shown(p), theme, band, id);
                    sameBox(label, light, now);
                    assert(await p.evaluate(() => window.__noReload === true), `${label}/${theme} the page reloaded`);
                    n++;
                }
            } finally { await close(p); }
        }
        assert(n === (stage >= 2 ? 2 * (2 * (workIds.length + 1) + 2 * sample.length) + 8 : 4), `plate count=${n}`);
        return n;
    },
    'R-T3': async () => {
        // D26: the tall poster is gone from 961px. The old checks here (a 56px gap, a 470px
        // title, opacity .82/.86) described it. What replaces them comes from the spec:
        // the title is opaque (§4), the home bust is 189 and 161 wide at aspect .592 (§3.2), and the three drawn
        // plates fill a column cut to the ink box in plates.json (§5.3). Which column the
        // title and plate stand in is R-H5 and R-W5.
        let n = 0;
        for(const path of (stage>=2?['/','/Cat/','/EN/']:['/'])) for (const theme of ['light', 'dark']) for (const size of ['D1440', 'D1280', 'D961']) {
            const p = await open(size, theme,path);
            try {
                if (prove && proofCase === 'title-faded' && path === '/' && theme === 'light' && size === 'D1440') await style(p, '.dir-b .b-po-t{opacity:.82!important}');
                const opacity = await p.locator('.b-po-t').evaluate(el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; });
                assert(Math.abs(opacity - 1) < .001, `${size}/${theme} ${path} title opacity=${opacity} expected 1`);
                n++;
            } finally { await close(p); }
        }
        // Bust: width and height from §3.2 (189×320, 161×272) and its aspect, .592 wide to 1
        // tall, in both themes (§5.2: John saw them differ on 9 Nov). Height within 2px: the
        // build's title lines are 0.88 of their size where Figma's are whole pixels (1.5px over four lines).
        for (const theme of ['light', 'dark']) for (const [size, w, specH] of [['D1525', 189, 320], ['D1152', 161, 272]]) {
            const p = await open(size, theme, '/');
            try {
                if (prove && proofCase === 'home-plate' && size === 'D1525' && theme === 'light') await style(p, '.dir-b.pg-home .b-top > .b-po picture{top:60px!important}');
                if (prove && proofCase === 'dark-bust' && size === 'D1152' && theme === 'dark') await style(p, '.dir-b.pg-home .b-top > .b-po picture{top:30px!important}');
                const box = await p.locator('.b-top .b-po picture:visible').evaluate(el => { const r = el.getBoundingClientRect(); return {w: r.width, h: r.height}; });
                assert(Math.abs(box.w - w) <= 1 && Math.abs(box.w / box.h - .592) <= .004 && Math.abs(box.h - specH) <= 2, `${size}/${theme} / bust size=${box.w.toFixed(1)}×${box.h.toFixed(1)}, spec says ${w}×${specH} at aspect .592`);
                console.log(`R-T3 ${size}/${theme} bust ${box.w.toFixed(1)}×${box.h.toFixed(1)}; spec ${w}×${specH}`);
                n++;
            } finally { await close(p); }
        }
        // Plates at 1525: one column wide, cut to the ink box plates.json holds (§5.3). The spec's heights are printed.
        if (stage >= 2) for (const [id, specH] of [['Mete', 259], ['GC', 356], ['MA', 343]]) {
            const p = await open('D1525', 'light', `/${id}/`);
            try {
                if (prove && proofCase === 'work-plate' && id === 'GC') await style(p, '.dir-b.pg-work .b-top .b-po.work picture{width:200px!important}');
                if (prove && proofCase === 'plate-origin' && id === 'MA') await style(p, '.dir-b.pg-work .b-top .b-po.tp-side img{left:0!important}');
                const [x0, y0, x1, y1] = plates[id].ink, iw = x1 - x0, ih = y1 - y0, col = gridAt(1525).col;
                const w = Math.min(col, col * iw / ih), h = w * ih / iw;
                const box = await p.locator('.b-top .b-po picture:visible').evaluate(el => { const r = el.getBoundingClientRect(), i = el.querySelector('img').getBoundingClientRect(); return {w: r.width, h: r.height, dx: i.left - r.left, dy: i.top - r.top, iw: i.width}; });
                assert(Math.abs(box.w - w) <= 1 && Math.abs(box.h - h) <= 1, `D1525 /${id}/ plate size=${box.w.toFixed(1)}×${box.h.toFixed(1)}, plates.json ink box gives ${w.toFixed(1)}×${h.toFixed(1)}`);
                // The image sits so the ink box's corner is the frame's corner, at the frame's scale (Grok, 10 Nov: the origin was unchecked).
                const k = w / iw;
                assert(Math.abs(box.dx + x0 * k) <= 1 && Math.abs(box.dy + y0 * k) <= 1 && Math.abs(box.iw - 1280 * k) <= 1, `D1525 /${id}/ plate image offset=${box.dx.toFixed(1)},${box.dy.toFixed(1)} width=${box.iw.toFixed(1)}, ink box gives ${(-x0 * k).toFixed(1)},${(-y0 * k).toFixed(1)} width=${(1280 * k).toFixed(1)}`);
                // The spec's drawn sizes (§5.3) were cropped by hand in Figma; the build's come from a
                // measured ink box (scripts/measure-plate-ink.mjs --check ties plates.json to the images). Within 3px.
                assert(Math.abs(box.w - 363) <= 1 && Math.abs(box.h - specH) <= 3, `D1525 /${id}/ plate size=${box.w.toFixed(1)}×${box.h.toFixed(1)}, spec §5.3 draws 363×${specH}`);
                console.log(`R-T3 /${id}/ plate ${box.w.toFixed(1)}×${box.h.toFixed(1)}; spec 363×${specH}`);
                n++;
            } finally { await close(p); }
        }
        return n;
    },
    'R-T4': async () => {
        let n = 0;
        for(const path of (stage>=2?['/','/Cat/','/EN/','/Int/','/AthPol/']:['/'])) for (const size of ['P390', 'P360'])
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
                if (prove && ['desktop-poster','two-columns'].includes(proofCase)) {
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
        // Round 9 sideways (max-height 500px; S960 is now an upright phone): the plate is a
        // right-hand column, the title is set at 44px and wraps rather than shrink under 32px,
        // and Start reading, Greek only and Contents share one row; a returning reader gets a
        // full-width Continue above that row.
        if(stage>=2)for(const [id,seed] of [['EN',false],['Juv',false],['Cat',false],['Int',false],['AthPol',false],['EN',r9Seed()]]){
            const p=await open('S844','light',`/${id}/`,seed);
            const label=`${id} S844${seed?' returning':''}`;
            try{
                if(seed)await p.waitForFunction(()=>document.querySelector('[data-resume]')?.textContent.includes('chapter'));
                if(prove&&proofCase==='plate-left'&&id==='Cat')await style(p,'.dir-b.pg-work .b-top .b-po.work picture{grid-column:1!important;grid-row:auto!important}');
                if(prove&&proofCase==='buttons-stack'&&id==='EN'&&!seed)await style(p,'.dir-b.pg-work .b-ctas .b-btn{flex:0 0 100%!important}');
                if(prove&&proofCase==='juv-below'&&id==='Juv')await style(p,'.dir-b.pg-work .b-top .b-po-t{padding-top:120px!important}');
                if(prove&&proofCase==='title-shrunk'&&id==='Juv')await style(p,'.dir-b.pg-work .b-top .b-po-t{font-size:28px!important}');
                if(prove&&proofCase==='resume-short'&&seed)await style(p,'.dir-b.pg-work .b-ctas .b-btn[data-resume]{flex:0 0 auto!important}');
                const r=await p.evaluate(()=>{
                    const box=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
                    const t=document.querySelector('.b-po-t'), ctas=document.querySelector('.b-ctas');
                    const buttons=[...ctas.querySelectorAll('.b-btn')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>({text:el.textContent.trim(),...box(el)}));
                    return {buttons,ctas:box(ctas),plate:box(document.querySelector('.b-top picture')),title:box(t),size:parseFloat(getComputedStyle(t).fontSize),overflow:t.scrollWidth>t.clientWidth+1,height:innerHeight};
                });
                const want=[...(seed?['Continue at Book II, chapter 3','From the start']:['Start reading']),'Greek only','Contents'];
                assert(r.buttons.length>0,`${label} examined=0 buttons`);
                assert(JSON.stringify(r.buttons.map(b=>b.text))===JSON.stringify(want),`${label} buttons=${JSON.stringify(r.buttons.map(b=>b.text))} expected ${JSON.stringify(want)}`);
                const row=seed?r.buttons.slice(1):r.buttons;
                assert(row.every(b=>near(b.top,row[0].top,2)),`${label} buttons not in one row: tops=${row.map(b=>f1(b.top))}`);
                if(seed)assert(near(r.buttons[0].width,r.ctas.width,1)&&r.buttons[0].bottom<=row[0].top,`${label} Continue at width=${f1(r.buttons[0].width)} of ${f1(r.ctas.width)}: not full width above the row`);
                const right=Math.max(...row.map(b=>b.right));
                assert(r.plate.width>0&&r.plate.left>right,`${label} plate left=${f1(r.plate.left)} is not right of the buttons' right edge=${f1(right)}`);
                if(id==='Juv')for(const b of row)assert(b.bottom<=r.height,`${label} button bottom=${f1(b.bottom)} is below the first screen ${r.height}`);
                assert(r.size>=32,`${label} title font-size=${r.size} under 32px`);
                assert(!r.overflow,`${label} title overflows its column`);
                if(id==='Juv')assert(r.title.height>=1.9*r.size,`${label} title drawn on one line (height=${f1(r.title.height)} at ${r.size}px)`);
                const g=await geometry(p);assert(g.phone,`${label} desktop plate loaded`);
                assert(r.plate.height>=120,`${label} plate height=${f1(r.plate.height)} below 120`);
                n++;
            }finally{await close(p);}
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
            // Round 9's sentence (John's wording); a no-break space keeps "it." off a line of its own.
            const expected = `Read and search every work of Aristotle in Greek and English. ${size === 'P390' ? 'Tap' : 'Click'} any Greek word to parse and define\u00a0it.`;
            { const lead = await p.locator(".b-lead").textContent(); assert(lead === expected, `${size} home line mismatch: "${lead}"`); }
            assert(!(await p.locator('.b-resume-work').isVisible()), `${size} resume with empty storage`);
            // Round 9 keeps the card's empty template in the page, hidden.
            const resumeNodes = await p.evaluate(() => {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node; let count = 0;
                while (node = walker.nextNode()) if (!node.parentElement.closest('script,style,[hidden]') && node.textContent.includes('Continue reading')) count++;
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
        // Round 9: the saved place is a card (title, location, button); 1095b30 is Book I, chapter 5.
        const p = await open('D1440', 'light', '/', true);
        try {
            await resumeReady(p);
            assert(await p.locator('.b-resume-work').isVisible(), 'seeded resume absent');
            const card = await p.locator('.b-resume-work').evaluate(el => ({title: el.querySelector('.b-resume-title').innerText, location: el.querySelector('.b-resume-location').innerText, button: el.querySelector('.b-btn').innerText, href: el.querySelector('.b-btn').getAttribute('href')}));
            assert(card.title === 'Nicomachean Ethics' && card.location === 'Book I, chapter 5 · 1095b30' && card.button === 'Continue reading', `resume card ${JSON.stringify(card)}`);
            assert((await p.request.get(BASE + card.href)).status() === 200, `resume link ${card.href}`);
        } finally { await close(p); }
        return n + 1;
    },
    'R-H2': async () => {
        const p = await open();
        if (prove)
            await p.evaluate(() => document.querySelector('[data-division="V"] .b-works').append(document.querySelector('[data-work="AthPol"]').parentElement));
        const heads = await p.locator('.b-dh').allTextContents();
        // D26: spec §3.3. The "Dubious and spurious works" division is gone; its works stand in the main divisions.
        assert(JSON.stringify(heads) === JSON.stringify(['Logic', 'Natural philosophy', 'Metaphysics', 'Ethics and politics', 'Rhetoric and poetics']), `division heads ${heads}`);
        for (const [div, wanted] of [['IV', ['EN', 'MM', 'EE', 'VV', 'Pol', 'Oec', 'AthPol']], ['V', ['Rhet', 'RhetAl', 'Poet']]]) {
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
        if (stage < 3) console.log('R-A1 footnotes: not applicable to home');
        let n = 0, marks = 0, exempt = 0;
        for(const path of accessPages) for (const size of ['D1440', 'S844', 'P390']) {
            const p = await open(size,'light',path);
            try {
                if (prove && !['fn-hit','chapter-fn','late-fn','reading-button','search-target','search-link-no-after','search-link-no-pointer'].includes(proofCase))
                    await style(p, '.dir-b [data-theme-toggle]{width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important}');
                if (prove && proofCase === 'fn-hit' && path === READER) await style(p, '.dir-b .fn-marker::after{content:none!important}');
                if(prove&&proofCase==='search-target'&&path===SEARCH)await style(p,'.dir-b [data-search-language=Greek]{min-width:34px!important;min-height:34px!important;width:34px!important;height:34px!important;padding:0!important}');
                if (prove && path === READER) {
                    if (proofCase === 'reading-button') await p.locator('.b-ec').first().evaluate(el => el.insertAdjacentHTML('afterbegin','<button style="width:20px;height:20px;min-width:0;min-height:0;padding:0">Gate reading button</button>'));
                    if (['chapter-fn','late-fn'].includes(proofCase)) {
                        if (proofCase === 'chapter-fn') await p.evaluate(() => {
                            let title = document.querySelector('.b-cht');
                            if (!title) { title = document.createElement('p'); title.className = 'b-cht'; document.querySelector('.b-text').append(title); }
                            const mark = document.querySelector('.b-ec .fn-marker').cloneNode(true);
                            mark.removeAttribute('id'); title.append(mark);
                        });
                        const target = proofCase === 'chapter-fn' ? p.locator('.b-cht .fn-marker').last() : p.locator('.b-ec .fn-marker').last();
                        assert(await target.count() > 0, `R-A1 ${proofCase} proof has no target`);
                        await target.evaluate(el => el.classList.add('gate-miss'));
                        await style(p, '.gate-miss.fn-marker::after{content:none!important}');
                    }
                }
                let linkMutated = false;
                for await (const state of accessStates(p, size)) {
                    if (prove && path === SEARCH && proofCase.startsWith('search-link-no-') && !linkMutated) {
                        const baseline = await p.locator(state.root).locator(controls).and(p.locator(':not(.grammata-mount *)')).evaluateAll(readControlBoxes);
                        const small = baseline.filter(c => c.w < 39.99 || c.h < 39.99);
                        assert(!small.length, `R-A1 search link proof baseline has undersized controls: ${JSON.stringify(small)}`);
                        const links = p.locator('.b-sr-l a').filter({hasText: 'Lexicon'});
                        assert(await links.count() > 0, 'R-A1 search link proof has no Lexicon link');
                        await links.first().evaluate(el => el.classList.add('gate-search-link'));
                        await style(p, proofCase === 'search-link-no-after'
                            ? '.gate-search-link::after{content:none!important}'
                            : '.gate-search-link::after{pointer-events:none!important}');
                        linkMutated = true;
                    }
                    // Exempt tokens and running-text links; footnote marks get
                    // their own hit test below, including chapter-title marks.
                    // LemmaPage.astro's grammata script contract forbids styling
                    // inside the mount; its controls belong to the widget.
                    exempt += await p.locator(state.root).locator(controls).evaluateAll(els =>
                        els.filter(el => el.closest('.grammata-mount')).length);
                    const got = await p.locator(state.root).locator(controls)
                        .and(p.locator(':not(.grammata-mount *)')).evaluateAll(readControlBoxes);
                    assert(got.length > 0, `${size} ${state.name} examined=0 controls`);
                    for (const control of got) {
                        assert(control.w >= 39.99 && control.h >= 39.99, `${size} ${control.tag} ${control.text} ${control.w}×${control.h} state=${state.name}`);
                        n++;
                    }
                }
                if (path === READER) {
                    // Each footnote mark answers 18px left, right, above and below its centre.
                    const ids = await p.locator('.b-gc .fn-marker,.b-ec .fn-marker,.b-cht .fn-marker').evaluateAll(readFootnoteTargets);
                    assert(ids.length > 0, `${path} ${size} examined=0 footnote marks`);
                    for (const i of ids) {
                        const miss = await p.evaluate(i => {
                            const el = document.querySelector(`[data-gate="${i}"]`);
                            el.scrollIntoView({block: 'center'});
                            const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
                            // Name what answers instead, so a miss says what covers the mark.
                            const name = h => h ? h.tagName.toLowerCase() + [...h.classList].map(c => '.' + c).join('') : 'nothing';
                            return [[-18, 0], [18, 0], [0, -18], [0, 18]].map(([dx, dy]) => [dx, dy, document.elementFromPoint(x + dx, y + dy)])
                                .filter(([, , h]) => h?.closest('.fn-marker') !== el)
                                .map(([dx, dy, h]) => `${dx},${dy} (${name(h)}${h?.parentElement ? ' in ' + name(h.parentElement) : ''})`)
                                .concat(`centre=${Math.round(x)},${Math.round(y)}`);
                        }, i);
                        assert(miss.length === 1, `${path} ${size} footnote mark ${i} misses its 40px hit area at ${miss.join(' ')}`);
                        marks++;
                    }
                }
            } finally { await close(p); }
        }
        console.log(`R-A1 exempt in .grammata-mount=${exempt}`);
        if (stage >= 3) console.log(`R-A1 footnote marks examined=${marks}`);
        return n + marks;
    },
    'R-A2': async () => {
        let n = 0;
        for(const path of accessPages) for (const size of ['D1440', 'S844', 'P390']) {
            const p = await open(size,'light',path);
            try {
                if (prove && (proofCase === 'search' || proofCase === 'default'))
                    await style(p, '.dir-b .b-search input:focus-visible{outline:none!important;box-shadow:none!important}');
                if(prove&&proofCase==='search-query'&&path===SEARCH)await style(p,'.dir-b .b-sq-f input:focus-visible{outline:none!important;box-shadow:none!important}');
                if (prove && proofCase === 'panel-ring' && path === READER) await style(p, '.dir-b .b-side:focus-visible{outline:none!important}');
                if (prove && proofCase === 'help-ring' && path === READER) await style(p, '.dir-b .help-modal:focus-visible{outline:none!important}');
                if (prove && proofCase === 'reader-token' && path === READER) await style(p, '.dir-b .tok:focus-visible{outline:none!important}');
                for await (const state of accessStates(p, size)) {
                    // Start each walk at its root, including the modal's native focus trap.
                    await p.locator(state.root).evaluate(el => {
                        const old = el.getAttribute('tabindex');
                        el.tabIndex = -1; el.focus();
                        if (old === null) el.removeAttribute('tabindex'); else el.setAttribute('tabindex', old);
                    });
                    const count = await p.locator(state.root).locator(controls).evaluateAll(els => els.filter(el => !el.matches('.tok')).length + 1);
                    const seen = new Set();
                    for (let i = 0; i < count + 5; i++) {
                        await p.keyboard.press('Tab');
                        const got = await p.evaluate(({controls, root}) => {
                            const el = document.activeElement;
                            if (!el || el === document.body) return null;
                            const css = getComputedStyle(el);
                            return {key: [...document.querySelectorAll(controls)].indexOf(el), html: el.outerHTML.slice(0,200), inside: document.querySelector(root).contains(el), outline: css.outlineStyle, width: parseFloat(css.outlineWidth), shadow: css.boxShadow};
                        }, {controls, root: state.root});
                        if (!got) { if (seen.size) break; continue; }
                        if (!got.inside && state.modal === false && seen.size) break;
                        assert(got.inside, `${size} ${state.name} focus left its root: ${got.html}`);
                        if (seen.has(got.key)) break;
                        seen.add(got.key);
                        assert((got.outline !== 'none' && got.width >= 2) || got.shadow !== 'none', `${size} ${state.name} focus missing ${got.html}`);
                        n++;
                    }
                    assert(seen.size > 0, `${size} ${state.name} examined=0 focused controls`);
                }
                if (path === READER) {
                    // The word panel and Help take focus when opened; opened
                    // by keyboard, each shows that it has it.
                    const ring = (sel) => p.evaluate(sel => {
                        const el = document.activeElement;
                        if (!el?.matches(sel)) return `focus on ${el?.outerHTML.slice(0, 80)}`;
                        const css = getComputedStyle(el);
                        return (css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) >= 2) || css.boxShadow !== 'none' ? '' : 'no focus ring';
                    }, sel);
                    await p.locator('.b-gc .tok[tabindex="0"]').focus();
                    await p.keyboard.press('Enter');
                    await p.locator('.b-side').waitFor({timeout: 3000});
                    await p.waitForFunction(() => document.activeElement?.matches('.b-side'), null, {timeout: 3000}).catch(() => {});
                    const panel = await ring('.b-side');
                    assert(!panel, `${size} word panel opened by keyboard: ${panel}`);
                    await p.keyboard.press('Escape');
                    await p.locator('[data-toc-toggle]').focus();
                    await p.keyboard.press('Enter');
                    await p.locator('[data-reader-help]').focus();
                    await p.keyboard.press('Enter');
                    await p.locator('.help-modal').waitFor({timeout: 3000});
                    const help = await ring('.help-modal');
                    assert(!help, `${size} Help opened by keyboard: ${help}`);
                    await p.keyboard.press('Escape');
                    n += 2;
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
                if (prove && !['reader-ln','search-small-red'].includes(proofCase)) await style(p, '.dir-b .b-sub.sub-label{color:var(--red)!important}');
                if(prove&&proofCase==='search-small-red'&&path===SEARCH)await style(p,'.dir-b .b-sq-o .b-options-toggle{color:var(--red)!important}');
                if (prove && proofCase === 'reader-ln' && path === READER) await style(p, '.dir-b .b-ln{color:#c8c8c8!important}');
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
                        if (g.ratio+.001 < g.min) failures.push(`${path} ${theme} ${g.element} "${g.text}" ratio=${g.ratio.toFixed(3)} expected>=${g.min} color=${g.color} opacity=${g.opacity} viewport=${size} state=${state.name}`);
                    }
                }
            } finally { await close(p); }
        }
        assert(!failures.length, `examined=${n}; ${failures.join('; ')}`);
        return n;
    },
    'R-E1': async () => {
        const files = walk(dist, /\.html$/);
        if(stage>=2){
            const window=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});
            try{for(const path of [...workIds.map(id=>`/${id}/`),'/picture-credits/']){
                window.document.body.innerHTML=readFileSync(join(dist,path.slice(1),'index.html'),'utf8');
                if(prove&&proofCase==='no-headings'&&path==='/Cat/')for(const h of window.document.querySelectorAll('h2'))h.remove();
                if(prove&&proofCase==='empty-heading'&&path==='/Cat/')window.document.querySelector('[data-section] > h2').nextElementSibling.replaceChildren();
                const headings=[...window.document.querySelectorAll('[data-section] > h2,.b-pc h2')];
                assert(headings.length>0,`${path} examined=0 section headings`);
                const empty=headings.filter(h=>!h.nextElementSibling?.textContent.trim()).map(h=>h.textContent);
                assert(!empty.length,`${path} empty headings: ${empty.join(', ')}`);
            }}finally{window.close();}
        }
        const forbidden = ['In this mockup', 'No analysis', 'will appear here', 'keeps its own Bekker', 'Tap any Greek word', 'Click any Greek word'];
        let readerExamined = 0;
        if(stage>=3){
            // The reader as drawn, its panels open in turn (R-E1 in the reader).
            for(const size of ['D1440','P390']){
                const p=await open(size,'light',READER);
                try{
                    for await(const state of readerStates(p,size)){
                        if(prove&&proofCase==='reader-copy'&&state.name==='panel-open')await p.locator('.b-side-b').evaluate(el=>el.insertAdjacentHTML('afterbegin','<p>No analysis for this form.</p>'));
                        const text=await p.locator(state.root).innerText();
                        const hit=forbidden.filter(f=>text.includes(f));
                        assert(!hit.length,`${READER} ${size} ${state.name} explainer text: ${hit.join(', ')}`);
                        readerExamined++;
                    }
                }finally{await close(p);}
            }
            // 20 sampled reader pages: no heading stands over an empty section.
            const readers=files.filter(f=>/\/book\/\d+\/index\.html$/.test(f)).sort();
            const sample=readers.filter((_,i)=>i%Math.max(1,Math.floor(readers.length/20))===0).slice(0,20);
            assert(sample.length===20,`examined=${sample.length} sampled reader pages`);
            for(const f of sample){
                const window=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});
                try {
                    // Keep the full rendered body; island props duplicate the book
                    // as JSON and are not content or headings.
                    window.document.body.innerHTML=readFileSync(f,'utf8').replace(/<astro-island\b[^>]*>/g, '<astro-island>');
                    if (prove && proofCase === 'reader-tail-heading' && f === sample[0])
                        window.document.querySelector('.b-text').insertAdjacentHTML('beforeend','<h2>Gate tail heading</h2>');
                    if (prove && proofCase === 'reader-empty-chapter' && f === sample[0])
                        window.document.querySelector('.b-chh').insertAdjacentHTML('beforeend','<h3>Gate empty chapter</h3>');
                    const heads=[...window.document.querySelectorAll('.b-text h1,.b-text h2,.b-text h3,.b-text h4,.b-text h5,.b-text h6,.b-text .b-cht,.b-text section > header,.b-text .b-chh,.b-toc h2')];
                    assert(heads.length>0,`${f} examined=0 reader headings`);
                    const empty=heads.filter(h=>!h.nextElementSibling?.textContent.trim()).map(h=>h.textContent);
                    assert(!empty.length,`${f} empty headings: ${empty.join(', ')}`);
                    readerExamined++;
                } finally { await window.happyDOM.close(); }
            }
            console.log(`R-E1 reader states and sampled pages examined=${readerExamined}`);
        }
        if(stage>=4) for(const size of ['D1440','S844','P390']) {
            const p=await open(size,'light',SEARCH);
            try {
                for await(const state of accessStates(p,size)) {
                    if(prove&&proofCase==='search-copy'&&state.name==='closed')await p.locator('.b-sq').evaluate(el=>el.insertAdjacentHTML('beforeend','<p>In this mockup</p>'));
                    const text=await p.locator(state.root).innerText();
                    const hit=forbidden.filter(f=>text.includes(f));
                    assert(!hit.length,`${SEARCH} ${size} ${state.name} explainer text: ${hit.join(', ')}`);
                    const empty=await p.locator(state.root).locator('.b-sg h2,.b-sch h3').evaluateAll(heads=>heads.filter(h=>!h.textContent.trim()||(!h.querySelector('[aria-expanded="false"]')&&!h.nextElementSibling?.textContent.trim())).map(h=>h.textContent));
                    assert(!empty.length,`${SEARCH} ${size} empty headings: ${empty.join(', ')}`);
                    readerExamined++;
                }
            }finally{await close(p);}
        }
        let bad = [];
        const inputs = prove && (stage===1||proofCase==='copy') ? forbidden.map(s => ['HTML fixture ' + s, `<p>${s}</p>`]) : files.map(f => [f, null]);
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
        if (stage >= 5) {
            const lemmaFiles = files.filter(f=>f.includes('/dist/lemma/'));
            assert(lemmaFiles.length>0,'examined=0 lemma pages');
            console.log(`R-E1 lemma pages examined=${lemmaFiles.length} violations=${bad.filter(f=>f.includes('/dist/lemma/')).length}`);
        }
        if (stage >= 3 && stage < 5) console.log(`R-E1 violations outside /lemma/=${bad.filter(f => !f.includes('/dist/lemma/')).length} of ${bad.length}`);
        assert(!bad.length, `examined=${prove && (stage===1||proofCase==='copy') ? inputs.length : files.length} violations=${bad.length}; ` + bad.slice(0, 12).join('; '));
        for(const path of publicPages){
        const p = await open('D1440','light',path);
        const empty = await p.locator('.b-div h2,.b-div h3,[data-section] > h2,.b-pc h2').evaluateAll(els => els.filter(el => !el.nextElementSibling?.textContent.trim()).map(el => el.textContent));
        await close(p);
        assert(!empty.length, `${path} empty headings ${empty}`);
        }return files.length;
    },
    'R-E2': async () => {
        let n = 0;
        const fails = [];
        for (const size of (stage>=4 ? ['D1440','S844','P390'] : ['D1440', 'P390']))
            for (const path of (stage>=2?['/','/Cat/','/EN/book/1','/picture-credits/',...(stage>=4?[SEARCH]:[]),...(stage>=5?[LEMMA,'/lemma/']:[])]:['/','/Cat/','/EN/book/1'])) {
                const p = await open(size, 'light', path, false, true);
                if (prove && (proofCase!=='search-toast'||path===SEARCH))
                    // A real first-visit toast sits in view (fixed), as the old .reader-tip did.
                    await p.evaluate(() => { const el = document.createElement('div'); el.className = 'reader-tip'; el.role = 'status'; el.textContent = 'First visit tip'; el.style.cssText = 'position:fixed;left:16px;bottom:16px;padding:12px;background:#fff'; document.body.append(el); });
                await p.waitForTimeout(3000);
                const bad = await p.evaluate(() => {
                    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden'; };
                    const alerts = [...document.querySelectorAll('[role="status"],[role="alert"],[role="dialog"],[aria-live],.reader-tip')].filter(el => visible(el) && getComputedStyle(el).clip !== 'rect(0px, 0px, 0px, 0px)' && el.textContent.trim());
                    // These are the existing reader header, its contents bar and the site's nav.
                    const allow = ['.page-header', '.simple-header', '.reader-controls', '.b-nav', '.b-rh', '.pg-search .b-sr-w']; // Search's required sticky work index is page content.
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
if(stage>=2) Object.assign(gates, {
 'R-W1': async()=>{
  let n=0;
  for(const id of workIds){
   const p=await open('D1440','light',`/${id}/`);
   try{
    if(prove&&proofCase==='crumb'&&id==='AthPol')await p.locator('.b-crumb span').evaluate(el=>el.textContent='Rhetoric and poetics');
    if(prove&&proofCase==='crumb-height'&&id==='Cat')await style(p,'.dir-b .b-crumb a{display:inline-flex!important;min-height:40px!important}');
    const crumbHeight=await p.locator('.b-crumb').evaluate(el=>el.offsetHeight);
    assert(crumbHeight<=16,`${id} D1440 crumb height=${crumbHeight}`);
    const work=registry.getWork(id);
    const crumb=(await p.locator('.b-crumb').textContent()).replace(/\s+/g,' ').trim();
    const literalCrumbs={AthPol:'Works / Ethics and politics',MM:'Works / Ethics and politics',Cat:'Works / Logic',Isa:'Works / Commentary'};
    assert(crumb===(literalCrumbs[id]||`Works / ${divisionName(id)}`),`${id} crumb=${crumb}`);
    // Round 9: "Greek text", then "Open Greek and English with" over one 40px row per translation (round 9 drew 36; John, 12 Nov: 40, the target floor)
    // (works.ts order, the default first). Only the translator's short name is underlined; "opens
    // first" tags the default row when there are two or more; the tools row follows.
    if(prove&&proofCase==='no-english'&&id==='Cat')await p.locator('.b-edition-row').evaluateAll(els=>els.forEach(el=>el.remove()));
    if(prove&&proofCase==='row-height'&&id==='EN')await style(p,'.dir-b.pg-work .b-edition-row{min-height:36px!important}');
    if(prove&&proofCase==='imprint-underlined'&&id==='Cat')await style(p,'.dir-b.pg-work .b-edition-row > span{text-decoration:underline!important}');
    if(prove&&proofCase==='opens-first-single'&&id==='Mete')await p.locator('.b-edition-row').first().evaluate(el=>el.insertAdjacentHTML('beforeend','<small class="b-opens-first">opens first</small>'));
    if(prove&&proofCase==='missing-glossary')await p.locator('.b-edition-tools a').filter({hasText:/^Glossary$/}).evaluateAll(links=>links.forEach(link=>link.remove()));
    const editions=registry.visibleTranslations(work), first=editions.find(t=>t.id===work.defaultTranslation)||editions.find(t=>t.slot==='english')||editions[0];
    const ordered=[first,...editions.filter(t=>t!==first)].filter(Boolean);
    const facts=await p.locator('[data-section="facts"]').evaluate(el=>{
     const underlined=e=>{for(let a=e;a&&a!==el;a=a.parentElement)if(getComputedStyle(a).textDecorationLine.includes('underline'))return true;return false;};
     const texts=e=>{const out=[];const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let t;while(t=w.nextNode())if(t.textContent.trim())out.push({text:t.textContent.trim(),underlined:underlined(t.parentElement),tag:t.parentElement.className});return out;};
     return {labels:[...el.querySelectorAll('dt')].map(d=>d.textContent),rows:[...el.querySelectorAll('.b-edition-row')].map(a=>({href:a.getAttribute('href'),height:a.getBoundingClientRect().height,texts:texts(a)})),tools:[...el.querySelectorAll('.b-edition-tools a')].filter(a=>a.getClientRects().length).map(a=>({text:a.textContent,href:a.getAttribute('href')}))};
    });
    assert(JSON.stringify(facts.labels)==='["Greek text","Open Greek and English with"]',`${id} facts labels=${JSON.stringify(facts.labels)}`);
    assert(facts.rows.length>0,`${id} examined=0 English facts`);
    assert(facts.rows.length===ordered.length,`${id} edition rows=${facts.rows.length}, works.ts has ${ordered.length}`);
    facts.rows.forEach((row,i)=>{
     const t=ordered[i], url=new URL(row.href,BASE);
     assert(url.pathname===`/${id}/book/1`&&url.searchParams.get('trans')===t.id,`${id} edition row ${i+1} href=${row.href}, expected ${t.id}`);
     assert(near(row.height,40,1),`${id} edition row ${t.short} height=${f1(row.height)}, expected 40±1`);
     const marked=row.texts.filter(x=>x.underlined).map(x=>x.text);
     assert(JSON.stringify(marked)===JSON.stringify([t.short]),`${id} edition row ${t.short} underlines ${JSON.stringify(marked)}, expected only the translator`);
     const tag=row.texts.filter(x=>x.text==='opens first');
     const wantTag=editions.length>1&&t===first;
     assert(tag.length===(wantTag?1:0),`${id} edition row ${t.short} "opens first"=${tag.length}, expected ${wantTag?1:0}`);
    });
    const wantTools=[...(editions.length>=2?[['Compare translations',`/${id}/book/1?trans=compare`]]:[]),...(id==='EN'?[['Glossary','/EN/glossary']]:[])];
    assert(JSON.stringify(facts.tools.map(x=>[x.text,new URL(x.href,BASE).pathname+new URL(x.href,BASE).search]))===JSON.stringify(wantTools),`${id} tools row=${JSON.stringify(facts.tools)}, expected ${JSON.stringify(wantTools)}`);
    const sections=[['print',registry.furtherReading(id).length>0],['resources',registry.resourcesFor(id).length>0],['commentary',id==='Cat']];
    for(const [section,wanted]of sections)assert(await p.locator(`[data-section="${section}"]`).count()===(wanted?1:0),`${id} ${section} presence mismatch`);
    // D26: source order is the order of the columns (spec §3.4): title, Greek title, buttons, then blurb and details.
    // Round 9 dropped the Sources section (the footer's "Texts & licences" link stays).
    const selectors=['.b-nav','.b-crumb','.b-po',...(work.greekTitle?['.b-wk-gt']:[]),'.b-ctas','.b-wk-blurb','[data-section="facts"]','[data-section="books"]',...sections.filter(([,yes])=>yes).map(([section])=>`[data-section="${section}"]`),'.b-foot'];
    const order=await p.evaluate(selectors=>{
     const els=selectors.map(selector=>document.querySelector(selector));
     return els.every((el,i)=>el&&(!i||Boolean(els[i-1].compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)));
    },selectors);
    assert(order,`${id} sections out of order`);
    assert(await p.locator('.b-po-t').getAttribute('data-title')===work.title,`${id} title mismatch`);
    assert((await p.locator('.b-wk-blurb').textContent()).startsWith(work.blurb),`${id} blurb mismatch`);
    assert(await p.locator('.support-card').count()===0,`${id} old support card remains`);
    if(id==='Cat')assert(await p.locator('[data-section="commentary"] a').getAttribute('href')==='/Isa','Cat commentary must link to Isa');
    for(const resource of registry.resourcesFor(id)){
     const section=p.locator('[data-section="resources"]');
     const text=await section.textContent();
     const links=await section.locator('a').evaluateAll(els=>els.map(a=>a.href));
     assert(links.includes(resource.url)&&links.includes(resource.authorUrl)&&text.includes(resource.label)&&text.includes(resource.blurb)&&text.includes(resource.authorName),`${id} live resource content/link was lost`);
     if(resource.exercises)assert(text.includes(resource.exercises),`${id} resource exercises were lost`);
    }
    // Round 9 sets the heading in .b-contents-head with its note and buttons.
    const heading=await p.locator('[data-section="books"] .b-contents-head > h2').textContent();
    assert(heading===(work.books>1?'Books and chapters':'Chapters'),`${id} books heading=${heading}`);
    const titlePath=join(app,'public/data',id,'third-titles.json');
    const source=existsSync(titlePath)?JSON.parse(readFileSync(titlePath,'utf8')):{};
    const primary=registry.visibleTranslations(work).find(t=>t.id===work.defaultTranslation)||registry.visibleTranslations(work).find(t=>t.slot==='english')||registry.visibleTranslations(work)[0];
    const named=primary?.id==='ostwald'&&Object.values(source.ostwald||{}).some(chapters=>Object.keys(chapters).length);
    assert(await p.locator('.b-note3').count()===(named?1:0),`${id} chapter-title source note mismatch`);
    n++;
   }finally{await close(p);}
   const phone=await open('P390','light',`/${id}/`);
   try{if(prove&&proofCase==='crumb-height-phone'&&id==='Cat')await style(phone,'.dir-b .b-crumb a{display:inline-flex!important;min-height:40px!important}');const height=await phone.locator('.b-crumb').evaluate(el=>el.offsetHeight);assert(height<=16,`${id} P390 crumb height=${height}`);
    // Round 9 phone order: title, Greek title, plate, buttons, then the summary and the editions.
    if(prove&&proofCase==='phone-order'&&id==='Cat')await style(phone,'.dir-b.pg-work .b-ctas{order:-1!important}');
    const phoneSel=['.b-crumb','.b-po-t',...(registry.getWork(id).greekTitle?['.b-wk-gt']:[]),'.b-top picture','.b-ctas','.b-wk-blurb','[data-section="facts"]'];
    const tops=await phone.evaluate(sel=>sel.map(s=>document.querySelector(s)?.getBoundingClientRect().top),phoneSel);
    assert(tops.every(Number.isFinite)&&tops.every((t,i)=>!i||t>=tops[i-1]),`${id} P390 visual order ${phoneSel.join(' < ')}: tops=${tops.map(t=>Math.round(t))}`);n++;}finally{await close(phone);}
  }return n;
 },
 'R-W1-bekker':async()=>{
  const window=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});let n=0;
  const index=ref=>{const m=/^(\d+)([ab])(\d+)$/.exec(ref);return Number(m[1])*100000+(m[2]==='b'?10000:0)+Number(m[3]);};
  try{for(const id of workIds.filter(id=>(registry.getWork(id).citation?.scheme||'bekker')==='bekker')){
   window.document.body.innerHTML=readFileSync(join(dist,id,'index.html'),'utf8');
   if(prove&&id==='Meta')window.document.querySelector('.b-bks2').textContent=proofCase==='backwards'?'993a29–980a21':'980a21–29';
   for(const el of window.document.querySelectorAll('.b-bks2')){
    const text=el.textContent.trim();assert(/^\d+[ab]\d+–\d+[ab]\d+$/.test(text),`${id} invalid book-header Bekker range: ${text}`);
    const [start,end]=text.split('–');assert(index(end)>=index(start),`${id} backwards book-header Bekker range: ${text}`);n++;
   }
  }}finally{window.close();}return n;
 },
 'R-W1-scheme':async()=>{
  const window=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});let n=0;
  try{for(const id of ['Isa','AthPol']){
   window.document.body.innerHTML=readFileSync(join(dist,id,'index.html'),'utf8');
   if(prove&&id==='Isa')window.document.querySelector('.b-cb').textContent='1a3–16';
   const refs=[...window.document.querySelectorAll('.b-cb,.b-bks2')];assert(refs.length>0,`${id} examined=0 scheme references`);
   for(const el of refs){assert(!/\d+a\d+/.test(el.textContent),`${id} synthetic range in non-Bekker work: ${el.textContent}`);n++;}
  }}finally{window.close();}return n;
 },
 'R-W1-text':async()=>{
  const window=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});
  let n=0;
  try{for(const id of workIds){
   window.document.body.innerHTML=readFileSync(join(dist,id,'index.html'),'utf8');
   for(const el of window.document.querySelectorAll('script,style,[hidden]'))el.remove();
   if(prove&&id==='Cat')window.document.querySelector('.b-ct').append('[^fixture]');
   assert(!window.document.body.textContent.includes('[^'),`${id} raw footnote marker in work text`);n++;
  }}finally{window.close();}return n;
 },
 'R-W2':async()=>{
  let n=0;
  for(const id of workIds){
   const p=await open('D1440','light',`/${id}/`);
   try{
    if(prove&&proofCase==='default'&&id==='Cat')await p.locator('[data-start]').evaluate(el=>el.href='/EN/book/1');
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
    if(prove&&proofCase==='resume-label'&&id==='Cat')await link.evaluate(el=>el.textContent='Resume at chapter 1');
    // Round 9: "Continue at …" takes the main button's place; Start reading becomes "From the start".
    const expected=`Continue at ${work.books>1?`Book ${work.bookLabels[0]}, `:''}chapter ${chapter.chapter}`;
    assert(await link.textContent()===expected,`${id} resume label=${await link.textContent()}`);
    assert(await saved.locator('[data-start]').textContent()==='From the start',`${id} saved place: start button=${await saved.locator('[data-start]').textContent()}`);
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
    if(prove&&proofCase==='chapter-target'&&id==='Cat')await p.locator('.b-chs a').first().evaluate(el=>el.hash='#ch-1-999');
    if(prove&&proofCase==='numeral-red'&&id==='Phys')await style(p,'.dir-b .b-bkn{color:var(--red)!important}');
    const work=registry.getWork(id), chapters=chaptersOf(id);
    assert(await p.locator('.b-bk[open]').count()===0,`${id} books open initially`);
    assert(await p.locator('.b-bk').count()===(work.books>1?work.books:0),`${id} book count mismatch`);
    if(work.books>1){
     const labels=await p.locator('.b-bkn').allTextContents();
     assert(JSON.stringify(labels)===JSON.stringify(work.bookLabels.map(label=>'Book '+label)),`${id} Book labels=${labels}`);
     // Round 9: the book numerals are --ink (b.css "Desktop home and work pages, round 9"), and
     // there is no "Close all" button any more; a reader closes a book by its own row.
     const ink=await p.locator('.b-bkn').evaluateAll((els,want)=>els.every(el=>getComputedStyle(el).color===want),RGB.ink);
     assert(ink,`${id} book numbers are not --ink`);
     await p.locator('[data-books-open]').click();assert(await p.locator('.b-bk[open]').count()===work.books,`${id} Open all books failed`);
     await p.locator('.b-bk summary').first().click();assert(await p.locator('.b-bk[open]').count()===work.books-1,`${id} a book row did not close`);
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
   if(prove&&proofCase==='record')await p.locator('[data-plate="EN"] [data-record]').evaluate(el=>el.href='#');
   if(prove&&proofCase==='punctuation')await p.locator('[data-plate="home"] > span').evaluate(el=>el.append('..'));
   if(prove&&proofCase==='licence')await p.locator('[data-plate="home"] [data-licence]').evaluate(el=>{el.previousSibling.textContent=' ';el.nextSibling.textContent='. ';});
   if(prove&&proofCase==='licence-stop')await p.locator('[data-plate="home"] > span').evaluate(el=>el.append('bad. (lic).'));
   const ids=['home',...registry.CATEGORIES.flatMap(c=>[...(c.works||[]).map(w=>w.id),...(c.subcategories||[]).flatMap(g=>g.works.map(w=>w.id)),...(c.numeral==='I'?['Isa']:[])])];
   const got=await p.locator('[data-plate]').evaluateAll(els=>els.map(el=>el.dataset.plate));
   assert(got.length===48&&JSON.stringify(got)===JSON.stringify(ids),`credits row order/count ${got.length}`);
   let credits=0;
   for(const id of ids){
    const row=p.locator(`[data-plate="${id}"]`), data=plates[id];
    const text=await row.textContent();
    // Cat's quoted catalogue text contains ‘33 Ill. (Kupferst.)’; keep that source wording.
    const punctuationText=text.replace(data.how, '');
    assert(!punctuationText.includes('. ('),`${id} credits stop before licence`);
    // Preserve ellipses copied from the manifest, including verbatim holder credits.
    assert(!text.replaceAll('...', '…').includes('..'),`${id} credits doubled full stop`);
    assert(text.includes(`(${data.lic})`),`${id} credits licence must be in parentheses`);
    if(id==='Isa')assert(await row.locator(':scope > a').textContent()==='Porphyry, Isagoge','Isa credits title mismatch');
    const expectedRecords=Array.isArray(data.url)?data.url:[{part:'Record',href:data.url}];
    const records=await row.locator('[data-record]').evaluateAll(els=>els.map(el=>({part:el.textContent,href:el.getAttribute('href')})));
    assert(JSON.stringify(records)===JSON.stringify(expectedRecords),`${id} Records=${JSON.stringify(records)} expected=${JSON.stringify(expectedRecords)}`);
    for(const field of ['who','what','when','how','where'])assert(await row.locator(`[data-credit-part="${field}"]`).textContent()===(field==='where'&&data.credit===null?data[field].replace(/\.\s*$/,''):data[field]),`${id} ${field} mismatch`);
    assert(await row.locator('[data-licence]').textContent()===data.lic,`${id} licence mismatch`);
    assert(await row.locator('[data-holder-credit]').count()===(data.credit===null?0:1),`${id} holder credit presence mismatch`);
    if(data.credit!==null){assert(await row.locator('[data-holder-credit]').textContent()===data.credit.replace(/\.\s*$/,''),`${id} holder credit mismatch`);credits++;}
    assert(await row.locator(':scope > a').getAttribute('href')===(id==='home'?'/':`/${id}`),`${id} work link mismatch`);
   }
   assert(credits===Object.values(plates).filter(p=>p.credit!==null).length,`holder credit count=${credits}`);
   return got.length;
  }finally{await close(p);}
 },
 'R-T1':async()=>{
  // Round 9. From 961px the title wraps naturally (no fitted lines) at 32–60px, 38–60px when it
  // has no comma (poster-fit.ts fitDesktopWork). On the phone the lines are the golden's, but no
  // line is set over 64px: sizes are min(64, golden). The title is never shrunk to make room for
  // the plate, so the golden's own sizes under 64 (NICOMACHEAN 58) must hold.
  const golden=JSON.parse(readFileSync(join(app,'scripts/fixtures/poster-golden.json'),'utf8')).works;
  let n=0;
  for(const id of ['Cat',...workIds.filter(id=>id!=='Cat')])for(const [size,kind] of [['G1440','desktop'],['P390','phone']]){
   const p=await open(size,'light',`/${id}/`);
   try{
    const title=registry.getWork(id).title;
    if(kind==='desktop'){
     if(prove&&proofCase==='desktop-small'&&id==='Cat')await style(p,'.dir-b.pg-work .b-top .b-po-t{font-size:30px!important}');
     if(prove&&proofCase==='desktop-lines'&&id==='Cat')await p.locator('.b-po-t').evaluate(el=>{el.innerHTML='<span class="ln">CATEGO</span><span class="ln">RIES</span>';});
     const r=await p.locator('.b-po-t').evaluate(el=>({lines:el.querySelectorAll('.ln').length,text:el.textContent.replace(/\s+/g,' ').trim(),size:parseFloat(getComputedStyle(el).fontSize),overflow:el.scrollWidth>el.clientWidth+1}));
     const floor=title.includes(',')?32:38;
     assert(r.lines===0&&r.text===title,`${id} ${size} title is not natural: ${r.lines} fitted lines, text="${r.text}", works.ts "${title}"`);
     assert(r.size>=floor&&r.size<=60,`${id} ${size} title font-size=${r.size} outside ${floor}–60`);
     assert(!r.overflow,`${id} ${size} title overflows its column`);
     n++;continue;
    }
    // Break the page, never the fixture: split Cat's first drawn line in two.
    if(prove&&proofCase==='golden-line'&&id==='Cat')await p.locator('.b-po-t .ln').first().evaluate(el=>{const tail=el.cloneNode();tail.textContent=el.textContent.slice(3);el.textContent=el.textContent.slice(0,3);el.after(tail);});
    if(prove&&proofCase==='drawn-size'&&id==='Cat')await style(p,'.dir-b .b-po-t .ln{font-size:12px!important}');
    if(prove&&proofCase==='no-cap'&&id==='Top'){
     const cap='if (phone && !home) for (const line of lines) line.f = Math.min(64, line.f);';
     const source=readFileSync(join(app,'src/lib/poster-fit.ts'),'utf8');
     assert(source.includes(cap),'R-T1 no-cap proof: the 64px cap is not in poster-fit.ts');
     const js=ts.transpileModule(source.replace(cap,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}}).outputText;
     await p.evaluate(async js=>{const url=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));try{const mod=await import(url);mod.fitPoster(document.querySelector('.b-po-t'));}finally{URL.revokeObjectURL(url);}},js);
    }
    const actual=await p.locator('.b-po-t').evaluate(el=>({lines:[...el.querySelectorAll('.ln')].map(l=>l.textContent),set:el.dataset.set,drawn:[...el.querySelectorAll('.ln')].map(l=>parseFloat(getComputedStyle(l).fontSize))}));
    const expected=golden[id][kind];
    assert(actual.lines.length>0&&JSON.stringify(actual.lines)===JSON.stringify(expected.lines),`${id} ${size} poster lines=${JSON.stringify(actual.lines)} expected=${JSON.stringify(expected.lines)}`);
    const sizes=actual.set.split(',').map(Number), target=expected.set.split(',').map(v=>Math.min(64,Number(v)));
    assert(sizes.length===target.length&&sizes.every((v,i)=>Math.abs(v-target[i])<=1),`${id} ${size} poster sizes=${actual.set} expected=${target}`);
    assert(actual.drawn.length===target.length&&actual.drawn.every((v,i)=>Math.abs(v-target[i])<=1),`${id} ${size} drawn sizes=${actual.drawn.map(v=>v.toFixed(1))} expected=${target}`);n++;
   }finally{await close(p);}
  }assert(n===94,`poster golden count=${n}`);return n;
 },
 'R-T2':async()=>{
  let n=0;
  for(const id of ['Cat',...workIds.filter(id=>id!=='Cat')])for(const size of ['D1440','D1280','D1920','P390','S844']){
   const p=await open(size,'light',`/${id}/`);
   try{
    // D26: the poster's height cap is gone from 961px (spec §3.4); the cap proof now pushes the buttons off the first screen.
    if(prove&&proofCase==='cap'&&id==='Cat'&&size==='D1440')await style(p,'.dir-b.pg-work .b-top .b-ctas{margin-top:2000px!important}');
    if(prove&&proofCase==='crop'&&id==='Cat'&&size==='D1440')await style(p,'.dir-b.pg-work .b-po.work img{object-fit:cover!important}');
    const box=await p.evaluate(()=>{
     const poster=document.querySelector('.b-po.work').getBoundingClientRect(), start=document.querySelector('[data-start]').getBoundingClientRect(), img=document.querySelector('.b-po img'), title=document.querySelector('.b-po-t');
     const css=getComputedStyle(img);
     const width=parseFloat(css.width)-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-parseFloat(css.borderLeftWidth)-parseFloat(css.borderRightWidth);
     const height=parseFloat(css.height)-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)-parseFloat(css.borderTopWidth)-parseFloat(css.borderBottomWidth);
     // Round 9: on the phone .b-po.work is display:contents; the plate is the picture.
     return {startDoc:start.bottom+scrollY,height:innerHeight,bottom:start.bottom,posterHeight:document.querySelector('.b-top picture').getBoundingClientRect().height,navHeight:document.querySelector('.b-nav').offsetHeight,titleHeight:title.clientHeight,fit:css.objectFit,ratio:width/height,phone:matchMedia('(max-width:960px)').matches};
    });
    assert(box.posterHeight>0,`${id} ${size} examined=0: plate height=${box.posterHeight}`);
    if(size==='S844')assert(box.posterHeight<=box.height-box.navHeight+1,`${id} ${size} poster height=${box.posterHeight} exceeds viewport minus nav`);
    else assert(box.bottom<=box.height-16+1,`${id} ${size} Start reading bottom=${box.bottom} viewport=${box.height}`);
    const expected=box.phone?640/558:1280/914;
    // D26: from 961px the plate is cut to its ink box and drawn with object-fit: fill at its own 1280:914 ratio (spec §5.3).
    const wantFit=box.phone?'contain':'fill';
    assert(box.fit===wantFit,`${id} ${size} object-fit=${box.fit} expected ${wantFit}`);
    assert(Math.abs(box.ratio/expected-1)<=.01,`${id} ${size} plate ratio=${box.ratio} expected ${expected}`);
    // Round 9: only the upright phone plate budgets its height from scrollY; on Juv, whose
    // four-line title makes the budget bind (On Length's plate now keeps its natural height).
    if(prove&&proofCase==='scroll-budget'&&id==='Juv'&&size==='P390')await p.evaluate(()=>Object.defineProperty(window,'scrollY',{get:()=>0,configurable:true}));
    await p.evaluate(()=>{window.scrollTo(0,600);window.dispatchEvent(new Event('resize'));});
    await p.waitForTimeout(150);
    // D26: on desktop .b-po.work is display:contents, so the layout to hold still is the buttons' place on the page.
    const after=await p.evaluate(desktop=>desktop?document.querySelector('[data-start]').getBoundingClientRect().bottom+scrollY:document.querySelector('.b-top picture').getBoundingClientRect().height,!box.phone&&size!=='S844');
    const before=(!box.phone&&size!=='S844')?box.startDoc:box.posterHeight;
    assert(Math.abs(after-before)<=1,`${id} ${size} scroll changed poster height ${before} → ${after}`);
    n++;
   }finally{await close(p);}
  }assert(n===235,`poster cap count=${n}`);return n;
 },
});

// ── Stage 3: the reader (§4.7 R-R1–R-R10, R-A4; 12 Nov: R-R11–R-R17, R-A5) ─────────────────────────
// Wait until the reader island has mounted: the Greek's one tab stop exists
// (or the Greek is hidden), and the head shows the reader's state.
async function readerReady(page) {
    await page.waitForFunction(() => document.querySelector('.reader-body .tok[tabindex="0"]') || document.querySelector('.reader-body[data-view="english"]'), null, {timeout: 10000});
    await page.waitForTimeout(150);
    await settleFonts(page);
}
async function openReader(size, path = READER, theme = 'light') {
    const page = await open(size, theme, path);
    await readerReady(page);
    return page;
}
// Click a reader view in place (the head's buttons are hidden on a phone; the
// click still drives the reader).
async function setView(page, view) {
    await page.evaluate(v => document.querySelector(`[data-reader-view="${v}"]`).click(), view);
    await page.waitForFunction(v => document.querySelector('.reader-body')?.dataset.view === v, view);
    await page.waitForTimeout(100);
    await settleFonts(page);
}
async function openWord(page, near = 'first') {
    const tok = near === 'first' ? page.locator('.b-gc .tok >> visible=true').first() : page.locator(near);
    await tok.click();
    await page.locator('.b-side').waitFor({timeout: 3000});
    await page.waitForTimeout(500);
    await settleFonts(page);
}
// The Greek column B's formula gives (R-R5), from an unwrapped measurement of
// the lines taken here, not the reader's own published value.
const greekFormula = async page => {
    const measured = await page.locator('.reader-body .b-gc .b-lt').evaluateAll(measureGreekLines);
    return page.evaluate(({w, changed, lines}) => {
    const body = document.querySelector('.reader-body');
    const row = [...body.querySelectorAll('.b-row')].find(r => r.querySelector('.b-ec') && r.querySelector('.b-gc .b-lt'));
    const gc = row.querySelector('.b-gc'), ec = row.querySelector('.b-ec');
    const n = [...row.children].filter(c => getComputedStyle(c).display !== 'none').length;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const u = parseFloat(getComputedStyle(ec).fontSize);
    const avail = row.clientWidth - gap * (n - 1), emin = (n > 2 ? 18 : 26) * u * (n - 1), gmin = Math.min(w, 20 * u);
    const expected = Math.floor(avail >= w + emin ? w : avail - emin >= gmin ? avail - emin : avail * gmin / (gmin + emin));
    return {w, changed, lines, n, gap, u, avail, expected, actual: gc.offsetWidth, gcol: body.style.getPropertyValue('--gcol'), greekW: body.style.getPropertyValue('--greek-w')};
    }, measured);
};
async function checkReadingSizes(page, label) {
    const sizes = await page.locator('.reader-body .b-gc,.reader-body .b-ec').evaluateAll(readReadingSizes);
    assert(sizes.length > 0, `${label} examined=0 reading text descendants`);
    const min = sizes[0];
    console.log(`R-R5 ${label} smallest reading text=${min.size}px selector=${min.selector} examined=${sizes.length}`);
    assert(min.size >= 18, `${label} reading text under 18px: ${min.selector} ${min.size}px`);
}
// English line boxes over Greek word boxes, across the whole book.
const overlaps = page => page.locator('.reader-body .b-row').evaluateAll(readReaderOverlaps);

// The work whose Greek has the longest Bekker lines (by characters), for R-R5.
const longLineWork = (() => {
    let best = null;
    for (const w of registry.WORKS) {
        if ((w.citation?.scheme || 'bekker') !== 'bekker') continue;
        const file = join(app, 'public/data', w.id, 'book-01.json');
        if (!existsSync(file)) continue;
        const data = JSON.parse(readFileSync(file, 'utf8'));
        const max = Math.max(0, ...data.segments.flatMap(s => s.greek.map(l => l.text.length)));
        if (!best || max > best.max) best = {id: w.id, max};
    }
    return best;
})();

// Line-number baselines (R-R14, R-R15): a zero-height inline-block marker sits
// on its parent's baseline, so one prepended to the number and one set before the
// first word of its text line give the two baselines. The English marker shares a
// nowrap span with that word, so it cannot fall to the end of the line before.
function readNumberBaselines() {
 const mk = () => { const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:0;height:0;margin:0;padding:0;border:0;vertical-align:baseline'; return m; };
 const pairs = [], undo = [];
 for (const ln of document.querySelectorAll('.reader-body .b-gl > .b-ln')) {
  const lt = ln.parentElement.querySelector(':scope > .b-lt');
  if (!ln.textContent.trim() || !ln.getClientRects().length || !lt?.getClientRects().length) continue;
  const a = mk(), b = mk(); ln.prepend(a); lt.prepend(b);
  undo.push(() => { a.remove(); b.remove(); });
  pairs.push({kind: 'Greek', el: ln, a, b});
 }
 for (const num of document.querySelectorAll('.reader-body .b-ec .bk-num')) {
  if (!num.textContent.trim() || !num.getClientRects().length) continue;
  const seg = num.parentElement;
  const w = document.createTreeWalker(seg, NodeFilter.SHOW_TEXT, {acceptNode: t => t.textContent.trim() && !t.parentElement.closest('.bk-num,.fn-marker') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP});
  const t = w.nextNode();
  if (!t) continue;
  const parent = t.parentNode, word = t.splitText(t.textContent.search(/\S/));
  word.splitText(word.textContent.search(/\s|$/));
  const wrap = document.createElement('span'); wrap.style.whiteSpace = 'nowrap';
  word.before(wrap);
  const a = mk(), b = mk(); num.prepend(a); wrap.append(b, word);
  undo.push(() => { a.remove(); wrap.replaceWith(word); parent.normalize(); });
  pairs.push({kind: 'English', el: num, a, b});
 }
 const out = pairs.map(({kind, el, a, b}) => { const s = getComputedStyle(el); return {kind, text: el.textContent.trim(), col: el.classList.contains('col'), d: a.getBoundingClientRect().top - b.getBoundingClientRect().top, size: s.fontSize, family: s.fontFamily, color: s.color}; });
 undo.forEach(f => f());
 return out;
}
if (stage >= 3) Object.assign(gates, {
 'R-R1': async () => {
  let n = 0;
  for (const id of workIds) {
   const work = registry.getWork(id), {short, full} = work.greekSource;
   for (const size of ['D1440', 'P390']) {
    const p = await openReader(size, `/${id}/book/1`);
    try {
     if (prove && proofCase === 'head' && id === 'EN') await p.locator('.b-rh').evaluate(el => el.insertAdjacentHTML('beforeend', '<span>Greek: Bywater, 1894</span>'));
     for (const view of ['greek', 'both', 'english']) {
      await setView(p, view);
      const chrome = await p.evaluate(() => {
       const out = [];
       const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
       let node;
       while ((node = walker.nextNode())) {
        const el = node.parentElement;
        if (!node.textContent.trim() || el.closest('script,style,[hidden],.b-gc,.b-ec,.footnote-popup,.b-note')) continue;
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        out.push(node.textContent);
       }
       return out.join(' ').replace(/\s+/g, ' ');
      });
      assert(chrome.length > 0, `${id} ${size} ${view} examined=0 chrome text`);
      for (const bad of [short, full]) assert(!chrome.includes(bad), `${id} ${size} ${view} reader chrome names the Greek edition: ${bad}`);
      assert(!/\bGreek:\s/.test(chrome), `${id} ${size} ${view} reader chrome labels a Greek edition: ${chrome.match(/Greek:\s.{0,30}/)?.[0]}`);
      n++;
     }
     if (size === 'D1440') {
      await setView(p, 'both');
      if (prove && proofCase === 'print' && id === 'EN') await p.locator('.print-cite').evaluate(el => el.remove());
      if (prove && proofCase === 'print-book' && id === 'EN') await style(p, '@media print{.dir-b .b-bookh{display:none!important}}');
      if (prove && proofCase === 'print-margin' && id === 'EN') await style(p, '@media print{body{margin:8px!important}}');
      const shownText = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' ? el.innerText.trim() : '';
      const screenBook = await p.locator('.b-bk-t').evaluate(shownText);
      await p.emulateMedia({media: 'print'});
      const printed = await p.locator('.print-head').evaluate(el => getComputedStyle(el).display !== 'none' ? el.innerText : '');
      const printedBook = await p.locator('.b-bk-t').evaluate(shownText);
      const bodyMargin = await p.evaluate(() => getComputedStyle(document.body).margin);
      await p.emulateMedia({media: 'screen'});
      assert(printed.includes(`Greek text: ${full}`), `${id} printed footer lacks "Greek text: ${full.slice(0, 40)}…"`);
      // The book head prints (the masthead names only the work).
      assert(screenBook, `${id} examined=0 book label on screen`);
      assert(printedBook.toLowerCase() === screenBook.toLowerCase(), `${id} printed page drops the book label "${screenBook}" (printed "${printedBook}")`);
      // Before stage 3 the reset left the printed body no margin; @page sets it.
      assert(bodyMargin === '0px', `${id} printed body margin=${bodyMargin}`);
      n++;
      // Print hides the screen furniture (open here, so the check has
      // something to hide) and the text takes global.css's print grid.
      if (prove && id === 'EN' && proofCase === 'print-chrome') await style(p, '@media print{.dir-b .b-side{display:flex!important}}');
      if (prove && id === 'EN' && proofCase === 'print-grid') await style(p, '@media print{.dir-b .b-text[data-view="both"] .b-row{column-gap:64px!important}}');
      const printCheck = async (open) => {
       for (const s of open) assert(await p.locator(s).first().isVisible(), `${id} ${s} did not open before the print check`);
       await p.emulateMedia({media: 'print'});
       const got = await p.evaluate(() => {
        const shown = ['.b-rh', '.b-toc', '.b-side', '.b-note'].filter(s => [...document.querySelectorAll(s)].some(el => getComputedStyle(el).display !== 'none'));
        const body = document.querySelector('.reader-body');
        const row = [...body.querySelectorAll('.b-row')].find(r => r.querySelector('.b-gc .b-lt') && r.querySelector('.b-ec'));
        const css = el => getComputedStyle(el);
        return {shown, row: !!row, grid: row ? `gap=${css(row).columnGap} padding=${css(body).paddingLeft}/${css(body).paddingRight} greek=${css(row.querySelector('.b-gc')).fontSize} english=${css(row.querySelector('.b-ec')).fontSize}` : ''};
       });
       await p.emulateMedia({media: 'screen'});
       assert(!got.shown.length, `${id} printed page shows screen furniture: ${got.shown.join(' ')}`);
       assert(got.row, `${id} print examined=0 Greek/English rows`);
       // global.css @media print: .seg-row gap .6rem, .reader-body padding 0, Greek 12px, English 15px.
       assert(got.grid === 'gap=9.6px padding=0px/0px greek=12px english=15px', `${id} print grid: ${got.grid}`);
       n++;
      };
      await openWord(p);
      await p.locator('[data-toc-toggle]').click();
      await printCheck(['.b-rh', '#toc-sidebar', '.b-side']);
      const mark = p.locator('.b-ec .fn-marker >> visible=true').first();
      if (await mark.count()) {
       await p.keyboard.press('Escape');
       await mark.click();
       await p.locator('.b-note').waitFor({timeout: 3000});
       await printCheck(['.b-note']);
      }
     }
    } finally { await close(p); }
   }
  }
  console.log(`R-R1 works×views×sizes examined=${n}`);
  return n;
 },
 'R-R2': async () => {
  const longest = registry.WORKS.reduce((a, w) => w.title.length > a.title.length ? w : a, registry.WORKS[0]);
  const widths = [];
  for (let w = 701; w <= 1440; w += 40) widths.push(w);
  let n = 0;
  for (const id of ['EN', longest.id]) {
   const cases = [...['D961', 'S844', 'S960', 'P390', 'P360'].map(s => [s, null]), ...widths.map(w => ['W900', w])];
   for (const [size, width] of cases) {
    const p = await openReader(size, `/${id}/book/1`);
    try {
     if (width) { await p.setViewportSize({width, height: 800}); await p.waitForTimeout(150); }
     // The long name back (the cut the old fitter missed): the row then runs into its padding.
     if (prove && proofCase === 'pad-overflow' && id === 'EN' && size === 'S844') await style(p, '.dir-b .b-rh.cut-name .b-rh-w .full{display:inline!important}.dir-b .b-rh.cut-name .b-rh-w .short{display:none!important}');
     if (prove && proofCase === 'kit-wrap' && id === 'EN' && size === 'S844') await style(p, '.dir-b .b-rh{flex-wrap:wrap!important}.dir-b .b-rh.cut-title .b-rh-ch i,.dir-b .b-rh.cut-name .b-rh-w .full,.dir-b .b-rh.cut-ch .b-rh-ch{display:inline!important}.dir-b .b-rh.cut-name .b-rh-w .short{display:none!important}');
     const g = await p.locator('.b-rh').evaluate(head => {
      const kids = [...head.children].filter(c => c.getClientRects().length && getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 0);
      const tops = kids.map(c => c.getBoundingClientRect().top);
      // scrollWidth misses items that only eat into the head's right padding.
      const end = head.getBoundingClientRect().right - parseFloat(getComputedStyle(head).paddingRight);
      const past = Math.max(...kids.map(c => c.getBoundingClientRect().right)) - end;
      return {kids: kids.length, spread: Math.max(...tops) - Math.min(...tops), sh: head.scrollHeight, ch: head.clientHeight, sw: head.scrollWidth, cw: head.clientWidth, h: head.offsetHeight, vw: innerWidth, past, page: document.documentElement.scrollWidth, cvw: document.documentElement.clientWidth};
     });
     const label = `${id} ${width ? width + 'px' : size}`;
     assert(g.kids > 3, `${label} examined=${g.kids} head children`);
     assert(g.spread < 10 && g.sh <= g.ch, `${label} reader head breaks into two rows (tops spread ${g.spread.toFixed(1)}px, scrollHeight ${g.sh} > ${g.ch})`);
     assert(g.sw <= g.cw + 1, `${label} reader head overflows its row (${g.sw} > ${g.cw})`);
     assert(g.past <= 0.5, `${label} reader head runs ${g.past.toFixed(1)}px into its right padding`);
     assert(g.page <= g.cvw, `${label} page wider than the window (${g.page} > ${g.cvw})`);
     assert(g.h === (g.vw <= 700 ? 54 : 60), `${label} reader head height=${g.h}`);
     n++;
    } finally { await close(p); }
   }
  }
  return n;
 },
 'R-R3': async () => {
  const window = new Window({settings: {disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true}});
  let n = 0;
  try {
   for (const id of workIds.filter(id => registry.getWork(id).books > 1)) {
    const work = registry.getWork(id);
    // A reader page carries the whole book; parse only its contents panel.
    window.document.body.innerHTML = readFileSync(join(dist, id, 'book/1/index.html'), 'utf8').match(/<aside class="b-toc"[\s\S]*?<\/aside>/)?.[0] ?? '';
    if (prove && id === 'EN') window.document.querySelector('.b-toc .toc-book-label').textContent = 'I Book I';
    const heads = [...window.document.querySelectorAll('.b-toc .toc-book-label')].map(h => h.textContent.trim());
    assert(heads.length === work.books, `${id} examined=${heads.length} contents book heads, expected ${work.books}`);
    heads.forEach((h, i) => { assert(h === `Book ${work.bookLabels[i]}` && /^Book \S+$/.test(h), `${id} contents book head "${h}"`); n++; });
   }
  } finally { window.close(); }
  for (const id of ['EN', 'Meta']) for (const theme of ['light', 'dark']) {
   const p = await openReader('D1440', `/${id}/book/1`, theme);
   try {
    await p.locator('[data-toc-toggle]').click();
    const colors = await p.locator('.b-toc-c a > span:first-child').evaluateAll(els => els.filter(e => e.getClientRects().length).map(e => ({c: getComputedStyle(e).color, fs: parseFloat(getComputedStyle(e).fontSize)})));
    assert(colors.length > 0, `${id} examined=0 contents chapter numbers`);
    const want = theme === 'dark' ? 'rgb(255, 123, 112)' : 'rgb(180, 36, 25)';
    for (const c of colors) { assert(c.fs < 24 && c.c === want, `${id} ${theme} contents chapter number color=${c.c} size=${c.fs}`); n++; }
   } finally { await close(p); }
  }
  return n;
 },
 'R-R4': async () => {
  let n = 0;
  for (const trans of ['', 'compare']) for (const size of ['D1440', 'D961', 'S844', 'S960', 'P390']) {
   const p = await openReader(size, READER + (trans ? `?trans=${trans}` : ''));
   try {
    await setView(p, 'both');
    if (prove && size === 'S844' && !trans) { await style(p, '.dir-b .b-text[data-view="both"] .b-row{grid-template-columns:minmax(0,1fr)!important}'); await p.waitForTimeout(100); }
    const rows = await p.evaluate(() => [...document.querySelectorAll('.reader-body .b-row')].map(r => {
     const g = r.querySelector('.b-gc').getBoundingClientRect();
     return {g: g.top, gb: g.bottom, cols: getComputedStyle(r).gridTemplateColumns.split(' ').length, e: [...r.querySelectorAll('.b-ec')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().top)};
    }));
    const label = `${size}${trans ? ' Compare' : ''}`;
    assert(rows.length > 0, `${label} examined=0 rows`);
    for (const r of rows) {
     assert(r.e.length === (trans ? 2 : 1), `${label} row has ${r.e.length} English cells`);
     for (const e of r.e) {
      if (size === 'P390') assert(e >= r.gb - 1, `${label} English cell is not below its Greek`);
      else assert(Math.abs(e - r.g) <= 2, `${label} English below Greek: row stacks (Greek top ${r.g.toFixed(0)}, English top ${e.toFixed(0)})`);
     }
     if (size !== 'P390') assert(r.cols === (trans ? 3 : 2), `${label} row has ${r.cols} columns`);
     n++;
    }
   } finally { await close(p); }
  }
  return n;
 },
 'R-R5': async () => {
  const long = longLineWork;
  console.log(`R-R5 long-line work: ${long.id} (${registry.getWork(long.id).title}, ${long.max} characters)`);
  let n = 0, boxes = 0, rows = 0, unwrapped = 0;
  for (const id of ['EN', long.id]) for (const trans of ['', 'compare']) {
   if (trans && registry.visibleTranslations(registry.getWork(id)).length < 2) { console.log(`R-R5 ${id} has one translation: no Compare`); continue; }
   for (const size of ['D1440', 'D1280', 'W1200', 'D961', 'S844']) for (const panel of [false, true]) {
    const p = await openReader(size, `/${id}/book/1` + (trans ? `?trans=${trans}` : ''));
    try {
     await setView(p, 'both');
     if (prove && proofCase === 'round-eight' && size === 'W1200' && panel) await style(p, '.dir-b .b-text[data-view="both"] .b-row{grid-template-columns:var(--greek-w,max-content) repeat(calc(var(--n) - 1),minmax(0,1fr))!important}');
     if (id === 'EN' && !trans && !panel && (size === 'D1440' || size === 'S844')) {
      // The first red Bekker number (the column label) shares the line
      // numbers' right edge and their baseline (12 Nov: numbers 15px sans).
      // Both are read from the page's own numbers, not a pinned x.
      if (prove && proofCase === 'ln-margin' && size === 'D1440') await style(p, '.dir-b .b-ln.col{left:-70px!important}');
      if (prove && proofCase === 'ln-shift' && size === 'D1440') await style(p, '.dir-b .b-ln{left:-70px!important}');
      if (prove && proofCase === 'ln-col-low' && size === 'D1440') await style(p, '.dir-b .b-ln.col{top:calc(var(--b-number-top) + 4px)!important}');
      const ln = await p.evaluate(() => {
       const ink = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; };
       const nums = [...document.querySelectorAll('.reader-body .b-gl > .b-ln')].filter(el => el.textContent.trim() && el.getClientRects().length);
       const col = nums.find(el => el.classList.contains('col'));
       const plain = nums.filter(el => !el.classList.contains('col')).map(ink);
       // Each number's gutter: its right ink to the left edge of its own line's Greek.
       const gaps = nums.map(el => el.parentElement.querySelector(':scope > .b-lt')?.getBoundingClientRect().left - ink(el)).filter(Number.isFinite);
       return col ? {text: col.textContent, right: ink(col), plain: plain.length, lo: Math.min(...plain), hi: Math.max(...plain), gapLo: Math.min(...gaps), gapHi: Math.max(...gaps), gaps: gaps.length} : null;
      });
      assert(ln && ln.text && ln.plain > 0, `EN ${size} examined=0 red Bekker margin numbers or plain line numbers`);
      assert(ln.hi - ln.lo <= 1, `EN ${size} plain Greek line numbers do not share a right edge: x${ln.lo.toFixed(2)}–x${ln.hi.toFixed(2)}`);
      assert(Math.abs(ln.right - ln.hi) <= 1, `EN ${size} column label "${ln.text}" right ink x${ln.right.toFixed(2)} is ${(ln.hi - ln.right).toFixed(1)}px off the line numbers' right edge x${ln.hi.toFixed(2)}`);
      // An independent reference: the gutter between each number and its line's
      // Greek, as built on 12 Nov after John's 15px ruling (measured 12.00px at
      // D1440 and S844). Moving every .b-ln together keeps the label on the
      // numbers' edge but breaks this.
      const GUTTER = 12;
      assert(ln.gaps > 0, `EN ${size} examined=0 line number gutters`);
      assert(ln.gapLo >= GUTTER - 1 && ln.gapHi <= GUTTER + 1, `EN ${size} line numbers' gutter to the Greek is ${ln.gapLo.toFixed(1)}–${ln.gapHi.toFixed(1)}px, expected ${GUTTER.toFixed(1)}±1px`);
      console.log(`R-R5 ${size} gutter (number right ink to Greek left) ${ln.gapLo.toFixed(2)}–${ln.gapHi.toFixed(2)}px over ${ln.gaps} lines`);
      const level = (await p.evaluate(readNumberBaselines)).find(x => x.kind === 'Greek' && x.col);
      assert(level, `EN ${size} examined=0 column label baselines`);
      assert(Math.abs(level.d) <= 1, `EN ${size} column label "${level.text}" baseline ${level.d > 0 ? 'below' : 'above'} its line by ${Math.abs(level.d).toFixed(1)}px`);
      console.log(`R-R5 ${size} column label "${ln.text}" right x${ln.right.toFixed(2)}, ${ln.plain} line numbers right x${ln.lo.toFixed(2)}–${ln.hi.toFixed(2)}, baseline offset ${level.d.toFixed(2)}px`);
     }
     if (panel) await openWord(p);
     if (prove && ['no-nowrap','narrow-column','late-overlap','small-descendant','nothing-unwrapped'].includes(proofCase)) {
      if (proofCase === 'no-nowrap') {
       const before = await greekFormula(p);
       await p.evaluate(() => {
       const remove = rules => { for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i];
        if (rule.selectorText?.includes('.gw-measure') && rule.style?.whiteSpace === 'nowrap') rule.style.removeProperty('white-space');
        if (rule.cssRules) remove(rule.cssRules);
       }};
       for (const sheet of document.styleSheets) { try { remove(sheet.cssRules); } catch {} }
       });
       const after = await greekFormula(p);
       assert(before.w === after.w, `R-R5 nowrap removal changed independent measurement: ${before.w} → ${after.w}`);
       console.log(`R-R5 removed site nowrap rule: independent width=${after.w}`);
      }
      if (['no-nowrap','narrow-column'].includes(proofCase)) await style(p, '.reader-body .b-row{grid-template-columns:80px minmax(0,1fr)!important}');
      if (proofCase === 'late-overlap') {
       await p.evaluate(() => {
        const last = document.querySelector('.b-row:last-of-type') || [...document.querySelectorAll('.b-row')].at(-1);
        while (document.querySelectorAll('.b-row').length < 41) last.parentElement.append(last.cloneNode(true));
       });
       await p.locator('.b-row').last().evaluate(row => {
       const ec = row.querySelector('.b-ec'), gc = row.querySelector('.b-gc');
       ec.style.cssText += `;position:relative;left:${gc.getBoundingClientRect().left - ec.getBoundingClientRect().left}px`;
       });
      }
      if (proofCase === 'nothing-unwrapped') await style(p, '.b-lt,.b-lt *{white-space:nowrap!important}');
      if (proofCase === 'small-descendant') await p.locator('.b-ec').first().evaluate(el => el.insertAdjacentHTML('beforeend','<span class="gate-small" style="font-size:12px">Gate text</span>'));
     }
     const f = await greekFormula(p);
     const label = `${id} ${size}${trans ? ' Compare' : ''}${panel ? ' panel open' : ''}`;
     assert(f.w > 0, `${label} examined=0 Greek lines`);
     if (f.actual < f.w - 1) assert(f.changed > 0, `${label} examined nothing unwrapped`);
     assert(Math.abs(f.actual - f.expected) <= 1, `${label} Greek column width=${f.actual} expected ${f.expected} (w=${f.w} n=${f.n} gap=${f.gap} u=${f.u} avail=${f.avail})`);
     unwrapped += f.changed;
     console.log(`R-R5 ${label} unwrapped lines=${f.lines} differing=${f.changed} width=${f.w}`);
     const o = await overlaps(p);
     rows += o.rows;
     console.log(`R-R5 ${label} rows examined=${o.rows}`);
     assert(o.boxes > 0, `${label} examined=0 boxes`);
     assert(o.hits === 0, `${label} ${o.hits} English line boxes overlap Greek words (at ${o.at.join(' ')})`);
     boxes += o.boxes;
     await checkReadingSizes(p, label);
     n++;
    } finally { await close(p); }
   }
  }
  assert(unwrapped > 0, 'R-R5 examined nothing unwrapped');
  console.log(`R-R5 boxes examined=${boxes} rows examined=${rows}`);
  // A phone sets the reading text at the kit's phone size, measured in the
  // kit (kit-t/index.html#b-reader, 390px pane): 18px on a 30.96px line. The
  // sizes above never reach a phone, which is how 14.4px passed.
  const KIT_PHONE = {size: 18, line: 30.96};
  for (const id of ['EN', long.id]) for (const trans of ['', 'compare']) {
   if (trans && registry.visibleTranslations(registry.getWork(id)).length < 2) continue;
   for (const size of ['P390', 'P360']) {
    const p = await openReader(size, `/${id}/book/1` + (trans ? `?trans=${trans}` : ''));
    try {
     if (prove && proofCase === 'phone-shrink') await style(p, '.reader-body.view-both .greek-col,.reader-body.view-both .english-col{font-size:.9rem!important;line-height:1.6!important}');
     for (const view of ['both', 'greek', 'english']) {
      await setView(p, view);
      await checkReadingSizes(p, `${id} ${size} ${view}`);
      const cols = await p.evaluate(() => [...document.querySelectorAll('.reader-body .b-gc, .reader-body .b-ec')].filter(e => e.getClientRects().length).map(e => ({cls: e.className, size: parseFloat(getComputedStyle(e).fontSize), line: parseFloat(getComputedStyle(e).lineHeight)})));
      const label = `${id} ${size}${trans ? ' Compare' : ''} ${view}`;
      assert(cols.length > 0, `${label} examined=0 reading columns`);
      const small = cols.filter(c => c.size < KIT_PHONE.size - .01 || c.line < KIT_PHONE.line - .01);
      assert(!small.length, `${label} phone reading text below the kit's ${KIT_PHONE.size}/${KIT_PHONE.line}px: ${small[0]?.cls.split(' ')[0]} ${small[0]?.size}/${small[0]?.line}px`);
      n++;
     }
    } finally { await close(p); }
   }
  }
  for (const size of ['D1440', 'P390']) {
   const label = `${READER} ${size} eng-table fixture`;
   const p = await openReader(size, READER);
   const fixture = p.locator('.b-ec [data-eng-table-fixture]');
   try {
    await setView(p, 'both');
    await p.locator('.b-ec').first().evaluate(el => {
     const table = document.createElement('table');
     table.className = 'eng-table';
     table.dataset.engTableFixture = '';
     table.innerHTML = '<tbody><tr><td>fixture cell text</td><td>' + 'fixturewide'.repeat(16) + '</td></tr></tbody>';
     el.append(table);
    });
    const count = await fixture.count();
    console.log(`R-R5 ${READER} ${size} eng-table fixture examined=${count}`);
    assert(count === 1, `${label} examined=${count} English table fixtures`);
    if (prove && proofCase === 'small-table') await style(p, '.dir-b .b-ec .eng-table{font-size:.85em!important}');
    if (prove && proofCase === 'table-overflow' && size === 'P390') {
     // The phone reader also clips outer overflow. Disable that guard so the
     // page-width check can observe a table that loses its own scroll box.
     await style(p, '.dir-b .b-ec .eng-table{display:table!important;max-width:none!important}.dir-b .b-text{overflow-x:visible!important}');
    }
    await checkReadingSizes(p, label);
    const page = await p.evaluate(() => ({width: document.documentElement.scrollWidth, viewport: innerWidth}));
    assert(page.width <= page.viewport, `${label} horizontal page overflow: ${page.width} > ${page.viewport}`);
    const layout = await fixture.evaluate(el => ({
     display: getComputedStyle(el).display,
     overflow: getComputedStyle(el).overflowX,
     width: el.getBoundingClientRect().width,
     columnWidth: el.closest('.b-ec').clientWidth,
     scrollWidth: el.scrollWidth,
     clientWidth: el.clientWidth,
     rows: [...el.querySelectorAll('tr')].map(row => getComputedStyle(row).display),
    }));
    assert(layout.display === 'block' && layout.overflow === 'auto' && layout.width <= layout.columnWidth,
     `${label} table does not contain horizontal scrolling: ${JSON.stringify(layout)}`);
    assert(layout.rows.length > 0 && layout.rows.every(display => display === 'table-row'), `${label} table rows lost table layout`);
    if (size === 'P390') assert(layout.scrollWidth > layout.clientWidth, `${label} fixture did not exceed the column`);
    n++;
   } finally {
    await fixture.evaluateAll(els => els.forEach(el => el.remove()));
    await close(p);
   }
  }
  return n;
 },
 'R-R6': async () => {
  const p = await openReader('D1440');
  try {
   const gcol = () => p.evaluate(() => document.querySelector('.reader-body').style.getPropertyValue('--gcol'));
   const greekW = () => p.evaluate(() => document.querySelector('.reader-body').style.getPropertyValue('--greek-w'));
   const before = await gcol();
   assert(before, 'examined=0: no --gcol at D1440');
   await p.evaluate(() => window.scrollTo(0, 1500));
   await p.waitForTimeout(200);
   const target = await p.evaluate(() => {
    const toks = [...document.querySelectorAll('.b-gc .tok')];
    const t = toks.find(t => { const r = t.getBoundingClientRect(); return r.top > innerHeight * .45 && r.top < innerHeight * .7; });
    t.dataset.gate = 'word';
    return t.getBoundingClientRect().top;
   });
   if (prove) await p.evaluate(v => {
    // Drop the rerun on panel open: hold --gcol at its closed value.
    const body = document.querySelector('.reader-body');
    new MutationObserver(() => { if (body.style.getPropertyValue('--gcol') !== v) body.style.setProperty('--gcol', v); }).observe(body, {attributes: true, attributeFilter: ['style']});
   }, before);
   await openWord(p, '[data-gate="word"]');
   const open = await gcol();
   const moved = await p.evaluate(() => document.querySelector('[data-gate="word"]').getBoundingClientRect().top);
   assert(open !== before, `panel open did not change --gcol (${before})`);
   assert(Math.abs(moved - target) < 4, `the clicked word moved ${(moved - target).toFixed(1)}px on panel open`);
   const w0 = await greekW();
   await p.locator('[data-aa]').click();
   await p.locator('.b-aa [aria-label="Greek font"] button', {hasText: 'Cardo'}).click();
   await p.waitForFunction(w => document.querySelector('.reader-body').style.getPropertyValue('--greek-w') !== w, w0, {timeout: 8000}).catch(() => {});
   const w1 = await greekW();
   assert(w1 !== w0, `Cardo did not change --greek-w (${w0})`);
   await p.locator('[data-aa]').click();
   const g1 = await gcol();
   await p.setViewportSize({width: 961, height: 800});
   await p.waitForFunction(g => document.querySelector('.reader-body').style.getPropertyValue('--gcol') !== g, g1, {timeout: 3000}).catch(() => {});
   const g2 = await gcol();
   assert(g2 !== g1, `resize to D961 did not change --gcol (${g1})`);
   console.log(`R-R6 --gcol ${before} → ${open} (panel) → ${g2} (961); --greek-w ${w0} → ${w1} (Cardo); word moved ${(moved - target).toFixed(1)}px`);
   return 4;
  } finally { await close(p); }
 },
 'R-R7': async () => {
  let n = 0;
  for (const size of ['D1440', 'D1280']) for (const trans of ['', 'compare']) {
   const p = await openReader(size, READER + (trans ? `?trans=${trans}` : ''));
   try {
    await setView(p, 'both');
    if (prove && proofCase !== 'late-panel' && trans) await style(p, '.dir-b .b-text.word-open.trans-compare{padding-right:72px!important}');
    const pad = () => p.locator('.reader-body').evaluate(el => { const s = getComputedStyle(el); return `${s.paddingLeft} ${s.paddingRight}`; });
    const closed = await pad();
    await openWord(p);
    const label = `${size}${trans ? ' Compare' : ''}`;
    const under = {lines: 0, boxes: 0, gap: Infinity, steps: 0};
    const end = await p.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
    const step = await p.evaluate(() => Math.max(1, innerHeight - document.querySelector('.b-rh').offsetHeight - 40));
    if (prove && proofCase === 'late-panel') await p.locator('.b-ec').last().evaluate(el => {
     const side = document.querySelector('.b-side').getBoundingClientRect();
     el.style.cssText += `;position:relative;left:${side.left - el.getBoundingClientRect().left + 10}px`;
    });
    for (let y = 0; ; y = Math.min(end, y + step)) {
     await p.evaluate(y => window.scrollTo(0, y), y);
     await p.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
     const sample = await p.evaluate(() => {
     const side = document.querySelector('.b-side').getBoundingClientRect();
     let lines = 0, boxes = 0;
     for (const ec of document.querySelectorAll('.reader-body .b-ec')) {
      const walker = document.createTreeWalker(ec, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
       if (!node.textContent.trim()) continue;
       const range = document.createRange(); range.selectNodeContents(node);
       for (const r of range.getClientRects()) {
        if (r.bottom < 0 || r.top > innerHeight) continue;
        boxes++;
        if (r.right > side.left + .5 && r.left < side.right && r.bottom > side.top && r.top < side.bottom) lines++;
       }
      }
     }
     return {lines, boxes, gap: parseFloat(getComputedStyle(document.querySelector('.reader-body .b-row')).columnGap)};
    });
     under.lines += sample.lines; under.boxes += sample.boxes; under.gap = Math.min(under.gap, sample.gap); under.steps++;
     if (y === end) break;
    }
    console.log(`R-R7 ${label} scroll steps=${under.steps} English boxes examined=${under.boxes} under panel=${under.lines}`);
    assert(under.boxes > 0, `${label} examined=0 English line boxes`);
    assert(under.lines === 0, `${label} ${under.lines} English line boxes under the panel`);
    assert(under.gap >= 56, `${label} column gap ${under.gap}px with the panel open`);
    await p.evaluate(() => window.scrollTo(0, 2000));
    await p.waitForTimeout(150);
    const place = await p.evaluate(() => ({side: document.querySelector('.b-side').getBoundingClientRect(), head: document.querySelector('.b-rh').getBoundingClientRect().bottom, h: innerHeight}));
    assert(Math.abs(place.side.top - place.head) <= 1 && Math.abs(place.side.bottom - place.h) <= 1 && Math.abs(place.side.width - 400) <= 1, `${label} panel top=${place.side.top} head=${place.head} bottom=${place.side.bottom}/${place.h} width=${place.side.width}`);
    // Over text: the text does not move.
    await p.locator('[data-aa]').click();
    await p.locator('.b-aa button', {hasText: 'Over text'}).click();
    await p.locator('[data-aa]').click();
    assert(await p.locator('.b-side').count() === 1, `${label} the panel closed with Aa`);
    await p.waitForTimeout(150);
    assert(await pad() === closed, `${label} Over text moved the text: ${await pad()} vs closed ${closed}`);
    n += 3;
   } finally { await close(p); }
  }
  return n;
 },
 'R-R8': async () => {
  let n = 0;
  for (const size of ['S844', 'S960', 'W900', 'P390']) {
   const p = await openReader(size);
   try {
    if (prove && size === 'S844') await style(p, '.dir-b .b-side{top:auto!important;height:60%!important}');
    const pad = () => p.locator('.reader-body').evaluate(el => { const s = getComputedStyle(el); return `${s.paddingLeft} ${s.paddingRight}`; });
    const closed = await pad();
    await p.locator('[data-aa]').click();
    await p.locator('.b-aa').waitFor();
    const row = await p.locator('.b-aa [aria-label="Word panel"]').count();
    await p.keyboard.press('Escape');
    if (size !== 'P390') assert(row === 0, `${size} Aa has a Word panel row (innerWidth=${await p.evaluate(() => innerWidth)})`);
    await openWord(p);
    const g = await p.evaluate(() => ({side: document.querySelector('.b-side').getBoundingClientRect(), head: document.querySelector('.b-rh').getBoundingClientRect().bottom, h: innerHeight}));
    if (size === 'P390') {
     assert(Math.abs(g.side.bottom - g.h) <= 1 && g.side.top > g.head + 10, `P390 panel is not a bottom sheet (top=${g.side.top} bottom=${g.side.bottom}/${g.h})`);
    } else {
     assert(await pad() === closed, `${size} panel pushed the text: ${await pad()} vs closed ${closed}`);
     assert(Math.abs(g.side.top - g.head) <= 1, `${size} panel anchored to the bottom (top=${g.side.top}, head=${g.head})`);
    }
    n++;
   } finally { await close(p); }
  }
  return n;
 },
 'R-R10': async () => {
  // 12 Nov: Greek Literata, Gentium, Cardo; English Literata, EB Garamond.
  // Cardo and EB Garamond load only when picked; GFS Didot is gone.
  let n = 0;
  const FACES = {Cardo: /family=Cardo\b|\/s\/cardo\//i, 'EB Garamond': /family=EB\+Garamond|\/s\/ebgaramond\//i, 'GFS Didot': /gfsdidot|GFS\+Didot/i};
  const watch = p => { p.requests = []; p.on('request', r => p.requests.push(r.url())); };
  const fetched = async (p, face) => p.requests.some(u => FACES[face].test(u)) || p.evaluate(src => performance.getEntriesByType('resource').some(r => new RegExp(src, 'i').test(r.name)), FACES[face].source);
  const family = (p, sel) => p.locator(sel).first().evaluate(e => getComputedStyle(e).fontFamily);
  const pressed = (aa, row) => aa.locator(`[aria-label="${row}"] button[aria-pressed="true"]`).allInnerTexts();
  const p = await openReader('D1440', READER + '?hlg=' + encodeURIComponent('ἀγαθόν'));
  try {
   watch(p);
   if (prove && proofCase === 'eager-cardo') await p.evaluate(() => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Cardo&display=swap'; document.head.append(l); });
   await p.waitForTimeout(300);
   for (const face of Object.keys(FACES)) assert(!(await fetched(p, face)), `${face} requested on a fresh load`);
   if (prove && proofCase === 'bold-hit') await style(p, '.dir-b .b-gc .tok.hit{font-weight:700!important}');
   const greek = await p.evaluate(() => [...document.querySelectorAll('.reader-body .b-gc, .reader-body .b-gc *')].map(e => { const s = getComputedStyle(e); return {w: Number(s.fontWeight), st: s.fontStyle, c: e.className}; }));
   const hits = await p.locator('.b-gc .tok.hit').count();
   assert(greek.length > 0 && hits > 0, `examined=${greek.length} Greek elements, ${hits} hits`);
   const heavy = greek.filter(g => g.w > 400 || g.st !== 'normal');
   assert(!heavy.length, `${heavy.length} Greek elements bold or italic, e.g. ${JSON.stringify(heavy[0])}`);
   n += greek.length;
   await p.locator('[data-aa]').click();
   const aa = p.locator('.b-aa');
   if (prove && proofCase === 'didot-row') await aa.locator('[aria-label="Greek font"]').evaluate(g => g.insertAdjacentHTML('beforeend', '<button type="button" aria-pressed="false">Didot <span lang="grc">αβγ</span></button>'));
   if (prove && proofCase === 'english-apart') await aa.evaluate(el => { const row = el.querySelector('[aria-label="English font"]'); const label = row.previousElementSibling; el.append(label, row); });
   const text = await aa.textContent();
   for (const want of ['Greek font', 'English font', 'Text size', 'Line spacing', 'Column width', 'Word panel', 'Keep English visible', 'Over text', 'Add the citation when I copy Greek', 'Print', 'Reset'])
    assert(text.includes(want), `Aa lacks "${want}"`);
   assert(await aa.locator('[aria-label="Reading view"] button').count() === 3, 'Aa lacks the three views');
   const faces = await aa.locator('[aria-label="Greek font"] button').allInnerTexts();
   assert(faces.length === 3 && /^Literata/.test(faces[0]) && /^Gentium/.test(faces[1]) && /^Cardo/.test(faces[2]), `Aa Greek fonts ${JSON.stringify(faces)}, expected Literata, Gentium, Cardo`);
   // The English row comes straight after the Greek one: its label, then its buttons.
   const order = await aa.evaluate(el => { const g = el.querySelector('[aria-label="Greek font"]'); const a = g?.nextElementSibling, b = a?.nextElementSibling; return [a?.textContent.trim(), b?.getAttribute('aria-label')]; });
   assert(order[0] === 'English font' && order[1] === 'English font', `the row after the Greek font row is ${JSON.stringify(order)}, expected the English font row`);
   const efaces = await aa.locator('[aria-label="English font"] button').allInnerTexts();
   assert(efaces.length === 2 && /^Literata/.test(efaces[0]) && /^EB Garamond/.test(efaces[1]), `Aa English fonts ${JSON.stringify(efaces)}, expected Literata, EB Garamond`);
   for (const row of ['Greek font', 'English font']) { const on = await pressed(aa, row); assert(on.length === 1 && /^Literata/.test(on[0]), `${row} default ${JSON.stringify(on)}, expected Literata`); }
   await aa.locator('[aria-label="Greek font"] button', {hasText: 'Cardo'}).click();
   await aa.locator('[aria-label="English font"] button', {hasText: 'EB Garamond'}).click();
   await p.waitForTimeout(1500);
   assert(await fetched(p, 'Cardo'), 'picking Cardo requested no font');
   assert(await fetched(p, 'EB Garamond'), 'picking EB Garamond requested no font');
   const picked = await p.locator('.reader-body').evaluate(e => [e.dataset.gfont, e.dataset.efont]);
   assert(picked[0] === 'cardo' && /^"?Cardo/.test(await family(p, '.reader-body .b-gc')), `Cardo not applied: data-gfont=${picked[0]} ${await family(p, '.reader-body .b-gc')}`);
   assert(picked[1] === 'garamond' && /^"?EB Garamond/.test(await family(p, '.reader-body .b-ec')), `EB Garamond not applied: data-efont=${picked[1]} ${await family(p, '.reader-body .b-ec')}`);
   await aa.locator('button', {hasText: 'Reset'}).click();
   await p.waitForTimeout(200);
   const reset = await p.locator('.reader-body').evaluate(e => [e.dataset.gfont, e.dataset.efont]);
   const gf = await family(p, '.reader-body .b-gc'), ef = await family(p, '.reader-body .b-ec');
   assert(reset[0] === 'literata' && /^"?Literata/.test(gf), `Reset left the Greek in ${gf} (data-gfont=${reset[0]})`);
   assert(reset[1] === 'literata' && /^"?Literata/.test(ef), `Reset left the English in ${ef} (data-efont=${reset[1]})`);
   for (const row of ['Greek font', 'English font']) { const on = await pressed(aa, row); assert(on.length === 1 && /^Literata/.test(on[0]), `after Reset ${row} pressed ${JSON.stringify(on)}`); }
   assert(!(await fetched(p, 'GFS Didot')), 'GFS Didot requested');
   n += 8;
  } finally { await close(p); }
  // A reader who saved GFS Didot before 12 Nov comes back to Literata.
  const saved = await open('D1440', 'light', READER, {storage: {'reader-gfont': 'didot'}});
  try {
   await readerReady(saved);
   if (prove && proofCase === 'didot-kept') await saved.locator('.reader-body').evaluate(e => { e.dataset.gfont = 'didot'; });
   const g = await saved.locator('.reader-body').evaluate(e => [e.dataset.gfont, getComputedStyle(e.querySelector('.b-gc')).fontFamily]);
   assert(g[0] === 'literata' && /^"?Literata/.test(g[1]), `saved reader-gfont=didot: data-gfont=${g[0]} Greek in ${g[1]}, expected Literata`);
   assert(!(await saved.evaluate(() => performance.getEntriesByType('resource').some(r => /gfsdidot|GFS\+Didot/i.test(r.name)))), 'saved reader-gfont=didot requested GFS Didot');
   n++;
  } finally { await close(saved); }
  const phone = await openReader('P390');
  try {
   await phone.locator('[data-aa]').click();
   const text = await phone.locator(".b-aa").textContent();
   assert(!text.includes('Column width') && !text.includes('Word panel') && text.includes('Translation'), 'P390 Aa rows: column width or word panel shown, or translations missing');
   assert(text.includes('English font'), 'P390 Aa lacks "English font"');
   n++;
  } finally { await close(phone); }
  return n;
 },
 'R-A4': async () => {
  const p = await openReader('D1440');
  try {
   if (prove && proofCase === 'no-tabindex') await p.evaluate(() => document.querySelectorAll('.tok').forEach(t => t.removeAttribute('tabindex')));
   // Hides the shell's preventDefault from the panel: Escape then closes both.
   if (prove && proofCase === 'escape-layers') await p.evaluate(() => window.addEventListener('keydown', e => Object.defineProperty(e, 'defaultPrevented', {get: () => false}), true));
   const stops = await p.evaluate(() => ({greek: [...document.querySelectorAll('.b-gc .b-lt [tabindex="0"], .b-gc .b-lt a[href], .b-gc .b-lt button')].filter(e => e.getClientRects().length).length, tokens: document.querySelectorAll('.b-gc .tok').length, roles: document.querySelectorAll('.b-gc .tok:not([role="button"])').length}));
   assert(stops.tokens > 0 && stops.roles === 0, `examined=${stops.tokens} tokens; ${stops.roles} without role=button`);
   await p.locator('[data-theme-toggle]').focus();
   let reached = null;
   for (let i = 0; i < 12 && reached === null; i++) {
    await p.keyboard.press('Tab');
    reached = await p.evaluate(() => document.activeElement?.matches('.b-gc .tok') ? [...document.querySelectorAll('.b-gc .tok')].indexOf(document.activeElement) : null);
   }
   assert(reached !== null, 'Tab from the head never reached a Greek word');
   assert(stops.greek === 1, `the Greek text adds ${stops.greek} tab stops, expected 1`);
   await p.keyboard.press('ArrowRight');
   await p.keyboard.press('ArrowRight');
   const at = await p.evaluate(() => { const t = document.activeElement; const toks = [...document.querySelectorAll('.b-gc .tok')].filter(e => e.offsetParent); return {i: toks.indexOf(t), text: t.textContent, ring: getComputedStyle(t).outlineStyle !== 'none' && parseFloat(getComputedStyle(t).outlineWidth) >= 2}; });
   assert(at.i === reached + 2, `ArrowRight twice moved to word ${at.i}, expected ${reached + 2}`);
   assert(at.ring, 'the focused word shows no focus ring');
   await p.keyboard.press('Enter');
   await p.locator('.b-side').waitFor({timeout: 3000});
   assert(await p.locator('.b-side .b-w').innerText() === at.text, 'Enter opened the panel on another word');
   await p.keyboard.press('Escape');
   await p.waitForTimeout(300);
   assert(await p.locator('.b-side').count() === 0, 'Escape left the panel open');
   const back = await p.evaluate(() => document.activeElement?.textContent);
   assert(back === at.text && await p.evaluate(() => document.activeElement?.matches('.tok')), `Escape returned focus to ${back}`);
   // One Escape closes only the top layer: Contents over the open panel.
   await p.keyboard.press('Enter');
   await p.locator('.b-side').waitFor({timeout: 3000});
   await p.locator('[data-toc-toggle]').click();
   assert(await p.locator('#toc-sidebar').isVisible(), 'Contents did not open over the word panel');
   await p.keyboard.press('Escape');
   await p.waitForTimeout(300);
   const layers = await p.evaluate(() => ({toc: !document.getElementById('toc-sidebar').hidden, panel: !!document.querySelector('.b-side'), focus: document.activeElement?.matches('[data-toc-toggle]')}));
   assert(!layers.toc, 'Escape left Contents open over the word panel');
   assert(layers.panel, 'Escape with Contents open closed the word panel too');
   assert(layers.focus, 'Escape with Contents open did not return focus to the Contents toggle');
   // Help over the open panel. Opened by its event: a click outside the
   // panel would close the panel first.
   const hideSpent = () => p.evaluate(() => window.addEventListener('keydown', e => Object.defineProperty(e, 'defaultPrevented', {get: () => false}), true));
   if (prove && proofCase === 'escape-help') await hideSpent();
   await p.evaluate(() => window.dispatchEvent(new CustomEvent('open-help')));
   await p.locator('.help-modal').waitFor({timeout: 3000});
   await p.keyboard.press('Escape');
   await p.waitForTimeout(300);
   const help = await p.evaluate(() => ({help: !!document.querySelector('.help-modal'), panel: !!document.querySelector('.b-side')}));
   assert(!help.help, 'Escape left Help open over the word panel');
   assert(help.panel, 'Escape with Help open closed the word panel too');
   // A footnote over the open panel, opened from the keyboard for the same reason.
   const mark = p.locator('.b-ec .fn-marker >> visible=true').first();
   assert(await mark.count(), 'examined=0 footnote marks for the Escape check');
   if (prove && proofCase === 'escape-note') await hideSpent();
   await mark.focus();
   await p.locator('.b-note').waitFor({timeout: 3000});
   await p.waitForTimeout(150);
   await p.keyboard.press('Escape');
   await p.waitForTimeout(300);
   const note = await p.evaluate(() => ({note: !!document.querySelector('.b-note'), panel: !!document.querySelector('.b-side')}));
   assert(!note.note, 'Escape left the footnote open over the word panel');
   assert(note.panel, 'Escape with a footnote open closed the word panel too');
   return 12;
  } finally { await close(p); }
 },
 // ── 12 Nov 2026 reader rulings (R-R11–R-R17, R-A5) ──
 'R-R11': async () => {
  // Literata reader text at 300; Gentium, Cardo and EB Garamond at 400.
  let n = 0;
  const p = prove && proofCase === 'no-face'
   ? await open('D1440', 'light', READER, false, false, false, '**/css2?family=Gentium*').then(async p => { await readerReady(p); return p; })
   : await openReader('D1440');
  try {
   if (prove && proofCase === 'english-400') await style(p, '.dir-b .b-ec{font-weight:400!important}');
   if (prove && proofCase === 'greek-400') await style(p, '.dir-b .b-gc, .dir-b .b-gc *{font-weight:400!important}');
   const read = () => p.evaluate(() => {
    const pick = sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length).map(e => { const s = getComputedStyle(e); return {el: e.tagName + '.' + [...e.classList].join('.'), w: Number(s.fontWeight), f: s.fontFamily}; });
    return {greek: pick('.reader-body .b-gc .b-lt, .reader-body .b-gc .b-lt *'), english: pick('.reader-body .b-ec, .reader-body .b-ec .overlay-prose, .reader-body .b-ec .bk-seg, .reader-body .b-ec .fn-anchor')};
   });
   // A face is drawn only when the browser loaded it: Literata 300 for Greek and for Latin.
   const loaded = (fam, weight) => p.evaluate(([fam, weight]) => {
    const faces = [...document.fonts].filter(f => f.family.replace(/"/g, '') === fam && f.style === 'normal' && f.status === 'loaded' && f.weight.split(' ').map(Number).some((w, i, a) => a.length === 2 ? weight >= a[0] && weight <= a[1] : w === weight));
    return {greek: faces.some(f => /U\+(370|1F00)/i.test(f.unicodeRange)), latin: faces.some(f => /U\+0-FF/i.test(f.unicodeRange) || f.unicodeRange === 'U+0-10FFFF')};
   }, [fam, weight]);
   const expect = (rows, label, fam, weight) => {
    assert(rows.length > 0, `${label} examined=0 elements`);
    const bad = rows.filter(r => r.w !== weight || !new RegExp('^"?' + fam).test(r.f));
    assert(!bad.length, `${label} ${bad.length} of ${rows.length} elements not ${fam} ${weight}, e.g. ${bad[0]?.el} weight=${bad[0]?.w} family=${bad[0]?.f}`);
    n += rows.length;
   };
   let r = await read();
   expect(r.greek, 'Literata Greek', 'Literata', 300);
   expect(r.english, 'Literata English', 'Literata', 300);
   const lit = await loaded('Literata', 300);
   assert(lit.greek && lit.latin, `no loaded Literata 300 face for ${!lit.greek ? 'Greek' : 'Latin'}`);
   await p.locator('[data-aa]').click();
   const aa = p.locator('.b-aa');
   for (const [row, face, fam, part, label] of [['Greek font', 'Gentium', 'Gentium Book Plus', 'greek', 'Gentium Greek'], ['Greek font', 'Cardo', 'Cardo', 'greek', 'Cardo Greek'], ['English font', 'EB Garamond', 'EB Garamond', 'english', 'EB Garamond English']]) {
    await aa.locator(`[aria-label="${row}"] button`, {hasText: face}).click();
    await p.waitForTimeout(1500);
    await settleFonts(p);
    if (prove && proofCase === 'cardo-300' && face === 'Cardo') await style(p, '.dir-b .b-text[data-gfont="cardo"] .b-gc, .dir-b .b-text[data-gfont="cardo"] .b-gc *{font-weight:300!important}');
    r = await read();
    expect(r[part], label, fam, 400);
    const f = await loaded(fam, 400);
    assert(part === 'greek' ? f.greek : f.latin, `no loaded ${fam} 400 face for ${part === 'greek' ? 'Greek' : 'Latin'}`);
   }
   console.log(`R-R11 Literata 300, Gentium/Cardo/EB Garamond 400: elements examined=${n}`);
   return n;
  } finally { await close(p); }
 },
 'R-R12': async () => {
  // Both view: no blank line between English paragraphs; English view keeps .85em.
  // Every paragraph keeps its 1.3em first-line indent.
  let n = 0;
  const p = await openReader('D1440');
  try {
   for (const view of ['both', 'english']) {
    await setView(p, view);
    if (prove && proofCase === 'both-gap' && view === 'both') await style(p, '.dir-b .b-text[data-view="both"] .b-ec .para-br{height:.85em!important}');
    if (prove && proofCase === 'english-flat' && view === 'english') await style(p, '.dir-b .b-ec .para-br{height:0!important}');
    if (prove && proofCase === 'no-indent' && view === 'both') await style(p, '.dir-b .b-ec .para-br + .bk-seg::before{width:0!important}');
    const r = await p.evaluate(() => {
     const ok = t => t.textContent.trim() && !t.parentElement.closest('.bk-num,.fn-marker');
     const charRect = (t, last) => { const s = t.textContent, i = last ? s.search(/\S\s*$/) : s.search(/\S/); const rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + 1); return rg.getBoundingClientRect(); };
     const out = [];
     for (const br of document.querySelectorAll('.reader-body .b-ec .para-br')) {
      if (!br.getClientRects().length) continue;
      const ec = br.closest('.b-ec'), cs = getComputedStyle(ec), fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight);
      const w = document.createTreeWalker(ec, NodeFilter.SHOW_TEXT, {acceptNode: t => ok(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP});
      w.currentNode = br; const prev = w.previousNode();
      w.currentNode = br; const next = w.nextNode();
      if (!next) continue;
      const a = next && charRect(next, false), b = prev && charRect(prev, true);
      const ecLeft = ec.getBoundingClientRect().left + ec.clientLeft + parseFloat(cs.paddingLeft);
      out.push({fn: next.textContent.trim().slice(0, 24), h: br.getBoundingClientRect().height, fs, gap: b ? a.top - b.top - lh : null, indent: br.nextElementSibling?.matches('.bk-seg') ? a.left - ecLeft : null});
     }
     return out;
    });
    assert(r.length > 0, `${view} examined=0 English paragraph breaks`);
    const gaps = r.filter(x => x.gap !== null), indents = r.filter(x => x.indent !== null);
    assert(gaps.length > 0 && indents.length > 0, `${view} examined=${gaps.length} gaps, ${indents.length} indents`);
    const want = view === 'both' ? 0 : .85;
    for (const x of r) assert(Math.abs(x.h - want * x.fs) <= 1, `${view} paragraph break before "${x.fn}" height=${f1(x.h)}px, expected ${f1(want * x.fs)}`);
    for (const x of gaps) assert(Math.abs(x.gap - want * x.fs) <= 1, `${view} paragraph "${x.fn}" starts ${f1(x.gap)}px below the line before, expected ${f1(want * x.fs)}`);
    for (const x of indents) assert(Math.abs(x.indent - 1.3 * x.fs) <= 1, `${view} paragraph "${x.fn}" first line indent=${f1(x.indent)}px, expected 1.3em=${f1(1.3 * x.fs)}`);
    console.log(`R-R12 ${view} paragraph breaks=${r.length} gaps=${gaps.length} indents=${indents.length}`);
    n += r.length;
   }
   return n;
  } finally { await close(p); }
 },
 'R-R13': async () => {
  // A Greek line split by a chapter start (.b-gl.cont, EN 1094a18): its text starts 2.5em in.
  let n = 0;
  for (const size of ['D1440', 'P390']) {
   const p = await openReader(size);
   try {
    for (const view of ['greek', 'both']) {
     await setView(p, view);
     if (prove && proofCase === 'flush') await style(p, '.dir-b .b-gl.cont .b-lt{padding-left:0!important}');
     const r = await p.evaluate(() => [...document.querySelectorAll('.reader-body .b-gl.cont')].filter(gl => gl.getClientRects().length).map(gl => {
      const lt = gl.querySelector(':scope > .b-lt');
      const w = document.createTreeWalker(lt, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && !t.textContent.trim());
      const i = t.textContent.search(/\S/), rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + 1);
      return {id: gl.id, inset: rg.getBoundingClientRect().left - gl.getBoundingClientRect().left, em: parseFloat(getComputedStyle(lt).fontSize)};
     }));
     assert(r.length > 0, `${size} ${view} examined=0 continued Greek lines`);
     assert(r.some(x => x.id === 'L1094a-18-c'), `${size} ${view} no continued line at 1094a18: ${r.map(x => x.id)}`);
     for (const x of r) assert(Math.abs(x.inset - 2.5 * x.em) <= 1, `${size} ${view} continued line ${x.id} text starts ${f1(x.inset)}px in, expected 2.5em=${f1(2.5 * x.em)}`);
     n += r.length;
    }
   } finally { await close(p); }
  }
  return n;
 },
 'R-R14': async () => {
  // Desktop line numbers: 15px sans, faint (column labels red), each number's
  // baseline within 1px of its line's, at text size and line spacing 80–140%.
  let n = 0, worst = 0;
  const t = Object.fromEntries(names.map((k, i) => [k, hexRgb(tokens.light[i])]));
  const combos = [[1, 1], ...[.75, 1, 1.4].flatMap(fs => [.8, 1, 1.4].map(lh => [fs, lh])).filter(([a, b]) => !(a === 1 && b === 1))];
  for (const [fs, lh] of combos) {
   const p = await open('D1440', 'light', READER, {storage: {'reader-fs-EN': String(fs), 'reader-lh-EN': String(lh)}});
   try {
    await readerReady(p);
    const applied = await p.locator('.reader-body').evaluate(e => [e.style.getPropertyValue('--fs'), e.style.getPropertyValue('--lh')]);
    assert(Number(applied[0]) === fs && Number(applied[1]) === lh, `text size ${fs} line spacing ${lh} not applied: --fs=${applied[0]} --lh=${applied[1]}`);
    if (prove && proofCase === 'fixed-top') await style(p, '.dir-b .b-ln, .dir-b .b-ec .bk-num{--b-number-top:13.24px!important}');
    if (prove && proofCase === 'old-greek') await style(p, '.dir-b .b-ln{top:.15em!important;font:inherit!important}');
    if (prove && proofCase === 'old-english') await style(p, '.dir-b .b-ec .bk-num{margin-top:.55em!important;font-size:12.5px!important}');
    if (prove && proofCase === 'faint') await style(p, '.dir-b .b-ln:not(.col){color:var(--mid)!important}');
    if (prove && proofCase === 'col-faint') await style(p, '.dir-b .b-ln.col{color:var(--faint)!important}');
    if (prove && proofCase === 'small') await style(p, '.dir-b .b-ec .bk-num{font-family:Literata!important}');
    const bad = [];
    for (const view of ['greek', 'both', 'english']) {
     await setView(p, view);
     const r = await p.evaluate(readNumberBaselines);
     const kinds = view === 'both' ? ['Greek', 'English'] : view === 'greek' ? ['Greek'] : ['English'];
     for (const k of kinds) assert(r.some(x => x.kind === k), `fs=${fs} lh=${lh} ${view} examined=0 ${k} line numbers`);
     for (const x of r) {
      const what = `${view} ${x.kind} ${x.col ? 'column label' : 'number'} "${x.text}"`;
      worst = Math.max(worst, Math.abs(x.d));
      if (Math.abs(x.d) > 1) bad.push(`${what} baseline ${x.d > 0 ? 'below' : 'above'} its line by ${f1(Math.abs(x.d))}px`);
      if (x.size !== '15px' || !/^"?Sofia Sans/.test(x.family)) bad.push(`${what} ${x.size} ${x.family.split(',')[0]}, expected 15px Sofia Sans`);
      if (!(x.col ? [t.red, t['red-ink']] : [t.faint]).includes(x.color)) bad.push(`${what} color=${x.color}, expected ${x.col ? 'red' : '--faint'}`);
     }
     n += r.length;
    }
    // The first number with each kind of fault, so one fault does not hide another.
    const seen = new Set();
    const kinds = bad.filter(b => { const k = b.replace(/"[^"]*"/, '').replace(/[\d.]+px/g, ''); return !seen.has(k) && seen.add(k); });
    assert(!bad.length, `fs=${fs} lh=${lh}: ${bad.length} line numbers wrong: ${kinds.join('; ')}`);
   } finally { await close(p); }
  }
  console.log(`R-R14 numbers examined=${n} over ${combos.length} size/spacing pairs; worst baseline offset ${worst.toFixed(2)}px`);
  return n;
 },
 'R-R15': async () => {
  // Phone line numbers stay 11px (12px in Both); level with their line at
  // text size and line spacing 80–140%, the same matrix as R-R14. Each cell's
  // offsets are printed, so a fault off 100% shows its size.
  let n = 0;
  const exempt = [], failures = [];
  const combos = [[1, 1], ...[.75, 1, 1.4].flatMap(fs => [.8, 1, 1.4].map(lh => [fs, lh])).filter(([a, b]) => !(a === 1 && b === 1))];
  for (const [fs, lh] of combos) {
   const p = await open('P390', 'light', READER, {storage: {'reader-fs-EN': String(fs), 'reader-lh-EN': String(lh)}});
   const bad = [], spread = [];
   try {
    await readerReady(p);
    const applied = await p.locator('.reader-body').evaluate(e => [e.style.getPropertyValue('--fs'), e.style.getPropertyValue('--lh')]);
    assert(Number(applied[0]) === fs && Number(applied[1]) === lh, `P390 text size ${fs} line spacing ${lh} not applied: --fs=${applied[0]} --lh=${applied[1]}`);
    if (prove && proofCase === 'english-size') await style(p, '.dir-b .b-ec .bk-num{font-size:8px!important}');
    if (prove && proofCase === 'greek-low') await style(p, '.dir-b .b-text[data-view="greek"] .b-ln{top:calc(var(--b-number-top) + 6px)!important}');
    // Right at 100% (Greek view, 11px numbers), wrong at every other size and spacing.
    if (prove && proofCase === 'fixed-top') await style(p, '.dir-b .b-ln, .dir-b .b-ec .bk-num{--b-number-top:13px!important}');
    for (const view of ['greek', 'both', 'english']) {
     await setView(p, view);
     const r = await p.evaluate(readNumberBaselines);
     const kinds = view === 'both' ? ['Greek', 'English'] : view === 'greek' ? ['Greek'] : ['English'];
     for (const k of kinds) assert(r.some(x => x.kind === k), `fs=${fs} lh=${lh}: P390 ${view} examined=0 ${k} line numbers`);
     for (const k of kinds) {
      // Both on a phone sets the column label above its line on purpose (b.css: .b-ln.col top:-1.25em).
      const xs = r.filter(x => x.kind === k && !(view === 'both' && x.col));
      if (fs === 1 && lh === 1) exempt.push(...r.filter(x => x.kind === k && view === 'both' && x.col).map(x => x.text));
      const ds = xs.map(x => x.d);
      spread.push(`${view} ${k} ${f1(Math.min(...ds))}..${f1(Math.max(...ds))}`);
      for (const x of xs) {
       const size = view === 'both' ? '12px' : '11px';
       if (x.size !== size) bad.push(`${view} ${x.kind} number "${x.text}" font-size=${x.size}, expected ${size}`);
       if (Math.abs(x.d) > 1) bad.push(`${view} ${x.kind} number "${x.text}" baseline ${x.d > 0 ? 'below' : 'above'} its line by ${f1(Math.abs(x.d))}px`);
       n++;
      }
     }
    }
   } finally { await close(p); }
   console.log(`R-R15 P390 fs=${fs} lh=${lh} baseline offsets px (+ below its line): ${spread.join('; ')}`);
   // One line per kind of fault, so a fault on one number does not hide another.
   const seen = new Set();
   const kinds = bad.filter(b => { const k = b.replace(/"[^"]*"/, '').replace(/[\d.]+px/g, ''); return !seen.has(k) && seen.add(k); });
   if (bad.length) failures.push(`fs=${fs} lh=${lh}: P390 ${bad.length} line numbers wrong: ${kinds.join('; ')}`);
  }
  console.log(`R-R15 P390 numbers examined=${n} over ${combos.length} size/spacing pairs; exempt (Both column labels set above the line)=${exempt.length}`);
  assert(!failures.length, failures.join(' | '));
  return n;
 },
 'R-R16': async () => {
  // A footnote box stays on its marker as the page scrolls, and closes when the marker leaves the screen.
  const p = await openReader('D1440');
  try {
   const trans = await p.locator('.reader-body .b-ec').first().getAttribute('data-trans');
   assert(trans === 'ostwald', `EN book 1 English is ${trans}, expected Ostwald`);
   if (prove && proofCase === 'pinned') await p.evaluate(() => window.addEventListener('scroll', e => e.stopImmediatePropagation(), true));
   if (prove && proofCase === 'stays-open') await p.evaluate(() => window.addEventListener('scroll', e => { if (document.querySelector('[data-gate-fn]').getBoundingClientRect().bottom <= 0) e.stopImmediatePropagation(); }, true));
   const mark = await p.evaluate(() => {
    const marks = [...document.querySelectorAll('.reader-body .b-ec .fn-marker[data-fn-trans="ostwald"]')].filter(m => m.getClientRects().length);
    const m = marks[Math.min(5, marks.length - 1)];
    if (!m) return {n: 0};
    m.dataset.gateFn = '';
    window.scrollTo(0, scrollY + m.getBoundingClientRect().top - 320);
    return {n: marks.length, fn: m.dataset.fn};
   });
   assert(mark.n > 0, 'examined=0 Ostwald footnote markers');
   await p.waitForTimeout(200);
   await p.locator('[data-gate-fn]').click();
   await p.locator('.b-note').waitFor({timeout: 3000});
   await p.waitForTimeout(300);
   const read = () => p.evaluate(() => { const m = document.querySelector('[data-gate-fn]').getBoundingClientRect(), b = document.querySelector('.b-note')?.getBoundingClientRect(); return {y: scrollY, mb: m.bottom, bt: b ? b.top : null}; });
   const settle = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => p.waitForTimeout(150));
   const at = await read();
   assert(Math.abs(at.bt - at.mb - 8) <= 2, `footnote ${mark.fn} at open: box top=${f1(at.bt)} marker bottom=${f1(at.mb)}, expected an 8px gap`);
   await p.evaluate(() => window.scrollBy(0, 200));
   await settle();
   const moved = await read();
   assert(moved.y - at.y === 200, `the page scrolled ${moved.y - at.y}px, expected 200`);
   assert(moved.bt !== null, `footnote ${mark.fn} closed on a 200px scroll with its marker in view`);
   assert(Math.abs((moved.bt - moved.mb) - (at.bt - at.mb)) <= 2, `footnote ${mark.fn} box left its marker: gap ${f1(at.bt - at.mb)}px at open, ${f1(moved.bt - moved.mb)}px after a 200px scroll`);
   await p.evaluate(() => window.scrollBy(0, document.querySelector('[data-gate-fn]').getBoundingClientRect().bottom + 40));
   await settle();
   const gone = await read();
   assert(gone.mb < 0, `the marker is still on screen (bottom=${f1(gone.mb)})`);
   assert(gone.bt === null, `footnote ${mark.fn} box still open with its marker out of view (marker bottom=${f1(gone.mb)}, box top=${f1(gone.bt)})`);
   console.log(`R-R16 footnote ${mark.fn}: gap ${f1(at.bt - at.mb)}px at open, ${f1(moved.bt - moved.mb)}px after 200px; closed at marker bottom=${f1(gone.mb)}`);
   return 3;
  } finally { await close(p); }
 },
 'R-R17': async () => {
  // Reader red: only chapter numerals, column labels and footnote markers.
  // The named groups below hold their colours; then every visible text run on
  // the page (Both view), generated ::before/::after text included, is scanned
  // for red: --red, --red-ink, or any colour whose red channel leads green and
  // blue by 90 or more. Allowed red, each by an earlier ruling:
  const allowedRed = {'.b-chn': 'chapter numerals', '.b-ln.col': 'Bekker column labels', '.fn-marker': 'footnote markers'};
  let n = 0;
  for (const theme of ['light', 'dark']) {
   const t = Object.fromEntries(names.map((k, i) => [k, hexRgb(tokens[theme][i])]));
   const p = await openReader('D1440', READER, theme);
   try {
    if (prove && proofCase === 'title-red' && theme === 'light') await style(p, '.dir-b .b-bk-t{color:var(--red)!important}');
    if (prove && proofCase === 'head-red' && theme === 'light') await style(p, '.dir-b .b-rh-ch{color:var(--red-ink)!important}');
    if (prove && proofCase === 'head-title-red' && theme === 'light') await style(p, '.dir-b .b-rh-ch i{color:var(--red-ink)!important}');
    if (prove && proofCase === 'chn-ink' && theme === 'light') await style(p, '.dir-b .b-chn{color:var(--ink)!important}');
    if (prove && proofCase === 'cht-red' && theme === 'light') await style(p, '.dir-b .b-cht{color:var(--red)!important}');
    if (prove && proofCase === 'dark-title' && theme === 'dark') await style(p, '.dir-b .b-bk-t{color:var(--red)!important}');
    const c = await p.evaluate(() => {
     const col = sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length).map(e => getComputedStyle(e).color);
     return {'.b-bk-t': col('.b-bk-t'), '.b-rh-ch [data-ctx-n]': col('.b-rh-ch [data-ctx-n]'), '.b-rh-ch i': col('.b-rh-ch [data-ctx-title]'), '.b-chn': col('.reader-body .b-chn'), '.b-ln.col': col('.reader-body .b-ln.col'), '.fn-marker': col('.reader-body .fn-marker')};
    });
    const want = {'.b-bk-t': [[t.ink], '--ink'], '.b-rh-ch [data-ctx-n]': [[t.ink], '--ink'], '.b-rh-ch i': [[t.ink, t.mid], '--ink or --mid'], '.b-chn': [[t.red, t['red-ink']], 'red'], '.b-ln.col': [[t.red, t['red-ink']], 'red'], '.fn-marker': [[t.red, t['red-ink']], 'red']};
    for (const [sel, [ok, name]] of Object.entries(want)) {
     assert(c[sel].length > 0, `${theme} examined=0 ${sel}`);
     const off = c[sel].find(v => !ok.includes(v));
     assert(!off, `${theme} ${sel} color=${off}, expected ${name}`);
     n += c[sel].length;
    }
    await setView(p, 'both');
    const scan = await p.evaluate(({allowed, reds}) => {
     const isRed = c => { if (reds.includes(c)) return true; const m = c.match(/\d+(\.\d+)?/g)?.map(Number); return !!m && m[0] - Math.max(m[1], m[2]) >= 90 && (m[3] ?? 1) > 0; };
     const tag = el => `${el.tagName}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
     const out = {runs: 0, allowed: {}, off: []};
     const take = (el, color, text) => {
      out.runs++;
      if (!isRed(color)) return;
      const ok = allowed.find(sel => el.closest(sel));
      if (ok) out.allowed[ok] = (out.allowed[ok] || 0) + 1;
      else out.off.push(`${tag(el)} "${text.slice(0, 30)}" color=${color}`);
     };
     const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
     for (let t; (t = w.nextNode());) {
      const el = t.parentElement, s = getComputedStyle(el);
      if (!t.textContent.trim() || s.visibility !== 'visible') continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      if (![...rg.getClientRects()].some(r => r.width && r.height)) continue;
      take(el, s.color, t.textContent.trim());
     }
     for (const el of document.body.querySelectorAll('*')) {
      if (!el.getClientRects().length) continue;
      for (const pseudo of ['::before', '::after']) {
       const s = getComputedStyle(el, pseudo), text = s.content.match(/^"(.*)"$/)?.[1] ?? (/^attr\(/.test(s.content) ? s.content : '');
       if (text.trim() && s.display !== 'none' && s.visibility === 'visible') take(el, s.color, `${pseudo} ${text}`);
      }
     }
     return out;
    }, {allowed: Object.keys(allowedRed), reds: [t.red, t['red-ink']]});
    assert(scan.runs > 0, `${theme} examined=0 visible text runs`);
    assert(Object.keys(scan.allowed).length === Object.keys(allowedRed).length, `${theme} red scan found no red in ${Object.keys(allowedRed).filter(k => !scan.allowed[k]).join(', ')}: the scan reads no red at all`);
    console.log(`R-R17 ${theme} Both: ${scan.runs} visible text runs scanned; red allowed: ${Object.entries(scan.allowed).map(([k, v]) => `${k} (${allowedRed[k]}) ${v}`).join(', ')}`);
    assert(!scan.off.length, `${theme} red text outside the allowed set: ${scan.off.length} runs, ${scan.off.slice(0, 4).join('; ')}`);
    n += scan.runs;
   } finally { await close(p); }
  }
  return n;
 },
 'R-A5': async () => {
  // Site-wide: no element that clips (overflow hidden or clip) cuts its own text.
  // scrollHeight alone misses a clipped descender in Chromium (an italic title at
  // line-height 1.2 reads scrollHeight 21, clientHeight 20), so each text run's
  // box is also held inside the element's padding box.
  // Text nested in child elements is held inside each ancestor that clips it
  // vertically (overflow-y hidden or clip), up to the nearest scroller, whose
  // edge scrolls text rather than cutting it. A run wholly outside the box is
  // hidden content, not a cut glyph, and is only counted. Horizontal clipping
  // is not checked: the top bar's chapter title (.b-rh-ch i) is cut to one
  // line with an ellipsis on purpose.
  let n = 0, nested = 0, hiddenRuns = 0;
  const exempt = new Set();
  for (const size of ['D1440', 'P390']) for (const path of ['/', '/EN/', READER]) {
   const p = path === READER ? await openReader(size) : await open(size, 'light', path);
   try {
    for (const view of path === READER ? ['greek', 'both', 'english'] : [null]) {
     if (view) await setView(p, view);
     if (prove && proofCase === 'title-1.2') await style(p, '.dir-b .b-rh-ch i{line-height:1.2!important}');
     // .b-rh-ch holds its text only in child spans: a clip there cuts nested text.
     if (prove && proofCase === 'nested-clip') await style(p, '.dir-b .b-rh-ch{overflow:hidden!important;height:10px!important;min-height:0!important;max-height:10px!important}');
     const r = await p.evaluate(() => {
      const out = {examined: 0, nested: 0, hidden: 0, clipped: [], exempt: []};
      const tag = el => `${el.tagName}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
      const srOnly = (el, s, box) => box.width <= 1 && box.height <= 1 && (/rect\(0px, 0px, 0px, 0px\)/.test(s.clip) || /inset\(50%\)/.test(s.clipPath));
      // Nested text: every visible text run, held against each clipping ancestor
      // above its own parent (the parent's own runs are checked below).
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t; (t = walker.nextNode());) {
       if (!t.textContent.trim() || getComputedStyle(t.parentElement).visibility !== 'visible') continue;
       const rg = document.createRange(); rg.selectNodeContents(t);
       const rects = [...rg.getClientRects()].filter(r => r.width && r.height);
       if (!rects.length) continue;
       for (let a = t.parentElement.parentElement, via = t.parentElement; a && a !== document.documentElement; via = a, a = a.parentElement) {
        if (getComputedStyle(via).position === 'fixed') break;
        const s = getComputedStyle(a);
        if (s.overflowY === 'auto' || s.overflowY === 'scroll') break;
        if (!(s.overflowY === 'hidden' || s.overflowY === 'clip') || /^(inline|contents|none)$/.test(s.display)) continue;
        const box = a.getBoundingClientRect();
        if (srOnly(a, s, box)) break;
        const top = box.top + a.clientTop, bottom = top + a.clientHeight;
        out.nested++;
        const cut = rects.filter(r => r.bottom > top && r.top < bottom);
        if (!cut.length) { out.hidden++; continue; }
        const over = Math.max(...cut.map(r => Math.max(top - r.top, r.bottom - bottom)));
        if (over > 1) out.clipped.push(`${tag(a)} nested text "${t.textContent.trim().slice(0, 40)}" in ${tag(t.parentElement)}: nested text overruns its box by ${over.toFixed(1)}px`);
       }
      }
      for (const el of document.querySelectorAll('body *')) {
       const s = getComputedStyle(el);
       if (![s.overflowX, s.overflowY].some(v => v === 'hidden' || v === 'clip')) continue;
       // overflow does not apply to inline boxes.
       if (/^(inline|contents|none)$/.test(s.display) || !el.getClientRects().length || s.visibility !== 'visible') continue;
       const texts = [...el.childNodes].filter(c => c.nodeType === 3 && c.textContent.trim());
       if (!texts.length) continue;
       const name = `${tag(el)} "${texts.map(x => x.textContent.trim()).join(' ').slice(0, 40)}"`;
       const box = el.getBoundingClientRect();
       // Visually hidden text for screen readers: a 1px box clipped to nothing.
       if (srOnly(el, s, box)) { out.exempt.push(`${name.replace(/ ".*/, '')} (visually hidden for screen readers)`); continue; }
       out.examined++;
       const top = box.top + el.clientTop, bottom = top + el.clientHeight;
       let over = 0;
       for (const x of texts) { const rg = document.createRange(); rg.selectNodeContents(x); for (const rr of rg.getClientRects()) over = Math.max(over, top - rr.top, rr.bottom - bottom); }
       if (el.scrollHeight > el.clientHeight + 1 || over > 1) out.clipped.push(`${name} scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight}, text overruns its box by ${over.toFixed(1)}px`);
      }
      return out;
     });
     const label = `${path} ${size}${view ? ' ' + view : ''}`;
     console.log(`R-A5 ${label} clipping elements with own text examined=${r.examined}${r.examined ? '' : ' (none on this page)'}; nested text runs held against a clipping ancestor=${r.nested} (wholly hidden=${r.hidden})`);
     r.exempt.forEach(e => exempt.add(e));
     assert(!r.clipped.length, `${label} clipped text: ${r.clipped.slice(0, 4).join('; ')}`);
     n += r.examined + r.nested; nested += r.nested; hiddenRuns += r.hidden;
    }
   } finally { await close(p); }
  }
  console.log(`R-A5 nested text runs examined=${nested}, wholly hidden=${hiddenRuns}; horizontal clipping not checked (exempt by design: .b-rh-ch i, one line with text-overflow: ellipsis)`);
  console.log(`R-A5 exempt: ${[...exempt].join('; ') || 'none'}`);
  assert(n > 0, 'R-A5 examined=0 clipping elements with text on every page');
  return n;
 },
});

// ── D26 (10 Nov 2026): the home and work pages on one grid (spec §12 checks 1–8) ──
// Every expected number below comes from the spec (§3.1 grid, §3.3 list, §3.4
// foot lines, §4 tokens), from plates.json (`place`) or from works.ts. None is
// read back from the page being checked.
const hexRgb = hex => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const RGB = {red: hexRgb(tokens.light[7]), redInk: hexRgb(tokens.light[8]), ink: hexRgb(tokens.light[2]), darkRed: hexRgb(tokens.dark[7]), darkRedInk: hexRgb(tokens.dark[8])};
// Spec §3.1: content width = min(1168, viewport − 144), centred, three columns 40px apart.
const gridAt = vw => {
    const content = Math.min(1168, vw - 144), col = (content - 80) / 3, left = (vw - content) / 2;
    return {content, col, left, colLeft: i => left + i * (col + 40)};
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const f1 = x => Math.round(x * 10) / 10;
// The Continue line is built by script after load (spec §6).
async function resumeReady(page) {
    await page.waitForFunction(() => document.querySelector('.b-resume-location')?.textContent.includes('chapter'));
    await settleFonts(page);
    await page.waitForTimeout(150);
}
// Spec §3.3, in order. † marks and tags are the spec's own.
const SPEC_LIST = [
    {name: 'Logic', groups: [{label: null, works: ['Cat', 'Int', 'APr', 'APo', 'Top', 'SE']}]},
    {name: 'Natural philosophy', groups: [
        {label: 'Major works on nature', works: ['Phys', 'Cael', 'GC', 'Mete', 'DM', 'DA']},
        {label: 'Short works on nature (Parva naturalia)', works: ['Sens', 'Mem', 'Somn', 'Insomn', 'DivSomn', 'Long', 'Juv', 'Spir']},
        {label: 'Biological works', works: ['HA', 'PA', 'MA', 'IA', 'GA']},
        {label: 'Minor works (Opuscula)', works: ['Col', 'Aud', 'Phgn', 'Plant', 'Mirab', 'Mech', 'Prob', 'Lin', 'Vent', 'MXG']},
    ]},
    {name: 'Metaphysics', groups: [{label: null, works: ['Meta']}]},
    {name: 'Ethics and politics', groups: [{label: null, works: ['EN', 'MM', 'EE', 'VV', 'Pol', 'Oec', 'AthPol']}]},
    {name: 'Rhetoric and poetics', groups: [{label: null, works: ['Rhet', 'RhetAl', 'Poet']}]},
];
const SPEC_TAGS = {DM: 'spurious', Spir: 'spurious', Col: 'spurious', Aud: 'spurious', Phgn: 'spurious', Plant: 'spurious', Mirab: 'spurious', Mech: 'spurious', Prob: 'dubious', Lin: 'spurious', Vent: 'spurious', MXG: 'spurious', MM: 'dubious', VV: 'spurious', Oec: 'dubious', RhetAl: 'spurious'};
const OPUSCULA = ['Col', 'Aud', 'Phgn', 'Plant', 'Mirab', 'Mech', 'Prob', 'Lin', 'Vent', 'MXG'];
if (stage >= 2) Object.assign(gates, {
 // Check 1, round 9. The subject strip now stands between the masthead and the list, so the
 // sixth work no longer shows on a 663px screen. What round 9 pins instead: at 1152×663 the list
 // starts at y=453 for a new reader and y=361 for a returning one, with one saved work or two.
 'R-H4': async () => {
  const logic = registry.CATEGORIES[0];
  assert(registry.DIVISION_NAMES[logic.title] === 'Logic' && logic.works.length === 6, `works.ts: first division is ${registry.DIVISION_NAMES[logic.title]} with ${logic.works?.length} works, expected Logic with 6`);
  let n = 0;
  for (const [label, seed, want] of [['new', false, 453], ['returning', r9Seed(), 361], ['two saved', r9SeedTwo(), 361]]) {
   const p = await open('D1152', 'light', '/', seed);
   try {
    if (seed) await resumeReady(p);
    if (prove && proofCase === 'tall-top' && !seed) await style(p, '.dir-b.pg-home .b-top{padding-bottom:60px!important}');
    if (prove && proofCase === 'returning-gap' && label === 'two saved') await style(p, '.dir-b.pg-home .b-top.b-returning .b-intro-r{margin-bottom:60px!important}');
    if (prove && proofCase === 'scrolled' && !seed) await p.evaluate(() => scrollTo(0, 120));
    const r = await p.evaluate(() => {
     const first = document.querySelector('.b-div');
     return {top: first?.getBoundingClientRect().top, rows: first ? first.querySelectorAll('.b-works li').length : 0, head: first?.querySelector('.b-dh')?.textContent, scrollY, returning: document.querySelector('.b-top').classList.contains('b-returning')};
    });
    assert(r.rows > 0, `D1152 ${label} reader examined=0 work rows in the first division`);
    assert(r.head === 'Logic' && r.rows === logic.works.length, `D1152 ${label} reader first division ${r.head} lists ${r.rows} works, works.ts has Logic with ${logic.works.length}`);
    assert(r.returning === Boolean(seed), `D1152 ${label} reader returning masthead=${r.returning}`);
    assert(r.scrollY === 0, `D1152 ${label} reader scrollY=${r.scrollY}, must be 0`);
    assert(near(r.top, want, 6), `D1152 ${label} reader works list top=${f1(r.top)}, round 9 draws ${want}±6`);
    console.log(`R-H4 D1152 ${label} reader list top=${f1(r.top)} (round 9: ${want})`);
    n++;
   } finally { await close(p); }
  }
  return n;
 },
 // Check 2. One grid: the title is a list column.
 'R-H5': async () => {
  let n = 0;
  const homeSizes = ['D961', 'D1024', 'D1152', 'D1280', 'D1366', 'D1440', 'D1525', 'D1920'];
  for (const size of homeSizes) {
   const p = await open(size, 'light', '/');
   try {
    if (prove && proofCase === 'title-wide' && size === 'D1525') await style(p, '.dir-b.pg-home .b-top .b-po.tp-side .b-po-t{margin-right:-30px!important}');
    if (prove && proofCase === 'title-shifted' && size === 'D1152') await style(p, '.dir-b.pg-home .b-top .b-po.tp-side .b-po-t{position:relative!important;left:20px!important}');
    const r = await p.evaluate(() => {
     const rows = [...document.querySelector('.b-div').querySelectorAll('.b-works li')];
     const box = el => { const b = el.getBoundingClientRect(); return {left: b.left, width: b.width, top: b.top}; };
     return {vw: document.documentElement.clientWidth, count: rows.length, title: box(document.querySelector('.b-po-t')), r1c2: rows[1] && box(rows[1]), r2c1: rows[3] && box(rows[3]), r2c2: rows[4] && box(rows[4])};
    });
    assert(r.count >= 6, `${size} examined=${r.count} rows in the first division`);
    assert(r.r2c2.top > r.r1c2.top && r.r2c2.left > r.r2c1.left, `${size} the fifth work is not in row two, column two`);
    const g = gridAt(r.vw);
    assert(near(r.r2c2.left, g.colLeft(1), 1) && near(r.r2c2.width, g.col, 1), `${size} list column 2 left=${f1(r.r2c2.left)} width=${f1(r.r2c2.width)}, spec grid says left=${f1(g.colLeft(1))} width=${f1(g.col)}`);
    assert(near(r.title.left, r.r2c2.left, 1), `${size} home title left=${f1(r.title.left)} but list column 2 left=${f1(r.r2c2.left)}`);
    assert(near(r.title.width, r.r2c2.width, 1), `${size} home title width=${f1(r.title.width)} but list column width=${f1(r.r2c2.width)}`);
    n++;
   } finally { await close(p); }
  }
  for (const size of ['D1525', 'D1152']) for (const id of ['GC', 'Mete']) {
   const p = await open(size, 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'work-title-narrow' && size === 'D1525' && id === 'GC') await style(p, '.dir-b.pg-work .b-top .b-po.tp-side .b-po-t{width:300px!important}');
    if (prove && proofCase === 'work-title-moved' && size === 'D1152' && id === 'Mete') await style(p, '.dir-b.pg-work .b-top .b-po.tp-side .b-po-t{position:relative!important;left:349px!important}');
    const r = await p.evaluate(() => { const b = document.querySelector('.b-po-t').getBoundingClientRect(); return {vw: document.documentElement.clientWidth, left: b.left, width: b.width}; });
    const g = gridAt(r.vw);
    // Round 9: the title stands in column 1 whichever side plates.json gives (the plate is always column 3, R-W5).
    assert(near(r.width, g.col, 1), `${id} ${size} work title width=${f1(r.width)}, expected one third of (content ${f1(g.content)} − 80) = ${f1(g.col)}`);
    assert(near(r.left, g.colLeft(0), 1), `${id} ${size} work title left=${f1(r.left)}, expected column 1 at ${f1(g.colLeft(0))}`);
    n++;
   } finally { await close(p); }
  }
  return n;
 },
 // Check 3, round 9. A new reader's masthead still ends on one foot line (bust and search), and
 // the subject strip stands between it and the list: five links, one per division, each with
 // the Bekker range round 9 prints, each to its division. The returning masthead is short now
 // (the bust no longer meets the search), so its list top is pinned in R-H4 instead.
 'R-H6': async () => {
  let n = 0;
  const ranges = ['1–184', '184–980', '980–1093', '1094–1353', '1354–1462'];
  const divisions = registry.CATEGORIES.map(c => ({numeral: c.numeral, name: registry.DIVISION_NAMES[c.title]})).filter(d => d.name);
  assert(divisions.length === 5, `works.ts names ${divisions.length} divisions, expected 5`);
  for (const size of ['D1525', 'D1152']) {
   const p = await open(size, 'light', '/');
   try {
    if (prove && proofCase === 'bust-short' && size === 'D1525') await style(p, '.dir-b.pg-home .b-top > .b-po picture{bottom:30px!important}');
    if (prove && proofCase === 'range-wrong' && size === 'D1152') await p.locator('.b-subject-range').nth(2).evaluate(el => { el.textContent = '980–1094'; });
    if (prove && proofCase === 'dead-anchor' && size === 'D1152') await p.locator('.b-subjects a').nth(3).evaluate(el => el.setAttribute('href', '#division-VI'));
    if (prove && proofCase === 'strip-below' && size === 'D1525') await style(p, '.dir-b.pg-home .b-subjects{order:9;position:relative!important;top:300px!important}');
    const r = await p.evaluate(() => {
     const b = sel => document.querySelector(sel)?.getBoundingClientRect();
     const strip = b('.b-subjects');
     const links = [...document.querySelectorAll('.b-subjects a')].map(a => {
      const id = a.getAttribute('href')?.replace(/^#/, ''), target = id && document.getElementById(id);
      return {name: a.firstElementChild?.textContent, range: a.querySelector('.b-subject-range')?.textContent, href: a.getAttribute('href'), target: target ? target.querySelector('.b-dh')?.textContent : null, shown: a.getClientRects().length > 0};
     });
     return {bust: b('.b-top .b-po picture')?.bottom, search: b('.b-top form.b-search')?.bottom, div: b('.b-div')?.top, stripTop: strip?.top, stripBottom: strip?.bottom, links, returning: document.querySelector('.b-top').classList.contains('b-returning')};
    });
    const label = `${size} new reader`;
    assert([r.bust, r.search, r.div].every(Number.isFinite), `${label} examined=0: bust=${r.bust} search=${r.search} first division=${r.div}`);
    assert(!r.returning, `${label} drew the returning masthead`);
    assert(near(r.bust, r.search, 2), `${label} bust bottom=${f1(r.bust)} and search bottom=${f1(r.search)} differ by more than 2px`);
    assert(r.links.length > 0, `${label} examined=0 subject links`);
    const got = r.links.map(l => [l.name, l.range, l.href, l.target, l.shown]);
    const want = divisions.map((d, i) => [d.name, ranges[i], `#division-${d.numeral}`, d.name, true]);
    assert(JSON.stringify(got) === JSON.stringify(want), `${label} subject strip=${JSON.stringify(got)}\n expected ${JSON.stringify(want)}`);
    assert(r.stripTop >= Math.max(r.bust, r.search) - 1 && r.stripBottom <= r.div + 1, `${label} subject strip ${f1(r.stripTop)}–${f1(r.stripBottom)} is not between the foot line ${f1(r.bust)} and the list ${f1(r.div)}`);
    console.log(`R-H6 ${label} bust=${f1(r.bust)} search=${f1(r.search)} strip=${f1(r.stripTop)}–${f1(r.stripBottom)} list=${f1(r.div)}`);
    n += r.links.length;
   } finally { await close(p); }
  }
  return n;
 },
 // Check 4, round 9. The first column of a work page stacks the title, the Greek title in ink
 // straight under it, the buttons, and "Greek and English · <translator>" 6px under them. At
 // 1152×663 round 9 puts the main button's left edge at x=72 and its top at the y values below,
 // and the Nicomachean Ethics contents at y=516 (round 9's 500 plus 4px on each of four 40px edition rows). (The D26 foot line and 44px gap are gone.)
 'R-W4': async () => {
  let n = 0;
  const tops = {Cat: 253, Mete: 245, EN: 289, Mirab: 267, Mem: 253, APr: 289, Juv: 358};
  for (const size of ['D1152', 'D1440', 'D1525']) for (const id of Object.keys(tops)) {
   const p = await open(size, 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'button-moved' && size === 'D1152' && id === 'Cat') await style(p, '.dir-b.pg-work .b-top .b-ctas{margin-top:40px!important}');
    if (prove && proofCase === 'greek-red' && size === 'D1440' && id === 'Mete') await style(p, '.dir-b.pg-work .b-top .b-wk-gt{color:var(--red-ink)!important}');
    if (prove && proofCase === 'greek-apart' && size === 'D1525' && id === 'Mirab') await style(p, '.dir-b.pg-work .b-top .b-wk-gt{margin-top:40px!important}');
    if (prove && proofCase === 'mode-gap' && size === 'D1152' && id === 'Juv') await style(p, '.dir-b.pg-work .b-reading-mode{margin-top:10px!important}');
    if (prove && proofCase === 'contents-low' && size === 'D1152' && id === 'EN') await style(p, '.dir-b.pg-work [data-section="books"]{margin-top:40px!important}');
    if (prove && proofCase === 'wrong-translator' && size === 'D1440' && id === 'APr') await p.locator('.b-reading-mode').evaluate(el => { el.textContent = 'Greek and English · Owen'; });
    const r = await p.evaluate(() => {
     const box = sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return {left: b.left, right: b.right, top: b.top, bottom: b.bottom}; };
     return {vw: document.documentElement.clientWidth, title: box('.b-po-t'), greek: box('.b-wk-gt'), start: box('[data-start]'), ctas: box('.b-ctas .b-btn'), mode: box('.b-reading-mode'), modeText: document.querySelector('.b-reading-mode')?.textContent, greekColor: document.querySelector('.b-wk-gt') && getComputedStyle(document.querySelector('.b-wk-gt')).color, books: box('[data-section="books"]'), scrollY};
    });
    const label = `${id} ${size}`;
    assert(r.title && r.greek && r.start && r.mode && r.books, `${label} examined=0: ${JSON.stringify(r)}`);
    const g = gridAt(r.vw), work = registry.getWork(id), editions = registry.visibleTranslations(work);
    const primary = editions.find(t => t.id === work.defaultTranslation) || editions.find(t => t.slot === 'english') || editions[0];
    assert(r.greekColor === RGB.ink, `${label} Greek title color=${r.greekColor}, expected --ink ${RGB.ink}`);
    assert(r.greek.top - r.title.bottom >= 0 && r.greek.top - r.title.bottom <= 16 && near(r.greek.left, r.title.left, 1), `${label} Greek title at ${f1(r.greek.left)},${f1(r.greek.top)} is not straight under the title (bottom ${f1(r.title.bottom)}, left ${f1(r.title.left)})`);
    assert(r.start.top >= r.greek.bottom && r.start.top - r.greek.bottom <= 40, `${label} Start reading top=${f1(r.start.top)} is not under the Greek title (bottom ${f1(r.greek.bottom)})`);
    assert(near(r.start.left, g.colLeft(0), 1), `${label} Start reading left=${f1(r.start.left)}, expected column 1 at ${f1(g.colLeft(0))}`);
    assert(r.modeText === `Greek and English · ${primary.short}`, `${label} reading line="${r.modeText}", expected "Greek and English · ${primary.short}"`);
    assert(near(r.mode.top - r.start.bottom, 6, 1), `${label} reading line starts ${f1(r.mode.top - r.start.bottom)}px under the buttons, round 9 draws 6`);
    if (size === 'D1152') {
     assert(r.scrollY === 0, `${label} scrollY=${r.scrollY}`);
     assert(near(r.start.top, tops[id], 4), `${label} Start reading top=${f1(r.start.top)}, round 9 draws ${tops[id]}±4`);
     if (id === 'EN') assert(near(r.books.top, 516, 6), `${label} contents top=${f1(r.books.top)}, expected 516±6`);
    }
    console.log(`R-W4 ${label} button ${f1(r.start.left)},${f1(r.start.top)} reading line +${f1(r.mode.top - r.start.bottom)} contents ${f1(r.books.top)}`);
    n++;
   } finally { await close(p); }
  }
  return n;
 },
 // Check 5, round 9. The plate always stands in column 3 (plates.json's side no longer moves it),
 // with no caption: no text near the plate carries its record's who or when. The crumb stands on
 // the content column's left edge. Every plate at 1525; a sample upright and sideways.
 'R-W5': async () => {
  const ids = Object.keys(plates).filter(id => id !== 'home');
  assert(ids.length === 47, `plates.json holds ${ids.length} work plates, expected 47`);
  let n = 0;
  const caption = (p, id) => p.evaluate(({who, when}) => {
   const pic = document.querySelector('.b-top picture').getBoundingClientRect();
   const band = {left: pic.left - 20, right: pic.right + 20, top: pic.top - 60, bottom: pic.bottom + 60};
   const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
   let node, examined = 0; const hits = [];
   while (node = walker.nextNode()) {
    if (!node.textContent.trim() || node.parentElement.closest('script,style,[hidden]')) continue;
    examined++;
    const range = document.createRange(); range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (!r.width || r.right < band.left || r.left > band.right || r.bottom < band.top || r.top > band.bottom) continue;
    if (node.textContent.includes(who) || node.textContent.includes(when)) hits.push(node.textContent.trim().slice(0, 60));
   }
   return {examined, hits, figcaptions: document.querySelectorAll('.b-top figcaption').length};
  }, {who: plates[id].who, when: plates[id].when});
  for (const id of ids) {
   const p = await open('D1525', 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'plate-left' && n === 0) await style(p, '.dir-b.pg-work .b-top .b-po.work picture{grid-column:1!important}');
    if (prove && proofCase === 'plate-middle' && n === 1) await style(p, '.dir-b.pg-work .b-top .b-po.work picture{grid-column:2!important}');
    if (prove && proofCase === 'crumb-indent' && n === 2) await style(p, '.dir-b.pg-work .b-crumb{margin-left:24px!important}');
    // Grok, 10 Nov: "centre somewhere in the column" let a plate slide 150px.
    if (prove && proofCase === 'plate-shifted' && n === 3) await style(p, '.dir-b.pg-work .b-top .b-po.work picture{position:relative!important;left:60px!important}');
    if (prove && proofCase === 'caption' && n === 4) await p.locator('.b-top picture:visible').evaluate((el, who) => el.insertAdjacentHTML('beforeend', `<span class="gate-cap" style="display:block">${who}</span>`), plates[id].who);
    const r = await p.evaluate(() => { const b = sel => document.querySelector(sel)?.getBoundingClientRect(); const pic = b('.b-top .b-po picture'); return {vw: document.documentElement.clientWidth, plateCentre: pic && pic.left + pic.width / 2, plateWidth: pic?.width, crumb: b('p.b-crumb')?.left}; });
    assert(Number.isFinite(r.plateCentre) && Number.isFinite(r.crumb) && r.plateWidth > 0, `${id} examined=0: ${JSON.stringify(r)}`);
    const g = gridAt(r.vw), lo = g.colLeft(2);
    assert(r.plateCentre >= lo && r.plateCentre <= lo + g.col, `${id} plate centre x=${f1(r.plateCentre)} is not in column 3 [${f1(lo)}, ${f1(lo + g.col)}]`);
    assert(near(r.plateCentre, lo + g.col / 2, 1) && r.plateWidth <= g.col + 1, `${id} plate centre x=${f1(r.plateCentre)} width=${f1(r.plateWidth)}: not centred on column 3 (centre ${f1(lo + g.col / 2)}, width ${f1(g.col)})`);
    assert(near(r.crumb, g.left, 1), `${id} crumb left=${f1(r.crumb)}, content column left=${f1(g.left)}`);
    const c = await caption(p, id);
    assert(c.examined > 0, `${id} D1525 examined=0 text nodes`);
    assert(!c.hits.length && !c.figcaptions, `${id} D1525 plate caption: ${JSON.stringify(c.hits)} figcaptions=${c.figcaptions}`);
    n++;
   } finally { await close(p); }
  }
  for (const size of ['P390', 'S844']) for (const id of ['Juv', 'EN', 'Mete', 'Cat']) {
   const p = await open(size, 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'caption-phone' && size === 'P390' && id === 'EN') await p.locator('.b-top picture:visible').evaluate((el, when) => el.insertAdjacentHTML('afterend', `<p class="gate-cap" style="order:3">${when}</p>`), plates[id].when);
    const c = await caption(p, id);
    assert(c.examined > 0, `${id} ${size} examined=0 text nodes`);
    assert(!c.hits.length && !c.figcaptions, `${id} ${size} plate caption: ${JSON.stringify(c.hits)} figcaptions=${c.figcaptions}`);
    n++;
   } finally { await close(p); }
  }
  console.log(`R-W5 plates examined=${n}`);
  return n;
 },
 // Check 6. Colour B: no --red on home or work pages at desktop widths.
 'R-C3': async () => {
  let n = 0, elements = 0;
  for (const theme of ['light', 'dark']) for (const path of ['/', '/GC/', '/Mete/', '/MA/']) {
   const p = await open('D1525', theme, path);
   try {
    if (prove && proofCase === 'red-title' && theme === 'light' && path === '/') await style(p, '.dir-b .b-po-t{color:var(--red)!important}');
    if (prove && proofCase === 'red-border' && theme === 'light' && path === '/GC/') await style(p, '.dir-b .b-bk{border-bottom:3px solid var(--red)!important}');
    if (prove && proofCase === 'red-dark' && theme === 'dark' && path === '/Mete/') await style(p, '.dir-b .b-crumb a{color:var(--red)!important}');
    if (prove && proofCase === 'faded-title' && theme === 'light' && path === '/MA/') await style(p, '.dir-b .b-po-t{opacity:.82!important}');
    // Round 9 (r9.css "Dark: one red"): home and work pages use #e0574b as the dark --red-ink.
    const red = theme === 'light' ? RGB.red : RGB.darkRed, accent = theme === 'light' ? RGB.redInk : hexRgb('#e0574b');
    const r = await p.evaluate(({red, accent}) => {
     const hits = [], seen = new Set(); let examined = 0, accents = 0;
     for (const el of document.querySelectorAll('.b-page, .b-page *')) {
      examined++;
      for (const pseudo of [undefined, '::before', '::after']) {
       const cs = getComputedStyle(el, pseudo);
       if (pseudo && cs.content === 'none') continue;
       const props = [['color', cs.color], ['background-color', cs.backgroundColor], ['text-decoration-color', cs.textDecorationColor], ['outline-color', cs.outlineColor]];
       for (const s of ['top', 'right', 'bottom', 'left'])
        if (parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 && cs.getPropertyValue(`border-${s}-style`) !== 'none') props.push([`border-${s}-color`, cs.getPropertyValue(`border-${s}-color`)]);
       for (const [k, v] of props) {
        if (v === red) hits.push(`${el.tagName.toLowerCase()}${[...el.classList].map(c => '.' + c).join('')}${pseudo || ''} ${k}`);
        if (v === accent) seen.add(el);
       }
      }
     }
     accents = seen.size;
     const t = document.querySelector('.b-po-t');
     let opacity = 1;
     for (let e = t; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
     return {hits: [...new Set(hits)], examined, accents, title: getComputedStyle(t).color, opacity};
    }, {red, accent});
    assert(r.examined > 50, `${path} ${theme} examined=${r.examined} elements`);
    assert(r.accents > 0, `${path} ${theme} no element uses --red-ink ${accent}: the scan sees nothing it should`);
    assert(!r.hits.length, `${path} ${theme} uses --red ${red}: ${r.hits.slice(0, 6).join('; ')}`);
    if (theme === 'light') {
     assert(r.title === RGB.ink, `${path} title color=${r.title}, expected --ink ${RGB.ink}`);
     assert(Math.abs(r.opacity - 1) < .001, `${path} title opacity=${r.opacity}, expected 1`);
    }
    elements += r.examined;
    n++;
   } finally { await close(p); }
  }
  console.log(`R-C3 pages=${n} elements examined=${elements}`);
  return n;
 },
 // Check 7. The home list is the spec's table.
 'R-H7': async () => {
  const p = await open('D1525', 'light', '/');
  try {
   if (prove && proofCase === 'old-heading') await p.evaluate(() => { document.querySelectorAll('.b-dh')[4].textContent = 'Dubious and spurious works'; });
   if (prove && proofCase === 'duplicate') await p.evaluate(() => { const li = document.querySelector('.b-works li'); li.parentElement.append(li.cloneNode(true)); });
   if (prove && proofCase === 'tag-lost') await p.evaluate(() => document.querySelector('.b-tag').remove());
   if (prove && proofCase === 'prob-moved') await p.evaluate(() => { const ul = [...document.querySelectorAll('.b-works')].find(u => u.querySelector('[data-work="Prob"]')); ul.prepend(ul.querySelector('[data-work="Prob"]').parentElement); });
   if (prove && proofCase === 'isa') await p.evaluate(() => { const li = document.querySelector('.b-works li').cloneNode(true); li.querySelector('a').dataset.work = 'Isa'; document.querySelector('.b-works').append(li); });
   const got = await p.evaluate(() => [...document.querySelectorAll('.b-div')].map(d => {
    const groups = [];
    for (const c of d.querySelector('.b-dw').children) {
     if (c.matches('.b-sub')) groups.push({label: c.textContent.trim(), works: [], tags: {}});
     else if (c.matches('.b-works')) {
      if (!groups.length) groups.push({label: null, works: [], tags: {}});
      const g = groups.at(-1);
      for (const a of c.querySelectorAll('a[data-work]')) { g.works.push(a.dataset.work); const t = a.querySelector('.b-tag'); if (t) g.tags[a.dataset.work] = t.textContent.trim().toLowerCase(); }
     }
    }
    return {name: d.querySelector('.b-dh').textContent.trim(), groups};
   }));
   const all = got.flatMap(d => d.groups.flatMap(g => g.works));
   assert(got.length > 0 && all.length > 0, `examined=0 divisions/works (${got.length}/${all.length})`);
   assert(!got.some(d => /dubious and spurious works/i.test(d.name)), `a division head reads "Dubious and spurious works": ${got.map(d => d.name)}`);
   const dup = all.filter((id, i) => all.indexOf(id) !== i);
   assert(!dup.length, `data-work listed twice: ${dup}`);
   const tags = got.flatMap(d => d.groups.flatMap(g => Object.entries(g.tags)));
   assert(tags.length === 16, `tags=${tags.length}, expected 16`);
   const opus = got.flatMap(d => d.groups).find(g => g.label?.toLowerCase() === 'minor works (opuscula)');
   assert(opus, `no group labelled "Minor works (Opuscula)"; groups: ${got.flatMap(d => d.groups.map(g => g.label))}`);
   assert(JSON.stringify(opus.works) === JSON.stringify(OPUSCULA), `Minor works (Opuscula) holds ${opus.works}, expected ${OPUSCULA}`);
   const shape = ds => JSON.stringify(ds.map(d => [d.name, d.groups.map(g => [g.label?.toLowerCase() ?? null, g.works])]));
   const expected = SPEC_LIST.map(d => ({name: d.name, groups: d.groups}));
   assert(shape(got) === shape(expected), `list differs from spec §3.3:\n got ${shape(got)}\n want ${shape(expected)}`);
   for (const [id, kind] of Object.entries(SPEC_TAGS)) assert(tags.some(([w, t]) => w === id && t.includes(kind)), `${id} lacks its "${kind}" tag`);
   assert(!all.includes('Isa'), 'the Isagoge is on the home list');
   console.log(`R-H7 divisions=${got.length} works=${all.length} tags=${tags.length} opuscula=${opus.works.join(',')}`);
   return all.length;
  } finally { await close(p); }
 },
 // Check 8. The home Greek line: one line, deep red, as wide as its column.
 'R-H8': async () => {
  let n = 0;
  for (const size of ['D1525', 'D1152', 'D961']) {
   const p = await open(size, 'light', '/');
   try {
    if (prove && proofCase === 'wraps' && size === 'D1525') await style(p, '.dir-b.pg-home .b-top .b-gt{white-space:normal!important;font-size:40px!important}');
    if (prove && proofCase === 'wrong-red' && size === 'D1152') await style(p, '.dir-b.pg-home .b-top .b-gt{color:var(--red)!important}');
    if (prove && proofCase === 'short' && size === 'D961') await style(p, '.dir-b.pg-home .b-top .b-gt{font-size:12px!important}');
    const r = await p.evaluate(() => {
     const el = document.querySelector('p.b-gt');
     if (!el) return null;
     const range = document.createRange(); range.selectNodeContents(el);
     const rects = [...range.getClientRects()].filter(x => x.width > 0);
     const lines = []; for (const x of rects) if (!lines.some(t => Math.abs(t - x.top) < 3)) lines.push(x.top);
     return {vw: document.documentElement.clientWidth, lines: lines.length, color: getComputedStyle(el).color, text: range.getBoundingClientRect().width, size: getComputedStyle(el).fontSize, shown: el.getClientRects().length > 0};
    });
    assert(r && r.shown, `${size} examined=0: no visible p.b-gt`);
    const g = gridAt(r.vw);
    assert(r.lines === 1, `${size} Greek line is drawn on ${r.lines} lines`);
    assert(r.color === RGB.redInk, `${size} Greek line color=${r.color}, expected --red-ink ${RGB.redInk}`);
    assert(near(r.text, g.col, 2), `${size} Greek line text width=${f1(r.text)} but its column is ${f1(g.col)}`);
    console.log(`R-H8 ${size} text ${f1(r.text)} of ${f1(g.col)}, ${r.size}`);
    n++;
   } finally { await close(p); }
  }
  return n;
 },
});

// Round 9 gates (home and work pages as rebuilt on 12 Nov). Expected values are round 9's
// measured design numbers (the orchestrator's brief), works.ts, chapters.json or plates.json.
const MID = hexRgb(tokens.light[3]);
if (stage >= 2) Object.assign(gates, {
 // Home, first visit: the Greek line τὰ σῳζόμενα on desktop, none on the upright phone.
 // Home, returning reader on the phone: bust and full title, no site sentence, one card, its
 // button to the right of the work title, top-aligned with it, not full width.
 'R-H9': async () => {
  let n = 0;
  for (const size of ['D1152', 'P390']) {
   const p = await open(size, 'light', '/');
   try {
    if (prove && proofCase === 'greek-gone' && size === 'D1152') await p.locator('.b-gt').evaluate(el => { el.textContent = 'Ἀριστοτέλους ἅπαντα'; });
    if (prove && proofCase === 'phone-greek' && size === 'P390') await style(p, '.dir-b.pg-home .b-gt{display:block!important}');
    const r = await p.evaluate(() => { const el = document.querySelector('.b-gt'); return el && {text: el.textContent, shown: el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'}; });
    assert(r, `${size} examined=0: no .b-gt`);
    if (size === 'D1152') assert(r.shown && r.text.includes('τὰ σῳζόμενα'), `${size} home Greek line="${r.text}" shown=${r.shown}, expected τὰ σῳζόμενα`);
    else assert(!r.shown, `${size} home Greek line is visible on the upright phone`);
    n++;
   } finally { await close(p); }
  }
  const p = await open('P390', 'light', '/', r9SeedTwo());
  try {
   await resumeReady(p);
   if (prove && proofCase === 'phone-two-cards') await p.locator('.b-resume-work').evaluate(el => el.after(el.cloneNode(true)));
   if (prove && proofCase === 'phone-sentence') await p.locator('.b-intro').evaluate(el => el.insertAdjacentHTML('afterbegin', '<p class="b-lead">Read and search every work of Aristotle in Greek and English.</p>'));
   if (prove && proofCase === 'phone-button-full') await style(p, '.dir-b.pg-home .b-resume-work .b-btn{grid-column:1 / -1!important;grid-row:3!important}');
   const r = await p.evaluate(() => {
    const shown = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const box = el => { const b = el.getBoundingClientRect(); return {left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height}; };
    const cards = [...document.querySelectorAll('.b-resume-work')].filter(shown);
    const card = cards[0];
    return {cards: cards.length, bust: box(document.querySelector('.b-top picture')), lines: [...document.querySelectorAll('.b-po-t .ln')].map(l => l.textContent).join(' '),
     lead: [...document.querySelectorAll('.b-lead')].filter(shown).length, card: card && box(card), title: card && box(card.querySelector('.b-resume-title')), button: card && box(card.querySelector('.b-btn')), buttonText: card?.querySelector('.b-btn').textContent};
   });
   const label = 'P390 returning reader';
   assert(r.cards > 0, `${label} examined=0 resume cards`);
   assert(r.cards === 1, `${label} cards=${r.cards}, expected exactly one with two saved works`);
   assert(r.bust.height > 0 && r.lines === 'THE COMPLETE WORKS OF ARISTOTLE', `${label} bust height=${f1(r.bust.height)} title="${r.lines}"`);
   assert(r.lead === 0, `${label} site sentence shown ${r.lead} times`);
   assert(r.buttonText === 'Continue reading', `${label} button="${r.buttonText}"`);
   assert(r.button.left >= r.title.right && near(r.button.top, r.title.top, 1) && r.button.width < r.card.width - 1, `${label} Continue reading at ${f1(r.button.left)},${f1(r.button.top)} width ${f1(r.button.width)} is not right of the title (right ${f1(r.title.right)}, top ${f1(r.title.top)}) and narrower than the card (${f1(r.card.width)})`);
   n++;
  } finally { await close(p); }
  return n;
 },
 // Home, returning reader at 1152×663: short masthead; the search box across the intro's width
 // above ONE card (two works saved); the card's sizes; beside it, a link to the saved passage in
 // Greek (16px) and in the default translation, Ostwald (14px). With the book's data blocked the
 // card still shows and the passage link stays hidden.
 'R-H10': async () => {
  let n = 0;
  const p = await open('D1152', 'light', '/', r9SeedTwo());
  try {
   await resumeReady(p);
   await p.waitForFunction(() => !document.querySelector('.b-resume-passage')?.hidden, null, {timeout: 10000}).catch(() => {});
   if (prove && proofCase === 'two-cards') await p.locator('.b-resume-work').evaluate(el => el.after(el.cloneNode(true)));
   if (prove && proofCase === 'button-small') await style(p, '.dir-b.pg-home .b-resume-work .b-btn{height:36px!important}');
   if (prove && proofCase === 'no-name') await p.locator('.b-resume-work .b-btn').evaluate(el => el.removeAttribute('aria-label'));
   if (prove && proofCase === 'search-narrow') await style(p, '.dir-b.pg-home .b-top.b-returning .b-intro-r{grid-column:1!important}');
   if (prove && proofCase === 'passage-english') await p.locator('.b-resume-passage [lang="en"]').evaluate(el => { el.textContent = 'Now we must take as a sign of states of character the pleasure or pain that ensues on acts.'; });
   if (prove && proofCase === 'same-wrong-target') await p.locator('.b-resume-work .b-btn, .b-resume-passage').evaluateAll(els => els.forEach(el => el.setAttribute('href', '/EN/book/1')));
   const r = await p.evaluate(() => {
    const shown = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height}; };
    const fs = el => el && parseFloat(getComputedStyle(el).fontSize);
    const cards = [...document.querySelectorAll('.b-resume-work')].filter(shown);
    const card = cards[0], passage = document.querySelector('.b-resume-passage');
    const grc = passage?.querySelector('[lang="grc"]'), en = passage?.querySelector('[lang="en"]');
    return {cards: cards.length, masthead: [...document.querySelectorAll('.b-po-t .b-masthead-line')].map(s => s.textContent), lead: shown(document.querySelector('.b-lead')),
     intro: box(document.querySelector('.b-intro')), search: box(document.querySelector('.b-intro .b-search')), card: box(card),
     titleSize: fs(card?.querySelector('.b-resume-title')), title: card?.querySelector('.b-resume-title').textContent, locationSize: fs(card?.querySelector('.b-resume-location')),
     button: box(card?.querySelector('.b-btn')), buttonSize: fs(card?.querySelector('.b-btn')), buttonHref: card?.querySelector('.b-btn').getAttribute('href'),
     passage: shown(passage) ? {box: box(passage), href: passage.getAttribute('href'), grc: grc?.textContent, grcSize: fs(grc), en: en?.textContent, enSize: fs(en), enShown: shown(en)} : null};
   });
   const label = 'D1152 returning reader';
   assert(r.cards > 0, `${label} examined=0 resume cards`);
   assert(r.cards === 1, `${label} cards=${r.cards}, expected exactly one with two saved works`);
   assert(JSON.stringify(r.masthead) === '["The","Complete","Works of","Aristotle"]' && !r.lead, `${label} masthead=${JSON.stringify(r.masthead)} sentence shown=${r.lead}`);
   assert(near(r.search.left, r.intro.left, 1) && near(r.search.right, r.intro.right, 1) && r.search.bottom <= r.card.top, `${label} search box ${f1(r.search.left)}–${f1(r.search.right)} (bottom ${f1(r.search.bottom)}) is not across the intro ${f1(r.intro.left)}–${f1(r.intro.right)} above the card (top ${f1(r.card.top)})`);
   assert(r.title === 'Nicomachean Ethics' && r.titleSize === 24 && r.locationSize === 15, `${label} card title "${r.title}" ${r.titleSize}px, location ${r.locationSize}px; round 9: Nicomachean Ethics 24px, location 15px`);
   assert(near(r.button.height, 44, .5) && r.buttonSize === 14, `${label} button height=${f1(r.button.height)} text ${r.buttonSize}px; round 9: 44px, 14px`);
   const named = await p.getByRole('link', {name: 'Continue reading Nicomachean Ethics', exact: true}).count();
   assert(named === 1, `${label} links with the accessible name "Continue reading Nicomachean Ethics"=${named}`);
   assert(r.passage, `${label} passage link hidden`);
   // The target comes from the seed, not the page: both links share one href in index.astro.
   const seeded = r9SeedTwo().storage, want = `/EN/book/${seeded['reader-book-EN']}#${seeded['reader-loc-EN']}`;
   assert(r.buttonHref === want, `${label} card button href=${r.buttonHref}, expected ${want} from the seed`);
   assert(r.passage.href === want, `${label} passage link href=${r.passage.href}, expected ${want} from the seed`);
   assert(r.passage.box.left >= r.card.right && r.passage.box.top < r.card.bottom && r.passage.box.bottom > r.card.top, `${label} passage link is not beside the card`);
   assert(r.passage.grcSize === 16 && r.passage.grc.startsWith('Σημεῖον δὲ δεῖ ποιεῖσθαι'), `${label} Greek paragraph ${r.passage.grcSize}px "${r.passage.grc?.slice(0, 40)}"`);
   assert(r.passage.enShown && r.passage.enSize === 14 && r.passage.en.startsWith('An index to our characteristics'), `${label} English paragraph ${r.passage.enSize}px "${r.passage.en?.slice(0, 40)}", expected Ostwald's "An index to our characteristics"`);
   assert(!/Rackham/.test(r.passage.en), `${label} passage names Rackham`);
   n++;
  } finally { await close(p); }
  // The passage needs the book's data; the card must not.
  const blocked = await open('D1152', 'light', '/', r9Seed(), false, false, '**/data/EN/book-*.json');
  try {
   await resumeReady(blocked);
   await blocked.waitForTimeout(500);
   if (prove && proofCase === 'blocked-passage') await blocked.locator('.b-resume-passage').evaluate(el => { el.hidden = false; el.querySelector('[lang="grc"]').textContent = 'Σημεῖον'; });
   assert(blocked.blockedRequests() > 0, 'D1152 returning reader, book data blocked: examined=0 blocked requests');
   const r = await blocked.evaluate(() => ({card: document.querySelector('.b-resume-work').getClientRects().length > 0 && !document.querySelector('.b-resume-work').hidden, passage: !document.querySelector('.b-resume-passage').hidden}));
   assert(r.card && !r.passage, `D1152 returning reader, book data blocked: card shown=${r.card} passage link shown=${r.passage}`);
   n++;
  } finally { await close(blocked); }
  return n;
 },
 // Book rows of titled books show the Bekker range beside the chapter count (1094a1–1103a10 for
 // Nicomachean Ethics I); a returning reader's saved book shows "saved at chapter N", beside the
 // count on desktop and on its own line on the phone.
 'R-W8': async () => {
  let n = 0;
  const chapters = chaptersOf('EN'), work = registry.getWork('EN');
  for (const [size, seed] of [['D1152', false], ['D1152', r9Seed()], ['P390', r9Seed()]]) {
   const p = await open(size, 'light', '/EN/', seed);
   const label = `EN ${size}${seed ? ' returning' : ''}`;
   try {
    if (seed) await p.waitForFunction(() => document.querySelector('.b-saved-chapter'), null, {timeout: 10000}).catch(() => {});
    if (prove && proofCase === 'range-missing' && !seed) await p.locator('.b-bk[data-book="1"] .b-book-range').evaluate(el => el.remove());
    if (prove && proofCase === 'range-wrong' && !seed) await p.locator('.b-bk[data-book="1"] .b-book-range').evaluate(el => { el.textContent = '1094a1–1103a9'; });
    if (prove && proofCase === 'saved-elsewhere' && seed && size === 'D1152') await p.locator('.b-saved-chapter').evaluate(el => document.querySelector('.b-bk[data-book="1"] .b-bkc').prepend(el));
    if (prove && proofCase === 'saved-inline' && size === 'P390') await style(p, '.dir-b.pg-work .b-bkc{flex-wrap:nowrap!important}.dir-b.pg-work .b-saved-chapter{flex:0 0 auto!important;order:0!important}');
    if (prove && proofCase === 'range-below' && !seed) await style(p, '.dir-b.pg-work .b-book-range{display:block!important}');
    const rows = await p.locator('.b-bk').evaluateAll(els => els.map(el => {
     const count = el.querySelector('.b-bkc'), range = count.querySelector('.b-book-range'), saved = count.querySelector('.b-saved-chapter');
     const text = [...count.childNodes].filter(x => x.nodeType === 3 && x.textContent.trim()).at(-1);
     const r = text && document.createRange(); r?.selectNodeContents(text);
     const box = e => { const b = e.getBoundingClientRect(); return {top: b.top, bottom: b.bottom, left: b.left, right: b.right}; };
     return {book: el.dataset.book, count: text?.textContent.trim(), countBox: r && box(r), range: range?.textContent, rangeBox: range && box(range), saved: saved?.textContent, savedBox: saved && box(saved)};
    }));
    assert(rows.length > 0, `${label} examined=0 book rows`);
    assert(rows.length === work.books, `${label} book rows=${rows.length}, works.ts has ${work.books}`);
    for (const row of rows) {
     const cs = chapters[row.book];
     assert(row.count === `${cs.length} chapter${cs.length === 1 ? '' : 's'}`, `${label} Book ${row.book} count="${row.count}", chapters.json has ${cs.length}`);
     assert(/^\d+[ab]\d+–\d+[ab]\d+$/.test(row.range || '') && row.range.startsWith(cs[0].column + cs[0].line + '–'), `${label} Book ${row.book} range="${row.range}", chapters.json starts it at ${cs[0].column}${cs[0].line}`);
     if (row.book === '1') assert(row.range === '1094a1–1103a10', `${label} Book I range="${row.range}", round 9 prints 1094a1–1103a10`);
     assert(near(row.rangeBox.top, row.countBox.top, 2) && row.rangeBox.right <= row.countBox.left + 1, `${label} Book ${row.book} range is not beside the chapter count`);
     const wantSaved = seed && row.book === '2' ? 'saved at chapter 3' : undefined;
     assert(row.saved === wantSaved, `${label} Book ${row.book} saved note="${row.saved}", expected ${wantSaved ?? 'none'}`);
     if (wantSaved && size === 'P390') assert(row.savedBox.top >= Math.max(row.rangeBox.bottom, row.countBox.bottom) - 1, `${label} "saved at chapter 3" is not on its own line`);
     if (wantSaved && size !== 'P390') assert(near(row.savedBox.top, row.countBox.top, 2), `${label} "saved at chapter 3" is not beside the count`);
     n++;
    }
   } finally { await close(p); }
  }
  return n;
 },
 // A short work beside a tall plate: on /Mem the contents start above the plate's bottom and stay
 // left of the plate; on /EN, /Cat, /Mete, /Juv and /Sens the contents start under the plate.
 'R-W9': async () => {
  let n = 0;
  for (const size of ['D1152', 'D1440']) for (const id of ['Mem', 'EN', 'Cat', 'Mete', 'Juv', 'Sens']) {
   const p = await open(size, 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'no-tuck' && id === 'Mem' && size === 'D1152') await style(p, '.dir-b.pg-work [data-section="books"]{margin-top:0!important}');
    if (prove && proofCase === 'overlap' && id === 'Mem' && size === 'D1440') await style(p, '.dir-b.pg-work .b-contents-tuck{padding-right:0!important}.dir-b.pg-work .b-contents-tuck .b-numbered{grid-template-columns:repeat(2,minmax(0,1fr))!important}');
    if (prove && proofCase === 'tucked' && id === 'Sens' && size === 'D1152') await style(p, '.dir-b.pg-work [data-section="books"]{margin-top:-120px!important}');
    const r = await p.evaluate(() => {
     const sec = document.querySelector('[data-section="books"]'), pic = document.querySelector('.b-top picture').getBoundingClientRect();
     const parts = [...sec.querySelectorAll('.b-contents-head > *, .b-chs li, .b-bk summary')].filter(e => e.getClientRects().length);
     return {top: sec.getBoundingClientRect().top, right: Math.max(...parts.map(e => e.getBoundingClientRect().right)), parts: parts.length, plateBottom: pic.bottom, plateLeft: pic.left};
    });
    const label = `${id} ${size}`;
    assert(r.parts > 0, `${label} examined=0 contents parts`);
    if (id === 'Mem') {
     assert(r.top < r.plateBottom, `${label} contents top=${f1(r.top)} is not above the plate's bottom ${f1(r.plateBottom)}`);
     assert(r.right <= r.plateLeft, `${label} contents right=${f1(r.right)} runs under the plate (left ${f1(r.plateLeft)})`);
    } else assert(r.top >= r.plateBottom, `${label} contents top=${f1(r.top)} tucks beside the plate (bottom ${f1(r.plateBottom)})`);
    n += r.parts;
   } finally { await close(p); }
  }
  return n;
 },
 // The upright phone work page: the main button inside the first screen and a plate of at least
 // 120px; "Editions and tools" folded; a new reader's Contents link at the end of the line under
 // the buttons. A returning reader: no Contents link, a full-width "Continue at Book II, chapter 3",
 // then "From the start" and "Greek only" side by side, and the summary below the contents.
 'R-W10': async () => {
  let n = 0;
  for (const id of ['EN', 'Cat', 'Top', 'Mem', 'Mirab', 'Juv']) {
   const p = await open('P390', 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'button-low' && id === 'Juv') await style(p, '.dir-b.pg-work .b-top .b-po-t{padding-top:200px!important}');
    if (prove && proofCase === 'plate-small' && id === 'Top') await style(p, '.dir-b.pg-work .b-top .b-po.work picture{height:100px!important}');
    if (prove && proofCase === 'no-contents-link' && id === 'EN') await p.locator('.b-contents-link').evaluate(el => el.remove());
    if (prove && proofCase === 'fold-open' && id === 'Cat') await p.locator('.b-editions-fold').evaluate(el => { el.open = true; });
    const r = await p.evaluate(() => {
     const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height}; };
     const fold = document.querySelector('.b-editions-fold'), link = document.querySelector('.b-reading-mode .b-contents-link');
     const shown = link && link.getClientRects().length > 0 && getComputedStyle(link).display !== 'none';
     return {start: box(document.querySelector('[data-start]')), plate: box(document.querySelector('.b-top picture')), height: innerHeight, fold: fold && {label: fold.querySelector('summary').textContent, open: fold.open},
      link: shown ? {box: box(link), href: link.getAttribute('href'), target: document.getElementById('contents')?.dataset.section} : null, mode: box(document.querySelector('.b-reading-mode'))};
    });
    const label = `${id} P390`;
    assert(r.start && r.plate, `${label} examined=0: ${JSON.stringify(r)}`);
    assert(r.start.bottom <= r.height, `${label} Start reading bottom=${f1(r.start.bottom)} is below the first screen ${r.height}`);
    assert(r.plate.height >= 120, `${label} plate height=${f1(r.plate.height)} below 120`);
    assert(r.fold?.label === 'Editions and tools' && !r.fold.open, `${label} editions fold=${JSON.stringify(r.fold)}, expected "Editions and tools", closed`);
    assert(r.link && r.link.href === '#contents' && r.link.target === 'books' && near(r.link.box.right, r.mode.right, 1), `${label} Contents link=${JSON.stringify(r.link)} is not at the end of the line under the buttons (right ${f1(r.mode.right)})`);
    n++;
   } finally { await close(p); }
  }
  const p = await open('P390', 'light', '/EN/', r9Seed());
  try {
   await p.waitForFunction(() => document.querySelector('[data-resume]')?.textContent.includes('chapter'));
   if (prove && proofCase === 'returning-link') await style(p, '.dir-b.pg-work .b-contents-button{display:inline-flex!important}');
   if (prove && proofCase === 'resume-half') await style(p, '.dir-b.pg-work .b-ctas .b-btn[data-resume]{flex:0 0 auto!important}');
   if (prove && proofCase === 'summary-top') await p.evaluate(() => document.querySelector('.b-ctas').after(document.querySelector('.b-wk-blurb')));
   const r = await p.evaluate(() => {
    const box = el => { const b = el.getBoundingClientRect(); return {left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width}; };
    const shown = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const ctas = document.querySelector('.b-ctas');
    return {buttons: [...ctas.querySelectorAll('.b-btn')].filter(shown).map(el => ({text: el.textContent.trim(), ...box(el)})), ctas: box(ctas),
     contents: [...document.querySelectorAll('a[href="#contents"]')].filter(shown).length, blurb: box(document.querySelector('.b-wk-blurb')), books: box(document.querySelector('[data-section="books"]')),
     fold: box(document.querySelector('.b-editions-fold'))};
   });
   const label = 'EN P390 returning';
   assert(r.buttons.length > 0, `${label} examined=0 buttons`);
   assert(JSON.stringify(r.buttons.map(b => b.text)) === '["Continue at Book II, chapter 3","From the start","Greek only"]', `${label} buttons=${JSON.stringify(r.buttons.map(b => b.text))}`);
   const [cont, from, greek] = r.buttons;
   assert(near(cont.width, r.ctas.width, 1) && cont.bottom <= from.top && near(from.top, greek.top, 2), `${label} Continue at width=${f1(cont.width)} of ${f1(r.ctas.width)}; From the start top=${f1(from.top)}, Greek only top=${f1(greek.top)}: expected a full-width Continue over one row`);
   assert(r.contents === 0, `${label} shows ${r.contents} Contents links`);
   assert(r.blurb.top >= r.books.bottom, `${label} summary top=${f1(r.blurb.top)} is above the contents' end ${f1(r.books.bottom)}`);
   assert(r.fold.bottom <= r.books.top, `${label} editions fold moved below the contents`);
   n++;
  } finally { await close(p); }
  return n;
 },
 // Untitled chapter lists on the phone: two to a row, each with its whole Bekker range from
 // chapters.json; on Mirab a heavier (--mid) rule under every fifth row and the "Chapter or
 // Bekker number" form before the list.
 'R-W11': async () => {
  let n = 0;
  for (const id of ['Mirab', 'Mem', 'Cat']) {
   const p = await open('P390', 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'one-column' && id === 'Cat') await style(p, '.dir-b.pg-work .b-numbered{grid-template-columns:minmax(0,1fr)!important}');
    if (prove && proofCase === 'range-cut' && id === 'Mem') await style(p, '.dir-b.pg-work .b-numbered .b-cb{max-width:40px!important;overflow:hidden!important}');
    if (prove && proofCase === 'rule-missing' && id === 'Mirab') await style(p, '.dir-b.pg-work .b-chapter-tens li a{border-top-width:0!important}');
    if (prove && proofCase === 'form-after' && id === 'Mirab') await p.evaluate(() => document.querySelector('.b-chs').after(document.querySelector('.b-chapter-go')));
    const items = await p.locator('.b-chs li').evaluateAll(els => els.map(li => {
     const b = li.getBoundingClientRect(), cb = li.querySelector('.b-cb'), cr = cb.getBoundingClientRect(), a = li.querySelector('a'), css = getComputedStyle(a);
     return {top: b.top, left: b.left, right: b.right, range: cb.textContent, cut: cb.scrollWidth > cb.clientWidth + 1 || cr.right > b.right + 1 || !cr.width, rule: parseFloat(css.borderTopWidth) >= 1 && css.borderTopStyle !== 'none' ? css.borderTopColor : null};
    }));
    const raw = Object.values(chaptersOf(id)).flat();
    assert(items.length > 0, `${id} P390 examined=0 chapters`);
    assert(items.length === raw.length, `${id} P390 chapters=${items.length}, chapters.json has ${raw.length}`);
    items.forEach((it, i) => {
     const row = Math.floor(i / 2), mate = items[i ^ 1];
     if (mate) assert(near(it.top, mate.top, 1) && (i % 2 ? it.left > mate.left : it.left < mate.left), `${id} P390 chapter ${i + 1} is not two to a row`);
     if (i >= 2) assert(it.top > items[i - 2].top, `${id} P390 chapter ${i + 1} is not on row ${row + 1}`);
     // A chapter of one line prints that one reference ("830a5–5" is 830a5).
     const want = raw[i].bekker.replace(/^(.+)–\1$/, '$1').replace(/^(\d+[ab])(\d+)–\2$/, '$1$2');
     assert(!it.cut && it.range === want, `${id} P390 chapter ${i + 1} range="${it.range}" cut=${it.cut}, chapters.json has ${raw[i].bekker}`);
     if (id === 'Mirab') {
      const want = row > 0 && row % 5 === 0 ? MID : null;
      assert(it.rule === want, `${id} P390 chapter ${i + 1} (row ${row + 1}) top rule=${it.rule}, expected ${want ?? 'none'}`);
     }
     n++;
    });
    if (id === 'Mirab') {
     const form = await p.evaluate(() => { const f = document.querySelector('.b-chapter-go'); return f && {label: f.querySelector('label')?.textContent, bottom: f.getBoundingClientRect().bottom, shown: f.getClientRects().length > 0, first: document.querySelector('.b-chs li').getBoundingClientRect().top}; });
     assert(form?.shown && form.label === 'Chapter or Bekker number' && form.bottom <= form.first, `${id} P390 chapter form=${JSON.stringify(form)}, expected "Chapter or Bekker number" before the list`);
    }
   } finally { await close(p); }
  }
  return n;
 },
});
const r9Proofs = {
 'R-H9': {'greek-gone': /D1152 home Greek line="Ἀριστοτέλους ἅπαντα" shown=true, expected τὰ σῳζόμενα/, 'phone-greek': /P390 home Greek line is visible on the upright phone/, 'phone-two-cards': /P390 returning reader cards=2, expected exactly one/, 'phone-sentence': /P390 returning reader site sentence shown 1 times/, 'phone-button-full': /P390 returning reader Continue reading at .* is not right of the title/},
 'R-H10': {'two-cards': /D1152 returning reader cards=2, expected exactly one/, 'button-small': /D1152 returning reader button height=36 text 14px/, 'no-name': /D1152 returning reader links with the accessible name "Continue reading Nicomachean Ethics"=0/, 'search-narrow': /D1152 returning reader search box .* is not across the intro/, 'passage-english': /D1152 returning reader English paragraph 14px "Now we must take as a sign/, 'same-wrong-target': /D1152 returning reader card button href=\/EN\/book\/1, expected \/EN\/book\/2#1104b3 from the seed/, 'blocked-passage': /D1152 returning reader, book data blocked: card shown=true passage link shown=true/},
 'R-W8': {'range-missing': /EN D1152 Book 1 range="undefined"/, 'range-wrong': /EN D1152 Book I range="1094a1–1103a9", round 9 prints 1094a1–1103a10/, 'saved-elsewhere': /EN D1152 returning Book 1 saved note="saved at chapter 3", expected none/, 'saved-inline': /EN P390 returning "saved at chapter 3" is not on its own line/, 'range-below': /EN D1152 Book 1 range is not beside the chapter count/},
 'R-W9': {'no-tuck': /Mem D1152 contents top=[\d.]+ is not above the plate's bottom/, 'overlap': /Mem D1440 contents right=[\d.]+ runs under the plate/, 'tucked': /Sens D1152 contents top=[\d.]+ tucks beside the plate/},
 'R-W10': {'button-low': /Juv P390 Start reading bottom=[\d.]+ is below the first screen 844/, 'plate-small': /Top P390 plate height=100 below 120/, 'no-contents-link': /EN P390 Contents link=null is not at the end of the line/, 'fold-open': /Cat P390 editions fold=.*"open":true/, 'returning-link': /EN P390 returning buttons=.*"Contents"/, 'resume-half': /EN P390 returning Continue at width=[\d.]+ of [\d.]+;.*expected a full-width Continue/, 'summary-top': /EN P390 returning summary top=[\d.]+ is above the contents' end/},
 'R-W11': {'one-column': /Cat P390 chapter 1 is not two to a row/, 'range-cut': /Mem P390 chapter 1 range=".*" cut=true/, 'rule-missing': /Mirab P390 chapter 11 \(row 6\) top rule=null, expected rgb\(93, 92, 87\)/, 'form-after': /Mirab P390 chapter form=.*before the list/},
};

// A proof is valid only when its own mutation causes the named assertion.
const proofMessages = {
    'R-W1': /AthPol crumb=Works \/ Rhetoric and poetics/,
    'R-W1-text': /Cat raw footnote marker in work text/,
    'R-W2': /Cat Start reading target=\/EN\/book\/1/,
    'R-W3': /Cat wrong chapter target:/,
    'R-T1': /Cat P390 poster lines=/,
    'R-T2': /Cat D1440 Start reading bottom=/,
    'R-C1': /home title color=rgb\(0, 0, 0\)/,
    'R-C2': /legacy width token:.*injected fixture/,
    'R-F1': /screen font Anton/,
    'R-F2': /light \/ --bg=#ffffff expected #f4f4f1/,
    'R-P4': /\/ D1440\/dark filter=sepia\(0\.45\) brightness\(0\.76\) contrast\(1\.06\)/,
    'R-T3': /D1525 \/ bust size=.*, spec says 189 wide at aspect \.592/,
    'R-T4': /P390\/light object-fit=contain/,
    'R-H1': /P390 home line mismatch/,
    'R-H2': /IV ids=EN,MM,EE,VV,Pol,Oec$/,
    'R-H3': /placeholder links in .*footer fixture/,
    'R-A1': /D1440 BUTTON.*34×34/,
    'R-A2': /focus missing .*b-search|focus missing .*name="q"/,
    'R-A3': /light H3\.b-sub sub-label .*ratio=.*color=rgb\(226, 56, 46\)/,
    'R-E1': /examined=6 violations=6; HTML fixture In this mockup/,
    'R-E2': /unsolicited overlay:.*reader-tip/,
};
const stageTwoProofs = {
    'R-W2': {'default': /Cat Start reading target=\/EN\/book\/1/, 'resume-label': /Cat resume label=Resume at chapter 1/},
    'R-F2': {'bg': /light \/ --bg=#ffffff expected #f4f4f1/, 'dark-line': /dark \/Cat\/ --line=#2d2c29 expected #45433f/},
    'R-W1': {'crumb': /AthPol crumb=Works \/ Rhetoric and poetics/, 'missing-glossary': /EN tools row=.*expected .*Glossary/, 'crumb-height': /Cat D1440 crumb height=/, 'crumb-height-phone': /Cat P390 crumb height=/, 'phone-order': /Cat P390 visual order /, 'no-english': /Cat examined=0 English facts/, 'row-height': /EN edition row Ostwald height=3\d(\.\d)?, expected 40±1/, 'imprint-underlined': /Cat edition row Edghill underlines \["Edghill","\(Oxford, 1928\)"\]/, 'opens-first-single': /Mete edition row Webster "opens first"=1, expected 0/},
    'R-T3': {'title-faded': /D1440\/light \/ title opacity=0\.82 expected 1/, 'home-plate': /D1525\/light \/ bust size=.*, spec says 189×320 at aspect \.592/, 'dark-bust': /D1152\/dark \/ bust size=.*, spec says 161×272 at aspect \.592/, 'work-plate': /D1525 \/GC\/ plate size=200\.0×.*, plates\.json ink box gives 362\.7×358\.6/, 'plate-origin': /D1525 \/MA\/ plate image offset=0\.0,/},
    'R-T2': {'cap': /Cat D1440 Start reading bottom=/, 'scroll-budget': /Juv P390 scroll changed poster height/, 'crop': /Cat D1440 object-fit=cover expected fill/},
    'R-K1': {'record': /EN Records=\[\{"part":"Record","href":"#"\}\] expected=\[\{"part":"Record","href":"https:/, 'punctuation': /home credits doubled full stop/, 'licence': /home credits licence must be in parentheses/, 'licence-stop': /home credits stop before licence/},
    'R-W3': {'chapter-target': /Cat wrong chapter target:/, 'numeral-red': /Phys book numbers are not --ink/},
    'R-W1-bekker': {'short-end': /Meta invalid book-header Bekker range: 980a21–29/, 'backwards': /Meta backwards book-header Bekker range: 993a29–980a21/},
    'R-W1-scheme': {'synthetic': /Isa synthetic range in non-Bekker work: 1a3–16/},
    'R-E1': {'copy': /examined=6 violations=6; HTML fixture In this mockup/, 'no-headings': /\/Cat\/ examined=0 section headings/, 'empty-heading': /\/Cat\/ empty headings:/},
    'R-T5': {'desktop-poster': /S844 home gap=/, 'two-columns': /S844 .*works grid has more than one column/, 'plate-left': /Cat S844 plate left=[\d.]+ is not right of the buttons/, 'buttons-stack': /EN S844 buttons not in one row/, 'juv-below': /Juv S844 button bottom=[\d.]+ is below the first screen/, 'title-shrunk': /Juv S844 title font-size=28 under 32px/, 'resume-short': /EN S844 returning Continue at width=.*not full width/},
};
// D26 gates: each proof is a deliberate break that must trip the gate's own assertion.
const d26Proofs = {
    'R-P4': {'no-plate': /\/ D1440\/light examined=0 plates shown, expected 1/, 'sepia': /\/ D1440\/dark filter=sepia\(0\.45\) brightness\(0\.76\) contrast\(1\.06\) picture filter=none/, 'light-in-dark': /\/EN\/ D1440\/dark plate src=.*\/plates\/desk\/EN\.jpg, expected \/plates\/dark\/desk\/EN\.webp/, 'eager-light': /\/Juv\/ P390\/dark fetched the other theme's plate: .*\/plates\/phone\/Juv\.jpg/, 'box-moved': /\/Mirab\/ D1152 dark plate box=.* differs from light box=/, 'toggle-stale': /\/EN\/ P390 toggled\/dark plate src=.*\/plates\/phone\/EN\.jpg, expected \/plates\/dark\/phone\/EN\.webp/},
    'R-T1': {'golden-line': /Cat P390 poster lines=\["CAT","EGORIES"\] expected=\["CATEGORIES"\]/, 'drawn-size': /Cat P390 drawn sizes=12\.0 expected=/, 'no-cap': /Top P390 poster sizes=117 expected=64/, 'desktop-small': /Cat G1440 title font-size=30 outside 38–60/, 'desktop-lines': /Cat G1440 title is not natural: 2 fitted lines/},
    'R-H4': {'tall-top': /D1152 new reader works list top=[\d.]+, round 9 draws 453±6/, 'returning-gap': /D1152 two saved reader works list top=[\d.]+, round 9 draws 361±6/, 'scrolled': /D1152 new reader scrollY=120, must be 0/},
    'R-H5': {'title-wide': /D1525 home title width=[\d.]+ but list column width=/, 'title-shifted': /D1152 home title left=[\d.]+ but list column 2 left=/, 'work-title-narrow': /GC D1525 work title width=300, expected one third of/, 'work-title-moved': /Mete D1152 work title left=[\d.]+, expected column 1 at 72/},
    'R-H6': {'bust-short': /D1525 new reader bust bottom=[\d.]+ and search bottom=[\d.]+ differ by more than 2px/, 'range-wrong': /D1152 new reader subject strip=.*980–1094/, 'dead-anchor': /D1152 new reader subject strip=.*"#division-VI",null/, 'strip-below': /D1525 new reader subject strip [\d.]+–[\d.]+ is not between the foot line/},
    'R-W4': {'button-moved': /Cat D1152 Start reading top=[\d.]+, round 9 draws 253±4/, 'greek-red': /Mete D1440 Greek title color=rgb\(180, 36, 25\), expected --ink/, 'greek-apart': /Mirab D1525 Greek title at .* is not straight under the title/, 'mode-gap': /Juv D1152 reading line starts [\d.]+px under the buttons, round 9 draws 6/, 'contents-low': /EN D1152 contents top=[\d.]+, expected 516±6/, 'wrong-translator': /APr D1440 reading line="Greek and English · Owen", expected "Greek and English · Jenkinson"/},
    'R-W5': {'plate-left': /plate centre x=[\d.]+ is not in column 3/, 'plate-middle': /plate centre x=[\d.]+ is not in column 3/, 'crumb-indent': /crumb left=[\d.]+, content column left=/, 'plate-shifted': /plate centre x=[\d.]+ width=[\d.]+: not centred on column 3/, 'caption': /D1525 plate caption: \[".+"\]/, 'caption-phone': /EN P390 plate caption: \[".+"\]/},
    'R-C3': {'red-title': /\/ light uses --red rgb\(226, 56, 46\): h1\.b-po-t color/, 'red-border': /\/GC\/ light uses --red rgb\(226, 56, 46\): .*border-bottom-color/, 'red-dark': /\/Mete\/ dark uses --red rgb\(255, 90, 77\): .*color/, 'faded-title': /\/MA\/ title opacity=0\.82, expected 1/},
    'R-H7': {'old-heading': /a division head reads "Dubious and spurious works"/, 'duplicate': /data-work listed twice: Cat/, 'tag-lost': /tags=15, expected 16/, 'prob-moved': /Minor works \(Opuscula\) holds Prob,Col,/, 'isa': /(the Isagoge is on the home list|list differs from spec)/},
    'R-H8': {'wraps': /D1525 Greek line is drawn on [2-9] lines/, 'wrong-red': /D1152 Greek line color=rgb\(226, 56, 46\), expected --red-ink/, 'short': /D961 Greek line text width=[\d.]+ but its column is/},
};
Object.assign(stageTwoProofs, d26Proofs);
Object.assign(stageTwoProofs, r9Proofs);
const homeTitleProofs = {
    'desktop-size': /D1525 home line 1 size=\d+ expected=82\.5 ±1px|D1525 home line 1 drawn size=60 expected=82\.5/,
    'golden-line': /P390 home lines=\["THE COMPLETE","WORKS OF","ARISTOTLE"\] expected=\["THE","COMPLETE","WORKS OF","ARISTOTLE"\]/,
    'resize-observer': /S844 → S960 fitter did not re-fit/,
};
const sidewaysProofs = {
    'desktop-poster': /S844 home gap=/,
    'two-columns': /S844 .*works grid has more than one column/,
};
// Parse real Svelte CSS, so selectors inside :global(), @media, and @container
// count, while comments and declaration strings cannot trigger this gate.
function bStyleSelectors(source, filename) {
    const {parse} = createRequire(import.meta.url)('svelte/compiler');
    const css = parse(source, {filename, modern:true}).css;
    const found=[];
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if(node.type==='ClassSelector' && (node.name==='dir-b'||node.name==='frame'||node.name.startsWith('b-')))found.push('.'+node.name);
        for(const value of Object.values(node)) if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
    };
    visit(css);return {found, styleBlocks: css ? 1 : 0};
}
if(stage>=4) Object.assign(gates, {
    'R-C1-static': async()=>{
        const files=[...walk(join(app,'src'),/\.svelte$/),...walk(fileURLToPath(new URL('../../shared/components/',import.meta.url)),/\.svelte$/)];
        assert(files.length>0,'examined=0 Svelte files');
        const bad=[];
        let styleBlocks=0;
        for(const [i,file] of files.entries()) {
            let source=readFileSync(file,'utf8');
            if(prove&&proofCase==='no-styles')source=source.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
            if(prove&&proofCase!=='no-styles'&&i===0) source=source.includes('<style') ? source.replace(/(<style[^>]*>)/,'$1\n:global(.dir-b .b-rh){height:60px}\n') : source+'\n<style>:global(.dir-b .b-rh){height:60px}</style>';
            const {found,styleBlocks: blocks}=bStyleSelectors(source,file);
            styleBlocks+=blocks;
            console.log(`R-C1-static examined ${file}`);
            if(found.length)bad.push(`${file}: ${found.join(', ')}`);
        }
        console.log(`R-C1-static style blocks examined=${styleBlocks}`);
        assert(styleBlocks>0,'examined=0 Svelte style blocks');
        assert(!bad.length,`B selectors in Svelte style: ${bad.join('; ')}`);
        return files.length;
    },
    'R-S1': async()=>{
        let n=0;
        // This query reaches XXXVIII.10 967b20, wider than the kit's 90px track.
        for(const size of ['D1920','D1440','P390']) {
            const p=await open(size,'light','/search?q=κριθὰς&w=Prob');
            try {
                await expandSearch(p);
                await checkSearchHashes(p, `${size} Problemata`);
                const hits=await p.locator('.b-hit').evaluateAll(readSearchRefs);
                assert(hits.some(h=>h.text==='XXXVIII.10 967b20'),`${size} Problemata sample missed XXXVIII.10 967b20`);
                for(const h of hits) {
                    assert(searchRefOnOneLine(h),`${size} hit ref wraps: ${h.text}`);
                    assert(searchRefBeforeColumn(h),`${size} hit ref overlaps column: ${h.text} right=${h.refRight} column-left=${h.columnLeft}`);
                    n++;
                }
                const layout=await p.locator('.b-sg[data-result-work="Prob"]').evaluate(group=>({
                    width:group.getBoundingClientRect().width,
                    hits:[...group.querySelectorAll('.b-hit')].map(hit=>{
                        const ref=hit.querySelector('.b-hr').getBoundingClientRect();
                        const greek=hit.querySelector('.b-hg').getBoundingClientRect();
                        const box=hit.getBoundingClientRect();
                        return {left:greek.left,gap:greek.left-ref.right,width:box.width,right:greek.right,hitRight:box.right};
                    }),
                }));
                assert(layout.hits.length>1,`${size} Problemata examined<2 hits`);
                for(const h of layout.hits) {
                    assert(h.width<=1080.5&&h.right<=h.hitRight+.5,`${size} hit content exceeds 1080px cap: ${JSON.stringify(h)}`);
                    if(size!=='P390') {
                        assert(Math.abs(h.gap-18)<.5,`${size} Problemata gap=${h.gap}`);
                        assert(Math.abs(h.left-layout.hits[0].left)<.5,`${size} Problemata Greek columns differ`);
                    }
                }
                if(size==='D1920')assert(layout.width>1080&&layout.hits.every(h=>Math.abs(h.width-1080)<.5),`${size} 1080px cap not exercised: ${JSON.stringify(layout)}`);
                console.log(`R-S1 ${size} Problemata query=κριθὰς refs=${hits.length}`);
            } finally {await close(p);}
        }
        for(const size of ['D1440','P390']) {
            const p=await open(size,'light',SEARCH);
            try {
                const color=await p.locator('.b-sr-big').evaluate(el=>getComputedStyle(el).color);
                assert(color==='rgb(226, 56, 46)',`${size} search count color=${color}`);n++;
                const layout=await p.locator('.b-sr-w').evaluate(el=>({position:getComputedStyle(el).position,direction:getComputedStyle(el).flexDirection,overflow:getComputedStyle(el).overflowX}));
                assert(size==='P390' ? layout.direction==='row'&&['auto','scroll'].includes(layout.overflow) : layout.position==='sticky',`${size} work index layout=${JSON.stringify(layout)}`);n++;
                if(prove&&proofCase==='hash-link')await p.locator('.b-sq-o a').first().evaluate(el=>el.setAttribute('href','#'));
                // Every page and every collapsed group, not only the first visible hit.
                const status=await p.locator('.pager-status').count() ? await p.locator('.pager-status').first().textContent() : '';
                const pageCount=Number(status.match(/of (\d+)/)?.[1]||1);
                let refs=0, wrappedRefInjected=false, overlapRefInjected=false;
                const invalidRefs=[];
                for(let pageIdx=0;pageIdx<pageCount;pageIdx++) {
                    await expandSearch(p);
                    if (prove && proofCase === 'late-hash' && pageIdx === 1) await p.locator('.b-hr').first().evaluate(el => el.setAttribute('href','#'));
                    await checkSearchHashes(p, `${size} page ${pageIdx+1}`);
                    let hits=await p.locator('.b-hit').evaluateAll(readSearchRefs);
                    if(prove&&proofCase==='overlap-ref'&&!overlapRefInjected&&size==='D1440') {
                        // Keep nowrap and the 18px gap; shrink only the ref track.
                        const target=hits.find(h=>h.visible&&h.lines===1&&h.textWidth>78);
                        if(target) {
                            await p.locator('.b-hit').nth(target.index).evaluate(el=>{
                                el.style.gridTemplateColumns='60px minmax(0,1fr)';
                            });
                            await settleFonts(p);
                            hits=await p.locator('.b-hit').evaluateAll(readSearchRefs);
                            overlapRefInjected=true;
                        }
                    }
                    if(prove&&proofCase==='wrapped-ref'&&!wrappedRefInjected) {
                        // Early Categories refs can fit inside 60px. Keep the exact
                        // mutation, but choose a measured ref that exceeds its width.
                        const target=hits.find(h=>h.visible&&h.lines===1&&h.textWidth>60&&/\s/.test(h.text));
                        if(target) {
                            await p.locator('.b-hit .b-hr').nth(target.index).evaluate(el=>{
                                el.dataset.wrapProof='true';
                                el.style.cssText='display:block;white-space:normal;width:60px;min-width:0;min-height:0;height:auto';
                            });
                            await settleFonts(p);
                            hits=await p.locator('.b-hit').evaluateAll(readSearchRefs);
                            assert(hits.filter(h=>h.proof).length===1,`${size} wrapped-ref proof lost its target before measurement`);
                            wrappedRefInjected=true;
                        }
                    }
                    assert(hits.length>0,`${size} page ${pageIdx+1} examined=0 hit refs`);
                    for(const h of hits) {
                        if(h.scheme !== (registry.getWork(h.work)?.citation?.scheme || 'bekker') || !searchRefFormat(h))invalidRefs.push(`${h.scheme}: ${h.text}`);
                        assert(searchRefOnOneLine(h),`${size} hit ref wraps: ${h.text} lines=${h.lines} height=${h.height} line-height=${h.lineHeight} visible=${h.visible} proof=${h.proof}`);
                        assert(searchRefBeforeColumn(h),`${size} hit ref overlaps column: ${h.text} right=${h.refRight} column-left=${h.columnLeft}`);
                        refs++;
                    }
                    if(pageIdx+1<pageCount){await p.locator('.pager').first().getByRole('button',{name:'Next ›'}).click();await searchReady(p);}
                }
                if(prove&&proofCase==='overlap-ref'&&size==='D1440')assert(overlapRefInjected,`${size} overlap-ref proof has no ref wide enough to mutate (>78px)`);
                if(prove&&proofCase==='wrapped-ref')assert(wrappedRefInjected,`${size} wrapped-ref proof has no ref wide enough to mutate (>60px)`);
                console.log(`R-S1 ${size} pages=${pageCount} refs=${refs}`);n+=refs;
                const before=await p.locator('.b-sg').evaluateAll(els=>els.map(el=>el.dataset.resultWork).join(','));
                const filters=p.locator('[data-work-filter]');
                assert(await filters.count()>1,`${size} examined<2 work filters`);
                // Pick a work absent on this page, when possible, to prove content changes.
                const ids=await filters.evaluateAll(els=>els.map(el=>el.dataset.workFilter));
                const target=ids.find(id=>!before.split(',').includes(id))||ids[ids.length-1];
                const filter=p.locator(`[data-work-filter="${target}"]`);
                if(prove&&proofCase==='dead-filter')await filter.evaluate(el=>el.addEventListener('click',e=>e.stopImmediatePropagation(),true));
                await filter.click();await searchReady(p);
                await checkSearchHashes(p, `${size} filtered`);
                const after=await p.locator('.b-sg').evaluateAll(els=>els.map(el=>el.dataset.resultWork).join(','));
                assert(before!==after&&after.split(',').every(id=>id===target),`${size} work filter did not change hits: before=${before} after=${after}`);n++;
                const greekQuery=await p.getByRole('searchbox',{name:'Search Greek',exact:true}).inputValue();
                let englishQuery='';
                for(const language of ['English','Both','Greek','English','Both']) {
                    const button=p.locator(`[data-search-language="${language}"]`);
                    if(prove&&proofCase==='dead-language'&&language==='English')await button.evaluate(el=>el.addEventListener('click',e=>e.stopImmediatePropagation(),true));
                    await button.click();
                    await p.waitForFunction(()=>document.querySelector('.b-search-page')?.dataset.searchBusy==='false');
                    await checkSearchHashes(p, `${size} ${language} switched`);
                    const mode=await p.locator('.b-search-page').getAttribute('data-query-mode');
                    assert(mode===language&&await button.getAttribute('aria-pressed')==='true',`${size} language ${language} did not change live query mode: ${mode}`);
                    if(language==='English') {
                        const input=p.getByRole('searchbox',{name:'Search English',exact:true});
                        if(prove&&proofCase==='copy-language')await input.fill(greekQuery);
                        assert(await input.inputValue()===englishQuery,`${size} language English copied a query across languages or lost its own query`);
                        if(!englishQuery) {
                            englishQuery='virtue';await input.fill(englishQuery);
                            await p.locator('.b-sq-f button[type=submit]').first().click();
                        }
                    } else {
                        assert(await p.getByRole('searchbox',{name:'Search Greek',exact:true}).inputValue()===greekQuery,`${size} language ${language} lost its Greek query`);
                        if(language==='Both')assert(await p.getByRole('searchbox',{name:'Search English',exact:true}).inputValue()===englishQuery,`${size} language Both lost its English query`);
                    }
                    await searchReady(p);
                    await checkSearchHashes(p, `${size} ${language}`);
                    const url=new URL(p.url());
                    const valid=language==='English' ? url.searchParams.get('e')===englishQuery&&!url.searchParams.has('g') : language==='Greek' ? url.searchParams.get('g')===greekQuery&&!url.searchParams.has('e') : url.searchParams.get('g')===greekQuery&&url.searchParams.get('e')===englishQuery;
                    assert(valid,`${size} language ${language} did not change live query mode: ${mode} ${url.search}`);n++;
                }
                assert(!invalidRefs.length,`${size} citation ref format: ${invalidRefs.slice(0,12).join('; ')}`);
            }finally{await close(p);}
        }
        const schemes = new Set();
        for (const work of registry.WORKS.filter(w => w.citation && w.citation.scheme !== 'bekker')) {
            for (const language of ['grk','eng']) {
                const query = language === 'grk' ? (work.id === 'Isa' ? 'γένος' : 'πολιτεία') : (work.id === 'Isa' ? 'genus' : 'constitution');
                const p = await open('D1440','light',`/search?${language === 'grk' ? 'g' : 'e'}=${encodeURIComponent(query)}&w=${work.id}`);
                try {
                    const status = await p.locator('.pager-status').count() ? await p.locator('.pager-status').first().textContent() : '';
                    const pages = Number(status.match(/of (\d+)/)?.[1] || 1);
                    for (let i=0; i<pages; i++) {
                        await expandSearch(p);
                        await checkSearchHashes(p, `D1440 ${work.id} ${language} page ${i+1}`);
                        if (prove && proofCase === 'non-bekker-ref') await p.locator('.b-hr').first().evaluate(el => el.textContent = 'I.1 wrong');
                        const hits = await p.locator('.b-hit').evaluateAll(readSearchRefs);
                        assert(hits.length > 0, `${work.id} ${language} examined=0 non-Bekker refs`);
                        for (const h of hits) {
                            assert(h.scheme === work.citation.scheme && searchRefFormat(h), `${work.id} ${language} non-Bekker ref format: ${h.text}`);
                            assert(searchRefOnOneLine(h), `D1440 hit ref wraps: ${h.text}`);
                            assert(searchRefBeforeColumn(h), `D1440 hit ref overlaps column: ${h.text}`);
                            schemes.add(h.scheme); n++;
                        }
                        if(i+1<pages) { await p.locator('.pager').first().getByRole('button',{name:'Next ›'}).click(); await searchReady(p); }
                    }
                } finally { await close(p); }
            }
        }
        console.log(`R-S1 non-Bekker schemes covered=${[...schemes].join(', ')}`);
        assert(schemes.has('busse') && schemes.has('chapter-section'), 'R-S1 missing non-Bekker scheme coverage');
        return n;
    },
});
if (stage >= 5) Object.assign(gates, {
    'R-L1': async () => {
        let n=0;
        for (const e of lemmaSample) for (const size of ['D1440','P390']) {
            const p=await open(size,'light',`/lemma/${e.slug}/`);
            try {
                if(prove) await style(p,'.dir-b .b-wp{font-size:200px!important}');
                const got=await p.locator('.b-wp').evaluate(el=>({family:getComputedStyle(el).fontFamily,size:parseFloat(getComputedStyle(el).fontSize),width:el.clientWidth,scroll:el.scrollWidth,text:el.textContent}));
                assert(/^['"]?Gentium Book Plus/.test(got.family),`headword family=${got.family}`);
                assert(got.size>=24&&got.size<=(size==='P390'?80:150),`headword size=${got.size} cap=${size==='P390'?80:150}`);
                assert(got.scroll<=got.width,`headword overflow scroll=${got.scroll} width=${got.width}`);
                assert(got.text===e.head,`headword changed: ${got.text}`);n++;
            }finally{await close(p);}
        }
        return n;
    },
    'R-L2': async () => {
        let n=0;
        for(const e of lemmaSample) for(const size of ['D1440','P390']) {
            const p=await open(size,'light',`/lemma/${e.slug}/`);
            try {
                if(prove&&proofCase==='empty-section')await p.locator('.b-bw').evaluate(el=>el.replaceChildren());
                if(prove&&proofCase==='dead-nearby')await p.locator('.b-near a').first().evaluate(el=>el.setAttribute('href','/lemma/missing-stage-five/'));
                const heads=await p.locator('h2.b-h2').evaluateAll(els=>els.map(el=>({title:el.textContent.trim(),content:!!el.nextElementSibling?.textContent.trim()})));
                assert(heads.length>0,'examined=0 lemma headings');
                for(const h of heads) {
                    assert(h.content,`empty lemma section: ${h.title}`);
                    assert(!h.title.includes('Key passages'),`Key passages heading`);n++;
                }
                assert(!(await p.locator('main').innerText()).includes('will appear here'),'lemma stub will appear here');
                const links=await p.locator('.b-near a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));
                assert(links.length===18,`Nearby links=${links.length}`);
                for(const href of links) {
                    const path=decodeURIComponent(new URL(href,BASE).pathname).replace(/^\//,'');
                    assert(existsSync(join(dist,path,'index.html')),`dead Nearby link: ${href}`);n++;
                }
            }finally{await close(p);}
        }
        return n;
    },
    'R-L3': async () => {
        const mapping=lemmaHelpers.mapGlossary(glossary.GLOSSARY_BODIES,lemmaHeads);
        assert(mapping.matched.length===50,`expected 50 Ostwald mappings, got ${mapping.matched.length}`);
        const window=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});
        const doc=window.document;
        const glossaryDoc=doc.createElement('div');glossaryDoc.innerHTML=readFileSync(join(dist,'EN/glossary/index.html'),'utf8');
        const text=html=>{const el=doc.createElement('div');el.innerHTML=html;return el.textContent.replace(/\s+/g,' ').trim();};
        let n=0;
        try {for(const match of mapping.matched) {
            doc.body.innerHTML=readFileSync(join(dist,'lemma',match.lemma.slug,'index.html'),'utf8');
            if(prove&&n===0) {
                if (proofCase === 'body') doc.querySelector('[data-glossary] p').textContent = 'Wrong glossary body';
                else doc.querySelector('.b-cite a')?.remove();
            }
            assert([...doc.querySelectorAll('h2.b-h2')].some(h=>h.textContent==='Ostwald'),`missing Ostwald heading: ${match.form}`);
            for(const body of rawGlossaryBodies(readFileSync(join(app,'../shared/glossary/EN.md'),'utf8'),match.entry.slug)) {
                const block=[...doc.querySelectorAll('[data-glossary]')].find(el=>el.getAttribute('data-glossary')===body.slug);
                assert(block&&text(block.querySelector('p')?.innerHTML??'')===body.text,`Ostwald body mismatch: ${match.form}`);
                assert(block.querySelector(`.b-cite a[href="/EN/glossary/#${body.slug}"]`),`missing Ostwald citation: ${match.form} #${body.slug}`);
                assert(glossaryDoc.querySelector(`[id="${body.slug}"]`),`missing glossary anchor: ${body.slug}`);
            }
            n++;
        }} finally {window.close();}
        console.log(`R-L3 matched=${n} unmatched=${JSON.stringify(mapping.unmatched)} ambiguous=${JSON.stringify(mapping.ambiguous)}`);
        return n;
    },
    'R-L4': async () => {
        let n=0;
        for(const e of lemmaSample) {
            const p=await open('D1440','light',`/lemma/${e.slug}/`);
            try {
                if(prove)await p.locator('.b-bw a').first().evaluate(el=>el.setAttribute('href','#'));
                const rows=await p.locator('.b-bw li').evaluateAll(els=>els.map(el=>({work:el.dataset.work,href:el.querySelector('a')?.getAttribute('href')})));
                const data=JSON.parse(readFileSync(join(app,'public/data/lemmata',e.slug+'.json'),'utf8'));
                assert(rows.length===data.byWork.length&&rows.length>0,`examined=${rows.length} By work rows`);
                for(const [i,row] of rows.entries()) {
                    const url=new URL(row.href,BASE), decoded=searchUrl.decodeSearchUrl(url.searchParams,workIds);
                    assert(url.pathname==='/search'&&decoded.lemmas.length===1&&decoded.lemmas[0]===searchHelpers.greekFold(e.key)&&decoded.works.length===1&&decoded.works[0]===data.byWork[i].work&&row.work===data.byWork[i].work&&!decoded.workFilter&&!decoded.combo&&!decoded.grk&&!decoded.eng,`invalid By work search: ${row.href}`);n++;
                }
            }finally{await close(p);}
        }
        return n;
    },
});
const assetProofs = {'no-css': /R-C2 missing built assets: CSS files=0 JS files=\d+/, 'no-js': /R-C2 missing built assets: CSS files=\d+ JS files=0/, 'legacy': /legacy width token:/};
const stageThreeProofs = {
    'R-C2': assetProofs,
    ...stageTwoProofs,
    'R-F2': {...stageTwoProofs['R-F2'], 'reader-line': /dark \/EN\/book\/1 --line=#45433f expected #2d2c29/},
    'R-C1': {'aux-css': /404\.html B CSS sentinel missing:/, 'home': /home title color=rgb\(0, 0, 0\)/, 'reader': /reader \.b-rh height=/},
    'R-A1': {'reading-button': /D1440 BUTTON Gate reading button /, 'chapter-fn': /D1440 footnote mark \d+ misses its 40px hit area/, 'late-fn': /D1440 footnote mark \d+ misses its 40px hit area/, 'theme-toggle': /D1440 BUTTON.*34×34/, 'fn-hit': /\/EN\/book\/1 D1440 footnote mark \d+ misses its 40px hit area/},
    'R-A2': {'search': /focus missing .*b-search|focus missing .*name="q"/, 'reader-token': /focus missing <span class="tok/, 'panel-ring': /D1440 word panel opened by keyboard: no focus ring/, 'help-ring': /D1440 Help opened by keyboard: no focus ring/},
    'R-A3': {'sub-label': /light H3\.b-sub sub-label .*ratio=.*color=rgb\(226, 56, 46\)/, 'reader-ln': /light SPAN\.line-num b-ln/},
    'R-E1': {...stageTwoProofs['R-E1'], 'reader-tail-heading': /empty headings: Gate tail heading/, 'reader-empty-chapter': /empty headings: Gate empty chapter/, 'reader-copy': /\/EN\/book\/1 D1440 panel-open explainer text: No analysis/},
    'R-R1': {'head': /EN D1440 greek reader chrome labels a Greek edition: Greek: Bywater, 1894/, 'print': /EN printed footer lacks "Greek text: /, 'print-chrome': /EN printed page shows screen furniture: \.b-side/, 'print-grid': /EN print grid: gap=64px/, 'print-book': /EN printed page drops the book label "[^"]*Book I"/i, 'print-margin': /EN printed body margin=8px/},
    'R-R2': {'kit-wrap': /EN S844 reader head breaks into two rows/, 'pad-overflow': /EN S844 reader head runs \d+\.\dpx into its right padding/},
    'R-R3': {'i-book-i': /EN contents book head "I Book I"/},
    'R-R4': {'stack-s844': /S844 English below Greek: row stacks/},
    'R-R5': {'nothing-unwrapped': /examined nothing unwrapped/, 'no-nowrap': /EN D1440 Greek column width=80 expected/, 'narrow-column': /EN D1440 Greek column width=80 expected/, 'late-overlap': /EN D1440 \d+ English line boxes overlap Greek words/, 'small-descendant': /EN D1440 reading text under 18px: .*span\.gate-small 12px/, 'small-table': /\/EN\/book\/1 D1440 eng-table fixture reading text under 18px: .*table\.eng-table.*td /, 'table-overflow': /\/EN\/book\/1 P390 eng-table fixture horizontal page overflow:/, 'ln-margin': /EN D1440 column label "1094a" right ink x[\d.]+ is 10\.0px off the line numbers' right edge/, 'ln-col-low': /EN D1440 column label "1094a" baseline below its line by 3\.2px/, 'round-eight':/EN W1200 panel open Greek column width=/, 'phone-shrink': /EN P390 both reading text under 18px:/, 'ln-shift': /EN D1440 line numbers' gutter to the Greek is [\d.]+–[\d.]+px, expected 12\.\d+±1px/},
    'R-R6': {'no-rerun': /panel open did not change --gcol/},
    'R-R7': {'late-panel': /D1440 \d+ English line boxes under the panel/, 'round-eight-compare': /D1440 Compare \d+ English line boxes under the panel/},
    'R-R8': {'bottom-sheet': /S844 panel anchored to the bottom/},
    'R-R10': {'bold-hit': /Greek elements bold or italic/, 'eager-cardo': /Cardo requested on a fresh load/, 'didot-row': /Aa Greek fonts \["Literata αβγ","Gentium αβγ","Cardo αβγ","Didot αβγ"\], expected Literata, Gentium, Cardo/, 'english-apart': /the row after the Greek font row is \["Text size/, 'didot-kept': /saved reader-gfont=didot: data-gfont=didot/},
    'R-R11': {'english-400': /Literata English \d+ of \d+ elements not Literata 300, e\.g\. DIV\.english-col\.b-ec weight=400/, 'greek-400': /Literata Greek \d+ of \d+ elements not Literata 300, e\.g\. SPAN\.line-text\.b-lt weight=400/, 'cardo-300': /Cardo Greek \d+ of \d+ elements not Cardo 400, .* weight=300/, 'no-face': /no loaded Literata 300 face for Greek/},
    'R-R12': {'both-gap': /both paragraph break before ".*" height=16\.6px, expected 0/, 'english-flat': /english paragraph break before ".*" height=0px, expected 16\.6/, 'no-indent': /both paragraph ".*" first line indent=0px, expected 1\.3em=25\.4/},
    'R-R13': {'flush': /D1440 greek continued line L1094a-18-c text starts 0px in, expected 2\.5em=48\.8/},
    'R-R14': {'fixed-top': /fs=0\.75 lh=0\.8: \d+ line numbers wrong: greek Greek column label "1094a" baseline below its line by [2-9]\.\dpx/, 'old-greek': /fs=1 lh=1: \d+ line numbers wrong: greek Greek column label "1094a" baseline below its line by 2\.9px/, 'old-english': /fs=1 lh=1: \d+ line numbers wrong: both English number "1" baseline above its line by [89]\.\dpx/, 'faint': /fs=1 lh=1: \d+ line numbers wrong: greek Greek number "5" color=rgb\(93, 92, 87\), expected --faint/, 'col-faint': /fs=1 lh=1: \d+ line numbers wrong: greek Greek column label "1094a" color=rgb\(108, 107, 102\), expected red/, 'small': /fs=1 lh=1: .*both English number "1" 15px Literata, expected 15px Sofia Sans/},
    'R-R15': {'english-size': /english English number "\d+" font-size=8px, expected 11px/, 'greek-low': /greek Greek number "[^"]+" baseline below its line by [6-9](\.\d)?px/, 'fixed-top': /fs=0\.75 lh=0\.8: P390 \d+ line numbers wrong: greek Greek number "[^"]+" baseline below its line by [5-9](\.\d)?px/},
    'R-R16': {'pinned': /footnote 1\.\d+ box left its marker: gap 8px at open, 208px after a 200px scroll/, 'stays-open': /footnote 1\.\d+ box still open with its marker out of view/},
    'R-R17': {'title-red': /light \.b-bk-t color=rgb\(226, 56, 46\), expected --ink/, 'head-red': /light \.b-rh-ch \[data-ctx-n\] color=rgb\(180, 36, 25\), expected --ink/, 'head-title-red': /light \.b-rh-ch i color=rgb\(180, 36, 25\), expected --ink or --mid/, 'chn-ink': /light \.b-chn color=rgb\(20, 20, 19\), expected red/, 'cht-red': /light red text outside the allowed set: \d+ runs, .*\.b-cht/, 'dark-title': /dark \.b-bk-t color=rgb\(255, 90, 77\), expected --ink/},
    'R-A5': {'nested-clip': /\/EN\/book\/1 D1440 greek clipped text: .*SPAN\.b-rh-ch .*nested text overruns its box by [1-9]/, 'title-1.2': /\/EN\/book\/1 D1440 greek clipped text: I "The good as the aim of action" scrollHeight=\d+ clientHeight=20, text overruns its box by [1-9]\.\dpx/},
    'R-A4': {'no-tabindex': /Tab from the head never reached a Greek word/, 'escape-layers': /Escape with Contents open closed the word panel too/, 'escape-help': /Escape with Help open closed the word panel too/, 'escape-note': /Escape with a footnote open closed the word panel too/},
};
const stageFourProofs = {
    ...stageThreeProofs,
    'R-C1': {...stageThreeProofs['R-C1'],search:/search \.b-sr-big color=rgb\(0, 0, 0\)/},
    'R-C1-static': {'svelte-style':/B selectors in Svelte style:.*\.dir-b, \.b-rh/, 'no-styles':/examined=0 Svelte style blocks/},
    'R-S1': {'overlap-ref':/D1440 hit ref overlaps column:/,'wrapped-ref':/D1440 hit ref wraps:/,'dead-filter':/D1440 work filter did not change hits:/,'dead-language':/D1440 language English did not change live query mode:/,'copy-language':/D1440 language English copied a query across languages/,'hash-link':/D1440 page 1 search href="#" count=1/,'non-bekker-ref':/non-Bekker ref format: I\.1 wrong/,'late-hash':/D1440 page 2 search href="#" count=1/},
    'R-A1': {...stageThreeProofs['R-A1'],'search-target':/D1440 BUTTON Greek 34×34/,'search-link-no-after':/D1440 A Lexicon [0-9.]+×[0-9.]+ state=/,'search-link-no-pointer':/D1440 A Lexicon [0-9.]+×[0-9.]+ state=/},
    'R-A2': {...stageThreeProofs['R-A2'],'search-query':/focus missing <input.*aria-label="Search Greek"/},
    'R-A3': {...stageThreeProofs['R-A3'],'search-small-red':/light BUTTON\.b-options-toggle.*"More options" ratio=.*color=rgb\(226, 56, 46\)/},
    'R-E1': {...stageThreeProofs['R-E1'],'search-copy':/search\?q=ἀρετή D1440 closed explainer text: In this mockup/},
    'R-E2': {'reader-tip':/unsolicited overlay:.*reader-tip/,'search-toast':/search\?q=ἀρετή D1440 unsolicited overlay:.*reader-tip/},
};
const stageFiveProofs = {
    ...stageFourProofs,
    'R-C1': {...stageFourProofs['R-C1'],lemma:/lemma \.b-wp font-family=serif/},
    'R-L1': {'oversize':/headword size=200 cap=150/},
    'R-L2': {'empty-section':/empty lemma section: By work/,'dead-nearby':/dead Nearby link:/},
    'R-L3': {'body': /Ostwald body mismatch:/, 'citation':/missing Ostwald citation:/},
    'R-L4': {'hash-link':/invalid By work search: #/},
};
if (only && !gates[only]) throw Error(`Unknown gate ${only}`);
let failed = 0;
let proofFailed = false;
try {
    for (const [id, run] of Object.entries(gates)) {
        if (only && only !== id) continue;
        const variants = id === 'R-C2' ? assetProofs : stage >= 5 && stageFiveProofs[id] ? stageFiveProofs[id] : stage >= 4 && stageFourProofs[id] ? stageFourProofs[id] : stage >= 3 && stageThreeProofs[id] ? stageThreeProofs[id] : stage >= 2 && stageTwoProofs[id] ? stageTwoProofs[id] : id === 'R-T5' ? sidewaysProofs : id === 'R-T1-home' ? homeTitleProofs : null;
        const cases = prove && variants ? Object.keys(variants) : ['default'];
        for (const variant of cases) {
            proofCase = variant;
            gateContext = {path: 'source files', size: 'n/a', theme: 'n/a'};
            gatePage = null;
            const expected = variants ? variants[variant] : proofMessages[id];
            try {
                const n = await run();
                assert(n > 0, 'examined=0');
                if (prove) {
                    proofFailed = true;
                    console.error(`FAIL ${id} ${failureMessage(`proof=${variant}: mutation was not caught`)}`);
                } else console.log(`PASS ${id} examined=${n}`);
            } catch (e) {
                e.message = failureMessage(e.message);
                failed++;
                if (prove) {
                    if (expected && expected.test(e.message)) {
                        console.log(`PROVE-CAUGHT ${id} case=${variant} expected=${expected}`);
                    } else {
                        proofFailed = true;
                        console.error(`PROVE-FAILED ${id} ${failureMessage(`case=${variant}: unrelated failure; expected ${expected}`)}`);
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
