"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, Card, ErrorState, Select, Spinner } from "@vsolve/ui";
import { Power } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useApplicationReference } from "@/features/application/reference-queries";

import {
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_COPY,
  presenceStatus,
  type PresenceStatus,
} from "../model/presence";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "../model/stored-session";
import { useGoOffline, useGoOnline, useHeartbeat } from "../queries";

/**
 * Going online, and staying honest about whether it worked.
 *
 * ## The rule this screen exists to keep
 *
 * It never says "online" on its own authority. The badge reflects a session
 * Django created and a heartbeat Django acknowledged; anything else is
 * `connecting`, `stale` or `unknown`. A Partner who believes they are receiving
 * offers while the dispatcher has passed them over is the failure mode, and it
 * is invisible unless the UI is built to admit doubt.
 *
 * ## Location
 *
 * Coarse location is required by Django to place the Partner in an area, so the
 * browser prompt is triggered by an explicit "Go online" press rather than on
 * mount — a permission dialog nobody asked for is usually denied, and a denial
 * is sticky.
 *
 * ## Background tabs
 *
 * The heartbeat keeps running when the tab is hidden, because a Partner driving
 * with their phone locked is still working. It stops on unmount and when the
 * session ends. Browsers throttle background timers, which is exactly why the
 * status is derived from the last acknowledged beat rather than from whether
 * the interval is scheduled.
 */

const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 15_000,
};

/**
 * Storage is only read at mount, so there is nothing to subscribe to.
 *
 * Module scope, not inline: `useSyncExternalStore` resubscribes whenever this
 * identity changes, and a new closure each render would resubscribe forever.
 */
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

const TONE: Record<PresenceStatus, "neutral" | "success" | "warning" | "danger"> = {
  checking: "neutral",
  offline: "neutral",
  connecting: "neutral",
  online: "success",
  stale: "warning",
  location_denied: "danger",
  unknown: "warning",
};

/**
 * The server's own words about why going online was refused.
 *
 * `describeError` is used rather than hand-written copy because the interesting
 * refusals here are eligibility decisions Django alone knows about — an
 * unapproved document, a suspended account, an area that stopped accepting
 * Partners. Any message written on this side would be a guess at which one.
 *
 * No retry button: every refusal this endpoint returns is `retryable: false`,
 * and offering to resend a request the server has already decided against just
 * repeats the refusal.
 */
function GoOnlineFailure({ error }: { error: unknown }) {
  // A non-financial write: going online changes availability, never money, so
  // the reassurance copy must not talk about charges.
  const failure = describeError(error, "mutation");

  return (
    <ErrorState
      inline
      className="mt-4"
      title={failure.title}
      message={failure.message}
      severity={failure.severity}
      reference={failure.reference}
    />
  );
}

