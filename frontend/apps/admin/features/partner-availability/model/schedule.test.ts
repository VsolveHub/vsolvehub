import { describe, expect, it } from "vitest";

import {
  clearsTheSchedule,
  describeWeek,
  hasProblems,
  validateSchedule,
  weekdayLabel,
  type ExceptionDraft,
  type RuleDraft,
  type ScheduleDraft,
} from "./schedule";

/**
 * A Partner's working week, as Operations may rewrite it.
 *
 * `PUT /operations/partners/{id}/availability/` deletes every rule and exception
 * and writes what it is given, and there is **no Operations read** of the current
 * schedule. That combination is the whole risk: an editor that opens empty and
 * submits erases somebody's working hours, and an empty form looks exactly like
 * a Partner with no hours.
 *
 * So the two properties under test are the overlap rule (which mirrors Django's
 * `_validate_schedule_rules`, and has to agree with it or the console refuses
 * valid weeks) and the clearing guard (which has to fire on the *default* state
 * of the form, not only on a form somebody emptied on purpose).
 */

const AREA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_AREA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PARTNER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let counter = 0;
function rule(overrides: Partial<RuleDraft> = {}): RuleDraft {
  counter += 1;
  return {
    key: `rule-${counter}`,
    serviceAreaId: AREA,
    weekday: 0,
    startsAt: "09:00",
    endsAt: "17:00",
    endsNextDay: false,
    ...overrides,
  };
}

function exception(overrides: Partial<ExceptionDraft> = {}): ExceptionDraft {
  counter += 1;
  return {
    key: `exception-${counter}`,
    serviceAreaId: AREA,
    date: "2026-09-10",
    isAvailable: false,
    startsAt: "09:00",
    endsAt: "17:00",
    endsNextDay: false,
    reason: "",
    ...overrides,
  };
}

function draft(overrides: Partial<ScheduleDraft> = {}): ScheduleDraft {
  return {
    partnerId: PARTNER,
    consentPurpose: "schedule-change",
    consentVersion: "2026-07",
    rules: [],
    exceptions: [],
    ...overrides,
  };
}

describe("Django's weekday convention, stated once", () => {
  it("counts Monday as zero", () => {
    expect(weekdayLabel(0)).toBe("Monday");
    expect(weekdayLabel(6)).toBe("Sunday");
  });

  it("does not invent a day for a number Django would not send", () => {
    expect(weekdayLabel(7)).toBe("Unknown day");
  });
});

describe("who, and under what consent", () => {
  it("accepts a complete request", () => {
    expect(hasProblems(validateSchedule(draft({ rules: [rule()] })))).toBe(false);
  });

  it("requires a consent purpose in the character set Django validates", () => {
    const problems = validateSchedule(draft({ consentPurpose: "schedule change" }));
    expect(problems.form.consentPurpose).toMatch(/letters, numbers, hyphens and underscores/i);
  });

  it("requires a consent version, because it is the lookup and not paperwork", () => {
    // `replace_partner_schedule_for_operations` looks for a live PartnerConsent
    // matching purpose *and* version and refuses without one.
    expect(validateSchedule(draft({ consentVersion: "  " })).form.consentVersion).toBeTruthy();
  });
});

describe("windows", () => {
  it("refuses one that ends before it starts, rather than assuming overnight", () => {
    const overnight = rule({ startsAt: "22:00", endsAt: "02:00" });
    const problems = validateSchedule(draft({ rules: [overnight] }));

    expect(problems.rules[overnight.key]).toMatch(/ends before it starts/i);
  });

  it("accepts the same window once it is marked as ending the next day", () => {
    const overnight = rule({ startsAt: "22:00", endsAt: "02:00", endsNextDay: true });

    expect(validateSchedule(draft({ rules: [overnight] })).rules[overnight.key]).toBeUndefined();
  });

  it("lands the message on the row that caused it", () => {
    const good = rule({ weekday: 0 });
    const bad = rule({ weekday: 2, startsAt: "18:00", endsAt: "09:00" });
    const problems = validateSchedule(draft({ rules: [good, bad] }));

    expect(problems.rules[good.key]).toBeUndefined();
    expect(problems.rules[bad.key]).toBeTruthy();
  });
});

