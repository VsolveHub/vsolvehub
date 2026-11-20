// Ported from frontend/apps/partner/features/application/model/readiness.ts
import type { Schemas } from "@vsolve/api-client";
import { isServiceAreaRequirementMet, isWorkingHoursRequirementMet } from "@vsolve/query/native";

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
  | "BUSINESS_DETAILS"
  | "EXPERIENCE_YEARS"
  | "SKILLS"
  | "SERVICES"
  | "SERVICE_AREAS"
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

const DOCUMENT_LABELS: readonly { kind: DocumentKind; code: RequirementCode; label: string }[] = [
  { kind: "GOVERNMENT_ID", code: "GOVERNMENT_ID", label: "Government photo ID" },
  { kind: "ADDRESS_PROOF", code: "ADDRESS_PROOF", label: "Proof of address" },
];

/**
 * What the server requires before review. Before an application exists there is no answer to
 * read, so the one kind every track has always needed stands in until the first save.
 */
export function requiredDocumentKinds(application: Application | null): readonly DocumentKind[] {
  return application?.required_document_kinds ?? ["GOVERNMENT_ID"];
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
    {
      code: "DISPLAY_NAME",
      label: "Your name",
      href: "/apply/about",
      isMet: (application?.display_name ?? "").trim().length > 0,
    },
    ...(application?.track === "EMPLOYER"
      ? ([
          {
            // The server's own rule (business name, kind and city), as on the website.
            code: "BUSINESS_DETAILS",
            label: "Business details",
            href: "/apply/employer",
            isMet: application.business_details_complete,
          },
        ] satisfies Requirement[])
      : []),
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
      const labelled = DOCUMENT_LABELS.find((item) => item.kind === kind);
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
