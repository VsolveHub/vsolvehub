import type { Schemas } from "@vsolve/api-client";

import { describeGate } from "./gates";
import {
  daysUntilDocumentExpiry,
  describeExpiredDocuments,
  hasExpiredDocuments,
} from "./capability-status";
import { describeInsurance } from "./insurance";
import {
  readCapabilityAsk,
  readCapabilityStatus,
  type BusinessProfile,
  type CapabilityOption,
  type CapabilityRecord,
  type GateStatus,
  type InsuranceDeclaration,
} from "./wire";

/**
 * The guided registration plan: what is needed, why, and when it is asked for.
 *
 * Closes `M2-FE-105`.
 *
 * ## The rule this module exists to hold
 *
 * *Requested at the point they become necessary, not as an up-front wall.* The
 * flow-weight budget is a hard constraint: a Partner reaches real demand after
 * phone, name, one service and one city, and every other thing this platform
 * eventually needs — capacity, skills, experience, hours, documents, insurance,
 * bank details, a crew roster — is asked for at the moment it starts to matter.
 *
 * So the plan has **three** groups and not one checklist:
 *
 * | Group | Meaning | Rendered as |
 * |---|---|---|
 * | `now` | A server signal says this is blocking something the Partner has already asked for | A control |
 * | `later` | Real, and not yet asked for. Includes every unsatisfied progressive gate | A muted line saying when |
 * | `done` | Satisfied | A collapsed list |
 *
 * An unsatisfied gate is **always `later`, never `now`.** That is the whole of
 * `FLOW-06`/`FLOW-07`: `assert_kyc_complete` guards accepting a first enquiry,
 * not reading a screen, and promoting it here would rebuild the twenty-minute
 * form this design removed — one row at a time, with a good reason each time.
 *
 * ## Nothing here is invented
 *
 * Every step's state comes from a server field: the M1 application, the
 * capability records, the options list, the gates read, the insurance
 * declaration and the availability schedule. Where a signal does not exist the
 * step is not claimed — `EXPERIENCE` is never `now`, because M1 does not require
 * it and inventing a requirement is how a client rule ends up stricter than the
 * server's and traps somebody who has actually finished.
 *
 * ## Not a gate
 *
 * Presentation only. Django refuses whatever it refuses; this decides what the
 * Partner is told to expect and gives them somewhere to go.
 */

type Application = Schemas["PartnerApplication"];
type Schedule = Schemas["PartnerSchedule"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];

export type RegistrationStepKey =
  | "IDENTITY"
  | "SERVICES"
  | "AREAS"
  | "BUSINESS_TYPE"
  | "CAPABILITY"
  | "CAPACITY"
  | "SKILLS"
  | "EXPERIENCE"
  | "AVAILABILITY"
  | "DOCUMENTS"
  | "DOCUMENT_EXPIRY"
  | "INSURANCE"
  | "GATE_KYC"
  | "GATE_PAYOUT_DETAILS"
  | "GATE_CREW_ROSTER";

export type RegistrationStepState = "NOW" | "LATER" | "DONE";

export interface RegistrationStep {
  readonly key: RegistrationStepKey;
  readonly title: string;
  /**
   * Why this is being asked for, at this moment.
   *
   * For the three progressive gates this is the **server's own sentence**,
   * verbatim. 0013 §D1 requires the identical string on the `403` that arrives
   * if the Partner gets there first, so somebody who reads it here and again on
   * the refusal learns nothing new and concludes nothing changed — which is
   * correct. Two similar sentences read as two different rules.
   */
  readonly why: string;
  readonly state: RegistrationStepState;
  readonly href: string | null;
  readonly actionLabel: string | null;
}

export interface RegistrationPlanView {
  readonly now: readonly RegistrationStep[];
  readonly later: readonly RegistrationStep[];
  readonly done: readonly RegistrationStep[];
  /** True when nothing is outstanding and nothing is pending — a rare, real state. */
  readonly isComplete: boolean;
}

