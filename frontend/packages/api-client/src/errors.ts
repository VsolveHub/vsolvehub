import type { components } from "./generated/schema";

/** The error envelope as published by the Django contract. */
export type ApiErrorDetail = components["schemas"]["ApiErrorDetail"];

/**
 * Recovery intent — what the UI should offer the customer or partner next.
 *
 * This is deliberately separate from {@link ApiRequestError.isTransportRetryable}.
 * Automatic retry safety and human recovery are different questions, and
 * conflating them produces both silent duplicate mutations and dead ends where
 * the user is told "something went wrong" with no way forward.
 *
 * Every booking-stage error must be able to answer, per plan document 03:
 * what happened, whether money or booking state changed, and what to do next.
 */
export type RecoveryIntent =
  /** Safe to present a plain "Try again" affordance. */
  | "retry"
  /** Session is gone or insufficient; send the user through login. */
  | "reauthenticate"
  /** The chosen slot, provider or capacity is no longer valid; re-select. */
  | "choose_again"
  /** A usable payment instrument is required before continuing. */
  | "add_payment_method"
  /** Input is invalid; focus the offending field. */
  | "fix_input"
  /** Wait for an authoritative result rather than acting (payment pending). */
  | "await_confirmation"
  /** Nothing the user can do; surface a reference and a support path. */
  | "contact_support";

/**
 * HTTP statuses that are safe to retry automatically at the transport layer.
 *
 * 409 is excluded on purpose: a conflict means the world changed (a slot was
 * taken, a hold expired), so retrying the identical request just fails again.
 * The user has to choose again.
 *
 * This is a narrower question than the envelope's `retryable` flag — see
 * {@link ApiRequestError.isTransportRetryable}.
 */
const TRANSPORT_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Recovery for the error codes Django actually emits.
 *
 * ## Casing is the contract
 *
 * Every key is lowercase `snake_case`, because that is what
 * `common/errors/handler.py` produces: DRF's own `get_codes()` for built-in
 * failures, `validation_error` for any `ValidationError`, and the `default_code`
 * of each domain exception. The table was previously keyed `SCREAMING_CASE`, so
 * **no key ever matched** and every domain error silently fell through to
 * status-based classification. Nothing looked broken, which is what made it
 * worth fixing before more entries were added on top.
 *
 * ## Only codes that exist
 *
 * Entries for unbuilt domains — slots, quotes, capacity holds, payment — were
 * removed rather than re-cased. A mapping for a code no server sends is a guess
 * about a contract nobody has published, and it would have to be re-checked
 * against the real code set anyway. They come back one at a time as BE-06 to
 * BE-08 publish them.
 *
 * ## Unknown codes
 *
 * `defaultRecoveryForStatus` handles anything absent, so a code added by a newer
 * deployment degrades to a sensible action rather than breaking the client. That
 * is the fallback, not an excuse to leave the table empty: status alone cannot
 * tell `invalid_otp` (fix the code you typed) from `throttled` (wait).
 */
