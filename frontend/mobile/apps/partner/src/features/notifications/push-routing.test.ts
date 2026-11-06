import { isOfferCreatedPush, isOfferPush, resolvePartnerPush, resolvePartnerPushData } from "./push-routing";

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

describe("resolvePartnerPushData (OneSignal)", () => {
  it("opens the instant job offer, in Django's OneSignal shape and the old Expo shape", () => {
    expect(
      resolvePartnerPushData({ type: "DISPATCH_OFFER", offer_id: "o-1", url: "https://partner.vsolvehub.com/dispatch/o-1" }),
    ).toEqual({ type: "route", href: "/dispatch/o-1" });
    expect(resolvePartnerPushData({ dispatch_offer_id: "o-2" })).toEqual({ type: "route", href: "/dispatch/o-2" });
  });

  it("opens the app screen a web link points at, when the app has it", () => {
    expect(resolvePartnerPushData({ url: "https://partner.vsolvehub.com/work/offers?tab=new" })).toEqual({
      type: "route",
      href: "/work/offers?tab=new",
    });
  });

  it("opens the alerts panel for a page the app does not have, or no link at all", () => {
    expect(resolvePartnerPushData({ url: "https://partner.vsolvehub.com/pricing" })).toEqual({ type: "alerts" });
    expect(resolvePartnerPushData({})).toEqual({ type: "alerts" });
  });

  it("treats every kind of new-offer push as an offer", () => {
    expect(isOfferPush({ type: "DISPATCH_OFFER", offer_id: "o-1" })).toBe(true);
    expect(isOfferPush({ purpose: "partner.offer" })).toBe(true);
    expect(isOfferPush({ purpose: "partner.offer_created" })).toBe(true);
    expect(isOfferPush({ purpose: "partner.payout_sent" })).toBe(false);
  });
});
