// Speaker-name colour assignment, shared by the reader (Reader.svelte, which
// tints each speaker's lead-in) and the landing-page dramatis-personae list
// (Landing.astro) so a given speaker gets the SAME hue in both places.
//
// The palette itself is eight CSS custom properties (--spk-0…7 in
// shared/styles/global.css); this module only decides which slot each speaker
// occupies. The slot is a hash of the speaker's key (its printed display, e.g.
// "Soc."), so the colour is stable for that name across books and reloads, with
// linear probing so two speakers never share a slot unless the cast is larger
// than the palette.

export const SPK_PALETTE_N = 8;

// Minimal shape of a book's turn flow needed to harvest speaker displays.
interface TurnFlowLike {
  turns?: Array<{
    d: string | null;
    et?: Array<{ d: string | null }> | null;
    sub?: Array<{ d: string | null }> | null;
  }> | null;
}

// The ordered, de-duplicated list of printed speaker displays across one or
// more books' turn flows — turn lead-ins, embedded `et` speeches, and folded
// `sub` speeches, in encounter order. This is the roster both the reader and
// the landing feed to assignSpeakerSlots, so passing the SAME books to both
// (the whole work) guarantees a speaker gets the same colour in the cast list
// and in every book of the text — the per-book collision probe can't otherwise
// diverge across books.
export function collectDisplayOrder(
  turnFlows: Iterable<TurnFlowLike | null | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tf of turnFlows) {
    for (const t of tf?.turns ?? []) {
      const push = (d: string | null | undefined) => {
        if (d && !seen.has(d)) { seen.add(d); out.push(d); }
      };
      push(t.d);
      for (const e of t.et ?? []) push(e.d);
      for (const x of t.sub ?? []) push(x.d);
    }
  }
  return out;
}

export function spkHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Assign each key a palette slot in [0, SPK_PALETTE_N). Keys are consumed in
// first-appearance order; duplicates keep their first assignment. The base slot
// is the key's hash; if that slot is taken, probe forward so the cast stays
// visually distinct until it exceeds the palette size (after which reuse is
// unavoidable and the raw hash slot is kept).
export function assignSpeakerSlots(orderedKeys: Iterable<string>): Map<string, number> {
  const map = new Map<string, number>();
  const used = new Set<number>();
  for (const key of orderedKeys) {
    if (map.has(key)) continue;
    let slot = spkHash(key) % SPK_PALETTE_N;
    for (let i = 0; i < SPK_PALETTE_N && used.has(slot); i++) slot = (slot + 1) % SPK_PALETTE_N;
    used.add(slot);
    map.set(key, slot);
  }
  return map;
}
