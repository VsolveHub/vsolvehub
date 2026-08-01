import Link from "next/link";
import { buttonStyles, cn } from "@vsolve/ui";

/**
 * Honest 404 for a booking URL whose service or variant no longer exists.
 * This is intentionally different from an API outage error: nothing failed,
 * the requested bookable thing simply is not available.
 */
export function BookingNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
        Booking unavailable
      </p>
      <h1 className="mt-3 text-2xl font-bold text-text">
        We cannot book that service right now
      </h1>
      <p className="mt-3 text-text-secondary">
        The service may have been renamed, paused, or configured without a
        bookable option. Browse the live catalogue to continue with a published
        service.
      </p>
      <Link href="/catalog" className={cn(buttonStyles({ size: "lg" }), "mt-6")}>
        Browse live services
      </Link>
    </main>
  );
}
