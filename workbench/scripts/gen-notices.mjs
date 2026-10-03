// gen-notices.mjs — writes src-tauri/resources/THIRD-PARTY-NOTICES, the
// licences of everything the app ships that we did not write: the Rust crates
// (from `cargo metadata`), the npm packages compiled into the frontend (from
// `npm ls --omit=dev` plus notices-coverage.mjs's BUNDLED_DEV_PACKAGES), and
// the data and fonts. The app bundles the file (tauri.conf.json
// bundle.resources) and shows it from Settings › About.
//
// Run: npm run notices. src/lib/__tests__/notices.test.ts fails when the file
// misses a package in Cargo.lock or package-lock.json, so rerun this after any
// dependency change.
//
// Each package's own licence files are copied (LICENSE*, COPYING*, NOTICE*…).
// A package that ships none gets the standard text of its licence from
// scripts/licenses/ (SPDX's license-list-data), with its authors named. Texts
// are printed once, at the end, and each package points to its texts by number.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLED_DEV_PACKAGES,
  cratesFromCargoLock,
  heading,
  missingFromNotices,
  npmFromPackageLock,
} from './notices-coverage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src-tauri/resources/THIRD-PARTY-NOTICES');
const LICENCE_FILE = /^(licen[cs]e|copying|unlicense|notice|copyright)/i;
// Which standard text to use when a package ships none and offers a choice.
const PREFERRED = ['MIT', 'Apache-2.0', 'Zlib', 'BSD-3-Clause', 'BSL-1.0', 'MPL-2.0'];

const texts = new Map(); // text → number
function textId(text) {
  if (!texts.has(text)) texts.set(text, texts.size + 1);
  return texts.get(text);
}

function readText(file) {
  return fs.readFileSync(file, 'utf-8').replace(/\r\n?/g, '\n').replace(/\s+$/, '') + '\n';
}

/** The licence files a package ships, as [file name, text number]. */
function ownLicenceFiles(dir, extra) {
  const found = [];
  const add = (file) => {
    const st = fs.statSync(file);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(file).sort()) add(path.join(file, f));
    } else {
      found.push([path.relative(dir, file), textId(readText(file))]);
    }
  };
  for (const f of fs.readdirSync(dir).sort()) if (LICENCE_FILE.test(f)) add(path.join(dir, f));
  if (extra && !found.some(([f]) => path.join(dir, f) === path.resolve(dir, extra))) {
    add(path.resolve(dir, extra));
  }
  return found;
}

/** Standard texts for a package that ships no licence file. */
function standardLicences(expr, who) {
  if (!expr) throw new Error(`${who}: no licence file and no licence field`);
  const ids = expr
    .replace(/\s+WITH\s+\S+/g, '')
    .split(/\s+(?:OR|AND)\s+|\s*\/\s*|[()]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chosen = / AND /.test(expr) ? ids : [PREFERRED.find((id) => ids.includes(id))].filter(Boolean);
  if (chosen.length === 0 || chosen.some((id) => !PREFERRED.includes(id))) {
    throw new Error(`${who}: ships no licence file, and scripts/licenses/ has no text for "${expr}"`);
  }
  return chosen.map((id) => {
    // The SPDX templates carry a placeholder copyright line; the entry names the authors instead.
    const text = readText(path.join(ROOT, 'scripts/licenses', id)).replace(/^Copyright \(c\) <.*\n\n?/m, '');
    return [`standard ${id} text`, textId(text)];
  });
}

function entry(pkg, lines, files) {
  return [heading(pkg), ...lines.filter(Boolean), `Licence texts: ${files.map(([f, n]) => `[${n}] ${f}`).join(', ')}`, ''].join('\n');
}

// ---- Rust crates ----
const meta = JSON.parse(
  execFileSync('cargo', ['metadata', '--format-version', '1', '--locked'], {
    cwd: path.join(ROOT, 'src-tauri'),
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf-8',
  }),
);
const crates = meta.packages
  .filter((p) => p.source)
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  .map((p) => {
    const pkg = { kind: 'crate', name: p.name, version: p.version };
    const who = `${p.name} ${p.version}`;
    const own = ownLicenceFiles(path.dirname(p.manifest_path), p.license_file);
    const files = own.length ? own : standardLicences(p.license, who);
    const mpl = /MPL-2\.0/.test(p.license ?? '')
      ? `This crate is under the Mozilla Public License 2.0. The source code for ${p.name} ${p.version} ` +
        `is available at https://crates.io/crates/${p.name}/${p.version}` +
        (p.repository ? ` and at ${p.repository}.` : '.')
      : '';
    return entry(
      pkg,
      [
        `Licence: ${p.license ?? 'see licence text'}`,
        p.authors?.length && `Authors: ${p.authors.join(', ')}`,
        p.repository && `Source: ${p.repository}`,
        mpl,
      ],
      files,
    );
  });

// ---- npm packages ----
const npmDirs = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: ROOT, encoding: 'utf-8' })
  .split('\n')
  .filter((d) => d && d !== ROOT);
