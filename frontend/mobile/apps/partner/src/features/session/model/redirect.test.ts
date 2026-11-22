import { destinationAfterSignIn, homeForApplication, shellForApplication } from "./redirect";

describe("homeForApplication", () => {
  it("sends an unfinished or absent application to the form, everyone else home", () => {
    expect(homeForApplication(null)).toBe("/apply");
    expect(homeForApplication("DRAFT")).toBe("/apply");
    expect(homeForApplication("CHANGES_REQUIRED")).toBe("/apply");
    expect(homeForApplication("SUBMITTED")).toBe("/home");
    expect(homeForApplication("APPROVED")).toBe("/home");
  });
});

describe("destinationAfterSignIn", () => {
  it("takes an approved Partner home, not back into their finished application", () => {
    expect(destinationAfterSignIn("/apply", "APPROVED")).toBe("/home");
    expect(destinationAfterSignIn("/apply/documents", "APPROVED")).toBe("/home");
    expect(destinationAfterSignIn("/apply?phone=9876543210", "APPROVED")).toBe("/home");
  });

  it("keeps the page an approved Partner asked for when it is not the application", () => {
    expect(destinationAfterSignIn("/work/offers", "APPROVED")).toBe("/work/offers");
    expect(destinationAfterSignIn("/applications-faq", "APPROVED")).toBe("/applications-faq");
  });

  it("keeps an applicant on their application", () => {
    expect(destinationAfterSignIn("/apply/work", "DRAFT")).toBe("/apply/work");
    expect(destinationAfterSignIn(null, "DRAFT")).toBe("/apply");
    expect(destinationAfterSignIn(null, null)).toBe("/apply");
  });

  it("falls back to the home for the application's state when nothing was asked for", () => {
    expect(destinationAfterSignIn(null, "APPROVED")).toBe("/home");
  });
});

describe("shellForApplication", () => {
  it("keeps every not-yet-approved applicant in the onboarding shell", () => {
    expect(shellForApplication(null)).toBe("/apply");
    expect(shellForApplication("DRAFT")).toBe("/apply");
    expect(shellForApplication("CHANGES_REQUIRED")).toBe("/apply");
    expect(shellForApplication("SUBMITTED")).toBe("/apply");
    expect(shellForApplication("UNDER_REVIEW")).toBe("/apply");
    expect(shellForApplication("DECLINED")).toBe("/apply/status");
  });

  it("sends an approved Partner, and the states that already used it, to the workspace", () => {
    expect(shellForApplication("APPROVED")).toBe("/home");
    expect(shellForApplication("SUSPENDED")).toBe("/home");
    expect(shellForApplication("OFFBOARDED")).toBe("/home");
  });
});
