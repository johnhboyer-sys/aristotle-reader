export type MarkerRect = { left: number; right: number; top: number; bottom: number };

/** Fixed viewport coordinates; null means the marker is fully out of view. */
export function footnotePosition(
  marker: MarkerRect,
  viewport: { width: number; height: number },
  popup: { width: number; height: number },
): { left: string; top: string } | null {
  if (marker.bottom <= 0 || marker.top >= viewport.height ||
      marker.right <= 0 || marker.left >= viewport.width) return null;
  return {
    left: Math.max(8, Math.min(marker.left, viewport.width - popup.width - 16)) + 'px',
    top: Math.max(8, Math.min(marker.bottom + 8, viewport.height - popup.height - 16)) + 'px',
  };
}

export type FootnoteMode = 'hover' | 'opened' | 'closed';

/** Page scroll closes a hover preview; explicit activation lets it follow. */
export function footnoteInteraction(mode: FootnoteMode, event: 'activate' | 'scroll'): FootnoteMode {
  if (mode === 'closed') return mode;
  if (event === 'activate') return 'opened';
  return mode === 'hover' ? 'closed' : mode;
}
