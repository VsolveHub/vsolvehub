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
 * Removes block and line comments so a rule can look at code rather than prose.
 *
 * Deliberately naive — it does not understand strings containing `//`, which is
 * fine here because it is only ever used to make a check *less* likely to fire.
 * A false negative from this would need a URL path hidden inside a string that
 * also contains a comment marker, and the checks below would still see the call.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Paths `contracts/openapi/v1.yaml` does not publish.
 *
 * Listed literally rather than derived, because the point is to notice when
 * somebody writes one down again. Delete an entry only when the generated client
 * contains the operation — at which point the call goes through the client and
 * the literal never appears in source anyway.
 */
const UNPUBLISHED_PATHS = [
  // Contract 1.6.0 published windows, the cart and the quote, so those came off
  // this list when the integration landed. What remains is the checkout
  // projection, which BE-07 has not published: `GET /checkouts/{id}/` and the
  // recovery/cancel commands the finding screen needs.
  "/api/v1/checkout-sessions/",
  //
  // Contract 1.21.0 retired the three M2 entries that stood here.
  // `/api/v1/requirements/` and `/api/v1/proposals/` are published and the
  // requirement flow now reaches the first of them through the generated client
  // (`features/requirement/queries.ts`), which is exactly the condition the note
  // above sets for deleting an entry. `/api/v1/partner/workspaces/` was never
  // this app's to call and is now not unpublished either, so the entry had
  // stopped being a rule and become a mistake — and a guard that is wrong
  // teaches people to ignore guards, which costs more than this one was worth.
  //
  // Attachment upload (`M2-BE-202`, Wave C1) is genuinely still absent and is
  // deliberately *not* listed. The two rules below already cover it better: a
  // raw `fetch` to it fails "never calls the API with a raw fetch", and the
  // generated client cannot type a call to an operation it does not contain. A
  // bare `/attachments/` entry here would instead fail the build on any comment
  // that named the path, which is how a guard starts being worked around.
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

  /**
   * The FE-09 rule that a type cannot express.
   *
   * `POST /checkouts/{checkout_id}/search/advance/` **is** published, so it
   * cannot go on the unpublished list above — the generated client will happily
   * type a call to it. It is the legacy singleton progression path, and under the
   * Booking Group model dispatch starts from a transactional outbox event and is
   * reconciled by Celery.
   *
   * Calling it from a browser would put progress back under the control of
   * whoever has a tab open: a customer who closes the page would stall their own
   * booking, and one who leaves it open would advance it faster than a Partner
   * can answer. Polling observes; it never drives. This is the assertion that
   * keeps that true after the person who knew it has moved on.
   */
  it("never advances dispatch from the browser", () => {
    const ADVANCE_PATH = "/search/advance/";

    // Comments are stripped first, unlike the unpublished-path check above. The
    // rule there is "do not even write it down", because naming an endpoint
    // Django cannot answer is how a raw fetch to it gets added later. The rule
    // here is narrower and the opposite in one respect: this path *is*
    // published, and the modules that must not call it are exactly the ones
    // that should explain why. Scanning their prose would punish the
    // documentation that keeps the rule alive.
    const offenders = productionSources
      .filter((path) => stripComments(readFileSync(path, "utf8")).includes(ADVANCE_PATH))
      .map((path) => path.replace(CUSTOMER_ROOT, "apps/customer"));

    expect(
      offenders,
      "Dispatch is owned by Celery. A browser may observe a Booking Group's " +
        "progress but must never invoke a state-advance command.",
    ).toEqual([]);
  });

  it("never calls the API with a raw fetch", () => {
    // The generated client is the only thing that may reach Django. It injects
    // its own `fetch`, so the two `lib/api/` factories are the sole legitimate
    // callers and are named explicitly rather than pattern-matched.
    const allowed = [
      "lib/api/public.ts",
      "lib/api/private.ts",
      "features/payment/view/receipt.tsx",
      "features/engagement/view/receipt-document.tsx",
    ];

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
