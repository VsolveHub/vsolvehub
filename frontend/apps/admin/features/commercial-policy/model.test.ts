import { describe, expect, it } from "vitest";

import { draftFrom, percentToBps, toActivateBody, type CommercialPolicy } from "./model";

const active = {
  id: "p-1",
  version: 3,
  status: "ACTIVE",
  approval_reference: "FIN-3",
  effective_from: "2026-09-01T00:00:00Z",
  effective_until: null,
  approved_at: "2026-09-01T00:00:00Z",
  supplier_of_record: "PARTNER",
  material_supplier_of_record: "PARTNER",
  visit_supplier_of_record: "VSOLVE",
  tax_basis: "EXCLUSIVE",
  tax_rates_bps: { labour: 1800, goods: 1200 },
  material_tax_category: "goods",
  charge_tax_categories: { TRANSPORT: "labour" },
  platform_fee_treatment: "CUSTOMER",
  platform_fee_bps: 250,
  platform_fee_tax_bps: 1800,
  commission_bps: 500,
  commission_basis: "PARTNER_QUOTE",
  withholding_bps: 100,
  withholding_basis: "PARTNER_QUOTE",
} as unknown as CommercialPolicy;

describe("commercial policy form", () => {
  it("converts percentages to basis points", () => {
    expect(percentToBps("18")).toBe(1800);
    expect(percentToBps("2.5")).toBe(250);
    expect(percentToBps("101")).toBeNull();
    expect(percentToBps("-1")).toBeNull();
  });

  it("prefills the next version from the active one", () => {
    const draft = draftFrom(active);
    expect(draft.version).toBe("4");
    expect(draft.approvalReference).toBe("");
    expect(draft.platformFeePercent).toBe("2.5");
    expect(draft.taxRates).toEqual([
      { category: "labour", percent: "18" },
      { category: "goods", percent: "12" },
    ]);
  });

  it("round-trips the prefilled draft into the same numbers", () => {
    const draft = { ...draftFrom(active), approvalReference: "FIN-4", effectiveFrom: "2026-10-15" };
    const result = toActivateBody(draft);
    expect("body" in result && result.body).toMatchObject({
      version: 4,
      tax_rates_bps: { labour: 1800, goods: 1200 },
      material_tax_category: "goods",
      charge_tax_categories: { TRANSPORT: "labour" },
      platform_fee_bps: 250,
      commission_bps: 500,
      withholding_bps: 100,
    });
  });

  it("names what is missing", () => {
    expect(toActivateBody(draftFrom(active))).toEqual({
      error: "Add the Finance or legal approval reference this version was signed off under.",
    });
    const draft = { ...draftFrom(active), approvalReference: "x", effectiveFrom: "2026-10-15", materialTaxCategory: "nope" };
    expect(toActivateBody(draft)).toEqual({ error: "Choose which tax rate applies to materials." });
  });
});
