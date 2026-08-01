"use client";

import { useEffect } from "react";
import { ErrorState } from "@vsolve/ui";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <ErrorState
        title="Something went wrong"
        message="The page ran into an unexpected error. Nothing was charged or changed."
        actionLabel="Try again"
        onAction={reset}
      />
    </div>
  );
}
