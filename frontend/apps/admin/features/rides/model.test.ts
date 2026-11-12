import { describe, expect, it } from "vitest";

import {
  RIDE_FILTERS,
  areasOf,
  canForceCancel,
  cancelReasonError,
  changedRates,
  distanceText,
  durationText,
  fromInput,
  mapLink,
  rateForm,
  readRates,
  stateLabel,
  stateTone,
} from "./model";

const CARD = {
  base_fare_paise: 1500,
  included_distance_m: 1000,
  per_km_paise: 600,
  per_minute_paise: 100,
  minimum_fare_paise: 2500,
  free_waiting_minutes: 3,
  waiting_per_minute_paise: 100,
};

describe("rides model", () => {
  it("lets Operations cancel any open ride, even in trip, but never a finished one", () => {
    expect(canForceCancel("SEARCHING")).toBe(true);
    expect(canForceCancel("IN_TRIP")).toBe(true);
    expect(canForceCancel("COMPLETED")).toBe(false);
    expect(canForceCancel("CANCELLED")).toBe(false);
    expect(canForceCancel("NO_CAPTAIN_FOUND")).toBe(false);
  });

  it("needs a reason the server accepts", () => {
    expect(cancelReasonError("  ")).toBe("Say why you are cancelling.");
    expect(cancelReasonError("x".repeat(65))).toMatch(/64/);
    expect(cancelReasonError("Rider called support")).toBeNull();
  });

  it("asks the server for all four open states on the Live filter", () => {
    expect(RIDE_FILTERS[0]).toMatchObject({
      key: "live",
      states: "SEARCHING,CAPTAIN_ASSIGNED,CAPTAIN_ARRIVED,IN_TRIP",
    });
  });

  it("names states plainly, and keeps an unknown one readable", () => {
    expect(stateLabel("CAPTAIN_ARRIVED")).toBe("Captain at pickup");
    expect(stateLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(stateTone("IN_TRIP")).toBe("info");
    expect(stateTone("COMPLETED")).toBe("success");
  });

  it("shows distances and SOS places", () => {
    expect(distanceText(350)).toBe("350 m");
    expect(distanceText(1240)).toBe("1.2 km");
    expect(mapLink("9.490000", "76.330000")).toBe("https://www.google.com/maps?q=9.490000,76.330000");
    expect(mapLink(null, null)).toBeNull();
  });

  it("reads rupees as paise, and refuses what the server would", () => {
    expect(fromInput("12.5", "rupees")).toBe(1250);
    expect(fromInput("1000", "metres")).toBe(1000);
    expect(fromInput("2.5", "minutes")).toBeNull();
    expect(fromInput("-1", "rupees")).toBeNull();
    expect(fromInput(" ", "rupees")).toBeNull();
  });

  it("round-trips a card through the form and sends only what changed", () => {
    const form = rateForm(CARD);
    expect(form.base_fare_paise).toBe("15");
    const read = readRates({ ...form, per_km_paise: "7" });
    expect(read).toEqual({ rates: { ...CARD, per_km_paise: 700 } });
    if ("rates" in read) expect(changedRates(CARD, read.rates)).toEqual({ per_km_paise: 700 });
    expect(readRates({ ...form, minimum_fare_paise: "" })).toEqual({ error: expect.stringContaining("Minimum fare") });
  });

  it("offers each area once, by name", () => {
    const cards = [
      { service_area_id: "b", service_area_name: "Kochi" },
      { service_area_id: "a", service_area_name: "Alappuzha" },
      { service_area_id: "b", service_area_name: "Kochi" },
    ];
    expect(areasOf(cards)).toEqual([
      { id: "a", name: "Alappuzha" },
      { id: "b", name: "Kochi" },
    ]);
  });

  it("says pass lengths plainly", () => {
    expect(durationText(24)).toBe("1 day");
    expect(durationText(72)).toBe("3 days");
    expect(durationText(12)).toBe("12 h");
  });
});
