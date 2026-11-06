import type { Schemas } from "@vsolve/api-client";

import { documentLabelKey, isDocumentRejected } from "./status";

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
  /** A catalogue key (`@vsolve/ui` `useT`), not the label itself — resolve with `t(labelKey)`. */
  labelKey: string;
  /** Route to the step that satisfies it, so the summary is actionable. */
  href: string;
  isMet: boolean;
}

/**
 * The document kinds the onboarding flow offers, and the requirement each one satisfies.
 *
 * Which of them are *required* is the server's answer (`required_document_kinds`), never a list
 * kept here: a copy here once demanded proof of address that Django does not require, and
 * blocked applicants who had finished. Kinds the server does not require are offered as optional.
 */
export const OFFERED_DOCUMENTS: readonly { kind: DocumentKind; code: RequirementCode }[] = [
  { kind: "GOVERNMENT_ID", code: "GOVERNMENT_ID" },
  { kind: "ADDRESS_PROOF", code: "ADDRESS_PROOF" },
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
      labelKey: "apply.requirements.displayName",
      href: "/apply/about",
      isMet: (application?.display_name ?? "").trim().length > 0,
    },
    {
      code: "EXPERIENCE_YEARS",
      labelKey: "apply.requirements.experienceYears",
      href: "/apply/about",
      isMet: (application?.experience_years ?? 0) > 0,
    },
    {
      code: "SKILLS",
      labelKey: "apply.requirements.skills",
      href: "/apply/work",
      isMet: (application?.skill_codes.length ?? 0) > 0,
    },
    {
      code: "SERVICES",
      labelKey: "apply.requirements.services",
      href: "/apply/work",
      isMet: (application?.service_variant_ids.length ?? 0) > 0,
    },
    {
      code: "SERVICE_AREAS",
      labelKey: "apply.requirements.serviceAreas",
      href: "/apply/areas",
      isMet: (application?.service_area_ids.length ?? 0) > 0,
    },
    {
      code: "WORKING_HOURS",
      labelKey: "apply.requirements.workingHours",
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
    ...requiredDocumentKinds(application).map((kind) => ({
      code: OFFERED_DOCUMENTS.find((offered) => offered.kind === kind)?.code ?? "GOVERNMENT_ID",
      labelKey: documentLabelKey(kind),
      href: "/apply/documents",
      isMet: hasUsableDocument(application, kind),
    })),
    {
      code: "CONSENTS",
      labelKey: "apply.requirements.consents",
      href: "/apply/review",
      isMet: application?.consents_complete ?? false,
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

/**
 * What the server requires before review. Before an application exists there is no answer to
 * read, so the one kind every track has always needed stands in until the first save.
 */
export function requiredDocumentKinds(application: Application | null): readonly DocumentKind[] {
  return application?.required_document_kinds ?? ["GOVERNMENT_ID"];
}

export function outstandingRequirements(
  application: Application | null,
  availability?: Schedule | null,
): Requirement[] {
  return requirements(application, availability).filter((requirement) => !requirement.isMet);
}

/**
 * Rejected documents the Partner can replace right now.
 *
 * Read from the server's `can_replace`, the same rule the upload endpoint enforces. A rejected
 * document on a declined application is not here: offering a replacement the API refuses is the
 * bug this exists to prevent.
 */
export function replaceableRejectedDocuments(application: Application): Schemas["PartnerDocument"][] {
  return application.documents.filter(
    (document) => document.can_replace && isDocumentRejected(document),
  );
}

/**
 * Whether the application is still the Partner's to edit: a draft, or one sent back for changes.
 * The server's own answer (`can_edit`).
 */
export function isEditable(application: Application): boolean {
  return application.can_edit;
}

/** Whether the Partner may act on the submit button at all. */
export function canSubmit(
  application: Application,
  availability?: Schedule | null,
): boolean {
  return isEditable(application) && outstandingRequirements(application, availability).length === 0;
}
