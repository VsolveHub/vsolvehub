"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, ErrorState, Skeleton, buttonStyles, useT, type Translator } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { previousStep } from "../model/progress";
import { offeredDocumentKinds, requiredDocumentKinds } from "../model/readiness";
import { nextStep } from "../model/steps";
import { usePartnerApplication } from "../queries";
import { ApplyDock } from "./apply-shell";
import { StepFrame } from "./application-editor";
import type { DocumentKind } from "../upload-queries";
import { DocumentSlot } from "./document-upload";

type Application = Schemas["PartnerApplication"];

/**
 * What each slot says about itself: its name, why it is asked, and what it must match.
 *
 * An employer's documents are named for what they prove ("Your ID", "Business proof: Udyam
 * registration"), and each says what the applicant gave that it must match, so the reviewer's
 * checklist is no surprise to them. Every other track keeps its two documents as they were.
 */
function slotProps(
  application: Application,
  kind: DocumentKind,
  t: Translator["t"],
): { hintKey?: string; label?: string; note?: ReactNode } {
  if (application.track !== "EMPLOYER") {
    return {
      hintKey: kind === "GOVERNMENT_ID" ? "apply.documents.why.governmentId" : "apply.documents.why.addressProof",
    };
  }
  const employer = application.employer;
  switch (kind) {
    case "GOVERNMENT_ID":
      return {
        label: t("apply.employer.documents.id.label"),
        hintKey: "apply.employer.documents.id.why",
        note: employer?.id_document_type ? (
          <>
            <p>
              {t("apply.employer.documents.idType", {
                type: t(`apply.employer.field.idType.${employer.id_document_type}`),
              })}
            </p>
            {employer.id_document_type === "AADHAAR_MASKED" ? (
              <p>{t("apply.employer.documents.aadhaarHelp")}</p>
            ) : null}
          </>
        ) : null,
      };
    case "SELFIE":
      return { hintKey: "apply.employer.documents.selfie.why" };
    case "BUSINESS_PROOF": {
      const proof = employer?.business?.business_proof_type;
      return {
        label: proof
          ? t("apply.employer.documents.businessProof.label", {
              type: t(`apply.employer.business.proof.${proof}`),
            })
          : undefined,
        hintKey: "apply.employer.documents.businessProof.why",
      };
    }
    case "AUTHORIZATION_LETTER":
      return { hintKey: "apply.employer.documents.letter.why" };
    default:
      return {};
  }
}

/**
 * The documents a reviewer will look at: one slot per kind, required ones first.
 *
 * Which kinds are required is the server's `required_document_kinds`; the rest are offered as
 * optional. Whether a file may be uploaded or replaced is each slot's own decision from the
 * server's flags — this screen adds no rule of its own.
 */
export function DocumentsStep() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <div role="status" aria-label={t("apply.documents.loading")} className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title={t("apply.documents.loadError.title")}
        message={t("apply.common.checkConnectionAndRetry")}
        actionLabel={t("common.tryAgain")}
        onAction={() => void query.refetch()}
      />
    );
  }

  const application = query.data ?? null;
  const track = application?.track ?? null;
  const hiringAs = application?.employer?.hiring_as;
  const required = new Set(requiredDocumentKinds(application));
  const kinds = [...offeredDocumentKinds(application)].sort(
    (a, b) => Number(required.has(b)) - Number(required.has(a)),
  );
  const back = previousStep(pathname, track, hiringAs);
  const next = nextStep(pathname, track, hiringAs);

  return (
    <>
      <StepFrame title={t("apply.documents.pageTitle")} description={t("apply.documents.pageDescription")}>
        {application === null ? (
          <p className="text-sm text-text-secondary">{t("apply.documents.startFirst")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {kinds.map((kind) => (
              <DocumentSlot
                key={kind}
                application={application}
                kind={kind}
                required={required.has(kind)}
                {...slotProps(application, kind, t)}
              />
            ))}
          </div>
        )}
      </StepFrame>

      <ApplyDock>
        <div className="flex items-center gap-2 sm:gap-2.5">
          <Link
            href={back?.href ?? "/apply"}
            className={buttonStyles({ variant: "outline", size: "lg", className: "shrink-0 px-4 sm:px-5 font-bold text-sm sm:text-base" })}
          >
            {t("common.back")}
          </Link>
          <Button size="lg" block className="flex-1 font-bold text-sm sm:text-base" onClick={() => router.push(next?.href ?? "/apply")}>
            {t("apply.editor.continue")}
          </Button>
        </div>
      </ApplyDock>
    </>
  );
}
