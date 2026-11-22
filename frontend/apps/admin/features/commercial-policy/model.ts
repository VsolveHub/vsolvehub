import type { Schemas } from "@vsolve/api-client";

export type CommercialPolicy = Schemas["CommercialPolicy"];
export type TaxCategoryUsage = Schemas["TaxCategoryUsage"];
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

/** `technician-home-service` → "Technician home service". The code itself is shown beside it. */
export function categoryLabel(code: string): string {
  const words = code.replace(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : code;
}

/**
 * The table the form edits: one row per category services use, then any the policy still has
 * that no service uses. A rate left blank is simply not part of the version.
 */
export function rateRows(
  draft: PolicyDraft,
  usage: readonly TaxCategoryUsage[],
): { category: string; percent: string; usage: TaxCategoryUsage | null }[] {
  const percentOf = new Map(draft.taxRates.map((row) => [row.category.trim(), row.percent]));
  const used = usage.map((row) => ({
    category: row.code,
    percent: percentOf.get(row.code) ?? "",
    usage: row,
  }));
  const usedCodes = new Set(usage.map((row) => row.code));
  const unused = draft.taxRates
    .filter((row) => row.category.trim() && !usedCodes.has(row.category.trim()))
    .map((row) => ({ category: row.category.trim(), percent: row.percent, usage: null }));
  return [...used, ...unused];
}

/** A tax category code as services carry it (a slug): letters, digits, `-` and `_`. */
const TAX_CATEGORY_CODE = /^[a-z0-9][a-z0-9_-]{0,99}$/;

/**
 * A category no service uses yet, typed by Operations: materials or transport usually need a
 * rate of their own. Spaces become hyphens and letters lowercase, so "Building materials" is
 * `building-materials`.
 */
export function newTaxCategory(
  typed: string,
  existing: readonly string[],
): { code: string; error?: undefined } | { code?: undefined; error: string } {
  const code = typed.trim().toLowerCase().replace(/\s+/g, "-");
  if (!code) return { error: "Type a name for the category." };
  if (!TAX_CATEGORY_CODE.test(code)) {
    return { error: "Use letters, numbers, - and _ only (at most 100)." };
  }
  if (existing.includes(code)) return { error: "That category is already in the table." };
  return { code };
}

/** The categories crew and project services are priced under: each must have a rate. */
export function requiredCategories(usage: readonly TaxCategoryUsage[]): string[] {
  return usage.filter((row) => row.crew_and_project_service_count > 0).map((row) => row.code);
}

export interface PriceExample {
  work: number;
  partnerGst: number;
  partnerPrice: number;
  platformFee: number;
  platformFeeGst: number;
  customerPays: number;
  commission: number;
  withholding: number;
  partnerReceives: number;
  vsolveKeeps: number;
}

/** Half-up, once, in whole paise — as the server does (`financials._bps`). */
function share(amount: number, bps: number): number {
  return Math.floor((amount * bps + 5_000) / 10_000);
}

/**
 * What one job comes to under a draft, for a GST-registered partner, so the numbers can be read
 * as money rather than as percentages. It mirrors `financials._price_outcome` for a single
 * service line with no discount; the server's calculation is still the one that prices
 * estimates. Null while a percentage is not yet valid.
 */
export function priceExample(
  draft: PolicyDraft,
  { workPaise, taxCategory }: { workPaise: number; taxCategory: string },
): PriceExample | null {
  const rate = percentToBps(
    draft.taxRates.find((row) => row.category.trim() === taxCategory)?.percent ?? "",
  );
  const fee = percentToBps(draft.platformFeePercent);
  const feeTax = percentToBps(draft.platformFeeTaxPercent);
  const commissionBps = percentToBps(draft.commissionPercent);
  const withholdingBps = percentToBps(draft.withholdingPercent);
  if ([rate, fee, feeTax, commissionBps, withholdingBps].some((value) => value === null)) {
    return null;
  }
  const inclusive = draft.taxBasis === "INCLUSIVE";
  const partnerGst = inclusive
    ? Math.floor((workPaise * rate! + Math.floor((10_000 + rate!) / 2)) / (10_000 + rate!))
    : share(workPaise, rate!);
  const preTax = inclusive ? workPaise - partnerGst : workPaise;
  const partnerPrice = inclusive ? workPaise : workPaise + partnerGst;
  const platformFee = share(partnerPrice, fee!);
  const platformFeeGst = share(platformFee, feeTax!);
  const customerFee = draft.platformFeeTreatment === "CUSTOMER" ? platformFee + platformFeeGst : 0;
  const partnerFee = draft.platformFeeTreatment === "PARTNER" ? platformFee : 0;
  const base = (basis: string) => (basis === "TAXABLE_VALUE" ? preTax : partnerPrice);
  const commission = share(base(draft.commissionBasis), commissionBps!);
  const withholding =
    draft.withholdingBasis === "NONE" ? 0 : share(base(draft.withholdingBasis), withholdingBps!);
  const partnerReceives = partnerPrice - partnerFee - commission - withholding;
  return {
    work: preTax,
    partnerGst,
    partnerPrice,
    platformFee: draft.platformFeeTreatment === "NONE" ? 0 : platformFee,
    platformFeeGst: draft.platformFeeTreatment === "CUSTOMER" ? platformFeeGst : 0,
    customerPays: partnerPrice + customerFee,
    commission,
    withholding,
    partnerReceives,
    vsolveKeeps:
      commission + partnerFee + (draft.platformFeeTreatment === "CUSTOMER" ? platformFee : 0),
  };
}

/** The draft as the activate body, or the first thing a person must fix. */
export function toActivateBody(
  draft: PolicyDraft,
  { required = [] }: { required?: readonly string[] } = {},
): { body: ActivateBody } | { error: string } {
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
    // A blank rate is a category this version leaves out, not a mistake.
    if (!category || !row.percent.trim()) continue;
    const bps = percentToBps(row.percent);
    if (bps === null) {
      return { error: `The tax rate for ${categoryLabel(category)} must be a percentage from 0 to 100.` };
    }
    rates[category] = bps;
  }
  if (Object.keys(rates).length === 0) return { error: "Add at least one tax rate." };
  const unpriced = required.filter((code) => !Object.prototype.hasOwnProperty.call(rates, code));
  if (unpriced.length > 0) {
    return {
      error: `Crew and project services use ${unpriced.map(categoryLabel).join(", ")}, which has no tax rate. Those jobs could not be priced.`,
    };
  }
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
