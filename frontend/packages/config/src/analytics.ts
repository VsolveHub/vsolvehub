/**
 * M2 analytics event names and the redaction rule that governs their payloads.
 *
 * Closes `M2-FE-011` (`PLN-05`).
 *
 * ## What this file is for
 *
 * Every M2 success measure in `Django_Next.js_Plan/M2/README.md` is a ratio
 * between two events. Quote fill rate is `requirement.submitted` against
 * `quote.first_usable`; unlock conversion is `teaser.viewed` against
 * `unlock.completed`. Naming those events after the fact, screen by screen,
 * produces two spellings of the same moment and a measure nobody can compute —
 * so the names are fixed here first and screens use the constant.
 *
 * ## Why the payload allow-list is a hard rule
 *
 * Analytics is the least-guarded surface in the product. It fans out to
 * third-party processors, it lands in session replay, and it is the one place
 * where a payload is copied without anyone reading it. M2 carries clarification
 * text between strangers, KYC and bank details, crew members' identity data,
 * precise site addresses and payment payloads — none of which any measure above
 * needs.
 *
 * So properties are allow-listed rather than denied: `sanitizeProperties` keeps
 * the keys named in `ALLOWED_PROPERTIES` and drops everything else. A deny-list
 * would need updating every time a screen gained a field, and the failure mode
 * of forgetting is a leak rather than a missing chart.
 *
 * ## The identifier rule
 *
 * Server-issued opaque ids (`requirement_id`, `engagement_id`) are allowed:
 * they carry no personal data on their own and they are what makes a funnel
 * joinable. Anything a person would recognise as *theirs* — a phone number, a
 * name, an address, a PAN, a bank account, an amount they paid — is not, and no
 * amount of hashing changes that, because a hashed phone number is still a
 * stable identifier for one person.
 */

/* ---------------------------------------------------------------------------
   Event names
   --------------------------------------------------------------------------- */

/**
 * Every M2 analytics event, grouped by the measure it serves.
 *
 * `domain.thing_happened`, past tense, snake_case after the dot. Past tense
 * because an event is a record of something that already happened — a name in
 * the imperative ("submit_requirement") reads as a command and invites emitting
 * it before the server agreed, which is how a funnel ends up with more
 * submissions than requirements.
 */
export const M2_EVENTS = {
  /** Quote fill rate, and time to first quote against the SLA. */
  requirementStarted: "requirement.started",
  requirementSubmitted: "requirement.submitted",
  requirementDuplicateWarned: "requirement.duplicate_warned",
  requirementMerged: "requirement.merged",
  requirementExpired: "requirement.expired",
  firstUsableQuote: "quote.first_usable",
  quoteSlaBreached: "quote.sla_breached",

  /** Vendor invitation response rate. */
  invitationViewed: "invitation.viewed",
  invitationAccepted: "invitation.accepted",
  invitationDeclined: "invitation.declined",
  invitationExpired: "invitation.expired",
  proposalSubmitted: "proposal.submitted",
  proposalSuperseded: "proposal.superseded",

  /** Unlock conversion and unlock refund rate. */
  teaserViewed: "teaser.viewed",
  unlockOffered: "unlock.offered",
  unlockCheckoutStarted: "unlock.checkout_started",
  unlockCompleted: "unlock.completed",
  unlockFailed: "unlock.failed",
  unlockRefunded: "unlock.refunded",

  /** Selection-to-confirmation rate. */
  quoteCompared: "quote.compared",
  proposalSelected: "proposal.selected",
  proposalRejected: "proposal.rejected",
  selectionReconfirmed: "selection.reconfirmed",
  selectionLapsed: "selection.lapsed",
  engagementCreated: "engagement.created",

  /** Dispute rate per completed engagement. */
  stageFunded: "stage.funded",
  stageEvidenceSubmitted: "stage.evidence_submitted",
  stageApproved: "stage.approved",
  stageDisputed: "stage.disputed",
  attendanceConfirmed: "attendance.confirmed",
  attendanceDisputed: "attendance.disputed",
  safetyIncidentReported: "safety_incident.reported",
  engagementCompleted: "engagement.completed",
  engagementCancelled: "engagement.cancelled",

  /** Operations touches per request, against the unit economics model. */
  operationsActionTaken: "operations.action_taken",
  operationsAssistedQuoteCaptured: "operations.assisted_quote_captured",
} as const;

