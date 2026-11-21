import { describe, expect, it } from "vitest";

import {
  canContinueStep3,
  isValidPin,
  matchPin,
  MAX_REQUESTED_PINS,
  normalisePin,
} from "./partner-areas";

describe("partner-areas", () => {
  it("normalises PIN by trimming whitespace", () => {
    expect(normalisePin(" 509001  ")).toBe("509001");
  });

  it("validates 6-digit Indian postal code starting with 1-9", () => {
    expect(isValidPin("509001")).toBe(true);
    expect(isValidPin("110001")).toBe(true);
    expect(isValidPin("012345")).toBe(false); // starts with 0
    expect(isValidPin("50900")).toBe(false); // 5 digits
    expect(isValidPin("5090011")).toBe(false); // 7 digits
    expect(isValidPin("50900A")).toBe(false); // non-digit
    expect(isValidPin("")).toBe(false);
  });

  it("enforces max requested PINs of 5", () => {
    expect(MAX_REQUESTED_PINS).toBe(5);
  });

  it("matches PIN against open areas", () => {
    const areas = [
      { id: "area-1", name: "Mahbubnagar", postal_codes: ["509001", "509002"] },
      { id: "area-2", name: "Jadcherla", postalCodes: ["509301", "509001"] },
      { id: "area-3", name: "Hyderabad Central", postal_codes: ["500001"] },
    ];

    const matchSingle = matchPin(areas, "509002");
    expect(matchSingle).toEqual({
      kind: "open",
      areas: [{ id: "area-1", name: "Mahbubnagar" }],
    });

    // In two areas: returns both
    const matchTwo = matchPin(areas, "509001");
    expect(matchTwo).toEqual({
      kind: "open",
      areas: [
        { id: "area-1", name: "Mahbubnagar" },
        { id: "area-2", name: "Jadcherla" },
      ],
    });

    // Uncovered PIN
    const matchNone = matchPin(areas, "509216");
    expect(matchNone).toEqual({ kind: "unknown" });

    // Invalid PIN format
    const matchInvalid = matchPin(areas, "abc");
    expect(matchInvalid).toEqual({ kind: "unknown" });
  });

  it("canContinueStep3 returns true if at least 1 area ticked or at least 1 PIN asked", () => {
    expect(canContinueStep3(["area-1"], [])).toBe(true);
    expect(canContinueStep3([], ["509216"])).toBe(true);
    expect(canContinueStep3(["area-1"], ["509216"])).toBe(true);
    expect(canContinueStep3([], [])).toBe(false);
  });
});
