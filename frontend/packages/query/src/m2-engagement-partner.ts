/**
 * The vendor's half of the engagement spine — contract 1.25.0.
 *
 * `M2-FE-501`, `M2-FE-601`, `M2-FE-602`, `M2-FE-603`, `M2-FE-604`, `M2-FE-607`.
 *
 * ## One spine, two vocabularies
 *
 * There is one `Engagement` and one `EngagementStage`, and every command against
 * them is the same command for both archetypes (ADR-0007). What differs is what
 * those commands **refuse** and what money they move — so there is no second
 * implementation below, only two bucket vocabularies and two pricing rules,
 * because a shift-day and a milestone are different things to the person doing
 * them and flattening both into "work item" is the erasure `M2-FE-111` forbids.
 *
 * ## What is deliberately NOT here
 *
 * Everything both parties read the same way lives in `m2-engagement-customer.ts`
 * and is imported from `@vsolve/query` by name: the type aliases, `orderedStages`,
 * `activeStage`, `disputedStages`, `reviewClock`, `payoutReleaseDeadline`,
 * `isEvidenceReadable`, and the five shared refusal predicates. A second copy of
 * `isStageTransitionNotAllowed` would be a second place for one rule to drift.
 * This file holds the vendor's side only — what a vendor may *do*, what they are
 * *owed*, and what a composer must refuse to compose.
 *
 * ## Why this file holds no hooks
 *
 * The same reason `m2-engagement-customer.ts` holds none: a hook in
 * `packages/query` cannot reach `getApiClient()`, which is per-app and carries
 * that app's own `onUnauthorized` behaviour. The reads and commands live in
 * `apps/partner/features/engagement/queries.ts`; the rules that decide what a
 * screen may offer live here, where they can be diffed against
 * `07-state-machines-and-permissions.md` §5 in one place.
 *
 * ## The three rules a vendor's money depends on
 *
 * 1. **A correction is not an amendment.** `request_correction` sends a stage
 *    back to `IN_PROGRESS`. It does not change scope and it moves no money.
 *    Rendering it as a reduction is how a vendor concludes they have been paid
 *    less than they agreed.
 * 2. **A dispute stops only the disputed allocation.** Every other stage carries
 *    on and any payout already released stays released. A disputed engagement is
 *    not a frozen one.
 * 3. **A null `*_due_at` is a policy state, not missing data.** No review window
 *    configured means the stage never auto-approves; no payout hold configured
 *    means nothing releases on a clock. Render the absence, never a date.
 */

import { ApiRequestError } from "@vsolve/api-client";
import type { Schemas } from "@vsolve/api-client";

/* --------------------------------------------------------------------------
   Local aliases — private on purpose
   -------------------------------------------------------------------------- */

/**
 * `m2-engagement-customer.ts` publishes these names and this module does not
 * re-publish them. One name, one home: a second `export type StageEvidence`
 * would collide in the barrel and, worse, would invite two files to disagree
 * about which `Schemas` entry it aliases.
 */
type Engagement = Schemas["Engagement"];
type EngagementStage = Schemas["EngagementStage"];
type EngagementStageStatus = Schemas["EngagementStageStatusEnum"];
type StageEvidence = Schemas["StageEvidence"];
type EngagementAmendment = Schemas["EngagementAmendment"];
type EngagementAmendmentKind = Schemas["EngagementAmendmentKindEnum"];

function hasStage(engagement: Engagement, status: EngagementStageStatus): boolean {
  return engagement.stages.some((stage) => stage.status === status);
}

/* --------------------------------------------------------------------------
   Buckets — `M2-FE-501` (workforce) and `M2-FE-601` (projects)
   -------------------------------------------------------------------------- */

/**
 * A bucket the list renders, whether or not this build can fill it.
 *
 * `derivable: false` is the honest half. `M2-FE-501` names a **crew-needed**
 * bucket and nothing on the wire says which shift-days still need crew — crew
 * assignment is Wave C4 and `Engagement` publishes no roster, no assignment and
 * no worker count. The bucket is still rendered, still named, and says so.
 * Dropping it would quietly change the product; filling it from a guess would
 * tell a supervisor a shift is staffed when nobody has said it is.
 */
