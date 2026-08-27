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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasProbedStoredSession, setHasProbedStoredSession] = useState(
    () => readStoredSession() === null,
  );

  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  const isRestoring = storedSessionId !== null && !hasProbedStoredSession;

  useEffect(() => {
    if (storedSessionId === null) {
      setSessionId(null);
      setHasProbedStoredSession(true);
      return;
    }

    let cancelled = false;
    setHasProbedStoredSession(false);

    void heartbeatRef.current
      .mutateAsync({ session_id: storedSessionId })
      .then(() => {
        if (cancelled) return;
        setSessionId(storedSessionId);
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredSession();
        setSessionId(null);
      })
      .finally(() => {
        if (!cancelled) setHasProbedStoredSession(true);
      });

    return () => {
      cancelled = true;
    };
  }, [storedSessionId]);

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
