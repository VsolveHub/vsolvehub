import { describe, expect, it } from "vitest";

import { RIDE_FILTERS, canForceCancel, cancelReasonError, distanceText, mapLink, stateLabel, stateTone } from "./model";

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
});
