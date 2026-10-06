// Ported from frontend/apps/partner/features/presence/model/heartbeat-lease.test.ts

import {
  announceHeartbeat,
  claimRecurringHeartbeat,
  onHeartbeat,
  recurringHeartbeatClaimed,
} from "./heartbeat-lease";

describe("recurring heartbeat lease", () => {
  test("unclaimed until a panel claims, and released exactly once", () => {
    expect(recurringHeartbeatClaimed()).toBe(false);

    const release = claimRecurringHeartbeat();
    expect(recurringHeartbeatClaimed()).toBe(true);

    // Double-release must not underflow the claim count: a later claim from
    // another mount would otherwise be cancelled out by a stale cleanup.
    release();
    release();
    expect(recurringHeartbeatClaimed()).toBe(false);

    const second = claimRecurringHeartbeat();
    expect(recurringHeartbeatClaimed()).toBe(true);
    second();
    expect(recurringHeartbeatClaimed()).toBe(false);
  });

  test("overlapping claims stay claimed until the last release", () => {
    const first = claimRecurringHeartbeat();
    const second = claimRecurringHeartbeat();

    first();
    expect(recurringHeartbeatClaimed()).toBe(true);
    second();
    expect(recurringHeartbeatClaimed()).toBe(false);
  });

  test("announce reaches subscribed listeners and stops after unsubscribe", () => {
    const heard = jest.fn();
    const unsubscribe = onHeartbeat(heard);

    announceHeartbeat();
    expect(heard).toHaveBeenCalledTimes(1);

    unsubscribe();
    announceHeartbeat();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
