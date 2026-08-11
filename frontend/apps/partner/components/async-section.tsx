"use client";

import { EmptyState, ErrorState, SkeletonRegion } from "@vsolve/ui";
import type { ReactNode } from "react";

/**
 * One place where a screen's exception states are decided.
 *
 * The completion standard in `03-frontend-tasks.md` requires seven states on
 * every screen — loading, empty, validation, pending, offline/retry, forbidden
 * and server error — and a screen missing one is not built. Validation and
 * pending belong to the control that causes them; the other five belong to
 * whatever is fetching, and they were being re-derived per screen. Three copies
 * of "we could not load this" is three chances to word a lock-out differently,
 * which is the same lesson `PartnerShell` learned about login forms.
 *
 * ## Why the failure kind is a prop rather than an inspected error
 *
 * The caller has the `error` object and `@vsolve/query`'s `categorizeError`
 * already knows how to read it. Re-deriving the category here would put a second
 * error-classification layer in the app, and `error-presentation.ts` is frozen
 * as *the one mapping layer* precisely so that does not happen. This component
 * renders a decision; it does not make one.
 *
 * ## `unavailable` is not a synonym for `server`
 *
 * It is this milestone's honest state: the endpoint behind this screen is not
 * published yet (`M2-BE-013` unstarted). It reads as "not available yet" rather
 * than "something went wrong", because nothing went wrong — and a retry button
 * on it would be an invitation to keep pressing something that cannot start
 * working until a deploy happens.
 */

export type AsyncFailure = "offline" | "forbidden" | "server" | "unavailable";

export type AsyncState<T> =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly kind: AsyncFailure; readonly reference?: string | null }
  | { readonly status: "ready"; readonly data: T };

interface FailurePresentation {
  readonly title: string;
  readonly message: string;
  readonly severity: "error" | "warning" | "info";
  readonly canRetry: boolean;
}

const FAILURES: Record<AsyncFailure, FailurePresentation> = {
  offline: {
    title: "You are offline",
    message:
      "Nothing has been lost. This will load as soon as you are back on a connection.",
    severity: "warning",
    canRetry: true,
  },
  forbidden: {
    // Names the account rather than the person. Someone who has been suspended
    // knows; someone hitting a stale deep link has done nothing wrong, and this
    // wording is true for both.
    title: "This is not available on your account",
    message:
      "Your access to this changed, or it was never part of your account. Contact support if you expected to see it.",
    severity: "warning",
    canRetry: false,
  },
  server: {
    title: "We could not load this",
    message: "Something went wrong on our side. Nothing has changed. Try again in a moment.",
    severity: "error",
    canRetry: true,
  },
  unavailable: {
    title: "Not available yet",
    message:
      "This part of Vsolve is not switched on yet. Nothing you have entered is lost, and there is nothing you need to do.",
    severity: "info",
    canRetry: false,
  },
};

export interface AsyncSectionProps<T> {
  readonly state: AsyncState<T>;
  /** Announced while loading, e.g. "Loading your crew". Required — it is what a screen reader hears. */
  readonly label: string;
  /** Rendered when `isEmpty` says the successful result has nothing in it. */
  readonly empty?: ReactNode;
  readonly isEmpty?: (data: T) => boolean;
  readonly onRetry?: () => void;
  readonly children: (data: T) => ReactNode;
  readonly className?: string;
}

export function AsyncSection<T>({
  state,
  label,
  empty,
  isEmpty,
  onRetry,
  children,
  className,
}: AsyncSectionProps<T>) {
  if (state.status === "loading") {
    return (
      <SkeletonRegion loading label={label} className={className}>
        {null}
      </SkeletonRegion>
    );
  }

  if (state.status === "failed") {
    const presentation = FAILURES[state.kind];
    return (
      <ErrorState
        className={className}
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        reference={state.reference ?? null}
        // A retry is offered only where retrying can plausibly work. A button
        // that re-runs a request certain to fail the same way teaches people to
        // distrust every other button on the screen.
        actionLabel={presentation.canRetry && onRetry ? "Try again" : undefined}
        onAction={presentation.canRetry && onRetry ? onRetry : undefined}
      />
    );
  }

  if (isEmpty?.(state.data) === true) {
    return (
      <>{empty ?? <EmptyState title="Nothing here yet" description="This will fill up as work arrives." />}</>
    );
  }

  return <>{children(state.data)}</>;
}
