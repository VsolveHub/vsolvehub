"use client";

// Segment error boundary: catches errors thrown while rendering any page under
// the root layout (onboarding, dashboard, …) and offers a recoverable retry
// instead of the raw "Application error" screen.
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useT } from "@vsolve/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("[error-boundary]", error.digest, error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-bold text-ink-900">{t("common.somethingWentWrong")}</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        {t("common.errorBoundary.stepMessage")}
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {t("common.tryAgain")}
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-surface-muted"
        >
          {t("common.errorBoundary.goToDashboard")}
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 text-[11px] text-gray-400">
          {t("common.errorBoundary.reference", { digest: error.digest })}
        </p>
      ) : null}
    </div>
  );
}
