import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The privacy boundary, enforced rather than documented.
 *
 * **Exact address text must never reach browser storage, logs or analytics.**
 *
 * That rule is easy to state, easy to agree with, and easy to break by accident
 * six months from now — a `console.log` left in while debugging a failed save, a
 * "remember the last address" convenience in `localStorage`, an idempotency key
 * derived from the street line, a support link that carries the PIN code in a
 * query string. Every one of those is a small, reasonable-looking change, and
 * none of them would fail a test that only checked the UI.
 *
 * So the rule is checked against the source itself, the same way
 * `contract-pending/boundary.test.ts` checks that unpublished paths stay out of
 * production code. A comment asking people to remember would be worth roughly
 * nothing.
 */

const ADDRESSES_ROOT = __dirname;
const ACCOUNT_ROOT = join(__dirname, "..", "account");
const ACCOUNT_ROUTES = join(__dirname, "..", "..", "app", "(flow)", "account");

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "dist", ".turbo"]);

function sourceFilesUnder(directory: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      entries.push(...sourceFilesUnder(path));
    } else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      entries.push(path);
    }
  }
  return entries;
}

/**
 * Removes comments so the rules look at code rather than prose.
 *
 * These modules discuss `localStorage` and `console` at length in their own
 * documentation — explaining exactly why they do not use them — and a check that
 * read those comments would fail on the files that are most careful.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Removes single- and double-quoted literals so the log rule reads identifiers.
 *
 * `console.error("[account-error-boundary]", ...)` contains the word `error`
 * inside its own tag, and a scan that counted it would fail the file that logs
 * correctly. A quoted literal is a source constant — it cannot carry a street.
 *
 * Template literals are deliberately left alone: `${error.message}` inside one
 * is live code and is exactly the leak this rule exists to catch.
 */
function stripQuotedStrings(source: string): string {
  return source.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
}

function relative(path: string): string {
  return path.slice(path.indexOf("apps")).replace(/\\/g, "/");
}

const FEATURE_FILES = [
  ...sourceFilesUnder(ADDRESSES_ROOT),
  ...sourceFilesUnder(ACCOUNT_ROOT),
];

const ROUTE_FILES = sourceFilesUnder(ACCOUNT_ROUTES);

describe("address text never reaches browser storage", () => {
  /**
   * Any persistent client-side store. The query cache is deliberately not one of
   * these: `makeQueryClient` configures no persister, so it lives in memory for
   * the life of the tab and is dropped by `gcTime` when the screen closes.
   */
  const STORAGE_SINKS = [
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bdocument\s*\.\s*cookie\b/,
    /\bcaches\s*\.\s*open\b/,
  ];

  it.each([...FEATURE_FILES, ...ROUTE_FILES].map((path) => [relative(path), path]))(
    "%s writes to no client-side store",
    (_name, path) => {
      const source = stripComments(readFileSync(path, "utf8"));
      for (const sink of STORAGE_SINKS) {
        expect(source).not.toMatch(sink);
      }
    },
  );

  /**
   * `getStableIdempotencyKey` persists its keys in `sessionStorage`.
   *
   * Deriving one from address fields — a plausible thing to reach for when
   * making a save retry-safe — would write the customer's street into storage in
   * the course of protecting the request. The address endpoints ask for no
   * idempotency key, so there is no reason to import it here at all.
   */
  it.each(FEATURE_FILES.map((path) => [relative(path), path]))(
    "%s derives no idempotency key",
    (_name, path) => {
      const source = stripComments(readFileSync(path, "utf8"));
      expect(source).not.toMatch(/getStableIdempotencyKey/);
    },
  );
});

