import { describe, expect, it } from "vitest";

import {
  combineStart,
  formatReportingTime,
  reportingTimeOptions,
  toLocalInputTime,
} from "./reporting-time";

describe("reporting time", () => {
  it("offers half-hour slots from six in the morning to late evening", () => {
    const options = reportingTimeOptions();
    expect(options[0]).toBe("06:00");
    expect(options[1]).toBe("06:30");
    expect(options.at(-1)).toBe("23:30");
    expect(options).toHaveLength(36);
  });

  it("puts the chosen time on the chosen local day, and midnight when none was chosen", () => {
    const withTime = new Date(combineStart("2026-09-14", "17:00"));
    expect(withTime.getFullYear()).toBe(2026);
    expect(withTime.getMonth()).toBe(8);
    expect(withTime.getDate()).toBe(14);
    expect(withTime.getHours()).toBe(17);
    expect(withTime.getMinutes()).toBe(0);

    const midnight = new Date(combineStart("2026-09-14", null));
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getDate()).toBe(14);
  });

  it("reads a stored time back, and treats a midnight start as no time chosen", () => {
    expect(toLocalInputTime(combineStart("2026-09-14", "17:30"))).toBe("17:30");
    expect(toLocalInputTime(combineStart("2026-09-14", null))).toBeNull();
    expect(toLocalInputTime(null)).toBeNull();
    expect(toLocalInputTime("not a date")).toBeNull();
  });

  it("formats for the customer without inventing a format", () => {
    expect(formatReportingTime("17:00").toLowerCase()).toContain("5:00");
    expect(formatReportingTime("nonsense")).toBe("nonsense");
  });
});
