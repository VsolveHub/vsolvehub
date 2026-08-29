import type { Schemas } from "@vsolve/api-client";

export type EstimateMode = Schemas["EstimateTypeEnum"];
export type EstimateUnit = Schemas["UnitEnum"];
export type ChargeCode = Schemas["CodeEnum"];
export type ProposalRequest = Schemas["ProposalCreateRequest"];
export type ProposalPreviewRequest = Schemas["ProposalPreviewRequest"];

export interface ItemLineDraft {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly unit: EstimateUnit;
  readonly quantity: string;
  readonly ratePaise: number | null;
}

export interface LabourLineDraft {
  readonly id: string;
  readonly role: string;
  readonly team: string;
  readonly memberCount: number;
  readonly dayCount: number;
  readonly ratePaisePerDay: number | null;
}

export interface MaterialLineDraft {
  readonly id: string;
  readonly title: string;
  readonly quantity: string;
  readonly unit: string;
  readonly ratePaise: number | null;
}

export interface OtherChargeDraft {
  readonly id: string;
  readonly code: ChargeCode;
  readonly label: string;
  readonly amountPaise: number | null;
}

export interface InstallmentDraft {
  readonly id: string;
  readonly title: string;
  readonly deliverable: string;
  readonly amountPaise: number | null;
  readonly endsOn: string | null;
}

export interface CommercialEstimateDraft {
  readonly mode: EstimateMode | null;
  readonly itemLines: readonly ItemLineDraft[];
  readonly labourLines: readonly LabourLineDraft[];
  readonly materialLines: readonly MaterialLineDraft[];
  readonly otherCharges: readonly OtherChargeDraft[];
  readonly installments: readonly InstallmentDraft[];
  /** What the vendor will do, in a few sentences. The first thing the customer reads. */
  readonly scopeSummary: string;
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly warrantyTerms: string;
  readonly validUntil: string | null;
}

export const ESTIMATE_UNITS: readonly { value: EstimateUnit; label: string }[] = [
  { value: "each", label: "Nos" },
  { value: "job", label: "Job" },
  { value: "day", label: "Days" },
  { value: "hour", label: "Hours" },
  { value: "sq_ft", label: "Sq ft" },
  { value: "running_ft", label: "Running ft" },
  { value: "metre", label: "Metre" },
  { value: "kg", label: "Kg" },
  { value: "litre", label: "Litre" },
  { value: "set", label: "Set" },
];

export const CHARGE_OPTIONS: readonly { value: ChargeCode; label: string }[] = [
  { value: "TRANSPORT", label: "Transportation" },
  { value: "LOADING_UNLOADING", label: "Loading and unloading" },
  { value: "DISPOSAL", label: "Waste disposal" },
  { value: "EQUIPMENT_DELIVERY", label: "Equipment delivery" },
  { value: "PERMIT", label: "Permit or approval" },
  { value: "CUSTOM", label: "Other named charge" },
];

export const EMPTY_COMMERCIAL_ESTIMATE: CommercialEstimateDraft = {
  mode: null,
  itemLines: [],
  labourLines: [],
  materialLines: [],
  otherCharges: [],
  installments: [],
  scopeSummary: "",
  inclusions: [],
  exclusions: [],
  warrantyTerms: "",
  validUntil: null,
};

export function newItemLine(id: string, title = "", category = "Work"): ItemLineDraft {
  return { id, category, title, unit: "job", quantity: "1", ratePaise: null };
}

export function newLabourLine(id: string, role = ""): LabourLineDraft {
  return { id, role, team: "", memberCount: 1, dayCount: 1, ratePaisePerDay: null };
}

export function newMaterialLine(id: string, title = "", unit = ""): MaterialLineDraft {
  return { id, title, quantity: "1", unit, ratePaise: null };
}

export function newInstallment(id: string): InstallmentDraft {
  return { id, title: "", deliverable: "", amountPaise: null, endsOn: null };
}

