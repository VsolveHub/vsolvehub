"use client";

import { BookingRouteError } from "@/features/booking/view/booking-error-boundary";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <BookingRouteError error={error} reset={reset} />;
}