const RECOVERY_BY_CODE: Record<string, RecoveryIntent> = {
  // Identity and session — apps/identity
  not_authenticated: "reauthenticate",
  authentication_failed: "reauthenticate",
  session_expired: "reauthenticate",
  permission_denied: "contact_support",
  invalid_otp: "fix_input",
  otp_unavailable: "retry",
  throttled: "retry",

  // Validation. Django collapses every DRF ValidationError to this one code and
  // keeps the specific code inside `details`, so field errors are read from
  // `fieldErrors` rather than from the envelope code.
  validation_error: "fix_input",

  // Retry-safe command infrastructure — apps/foundation
  idempotency_in_progress: "await_confirmation",
  idempotency_key_reused: "contact_support",

  // Location — apps/locations
  geocoding_unavailable: "retry",
  address_archived: "choose_again",

  // Partner application — apps/partners
  partner_application_version_conflict: "retry",
  partner_application_incomplete: "fix_input",
  partner_schedule_invalid: "fix_input",
  partner_transition_not_allowed: "contact_support",
  partner_self_review_forbidden: "contact_support",
  partner_not_operationally_eligible: "contact_support",
  partner_presence_unavailable: "retry",

  // ---------------------------------------------------------------------------
  // M2 — workforce (A3) and project (A5) requirements, quotes and engagements.
  //
  // The full code set is fixed by M2/07-state-machines-and-permissions.md §8, so
  // unlike the M1 domains above these are mapped ahead of the endpoints rather
  // than one at a time. That table *is* the contract: a code absent from it is
  // not a code Django may send, so there is no guessing here — only transcription.
  //
  // Two mappings are worth their reasoning:
  //
  //  - Every progressive-KYC gate (`m2_kyc_required` and its siblings) is
  //    `fix_input`, not `contact_support`. Django is refusing because a form is
  //    unfinished, and the Partner completes it themselves; sending them to
  //    support would be telling someone their account is broken when they are
  //    four fields from working. `m2_capability_suspended` is the opposite case
  //    and stays `contact_support`.
  //  - `m2_unlock_payment_pending` is `await_confirmation`. It arrives as 202,
  //    not an error status, and it is the one code where offering "Try again"
  //    would invite a second INR 149 charge for one unlock.
  //    `m2_visit_plan_payment_pending` (revision 3) is the A5 twin of exactly
  //    that hazard and is mapped the same way for the same reason.
  //
  // Codes below the frozen 29 were added by the integrator at a wave gate from
  // the change requests in `frontend-execution-plan.md` §7 — the five revision 3
  // visit codes from 07 §8, plus the codes Django published outside that table.
  // ---------------------------------------------------------------------------

  // Notification feed (contract 1.34.0)
  //
  // `retry` rather than `contact_support`: the only way to meet this is to mark a
  // notice that is not yours or one that has since been removed, and in both
  // cases re-reading the feed is the whole fix. Support has nothing to add.
  notification_not_found: "retry",

  // Requirement lifecycle
  m2_requirement_not_found: "contact_support",
  m2_requirement_expired: "choose_again",
  m2_requirement_locked: "choose_again",
  m2_requirement_duplicate: "choose_again",
  m2_lifecycle_not_supported: "contact_support",

  // Invitations and capacity
  m2_invitation_expired: "choose_again",
  m2_invitation_slots_exhausted: "choose_again",
  m2_capacity_unavailable: "choose_again",

  // Capability and the progressive registration gates
  m2_capability_not_approved: "contact_support",
  m2_capability_suspended: "contact_support",
  m2_kyc_required: "fix_input",
  m2_payout_details_required: "fix_input",
  m2_crew_roster_required: "fix_input",
  m2_crew_conflict: "choose_again",
  m2_business_type_invalid: "fix_input",
  m2_capability_already_requested: "choose_again",
  // Published as `..._not_allowed`, and it has existed since 10 August. Proposal
  // 0013 guessed `m2_capability_transition_invalid`; renaming a live code to match
  // a guess would have been a breaking change bought for nothing.
  m2_capability_transition_not_allowed: "contact_support",

  // Attachments
  m2_attachment_invalid: "fix_input",
  m2_attachment_unavailable: "retry",
  m2_arrival_code_invalid: "fix_input",
  m2_arrival_code_too_soon: "choose_again",

  // Proposals
  m2_proposal_below_wage_floor: "fix_input",
  m2_proposal_invalid_shape: "fix_input",
  m2_proposal_not_selectable: "choose_again",
  m2_proposal_slot_conflict: "contact_support",
  // `contact_support`, deliberately, and NOT the `fix_input` requested in the
  // execution plan §7 on 2026-08-12. That request was written when the vendor
  // still supplied `wage_floor_skill` and `wage_floor_state_code` on the
  // proposal — inputs they could correct. `M2-BE-317` removed both from the HTTP
  // surface so a vendor can no longer influence their own statutory floor: the
  // server derives the skill from the variant configuration and the state from
  // the service area. The refusal now means "Operations has not mapped a floor
  // for this variant and area", which is nothing a vendor can fix from the
  // composer. Sending them to a rate field they cannot make right would be the
  // dead end `fix_input` exists to prevent.
  m2_wage_floor_unavailable: "contact_support",

  // A3 unlock and selection
  m2_unlock_not_available: "await_confirmation",
  m2_unlock_required: "add_payment_method",
  m2_unlock_payment_pending: "await_confirmation",
  m2_rejection_cap_reached: "contact_support",
  m2_selection_conflict: "choose_again",
  m2_reconfirmation_expired: "choose_again",

  // A3 rate card, crew offers and the booking fee (revision 4, ADR-0009)
  //
  // Landed at the Gate 1 integration on three separate session requests. Two are
  // worth reading before changing:
  //
  // `m2_booking_fee_not_chargeable` is `await_confirmation`, and Session A asked
  // for `choose_again` ("but see why"). Its twin two blocks down settles it:
  // `m2_visit_plan_not_chargeable` is `await_confirmation` because the plan
  // becomes chargeable when a *vendor* confirms a slot. The booking fee is the
  // same shape one rail over — it becomes chargeable when a *lead accepts* — and
  // Session A's own call site already renders it as "nobody is holding this job
  // any more" with **no retry**, because the only true next step is to wait.
  // `choose_again` would offer a re-selection the Customer cannot make: nothing
  // on that screen picks the crew. Two codes describing one situation on two
  // rails should not classify differently.
  //
  // `m2_roster_insufficient` is `fix_input` and does not focus a field, because
  // the roster is not on the refusing screen. It is `fix_input` rather than
  // `contact_support` for the reason that matters to a lead: this is the one A3
  // refusal they can clear themselves, by adding a verified worker. Telling
  // somebody who is one action away from the job to go and wait would be the
  // wrong answer. It matches `m2_crew_roster_required` in the capability block
  // above, which is the same fact at the other end of the lifecycle.
  //
  // `m2_rate_card_unavailable`, by contrast, genuinely is a support case —
  // nothing the Customer presses publishes a rate for their city and skill.
  //
  // The backend column also requested `m2_crew_conflict` and
  // `m2_crew_roster_required` here for 1.30.0; both were already classified in
  // the capability block above, with exactly the intended recoveries. Left where
  // they are rather than moved, and the §7 row is answered accordingly.
  m2_rate_card_unavailable: "contact_support",
  m2_roster_insufficient: "fix_input",
  m2_booking_fee_not_chargeable: "await_confirmation",

  // A5 visit plan and site visits (revision 3, ADR-0008)
  //
  // `m2_visit_plan_not_chargeable` is `await_confirmation` rather than an error
  // the Customer acts on: the plan becomes chargeable when a *vendor* confirms a
  // slot, so the only correct next step is to wait. `m2_visit_not_completed` is
  // `fix_input` because it reaches the vendor in the on-site composer, and the
  // offending input is which visit the estimate is filed against — a visit that
  // never happened cannot carry an estimate, and that is the vendor's own next
  // action (confirm arrival, complete the visit), not a support case.
  m2_visit_plan_required: "fix_input",
  m2_visit_plan_not_chargeable: "await_confirmation",
  m2_visit_plan_payment_pending: "await_confirmation",
  m2_visit_slot_unavailable: "choose_again",
  m2_visit_not_completed: "fix_input",

  // Engagement stages and amendments
  m2_stage_not_funded: "add_payment_method",
  m2_stage_disputed: "contact_support",
  m2_amendment_required: "contact_support",
  m2_cancellation_needs_confirmation: "await_confirmation",
  // Wave C3. Both are transition refusals, and both mean the record moved under
  // the screen — somebody else acted, or a clock did. Re-reading is the recovery,
  // which is `choose_again`: the state the button was drawn from is stale, and
  // offering "Try again" would resend a command against the state that just lost.
  m2_stage_transition_not_allowed: "choose_again",
  m2_amendment_not_actionable: "choose_again",

  // Requirement transitions
  //
  // The generic requirement refusal: the request is closed, already has a chosen
  // vendor, or is past the point this command applies at. It reached the frontend
  // through the status-based fallback until Wave I, which classified every 409 as
  // `retry` — and a retry is the one recovery guaranteed not to work here, because
  // nothing about resending changes the state that refused.
  m2_requirement_transition_not_allowed: "choose_again",

  // The two fail-closed configuration states.
  //
  // These are the codes `apps/requirements/pricing.py` raises when an owner
  // decision has not been made: no effective `M2AccessPrice` row, or an unset
  // clock, cap or disposition rule. They are NOT transient and they are NOT the
  // user's fault, so classifying them as `retry` — which is where the status
  // fallback put them — offers the one action certain to fail, forever, on every
  // press. `contact_support` is the honest recovery: a human has to load a price
  // or make a decision before this can succeed.
  m2_access_price_unavailable: "contact_support",
  m2_policy_unavailable: "contact_support",

  // Adapters
  m2_provider_unavailable: "retry",

  // A7 rentals / A9 stays — domain refusals the booking UIs surface
  min_stay_not_met: "fix_input",
  dates_unavailable: "choose_again",
  out_of_stock: "choose_again",
  insufficient_quantity: "choose_again",
  handover_pin_invalid: "fix_input",
  rental_state_invalid: "choose_again",
  stay_state_invalid: "choose_again",
};