export interface EngagementBucket<Key extends string> {
  readonly key: Key;
  /** The heading, in the workspace's own noun. */
  readonly label: string;
  /** One line saying what is in here and what the vendor is expected to do. */
  readonly description: string;
  /** False when no published field can place an engagement in this bucket. */
  readonly derivable: boolean;
  /** Why not, in the vendor's words. Present only when `derivable` is false. */
  readonly unavailableBecause?: string;
}

export type WorkforceBucketKey =
  | "crew_needed"
  | "upcoming"
  | "in_progress"
  | "exception"
  | "completed";

export type ProjectBucketKey =
  | "funding_needed"
  | "active_stage"
  | "customer_review"
  | "disputed"
  | "warranty"
  | "completed";

/** `M2-FE-501`, in the order a supervisor scans them: today's problems first. */
export const WORKFORCE_BUCKETS: readonly EngagementBucket<WorkforceBucketKey>[] = [
  {
    key: "exception",
    label: "Needs your attention",
    description: "A shift-day was sent back or disputed, or the booking was cancelled.",
    derivable: true,
  },
  {
    key: "in_progress",
    label: "Running now",
    description: "A shift-day is under way, or waiting for the customer to sign it off.",
    derivable: true,
  },
  {
    key: "crew_needed",
    label: "Crew still to be named",
    description: "Shift-days you have agreed to and not yet put names against.",
    derivable: false,
    unavailableBecause:
      "Vsolve does not publish crew assignment yet, so this screen cannot tell which shift-days " +
      "still need names. No booking is missing below — they are all here, in the other groups.",
  },
  {
    key: "upcoming",
    label: "Coming up",
    description: "Agreed, and not started.",
    derivable: true,
  },
  {
    key: "completed",
    label: "Finished",
    description: "Every shift-day signed off.",
    derivable: true,
  },
];

/** `M2-FE-601`. What the customer owes you first, then the work. */
export const PROJECT_BUCKETS: readonly EngagementBucket<ProjectBucketKey>[] = [
  {
    key: "disputed",
    label: "Disputed",
    description: "One stage is being argued about. The rest of the project carries on.",
    derivable: true,
  },
  {
    key: "customer_review",
    label: "With the customer",
    description: "You have submitted a stage and are waiting on their decision.",
    derivable: true,
  },
  {
    key: "active_stage",
    label: "Your move",
    description: "A stage is yours to work on — including one the customer sent back.",
    derivable: true,
  },
  {
    key: "funding_needed",
    label: "Waiting to be funded",
    description: "The customer has not paid for the next stage yet. Do not start it.",
    derivable: true,
  },
  {
    key: "warranty",
    label: "In warranty",
    description: "Finished, and inside the warranty period.",
    derivable: true,
  },
  {
    key: "completed",
    label: "Finished",
    description: "Signed off and closed.",
    derivable: true,
  },
];

/**
 * Where a workforce booking belongs, or `null` when this build cannot say.
 *
 * `null` is a real answer and the list renders it as one. A newer deployment can
 * send an `Engagement.status` this bundle has no vocabulary for, and the two
 * tempting fallbacks are both worse than saying so: "Finished" would tell a
 * supervisor a shift is over, and "Needs your attention" would raise an alarm
 * about a state nobody described. Same rule the workspace registry applies to an
 * unknown workspace key.
 */
export function workforceBucketFor(engagement: Engagement): WorkforceBucketKey | null {
  switch (engagement.status) {
    case "CANCELLED":
    case "DISPUTED":
      return "exception";
    case "COMPLETED":
    case "CLOSED":
    case "WARRANTY":
      return "completed";
    case "COMPLETING":
      return "in_progress";
    case "PENDING_START":
      return hasStage(engagement, "DISPUTED") || hasStage(engagement, "CORRECTION_REQUESTED")
        ? "exception"
        : "upcoming";
    case "ACTIVE":
      break;
    default:
      return null;
  }

  if (hasStage(engagement, "DISPUTED") || hasStage(engagement, "CORRECTION_REQUESTED")) {
    return "exception";
  }
  if (hasStage(engagement, "IN_PROGRESS") || hasStage(engagement, "AWAITING_REVIEW")) {
    return "in_progress";
  }
  return hasStage(engagement, "PENDING") ? "upcoming" : "in_progress";
}

