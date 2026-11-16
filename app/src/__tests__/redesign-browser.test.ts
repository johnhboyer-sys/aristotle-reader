import { afterEach, expect, it, vi } from 'vitest';
import { expandSearch, settleFonts } from '../../scripts/redesign-browser.mjs';

afterEach(() => vi.unstubAllGlobals());

// Model Playwright's live selector: each click shrinks the matching set, and
// opening a work mounts new chapter buttons. Holding nth-locators would skip them.
function searchPage(works = 3, chapters = 0, stuck = false) {
  let workCount = works, chapterCount = chapters;
  const count = (selector: string) => selector.includes('h2') ? workCount : chapterCount;
  const clicks: string[] = [];
  return {
    clicks,
    locator: (selector: string) => ({
      count: async () => count(selector),
      first: () => ({ click: async () => {
        if (!count(selector)) throw Error('clicked a missing button');
        clicks.push(selector);
        if (stuck) return;
        if (selector.includes('h2')) { workCount--; chapterCount += 2; }
        else chapterCount--;
      } }),
    }),
    waitForFunction: async (_fn: unknown, {selector, before}: {selector: string; before: number}) => {
      if (count(selector) >= before) throw Error('count did not drop');
    },
    evaluate: vi.fn(async () => {}),
  };
}
it('expands every shrinking work match, then all newly mounted chapters', async () => {
  const page = searchPage();
  await expandSearch(page);
  expect(page.clicks.filter(s => s.includes('h2'))).toHaveLength(3);
  expect(page.clicks.filter(s => s.includes('h3'))).toHaveLength(6);
  expect(page.evaluate).toHaveBeenCalledOnce();
});
it('fails at the first click that leaves the collapsed count unchanged', async () => {
  const page = searchPage(3, 0, true);
  await expect(expandSearch(page)).rejects.toThrow('collapsed count did not drop: .b-sg h2 button[aria-expanded="false"], before=3, after=3');
  expect(page.clicks).toHaveLength(1);
});
it('caps expansion instead of following an unbounded match set', async () => {
  const page = searchPage(3);
  await expect(expandSearch(page, 2)).rejects.toThrow('exceeded 2 clicks');
  expect(page.clicks).toHaveLength(2);
});
it('waits for layout before reading fonts.ready for a new render', async () => {
  const order: string[] = [];
  let finishFonts!: () => void;
  const ready = new Promise<void>(resolve => { finishFonts = resolve; });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { order.push('frame'); callback(); });
  vi.stubGlobal('document', {
    body: { get offsetHeight() { order.push('layout'); return 100; } },
    fonts: { get ready() { order.push('fonts'); return ready; } },
  });
  let settled = false;
  const pending = settleFonts({evaluate: (callback: () => Promise<void>) => callback()}).then(() => { settled = true; });
  await Promise.resolve();
  expect(order).toEqual(['frame', 'layout', 'fonts']);
  expect(settled).toBe(false);
  finishFonts();
  await pending;
  expect(settled).toBe(true);
});

