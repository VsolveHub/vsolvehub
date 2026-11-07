// Ported from frontend/apps/partner/features/presence/model/use-partner-receiving-offers.ts
import { ApiRequestError } from "@vsolve/api-client";
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
  isConfirmedSession,
  isStoredSessionHydrated,
  readStoredSession,
  subscribeStoredSession,
} from "./stored-session";
import { useHeartbeat } from "../queries";

/** How soon to ask again after a heartbeat that never reached the server. */
const PROBE_RETRY_MS = 15_000;

/**
 * The server said this session is over (ended, replaced, or never existed). Anything else — no
 * signal, a timeout, a 5xx — says nothing about the session, and clearing it then would show a
 * Partner as offline while dispatch still has them online.
 */
export function sessionIsGone(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
}

/**
 * Whether this phone's Partner session is online enough to receive offers — and keeps it so.
 *
 * ## One source of truth
 *
 * The session id lives in `stored-session`, and this hook is the only thing that decides whether
 * the server stands behind it. Every screen (the presence panel on Home and Me, the live offer
 * sheet) reads the answer from here through `usePartnerPresence`. That is what fixes "Go online,
 * then restart the app to see it": the panel no longer holds a private copy that a remount loses.
 *
 * ## The keep-alive this hook owns
 *
 * The presence panel sends location-bearing heartbeats while it is mounted. Elsewhere in the app
 * this hook beats with the session id alone, and stands down while a panel holds the lease. With
 * the app closed nothing beats; the server keeps a Partner whose phone it can push to online for
 * two hours in the background, and tells them when that ends.
 */
export function usePartnerReceivingOffers(): {
  readonly status: PresenceStatus;
  readonly isReceivingOffers: boolean;
  /** The session the server has confirmed, or `null`. */
  readonly sessionId: string | null;
} {
  const storedSessionId = useSyncExternalStore(subscribeStoredSession, readStoredSession, () => null);
  const hydrated = useSyncExternalStore(subscribeStoredSession, isStoredSessionHydrated, () => false);
  const heartbeat = useHeartbeat();
  const heartbeatRef = useRef(heartbeat);
  /* The last probe's verdict, keyed by the session id it probed, so a verdict about an ended
     session can never taint the next one. `transient` means the server was not reached. */
  const [probe, setProbe] = useState<{
    readonly id: string;
    readonly ok: boolean;
    readonly transient: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [overdue, setOverdue] = useState<{ readonly id: string } | null>(null);

  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  const confirmedNow = storedSessionId !== null && isConfirmedSession(storedSessionId);

  useEffect(() => {
    if (storedSessionId === null || confirmedNow) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    void heartbeatRef.current
      .mutateAsync({ session_id: storedSessionId })
      .then(() => {
        if (cancelled) return;
        setProbe({ id: storedSessionId, ok: true, transient: false });
        announceHeartbeat();
      })
      .catch((err) => {
        if (cancelled) return;
        if (sessionIsGone(err)) {
          clearStoredSession();
          setProbe({ id: storedSessionId, ok: false, transient: false });
          return;
        }
        console.warn("[presence] could not confirm the session, trying again:", err);
        setProbe({ id: storedSessionId, ok: false, transient: true });
        retryTimer = setTimeout(() => setRetry((count) => count + 1), PROBE_RETRY_MS);
      });

    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [storedSessionId, confirmedNow, retry]);

  const probedThis = storedSessionId !== null && probe?.id === storedSessionId;
  const sessionId =
    storedSessionId !== null && (confirmedNow || (probedThis && probe.ok)) ? storedSessionId : null;
  const isRestoring = !hydrated || (storedSessionId !== null && !confirmedNow && !probedThis);
  const unreachable = storedSessionId !== null && probedThis && probe.transient;

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
          if (sessionIsGone(err)) {
            // Ended on the server (two hours unopened, missed offers, another phone): say so.
            clearStoredSession();
            return;
          }
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
    hasFailed: unreachable,
    isChecking: isRestoring && !unreachable,
  });

  return {
    status,
    isReceivingOffers: canReceivePartnerLiveBookings(status),
    sessionId,
  };
}
