import { describe, expect, it } from "vitest";

import { isPhoneOnlyTrack } from "./desktop-policy";

describe("which partners get the workspace on a computer", () => {
  it("lets stay hosts, rental owners and employers work from a desk", () => {
    expect(isPhoneOnlyTrack("STAY_HOST")).toBe(false);
    expect(isPhoneOnlyTrack("RENTAL_OWNER")).toBe(false);
    expect(isPhoneOnlyTrack("EMPLOYER")).toBe(false);
  });

  it("keeps field partners on their phone, and an unknown track too", () => {
    expect(isPhoneOnlyTrack("SERVICES")).toBe(true);
    expect(isPhoneOnlyTrack(undefined)).toBe(true);
    expect(isPhoneOnlyTrack("SOMETHING_NEW")).toBe(true);
  });
});
