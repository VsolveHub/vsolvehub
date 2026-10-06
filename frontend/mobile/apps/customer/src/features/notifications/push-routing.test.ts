import { resolveCustomerPush } from "./push-routing";

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
