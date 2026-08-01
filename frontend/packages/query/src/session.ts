"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  ApiRequestError,
  request,
  type ApiClient,
  type Schemas,
} from "@vsolve/api-client";

import { SESSION_STATE } from "./freshness";
import { queryKeys } from "./keys";
import { publishToTabs } from "./use-tab-sync";

export type CurrentUser = Schemas["User"];
/** Anonymous-safe session projection published in contract 1.3.0. */
export type SessionState = Schemas["SessionState"];
export type UserSession = Schemas["UserSession"];
export type AuthenticatedSession = Schemas["AuthenticatedSession"];
export type OtpIssued = Schemas["OtpIssued"];
export type OtpRequestInput = Schemas["OtpRequestRequest"];
export type OtpVerifyInput = Schemas["OtpVerifyRequest"];

/**
 * The role codes Django grants.
 *
 * Lowercase `snake_case` because `UserSerializer.get_roles` returns
 * `Role.code`, and `apps/partners/permissions.py` compares against `"partner"`,
 * `"operations"` and `"finance"` literally. The union was previously uppercase,
 * which meant a guard requiring `"OPERATIONS"` would have denied a real
 * Operations session — a bug that could only appear once the first guard shipped.
 *
 * The union is a hint, not a closed set: `hasRole` and friends accept any string
 * so a role added by a newer deployment is still checkable without a client
 * release.
 */
export type KnownRole = "customer" | "partner" | "operations" | "finance";

export type AuthGuardStatus =
  | "checking"
  | "authenticated"
  | "unauthenticated"
  | "forbidden"
  | "error";

export type AuthGuardReason =
  | "loading"
  | "missing_session"
  | "session_expired"
  | "permission_denied"
  | "missing_role"
  | "query_failed";

export type AuthGuardDecision =
  | {
      status: "checking";
      canRender: false;
      reason: "loading";
      user: null;
      error: null;
      missingRoles: readonly [];
    }
  | {
      status: "authenticated";
      canRender: true;
      reason: null;
      user: CurrentUser;
      error: null;
      missingRoles: readonly [];
    }
  | {
      status: "unauthenticated";
      canRender: false;
      reason: "missing_session" | "session_expired";
      user: null;
      error: unknown;
      missingRoles: readonly [];
    }
  | {
      status: "forbidden";
      canRender: false;
      reason: "permission_denied" | "missing_role";
      user: CurrentUser | null;
      error: unknown;
      missingRoles: readonly (KnownRole | string)[];
    }
  | {
      status: "error";
      canRender: false;
      reason: "query_failed";
      user: null;
      error: unknown;
      missingRoles: readonly [];
    };

export interface AuthGuardInput {
  user: CurrentUser | null | undefined;
  isPending: boolean;
  error: unknown;
  requiredRoles?: readonly (KnownRole | string)[];
  /**
   * The role Django currently has selected for this session.
   *
   * Separate from `requiredRoles` on purpose. Holding a grant and *acting* as it
   * are different questions, and Django's Operations permission asks the second
   * one: a user with an Operations grant whose active role is `customer` is
   * refused. Pass this to make the guard agree with the server instead of
   * approving a screen whose every request will 403.
   */
  activeRole?: string | null;
  /** Requires `activeRole` to be one of `requiredRoles`, not merely granted. */
  requireActiveRole?: boolean;
}

export function hasRole(
  user: CurrentUser | null | undefined,
  role: KnownRole | string,
): boolean {
  return user?.roles.includes(role) ?? false;
}

export function hasAnyRole(
  user: CurrentUser | null | undefined,
  roles: readonly (KnownRole | string)[],
): boolean {
  return roles.some((role) => hasRole(user, role));
}

export function missingRoles(
  user: CurrentUser | null | undefined,
  roles: readonly (KnownRole | string)[],
): readonly (KnownRole | string)[] {
  if (!user) return roles;
  return roles.filter((role) => !hasRole(user, role));
}

