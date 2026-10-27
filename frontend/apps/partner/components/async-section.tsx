"use client";

import { ApiClientError, ApiNetworkError } from "@vsolve/api-client";
import { categorizeError } from "@vsolve/query";
import { EmptyState, ErrorState, SkeletonRegion, useT } from "@vsolve/ui";
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

/**
 * One query result, as the state a section can render.
 *
 * The mapping is here rather than in each container so the four failure kinds
 * are decided once. It classifies through `@vsolve/query`'s `categorizeError`,
 * which is frozen as *the* error-classification layer — this reads its verdict
 * and picks a screen; it does not make a second judgement.
 *
 * `isPending` alone would be wrong: a disabled query is `pending` forever, and
 * a screen waiting on a query it never enabled would spin until the tab closed.
 * So a caller that disables a read has to say what it wants shown instead, which
 * is why `enabled` is an explicit input rather than something inferred.
 */
export interface QueryLikeResult<T> {
  readonly data: T | undefined;
  readonly isSuccess: boolean;
  readonly isPending: boolean;
  readonly error: unknown;
}

export function asyncStateFrom<TData, TView>(
  query: QueryLikeResult<TData>,
  select: (data: TData) => TView,
): AsyncState<TView> {
  // `isSuccess` rather than `data !== undefined`: a refetch that fails leaves
  // the last good answer in `data` while the status goes to error, and rendering
  // it would keep showing a roster or a capability list the server has stopped
  // confirming.
  if (query.isSuccess && query.data !== undefined) {
    return { status: "ready", data: select(query.data) };
  }

  if (query.error !== null && query.error !== undefined) {
    const reference = query.error instanceof ApiClientError ? query.error.requestId : null;
    if (query.error instanceof ApiNetworkError) {
      return { status: "failed", kind: "offline", reference };
    }
    const category = categorizeError(query.error);
    return {
      status: "failed",
      kind: category === "forbidden" ? "forbidden" : "server",
      reference,
    };
  }

  return { status: "loading" };
}

/** `title` and `message` are catalogue keys, resolved with `t` at render time. */
interface FailurePresentation {
  readonly title: string;
  readonly message: string;
  readonly severity: "error" | "warning" | "info";
  readonly canRetry: boolean;
}

const FAILURES: Record<AsyncFailure, FailurePresentation> = {
  offline: {
    title: "common.asyncSection.offline.title",
    message: "common.asyncSection.offline.message",
    severity: "warning",
    canRetry: true,
  },
  forbidden: {
    // Names the account rather than the person. Someone who has been suspended
    // knows; someone hitting a stale deep link has done nothing wrong, and this
    // wording is true for both.
    title: "common.asyncSection.forbidden.title",
    message: "common.asyncSection.forbidden.message",
    severity: "warning",
    canRetry: false,
  },
  server: {
    title: "common.asyncSection.server.title",
    message: "common.asyncSection.server.message",
    severity: "error",
    canRetry: true,
  },
  unavailable: {
    title: "common.asyncSection.unavailable.title",
    message: "common.asyncSection.unavailable.message",
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
  const t = useT();

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
        title={t(presentation.title)}
        message={t(presentation.message)}
        severity={presentation.severity}
        reference={state.reference ?? null}
        // A retry is offered only where retrying can plausibly work. A button
        // that re-runs a request certain to fail the same way teaches people to
        // distrust every other button on the screen.
        actionLabel={presentation.canRetry && onRetry ? t("common.tryAgain") : undefined}
        onAction={presentation.canRetry && onRetry ? onRetry : undefined}
      />
    );
  }

  if (isEmpty?.(state.data) === true) {
    return (
      <>
        {empty ?? (
          <EmptyState
            title={t("common.asyncSection.empty.title")}
            description={t("common.asyncSection.empty.description")}
          />
        )}
      </>
    );
  }

  return <>{children(state.data)}</>;
}
