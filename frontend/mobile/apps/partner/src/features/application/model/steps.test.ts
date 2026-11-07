// Ported from frontend/apps/partner/features/application/model/steps.test.ts
import {
  APPLICATION_STEPS,
  SERVICE_APPLICATION_STEPS,
  applicationSteps,
  isLastStep,
  isUnchosenDraft,
  nextStep,
  stepIndexOf,
  trackPreview,
} from "./steps";

/** The same steps, in the same order, as the website. */

describe("finding the current step", () => {
  it("matches each step exactly", () => {
    expect(stepIndexOf("/apply/about")).toBe(0);
    expect(stepIndexOf("/apply/areas")).toBe(2);
    expect(stepIndexOf("/apply/review")).toBe(SERVICE_APPLICATION_STEPS.length - 1);
    expect(stepIndexOf("/apply/documents", "STAY_HOST")).toBe(1);
  });

  it("tolerates the trailing slash", () => {
    expect(stepIndexOf("/apply/about/")).toBe(0);
  });

  it("reports -1 for a path outside the sequence", () => {
    expect(stepIndexOf("/offers")).toBe(-1);
    expect(stepIndexOf("/apply/consent")).toBe(-1);
  });
});

describe("the services path", () => {
  it("asks where you work on its own step, and the agreements on Agree & send", () => {
    expect(applicationSteps("SERVICES").map((step) => step.href)).toEqual([
      "/apply/about",
      "/apply/work",
      "/apply/areas",
      "/apply/schedule",
      "/apply/documents",
      "/apply/review",
    ]);
    expect(nextStep("/apply/work", "SERVICES")?.href).toBe("/apply/areas");
    expect(nextStep("/apply/areas", "SERVICES")?.href).toBe("/apply/schedule");
    expect(nextStep("/apply/schedule", "SERVICES")?.href).toBe("/apply/documents");
    expect(isLastStep("/apply/review", "SERVICES")).toBe(true);
  });

  it("is the path for the server's default track too", () => {
    expect(applicationSteps(undefined)).toBe(SERVICE_APPLICATION_STEPS);
  });
});

describe("the stays and rentals path", () => {
  it("is the short form: About you, Documents, Agree & send", () => {
    for (const track of ["STAY_HOST", "RENTAL_OWNER"]) {
      expect(applicationSteps(track).map((step) => step.href)).toEqual([
        "/apply/about",
        "/apply/documents",
        "/apply/review",
      ]);
    }
    expect(nextStep("/apply/about", "RENTAL_OWNER")?.href).toBe("/apply/documents");
  });
});

describe("the lists themselves", () => {
  it("have no duplicate hrefs and label every step", () => {
    for (const list of [APPLICATION_STEPS, SERVICE_APPLICATION_STEPS]) {
      const hrefs = list.map((step) => step.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const step of list) expect(step.label.length).toBeGreaterThan(0);
    }
  });
});

describe("whether the partner has chosen how to join", () => {
  it("treats the draft the server creates on first sign-in as not chosen", () => {
    expect(isUnchosenDraft({ status: "DRAFT", version: 1 })).toBe(true);
  });

  it("treats any saved choice or edit, or a sent application, as chosen", () => {
    expect(isUnchosenDraft({ status: "DRAFT", version: 2 })).toBe(false);
    expect(isUnchosenDraft({ status: "SUBMITTED", version: 1 })).toBe(false);
    expect(isUnchosenDraft(null)).toBe(false);
  });
});

describe("what the first screen shows before starting", () => {
  it("previews the same steps the application walks", () => {
    expect(trackPreview("SERVICES").steps).toBe(SERVICE_APPLICATION_STEPS);
    expect(trackPreview("STAY_HOST").steps).toBe(APPLICATION_STEPS);
  });

  it("says how long, and what approval leads to for each", () => {
    expect(trackPreview("SERVICES").time).toBe("About 5 minutes");
    expect(trackPreview("RENTAL_OWNER").time).toBe("About 3 minutes");
    expect(trackPreview("STAY_HOST").after).toMatch(/property and rooms/);
    expect(trackPreview("RENTAL_OWNER").after).toMatch(/add your items/);
  });
});