/**
 * Where a project belongs, or `null` when this build cannot say.
 *
 * **A correction is not a dispute**, so `CORRECTION_REQUESTED` lands in "Your
 * move" beside ordinary work rather than under "Disputed". Nothing has been
 * argued about and no money has moved; the customer has asked for the agreed
 * work to be done properly. The row itself says it was sent back — that
 * distinction belongs on the record, never in the bucket that files it.
 */
export function projectBucketFor(engagement: Engagement): ProjectBucketKey | null {
  switch (engagement.status) {
    case "DISPUTED":
      return "disputed";
    case "WARRANTY":
      return "warranty";
    case "COMPLETED":
    case "CLOSED":
    case "CANCELLED":
      return "completed";
    case "COMPLETING":
      return "customer_review";
    case "PENDING_START":
    case "ACTIVE":
      break;
    default:
      return null;
  }

  if (hasStage(engagement, "DISPUTED")) return "disputed";
  if (hasStage(engagement, "AWAITING_REVIEW")) return "customer_review";
  if (hasStage(engagement, "IN_PROGRESS") || hasStage(engagement, "CORRECTION_REQUESTED")) {
    return "active_stage";
  }
  return awaitingFunding(engagement) ? "funding_needed" : "active_stage";
}

/**
 * The customer owes money before the vendor may start.
 *
 * Read off `funding_state`, which the server stamps: `REQUIRED` is nobody has
 * paid, `PENDING` is a charge in flight. Both mean the same thing to a vendor —
 * do not travel, do not start — so both are one bucket with two sentences.
 */
export function awaitingFunding(engagement: Engagement): boolean {
  return engagement.stages.some(
    (stage) => stage.funding_state === "REQUIRED" || stage.funding_state === "PENDING",
  );
}

export interface BucketedEngagements<Key extends string> {
  readonly bucket: EngagementBucket<Key>;
  readonly engagements: readonly Engagement[];
}

export interface EngagementGrouping<Key extends string> {
  readonly groups: readonly BucketedEngagements<Key>[];
  /**
   * Engagements in a state this build has no bucket for.
   *
   * Never dropped: an engagement this app cannot file is still one the vendor is
   * contractually inside, and silently removing it from a list is how somebody
   * stops seeing a commitment they still have.
   */
  readonly unplaceable: readonly Engagement[];
}

export function groupEngagements<Key extends string>(
  engagements: readonly Engagement[],
  buckets: readonly EngagementBucket<Key>[],
  bucketFor: (engagement: Engagement) => Key | null,
): EngagementGrouping<Key> {
  const placed = new Map<Key, Engagement[]>(buckets.map((bucket) => [bucket.key, []]));
  const unplaceable: Engagement[] = [];

  for (const engagement of engagements) {
    const key = bucketFor(engagement);
    const target = key === null ? undefined : placed.get(key);
    if (target) target.push(engagement);
    else unplaceable.push(engagement);
  }

  return {
    groups: buckets.map((bucket) => ({ bucket, engagements: placed.get(bucket.key) ?? [] })),
    unplaceable,
  };
}

/* --------------------------------------------------------------------------
   What the vendor may do
   -------------------------------------------------------------------------- */

/** `_assert_engagement_live`: three terminal statuses refuse every stage command. */
export function isEngagementClosed(engagement: Engagement): boolean {
  return (
    engagement.status === "CANCELLED" ||
    engagement.status === "CLOSED" ||
    engagement.status === "COMPLETED"
  );
}

export type VendorStageCommand = "start" | "attach_evidence" | "submit";

/**
 * What this vendor may do to this stage right now.
 *
 * A mirror of `stages.py`, and deliberately a *conservative* one: it decides
 * what to **offer**, never what is allowed. The server re-checks under a row lock
 * and its answer wins. Where the two could disagree because this screen's copy of
 * the record is a minute old, the control stays offered and the refusal is
 * explained — the `M2-FE-315` precedent. Where the client's knowledge is
 * authoritative and the refusal is certain (a managed stage nobody has funded),
 * no control is drawn at all, because a button whose only outcome is a refusal is
 * a trap.
 */
