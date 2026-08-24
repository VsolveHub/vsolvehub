"use client";

import type { ReactNode } from "react";
import { describeError } from "@vsolve/query";
import { ErrorState, Spinner, buttonStyles } from "@vsolve/ui";
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
  const router = useRouter();
  const query = usePartnerEnquiry(invitationId, true, { watchHeldVisit: true });
  const enquiryHref = `/work/enquiries/${invitationId}`;

  if (query.isPending) {
    return (
      <Screen>
        <p className="flex flex-1 items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner size="sm" />
          Loading your visit…
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
            title={forbidden ? "This visit is not on your account" : (presentation?.title ?? "Visit unavailable")}
            message={
              forbidden
                ? "Open Work to find visits assigned to you."
                : (presentation?.message ?? "Check your connection and try again.")
            }
            severity={presentation?.severity}
            actionLabel={forbidden ? "Open Work" : "Try again"}
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
          <span className="sr-only">Back to Work</span>
        </Link>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-navy-200">
            Site visit
          </span>
          <h1 className="truncate text-[1.1875rem] font-bold leading-snug text-surface">
            {enquiry.serviceName || "Project visit"}
          </h1>
        </span>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy-500">
          <Pictogram name="site" size="md" className="text-surface" />
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        {visit === null ? (
          <ErrorState
            title="No visit booked yet"
            message="Choose an available time from the enquiry."
            severity="info"
            actionLabel="Choose a time"
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
              isRefreshing={query.isFetching}
            />
          </>
        )}

        <Link href={enquiryHref} className={buttonStyles({ variant: "outline" })}>
          View enquiry details
        </Link>
      </div>
    </Screen>
  );
}

function Screen({ children }: { readonly children: ReactNode }) {
  return <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">{children}</main>;
}
