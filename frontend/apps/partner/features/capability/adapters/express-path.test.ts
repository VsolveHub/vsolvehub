import { createTranslator } from "@vsolve/ui";
import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  DEMAND_HREF,
  EXPRESS_PATH,
  MAX_STEPS_TO_DEMAND,
  canSeeDemand,
  describeExpressPath,
  expressDestination,
  nextExpressStep,
  stepsRemaining,
  type ExpressProgress,
} from "./express-path";
import { catalogs } from "@/i18n/catalogs";

const t = createTranslator("en-IN", catalogs["en-IN"]).t;

/**
 * The flow-weight budget, enforced rather than written down.
 *
 * `03-frontend-tasks.md` fixes the Partner path to phone, name, one service, one
 * city. A budget nobody can fail is a preference, so the count is asserted here
 * and a fifth screen has to be an argument somebody makes rather than a file
 * somebody adds.
 */

type Application = Schemas["PartnerApplication"];

/** A minimal application. Test-only — nothing in application code holds one. */
function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    partner_id: "p-1",
    status: "DRAFT",
    version: 1,
    display_name: "",
    biography: "",
    experience_years: 0,
    skill_codes: [],
    service_variant_ids: [],
    service_area_ids: [],
    change_request_message: "",
    submitted_at: null,
    review_assigned_to_id: null,
    review_assigned_at: null,
    reviewed_at: null,
    consents: [],
    documents: [],
    transitions: [],
    created_at: "2026-08-11T09:00:00Z",
    updated_at: "2026-08-11T09:00:00Z",
    ...overrides,
  } as Application;
}

const NOBODY: ExpressProgress = { hasPhone: false, application: null, businessProfile: null };

const READY: ExpressProgress = {
  hasPhone: true,
  application: application({
    display_name: "Ramesh Kumar",
    service_variant_ids: ["v1"],
    service_area_ids: ["a1"],
  }),
  businessProfile: null,
};

describe("the budget", () => {
  it("is four steps to a real lead", () => {
    expect(EXPRESS_PATH).toHaveLength(MAX_STEPS_TO_DEMAND);
    expect(MAX_STEPS_TO_DEMAND).toBe(4);
  });

  it("asks for phone, name, one service and one city — and nothing else", () => {
    expect(EXPRESS_PATH.map((step) => step.key)).toEqual([
      "PHONE",
      "IDENTITY",
      "SERVICE",
      "AREA",
    ]);
  });

  it("does not spend a step on business type", () => {
    // `M2-FE-103` puts business type on the entry path and the budget has no
    // room for a screen of its own. It rides on the identity step, beside the
    // name field.
    expect(EXPRESS_PATH.some((step) => step.href.includes("business"))).toBe(false);
  });

  it("does not ask for documents, agreements or hours before demand", () => {
    // The whole point of `FLOW-06`. These are the M1 steps deferred to the
    // moment they become necessary.
    const hrefs = EXPRESS_PATH.map((step) => step.href);
    expect(hrefs).not.toContain("/apply/documents");
    expect(hrefs).not.toContain("/apply/consent");
    expect(hrefs).not.toContain("/apply/schedule");
  });
});

describe("progress", () => {
  it("starts at the phone for someone brand new", () => {
    expect(nextExpressStep(NOBODY)?.key).toBe("PHONE");
    expect(stepsRemaining(NOBODY)).toBe(4);
    expect(canSeeDemand(NOBODY)).toBe(false);
  });

  it("reaches demand once all four are done", () => {
    expect(nextExpressStep(READY)).toBeNull();
    expect(canSeeDemand(READY)).toBe(true);
    expect(expressDestination(READY)).toBe(DEMAND_HREF);
  });

  it("counts a whitespace-only name as not given", () => {
    const progress: ExpressProgress = {
      ...READY,
      application: application({ ...READY.application!, display_name: "   " }),
    };
    expect(nextExpressStep(progress)?.key).toBe("IDENTITY");
  });

  it("is satisfied by exactly one service and one city", () => {
    // Not the full submission checklist. Deferring skills, documents and
    // consents is the point; reusing `readiness.ts` here would rebuild the long
    // path under a short name.
    expect(canSeeDemand(READY)).toBe(true);
    expect(READY.application?.skill_codes).toEqual([]);
    expect(READY.application?.documents).toEqual([]);
  });

  it("does not require an explicit business type", () => {
    // The server defaults to INDIVIDUAL, so someone who skipped the radio group
    // already has an answer. Blocking on it would add back the step this design
    // removed.
    expect(READY.businessProfile).toBeNull();
    expect(canSeeDemand(READY)).toBe(true);
  });
});

describe("resuming", () => {
  it("returns to the first gap rather than the furthest step reached", () => {
    // Someone who filled in a later screen and lost an earlier one is sent back
    // to the gap, not forward to a dead end.
    const progress: ExpressProgress = {
      hasPhone: true,
      application: application({ display_name: "", service_area_ids: ["a1"] }),
      businessProfile: null,
    };

    expect(nextExpressStep(progress)?.key).toBe("IDENTITY");
  });

  it("reads progress from the server record and holds nothing locally", () => {
    // What makes the path resumable on a new device after a dropped connection.
    // The same input always produces the same destination.
    expect(expressDestination(NOBODY)).toBe(expressDestination({ ...NOBODY }));
  });
});

describe("the view model", () => {
  it("marks exactly one step as current", () => {
    const view = describeExpressPath({ ...NOBODY, hasPhone: true }, t);
    expect(view.steps.filter((step) => step.isCurrent)).toHaveLength(1);
    expect(view.steps.find((step) => step.isCurrent)?.key).toBe("IDENTITY");
  });

  it("marks no step current once demand is reachable", () => {
    const view = describeExpressPath(READY, t);
    expect(view.steps.every((step) => step.isComplete)).toBe(true);
    expect(view.steps.some((step) => step.isCurrent)).toBe(false);
    expect(view.canSeeDemand).toBe(true);
  });

  it("agrees with the destination the button uses", () => {
    // One answer, three callers. The M1 bug this replaces was a "continue"
    // button that did not continue, because the nav held the order and the
    // editor held none.
    const view = describeExpressPath({ ...NOBODY, hasPhone: true }, t);
    expect(view.destination).toBe(expressDestination({ ...NOBODY, hasPhone: true }));
  });
});
