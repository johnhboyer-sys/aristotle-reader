#!/usr/bin/env node
// Is every mirror whole and current? HANDOFF-PORTABILITY.md, phase 3: the
// check a weekly job runs. Node 22+, no dependencies.
//
//   node scripts/check-mirrors.mjs --source=<the repo's git address>
//     --sums=<the latest release's SHA256SUMS, a file or an address>
//     [--mirrors=mirrors.json] [--every=N] [--no-history]
//
// mirrors.json names the mirrors: { "git": [{ "name", "url" }], "site": [...] }.
//
// A git mirror must hold every branch and tag of the source at the same
// commit (mirror-check.mjs's comparison; gh-pages left out), and its history
// must be whole: it is cloned and asked. --no-history skips the clone and
// says so.
//
// A site mirror must serve, at <url>SHA256SUMS, the very list the latest
// release carries; if it serves another, it is stale. Then the files are
// asked for and their bytes compared with the release's list
// (check-served.mjs; --every=N reads a sample). The list a mirror serves is
// its own word; the release's is not.
//
// Exit 1 when any mirror is behind, stale, silent, or not whole; when
// mirrors.json names no mirror (a check that examined nothing has not
// passed); and when a mirror is listed with nothing to hold it to.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkServed } from './check-served.mjs';
import { compareRefs, historyOf, lsRemote } from './mirror-check.mjs';
import { hasPassword, isAddress } from './mirror-git.mjs';
import { SUMS, parseSums } from './verify-snapshot.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const isSite = (url) => URL.canParse(url) && /^https?:$/.test(new URL(url).protocol) && !new URL(url).search && !new URL(url).hash;

export function readMirrors(text) {
  const bad = (why) => { throw new Error(`mirrors.json: ${why}`); };
  let m;
  try { m = JSON.parse(text); } catch { bad('not JSON'); }
  if (!m || typeof m !== 'object' || Object.keys(m).sort().join() !== 'git,site') bad('must hold "git" and "site", and nothing else');
  const seen = new Set();
  for (const kind of ['git', 'site']) {
    if (!Array.isArray(m[kind])) bad(`"${kind}" must be a list`);
    for (const e of m[kind]) {
      if (!e || typeof e !== 'object' || Object.keys(e).sort().join() !== 'name,url' || typeof e.name !== 'string' || !e.name || typeof e.url !== 'string') {
        bad(`each ${kind} mirror is { "name", "url" }, and nothing else`);
      }
      if (hasPassword(e.url)) bad(`${e.name}: the address has a password in it`);
      if (kind === 'git' ? !isAddress(e.url) : !isSite(e.url)) bad(`${e.name}: ${e.url} is not ${kind === 'git' ? 'a git address' : 'an http(s) address without a query'}`);
      if (seen.has(e.url)) bad(`${e.url} is listed twice`);
      seen.add(e.url);
    }
  }
  return m;
}

// `sums` is the text of the release's SHA256SUMS. Returns { ok, problems,
// results }, one result a mirror: { kind, name, url, ok, problems, note }.
export async function checkMirrors({ mirrors, source, sums, every = 1, tries = 2, history = true }) {
  const problems = [];
  const results = [];
  if (!mirrors.git.length && !mirrors.site.length) problems.push('mirrors.json names no mirror: examined nothing');
  if (mirrors.git.length && !source) problems.push('a git mirror is listed and there is no --source to hold it to');
  if (mirrors.site.length && !sums) problems.push('a site mirror is listed and there is no --sums to hold it to');
  if (problems.length) return { ok: false, problems, results };

  let sourceRefs = null;
  if (mirrors.git.length) {
    try { sourceRefs = lsRemote(source); } catch (e) { problems.push(`the source: ${e.message}`); }
  }
  for (const m of mirrors.git) {
    const r = { kind: 'git', ...m, ok: false, problems: [], note: '' };
    results.push(r);
    if (!sourceRefs) { r.problems.push('not checked: the source could not be read'); continue; }
    let refs;
    try { refs = lsRemote(m.url); } catch (e) { r.problems.push(`silent: ${e.message}`); continue; }
    const c = compareRefs(sourceRefs, refs);
    r.problems.push(...c.problems);
    let historyNote = history ? 'history not checked: the refs do not match' : 'history not checked (--no-history)';
    if (c.ok && history) {
      const h = historyOf(m.url);
      if (h.problem) r.problems.push(h.problem);
      historyNote = h.problem ? 'history not whole' : `history: ${h.commits} commits, whole`;
    }
    r.note = `${c.matched} of ${c.examined} refs match; ${historyNote}`;
    r.ok = r.problems.length === 0;
  }

  const entries = sums ? parseSums(sums) : [];
  for (const m of mirrors.site) {
    const r = { kind: 'site', ...m, ok: false, problems: [], note: '' };
    results.push(r);
    const url = new URL(m.url);
    const base = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    let own;
    try {
      const res = await fetch(`${url.origin}${base}${SUMS}`, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) { r.problems.push(`${SUMS} answered ${res.status}`); continue; }
      own = await res.text();
    } catch (e) { r.problems.push(`silent: ${e.cause?.code || e.cause?.message || e.message}`); continue; }
    if (own !== sums) { r.problems.push(`stale: its ${SUMS} is not the release's`); continue; }
    const c = await checkServed({ origin: url.origin, base, entries, every, tries });
    r.problems.push(...c.problems);
    r.note = `serves the release's ${SUMS}; ${c.examined} of ${c.total} listed files asked for${every > 1 ? ` (a sample: every ${every}th)` : ''}`;
    r.ok = r.problems.length === 0;
  }
  return { ok: problems.length === 0 && results.every((r) => r.ok), problems, results };
}

async function main(argv) {
  const args = { mirrors: path.join(ROOT, 'mirrors.json'), every: '1', history: true };
  for (const a of argv) {
    const m = a.match(/^--(source|sums|mirrors|every)=(.+)$/s);
    if (m) args[m[1]] = m[2];
    else if (a === '--no-history') args.history = false;
    else throw new Error(`unknown argument ${a}`);
  }
  const every = Number(args.every);
  if (!Number.isInteger(every) || every < 1) throw new Error('--every must be a whole number, 1 or more');
  const mirrors = readMirrors(readFileSync(args.mirrors, 'utf8'));
  let sums;
  if (args.sums && /^https?:\/\//.test(args.sums)) {
    const res = await fetch(args.sums, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`${args.sums} answered ${res.status}`);
    sums = await res.text();
  } else if (args.sums) sums = readFileSync(args.sums, 'utf8');
  const r = await checkMirrors({ mirrors, source: args.source, sums, every, history: args.history });
  for (const p of r.problems) console.log(`FAIL ${p}`);
  for (const m of r.results) {
    console.log(`${m.ok ? 'ok  ' : 'FAIL'} ${m.kind} mirror ${m.name} (${m.url})${m.note ? `: ${m.note}` : ''}`);
    for (const p of m.problems.slice(0, 20)) console.log(`  ${p}`);
    if (m.problems.length > 20) console.log(`  and ${m.problems.length - 20} more`);
  }
  const bad = r.results.filter((m) => !m.ok).length;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.results.length - bad} of ${r.results.length} mirrors whole and current`);
  return r.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exit(await main(process.argv.slice(2))); } catch (e) { console.log(`FAIL ${e.message}; no mirror checked`); process.exit(1); }
}
