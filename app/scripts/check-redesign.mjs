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
async function open(size = 'D1440', theme = 'light', path = '/', seed = false, fresh = false, stubPosterResize = false) {
    gateContext = {path, size, theme};
    gatePage = null;
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
    gatePage = page;
    page.fontFileRequests = [];
    page.fontSheetReads = [];
    page.fontFailures = [];
    page.on('requestfailed', request => {
        if (['font','stylesheet'].includes(request.resourceType())) page.fontFailures.push(`${request.url()}: ${request.failure()?.errorText}`);
    });
    page.on('request', request => {
        if (request.resourceType() === 'font') page.fontFileRequests.push(request.url());
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
    if (await page.locator('.b-po-t').count())
        await page.waitForFunction(() => document.querySelector('.b-po-t')?.dataset.set);
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
        const title = document.querySelector('.b-po-t'), img = document.querySelector('.b-po img'), po = document.querySelector('.b-po');
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
        return {gap:desktopWork?i.left-t.right:t.left+paddingLeft-image.right,titleLeft:t.left,titleBottom:t.bottom,imageTop:i.top,width:title.clientWidth,right:p.right-t.right,fit:css.objectFit,position:css.objectPosition,phone:img.currentSrc.includes('/plates/phone/'),overflow:[...title.querySelectorAll('.ln')].filter(l=>l.scrollWidth>contentWidth+1).map(l=>l.textContent),plateLeft:desktopWork?i.left:image.left,titleTop:t.top,plateTop:i.top,plateRight:i.right,plateWidth:i.width,plateHeight:i.height,expectedPlateLeft:p.right-expectedWidth,expectedPlateRight:p.right,expectedPlateTop:p.top+(p.height-expectedWidth*914/1280)/2,expectedPlateWidth:expectedWidth};
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
        for(const path of (stage>=2?['/',...workIds.map(id=>`/${id}/`)]:['/'])) for (const size of ['D1440', 'P390'])
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
        assert(n===(stage>=2?192:4),`plate count=${n}`);
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
                const box = await p.locator('.b-top .b-po picture').evaluate(el => { const r = el.getBoundingClientRect(); return {w: r.width, h: r.height}; });
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
                const box = await p.locator('.b-top .b-po picture').evaluate(el => { const r = el.getBoundingClientRect(), i = el.querySelector('img').getBoundingClientRect(); return {w: r.width, h: r.height, dx: i.left - r.left, dy: i.top - r.top, iw: i.width}; });
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
        if(stage>=2)for(const size of ['S844','S960'])for(const id of ['Cat','EN','Int','AthPol']){
            const p=await open(size,'light',`/${id}/`);
            try{
                if(prove&&proofCase==='wide-title'&&id==='Cat'&&size==='S844'){
                    const source=readFileSync(join(app,'src/lib/poster-fit.ts'),'utf8').replace('? 354 :','? el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) :');
                    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}}).outputText;
                    await p.evaluate(async js=>{const url=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));try{const mod=await import(url);mod.fitPoster(document.querySelector('.b-po-t'));}finally{URL.revokeObjectURL(url);}},js);
                }
                if(prove&&proofCase==='short-plate'&&id==='Cat'&&size==='S844')await style(p,'.dir-b.pg-work .b-po.work img{height:80px!important;width:auto!important}');
                const phone=await open('P390','light',`/${id}/`);
                let upright;try{upright=(await phone.locator('.b-po-t').getAttribute('data-set')).split(',').map(Number);}finally{await close(phone);}
                const actual=(await p.locator('.b-po-t').getAttribute('data-set')).split(',').map(Number);
                assert(actual.length===upright.length&&actual.every((value,i)=>Math.abs(value-upright[i])<=1),`${id} ${size} title sizes=${actual} P390=${upright}`);
                const g=await geometry(p);assert(g.titleBottom<=g.imageTop+1,`${id} ${size} title overlaps plate`);assert(g.phone,`${id} ${size} desktop plate loaded`);assert(!g.overflow.length,`${id} ${size} title overflow: ${g.overflow}`);
                const plateHeight=await p.locator('.b-po img').evaluate(el=>el.getBoundingClientRect().height);
                if(size==='S844')assert(plateHeight>=120,`${id} S844 plate height=${plateHeight} below 120`);
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
                            return [[-18, 0], [18, 0], [0, -18], [0, 18]].filter(([dx, dy]) => document.elementFromPoint(x + dx, y + dy)?.closest('.fn-marker') !== el).map(d => d.join(','));
                        }, i);
                        assert(!miss.length, `${path} ${size} footnote mark ${i} misses its 40px hit area at ${miss.join(' ')}`);
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
    if(prove&&proofCase==='english-facts'&&id==='Cat')await p.locator('[data-english-entry]').first().evaluate(el=>el.textContent='W. D. Ross (Oxford, 1908)');
    if(prove&&proofCase==='crumb-height'&&id==='Cat')await style(p,'.dir-b .b-crumb a{display:inline-flex!important;min-height:40px!important}');
    const crumbHeight=await p.locator('.b-crumb').evaluate(el=>el.offsetHeight);
    assert(crumbHeight<=16,`${id} D1440 crumb height=${crumbHeight}`);
    const work=registry.getWork(id);
    const crumb=(await p.locator('.b-crumb').textContent()).replace(/\s+/g,' ').trim();
    const literalCrumbs={AthPol:'Works / Ethics and politics',MM:'Works / Ethics and politics',Cat:'Works / Logic',Isa:'Works / Commentary'};
    assert(crumb===(literalCrumbs[id]||`Works / ${divisionName(id)}`),`${id} crumb=${crumb}`);
    if(prove&&proofCase==='peters-year'&&id==='EN')await p.locator('[data-english-entry]').filter({hasText:'F. H. Peters'}).evaluate(el=>el.textContent='F. H. Peters, Kegan Paul, rev. ed. 1893');
    if(prove&&proofCase==='ellis-year'&&id==='Pol')await p.locator('[data-english-entry]').filter({hasText:'William Ellis'}).evaluate(el=>el.textContent='William Ellis, 1776; rev., 1912');
    if(prove&&proofCase==='no-english'&&id==='Cat')await p.locator('[data-english-entry]').evaluateAll(els=>els.forEach(el=>el.remove()));
    const english=await p.locator('[data-english-entry]').allTextContents();
    assert(english.length>0,`${id} examined=0 English facts`);
    for(const text of english)assert(/^[^,()]+(, [^,()]+)*$/.test(text),`${id} English facts form: ${text}`);
    if(id==='EN')assert(english.some(text=>text.includes('rev. ed., 1893')),'EN Peters facts must contain rev. ed., 1893');
    if(id==='Pol')assert(english.some(text=>text.includes('1776; rev. 1912')),'Pol Ellis facts must contain 1776; rev. 1912');
    const sections=[['print',registry.furtherReading(id).length>0],['resources',registry.resourcesFor(id).length>0],['commentary',id==='Cat']];
    for(const [section,wanted]of sections)assert(await p.locator(`[data-section="${section}"]`).count()===(wanted?1:0),`${id} ${section} presence mismatch`);
    // D26: source order is the order of the columns (spec §3.4): title, Greek title, buttons, then blurb and details.
    const selectors=['.b-nav','.b-crumb','.b-po',...(work.greekTitle?['.b-wk-gt']:[]),'.b-ctas','.b-wk-blurb','[data-section="facts"]','[data-section="books"]',...sections.filter(([,yes])=>yes).map(([section])=>`[data-section="${section}"]`),'[data-section="sources"]','.b-foot'];
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
    if(id==='EN'){
     const facts=p.locator('.b-facts dd').nth(1);
     const glossary=facts.locator('a').filter({hasText:/^glossary$/});
     if(prove&&proofCase==='missing-glossary')await glossary.evaluateAll(links=>links.forEach(link=>link.remove()));
     assert(await glossary.count()===1&&/\/EN\/glossary\/?$/.test(await glossary.getAttribute('href')),'EN English facts glossary link missing or invalid');
    }
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
   const phone=await open('P390','light',`/${id}/`);
   try{if(prove&&proofCase==='crumb-height-phone'&&id==='Cat')await style(phone,'.dir-b .b-crumb a{display:inline-flex!important;min-height:40px!important}');const height=await phone.locator('.b-crumb').evaluate(el=>el.offsetHeight);assert(height<=16,`${id} P390 crumb height=${height}`);
    // D26: the source order changed (buttons before blurb); the phone must still draw the old order.
    if(prove&&proofCase==='phone-order'&&id==='Cat')await style(phone,'.dir-b.pg-work .b-ctas{order:-1!important}');
    const phoneSel=['.b-crumb','.b-po',...(registry.getWork(id).greekTitle?['.b-wk-gt']:[]),'.b-wk-blurb','.b-ctas','[data-section="facts"]'];
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
    if(prove&&proofCase==='chapter-target'&&id==='Cat')await p.locator('.b-chs a').first().evaluate(el=>el.hash='#ch-1-999');
    if(prove&&proofCase==='numeral-red'&&id==='Phys')await style(p,'.dir-b .b-bkn{color:var(--red)!important}');
    const work=registry.getWork(id), chapters=chaptersOf(id);
    assert(await p.locator('.b-bk[open]').count()===0,`${id} books open initially`);
    assert(await p.locator('.b-bk').count()===(work.books>1?work.books:0),`${id} book count mismatch`);
    if(work.books>1){
     const labels=await p.locator('.b-bkn').allTextContents();
     assert(JSON.stringify(labels)===JSON.stringify(work.bookLabels.map(label=>'Book '+label)),`${id} Book labels=${labels}`);
     // D26: colour B. The book numerals are --red-ink on the work page (spec §4).
     const red=await p.locator('.b-bkn').evaluateAll((els,want)=>els.every(el=>getComputedStyle(el).color===want),RGB.redInk);
     assert(red,`${id} book numbers are not --red-ink`);
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
    const record=await row.locator('[data-record]').getAttribute('href');
    assert(record===data.url,`${id} Record href=${record} expected=${data.url}`);
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
  // D26: the desktop golden is for a title one list column wide (362.67px at G1440, spec §5.1),
  // not the old poster's 470px: same lines, sizes scaled by 362.67/470 (spec §3.4: GC 66, Meteorology 60.5, Movement of Animals 80.9). Phone entries are unchanged.
  const golden=JSON.parse(readFileSync(join(app,'scripts/fixtures/poster-golden.json'),'utf8')).works;
  if(prove&&proofCase!=='drawn-size'){const lines=golden.Cat.desktop.lines;lines.splice(0,1,lines[0].slice(0,3),lines[0].slice(3));}
  let n=0;
  for(const id of ['Cat',...workIds.filter(id=>id!=='Cat')])for(const [size,kind] of [['G1440','desktop'],['P390','phone']]){
   const p=await open(size,'light',`/${id}/`);
   try{
    // Grok, 10 Nov: data-set is the fitter's own note; a rule that redraws the lines left it true.
    if(prove&&proofCase==='drawn-size'&&id==='Cat'&&size==='G1440')await style(p,'.dir-b .b-po-t .ln{font-size:12px!important}');
    const actual=await p.locator('.b-po-t').evaluate(el=>({lines:[...el.querySelectorAll('.ln')].map(l=>l.textContent),set:el.dataset.set,drawn:[...el.querySelectorAll('.ln')].map(l=>parseFloat(getComputedStyle(l).fontSize))}));
    const expected=golden[id][kind];
    assert(actual.lines.length>0&&JSON.stringify(actual.lines)===JSON.stringify(expected.lines),`${id} ${size} poster lines=${JSON.stringify(actual.lines)} expected=${JSON.stringify(expected.lines)}`);
    const sizes=actual.set.split(',').map(Number), target=expected.set.split(',').map(Number);
    assert(sizes.length===target.length&&sizes.every((v,i)=>Math.abs(v-target[i])<=1),`${id} ${size} poster sizes=${actual.set} expected=${expected.set}`);
    assert(actual.drawn.length===target.length&&actual.drawn.every((v,i)=>Math.abs(v-target[i])<=1),`${id} ${size} drawn sizes=${actual.drawn.map(v=>v.toFixed(1))} expected=${expected.set}`);n++;
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
     return {startDoc:start.bottom+scrollY,height:innerHeight,bottom:start.bottom,posterHeight:poster.height,navHeight:document.querySelector('.b-nav').offsetHeight,titleHeight:title.clientHeight,fit:css.objectFit,ratio:width/height,phone:matchMedia('(max-width:960px)').matches};
    });
    if(size==='S844')assert(box.posterHeight<=box.height-box.navHeight+1,`${id} ${size} poster height=${box.posterHeight} exceeds viewport minus nav`);
    else assert(box.bottom<=box.height-16+1,`${id} ${size} Start reading bottom=${box.bottom} viewport=${box.height}`);
    const expected=box.phone?640/558:1280/914;
    // D26: from 961px the plate is cut to its ink box and drawn with object-fit: fill at its own 1280:914 ratio (spec §5.3).
    const wantFit=box.phone?'contain':'fill';
    assert(box.fit===wantFit,`${id} ${size} object-fit=${box.fit} expected ${wantFit}`);
    assert(Math.abs(box.ratio/expected-1)<=.01,`${id} ${size} plate ratio=${box.ratio} expected ${expected}`);
    // D26: only the phone and sideways posters still budget their height from scrollY, so this proof runs at P390, on Long, whose long title makes its budget bind.
    if(prove&&proofCase==='scroll-budget'&&id==='Long'&&size==='P390')await p.evaluate(()=>Object.defineProperty(window,'scrollY',{get:()=>0,configurable:true}));
    await p.evaluate(()=>{window.scrollTo(0,600);window.dispatchEvent(new Event('resize'));});
    await p.waitForTimeout(150);
    // D26: on desktop .b-po.work is display:contents, so the layout to hold still is the buttons' place on the page.
    const after=await p.evaluate(desktop=>desktop?document.querySelector('[data-start]').getBoundingClientRect().bottom+scrollY:document.querySelector('.b-po.work').offsetHeight,!box.phone&&size!=='S844');
    const before=(!box.phone&&size!=='S844')?box.startDoc:box.posterHeight;
    assert(Math.abs(after-before)<=1,`${id} ${size} scroll changed poster height ${before} → ${after}`);
    n++;
   }finally{await close(p);}
  }assert(n===235,`poster cap count=${n}`);return n;
 },
});

