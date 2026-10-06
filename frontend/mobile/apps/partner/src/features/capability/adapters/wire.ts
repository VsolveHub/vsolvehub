// Ported from frontend/apps/partner/features/capability/adapters/wire.ts
import { ApiRequestError, type Schemas } from "@vsolve/api-client";

/**
 * The Partner registration surface, as contract 1.22.0 actually publishes it.
 *
 * ## What this file replaced
 *
 * `features/capability/contract-pending/types.ts` — thirteen hand-written wire
 * shapes written against proposal 0013 while none of it existed over HTTP. Wave
 * C1 published all thirteen paths on 12 August, so the quarantine's own README
 * said to delete it, and this is step 3 of that list: every adapter now reads
 * `Schemas[...]` and the hand-written copies are gone.
 *
 * The aliases below are aliases, not redefinitions. If Codex renames a field the
 * typecheck fails here rather than at a screen, which is the whole point.
 *
 * ## Why the vocabulary unions are still hand-written
 *
 * Django publishes `status`, `workspace_key`, `commercial_mode`, `asks_for` and
 * the business type on the options list as bare `string`. That is deliberate on
 * their side — an opaque value the client must not parse — but the client still
 * has to decide what it can *describe*. So the closed sets below are this
 * build's vocabulary, and every reader goes through a `read*` narrowing that
 * returns `null` for anything it does not recognise.
 *
 * `null` rather than a fallback, everywhere. A sixth capability status arriving
 * from a newer deployment must render as "we cannot describe this", never as the
 * nearest thing we do know — 1.22.0 split `REJECTED` out of `WITHDRAWN` for
 * exactly that reason, and a client that had guessed would have told people they
 * closed a request Operations refused.
 */

/* ---------------------------------------------------------------------------
   A. Business identity — 0013 §A
   --------------------------------------------------------------------------- */

export type BusinessProfile = Schemas["PartnerBusinessProfile"];
export type BusinessProfileWrite = Schemas["PartnerBusinessProfileWriteRequest"];
export type BusinessType = Schemas["PartnerBusinessTypeEnum"];
export type BusinessTypeOption = Schemas["BusinessTypeOption"];

export const BUSINESS_TYPES: readonly BusinessType[] = [
  "INDIVIDUAL",
  "WORKFORCE_AGENCY",
  "PROJECT_VENDOR",
];

export function readBusinessType(value: string): BusinessType | null {
  return BUSINESS_TYPES.includes(value as BusinessType) ? (value as BusinessType) : null;
}

/**
 * The form's own shape: every field present, none optional.
 *
 * `PartnerBusinessProfileWriteRequest` makes four fields optional because a
 * `PUT` may omit them. A form cannot — a control is either rendered with a value
 * or not rendered at all — and letting `undefined` into the validation rules
 * would mean `certainRefusals` had to answer "is an absent GSTIN a GSTIN". So
 * the draft is total and `toBusinessProfileWrite` is the one place it narrows.
 */
export interface BusinessProfileInput {
  readonly business_type: BusinessType;
  readonly legal_name: string;
  readonly registration_number: string;
  readonly gst_registered: boolean;
  readonly gstin: string;
  readonly years_in_operation: number;
  /**
   * The UPI address the day-settlement deep link is built from (contract 1.30.0).
   *
   * **Carried, not asked for.** No control on this form collects it and none
   * should here: the field belongs to the wave that builds the evening
   * "Day settled?" tap (`M2-FE-513`), and adding a mandatory VPA to registration
   * would put a payment question in front of a Partner who has not yet been
   * offered any work.
   *
   * It is on the draft because a `PUT` that omitted it would **erase one that
   * already exists**. The write serializer defaults `upi_vpa` to `''`, so a
   * vendor whose VPA was set elsewhere would silently lose it by saving an
   * unrelated change to their legal name. Reading it and sending it back
   * unchanged is what makes this form safe to submit.
   */
  readonly upi_vpa: string;
}

export function toBusinessProfileWrite(input: BusinessProfileInput): BusinessProfileWrite {
  return {
    business_type: input.business_type,
    legal_name: input.legal_name,
    registration_number: input.registration_number,
    gst_registered: input.gst_registered,
    gstin: input.gstin,
    years_in_operation: input.years_in_operation,
    // Round-tripped verbatim. See `BusinessProfileInput.upi_vpa`.
    upi_vpa: input.upi_vpa,
  };
}

/**
 * The draft a form starts from.
 *
 * A `404` from `GET /partner/business-profile/` is the ordinary state for every
 * M1 Partner and arrives here as `null`. The default is `INDIVIDUAL` because
 * that is what the server already assumes — showing an empty radio group would
 * ask a question the platform has already answered, and would make "I have not
 * chosen" look like a problem.
 */
export function toBusinessProfileInput(profile: BusinessProfile | null): BusinessProfileInput {
  return {
    business_type: profile ? readBusinessType(profile.business_type) ?? "INDIVIDUAL" : "INDIVIDUAL",
    legal_name: profile?.legal_name ?? "",
    registration_number: profile?.registration_number ?? "",
    gst_registered: profile?.gst_registered ?? false,
    gstin: profile?.gstin ?? "",
    years_in_operation: profile?.years_in_operation ?? 0,
    upi_vpa: profile?.upi_vpa ?? "",
  };
}

/* ---------------------------------------------------------------------------
   B. Capability options and records — 0013 §B
   --------------------------------------------------------------------------- */