export function evaluateAuthGuard({
  user,
  isPending,
  error,
  requiredRoles = [],
  activeRole = null,
  requireActiveRole = false,
}: AuthGuardInput): AuthGuardDecision {
  if (isPending) {
    return {
      status: "checking",
      canRender: false,
      reason: "loading",
      user: null,
      error: null,
      missingRoles: [],
    };
  }

  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return {
        status: "unauthenticated",
        canRender: false,
        reason: "session_expired",
        user: null,
        error,
        missingRoles: [],
      };
    }

    if (error.status === 403) {
      // DRF answers 403 for an unauthenticated request under
      // SessionAuthentication, so the status alone cannot tell "your session
      // ended" from "you are not allowed". The code can, and getting it wrong
      // shows a logged-out person a permission error instead of a login form.
      if (error.code === "not_authenticated" || error.code === "session_expired") {
        return {
          status: "unauthenticated",
          canRender: false,
          reason: "session_expired",
          user: null,
          error,
          missingRoles: [],
        };
      }

      return {
        status: "forbidden",
        canRender: false,
        reason: "permission_denied",
        user: null,
        error,
        missingRoles: requiredRoles,
      };
    }
  }

  if (error) {
    return {
      status: "error",
      canRender: false,
      reason: "query_failed",
      user: null,
      error,
      missingRoles: [],
    };
  }

  if (!user) {
    return {
      status: "unauthenticated",
      canRender: false,
      reason: "missing_session",
      user: null,
      error: null,
      missingRoles: [],
    };
  }

  const missing = missingRoles(user, requiredRoles);
  if (missing.length > 0) {
    return {
      status: "forbidden",
      canRender: false,
      reason: "missing_role",
      user,
      error: null,
      missingRoles: missing,
    };
  }

  // Granted but not selected. Rendering the workspace here would look like
  // access and then fail on every request, so it is refused with the roles the
  // session would have to switch to.
  if (requireActiveRole && requiredRoles.length > 0) {
    const isActing = requiredRoles.some((role) => role === activeRole);
    if (!isActing) {
      return {
        status: "forbidden",
        canRender: false,
        reason: "missing_role",
        user,
        error: null,
        missingRoles: requiredRoles,
      };
    }
  }

  return {
    status: "authenticated",
    canRender: true,
    reason: null,
    user,
    error: null,
    missingRoles: [],
  };
}

/**
 * The current session.
 *
 * `GET /api/v1/auth/session/` is anonymous-safe as of contract 1.3.0: it answers
 * `200` with `user: null` when nobody is signed in, and reserves `401` for a
 * session that was presented and is no longer valid. That distinction is the
 * whole reason screens can now word "you have not logged in" differently from
 * "your session ended" — and why discovering anonymity no longer requires
 * provoking an authentication failure that trips cross-tab logout.
 */
export function currentSessionQuery(apiClient: ApiClient) {
  return {
    queryKey: queryKeys.session.current(),
    queryFn: () => request(() => apiClient.GET("/api/v1/auth/session/")),
    ...SESSION_STATE,
  };
}

export function sessionDevicesQuery(apiClient: ApiClient) {
  return {
    queryKey: queryKeys.session.devices(),
    queryFn: () => request(() => apiClient.GET("/api/v1/auth/sessions/")),
    ...SESSION_STATE,
  };
}

export function useCurrentSession(
  apiClient: ApiClient,
  options: { enabled?: boolean } = {},
): UseQueryResult<SessionState> {
  return useQuery({
    ...currentSessionQuery(apiClient),
    enabled: options.enabled ?? true,
  });
}

export function useAuthGuard(
  apiClient: ApiClient,
  options: {
    enabled?: boolean;
    requiredRoles?: readonly (KnownRole | string)[];
    /** Require the role to be Django's *selected* role, not merely granted. */
    requireActiveRole?: boolean;
  } = {},
): AuthGuardDecision & { activeRole: string | null } {
  const session = useCurrentSession(apiClient, { enabled: options.enabled });
  const activeRole = session.data?.active_role ?? null;

  const decision = evaluateAuthGuard({
    // `user: null` in a 200 projection is a definite "nobody", which lands on
    // `missing_session` rather than `session_expired`.
    user: session.data?.user ?? (session.data ? null : undefined),
    isPending: session.isPending,
    error: session.error,
    requiredRoles: options.requiredRoles,
    activeRole,
    requireActiveRole: options.requireActiveRole,
  });

  return { ...decision, activeRole };
}

