"use client";

import { ErrorState, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useEffect } from "react";

/**
 * The `/cart` segment boundary.
 *
 * Distinct from `/book/[service]`'s because the recovery is different. A booking
 * step can only be retried; a cart can also be *left* — the customer's items are
 * on the server, not in this component, so navigating away loses nothing and
 * returning re-reads them. Offering only "Try again" would strand someone whose
 * failure reproduces on every render.
 *
 * The copy is explicit that nothing changed. This boundary catches render and
 * hydration failures in the workspace shell; every state-changing command below
 * it is an explicit press, carries a version guard and an idempotency key, and
 * would have surfaced its own error inside the workspace rather than here.
 */
export default function CartError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[cart-error-boundary]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center gap-4 px-4 py-16 sm:px-6">
      <ErrorState
        title="We could not show your booking"
        message="Nothing was booked, charged or removed — everything you added is still saved to your account. Try again, or come back to it from the catalogue."
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
