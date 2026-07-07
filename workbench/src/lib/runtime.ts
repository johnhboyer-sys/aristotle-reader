// Browser/Tauri runtime detection for the Workbench.
//
// `npm run dev` must run standalone in a plain browser (no Tauri present) —
// mirrors desktop/src/lib/runtime.ts's isTauri() guard. Any call into a
// @tauri-apps/* API must be gated behind isTauri() so the browser harness
// never throws on a missing __TAURI_INTERNALS__ bridge.
//
// This is a stub: the Workbench doesn't have a corpus data layer to resolve
// yet (that lands with the editor itself). It exists now so components can
// start writing `if (isTauri())` branches without importing @tauri-apps/api
// directly at module scope.

export type RuntimeHost = 'tauri' | 'browser';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function runtimeHost(): RuntimeHost {
  return isTauri() ? 'tauri' : 'browser';
}