export function PresencePanel({ consentVersion }: { consentVersion: string | null }) {
  const reference = useApplicationReference();
  const goOnline = useGoOnline();
  const goOffline = useGoOffline();
  const heartbeat = useHeartbeat();

  const [areaId, setAreaId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  /**
   * The clock, held in state rather than read during render.
   *
   * Freshness has to be recomputed as time passes even when nothing else
   * changes, but reading `Date.now()` in the render body makes the component
   * non-idempotent — the same props would produce a different tree on a re-render
   * React did for its own reasons. The interval below advances this instead.
   */
  const [now, setNow] = useState(() => Date.now());
  /**
   * Whether a previous load left a session behind, read hydration-safely.
   *
   * `useSyncExternalStore` because browser storage is exactly the external store
   * it exists for: the server snapshot is `null` — it has no storage to read —
   * and React reconciles the client's real value after hydration without a
   * mismatch. Reading storage in a `useState` initialiser instead made the two
   * sides disagree, so the first paint asserted "Offline" and corrected itself a
   * moment later. That is the flicker a reloading Partner saw as their
   * availability dropping and coming back.
   */
  const storedSession = useSyncExternalStore(subscribeToNothing, readStoredSession, () => null);
  const [hasProbedStoredSession, setHasProbedStoredSession] = useState(false);
  /** True only while a stored session exists and Django has not answered about it. */
  const isRestoring = storedSession !== null && !hasProbedStoredSession;

  const status = presenceStatus({
    hasSession: sessionId !== null,
    msSinceHeartbeat: lastBeatAt === null ? null : now - lastBeatAt,
    isConnecting: goOnline.isPending,
    locationDenied,
    hasFailed: goOnline.isError,
    isChecking: isRestoring,
  });

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
        // Left for the status to report as `stale`. Retrying immediately would
        // hammer a server that is already struggling, and pretending it
        // succeeded is the one thing this screen must not do.
      }
    },
    [heartbeat],
  );

  const sendHeartbeatRef = useRef(sendHeartbeat);
  useEffect(() => {
    sendHeartbeatRef.current = sendHeartbeat;
  }, [sendHeartbeat]);

  /**
   * Reattaches to the session this browser left behind.
   *
   * A heartbeat, deliberately, not a second `online` call: `go_online` ends the
   * live session and records a fresh location, so restoring with it would move
   * the Partner's recorded position on every refresh and churn the dispatch
   * pool. A heartbeat carrying only the session id asks Django whether that
   * session is still live and changes nothing if it is.
   *
   * Runs once. Django's answer is what decides the screen: a refusal means the
   * session is gone — expired, replaced by another device, or ended — and the
   * stored id is dropped rather than retried.
   */
  const heartbeatRef = useRef(heartbeat);
  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  useEffect(() => {
    const stored = readStoredSession();
    // Nothing stored means nothing to confirm and no request to spend. The
    // screen already reads as offline, because `isRestoring` is false without
    // a stored session.
    if (stored === null) return;

    let cancelled = false;
    void heartbeatRef.current
      .mutateAsync({ session_id: stored })
      .then((session) => {
        if (cancelled) return;
        setSessionId(session.id);
        // `Date.now()`, not the timestamp in the response. Django persists
        // `last_persisted_heartbeat_at` at most once every
        // `PARTNER_PRESENCE_DB_TOUCH_SECONDS` and serves presence from cache in
        // between, so a healthy session reports a time minutes old — well past
        // the ninety seconds that mean "stale". What the response proves is that
        // the server answered just now, which is what freshness is measured
        // from, and it keeps the comparison on a single local clock.
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
    // waiting for the next successful beat to re-render the screen.
    const refresh = setInterval(() => setNow(Date.now()), 5_000);

    return () => {
      clearInterval(beat);
      clearInterval(refresh);
    };
  }, [sessionId]);

  async function handleGoOnline() {
    setLocationDenied(false);

    let position: GeolocationPosition;
    try {
      position = await currentPosition();
    } catch {
      setLocationDenied(true);
      return;
    }

    if (!areaId || !consentVersion) return;

    const session = await goOnline
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
      // Local clock here too, for the same reason the restore uses it: freshness
      // is an elapsed duration measured on one clock, and mixing a server
      // timestamp into it reintroduces device-clock skew as apparent staleness.
      setLastBeatAt(Date.now());
      writeStoredSession(session.id);
    }
  }

  async function handleGoOffline() {
    if (sessionId === null) return;
    await goOffline.mutateAsync({ session_id: sessionId }).catch(() => null);
    setSessionId(null);
    setLastBeatAt(null);
    // Cleared on either outcome. If Django refused the request the session may
    // still be live server-side, but this browser no longer has any claim to it
    // and a stale id would only produce a confusing restore on the next load.
    clearStoredSession();
  }

  const copy = PRESENCE_COPY[status];
  const canGoOnline = areaId !== "" && consentVersion !== null && !goOnline.isPending;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-text">Your availability</h2>
        <Badge tone={TONE[status]} dot>
          {copy.label}
        </Badge>
      </div>

      <p role="status" className="mt-2 text-sm leading-6 text-text-secondary">
        {copy.detail}
      </p>

      {consentVersion === null ? (
        <p className="mt-4 rounded-card border border-line bg-surface-sunken p-3 text-sm text-text-secondary">
          Accept the Partner agreements before going online — we record which
          version you agreed to alongside your location.
        </p>
      ) : null}

      {reference.isError ? (
        <ErrorState
          inline
          className="mt-4"
          title="We could not load your areas"
          message="You are not online. Check your connection and try again."
          actionLabel="Try again"
          onAction={reference.refetch}
        />
      ) : null}

      {/*
        Why the refusal gets its own block rather than only the badge.

        Django refuses `presence/online` with a specific, actionable sentence —
        "Your required identity documents are not approved" is one a Partner can
        act on. Folding that into the status turned it into "Not sure: we could
        not confirm whether you are online", which is the copy for *doubt*. The
        server was not doubtful; it had decided, and said why. The badge still
        reports doubt, because a failed attempt genuinely leaves availability
        unconfirmed — this says what went wrong underneath it.
      */}
      {goOnline.isError ? <GoOnlineFailure error={goOnline.error} /> : null}

      {/* The controls wait for the same answer the badge does. Showing "Go
          online" and swapping it for "Go offline" a moment later is the same
          flicker, in the part of the card the Partner is reaching for. */}
      {isRestoring ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Checking your last session…
        </p>
      ) : sessionId === null ? (
        <div className="mt-4 flex flex-col gap-3">
          <Select
            aria-label="Area you are working in"
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
            disabled={reference.isPending || reference.serviceAreas.length === 0}
          >
            <option value="">Choose your area…</option>
            {reference.serviceAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>

          <Button
            onClick={() => void handleGoOnline()}
            disabled={!canGoOnline}
            loading={goOnline.isPending}
            loadingLabel="Going online"
          >
            Go online
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <Button
            variant="outline"
            block
            icon={<Power size={16} />}
            onClick={() => void handleGoOffline()}
            loading={goOffline.isPending}
            loadingLabel="Going offline"
          >
            Go offline
          </Button>
        </div>
      )}

      <p className="mt-3 text-xs leading-5 text-text-muted">
        While you are online we keep a coarse location so we can offer you nearby
        work. It stops the moment you go offline.
      </p>
    </Card>
  );
}
