import type { Schemas } from "@vsolve/api-client";
import { createTranslator, type useT } from "@vsolve/ui";

import { catalogs } from "@/i18n/catalogs";

/**
 * The two composers' drafts, their arithmetic and their validation.
 *
 * Closes the decision half of `M2-FE-308`, `M2-FE-309` and `M2-FE-312`. Pure:
 * no React, no network, so the flow-weight budget and every refusal rule can be
 * asserted directly.
 *
 * ## Why the total is derived and never typed
 *
 * `M2-FE-312` requires final arithmetic that local state cannot edit. There is
 * no total input in either composer — A3 multiplies rate x days x workers, A5
 * sums its stages, and both hand the result to the request rather than reading
 * it back from a field.
 *
 * **The server does not recompute the A3 total.** `_assert_a5_shape` reconciles
 * stage amounts against `total_paise` for a project quote, but `_assert_a3_shape`
 * checks only that rate, days and headcount are present — the total is taken as
 * sent. So the strongest honest claim is that this client never lets a vendor
 * *edit* the total, and that the figure shown after submission is the server's
 * echoed `total_paise`, not the local computation. The missing server-side
 * A3 reconciliation is logged in `frontend-execution-plan.md` §7.
 */

export type TaxBasis = Schemas["ProposalTaxBasisEnum"];
export type ProposalCreateRequest = Schemas["ProposalCreateRequest"];

/**
 * The A3 composer's complete field set.
 *
 * Named as a constant so the one-screen budget is a test assertion rather than a
 * review opinion: `a3-composer.test.tsx` asserts the rendered controls against
 * this list, and a sixth field fails a test instead of passing a review.
 *
 * `workerCount` is here because `_assert_a3_shape` requires it, not because the
 * budget wants it — and it is prefilled from the customer's own `worker_count`
 * answer wherever they gave one, so in the ordinary case the vendor confirms a
 * number rather than entering it.
 */
export const A3_COMPOSER_FIELDS = [
  "ratePaisePerWorkerDay",
  "minimumDays",
  "workerCount",
  "inclusions",
  "taxBasis",
] as const;

export interface A3Draft {
  readonly ratePaisePerWorkerDay: number | null;
  readonly minimumDays: number | null;
  readonly workerCount: number | null;
  /** "What is included." Free lines, each stored as one `inclusions` entry. */
  readonly inclusions: readonly string[];
  readonly taxBasis: TaxBasis | null;
  /** Tax in rupees-as-paise when the basis is EXCLUSIVE. Zero otherwise. */
  readonly taxPaise: number;
}

/**
 * One stage of a project quote.
 *
 * ## The wire shape is published now
 *
 * At 1.21.0 `ProposalCreateRequest.stages` was `unknown[]` and the domain read
 * exactly one key from each entry — `amount_paise`, in `_assert_a5_shape` — so
 * everything a customer needs to *read* a stage was client-authored and two
 * vendors could send two incomparable structures. **1.24.0 publishes
 * `ProposalStage` / `ProposalStageRequest`: `{title, deliverable, amount_paise,
 * ends_on}`.** `toA5Request` now maps onto the generated type, so this draft is
 * a form model rather than a private wire contract, and a field the server
 * renames breaks the build here.
 *
 * `amount_paise` is **required and non-null** on the published shape. It is
 * nullable here because a half-typed form legitimately has no amount yet; the
 * two are reconciled at the wire boundary, which throws rather than sending a
 * stage worth nothing.
 */
export interface StageDraft {
  /** What this stage is. Sent as `title`. */
  readonly title: string;
  /** What the customer receives at the end of it. Sent as `deliverable`. */
  readonly deliverable: string;
  readonly amountPaise: number | null;
  /** ISO date, or null when the vendor did not commit to one. */
  readonly endsOn: string | null;
  /** Frozen schedule inputs from the on-site estimate. Optional on the desk composer. */
  readonly startsOn?: string | null;
  readonly durationDays?: number | null;
}

export const EMPTY_STAGE: StageDraft = {
  title: "",
  deliverable: "",
  amountPaise: null,
  endsOn: null,
};

export interface A5Draft {
  readonly stages: readonly StageDraft[];
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly warrantyTerms: string;
  /** ISO datetime after which the quote is no longer offered, or null. */
  readonly validUntil: string | null;
  readonly taxBasis: TaxBasis | null;
  readonly taxPaise: number;
}

export const EMPTY_A3_DRAFT: A3Draft = {
  ratePaisePerWorkerDay: null,
  minimumDays: null,
  workerCount: null,
  inclusions: [],
  taxBasis: null,
  taxPaise: 0,
};

