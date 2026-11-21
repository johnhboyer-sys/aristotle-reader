#!/usr/bin/env node
// Pack a built site as the bundle a mirror serves: one .tar.gz that holds the
// folder as built, less the files that belong to the primary host, and a
// SHA256SUMS that names every file in it. Node 22+, no dependencies, system
// `tar`. HANDOFF-PORTABILITY.md, phase 2.
//
//   node scripts/make-bundle.mjs --out=<file.tar.gz> [--dist=app/dist]
//
// The build must be the same-origin one (PUBLIC_DATA_ROOT unset): data/ in the
// folder, no data root in sw.js, no .assetsignore or _redirects. Before a byte
// is written the data passes the gates `npm run deploy:cloudflare` runs, the
// leak check among them. The archive is then unpacked and every file read
// back against SHA256SUMS (scripts/verify-snapshot.mjs), so a bundle reported
// ok here is one a mirror can check with `shasum -a 256 -c SHA256SUMS`.
// Unpacked at a web root, it is the site.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { builtDataRoot, dataGates } from './deploy-cloudflare.mjs';
import { SUMS, formatSums, verifyTarget } from './verify-snapshot.mjs';

// Files only the primary host needs: GitHub Pages' domain claim (a mirror on
// Pages would claim the primary's name with it) and the search console's proof
// of ownership. A name here that the build lacks is an error, so the list
// cannot go stale in silence.
export const HOST_FILES = ['CNAME', 'google6b82ef60a51aace9.html'];
// Written only by a build whose data is on another host (postbuild-data-root.mjs).
const OTHER_HOST_DATA = ['.assetsignore', '_redirects'];

// Every file under dir, as a path with forward slashes. A link or a device is
// refused: the bytes hashed would not be the bytes a copy carries.
function* plainFiles(dir, base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) yield* plainFiles(full, base);
    else if (entry.isFile()) yield rel;
    else throw new Error(`${rel} is not a plain file or folder`);
  }
}

