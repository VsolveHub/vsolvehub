import { describe, expect, it } from "vitest";

import {
  newPeriod,
  periodProblem,
  scheduleProblems,
  toRuleInputs,
  weeklyHours,
  type DraftPeriod,
} from "./schedule";

const AREA = "11111111-1111-4111-8111-111111111111";

function period(overrides: Partial<DraftPeriod> = {}): DraftPeriod {
  return { ...newPeriod(AREA, 0), ...overrides };
}

describe("period validation", () => {
  it("accepts an ordinary working day", () => {
    const one = period({ startsAt: "09:00", endsAt: "18:00" });
    expect(periodProblem(one, [one])).toBeNull();
  });

  it("rejects a zero-length period", () => {
    const one = period({ startsAt: "09:00", endsAt: "09:00" });
    expect(periodProblem(one, [one])).toBe("ZERO_LENGTH");
  });

  it("rejects an end before the start when it is not an overnight period", () => {
    const one = period({ startsAt: "18:00", endsAt: "09:00", endsNextDay: false });
    expect(periodProblem(one, [one])).toBe("ENDS_BEFORE_START");
  });

  it("accepts the same times as an overnight period", () => {
    // The difference is the Partner's explicit statement, not an inference. An
    // editor that guessed would turn a typo into a night shift.
    const one = period({ startsAt: "18:00", endsAt: "09:00", endsNextDay: true });
    expect(periodProblem(one, [one])).toBeNull();
  });

  it("accepts a full 24-hour period when marked as overnight", () => {
    const one = period({ startsAt: "09:00", endsAt: "09:00", endsNextDay: true });
    expect(periodProblem(one, [one])).toBeNull();
  });
});

describe("overlap", () => {
  it("flags two periods that overlap on the same day", () => {
    const morning = period({ key: "a", startsAt: "09:00", endsAt: "13:00" });
    const clash = period({ key: "b", startsAt: "12:00", endsAt: "17:00" });
    expect(periodProblem(clash, [morning, clash])).toBe("OVERLAPS_ANOTHER");
  });

  it("allows two shifts that touch at the endpoint", () => {
    // 09:00–13:00 then 13:00–17:00 is a lunch break, not a conflict.
    const morning = period({ key: "a", startsAt: "09:00", endsAt: "13:00" });
    const afternoon = period({ key: "b", startsAt: "13:00", endsAt: "17:00" });
    expect(periodProblem(afternoon, [morning, afternoon])).toBeNull();
  });

  it("allows the same hours on different weekdays", () => {
    const monday = period({ key: "a", weekday: 0 });
    const tuesday = period({ key: "b", weekday: 1 });
    expect(periodProblem(tuesday, [monday, tuesday])).toBeNull();
  });

  it("allows the same hours in different service areas", () => {
    const here = period({ key: "a" });
    const there = period({ key: "b", serviceAreaId: "22222222-2222-4222-8222-222222222222" });
    expect(periodProblem(there, [here, there])).toBeNull();
  });

  it("reports every problem period, not just the first", () => {
    const a = period({ key: "a", startsAt: "09:00", endsAt: "13:00" });
    const b = period({ key: "b", startsAt: "12:00", endsAt: "17:00" });
    const c = period({ key: "c", weekday: 1, startsAt: "10:00", endsAt: "10:00" });
    const problems = scheduleProblems([a, b, c]);
    expect(problems.get("a")).toBe("OVERLAPS_ANOTHER");
    expect(problems.get("b")).toBe("OVERLAPS_ANOTHER");
    expect(problems.get("c")).toBe("ZERO_LENGTH");
  });
});

describe("serialisation", () => {
  it("sends seconds-precision times, as the contract expects", () => {
    const inputs = toRuleInputs([period({ startsAt: "09:00", endsAt: "18:00" })]);
    expect(inputs[0]?.starts_at).toBe("09:00:00");
    expect(inputs[0]?.ends_at).toBe("18:00:00");
  });

  it("carries the overnight flag rather than re-deriving it", () => {
    const inputs = toRuleInputs([
      period({ startsAt: "22:00", endsAt: "06:00", endsNextDay: true }),
    ]);
    expect(inputs[0]?.ends_next_day).toBe(true);
  });
});

describe("weekly hours", () => {
  it("sums published hours", () => {
    expect(
      weeklyHours([
        period({ key: "a", startsAt: "09:00", endsAt: "18:00" }),
        period({ key: "b", weekday: 1, startsAt: "09:00", endsAt: "12:30" }),
      ]),
    ).toBe(12.5);
  });

  it("counts an overnight period across the midnight boundary", () => {
    expect(
      weeklyHours([period({ startsAt: "22:00", endsAt: "06:00", endsNextDay: true })]),
    ).toBe(8);
  });

  it("is zero for a Partner who has published nothing", () => {
    // The default state. ADR-010: nobody is available until they say so.
    expect(weeklyHours([])).toBe(0);
  });
});
