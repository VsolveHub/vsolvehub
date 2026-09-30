import { describe, expect, it } from "vitest";

import {
  describeDuration,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatInrRupees,
  formatMoneyText,
  parseDisplayDate,
} from "./readout";

describe("formatMoney", () => {
  it("converts integer paise to rupees", () => {
    // Money is integer paise everywhere in the system; this is the only place it
    // becomes a string.
    expect(formatMoney(19900)).toBe("₹199");
    expect(formatMoney(0)).toBe("₹0");
  });

  it("groups with the Indian lakh convention, not thousands", () => {
    // ₹1,23,456 — not ₹123,456. Getting this wrong is immediately visible to an
    // Indian customer and reads as a foreign product.
    expect(formatMoney(12345600)).toBe("₹1,23,456");
    expect(formatMoney(100000000)).toBe("₹10,00,000");
  });

  it("shows paise only when the amount has them", () => {
    expect(formatMoney(19950)).toBe("₹199.50");
    expect(formatMoney(19900)).toBe("₹199");
  });

  it("can be forced to show paise for invoice alignment", () => {
    expect(formatMoney(19900, { showPaise: true })).toBe("₹199.00");
  });

  it("handles a negative amount, for refunds and ledger reversals", () => {
    expect(formatMoney(-19900)).toBe("-₹199");
  });

  it("does not lose precision on a large total", () => {
    // 12,34,567.89 rupees.
    expect(formatMoney(123456789)).toBe("₹12,34,567.89");
  });
});

describe("formatInrRupees", () => {
  it("formats a whole-rupee amount", () => {
    expect(formatInrRupees(25000)).toBe("₹25,000");
    expect(formatInrRupees(1234567)).toBe("₹12,34,567");
  });

  it("handles decimals correctly", () => {
    expect(formatInrRupees(25000.5)).toBe("₹25,000.50");
  });
});

describe("formatMoneyText", () => {
  it("formats numbers in a range", () => {
    expect(formatMoneyText("25000 - 45000")).toBe("₹25,000 - ₹45,000");
  });

  it("handles existing rupees symbols and spaces", () => {
    expect(formatMoneyText("₹ 25000 - ₹45000")).toBe("₹25,000 - ₹45,000");
    expect(formatMoneyText("₹25,000")).toBe("₹25,000");
  });

  it("preserves non-numeric text like LPA or / year", () => {
    expect(formatMoneyText("12 LPA")).toBe("₹12 LPA");
    expect(formatMoneyText("25000 - 45000 / month")).toBe("₹25,000 - ₹45,000 / month");
  });

  it("ignores non-string or empty values", () => {
    expect(formatMoneyText("")).toBe("");
    expect(formatMoneyText(null as unknown as string)).toBe(null);
  });
});

describe("formatDate", () => {
  it("renders Indian DD/MM/YYYY for a calendar instant", () => {
    // Midday local avoids timezone flipping the calendar day.
    expect(formatDate(new Date(2026, 8, 27, 12, 0, 0))).toBe("27/09/2026");
  });

  it("accepts an ISO date-time string as a calendar day", () => {
    expect(formatDate("2026-10-01T12:00:00")).toMatch(/01\/10\/2026/);
  });

  it("treats YYYY-MM-DD as a local calendar day (no UTC flip)", () => {
    expect(formatDate("2026-10-01")).toBe("01/10/2026");
  });

  it("returns empty string for invalid input", () => {
    expect(formatDate("not-a-date")).toBe("");
  });
});

describe("parseDisplayDate", () => {
  it("parses DD/MM/YYYY into ISO YYYY-MM-DD", () => {
    expect(parseDisplayDate("01/10/2026")).toBe("2026-10-01");
    expect(parseDisplayDate("1/9/2026")).toBe("2026-09-01");
    expect(parseDisplayDate("31/02/2026")).toBe(null);
    expect(parseDisplayDate("")).toBe(null);
  });
});

describe("formatDateTime", () => {
  it("keeps Indian day order with a time", () => {
    const text = formatDateTime(new Date(2026, 8, 27, 13, 30, 0));
    expect(text).toContain("27/09/2026");
    expect(text.length).toBeGreaterThan("27/09/2026".length);
  });
});

describe("formatDuration", () => {
  it("drops the hour segment under an hour", () => {
    expect(formatDuration(15_000)).toBe("00:15");
    expect(formatDuration(90_000)).toBe("01:30");
    expect(formatDuration(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("includes hours at and above an hour", () => {
    expect(formatDuration(60 * 60_000)).toBe("1:00:00");
    expect(formatDuration(3 * 60 * 60_000 + 25 * 60_000 + 5_000)).toBe("3:25:05");
  });

  it("floors at zero rather than showing a negative countdown", () => {
    // An expired hold renders 00:00, never -00:07.
    expect(formatDuration(-5_000)).toBe("00:00");
  });

  it("pads consistently so the display cannot change width", () => {
    // Tabular numerals plus fixed padding is what stops a countdown jittering.
    expect(formatDuration(5_000)).toHaveLength(5);
    expect(formatDuration(65_000)).toHaveLength(5);
  });
});

describe("describeDuration", () => {
  it("is coarse, so a screen reader is not re-announced every second", () => {
    expect(describeDuration(4 * 60_000)).toBe("About 4 minutes remaining");
    expect(describeDuration(60_000)).toBe("About 1 minute remaining");
  });

  it("collapses the final minute to a single phrase", () => {
    expect(describeDuration(45_000)).toBe("Less than a minute remaining");
    expect(describeDuration(1_000)).toBe("Less than a minute remaining");
  });

  it("states expiry plainly", () => {
    expect(describeDuration(0)).toBe("No time remaining");
    expect(describeDuration(-1_000)).toBe("No time remaining");
  });

  it("describes multi-hour bookings", () => {
    expect(describeDuration(2 * 60 * 60_000)).toBe("About 2 hours remaining");
    expect(describeDuration(60 * 60_000 + 30 * 60_000)).toBe(
      "About 1 hour 30 minutes remaining",
    );
  });
});
