import { describe, expect, it } from "vitest";

import {
  APPLICATION_STEPS,
  applicationSteps,
  isLastStep,
  nextStep,
  stepIndexOf,
} from "./steps";

/**
 * The step sequence, and the two bugs it exists to prevent.
 *
 * "Save and continue" saved and did not continue, because nothing outside the
 * navigation knew what came next. And the navigation marked no current step, so
 * an applicant could not tell whether a press had moved them. Both were a single
 * missing idea — an ordered list anything could ask.
 */

describe("finding the current step", () => {
  it("matches each step exactly", () => {
    expect(stepIndexOf("/apply")).toBe(0);
    expect(stepIndexOf("/apply/about")).toBe(1);
    expect(stepIndexOf("/apply/review")).toBe(APPLICATION_STEPS.length - 1);
  });

  it("does not let the overview claim every step", () => {
    // `/apply` is a prefix of all of them, so a `startsWith` check would report
    // the overview as current on every page — which is how a nav ends up
    // highlighting the wrong tab everywhere.
    expect(stepIndexOf("/apply/work")).not.toBe(stepIndexOf("/apply"));
    expect(stepIndexOf("/apply/consent")).toBe(4);
  });

  it("tolerates the trailing slash Next can produce", () => {
    expect(stepIndexOf("/apply/about/")).toBe(stepIndexOf("/apply/about"));
    expect(stepIndexOf("/apply/")).toBe(0);
  });

  it("reports -1 for a path outside the sequence", () => {
    expect(stepIndexOf("/offers")).toBe(-1);
    expect(stepIndexOf("/apply/not-a-step")).toBe(-1);
  });
});

describe("what comes next", () => {
  it("walks the whole sequence in order", () => {
    const visited: string[] = ["/apply"];
    let current = nextStep("/apply");
    while (current !== null) {
      visited.push(current.href);
      current = nextStep(current.href);
    }

    expect(visited).toEqual(APPLICATION_STEPS.map((step) => step.href));
  });

  it("stops at the end rather than wrapping round", () => {
    expect(nextStep("/apply/review")).toBeNull();
    expect(isLastStep("/apply/review")).toBe(true);
    expect(isLastStep("/apply/about")).toBe(false);
  });

  it("has no next step for a path off the sequence", () => {
    // A step page that gets moved without updating this list should navigate
    // nowhere rather than to an arbitrary step.
    expect(nextStep("/offers")).toBeNull();
  });

  it("sends each editable step to the one after it", () => {
    expect(nextStep("/apply/about")?.href).toBe("/apply/work");
    expect(nextStep("/apply/work")?.href).toBe("/apply/areas");
    expect(nextStep("/apply/areas")?.href).toBe("/apply/consent");
    expect(nextStep("/apply/consent")?.href).toBe("/apply/documents");
  });
});

describe("the list itself", () => {
  it("has no duplicate hrefs, which would make the current step ambiguous", () => {
    const hrefs = APPLICATION_STEPS.map((step) => step.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("labels every step, because the navigation renders them", () => {
    for (const step of APPLICATION_STEPS) {
      expect(step.labelKey.length).toBeGreaterThan(0);
      expect(step.href.startsWith("/apply")).toBe(true);
    }
  });
});

describe("the stay host path", () => {
  it("skips trades, areas and hours", () => {
    expect(applicationSteps("STAY_HOST").map((step) => step.href)).toEqual([
      "/apply",
      "/apply/about",
      "/apply/consent",
      "/apply/documents",
      "/apply/review",
    ]);
  });

  it("continues from About you straight to the agreements", () => {
    expect(nextStep("/apply/about", "STAY_HOST")?.href).toBe("/apply/consent");
    expect(isLastStep("/apply/review", "STAY_HOST")).toBe(true);
  });

  it("leaves the services path unchanged", () => {
    expect(applicationSteps("SERVICES")).toBe(APPLICATION_STEPS);
    expect(applicationSteps(undefined)).toBe(APPLICATION_STEPS);
  });
});

describe("the rental owner path", () => {
  it("uses the same short sequence as a stay host", () => {
    expect(applicationSteps("RENTAL_OWNER").map((step) => step.href)).toEqual(
      applicationSteps("STAY_HOST").map((step) => step.href),
    );
    expect(nextStep("/apply/about", "RENTAL_OWNER")?.href).toBe("/apply/consent");
  });
});