export function makeBundle({ dist, out, gates = dataGates }) {
  const r = { ok: false, out, files: 0, bytes: 0, archiveBytes: 0, dataFiles: 0, left: [], gates: [], problems: [] };
  const refuse = (...problems) => { r.problems.push(...problems); return r; };
  if (existsSync(out)) return refuse(`${out} already exists; this script does not write over a file`);
  if (!existsSync(dist) || !statSync(dist).isDirectory()) return refuse(`${dist} is not a folder`);

  // A file's sum is taken at its first read. A later read that finds other
  // bytes stops the run, and the read-back holds the archive to these sums, so
  // the bytes a gate passed are the bytes packed.
  const sums = new Map();
  const read = (p) => {
    const body = readFileSync(path.join(dist, p));
    const sha256 = createHash('sha256').update(body).digest('hex');
    if (!sums.has(p)) sums.set(p, sha256);
    else if (sums.get(p) !== sha256) throw new Error(`${p} changed while the bundle was being made`);
    return body;
  };

  let all;
  try { all = [...plainFiles(dist)]; } catch (e) { return refuse(e.message); }
  const has = new Set(all);
  // GNU tar trims a listed name and reads its backslashes; bsdtar does not.
  // A Mac's tar unpacks an accented name composed another way, so the
  // read-back could not match it. The site's own names are plain ASCII.
  for (const p of all) {
    if (/[^\x20-\x7e]|\\/.test(p) || p.split('/').some((part) => part !== part.trim())) {
      r.problems.push(`${JSON.stringify(p)}: a name with a backslash, a character outside plain ASCII, or white space at an end is not packed alike by every tar`);
    }
  }
  if (!has.has('index.html')) r.problems.push(`no index.html in ${dist}: not a built site`);
  if (has.has(SUMS)) r.problems.push(`${dist} already holds ${SUMS}`);
  for (const p of all) if (path.posix.basename(p) === '.DS_Store') r.problems.push(`${p} is a Finder file, not part of the site; delete it`);
  for (const name of OTHER_HOST_DATA) if (has.has(name)) r.problems.push(`${name} is in the build: it was built for data on another host; build again with PUBLIC_DATA_ROOT unset`);
  if (!has.has('sw.js')) r.problems.push(`no sw.js in ${dist}`);
  else {
    const root = builtDataRoot(read('sw.js').toString('utf8'));
    if (root === null) r.problems.push('sw.js has no DATA_ROOT line; app/public/sw.js has drifted');
    else if (root) r.problems.push(`built for data at ${root}; build again with PUBLIC_DATA_ROOT unset`);
  }
  for (const name of HOST_FILES) {
    if (has.has(name)) r.left.push(name);
    else r.problems.push(`the host-file list names ${name}, which this build does not hold`);
  }
  const data = all.filter((p) => p.startsWith('data/'));
  r.dataFiles = data.length;
  if (!data.length) r.problems.push(`no data files under ${dist}/data: a mirror serves its own data`);
  if (r.problems.length) return r;

  // The gates read what the bundle will hold as data, and nothing else.
  const served = function* (filter) {
    for (const p of data) if (filter(path.posix.basename(p))) yield { path: p, text: read(p).toString('utf8') };
  };
  let reports;
  try { reports = gates(served); } catch (e) { return refuse(e.message); }
  if (!reports.length) return refuse('no gate ran on the data');
  for (const [name, report] of reports) {
    r.gates.push(name);
    if (!report.ok) r.problems.push(...report.problems.slice(0, 10).map((p) => `${name}: ${p}`));
  }
  if (r.problems.length) return r;

  const files = all.filter((p) => !HOST_FILES.includes(p));
  let entries;
  try {
    entries = files.map((p) => { r.bytes += read(p).length; return { path: p, sha256: sums.get(p) }; });
  } catch (e) { return refuse(e.message); }
  r.files = entries.length;

  // The archive is made beside `out`, in three plain steps both bsdtar and GNU
  // tar do alike: pack the named files, add the sums, compress. Each name has
  // "./" in front, so none can be read as an option. COPYFILE_DISABLE keeps a
  // Mac's "._" side files out. The read-back is what proves the result.
  // tar and gzip get a bare environment: GNU tar takes options from
  // TAR_OPTIONS (--remove-files would delete the build) and gzip from GZIP.
  const env = { PATH: process.env.PATH, COPYFILE_DISABLE: '1' };
  const sumsText = formatSums(entries);
  const tmp = mkdtempSync(path.join(path.dirname(path.resolve(out)), '.make-bundle-'));
  try {
    writeFileSync(path.join(tmp, SUMS), sumsText);
    writeFileSync(path.join(tmp, 'names'), files.map((p) => `./${p}\n`).join(''));
    const plain = path.join(tmp, 'bundle.tar');
    const steps = [
      ['tar', ['-cf', plain, '-C', path.resolve(dist), '-T', path.join(tmp, 'names')]],
      ['tar', ['-rf', plain, '-C', tmp, `./${SUMS}`]],
      ['gzip', ['-n', plain]],
    ];
    for (const [command, args] of steps) {
      const run = spawnSync(command, args, { encoding: 'utf8', env });
      if (run.status !== 0) { r.problems.push(`${command} ${args[0]} failed: ${(run.stderr || String(run.error)).trim()}`); break; }
    }
    if (!r.problems.length) {
      const v = verifyTarget(`${plain}.gz`);
      if (!v.ok || v.read !== entries.length) {
        r.problems.push(`the archive does not match its ${SUMS}: ${v.read} of ${entries.length} files read, ${v.missing.length} missing, `
          + `${v.mismatched.length} changed, ${v.extra.length} unlisted${v.problems.length ? `; ${v.problems.join('; ')}` : ''}`);
      } else if (spawnSync('tar', ['-xzOf', `${plain}.gz`, `./${SUMS}`], { encoding: 'utf8', env, maxBuffer: 2 ** 30 }).stdout !== sumsText) {
        // The read-back holds the archive to the sums inside it; this holds
        // those sums to the ones taken from the files the gates read.
        r.problems.push(`the sums in the archive are not the sums this run took from ${dist}`);
      } else {
        // Made with "exclusive", so a file that appeared at `out` meanwhile stays.
        try { copyFileSync(`${plain}.gz`, out, constants.COPYFILE_EXCL); } catch (e) {
          r.problems.push(e.code === 'EEXIST' ? `${out} already exists; this script does not write over a file` : `could not write ${out}: ${e.message}`);
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (r.problems.length) return r;
  r.archiveBytes = statSync(out).size;
  r.ok = true;
  return r;
}

function main(argv) {
  const args = { dist: 'app/dist' };
  for (const a of argv) {
    const m = a.match(/^--(dist|out)=(.+)$/);
    if (!m) { console.error(`unknown argument: ${a}\nusage: node scripts/make-bundle.mjs --out=<file.tar.gz> [--dist=app/dist]`); return 2; }
    args[m[1]] = m[2];
  }
  if (!args.out) { console.error('usage: node scripts/make-bundle.mjs --out=<file.tar.gz> [--dist=app/dist]'); return 2; }
  const r = makeBundle(args);
  if (!r.ok) {
    console.log(`FAIL ${args.dist}: no bundle written; ${r.problems.length} problem${r.problems.length === 1 ? '' : 's'}`);
    for (const p of r.problems) console.log(`  !! ${p}`);
    return 1;
  }
  console.log(`ok ${r.out}: ${r.files} files, ${r.bytes} bytes, packed to ${r.archiveBytes}; left out ${r.left.join(', ')}; `
    + `${r.gates.length} gates passed on ${r.dataFiles} data files (${r.gates.join(', ')}); unpacked and read back against ${SUMS}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
