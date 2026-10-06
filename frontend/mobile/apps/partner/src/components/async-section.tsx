// Ported from frontend/apps/partner/components/async-section.tsx
import { ApiClientError, ApiNetworkError } from "@vsolve/api-client";
import { categorizeError } from "@vsolve/query/native";
import { EmptyState, ErrorState, SkeletonRegion } from "@vsolve/mobile-ui";
import type { ReactNode } from "react";

export type AsyncFailure = "offline" | "forbidden" | "server" | "unavailable";

export type AsyncState<T> =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly kind: AsyncFailure; readonly reference?: string | null }
  | { readonly status: "ready"; readonly data: T };

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

const FAILURES: Record<AsyncFailure, { title: string; message: string; severity: "error" | "warning" | "info"; canRetry: boolean }> = {
  offline: {
    title: "You are offline",
    message: "Nothing has been lost. This will load as soon as you are back on a connection.",
    severity: "warning",
    canRetry: true,
  },
  forbidden: {
    title: "This is not available on your account",
    message: "Your access to this changed, or it was never part of your account. Contact support if you expected to see it.",
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
    message: "This part of Vsolve is not switched on yet. Nothing you have entered is lost, and there is nothing you need to do.",
    severity: "info",
    canRetry: false,
  },
};

export function AsyncSection<T>({
  state,
  label,
  empty,
  isEmpty,
  onRetry,
  children,
}: {
  state: AsyncState<T>;
  label: string;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") {
    return (
      <SkeletonRegion loading label={label}>
        {null}
      </SkeletonRegion>
    );
  }
  if (state.status === "failed") {
    const presentation = FAILURES[state.kind];
    return (
      <ErrorState
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        reference={state.reference ?? null}
        actionLabel={presentation.canRetry && onRetry ? "Try again" : undefined}
        onAction={presentation.canRetry && onRetry ? onRetry : undefined}
      />
    );
  }
  if (isEmpty?.(state.data) === true) {
    return <>{empty ?? <EmptyState title="Nothing here yet" description="This will fill up as work arrives." />}</>;
  }
  return <>{children(state.data)}</>;
}
