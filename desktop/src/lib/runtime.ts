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

// ── small runtime helpers shared by the data modules ────────────────────────

/** The message of a thrown value, whatever was thrown. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Keep the window open until `drain` settles, so a save still queued when the
 * user closes it reaches disk. Tauri destroys the window once this handler
 * returns, which needs core:window:allow-destroy (capabilities/default.json).
 * A drain that fails, or hangs past `ms`, lets the close go ahead: a stuck
 * disk must not leave a window that will not close.
 */
export async function holdCloseUntil(drain: () => Promise<unknown>, ms = 5000): Promise<() => void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow().onCloseRequested(() => drainWithin(drain, ms));
}

/**
 * The same wait for ⌘Q. Tauri's built-in Quit ends the app with no
 * close-requested event, so ours (src-tauri/src/lib.rs) emits `quit-requested`
 * and quits by itself unless the page answers `quit_ack` in time. Once it has,
 * the page must call `quit_now`, drain or no drain (Rust waits a while longer,
 * then quits anyway, in case the page fails to).
 */
export async function quitAfter(drain: () => Promise<unknown>, ms = 5000): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const { invoke } = await import('@tauri-apps/api/core');
  return listen('quit-requested', async () => {
    await invoke('quit_ack');
    await drainWithin(drain, ms);
    await invoke('quit_now');
  });
}

/** Settles when `drain` does, or after `ms`; never rejects. */
async function drainWithin(drain: () => Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    drain().catch(() => {}),
    new Promise<void>(resolve => { timer = setTimeout(resolve, ms); }),
  ]);
  clearTimeout(timer);
}

type AtomicFs =Pick<typeof import('@tauri-apps/plugin-fs'), 'writeTextFile' | 'rename'>;

// Each write gets its own temp name. Two overlapping writes to the same path
// used to share `<path>.tmp` and rename each other's bytes.
let tmpSerial = 0;

/**
 * Write-then-rename: stage `body` under `<path>.<n>.tmp` and move it into place
 * only once fully written, so a crash mid-write can never leave a truncated
 * file at `path`. rename() is atomic on every desktop filesystem Tauri
 * targets (same directory).
 */
export async function atomicWriteText(fs: AtomicFs, path: string, body: string): Promise<void> {
  const tmp = `${path}.${++tmpSerial}.tmp`;
  await fs.writeTextFile(tmp, body);
  await fs.rename(tmp, path);
}
