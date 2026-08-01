"use client";

import { Badge, Button, Card, ErrorState, Select } from "@vsolve/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApplicationReference } from "@/features/application/reference-queries";

import {
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_COPY,
  presenceStatus,
  type PresenceStatus,
} from "../model/presence";
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
  offline: "neutral",
  connecting: "neutral",
  online: "success",
  stale: "warning",
  location_denied: "danger",
  unknown: "warning",
};

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

  const status = presenceStatus({
    hasSession: sessionId !== null,
    msSinceHeartbeat: lastBeatAt === null ? null : now - lastBeatAt,
    isConnecting: goOnline.isPending,
    locationDenied,
    hasFailed: goOnline.isError,
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
      setLastBeatAt(Date.parse(session.last_persisted_heartbeat_at));
    }
  }

  async function handleGoOffline() {
    if (sessionId === null) return;
    await goOffline.mutateAsync({ session_id: sessionId }).catch(() => null);
    setSessionId(null);
    setLastBeatAt(null);
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

      {sessionId === null ? (
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
