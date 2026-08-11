/**
 * The Partner capability surface as `contracts/proposals/0013-…` describes it.
 *
 * ## Why these types are hand-written
 *
 * They should not be. Every other server shape in this app comes from
 * `@vsolve/api-client`'s generated `Schemas`, and hand-maintaining a wire type is
 * how a frontend ends up confidently wrong about a field the server renamed.
 *
 * There is nothing to generate from. `M2-BE-013` has published no M2 path, so
 * `contracts/openapi/v1.yaml` carries no operation for any endpoint below —
 * proposal 0013 exists precisely because `apps.partners` implements this domain
 * (26/26 tests) and exposes none of it over HTTP.
 *
 * So this module is quarantined, following the convention the Customer app
 * already established in `features/booking/contract-pending/` and
 * `features/requirement/contract-pending/` — deliberately copied rather than
 * improved on, because a second quarantine convention would be a second thing to
 * learn. `./README.md` states the rule; `./boundary.test.ts` enforces it.
 *
 * **Only `../adapters/` and `../../crew/adapters/` may import this file.** No
 * view component and no route knows these shapes exist, so when the contract
 * lands integration is a rewrite of the adapters and nothing else:
 *
 * ```ts
 * type CapabilityRecord = Schemas["PartnerCapability"];
 * ```
 *
 * If replacing this directory turns out to require touching a component, an
 * adapter was leaking and the leak is the bug (frontend-execution-plan.md §2).
 *
 * ## What this module deliberately does not do
 *
 * It exports no value. No sample record, no default, no "empty" fixture — a
 * placeholder here would be the one that leaks into a screen, and a screen with
 * no backend must show its real loading state and then its real error state.
 * Fixtures live in tests.
 */

/* ---------------------------------------------------------------------------
   Shared vocabulary
   --------------------------------------------------------------------------- */

/**
 * The server's workspace identifier.
 *
 * `string`, not a union of the two keys this build knows. Narrowing it here
 * would make an unrecognised key a type error at the boundary and tempt the next
 * person to widen it with a fallback; the registry drops unknown keys at
 * runtime, which is where that decision belongs.
 */
export type WorkspaceKey = string;

/** Read from the server, never derived from the workspace key. See 0012 §A1. */
export type CommercialMode = "LEAD_ONLY" | "MANAGED_PAYMENT_REQUIRED" | "NOT_APPLICABLE";

/* ---------------------------------------------------------------------------
   A. Business identity — 0013 §A
   --------------------------------------------------------------------------- */

export type BusinessType = "INDIVIDUAL" | "WORKFORCE_AGENCY" | "PROJECT_VENDOR";

export interface BusinessProfile {
  readonly business_type: BusinessType;
  readonly legal_name: string;
  readonly registration_number: string;
  readonly gst_registered: boolean;
  readonly gstin: string;
  readonly years_in_operation: number;
  readonly updated_at: string;
}

export type BusinessProfileInput = Omit<BusinessProfile, "updated_at">;

/* ---------------------------------------------------------------------------
   B. Capability options and records — 0013 §B
   --------------------------------------------------------------------------- */

/** One business type with the server's own plain-language consequence. */
export interface BusinessTypeOption {
  readonly value: BusinessType;
  readonly label: string;
  /**
   * What choosing this means, in the server's words.
   *
   * Server-authored for the same reason 0012 gives for the requirement's
   * `lifecycle_explanation`: it states a tax, liability and payout consequence,
   * and a client-side copy table would keep stating the old one after a policy
   * change nobody thought to mirror here.
   */
  readonly consequence: string;
}

/**
 * A field the server asks for alongside a capability request.
 *
 * The reason this list exists rather than an archetype branch in the form: A3
 * asks for a crew size and A5 for a project value ceiling, and a client-side
 * `if (archetype === "A3_TIME_BLOCK")` is the per-archetype scaffolding `SIM-09`
 * rejects. The client renders the fields the server named.
 */
export type CapabilityAsk = "max_crew_size" | "max_project_value_paise";

export interface CapabilityOption {
  readonly variant_id: string;
  readonly variant_name: string;
  readonly category_name: string;
  readonly workspace_key: WorkspaceKey;
  readonly commercial_mode: CommercialMode;
  /** Plain language, server-authored. Never an archetype code shown to a human. */
  readonly lifecycle_explanation: string;
  readonly requires_insurance: boolean;
  readonly asks_for: readonly CapabilityAsk[];
  /** Mirrors the server's unique-live-capability constraint. */
  readonly already_requested: boolean;
}

export interface CapabilityOptions {
  readonly business_types: readonly BusinessTypeOption[];
  readonly capabilities: readonly CapabilityOption[];
  readonly server_now: string;
}

/** The model's own enum. No client-side sixth value — see `capability-status.ts`. */
export type CapabilityStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUIRED"
  | "APPROVED"
  | "SUSPENDED"
  | "WITHDRAWN";

