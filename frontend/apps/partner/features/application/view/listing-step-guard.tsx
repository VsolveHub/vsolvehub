"use client";

import { Spinner } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { isListingTrack } from "../model/steps";
import { usePartnerApplication } from "../queries";

/**
 * Trades, areas and working hours are for people who travel to a customer.
 * A stay host or rental owner who opens one of those URLs goes to the next
 * page that belongs on their application.
 */
export function ListingStepGuard({
  redirectTo,
  children,
}: {
  redirectTo: string;
  children: ReactNode;
}) {
  const query = usePartnerApplication();
  const router = useRouter();
  const listing = isListingTrack(query.data?.track);

  useEffect(() => {
    if (listing) router.replace(redirectTo);
  }, [listing, redirectTo, router]);

  if (query.isPending || listing) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Spinner size="sm" />
        Continuing your application…
      </p>
    );
  }

  return children;
}
