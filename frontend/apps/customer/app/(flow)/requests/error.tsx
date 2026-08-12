"use client";

import { ErrorState, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useEffect } from "react";

/**
 * The `/requests` segment boundary.
 *
 * The copy has one job beyond offering a retry: make clear that a page which
 * failed to render says nothing about the request itself. Matching runs on the
 * server's own schedule and professionals are being asked whether or not this
 * page loads, so "we could not show it" must not read as "it stopped" — and on
 * a surface with an SLA clock attached, that misreading is the one that gets a
 * Customer to start a second request.
 */
export default function RequestsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[requests-error-boundary]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center gap-4 px-4 py-16 sm:px-6">
      <ErrorState
        title="We could not show your requests"
        message="Your requests are unaffected — we carry on finding professionals whether or not this page loads. Nothing is charged either way. Try again, or come back in a moment."
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
