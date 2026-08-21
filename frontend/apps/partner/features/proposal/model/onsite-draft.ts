import type { Schemas } from "@vsolve/api-client";

import type { AnswerMap } from "@/features/enquiry/model/requirement-facts";
import { readDurationDays } from "@/features/enquiry/model/requirement-facts";

import { toStageRequests, type StageDraft, type TaxBasis } from "./proposal-draft";

/**
 * The A5 estimate as it is written **on site**, on a phone, standing up.
 *
 * Closes the decision half of `M2-FE-315`. Pure: no React, no network, no
 * storage — the persistence seam lives at the bottom and is a pair of named
 * functions rather than an effect scattered through a form.
 *
 * ## What makes this a different draft from `A5Draft`
 *
 * Not the fields the server takes — those are identical, because there is one
 * `ProposalCreateRequest`. What changes is what the *vendor* is asked for:
 *
 * | Remote A5 composer | On-site mode |
 * |---|---|
 * | A calendar date per stage | **Working days per stage**, and one start date |
 * | Stages carry everything | **Material lines are their own rows** |
 * | Written at a desk | Numeric keyboards, large targets, saved on every blur |
 *
 * "Working days as the schedule" is the ergonomic decision that matters most. A
 * contractor standing in a half-wired flat knows "three days for the chasing";
 * they do not know, and should not have to count out, that this makes it the
 * 21st. So the vendor types days and the screen shows the date it lands on,
 * **with the arithmetic stated** — every day counted from the start, weekends
 * included — rather than applying a working-week rule this client has no
 * calendar for. `ends_on` is optional on the wire, so a vendor who will not
 * commit to a day simply leaves the field empty and no date is sent.
 *
 * ## Material lines are a row type of their own now
 *
 * `M2-FE-315` requires material line items as first-class rows. Until 1.26.0 the
 * wire carried exactly one money-carrying row type — `ProposalStage` — so a
 * material line was **sent as a stage** and the composer carried an on-screen
 * caveat saying so. That was commercially wrong rather than merely untidy: a
 * stage is a unit of evidence, approval and release, so a bag of cement arrived
 * as a fundable milestone somebody had to approve *as work*.
 *
 * **1.26.0 publishes `ProposalMaterialLine`** — `{title, quantity, unit,
 * amount_paise}` — on `ProposalCreateRequest.material_lines`, and
 * `EngagementStage.kind` (`WORK` | `MATERIAL_ADVANCE`) carries the distinction
 * through to the engagement. So the workaround is gone: work rows go to
 * `stages`, material rows go to `material_lines`, and the §7 row is closed.
 *
 * `quantity` and `unit` are collected because they are what makes a material
 * line comparable — "cement, ₹1,20,000" against "cement, 40 bags at ₹3,000".
 * `unit` is free text on the wire and here, because bags, cubic metres and
 * running feet are all real and a closed list would refuse whichever trade
 * nobody thought of. Both are optional to the vendor: `quantity` defaults to 1
 * and `unit` to blank, exactly as the serializer does.
 *
 * `_assert_a5_shape` now reconciles **stages plus materials** against
 * `total_paise` and still refuses a material-only estimate — "we will buy
 * materials and do no work" is not a project — which is why `validateOnsite`
 * keeps requiring at least one named piece of work.
 */

export interface OnsiteStageDraft {
  /** What this piece of work is. Sent as the stage `title`. */
  readonly title: string;
  /** What the customer has when it is done. Sent as `deliverable`. */
  readonly deliverable: string;
  /** How many days of work. The schedule input; `ends_on` is derived from it. */
  readonly workingDays: number | null;
  readonly amountPaise: number | null;
}

export interface MaterialDraft {
  /** What the material is, in the vendor's words. Sent as `title`. */
  readonly description: string;
  /**
   * How many. Null while unanswered; sent as the serializer's own default of 1.
   *
   * `quantity` is `IntegerField(min_value=1)` on the wire, so a fraction or a
   * zero is refused there — `readCount` is what keeps it whole here.
   */
  readonly quantity: number | null;
  /** Bags, metres, coils. Free text, capped at the wire's 32 characters. */
  readonly unit: string;
  /** The whole line's cost, not the unit price. The wire has one money field. */
  readonly amountPaise: number | null;
}

export interface OnsiteDraft {
  /** ISO date the work would start. Prefilled from the customer's own answer. */
  readonly startsOn: string | null;
  readonly stages: readonly OnsiteStageDraft[];
  readonly materials: readonly MaterialDraft[];
  readonly exclusions: readonly string[];
  readonly warrantyTerms: string;
  readonly validUntil: string | null;
  readonly taxBasis: TaxBasis | null;
  readonly taxPaise: number;
}