export type M2EventName = (typeof M2_EVENTS)[keyof typeof M2_EVENTS];

/* ---------------------------------------------------------------------------
   Payload allow-list
   --------------------------------------------------------------------------- */

/**
 * The only property keys an M2 event may carry.
 *
 * Each earns its place by being needed for a declared measure and by being safe
 * to hand a third party. Two are worth their notes:
 *
 *  - `unlock_price_paise` is the *published list price*, which is a product
 *    configuration rather than a fact about anyone. Quoted amounts, stage
 *    amounts and refund amounts are absent on purpose: a project total is a
 *    commercially sensitive number belonging to two identifiable parties.
 *  - `postal_code` is the coarsest location any measure needs. Latitude,
 *    longitude and address lines are never emitted — a site address plus a date
 *    is an instruction for finding a specific person at a specific place.
 */
export const ALLOWED_PROPERTIES = [
  // Opaque server identifiers, for joining a funnel.
  "requirement_id",
  "invitation_id",
  "proposal_id",
  "engagement_id",
  "stage_id",

  // Lifecycle and catalog shape.
  "archetype",
  "commercial_mode",
  "category_slug",
  "service_variant_id",
  "workspace_key",

  // Coarse location. City and pin code only.
  "city",
  "postal_code",

  // Funnel shape and outcomes.
  "status",
  "reason_code",
  "error_code",
  "quote_count",
  "usable_quote_count",
  "rejection_count",
  "surface",
  "step",

  // Timing, for SLA and conversion measures. Durations, never wall-clock
  // timestamps tied to one person's activity.
  "elapsed_ms",
  "sla_remaining_ms",
  "within_sla",

  // Product configuration, not anyone's money.
  "unlock_price_paise",

  // Operations unit economics.
  "actor_role",
  "action",
  "assisted",
] as const;

export type AllowedProperty = (typeof ALLOWED_PROPERTIES)[number];

const ALLOWED = new Set<string>(ALLOWED_PROPERTIES);

/** Values that survive sanitisation. Objects and arrays do not — see below. */
export type AnalyticsValue = string | number | boolean | null;

export type AnalyticsProperties = Record<string, unknown>;

/**
 * Drops every property not on the allow-list, and every nested value.
 *
 * Nested objects and arrays are removed regardless of their key. A permitted key
 * holding an object is how a whole serialized requirement — answers,
 * attachments, the customer's own words — travels under the name
 * `requirement_id`, and no allow-list of keys can catch that. Scalars only.
 *
 * Returns a new object; the input is never mutated. Deliberately silent: a throw
 * here would take down a screen over telemetry, and telemetry is never worth a
 * broken screen. Dropped keys are visible as gaps in the dashboard, which is the
 * right place to notice them.
 */
export function sanitizeProperties(properties: AnalyticsProperties): Record<string, AnalyticsValue> {
  const safe: Record<string, AnalyticsValue> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED.has(key)) continue;

    if (value === null || typeof value === "boolean" || typeof value === "string") {
      safe[key] = value;
      continue;
    }
    // NaN and Infinity serialise to null in JSON and arrive as a hole in a
    // chart; dropping them keeps the absence honest.
    if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    }
  }

  return safe;
}

/**
 * Whether a property key may be emitted.
 *
 * Exported so a test can assert the allow-list directly rather than inferring it
 * from `sanitizeProperties`' output.
 */
export function isAllowedProperty(key: string): key is AllowedProperty {
  return ALLOWED.has(key);
}