export type CapabilityOption = Schemas["CapabilityOption"];
export type CapabilityOptions = Schemas["CapabilityOptions"];
export type CapabilityRecord = Schemas["PartnerCapability"];
export type CapabilityList = Schemas["PartnerCapabilityList"];
export type CapabilityRequestInput = Schemas["CapabilityRequestRequest"];
export type CapabilitySubmitInput = Schemas["CapabilitySubmitRequest"];
export type CapabilityTransition = Schemas["CapabilityTransitionSummary"];

/**
 * Whether a capability has been narrowed to some of the Partner's areas.
 *
 * **Empty means every area this Partner serves.** That is the common case and
 * the backend states it explicitly: the list can only ever *subtract* from the
 * Partner's own service areas, so an empty one is total coverage, not none.
 * Rendering `[]` as "you are not covered anywhere" would tell a Partner they had
 * been cut off from the work they were just approved for.
 */
export function isAreaNarrowed(record: CapabilityRecord): boolean {
  return record.service_area_ids.length > 0;
}

/**
 * The six statuses `PartnerCapability.Status` carries at 1.22.0.
 *
 * `REJECTED` is Operations' refusal and `WITHDRAWN` is the Partner's own exit.
 * Before 1.22.0 both were `WITHDRAWN`, and this build described that as "no
 * longer live" because it could not honestly say more. It can now, and the two
 * get different copy and different next actions — one needs a support path, the
 * other needs an obvious way to ask again.
 *
 * Neither blocks a fresh request for the same variant. A terminal status that
 * did would be a permanent ban wearing a status field's clothes.
 */
export const CAPABILITY_STATUSES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "CHANGES_REQUIRED",
  "APPROVED",
  "SUSPENDED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export function readCapabilityStatus(value: string): CapabilityStatus | null {
  return CAPABILITY_STATUSES.includes(value as CapabilityStatus)
    ? (value as CapabilityStatus)
    : null;
}

/**
 * A field the server asks for alongside a capability request.
 *
 * The reason this list exists rather than an archetype branch in the form: A3
 * asks for a crew size and A5 for a project value ceiling, and a client-side
 * `if (archetype === "A3_TIME_BLOCK")` is the per-archetype scaffolding `SIM-09`
 * rejects. The client renders the fields the server named, and drops any name it
 * has no control for rather than rendering a blank box.
 */
export const CAPABILITY_ASKS = ["max_crew_size", "max_project_value_paise"] as const;

export type CapabilityAsk = (typeof CAPABILITY_ASKS)[number];

export function readCapabilityAsk(value: string): CapabilityAsk | null {
  return CAPABILITY_ASKS.includes(value as CapabilityAsk) ? (value as CapabilityAsk) : null;
}

/* ---------------------------------------------------------------------------
   C. Worker insurance — 0013 §C
   --------------------------------------------------------------------------- */

export type InsuranceDeclaration = Schemas["PartnerInsurance"];
export type InsuranceDeclarationInput = Schemas["PartnerInsuranceWriteRequest"];

/* ---------------------------------------------------------------------------
   D. Progressive gates and masked demand — 0013 §D
   --------------------------------------------------------------------------- */

export type GateStatus = Schemas["ProgressiveGate"];
export type GateList = Schemas["ProgressiveGateList"];
export type GateName = Schemas["ProgressiveGateEnum"];

/**
 * The next action a gate names.
 *
 * Three, not the four proposal 0013 §D1 asked for: `CONTACT_SUPPORT` was not
 * published. That is right — a gate whose only recovery is "message us" is a
 * gate nobody can clear, and all three live gates have a screen that clears
 * them. Recorded in `frontend-execution-plan.md` §7 so the difference is not
 * discovered again.
 */
export type GateNextAction = Schemas["GateNextActionEnum"];

export type DemandSummary = Schemas["DemandSummary"];
export type DemandPreview = Schemas["DemandPreview"];

/* ---------------------------------------------------------------------------
   E. Crew roster — 0013 §E
   --------------------------------------------------------------------------- */

export type CrewMemberRecord = Schemas["CrewMember"];
export type CrewRoster = Schemas["CrewList"];
export type CrewMemberInput = Schemas["CrewMemberCreateRequest"];
export type CrewMemberPatch = Schemas["PatchedCrewMemberUpdateRequest"];
export type CrewAvailability = Schemas["CrewAvailability"];
export type CrewAvailabilityInput = Schemas["CrewAvailabilityWriteRequest"];

/* ---------------------------------------------------------------------------
   F. Languages (contract 1.23.0)
   --------------------------------------------------------------------------- */

export type PartnerLanguageList = Schemas["PartnerLanguageList"];
export type PartnerLanguageInput = Schemas["PartnerLanguageWriteRequest"];

export const CREW_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export type CrewMembershipStatus = (typeof CREW_STATUSES)[number];

export function readCrewStatus(value: string): CrewMembershipStatus | null {
  return CREW_STATUSES.includes(value as CrewMembershipStatus)
    ? (value as CrewMembershipStatus)
    : null;
}

/**
 * Field errors Django returned, keyed to the control that caused them.
 *
 * Lives here rather than in the view because it names the generated client —
 * the layering rule `boundary.test.ts` enforces: views consume adapters, and
 * adapters are the only modules that read `@vsolve/api-client`.
 */
export function serverFieldProblems<TField extends string>(
  error: unknown,
  fields: readonly TField[],
): { field: TField; message: string }[] {
  if (!(error instanceof ApiRequestError)) return [];
  const byField = error.fieldErrors;

  return fields.flatMap((field) => {
    const [message] = byField[field] ?? [];
    return message === undefined ? [] : [{ field, message }];
  });
}
