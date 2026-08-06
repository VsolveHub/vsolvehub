"use client";

import { buttonStyles } from "@vsolve/ui";
import { BellRing } from "lucide-react";
import Link from "next/link";

import { usePartnerOffers } from "../queries";

/**
 * A live offer, on the home screen, only when one exists.
 *
 * The home screen used to host the whole offer inbox, so its empty state — "New
 * offers appear here automatically" — occupied the most valuable space on the
 * app for the entire time nothing was on offer, which is most of the time. The
 * inbox still lives at `/offers`; what belongs on home is the interruption, not
 * the container.
 *
 * Renders `null` when there is nothing waiting. An offer expires on a timer, so
 * this is the one thing on the screen that earns the right to shout — and it
 * only gets to shout when it is true.
 */
export function LiveOffersBanner() {
  const offersQuery = usePartnerOffers();
  // Only genuinely open offers. An accepted one is already the Partner's work
  // and belongs on the job list, not in a banner telling them to hurry.
  const waiting = (offersQuery.data?.pages ?? [])
    .flatMap((page) => page.results)
    .filter((offer) => offer.status === "OFFERED").length;

  if (waiting === 0) return null;

  return (
    <div className="flex items-center gap-4 rounded-card border border-action bg-signal-50 p-4">
      <BellRing aria-hidden className="size-6 shrink-0 text-text" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-text">
          {waiting} new {waiting === 1 ? "job" : "jobs"} for you
        </p>
        <p className="text-sm text-text-secondary">These go to someone else if you wait.</p>
      </div>
      <Link href="/offers" className={buttonStyles({ size: "sm" })}>
        Look
      </Link>
    </div>
  );
}