function decimal(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function itemLineAmount(line: ItemLineDraft): number | null {
  const quantity = decimal(line.quantity);
  return quantity === null || line.ratePaise === null || line.ratePaise <= 0
    ? null
    : Math.round(quantity * line.ratePaise);
}

export function labourLineAmount(line: LabourLineDraft): number | null {
  return line.ratePaisePerDay === null || line.ratePaisePerDay <= 0
    ? null
    : line.memberCount * line.dayCount * line.ratePaisePerDay;
}

export function materialLineAmount(line: MaterialLineDraft): number | null {
  const quantity = decimal(line.quantity);
  return quantity === null || line.ratePaise === null || line.ratePaise <= 0
    ? null
    : Math.round(quantity * line.ratePaise);
}

function completeSum(values: readonly (number | null)[]): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function selectedLineSubtotal(draft: CommercialEstimateDraft): number | null {
  if (draft.mode === "ITEM_WISE") return completeSum(draft.itemLines.map(itemLineAmount));
  if (draft.mode === "LABOUR_WISE") {
    return completeSum(draft.labourLines.map(labourLineAmount));
  }
  return null;
}

export function authorizedChargeSubtotal(draft: CommercialEstimateDraft): number | null {
  if (draft.otherCharges.length === 0) return 0;
  return completeSum(draft.otherCharges.map((charge) => charge.amountPaise));
}

export function partnerServiceSubtotal(draft: CommercialEstimateDraft): number | null {
  const lines = selectedLineSubtotal(draft);
  const charges = authorizedChargeSubtotal(draft);
  return lines === null || charges === null ? null : lines + charges;
}

export function materialSubtotal(draft: CommercialEstimateDraft): number | null {
  if (draft.materialLines.length === 0) return 0;
  return completeSum(draft.materialLines.map(materialLineAmount));
}

export function allocatedInstallmentSubtotal(draft: CommercialEstimateDraft): number {
  return draft.installments.reduce((total, row) => total + (row.amountPaise ?? 0), 0);
}

export type CommercialEstimateErrors = Readonly<Record<string, string>>;

export function validateCommercialEstimate(
  draft: CommercialEstimateDraft,
): CommercialEstimateErrors {
  const errors: Record<string, string> = {};
  if (draft.mode === null) {
    errors.mode = "Choose Item-wise or Labour-wise pricing.";
  } else if (draft.mode === "ITEM_WISE") {
    if (draft.itemLines.length === 0) errors.lines = "Add at least one priced item.";
    draft.itemLines.forEach((line, index) => {
      if (line.category.trim() === "" || line.title.trim() === "") {
        errors[`item-${index}`] = "Name the category and item.";
      } else if (itemLineAmount(line) === null) {
        errors[`item-${index}`] = "Enter a quantity and rate greater than zero.";
      }
    });
  } else {
    if (draft.labourLines.length === 0) errors.lines = "Add at least one labour role.";
    draft.labourLines.forEach((line, index) => {
      if (line.role.trim() === "") errors[`labour-${index}`] = "Name this role or team.";
      else if (line.memberCount < 1 || line.dayCount < 1 || labourLineAmount(line) === null) {
        errors[`labour-${index}`] = "Enter members, days and a daily rate greater than zero.";
      }
    });
  }

  draft.materialLines.forEach((line, index) => {
    if (line.title.trim() === "") errors[`material-${index}`] = "Name this material.";
    else if (materialLineAmount(line) === null) {
      errors[`material-${index}`] = "Enter a quantity and rate greater than zero.";
    }
  });
  draft.otherCharges.forEach((charge, index) => {
    if (charge.label.trim() === "" || (charge.amountPaise ?? 0) <= 0) {
      errors[`charge-${index}`] = "Give this charge a clear label and amount.";
    }
  });

  if (draft.scopeSummary.trim().length < 20) {
    // The one prose field on the estimate, and the one the customer reads first. A line
    // list without it is an invoice; twenty characters is "Full strip-out and retile."
    errors.scopeSummary = "Say what you will do, in a sentence or two.";
  }

  const serviceSubtotal = partnerServiceSubtotal(draft);
  if (draft.installments.length === 0) {
    errors.installments = "Add at least one payment installment.";
  } else if (
    draft.installments.some(
      (row) => row.title.trim() === "" || (row.amountPaise ?? 0) <= 0,
    )
  ) {
    errors.installments = "Name every installment and enter its service amount.";
  } else if (
    serviceSubtotal !== null &&
    allocatedInstallmentSubtotal(draft) !== serviceSubtotal
  ) {
    errors.installments = "Installments must exactly match priced work and named charges.";
  }
  return errors;
}

export function hasCommercialEstimateErrors(errors: CommercialEstimateErrors): boolean {
  return Object.keys(errors).length > 0;
}

function requestBody(input: {
  invitationId: string;
  siteVisitId: string;
  draft: CommercialEstimateDraft;
}): ProposalRequest {
  const { draft } = input;
  if (hasCommercialEstimateErrors(validateCommercialEstimate(draft)) || draft.mode === null) {
    throw new Error("An incomplete estimate cannot be sent.");
  }
  return {
    invitation_id: input.invitationId,
    site_visit_id: input.siteVisitId,
    estimate_type: draft.mode,
    item_lines:
      draft.mode === "ITEM_WISE"
        ? draft.itemLines.map((line) => ({
            category: line.category.trim(),
            title: line.title.trim(),
            unit: line.unit,
            quantity: line.quantity,
            rate_paise: line.ratePaise as number,
          }))
        : [],
    labour_lines:
      draft.mode === "LABOUR_WISE"
        ? draft.labourLines.map((line) => ({
            role: line.role.trim(),
            team: line.team.trim(),
            member_count: line.memberCount,
            day_count: line.dayCount,
            rate_paise_per_day: line.ratePaisePerDay as number,
          }))
        : [],
    material_lines: draft.materialLines.map((line) => ({
      title: line.title.trim(),
      quantity: line.quantity,
      unit: line.unit.trim(),
      rate_paise: line.ratePaise as number,
    })),
    other_charges: draft.otherCharges.map((charge) => ({
      code: charge.code,
      label: charge.label.trim(),
      amount_paise: charge.amountPaise as number,
    })),
    stages: draft.installments.map((row) => ({
      title: row.title.trim(),
      deliverable: row.deliverable.trim(),
      amount_paise: row.amountPaise as number,
      ends_on: row.endsOn,
    })),
    scope_summary: draft.scopeSummary.trim(),
    inclusions: draft.inclusions.map((line) => line.trim()).filter(Boolean),
    exclusions: draft.exclusions.map((line) => line.trim()).filter(Boolean),
    warranty_terms: draft.warrantyTerms.trim(),
    valid_until: draft.validUntil,
  };
}

export function toCommercialProposalRequest(input: {
  invitationId: string;
  siteVisitId: string;
  draft: CommercialEstimateDraft;
}): ProposalRequest {
  return requestBody(input);
}

export function toCommercialPreviewRequest(input: {
  invitationId: string;
  siteVisitId: string;
  draft: CommercialEstimateDraft;
}): ProposalPreviewRequest {
  return requestBody(input);
}

export function commercialEstimateFingerprint(body: ProposalPreviewRequest): string {
  return JSON.stringify(body);
}

export function hasEnteredModeData(draft: CommercialEstimateDraft): boolean {
  return (
    draft.itemLines.some((line) => line.title.trim() !== "" || line.ratePaise !== null) ||
    draft.labourLines.some((line) => line.role.trim() !== "" || line.ratePaisePerDay !== null)
  );
}

const STORAGE_PREFIX = "vsolve.m2.commercial-estimate.v1.";

export function saveCommercialEstimate(invitationId: string, draft: CommercialEstimateDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${invitationId}`, JSON.stringify(draft));
  } catch {
    // Losing autosave is survivable; the controlled form remains intact.
  }
}

export function loadCommercialEstimate(invitationId: string): CommercialEstimateDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${invitationId}`);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<CommercialEstimateDraft>;
    if (!Array.isArray(parsed.itemLines) || !Array.isArray(parsed.labourLines)) return null;
    if (!Array.isArray(parsed.materialLines) || !Array.isArray(parsed.installments)) return null;
    return { ...EMPTY_COMMERCIAL_ESTIMATE, ...parsed } as CommercialEstimateDraft;
  } catch {
    return null;
  }
}

export function clearCommercialEstimate(invitationId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${invitationId}`);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