export interface RegistrationPlanInput {
  /** `null` before the person has started an application at all. */
  readonly application: Application | null;
  readonly businessProfile: BusinessProfile | null;
  readonly capabilities: readonly CapabilityRecord[];
  readonly options: readonly CapabilityOption[];
  readonly gates: readonly GateStatus[];
  readonly insurance: InsuranceDeclaration | null;
  /** `null` when the schedule has not been read — never treated as "no hours". */
  readonly schedule: Schedule | null;
  readonly serverNow: string;
}

/** Documents M1 requires before an application can be reviewed. */
const REQUIRED_DOCUMENT_KINDS: readonly DocumentKind[] = ["GOVERNMENT_ID", "ADDRESS_PROOF"];

function hasUsableDocument(application: Application, kind: DocumentKind): boolean {
  return application.documents.some(
    (document) =>
      document.kind === kind &&
      (document.status === "PENDING" || document.status === "APPROVED"),
  );
}

/** Capability statuses that mean the Partner has committed to something. */
function isLiveRequest(record: CapabilityRecord): boolean {
  const status = readCapabilityStatus(record.status);
  return (
    status === "REQUESTED" ||
    status === "UNDER_REVIEW" ||
    status === "CHANGES_REQUIRED" ||
    status === "APPROVED"
  );
}

function isApproved(record: CapabilityRecord): boolean {
  return readCapabilityStatus(record.status) === "APPROVED";
}

/**
 * Capacity the server asked for on a capability request and the record does not
 * carry.
 *
 * Cross-referenced against `asks_for` on the option rather than guessed from the
 * archetype: A3 asks for a crew size and A5 for a project ceiling, and reading
 * the workspace key to decide which would be the per-archetype branch `SIM-09`
 * removed. A record whose option is no longer offered is skipped — there is
 * nothing to compare it against and no form that could fix it.
 */
function missingCapacity(
  capabilities: readonly CapabilityRecord[],
  options: readonly CapabilityOption[],
): CapabilityRecord[] {
  const asksByVariant = new Map(options.map((option) => [option.variant_id, option.asks_for]));

  return capabilities.filter((record) => {
    if (!isLiveRequest(record)) return false;
    const asks = asksByVariant.get(record.variant_id);
    if (asks === undefined) return false;

    return asks.some((name) => {
      const ask = readCapabilityAsk(name);
      if (ask === "max_crew_size") return record.max_crew_size === null;
      if (ask === "max_project_value_paise") return record.max_project_value_paise === null;
      return false;
    });
  });
}

function step(
  key: RegistrationStepKey,
  state: RegistrationStepState,
  title: string,
  why: string,
  action: { href: string; label: string } | null = null,
): RegistrationStep {
  return {
    key,
    title,
    why,
    state,
    href: action?.href ?? null,
    actionLabel: action?.label ?? null,
  };
}

/* ---------------------------------------------------------------------------
   The plan
   --------------------------------------------------------------------------- */

