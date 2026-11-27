// Ported from frontend/apps/partner/features/application/model/readiness.ts
import type { Schemas } from "@vsolve/api-client";
import { isServiceAreaRequirementMet, isWorkingHoursRequirementMet } from "@vsolve/query/native";

import { employerStepFor, hiringAsOf, type EmployerStepHref } from "./employer";

/**
 * What is still missing before an application can be submitted.
 *
 * The same checklist as the website: About you, then for services Your work, Where you work and
 * Your hours, then Documents, and the agreements on "Agree & send" (/apply/review).
 */

type Application = Schemas["PartnerApplication"];
type Schedule = Schemas["PartnerSchedule"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];

export type RequirementCode =
  | "DISPLAY_NAME"
  | "HIRING_AS"
  | "EMPLOYER_ABOUT"
  | "EMPLOYER_BUSINESS"
  | "EMPLOYER_CONTACT"
  | "EXPERIENCE_YEARS"
  | "SKILLS"
  | "SERVICES"
  | "SERVICE_AREAS"
  | "WORKING_HOURS"
  | "GOVERNMENT_ID"
  | "ADDRESS_PROOF"
  | "DRIVING_LICENCE"
  | "VEHICLE_RC"
  | "VEHICLE_INSURANCE"
  | "SELFIE"
  | "BUSINESS_PROOF"
  | "AUTHORIZATION_LETTER"
  | "CONSENTS";

export interface Requirement {
  code: RequirementCode;
  label: string;
  /** Route to the step that satisfies it, so the summary is actionable. */
  href: string;
  isMet: boolean;
}

/**
 * The requirement each document kind satisfies, and what it is called.
 *
 * Which kinds are *required* and which are *offered* is the server's answer
 * (`required_document_kinds`, `offered_document_kinds`), never a list kept here.
 */
const DOCUMENT_REQUIREMENTS: Partial<
  Record<DocumentKind, { code: RequirementCode; label: string }>
> = {
  GOVERNMENT_ID: { code: "GOVERNMENT_ID", label: "Government photo ID" },
  ADDRESS_PROOF: { code: "ADDRESS_PROOF", label: "Proof of address" },
  SELFIE: { code: "SELFIE", label: "A selfie" },
  BUSINESS_PROOF: { code: "BUSINESS_PROOF", label: "Business proof" },
  AUTHORIZATION_LETTER: { code: "AUTHORIZATION_LETTER", label: "Authorization letter" },
  DRIVING_LICENCE: { code: "DRIVING_LICENCE", label: "Driving licence" },
  VEHICLE_RC: { code: "VEHICLE_RC", label: "Vehicle RC" },
  VEHICLE_INSURANCE: { code: "VEHICLE_INSURANCE", label: "Vehicle insurance" },
};

/**
 * What the server requires before review. Before an application exists there is no answer to
 * read, so the one kind every track has always needed stands in until the first save.
 */
export function requiredDocumentKinds(application: Application | null): readonly DocumentKind[] {
  return application?.required_document_kinds ?? ["GOVERNMENT_ID"];
}

/**
 * The document slots to show. Before an application exists there is no answer to read, so the two
 * every non-employer track has always offered stand in until the first save.
 */
export function offeredDocumentKinds(application: Application | null): readonly DocumentKind[] {
  return application?.offered_document_kinds ?? ["GOVERNMENT_ID", "ADDRESS_PROOF"];
}

const EMPLOYER_STEP_REQUIREMENTS: Record<
  EmployerStepHref,
  { code: RequirementCode; label: string }
> = {
  "/apply/hiring-as": { code: "HIRING_AS", label: "Who is hiring" },
  "/apply/employer/about": { code: "EMPLOYER_ABOUT", label: "About you" },
  "/apply/employer/business": { code: "EMPLOYER_BUSINESS", label: "Business details" },
  "/apply/employer/contact": { code: "EMPLOYER_CONTACT", label: "You and your role" },
};

/**
 * What an employer still has to give, one requirement per screen they are walked through.
 *
 * Whether anything is missing is the server's `employer.missing_fields`; this only groups it by
 * the screen that asks for it. Before the application exists, or before they choose, only the
 * choice is asked.
 */
function employerRequirements(application: Application | null): Requirement[] {
  const hiringAs = hiringAsOf(application?.employer);
  const missing = application?.employer?.missing_fields ?? ["hiring_as"];
  const screens: EmployerStepHref[] =
    hiringAs === "INDIVIDUAL"
      ? ["/apply/hiring-as", "/apply/employer/about"]
      : hiringAs === "BUSINESS"
        ? ["/apply/hiring-as", "/apply/employer/business", "/apply/employer/contact"]
        : ["/apply/hiring-as"];
  return screens.map((href) => ({
    ...EMPLOYER_STEP_REQUIREMENTS[href],
    href,
    isMet: !missing.some((field) => employerStepFor(field, hiringAs) === href),
  }));
}

