import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The requirement feature's layering, enforced rather than documented.
 *
 * ## What replaced the quarantine, and why
 *
 * This file used to live at `contract-pending/boundary.test.ts` and assert that
 * nothing outside `adapters/` imported the hand-written wire types. Contract
 * 1.21.0 published the requirement surface, the adapters were re-pointed at the
 * generated client, and `contract-pending/README.md`'s own deletion instructions
 * ended with "delete this directory" — so it is gone.
 *
 * The rule it protected is not. It was never really about *unpublished* types:
 * it was about the wire shape reaching a component, so that changing the wire
 * means changing one adapter rather than four screens. That property is worth
 * exactly as much now the endpoint exists, and it is easier to break now,
 * because the wire types are two imports away in every file rather than behind
 * a directory named after a warning.
 *
 * So the check moved with the boundary: `view/` and `model/` may not name the
 * generated client at all, through either package that exposes it.
 */

const FEATURE_ROOT = __dirname;

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

function isTest(path: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(path.replace(/\\/g, "/"));
}

/** Any import from the generated-client package, type-only or otherwise. */
const API_CLIENT_IMPORT = /from\s+["']@vsolve\/api-client["']/;

/**
 * The wire type aliases `@vsolve/query` re-exports for this feature.
 *
 * Listed by name rather than matched loosely, because `@vsolve/query` is also
 * where `describeError`, `useServerCountdown` and the error layer live — all of
 * which the screens legitimately import. The rule is "no wire shapes", not "no
 * query package".
 */
const WIRE_TYPE_NAMES = [
  "RequirementDraft",
  "RequirementSummary",
  "RequirementSubmitted",
  "RequirementTimeline",
  "RequirementTimelineEvent",
  "RequirementAttachment",
  "ProbableDuplicate",
];

describe("requirement wire-shape boundary", () => {
  const layers = ["view", "model"] as const;

  it("has sources in both layers to check", () => {
    // Guards against a rename silently turning every rule below into a pass
    // over an empty list.
    for (const layer of layers) {
      expect(sourceFilesUnder(join(FEATURE_ROOT, layer)).length, layer).toBeGreaterThan(3);
    }
  });

  it("never imports the generated client into a view or the model", () => {
    const offenders = layers
      .flatMap((layer) => sourceFilesUnder(join(FEATURE_ROOT, layer)))
      .filter((path) => !isTest(path))
      .filter((path) => API_CLIENT_IMPORT.test(readFileSync(path, "utf8")))
      .map((path) =>
        path.replace(/\\/g, "/").replace(FEATURE_ROOT.replace(/\\/g, "/"), "features/requirement"),
      );

    expect(
      offenders,
      "Components and the reducer consume view models from ../adapters/. " +
        "A wire shape reaching them turns the next contract change into a rewrite.",
    ).toEqual([]);
  });

  it("never re-imports a wire shape through @vsolve/query either", () => {
    // The back door the package barrel opened when `m2-requirement.ts` started
    // re-exporting the generated aliases. Same rule, second spelling.
    const offenders = layers
      .flatMap((layer) => sourceFilesUnder(join(FEATURE_ROOT, layer)))
      .filter((path) => !isTest(path))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        const imports = source.match(/import[\s\S]*?from\s+["']@vsolve\/query["']/g) ?? [];
        return WIRE_TYPE_NAMES.filter((name) =>
          imports.some((clause) => new RegExp(`\\b${name}\\b`).test(clause)),
        ).map((name) => `${path.replace(FEATURE_ROOT, "features/requirement")} -> ${name}`);
      });

    expect(offenders).toEqual([]);
  });

  it("has an adapter layer that does import the generated client", () => {
    // The complement of the rule. If no adapter names the wire, the mapping
    // lives somewhere else and the two checks above are passing vacuously.
    const importers = sourceFilesUnder(join(FEATURE_ROOT, "adapters")).filter(
      (path) => !isTest(path) && API_CLIENT_IMPORT.test(readFileSync(path, "utf8")),
    );

    expect(importers.length).toBeGreaterThan(0);
  });

  it("keeps the three-screen budget", () => {
    // What needs doing, Where and when, Choose visits & send.
    const screens = readFileSync(join(FEATURE_ROOT, "model", "screens.ts"), "utf8");
    const sequence = /export const SCREENS = \[([\s\S]*?)\] as const;/.exec(screens);

    expect(sequence, "SCREENS must stay a literal array so this rule can read it").not.toBeNull();

    const count = (sequence?.[1] ?? "").split(",").filter((entry) => entry.trim().length > 0).length;
    expect(count, "The requirement flow is budgeted at three screens.").toBe(3);
  });
});
