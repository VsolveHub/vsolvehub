"use client";

import { ErrorState, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useEffect } from "react";

/**
 * The `/bookings` segment boundary.
 *
 * The copy has one job beyond offering a retry: make clear that a page which
 * failed to render says nothing about the booking itself. Dispatch is owned by
 * Celery and progresses without this page, so "we could not show it" must not
 * read as "it stopped".
 */
export default function BookingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[bookings-error-boundary]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center gap-4 px-4 py-16 sm:px-6">
      <ErrorState
        title="We could not show your bookings"
        message="Your bookings are unaffected — anything in progress carries on without this page. Try again, or come back in a moment."
        actionLabel="Try again"
        onAction={reset}
        reference={error.digest}
      />
      <Link href="/catalog" className={buttonStyles({ variant: "outline" })}>
        Browse services
      </Link>
    </main>
  );
}