// ── Stage 3: the reader (§4.7 R-R1–R-R10, R-A4) ─────────────────────────
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
      // The first red Bekker number hangs with the Greek line's indent, as in
      // the column kit (colw kit-t, B "fb", Both): its ink starts at x45.27 at
      // both 1440×900 and 844×390, the Greek at x108.
      if (prove && proofCase === 'ln-margin' && size === 'D1440') await style(p, '.dir-b .b-ln{text-indent:0!important}');
      const ln = await p.evaluate(() => {
       const el = document.querySelector('.reader-body .b-ln.col');
       if (!el) return null;
       const r = document.createRange(); r.selectNodeContents(el);
       return {ink: r.getBoundingClientRect().left, text: el.textContent};
      });
      assert(ln && ln.text, `EN ${size} examined=0 red Bekker margin numbers`);
      assert(Math.abs(ln.ink - 45.27) <= 1, `EN ${size} first Bekker margin number "${ln.text}" ink starts at x${ln.ink.toFixed(2)}, column kit x45.27`);
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
   await p.locator('.b-aa button', {hasText: 'Didot'}).click();
   await p.waitForFunction(w => document.querySelector('.reader-body').style.getPropertyValue('--greek-w') !== w, w0, {timeout: 8000}).catch(() => {});
   const w1 = await greekW();
   assert(w1 !== w0, `GFS Didot did not change --greek-w (${w0})`);
   await p.locator('[data-aa]').click();
   const g1 = await gcol();
   await p.setViewportSize({width: 961, height: 800});
   await p.waitForFunction(g => document.querySelector('.reader-body').style.getPropertyValue('--gcol') !== g, g1, {timeout: 3000}).catch(() => {});
   const g2 = await gcol();
   assert(g2 !== g1, `resize to D961 did not change --gcol (${g1})`);
   console.log(`R-R6 --gcol ${before} → ${open} (panel) → ${g2} (961); --greek-w ${w0} → ${w1} (Didot); word moved ${(moved - target).toFixed(1)}px`);
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
  let n = 0;
  const didot = p => p.requests.filter(u => /gfsdidot|GFS\+Didot/i.test(u));
  const p = await openReader('D1440', READER + '?hlg=' + encodeURIComponent('ἀγαθόν'));
  try {
   p.requests = [];
   p.on('request', r => p.requests.push(r.url()));
   await p.waitForTimeout(300);
   assert(didot(p).length === 0 && !(await p.evaluate(() => performance.getEntriesByType('resource').some(r => /gfsdidot|GFS\+Didot/i.test(r.name)))), 'GFS Didot requested on a fresh load');
   if (prove) await style(p, '.dir-b .b-gc .tok.hit{font-weight:700!important}');
   const greek = await p.evaluate(() => [...document.querySelectorAll('.reader-body .b-gc, .reader-body .b-gc *')].map(e => { const s = getComputedStyle(e); return {w: Number(s.fontWeight), st: s.fontStyle, c: e.className}; }));
   const hits = await p.locator('.b-gc .tok.hit').count();
   assert(greek.length > 0 && hits > 0, `examined=${greek.length} Greek elements, ${hits} hits`);
   const heavy = greek.filter(g => g.w > 400 || g.st !== 'normal');
   assert(!heavy.length, `${heavy.length} Greek elements bold or italic, e.g. ${JSON.stringify(heavy[0])}`);
   n += greek.length;
   await p.locator('[data-aa]').click();
   const aa = p.locator('.b-aa');
   const text = await aa.textContent();
   for (const want of ['Greek font', 'Text size', 'Line spacing', 'Column width', 'Word panel', 'Keep English visible', 'Over text', 'Add the citation when I copy Greek', 'Print', 'Reset'])
    assert(text.includes(want), `Aa lacks "${want}"`);
   assert(await aa.locator('[aria-label="Reading view"] button').count() === 3, 'Aa lacks the three views');
   const faces = await aa.locator('[aria-label="Greek font"] button').allInnerTexts();
   assert(faces.length === 3 && /^Literata/.test(faces[0]) && /^Gentium/.test(faces[1]) && /Didot/.test(faces[2]), `Aa Greek fonts ${faces}`);
   assert(await aa.locator('[aria-label="Greek font"] button').first().getAttribute('aria-pressed') === 'true', 'Literata is not the default');
   await aa.locator('button', {hasText: 'Didot'}).click();
   await p.waitForTimeout(1500);
   assert(didot(p).length >= 1, 'picking GFS Didot requested no font');
   assert(await p.locator('.reader-body').getAttribute('data-gfont') === 'didot', 'Didot not applied');
   await aa.locator('button', {hasText: 'Reset'}).click();
   await p.waitForTimeout(200);
   const face = await p.locator('.reader-body .b-gc').first().evaluate(e => getComputedStyle(e).fontFamily);
   assert(await p.locator('.reader-body').getAttribute('data-gfont') === 'literata' && /^"?Literata/.test(face), `Reset left the Greek in ${face}`);
   n += 4;
  } finally { await close(p); }
  const phone = await openReader('P390');
  try {
   await phone.locator('[data-aa]').click();
   const text = await phone.locator(".b-aa").textContent();
   assert(!text.includes('Column width') && !text.includes('Word panel') && text.includes('Translation'), 'P390 Aa rows: column width or word panel shown, or translations missing');
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
    await page.waitForFunction(() => document.querySelector('#resume-link')?.textContent.includes('chapter'));
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
 // Check 1. The list shows on the first screen.
 'R-H4': async () => {
  const logic = registry.CATEGORIES[0];
  assert(registry.DIVISION_NAMES[logic.title] === 'Logic' && logic.works.length === 6, `works.ts: first division is ${registry.DIVISION_NAMES[logic.title]} with ${logic.works?.length} works, expected Logic with 6`);
  let n = 0;
  for (const size of ['D1525', 'D1152']) {
   const p = await open(size, 'light', '/');
   try {
    if (prove && proofCase === 'tall-top' && size === 'D1525') await style(p, '.dir-b.pg-home .b-top{padding-bottom:300px!important}');
    if (prove && proofCase === 'one-column') await style(p, '.dir-b.pg-home .b-works{grid-template-columns:minmax(0,1fr)!important}');
    if (prove && proofCase === 'scrolled' && size === 'D1152') await p.evaluate(() => scrollTo(0, 120));
    const r = await p.evaluate(() => {
     const rows = [...document.querySelectorAll('.b-works li')];
     const first = document.querySelector('.b-div');
     return {count: rows.length, bottom: rows[5]?.getBoundingClientRect().bottom, height: innerHeight, scrollY, inFirst: rows[5] ? first.contains(rows[5]) : false, inFirstCount: first.querySelectorAll('.b-works li').length};
    });
    assert(r.count >= 6 && r.inFirst, `${size} examined=${r.count} work rows; the sixth must be in the first division`);
    assert(r.inFirstCount === logic.works.length, `${size} first division lists ${r.inFirstCount} works, works.ts has ${logic.works.length}`);
    assert(r.scrollY === 0, `${size} scrollY=${r.scrollY}, must be 0 (empty storage, no scroll)`);
    assert(r.bottom <= r.height, `${size} sixth work row bottom=${f1(r.bottom)} is below the window height=${r.height}`);
    console.log(`R-H4 ${size} sixth work row bottom=${f1(r.bottom)} window=${r.height}`);
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
    const r = await p.evaluate(() => { const b = document.querySelector('.b-po-t').getBoundingClientRect(); return {vw: document.documentElement.clientWidth, left: b.left, width: b.width}; });
    const g = gridAt(r.vw), place = plates[id].place;
    assert(place === 'left' || place === 'right', `${id} plates.json place=${place}`);
    assert(near(r.width, g.col, 1), `${id} ${size} work title width=${f1(r.width)}, expected one third of (content ${f1(g.content)} − 80) = ${f1(g.col)}`);
    assert(near(r.left, g.colLeft(place === 'right' ? 0 : 1), 1), `${id} ${size} work title left=${f1(r.left)}, plate ${place} so expected column ${place === 'right' ? 1 : 2} at ${f1(g.colLeft(place === 'right' ? 0 : 1))}`);
    n++;
   } finally { await close(p); }
  }
  return n;
 },
 // Check 3. The home block ends on one foot line; the list starts 44px under it.
 'R-H6': async () => {
  let n = 0;
  const cases = [['D1525', false], ['D1152', false], ['D1525', true]];
  for (const [size, returning] of cases) {
   const p = await open(size, 'light', '/', returning);
   try {
    if (returning) await resumeReady(p);
    const label = `${size} ${returning ? 'returning' : 'new'} reader`;
    if (prove && proofCase === 'bust-short' && size === 'D1525' && !returning) await style(p, '.dir-b.pg-home .b-top > .b-po picture{bottom:30px!important}');
    if (prove && proofCase === 'list-gap' && size === 'D1152') await style(p, '.dir-b.pg-home .b-top{padding-bottom:70px!important}');
    if (prove && proofCase === 'returning-bust-short' && returning) await style(p, '.dir-b.pg-home .b-top > .b-po picture{bottom:30px!important}');
    const r = await p.evaluate(() => {
     const b = sel => document.querySelector(sel)?.getBoundingClientRect();
     return {bust: b('.b-top .b-po picture')?.bottom, search: b('.b-top form.b-search')?.bottom, div: b('.b-div')?.top, cont: !!document.querySelector('#resume-link'), scrollY};
    });
    assert([r.bust, r.search, r.div].every(Number.isFinite), `${label} examined=0: bust=${r.bust} search=${r.search} first division=${r.div}`);
    assert(r.cont === returning, `${label} Continue line present=${r.cont}`);
    assert(near(r.bust, r.search, 2), `${label} bust bottom=${f1(r.bust)} and search bottom=${f1(r.search)} differ by more than 2px`);
    for (const [what, y] of [['bust', r.bust], ['search', r.search]])
     assert(near(r.div - y, 44, 2), `${label} first division starts ${f1(r.div - y)}px under the ${what} bottom, expected 44±2`);
    console.log(`R-H6 ${label} bust=${f1(r.bust)} search=${f1(r.search)} list=${f1(r.div)}`);
    n++;
   } finally { await close(p); }
  }
  return n;
 },
 // Check 4. A work block ends on one foot line; the books heading starts 44px under it.
 'R-W4': async () => {
  let n = 0;
  for (const size of ['D1525', 'D1152']) for (const id of ['GC', 'Mete', 'MA', 'Juv']) {
   const p = await open(size, 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'ctas-high' && size === 'D1525' && id === 'GC') await style(p, '.dir-b.pg-work .b-top .b-ctas{align-self:start!important}');
    if (prove && proofCase === 'ctas-lifted' && size === 'D1152' && id === 'Juv') await style(p, '.dir-b.pg-work .b-top .b-ctas{margin-bottom:30px!important}');
    if (prove && proofCase === 'books-gap' && size === 'D1525' && id === 'Mete') await style(p, '.dir-b.pg-work .b-top{padding-bottom:70px!important}');
    // A cross-family read (Grok, 10 Nov) found the first version comparing the buttons with a
    // maximum that held the buttons themselves, and with .b-words, which stretches to the foot.
    if (prove && proofCase === 'ctas-dropped' && size === 'D1525' && id === 'Mete') await style(p, '.dir-b.pg-work .b-top .b-ctas{position:relative!important;top:40px!important}');
    if (prove && proofCase === 'ctas-padded' && size === 'D1525' && id === 'GC') await style(p, '.dir-b.pg-work .b-top .b-ctas{margin-top:160px!important}');
    // Each column's own content: the plate; the last thing in the words column (.b-words
    // itself stretches); the title column as it would stand alone, which is the Greek title
    // (or the title), the 28px the build keeps above the buttons, and the buttons' height.
    const r = await p.evaluate(() => {
     const b = sel => document.querySelector(sel)?.getBoundingClientRect();
     const last = document.querySelector('.b-top .b-words')?.lastElementChild?.getBoundingClientRect();
     const ctas = b('.b-top .b-ctas');
     return {plate: b('.b-top .b-po picture')?.bottom, words: last?.bottom, over: (b('.b-top .b-wk-gt') || b('.b-top .b-po-t'))?.bottom, ctasHeight: ctas?.height, ctas: ctas?.bottom, books: b('section[data-section="books"] > h2.b-h2')?.top, scrollY};
    });
    assert(Object.values(r).every(Number.isFinite), `${id} ${size} examined=0: ${JSON.stringify(r)}`);
    const titleColumn = r.over + 28 + r.ctasHeight;
    const low = Math.max(r.plate, r.words, titleColumn);
    const sets = r.plate === low ? 'plate' : r.words === low ? 'words' : 'title column';
    assert(near(r.ctas, low, 1), `${id} ${size} .b-ctas bottom=${f1(r.ctas)} but the lowest part ends at ${f1(low)} (plate ${f1(r.plate)}, words ${f1(r.words)}, title column ${f1(titleColumn)})`);
    assert(near(r.books - low, 44, 2), `${id} ${size} books heading starts ${f1(r.books - low)}px under the foot line, expected 44±2`);
    // Spec §3.4, "Measured results": which column sets the foot in the three frames drawn at 1525.
    const drawn = {'GC/D1525': 'plate', 'Mete/D1525': 'words', 'MA/D1525': 'plate'}[`${id}/${size}`];
    assert(!drawn || sets === drawn, `${id} ${size} foot line set by the ${sets}, spec §3.4 says the ${drawn}`);
    console.log(`R-W4 ${id} ${size} foot=${f1(low)} set by ${sets} (plate ${f1(r.plate)}, words ${f1(r.words)}, title column ${f1(titleColumn)}); buttons bottom=${f1(r.ctas)}; books heading=${f1(r.books)}`);
    // Spec §3.4 "Measured results": the foot line and the books heading, in page pixels.
    const spec = {'GC/D1525': [486, 530], 'Mete/D1525': [434, 478], 'MA/D1525': [473, 517], 'GC/D1152': [446, 490], 'Mete/D1152': [450, 494]}[`${id}/${size}`];
    // Printed, not asserted: the build sits 2.5px under the spec's page y at GC 1525 (report, do not widen a tolerance).
    if (spec) console.log(`R-W4 ${id} ${size} spec §3.4 foot=${spec[0]} books heading=${spec[1]}; built ${f1(r.ctas)} and ${f1(r.books)}`);
    n++;
   } finally { await close(p); }
  }
  return n;
 },
 // Check 5. The plate stands on the side plates.json gives; the crumb on the content column's left edge.
 'R-W5': async () => {
  const ids = Object.keys(plates).filter(id => id !== 'home');
  assert(ids.length === 47, `plates.json holds ${ids.length} work plates, expected 47`);
  let n = 0;
  for (const id of ids) {
   const p = await open('D1525', 'light', `/${id}/`);
   try {
    if (prove && proofCase === 'class-flip' && n === 0) await p.evaluate(() => { const t = document.querySelector('.b-top'); t.classList.toggle('pl-left'); t.classList.toggle('pl-right'); });
    if (prove && proofCase === 'plate-middle' && n === 1) await style(p, '.dir-b.pg-work .b-top .b-po.work picture{grid-column:2!important}');
    if (prove && proofCase === 'crumb-indent' && n === 2) await style(p, '.dir-b.pg-work .b-crumb{margin-left:24px!important}');
    // Grok, 10 Nov: "centre somewhere in the column" let a plate slide 150px.
    if (prove && proofCase === 'plate-shifted' && n === 3) await style(p, '.dir-b.pg-work .b-top .b-po.work picture{position:relative!important;left:60px!important}');
    const r = await p.evaluate(() => { const b = sel => document.querySelector(sel)?.getBoundingClientRect(); const pic = b('.b-top .b-po picture'); return {vw: document.documentElement.clientWidth, plateCentre: pic && pic.left + pic.width / 2, plateWidth: pic?.width, crumb: b('p.b-crumb')?.left}; });
    assert(Number.isFinite(r.plateCentre) && Number.isFinite(r.crumb) && r.plateWidth > 0, `${id} examined=0: ${JSON.stringify(r)}`);
    const g = gridAt(r.vw), place = plates[id].place;
    assert(place === 'left' || place === 'right', `${id} plates.json place=${place}`);
    const col = place === 'left' ? 0 : 2, lo = g.colLeft(col);
    assert(r.plateCentre >= lo && r.plateCentre <= lo + g.col, `${id} plate centre x=${f1(r.plateCentre)} is not in the ${place} column [${f1(lo)}, ${f1(lo + g.col)}] that plates.json gives`);
    assert(near(r.plateCentre, lo + g.col / 2, 1) && r.plateWidth <= g.col + 1, `${id} plate centre x=${f1(r.plateCentre)} width=${f1(r.plateWidth)}: not centred on the ${place} column (centre ${f1(lo + g.col / 2)}, width ${f1(g.col)})`);
    assert(near(r.crumb, g.left, 1), `${id} crumb left=${f1(r.crumb)}, content column left=${f1(g.left)}`);
    n++;
   } finally { await close(p); }
  }
  console.log(`R-W5 plates examined=${n}: ${ids.filter(id => plates[id].place === 'left').length} left, ${ids.filter(id => plates[id].place === 'right').length} right`);
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
    const red = theme === 'light' ? RGB.red : RGB.darkRed, accent = theme === 'light' ? RGB.redInk : RGB.darkRedInk;
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

// A proof is valid only when its own mutation causes the named assertion.
const proofMessages = {
    'R-W1': /AthPol crumb=Works \/ Rhetoric and poetics/,
    'R-W1-text': /Cat raw footnote marker in work text/,
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
    'R-W1': {'crumb': /AthPol crumb=Works \/ Rhetoric and poetics/, 'english-facts': /Cat English facts form: W\. D\. Ross \(Oxford, 1908\)/, 'missing-glossary': /EN English facts glossary link missing or invalid/, 'crumb-height': /Cat D1440 crumb height=/, 'crumb-height-phone': /Cat P390 crumb height=/, 'phone-order': /Cat P390 visual order /, 'no-english': /Cat examined=0 English facts/, 'peters-year': /EN Peters facts must contain rev\. ed\., 1893/, 'ellis-year': /Pol Ellis facts must contain 1776; rev\. 1912/},
    'R-T3': {'title-faded': /D1440\/light \/ title opacity=0\.82 expected 1/, 'home-plate': /D1525\/light \/ bust size=.*, spec says 189×320 at aspect \.592/, 'dark-bust': /D1152\/dark \/ bust size=.*, spec says 161×272 at aspect \.592/, 'work-plate': /D1525 \/GC\/ plate size=200\.0×.*, plates\.json ink box gives 362\.7×358\.6/, 'plate-origin': /D1525 \/MA\/ plate image offset=0\.0,/},
    'R-T2': {'cap': /Cat D1440 Start reading bottom=/, 'scroll-budget': /Long P390 scroll changed poster height/, 'crop': /Cat D1440 object-fit=cover expected fill/},
    'R-K1': {'record': /EN Record href=#/, 'punctuation': /home credits doubled full stop/, 'licence': /home credits licence must be in parentheses/, 'licence-stop': /home credits stop before licence/},
    'R-W3': {'chapter-target': /Cat wrong chapter target:/, 'numeral-red': /Phys book numbers are not --red-ink/},
    'R-W1-bekker': {'short-end': /Meta invalid book-header Bekker range: 980a21–29/, 'backwards': /Meta backwards book-header Bekker range: 993a29–980a21/},
    'R-W1-scheme': {'synthetic': /Isa synthetic range in non-Bekker work: 1a3–16/},
    'R-E1': {'copy': /examined=6 violations=6; HTML fixture In this mockup/, 'no-headings': /\/Cat\/ examined=0 section headings/, 'empty-heading': /\/Cat\/ empty headings:/},
    'R-T5': {'desktop-poster': /S844 home gap=/, 'two-columns': /S844 .*works grid has more than one column/, 'wide-title': /Cat S844 title sizes=/, 'short-plate': /Cat S844 plate height=.*below 120/},
};
// D26 gates: each proof is a deliberate break that must trip the gate's own assertion.
const d26Proofs = {
    'R-T1': {'golden-line': /Cat G1440 poster lines=/, 'drawn-size': /Cat G1440 drawn sizes=12\.0 expected=/},
    'R-H4': {'tall-top': /D1525 sixth work row bottom=[\d.]+ is below the window height=896/, 'one-column': /D1525 sixth work row bottom=[\d.]+ is below the window height=896/, 'scrolled': /D1152 scrollY=120, must be 0/},
    'R-H5': {'title-wide': /D1525 home title width=[\d.]+ but list column width=/, 'title-shifted': /D1152 home title left=[\d.]+ but list column 2 left=/, 'work-title-narrow': /GC D1525 work title width=300, expected one third of/},
    'R-H6': {'bust-short': /D1525 new reader bust bottom=[\d.]+ and search bottom=[\d.]+ differ by more than 2px/, 'list-gap': /D1152 new reader first division starts [\d.]+px under the bust bottom, expected 44±2/, 'returning-bust-short': /D1525 returning reader bust bottom=[\d.]+ and search bottom=[\d.]+ differ by more than 2px/},
    'R-W4': {'ctas-high': /GC D1525 \.b-ctas bottom=[\d.]+ but the lowest part ends at/, 'ctas-lifted': /Juv D1152 \.b-ctas bottom=[\d.]+ but the lowest part ends at/, 'books-gap': /Mete D1525 books heading starts [\d.]+px under the foot line, expected 44±2/, 'ctas-dropped': /Mete D1525 \.b-ctas bottom=[\d.]+ but the lowest part ends at/, 'ctas-padded': /GC D1525 \.b-ctas bottom=[\d.]+ but the lowest part ends at/},
    'R-W5': {'class-flip': /plate centre x=[\d.]+ is not in the (left|right) column/, 'plate-middle': /plate centre x=[\d.]+ is not in the (left|right) column/, 'crumb-indent': /crumb left=[\d.]+, content column left=/, 'plate-shifted': /plate centre x=[\d.]+ width=[\d.]+: not centred on the (left|right) column/},
    'R-C3': {'red-title': /\/ light uses --red rgb\(226, 56, 46\): h1\.b-po-t color/, 'red-border': /\/GC\/ light uses --red rgb\(226, 56, 46\): .*border-bottom-color/, 'red-dark': /\/Mete\/ dark uses --red rgb\(255, 90, 77\): .*color/, 'faded-title': /\/MA\/ title opacity=0\.82, expected 1/},
    'R-H7': {'old-heading': /a division head reads "Dubious and spurious works"/, 'duplicate': /data-work listed twice: Cat/, 'tag-lost': /tags=15, expected 16/, 'prob-moved': /Minor works \(Opuscula\) holds Prob,Col,/, 'isa': /(the Isagoge is on the home list|list differs from spec)/},
    'R-H8': {'wraps': /D1525 Greek line is drawn on [2-9] lines/, 'wrong-red': /D1152 Greek line color=rgb\(226, 56, 46\), expected --red-ink/, 'short': /D961 Greek line text width=[\d.]+ but its column is/},
};
Object.assign(stageTwoProofs, d26Proofs);
const homeTitleProofs = {
    'desktop-size': /D1525 home line 1 size=\d+ expected=82\.5 ±1px|D1525 home line 1 drawn size=60 expected=82\.5/,
    'golden-line': /P390 home lines=/,
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
    'R-C1': {'aux-css': /404\.html B CSS sentinel missing:/, 'home': /home title color=rgb\(0, 0, 0\)/, 'reader': /reader \.b-rh height=/},
    'R-A1': {'reading-button': /D1440 BUTTON Gate reading button /, 'chapter-fn': /D1440 footnote mark \d+ misses its 40px hit area/, 'late-fn': /D1440 footnote mark \d+ misses its 40px hit area/, 'theme-toggle': /D1440 BUTTON.*34×34/, 'fn-hit': /\/EN\/book\/1 D1440 footnote mark \d+ misses its 40px hit area/},
    'R-A2': {'search': /focus missing .*b-search|focus missing .*name="q"/, 'reader-token': /focus missing <span class="tok/, 'panel-ring': /D1440 word panel opened by keyboard: no focus ring/, 'help-ring': /D1440 Help opened by keyboard: no focus ring/},
    'R-A3': {'sub-label': /light H3\.b-sub sub-label .*ratio=.*color=rgb\(226, 56, 46\)/, 'reader-ln': /light SPAN\.line-num b-ln/},
    'R-E1': {...stageTwoProofs['R-E1'], 'reader-tail-heading': /empty headings: Gate tail heading/, 'reader-empty-chapter': /empty headings: Gate empty chapter/, 'reader-copy': /\/EN\/book\/1 D1440 panel-open explainer text: No analysis/},
    'R-R1': {'head': /EN D1440 greek reader chrome labels a Greek edition: Greek: Bywater, 1894/, 'print': /EN printed footer lacks "Greek text: /, 'print-chrome': /EN printed page shows screen furniture: \.b-side/, 'print-grid': /EN print grid: gap=64px/, 'print-book': /EN printed page drops the book label "[^"]*Book I"/i, 'print-margin': /EN printed body margin=8px/},
    'R-R2': {'kit-wrap': /EN S844 reader head breaks into two rows/, 'pad-overflow': /EN S844 reader head runs \d+\.\dpx into its right padding/},
    'R-R3': {'i-book-i': /EN contents book head "I Book I"/},
    'R-R4': {'stack-s844': /S844 English below Greek: row stacks/},
    'R-R5': {'nothing-unwrapped': /examined nothing unwrapped/, 'no-nowrap': /EN D1440 Greek column width=80 expected/, 'narrow-column': /EN D1440 Greek column width=80 expected/, 'late-overlap': /EN D1440 \d+ English line boxes overlap Greek words/, 'small-descendant': /EN D1440 reading text under 18px: .*span\.gate-small 12px/, 'small-table': /\/EN\/book\/1 D1440 eng-table fixture reading text under 18px: .*table\.eng-table.*td /, 'table-overflow': /\/EN\/book\/1 P390 eng-table fixture horizontal page overflow:/, 'ln-margin': /EN D1440 first Bekker margin number "1094a" ink starts at x4[7-9]/, 'round-eight':/EN W1200 panel open Greek column width=/, 'phone-shrink': /EN P390 both reading text under 18px:/},
    'R-R6': {'no-rerun': /panel open did not change --gcol/},
    'R-R7': {'late-panel': /D1440 \d+ English line boxes under the panel/, 'round-eight-compare': /D1440 Compare \d+ English line boxes under the panel/},
    'R-R8': {'bottom-sheet': /S844 panel anchored to the bottom/},
    'R-R10': {'bold-hit': /Greek elements bold or italic/},
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
