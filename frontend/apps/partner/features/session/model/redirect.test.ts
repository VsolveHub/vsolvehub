import { describe, expect, it } from "vitest";

import { homeForApplication, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("keeps a same-origin path", () => {
    expect(safeNextPath("/offers")).toBe("/offers");
    expect(safeNextPath("/apply/review")).toBe("/apply/review");
    expect(safeNextPath("/offers?highlight=offer-1")).toBe("/offers?highlight=offer-1");
  });

  it("rejects an absolute URL to another origin", () => {
    // The whole reason this function exists. A login route that forwards to
    // whatever `?next=` says is a credential-phishing gadget: the victim really
    // did sign in to us, and the redirect they land on is not us.
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("http://evil.example/offers")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects a protocol-relative path", () => {
    // `//evil.example` is an absolute URL wearing a leading slash, and the naive
    // `startsWith("/")` check passes it.
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("//evil.example/offers")).toBeNull();
  });

  it("rejects a backslash the browser will normalise into a protocol-relative path", () => {
    // Browsers treat `/\` as `//` when resolving, so this reaches another origin
    // through a value that looks like a rooted path.
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("\\\\evil.example")).toBeNull();
  });

  it("rejects anything not rooted at a single slash", () => {
    expect(safeNextPath("offers")).toBeNull();
    expect(safeNextPath("../offers")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  it("rejects control characters used to smuggle a second value", () => {
    expect(safeNextPath("/offers\nLocation: https://evil.example")).toBeNull();
    expect(safeNextPath("/off\ters")).toBeNull();
  });

  it("rejects a return path pointing back at login", () => {
    // Honouring it would bounce an authenticated visitor between `/login` and
    // itself instead of ever landing on a page.
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath("/login?next=/offers")).toBeNull();
  });

  it("tolerates surrounding whitespace on an otherwise good path", () => {
    expect(safeNextPath("  /offers  ")).toBe("/offers");
    // A trailing newline is surrounding whitespace like any other. What is left
    // once it is gone is exactly `/offers`, and the value that gets returned —
    // never the raw one — is what anything downstream navigates to.
    expect(safeNextPath("/offers\r\n")).toBe("/offers");
    // Trimming must not rescue a value that is unsafe once trimmed.
    expect(safeNextPath("  //evil.example  ")).toBeNull();
  });
});

describe("homeForApplication", () => {
  it("sends a Partner with work left to the application", () => {
    expect(homeForApplication(null)).toBe("/apply");
    expect(homeForApplication("DRAFT")).toBe("/apply");
    expect(homeForApplication("CHANGES_REQUIRED")).toBe("/apply");
  });

  it("sends everyone else to the signed-in home", () => {
    // Waiting states included: there is nothing for them to do on `/apply`, and
    // the home says so plainly rather than reopening a form they cannot change.
    expect(homeForApplication("SUBMITTED")).toBe("/home");
    expect(homeForApplication("UNDER_REVIEW")).toBe("/home");
    expect(homeForApplication("APPROVED")).toBe("/home");
    expect(homeForApplication("SUSPENDED")).toBe("/home");
    expect(homeForApplication("OFFBOARDED")).toBe("/home");
  });
});
