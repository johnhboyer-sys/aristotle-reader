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
