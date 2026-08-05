"use client";

import { ErrorState } from "@vsolve/ui";
import { useEffect } from "react";

/**
 * The `/account` segment boundary.
 *
 * ## Why this logs less than the other boundaries
 *
 * `/bookings/error.tsx` logs the whole error object, which is right there: it
 * carries booking ids and statuses, and a developer reading a console needs
 * them. This tree is different. An error thrown from an address mutation can
 * carry the request body — the street, the flat number, the landmark — and a
 * `console.error` puts that in the browser console, in any log drain wired to it
 * and in whatever a support agent screenshots while helping.
 *
 * So only the digest is logged. It is the correlation id Next.js also sends to
 * the server, which is enough to find the real stack in server logs and carries
 * nothing about the person.
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[account-error-boundary]", error.digest ?? "no-digest");
  }, [error.digest]);

  return (
    <ErrorState
      title="We could not show this"
      message="Nothing has changed — your addresses and settings are as you left them. Try again, or come back in a moment."
      actionLabel="Try again"
      onAction={reset}
      reference={error.digest}
    />
  );
}
