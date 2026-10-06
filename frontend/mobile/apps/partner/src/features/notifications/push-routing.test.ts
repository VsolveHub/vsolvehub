import { isOfferCreatedPush, resolvePartnerPush } from "./push-routing";

describe("resolvePartnerPush", () => {
  it("sends an offer notice to the offers list", () => {
    expect(resolvePartnerPush({ kind: "PARTNER_OFFERS" })).toEqual({
      type: "route",
      href: "/work/offers",
    });
  });

  it("sends a work notice to all work", () => {
    expect(resolvePartnerPush({ kind: "PARTNER_WORK" })).toEqual({
      type: "route",
      href: "/work/all",
    });
  });

  it("prefers the notification target when it has a screen", () => {
    expect(resolvePartnerPush({ kind: "CREW_OFFER", id: "inv-9" })).toEqual({
      type: "route",
      href: "/work/offers/inv-9",
    });
  });

  it("opens alerts when the notice has nowhere to go", () => {
    expect(resolvePartnerPush(null)).toEqual({ type: "alerts" });
    expect(resolvePartnerPush({ kind: "PAYOUT", id: "pay-1" })).toEqual({ type: "alerts" });
  });
});

describe("isOfferCreatedPush", () => {
  it("matches the offer-created purpose", () => {
    expect(isOfferCreatedPush({ purpose: "partner.offer_created" })).toBe(true);
    expect(isOfferCreatedPush({ purpose: "partner.job_assigned" })).toBe(false);
  });
});
