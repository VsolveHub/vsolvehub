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
const CUSTOMER_ROOT = join(__dirname, "..", "..", "..");

/** Build output and dependencies are not this app's source, and walking them is slow. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "dist", ".turbo"]);

function sourceFilesUnder(directory: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      entries.push(...sourceFilesUnder(path));
    } else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) {
      entries.push(path);
    }
  }
  return entries;
}

/** Matches any import whose specifier mentions the quarantine directory. */
const PENDING_IMPORT = /from\s+["'][^"']*contract-pending[^"']*["']/;

/**
 * Paths `contracts/openapi/v1.yaml` does not publish.
 *
 * Listed literally rather than derived, because the point is to notice when
 * somebody writes one down again. Delete an entry only when the generated client
 * contains the operation — at which point the call goes through the client and
 * the literal never appears in source anyway.
 */
const UNPUBLISHED_PATHS = [
  "/api/v1/booking/windows/",
  "/api/v1/quotes/",
  "/api/v1/checkout-sessions/",
  "/api/v1/checkouts/",
  "/api/v1/carts/",
];

/**
 * Directories whose job is to describe endpoints that do not exist: the type
 * quarantine itself, and the MSW handlers built from it. Everything else in the
 * Customer app is production source or a test of production source.
 */
const DESIGN_INPUT_DIRECTORIES = ["contract-pending"];

function isDesignInput(path: string): boolean {
  const normalised = path.replace(/\\/g, "/");
  return (
    DESIGN_INPUT_DIRECTORIES.some((directory) => normalised.includes(`/${directory}/`)) ||
    /\.(test|spec)\.tsx?$/.test(normalised) ||
    normalised.includes("/view-fixtures.")
  );
}

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

/**
 * The rule the type quarantine could not enforce on its own.
 *
 * Keeping a guessed *shape* out of the components was never the whole risk. The
 * booking workspace still shipped a raw `fetch` to a proposal-only path, so a
 * production bundle sent a request Django has never been able to answer. The
 * customer saw "we could not load arrival windows", which reads as "there is no
 * availability" — a claim about capacity that nobody made.
 *
 * Types are a design input. A request is a promise.
 */
describe("unpublished endpoints stay out of production", () => {
  const productionSources = sourceFilesUnder(CUSTOMER_ROOT).filter(
    (path) => !isDesignInput(path),
  );

  it("has production sources to check", () => {
    // Guards against the glob silently matching nothing and passing vacuously.
    expect(productionSources.length).toBeGreaterThan(10);
  });

  it("never names a path the contract does not publish", () => {
    const offenders = productionSources
      .map((path) => ({ path, source: readFileSync(path, "utf8") }))
      .flatMap(({ path, source }) =>
        UNPUBLISHED_PATHS.filter((endpoint) => source.includes(endpoint)).map(
          (endpoint) => `${path.replace(CUSTOMER_ROOT, "apps/customer")} -> ${endpoint}`,
        ),
      );

    expect(
      offenders,
      "A production module names an endpoint that contracts/openapi/v1.yaml does not " +
        "publish. Render an honest unavailable boundary instead, and integrate only " +
        "after the generated client contains the operation.",
    ).toEqual([]);
  });

  it("never calls the API with a raw fetch", () => {
    // The generated client is the only thing that may reach Django. It injects
    // its own `fetch`, so the two `lib/api/` factories are the sole legitimate
    // callers and are named explicitly rather than pattern-matched.
    const allowed = ["lib/api/public.ts", "lib/api/private.ts"];

    const offenders = productionSources
      .filter((path) => {
        const normalised = path.replace(/\\/g, "/");
        if (allowed.some((suffix) => normalised.endsWith(suffix))) return false;
        return /\bfetch\s*\(\s*`?["`]?\$?\{?[^)]*\/api\//.test(readFileSync(path, "utf8"));
      })
      .map((path) => path.replace(CUSTOMER_ROOT, "apps/customer"));

    expect(offenders).toEqual([]);
  });
});
