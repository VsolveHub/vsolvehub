import { describe, expect, it } from "vitest";
import {
  calculateServiceCommercials,
  normalizeDurationMinutes,
} from "./commercials";

describe("service commercials", () => {
  it("defaults to one hour and adds a bounded platform fee with GST", () => {
    expect(calculateServiceCommercials(59_900, undefined)).toEqual({
      durationMinutes: 60,
      hourlyRatePaise: 59_900,
      serviceSubtotalPaise: 59_900,
      platformFeePaise: 2_995,
      platformFeeGstPaise: 539,
      serviceGstIncludedPaise: 2_852,
      totalPaise: 63_434,
    });
  });

  it("prices longer service time proportionally", () => {
    const result = calculateServiceCommercials(59_900, 90);
    expect(result.serviceSubtotalPaise).toBe(89_850);
    expect(result.durationMinutes).toBe(90);
  });

  it("clamps and snaps invalid durations", () => {
    expect(normalizeDurationMinutes(10)).toBe(60);
    expect(normalizeDurationMinutes(77)).toBe(90);
    expect(normalizeDurationMinutes(999)).toBe(480);
  });
});