/**
 * Reads one field message out of a `details` entry.
 *
 * Accepts a bare string and the `{message, code}` object Django's exception
 * handler produces. Returns null for anything else so a number, a null or a
 * nested structure never reaches a form field as text.
 */
function readFieldMessage(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const message = (entry as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}

/** Base class so callers can catch every failure this package produces. */
export abstract class ApiClientError extends Error {
  abstract readonly isTransportRetryable: boolean;
  abstract readonly recovery: RecoveryIntent;

  /** Backend correlation id, when the server managed to produce one. */
  readonly requestId: string | null;

  protected constructor(message: string, requestId: string | null) {
    super(message);
    this.name = new.target.name;
    this.requestId = requestId;
  }
}

/** The server responded with a structured, contract-shaped error envelope. */
export class ApiRequestError extends ApiClientError {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly recovery: RecoveryIntent;

  /**
   * The server's own judgement: could a retry of this operation ever succeed?
   *
   * Semantic, not mechanical. `partner_application_version_conflict` is
   * `retryable: true` because saving again *after refetching the new version*
   * will work — not because resending the same request would. Use it to decide
   * whether to offer a "Try again" affordance at all.
   */
  readonly retryable: boolean;

  /**
   * Whether the query layer may silently resend the identical request.
   *
   * Deliberately stricter than {@link retryable}, and the two must not be
   * conflated: treating the server's semantic hint as permission to auto-retry
   * would resend a payment on a 409. Both have to agree — the status must be a
   * transport-level failure class, and the server must not have vetoed a retry.
   */
  readonly isTransportRetryable: boolean;

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message, detail.request_id ?? null);
    this.status = status;
    this.code = detail.code;
    this.details = detail.details ?? null;
    this.retryable = detail.retryable;
    this.isTransportRetryable = detail.retryable && TRANSPORT_RETRYABLE_STATUSES.has(status);
    this.recovery = RECOVERY_BY_CODE[detail.code] ?? defaultRecoveryForStatus(status);
  }

  /**
   * Field-addressable validation messages, when the backend supplied them.
   *
   * The published contract types `details` as unknown, so this narrows
   * defensively rather than asserting a shape the contract does not promise.
   *
   * Django's envelope serialises each DRF `ErrorDetail` as `{message, code}`,
   * so a validation failure arrives as `{phone_number: [{message, code}]}` and
   * not as a list of strings. Both are read here; anything else is dropped
   * rather than stringified, because `[object Object]` under a form field is
   * worse than no message at all.
   */
  get fieldErrors(): Record<string, string[]> {
    if (!this.details || typeof this.details !== "object" || Array.isArray(this.details)) {
      return {};
    }
    const result: Record<string, string[]> = {};
    for (const [field, value] of Object.entries(this.details as Record<string, unknown>)) {
      const entries = Array.isArray(value) ? value : [value];
      const messages = entries
        .map((entry) => readFieldMessage(entry))
        .filter((entry): entry is string => entry !== null);
      if (messages.length > 0) result[field] = messages;
    }
    return result;
  }
}

