import { existsSync, readdirSync, rmSync } from 'node:fs';
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

if (!existsSync(join(ROOT, 'build', 'dist'))) {
  throw new Error('Public data build did not produce build/dist; refusing to build deployable app output.');
}

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