export const EMPTY_A5_DRAFT: A5Draft = {
  stages: [EMPTY_STAGE],
  inclusions: [],
  exclusions: [],
  warrantyTerms: "",
  validUntil: null,
  taxBasis: null,
  taxPaise: 0,
};

/* ---------------------------------------------------------------------------
   Arithmetic
   --------------------------------------------------------------------------- */

/**
 * Rate x minimum days x headcount, or null while any of the three is missing.
 *
 * `null` rather than `0`: a zero total reads as "free", and a composer that
 * shows one while a field is still empty has told the vendor something untrue
 * about a quote they are mid-way through writing.
 */
export function a3Total(draft: A3Draft): number | null {
  const { ratePaisePerWorkerDay: rate, minimumDays: days, workerCount: workers } = draft;
  if (rate === null || days === null || workers === null) return null;
  if (rate <= 0 || days <= 0 || workers <= 0) return null;
  return rate * days * workers;
}

/** The sum of the stage amounts, or null while any stage has no amount. */
export function a5Total(draft: A5Draft): number | null {
  if (draft.stages.length === 0) return null;
  let total = 0;
  for (const stage of draft.stages) {
    if (stage.amountPaise === null || stage.amountPaise <= 0) return null;
    total += stage.amountPaise;
  }
  return total;
}

/* ---------------------------------------------------------------------------
   Validation
   --------------------------------------------------------------------------- */

/**
 * Field-addressed problems, so a message lands under the control that caused it.
 *
 * Keys are draft field names, not wire names, because that is what a form can
 * address. The adapter maps a server `fieldErrors` envelope onto the same keys.
 */
export type DraftErrors = Readonly<Record<string, string>>;

const MAX_LINE = 200;
const MAX_WARRANTY = 4000;

type Translate = ReturnType<typeof useT>;

/** English, for callers that do not thread `t` (tests, non-rendering code). */
function englishT(): Translate {
  return createTranslator("en-IN", catalogs["en-IN"]).t;
}

function checkShared(
  input: {
    taxBasis: TaxBasis | null;
    taxPaise: number;
    total: number | null;
    inclusions: readonly string[];
  },
  t: Translate,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (input.taxBasis === null) {
    errors.taxBasis = t("proposal.draft.error.taxBasis");
  }
  if (input.taxPaise < 0) {
    errors.taxPaise = t("proposal.draft.error.taxNegative");
  } else if (input.total !== null && input.taxPaise > input.total) {
    errors.taxPaise = t("proposal.draft.error.taxTooHigh");
  }
  if (input.inclusions.some((line) => line.length > MAX_LINE)) {
    errors.inclusions = t("proposal.draft.error.lineTooLong", { max: MAX_LINE });
  }

  return errors;
}

export function validateA3(draft: A3Draft, t: Translate = englishT()): DraftErrors {
  const total = a3Total(draft);
  const errors = checkShared(
    {
      taxBasis: draft.taxBasis,
      taxPaise: draft.taxPaise,
      total,
      inclusions: draft.inclusions,
    },
    t,
  );

  if (draft.ratePaisePerWorkerDay === null || draft.ratePaisePerWorkerDay <= 0) {
    errors.ratePaisePerWorkerDay = t("proposal.draft.error.rate");
  }
  if (draft.minimumDays === null || draft.minimumDays <= 0) {
    errors.minimumDays = t("proposal.draft.error.minimumDays");
  }
  if (draft.workerCount === null || draft.workerCount <= 0) {
    errors.workerCount = t("proposal.draft.error.workerCount");
  }
  if (draft.inclusions.filter((line) => line.trim() !== "").length === 0) {
    errors.inclusions = t("proposal.draft.error.inclusions");
  }

  return errors;
}

export function validateA5(draft: A5Draft, t: Translate = englishT()): DraftErrors {
  const total = a5Total(draft);
  const errors = checkShared(
    {
      taxBasis: draft.taxBasis,
      taxPaise: draft.taxPaise,
      total,
      inclusions: draft.inclusions,
    },
    t,
  );

  const filled = draft.stages.filter((stage) => stage.title.trim() !== "");
  if (filled.length === 0) {
    errors.stages = t("proposal.draft.error.noStages");
  } else if (draft.stages.some((stage) => stage.amountPaise === null || stage.amountPaise <= 0)) {
    errors.stages = t("proposal.draft.error.stageAmount");
  } else if (draft.stages.some((stage) => stage.title.trim() === "")) {
    errors.stages = t("proposal.draft.error.stageName");
  }

  if (draft.warrantyTerms.length > MAX_WARRANTY) {
    errors.warrantyTerms = t("proposal.draft.error.warrantyTooLong", { max: MAX_WARRANTY });
  }
  if (draft.exclusions.some((line) => line.length > MAX_LINE)) {
    errors.exclusions = t("proposal.draft.error.lineTooLong", { max: MAX_LINE });
  }

  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/* ---------------------------------------------------------------------------
   Wire mapping
   --------------------------------------------------------------------------- */

function cleanLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => line !== "");
}

