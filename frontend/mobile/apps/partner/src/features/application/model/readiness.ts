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

const REQUIRED_DOCUMENTS: readonly { kind: DocumentKind; code: RequirementCode; label: string }[] =
  [
    { kind: "GOVERNMENT_ID", code: "GOVERNMENT_ID", label: "Government photo ID" },
    { kind: "ADDRESS_PROOF", code: "ADDRESS_PROOF", label: "Proof of address" },
  ];

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
    {
      code: "CONSENTS",
      label: "Agreements",
      href: "/apply/consent",
      isMet: (application?.consents.length ?? 0) > 0,
    },
    ...REQUIRED_DOCUMENTS.map((required) => ({
      code: required.code,
      label: required.label,
      href: "/apply/documents",
      isMet: hasUsableDocument(application, required.kind),
    })),
  ];

  return list;
}

export function outstandingRequirements(application: Application | null): Requirement[] {
  return requirements(application).filter((requirement) => !requirement.isMet);
}

/** Documents Operations rejected, which the Partner must replace. */
export function rejectedDocuments(application: Application): Schemas["PartnerDocument"][] {
  return application.documents.filter((document) => document.status === "REJECTED");
}

export function isEditable(application: Application): boolean {
  return application.status === "DRAFT" || application.status === "CHANGES_REQUIRED";
}

/** Whether the Partner may act on the submit button at all. */
export function canSubmit(application: Application): boolean {
  return isEditable(application) && outstandingRequirements(application).length === 0;
}
