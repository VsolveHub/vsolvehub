import { describe, expect, it } from "vitest";
import { DemoPaymentGateway, authStrategy } from "./payments";

describe("authStrategy", () => {
  it("holds funds for cards", () => expect(authStrategy("card")).toBe("hold"));
  it("captures UPI immediately", () => expect(authStrategy("upi")).toBe("immediate"));
  it("captures wallet immediately", () => expect(authStrategy("wallet")).toBe("immediate"));
  it("does nothing for COD", () => expect(authStrategy("cod")).toBe("none"));
});

describe("DemoPaymentGateway", () => {
  it("authorizes a card as a hold with an expiry", async () => {
    const gw = new DemoPaymentGateway();
    const r = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toBe("AUTHORIZED");
    expect(r.expiresAt).toBeInstanceOf(Date);
  });

  it("authorizes UPI as an immediate capture", async () => {
    const gw = new DemoPaymentGateway();
    const r = await gw.authorize({ amountPaise: 10000, method: "upi", idempotencyKey: "k2" });
    expect(r.ok && r.state).toBe("CAPTURED");
  });

  it("marks COD as pending with no money moved", async () => {
    const gw = new DemoPaymentGateway();
    const r = await gw.authorize({ amountPaise: 10000, method: "cod", idempotencyKey: "k3" });
    expect(r.ok && r.state).toBe("COD_PENDING");
  });

  it("rejects a non-positive amount", async () => {
    const gw = new DemoPaymentGateway();
    const r = await gw.authorize({ amountPaise: 0, method: "card", idempotencyKey: "k0" });
    expect(r.ok).toBe(false);
  });

  it("is idempotent — the same key returns the same intent", async () => {
    const gw = new DemoPaymentGateway();
    const a = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "same" });
    const b = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "same" });
    if (!a.ok || !b.ok) throw new Error("both authorizations should succeed");
    expect(a.intentId).toBe(b.intentId);
  });

  it("refuses to capture more than was authorized", async () => {
    const gw = new DemoPaymentGateway();
    const auth = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "k4" });
    if (!auth.ok) throw new Error("setup failed");
    const r = await gw.capture(auth.intentId, 20000);
    expect(r.ok).toBe(false);
  });

  it("allows capture in parts up to the authorized total", async () => {
    const gw = new DemoPaymentGateway();
    const auth = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "k5" });
    if (!auth.ok) throw new Error("setup failed");
    expect((await gw.capture(auth.intentId, 6000)).ok).toBe(true);
    expect((await gw.capture(auth.intentId, 4000)).ok).toBe(true);
    expect((await gw.capture(auth.intentId, 1)).ok).toBe(false);
  });

  it("counts a void against the authorized envelope", async () => {
    const gw = new DemoPaymentGateway();
    const auth = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "k6" });
    if (!auth.ok) throw new Error("setup failed");
    expect((await gw.void(auth.intentId, 7000)).ok).toBe(true);
    expect((await gw.capture(auth.intentId, 4000)).ok).toBe(false);
    expect((await gw.capture(auth.intentId, 3000)).ok).toBe(true);
  });

  it("refuses to refund more than was captured", async () => {
    const gw = new DemoPaymentGateway();
    const auth = await gw.authorize({ amountPaise: 10000, method: "upi", idempotencyKey: "k7" });
    if (!auth.ok) throw new Error("setup failed");
    expect((await gw.refund(auth.intentId, 10000)).ok).toBe(true);
    expect((await gw.refund(auth.intentId, 1)).ok).toBe(false);
  });

  it("rejects operations on an unknown intent", async () => {
    const gw = new DemoPaymentGateway();
    expect((await gw.capture("nope", 100)).ok).toBe(false);
    expect((await gw.void("nope", 100)).ok).toBe(false);
    expect((await gw.refund("nope", 100)).ok).toBe(false);
  });
});
