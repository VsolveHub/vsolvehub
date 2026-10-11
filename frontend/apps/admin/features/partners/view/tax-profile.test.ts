import { describe, expect, it } from "vitest";

import { stateCodeFromGstin } from "./tax-profile";

describe("GSTIN state code", () => {
  it("reads the first two digits", () => {
    expect(stateCodeFromGstin("36ABCDE1234F1Z5")).toBe("36");
  });

  it("is blank when there is no usable GSTIN", () => {
    expect(stateCodeFromGstin("")).toBe("");
    expect(stateCodeFromGstin(null)).toBe("");
    expect(stateCodeFromGstin("AB12")).toBe("");
  });
});