export function vendorStageCommands(
  engagement: Engagement,
  stage: EngagementStage,
): readonly VendorStageCommand[] {
  if (isEngagementClosed(engagement)) return [];

  const commands: VendorStageCommand[] = [];

  const startable = stage.status === "PENDING" || stage.status === "CORRECTION_REQUESTED";
  if (startable && !stageIsWaitingOnFunding(engagement, stage) && workMayStart(engagement)) {
    commands.push("start");
  }

  // `_assert_evidence_may_be_added` includes DISPUTED on purpose: a vendor
  // answering a dispute needs to attach the photograph that answers it, and a
  // dispute process where only one side may file is not one.
  if (
    stage.status === "IN_PROGRESS" ||
    stage.status === "AWAITING_REVIEW" ||
    stage.status === "CORRECTION_REQUESTED" ||
    stage.status === "DISPUTED"
  ) {
    commands.push("attach_evidence");
  }

  if (stage.status === "IN_PROGRESS" || stage.status === "AWAITING_REVIEW") {
    commands.push("submit");
  }

  return commands;
}

/**
 * A managed stage nobody has paid for yet.
 *
 * `LEAD_ONLY` never waits: `funding_state` is `NOT_REQUIRED` because Vsolve
 * collects no A3 service money at all — the customer pays the vendor directly.
 */
export function stageIsWaitingOnFunding(
  engagement: Engagement,
  stage: EngagementStage,
): boolean {
  if (engagement.commercial_mode !== "MANAGED_PAYMENT_REQUIRED") return false;
  return stage.funding_state !== "FUNDED";
}

/**
 * Whether the engagement has been cleared to start at all.
 *
 * `work_may_start_at` is null until the server says work may begin, and
 * `start_stage` refuses while it is. Published, so the screen can say "not
 * cleared yet" instead of drawing a button that earns a 409.
 */
export function workMayStart(engagement: Engagement): boolean {
  return engagement.work_may_start_at !== null;
}

/** True while the customer's review clock is running against submitted work. */
export function isAwaitingCustomer(stage: EngagementStage): boolean {
  return stage.status === "AWAITING_REVIEW";
}

/**
 * The customer sent this stage back. **This is not an amendment.**
 *
 * Nothing about the agreed work changed and no money moved. The note is what they
 * want done properly; the price, the scope and the stage's own `amount_paise` are
 * all exactly what they were. Returns null when the stage is not in a correction,
 * so a stale note from a previous cycle can never be rendered as a live one.
 */
export function correctionRequested(stage: EngagementStage): string | null {
  return stage.status === "CORRECTION_REQUESTED" ? stage.correction_note : null;
}

/** How many times the vendor has already submitted this stage. Scopes the retry key. */
export function submissionCount(stage: EngagementStage): number {
  return stage.evidence.filter((row) => row.kind === "NOTE").length;
}

/* --------------------------------------------------------------------------
   Payout — `M2-FE-607`
   -------------------------------------------------------------------------- */

export type StagePayoutState =
  /** A3. Vsolve collected nothing, so there is nothing here to release. */
  | "paid_direct"
  /** Not approved yet, so nothing is earned yet. */
  | "not_earned"
  /** Earned and held, and a date is set for the hold to lapse. */
  | "held_until_date"
  /** Earned and held, and **no** release date is configured. */
  | "held_no_date"
  /** The hold is over. Whether it has reached a bank is the payout account's business. */
  | "released";

/**
 * What has happened to the money for one stage.
 *
 * The distinction this function exists for is `held_no_date` versus
 * `held_until_date`. `_approve` writes the vendor's earning as a **`PENDING`
 * ledger entry** — earned, not yet payable — and `release_stage_payout` makes it
 * payable when the hold window closes *and* the payout account is verified. When
 * the hold window is unset, `payout_release_due_at` is null, nothing releases on
 * a clock, and the entry waits for Operations. **The vendor has still earned it.**
 * Saying "released on the 14th" there is a promise nobody made; saying nothing at
 * all reads as the money having gone somewhere.
 */
export function stagePayoutState(
  engagement: Engagement,
  stage: EngagementStage,
): StagePayoutState {
  if (engagement.commercial_mode === "LEAD_ONLY") return "paid_direct";
  if (stage.status === "RELEASED") return "released";
  if (stage.status !== "APPROVED") return "not_earned";
  return stage.payout_release_due_at === null ? "held_no_date" : "held_until_date";
}

