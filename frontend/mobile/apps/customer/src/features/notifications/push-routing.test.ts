import { resolveCustomerPush, resolveCustomerPushData } from "./push-routing";

describe("resolveCustomerPush", () => {
  it("routes a requirement notice to the request", () => {
    expect(resolveCustomerPush({ kind: "REQUIREMENT", id: "req-9" })).toEqual({
      type: "route",
      href: "/requests/req-9",
    });
  });

  it("opens notifications when the kind is unknown", () => {
    expect(resolveCustomerPush({ kind: "PAYOUT_BATCH", id: "x" })).toEqual({ type: "notifications" });
    expect(resolveCustomerPush(null)).toEqual({ type: "notifications" });
  });
});

describe("resolveCustomerPushData (OneSignal)", () => {
  it("prefers the notification's own target", () => {
    expect(resolveCustomerPushData({ target: { kind: "REQUIREMENT", id: "req-9" } })).toEqual({
      type: "route",
      href: "/requests/req-9",
    });
  });

  it("opens the app screen a web link points at, when the app has it", () => {
    expect(resolveCustomerPushData({ url: "https://www.vsolvehub.com/bookings/b-1" })).toEqual({
      type: "route",
      href: "/bookings/b-1",
    });
  });

  it("opens notifications for a page the app does not have, or no link at all", () => {
    expect(resolveCustomerPushData({ url: "https://www.vsolvehub.com/about" })).toEqual({ type: "notifications" });
    expect(resolveCustomerPushData({})).toEqual({ type: "notifications" });
  });
});