function hasUsableDocument(application: Application | null, kind: DocumentKind): boolean {
  if (application === null) return false;
  return application.documents.some(
    (document) =>
      document.kind === kind &&
      (document.status === "PENDING" || document.status === "APPROVED"),
  );
}

/** Requests the reviewer has not dismissed: the server ignores "Not valid" ones at submit too. */
function openAreaRequestCount(application: Application): number {
  return (application.area_requests ?? []).filter((request) => request.status !== "NOT_VALID").length;
}

export function requirements(
  application: Application | null,
  availability?: Schedule | null,
): Requirement[] {
  const list: Requirement[] = [
    // An employer's name is asked on their own screens, with the rest of who is hiring.
    ...(application?.track === "EMPLOYER"
      ? employerRequirements(application)
      : ([
          {
            code: "DISPLAY_NAME",
            label: "Your name",
            href: "/apply/about",
            isMet: (application?.display_name ?? "").trim().length > 0,
          },
        ] satisfies Requirement[])),
    ...(application?.track === "SERVICES"
      ? ([
          {
            code: "EXPERIENCE_YEARS",
            label: "Years of experience",
            href: "/apply/about",
            isMet: application.experience_years > 0,
          },
          {
            code: "SKILLS",
            label: "Your trades",
            href: "/apply/work",
            isMet: application.skill_codes.length > 0,
          },
          {
            code: "SERVICES",
            label: "Jobs you take",
            href: "/apply/work",
            isMet: application.service_variant_ids.length > 0,
          },
          {
            code: "SERVICE_AREAS",
            label: "Where you work",
            href: "/apply/areas",
            // A ticked area, or a PIN asked for that no open area covers yet.
            isMet: isServiceAreaRequirementMet({
              serviceAreaIds: application.service_area_ids,
              requestedPostalCodes: application.requested_postal_codes ?? [],
              areaRequestsCount: openAreaRequestCount(application),
            }),
          },
          {
            // The server refuses to send an application without hours for every chosen area,
            // so the checklist says so first, as the website does.
            code: "WORKING_HOURS",
            label: "Your hours",
            href: "/apply/schedule",
            isMet:
              availability === undefined ||
              (Boolean(availability) &&
                isWorkingHoursRequirementMet({
                  serviceAreaIds: application.service_area_ids,
                  requestedPostalCodes: application.requested_postal_codes ?? [],
                  areaRequestsCount: openAreaRequestCount(application),
                  availabilityRules: availability?.rules ?? [],
                })),
          },
        ] satisfies Requirement[])
      : []),
    {
      code: "CONSENTS",
      label: "Agreements",
      href: "/apply/review",
      isMet: application?.consents_complete ?? false,
    },
    ...requiredDocumentKinds(application).map((kind) => {
      const labelled = DOCUMENT_REQUIREMENTS[kind];
      return {
        code: labelled?.code ?? ("GOVERNMENT_ID" as const),
        label: labelled?.label ?? "Document",
        href: "/apply/documents",
        isMet: hasUsableDocument(application, kind),
      };
    }),
  ];

  return list;
}

export function outstandingRequirements(
  application: Application | null,
  availability?: Schedule | null,
): Requirement[] {
  return requirements(application, availability).filter((requirement) => !requirement.isMet);
}

/** Documents Operations rejected, which the Partner must replace. */
export function rejectedDocuments(application: Application): Schemas["PartnerDocument"][] {
  return application.documents.filter((document) => document.status === "REJECTED" && document.can_replace);
}

export function replaceableRejectedDocuments(application: Application): Schemas["PartnerDocument"][] {
  return application.documents.filter(
    (document) => document.can_replace && (document.status === "REJECTED" || document.scan_status === "REJECTED"),
  );
}

export function isEditable(application: Application): boolean {
  if (typeof application.can_edit === "boolean") {
    return application.can_edit;
  }
  return (
    application.status === "DRAFT" ||
    application.status === "CHANGES_REQUIRED" ||
    (application.status as string) === "CHANGES_REQUESTED"
  );
}

/** Whether the Partner may act on the submit button at all. */
export function canSubmit(application: Application, availability?: Schedule | null): boolean {
  return isEditable(application) && outstandingRequirements(application, availability).length === 0;
}
