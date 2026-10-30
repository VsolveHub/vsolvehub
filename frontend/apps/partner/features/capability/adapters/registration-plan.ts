import type { Schemas } from "@vsolve/api-client";
import type { Translator } from "@vsolve/ui";

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

export function describeRegistrationPlan(
  input: RegistrationPlanInput,
  t: Translator["t"],
): RegistrationPlanView {
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
      t("me.capability.plan.identity.title"),
      t("me.capability.plan.identity.why"),
      { href: "/apply/about", label: t("me.capability.plan.identity.action") },
    ),
  );

  steps.push(
    step(
      "SERVICES",
      (application?.service_variant_ids.length ?? 0) > 0 ? "DONE" : "NOW",
      t("me.capability.plan.services.title"),
      t("me.capability.plan.services.why"),
      { href: "/apply/work", label: t("me.capability.plan.services.action") },
    ),
  );

  steps.push(
    step(
      "AREAS",
      (application?.service_area_ids.length ?? 0) > 0 ? "DONE" : "NOW",
      t("me.capability.plan.areas.title"),
      t("me.capability.plan.areas.why"),
      { href: "/apply/areas", label: t("me.capability.plan.areas.action") },
    ),
  );

  /* -- Specialist work ----------------------------------------------------- */

  const askable = options.filter((option) => !option.already_requested);

  steps.push(
    step(
      "CAPABILITY",
      hasAsked ? "DONE" : askable.length > 0 ? "LATER" : "DONE",
      t("me.capability.plan.capability.title"),
      hasAsked
        ? t("me.capability.plan.capability.whyAsked")
        : t("me.capability.plan.capability.whyDefault"),
      askable.length > 0
        ? { href: "/apply/capabilities", label: t("me.capability.plan.capability.action") }
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
      t("me.capability.plan.businessType.title"),
      hasAsked
        ? t("me.capability.plan.businessType.whyAsked")
        : t("me.capability.plan.businessType.whyDefault"),
      { href: "/apply/business", label: t("me.capability.plan.businessType.action") },
    ),
  );

  const capacityGaps = missingCapacity(capabilities, options);
  if (capacityGaps.length > 0) {
    steps.push(
      step(
        "CAPACITY",
        "NOW",
        t("me.capability.plan.capacity.title"),
        t("me.capability.plan.capacity.whyTemplate", {
          names: capacityGaps.map((record) => record.variant_name).join(", "),
        }),
        { href: "/apply/capabilities", label: t("me.capability.plan.capacity.action") },
      ),
    );
  }

  /* -- Skills, experience, hours ------------------------------------------- */

  const hasSkills = (application?.skill_codes.length ?? 0) > 0;
  steps.push(
    step(
      "SKILLS",
      hasSkills ? "DONE" : hasAsked ? "NOW" : "LATER",
      t("me.capability.plan.skills.title"),
      hasAsked ? t("me.capability.plan.skills.whyAsked") : t("me.capability.plan.skills.whyDefault"),
      { href: "/apply/work", label: t("me.capability.plan.skills.action") },
    ),
  );

  // Never `NOW`. M1 accepts an application without it, and a client rule
  // stricter than the server's traps people who have finished.
  steps.push(
    step(
      "EXPERIENCE",
      (application?.experience_years ?? 0) > 0 ? "DONE" : "LATER",
      t("me.capability.plan.experience.title"),
      t("me.capability.plan.experience.why"),
      { href: "/apply/about", label: t("me.capability.plan.experience.action") },
    ),
  );

  // Only once something is approved. Hours matter when work can actually be
  // offered; asking before then is a form filled in against nothing.
  const hasHours = schedule !== null && schedule.rules.length > 0;
  steps.push(
    step(
      "AVAILABILITY",
      hasHours ? "DONE" : approved.length > 0 ? "NOW" : "LATER",
      t("me.capability.plan.availability.title"),
      approved.length > 0
        ? t("me.capability.plan.availability.whyApproved")
        : t("me.capability.plan.availability.whyDefault"),
      { href: "/availability", label: t("me.capability.plan.availability.action") },
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
          t("me.capability.plan.documentsExpired.title"),
          t("me.capability.plan.documentsExpired.whyTemplate", {
            kinds: describeExpiredDocuments(expired),
          }),
          { href: "/apply/documents", label: t("me.capability.plan.documentsExpired.action") },
        )
      : step(
          "DOCUMENTS",
          missingDocuments.length === 0 ? "DONE" : "LATER",
          t("me.capability.plan.documents.title"),
          t("me.capability.plan.documents.why"),
          { href: "/apply/documents", label: t("me.capability.plan.documents.action") },
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
        t("me.capability.plan.documentExpiry.title"),
        t("me.capability.plan.documentExpiry.why", {
          days: expiryWarning.days,
          count: expiryWarning.days,
        }),
        { href: "/apply/documents", label: t("me.capability.plan.documentExpiry.action") },
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
        t("me.capability.plan.insurance.title"),
        declared?.isExpired === true
          ? t("me.capability.plan.insurance.whyExpired")
          : insuranceRequired
            ? t("me.capability.plan.insurance.whyRequired")
            : t("me.capability.plan.insurance.whyDefault"),
        { href: "/apply/insurance", label: t("me.capability.plan.insurance.action") },
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
    KYC: t("me.capability.plan.gate.kyc.title"),
    PAYOUT_DETAILS: t("me.capability.plan.gate.payout.title"),
    CREW_ROSTER: t("me.capability.plan.gate.crew.title"),
  };

  for (const gate of gates) {
    const explanation = describeGate(gate, t);
    steps.push(
      step(
        GATE_STEPS[gate.gate],
        // Satisfied is `DONE`; unsatisfied is `LATER` and never `NOW`. A gate
        // stands in front of one action, and promoting it to "do this now" is
        // how a browsing screen turns back into a wall.
        explanation === null ? "DONE" : "LATER",
        GATE_TITLES[gate.gate],
        explanation?.reason ?? t("me.capability.plan.done"),
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
