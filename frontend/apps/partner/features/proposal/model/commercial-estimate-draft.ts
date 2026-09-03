import type { Schemas } from "@vsolve/api-client";

export type EstimateMode = Schemas["EstimateTypeEnum"];
export type EstimateUnit = Schemas["UnitEnum"];
export type ChargeCode = Schemas["ProposalOtherChargeCodeEnum"];
export type ProposalRequest = Schemas["ProposalCreateRequest"];
export type ProposalPreviewRequest = Schemas["ProposalPreviewRequest"];
export type MaterialBrandTier = Schemas["MaterialBrandTierEnum"] | "";
export type MaterialListLine = Schemas["ProposalMaterialListLineRequest"];
export type PriceBookEntry = Schemas["PriceBookEntry"];

/**
 * The item-wise / labour-wise estimate as the vendor builds it (contract 1.48.0).
 *
 * ## Two kinds of item line, one shape
 *
 * A **catalogue** line names its `workItemId` and is band-checked by the server
 * against the city's floor and ceiling — the band travels on the line so the
 * composer can refuse an out-of-band rate before the round trip. A **custom**
 * line is anything the vendor named themselves on site: no id, `isCustom`
 * true, and the server screens its title. The detailed composer's typed rows
 * are custom lines by definition, which is why `newItemLine` marks them so.
 *
 * ## Materials are the customer's to buy
 *
 * The estimate hands the customer a shopping list — quantities and a spec,
 * never a price. The server suggests that list from the tapped catalogue
 * items' recipes (`suggested_material_list` on the preview), and the vendor
 * corrects it after the visit. The draft therefore does not hold the list
 * itself; it holds the vendor's **edits** to it — changed quantities, removed
 * rows, added rows — keyed by `title|unit`, and `resolveMaterialList` applies
 * them to whatever the latest preview suggested. That is what lets a later
 * preview add a row for a newly tapped point without undoing a quantity the
 * vendor already fixed, and what keeps the list stable across a reload.
 *
 * `materialLines` (priced material advances) is the older row type the
 * detailed composer still offers; the tap flow never adds one.
 */

export interface ItemLineDraft {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly unit: EstimateUnit;
  readonly quantity: string;
  readonly ratePaise: number | null;
  /** The catalogue item this prices, or null for a line the vendor named. */
  readonly workItemId: string | null;
  readonly isCustom: boolean;
  /** The city band for a catalogue line, when the server published one. */
  readonly floorPaise?: number | null;
  readonly ceilingPaise?: number | null;
}

