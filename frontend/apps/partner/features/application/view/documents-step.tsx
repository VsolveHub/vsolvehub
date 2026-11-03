"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { Button, ErrorState, Skeleton, buttonStyles, useT } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { previousStep } from "../model/progress";
import { OFFERED_DOCUMENTS, requiredDocumentKinds } from "../model/readiness";
import { nextStep } from "../model/steps";
import { usePartnerApplication } from "../queries";
import { ApplyDock } from "./apply-shell";
import { StepFrame } from "./application-editor";
import { DocumentSlot } from "./document-upload";

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
  const required = new Set(requiredDocumentKinds(application));
  const kinds = [...OFFERED_DOCUMENTS]
    .map((offered) => offered.kind)
    .sort((a, b) => Number(required.has(b)) - Number(required.has(a)));
  const back = previousStep(pathname, track);
  const next = nextStep(pathname, track);

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
                hintKey={kind === "GOVERNMENT_ID" ? "apply.documents.why.governmentId" : "apply.documents.why.addressProof"}
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