/**
 * A3 draft to `ProposalCreateRequest`.
 *
 * Throws rather than sending a partial quote: `toA3Request` is only reachable
 * once `validateA3` returns nothing, and a silent `total_paise: 0` slipping past
 * a missing guard would be a real quote for no money.
 *
 * `stages` is omitted rather than sent empty — `_assert_a3_shape` refuses a
 * workforce quote that carries any.
 */
export function toA3Request(input: {
  readonly invitationId: string;
  readonly draft: A3Draft;
}): ProposalCreateRequest {
  const { draft } = input;
  const total = a3Total(draft);
  if (total === null || draft.taxBasis === null) {
    throw new Error("An incomplete workforce quote cannot be submitted.");
  }

  return {
    invitation_id: input.invitationId,
    // Money left this request at contract 1.44.0 — see `onsite-draft.ts`. The
    // guard above still runs: a draft with no total and no tax basis is
    // incomplete on screen, and the vendor should be stopped here rather than
    // by a 422.
    rate_paise_per_worker_day: draft.ratePaisePerWorkerDay,
    minimum_days: draft.minimumDays,
    worker_count: draft.workerCount,
    inclusions: cleanLines(draft.inclusions),
    // Required on the wire since 1.48.0 and meaningless on a workforce quote,
    // which carries no shopping list. Blank is the serializer's own default.
    material_brand_tier: "",
  };
}

/**
 * Stage drafts to the published `ProposalStageRequest[]`.
 *
 * Throws on a null amount rather than coercing it to zero. Only reachable once
 * `validateA5` has returned nothing, so the throw is a programming-error guard
 * on the one field whose absence would otherwise become a real stage quoted at
 * no money.
 */
export function toStageRequests(
  stages: readonly StageDraft[],
): NonNullable<ProposalCreateRequest["stages"]> {
  return stages.map((stage) => {
    if (stage.amountPaise === null) {
      throw new Error("A stage with no amount cannot be submitted.");
    }
    return {
      title: stage.title.trim(),
      deliverable: stage.deliverable.trim(),
      amount_paise: stage.amountPaise,
      ...(stage.startsOn ? { starts_on: stage.startsOn } : {}),
      ...(stage.durationDays ? { duration_days: stage.durationDays } : {}),
      ends_on: stage.endsOn,
    };
  });
}

export function toA5Request(input: {
  readonly invitationId: string;
  readonly draft: A5Draft;
  /**
   * The completed plan visit this estimate was written on, for an A5 on-site
   * estimate.
   *
   * `ProposalCreateRequest.site_visit_id` landed at 1.24.0 and closed a defect
   * rather than adding a feature: `submit_proposal` has always taken one and no
   * serializer published it, so **an A5 on-site estimate could not be submitted
   * over HTTP at all**. Omitted for the remote path, which the revision-3 flow
   * retires but which the wire still accepts.
   */
  readonly siteVisitId?: string | null;
}): ProposalCreateRequest {
  const { draft } = input;
  const total = a5Total(draft);
  if (total === null || draft.taxBasis === null) {
    throw new Error("An incomplete project quote cannot be submitted.");
  }

  return {
    invitation_id: input.invitationId,
    // Money left this request at contract 1.44.0 — see `onsite-draft.ts`. The
    // guard above still runs: a draft with no total and no tax basis is
    // incomplete on screen, and the vendor should be stopped here rather than
    // by a 422.
    stages: toStageRequests(draft.stages),
    inclusions: cleanLines(draft.inclusions),
    exclusions: cleanLines(draft.exclusions),
    warranty_terms: draft.warrantyTerms.trim(),
    valid_until: draft.validUntil,
    // The remote A5 composer collects no shopping list; blank is the default.
    material_brand_tier: "",
    ...(input.siteVisitId ? { site_visit_id: input.siteVisitId } : {}),
  };
}

/* ---------------------------------------------------------------------------
   Money entry
   --------------------------------------------------------------------------- */

/**
 * Rupees typed by a vendor to paise, or null.
 *
 * Vendors type rupees; every wire field is paise. Doing the conversion in one
 * named place is what stops a hundredfold error reaching a quote — and rounding
 * rather than truncating means "1250.5" is 125050 paise instead of silently
 * losing fifty paise off a real price.
 */
export function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const rupees = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

/** Paise back to a plain rupee string for an input's value. */
export function paiseToRupeeInput(paise: number | null): string {
  if (paise === null) return "";
  return (paise / 100).toString();
}

/** A whole-number field — headcount, days — or null. */
export function readCount(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}
