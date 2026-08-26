"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { usePartnerApplication } from "@/features/application/queries";
import { useApplicationReference } from "@/features/application/reference-queries";

import {
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_COPY,
  presenceStatus,
  type PresenceCopy,
  type PresenceStatus,
} from "./model/presence";
import { clearStoredSession, readStoredSession, writeStoredSession } from "./model/stored-session";
import { useGoOffline, useGoOnline, useHeartbeat } from "./queries";

/**
 * Duty — being on or off it — held once, for the whole signed-in app.
 *
 * ## Why this moved out of a screen
 *
 * All of this state used to live inside `PresencePanel`, a card rendered in the
 * scroll flow of `/home` and again on `/me`. Two consequences, both of which
 * this provider exists to end:
 *
 * 1. **Two independent copies of the heartbeat.** Mounting the panel on both
 *    screens meant two `setInterval` beats, two restore probes and two
 *    geolocation reads, each with its own `sessionId` state. They agreed only
 *    by luck — whichever one last wrote `localStorage` won a reload.
 * 2. **You could not see it.** Duty is the single most consequential thing a
 *    Partner controls: offline means no dispatch, no offers, no money. It was a
 *    card you had to scroll to. Every comparable product — Uber, Rapido, Swiggy
 *    — keeps it visible at all times, because "am I actually online?" is a
 *    question asked dozens of times a shift and answering it should cost zero
 *    taps.
 *
 * Hoisted here, the state has one owner, one heartbeat and one stored id, and
 * the shell can render a live indicator in the app bar on every screen while
 * the full control opens as a sheet.
 *
 * ## What this does NOT change
 *
 * The honesty rule from `model/presence.ts` is carried over verbatim: this
 * never says "online" on its own authority. `status` is derived from a session
 * Django created and a heartbeat Django acknowledged, and every other case is
 * `connecting`, `stale`, `checking` or `unknown`. A Partner who believes they
 * are receiving offers while dispatch has passed them over is the failure mode,
 * and it stays invisible unless the UI is built to admit doubt.
 */

const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 15_000,
};

/** Storage is only read at mount, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, LOCATION_OPTIONS);
  });
}

export interface ServiceArea {
  readonly id: string;
  readonly name: string;
}

export interface DutyState {
  readonly status: PresenceStatus;
  readonly copy: PresenceCopy;
  /** True only for the one status that means dispatch can reach this Partner. */
  readonly isOnDuty: boolean;
  /** A session exists, whether or not its heartbeat is currently fresh. */
  readonly hasSession: boolean;

  readonly areas: readonly ServiceArea[];
  readonly areasPending: boolean;
  readonly areasFailed: boolean;
  readonly retryAreas: () => void;

  /** The area chosen for the next "go on duty", persisted across sheet opens. */
  readonly areaId: string;
  readonly setAreaId: (id: string) => void;
  /** The area currently being worked, once a session exists. */
  readonly activeAreaName: string | null;

  /** `null` when the Partner has not accepted the current agreements. */
  readonly consentVersion: string | null;
  readonly isReady: boolean;
  readonly canGoOnline: boolean;

  readonly goOnline: () => Promise<void>;
  readonly goOffline: () => Promise<void>;
  readonly isGoingOnline: boolean;
  readonly isGoingOffline: boolean;
  /** Django's own refusal, for the sheet to render through `describeError`. */
  readonly goOnlineError: unknown;
}

const DutyContext = createContext<DutyState | null>(null);

/**
 * Reads duty state. Returns `null` outside the provider rather than throwing.
 *
 * Deliberate: the marketing tree, `/login` and `/apply` render without it, and a
 * shared component that shows a duty chip when there is one must not crash the
 * page that has none. Callers branch on `null`.
 */
export function useDuty(): DutyState | null {
  return useContext(DutyContext);
}

