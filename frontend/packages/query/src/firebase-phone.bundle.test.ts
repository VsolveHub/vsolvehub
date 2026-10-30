import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The phone flow is mounted by every customer page's header, so anything it
 * imports statically ships on every page. A value import of the Firebase SDK
 * put ~150 KB of script on the home page for visitors who never log in.
 */
describe("firebase-phone bundle boundary", () => {
  it("imports the Firebase SDK only dynamically", () => {
    const source = readFileSync(fileURLToPath(new URL("./firebase-phone.ts", import.meta.url)), "utf8");

    const staticImports = source.match(/^import\s+(?!type\b)[^;]*?from\s+["']firebase\//gm);
    expect(staticImports).toBeNull();
    expect(source).toContain('import("firebase/auth")');
  });
});
