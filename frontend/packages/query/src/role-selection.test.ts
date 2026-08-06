import { describe, expect, it } from "vitest";

import { evaluateAuthGuard } from "./session";

/**
 * "Granted but not selected" is not the same refusal as "not granted".
 *
 * This distinction is what lets each app select its own role instead of asking. The three apps
 * are deployed on separate domains — customer, partner and operations — so the domain already
 * says which role is meant, and prompting for it asks a question the URL answered.
 *
 * It is also the *normal* path, not an edge case. `verify_login_otp` re-grants `customer` on
 * every login and session creation picks the alphabetically first grant, so `customer` sorts
 * ahead of both `operations` and `partner`: without this, every staff and Partner sign-in lands
 * on a picker.
 */

const USER = {
  id: "user-1",
  phone_number: "+919810000001",
  roles: ["customer", "operations"],
} as never;

describe("granted but not selected is its own refusal", () => {
  it("reports role_not_selected when the grant is held and another role is active", () => {
    const decision = evaluateAuthGuard({
      user: USER,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
      activeRole: "customer",
      requireActiveRole: true,
    });

    expect(decision.status).toBe("forbidden");
    expect(decision.reason).toBe("role_not_selected");
  });

  it("still reports missing_role when the grant is absent", () => {
    // The remedy differs completely: one is a switch nobody needs to see, the other is a real
    // no-access screen. Collapsing them would have the app silently try to switch to a role it
    // cannot have, and show a spinner where it should show an explanation.
    const decision = evaluateAuthGuard({
      user: { ...USER, roles: ["customer"] } as never,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
      activeRole: "customer",
      requireActiveRole: true,
    });

    expect(decision.status).toBe("forbidden");
    expect(decision.reason).toBe("missing_role");
  });

  it("lets the session through once the right role is selected", () => {
    const decision = evaluateAuthGuard({
      user: USER,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
      activeRole: "operations",
      requireActiveRole: true,
    });

    expect(decision.status).toBe("authenticated");
    expect(decision.canRender).toBe(true);
  });

  it("does not fire when the app never asked for an active role", () => {
    // Apps that only need the grant — not the selection — must not be pushed through a switch
    // they have no use for.
    const decision = evaluateAuthGuard({
      user: USER,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
      activeRole: "customer",
      requireActiveRole: false,
    });

    expect(decision.status).toBe("authenticated");
  });
});

describe("the automatic switch cannot obtain a role", () => {
  it("asks only for a role the user already holds", () => {
    // The switch is `POST /auth/roles/switch/`, which Django refuses unless the grant is held
    // and unrevoked. `role_not_selected` is only ever returned *after* the grant check has
    // passed, so the request the app makes is always for something the user already has.
    const withoutGrant = evaluateAuthGuard({
      user: { ...USER, roles: ["customer"] } as never,
      isPending: false,
      error: null,
      requiredRoles: ["operations"],
      activeRole: "customer",
      requireActiveRole: true,
    });

    expect(withoutGrant.reason).not.toBe("role_not_selected");
  });
});