describe("address text never reaches logs", () => {
  it.each(FEATURE_FILES.map((path) => [relative(path), path]))(
    "%s logs nothing",
    (_name, path) => {
      const source = stripComments(readFileSync(path, "utf8"));
      // Blanket ban inside the features. A failed address save is reported to
      // the customer through `describeError`, and the thrown error carries the
      // request body — so there is no such thing as a safe `console.log` of it.
      expect(source).not.toMatch(/\bconsole\s*\.\s*\w+\s*\(/);
    },
  );

  /**
   * The route-level error boundary is the one place a `console` call belongs,
   * and the one place it is most dangerous.
   *
   * Next.js hands the boundary an `Error` that, for a failed address mutation,
   * can carry the request body. `/bookings/error.tsx` logs the whole object,
   * which is right for booking ids and wrong for somebody's street — so this
   * tree logs the digest alone. The digest is Next.js's own correlation id and
   * is enough to find the real stack in server logs.
   */
  it.each(ROUTE_FILES.map((path) => [relative(path), path]))(
    "%s logs only a digest, never the error",
    (_name, path) => {
      const source = stripComments(readFileSync(path, "utf8"));
      const calls = [...source.matchAll(/\bconsole\s*\.\s*\w+\s*\(([^;]*?)\)\s*;/gs)];

      for (const [, argumentList] of calls) {
        // Only the arguments are scanned, and only the code in them. Reading
        // the whole call would count `console.error`'s own name; reading the
        // quoted tags would count `"[account-error-boundary]"`. Either one
        // fails the file that logs correctly, which is the opposite of a guard.
        //
        // Every mention of `error` must be `error.digest`. A bare `error`, or
        // any other property of it, is the whole object's worth of risk.
        const mentions = stripQuotedStrings(argumentList).match(/\berror\b(\s*\.\s*\w+)?/g) ?? [];
        for (const mention of mentions) {
          expect(mention.replace(/\s+/g, "")).toBe("error.digest");
        }
      }
    },
  );
});

describe("address text never reaches a URL", () => {
  /**
   * Addresses are addressed by id, never by content.
   *
   * A query string is copied into browser history, sent as a `Referer` to any
   * third party the next page talks to, and captured by every analytics script
   * on the page. Putting a PIN code or a street line in one leaks it to places
   * this app does not control, which is why the row actions carry `address.id`
   * and the confirmation dialog reads the text from the in-memory cache.
   */
  const ADDRESS_FIELDS = [
    "line1",
    "line2",
    "landmark",
    "locality",
    "postal_code",
    "formatted_address",
  ];

  const URL_BUILDERS =
    /(URLSearchParams|searchParams\s*\.\s*set|router\s*\.\s*(push|replace)|href\s*=|encodeURIComponent)/;

  it.each([...FEATURE_FILES, ...ROUTE_FILES].map((path) => [relative(path), path]))(
    "%s builds no URL out of address fields",
    (_name, path) => {
      const source = stripComments(readFileSync(path, "utf8"));

      for (const line of source.split("\n")) {
        if (!URL_BUILDERS.test(line)) continue;
        for (const field of ADDRESS_FIELDS) {
          expect(
            line.includes(field),
            `"${field}" appears in a URL-building expression: ${line.trim()}`,
          ).toBe(false);
        }
      }
    },
  );
});

describe("the boundary test is actually looking at something", () => {
  /**
   * A scanner that silently found no files would pass every rule above.
   *
   * This is the check that the checks are running — the same reason a regression
   * test is verified red before it is trusted green.
   */
  it("scans the address and account features", () => {
    expect(FEATURE_FILES.length).toBeGreaterThanOrEqual(6);
    expect(ROUTE_FILES.length).toBeGreaterThanOrEqual(4);
  });

  it("scans the files that actually hold address text", () => {
    const scanned = FEATURE_FILES.map(relative);
    expect(scanned).toContain("apps/customer/features/addresses/queries.ts");
    expect(scanned).toContain("apps/customer/features/addresses/view/address-book.tsx");
    expect(scanned).toContain("apps/customer/features/addresses/view/address-form.tsx");
  });
});