export interface CapabilityRecord {
  readonly id: string;
  readonly variant_id: string;
  readonly variant_name: string;
  readonly workspace_key: WorkspaceKey;
  readonly commercial_mode: CommercialMode;
  readonly status: CapabilityStatus;
  /** Required non-empty at `CHANGES_REQUIRED`. 0013 §B3 acceptance criterion 5. */
  readonly review_notes: string;
  /** Required non-empty at `SUSPENDED`, enforced by a model constraint. */
  readonly suspension_reason_code: string;
  readonly requires_insurance: boolean;
  readonly max_crew_size: number | null;
  readonly max_project_value_paise: number | null;
  /** Absolute UTC instant. An `APPROVED` capability past this is not authorized. */
  readonly expires_at: string | null;
  readonly reviewed_at: string | null;
  readonly updated_at: string;
}

export interface CapabilityList {
  readonly capabilities: readonly CapabilityRecord[];
  readonly server_now: string;
}

export interface CapabilityRequestInput {
  readonly variant_id: string;
  readonly max_crew_size?: number | null;
  readonly max_project_value_paise?: number | null;
}

/* ---------------------------------------------------------------------------
   C. Worker insurance — 0013 §C
   --------------------------------------------------------------------------- */

export interface InsuranceDeclaration {
  readonly insurer_name: string;
  readonly policy_reference: string;
  readonly coverage_paise: number;
  readonly covers_workmen_compensation: boolean;
  readonly valid_from: string;
  readonly valid_to: string;
  /**
   * Set by Operations only.
   *
   * `null` means declared, not insured. The UI must keep those words apart —
   * the difference is who carries the liability when a worker is hurt.
   */
  readonly verified_at: string | null;
}

export type InsuranceDeclarationInput = Omit<InsuranceDeclaration, "verified_at">;

/* ---------------------------------------------------------------------------
   D. Progressive gates and masked demand — 0013 §D
   --------------------------------------------------------------------------- */

export type GateName = "KYC" | "PAYOUT_DETAILS" | "CREW_ROSTER";

/** Closed enum the client maps to a route it owns — same split as the registry. */
export type GateNextAction =
  | "SUBMIT_APPLICATION"
  | "ADD_PAYOUT_ACCOUNT"
  | "ADD_CREW_MEMBER"
  | "CONTACT_SUPPORT";

export interface GateStatus {
  readonly gate: GateName;
  readonly is_satisfied: boolean;
  /** Actions this gate stands in front of. Never screens — browsing is never gated. */
  readonly blocks: readonly string[];
  /** Why it is needed *now*, in the server's words. Empty when satisfied. */
  readonly reason: string;
  readonly next_action: GateNextAction | null;
}

export interface GateList {
  readonly gates: readonly GateStatus[];
  readonly server_now: string;
}

/**
 * One masked live requirement, shown to a Partner who has proved nothing.
 *
 * Every field a customer could be identified by is absent from the *response*,
 * not merely unrendered — 0013 §D2 carries the exhaustive-field backend test, on
 * the same reasoning 0012 applies to quote teasers. `id` is a preview
 * identifier and does not resolve on any requirement route.
 */
export interface DemandSummary {
  readonly id: string;
  readonly headline: string;
  /** A locality. Never a street or a building. */
  readonly area_label: string;
  readonly starts_on: string;
  readonly workspace_key: WorkspaceKey;
  readonly is_eligible: boolean;
  /** What stands between this Partner and this lead. Empty when eligible. */
  readonly eligibility_hint: string;
}

export interface DemandPreview {
  readonly summaries: readonly DemandSummary[];
  readonly matched_service_count: number;
  readonly server_now: string;
}

/* ---------------------------------------------------------------------------
   E. Crew roster — 0013 §E
   --------------------------------------------------------------------------- */

export type CrewMembershipStatus = "ACTIVE" | "ARCHIVED";

/**
 * A worker on this Partner's roster.
 *
 * There is no `crew_member_id`. Identity is global, and handing one agency the
 * global id would let two agencies correlate rosters and discover that a worker
 * is on both. Every command takes `membership_id`, which is per-Partner.
 */
export interface CrewMemberRecord {
  readonly membership_id: string;
  readonly display_name: string;
  /** Masked at the server. The Partner who needs the number already has it. */
  readonly phone_masked: string;
  readonly status: CrewMembershipStatus;
  readonly is_supervisor: boolean;
  readonly skill_codes: readonly string[];
  readonly documents_verified_at: string | null;
  readonly added_at: string;
}

export interface CrewRoster {
  readonly members: readonly CrewMemberRecord[];
}

export interface CrewMemberInput {
  readonly display_name: string;
  readonly phone_e164: string;
  readonly skill_codes: readonly string[];
  readonly is_supervisor: boolean;
}

/**
 * What may be changed after a worker is on the roster.
 *
 * `display_name` is absent on purpose: it belongs to the global person, and one
 * agency renaming a shared worker would rename them on every other roster.
 */
export interface CrewMemberPatch {
  readonly skill_codes?: readonly string[];
  readonly is_supervisor?: boolean;
}