export interface PayoutSummary {
  /** Approved and therefore earned, whether or not it is payable. */
  readonly earnedPaise: number;
  /** Past its hold window. */
  readonly releasedPaise: number;
  /** Earned, not yet payable. */
  readonly heldPaise: number;
  /** Refunded to the customer — a resolved dispute or an accepted reduction. */
  readonly refundedPaise: number;
}

/**
 * The engagement's own running totals, differenced — never summed from stages.
 *
 * `approved_total_paise` and `released_total_paise` are maintained server-side by
 * database-side arithmetic (`add_engagement_money` uses `F()` expressions, so two
 * stages approving concurrently add rather than overwrite). Re-summing the stage
 * rows in the browser would produce a second number that disagrees with the
 * statement the moment a page is one request behind. The single arithmetic step
 * here is a subtraction of two server-stamped totals, which is the most a client
 * may do, and it is labelled as derived wherever it is rendered.
 */
export function payoutSummary(engagement: Engagement): PayoutSummary {
  const earned = engagement.approved_total_paise;
  const released = engagement.released_total_paise;
  return {
    earnedPaise: earned,
    releasedPaise: released,
    heldPaise: Math.max(earned - released, 0),
    refundedPaise: engagement.refunded_total_paise,
  };
}

/* --------------------------------------------------------------------------
   Evidence — `M2-FE-603`
   -------------------------------------------------------------------------- */

/**
 * The kinds a **file** may be uploaded as.
 *
 * `NOTE` is in `StageEvidenceKindEnum` and is **not** an upload kind:
 * `ACCEPTED_EVIDENCE_MEDIA_TYPES` on the server has no `NOTE` entry, so
 * presigning one is refused with "that evidence type is not supported". A note
 * reaches the record a different way — it is the **required** `note` on `submit/`,
 * stored as its own append-only `NOTE` evidence row. Offering `NOTE` in an
 * uploader would be offering a refusal.
 */
export const EVIDENCE_UPLOAD_KINDS = ["PHOTO", "VIDEO", "DOCUMENT"] as const;
export type EvidenceUploadKind = (typeof EVIDENCE_UPLOAD_KINDS)[number];

export function isEvidenceUploadKind(kind: string): kind is EvidenceUploadKind {
  return (EVIDENCE_UPLOAD_KINDS as readonly string[]).includes(kind);
}

/**
 * The server's own allow-list, mirrored so a phone is told before the transfer.
 *
 * A courtesy, not a gate — exactly as `application/model/upload.ts` says of the
 * KYC uploader. Django re-checks the media type, the size and the checksum
 * against the object that actually arrived, so bypassing this changes nothing
 * except who finds out first. It exists so an 80 MB video on a site's mobile
 * connection is refused in the file picker rather than after four minutes.
 */
export const ACCEPTED_EVIDENCE_MEDIA_TYPES: Record<EvidenceUploadKind, readonly string[]> = {
  PHOTO: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  VIDEO: ["video/mp4", "video/quicktime", "video/webm"],
  DOCUMENT: ["application/pdf"],
};

export const MAXIMUM_EVIDENCE_SIZE_BYTES: Record<EvidenceUploadKind, number> = {
  PHOTO: 12 * 1024 * 1024,
  VIDEO: 80 * 1024 * 1024,
  DOCUMENT: 20 * 1024 * 1024,
};

/** One stage's ceiling. A dispute reads these; forty photographs are read by nobody. */
export const MAXIMUM_EVIDENCE_PER_STAGE = 20;

export type EvidenceRejection =
  | { readonly code: "empty"; readonly message: string }
  | { readonly code: "too_large"; readonly message: string }
  | { readonly code: "unsupported_type"; readonly message: string }
  | { readonly code: "stage_full"; readonly message: string };

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Which kind a file would be uploaded as, or null if nothing accepts it. */
export function evidenceKindForFile(contentType: string): EvidenceUploadKind | null {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    EVIDENCE_UPLOAD_KINDS.find((kind) =>
      ACCEPTED_EVIDENCE_MEDIA_TYPES[kind].includes(normalized),
    ) ?? null
  );
}

