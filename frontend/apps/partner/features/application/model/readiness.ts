import type { Schemas } from "@vsolve/api-client";

/**
 * What is still missing before an application can be submitted.
 *
 * This is a *presentation* of readiness, not a gate. Django decides whether a
 * submission is accepted, and it may refuse for reasons the client cannot see —
 * a skill that was deactivated, a service area closed to new Partners. So this
 * never blocks the submit button on its own; it tells the Partner what to expect
 * and gives them somewhere to go.
 *
 * The distinction matters because getting it backwards produces the worst
 * failure mode in onboarding: a client-side rule that is stricter than the
 * server's, trapping someone who has actually finished.
 */

type Application = Schemas["PartnerApplication"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];
type Schedule = Schemas["PartnerSchedule"];

export type RequirementCode =
  | "DISPLAY_NAME"
  | "EXPERIENCE_YEARS"
  | "SKILLS"
  | "SERVICE_AREAS"
  | "SERVICES"
  | "WORKING_HOURS"
  | "GOVERNMENT_ID"
  | "ADDRESS_PROOF"
  | "CONSENTS";

export interface Requirement {
  code: RequirementCode;
  label: string;
  /** Route to the step that satisfies it, so the summary is actionable. */
  href: string;
  isMet: boolean;
}

/**
 * Document kinds M1 requires before review.
 *
 * `TAX` and `BANK` are deliberately absent: payout details are collected before
 * the first payout runs, not before a Partner may be reviewed. Requiring a bank
 * account to apply turns a five-minute form into an errand and loses people who
 * would have been approved.
 */
const REQUIRED_DOCUMENTS: readonly { kind: DocumentKind; code: RequirementCode; label: string }[] =
  [
    { kind: "GOVERNMENT_ID", code: "GOVERNMENT_ID", label: "Government photo ID" },
    { kind: "ADDRESS_PROOF", code: "ADDRESS_PROOF", label: "Proof of address" },
  ];

/**
 * A document counts when it exists and has not been rejected.
 *
 * `PENDING` counts: the Partner has done their part and is waiting for a review
 * they do not control. Treating pending as missing would tell someone to
 * re-upload a document that is sitting in a queue.
 *
 * `SUPERSEDED` does not count — a newer version replaced it, and that newer
 * version is the one in this list carrying its own status.
 */
function hasUsableDocument(application: Application | null, kind: DocumentKind): boolean {
  if (application === null) return false;
  return application.documents.some(
    (document) =>
      document.kind === kind &&
      (document.status === "PENDING" || document.status === "APPROVED"),
  );
}

/**
 * Takes `null` for the applicant who has not started.
 *
 * `GET /api/v1/partner/application/` answers 404 before an application exists,
 * and that is a state rather than a failure — so every caller already holds
 * `Application | null`. Widening here means "what does an application need?" has
 * one answer whether or not there is one yet, and every requirement is simply
 * unmet.
 *
 * The alternative was for callers to special-case `null` themselves, which
 * `stepProgress` did briefly and got wrong: with an empty list to group, every
 * step looked like it collected nothing, so a brand-new applicant's progress bar
 * reported "everything is filled in".
 */
export function requirements(
  application: Application | null,
  availability?: Schedule | null,
): Requirement[] {
  const list: Requirement[] = [
    {
      code: "DISPLAY_NAME",
      label: "Your name",
      href: "/apply/about",
      isMet: (application?.display_name ?? "").trim().length > 0,
    },
    {
      code: "EXPERIENCE_YEARS",
      label: "Years of experience",
      href: "/apply/about",
      isMet: (application?.experience_years ?? 0) > 0,
    },
    {
      code: "SKILLS",
      label: "What you do",
      href: "/apply/work",
      isMet: (application?.skill_codes.length ?? 0) > 0,
    },
    {
      code: "SERVICES",
      label: "Services you accept",
      href: "/apply/work",
      isMet: (application?.service_variant_ids.length ?? 0) > 0,
    },
    {
      code: "SERVICE_AREAS",
      label: "Where you work",
      href: "/apply/areas",
      isMet: (application?.service_area_ids.length ?? 0) > 0,
    },
    {
      code: "WORKING_HOURS",
      label: "Working hours",
      href: "/apply/schedule",
      isMet:
        (application?.service_area_ids.length ?? 0) > 0 &&
        Boolean(availability) &&
        (application?.service_area_ids ?? []).every((areaId) =>
          (availability?.rules ?? []).some(
            (rule) => rule.service_area_id === areaId && rule.is_active,
          ),
        ),
    },
    ...REQUIRED_DOCUMENTS.map((required) => ({
      code: required.code,
      label: required.label,
      href: "/apply/documents",
      isMet: hasUsableDocument(application, required.kind),
    })),
    {
      code: "CONSENTS",
      label: "Agreements",
      href: "/apply/consent",
      isMet: (application?.consents.length ?? 0) > 0,
    },
  ];

  // A stay host or rental owner lists something they own. Trades, areas and
  // experience are for people who travel to a customer, and the server does not
  // ask either listing track for them.
  if (application?.track === "STAY_HOST" || application?.track === "RENTAL_OWNER") {
    return list.filter((requirement) => !SERVICE_ONLY_REQUIREMENTS.has(requirement.code));
  }
  return list;
}

const SERVICE_ONLY_REQUIREMENTS: ReadonlySet<RequirementCode> = new Set([
  "EXPERIENCE_YEARS",
  "SKILLS",
  "SERVICES",
  "SERVICE_AREAS",
  "WORKING_HOURS",
]);

export function outstandingRequirements(
  application: Application | null,
  availability?: Schedule | null,
): Requirement[] {
  return requirements(application, availability).filter((requirement) => !requirement.isMet);
}

/** Documents Operations rejected, which the Partner must replace. */
export function rejectedDocuments(application: Application): Schemas["PartnerDocument"][] {
  return application.documents.filter((document) => document.status === "REJECTED");
}

/**
 * Whether the application is still the Partner's to edit.
 *
 * `SUBMITTED` and `UNDER_REVIEW` are read-only: editing underneath a reviewer is
 * how two people end up looking at different versions of the same document set.
 * `CHANGES_REQUIRED` reopens it, which is the whole point of that state.
 */
export function isEditable(application: Application): boolean {
  return application.status === "DRAFT" || application.status === "CHANGES_REQUIRED";
}

/** Whether the Partner may act on the submit button at all. */
export function canSubmit(
  application: Application,
  availability?: Schedule | null,
): boolean {
  return isEditable(application) && outstandingRequirements(application, availability).length === 0;
}
