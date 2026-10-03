// notices-coverage.mjs — what THIRD-PARTY-NOTICES must cover, read from the
// lockfiles, and which of those packages the file leaves out. Used by
// gen-notices.mjs (which refuses to write a file that misses one) and by
// src/lib/__tests__/notices.test.ts (which fails CI when the file goes stale).
//
// Each package in the notices file has a heading line of this form, which is
// what the check looks for:
//   === crate: serde 1.0.228 ===
//   === npm: js-yaml 4.3.0 ===

/**
 * devDependencies that a production build still compiles into the app.
 * Found 2026-10-03 by listing the node_modules paths among the bundle's module
 * ids (rollup's getModuleIds in a one-off vite build): svelte's runtime and two
 * small packages it imports. vite adds its preload helper to the bundle too.
 */
export const BUNDLED_DEV_PACKAGES = ['svelte', 'clsx', 'esm-env', 'vite'];

export function heading(pkg) {
  return `=== ${pkg.kind}: ${pkg.name} ${pkg.version} ===`;
}

/** Every crate in Cargo.lock that comes from outside this repo. */
export function cratesFromCargoLock(text) {
  const crates = [];
  for (const block of text.split('[[package]]').slice(1)) {
    const name = /^name = "([^"]+)"/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"/m.exec(block)?.[1];
    // Our own crate has no source line.
    if (name && version && /^source = /m.test(block)) crates.push({ kind: 'crate', name, version });
  }
  if (crates.length === 0) throw new Error('Cargo.lock: found no crates — is this the right file?');
  return crates;
}

/** npm packages the app ships: every non-dev package, plus BUNDLED_DEV_PACKAGES. */
export function npmFromPackageLock(lock) {
  const pkgs = [];
  const entries = Object.entries(lock.packages ?? {}).filter(([key]) => key.startsWith('node_modules/'));
  if (entries.length === 0) throw new Error('package-lock.json: found no npm packages — is this the right file?');
  for (const [key, v] of entries) {
    if (v.dev) continue;
    pkgs.push({ kind: 'npm', name: key.replace(/^.*node_modules\//, ''), version: v.version });
  }
  for (const name of BUNDLED_DEV_PACKAGES) {
    const v = lock.packages?.[`node_modules/${name}`];
    if (!v) throw new Error(`package-lock.json: no ${name}, which BUNDLED_DEV_PACKAGES says the app ships`);
    if (v.dev) pkgs.push({ kind: 'npm', name, version: v.version });
  }
  return pkgs;
}

/** The packages whose heading the notices file lacks. */
export function missingFromNotices(notices, pkgs) {
  if (pkgs.length === 0) throw new Error('notices check: no packages to look for, so it examined nothing');
  const headings = new Set(notices.split('\n').filter((l) => l.startsWith('=== ')));
  if (headings.size === 0) throw new Error('notices check: the notices file names no packages');
  return pkgs.filter((p) => !headings.has(heading(p)));
}
