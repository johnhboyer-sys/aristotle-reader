// The running-text search's worker: runs findMatches off the page's thread,
// so a pattern that never finishes can be stopped (running-text.ts ends this
// worker when a work takes too long).
import { findMatches } from './running-match';

self.onmessage = (e: MessageEvent<{ text: string; source: string; flags: string; cuts?: number[] }>) => {
  const { text, source, flags, cuts } = e.data;
  let re: RegExp;
  try {
    re = new RegExp(source, flags);
  } catch (err) {
    // A pattern this thread cannot read: the search's bad-pattern message.
    (self as unknown as Worker).postMessage({ ok: false, pattern: true, error: String(err) });
    return;
  }
  try {
    const spans = findMatches(text, re, cuts);
    (self as unknown as Worker).postMessage({ ok: true, spans }, [spans.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
