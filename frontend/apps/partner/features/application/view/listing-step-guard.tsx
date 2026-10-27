"use client";

import { Spinner, useT } from "@vsolve/ui";
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
  const t = useT();
  const query = usePartnerApplication();
  const router = useRouter();
  const listing = isListingTrack(query.data?.track);

  useEffect(() => {
    if (listing) router.replace(redirectTo);
  }, [listing, redirectTo, router]);

  // Only the first answer is waited for. `isPending` alone is also true during
  // any later refetch of a 404 (no data to keep), and swapping the children for
  // a spinner then throws away whatever the applicant had typed.
  const hasAnswered = query.dataUpdatedAt > 0 || query.errorUpdatedAt > 0;
  if ((query.isPending && !hasAnswered) || listing) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Spinner size="sm" />
        {t("apply.common.continuingApplication")}
      </p>
    );
  }

  return children;
}
