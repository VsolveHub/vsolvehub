"use client";

import { useEffect } from "react";
import { ErrorState } from "@vsolve/ui";

/**
 * Error boundary for the catalog routes.
 *
 * Uses Next's `error.tsx` convention rather than a hand-rolled client boundary,
 * and the reason is caching, not style. These routes carry `revalidate = 300`.
 * A custom boundary catches the failure and returns *successful* HTML containing
 * an error message — which Next will happily cache for five minutes. A ten
 * second API blip would then show every visitor an outage that was already over.
 *
 * Letting the error reach `error.tsx` marks the render failed, so nothing is
 * cached and the next request tries again.
 *
 * This is also why the pages distinguish "empty" from "unreachable": an empty
 * catalogue returns normally and renders an EmptyState, while an unreachable one
 * throws and lands here. Telling a customer we offer no services because the API
 * was down would be false.
 */
export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Never swallow. A boundary that renders a tidy message and reports nothing
    // turns an outage into an invisible one.
    console.error("[catalog] render failed", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <ErrorState
        title="We could not load our services"
        message="This is a problem on our side, not yours. Nothing has been booked or charged."
        actionLabel="Try again"
        // `reset` re-renders the segment rather than reloading the page, so the
        // rest of the app and any in-progress state survives the retry.
        onAction={reset}
        // `digest` is the server-side error id. It is the only handle support
        // has to find this exact failure in the logs.
        reference={error.digest ?? null}
      />
    </main>
  );
}
