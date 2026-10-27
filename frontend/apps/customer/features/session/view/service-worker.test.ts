import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `public/sw.js`, registered by `offline-banner.tsx`.
 *
 * Its old fetch handler re-downloaded every cached file in the background on
 * each visit and stood in front of cross-origin catalogue images it could never
 * cache. A worker with no fetch handler is skipped by the browser entirely.
 */
const source = readFileSync(
  fileURLToPath(new URL("../../../public/sw.js", import.meta.url)),
  "utf8",
);

describe("customer service worker", () => {
  it("has no fetch handler", () => {
    expect(source).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(source).not.toMatch(/\bonfetch\b/);
  });

  it("clears the caches the previous worker left behind", () => {
    expect(source).toMatch(/caches\.delete/);
    expect(source).toMatch(/clients\.claim/);
  });
});