for (const name of BUNDLED_DEV_PACKAGES) npmDirs.push(path.join(ROOT, 'node_modules', name));
const npm = [...new Set(npmDirs)]
  .map((dir) => ({ dir, pj: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) }))
  .sort((a, b) => a.pj.name.localeCompare(b.pj.name) || a.pj.version.localeCompare(b.pj.version))
  .map(({ dir, pj }) => {
    const pkg = { kind: 'npm', name: pj.name, version: pj.version };
    const licence = typeof pj.license === 'string' ? pj.license : pj.license?.type;
    const own = ownLicenceFiles(dir);
    const files = own.length ? own : standardLicences(licence, `${pj.name} ${pj.version}`);
    const author = typeof pj.author === 'string' ? pj.author : pj.author?.name;
    const repo = typeof pj.repository === 'string' ? pj.repository : pj.repository?.url;
    return entry(pkg, [`Licence: ${licence ?? 'see licence text'}`, author && `Authors: ${author}`, repo && `Source: ${repo}`], files);
  });

// ---- the file ----
const rule = '-'.repeat(72);
const out = `THIRD-PARTY NOTICES

This app is free software under the MIT licence. It also ships work by other
people, listed here with the licence each one comes under. The full text of
each licence is at the end of this file; each entry points to its texts by
number, in square brackets.

Made by scripts/gen-notices.mjs. Do not edit by hand.

${rule}
1. DATA AND DOCUMENTS
${rule}

Greek and Latin dictionaries
  Liddell, Scott and Jones, A Greek-English Lexicon (Oxford, 1940), and
  Lewis and Short, A Latin Dictionary (Oxford, 1879), in the digital
  editions of the Perseus Digital Library, Tufts University
  (https://www.perseus.tufts.edu/), as packaged by Diogenes
  (Peter Heslin, https://d.iogen.es/d).
  Licence: Creative Commons Attribution-ShareAlike 3.0 United States,
  https://creativecommons.org/licenses/by-sa/3.0/us/
  We changed the format of this data so the app can search it. Our changed
  data, in the lexicon packs and in the word analyses that come with the app,
  is shared under the same licence.

Word analyses
  The analyses of Greek and Latin word forms come from Morpheus, the
  Perseus Project's word parser, as distributed with Diogenes
  (Peter Heslin, https://d.iogen.es/d).

Whitaker's Words
  The Latin word list of Whitaker's Words, by William Whitaker.
  "Permission is hereby freely given for any and all use of program and data."

Word export template
  resources/reference.docx is pandoc's default reference document, with the
  font and page size changed by scripts/make-reference-docx.mjs.
  Pandoc is Copyright (C) 2006-2024 John MacFarlane, under the GNU General
  Public License, version 2 or later (https://www.gnu.org/licenses/). Its
  source is at https://github.com/jgm/pandoc.

Fonts
  Cardo, by David J. Perry, and EB Garamond, by the EB Garamond Project
  Authors, under the SIL Open Font License 1.1. They come from the npm
  packages @fontsource/cardo and @fontsource/eb-garamond, listed in part 3
  with the full licence.

${rule}
2. RUST CRATES (${crates.length})
${rule}

${crates.join('\n')}
${rule}
3. NPM PACKAGES (${npm.length})
${rule}

${npm.join('\n')}
${rule}
4. LICENCE TEXTS (${texts.size})
${rule}

${[...texts].map(([text, n]) => `[${n}]\n\n${text}\n${rule}\n`).join('\n')}`;

// Refuse to write a file the check would fail.
const lockCrates = cratesFromCargoLock(fs.readFileSync(path.join(ROOT, 'src-tauri/Cargo.lock'), 'utf-8'));
const lockNpm = npmFromPackageLock(JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8')));
const missing = missingFromNotices(out, [...lockCrates, ...lockNpm]);
if (missing.length) {
  throw new Error(`gen-notices: these are in a lockfile but not in the notices:\n${missing.map(heading).join('\n')}`);
}

fs.writeFileSync(OUT, out);
console.log(
  `wrote ${path.relative(ROOT, OUT)}: ${crates.length} crates, ${npm.length} npm packages, ` +
    `${texts.size} licence texts, ${Math.round(out.length / 1024)} KB`,
);
