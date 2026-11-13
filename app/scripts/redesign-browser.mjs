// Wait for layout to discover fonts used by newly rendered islands or panels.
// This does not load a missing font on the page's behalf: R-F1 must still fail it.
export async function settleFonts(page) {
    await page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        void document.body.offsetHeight;
        await document.fonts.ready;
    });
}

export async function expandSearch(page, cap = 1000) {
    // Expanding a work mounts its chapters. Finish works before finding chapters.
    for (const selector of ['.b-sg h2 button[aria-expanded="false"]', '.b-sch h3 button[aria-expanded="false"]']) {
        const collapsed = page.locator(selector);
        let count = await collapsed.count(), clicks = 0;
        while (count) {
            if (clicks++ >= cap) throw Error(`expandSearch exceeded ${cap} clicks: ${selector}, collapsed=${count}`);
            // Never hold nth-locators over a set that shrinks after each click.
            try {
                await collapsed.first().click({timeout: 5000});
            } catch (error) {
                throw Error(`expandSearch could not click ${selector}, collapsed=${count}: ${error.message.split('\n')[0]}`);
            }
            try {
                await page.waitForFunction(({selector, before}) => document.querySelectorAll(selector).length < before,
                    {selector, before: count}, {timeout: 3000});
            } catch {
                throw Error(`expandSearch collapsed count did not drop: ${selector}, before=${count}, after=${await collapsed.count()}`);
            }
            count = await collapsed.count();
        }
    }
    await settleFonts(page);
}

// Pass this self-contained function to Playwright's evaluateAll as well as tests.
export function readSearchRefs(hits) {
    return hits.map((hit, index) => {
        const ref = hit.querySelector('.b-hr');
        if (!ref) return {index, scheme: hit.dataset.citationScheme, text: '', visible: false, lines: 0};
        const css = getComputedStyle(ref);
        // Element ranges include inline <b> boxes as well as glyph boxes.
        // Read text nodes only, so split weights cannot invent an extra line.
        const walker = document.createTreeWalker(ref, 4 /* SHOW_TEXT */);
        const rects = [];
        let node;
        while (node = walker.nextNode()) {
            const range = document.createRange(); range.selectNodeContents(node);
            rects.push(...[...range.getClientRects()].filter(r => r.width > 0 && r.height > 0));
        }
        const lines = [];
        for (const rect of rects) {
            const bottom = rect.top + rect.height;
            const line = lines.find(line => rect.top < line.bottom - 1 && bottom > line.top + 1);
            if (line) { line.top = Math.min(line.top, rect.top); line.bottom = Math.max(line.bottom, bottom); }
            else lines.push({top: rect.top, bottom});
        }
        const column = hit.querySelector('.b-hg, .b-he');
        const sideBySide = getComputedStyle(hit).gridTemplateColumns?.split(' ').length > 1;
        const refRight = Math.max(ref.getBoundingClientRect?.().right ?? 0, ...rects.map(r => r.right));
        return {
            sideBySide, refRight, columnLeft: column?.getBoundingClientRect?.().left ?? NaN,
            index, work: hit.closest?.('[data-result-work]')?.dataset.resultWork, scheme: hit.dataset.citationScheme, lang: hit.dataset.hitLanguage, text: ref.textContent.trim(),
            height: ref.offsetHeight, lineHeight: parseFloat(css.lineHeight), lines: lines.length,
            textWidth: rects.length ? Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)) : 0,
            visible: ref.isConnected && ref.getClientRects().length > 0 && rects.length > 0,
            proof: ref.dataset.wrapProof === 'true',
        };
    });
}
export function searchRefOnOneLine(ref) {
    return ref.visible && ref.lines === 1 && Number.isFinite(ref.lineHeight)
        && ref.lineHeight > 0 && ref.height <= 1.5 * ref.lineHeight;
}

export function searchRefBeforeColumn(ref) {
    return !ref.sideBySide || (ref.visible && Number.isFinite(ref.refRight)
        && Number.isFinite(ref.columnLeft) && ref.refRight <= ref.columnLeft);
}

// Self-contained for evaluateAll: use the rendered pseudo box, including its
// translate, and probe 19px from its centre rather than its top-left corner.
export function readControlBoxes(els) {
    return els.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
        && !el.matches('.tok')
        && !(el.closest('.b-gc,.b-ec,.b-cht') && el.matches('a,.fn-marker'))).map(el => {
        const rect = el.getBoundingClientRect();
        let w = rect.width, h = rect.height;
        if (el.matches('.b-he > span a,.b-sr-l a,.b-sr-l button,.pg-lexicon .b-near a,.pg-lexicon .b-cite a')) {
            el.scrollIntoView({block:'center'});
            const box = el.getBoundingClientRect(), after = getComputedStyle(el, '::after');
            if (after.content !== 'none' && after.position === 'absolute') {
                const aw = parseFloat(after.width), ah = parseFloat(after.height);
                const transform = new DOMMatrixReadOnly(after.transform === 'none' ? undefined : after.transform);
                const x = box.left + el.clientLeft + parseFloat(after.left) + transform.e + aw / 2;
                const y = box.top + el.clientTop + parseFloat(after.top) + transform.f + ah / 2;
                const answers = [[-19,0],[19,0],[0,-19],[0,19]].every(([dx,dy]) => {
                    const hit = document.elementFromPoint(x+dx,y+dy);
                    return hit === el || el.contains(hit);
                });
                if (answers) { w = Math.max(w,aw); h = Math.max(h,ah); }
            }
        }
        return {tag: el.tagName, text: el.getAttribute('aria-label') || el.textContent?.trim().slice(0,65), w, h};
    });
}

