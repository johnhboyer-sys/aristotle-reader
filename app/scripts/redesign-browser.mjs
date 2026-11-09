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
        const ref = hit.querySelector('.b-hr'), css = getComputedStyle(ref);
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
            index, scheme: hit.dataset.citationScheme, lang: hit.dataset.hitLanguage, text: ref.textContent.trim(),
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
        && !el.matches('.tok') && !el.closest('.b-gc,.b-ec,.b-cht')).map(el => {
        const rect = el.getBoundingClientRect();
        let w = rect.width, h = rect.height;
        if (el.matches('.b-he > span a,.b-sr-l a,.b-sr-l button')) {
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
