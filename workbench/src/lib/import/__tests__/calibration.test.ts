/**
 * Empirical calibration of the similarity metric against d3 §2's expectation:
 * clean ≈ 1.0, one-typo ≈ 0.8–0.9, unrelated < 0.15 (mean). Measured on the
 * real Ζ.17 lines; documents the numbers the §5 thresholds were tuned against.
 * SKIPS when `.dev-corpus` is absent.
 */

import { describe, expect, it } from 'vitest';
import { loadDevCorpus, realZ17, mulberry32, noisyLine } from './fixtures';
import { sim } from '../similarity';
import { clearFeatureCache } from '../compareKey';
import type { WorkCorpus } from '../../data/corpusStore';

const corpus = await loadDevCorpus();
const suite = corpus ? describe : describe.skip;

suite('similarity calibration (d3 §2)', () => {
  it('clean ≈ 1.0, one-typo ≈ 0.8–0.9, unrelated < 0.15 (mean)', () => {
    const rows = realZ17(corpus as WorkCorpus);
    clearFeatureCache();
    const rand = mulberry32(42);

    let cleanMin = 1;
    let noisySum = 0;
    let noisyMin = 1;
    let unrelSum = 0;
    let n = 0;
    for (let i = 0; i < rows.length; i++) {
      cleanMin = Math.min(cleanMin, sim(rows[i].greek, rows[i].greek));
      const noisy = sim(rows[i].greek, noisyLine(rows[i].greek, rand));
      noisySum += noisy;
      noisyMin = Math.min(noisyMin, noisy);
      // "unrelated" = a far row of the same chapter (a hard case: shared prose).
      unrelSum += sim(rows[i].greek, rows[(i + 30) % rows.length].greek);
      n++;
    }
    const noisyAvg = noisySum / n;
    const unrelAvg = unrelSum / n;

    // Clean lines are identical → similarity 1 (floating-point exact to 5 dp).
    expect(cleanMin).toBeCloseTo(1, 5);
    // One-typo (orthographic noise) stays in the auto-accept band.
    expect(noisyAvg).toBeGreaterThan(0.8);
    expect(noisyMin).toBeGreaterThanOrEqual(0.55); // §5 auto-accept floor holds
    // Unrelated lines mean well below the low-confidence floor.
    expect(unrelAvg).toBeLessThan(0.15);
  });
});
