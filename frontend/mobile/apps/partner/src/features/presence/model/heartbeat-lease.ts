// Ported from frontend/apps/partner/features/presence/model/heartbeat-lease.ts

/**
 * Who is keeping the presence session alive, and when it last succeeded.
 *
 * Two things send heartbeats: the presence panel (Home / Me), whose beats
 * carry a fresh location, and the app-wide provider, whose beats carry only
 * the session id so a Partner browsing Money or a job detail does not go
 * stale on the server and silently fall out of dispatch. Without coordination
 * they would double-beat on the screens that have a panel; with it, the panel
 * claims the lease while mounted and the provider stands down.
 *
 * The announce channel runs the other way: every successful beat, whoever
 * sent it, is announced so the provider can keep an honest answer to "is
 * dispatch still reaching this phone" without owning every beat itself.
 */

let claims = 0;
const listeners = new Set<() => void>();

/** The presence panel claims the recurring beat while it is mounted. */
export function claimRecurringHeartbeat(): () => void {
  claims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims -= 1;
  };
}

export function recurringHeartbeatClaimed(): boolean {
  return claims > 0;
}

/** Call after any heartbeat the server acknowledged. */
export function announceHeartbeat(): void {
  for (const listener of listeners) listener();
}

export function onHeartbeat(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
