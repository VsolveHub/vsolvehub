// Ported from frontend/apps/partner/features/presence/model/use-partner-receiving-offers.ts
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import {
  canReceivePartnerLiveBookings,
  presenceStatus,
  HEARTBEAT_INTERVAL_MS,
  STALE_AFTER_MS,
  type PresenceStatus,
} from "./presence";
import {
  announceHeartbeat,
  onHeartbeat,
  recurringHeartbeatClaimed,
} from "./heartbeat-lease";
import {
  clearStoredSession,
  readStoredSession,
  subscribeStoredSession,
} from "./stored-session";
import { useHeartbeat } from "../queries";

function useStoredSessionId(): string | null {
  return useSyncExternalStore(subscribeStoredSession, readStoredSession, () => null);
}

/**
 * Tracks whether this browser's Partner session is online enough to receive
 * live booking popups — and keeps that true, not just believed.
 *
 * ## The keep-alive this hook owns
 *
 * The presence panel sends location-bearing heartbeats, but it is mounted only
 * on the screens that draw it. Before this hook beat too, a Partner reading
 * their earnings or a job detail sent nothing; Django marked the session stale
 * after `STALE_AFTER_MS` and dispatch skipped them — while this hook, with its
 * hardcoded "fresh", kept the radar sweeping and the popups armed. The
 * keep-alive below (session id only, no location) runs wherever the app is
 * open, and stands down whenever a panel holds the lease so the two never
 * double-beat.
 *
 * ## Staleness is reported, not assumed
 *
 * A timer armed at each acknowledged beat flips `overdue` once no beat — from
 * either sender — has landed inside the stale window. `presenceStatus` then
 * answers "stale", `canReceivePartnerLiveBookings` goes false, and the popup
 * and its alarm disarm: a phone the dispatcher cannot reach must not claim it
 * is receiving bookings.
 */
export function usePartnerReceivingOffers(): {
  readonly status: PresenceStatus;
  readonly isReceivingOffers: boolean;
} {
  const storedSessionId = useStoredSessionId();
  const heartbeat = useHeartbeat();
  const heartbeatRef = useRef(heartbeat);
  /* The last probe's verdict, keyed by the session id it probed. Everything
     else — "is there a live session", "are we still restoring" — is derived
     from comparing this against the currently stored id, so the effect below
     never has to set state synchronously to keep the two in step. */
  const [probe, setProbe] = useState<{
    readonly id: string;
    readonly ok: boolean;
  } | null>(null);
  /* Keyed by session id for the same reason as `probe`: a stale verdict left
     over from an ended session must not taint the next one, and comparing ids
     at render time needs no synchronous reset. */
  const [overdue, setOverdue] = useState<{ readonly id: string } | null>(null);

  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  useEffect(() => {
    if (storedSessionId === null) return;

    let cancelled = false;

    void heartbeatRef.current
      .mutateAsync({ session_id: storedSessionId })
      .then(() => {
        if (cancelled) return;
        setProbe({ id: storedSessionId, ok: true });
        announceHeartbeat();
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[presence] probe heartbeat failed, clearing stored session:", err);
        clearStoredSession();
        setProbe({ id: storedSessionId, ok: false });
      });

    return () => {
      cancelled = true;
    };
  }, [storedSessionId]);

  const sessionId =
    storedSessionId !== null && probe?.id === storedSessionId && probe.ok
      ? storedSessionId
      : null;
  const isRestoring = storedSessionId !== null && probe?.id !== storedSessionId;

  useEffect(() => {
    if (sessionId === null) return;

    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    const armStaleTimer = () => {
      if (staleTimer !== null) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => setOverdue({ id: sessionId }), STALE_AFTER_MS);
    };
    armStaleTimer();

    const beat = () => {
      if (AppState.currentState !== "active") return;
      if (recurringHeartbeatClaimed()) return;
      void heartbeatRef.current
        .mutateAsync({ session_id: sessionId })
        .then(() => announceHeartbeat())
        .catch((err) => {
          console.warn("[presence] recurring heartbeat failed:", err);
        });
    };

    const unsubscribe = onHeartbeat(() => {
      setOverdue(null);
      armStaleTimer();
    });

    const start = () => {
      if (interval !== null) return;
      beat();
      interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    };
    const stop = () => {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    };
    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") start();
      else stop();
    });

    return () => {
      stop();
      subscription.remove();
      if (staleTimer !== null) clearTimeout(staleTimer);
      unsubscribe();
    };
  }, [sessionId]);

  const overdueForSession = sessionId !== null && overdue?.id === sessionId;

  const status = presenceStatus({
    hasSession: sessionId !== null,
    /* Not a measured duration — `presenceStatus` only thresholds this against
       `STALE_AFTER_MS`, and the stale timer above is what does the measuring. */
    msSinceHeartbeat: sessionId === null ? null : overdueForSession ? STALE_AFTER_MS + 1 : 0,
    isConnecting: false,
    locationDenied: false,
    hasFailed: false,
    isChecking: isRestoring,
  });

  return {
    status,
    isReceivingOffers: canReceivePartnerLiveBookings(status),
  };
}
