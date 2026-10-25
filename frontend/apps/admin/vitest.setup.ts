import "@testing-library/jest-dom/vitest";

/**
 * DOM matchers and browser API stubs for the Admin (Operations) app.
 *
 * Recharts ResponsiveContainer and scroll navigation rely on ResizeObserver
 * and Element.prototype.scrollIntoView which are not implemented in JSDOM.
 */
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
