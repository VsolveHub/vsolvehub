import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));

const { canRecordChargeback } = await import("./chargeback-action");

describe("where the chargeback button is offered", () => {
  it("offers it on the fees the chargeback command accepts", () => {
    expect(canRecordChargeback({ item: "Crew booking fee: Painting", status: "CAPTURED" })).toBe(true);
    expect(canRecordChargeback({ item: "Quote unlock: Interiors", status: "REFUNDED" })).toBe(true);
    expect(canRecordChargeback({ item: "Visit plan", status: "CAPTURED" })).toBe(true);
  });

  it("does not offer it on vendor money or a failed charge", () => {
    expect(canRecordChargeback({ item: "Project stage: Interiors", status: "CAPTURED" })).toBe(false);
    expect(canRecordChargeback({ item: "Site visit fee: Interiors", status: "CAPTURED" })).toBe(false);
    expect(canRecordChargeback({ item: "Crew booking fee: Painting", status: "FAILED" })).toBe(false);
  });
});
