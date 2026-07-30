"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { describeError, type ErrorPresentation, type OperationKind } from "./error-presentation";

/**
 * Application error boundary.
 *
 * Renders a `fallback` from an {@link ErrorPresentation}, so the message a user
 * sees is derived from the actual error rather than a hardcoded apology. Wire
 * it with `ErrorState` from `@vsolve/ui`:
 *
 * ```tsx
 * <AppErrorBoundary
 *   operation="financial"
 *   fallback={(presentation, reset) => (
 *     <ErrorState
 *       title={presentation.title}
 *       message={presentation.message}
 *       severity={presentation.severity}
 *       actionLabel={presentation.action?.label}
 *       onAction={reset}
 *       reference={presentation.reference}
 *     />
 *   )}
 * >
 *   <Checkout />
 * </AppErrorBoundary>
 * ```
 *
 * `QueryErrorResetBoundary` is wrapped so retrying also resets any query that
 * threw, instead of re-rendering straight back into the cached error.
 */

export interface AppErrorBoundaryProps {
  children: ReactNode;
  /**
   * What kind of work this subtree performs. `financial` makes the boundary
   * report an unknown transport failure as "we are confirming your payment"
   * instead of falsely promising nothing was charged.
   */
  operation?: OperationKind;
  fallback: (presentation: ErrorPresentation, reset: () => void) => ReactNode;
  /** Reporting hook for the observability pipeline. */
  onError?: (error: unknown, info: ErrorInfo) => void;
}

interface BoundaryState {
  error: unknown;
}

class ErrorBoundaryInner extends Component<
  AppErrorBoundaryProps & { resetQueries: () => void },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Never swallow. A boundary that renders a nice message and reports nothing
    // turns a crash into an invisible one.
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.props.resetQueries();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return this.props.fallback(describeError(error, this.props.operation ?? "read"), this.reset);
  }
}

export function AppErrorBoundary(props: AppErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => <ErrorBoundaryInner {...props} resetQueries={reset} />}
    </QueryErrorResetBoundary>
  );
}
