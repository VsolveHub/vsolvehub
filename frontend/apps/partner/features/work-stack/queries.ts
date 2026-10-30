"use client";

import { useT } from "@vsolve/ui";
import { useMemo } from "react";

import { usePartnerCrewOffers } from "@/features/crew-offer/queries";
import { usePartnerEnquiries } from "@/features/enquiry/queries";
import { usePartnerEngagements } from "@/features/engagement/queries";
import { usePartnerOffers } from "@/features/offers/queries";
import { usePartnerJobs, type PartnerVisit } from "@/features/work/queries";

import { toWorkItems, type WorkItem } from "./model/work-item";

/**
 * The merged, sorted WORK stack. Composes six already-existing queries —
 * no new network call is added; TanStack dedupes each by its existing
 * query key exactly as `LiveOfferSheet` already relies on for the offers
 * query alone.
 *
 * Loading is "any source still pending"; error is "any source errored",
 * surfaced as the first error found — a screen showing six independent
 * spinners/errors for one merged list would contradict the entire point of
 * merging it.
 *
 * ## The six queries publish three different envelopes, and each is unwrapped
 *    where the hook that owns it actually puts the rows
 *
 * This is the whole reason the unwrapping below is not uniform, and getting it
 * wrong is silent — `undefined.results` on a `.data` that is an array is not a
 * type error if the compiler was told the wrong shape:
 *
 * - **`usePartnerCrewOffers`** (A3) hands back the raw `CrewOfferList`, so the
 *   rows are `.offers` and the clock they are judged against is `.server_now`.
 * - **`usePartnerOffers`** (A1) is a second, unrelated offer inbox and is also a
 *   `useInfiniteQuery`, so its rows are `.pages[].results` on `OfferPage`. It
 *   needs no server clock passed down: `toWorkItems` judges these by `status`
 *   alone, because Celery owns their deadlines.
 * - **`usePartnerEnquiries`** is a `useInfiniteQuery` (the inbox pages at twenty
 *   rows since contract 1.23.0), so `.data` is `InfiniteData<EnquiryPage>` and
 *   the rows are `.pages[].results`. There is no top-level `.results` on it at
 *   all. Every page already fetched is flattened in: a vendor who paged back
 *   through their inbox should not have those rows fall out of the WORK stack.
 * - **`usePartnerEngagements`** projects the cursor page down to
 *   `{results, next}` inside its own `queryFn`, so `.data` is that envelope and
 *   the rows are `.results`.
 * - **`usePartnerJobs`** unwraps `.results` inside its own `queryFn`, so `.data`
 *   is already a bare `PartnerVisit[]`.
 *
 * ## Two job buckets, one read each
 *
 * `active` and `completed` are separate server-owned buckets and there is no
 * "everything" bucket to ask for, so both are read and merged. `cancelled` is
 * deliberately not: a job that fell through is not work, and `toWorkItems`
 * would drop every row in it anyway.
 */
export function useWorkStack() {
  const t = useT();
  const offers = usePartnerCrewOffers();
  const directOffers = usePartnerOffers();
  const enquiries = usePartnerEnquiries();
  const engagements = usePartnerEngagements();
  /*
    `all`, not `active`. The `active` shelf is date-windowed to today and
    tomorrow *and* has a lower bound at midnight, so a job that started
    yesterday and is still running falls out of it — see `JobBucket` for the
    four bookings this hid in the seeded database, two of them live work with a
    Partner on site. `fromJobs` already decides which statuses are work, so the
    unfiltered read costs one page and removes the whole class of gap.
  */
  const allJobs = usePartnerJobs("all");
  const completedJobs = usePartnerJobs("completed");

  const isPending =
    offers.isPending ||
    directOffers.isPending ||
    enquiries.isPending ||
    engagements.isPending ||
    allJobs.isPending ||
    completedJobs.isPending;

  const firstError =
    offers.error ??
    directOffers.error ??
    enquiries.error ??
    engagements.error ??
    allJobs.error ??
    completedJobs.error ??
    null;

  // Memoised on the six `.data` references rather than recomputed every render.
  // Both offer inboxes poll on a timer — A3 crew offers every fifteen seconds,
  // A1 direct offers every five — and TanStack's structural sharing keeps
  // `.data` referentially identical when a poll comes back unchanged, which is
  // the common case since most ticks observe nothing new. Without this, every
  // one of those ticks would hand each consumer of the WORK stack a freshly
  // allocated array and re-render the whole screen to draw the identical thing.
  // The A1 inbox's five-second interval makes this the busier of the two.
  const items: WorkItem[] = useMemo(
    () =>
      isPending || firstError
        ? []
        : toWorkItems({
            offers: offers.data?.offers ?? [],
            offersServerNow: offers.data?.server_now ?? null,
            directOffers: directOffers.data?.pages.flatMap((page) => page.results) ?? [],
            enquiries: enquiries.data?.pages.flatMap((page) => page.results) ?? [],
            engagements: engagements.data?.results ?? [],
            jobs: mergeJobs(allJobs.data, completedJobs.data),
            // `EnquirySummary` publishes no server clock of its own — the crew
            // offers read is the one query in this merge that does, so its
            // instant is reused for the enquiry lapse check too. See
            // `toWorkItems`'s own `serverNow` doc for why this is not a second
            // source of truth and never falls back to the device clock.
            serverNow: offers.data?.server_now ?? null,
          }, t),
    [
      t,
      isPending,
      firstError,
      offers.data,
      directOffers.data,
      enquiries.data,
      engagements.data,
      allJobs.data,
      completedJobs.data,
    ],
  );

  return { items, isPending, error: firstError };
}

/**
 * Two reads, one list, never the same booking twice.
 *
 * `all` and `completed` overlap by construction — every completed booking is
 * also in the unfiltered read — and `toWorkItems` keys each job as
 * `job:{id}`. Concatenating them would put two elements with the same React key
 * in the stack, which renders the job twice and makes the "needs you" count
 * wrong. Deduplication is by booking id, first occurrence winning.
 *
 * `all` is listed first so it wins: both reads project the same booking through
 * the same serializer, but `all` is the one refetched by every mutation's cache
 * invalidation, so it is the fresher of the two after a status change.
 *
 * `completed` is still read rather than dropped. `all` is one cursor page of 25
 * ordered by `-scheduled_start`; on an established account that page can be
 * entirely recent work, and the dedicated shelf is what keeps finished jobs on
 * the stack for their 24-hour settled window.
 */
function mergeJobs(
  all: readonly PartnerVisit[] | undefined,
  completed: readonly PartnerVisit[] | undefined,
): PartnerVisit[] {
  const byId = new Map<string, PartnerVisit>();
  for (const job of [...(all ?? []), ...(completed ?? [])]) {
    if (!byId.has(job.id)) byId.set(job.id, job);
  }
  return [...byId.values()];
}
