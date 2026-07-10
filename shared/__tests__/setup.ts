import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: IntersectionObserverMock,
});

Element.prototype.scrollIntoView = vi.fn();

// happy-dom does not implement the Web Animations API; components that call
// `element.animate(...)` (e.g. WordPopup) would throw. Stub a minimal
// Animation-like object so those code paths run under test.
Element.prototype.animate = vi.fn(() => ({
  finished: Promise.resolve(),
  cancel() {},
  finish() {},
  play() {},
  pause() {},
  onfinish: null,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as Element['animate'];
