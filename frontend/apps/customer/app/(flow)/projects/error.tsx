"use client";

import { ErrorState, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useEffect } from "react";

/**
 * The `/projects` segment boundary.
 *
 * The copy has one job beyond offering a retry: a page that failed to render
 * says nothing about the money. This is the surface where a Customer has funded
 * stages, and "we could not show your projects" must never read as "your money
 * or your project is gone" — that misreading is the one that produces a support
 * call at midnight and, worse, a second payment.
 */
export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[projects-error-boundary]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center gap-4 px-4 py-16 sm:px-6">
      <ErrorState
        title="We could not show your projects"
        message="Your projects and everything you have funded are unaffected — this page failed to draw, nothing else. Nothing has been charged and nothing has been approved. Try again, or come back in a moment."
        actionLabel="Try again"
        onAction={reset}
        reference={error.digest}
      />
      <Link href="/requests" className={buttonStyles({ variant: "outline" })}>
        Your requests
      </Link>
    </main>
  );
}
