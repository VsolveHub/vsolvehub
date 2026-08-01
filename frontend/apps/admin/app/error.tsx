"use client";

// Segment error boundary: catches errors thrown while rendering any page under
// the root layout and offers a recoverable retry instead of the raw
// "Application error" screen.
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error.digest, error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-bold text-ink-900">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        This step didn&apos;t load. Nothing was changed — try again.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Try again
      </button>
      {error.digest ? (
        <p className="mt-6 text-[11px] text-gray-400">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