export interface LabourLineDraft {
  readonly id: string;
  readonly role: string;
  readonly team: string;
  readonly memberCount: number;
  readonly dayCount: number;
  readonly ratePaisePerDay: number | null;
  /** The catalogue labour item behind this role, or null for one the vendor added. */
  readonly workItemId?: string | null;
  readonly floorPaise?: number | null;
  readonly ceilingPaise?: number | null;
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

/** One thing the customer should buy. Quantities and a spec — never money. */
export interface MaterialListLineDraft {
  readonly title: string;
  readonly spec: string;
  readonly unit: string;
  readonly quantity: string;
  readonly note: string;
}

export type PaymentTemplate = "HALF" | "THIRDS" | "COMPLETION" | "CUSTOM";

export interface CommercialEstimateDraft {
  readonly mode: EstimateMode | null;
  readonly itemLines: readonly ItemLineDraft[];
  readonly labourLines: readonly LabourLineDraft[];
  readonly materialLines: readonly MaterialLineDraft[];
  readonly otherCharges: readonly OtherChargeDraft[];
  readonly installments: readonly InstallmentDraft[];
  /**
   * Which payment split the installments were allocated from. Anything but
   * `CUSTOM` is re-allocated whenever the service amount moves.
   */
  readonly paymentTemplate: PaymentTemplate;
  /** What the vendor will do. Optional now — composed from the tapped items when blank. */
  readonly scopeSummary: string;
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly warrantyTerms: string;
  /**
   * Working days the vendor expects the job to take, or null while unstated.
   *
   * Days rather than a date: the start waits on the Customer choosing and paying, so a
   * date picked on site is stale before it is read. The figure is also a commitment —
   * the total is locked at acceptance, so an overrun is the vendor's to absorb.
   */
  readonly completionDays: number | null;
  readonly validUntil: string | null;
  /** Quantity edits to suggested material rows, keyed by `title|unit`. */
  readonly materialQuantityEdits: Readonly<Record<string, string>>;
  /** Suggested rows the vendor swiped away, as `title|unit` keys. */
  readonly materialRemovedKeys: readonly string[];
  /** Rows the vendor added themselves. */
  readonly materialAdded: readonly MaterialListLineDraft[];
  readonly materialBrandTier: MaterialBrandTier;
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
  paymentTemplate: "HALF",
  scopeSummary: "",
  inclusions: [],
  exclusions: [],
  warrantyTerms: "",
  completionDays: null,
  validUntil: null,
  materialQuantityEdits: {},
  materialRemovedKeys: [],
  materialAdded: [],
  materialBrandTier: "",
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Reopens the exact server-held estimate as an editable draft.
 *
 * A revision is append-only, but it should begin as a copy of the current
 * revision rather than an empty estimate. Every editable field published by
 * `ProposalSerializer` is mapped back here; server-derived totals are omitted
 * because preview recalculates them under the current policy before resubmit.
 */
export function commercialEstimateFromProposal(
  proposal: Schemas["Proposal"],
): CommercialEstimateDraft {
  const suppliedMaterials =
    proposal.material_fulfilment_mode === "PARTNER_TURNKEY"
      ? proposal.included_supply_list
      : proposal.material_list;
  const materialBrandTier: MaterialBrandTier =
    proposal.material_brand_tier === "STANDARD" || proposal.material_brand_tier === "PREMIUM"
      ? proposal.material_brand_tier
      : "";

  return {
    mode: proposal.estimate_type,
    itemLines: proposal.item_lines.map((line, index) => {
      const workItemId = line.work_item_id ?? null;
      return {
        id: workItemId === null ? `revision-item-${index + 1}` : catalogueLineId(workItemId),
        category: line.category ?? "",
        title: line.title,
        unit: line.unit,
        quantity: line.quantity,
        ratePaise: line.rate_paise,
        workItemId,
        isCustom: line.is_custom ?? workItemId === null,
      };
    }),
    labourLines: proposal.labour_lines.map((line, index) => ({
      id: `revision-labour-${index + 1}`,
      role: line.role,
      team: line.team,
      memberCount: line.member_count,
      dayCount: line.day_count,
      ratePaisePerDay: line.rate_paise_per_day,
      workItemId: null,
    })),
    materialLines: proposal.material_lines.map((line, index) => ({
      id: `revision-material-${index + 1}`,
      title: line.title,
      quantity: line.quantity,
      unit: line.unit,
      ratePaise: line.rate_paise ?? null,
    })),
    otherCharges: proposal.other_charges.map((charge, index) => ({
      id: `revision-charge-${index + 1}`,
      code: charge.code,
      label: charge.label,
      amountPaise: charge.amount_paise,
    })),
    installments: proposal.stages.map((stage, index) => ({
      id: `revision-stage-${index + 1}`,
      title: stage.title,
      deliverable: stage.deliverable,
      amountPaise: stage.amount_paise,
      // `ends_on` is optional on the wire — a stage with a name and an amount is
      // a complete stage — while the draft models "no end date" as null.
      endsOn: stage.ends_on ?? null,
    })),
    // Submitted stages are exact customer-facing terms, not a template that
    // should be silently reallocated when this draft mounts.
    paymentTemplate: "CUSTOM",
    scopeSummary: proposal.scope_summary,
    inclusions: stringList(proposal.inclusions),
    exclusions: stringList(proposal.exclusions),
    warrantyTerms: proposal.warranty_terms,
    completionDays: proposal.completion_days ?? null,
    validUntil: proposal.valid_until,
    materialQuantityEdits: {},
    materialRemovedKeys: [],
    materialAdded: suppliedMaterials.map((line) => ({
      title: line.title,
      spec: line.spec ?? "",
      unit: line.unit ?? "",
      quantity: line.quantity,
      note: line.note ?? "",
    })),
    materialBrandTier,
  };
}

/** A typed row. Custom by definition: nothing the vendor names has a catalogue id. */
export function newItemLine(id: string, title = "", category = ""): ItemLineDraft {
  return {
    id,
    category,
    title,
    unit: "job",
    quantity: "1",
    ratePaise: null,
    workItemId: null,
    isCustom: true,
  };
}

export function newLabourLine(id: string, role = ""): LabourLineDraft {
  return { id, role, team: "", memberCount: 1, dayCount: 1, ratePaisePerDay: null, workItemId: null };
}

export function newMaterialLine(id: string, title = "", unit = ""): MaterialLineDraft {
  return { id, title, quantity: "1", unit, ratePaise: null };
}

export function newInstallment(id: string): InstallmentDraft {
  return { id, title: "", deliverable: "", amountPaise: null, endsOn: null };
}

/* ---------------------------------------------------------------------------
   The price book on the line
   --------------------------------------------------------------------------- */

/** The line id a catalogue item always gets, so re-tapping finds the same row. */
export function catalogueLineId(workItemId: string): string {
  return `wi-${workItemId}`;
}

/** Rate the composer starts from: the vendor's own, else the city reference. */
export function defaultRateFor(entry: PriceBookEntry): number | null {
  return entry.partner_rate_paise ?? entry.reference_rate_paise ?? null;
}

/** The catalogue unit, narrowed to the wire enum. Anything else counts per item. */
export function catalogueUnitOf(entry: PriceBookEntry): EstimateUnit {
  const known = ESTIMATE_UNITS.find((unit) => unit.value === entry.work_item.unit);
  return known === undefined ? "each" : known.value;
}

export function isLabourEntry(entry: PriceBookEntry): boolean {
  return entry.work_item.unit === "day";
}

export function catalogueItemLine(entry: PriceBookEntry, quantity: number): ItemLineDraft {
  return {
    id: catalogueLineId(entry.work_item.id),
    category: entry.work_item.group ?? "",
    title: entry.work_item.name,
    unit: catalogueUnitOf(entry),
    quantity: String(quantity),
    ratePaise: defaultRateFor(entry),
    workItemId: entry.work_item.id,
    isCustom: false,
    floorPaise: entry.floor_paise,
    ceilingPaise: entry.ceiling_paise,
  };
}

export function catalogueLabourLine(entry: PriceBookEntry): LabourLineDraft {
  return {
    id: catalogueLineId(entry.work_item.id),
    role: entry.work_item.name,
    team: "",
    memberCount: 1,
    dayCount: 1,
    ratePaisePerDay: defaultRateFor(entry),
    workItemId: entry.work_item.id,
    floorPaise: entry.floor_paise,
    ceilingPaise: entry.ceiling_paise,
  };
}

/** `{ "1bhk": 6 }` → `6`, or null when the item has no quantity for this set. */
export function bundleQuantityOf(entry: PriceBookEntry, bundleKey: string): number | null {
  const bundles = entry.work_item.bundle_quantities;
  if (typeof bundles !== "object" || bundles === null || Array.isArray(bundles)) return null;
  const raw = (bundles as Record<string, unknown>)[bundleKey];
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Every quick-set key any item in the book knows, in first-seen order. */
export function bundleKeysOf(entries: readonly PriceBookEntry[]): string[] {
  const keys: string[] = [];
  for (const entry of entries) {
    const bundles = entry.work_item.bundle_quantities;
    if (typeof bundles !== "object" || bundles === null || Array.isArray(bundles)) continue;
    for (const key of Object.keys(bundles)) {
      if (!keys.includes(key) && bundleQuantityOf(entry, key) !== null) keys.push(key);
    }
  }
  return keys;
}

/** `1bhk` → `1 BHK`. Anything not of that shape is shown as sent. */
export function bundleLabel(key: string): string {
  const trimmed = key.trim();
  const match = /^(\d+)\s*bhk$/i.exec(trimmed);
  if (match) return `${match[1]} BHK`;
  // Area-sized trades (tiling, decor, waterproofing) publish `small` / `medium` /
  // `large`; anything else reads as the catalogue wrote it, capitalised.
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).replace(/[-_]+/g, " ");
}

/**
 * Apply a quick set: every item carrying a quantity for `bundleKey` is set to
 * it — added if absent, overwritten if present — and everything else is left
 * alone. Editable after, which is the whole point of "set" rather than "lock".
 */
/**
 * The quick set the current lines match exactly, or null.
 *
 * Derived rather than stored, so the chip lights up when a set is tapped and
 * goes quiet the moment the vendor edits a quantity away from it — which is the
 * honest reading of "selected": the set is what is on the estimate, not what
 * was last pressed. Every item the set names must sit at the set's quantity,
 * and no other catalogue line may be present.
 */
export function activeQuickSet(
  draft: CommercialEstimateDraft,
  entries: readonly PriceBookEntry[],
): string | null {
  const catalogueLines = draft.itemLines.filter((line) => !line.isCustom);
  if (catalogueLines.length === 0) return null;
  const quantityByItem = new Map(
    catalogueLines.map((line) => [line.workItemId, Number(line.quantity)] as const),
  );
  for (const key of bundleKeysOf(entries)) {
    let named = 0;
    let matches = true;
    for (const entry of entries) {
      if (isLabourEntry(entry)) continue;
      const expected = bundleQuantityOf(entry, key);
      const actual = quantityByItem.get(entry.work_item.id);
      if (expected === null) {
        if (actual !== undefined) matches = false;
        continue;
      }
      named += 1;
      if (actual !== expected) matches = false;
    }
    if (matches && named === quantityByItem.size) return key;
  }
  return null;
}

export function applyQuickSet(
  draft: CommercialEstimateDraft,
  entries: readonly PriceBookEntry[],
  bundleKey: string,
): CommercialEstimateDraft {
  let itemLines = draft.itemLines;
  for (const entry of entries) {
    if (isLabourEntry(entry)) continue;
    const quantity = bundleQuantityOf(entry, bundleKey);
    if (quantity === null) continue;
    itemLines = setCatalogueQuantity(itemLines, entry, quantity);
  }
  return { ...draft, mode: draft.mode ?? "ITEM_WISE", itemLines };
}

/** Set a catalogue item's quantity; zero removes the row. Keeps an edited rate. */
export function setCatalogueQuantity(
  lines: readonly ItemLineDraft[],
  entry: PriceBookEntry,
  quantity: number,
): readonly ItemLineDraft[] {
  const id = catalogueLineId(entry.work_item.id);
  const existing = lines.find((line) => line.id === id);
  if (quantity <= 0) return lines.filter((line) => line.id !== id);
  if (existing === undefined) return [...lines, catalogueItemLine(entry, quantity)];
  return lines.map((line) => (line.id === id ? { ...line, quantity: String(quantity) } : line));
}

export type BandCheck = "ok" | "below" | "above" | "unbanded";

/** Where a rate sits against the line's band. `unbanded` when none was published. */
export function checkBand(
  line: { readonly floorPaise?: number | null; readonly ceilingPaise?: number | null },
  ratePaise: number | null,
): BandCheck {
  if (ratePaise === null) return "ok";
  if (line.floorPaise == null || line.ceilingPaise == null) return "unbanded";
  if (ratePaise < line.floorPaise) return "below";
  if (ratePaise > line.ceilingPaise) return "above";
  return "ok";
}

/* ---------------------------------------------------------------------------
   Arithmetic
   --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
   Payment templates
   --------------------------------------------------------------------------- */

const TEMPLATE_PARTS: Record<Exclude<PaymentTemplate, "CUSTOM">, readonly { title: string; deliverable: string }[]> = {
  HALF: [
    { title: "To start", deliverable: "Work begins on site." },
    { title: "On finish", deliverable: "Work complete and handed over." },
  ],
  THIRDS: [
    { title: "To start", deliverable: "Work begins on site." },
    { title: "Midway", deliverable: "Half the work done." },
    { title: "On finish", deliverable: "Work complete and handed over." },
  ],
  COMPLETION: [{ title: "On completion", deliverable: "Work complete and handed over." }],
};

/**
 * Split a service amount into the template's parts.
 *
 * Whole paise, equal parts, and the remainder on the **last** one — the server
 * reconciles the sum exactly, and the customer's first payment being the round
 * figure is the one people check.
 */
export function allocateInstallments(totalPaise: number, template: Exclude<PaymentTemplate, "CUSTOM">): number[] {
  const parts = TEMPLATE_PARTS[template].length;
  const share = Math.floor(totalPaise / parts);
  const amounts = Array.from({ length: parts }, () => share);
  amounts[parts - 1] = totalPaise - share * (parts - 1);
  return amounts;
}

/**
 * Installments from the template, against the current service amount.
 *
 * A `CUSTOM` draft is returned untouched: the vendor has taken the rows over.
 * With no priced amount yet the rows are still created so the shape is there,
 * just with nothing allocated.
 */
export function withTemplateInstallments(draft: CommercialEstimateDraft): CommercialEstimateDraft {
  if (draft.paymentTemplate === "CUSTOM") return draft;
  const total = partnerServiceSubtotal(draft);
  const parts = TEMPLATE_PARTS[draft.paymentTemplate];
  const amounts = total === null ? parts.map(() => null) : allocateInstallments(total, draft.paymentTemplate);
  const installments = parts.map((part, index) => ({
    id: `template-${draft.paymentTemplate.toLowerCase()}-${index + 1}`,
    title: part.title,
    deliverable: part.deliverable,
    amountPaise: amounts[index] ?? null,
    endsOn: draft.installments[index]?.endsOn ?? null,
  }));
  const unchanged =
    installments.length === draft.installments.length &&
    installments.every((row, index) => {
      const current = draft.installments[index];
      return (
        current !== undefined &&
        current.id === row.id &&
        current.title === row.title &&
        current.deliverable === row.deliverable &&
        current.amountPaise === row.amountPaise &&
        current.endsOn === row.endsOn
      );
    });
  return unchanged ? draft : { ...draft, installments };
}

/* ---------------------------------------------------------------------------
   Auto text
   --------------------------------------------------------------------------- */

const MAX_SCOPE = 2000;

/** "Light point ×8, Fan point ×3" — from what was tapped, never typed. */
export function composeScopeSummary(draft: CommercialEstimateDraft): string {
  const parts =
    draft.mode === "LABOUR_WISE"
      ? draft.labourLines
          .filter((line) => line.role.trim() !== "")
          .map((line) => `${line.role.trim()} ×${line.memberCount} for ${line.dayCount} ${line.dayCount === 1 ? "day" : "days"}`)
      : draft.itemLines
          .filter((line) => line.title.trim() !== "")
          .map((line) => `${line.title.trim()} ×${line.quantity}`);
  let summary = "";
  for (const part of parts) {
    const next = summary === "" ? part : `${summary}, ${part}`;
    if (next.length > MAX_SCOPE) break;
    summary = next;
  }
  return summary;
}

/** The tapped names, as inclusions, on top of whatever chips were tapped. */
export function autoInclusions(draft: CommercialEstimateDraft): string[] {
  const names =
    draft.mode === "LABOUR_WISE"
      ? draft.labourLines.map((line) => line.role.trim())
      : draft.itemLines.map((line) => line.title.trim());
  const merged = [...draft.inclusions.map((line) => line.trim()), ...names];
  return merged.filter((line, index) => line !== "" && merged.indexOf(line) === index);
}

/** The draft with its scope and inclusions filled from the tapped items where blank. */
export function withAutoText(draft: CommercialEstimateDraft): CommercialEstimateDraft {
  return {
    ...draft,
    scopeSummary: draft.scopeSummary.trim() === "" ? composeScopeSummary(draft) : draft.scopeSummary,
    inclusions: autoInclusions(draft),
  };
}

/* ---------------------------------------------------------------------------
   The shopping list
   --------------------------------------------------------------------------- */

export function materialKey(line: { readonly title: string; readonly unit: string }): string {
  return `${line.title.trim().toLowerCase()}|${line.unit.trim().toLowerCase()}`;
}

/**
 * The list the customer will see: the server's suggestion with the vendor's
 * edits applied.
 *
 * Suggested rows come first in the server's order; a quantity the vendor set
 * wins over the suggested one; a row they removed stays gone even when a later
 * preview suggests it again; rows they added come last. A row the vendor added
 * that a later preview also suggests is shown once, with the vendor's quantity.
 */
export function resolveMaterialList(
  suggested: readonly MaterialListLineDraft[],
  draft: CommercialEstimateDraft,
): MaterialListLineDraft[] {
  const removed = new Set(draft.materialRemovedKeys);
  const addedByKey = new Map(draft.materialAdded.map((row) => [materialKey(row), row]));
  const seen = new Set<string>();
  const rows: MaterialListLineDraft[] = [];
  for (const line of suggested) {
    const key = materialKey(line);
    if (removed.has(key) || seen.has(key)) continue;
    seen.add(key);
    // The vendor's number wins over the preview's, whichever way they set it:
    // an explicit quantity edit first, else the row they added themselves
    // before the server got around to suggesting the same material.
    const quantity = draft.materialQuantityEdits[key] ?? addedByKey.get(key)?.quantity;
    rows.push(quantity === undefined ? line : { ...line, quantity });
  }
  for (const line of draft.materialAdded) {
    const key = materialKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(line);
  }
  return rows;
}

export function setMaterialQuantity(
  draft: CommercialEstimateDraft,
  line: MaterialListLineDraft,
  quantity: string,
): CommercialEstimateDraft {
  const key = materialKey(line);
  const added = draft.materialAdded.some((row) => materialKey(row) === key);
  if (added) {
    return {
      ...draft,
      materialAdded: draft.materialAdded.map((row) =>
        materialKey(row) === key ? { ...row, quantity } : row,
      ),
    };
  }
  return { ...draft, materialQuantityEdits: { ...draft.materialQuantityEdits, [key]: quantity } };
}

export function removeMaterial(
  draft: CommercialEstimateDraft,
  line: MaterialListLineDraft,
): CommercialEstimateDraft {
  const key = materialKey(line);
  const edits = Object.fromEntries(
    Object.entries(draft.materialQuantityEdits).filter(([entry]) => entry !== key),
  );
  return {
    ...draft,
    materialAdded: draft.materialAdded.filter((row) => materialKey(row) !== key),
    materialQuantityEdits: edits,
    materialRemovedKeys: draft.materialRemovedKeys.includes(key)
      ? draft.materialRemovedKeys
      : [...draft.materialRemovedKeys, key],
  };
}

export function addMaterial(
  draft: CommercialEstimateDraft,
  line: MaterialListLineDraft,
): CommercialEstimateDraft {
  const key = materialKey(line);
  return {
    ...draft,
    // Adding back something removed un-removes it rather than shadowing it.
    materialRemovedKeys: draft.materialRemovedKeys.filter((entry) => entry !== key),
    materialAdded: [
      ...draft.materialAdded.filter((row) => materialKey(row) !== key),
      { ...line, title: line.title.trim(), unit: line.unit.trim() },
    ],
  };
}

export function toMaterialListRequest(rows: readonly MaterialListLineDraft[]): MaterialListLine[] {
  return rows
    .filter((row) => row.title.trim() !== "")
    .map((row) => ({
      title: row.title.trim(),
      spec: row.spec.trim(),
      unit: row.unit.trim(),
      quantity: row.quantity,
      note: row.note.trim(),
    }));
}

/**
 * Put one material schedule on exactly one wire field.
 *
 * Both fields deliberately share a row shape, but not a meaning: one is work
 * for the customer, the other is disclosure of what the partner supplies.
 */
export function materialFulfilmentFields(
  mode: "CUSTOMER_PROCURES" | "PARTNER_TURNKEY",
  rows: readonly MaterialListLineDraft[],
  brandTier: MaterialBrandTier,
): Pick<ProposalRequest, "material_list" | "included_supply_list" | "material_brand_tier"> {
  const materials = toMaterialListRequest(rows);
  return mode === "PARTNER_TURNKEY"
    ? {
        material_list: [],
        included_supply_list: materials,
        material_brand_tier: "",
      }
    : {
        material_list: materials,
        included_supply_list: [],
        material_brand_tier: brandTier,
      };
}

/* ---------------------------------------------------------------------------
   Validation
   --------------------------------------------------------------------------- */

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
      if (line.title.trim() === "") {
        errors[`item-${index}`] = "Name the item.";
      } else if (itemLineAmount(line) === null) {
        errors[`item-${index}`] = "Enter a quantity and rate greater than zero.";
      } else if (checkBand(line, line.ratePaise) === "below" || checkBand(line, line.ratePaise) === "above") {
        errors[`item-${index}`] = "This rate is outside the allowed range.";
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

  // No minimum on the scope summary any more: it is composed from the tapped
  // items when the vendor leaves it blank, so a blank here is never a blank on
  // the customer's page.

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

/* ---------------------------------------------------------------------------
   Wire mapping
   --------------------------------------------------------------------------- */

function requestBody(input: {
  invitationId: string;
  siteVisitId: string;
  draft: CommercialEstimateDraft;
}): ProposalRequest {
  const draft = withAutoText(input.draft);
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
            // A catalogue line names its item and is band-checked; a custom
            // line says so and is title-screened. Never both, never neither.
            ...(line.isCustom || line.workItemId === null
              ? { is_custom: true }
              : { work_item_id: line.workItemId, is_custom: false }),
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
    completion_days: draft.completionDays,
    valid_until: draft.validUntil,
    material_brand_tier: draft.materialBrandTier,
  };
}

/**
 * The submit body.
 *
 * `materialList` is the resolved shopping list — the latest suggestion with the
 * vendor's edits applied — and is passed in rather than read off the draft
 * because the draft holds edits, not the list. See the module note.
 */
export function toCommercialProposalRequest(input: {
  invitationId: string;
  siteVisitId: string;
  draft: CommercialEstimateDraft;
  materialList?: readonly MaterialListLineDraft[];
}): ProposalRequest {
  return {
    ...requestBody(input),
    material_list: toMaterialListRequest(input.materialList ?? []),
  };
}

/**
 * The preview body — everything that moves money, and nothing that does not.
 *
 * The shopping list is deliberately left off: it carries no price, so it cannot
 * change a total, and including it would make the preview's own suggestion part
 * of the fingerprint that decides whether the preview is current.
 */
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

/* ---------------------------------------------------------------------------
   Autosave
   --------------------------------------------------------------------------- */

const STORAGE_PREFIX = "vsolve.m2.commercial-estimate.v1.";

export function saveCommercialEstimate(invitationId: string, draft: CommercialEstimateDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${invitationId}`, JSON.stringify(draft));
  } catch {
    // Losing autosave is survivable; the controlled form remains intact.
  }
}

/**
 * A stored draft is untrusted input: it survives a deploy and may have been
 * written by an older bundle. Rows from before 1.48.0 carry no `isCustom`, and
 * a typed row with no catalogue id is custom by definition.
 */
export function loadCommercialEstimate(invitationId: string): CommercialEstimateDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${invitationId}`);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<CommercialEstimateDraft>;
    if (!Array.isArray(parsed.itemLines) || !Array.isArray(parsed.labourLines)) return null;
    if (!Array.isArray(parsed.materialLines) || !Array.isArray(parsed.installments)) return null;
    const draft = { ...EMPTY_COMMERCIAL_ESTIMATE, ...parsed } as CommercialEstimateDraft;
    return {
      ...draft,
      itemLines: draft.itemLines.map((line) => ({
        ...line,
        workItemId: typeof line.workItemId === "string" ? line.workItemId : null,
        isCustom: typeof line.isCustom === "boolean" ? line.isCustom : typeof line.workItemId !== "string",
      })),
      // Rows written before templates existed were typed by hand.
      paymentTemplate: parsed.paymentTemplate ?? (draft.installments.length > 0 ? "CUSTOM" : "HALF"),
      materialAdded: Array.isArray(draft.materialAdded) ? draft.materialAdded : [],
      materialRemovedKeys: Array.isArray(draft.materialRemovedKeys) ? draft.materialRemovedKeys : [],
      materialQuantityEdits:
        typeof draft.materialQuantityEdits === "object" && draft.materialQuantityEdits !== null
          ? draft.materialQuantityEdits
          : {},
    };
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
