// Runs check-redesign.mjs's gates in parallel browsers (John, 12 Nov: the
// stage 5 suite took 38 minutes in one). Each gate runs as its own
// `--only` (or `--prove`) process; a pool of --jobs (default 4) takes the
// next gate as one finishes. The log prints each gate's output whole, in
// the suite's own order, then the tally.
//   node app/scripts/check-redesign-shards.mjs --base URL --stage 5 [--jobs 4] [--prove] [--log FILE]
import {spawn, execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
const flag = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const script = fileURLToPath(new URL('./check-redesign.mjs', import.meta.url));
const base = ['--base', flag('--base') || 'http://127.0.0.1:4329', '--stage', flag('--stage') || '1'];
const jobs = Number(flag('--jobs') || 4);
const prove = args.includes('--prove');
if (!(jobs >= 1)) throw Error('--jobs takes a number of at least 1');

const ids = execFileSync(process.execPath, [script, ...base, '--list'], {encoding: 'utf8'}).split('\n').filter(Boolean);
if (!ids.length) throw Error('check-redesign.mjs --list named no gates');

const results = new Array(ids.length);
let next = 0;
const started = Date.now();
const runOne = i => new Promise(resolve => {
  const child = spawn(process.execPath, [script, ...base, prove ? '--prove' : '--only', ids[i]]);
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.on('close', code => { results[i] = {id: ids[i], code, out}; resolve(); });
});
const worker = async () => { while (next < ids.length) await runOne(next++); };
await Promise.all(Array.from({length: Math.min(jobs, ids.length)}, worker));

// Exit codes as check-redesign.mjs sets them: 0 pass; 1 fail (with --prove,
// every mutation caught); 2 a proof not caught. An uncaught exception also
// exits 1, so the code alone proves nothing: a pass must print PASS, a proof
// run must print PROVE-CAUGHT for every case its PROVE-CASES line declares,
// and neither may show Node's crash trailer.
const crashed = out => /^Node\.js v\d/m.test(out);
const ok = r => {
  if (crashed(r.out)) return false;
  if (!prove) return r.code === 0 && new RegExp(`^PASS ${r.id} `, 'm').test(r.out);
  const declared = Number(new RegExp(`^PROVE-CASES ${r.id} (\\d+)$`, 'm').exec(r.out)?.[1] ?? 0);
  const caught = (r.out.match(new RegExp(`^PROVE-CAUGHT ${r.id} `, 'gm')) || []).length;
  return r.code === 1 && declared > 0 && caught === declared;
};
// Four browsers on one preview server can time a page load out. A gate that
// failed runs once more alone; if it then passes it is listed as flaky, with
// both runs in the log, never silently as a pass.
const flaky = [];
for (const [i, r] of results.entries()) {
  if (ok(r)) continue;
  await runOne(i);
  if (ok(results[i])) { flaky.push(r.id); results[i].out = `${r.out.trimEnd()}\n--- failed in parallel (exit ${r.code}); rerun alone:\n${results[i].out}`; }
  else results[i].out = `${r.out.trimEnd()}\n--- rerun alone, failed again:\n${results[i].out}`;
}
const bad = results.filter(r => !ok(r));
const log = results.map(r => `### ${r.id} (exit ${r.code})\n${r.out.trimEnd()}`).join('\n')
  + `\n\nSHARDS: ${ids.length} gates, ${jobs} jobs, ${((Date.now() - started) / 60000).toFixed(1)} min; `
  + `${prove ? 'proofs not all caught' : 'failed'}: ${bad.length ? bad.map(r => r.id).join(', ') : 'none'}; `
  + `flaky (failed in parallel, passed alone): ${flaky.length ? flaky.join(', ') : 'none'}\n`;
if (flag('--log')) writeFileSync(flag('--log'), log);
process.stdout.write(log);
process.exitCode = bad.length ? 1 : 0;
