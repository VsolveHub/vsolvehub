"use client";

import { ErrorState, Skeleton, SkeletonRegion } from "@vsolve/ui";

import type { WindowsView } from "../adapters";
import { WindowStage } from "./window-stage";

/**
 * Every state the arrival-window step can be in, including "not built yet".
 *
 * Four of these are ordinary and one is not. `unpublished` exists because Django
 * does not yet serve server-authored arrival windows: there is no endpoint to
 * call, so production must not call one. The previous implementation sent a raw
 * `fetch` at a proposal-only path, which could only ever fail, and the failure
 * rendered as "we could not load arrival windows" — a customer reads that as
 * "there is nothing available", which is a claim about capacity nobody made.
 *
 * Keeping `loading`, `error` and `ready` alongside it is deliberate. They are the
 * states the step returns to the day BE-06 publishes the operation, and they stay
 * covered by tests in the meantime, so integration is a change of caller rather
 * than a rewrite of the screen.
 *
 * `empty` is the fifth and belongs to `WindowStage`: a successful response saying
 * every window is taken needs different words again, and only the server can say
 * it.
 */
export type WindowAvailability =
  /** No published endpoint. Say so; send nothing. */
  | { status: "unpublished" }
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "ready"; windows: WindowsView };

/** Matches the real layout: a date strip, then a column of window rows. */
function WindowStageSkeleton() {
  return (
    <div>
      <Skeleton className="h-6 w-56" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-16" />
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

export function WindowRegion({ availability }: { availability: WindowAvailability }) {
  if (availability.status === "error") {
    return (
      <ErrorState
        title="We could not load arrival windows"
        message="Nothing has been booked. This is a problem on our side — try again in a moment."
        actionLabel="Try again"
        onAction={availability.onRetry}
      />
    );
  }

  return (
    <SkeletonRegion
      loading={availability.status === "loading"}
      label="Loading available arrival windows"
    >
      {availability.status === "ready" ? (
        <WindowStage windows={availability.windows} />
      ) : (
        <WindowStageSkeleton />
      )}
    </SkeletonRegion>
  );
}