it('reads text lines independently of the reference box height', async () => {
  const { readSearchRefs, searchRefOnOneLine } = await import('../../scripts/redesign-browser.mjs');
  let rects = [{ top: 0, left: 0, right: 15, width: 15, height: 14 }, { top: 28, left: 0, right: 45, width: 45, height: 14 }];
  vi.stubGlobal('getComputedStyle', () => ({lineHeight: '28px'}));
  vi.stubGlobal('document', {createTreeWalker: () => {let read=false;return {nextNode: () => read ? null : (read=true,{})};}, createRange: () => ({selectNodeContents: () => {}, getClientRects: () => rects})});
  const ref = {textContent: 'I.5 1094a1', offsetHeight: 28, isConnected: true, dataset: {}, getClientRects: () => [{}]};
  const hit = {dataset: {citationScheme: 'bekker'}, querySelector: () => ref};
  const [wrapped] = readSearchRefs([hit]);
  expect(wrapped.lines).toBe(2);
  expect(searchRefOnOneLine(wrapped)).toBe(false); // Height alone would pass.
  rects = [rects[0], {...rects[1], top: 0, left: 18, right: 63}];
  const [oneLine] = readSearchRefs([hit]);
  expect(oneLine.lines).toBe(1); // Two spans on the same line remain one line.
  expect(oneLine.textWidth).toBe(63);
  expect(searchRefOnOneLine(oneLine)).toBe(true);
});
it('rejects hidden refs and invalid line heights instead of skipping geometry', async () => {
  const { searchRefOnOneLine } = await import('../../scripts/redesign-browser.mjs');
  const ref = {visible: true, lines: 1, height: 40, lineHeight: 28};
  expect(searchRefOnOneLine(ref)).toBe(true);
  expect(searchRefOnOneLine({...ref, visible: false})).toBe(false);
  expect(searchRefOnOneLine({...ref, lines: 0})).toBe(false);
  expect(searchRefOnOneLine({...ref, lineHeight: NaN})).toBe(false);
  expect(searchRefOnOneLine({...ref, height: 56})).toBe(false);
});
it('counts a bold book label and plain citation as one line without reading inline element boxes', async () => {
  const {readSearchRefs} = await import('../../scripts/redesign-browser.mjs');
  const nodes = [{rect: {top: 5, left: 0, right: 20, width: 20, height: 16}}, {rect: {top: 5.5, left: 23, right: 75, width: 52, height: 15}}];
  vi.stubGlobal('getComputedStyle', () => ({lineHeight: '27px'}));
  vi.stubGlobal('document', {
    createTreeWalker: () => { let i=0;return {nextNode: () => nodes[i++] ?? null}; },
    createRange: () => {let node: typeof nodes[number];return {selectNodeContents: (n: typeof node) => {node=n;}, getClientRects: () => [node.rect]};},
  });
  const ref = {textContent: 'I.5 1094a1', offsetHeight: 40, isConnected: true, dataset: {}, getClientRects: () => [{}]};
  const [metrics] = readSearchRefs([{dataset: {citationScheme: 'bekker'}, querySelector: () => ref}]);
  expect(metrics.lines).toBe(1);
  expect(metrics.textWidth).toBe(75);
});

it('rejects a nowrap ref that crosses the next column when its track shrinks to 60px', async () => {
  const {searchRefBeforeColumn} = await import('../../scripts/redesign-browser.mjs');
  const ref = {visible: true, sideBySide: true, refRight: 86, columnLeft: 90 + 18};
  expect(searchRefBeforeColumn(ref)).toBe(true);
  expect(searchRefBeforeColumn({...ref, columnLeft: 60 + 18})).toBe(false);
  expect(searchRefBeforeColumn({...ref, columnLeft: 86})).toBe(true);
  expect(searchRefBeforeColumn({...ref, columnLeft: NaN})).toBe(false);
  expect(searchRefBeforeColumn({...ref, sideBySide: false, columnLeft: 0})).toBe(true);
});

it.each(['count', 'translator'])('probes the %s link pseudo box at its centre and catches missing or inert areas', async (kind) => {
  const {readControlBoxes} = await import('../../scripts/redesign-browser.mjs');
  let content = '""', pointerEvents = 'auto';
  const points: number[][] = [];
  const el = {
    tagName: 'A', textContent: kind, clientLeft: 0, clientTop: 0,
    getClientRects: () => [{}], getBoundingClientRect: () => ({left: 100, top: 200, width: 60, height: 14}),
    matches: (selector: string) => selector.includes('.b-sr-l'), closest: () => null,
    scrollIntoView: vi.fn(), getAttribute: () => null, contains: () => false,
  };
  vi.stubGlobal('DOMMatrixReadOnly', class {e = -30; f = -20;});
  vi.stubGlobal('getComputedStyle', (_el: unknown, pseudo?: string) => pseudo
    ? {content, pointerEvents, position: 'absolute', width: '60px', height: '40px', left: '30px', top: '7px', transform: 'matrix(1,0,0,1,-30,-20)'}
    : {visibility: 'visible'});
  vi.stubGlobal('document', {elementFromPoint: (x: number, y: number) => {
    points.push([x,y]);
    // The original link answers only within its own 60×14px box.
    return content !== 'none' && pointerEvents !== 'none'
      ? (x >= 100 && x <= 160 && y >= 187 && y <= 227 ? el : null)
      : (x >= 100 && x <= 160 && y >= 200 && y <= 214 ? el : null);
  }});
  expect(readControlBoxes([el])[0]).toMatchObject({w: 60, h: 40});
  expect(points).toEqual([[111,207],[149,207],[130,188],[130,226]]);
  content = 'none';
  expect(readControlBoxes([el])[0].h).toBeLessThan(40);
  content = '""'; pointerEvents = 'none';
  expect(readControlBoxes([el])[0].h).toBeLessThan(40);
});

