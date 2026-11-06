// Ported from frontend/apps/partner/features/application/model/steps.test.ts
import { APPLICATION_STEPS, applicationSteps, isLastStep, nextStep, stepIndexOf } from "./steps";

describe("finding the current step in the 4-step sequence", () => {
  it("matches each step exactly", () => {
    expect(stepIndexOf("/apply/about")).toBe(0);
    expect(stepIndexOf("/apply/consent")).toBe(1);
    expect(stepIndexOf("/apply/documents")).toBe(2);
    expect(stepIndexOf("/apply/review")).toBe(3);
  });

  it("tolerates the trailing slash", () => {
    expect(stepIndexOf("/apply/about/")).toBe(0);
    expect(stepIndexOf("/apply/consent/")).toBe(1);
  });

  it("reports -1 for a path outside the sequence", () => {
    expect(stepIndexOf("/offers")).toBe(-1);
    expect(stepIndexOf("/apply/not-a-step")).toBe(-1);
  });
});

describe("what comes next in the 4-step sequence", () => {
  it("walks the whole sequence in order", () => {
    const visited: string[] = ["/apply/about"];
    let current = nextStep("/apply/about");
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
    expect(nextStep("/offers")).toBeNull();
  });

  it("sends each editable step to the one after it", () => {
    expect(nextStep("/apply/about")?.href).toBe("/apply/consent");
    expect(nextStep("/apply/consent")?.href).toBe("/apply/documents");
    expect(nextStep("/apply/documents")?.href).toBe("/apply/review");
  });
});

describe("the list itself", () => {
  it("has no duplicate hrefs", () => {
    const hrefs = APPLICATION_STEPS.map((step) => step.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("labels every step, because the navigation renders them", () => {
    for (const step of APPLICATION_STEPS) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.href.startsWith("/apply")).toBe(true);
    }
  });
});

describe("the steps follow what the partner signed up for", () => {
  const hrefs = (track: string) => applicationSteps(track).map((step) => step.href);

  it("walks someone offering services through their work and hours", () => {
    expect(hrefs("SERVICES")).toEqual([
      "/apply/about",
      "/apply/work",
      "/apply/schedule",
      "/apply/consent",
      "/apply/documents",
      "/apply/review",
    ]);
    expect(nextStep("/apply/about", "SERVICES")?.href).toBe("/apply/work");
    expect(nextStep("/apply/schedule", "SERVICES")?.href).toBe("/apply/consent");
    expect(isLastStep("/apply/review", "SERVICES")).toBe(true);
  });

  it("keeps the short list for stays and rentals", () => {
    expect(hrefs("RENTAL_OWNER")).toEqual(APPLICATION_STEPS.map((step) => step.href));
    expect(hrefs("STAY_HOST")).toEqual(APPLICATION_STEPS.map((step) => step.href));
    expect(nextStep("/apply/about", "RENTAL_OWNER")?.href).toBe("/apply/consent");
  });
});
