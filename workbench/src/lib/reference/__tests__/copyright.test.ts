// Copyright-hygiene regression tests (design doc D5 S3). These are cheap
// tripwires, not the primary guard (the primary guard is that referenceRoot
// defaults to user-data outside anything the packager touches) — see the
// PINNED-CONTRACT comment at the top of reference/storage.ts.
//
// Uses the same dynamic node:fs/node:path/node:url import trick as
// citation/__tests__/schemeIdIsolation.test.ts and
// assist/__tests__/isolation.test.ts (this project has no @types/node, so a
// static `import 'node:fs'` fails `tsc --noEmit` even though vitest's node
// environment provides it at runtime).
import { beforeAll, describe, expect, it } from 'vitest';

type FS = { readFileSync(path: string, encoding: 'utf-8'): string };
type URLMod = { fileURLToPath(url: URL): string };

let fs: FS;
let tauriConfPath: string;

/**
 * The Pandoc *reference.docx* styling template is an unrelated Word-styling
 * template that happens to share the substring "reference" with our
 * copyrighted reference-translation OCR — allowlist this EXACT path and fail
 * on anything else matching /reference/i.
 */
const ALLOWED_REFERENCE_RESOURCE = 'resources/reference.docx';

beforeAll(async () => {
  fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as FS;
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as URLMod;
  // this file: src/lib/reference/__tests__/copyright.test.ts
  // target:    src-tauri/tauri.conf.json (workbench root)
  tauriConfPath = nodeUrl.fileURLToPath(
    new URL('../../../../src-tauri/tauri.conf.json', import.meta.url),
  );
});

describe('tauri.conf.json bundle.resources — no reference-translation text bundled', () => {
  it('contains no resource entry matching "reference" other than the Pandoc docx template', () => {
    const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
    const resources: string[] = conf?.bundle?.resources ?? [];
    expect(Array.isArray(resources)).toBe(true);
    expect(resources.length).toBeGreaterThan(0);

    const suspicious = resources.filter(
      (r) => /reference/i.test(r) && r !== ALLOWED_REFERENCE_RESOURCE,
    );
    expect(suspicious).toEqual([]);

    // Sanity: the allowlisted entry is actually present (guards against the
    // allowlist silently going stale if the docx path is ever renamed).
    expect(resources).toContain(ALLOWED_REFERENCE_RESOURCE);
  });

  it('contains no "references/" (plural, our storage dir name) resource entry', () => {
    const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
    const resources: string[] = conf?.bundle?.resources ?? [];
    const matches = resources.filter((r) => r.includes('references/'));
    expect(matches).toEqual([]);
  });
});