/**
 * The request never produced a usable HTTP response: offline, DNS failure,
 * TLS failure, timeout or an aborted navigation.
 */
export class ApiNetworkError extends ApiClientError {
  readonly isTransportRetryable = true;
  readonly recovery: RecoveryIntent = "retry";
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message, null);
    this.cause = cause;
  }
}

/**
 * A response arrived but did not match the published contract — typically an
 * HTML error page from a proxy or load balancer rather than the API.
 *
 * Treated as a distinct class so it can be alerted on: it means something
 * between the browser and Django is misbehaving, not that the user did
 * anything wrong.
 */
export class ApiContractError extends ApiClientError {
  readonly isTransportRetryable: boolean;
  readonly recovery: RecoveryIntent;
  readonly status: number;
  readonly bodyPreview: string;

  constructor(status: number, bodyPreview: string) {
    super(
      `The server returned an unexpected response (HTTP ${status}). ` +
        "This has been recorded and no action was completed.",
      null,
    );
    this.status = status;
    this.bodyPreview = bodyPreview;
    this.isTransportRetryable = TRANSPORT_RETRYABLE_STATUSES.has(status);
    this.recovery = this.isTransportRetryable ? "retry" : "contact_support";
  }
}

function defaultRecoveryForStatus(status: number): RecoveryIntent {
  if (status === 401) return "reauthenticate";
  if (status === 403) return "contact_support";
  if (status === 409) return "choose_again";
  if (status === 422 || status === 400) return "fix_input";
  if (TRANSPORT_RETRYABLE_STATUSES.has(status)) return "retry";
  return "contact_support";
}

/** Narrows an unknown error-envelope body to the contract shape. */
export function parseErrorEnvelope(body: unknown): ApiErrorDetail | null {
  if (!body || typeof body !== "object") return null;
  const envelope = body as { error?: unknown };
  if (!envelope.error || typeof envelope.error !== "object") return null;

  const detail = envelope.error as Record<string, unknown>;
  if (typeof detail.code !== "string" || typeof detail.message !== "string") return null;

  return {
    code: detail.code,
    message: detail.message,
    details: detail.details ?? null,
    // Defaults to false when absent. An older deployment that predates the field
    // should not have its errors treated as retryable by omission.
    retryable: detail.retryable === true,
    request_id: typeof detail.request_id === "string" ? detail.request_id : null,
  };
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** True when the failure is safe for an automatic transport-level retry. */
export function isTransportRetryable(error: unknown): boolean {
  return isApiClientError(error) ? error.isTransportRetryable : false;
}
