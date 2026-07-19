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
    <div className="empty-state" style={{ minHeight: "60vh", justifyContent: "center", padding: "2rem" }}>
      <div className="empty-state-icon" aria-hidden>
        ⚠️
      </div>
      <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0.5rem 0" }}>Something went wrong</h2>
      <p className="text-muted" style={{ maxWidth: "28rem", textAlign: "center", margin: "0 0 1.25rem" }}>
        We hit a snag loading this page. Please try again — if it keeps happening, come back in a moment.
      </p>
      <button type="button" className="btn-primary" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