export const EMPTY_ONSITE_STAGE: OnsiteStageDraft = {
  title: "",
  deliverable: "",
  workingDays: null,
  amountPaise: null,
};

export const EMPTY_MATERIAL: MaterialDraft = {
  description: "",
  quantity: null,
  unit: "",
  amountPaise: null,
};

export const EMPTY_ONSITE_DRAFT: OnsiteDraft = {
  startsOn: null,
  stages: [EMPTY_ONSITE_STAGE],
  materials: [],
  exclusions: [],
  warrantyTerms: "",
  validUntil: null,
  taxBasis: null,
  taxPaise: 0,
};

/* ---------------------------------------------------------------------------
   Prefill
   --------------------------------------------------------------------------- */

/**
 * The draft a vendor starts from, built from what the customer and the visit
 * already said.
 *
 * **Prefill, not placeholder.** Every value below comes from a field the server
 * sent: the customer's own `duration_days` answer becomes the first stage's
 * working days, and the requirement's `requested_start` becomes the start date.
 * Where the customer said nothing, the field is empty and it is a real question.
 * Nothing is invented to make the form look filled in.
 *
 * The tax basis is prefilled **only** when another vendor has already fixed it
 * (`required_tax_basis`), because at that point it is not a choice — a mismatch
 * is refused. When it is blank this vendor is the one who sets it, so it stays
 * unanswered rather than defaulted.
 */
export function prefillOnsiteDraft(input: {
  readonly answers: AnswerMap;
  readonly requestedStart: string | null;
  readonly requiredTaxBasis: string;
}): OnsiteDraft {
  const days = readDurationDays(input.answers);
  const basis =
    input.requiredTaxBasis === "INCLUSIVE" || input.requiredTaxBasis === "EXCLUSIVE"
      ? (input.requiredTaxBasis as TaxBasis)
      : null;

  return {
    ...EMPTY_ONSITE_DRAFT,
    startsOn: input.requestedStart ? input.requestedStart.slice(0, 10) : null,
    stages: [{ ...EMPTY_ONSITE_STAGE, workingDays: days }],
    taxBasis: basis,
  };
}

/* ---------------------------------------------------------------------------
   The schedule
   --------------------------------------------------------------------------- */

