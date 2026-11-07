// Ported from frontend/apps/partner/features/enquiry/contact-boundary.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Two rules the enquiry surface turns on, enforced rather than documented.
 *
 * ## 1. No customer identity or contact
 *
 * This is the enforceable half of `M2-FE-307`. The task asks for consent before
 * contact disclosure and for cached contact never to survive a revocation — and
 * The exact site destination now has one purpose-bound disclosure: a paid,
 * scheduled project visit. Customer name, phone and email still never enter the
 * enquiry or proposal surface, and the address projection contains none of
 * them. The enquiry list continues to receive only a locality label.
 *
 * That makes the requirement a *negative* one, and a negative requirement is
 * exactly the kind that rots quietly. A component test proves today's render;
 * this proves nobody added a field that would change it. When a disclosure
 * endpoint does land, this file is what makes somebody decide deliberately
 * rather than by autocomplete.
 *
 * ## 2. Fixtures stay in tests
 *
 * `fixtures.ts` exists so tests can prove the app handles real shapes. A
 * production module importing it would be the placeholder data the M2 rules
 * ban, arriving through the one door left open.
 */

const ENQUIRY_ROOT = __dirname;
const PROPOSAL_ROOT = join(__dirname, "..", "proposal");

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

function isFixture(path: string): boolean {
  return /[/\\]fixtures\.ts$/.test(path);
}

/** Production modules only — tests and the fixture module are design inputs. */
function productionFiles(): string[] {
  return [...sourceFilesUnder(ENQUIRY_ROOT), ...sourceFilesUnder(PROPOSAL_ROOT)].filter(
    (path) => !isTest(path) && !isFixture(path),
  );
}

/**
 * Field names that would only appear if somebody started reading customer
 * identity off a payload.
 *
 * Listed literally rather than matched loosely: the point is to notice when one
 * is written down, and a fuzzy pattern that fires on `phone_verified` in an
 * unrelated file is a pattern people learn to disable.
 */
const CONTACT_FIELDS = [
  "customer_phone",
  "customer_name",
  "customer_email",
  "customer_address",
  "contact_phone",
  "contact_number",
  "phone_number",
  "masked_phone",
];

/**
 * The deliberate exception this file's docblock promised would be decided
 * deliberately: contract 1.52.0's visit-day contact rung (owner decision,
 * 2026-09-01). `customer_name` discloses with the site address on a paid,
 * scheduled visit; `customer_phone` only from two hours before the slot until
 * completion. The transport module may name exactly those two fields; every
 * other module, and every other field, stays banned.
 */
const VISIT_DAY_RUNG = {
  module: /[/\\]enquiry[/\\]model[/\\]wire\.ts$/,
  fields: new Set(["customer_name", "customer_phone"]),
};

describe("customer identity and contact never enter the enquiry surface", () => {
  it("names no contact field in any production module", () => {
    const offenders: string[] = [];

    for (const path of productionFiles()) {
      const source = readFileSync(path, "utf8");
      for (const field of CONTACT_FIELDS) {
        if (VISIT_DAY_RUNG.module.test(path) && VISIT_DAY_RUNG.fields.has(field)) continue;
        if (source.includes(field)) {
          offenders.push(`${path.replace(/\\/g, "/")} references ${field}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("checks a non-empty set of files, so the assertion above cannot pass vacuously", () => {
    // The failure this prevents: a directory rename leaves both roots empty and
    // the rule above passes forever while enforcing nothing.
    expect(productionFiles().length).toBeGreaterThan(10);
  });
});

describe("fixtures stay in tests", () => {
  it("is imported by no production module", () => {
    const offenders = productionFiles().filter((path) =>
      /from\s+["'][^"']*fixtures["']/.test(readFileSync(path, "utf8")),
    );

    expect(offenders.map((path) => path.replace(/\\/g, "/"))).toEqual([]);
  });
});

describe("unpublished endpoints are not named in source", () => {
  /**
   * The two commands this wave needs and the contract does not publish.
   *
   * `schedule_site_visit` and `complete_site_visit` exist in
   * `apps/requirements/proposals.py` with no route, and there is no read for a
   * Partner's own proposals. A path literal appearing here would mean somebody
   * started calling one outside the generated client.
   */
  const UNPUBLISHED_PATHS = [
    "/api/v1/partner/enquiries/{invitation_id}/site-visits/{site_visit_id}/",
    // `/api/v1/proposals/?` left this list at 1.24.0: `m2_proposal_list` published the
    // vendor's own quotes, which is exactly the read this guard was waiting on.
    "/api/v1/partner/wage-floor/",
  ];

  it("names none of them", () => {
    const offenders: string[] = [];

    for (const path of productionFiles()) {
      const source = readFileSync(path, "utf8");
      for (const endpoint of UNPUBLISHED_PATHS) {
        if (source.includes(endpoint)) {
          offenders.push(`${path.replace(/\\/g, "/")} calls ${endpoint}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
