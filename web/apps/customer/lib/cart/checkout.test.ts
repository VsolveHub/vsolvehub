import { describe, expect, it, vi } from "vitest";
import { checkoutCart, type CheckoutDeps } from "./checkout";

const draft = (id: string, ref: string, amount: number, name: string) => ({
  id,
  bookingRef: ref,
  quotedAmount: amount,
  serviceName: name,
});

function deps(over: Partial<CheckoutDeps>): CheckoutDeps {
  return {
    loadDrafts: async () => [draft("b1", "VSH-1", 50000, "Deep Clean")],
    reserveStock: async () => {},
    authorize: async () => ({ ok: true, orderRef: "VSO-1", orderId: "o1", codPending: false }),
    assign: async () => ({ ok: true, partner: { name: "Asha" } }),
    fail: async () => ({ refunded: true }),
    ...over,
  };
}

describe("checkoutCart", () => {
  it("rejects an empty cart without authorizing", async () => {
    const authorize = vi.fn();
    const res = await checkoutCart("u1", "upi", deps({ loadDrafts: async () => [], authorize }));
    expect(res).toEqual({ ok: false, error: "Your cart is empty" });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("authorizes the summed total once and assigns every item", async () => {
    const authorize = vi.fn(
      async (_input: { userId: string; bookingIds: string[]; amountPaise: number; method: string; idempotencyKey: string }) => ({
        ok: true as const,
        orderRef: "VSO-9",
        orderId: "o",
        codPending: false,
      }),
    );
    const res = await checkoutCart(
      "u1",
      "upi",
      deps({
        loadDrafts: async () => [draft("b1", "VSH-1", 50000, "Deep Clean"), draft("b2", "VSH-2", 12000, "Wiring")],
        authorize,
      }),
    );
    expect(authorize).toHaveBeenCalledOnce();
    expect(authorize.mock.calls[0][0]).toMatchObject({ amountPaise: 62000, bookingIds: ["b1", "b2"] });
    expect(res).toEqual({
      ok: true,
      orderRef: "VSO-9",
      items: [
        { bookingRef: "VSH-1", serviceName: "Deep Clean", outcome: "assigned", partnerName: "Asha" },
        { bookingRef: "VSH-2", serviceName: "Wiring", outcome: "assigned", partnerName: "Asha" },
      ],
    });
  });

  it("voids an item with no provider and still books the rest", async () => {
    const fail = vi.fn(async () => ({ refunded: true }));
    const assign = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, partner: { name: "Asha" } })
      .mockResolvedValueOnce({ ok: false });
    const res = await checkoutCart(
      "u1",
      "upi",
      deps({
        loadDrafts: async () => [draft("b1", "VSH-1", 50000, "Deep Clean"), draft("b2", "VSH-2", 12000, "Wiring")],
        assign,
        fail,
      }),
    );
    expect(fail).toHaveBeenCalledWith("b2");
    if (!res.ok) throw new Error("expected ok");
    expect(res.items[1]).toEqual({ bookingRef: "VSH-2", serviceName: "Wiring", outcome: "no_provider", refunded: true });
  });

  it("fails cleanly (no authorization) when product stock can't be reserved", async () => {
    const authorize = vi.fn();
    const res = await checkoutCart(
      "u1",
      "upi",
      deps({
        reserveStock: async () => {
          throw new Error('"MCB 16A" is out of stock');
        },
        authorize,
      }),
    );
    expect(res).toEqual({ ok: false, error: '"MCB 16A" is out of stock' });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("returns the auth error and assigns nothing when authorization fails", async () => {
    const assign = vi.fn();
    const res = await checkoutCart(
      "u1",
      "upi",
      deps({ authorize: async () => ({ ok: false, error: "Card declined" }), assign }),
    );
    expect(res).toEqual({ ok: false, error: "Card declined" });
    expect(assign).not.toHaveBeenCalled();
  });
});