/** `2026-08-18` + 4 -> `2026-08-22`. UTC arithmetic on a date-only string. */
function addDays(isoDate: string, days: number): string | null {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

export interface ScheduledStage {
  readonly stage: OnsiteStageDraft;
  readonly startsOn: string | null;
  /** The derived end date, or null when there is no start or no day count. */
  readonly endsOn: string | null;
}

/**
 * Working days laid end to end from the start date.
 *
 * Stages run consecutively, which is what a single crew on one site actually
 * does. A stage of `n` days that begins on day `d` ends on `d + n - 1`, so a
 * one-day stage starting on the 18th ends on the 18th rather than the 19th.
 *
 * **Every day is counted, weekends included**, and the composer says so beside
 * the derived date. A working-week rule would need a holiday calendar this
 * client does not have and the server does not publish for this field — and a
 * silently skipped Sunday is a date the vendor did not agree to.
 */
export function scheduleFor(draft: OnsiteDraft): ScheduledStage[] {
  let cursor = 0;
  return draft.stages.map((stage) => {
    if (draft.startsOn === null || stage.workingDays === null || stage.workingDays <= 0) {
      return { stage, startsOn: null, endsOn: null };
    }
    const startsOn = addDays(draft.startsOn, cursor);
    cursor += stage.workingDays;
    return { stage, startsOn, endsOn: addDays(draft.startsOn, cursor - 1) };
  });
}

/** The whole job's length in days, or null while any stage is unanswered. */
export function totalWorkingDays(draft: OnsiteDraft): number | null {
  let total = 0;
  for (const stage of draft.stages) {
    if (stage.workingDays === null || stage.workingDays <= 0) return null;
    total += stage.workingDays;
  }
  return draft.stages.length === 0 ? null : total;
}

/* ---------------------------------------------------------------------------
   Arithmetic
   --------------------------------------------------------------------------- */

/**
 * Work plus materials, or null while anything is unpriced.
 *
 * `null` rather than `0`: a zero total reads as "free", and showing one while a
 * field is still empty tells a vendor something untrue about an estimate they
 * are mid-way through writing. The server reconciles the stage amounts against
 * this figure and refuses a mismatch, which is why nothing here lets a total be
 * typed.
 */
export function onsiteTotal(draft: OnsiteDraft): number | null {
  const rows = [
    ...draft.stages.map((stage) => stage.amountPaise),
    ...draft.materials.map((material) => material.amountPaise),
  ];
  if (rows.length === 0) return null;
  let total = 0;
  for (const amount of rows) {
    if (amount === null || amount <= 0) return null;
    total += amount;
  }
  return total;
}

export function materialsTotal(draft: OnsiteDraft): number | null {
  if (draft.materials.length === 0) return null;
  let total = 0;
  for (const material of draft.materials) {
    if (material.amountPaise === null || material.amountPaise <= 0) return null;
    total += material.amountPaise;
  }
  return total;
}

/* ---------------------------------------------------------------------------
   Validation
   --------------------------------------------------------------------------- */

export type DraftErrors = Readonly<Record<string, string>>;

const MAX_LINE = 200;
const MAX_WARRANTY = 4000;
/** `ProposalMaterialLineRequest.unit` is `CharField(max_length=32)`. */
const MAX_UNIT = 32;

export function validateOnsite(draft: OnsiteDraft): DraftErrors {
  const errors: Record<string, string> = {};

  const named = draft.stages.filter((stage) => stage.title.trim() !== "");
  if (named.length === 0) {
    errors.stages = "An estimate needs at least one piece of work with a name and a price.";
  } else if (draft.stages.some((stage) => stage.title.trim() === "")) {
    errors.stages = "Name every piece of work, or remove the empty one.";
  } else if (draft.stages.some((stage) => stage.amountPaise === null || stage.amountPaise <= 0)) {
    errors.stages = "Put a price on every piece of work. They add up to your total.";
  }

  if (
    draft.materials.some(
      (material) => material.description.trim() === "" && material.amountPaise !== null,
    )
  ) {
    errors.materials = "Say what each material is, or remove the row.";
  } else if (
    draft.materials.some(
      (material) => material.description.trim() !== "" && (material.amountPaise ?? 0) <= 0,
    )
  ) {
    errors.materials = "Put a price on every material, or remove the row.";
  } else if (draft.materials.some((material) => material.unit.trim().length > MAX_UNIT)) {
    // The wire's own ceiling. Refusing it here costs a keystroke; letting it
    // through costs the vendor a 400 on a finished estimate.
    errors.materials = `Keep the unit under ${MAX_UNIT} characters — "bags", "m", "coils".`;
  }

  if (draft.taxBasis === null) {
    errors.taxBasis =
      "Say whether your price includes tax. Vsolve compares every estimate on the same basis.";
  }
  if (draft.taxPaise < 0) {
    errors.taxPaise = "Tax cannot be negative.";
  } else {
    const total = onsiteTotal(draft);
    if (total !== null && draft.taxPaise > total) {
      errors.taxPaise = "Tax cannot be more than the estimate itself.";
    }
  }

  if (draft.warrantyTerms.length > MAX_WARRANTY) {
    errors.warrantyTerms = `Keep the warranty under ${MAX_WARRANTY} characters.`;
  }
  if (draft.exclusions.some((line) => line.length > MAX_LINE)) {
    errors.exclusions = `Keep each line under ${MAX_LINE} characters.`;
  }

  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/* ---------------------------------------------------------------------------
   Wire mapping
   --------------------------------------------------------------------------- */

/**
 * The material rows as the published `ProposalMaterialLineRequest[]`.
 *
 * Throws on a null amount for the same reason `toStageRequests` does: only
 * reachable once `validateOnsite` has returned nothing, so a null here is a
 * programming error and coercing it to zero would put a real row on a real
 * estimate at no money.
 *
 * `quantity` falls back to the serializer's own default of 1 rather than to a
 * number this client picked — a line the vendor left unquantified is one item,
 * which is what "40 bags" is the alternative to. `unit` stays blank when they
 * did not say, because "each" would be a word they did not write.
 */
export function toMaterialLineRequests(
  materials: readonly MaterialDraft[],
): NonNullable<Schemas["ProposalCreateRequest"]["material_lines"]> {
  return materials
    .filter((material) => material.description.trim() !== "")
    .map((material) => {
      if (material.amountPaise === null) {
        throw new Error("A material with no cost cannot be submitted.");
      }
      return {
        title: material.description.trim(),
        quantity: material.quantity ?? 1,
        unit: material.unit.trim(),
        amount_paise: material.amountPaise,
      };
    });
}

/**
 * The on-site draft as a `ProposalCreateRequest`.
 *
 * `site_visit_id` is required for this path, not optional. It is the field that
 * landed at 1.24.0 and made an A5 on-site estimate submittable over HTTP at all
 * — `submit_proposal` has always taken one and no serializer published it — and
 * it is what the server's `m2_visit_not_completed` guard is checked against.
 * Passing it is the difference between an estimate and a refusal.
 *
 * **Work goes to `stages`, materials go to `material_lines`** (1.26.0). Both are
 * inside `total_paise` — the customer pays both, and `_assert_a5_shape`
 * reconciles the two sums against it — but only a stage carries an approval and
 * a release, and only a material advance is money that is spent rather than
 * earned. Materials carry no schedule field at all now, which is the honest
 * shape: a bag of cement has no completion date.
 */
export function toOnsiteRequest(input: {
  readonly invitationId: string;
  readonly siteVisitId: string;
  readonly draft: OnsiteDraft;
}): Schemas["ProposalCreateRequest"] {
  const { draft } = input;
  const total = onsiteTotal(draft);
  if (total === null || draft.taxBasis === null) {
    throw new Error("An incomplete estimate cannot be submitted.");
  }

  const schedule = scheduleFor(draft);
  const workRows: StageDraft[] = schedule.map(({ stage, startsOn, endsOn }) => ({
    title: stage.title.trim(),
    deliverable: stage.deliverable.trim(),
    amountPaise: stage.amountPaise,
    startsOn,
    durationDays: stage.workingDays,
    endsOn,
  }));

  return {
    invitation_id: input.invitationId,
    site_visit_id: input.siteVisitId,
    total_paise: total,
    tax_basis: draft.taxBasis,
    tax_paise: draft.taxBasis === "EXCLUSIVE" ? draft.taxPaise : 0,
    stages: toStageRequests(workRows),
    material_lines: toMaterialLineRequests(draft.materials),
    exclusions: draft.exclusions.map((line) => line.trim()).filter((line) => line !== ""),
    warranty_terms: draft.warrantyTerms.trim(),
    valid_until: draft.validUntil,
  };
}

/* ---------------------------------------------------------------------------
   Save on blur
   --------------------------------------------------------------------------- */

/**
 * The vendor's own half-written estimate, kept across a locked screen.
 *
 * A phone in a pocket on a building site backgrounds the tab, drops the signal
 * and sometimes reloads it. Losing twenty minutes of typing at that point is how
 * an estimate never gets sent — which, under the revision-3 rules, refunds the
 * customer and pays the vendor nothing for a journey they made.
 *
 * This is the vendor's own input and no part of it is a stand-in for server
 * data: the draft is restored into the form, never rendered as a submitted
 * estimate, and it is cleared the moment Django accepts one. Scoped per
 * invitation so two open enquiries cannot overwrite each other.
 */
const DRAFT_PREFIX = "vsolve.m2.onsite-estimate.";

function storageKey(invitationId: string): string {
  return `${DRAFT_PREFIX}${invitationId}`;
}

export function saveOnsiteDraft(invitationId: string, draft: OnsiteDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(invitationId), JSON.stringify(draft));
  } catch {
    // Private mode, or a full quota. Losing the autosave is survivable; the form
    // in front of the vendor still holds everything they typed.
  }
}