// Self-contained: inline nowrap overrides the page even if its measure rule is missing.
export function measureGreekLines(lines) {
    let w = 0, changed = 0;
    for (const line of lines) {
        const wrapped = line.offsetWidth;
        const elements = [line, ...line.querySelectorAll('*')];
        const saved = elements.map(el => el.getAttribute('style'));
        try {
            // Tokens can set pre-wrap themselves; override those too.
            elements.forEach(el => el.style.setProperty('white-space', 'nowrap', 'important'));
            const width = line.offsetWidth;
            w = Math.max(w, width);
            if (Math.abs(width - wrapped) > 1) changed++;
        } finally {
            elements.forEach((el, i) => {
                if (saved[i] === null) el.removeAttribute('style');
                else el.setAttribute('style', saved[i]);
            });
        }
    }
    return {w: Math.ceil(w), changed, lines: lines.length};
}

export function readReadingSizes(roots) {
    const text = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
            && !el.closest('.fn-marker,.line-num,.b-ln,.bk-num')
            && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
    return text.map(el => {
        const path = [];
        for (let node = el; node; node = node.parentElement) {
            path.unshift(node.tagName.toLowerCase() + [...node.classList].map(c => '.' + c).join(''));
            if (roots.includes(node)) break;
        }
        return {size: parseFloat(getComputedStyle(el).fontSize), selector: path.join(' > ')};
    }).sort((a, b) => a.size - b.size);
}

export function searchRefFormat(ref) {
    // John's rulings: Bekker pages start at 1; English hits cite the column,
    // as the live Search page did. Keep both exceptions to the brief's regex.
    const prefix = /^[IVXLC]+\.\d+ /;
    if (!prefix.test(ref.text) || /[\r\n]/.test(ref.text)) return false;
    const locator = ref.text.replace(prefix, '');
    if (ref.scheme === 'chapter-section') return /^\d+\.\d+[a-z]?$/.test(locator);
    if (ref.scheme === 'bekker')
        return (ref.lang === 'eng' ? /^\d{1,4}[ab]$/ : /^\d{1,4}[ab]\d{1,2}$/).test(locator);
    if (ref.scheme === 'busse')
        return (ref.lang === 'eng' ? /^\d+[ab]$/ : /^\d+[ab]\d+[a-z]?$/).test(locator);
    return false;
}

// The search page built on 13 Nov (Search.svelte): the helpers above read the
// stage-4 page (.b-sg, .b-hit, .b-hr) and are kept for their unit tests.
// Every group starts open; open any that is shut, so every hit is in the page.
export async function openSearchGroups(page, cap = 1000) {
    const selector = 'main.search-page .group-head[aria-expanded="false"]';
    const shut = page.locator(selector);
    let count = await shut.count(), clicks = 0;
    while (count) {
        if (clicks++ >= cap) throw Error(`openSearchGroups exceeded ${cap} clicks: ${selector}, shut=${count}`);
        await shut.first().click({timeout: 5000});
        try {
            await page.waitForFunction(({selector, before}) => document.querySelectorAll(selector).length < before, {selector, before: count}, {timeout: 3000});
        } catch {
            throw Error(`openSearchGroups shut count did not drop: before=${count}, after=${await shut.count()}`);
        }
        count = await shut.count();
    }
    await settleFonts(page);
}

