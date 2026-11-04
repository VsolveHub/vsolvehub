import { destinationAfterSignIn, homeForApplication } from "./redirect";

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
