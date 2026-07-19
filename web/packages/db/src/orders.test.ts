import { describe, expect, it } from "vitest";
import { assertMoneyInvariant, derivePaymentState, rollUpOrderStatus } from "./orders";

describe("assertMoneyInvariant", () => {
  const ok = { authorizedPaise: 1000, capturedPaise: 600, voidedPaise: 400, refundedPaise: 0 };

  it("accepts a balanced ledger", () => {
    expect(() => assertMoneyInvariant(ok)).not.toThrow();
  });

  it("accepts a fully refunded capture", () => {
    expect(() =>
      assertMoneyInvariant({ ...ok, capturedPaise: 600, refundedPaise: 600 }),
    ).not.toThrow();
  });

  it("rejects captured + voided over authorized", () => {
    expect(() => assertMoneyInvariant({ ...ok, capturedPaise: 700 })).toThrow(/exceeds authorized/);
  });

  it("rejects refund over captured", () => {
    expect(() => assertMoneyInvariant({ ...ok, refundedPaise: 700 })).toThrow(/exceeds captured/);
  });

  it("rejects negative amounts", () => {
    expect(() => assertMoneyInvariant({ ...ok, voidedPaise: -1 })).toThrow(/negative/);
  });
});

describe("rollUpOrderStatus", () => {
  it("stays AUTHORIZED while every job is live", () => {
    expect(rollUpOrderStatus(["ASSIGNED", "SEARCHING_PROVIDER"])).toBe("AUTHORIZED");
  });

  it("is PARTIALLY_SETTLED when some jobs are terminal", () => {
    expect(rollUpOrderStatus(["COMPLETED", "ASSIGNED"])).toBe("PARTIALLY_SETTLED");
  });

  it("is SETTLED when every job is terminal", () => {
    expect(rollUpOrderStatus(["COMPLETED", "NO_WORKER_FOUND"])).toBe("SETTLED");
  });

  it("is CANCELLED when every job was cancelled", () => {
    expect(rollUpOrderStatus(["CANCELLED", "CANCELLED"])).toBe("CANCELLED");
  });

  it("is SETTLED, not CANCELLED, when a cancellation sits beside a completion", () => {
    expect(rollUpOrderStatus(["CANCELLED", "COMPLETED"])).toBe("SETTLED");
  });

  it("treats an empty order as DRAFT", () => {
    expect(rollUpOrderStatus([])).toBe("DRAFT");
  });
});

describe("derivePaymentState", () => {
  const ledger = (over: Partial<Record<string, number>> = {}) => ({
    authorizedPaise: 1000,
    capturedPaise: 0,
    voidedPaise: 0,
    refundedPaise: 0,
    ...over,
  });

  it("is COD_PENDING when nothing was ever authorized", () => {
    expect(derivePaymentState(ledger({ authorizedPaise: 0 }))).toBe("COD_PENDING");
  });

  it("is AUTHORIZED while the hold is untouched", () => {
    expect(derivePaymentState(ledger())).toBe("AUTHORIZED");
  });

  it("is PARTIALLY_CAPTURED mid-fan-out", () => {
    expect(derivePaymentState(ledger({ capturedPaise: 400 }))).toBe("PARTIALLY_CAPTURED");
  });

  it("is CAPTURED once captures and voids cover the authorization", () => {
    expect(derivePaymentState(ledger({ capturedPaise: 600, voidedPaise: 400 }))).toBe("CAPTURED");
  });

  it("is VOIDED when the whole hold was released", () => {
    expect(derivePaymentState(ledger({ voidedPaise: 1000 }))).toBe("VOIDED");
  });

  it("is REFUNDED once every captured paisa is returned", () => {
    expect(derivePaymentState(ledger({ capturedPaise: 600, refundedPaise: 600 }))).toBe("REFUNDED");
  });
});
