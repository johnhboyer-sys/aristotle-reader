// The desktop app's runtime data layer.
//
// The website resolves its corpus at Astro build time (public/data symlink →
// build/dist). The desktop app must not: content is no longer fixed at build
// time (bundled corpus now, user-imported translations later). Instead the
// shared data helpers in shared/lib/data.ts read their root URL lazily from
// `globalThis.__ARISTOTLE_DATA_ROOT__`, and this module decides what that root
// is before the UI mounts:
//
//  - In the packaged app: an on-disk corpus directory served over Tauri's
//    asset: protocol. First match wins: the user's app-data corpus (where the
//    import flow will write), then the corpus bundled with the app's resources.
//  - In dev (plain `vite` or `tauri dev`, where no on-disk corpus exists yet):
//    the default `/data` path, served by the vite middleware from the
//    pipeline's build/dist. Nothing to override.
//
// Every consumer downstream (Reader, WordPopup, search) is unchanged — they go
// through data.ts and never learn where the bytes came from.

export interface DataLayerInfo {
  host: 'tauri' | 'browser';
  /** Which corpus root won; null = default /data (dev middleware). */
  corpusDir: string | null;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function initDataLayer(): Promise<DataLayerInfo> {
  if (!isTauri()) return { host: 'browser', corpusDir: null };

  const { appDataDir, resourceDir, join } = await import('@tauri-apps/api/path');
  const { exists } = await import('@tauri-apps/plugin-fs');
  const { convertFileSrc } = await import('@tauri-apps/api/core');

  const candidates: string[] = [];
  try { candidates.push(await join(await appDataDir(), 'corpus')); } catch { /* no app dir yet */ }
  try { candidates.push(await join(await resourceDir(), 'corpus')); } catch { /* unbundled dev run */ }

  for (const dir of candidates) {
    try {
      if (await exists(dir)) {
        // convertFileSrc keeps path separators intact, so relative shard paths
        // ("/EN/book-01.json") can be joined onto it exactly like a URL root.
        (globalThis as { __ARISTOTLE_DATA_ROOT__?: string }).__ARISTOTLE_DATA_ROOT__ =
          convertFileSrc(dir);
        return { host: 'tauri', corpusDir: dir };
      }
    } catch { /* unreadable candidate — try the next */ }
  }
  // No on-disk corpus: fall through to /data (tauri dev against the vite server).
  return { host: 'tauri', corpusDir: null };
}
