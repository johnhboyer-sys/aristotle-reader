// B's syllable and line solver, fixed to Oswald 700.
type Box = {
    W: number;
    H: number;
};
type Measure = (text: string) => number;
type Options = {
    share?: number;
    base?: number;
    fmax?: number;
    fmin?: number;
    floor?: number;
    gain?: number;
};
type Line = {
    text: string;
    f: number;
    L: number;
    S: number;
};
const LET = /[^\p{L}]/gu;
const letters = (s: string) => s.replace(LET, '').length;
const VOW = 'AEIOUYΑΕΗΙΟΥΩ';
const isV = (c: string) => VOW.includes(c);
const isL = (c: string) => /\p{L}/u.test(c);
const DIG = new Set(['CH', 'PH', 'TH', 'SH', 'GN', 'QU', 'CK', 'RH', 'GH']);
// Consonant pairs that begin a syllable, so PRO|GRESSION, COM|PLETE.
const ONSET = new Set(['PR', 'BR', 'TR', 'DR', 'CR', 'GR', 'FR', 'PL', 'BL', 'CL', 'FL', 'GL', 'ΠΡ', 'ΤΡ', 'ΚΡ', 'ΓΡ', 'ΒΡ', 'ΔΡ', 'ΦΡ', 'ΘΡ', 'ΧΡ', 'ΠΛ', 'ΚΛ', 'ΓΛ', 'ΒΛ', 'ΦΛ', 'ΧΛ']);
// Where a word may break: before a consonant between vowels (META|PHYSICS
// as META-PHY-SICS), between two consonants (ARIS|TOTLE), before a
// consonant pair that can begin a syllable (INTER|PRETATIONE); never inside
// CH, PH, TH and the like.
// John, 5 Nov, on the phone posters: METEOR / OLOGY and MECH / ANICA, not
// METEO / ROLOGY and MECHA / NICA. A word he has broken breaks where he did.
const BRK: Record<string, number> = { METEOROLOGY: 6, MECHANICA: 4 };
function sylBreaks(word: string) {
    if (BRK[word])
        return [BRK[word]];
    const out = [];
    const n = word.length;
    for (let i = 1; i < n; i++) {
        const a = word[i - 1];
        const b = word[i];
        if (!isL(a) || !isL(b))
            continue;
        let ok = false;
        if (isV(a) && !isV(b)) {
            if (i + 1 < n && isV(word[i + 1]))
                ok = true;
            else if (i + 2 < n && (DIG.has(word.slice(i, i + 2)) || ONSET.has(word.slice(i, i + 2))) && isV(word[i + 2]))
                ok = true;
        }
        else if (!isV(a) && !isV(b) && i >= 2 && isV(word[i - 2]) && !DIG.has(a + b) && !ONSET.has(a + b)) {
            if (i + 1 < n && isV(word[i + 1]))
                ok = true;
            else if (i + 2 < n && !isV(word[i + 1]) && isV(word[i + 2]) && !DIG.has(b + word[i + 1]))
                ok = true;
        }
        if (ok && letters(word.slice(0, i)) >= 3 && letters(word.slice(i)) >= 3)
            out.push(i);
    }
    // One break per word: the one nearest its middle.
    const mid = n / 2;
    return out.length ? [out.reduce((x, y) => (Math.abs(y - mid) < Math.abs(x - mid) ? y : x))] : [];
}
function solve(txt: string, box: Box, w100: Measure, opt: Options, breaks: boolean) {
    const { W, H } = box;
    const share = opt.share ?? 0.8;
    const base = opt.base ?? 0.01;
    const fmax = Math.floor(opt.fmax ?? 300);
    const fmin = opt.fmin ?? 14;
    const pts = [{ i: 0, sp: false }];
    let w0 = 0;
    for (let i = 0; i <= txt.length; i++) {
        if (i === txt.length || txt[i] === ' ') {
            if (breaks)
                for (const k of sylBreaks(txt.slice(w0, i)))
                    pts.push({ i: w0 + k, sp: false });
            if (i < txt.length)
                pts.push({ i, sp: true });
            w0 = i + 1;
        }
    }
    pts.push({ i: txt.length, sp: false });
    const cut = (a: number, b: number) => txt.slice(pts[a].i + (pts[a].sp ? 1 : 0), pts[b].i);
    const natL = (line: string, f: number) => (w100(line) * f) / 100 + base * f * (line.length - 1);
    // The largest size that fits, unless a size up to 6% smaller sets the
    // lines more evenly (ON GENERATION / AND CORRUPTION, not ON GENERATION /
    // AND / CORRUPTION).
    let found: {
        f: number;
        lines: Line[];
        score: number;
    } | null = null;
    let f1 = 0;
    for (let f = fmax; f >= fmin; f -= 1) {
        if (f1 && f < f1 * 0.94)
            break;
        const best: ({
            cost: number;
            prev: number;
            n: number;
        } | null)[] = pts.map(() => null);
        best[0] = { cost: 0, prev: -1, n: 0 };
        for (let b = 1; b < pts.length; b++) {
            for (let a = b - 1; a >= 0; a--) {
                if (!best[a])
                    continue;
                const line = cut(a, b);
                if (!line)
                    continue;
                const w = natL(line, f);
                if (w > W)
                    break;
                const last = b === pts.length - 1;
                const fill = w / W;
                // A line of several words, other than the last, must be at least
                // half full, so its word spaces never open into a hole. A line of
                // one word may be short.
                if (!last && fill < 0.5 && line.includes(' '))
                    continue;
                const mid = !last && !pts[b].sp;
                const cost = best[a]!.cost + (last ? 0.25 : 1) * 10 * (1 - fill) ** 2 + (mid ? 2 : 0) + 0.6;
                if (!best[b] || cost < best[b]!.cost)
                    best[b] = { cost, prev: a, n: best[a]!.n + 1 };
            }
        }
        const end = best[pts.length - 1];
        if (!end || end.n * 0.88 * f > share * H)
            continue;
        if (!f1)
            f1 = f;
        const score = end.cost + 20 * (1 - f / f1);
        if (found && found.score <= score)
            continue;
        const out = [];
        for (let b = pts.length - 1; b > 0; b = best[b]!.prev)
            out.unshift(cut(best[b]!.prev, b));
        const lines = out.map((line, k) => {
            const extra = W - natL(line, f);
            const nsp = (line.match(/ /g) || []).length;
            const last = k === out.length - 1;
            const fill = 1 - extra / W;
            // The last line runs to the edges only if it nearly does already.
            if (last && (out.length === 1 ? fill < 0.9 : fill < 0.85))
                return { text: line, f, L: base * f, S: 0 };
            if (nsp)
                return { text: line, f, L: base * f, S: extra / nsp };
            const dL = line.length > 1 ? extra / (line.length - 1) : 0;
            return dL <= 0.1 * f ? { text: line, f, L: base * f + dL, S: 0 } : { text: line, f, L: base * f, S: 0 };
        });
        found = { f, lines, score };
    }
    return found;
}
function block(title: string, box: Box, w100: Measure, opt: Options = {}) {
    const txt = String(title).toUpperCase().replace(/\s+/g, ' ').trim();
    const whole = solve(txt, box, w100, opt, false);
    const broken = solve(txt, box, w100, opt, true);
    const floor = (opt.floor ?? 0.5) * (opt.fmax ?? 300);
    const pick = broken && (!whole || (whole.f < floor && broken.f >= whole.f * (opt.gain ?? 1.2))) ? broken : whole;
    return pick ? pick.lines : [];
}
export function fitPoster(el: HTMLElement) {
    const poster = el.closest<HTMLElement>('.b-po')!;
    const phone = matchMedia('(max-width: 960px)').matches;
    const home = poster.classList.contains('hp-p-side');
    if (!phone && el.closest('.b-returning')) return;
    const style = getComputedStyle(el);
    // Sideways work titles keep the kit's upright-phone setting (John, J4).
    const W = !home && phone && matchMedia('(min-width: 701px)').matches ? 354 : el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    // From 961px the box is one list column wide and as tall as it needs:
    // the largest size at which every line fits the column.
    const H = phone ? (home ? 300 : Number(poster.dataset.titleHeight || 210)) : Infinity;
    const box = { W, H };
    const cv = document.createElement('canvas').getContext('2d')!;
    cv.font = '700 100px Oswald';
    const widths = new Map<string, number>();
    const measure = (s: string) => {
        if (!widths.has(s)) widths.set(s, cv.measureText(s).width);
        return widths.get(s)!;
    };
    const lines = block(el.dataset.title || '', box, measure, { share: .92, base: .01, fmax: phone ? 170 : 400, floor: 0 });
    if (!lines.length) {
        document.documentElement.classList.remove('poster-fitting');
        return;
    }
    if (!phone) {
        // The solver steps a pixel at a time; set the widest line to the
        // column's exact width.
        const widest = Math.max(...lines.map(x => measure(x.text) * x.f / 100 + .01 * x.f * (x.text.length - 1)));
        for (const x of lines) x.f *= W / widest;
    }
    if (phone && !home) for (const line of lines) line.f = Math.min(64, line.f);
    const textH = lines.reduce((n, x) => n + x.f * .88, 0);
    const gap = phone && lines.length > 1 ? Math.max(0, Math.min((H - textH) / (lines.length - 1), .12 * Math.min(...lines.map(x => x.f)))) : 0;
    el.replaceChildren(...lines.map(x => {
        const span = document.createElement('span');
        span.className = 'ln';
        span.textContent = x.text;
        span.style.cssText = `font-size:${x.f.toFixed(1)}px;line-height:.88;letter-spacing:${(.01 * x.f).toFixed(2)}px;word-spacing:0px;margin-right:${(-.01 * x.f).toFixed(2)}px`;
        return span;
    }));
    el.style.gap = `${gap.toFixed(1)}px`;
    el.style.alignItems = !(phone && !home) && lines.length === 1 && measure(lines[0].text) * lines[0].f / 100 < W * .9 ? 'center' : '';
    el.dataset.set = lines.map(x => Math.round(x.f)).join(',');
    el.dataset.fitWidth = String(W);
    // Oswald's capitals start .097em under the top of a .88 line. The home
    // bust stands from that line (b.css).
    if (phone) poster.style.removeProperty('--cap'); else poster.style.setProperty('--cap', `${(lines[0].f * .097).toFixed(1)}px`);
    el.dataset.fitRevision = String(Number(el.dataset.fitRevision || 0) + 1);
    document.documentElement.classList.remove('poster-fitting');
}
// A line of Greek kept on one line of its column, from 961px. With
// data-fill (the home line) it is set exactly as wide as the column.
// Otherwise (a work's Greek title) it only steps down from its own size, to
// 20px at the least, and then wraps.
function fitLine(el: HTMLElement) {
    el.style.fontSize = '';
    el.style.whiteSpace = '';
    el.style.lineHeight = '';
    if (matchMedia('(max-width: 960px)').matches) return;
    el.style.whiteSpace = 'nowrap';
    const range = document.createRange();
    range.selectNodeContents(el);
    const natural = range.getBoundingClientRect().width;
    const W = el.clientWidth;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (!natural || !W) return;
    if ('fill' in el.dataset) el.style.fontSize = `${(size * W / natural).toFixed(2)}px`;
    else if (natural > W) {
        const fitted = Math.floor(size * W / natural * 10) / 10;
        el.style.fontSize = `${Math.max(20, fitted)}px`;
        if (fitted < 20) { el.style.whiteSpace = ''; el.style.lineHeight = '1.5'; }
    }
    el.dataset.fitWidth = String(W);
}
// Desktop uses natural word wrapping, with comma phrases kept whole.
function fitDesktopWork(el: HTMLElement) {
    const title = el.dataset.title || '';
    el.classList.add('b-natural-title');
    el.classList.remove('b-title-three');
    el.style.cssText = '';
    el.replaceChildren(...title.split(/(?<=,)\s+/).flatMap((phrase, i) => {
        const span = document.createElement('span');
        span.textContent = phrase;
        if (title.includes(',')) span.className = 'b-title-phrase';
        return i ? [document.createTextNode(' '), span] : [span];
    }));
    const floor = title.includes(',') ? 32 : 38;
    const best = (n: number) => {
        for (let size = 60; size >= floor; size -= .5) {
            el.style.setProperty('--title-size', `${size}px`);
            if (el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().height <= size * .91 * n + 1) return size;
        }
        return 0;
    };
    const one = best(1), two = best(2), three = best(3);
    const size = one && one >= .84 * Math.max(two, three) ? one
        : two && two >= .84 * three ? Math.min(two, 50) : three ? Math.min(three, 42) : two || floor;
    el.style.setProperty('--title-size', `${size}px`);
    if (el.getBoundingClientRect().height > size * .91 * 2.5) el.classList.add('b-title-three');
    el.dataset.fs = String(size);
    el.dataset.lines = String(Math.round(el.getBoundingClientRect().height / (size * .88)));
    document.documentElement.classList.remove('poster-fitting');
}
// Keep the title intact. A short screen may put the button below the fold.
export function phonePlateHeight(screenHeight: number, titleBlockHeight: number, buttonHeight: number, naturalHeight: number, minimum = 120): number {
    return Math.min(naturalHeight, Math.max(minimum, screenHeight - titleBlockHeight - buttonHeight));
}
function fitWorkPoster(el: HTMLElement) {
    const poster = el.closest<HTMLElement>('.b-po')!;
    const phone = matchMedia('(max-width: 960px)').matches;
    if (phone) el.classList.remove('b-natural-title', 'b-title-three');
    if (!phone) {
        poster.style.removeProperty('--poster-height');
        poster.style.removeProperty('--plate-height');
        delete poster.dataset.titleHeight;
        fitDesktopWork(el);
        return;
    }
    delete poster.dataset.titleHeight;
    const sideways = matchMedia('(max-height: 500px)').matches;
    if (sideways) {
        el.style.cssText = '';
        el.textContent = el.dataset.title || '';
        el.dataset.set = '44';
        poster.style.removeProperty('--plate-height');
        return;
    }
    fitPoster(el);
    const top = poster.closest<HTMLElement>('.b-top')!;
    // Two pictures, one per theme; measure the one on show.
    const picture = [...poster.querySelectorAll<HTMLElement>('picture')].find(el => el.getClientRects().length)!;
    const greek = top.querySelector<HTMLElement>('.b-wk-gt');
    const button = top.querySelector<HTMLElement>('[data-resume], [data-start]')!;
    // Include the page header, breadcrumb, titles, 20px before the plate,
    // 18px before the buttons and 16px below the main button.
    const titleBlock = (greek || el).getBoundingClientRect().bottom + scrollY + 20;
    const height = phonePlateHeight(innerHeight, titleBlock, button.offsetHeight + 18 + 16, picture.clientWidth * 558 / 640);
    poster.style.setProperty('--plate-height', `${height}px`);
}
export async function initPosters() {
    const titles = [...document.querySelectorAll<HTMLElement>('[data-fit="poster"]')];
    try {
        await document.fonts.load('700 100px Oswald');
        await document.fonts.ready;
        const greek = [...document.querySelectorAll<HTMLElement>('[data-fit="line"]')];
        const refit = () => {
            titles.forEach(el => el.closest('.pg-work') ? fitWorkPoster(el) : fitPoster(el));
            greek.forEach(fitLine);
        };
        refit();
        document.fonts.addEventListener('loadingdone', refit);
        if (titles.some(el => el.closest('.pg-work'))) window.addEventListener('resize', refit);
        const band = matchMedia('(max-width: 960px)');
        band.addEventListener('change', refit);
        for (const el of titles) {
            let width = el.clientWidth;
            let height = el.clientHeight;
            const observer = new ResizeObserver(() => {
                if (el.clientWidth !== width || (!band.matches && el.clientHeight !== height)) {
                    refit();
                    width = el.clientWidth;
                    height = el.clientHeight;
                }
            });
            observer.observe(el);
        }
    } catch {
        // Fitting is optional; keep the heading readable when a font fails.
    } finally {
        document.documentElement.classList.remove('poster-fitting');
    }
}