describe("overlap, per service area", () => {
  it("catches two windows on the same day in the same area", () => {
    const first = rule({ weekday: 1, startsAt: "09:00", endsAt: "13:00" });
    const second = rule({ weekday: 1, startsAt: "12:00", endsAt: "17:00" });
    const problems = validateSchedule(draft({ rules: [first, second] }));

    expect(problems.rules[second.key]).toMatch(/overlaps another one/i);
  });

  it("allows the same hours in a different area", () => {
    // A Partner can hold two areas; working both in the same hours is a
    // scheduling question Django does not refuse, so neither does this.
    const first = rule({ weekday: 1, serviceAreaId: AREA });
    const second = rule({ weekday: 1, serviceAreaId: OTHER_AREA });

    expect(hasProblems(validateSchedule(draft({ rules: [first, second] })))).toBe(false);
  });

  it("allows windows that merely touch", () => {
    const morning = rule({ weekday: 1, startsAt: "09:00", endsAt: "13:00" });
    const afternoon = rule({ weekday: 1, startsAt: "13:00", endsAt: "17:00" });

    expect(hasProblems(validateSchedule(draft({ rules: [morning, afternoon] })))).toBe(false);
  });

  it("catches a Sunday overnight shift running into Monday morning", () => {
    // The case a naive per-day comparison misses entirely, and the reason the
    // Monday windows are compared a second time a week later.
    const sunday = rule({ weekday: 6, startsAt: "22:00", endsAt: "06:00", endsNextDay: true });
    const monday = rule({ weekday: 0, startsAt: "05:00", endsAt: "12:00" });
    const problems = validateSchedule(draft({ rules: [sunday, monday] }));

    expect(hasProblems(problems)).toBe(true);
  });

  it("does not flag a Monday window that starts after the overnight shift ends", () => {
    const sunday = rule({ weekday: 6, startsAt: "22:00", endsAt: "06:00", endsNextDay: true });
    const monday = rule({ weekday: 0, startsAt: "07:00", endsAt: "12:00" });

    expect(hasProblems(validateSchedule(draft({ rules: [sunday, monday] })))).toBe(false);
  });

  it("does not compare a row that already failed its own check", () => {
    const broken = rule({ weekday: 1, startsAt: "18:00", endsAt: "09:00" });
    const fine = rule({ weekday: 1, startsAt: "10:00", endsAt: "12:00" });
    const problems = validateSchedule(draft({ rules: [broken, fine] }));

    expect(problems.rules[broken.key]).toMatch(/ends before it starts/i);
    expect(problems.rules[fine.key]).toBeUndefined();
  });
});

describe("dated exceptions", () => {
  it("needs a date", () => {
    const entry = exception({ date: "" });
    expect(validateSchedule(draft({ exceptions: [entry] })).exceptions[entry.key]).toMatch(
      /give the date/i,
    );
  });

  it("needs hours only when the day is worked", () => {
    const dayOff = exception({ isAvailable: false, startsAt: "", endsAt: "" });
    expect(validateSchedule(draft({ exceptions: [dayOff] })).exceptions[dayOff.key]).toBeUndefined();

    const worked = exception({ isAvailable: true, startsAt: "", endsAt: "" });
    expect(validateSchedule(draft({ exceptions: [worked] })).exceptions[worked.key]).toMatch(
      /start and an end time/i,
    );
  });

  it("keeps the reason inside Django's field length", () => {
    const entry = exception({ reason: "a".repeat(201) });
    expect(validateSchedule(draft({ exceptions: [entry] })).exceptions[entry.key]).toMatch(
      /under 200 characters/i,
    );
  });
});

describe("clearing the schedule is a decision, not an accident", () => {
  it("recognises the untouched form as a clear", () => {
    // The editor opens empty because there is no read. An operator who fills in
    // the Partner id and saves clears somebody's week — so this must be true of
    // the *default* state, not only of a form somebody emptied on purpose.
    expect(clearsTheSchedule(draft())).toBe(true);
  });

  it("is not a clear once anything at all is written", () => {
    expect(clearsTheSchedule(draft({ rules: [rule()] }))).toBe(false);
    expect(clearsTheSchedule(draft({ exceptions: [exception()] }))).toBe(false);
  });

  it("says in words that the Partner will receive no offers", () => {
    expect(describeWeek(draft())).toEqual([
      "No working hours at all. The Partner will receive no offers.",
    ]);
  });
});

describe("the week read back before saving", () => {
  it("lists windows in the order the week runs, not the order they were typed", () => {
    const friday = rule({ weekday: 4, startsAt: "09:00", endsAt: "12:00" });
    const mondayLate = rule({ weekday: 0, startsAt: "14:00", endsAt: "18:00" });
    const mondayEarly = rule({ weekday: 0, startsAt: "08:00", endsAt: "12:00" });

    expect(describeWeek(draft({ rules: [friday, mondayLate, mondayEarly] }))).toEqual([
      "Monday 08:00–12:00",
      "Monday 14:00–18:00",
      "Friday 09:00–12:00",
    ]);
  });

  it("marks an overnight shift as one", () => {
    const overnight = rule({ weekday: 5, startsAt: "22:00", endsAt: "06:00", endsNextDay: true });

    expect(describeWeek(draft({ rules: [overnight] }))).toEqual([
      "Saturday 22:00–06:00 (ends the next day)",
    ]);
  });

  it("says which dated days are worked and which are not", () => {
    const off = exception({ date: "2026-09-10", isAvailable: false });
    const worked = exception({
      date: "2026-09-12",
      isAvailable: true,
      startsAt: "10:00",
      endsAt: "14:00",
    });

    expect(describeWeek(draft({ rules: [rule()], exceptions: [off, worked] }))).toEqual([
      "Monday 09:00–17:00",
      "2026-09-10: not working",
      "2026-09-12: working 10:00–14:00",
    ]);
  });
});