export function describeRegistrationPlan(input: RegistrationPlanInput): RegistrationPlanView {
  const { application, capabilities, options, gates, insurance, schedule, serverNow } = input;

  const liveRequests = capabilities.filter(isLiveRequest);
  const hasAsked = liveRequests.length > 0;
  const approved = capabilities.filter(isApproved);
  const steps: RegistrationStep[] = [];

  /* -- The four things that reach demand ---------------------------------- */

  steps.push(
    step(
      "IDENTITY",
      (application?.display_name.trim().length ?? 0) > 0 ? "DONE" : "NOW",
      "Your name",
      "Customers see this before they let you into their home.",
      { href: "/apply/about", label: "Add your name" },
    ),
  );

  steps.push(
    step(
      "SERVICES",
      (application?.service_variant_ids.length ?? 0) > 0 ? "DONE" : "NOW",
      "One service",
      "One thing you do. It is what we match work against — you can add more later.",
      { href: "/apply/work", label: "Pick a service" },
    ),
  );

  steps.push(
    step(
      "AREAS",
      (application?.service_area_ids.length ?? 0) > 0 ? "DONE" : "NOW",
      "One city",
      "Where you want work. You can add more later.",
      { href: "/apply/areas", label: "Choose where you work" },
    ),
  );

  /* -- Specialist work ----------------------------------------------------- */

  const askable = options.filter((option) => !option.already_requested);

  steps.push(
    step(
      "CAPABILITY",
      hasAsked ? "DONE" : askable.length > 0 ? "LATER" : "DONE",
      "Workforce or project approval",
      hasAsked
        ? "You have asked to be approved. Its progress is below."
        : "Supplying a crew or quoting for a whole project is reviewed separately from ordinary jobs. Ask when you want it — browsing does not need it.",
      askable.length > 0
        ? { href: "/apply/capabilities", label: "See what you can apply for" }
        : null,
    ),
  );

  // Business type is genuinely optional until a capability is asked for: the
  // server defaults a Partner to INDIVIDUAL, so somebody who never opened this
  // screen still has an answer. It becomes necessary the moment they ask to be
  // approved as something else, because it decides who signs, who is liable and
  // who the customer pays.
  steps.push(
    step(
      "BUSINESS_TYPE",
      input.businessProfile !== null ? "DONE" : hasAsked ? "NOW" : "LATER",
      "How you work",
      hasAsked
        ? "You have asked to be approved for specialist work. Tell us whether that is you on your own, an agency supplying people, or a vendor taking on whole jobs — it decides how tax and payment work."
        : "Asked for when you apply for workforce or project work. Until then we treat you as working on your own.",
      { href: "/apply/business", label: "Tell us how you work" },
    ),
  );

  const capacityGaps = missingCapacity(capabilities, options);
  if (capacityGaps.length > 0) {
    steps.push(
      step(
        "CAPACITY",
        "NOW",
        "How much you can take on",
        `We do not have a limit recorded for ${capacityGaps
          .map((record) => record.variant_name)
          .join(", ")}. Without one we cannot stop sending you work you are not able to staff.`,
        { href: "/apply/capabilities", label: "Set your limit" },
      ),
    );
  }

  /* -- Skills, experience, hours ------------------------------------------- */

  const hasSkills = (application?.skill_codes.length ?? 0) > 0;
  steps.push(
    step(
      "SKILLS",
      hasSkills ? "DONE" : hasAsked ? "NOW" : "LATER",
      "What you can do",
      hasAsked
        ? "Skills decide which enquiries you are eligible for. A capability without them is approved for work we will never send you."
        : "Asked for when you apply for specialist work. A skill on its own never switches a workspace on.",
      { href: "/apply/work", label: "Add your skills" },
    ),
  );

  // Never `NOW`. M1 accepts an application without it, and a client rule
  // stricter than the server's traps people who have finished.
  steps.push(
    step(
      "EXPERIENCE",
      (application?.experience_years ?? 0) > 0 ? "DONE" : "LATER",
      "How long you have done this",
      "Customers read this on your profile and it helps when two vendors quote the same price.",
      { href: "/apply/about", label: "Add your experience" },
    ),
  );

  // Only once something is approved. Hours matter when work can actually be
  // offered; asking before then is a form filled in against nothing.
  const hasHours = schedule !== null && schedule.rules.length > 0;
  steps.push(
    step(
      "AVAILABILITY",
      hasHours ? "DONE" : approved.length > 0 ? "NOW" : "LATER",
      "Your hours",
      approved.length > 0
        ? "You are approved for work. We only send enquiries inside the hours you publish, so an empty week means nothing reaches you."
        : "Asked for once something you applied for is approved.",
      { href: "/availability", label: "Set your hours" },
    ),
  );

  /* -- Documents ------------------------------------------------------------ */

  const missingDocuments =
    application === null
      ? REQUIRED_DOCUMENT_KINDS
      : REQUIRED_DOCUMENT_KINDS.filter((kind) => !hasUsableDocument(application, kind));

  const [expired] = capabilities.filter(hasExpiredDocuments);

  steps.push(
    expired
      ? step(
          "DOCUMENTS",
          "NOW",
          "A document has expired",
          `New enquiries stop reaching you until it is replaced: ${describeExpiredDocuments(expired)}. Work you have already committed to is unaffected.`,
          { href: "/apply/documents", label: "Replace it" },
        )
      : step(
          "DOCUMENTS",
          missingDocuments.length === 0 ? "DONE" : "LATER",
          "Your ID and address proof",
          "Asked for before you accept your first job, so customers know who is coming. Not before you look at work.",
          { href: "/apply/documents", label: "Add your documents" },
        ),
  );

  // The earliest future expiry across the Partner's required documents. A
  // warning, not a demand — the point of publishing the date is that somebody
  // can renew before it bites rather than after.
  const [expiryWarning] = capabilities
    .map((record) => ({ record, days: daysUntilDocumentExpiry(record, serverNow) }))
    .filter((entry): entry is { record: CapabilityRecord; days: number } => entry.days !== null)
    .sort((left, right) => left.days - right.days);

  if (expiryWarning && expiryWarning.days >= 0 && expiryWarning.days <= 60) {
    steps.push(
      step(
        "DOCUMENT_EXPIRY",
        "LATER",
        "A document runs out soon",
        `One of the documents we need expires in ${expiryWarning.days} ${
          expiryWarning.days === 1 ? "day" : "days"
        }. Replacing it before then keeps enquiries coming.`,
        { href: "/apply/documents", label: "Replace it early" },
      ),
    );
  }

  /* -- Insurance ------------------------------------------------------------ */

  const insuranceRequired = liveRequests.some((record) => record.requires_insurance);
  const optionRequiresInsurance = askable.some((option) => option.requires_insurance);
  const declared = insurance === null ? null : describeInsurance(insurance, serverNow);
  const insuranceUsable = declared !== null && !declared.isExpired;

  if (insuranceRequired || optionRequiresInsurance || declared !== null) {
    steps.push(
      step(
        "INSURANCE",
        insuranceUsable ? "DONE" : insuranceRequired ? "NOW" : "LATER",
        "Worker insurance",
        declared?.isExpired === true
          ? "The cover you declared has ended. Workforce enquiries stop reaching you until it is renewed."
          : insuranceRequired
            ? "You are sending people onto someone else's site. We need to know who covers them if they are hurt there before this work can be approved."
            : "Asked for when you apply for work where you send people to a customer's site.",
        { href: "/apply/insurance", label: "Declare your cover" },
      ),
    );
  }

  /* -- The three progressive gates, always `LATER` -------------------------- */

  const GATE_STEPS: Record<GateStatus["gate"], RegistrationStepKey> = {
    KYC: "GATE_KYC",
    PAYOUT_DETAILS: "GATE_PAYOUT_DETAILS",
    CREW_ROSTER: "GATE_CREW_ROSTER",
  };

  const GATE_TITLES: Record<GateStatus["gate"], string> = {
    KYC: "Identity check",
    PAYOUT_DETAILS: "Where money goes",
    CREW_ROSTER: "Who you send",
  };

  for (const gate of gates) {
    const explanation = describeGate(gate);
    steps.push(
      step(
        GATE_STEPS[gate.gate],
        // Satisfied is `DONE`; unsatisfied is `LATER` and never `NOW`. A gate
        // stands in front of one action, and promoting it to "do this now" is
        // how a browsing screen turns back into a wall.
        explanation === null ? "DONE" : "LATER",
        GATE_TITLES[gate.gate],
        explanation?.reason ?? "Done.",
        explanation?.actionHref && explanation.actionLabel
          ? { href: explanation.actionHref, label: explanation.actionLabel }
          : null,
      ),
    );
  }

  const now = steps.filter((entry) => entry.state === "NOW");
  const later = steps.filter((entry) => entry.state === "LATER");
  const done = steps.filter((entry) => entry.state === "DONE");

  return {
    now,
    later,
    done,
    isComplete: now.length === 0 && later.length === 0,
  };
}
