import { describe, expect, it } from "vitest";

import { clearsTheSchedule, draftFromSchedule, hasProblems, validateSchedule } from "./schedule";

const PARTNER = "11111111-1111-4111-8111-111111111111";
const AREA = "22222222-2222-4222-8222-222222222222";

describe("editing a partner's hours starts from what is there", () => {
  const read = {
    rules: [
      { service_area_id: AREA, weekday: 0, starts_at: "09:00:00", ends_at: "18:00:00", ends_next_day: false },
      { service_area_id: AREA, weekday: 4, starts_at: "22:00:00", ends_at: "06:00:00", ends_next_day: true },
    ],
    exceptions: [
      {
        service_area_id: AREA,
        date: "2026-11-10",
        is_available: false,
        starts_at: null,
        ends_at: null,
        ends_next_day: false,
        reason: "Wedding",
      },
    ],
    consents: [
      { purpose: "partner_terms", document_version: "2026-07" },
      { purpose: "partner_terms", document_version: "2026-01" },
    ],
  };

  it("loads every rule and one-off change, with times a time input understands", () => {
    const draft = draftFromSchedule(PARTNER, read);
    expect(draft.rules.map((rule) => [rule.weekday, rule.startsAt, rule.endsAt, rule.endsNextDay])).toEqual([
      [0, "09:00", "18:00", false],
      [4, "22:00", "06:00", true],
    ]);
    expect(draft.exceptions[0]).toMatchObject({ date: "2026-11-10", isAvailable: false, reason: "Wedding" });
  });

  it("records the change under the newest consent on file, with no ids typed", () => {
    const draft = draftFromSchedule(PARTNER, read);
    expect([draft.consentPurpose, draft.consentVersion]).toEqual(["partner_terms", "2026-07"]);
    expect(hasProblems(validateSchedule(draft))).toBe(false);
  });

  it("never opens on an empty week that would wipe the schedule when saved", () => {
    expect(clearsTheSchedule(draftFromSchedule(PARTNER, read))).toBe(false);
  });
});