export function loadOnsiteDraft(invitationId: string): OnsiteDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(invitationId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isOnsiteDraft(parsed) ? withMaterialDefaults(parsed) : null;
  } catch {
    return null;
  }
}

export function clearOnsiteDraft(invitationId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(invitationId));
  } catch {
    /* nothing to clean up if storage is unavailable */
  }
}

/**
 * A stored draft is untrusted input.
 *
 * It survives a deploy, so it may have been written by an older bundle with a
 * different shape. Restoring it unchecked would put `undefined` where the form
 * expects an array and crash the one screen a vendor opened to rescue their
 * work. A draft that does not narrow is dropped and the form starts from the
 * prefill instead.
 */
function isOnsiteDraft(value: unknown): value is OnsiteDraft {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<OnsiteDraft>;
  return Array.isArray(candidate.stages) && Array.isArray(candidate.materials);
}

/**
 * Fills the two fields a material row gained when 1.26.0 published its own type.
 *
 * This is the concrete version of the untrusted-input rule above, and it is
 * live *this* deploy: a vendor who half-wrote an estimate yesterday has
 * `{description, amountPaise}` rows in storage, and the composer now reads
 * `unit.trim()`. Dropping the whole draft over two missing keys would throw away
 * their work to avoid a crash; filling them with the serializer's own defaults
 * keeps it and changes nothing they typed.
 */
function withMaterialDefaults(draft: OnsiteDraft): OnsiteDraft {
  return {
    ...draft,
    materials: draft.materials.map((material) => ({
      ...EMPTY_MATERIAL,
      ...material,
      quantity: typeof material.quantity === "number" ? material.quantity : null,
      unit: typeof material.unit === "string" ? material.unit : "",
    })),
  };
}
