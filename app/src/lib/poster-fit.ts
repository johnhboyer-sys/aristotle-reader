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
    const style = getComputedStyle(el);
    // Sideways work titles keep the kit's upright-phone setting (John, J4).
    const W = !home && phone && matchMedia('(min-width: 701px)').matches ? 354 : el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const H = phone ? (home ? 300 : Number(poster.dataset.titleHeight || 210)) : el.clientHeight;
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
    const textH = lines.reduce((n, x) => n + x.f * .88, 0);
    const gap = lines.length > 1 ? Math.max(0, Math.min((H - textH) / (lines.length - 1), .12 * Math.min(...lines.map(x => x.f)))) : 0;
    el.replaceChildren(...lines.map(x => {
        const span = document.createElement('span');
        span.className = 'ln';
        span.textContent = x.text;
        span.style.cssText = `font-size:${x.f.toFixed(1)}px;line-height:.88;letter-spacing:${(.01 * x.f).toFixed(2)}px;word-spacing:0px;margin-right:${(-.01 * x.f).toFixed(2)}px`;
        return span;
    }));
    el.style.gap = `${gap.toFixed(1)}px`;
    el.style.alignItems = lines.length === 1 && measure(lines[0].text) * lines[0].f / 100 < W * .9 ? 'center' : '';
    el.dataset.set = lines.map(x => Math.round(x.f)).join(',');
    el.dataset.fitWidth = String(W);
    el.dataset.fitRevision = String(Number(el.dataset.fitRevision || 0) + 1);
    document.documentElement.classList.remove('poster-fitting');
}
// All work-poster cap arithmetic lives here, after the fonts and intro settle.
function fitWorkPoster(el: HTMLElement) {
    const poster = el.closest<HTMLElement>('.b-po')!;
    const phone = matchMedia('(max-width: 960px)').matches;
    const sideways = phone && matchMedia('(min-width: 701px)').matches;
    const naturalHeight = poster.clientWidth * 652 / 1440;
    poster.style.setProperty('--poster-height', `${naturalHeight}px`);
    poster.style.setProperty('--plate-height', `${poster.clientWidth * 558 / 640}px`);
    delete poster.dataset.titleHeight;
    fitPoster(el);
    const start = document.querySelector<HTMLElement>('[data-start]')!;
    const nav = document.querySelector<HTMLElement>('.b-nav')!;
    const rect = poster.getBoundingClientRect();
    const tail = start.getBoundingClientRect().bottom - rect.bottom;
    const budget = Math.max(1, sideways ? innerHeight - nav.offsetHeight : innerHeight - (rect.top + scrollY) - tail - 16);
    if (phone) {
        if (el.offsetHeight >= budget) {
            poster.dataset.titleHeight = String(Math.max(14, (budget - 44) * .6));
            fitPoster(el);
        }
        // Never enlarge a plate beyond its full-width natural cut.
        const height = Math.min(poster.clientWidth * 558 / 640, Math.max(1, budget - el.offsetHeight));
        poster.style.setProperty('--plate-height', `${height}px`);
    } else {
        poster.style.setProperty('--poster-height', `${Math.min(naturalHeight, Math.max(56, budget))}px`);
        fitPoster(el);
    }
}
export async function initPosters() {
    const titles = [...document.querySelectorAll<HTMLElement>('[data-fit="poster"]')];
    try {
        await document.fonts.load('700 100px Oswald');
        await document.fonts.ready;
        const refit = () => titles.forEach(el => el.closest('.pg-work') ? fitWorkPoster(el) : fitPoster(el));
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
                    if (el.closest('.pg-work')) fitWorkPoster(el); else fitPoster(el);
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