it('adds half the pseudo size when left and top name its untransformed corner', async () => {
  const {readControlBoxes} = await import('../../scripts/redesign-browser.mjs');
  const points: number[][] = [];
  const el = {
    tagName: 'A', textContent: 'Count', clientLeft: 0, clientTop: 0,
    getClientRects: () => [{}], getBoundingClientRect: () => ({left: 100, top: 200, width: 60, height: 14}),
    matches: (s: string) => s.includes('.b-sr-l'), closest: () => null,
    scrollIntoView: () => {}, getAttribute: () => null, contains: () => false,
  };
  vi.stubGlobal('DOMMatrixReadOnly', class {e = 0; f = 0;});
  vi.stubGlobal('getComputedStyle', (_el: unknown, pseudo?: string) => pseudo
    ? {content: '""', position: 'absolute', width: '60px', height: '40px', left: '0px', top: '-13px', transform: 'none'}
    : {visibility: 'visible'});
  vi.stubGlobal('document', {elementFromPoint: (x: number, y: number) => {
    points.push([x,y]);
    return x >= 100 && x <= 160 && y >= 187 && y <= 227 ? el : null;
  }});
  expect(readControlBoxes([el])[0].h).toBe(40);
  expect(points).toEqual([[111,207],[149,207],[130,188],[130,226]]);
});

it('exempts only tokens and running-text links, and checks other reading controls', async () => {
  const {readControlBoxes} = await import('../../scripts/redesign-browser.mjs');
  const root = document.createElement('div');
  root.innerHTML = '<div class="b-gc"><span class="tok" role="button">word</span><a href="/">text link</a><button>Greek button</button><input aria-label="Greek input"><span role="button">Greek role</span></div><div class="b-ec"><button>English button</button></div><div class="b-cht"><button class="fn-marker">1</button><button>Title button</button></div><button class="fn-marker">Outside mark</button>';
  const controls = [...root.querySelectorAll('a,button,input,[role="button"]')];
  for (const el of controls) {
    Object.defineProperty(el, 'getClientRects', {value: () => [{}]});
    Object.defineProperty(el, 'getBoundingClientRect', {value: () => ({width: 20, height: 20})});
  }
  vi.stubGlobal('getComputedStyle', () => ({visibility: 'visible'}));
  const got = readControlBoxes(controls);
  expect(got.map((c: {text: string}) => c.text)).toEqual(['Greek button','Greek input','Greek role','English button','Title button','Outside mark']);
  expect(got.every((c: {w: number; h: number}) => c.w === 20 && c.h === 20)).toBe(true);
});

it('measures nowrap itself, including tokens, and restores every inline style', async () => {
  const {measureGreekLines} = await import('../../scripts/redesign-browser.mjs');
  const line = document.createElement('span');
  line.innerHTML = '<span style="white-space:pre-wrap;color:red">Greek token</span>';
  line.setAttribute('style', 'color:blue');
  const token = line.firstElementChild as HTMLElement;
  Object.defineProperty(line, 'offsetWidth', {get: () => line.style.whiteSpace === 'nowrap' && token.style.whiteSpace === 'nowrap' ? 340 : 120});
  const before = [line.getAttribute('style'), token.getAttribute('style')];
  expect(measureGreekLines([line])).toEqual({w: 340, changed: 1, lines: 1});
  expect([line.getAttribute('style'), token.getAttribute('style')]).toEqual(before);
  line.removeAttribute('style');
  measureGreekLines([line]);
  expect(line.hasAttribute('style')).toBe(false);
});

it('restores measure styles even when reading layout throws', async () => {
  const {measureGreekLines} = await import('../../scripts/redesign-browser.mjs');
  const line = document.createElement('span');
  let reads = 0;
  Object.defineProperty(line, 'offsetWidth', {get: () => { if (++reads === 2) throw Error('layout failed'); return 100; }});
  expect(() => measureGreekLines([line])).toThrow('layout failed');
  expect(line.hasAttribute('style')).toBe(false);
});

it('reads every direct-text descendant size, including tables, but skips note marks and numbers', async () => {
  const {readReadingSizes} = await import('../../scripts/redesign-browser.mjs');
  const root = document.createElement('div');
  root.className = 'b-ec';
  root.innerHTML = 'Root text <span><i class="small">small text</i></span><table class="eng-table"><tbody><tr><td>table text</td></tr></tbody></table><span class="fn-marker"><b>1</b></span><span class="line-num">12</span>';
  for (const el of [root, ...root.querySelectorAll('*')]) Object.defineProperty(el, 'getClientRects', {value: () => [{}]});
  vi.stubGlobal('getComputedStyle', (el: Element) => ({visibility: 'visible', fontSize: el.closest('.eng-table') ? '15.3px' : el.matches('.small') ? '17px' : '18px'}));
  expect(readReadingSizes([root])).toEqual([
    {selector: 'div.b-ec > table.eng-table > tbody > tr > td', size: 15.3}, {selector: 'div.b-ec > span > i.small', size: 17}, {selector: 'div.b-ec', size: 18},
  ]);
});

