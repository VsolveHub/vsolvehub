import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The quarantine boundary, enforced rather than documented.
 *
 * `contract-pending/` describes endpoints that do not exist. Components must not
 * see those shapes, or the integration when Codex publishes the real contract
 * stops being "rewrite the adapters" and becomes "rewrite the feature".
 *
 * A comment asking people to remember this would be worth roughly nothing six
 * weeks from now, which is the same reasoning that put the public catalog client
 * in its own module without `next/headers` rather than trusting a note.
 */

const BOOKING_ROOT = join(__dirname, "..");

function sourceFilesUnder(directory: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      entries.push(...sourceFilesUnder(path));
    } else if (/\.tsx?$/.test(name)) {
      entries.push(path);
    }
  }
  return entries;
}

/** Matches any import whose specifier mentions the quarantine directory. */
const PENDING_IMPORT = /from\s+["'][^"']*contract-pending[^"']*["']/;

describe("contract-pending import boundary", () => {
  it("is not imported by any view component", () => {
    const offenders = sourceFilesUnder(join(BOOKING_ROOT, "view"))
      .filter((path) => PENDING_IMPORT.test(readFileSync(path, "utf8")))
      .map((path) => path.replace(BOOKING_ROOT, "features/booking"));

    expect(
      offenders,
      "View components must consume view models from ../adapters/. " +
        "See features/booking/contract-pending/README.md.",
    ).toEqual([]);
  });

  it("is not imported by the model layer", () => {
    // The reducer stores references and verdicts, never server payloads, so it
    // has no reason to know these shapes. The one exception is the
    // `FulfilmentType` union, which is a domain enum rather than a response
    // shape — it is allowed and checked for explicitly below.
    const offenders = sourceFilesUnder(join(BOOKING_ROOT, "model"))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        if (!PENDING_IMPORT.test(source)) return false;
        // A type-only import of FulfilmentType is permitted.
        return !/import\s+type\s+\{\s*FulfilmentType\s*\}\s+from\s+["'][^"']*contract-pending/.test(
          source,
        );
      })
      .map((path) => path.replace(BOOKING_ROOT, "features/booking"));

    expect(offenders).toEqual([]);
  });

  it("has an adapter layer that does import it", () => {
    // The complement of the rule. If no adapter references the quarantine, the
    // types are dead and the boundary tests above are passing vacuously.
    const importers = sourceFilesUnder(join(BOOKING_ROOT, "adapters")).filter((path) =>
      PENDING_IMPORT.test(readFileSync(path, "utf8")),
    );

    expect(importers.length).toBeGreaterThan(0);
  });
});
