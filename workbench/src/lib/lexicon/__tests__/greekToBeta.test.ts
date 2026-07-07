import { describe, expect, it } from 'vitest';
import { greekToBeta } from '../greekToBeta';
import { betaToGreek } from '../../betacode';

// ── deterministic unit cases — expected values derived FROM the decoder,
// not hand-guessed, so the two stay provably inverse on these inputs ──────

describe('greekToBeta: deterministic cases', () => {
  it('encodes τό (acute, no breathing) to match betaToGreek("to/")', () => {
    const greek = betaToGreek('to/');
    expect(greek).toBe('τό');
    expect(greekToBeta(greek)).toBe('to/');
  });

  it('encodes ἦν (smooth breathing + circumflex) to match betaToGreek("h)=n")', () => {
    const greek = betaToGreek('h)=n');
    expect(greek).toBe('ἦν');
    expect(greekToBeta(greek)).toBe('h)=n');
  });

  it('encodes a capitalized word to match betaToGreek("*pa/ntes")', () => {
    const greek = betaToGreek('*pa/ntes');
    expect(greek).toBe('Πάντες');
    expect(greekToBeta(greek)).toBe('*pa/ntes');
  });

  it('encodes rough breathing (ῥ) to match betaToGreek("r(")', () => {
    const greek = betaToGreek('r(');
    expect(greekToBeta(greek)).toBe('r(');
  });

  it('encodes iota subscript to match betaToGreek("tw=|")', () => {
    const greek = betaToGreek('tw=|');
    expect(greek).toBe('τῷ');
    expect(greekToBeta(greek)).toBe('tw=|');
  });

  it('encodes diaeresis to match betaToGreek("prau+/thta")', () => {
    const greek = betaToGreek('prau+/thta');
    expect(greekToBeta(greek)).toBe('prau+/thta');
  });

  it('encodes grave accent to match betaToGreek("kai\\\\")', () => {
    const greek = betaToGreek('kai\\');
    expect(greek).toBe('καὶ');
    expect(greekToBeta(greek)).toBe('kai\\');
  });

  it('passes through non-Greek characters (space, punctuation, elision apostrophe) unchanged', () => {
    expect(greekToBeta('a b.')).toBe('a b.');
    expect(greekToBeta("δ'")).toBe("d'");
  });

  it('final sigma and medial sigma both encode to plain "s"', () => {
    const medial = betaToGreek('s'); // σ (word not ended)
    const final = betaToGreek('logos'.slice(0, 100)); // ends the word -> ς
    expect(greekToBeta('σ')).toBe('s');
    expect(greekToBeta('ς')).toBe('s');
    expect(greekToBeta(final)).toBe('logos');
  });

  it('round-trips every capital letter of the alphabet via the decoder', () => {
    for (const letter of 'abgdezhqiklmncoprstufxyw') {
      const betaCap = `*${letter}`;
      const greek = betaToGreek(betaCap);
      expect(greekToBeta(greek)).toBe(betaCap);
    }
  });
});

// ── acceptance test: round-trip against real analysis keys ────────────────
//
// Reads /Users/johnboyer/Developer/aristotle-reader/build/dist/Meta/analyses.json
// (read-only, TLG-derived — never committed to this repo) and checks that
// betaToGreek(key) -> greekToBeta(...) reproduces the original key (after
// stripping any trailing homograph digit). Skips gracefully if the file
// isn't present on this machine (e.g. CI, a fresh checkout).

// Override with VITE_ARISTOTLE_ANALYSES_JSON if this ever needs to run
// against a different checkout; import.meta.env (not process.env) since
// this project carries no @types/node (see the readNodeFileSync note below).
const ANALYSES_PATH =
  import.meta.env.VITE_ARISTOTLE_ANALYSES_JSON ??
  '/Users/johnboyer/Developer/aristotle-reader/build/dist/Meta/analyses.json';

interface NodeFsSync {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf-8'): string;
}

// Computed specifier: this project has no @types/node (see vite.config.ts's
// own comment on the same trick) so a static `import 'node:fs'` would fail
// `tsc --noEmit`, even though vitest's node environment provides it at runtime.
async function readNodeFileSync(path: string): Promise<string | null> {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as NodeFsSync;
  if (!fs.existsSync(path)) return null;
  return fs.readFileSync(path, 'utf-8');
}

describe('greekToBeta: acceptance round-trip against real analysis keys', () => {
  it('reproduces >=99% of stripped analysis keys via betaToGreek -> greekToBeta', async () => {
    const text = await readNodeFileSync(ANALYSES_PATH);
    if (text === null) {
      console.warn(`skipping: ${ANALYSES_PATH} not found on this machine`);
      return;
    }
    const table = JSON.parse(text) as Record<string, unknown>;
    const keys = Object.keys(table);
    expect(keys.length).toBeGreaterThan(0);

    let pass = 0;
    const failures: { key: string; greek: string; roundtrip: string }[] = [];
    for (const key of keys) {
      const stripped = key.replace(/[1-9]+$/, '');
      const greek = betaToGreek(stripped);
      const roundtrip = greekToBeta(greek);
      if (roundtrip === stripped) {
        pass++;
      } else {
        failures.push({ key: stripped, greek, roundtrip });
      }
    }

    const rate = pass / keys.length;
    if (failures.length > 0) {
      console.warn(
        `greekToBeta round-trip: ${pass}/${keys.length} (${(rate * 100).toFixed(2)}%); ` +
          `first failures: ${JSON.stringify(failures.slice(0, 10))}`,
      );
    }
    // Measured 100% (6297/6297) on the full Meta corpus; a small residue of
    // pathological keys is tolerated per the task's acceptance bar (<0.5%).
    expect(rate).toBeGreaterThanOrEqual(0.995);
  });
});
