import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@vsolve/api-client";

import {
  evaluateAuthGuard,
  hasAnyRole,
  hasRole,
  missingRoles,
  type CurrentUser,
} from "./session";

const user = {
  id: "user_1",
  phone_number: "+919999999999",
  roles: ["customer", "partner"],
} as CurrentUser;

describe("session role helpers", () => {
  it("checks one granted role without treating a missing user as authorized", () => {
    expect(hasRole(user, "customer")).toBe(true);
    expect(hasRole(user, "operations")).toBe(false);
    expect(hasRole(null, "customer")).toBe(false);
  });

  it("checks any allowed role for route guards", () => {
    expect(hasAnyRole(user, ["operations", "partner"])).toBe(true);
    expect(hasAnyRole(user, ["operations", "finance"])).toBe(false);
  });

  it("returns the exact missing roles for guard copy", () => {
    expect(missingRoles(user, ["customer", "operations", "finance"])).toEqual([
      "operations",
      "finance",
    ]);
    expect(missingRoles(null, ["customer"])).toEqual(["customer"]);
  });
});

const apiError = (status: number) =>
  new ApiRequestError(status, {
    code: status === 401 ? "session_expired" : "permission_denied",
    message: "Nope.",
    details: null,
    retryable: false,
    request_id: "req_auth",
  });

describe("evaluateAuthGuard", () => {
  it("blocks rendering while the session query is pending", () => {
    expect(evaluateAuthGuard({ user: undefined, isPending: true, error: null })).toEqual({
      status: "checking",
      canRender: false,
      reason: "loading",
      user: null,
      error: null,
      missingRoles: [],
    });
  });

  it("allows a signed-in user with the required role", () => {
    const decision = evaluateAuthGuard({
      user,
      isPending: false,
      error: null,
      requiredRoles: ["partner"],
    });

    expect(decision.status).toBe("authenticated");
    expect(decision.canRender).toBe(true);
    expect(decision.user).toBe(user);
  });

  it("requires a session even when no role is required", () => {
    const decision = evaluateAuthGuard({ user: null, isPending: false, error: null });
    expect(decision.status).toBe("unauthenticated");
    expect(decision.reason).toBe("missing_session");
  });

  it("classifies a 401 as an expired session recovery", () => {
    const error = apiError(401);
    const decision = evaluateAuthGuard({ user: undefined, isPending: false, error });
    expect(decision.status).toBe("unauthenticated");
    expect(decision.reason).toBe("session_expired");
    expect(decision.error).toBe(error);
  });

  it("classifies a 403 as forbidden without pretending a user is known", () => {
    const error = apiError(403);
    const decision = evaluateAuthGuard({
      user: undefined,
      isPending: false,
      error,
      requiredRoles: ["operations"],
    });
    expect(decision.status).toBe("forbidden");
    expect(decision.reason).toBe("permission_denied");
    expect(decision.missingRoles).toEqual(["operations"]);
  });

  it("forbids a signed-in user missing the required role", () => {
    const decision = evaluateAuthGuard({
      user,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
    });
    expect(decision.status).toBe("forbidden");
    expect(decision.reason).toBe("missing_role");
    expect(decision.missingRoles).toEqual(["operations"]);
  });

  it("keeps unknown session failures out of route rendering", () => {
    const error = new Error("offline");
    const decision = evaluateAuthGuard({ user: undefined, isPending: false, error });
    expect(decision.status).toBe("error");
    expect(decision.reason).toBe("query_failed");
    expect(decision.error).toBe(error);
  });
});

describe("active role", () => {
  const operationsUser = {
    id: "user_2",
    phone_number: "+919000000002",
    roles: ["customer", "operations"],
  } as CurrentUser;

  it("refuses a granted role that is not the selected one", () => {
    // Django's Operations permission asks which role the session is *acting* as.
    // Approving the screen on the grant alone renders a workspace whose every
    // request then 403s.
    const decision = evaluateAuthGuard({
      user: operationsUser,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
      activeRole: "customer",
      requireActiveRole: true,
    });

    expect(decision.status).toBe("forbidden");
    expect(decision.reason).toBe("missing_role");
    expect(decision.missingRoles).toEqual(["operations"]);
  });

  it("allows the role once Django has it selected", () => {
    const decision = evaluateAuthGuard({
      user: operationsUser,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
      activeRole: "operations",
      requireActiveRole: true,
    });

    expect(decision.status).toBe("authenticated");
    expect(decision.canRender).toBe(true);
  });

  it("ignores the active role when a screen only needs the grant", () => {
    // Most screens do: the Partner application endpoints are IsAuthenticated,
    // so demanding a selected role there would lock out every new applicant.
    const decision = evaluateAuthGuard({
      user: operationsUser,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
      activeRole: "customer",
    });

    expect(decision.status).toBe("authenticated");
  });

  it("still refuses a role that was never granted", () => {
    const decision = evaluateAuthGuard({
      user: operationsUser,
      isPending: false,
      error: null,
      requiredRoles: ["finance"],
      activeRole: "finance",
      requireActiveRole: true,
    });

    expect(decision.status).toBe("forbidden");
    expect(decision.missingRoles).toEqual(["finance"]);
  });
});

describe("anonymous-safe session projection", () => {
  it("treats an explicit null user as nobody signed in, not an expiry", () => {
    // Contract 1.3.0 answers 200 with `user: null`. Reporting that as
    // `session_expired` would tell a first-time visitor their session ended.
    const decision = evaluateAuthGuard({ user: null, isPending: false, error: null });

    expect(decision.status).toBe("unauthenticated");
    expect(decision.reason).toBe("missing_session");
  });

  it("keeps 401 meaning a session that was presented and is gone", () => {
    const decision = evaluateAuthGuard({
      user: null,
      isPending: false,
      error: new ApiRequestError(401, {
        code: "session_expired",
        message: "Session is no longer active.",
        details: null,
        retryable: false,
        request_id: null,
      }),
    });

    expect(decision.status).toBe("unauthenticated");
    expect(decision.reason).toBe("session_expired");
  });
});

describe("DRF's 403 for a missing session", () => {
  const forbidden = (code: string) =>
    new ApiRequestError(403, {
      code,
      message: "Authentication credentials were not provided.",
      details: null,
      retryable: false,
      request_id: null,
    });

  it("treats not_authenticated as a login prompt, not a permission error", () => {
    // Verified against the running backend: DRF's SessionAuthentication has no
    // `WWW-Authenticate` header, so an unauthenticated request is answered 403.
    // Reading that as "forbidden" tells a logged-out person they lack access.
    const decision = evaluateAuthGuard({
      user: null,
      isPending: false,
      error: forbidden("not_authenticated"),
    });

    expect(decision.status).toBe("unauthenticated");
    expect(decision.reason).toBe("session_expired");
  });

  it("still treats a genuine denial as forbidden", () => {
    const decision = evaluateAuthGuard({
      user: null,
      isPending: false,
      error: forbidden("permission_denied"),
      requiredRoles: ["operations"],
    });

    expect(decision.status).toBe("forbidden");
    expect(decision.reason).toBe("permission_denied");
  });
});
