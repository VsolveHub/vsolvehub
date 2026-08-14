import type { BusinessProfileInput, BusinessType } from "./wire";

/**
 * Re-exported so components can name the three values without reaching into the
 * quarantine.
 *
 * A domain enum rather than a response shape: these three words are the
 * vocabulary of the feature, and they do not change when the endpoint publishes.
 * The Customer app's booking quarantine makes the same allowance for
 * `FulfilmentType`, and for the same reason.
 */
export type { BusinessType };

/**
 * Which fields each business type actually needs, and what is forbidden.
 *
 * Closes the validation half of `M2-FE-103`. The *consequences* are not here —
 * they arrive as `BusinessTypeOption.consequence` from the server, because they
 * state tax, liability and payout outcomes and a client-side copy table would
 * keep stating the old ones after a policy change.
 *
 * ## What this module is allowed to decide
 *
 * Only the two rules the database itself enforces:
 *
 * - `partners_individual_has_no_registration_number` — an `INDIVIDUAL` profile
 *   with a registration number cannot be stored at all.
 * - `partners_gstin_requires_gst_registered` — a GSTIN without the flag cannot
 *   be stored at all.
 *
 * Those are absolute, so checking them here costs a round-trip nobody learns
 * anything from. Everything else is *guidance*: a legal name is expected of an
 * agency and the form says so, but the client never blocks the save. The
 * onboarding lesson in `readiness.ts` is that a client rule stricter than the
 * server's traps people who have actually finished, and it is worse here — a
 * Partner who cannot get past a business-type screen has no account at all.
 *
 * ## Why the type is stated rather than inferred
 *
 * Nothing in this app may look at which capability was requested and conclude a
 * business type, or at a service name and conclude "that sounds like an agency".
 * That is the same inference the workspace registry forbids, one step earlier:
 * it decides who signs the contract and who pays the tax, and getting it from a
 * category string is how a sole electrician is filed as a labour contractor.
 */

/** A field the form should show for this type. Order is the form's order. */
export type BusinessField =
  | "legal_name"
  | "registration_number"
  | "gst_registered"
  | "gstin"
  | "years_in_operation";

interface TypeShape {
  /** Fields worth showing. A field absent here is never rendered for this type. */
  readonly fields: readonly BusinessField[];
  /** Fields the server will reject as empty. Guidance, not a client-side gate. */
  readonly expected: readonly BusinessField[];
}

const SHAPES: Record<BusinessType, TypeShape> = {
  // No registration number, at all: the check constraint refuses it, so the
  // field is not rendered rather than rendered and validated. A field you can
  // fill in and then be told off for is a worse experience than one that was
  // never offered.
  INDIVIDUAL: {
    fields: ["gst_registered", "gstin", "years_in_operation"],
    expected: [],
  },
  WORKFORCE_AGENCY: {
    fields: [
      "legal_name",
      "registration_number",
      "gst_registered",
      "gstin",
      "years_in_operation",
    ],
    expected: ["legal_name"],
  },
  PROJECT_VENDOR: {
    fields: [
      "legal_name",
      "registration_number",
      "gst_registered",
      "gstin",
      "years_in_operation",
    ],
    expected: ["legal_name"],
  },
};

export function fieldsFor(businessType: BusinessType): readonly BusinessField[] {
  return SHAPES[businessType].fields;
}

export function expectedFor(businessType: BusinessType): readonly BusinessField[] {
  return SHAPES[businessType].expected;
}

/** A refusal the database is certain to make, keyed to the field that causes it. */
export interface BusinessProfileProblem {
  readonly field: BusinessField;
  readonly message: string;
}

/**
 * The problems the server cannot possibly accept.
 *
 * Deliberately short. Anything not listed goes to the server and comes back as a
 * field error, which is the only place the full rule set lives.
 */
export function certainRefusals(input: BusinessProfileInput): BusinessProfileProblem[] {
  const problems: BusinessProfileProblem[] = [];

  if (input.business_type === "INDIVIDUAL" && input.registration_number.trim() !== "") {
    problems.push({
      field: "registration_number",
      message:
        "Working as yourself means there is no company registration to record. Choose a business type if you have one.",
    });
  }

  if (!input.gst_registered && input.gstin.trim() !== "") {
    problems.push({
      field: "gstin",
      message: "Tick “I am GST registered” before adding a GSTIN, or clear the GSTIN.",
    });
  }

  return problems;
}

/**
 * Fields the Partner has left empty that the server expects.
 *
 * Separate from `certainRefusals` because these do **not** block: they populate
 * the "you may want to add this" line under the form, and the save proceeds
 * regardless. Django decides.
 */
export function missingExpected(input: BusinessProfileInput): BusinessField[] {
  return expectedFor(input.business_type).filter((field) => {
    if (field === "legal_name") return input.legal_name.trim() === "";
    if (field === "registration_number") return input.registration_number.trim() === "";
    return false;
  });
}

/**
 * Clears the fields a type does not carry, so switching type cannot smuggle a
 * value the constraint forbids.
 *
 * The bug this prevents is specific and easy to hit: fill in an agency
 * registration number, change your mind, pick "just me", save. Without this the
 * form still holds the number, `PUT` sends it, and the database refuses a change
 * the Partner believes they made correctly.
 */
export function normalizeForType(input: BusinessProfileInput): BusinessProfileInput {
  const allowed = new Set(fieldsFor(input.business_type));

  return {
    business_type: input.business_type,
    legal_name: allowed.has("legal_name") ? input.legal_name : "",
    registration_number: allowed.has("registration_number") ? input.registration_number : "",
    gst_registered: input.gst_registered,
    // Held to the same rule as the constraint: no flag, no number.
    gstin: input.gst_registered ? input.gstin : "",
    years_in_operation: input.years_in_operation,
    // Carried through every type, because it belongs to none of them. Clearing
    // it here would mean a Partner who changed their mind about being an agency
    // silently lost the UPI address their wages are settled to.
    upi_vpa: input.upi_vpa,
  };
}