export function rejectEvidenceFile(input: {
  readonly file: { readonly size: number; readonly type: string };
  readonly existingCount: number;
}): EvidenceRejection | null {
  if (input.existingCount >= MAXIMUM_EVIDENCE_PER_STAGE) {
    return {
      code: "stage_full",
      message: `You can attach up to ${MAXIMUM_EVIDENCE_PER_STAGE} files to one stage.`,
    };
  }

  const kind = evidenceKindForFile(input.file.type);
  if (kind === null) {
    return {
      code: "unsupported_type",
      message: "That file cannot be attached. Photos, video and PDFs only.",
    };
  }

  if (input.file.size <= 0) {
    return { code: "empty", message: "That file is empty. Choose it again." };
  }

  const ceiling = MAXIMUM_EVIDENCE_SIZE_BYTES[kind];
  if (input.file.size > ceiling) {
    return {
      code: "too_large",
      message: `That file is ${megabytes(input.file.size)}. The largest we take for this kind is ${megabytes(ceiling)}.`,
    };
  }

  return null;
}

/** The vendor's own written accounts, in wire order. One per submission. */
export function evidenceNotes(stage: EngagementStage): readonly StageEvidence[] {
  return stage.evidence.filter((row) => row.kind === "NOTE");
}

/**
 * Everything that is a file.
 *
 * **`object_key` is never published** — a storage path is an enumeration surface
 * — so nothing downstream can build a URL from one of these. A row carries an id,
 * a kind, a size, a media type and a scan status, and that is the whole of what a
 * history can render until a download endpoint exists.
 */
export function evidenceFiles(stage: EngagementStage): readonly StageEvidence[] {
  return stage.evidence.filter((row) => row.kind !== "NOTE");
}

/** The scan refused this file. It is attached and the customer will not see it. */
export function isEvidenceRejectedByScan(evidence: StageEvidence): boolean {
  return evidence.processing_status === "FAILED" || evidence.processing_status === "INFECTED";
}

/* --------------------------------------------------------------------------
   Amendments — `M2-FE-604`
   -------------------------------------------------------------------------- */

/** The server's ceilings, so the composer refuses rather than submits. */
export const MAXIMUM_AMENDMENT_LINES = 10;
export const MAXIMUM_EXTENSION_DAYS = 14;

export type AmendmentPricingAuthority =
  /** A3. The **server** prices it from the worker-day rate frozen at reconfirmation. */
  | "server_from_frozen_rate"
  /** A5. The **vendor** prices each line; the server sums them and rejects a client total. */
  | "vendor_per_line";

export interface AmendmentShape {
  readonly kind: EngagementAmendmentKind;
  readonly pricing: AmendmentPricingAuthority;
}

/**
 * Which change request this engagement takes, or null if this build cannot say.
 *
 * **Read from `commercial_mode`, not from `archetype`**, because that is the
 * field the server branches on: `propose_engagement_amendment` computes
 * `expected_kind` as `TIME_EXTENSION` when the mode is `LEAD_ONLY` and
 * `CHANGE_ORDER` otherwise, and refuses anything else with "that is not the kind
 * of change this engagement takes". `archetype` is an unconstrained string on the
 * wire with no published vocabulary; `commercial_mode` is a published enum. Two
 * clients keying on different fields is how one of them silently composes the
 * wrong shape the day an archetype string changes.
 *
 * An unrecognised mode returns null and the composer refuses to open — the same
 * fail-closed rule `isKnownCommercialMode` states for the Customer screens.
 */
export function amendmentShapeFor(engagement: Engagement): AmendmentShape | null {
  switch (engagement.commercial_mode) {
    case "LEAD_ONLY":
      return { kind: "TIME_EXTENSION", pricing: "server_from_frozen_rate" };
    case "MANAGED_PAYMENT_REQUIRED":
      return { kind: "CHANGE_ORDER", pricing: "vendor_per_line" };
    default:
      return null;
  }
}

/** `ACTIVE` and `DISPUTED` are the two statuses that take a change request. */
export function acceptsAmendments(engagement: Engagement): boolean {
  return engagement.status === "ACTIVE" || engagement.status === "DISPUTED";
}

