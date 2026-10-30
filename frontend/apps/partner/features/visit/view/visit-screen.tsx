"use client";

import type { ReactNode } from "react";
import { describeError } from "@vsolve/query";
import { ErrorState, Spinner, buttonStyles, useT } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Pictogram } from "@/components/pictogram";
import { planVisitOf, readEnquiryRecord } from "@/features/enquiry/model/wire";
import {
  isEnquiryForbidden,
  usePartnerEnquiry,
} from "@/features/enquiry/queries";

import { VisitDayPanel } from "./visit-day-panel";
import { SiteAddress } from "./site-address";

/**
 * The Partner's project-visit workspace.
 *
 * Slot confirmation redirects here and this read keeps watching only while the
 * first slot is held for customer payment. When payment changes REQUESTED to
 * SCHEDULED, the same screen reveals the already-built arrival controls; after
 * arrival it reveals completion, and after completion it reveals the estimate.
 */
export function VisitScreen({ invitationId }: { readonly invitationId: string }) {
  const t = useT();
  const router = useRouter();
  const query = usePartnerEnquiry(invitationId, true, { watchHeldVisit: true });
  const enquiryHref = `/work/enquiries/${invitationId}`;

  if (query.isPending) {
    return (
      <Screen>
        <p className="flex flex-1 items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner size="sm" />
          {t("visit.screen.loading")}
        </p>
      </Screen>
    );
  }

  if (query.isError || query.data === undefined) {
    const forbidden = isEnquiryForbidden(query.error);
    const presentation = query.error ? describeError(query.error, "read") : null;
    return (
      <Screen>
        <div className="px-4 py-6">
          <ErrorState
            title={
              forbidden
                ? t("visit.screen.forbidden.title")
                : (presentation?.title ?? t("visit.screen.unavailable.title"))
            }
            message={
              forbidden
                ? t("visit.screen.forbidden.message")
                : (presentation?.message ?? t("visit.arrival.loadError.message"))
            }
            severity={presentation?.severity}
            actionLabel={forbidden ? t("visit.screen.openWork") : t("common.tryAgain")}
            onAction={forbidden ? () => router.replace("/work") : () => void query.refetch()}
            reference={presentation?.reference}
          />
        </div>
      </Screen>
    );
  }

  const enquiry = readEnquiryRecord(query.data);
  const visit = planVisitOf(enquiry.siteVisits);

  return (
    <Screen>
      <header className="flex items-center gap-3 bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 py-4">
        <Link
          href="/work"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface/13 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-inverse"
        >
          <Pictogram name="back" size="md" className="text-surface" />
          <span className="sr-only">{t("visit.screen.backToWork")}</span>
        </Link>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-navy-200">
            {t("visit.screen.eyebrow")}
          </span>
          <h1 className="truncate text-[1.1875rem] font-bold leading-snug text-surface">
            {enquiry.serviceName || t("visit.screen.defaultTitle")}
          </h1>
        </span>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy-500">
          <Pictogram name="site" size="md" className="text-surface" />
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        {visit === null ? (
          <ErrorState
            title={t("visit.screen.noVisit.title")}
            message={t("visit.screen.noVisit.message")}
            severity="info"
            actionLabel={t("visit.screen.noVisit.action")}
            onAction={() => router.replace(enquiryHref)}
          />
        ) : (
          <>
            <SiteAddress
              address={enquiry.siteAddress}
              approximateArea={enquiry.approximateArea}
            />
            <VisitDayPanel
              enquiry={enquiry}
              estimateHref={`${enquiryHref}/estimate`}
              arrivalHref={`${enquiryHref}/arrival`}
              isRefreshing={query.isFetching}
            />
          </>
        )}

        <Link href={enquiryHref} className={buttonStyles({ variant: "outline" })}>
          {t("visit.screen.viewEnquiry")}
        </Link>
      </div>
    </Screen>
  );
}

function Screen({ children }: { readonly children: ReactNode }) {
  return <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">{children}</main>;
}
