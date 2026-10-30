import { describe, expect, it } from "vitest";

import { signedRupeesToPaise } from "./queries";

describe("wallet adjustment amount", () => {
  it("reads signed rupees as paise", () => {
    expect(signedRupeesToPaise("250")).toBe(25000);
    expect(signedRupeesToPaise("-99.50")).toBe(-9950);
  });

  it("refuses zero and anything that is not an amount", () => {
    expect(signedRupeesToPaise("0")).toBeNull();
    expect(signedRupeesToPaise("abc")).toBeNull();
    expect(signedRupeesToPaise("1.999")).toBeNull();
    expect(signedRupeesToPaise("")).toBeNull();
  });
});
