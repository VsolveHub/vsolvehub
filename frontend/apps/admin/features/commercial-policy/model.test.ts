import { describe, expect, it } from "vitest";

import {
  categoryLabel,
  draftFrom,
  newTaxCategory,
  percentToBps,
  priceExample,
  rateRows,
  requiredCategories,
  toActivateBody,
  type CommercialPolicy,
  type TaxCategoryUsage,
} from "./model";

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

const usage: TaxCategoryUsage[] = [
  { code: "labour", service_count: 22, crew_and_project_service_count: 22, example_services: ["Plumber"] },
  { code: "rental", service_count: 100, crew_and_project_service_count: 0, example_services: ["Tent"] },
];

describe("tax categories come from the services, not from typing", () => {
  it("reads a category code as words", () => {
    expect(categoryLabel("technician-home-service")).toBe("Technician home service");
    expect(categoryLabel("labour")).toBe("Labour");
  });

  it("lists every category services use, then the policy's unused ones", () => {
    const rows = rateRows(draftFrom(active), usage);

    expect(rows.map((row) => [row.category, row.percent, row.usage !== null])).toEqual([
      ["labour", "18", true],
      ["rental", "", true],
      ["goods", "12", false],
    ]);
  });

  it("knows which categories crew and project jobs are priced under", () => {
    expect(requiredCategories(usage)).toEqual(["labour"]);
  });

  it("leaves a blank rate out of the version rather than refusing it", () => {
    const draft = {
      ...draftFrom(active),
      approvalReference: "FIN-4",
      effectiveFrom: "2026-10-15",
      taxRates: [...draftFrom(active).taxRates, { category: "rental", percent: "" }],
    };
    const result = toActivateBody(draft);

    expect("body" in result && result.body.tax_rates_bps).toEqual({ labour: 1800, goods: 1200 });
  });

  it("refuses a version that leaves crew and project services without a rate", () => {
    const draft = {
      ...draftFrom(active),
      approvalReference: "FIN-4",
      effectiveFrom: "2026-10-15",
      taxRates: [
        { category: "labour", percent: "" },
        { category: "goods", percent: "12" },
      ],
    };

    expect(toActivateBody(draft, { required: ["labour"] })).toEqual({
      error:
        "Crew and project services use Labour, which has no tax rate. Those jobs could not be priced.",
    });
  });
});

describe("a category no service uses yet can still be given a rate", () => {
  it("turns what Operations types into a code services could carry", () => {
    expect(newTaxCategory("  Building Materials ", ["labour"])).toEqual({
      code: "building-materials",
    });
    expect(newTaxCategory("transport_charges", [])).toEqual({ code: "transport_charges" });
  });

  it("refuses an empty, malformed or repeated category", () => {
    expect(newTaxCategory("   ", [])).toEqual({ error: "Type a name for the category." });
    expect(newTaxCategory("goods & services", [])).toEqual({
      error: "Use letters, numbers, - and _ only (at most 100).",
    });
    expect(newTaxCategory("x".repeat(101), [])).toEqual({
      error: "Use letters, numbers, - and _ only (at most 100).",
    });
    expect(newTaxCategory("Labour", ["labour"])).toEqual({
      error: "That category is already in the table.",
    });
  });

  it("is listed and priced like any other once added with a rate", () => {
    const draft = {
      ...draftFrom(active),
      approvalReference: "FIN-4",
      effectiveFrom: "2026-10-15",
      taxRates: [...draftFrom(active).taxRates, { category: "building-materials", percent: "28" }],
      materialTaxCategory: "building-materials",
    };

    expect(rateRows(draft, usage).at(-1)).toEqual({
      category: "building-materials",
      percent: "28",
      usage: null,
    });
    const result = toActivateBody(draft, { required: requiredCategories(usage) });
    expect("body" in result && result.body).toMatchObject({
      tax_rates_bps: { labour: 1800, goods: 1200, "building-materials": 2800 },
      material_tax_category: "building-materials",
    });
  });
});

describe("the worked example matches the server's arithmetic", () => {
  it("prices a ₹10,000 job with GST added, a customer-paid fee and commission on the GST-inclusive price", () => {
    const draft = {
      ...draftFrom(active),
      platformFeePercent: "2",
      platformFeeTaxPercent: "18",
      commissionPercent: "5",
      withholdingBasis: "NONE",
    };

    expect(priceExample(draft, { workPaise: 1_000_000, taxCategory: "labour" })).toEqual({
      work: 1_000_000,
      partnerGst: 180_000,
      partnerPrice: 1_180_000,
      platformFee: 23_600,
      platformFeeGst: 4_248,
      customerPays: 1_207_848,
      commission: 59_000,
      withholding: 0,
      partnerReceives: 1_121_000,
      vsolveKeeps: 82_600,
    });
  });

  it("takes commission on the price before GST when told to", () => {
    const draft = { ...draftFrom(active), commissionBasis: "TAXABLE_VALUE", commissionPercent: "10", withholdingBasis: "NONE" };

    expect(priceExample(draft, { workPaise: 1_000_000, taxCategory: "labour" })?.commission).toBe(100_000);
  });

  it("waits for valid numbers", () => {
    const draft = { ...draftFrom(active), commissionPercent: "abc" };

    expect(priceExample(draft, { workPaise: 1_000_000, taxCategory: "labour" })).toBeNull();
  });
});

