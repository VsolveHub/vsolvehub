"use client";

import { useMemo } from "react";

import { usePartnerCrewOffers } from "@/features/crew-offer/queries";
import { usePartnerEnquiries } from "@/features/enquiry/queries";
import { usePartnerEngagements } from "@/features/engagement/queries";
import { usePartnerOffers } from "@/features/offers/queries";
import { usePartnerJobs } from "@/features/work/queries";

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
  const offers = usePartnerCrewOffers();
  const directOffers = usePartnerOffers();
  const enquiries = usePartnerEnquiries();
  const engagements = usePartnerEngagements();
  const activeJobs = usePartnerJobs("active");
  const completedJobs = usePartnerJobs("completed");

  const isPending =
    offers.isPending ||
    directOffers.isPending ||
    enquiries.isPending ||
    engagements.isPending ||
    activeJobs.isPending ||
    completedJobs.isPending;

  const firstError =
    offers.error ??
    directOffers.error ??
    enquiries.error ??
    engagements.error ??
    activeJobs.error ??
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
            jobs: [...(activeJobs.data ?? []), ...(completedJobs.data ?? [])],
          }),
    [
      isPending,
      firstError,
      offers.data,
      directOffers.data,
      enquiries.data,
      engagements.data,
      activeJobs.data,
      completedJobs.data,
    ],
  );

  return { items, isPending, error: firstError };
}