export function useSessionDevices(
  apiClient: ApiClient,
  options: { enabled?: boolean } = {},
): UseQueryResult<UserSession[]> {
  return useQuery({
    ...sessionDevicesQuery(apiClient),
    enabled: options.enabled ?? true,
  });
}

/**
 * Fetches a CSRF token explicitly.
 *
 * Almost nothing should need this. `createApiClient` bootstraps the token on the
 * first unsafe request and re-fetches it after a `csrf_failed` rejection, so a
 * screen that calls this is usually describing a transport concern it does not
 * own. Kept for the real-browser acceptance test, which has to assert the
 * bootstrap independently of a mutation that would hide it.
 */
export function useBootstrapCsrf(
  apiClient: ApiClient,
): UseMutationResult<Schemas["CsrfToken"], Error, void> {
  return useMutation({
    mutationFn: () => request(() => apiClient.GET("/api/v1/auth/csrf/")),
    retry: false,
  });
}

export function useRequestOtp(
  apiClient: ApiClient,
): UseMutationResult<OtpIssued, Error, OtpRequestInput> {
  return useMutation({
    // The explicit CSRF bootstrap that used to run first is gone: the client
    // fetches the token on any unsafe request that lacks one, so doing it here
    // was a second mechanism for the same thing — and one that every other
    // mutation in the app would have had to remember to copy.
    mutationFn: (input) =>
      request(() => apiClient.POST("/api/v1/auth/otp/request/", { body: input })),
    retry: false,
  });
}

export function useVerifyOtp(
  apiClient: ApiClient,
): UseMutationResult<AuthenticatedSession, Error, OtpVerifyInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input) =>
      request(() => apiClient.POST("/api/v1/auth/otp/verify/", { body: input })),
    onSuccess: (session) => {
      // Written in the projection's shape so the session query's consumers see
      // the same object whether it came from login or from a refetch.
      queryClient.setQueryData<SessionState>(queryKeys.session.current(), {
        user: session.user,
        active_role: session.active_role,
        session_expires_at: session.session_expires_at,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session.devices() });
      publishToTabs({ type: "session.authenticated" });
    },
    retry: false,
  });
}

export function useLogout(apiClient: ApiClient): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => request(() => apiClient.POST("/api/v1/auth/logout/")),
    onSuccess: () => {
      queryClient.clear();
      publishToTabs({ type: "session.logout" });
    },
    retry: false,
  });
}

export interface RevokeSessionInput {
  sessionId: string;
  /** Set when the device list says this row is the active browser session. */
  isCurrent?: boolean;
}

export function useRevokeSession(
  apiClient: ApiClient,
): UseMutationResult<void, Error, RevokeSessionInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input) =>
      request(() =>
        apiClient.DELETE("/api/v1/auth/sessions/{session_id}/", {
          params: { path: { session_id: input.sessionId } },
        }),
      ),
    onSuccess: (_result, input) => {
      if (input.isCurrent) {
        queryClient.clear();
        publishToTabs({ type: "session.logout" });
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.session.devices() });
    },
    retry: false,
  });
}

/**
 * Switches Django's selected role for this session.
 *
 * Holding a grant and acting as it are different things, and Django's Partner,
 * Operations and Finance permissions all ask the second question. A person with
 * both Customer and Partner grants has exactly one active role at a time, so a
 * Partner screen has to be able to ask for the switch rather than assume it.
 *
 * Only the session is invalidated, not the whole cache. The switch changes what
 * the *server* will authorize; it does not make a catalog page or a saved
 * address wrong, and clearing those would cost a refetch storm on every switch.
 * Sibling tabs are told, because the active role is per session, not per tab —
 * a second tab showing a Partner workspace after this tab switched to Customer
 * would be showing a workspace whose every request now 403s.
 */
export function useSwitchRole(
  apiClient: ApiClient,
): UseMutationResult<Schemas["ActiveRole"], Error, KnownRole | string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (role) =>
      request(() => apiClient.POST("/api/v1/auth/roles/switch/", { body: { role } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.session.all });
      publishToTabs({ type: "cache.invalidate", queryKey: queryKeys.session.all });
    },
    // Never retried: a rejected switch means the grant is not held or not
    // active, and resending the identical request cannot change that.
    retry: false,
  });
}
