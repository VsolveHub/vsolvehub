"use client";

import { Card, EmptyState, ErrorState, Skeleton, SkeletonRegion } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { Inbox } from "lucide-react";
import { useMemo } from "react";

import { usePartnerEnquiries, isEnquiryForbidden } from "../queries";
import { BUCKET_ORDER, groupIntoBuckets } from "../model/enquiry-state";
import { readEnquiryRow, type EnquiryRow } from "../model/wire";
import { EnquiryCard } from "./enquiry-card";

/**
 * The enquiry inbox for one workspace.
 *
 * Closes `M2-FE-301`. Seven states, all reachable, none faked:
 * loading · empty · forbidden · server error · offline · truncated · populated.
 *
 * ## Why the list filters by archetype in the client
 *
 * `GET /api/v1/partner/enquiries/` returns every invitation this Partner holds,
 * across both lifecycles, and takes no filter parameter. The workforce and
 * project workspaces are separate places with separate composers, so each shows
 * its own.
 *
 * The filter reads `EnquirySummary.archetype` — a field Django sent — against
 * the workspace key Django also sent in the grant. That is not the client
 * inferring a lifecycle from a category or a profession, which is the thing
 * `M2-FE-110` forbids; it is two server values being compared. An archetype this
 * build has no workspace for is dropped for the same reason an unknown workspace
 * key renders nothing: there are no screens behind it.
 *
 * ## Truncation is stated, never silent
 *
 * The endpoint is cursor-paginated at twenty rows and publishes **no `cursor`
 * query parameter**, so this client cannot ask for page two — the typed client
 * has no parameter to send. A Partner with more than twenty enquiries would
 * otherwise be shown a truncated inbox that looks complete. The notice below is
 * the honest alternative, and the missing parameter is requested in
 * `frontend-execution-plan.md` §7.
 */

export interface EnquiryListProps {
  /** The archetype whose enquiries belong in this workspace. */
  readonly archetype: string;
  /** Where a row links: `/workforce/enquiries` or `/projects/enquiries`. */
  readonly basePath: string;
  /** The workspace's own noun for this work, for the empty state. */
  readonly workLabel: string;
}

export function EnquiryList({ archetype, basePath, workLabel }: EnquiryListProps) {
  const query = usePartnerEnquiries();

  const rows: EnquiryRow[] = useMemo(
    () =>
      (query.data?.results ?? [])
        .map(readEnquiryRow)
        .filter((row) => row.archetype === archetype),
    [query.data, archetype],
  );

  const buckets = useMemo(() => groupIntoBuckets(rows), [rows]);

  if (query.isPending) {
    return (
      <SkeletonRegion loading label="Loading your enquiries">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </SkeletonRegion>
    );
  }

  if (query.isError) {
    const presentation = describeError(query.error, "read");
    return (
      <ErrorState
        title={presentation.title}
        message={
          isEnquiryForbidden(query.error)
            ? "This account cannot read enquiries. If you were working a moment ago, your access may have changed — contact support."
            : presentation.message
        }
        severity={presentation.severity}
        // A refused read does not offer a retry: asking again walks into the
        // same refusal and delays the honest screen. Same rule the workspace
        // grants read follows.
        actionLabel={isEnquiryForbidden(query.error) ? undefined : "Try again"}
        onAction={isEnquiryForbidden(query.error) ? undefined : () => void query.refetch()}
        reference={presentation.reference}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={24} aria-hidden />}
        title="No enquiries yet"
        description={`When a customer needs ${workLabel} in an area you cover, their request appears here. Vsolve invites a few vendors at a time, so an empty inbox does not mean there is no work.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {BUCKET_ORDER.map((bucket) => {
        const items = buckets.get(bucket.key) ?? [];
        if (items.length === 0) return null;

        return (
          <section key={bucket.key} aria-labelledby={`enquiries-${bucket.key}`}>
            <h2
              id={`enquiries-${bucket.key}`}
              className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              {bucket.title}
              <span className="sr-only">{`, ${items.length} ${items.length === 1 ? "enquiry" : "enquiries"}`}</span>
            </h2>
            <ul className="flex list-none flex-col gap-2 p-0">
              {items.map((enquiry) => (
                <li key={enquiry.id}>
                  <EnquiryCard enquiry={enquiry} basePath={basePath} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {query.data?.next ? (
        <Card className="p-4 text-sm leading-6 text-text-secondary">
          Vsolve is holding older enquiries that this screen cannot ask for yet. Nothing waiting on
          an answer is hidden — the newest are shown first — but your full history is longer than
          this.
        </Card>
      ) : null}
    </div>
  );
}
