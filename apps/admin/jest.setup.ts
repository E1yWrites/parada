import "@testing-library/jest-dom";

// Polyfill for ResizeObserver (used by some UI libs) if needed.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not implement window.matchMedia.
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom does not implement scrollTo.
if (typeof window !== "undefined" && typeof window.scrollTo === "undefined") {
  window.scrollTo = () => {};
}
