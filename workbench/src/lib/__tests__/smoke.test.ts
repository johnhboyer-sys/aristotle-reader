import { describe, expect, it } from 'vitest';
import { isTauri, runtimeHost } from '../runtime';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('detects the browser runtime outside Tauri', () => {
    expect(isTauri()).toBe(false);
    expect(runtimeHost()).toBe('browser');
  });
});
