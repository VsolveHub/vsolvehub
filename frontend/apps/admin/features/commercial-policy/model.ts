import type { Schemas } from "@vsolve/api-client";

export type CommercialPolicy = Schemas["CommercialPolicy"];
export type ActivateBody = Schemas["CommercialPolicyActivateRequest"];

/** The charge codes the server accepts a tax category for (`ALLOWED_CHARGE_CODES`). */
export const CHARGE_CODES = [
  "TRANSPORT",
  "LOADING_UNLOADING",
  "DISPOSAL",
  "PERMIT",
  "EQUIPMENT_DELIVERY",
  "CUSTOM",
] as const;

export const CHARGE_LABEL: Record<string, string> = {
  TRANSPORT: "Transport",
  LOADING_UNLOADING: "Loading and unloading",
  DISPOSAL: "Disposal",
  PERMIT: "Permits",
  EQUIPMENT_DELIVERY: "Equipment delivery",
  CUSTOM: "Other charges",
};

export type PolicyDraft = {
  version: string;
  approvalReference: string;
  effectiveFrom: string;
  effectiveUntil: string;
  supplierOfRecord: string;
  materialSupplierOfRecord: string;
  visitSupplierOfRecord: string;
  taxBasis: string;
  taxRates: { category: string; percent: string }[];
  materialTaxCategory: string;
  chargeTaxCategories: Record<string, string>;
  platformFeeTreatment: string;
  platformFeePercent: string;
  platformFeeTaxPercent: string;
  commissionPercent: string;
  commissionBasis: string;
  withholdingPercent: string;
  withholdingBasis: string;
};

/** 1800 bps → "18". */
export function bpsToPercent(bps: number | null | undefined): string {
  if (typeof bps !== "number") return "";
  return String(bps / 100);
}

/** "18" or "2.5" → basis points, or null if not a percentage between 0 and 100. */
export function percentToBps(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const bps = Math.round(Number(text) * 100);
  return bps <= 10_000 ? bps : null;
}

function dayOf(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

const BLANK: PolicyDraft = {
  version: "1",
  approvalReference: "",
  effectiveFrom: "",
  effectiveUntil: "",
  supplierOfRecord: "PARTNER",
  materialSupplierOfRecord: "PARTNER",
  visitSupplierOfRecord: "VSOLVE",
  taxBasis: "EXCLUSIVE",
  taxRates: [{ category: "", percent: "" }],
  materialTaxCategory: "",
  chargeTaxCategories: {},
  platformFeeTreatment: "NONE",
  platformFeePercent: "0",
  platformFeeTaxPercent: "0",
  commissionPercent: "0",
  commissionBasis: "PARTNER_QUOTE",
  withholdingPercent: "0",
  withholdingBasis: "NONE",
};

/** The next version, prefilled from the newest one so a change is an edit, not a retype. */
export function draftFrom(latest: CommercialPolicy | undefined): PolicyDraft {
  if (!latest) return BLANK;
  const rates = Object.entries((latest.tax_rates_bps ?? {}) as Record<string, number>).map(
    ([category, bps]) => ({ category, percent: bpsToPercent(bps) }),
  );
  return {
    version: String(latest.version + 1),
    approvalReference: "",
    effectiveFrom: "",
    effectiveUntil: dayOf(latest.effective_until),
    supplierOfRecord: latest.supplier_of_record,
    materialSupplierOfRecord: latest.material_supplier_of_record,
    visitSupplierOfRecord: latest.visit_supplier_of_record,
    taxBasis: latest.tax_basis,
    taxRates: rates.length ? rates : [{ category: "", percent: "" }],
    materialTaxCategory: latest.material_tax_category,
    chargeTaxCategories: { ...((latest.charge_tax_categories ?? {}) as Record<string, string>) },
    platformFeeTreatment: latest.platform_fee_treatment,
    platformFeePercent: bpsToPercent(latest.platform_fee_bps),
    platformFeeTaxPercent: bpsToPercent(latest.platform_fee_tax_bps),
    commissionPercent: bpsToPercent(latest.commission_bps),
    commissionBasis: latest.commission_basis,
    withholdingPercent: bpsToPercent(latest.withholding_bps),
    withholdingBasis: latest.withholding_basis,
  };
}

/** The draft as the activate body, or the first thing a person must fix. */
export function toActivateBody(draft: PolicyDraft): { body: ActivateBody } | { error: string } {
  const version = /^\d+$/.test(draft.version.trim()) ? Number(draft.version.trim()) : 0;
  if (version < 1) return { error: "The version is a whole number, one more than the last." };
  if (!draft.approvalReference.trim()) {
    return { error: "Add the Finance or legal approval reference this version was signed off under." };
  }
  if (!draft.effectiveFrom) return { error: "Choose the date this version takes effect." };
  if (draft.effectiveUntil && draft.effectiveUntil <= draft.effectiveFrom) {
    return { error: "The end date must be after the start date." };
  }
  const rates: Record<string, number> = {};
  for (const row of draft.taxRates) {
    const category = row.category.trim();
    if (!category && !row.percent.trim()) continue;
    const bps = percentToBps(row.percent);
    if (!category || bps === null) return { error: "Every tax rate needs a category name and a percentage." };
    rates[category] = bps;
  }
  if (Object.keys(rates).length === 0) return { error: "Add at least one tax rate." };
  if (!Object.prototype.hasOwnProperty.call(rates, draft.materialTaxCategory)) {
    return { error: "Choose which tax rate applies to materials." };
  }
  const charges: Record<string, string> = {};
  for (const [code, category] of Object.entries(draft.chargeTaxCategories)) {
    if (!category) continue;
    if (!Object.prototype.hasOwnProperty.call(rates, category)) return { error: `The tax rate for ${CHARGE_LABEL[code] ?? code} is missing.` };
    charges[code] = category;
  }
  const percents = {
    platform_fee_bps: percentToBps(draft.platformFeePercent),
    platform_fee_tax_bps: percentToBps(draft.platformFeeTaxPercent),
    commission_bps: percentToBps(draft.commissionPercent),
    withholding_bps: percentToBps(draft.withholdingPercent),
  };
  if (Object.values(percents).some((value) => value === null)) {
    return { error: "Fees, commission and withholding are percentages from 0 to 100." };
  }
  return {
    body: {
      version,
      approval_reference: draft.approvalReference.trim(),
      effective_from: new Date(`${draft.effectiveFrom}T00:00:00`).toISOString(),
      effective_until: draft.effectiveUntil ? new Date(`${draft.effectiveUntil}T00:00:00`).toISOString() : null,
      supplier_of_record: draft.supplierOfRecord as ActivateBody["supplier_of_record"],
      material_supplier_of_record: draft.materialSupplierOfRecord as ActivateBody["material_supplier_of_record"],
      visit_supplier_of_record: draft.visitSupplierOfRecord as ActivateBody["visit_supplier_of_record"],
      tax_basis: draft.taxBasis as ActivateBody["tax_basis"],
      tax_rates_bps: rates,
      material_tax_category: draft.materialTaxCategory,
      charge_tax_categories: charges,
      platform_fee_treatment: draft.platformFeeTreatment as ActivateBody["platform_fee_treatment"],
      platform_fee_bps: percents.platform_fee_bps as number,
      platform_fee_tax_bps: percents.platform_fee_tax_bps as number,
      commission_bps: percents.commission_bps as number,
      commission_basis: draft.commissionBasis as ActivateBody["commission_basis"],
      withholding_bps: percents.withholding_bps as number,
      withholding_basis: draft.withholdingBasis as ActivateBody["withholding_basis"],
    },
  };
}