// Self-contained for evaluateAll over li.instance: a.inst-ref, then
// .inst-body. A ref may break only after its dash (the template's <wbr>, so
// "1095b29–33" fits its column), so the text up to the dash is measured apart.
// The work is the first step of the ref's reader link; an English hit is one
// drawn with .inst-hit-en.
export function readInstanceRefs(hits) {
    return hits.map((hit, index) => {
        const ref = hit.querySelector('.inst-ref');
        if (!ref) return {index, text: '', visible: false, lines: 0, leadLines: 0};
        const lineCount = rects => {
            const lines = [];
            for (const rect of rects) {
                const bottom = rect.top + rect.height;
                const line = lines.find(line => rect.top < line.bottom - 1 && bottom > line.top + 1);
                if (line) { line.top = Math.min(line.top, rect.top); line.bottom = Math.max(line.bottom, bottom); }
                else lines.push({top: rect.top, bottom});
            }
            return lines.length;
        };
        const walker = document.createTreeWalker(ref, 4 /* SHOW_TEXT */);
        const rects = [], lead = [];
        let node, beforeDash = true;
        while (node = walker.nextNode()) {
            const range = document.createRange(); range.selectNodeContents(node);
            const boxes = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
            rects.push(...boxes);
            if (beforeDash) lead.push(...boxes);
            if (node.textContent.includes('–')) beforeDash = false;
        }
        const text = ref.textContent.trim();
        const column = hit.querySelector('.inst-body');
        const path = new URL(ref.getAttribute('href') || '', location.href).pathname.split('/').filter(Boolean);
        return {
            index, text, work: path[0], lang: hit.querySelector('.inst-hit-en') ? 'eng' : 'grk', dash: text.includes('–'),
            sideBySide: getComputedStyle(hit).gridTemplateColumns.split(' ').length > 1,
            refRight: Math.max(ref.getBoundingClientRect().right, ...rects.map(r => r.right)),
            columnLeft: column ? column.getBoundingClientRect().left : NaN,
            height: ref.offsetHeight, lineHeight: parseFloat(getComputedStyle(ref).lineHeight),
            lines: lineCount(rects), leadLines: lineCount(lead),
            textWidth: rects.length ? Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)) : 0,
            visible: ref.isConnected && ref.getClientRects().length > 0 && rects.length > 0,
            proof: ref.dataset.wrapProof === 'true',
        };
    });
}
// One line, or two when a range breaks after its dash; never a break inside
// the place itself.
export function searchRefUnbroken(ref) {
    return ref.visible && ref.leadLines === 1 && (ref.lines === 1 || (ref.dash && ref.lines === 2))
        && Number.isFinite(ref.lineHeight) && ref.lineHeight > 0 && ref.height <= (ref.lines + .5) * ref.lineHeight;
}
// searchRefFormat's locator rules, for a ref that is the place alone: the book
// and chapter are heading lines over the hits (ruling 17), and a Greek hit
// over several lines cites their range (Search.svelte citeText). John's
// rulings stand: Bekker pages start at 1; English hits cite the column.
export function searchRefLocator(ref, scheme) {
    const t = ref.text;
    if (/[\r\n]/.test(t)) return false;
    if (scheme === 'chapter-section') return /^\d+\.\d+[a-z]?$/.test(t);
    if (scheme === 'bekker')
        return (ref.lang === 'eng' ? /^\d{1,4}[ab]$/ : /^\d{1,4}[ab]\d{1,2}(–(\d{1,4}[ab])?\d{1,2})?$/).test(t);
    if (scheme === 'busse')
        return (ref.lang === 'eng' ? /^\d+[ab]$/ : /^\d+[ab]\d+[a-z]?(–(\d+[ab])?\d+[a-z]?)?$/).test(t);
    return false;
}

// Read Markdown separately from the site's glossary renderer and body resolver.
export function rawGlossaryBodies(markdown, slug) {
    const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const entries = markdown.split('\n').flatMap(line => {
        const head = line.match(/^\*([^*]+)\* /), split = line.indexOf('): ');
        if (!head || split < 0) return [];
        const terms = head[1].split(',').map(t => fold(t.trim()));
        return [{slug: terms[0], terms, body: line.slice(split + 3)}];
    });
    const resolve = (key, seen = []) => {
        if (seen.includes(key)) throw Error(`Raw glossary cycle: ${key}`);
        const entry = entries.find(e => e.terms.includes(key));
        if (!entry) throw Error(`Raw glossary entry missing: ${key}`);
        if (/^See \*.+\*\.$/.test(entry.body))
            return [...entry.body.matchAll(/\*([^*]+)\*/g)].flatMap(([, term]) => resolve(fold(term), [...seen, key]));
        return [{slug: entry.slug, text: entry.body.replace(/<[^>]+>/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()}];
    };
    return resolve(slug);
}

export function readReaderOverlaps(rows) {
    let boxes = 0, hits = [];
    for (const row of rows) {
        row.scrollIntoView({block: 'center'});
        const g = [...row.querySelectorAll('.b-gc .tok')].flatMap(t => [...t.getClientRects()]);
        const e = [];
        for (const ec of row.querySelectorAll('.b-ec')) {
            const walker = document.createTreeWalker(ec, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (!node.textContent.trim() || node.parentElement.closest('.bk-num,.fn-marker')) continue;
                const range = document.createRange(); range.selectNodeContents(node);
                e.push(...range.getClientRects());
            }
        }
        boxes += g.length + e.length;
        for (const a of e) for (const b of g)
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5) hits.push(Math.round(a.left) + ',' + Math.round(a.top));
    }
    return {rows: rows.length, boxes, hits: hits.length, at: hits.slice(0, 3)};
}

export function readFootnoteTargets(els) {
    return els.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        .map((el, i) => (el.dataset.gate = String(i)));
}
