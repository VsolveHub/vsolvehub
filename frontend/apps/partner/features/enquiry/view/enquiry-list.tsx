"use client";

import { Button, Card, EmptyState, ErrorState, Skeleton, SkeletonRegion } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { Inbox } from "lucide-react";
import { useMemo } from "react";

import { usePartnerEnquiries, isEnquiryForbidden } from "../queries";
import { BUCKET_ORDER, groupIntoBuckets } from "../model/enquiry-state";
import { readEnquiryRow, type EnquiryRow } from "../model/wire";
import { EnquiryCard } from "./enquiry-card";

/** The paged inbox read, as the two helpers below receive it. */
type PartnerEnquiriesQuery = ReturnType<typeof usePartnerEnquiries>;

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
 * ## The inbox is complete now
 *
 * The endpoint is cursor-paginated at twenty rows. It published no `cursor`
 * parameter until 1.23.0, so this screen used to carry a notice saying Vsolve
 * was holding enquiries it could not ask for — the honest state, and still a
 * truncated inbox. The parameter is published and consumed, so the notice is
 * gone and **Load older enquiries** fetches the rest.
 *
 * One consequence worth stating rather than hiding: the archetype filter runs
 * over the pages that have been *read*. A workspace whose enquiries are all
 * older than the first page looks empty until the next page arrives, so the
 * control is rendered under the empty state as well as under a populated list.
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
      (query.data?.pages ?? [])
        .flatMap((page) => page.results)
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
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={<Inbox size={24} aria-hidden />}
          title="No enquiries yet"
          description={`When a customer needs ${workLabel} in an area you cover, their request appears here. Vsolve invites a few vendors at a time, so an empty inbox does not mean there is no work.`}
        />
        <OlderEnquiries query={query} />
      </div>
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

      <OlderEnquiries query={query} />
    </div>
  );
}

/**
 * The rest of the history, one page at a time.
 *
 * Rendered only where there is another page, and never as an infinite scroll: a
 * vendor reading an inbox on a phone with a metered connection should decide
 * when another request happens. The newest enquiries are on the first page, so
 * nothing waiting on an answer is behind this button.
 */
function OlderEnquiries({ query }: { readonly query: PartnerEnquiriesQuery }) {
  if (!query.hasNextPage) return null;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-sm leading-6 text-text-secondary">
        Vsolve is holding older enquiries than these. The newest are shown first, so nothing
        waiting on an answer is further down.
      </p>
      <Button
        variant="outline"
        onClick={() => void query.fetchNextPage()}
        loading={query.isFetchingNextPage}
        loadingLabel="Loading"
        disabled={query.isFetchingNextPage}
      >
        Load older enquiries
      </Button>
    </Card>
  );
}