/**
 * Still waiting on a decision or a payment, so a second one cannot be proposed.
 *
 * Mirrors `ScopeAmendment.LIVE_STATUSES` exactly — `PROPOSED`,
 * `CUSTOMER_APPROVED`, `PAYMENT_PENDING`. `CUSTOMER_APPROVED` is in there and is
 * the one worth naming: the customer has said yes and the money has not moved, so
 * the agreement has **not** changed yet and a vendor must not read it as agreed
 * scope.
 *
 * A status this build does not recognise counts as live. That fails closed in the
 * right direction: it blocks composing a second request the server would refuse,
 * and the screen says it cannot describe the one that is open rather than
 * pretending there is none.
 */
export function isAmendmentLive(amendment: EngagementAmendment): boolean {
  return (
    amendment.status !== "CUSTOMER_DECLINED" &&
    amendment.status !== "EXPIRED" &&
    amendment.status !== "AUTHORIZED"
  );
}

/** One live change request per engagement. A second is `m2_amendment_not_actionable`. */
export function liveAmendment(
  amendments: readonly EngagementAmendment[],
): EngagementAmendment | null {
  return amendments.find(isAmendmentLive) ?? null;
}

export interface AmendmentDraftLine {
  /** What the extra or removed work is, in the vendor's words. */
  readonly title: string;
  /** Worker-days on A3; a count of the described work on A5. */
  readonly quantity: number;
  /** A5 only, signed: negative removes scope. Never sent on A3. */
  readonly amountPaise: number | null;
}

export interface AmendmentDraft {
  readonly reason: string;
  /** The stage this changes. **Required for a reduction**, optional otherwise. */
  readonly stageId: string | null;
  readonly lines: readonly AmendmentDraftLine[];
}

export type AmendmentProblemField = "reason" | "lines" | "stage" | "quantity" | "amount";

export interface AmendmentProblem {
  readonly field: AmendmentProblemField;
  readonly message: string;
}

/**
 * Every refusal the composer can see coming, so it never submits into one.
 *
 * The load-bearing entry is the last one. **A reduction cannot empty a stage** —
 * `_assert_reduction_is_possible` refuses `abs(delta) >= stage.amount_paise` with
 * "removing a stage entirely is a cancellation, not a change request", and vendor
 * abandonment is `M2-BE-545` in Wave C5, which does not exist. Submitting one to
 * find out would teach a vendor that a cancellation is a change request that
 * happened to fail, which is the opposite of true.
 *
 * Everything here mirrors a server rule and none of it is a gate. The server
 * re-checks under a row lock; this only decides what the button does.
 */
export function validateAmendmentDraft(input: {
  readonly engagement: Engagement;
  readonly draft: AmendmentDraft;
  readonly shape: AmendmentShape;
}): AmendmentProblem[] {
  const { engagement, draft, shape } = input;
  const problems: AmendmentProblem[] = [];

  if (draft.reason.trim() === "") {
    problems.push({ field: "reason", message: "Say why this change is needed." });
  }

  if (draft.lines.length === 0) {
    problems.push({ field: "lines", message: "Add at least one line." });
  } else if (draft.lines.length > MAXIMUM_AMENDMENT_LINES) {
    problems.push({
      field: "lines",
      message: `A change request takes at most ${MAXIMUM_AMENDMENT_LINES} lines.`,
    });
  }

  if (draft.lines.some((line) => line.title.trim() === "")) {
    problems.push({ field: "lines", message: "Every line needs a description." });
  }

  if (shape.pricing === "server_from_frozen_rate") {
    const days = draft.lines.reduce((total, line) => total + line.quantity, 0);
    if (days <= 0) {
      problems.push({
        field: "quantity",
        message: "A time extension needs at least one extra day.",
      });
    } else if (days > MAXIMUM_EXTENSION_DAYS) {
      problems.push({
        field: "quantity",
        message: `A time extension can add at most ${MAXIMUM_EXTENSION_DAYS} days.`,
      });
    }
    return problems;
  }

  if (draft.lines.some((line) => line.amountPaise === null || line.amountPaise === 0)) {
    problems.push({
      field: "amount",
      message: "Every line needs an amount, and it cannot be zero.",
    });
    return problems;
  }

  const delta = amendmentDeltaPaise(draft);
  if (delta === 0) {
    problems.push({ field: "amount", message: "A change request has to change something." });
    return problems;
  }

  if (delta > 0) return problems;

  const stage =
    draft.stageId === null
      ? null
      : (engagement.stages.find((row) => row.id === draft.stageId) ?? null);

  if (stage === null) {
    problems.push({ field: "stage", message: "Say which stage is being reduced." });
    return problems;
  }

  if (
    stage.status !== "PENDING" &&
    stage.status !== "IN_PROGRESS" &&
    stage.status !== "CORRECTION_REQUESTED"
  ) {
    problems.push({ field: "stage", message: "That stage is too far along to be reduced." });
    return problems;
  }

  if (Math.abs(delta) >= stage.amount_paise) {
    problems.push({
      field: "amount",
      message:
        "Removing a stage entirely is a cancellation, not a change request. Leave some of it in " +
        "place, or contact support to cancel the engagement.",
    });
  }

  return problems;
}

