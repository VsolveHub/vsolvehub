// Ported from frontend/apps/partner/features/application/model/readiness.ts
import type { Schemas } from "@vsolve/api-client";

/**
 * What is still missing before an application can be submitted.
 *
 * This is a presentation of readiness for the 4-step mobile partner onboarding flow:
 * Step 1: About you (/apply/about)
 * Step 2: Agreements (/apply/consent)
 * Step 3: Documents (/apply/documents)
 * Step 4: Review and send (/apply/review)
 */

type Application = Schemas["PartnerApplication"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];

export type RequirementCode =
  | "DISPLAY_NAME"
  | "EXPERIENCE_YEARS"
  | "SKILLS"
  | "SERVICES"
  | "SERVICE_AREAS"
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

export function requirements(application: Application | null): Requirement[] {
  const list: Requirement[] = [
    {
      code: "DISPLAY_NAME",
      label: "Your name",
      href: "/apply/about",
      isMet: (application?.display_name ?? "").trim().length > 0,
    },
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
            href: "/apply/work",
            isMet: application.service_area_ids.length > 0,
          },
        ] satisfies Requirement[])
      : []),
    {
      code: "CONSENTS",
      label: "Agreements",
      href: "/apply/consent",
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

export function outstandingRequirements(application: Application | null): Requirement[] {
  return requirements(application).filter((requirement) => !requirement.isMet);
}

/** Documents Operations rejected, which the Partner must replace. */
export function rejectedDocuments(application: Application): Schemas["PartnerDocument"][] {
  return application.documents.filter((document) => document.status === "REJECTED" && document.can_replace);
}

export function isEditable(application: Application): boolean {
  return application.can_edit;
}

/** Whether the Partner may act on the submit button at all. */
export function canSubmit(application: Application): boolean {
  return isEditable(application) && outstandingRequirements(application).length === 0;
}
