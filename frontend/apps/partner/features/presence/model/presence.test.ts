import { describe, expect, it } from "vitest";

import {
  PRESENCE_COPY,
  STALE_AFTER_MS,
  canReceivePartnerLiveBookings,
  presenceStatus,
  type PresenceInput,
} from "./presence";

/**
 * The rule under test is a product rule, not a UI detail: the app may never tell
 * a Partner they are available unless Django currently says so. Every assertion
 * here is a way that could go wrong.
 */

const base: PresenceInput = {
  hasSession: false,
  msSinceHeartbeat: null,
  isConnecting: false,
  locationDenied: false,
  hasFailed: false,
};

describe("presence status", () => {
  it("starts offline", () => {
    expect(presenceStatus(base)).toBe("offline");
  });

  /**
   * A page load cannot know yet.
   *
   * The server renders this component without access to the browser's stored
   * session, so the first paint used to assert "Offline — you will not be
   * offered any jobs" and then correct itself to Online a moment later. To a
   * Partner that reads as their availability dropping and coming back. Not
   * knowing is its own state, and it outranks every other answer because all of
   * them would be guesses.
   */
  it("admits it does not know yet while a stored session is being checked", () => {
    expect(presenceStatus({ ...base, isChecking: true })).toBe("checking");
  });

  it("keeps checking ahead of the states it would otherwise be mistaken for", () => {
    expect(presenceStatus({ ...base, isChecking: true, hasFailed: true })).toBe("checking");
    expect(
      presenceStatus({ ...base, isChecking: true, hasSession: true, msSinceHeartbeat: 0 }),
    ).toBe("checking");
  });

  it("does not claim online while the session is still being created", () => {
    expect(presenceStatus({ ...base, isConnecting: true })).toBe("connecting");
  });

  it("reports online only with a live session and a fresh heartbeat", () => {
    expect(presenceStatus({ ...base, hasSession: true, msSinceHeartbeat: 5_000 })).toBe(
      "online",
    );
  });

  it("stops claiming availability once the heartbeat is overdue", () => {
    // The Partner believes they are receiving offers; the dispatcher has already
    // passed them over. This state is what keeps those two in agreement.
    expect(
      presenceStatus({ ...base, hasSession: true, msSinceHeartbeat: STALE_AFTER_MS + 1 }),
    ).toBe("stale");
  });

  it("tolerates a single missed beat rather than flapping", () => {
    expect(
      presenceStatus({ ...base, hasSession: true, msSinceHeartbeat: STALE_AFTER_MS - 1 }),
    ).toBe("online");
  });

  it("says location is needed rather than blaming the network", () => {
    expect(presenceStatus({ ...base, locationDenied: true })).toBe("location_denied");
  });

  it("prefers the location problem over any other state, since nothing else can proceed", () => {
    expect(
      presenceStatus({
        ...base,
        locationDenied: true,
        isConnecting: true,
        hasSession: true,
        msSinceHeartbeat: 1_000,
      }),
    ).toBe("location_denied");
  });

  it("admits it does not know rather than guessing offline after a failure", () => {
    expect(presenceStatus({ ...base, hasFailed: true })).toBe("unknown");
    expect(
      presenceStatus({ ...base, hasSession: true, msSinceHeartbeat: null }),
    ).toBe("unknown");
  });
});

describe("live booking delivery", () => {
  it("only foregrounds bookings when the Partner is genuinely online", () => {
    expect(canReceivePartnerLiveBookings("online")).toBe(true);
    expect(canReceivePartnerLiveBookings("offline")).toBe(false);
    expect(canReceivePartnerLiveBookings("stale")).toBe(false);
    expect(canReceivePartnerLiveBookings("checking")).toBe(false);
  });
});

describe("presence copy", () => {
  it("promises jobs in exactly one state", () => {
    const promising = Object.entries(PRESENCE_COPY).filter(([, copy]) =>
      /can be offered jobs/i.test(copy.detail),
    );

    expect(promising.map(([status]) => status)).toEqual(["online"]);
  });

  it("tells the Partner what will not happen in every other state", () => {
    for (const [status, copy] of Object.entries(PRESENCE_COPY)) {
      if (status === "online") continue;
      expect(copy.detail.length, `${status} needs an explanation`).toBeGreaterThan(20);
    }
  });

  it("never carries state by colour alone", () => {
    for (const copy of Object.values(PRESENCE_COPY)) {
      expect(copy.label.length).toBeGreaterThan(0);
    }
  });
});
