import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./fulfillment";

describe("isUniqueViolation", () => {
  it("detects a Prisma unique-constraint error (P2002)", () =>
    expect(isUniqueViolation({ code: "P2002" })).toBe(true));
  it("ignores other Prisma errors", () =>
    expect(isUniqueViolation({ code: "P2025" })).toBe(false));
  it("ignores plain errors", () => expect(isUniqueViolation(new Error("boom"))).toBe(false));
  it("ignores null/undefined", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
