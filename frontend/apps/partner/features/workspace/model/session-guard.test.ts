import type { WorkspaceGrant } from "@vsolve/query";
import { describe, expect, it } from "vitest";

import {
  PROJECT_WORKSPACE,
  WORKFORCE_WORKSPACE,
  activeWorkspace,
  resolveWorkspaces,
} from "../registry";
import {
  RECOVERY_HREF,
  availabilityOf,
  canRunCommand,
  mustLeaveRoute,
  recoveryFor,
} from "./session-guard";

/**
 * Capability suspension, expiry and unknown keys, mid-session.
 *
 * Closes the mid-session half of `M2-FE-114` and all of `M2-FE-113`.
 *
 * The property under test is that authorization fails *closed* and recovery
 * never points at Jobs. Both are negative properties, and both are one
 * well-meaning `?? true` away from being silently wrong.
 */

function grant(workspaceKey: string, actions: string[]): WorkspaceGrant {
  return { workspaceKey, commercialMode: null, actions };
}

const HELD = [grant(WORKFORCE_WORKSPACE, ["enquiry.view", "attendance.confirm", "crew.assign"])];

describe("availability", () => {
  it("is available when the key is known, held and unreduced", () => {
    expect(
      availabilityOf({
        workspaceKey: WORKFORCE_WORKSPACE,
        grants: HELD,
        renderedActions: ["attendance.confirm"],
      }),
    ).toEqual({ kind: "AVAILABLE" });
  });

  it("is withdrawn when the key disappears from the grants", () => {
    // 0012 §A1: a suspension is expressed by omitting the workspace, never by an
    // error. This is that case arriving on a focus refetch.
    expect(
      availabilityOf({ workspaceKey: WORKFORCE_WORKSPACE, grants: [] }),
    ).toEqual({ kind: "WITHDRAWN" });
  });

  it("is reduced when the workspace survives with fewer actions", () => {
    // The other shape of suspension in 0012 §A1. The workspace still works; one
    // control does not.
    const availability = availabilityOf({
      workspaceKey: WORKFORCE_WORKSPACE,
      grants: [grant(WORKFORCE_WORKSPACE, ["enquiry.view"])],
      renderedActions: ["enquiry.view", "crew.assign"],
    });

    expect(availability).toEqual({ kind: "REDUCED", lostActions: ["crew.assign"] });
  });

  it("is unknown for a key this build has no screens for", () => {
    expect(
      availabilityOf({
        workspaceKey: "A9_SOMETHING_NEW",
        grants: [grant("A9_SOMETHING_NEW", ["enquiry.view"])],
      }),
    ).toEqual({ kind: "UNKNOWN" });
  });

  it("reports unknown ahead of the grant check", () => {
    // A key the bundle cannot render is unusable even when fully authorized.
    // Reporting it as available would offer routes that 404.
    expect(availabilityOf({ workspaceKey: "A9_SOMETHING_NEW", grants: null }).kind).toBe(
      "UNKNOWN",
    );
  });

  it("is unverified when the grants could not be read", () => {
    expect(
      availabilityOf({ workspaceKey: WORKFORCE_WORKSPACE, grants: null }),
    ).toEqual({ kind: "UNVERIFIED" });
  });
});

describe("running a command", () => {
  it("is allowed only for an action the grant actually carries", () => {
    const availability = availabilityOf({ workspaceKey: WORKFORCE_WORKSPACE, grants: HELD });

    expect(canRunCommand(availability, HELD, WORKFORCE_WORKSPACE, "crew.assign")).toBe(true);
    expect(canRunCommand(availability, HELD, WORKFORCE_WORKSPACE, "stage.submit_evidence")).toBe(
      false,
    );
  });

  it("does not leak an action across workspaces", () => {
    // An action authorized in workforce says nothing about the same verb in
    // projects. This is the check that keeps one grant from widening another.
    const availability = availabilityOf({ workspaceKey: PROJECT_WORKSPACE, grants: HELD });
    expect(canRunCommand(availability, HELD, PROJECT_WORKSPACE, "enquiry.view")).toBe(false);
  });

  it("refuses everything when the grants could not be read", () => {
    // Fail closed. The whole point of the `UNVERIFIED` state.
    const availability = availabilityOf({ workspaceKey: WORKFORCE_WORKSPACE, grants: null });
    expect(canRunCommand(availability, null, WORKFORCE_WORKSPACE, "attendance.confirm")).toBe(
      false,
    );
  });

  it("refuses everything for a withdrawn workspace", () => {
    const availability = availabilityOf({ workspaceKey: WORKFORCE_WORKSPACE, grants: [] });
    expect(canRunCommand(availability, [], WORKFORCE_WORKSPACE, "attendance.confirm")).toBe(
      false,
    );
  });

  it("keeps the surviving actions of a reduced workspace working", () => {
    // A supervisor mid-shift must not lose attendance because crew assignment
    // was restricted. Disabling the whole screen is the over-correction.
    const reduced = [grant(WORKFORCE_WORKSPACE, ["attendance.confirm"])];
    const availability = availabilityOf({
      workspaceKey: WORKFORCE_WORKSPACE,
      grants: reduced,
      renderedActions: ["crew.assign"],
    });

    expect(availability.kind).toBe("REDUCED");
    expect(canRunCommand(availability, reduced, WORKFORCE_WORKSPACE, "attendance.confirm")).toBe(
      true,
    );
    expect(canRunCommand(availability, reduced, WORKFORCE_WORKSPACE, "crew.assign")).toBe(false);
  });
});

