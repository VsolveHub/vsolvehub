import { describe, expect, it } from "vitest";

import { buildCrewCalendar } from "./calendar";

/**
 * The `.ics` a confirmed booking hands to the customer's calendar.
 *
 * Pure by construction — the timestamp is passed in — so what is asserted here
 * is the format's own sharp edges: the exclusive end date, the escaping, and the
 * rule that no event ever claims a time of day.
 */

const STAMP = "20260818T100000Z";

describe("buildCrewCalendar", () => {
  it("writes one all-day event per shift-day", () => {
    const file = buildCrewCalendar(
      {
        service: "Construction helpers",
        crewName: "Ramesh K.",
        days: [
          { date: "2026-09-07", label: "Day 1" },
          { date: "2026-09-08", label: "Day 2" },
        ],
      },
      STAMP,
    );

    expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(file).toContain("DTSTART;VALUE=DATE:20260907");
    expect(file).toContain("DTSTART;VALUE=DATE:20260908");
  });

  it("never claims a time of day", () => {
    const file = buildCrewCalendar(
      { service: "Construction helpers", crewName: null, days: [{ date: "2026-09-07", label: "Day 1" }] },
      STAMP,
    );

    // Nothing published carries a shift start time — the frozen terms carry a
    // shift *length* and the stages carry a date. An event at 9:00 am would be
    // an appointment nobody agreed to, sitting in a calendar looking committed.
    expect(file).not.toMatch(/DTSTART:\d{8}T/);
    expect(file).toContain("VALUE=DATE");
  });

  it("ends the day after it starts", () => {
    const file = buildCrewCalendar(
      { service: "Crew", crewName: null, days: [{ date: "2026-09-30", label: "Day 1" }] },
      STAMP,
    );

    // `DTEND` on an all-day event is exclusive, so a same-day end renders a
    // zero-length event that several clients drop entirely. Month rollover is
    // the case a naive `+1` on the date string gets wrong.
    expect(file).toContain("DTEND;VALUE=DATE:20261001");
  });

  it("escapes the separators the format reserves", () => {
    const file = buildCrewCalendar(
      {
        service: "Fit-out, phase 1; north wing",
        crewName: null,
        days: [{ date: "2026-09-07", label: "Day 1" }],
      },
      STAMP,
    );

    // Unescaped, the comma truncates the summary and the semicolon corrupts the
    // property — the event imports looking like a different booking.
    expect(file).toContain("Fit-out\\, phase 1\\; north wing");
  });

  it("uses CRLF line endings", () => {
    const file = buildCrewCalendar(
      { service: "Crew", crewName: null, days: [{ date: "2026-09-07", label: "Day 1" }] },
      STAMP,
    );

    // Required by the spec, and enough clients enforce it that an LF-separated
    // file fails to import on iOS without saying why.
    expect(file).toContain("\r\n");
    expect(file.split("\r\n").length).toBeGreaterThan(5);
  });

  it("gives each day a stable id so a re-import updates rather than duplicates", () => {
    const once = buildCrewCalendar(
      { service: "Crew", crewName: null, days: [{ date: "2026-09-07", label: "Day 1" }] },
      STAMP,
    );
    const twice = buildCrewCalendar(
      { service: "Crew", crewName: null, days: [{ date: "2026-09-07", label: "Day 1" }] },
      "20260819T110000Z",
    );

    const uid = /UID:(.+)/.exec(once)?.[1];
    expect(uid).toBeDefined();
    expect(twice).toContain(`UID:${uid}`);
  });
});
