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

export { SessionSync, useTabSync, publishToTabs } from "./use-tab-sync";
export type { TabSyncOptions } from "./use-tab-sync";

export {
  currentSessionQuery,
  sessionDevicesQuery,
  useBootstrapCsrf,
  useCurrentSession,
  useSessionDevices,
  useAuthGuard,
  useRequestOtp,
  useVerifyOtp,
  useLogout,
  useRevokeSession,
  useSwitchRole,
  evaluateAuthGuard,
  hasRole,
  hasAnyRole,
  missingRoles,
} from "./session";
export type {
  AuthGuardDecision,
  AuthGuardInput,
  AuthGuardReason,
  AuthGuardStatus,
  AuthenticatedSession,
  CurrentUser,
  KnownRole,
  OtpIssued,
  OtpRequestInput,
  OtpVerifyInput,
  RevokeSessionInput,
  SessionState,
  UserSession,
} from "./session";

export {
  useOtpFlow,
  describeOtpFailure,
  sanitizeCodeInput,
  sanitizePhoneInput,
} from "./otp-flow";
export type { OtpFailure, OtpFlow, OtpFlowOptions, OtpPhase } from "./otp-flow";

export { AppErrorBoundary } from "./error-boundary";
export type { AppErrorBoundaryProps } from "./error-boundary";