describe("recovery", () => {
  it("says nothing when nothing changed", () => {
    expect(recoveryFor({ kind: "AVAILABLE" })).toBeNull();
  });

  it("never points at Jobs", () => {
    // The explicit prohibition in `M2-FE-113`. Landing a workforce agency on
    // `/jobs` after a suspension tells them their shifts became jobs.
    for (const availability of [
      { kind: "WITHDRAWN" },
      { kind: "UNKNOWN" },
      { kind: "UNVERIFIED" },
      { kind: "REDUCED", lostActions: ["crew.assign"] },
    ] as const) {
      expect(recoveryFor(availability)?.href ?? null).not.toBe("/jobs");
    }
  });

  it("sends a withdrawn Partner to the base app", () => {
    const recovery = recoveryFor({ kind: "WITHDRAWN" });
    expect(recovery?.href).toBe(RECOVERY_HREF);
    expect(RECOVERY_HREF).toBe("/home");
  });

  it("offers a retry only where retrying could work", () => {
    // A retry button on a decision teaches people to distrust every button.
    expect(recoveryFor({ kind: "UNVERIFIED" })?.isRetryable).toBe(true);
    expect(recoveryFor({ kind: "UNKNOWN" })?.isRetryable).toBe(true);
    expect(recoveryFor({ kind: "WITHDRAWN" })?.isRetryable).toBe(false);
  });
});

describe("a deep link nobody navigated to", () => {
  // The last item of `M2-FE-114`. Hiding a tab is not authorization: a URL gets
  // pasted, bookmarked, shared between two phones in the same agency, and
  // restored by the browser after a crash. Every one of those arrives at a route
  // the navigation never offered.

  it("offers no command on a destination the grant never authorized", () => {
    // Holds Workforce, but not `crew.manage`. `/workforce/crew` was never a tab
    // and is still perfectly typeable.
    const grants = [grant(WORKFORCE_WORKSPACE, ["enquiry.view"])];
    const [workforce] = resolveWorkspaces(grants);

    expect(workforce?.authorizedNav.map((item) => item.href)).not.toContain("/workforce/crew");

    const availability = availabilityOf({
      workspaceKey: WORKFORCE_WORKSPACE,
      grants,
      renderedActions: ["crew.manage"],
    });
    expect(canRunCommand(availability, grants, WORKFORCE_WORKSPACE, "crew.manage")).toBe(false);
  });

  it("does not eject someone from a route they are allowed to read", () => {
    // Read and command are separate questions. A Partner who can see the crew
    // screen but not edit it is a legitimate state, and bouncing them to the
    // dashboard would lose them the roster they came to read.
    const grants = [grant(WORKFORCE_WORKSPACE, ["enquiry.view"])];
    const availability = availabilityOf({
      workspaceKey: WORKFORCE_WORKSPACE,
      grants,
      renderedActions: ["crew.manage"],
    });

    expect(mustLeaveRoute(availability)).toBe(false);
  });

  it("refuses a deep link into a workspace held by somebody else", () => {
    // The shared-phone case: a projects-only Partner opens a workforce URL. The
    // shell must not report them as standing in a workspace they do not hold.
    const grants = [grant(PROJECT_WORKSPACE, ["enquiry.view"])];

    expect(activeWorkspace(resolveWorkspaces(grants), "/workforce/shifts")).toBeNull();

    const availability = availabilityOf({ workspaceKey: WORKFORCE_WORKSPACE, grants });
    expect(availability.kind).toBe("WITHDRAWN");
    expect(canRunCommand(availability, grants, WORKFORCE_WORKSPACE, "attendance.confirm")).toBe(
      false,
    );
    expect(recoveryFor(availability)?.href).toBe(RECOVERY_HREF);
  });

  it("moves nobody anywhere on a deep link it cannot even read", () => {
    // An unknown key is the one case that must leave, because there is no screen
    // behind the URL at all — and it still leaves towards the base app.
    const availability = availabilityOf({
      workspaceKey: "A9_SOMETHING_NEW",
      grants: [grant("A9_SOMETHING_NEW", ["enquiry.view"])],
    });

    expect(mustLeaveRoute(availability)).toBe(true);
    expect(recoveryFor(availability)?.href).toBe(RECOVERY_HREF);
  });
});

describe("leaving the route", () => {
  it("keeps a withdrawn workspace's screens readable", () => {
    // In-flight records stay readable. Taking the page away is how someone loses
    // the roster for a shift they are still contractually on.
    expect(mustLeaveRoute({ kind: "WITHDRAWN" })).toBe(false);
    expect(mustLeaveRoute({ kind: "REDUCED", lostActions: [] })).toBe(false);
  });

  it("moves the Partner off a route this build cannot render", () => {
    expect(mustLeaveRoute({ kind: "UNKNOWN" })).toBe(true);
  });

  it("does not move anyone on a failed grants read", () => {
    // A dropped connection must not navigate someone away from what they were
    // doing. Nothing has been lost, and the actions are already switched off.
    expect(mustLeaveRoute({ kind: "UNVERIFIED" })).toBe(false);
  });
});
