export { makeQueryClient, getQueryClient } from "./client";
export { QueryProvider } from "./provider";

export { queryKeys } from "./keys";
export type { QueryKeys } from "./keys";

export {
  STATIC_CONTENT,
  SESSION_STATE,
  VOLATILE_STATE,
  EXPIRING_STATE,
  RECOVERY_POLL_INTERVAL,
} from "./freshness";
export type { FreshnessTier } from "./freshness";

export { shouldRetryQuery, shouldRetryMutation, queryRetryDelay } from "./retry";

export { describeError, isFieldError } from "./error-presentation";
export type {
  ErrorPresentation,
  OperationKind,
  RecoveryAction,
  StateChange,
} from "./error-presentation";

export { createTabChannel, getTabChannel } from "./cross-tab";
export type { TabChannel, TabMessage, TabMessageListener } from "./cross-tab";

export { useTabSync, publishToTabs } from "./use-tab-sync";
export type { TabSyncOptions } from "./use-tab-sync";

export { AppErrorBoundary } from "./error-boundary";
export type { AppErrorBoundaryProps } from "./error-boundary";