/**
 * What the vendor's own lines add up to, for display only.
 *
 * **A5 only, and never sent.** `EngagementAmendmentCreateRequest` carries no
 * total — the server sums the lines itself and rejects a client-supplied one — so
 * this exists to show a vendor the number they are proposing before they propose
 * it, and the screen labels it as their arithmetic rather than Django's. On A3 it
 * is meaningless: the vendor names days and the server prices them from the
 * frozen rate, so `amountPaise` is null on every line.
 */
export function amendmentDeltaPaise(draft: AmendmentDraft): number {
  return draft.lines.reduce((total, line) => total + (line.amountPaise ?? 0), 0);
}

/**
 * The wire shape, for the pricing rule this engagement is under.
 *
 * On A3 `amount_paise` is **omitted**, not sent as zero: `_price_time_extension`
 * ignores it and prices from the frozen rate, and sending a number the server
 * throws away would put a figure in the request that no party agreed to.
 */
export function toAmendmentLineRequests(input: {
  readonly draft: AmendmentDraft;
  readonly shape: AmendmentShape;
}): Schemas["AmendmentLineInputRequest"][] {
  return input.draft.lines.map((line) => ({
    title: line.title.trim(),
    quantity: Math.abs(line.quantity) || 1,
    ...(input.shape.pricing === "vendor_per_line" && line.amountPaise !== null
      ? { amount_paise: line.amountPaise }
      : {}),
  }));
}

/* --------------------------------------------------------------------------
   The agreement, as the vendor is held to it — `M2-FE-602`
   -------------------------------------------------------------------------- */

/**
 * Agreed, changed by, now owed — read, never computed.
 *
 * `staged_total_paise == total_paise + amendment_delta_paise` is a **database
 * constraint**, so a client renders all three directly instead of doing
 * arithmetic the server has already checked. `total_paise` never moves: an
 * accepted amendment moves the delta, so the number both parties originally
 * agreed to stays readable beside the number they now owe.
 */
export interface AgreedTotals {
  readonly agreedPaise: number;
  readonly changedByPaise: number;
  readonly owedPaise: number;
  readonly taxPaise: number;
  readonly taxBasis: string;
}

export function agreedTotals(engagement: Engagement): AgreedTotals {
  return {
    agreedPaise: engagement.total_paise,
    changedByPaise: engagement.amendment_delta_paise,
    owedPaise: engagement.staged_total_paise,
    taxPaise: engagement.tax_paise,
    taxBasis: engagement.tax_basis,
  };
}

/* --------------------------------------------------------------------------
   Refusals this column sees and the Customer's does not
   -------------------------------------------------------------------------- */

/** `400 m2_attachment_invalid` — the bytes were not what the intent described. */
export function isEvidenceRejected(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_attachment_invalid";
}

/** `503 m2_attachment_unavailable` — storage is down. Retryable, and only this one is. */
export function isEvidenceStorageUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_attachment_unavailable";
}

/**
 * `403 m2_payout_details_required` — the progressive payout gate.
 *
 * Reached on the payout surface and **never** on an approval: an approved stage
 * writes the earning whether or not a bank account exists. The vendor has earned
 * it; they cannot be paid it yet. The two sentences are different and the screen
 * must say the first one.
 */
export function isPayoutDetailsRequired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_payout_details_required";
}
