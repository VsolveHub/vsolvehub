import { describe, expect, it } from "vitest";

import {
  addressLine,
  clockLabel,
  closedDayMessage,
  isOpenOn,
  openDaysLabel,
  weekdayOf,
  type PickupHours,
} from "./pickup";

const NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function hours(open: number[], closed: string[] = []): PickupHours {
  return {
    is_set: true,
    summary: "",
    closed_dates: closed,
    days: NAMES.map((day_name, weekday) => ({
      weekday,
      day_name,
      is_open: open.includes(weekday),
      opens_at: open.includes(weekday) ? "09:00" : null,
      closes_at: open.includes(weekday) ? "21:00" : null,
    })),
  };
}

describe("pickup helpers", () => {
  it("formats clock times", () => {
    expect(clockLabel("09:00")).toBe("9 AM");
    expect(clockLabel("18:30")).toBe("6:30 PM");
    expect(clockLabel("12:00")).toBe("12 PM");
    expect(clockLabel("00:00")).toBe("12 AM");
  });

  it("numbers weekdays Monday first, like the server", () => {
    expect(weekdayOf("2026-10-12")).toBe(0); // a Monday
    expect(weekdayOf("2026-10-18")).toBe(6); // a Sunday
  });

  it("treats an owner without hours as open every day", () => {
    expect(isOpenOn({ is_set: false, days: [], summary: "", closed_dates: [] }, "2026-10-18")).toBe(true);
    expect(isOpenOn(undefined, "2026-10-18")).toBe(true);
  });

  it("explains a closed day and lists the open ones", () => {
    const monToSat = hours([0, 1, 2, 3, 4, 5]);
    expect(isOpenOn(monToSat, "2026-10-18")).toBe(false);
    expect(openDaysLabel(monToSat)).toBe("Mon, Tue, Wed, Thu, Fri, Sat");
    expect(closedDayMessage(monToSat, "2026-10-18", "return")).toBe(
      "The owner is closed on Sundays. Choose a return day they are open: Mon, Tue, Wed, Thu, Fri, Sat.",
    );
    expect(closedDayMessage(monToSat, "2026-10-17", "pickup")).toBeNull();
  });

  it("refuses a day off even on a weekday the owner is open", () => {
    const openDaily = hours([0, 1, 2, 3, 4, 5, 6], ["2026-10-24"]);

    expect(isOpenOn(openDaily, "2026-10-24")).toBe(false);
    expect(isOpenOn(openDaily, "2026-10-25")).toBe(true);
    const message = closedDayMessage(openDaily, "2026-10-24", "pickup");
    expect(message).toContain("24 Oct");
    expect(message).toContain("Choose another pickup day.");
  });

  it("honours a day off before the weekly hours are set, as the server does", () => {
    expect(
      isOpenOn({ is_set: false, days: [], summary: "", closed_dates: ["2026-10-24"] }, "2026-10-24"),
    ).toBe(false);
  });

  it("joins an address on one line", () => {
    expect(
      addressLine({
        partner_name: "Sai Events",
        line: "Plot 12",
        area: "Kukatpally",
        city: "Hyderabad",
        pincode: "500072",
        latitude: null,
        longitude: null,
        maps_url: "",
      }),
    ).toBe("Plot 12, Kukatpally, Hyderabad 500072");
  });
});
