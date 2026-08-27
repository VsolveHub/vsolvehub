import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  canReceivePartnerLiveBookings,
  presenceStatus,
  type PresenceStatus,
} from "./presence";
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
 * live booking popups. Probes storage on change only — the visible presence
 * panel owns the recurring heartbeat so we do not double-hit Django/Postgres.
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
      })
      .catch(() => {
        if (cancelled) return;
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

  const status = presenceStatus({
    hasSession: sessionId !== null,
    msSinceHeartbeat: sessionId === null ? null : 0,
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
