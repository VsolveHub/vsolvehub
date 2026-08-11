import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The quarantine boundary for the M2 Partner surface, enforced rather than
 * documented.
 *
 * Same rule and same shape as the Customer app's two copies, deliberately not
 * generalised into a shared helper. A shared version would need to be told which
 * feature it is checking, and the parameter is the thing people forget to add
 * when they create the fourth quarantine.
 *
 * This file carries both halves of the rule, because the Partner app has no
 * app-wide copy of its own: the layering check (only adapters may know these
 * shapes) and the endpoint check (no production module may name a path the
 * contract does not publish).
 */

const APP_ROOT = join(__dirname, "..", "..", "..");
const CAPABILITY_ROOT = join(__dirname, "..");
const CREW_ROOT = join(APP_ROOT, "features", "crew");

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

const PENDING_IMPORT = /from\s+["'][^"']*contract-pending[^"']*["']/;

function offendersUnder(root: string, subdirectory: string, label: string): string[] {
  const directory = join(root, subdirectory);
  try {
    statSync(directory);
  } catch {
    // A feature that has not grown this layer yet is not an offender. The
    // "adapters do import it" check below is what stops the whole file passing
    // vacuously.
    return [];
  }
  return sourceFilesUnder(directory)
    .filter((path) => PENDING_IMPORT.test(readFileSync(path, "utf8")))
    .map((path) => path.replace(root, label));
}

/**
 * Endpoint paths this app's screens are built against and the contract does not
 * publish.
 *
 * Listed literally rather than derived, because the point is to notice when
 * somebody writes one down again. Delete an entry only when the generated client
 * contains the operation — at which point the call goes through the client and
 * the literal never appears in source anyway.
 */
const UNPUBLISHED_PATHS = [
  // `/api/v1/partner/workspaces/` was here until contract 1.21.0 published it.
  // Removed under this file's own rule — the generated client carries the
  // operation now, so `features/workspace/queries.ts` calls it through the typed
  // client and the path is checked by the compiler rather than by this list.
  //
  // Proposal 0013 — the whole Partner capability, gate and crew surface.
  "/api/v1/partner/business-profile/",
  "/api/v1/partner/capability-options/",
  "/api/v1/partner/capabilities/",
  "/api/v1/partner/insurance/",
  "/api/v1/partner/gates/",
  "/api/v1/partner/demand-preview/",
  "/api/v1/partner/crew/",
];

/**
 * Directories whose job is to describe endpoints that do not exist.
 *
 * The quarantine itself, plus tests — a test may name a path precisely so it can
 * assert the app does not call it.
 */
function isDesignInput(path: string): boolean {
  const normalised = path.replace(/\\/g, "/");
  return (
    normalised.includes("/contract-pending/") || /\.(test|spec)\.tsx?$/.test(normalised)
  );
}

describe("M2 Partner contract-pending import boundary", () => {
  it("is not imported by any view component", () => {
    const offenders = [
      ...offendersUnder(CAPABILITY_ROOT, "view", "features/capability"),
      ...offendersUnder(CREW_ROOT, "view", "features/crew"),
    ];

    expect(
      offenders,
      "View components must consume view models from ../adapters/. " +
        "See features/capability/contract-pending/README.md.",
    ).toEqual([]);
  });

  it("is not imported by the workspace model layer", () => {
    // `session-guard.ts` reads `WorkspaceGrant`, which `@vsolve/query` publishes
    // as a real parsed type. It has no reason to know an unpublished shape, and
    // if it grew one the navigation would start depending on the contract
    // landing.
    const offenders = offendersUnder(
      join(APP_ROOT, "features", "workspace"),
      "model",
      "features/workspace",
    );

    expect(offenders).toEqual([]);
  });

  it("is not imported by any route", () => {
    // The strongest form of the rule. A route importing these types is a live
    // link to a screen whose endpoint does not exist.
    const offenders = offendersUnder(APP_ROOT, "app", "app");

    expect(offenders).toEqual([]);
  });

  it("has an adapter layer that does import it", () => {
    // The complement of the rule. If no adapter references the quarantine, the
    // types are dead and every check above is passing vacuously.
    const importers = [
      ...sourceFilesUnder(join(CAPABILITY_ROOT, "adapters")),
      ...sourceFilesUnder(join(CREW_ROOT, "adapters")),
    ].filter((path) => PENDING_IMPORT.test(readFileSync(path, "utf8")));

    expect(importers.length).toBeGreaterThan(0);
  });
});

describe("unpublished endpoint paths", () => {
  it("appear in no production module", () => {
    // Keeping a guessed *shape* out of the components was never the whole risk.
    // The Customer app still shipped a raw `fetch` to a proposal-only path, so a
    // production bundle sent a request Django has never been able to answer. A
    // type quarantine cannot see a string literal; this can.
    const offenders: string[] = [];

    for (const path of sourceFilesUnder(join(APP_ROOT, "features"))
      .concat(sourceFilesUnder(join(APP_ROOT, "app")))
      .concat(sourceFilesUnder(join(APP_ROOT, "lib")))) {
      if (isDesignInput(path)) continue;
      const source = readFileSync(path, "utf8");
      for (const endpoint of UNPUBLISHED_PATHS) {
        if (source.includes(`"${endpoint}"`) || source.includes(`'${endpoint}'`)) {
          offenders.push(`${path.replace(APP_ROOT, "")} → ${endpoint}`);
        }
      }
    }

    expect(
      offenders,
      "These paths are not in contracts/openapi/v1.yaml. A request to one of them " +
        "cannot be answered. See features/capability/contract-pending/README.md.",
    ).toEqual([]);
  });
});
