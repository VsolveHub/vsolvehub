import { hasWorkspaceAction, type WorkspaceGrant } from "@vsolve/query";

import { WORKSPACE_REGISTRY } from "../registry";

/**
 * What happens when a capability changes underneath a Partner who is using it.
 *
 * Closes `M2-FE-113`.
 *
 * ## The failure this prevents
 *
 * A supervisor opens `/workforce/shifts` at seven in the morning. At eight,
 * Operations suspends the capability. The tab is still open, the cache still
 * holds the grants, and every button on the screen still looks live. They press
 * "confirm attendance", Django refuses, and the honest reading — from where they
 * are standing — is that the app is broken.
 *
 * Grants are `SESSION_STATE`, so React Query refetches them on focus and the new
 * shape arrives on its own. This module decides what that new shape *means* for
 * someone already inside the workspace it just changed.
 *
 * ## Fail closed, and never towards Jobs
 *
 * Two rules, and the second is the one that is tempting to break. When
 * authorization cannot be established — the grants read failed, the key is
 * unknown to this build, the workspace vanished — no command runs. That is
 * `canRunCommand` returning false, not a disabled button that re-enables on the
 * next render.
 *
 * And the recovery is **never** `/jobs`. `/jobs` is the A1 task-service
 * lifecycle. Landing a workforce agency there after a suspension tells them
 * their shifts became jobs, which is both false and precisely the record-erasure
 * `M2-FE-111` forbids. `/work` is the base app every Partner holds — the
 * one WORK stack, gated on nothing but approval — and the only honest
 * destination. `/dashboard` no longer exists; the tap-first IA replaced it.
 *
 * ## Read-only survives; commands do not
 *
 * A suspended Partner still needs to see the work they already committed to —
 * who is on Thursday's shift, what was agreed. So losing a capability withdraws
 * *actions*, and the records stay readable. Blanking the screen would destroy
 * information the Partner is still responsible for, and the IA's own wording is
 * "in-flight records still readable".
 */

/** The base app, which every Partner holds regardless of any M2 capability. */
export const RECOVERY_HREF = "/home";

export type WorkspaceAvailability =
  /** Held, recognised, and authorizing everything it did before. */
  | { readonly kind: "AVAILABLE" }
  /** Still held, but the server took actions away — 0012 §A1's reduced-grant suspension. */
  | { readonly kind: "REDUCED"; readonly lostActions: readonly string[] }
  /** The key is gone from the grants entirely: suspended, expired or withdrawn. */
  | { readonly kind: "WITHDRAWN" }
  /** Authorized by the server, but this build has no screens for it. */
  | { readonly kind: "UNKNOWN" }
  /** Grants could not be read. Nothing is authorized until they can be. */
  | { readonly kind: "UNVERIFIED" };

export interface AvailabilityInput {
  /** The workspace the current route belongs to. */
  readonly workspaceKey: string;
  /** Current server grants, or null when the read failed or has not resolved. */
  readonly grants: readonly WorkspaceGrant[] | null;
  /**
   * Actions this screen was rendered against.
   *
   * Supplied by the screen rather than remembered here: a module holding the
   * previous grants would need to survive a remount and would then be a second
   * source of truth about authorization. The screen already knows which controls
   * it drew.
   */
  readonly renderedActions?: readonly string[];
}

export function availabilityOf(input: AvailabilityInput): WorkspaceAvailability {
  // Ordered before the grants check on purpose. A key this bundle cannot render
  // is unusable even if the server authorizes every action on it, and reporting
  // it as available would put a Partner in front of routes that 404.
  if (!(input.workspaceKey in WORKSPACE_REGISTRY)) return { kind: "UNKNOWN" };

  if (input.grants === null) return { kind: "UNVERIFIED" };

  const grant = input.grants.find((entry) => entry.workspaceKey === input.workspaceKey);
  if (grant === undefined) return { kind: "WITHDRAWN" };

  const lostActions = (input.renderedActions ?? []).filter(
    (action) => !grant.actions.includes(action),
  );
  if (lostActions.length > 0) return { kind: "REDUCED", lostActions };

  return { kind: "AVAILABLE" };
}

/**
 * Whether one command may be attempted right now.
 *
 * The single guard every M2 control calls. It answers false for `UNKNOWN`,
 * `WITHDRAWN` and `UNVERIFIED` without looking at the action at all — there is
 * no action worth checking against an authorization that could not be
 * established.
 *
 * `REDUCED` still consults the grant, because a reduced workspace is a working
 * one: an agency that lost `crew.assign` keeps `attendance.confirm`, and
 * disabling the whole screen would strand a supervisor mid-shift over a
 * restriction that does not touch them.
 *
 * Django re-checks regardless. This decides what is *offered*.
 */
export function canRunCommand(
  availability: WorkspaceAvailability,
  grants: readonly WorkspaceGrant[] | null,
  workspaceKey: string,
  action: string,
): boolean {
  if (availability.kind === "AVAILABLE" || availability.kind === "REDUCED") {
    return grants !== null && hasWorkspaceAction(grants, workspaceKey, action);
  }
  return false;
}

export interface WorkspaceRecovery {
  readonly headline: string;
  readonly detail: string;
  /** Where the Partner can still go. Never `/jobs`. */
  readonly href: string | null;
  readonly actionLabel: string | null;
  /** True when a refetch could plausibly fix it, so the screen offers a retry. */
  readonly isRetryable: boolean;
}

/**
 * What to tell the Partner, and where they can still go.
 *
 * `AVAILABLE` returns null: there is nothing to say, and a banner explaining
 * that everything is fine is how a person learns to ignore banners.
 */
export function recoveryFor(availability: WorkspaceAvailability): WorkspaceRecovery | null {
  switch (availability.kind) {
    case "AVAILABLE":
      return null;

    case "REDUCED":
      return {
        headline: "Some actions are no longer available",
        detail:
          "Your access to part of this work changed while you had this open. Everything here is still readable, and support can tell you why.",
        href: null,
        actionLabel: null,
        isRetryable: false,
      };

    case "WITHDRAWN":
      return {
        headline: "This work is no longer on your account",
        detail:
          "Your approval for it changed while you had this open. Work you already committed to is unaffected — contact support to find out why this changed.",
        href: RECOVERY_HREF,
        actionLabel: "Go to your home screen",
        isRetryable: false,
      };

    case "UNKNOWN":
      // Honest about the cause rather than blaming the Partner. This is a
      // deployment that authorized something this bundle does not carry, and
      // reloading genuinely can fix it.
      return {
        headline: "This part of the app needs updating",
        detail:
          "Your account is approved for work this version cannot show yet. Reload to pick up the latest version.",
        href: RECOVERY_HREF,
        actionLabel: "Go to your home screen",
        isRetryable: true,
      };

    case "UNVERIFIED":
      return {
        headline: "We could not check what you are approved for",
        detail:
          "Nothing has changed and nothing has been lost. Actions stay switched off until we can confirm your access.",
        href: null,
        actionLabel: null,
        isRetryable: true,
      };
  }
}

/**
 * Whether the Partner must be moved off the route they are on.
 *
 * Only for keys this build cannot render. A withdrawn workspace keeps its
 * screens — the records behind them are still the Partner's, and taking the page
 * away is how someone loses the roster for a shift they are still contractually
 * on. An unknown key has no screens to keep.
 */
export function mustLeaveRoute(availability: WorkspaceAvailability): boolean {
  return availability.kind === "UNKNOWN";
}