/** Duty state, or a thrown error. For components that only ever mount inside the shell. */
export function useRequiredDuty(): DutyState {
  const duty = useContext(DutyContext);
  if (duty === null) {
    throw new Error("useRequiredDuty must be used inside <DutyProvider>");
  }
  return duty;
}

export function DutyProvider({ children }: { children: ReactNode }) {
  const application = usePartnerApplication();
  const reference = useApplicationReference();
  const goOnlineMutation = useGoOnline();
  const goOfflineMutation = useGoOffline();
  const heartbeat = useHeartbeat();

  const [areaId, setAreaId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  /**
   * The clock, in state rather than read during render.
   *
   * Freshness has to be recomputed as time passes even when nothing else
   * changed, and reading `Date.now()` in a render body makes the component
   * non-idempotent. The interval below advances this instead.
   */
  const [now, setNow] = useState(() => Date.now());

  const storedSession = useSyncExternalStore(subscribeToNothing, readStoredSession, () => null);
  const [hasProbedStoredSession, setHasProbedStoredSession] = useState(
    () => readStoredSession() === null,
  );
  const isRestoring = storedSession !== null && !hasProbedStoredSession;

  const status = presenceStatus({
    hasSession: sessionId !== null,
    msSinceHeartbeat: lastBeatAt === null ? null : now - lastBeatAt,
    isConnecting: goOnlineMutation.isPending,
    locationDenied,
    hasFailed: goOnlineMutation.isError,
    isChecking: isRestoring,
  });

  /**
   * The consent version actually on file, matched against what is currently
   * required.
   *
   * Going online records a location against a consent receipt, so the version
   * sent has to be the one the Partner accepted rather than the newest
   * published. The two differ exactly when legal text was republished and has
   * not been re-accepted — the case where guessing would attach a location to
   * an agreement nobody signed.
   */
  const consentVersion = useMemo(() => {
    const accepted = application.data?.consents.find(
      (consent) =>
        consent.withdrawn_at === null &&
        reference.requiredConsents.some(
          (document) =>
            document.purpose === consent.purpose &&
            document.document_version === consent.document_version,
        ),
    );
    return accepted?.document_version ?? null;
  }, [application.data?.consents, reference.requiredConsents]);

  const sendHeartbeat = useCallback(
    async (id: string) => {
      try {
        const position = await currentPosition().catch(() => null);
        await heartbeat.mutateAsync({
          session_id: id,
          ...(position
            ? {
                latitude: position.coords.latitude.toFixed(6),
                longitude: position.coords.longitude.toFixed(6),
                accuracy_m: Math.round(position.coords.accuracy),
              }
            : {}),
        });
        setLastBeatAt(Date.now());
      } catch {
        // Left for `status` to report as `stale`. Retrying immediately would
        // hammer a server already struggling, and pretending it succeeded is
        // the one thing this must never do.
      }
    },
    [heartbeat],
  );

  const sendHeartbeatRef = useRef(sendHeartbeat);
  useEffect(() => {
    sendHeartbeatRef.current = sendHeartbeat;
  }, [sendHeartbeat]);

  const heartbeatRef = useRef(heartbeat);
  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  /**
   * Reattaches to the session this browser left behind — with a heartbeat, not
   * a second `go_online`.
   *
   * `go_online` ends the live session and records a fresh location, so
   * restoring with it would move the Partner's recorded position on every
   * refresh and churn the dispatch pool. A heartbeat carrying only the session
   * id asks Django whether the session is still live and changes nothing if it
   * is. A refusal means it is gone — expired, ended, or replaced by another
   * device — so the stored id is dropped rather than retried.
   */
  useEffect(() => {
    const stored = readStoredSession();
    if (stored === null) return;

    let cancelled = false;
    void heartbeatRef.current
      .mutateAsync({ session_id: stored })
      .then((session) => {
        if (cancelled) return;
        setSessionId(session.id);
        /*
          `Date.now()`, not the timestamp in the response. Django persists
          `last_persisted_heartbeat_at` at most once every
          `PARTNER_PRESENCE_DB_TOUCH_SECONDS` and serves presence from cache in
          between, so a healthy session reports a time minutes old — past the
          ninety seconds that mean "stale". What the response proves is that the
          server answered just now, and that keeps freshness on one local clock.
        */
        setLastBeatAt(Date.now());
      })
      .catch(() => {
        if (!cancelled) clearStoredSession();
      })
      .finally(() => {
        if (!cancelled) setHasProbedStoredSession(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionId === null) return;

    const beat = setInterval(() => void sendHeartbeatRef.current(sessionId), HEARTBEAT_INTERVAL_MS);
    // Advances the clock, so "connection lost" appears on its own rather than
    // waiting for the next successful beat to re-render.
    const refresh = setInterval(() => setNow(Date.now()), 5_000);

    return () => {
      clearInterval(beat);
      clearInterval(refresh);
    };
  }, [sessionId]);

  const goOnline = useCallback(async () => {
    setLocationDenied(false);

    let position: GeolocationPosition;
    try {
      position = await currentPosition();
    } catch {
      setLocationDenied(true);
      return;
    }

    if (!areaId || !consentVersion) return;

    const session = await goOnlineMutation
      .mutateAsync({
        service_area_id: areaId,
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
        accuracy_m: Math.round(position.coords.accuracy),
        consent_version: consentVersion,
      })
      .catch(() => null);

    if (session) {
      setSessionId(session.id);
      setActiveAreaId(areaId);
      // Local clock here too, for the reason the restore uses it: freshness is
      // an elapsed duration on one clock, and mixing in a server timestamp
      // reintroduces device-clock skew as apparent staleness.
      setLastBeatAt(Date.now());
      writeStoredSession(session.id);
    }
  }, [areaId, consentVersion, goOnlineMutation]);

  const goOffline = useCallback(async () => {
    if (sessionId === null) return;
    await goOfflineMutation.mutateAsync({ session_id: sessionId }).catch(() => null);
    setSessionId(null);
    setActiveAreaId(null);
    setLastBeatAt(null);
    /*
      Cleared on either outcome. If Django refused, the session may still be
      live server-side, but this browser no longer has any claim to it and a
      stale id would only produce a confusing restore on the next load.
    */
    clearStoredSession();
  }, [goOfflineMutation, sessionId]);

  const areas: readonly ServiceArea[] = reference.serviceAreas;

  const activeAreaName = useMemo(() => {
    if (activeAreaId === null) return null;
    return areas.find((area) => area.id === activeAreaId)?.name ?? null;
  }, [activeAreaId, areas]);

  const value = useMemo<DutyState>(
    () => ({
      status,
      copy: PRESENCE_COPY[status],
      isOnDuty: status === "online",
      hasSession: sessionId !== null,

      areas,
      areasPending: reference.isPending,
      areasFailed: reference.isError,
      retryAreas: reference.refetch,

      areaId,
      setAreaId,
      activeAreaName,

      consentVersion,
      isReady: !isRestoring && !application.isPending,
      canGoOnline: areaId !== "" && consentVersion !== null && !goOnlineMutation.isPending,

      goOnline,
      goOffline,
      isGoingOnline: goOnlineMutation.isPending,
      isGoingOffline: goOfflineMutation.isPending,
      goOnlineError: goOnlineMutation.isError ? goOnlineMutation.error : null,
    }),
    [
      activeAreaName,
      application.isPending,
      areaId,
      areas,
      consentVersion,
      goOffline,
      goOfflineMutation.isPending,
      goOnline,
      goOnlineMutation.error,
      goOnlineMutation.isError,
      goOnlineMutation.isPending,
      isRestoring,
      reference.isError,
      reference.isPending,
      reference.refetch,
      sessionId,
      status,
    ],
  );

  return <DutyContext.Provider value={value}>{children}</DutyContext.Provider>;
}
