"use client";

import { useEffect } from "react";
import { ErrorState } from "@vsolve/ui";

/**
 * Booking-specific segment boundary.
 *
 * Copy must be explicit that no payment/booking state changed. The page may
 * have failed while reading catalog/service config or booting the client
 * workspace, but state-changing booking commands happen later and remain
 * idempotent/server-authored.
 */
export function BookingRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[booking-error-boundary]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-16 sm:px-6">
      <ErrorState
        title="We could not load this booking step"
        message="Nothing was booked, charged, assigned or submitted. Retry the step, or return to the catalogue if the service was just updated."
        actionLabel="Try again"
        onAction={reset}
        reference={error.digest}
      />
    </main>
  );
}
