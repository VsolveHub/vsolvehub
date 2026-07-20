"use client";

import { useEffect } from "react";

/**
 * Route-segment error boundary for all customer pages. Prevents a thrown error
 * in any page/server component from blanking the whole app to a raw 500 screen
 * (which previously happened in production on the onboarding flow).
 */
export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for logging/observability; kept out of prod bundles is not desired
    // here, so this stays an error-level log.
    console.error("Customer route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-8 text-center">
      <div className="mb-3 text-4xl opacity-70" aria-hidden>
        ⚠️
      </div>
      <h2 className="my-2 text-lg font-bold text-gray-900">Something went wrong</h2>
      <p className="mb-5 max-w-md text-sm text-gray-500">
        We hit a snag loading this page. Please try again — if it keeps happening, come back in a moment.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center justify-center rounded-[10px] bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-900"
      >
        Try again
      </button>
    </div>
  );
}
