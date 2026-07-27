import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFESTS = join(ROOT, 'manifests');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
  }
}

function dataDirProblem(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      return existsSync(path) ? null : 'data not built yet: build/dist is a dangling symlink';
    }
    if (!stat.isDirectory()) {
      return 'data not built yet: build/dist exists but is not a directory';
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 'data not built yet: build/dist does not exist';
    }
    throw error;
  }
  return null;
}

const works = readdirSync(MANIFESTS)
  .filter((name) => name.endsWith('.yaml') && !name.endsWith('-public.yaml'))
  .map((name) => name.slice(0, -'.yaml'.length))
  .sort((a, b) => a.localeCompare(b));

const publicWorks = new Set(
  readdirSync(MANIFESTS)
    .filter((name) => name.endsWith('-public.yaml'))
    .map((name) => name.slice(0, -'-public.yaml'.length)),
);

console.log('Cleaning generated public build output');
rmSync(join(ROOT, 'build', 'dist'), { recursive: true, force: true });
rmSync(join(ROOT, 'app', 'dist'), { recursive: true, force: true });

for (const work of works) {
  const manifest = publicWorks.has(work) ? `${work}-public.yaml` : `${work}.yaml`;
  console.log(`\nBuilding ${work} from manifests/${manifest}`);
  run('uv', ['run', 'python', '-m', 'aristotle_pipeline', 'all', '--work', work, '--public'], {
    cwd: join(ROOT, 'pipeline'),
  });
}

// Stage 8 is the one corpus-wide stage: it merges every work's token stream
// from build/ngrams into the shared phrase browser. It takes no --work and so
// is not part of 'all', and its output lives under build/dist, which this
// script just cleaned — without this call a full rebuild emits a site whose
// /phrases pages have no data behind them.
console.log('\nBuilding the corpus-wide phrase index');
run('uv', ['run', 'python', '-m', 'aristotle_pipeline', 'stage8'], {
  cwd: join(ROOT, 'pipeline'),
});

const dataDir = join(ROOT, 'build', 'dist');
const dataProblem = dataDirProblem(dataDir);
if (dataProblem) {
  console.error(dataProblem);
  process.exit(1);
}

console.log('\nRunning corpus preflight validation');
run('uv', ['run', 'python', '-m', 'aristotle_pipeline.preflight', dataDir, MANIFESTS], {
  cwd: join(ROOT, 'pipeline'),
});

// Safety gate for the shared (de-duplicated) LSJ dictionary: fail the build if
// any LSJ key referenced by any work's analyses.json is missing from the shared
// build/dist/lsj shards (which would make a word popup silently show no entry).
console.log('\nVerifying shared LSJ dictionary covers every referenced key');
run('uv', ['run', 'python', '-m', 'aristotle_pipeline.verify_shared_lsj'], {
  cwd: join(ROOT, 'pipeline'),
});

if (!existsSync(join(ROOT, 'app', 'node_modules'))) {
  console.log('\nInstalling app dependencies');
  run('npm', ['ci'], { cwd: join(ROOT, 'app') });
}

// Private (copyright-encumbered) translations are hidden by default; a
// production build only carries them if PUBLIC_SHOW_PRIVATE=1. Force it off here
// so the public deploy can never leak them — even if the caller's shell happens
// to have that var set. (See SHOW_PRIVATE in app/src/lib/works.ts.)
console.log('\nBuilding Astro app (private translations hidden)');
run('npm', ['run', 'build'], {
  cwd: join(ROOT, 'app'),
  env: { PUBLIC_SHOW_PRIVATE: '0' },
});

// Deploy gate: every internal href, fragment anchor, Bekker deep link, and
// lemma page in the emitted site must resolve. CI can't run this (the corpus
// is machine-local), so the pre-deploy build is where it has to hold the line.
console.log('\nChecking link integrity of the built site');
run('node', [join(ROOT, 'scripts', 'check-links.mjs'), join(ROOT, 'app', 'dist')]);
