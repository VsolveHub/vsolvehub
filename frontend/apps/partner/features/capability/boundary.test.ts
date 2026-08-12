import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The layering rule for the M2 Partner registration surface, enforced rather
 * than documented.
 *
 * ## What this replaced
 *
 * `features/capability/contract-pending/boundary.test.ts`. That file guarded a
 * quarantine of hand-written wire types and a list of endpoint paths the
 * contract did not publish. Contract 1.22.0 published all thirteen, the
 * quarantine's own README said to delete it once that happened, and it is gone —
 * so both of its rules would now pass vacuously.
 *
 * The rule that survives is the one that mattered, re-stated the way Session A
 * re-stated the Customer app's copy: **a view component may not name the
 * generated client.** Adapters own the wire shapes; views consume view models.
 * When a field is renamed, integration is a rewrite of `adapters/` and nothing
 * else — and if a component has to change, an adapter was leaking and the leak
 * is the bug.
 *
 * The second rule is new and stronger than the list it replaces: **every
 * endpoint path a production module names must exist in the generated client.**
 * A literal list of unpublished paths could only catch the ones somebody
 * remembered to write down; this catches any of them, and it cannot rot, because
 * its source of truth is the contract itself.
 */

const APP_ROOT = join(__dirname, "..", "..");
const CAPABILITY_ROOT = __dirname;
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

const GENERATED_IMPORT = /from\s+["']@vsolve\/api-client["']/;

function viewsNaming(root: string, label: string): string[] {
  const directory = join(root, "view");
  try {
    statSync(directory);
  } catch {
    return [];
  }
  return sourceFilesUnder(directory)
    .filter((path) => !/\.(test|spec)\.tsx?$/.test(path))
    .filter((path) => GENERATED_IMPORT.test(readFileSync(path, "utf8")))
    .map((path) => path.replace(root, label));
}

describe("M2 Partner registration surface — layering", () => {
  it("keeps the generated client out of view components", () => {
    // The seam that makes a contract change a one-file re-point. A component
    // holding `Schemas["PartnerCapability"]` is a component that has to be
    // edited the next time Django renames a field.
    //
    // `capability-screens.tsx` and `crew-screens.tsx` are containers rather than
    // components, and they still obey this: they compose adapters and hooks and
    // never name a wire type.
    const offenders = [
      ...viewsNaming(CAPABILITY_ROOT, "features/capability"),
      ...viewsNaming(CREW_ROOT, "features/crew"),
    ];

    expect(
      offenders,
      "View components must consume view models from ../adapters/, not wire types.",
    ).toEqual([]);
  });

  it("has an adapter layer that does name it", () => {
    // The complement. If no adapter reads the generated client, the check above
    // is passing because nothing talks to the server at all.
    const importers = [
      ...sourceFilesUnder(join(CAPABILITY_ROOT, "adapters")),
      ...sourceFilesUnder(join(CREW_ROOT, "adapters")),
    ].filter((path) => GENERATED_IMPORT.test(readFileSync(path, "utf8")));

    expect(importers.length).toBeGreaterThan(0);
  });
});

/** Every `/api/v1/...` literal the app contains, with the file that holds it. */
function endpointLiterals(): { path: string; file: string }[] {
  const found: { path: string; file: string }[] = [];
  const pattern = /["'](\/api\/v1\/[^"'\s]*)["']/g;

  for (const file of sourceFilesUnder(join(APP_ROOT, "features"))
    .concat(sourceFilesUnder(join(APP_ROOT, "app")))
    .concat(sourceFilesUnder(join(APP_ROOT, "lib")))) {
    if (/\.(test|spec)\.tsx?$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      const path = match[1];
      if (path !== undefined) found.push({ path, file: file.replace(APP_ROOT, "") });
    }
  }

  return found;
}

describe("endpoint paths", () => {
  it("all exist in the generated contract", () => {
    // The failure this exists to prevent has happened before, in the Customer
    // app: a production bundle sent a raw request to a proposal-only path, and
    // no type check saw it because the literal never met a type. Reading the
    // generated schema is what makes this impossible to get wrong by hand — the
    // list is the contract, not a list somebody maintains beside it.
    const schema = readFileSync(
      join(APP_ROOT, "..", "..", "packages", "api-client", "src", "generated", "schema.d.ts"),
      "utf8",
    );

    const offenders = endpointLiterals()
      .filter(({ path }) => !schema.includes(`"${path}"`))
      .map(({ path, file }) => `${file} → ${path}`);

    expect(
      offenders,
      "These paths are not in contracts/openapi/v1.yaml. A request to one of them " +
        "cannot be answered.",
    ).toEqual([]);
  });

  it("finds paths at all, so the check is not vacuous", () => {
    expect(endpointLiterals().length).toBeGreaterThan(0);
  });
});
