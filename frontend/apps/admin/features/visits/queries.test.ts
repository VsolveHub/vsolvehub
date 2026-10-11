import { describe, expect, it } from "vitest";

import { visitActions } from "./queries";

describe("visit actions", () => {
  it("asks for a replacement until one has committed", () => {
    expect(visitActions({ status: "RECOVERY_REQUIRED", replacement_offer_id: null })).toEqual({
      confirmReplacement: false,
      findReplacement: true,
      assistedStart: false,
    });
    expect(visitActions({ status: "RECOVERY_REQUIRED", replacement_offer_id: "o-1" })).toEqual({
      confirmReplacement: true,
      findReplacement: false,
      assistedStart: false,
    });
  });

  it("offers an assisted start only once the partner has arrived", () => {
    expect(visitActions({ status: "ARRIVED", replacement_offer_id: null }).assistedStart).toBe(true);
    expect(visitActions({ status: "EN_ROUTE", replacement_offer_id: null }).assistedStart).toBe(false);
  });

  it("offers nothing on a finished visit", () => {
    expect(visitActions({ status: "COMPLETED", replacement_offer_id: null })).toEqual({
      confirmReplacement: false,
      findReplacement: false,
      assistedStart: false,
    });
  });
});