it('checks citation forms for Bekker, Busse, and chapter.section in both languages', async () => {
  const {searchRefFormat} = await import('../../scripts/redesign-browser.mjs');
  for (const [scheme, lang, text] of [
    ['bekker','grk','I.1 1a1'], ['bekker','eng','I.1 1094a'],
    ['busse','grk','I.2 12a3'], ['busse','eng','I.2 12a'],
    ['chapter-section','grk','I.49 49.3'], ['chapter-section','eng','I.49 49.3'],
  ]) expect(searchRefFormat({scheme,lang,text})).toBe(true);
  for (const [scheme, lang, text] of [
    ['bekker','eng','I.1 1094a1'], ['chapter-section','grk','I.49 49a3'],
    ['busse','grk','I.2 wrong'], ['busse','grk',''], ['busse','grk','I.2\n12a3'],
    ['unknown','grk','I.2 12a3'],
  ]) expect(searchRefFormat({scheme,lang,text})).toBe(false);
});

it('reads glossary bodies from raw Markdown and follows See-only entries independently', async () => {
  const {rawGlossaryBodies} = await import('../../scripts/redesign-browser.mjs');
  const md = '*akōn, akousion* (ἄκων): See *hekōn*.\n\n*hekōn* (ἑκών): Has *choice* and <span style="font-variant:small-caps">will</span>.\n\n*other* (x): See *akousion* and *hekōn*.';
  expect(rawGlossaryBodies(md, 'akon')).toEqual([{slug:'hekon',text:'Has choice and will.'}]);
  expect(rawGlossaryBodies(md, 'other')).toHaveLength(2);
  expect(() => rawGlossaryBodies(md, 'missing')).toThrow('Raw glossary entry missing');
  expect(() => rawGlossaryBodies('*a* (x): See *b*.\n*b* (y): See *a*.', 'a')).toThrow('Raw glossary cycle');
});

it('keeps all visible footnote targets, including chapter titles and marks after sixteen', async () => {
  const {readFootnoteTargets} = await import('../../scripts/redesign-browser.mjs');
  const root = document.createElement('div');
  root.innerHTML = '<p class="b-cht"><button class="fn-marker">Title</button></p><div class="b-ec">' + '<button class="fn-marker">Note</button>'.repeat(24) + '</div>';
  const marks = [...root.querySelectorAll('.fn-marker')];
  marks.forEach(el => Object.defineProperty(el, 'getClientRects', {value: () => [{}]}));
  vi.stubGlobal('getComputedStyle', () => ({visibility: 'visible'}));
  const targets = readFootnoteTargets(marks);
  expect(targets).toHaveLength(25);
  expect((marks[0] as HTMLElement).dataset.gate).toBe('0');
  expect((marks[24] as HTMLElement).dataset.gate).toBe('24');
});

it('scrolls and checks all rows and catches an overlap after row forty', async () => {
  const {readReaderOverlaps} = await import('../../scripts/redesign-browser.mjs');
  const greek = {left: 0, right: 100, top: 0, bottom: 20};
  const scrolls: number[] = [];
  const rows = Array.from({length: 45}, (_, index) => ({
    scrollIntoView: () => scrolls.push(index),
    querySelectorAll: (selector: string) => selector.includes('.tok')
      ? [{getClientRects: () => [greek]}] : [{index}],
  }));
  vi.stubGlobal('document', {
    createTreeWalker: (ec: {index: number}) => {
      let read = false;
      return {nextNode: () => read ? null : (read = true, {index: ec.index, textContent:'English', parentElement:{closest: () => null}})};
    },
    createRange: () => {
      let index = 0;
      return {selectNodeContents: (node: {index: number}) => {index = node.index;},
        getClientRects: () => [{...greek, left: index === 44 ? 90 : 110, right: 200}]};
    },
  });
  expect(readReaderOverlaps(rows)).toMatchObject({rows:45,boxes:90,hits:1});
  expect(scrolls).toEqual(Array.from({length:45}, (_, i) => i));
});
