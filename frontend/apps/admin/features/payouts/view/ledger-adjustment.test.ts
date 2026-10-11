import { describe, expect, it } from "vitest";

import { dayEndIso, dayStartIso } from "../queries";
import { signedPaise } from "./ledger-adjustment";

describe("ledger correction amount", () => {
  it("reads signed rupees as paise", () => {
    expect(signedPaise("500")).toBe(50000);
    expect(signedPaise("-12.75")).toBe(-1275);
  });

  it("refuses zero and malformed amounts", () => {
    expect(signedPaise("0")).toBeNull();
    expect(signedPaise("5,00")).toBeNull();
    expect(signedPaise("")).toBeNull();
  });
});

describe("payout period", () => {
  it("covers the whole of both days", () => {
    expect(new Date(dayStartIso("2026-10-01")).getHours()).toBe(0);
    expect(new Date(dayEndIso("2026-10-07")).getHours()).toBe(23);
    expect(new Date(dayEndIso("2026-10-07")).getTime()).toBeGreaterThan(
      new Date(dayStartIso("2026-10-07")).getTime(),
    );
  });
});
