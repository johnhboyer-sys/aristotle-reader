import { test, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { WORKS, CATEGORIES } from '@shared/lib/works';
const root = resolve(import.meta.dirname, '../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const manifest = () => existsSync(resolve(root, 'src/data/plates.json')) ? json('src/data/plates.json') : {};
const count = (id: string, n: number) => { console.log(`${id} examined=${n}`); expect(n).toBeGreaterThan(0); };
test('R-P1 source hashes, JPEG dimensions, ids, no masks', () => {
    const files = ['desk', 'phone'].flatMap(b => existsSync(resolve(root, `public/plates/${b}`)) ? readdirSync(resolve(root, `public/plates/${b}`)).map(f => `${b}/${f}`) : []);
    count('R-P1', files.length);
    expect(files).toHaveLength(96);
    const scan = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? [d.name, ...scan(resolve(dir, d.name))] : []);
    expect(scan(resolve(root, 'public/plates'))).not.toContain('mask');
    const hashes = json('scripts/fixtures/plate-sha256.json');
    for (const band of ['desk', 'phone'])
        expect(files.filter(f => f.startsWith(band + '/')).map(f => f.split('/')[1].replace('.jpg', '')).sort()).toEqual(Object.keys(manifest()).sort());
    for (const f of files) {
        expect(f).not.toMatch(/mask/);
        const b = readFileSync(resolve(root, 'public/plates', f));
        expect(createHash('sha256').update(b).digest('hex'), f).toBe(hashes[f]);
        expect(b.readUInt16BE(0)).toBe(0xffd8);
        let size: number[] = [];
        for (let p = 2; p < b.length;) {
            if (b[p++] !== 255)
                throw Error(`Invalid JPEG ${f}`);
            const marker = b[p++], len = b.readUInt16BE(p);
            if ([0xc0, 0xc1, 0xc2].includes(marker)) {
                size = [b.readUInt16BE(p + 5), b.readUInt16BE(p + 3)];
                break;
            }
            p += len;
        }
        expect(size, f).toEqual(f.startsWith('desk/') ? [1280, 914] : [640, 558]);
    }
});
test('R-P2 manifest schema and ids', () => {
    const m = manifest();
    count('R-P2', Object.keys(m).length);
    expect(Object.keys(m).sort()).toEqual(['home', ...WORKS.map(w => w.id)].sort());
    expect(Object.keys(m)).toHaveLength(48);
    for (const [id, p] of Object.entries(m) as [
        string,
        any
    ][]) {
        // D26 (John, 10 Nov): the plate's side follows the picture.
        expect(['left', 'right'], id).toContain(p.place);
        // The ink box, in the desk plate's own 1280×914 pixels.
        expect(p.ink, id).toHaveLength(4);
        const [x0, y0, x1, y1] = p.ink;
        expect(Number.isInteger(x0) && Number.isInteger(y0) && Number.isInteger(x1) && Number.isInteger(y1), id).toBe(true);
        expect(0 <= x0 && x0 < x1 && x1 <= 1280 && 0 <= y0 && y0 < y1 && y1 <= 914, `${id} ink ${p.ink}`).toBe(true);
        for (const k of ['alt', 'who', 'what', 'when', 'how', 'where', 'lic', 'url'])
            expect(p, id).toHaveProperty(k);
        expect(p.url, id).toMatch(/^https?:\/\//);
        for (const k of ['pick', 'desk', 'phone'])
            expect(p, id).not.toHaveProperty(k);
    }
    const sides = (side: string) => Object.entries(m).filter(([id, p]: [string, any]) => id !== 'home' && p.place === side).length;
    expect([sides('left'), sides('right')]).toEqual([22, 25]);
    expect(m.home.place).toBe('left');
    expect([m.GC.place, m.Mete.place, m.MA.place, m.Isa.place]).toEqual(['right', 'left', 'left', 'left']);
});
test('R-P3 credit keys and EN exact credit', () => {
    const m = manifest();
    count('R-P3', Object.keys(m).length);
    console.log(`R-P3 null=${Object.values(m).filter((p: any) => p.credit === null).length}`);
    for (const p of Object.values(m)) {
        expect(p).toHaveProperty('credit');
        expect(p).toHaveProperty('creditChecked');
    }
    expect(m.EN.credit).toBe('Gift of Mrs. Carroll G. Ross, 1945');
});
// D26 (John, 10 Nov): the dubious and spurious works stand in the main divisions.
test('R-K2 AthPol follows Pol in IV', () => { count('R-K2', CATEGORIES.length); expect(CATEGORIES.find(c => c.numeral === 'IV')!.works!.map(w => w.id)).toEqual(['EN', 'MM', 'EE', 'VV', 'Pol', 'Oec', 'AthPol']); expect(CATEGORIES.find(c => c.numeral === 'V')!.works!.map(w => w.id)).toEqual(['Rhet', 'RhetAl', 'Poet']); });
test('R-K3 source blurbs omit book counts; exact MM and Prob', () => {
    const source = readFileSync(resolve(root, '../shared/lib/works.ts'), 'utf8');
    const blurbs = [...source.matchAll(/blurb: '((?:\\.|[^'\\])*)'/g)].map(m => m[1]);
    count('R-K3', blurbs.length);
    expect(blurbs.filter(b => /\b(in|into)\s+[a-z-]+\s+books?\b/i.test(b))).toEqual([]);
    for (const b of blurbs)
        expect(b).not.toMatch(/(?: —|,)\.$/);
    expect(WORKS.find(w => w.id === 'MM')!.blurb).toBe('An ethics over the ground of the Nicomachean and Eudemian Ethics; whether Aristotle wrote it is disputed.');
    expect(WORKS.find(w => w.id === 'Prob')!.blurb).toBe('Nearly nine hundred questions of natural science, each asked as “Why…?” and answered with a conjecture.');
});
test('R-K5 appendix wording throughout sources', () => {
    count('R-K5', CATEGORIES.length);
    // D26: no division of their own any more; the tags carry the wording.
    expect(CATEGORIES.filter(c => c.appendix)).toEqual([]);
    const repo = resolve(root, '..');
    const tracked = execFileSync('git', ['ls-files', '--', 'app', 'shared', ':!**/__tests__/**'], {cwd: repo, encoding: 'utf8'}).trim().split('\n').filter(Boolean);
    count('R-K5 tracked files', tracked.length);
    const result = spawnSync('git', ['grep', '-i', '-E', 'doubtful and spurious|doubted and spurious', '--', 'app', 'shared', ':!**/__tests__/**'], {cwd: repo, encoding: 'utf8'});
    expect(result.error).toBeUndefined();
    expect([0, 1]).toContain(result.status);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('');
});
