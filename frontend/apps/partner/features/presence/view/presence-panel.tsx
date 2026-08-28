"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, Card, Dialog, ErrorState, Spinner, cn } from "@vsolve/ui";
import { Check, ChevronDown, MapPin, Power } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useApplicationReference } from "@/features/application/reference-queries";

import {
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_COPY,
  presenceStatus,
  type PresenceStatus,
} from "../model/presence";
import { announceHeartbeat, claimRecurringHeartbeat } from "../model/heartbeat-lease";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "../model/stored-session";
import { prepareBookingAlertsFromGesture } from "@/features/notifications/view/booking-alert-audio";
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

export function PresencePanel({
  consentVersion,
  variant = "default",
}: {
  consentVersion: string | null;
  variant?: "default" | "driver";
}) {
  const reference = useApplicationReference();
  const goOnline = useGoOnline();
  const goOffline = useGoOffline();
  const heartbeat = useHeartbeat();

  const [areaId, setAreaId] = useState("");
  const [openAreaModal, setOpenAreaModal] = useState(false);
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
  /**
   * Starts true when nothing is stored, because then there is nothing to probe.
   *
   * Not `useState(false)` corrected by the effect below: `storedSession`
   * re-reads storage on every render, so the id written by a successful "Go
   * online" turns it non-null mid-session — and with this still false the
   * panel froze on "Checking" until a reload. Reading storage in the
   * initialiser is hydration-safe here because `isRestoring` also needs
   * `storedSession`, which is `null` on the server pass either way.
   */
  const [hasProbedStoredSession, setHasProbedStoredSession] = useState(
    () => readStoredSession() === null,
  );
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
        announceHeartbeat();
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
    // screen already reads as offline, because `hasProbedStoredSession`
    // initialised to true when storage was empty.
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
        announceHeartbeat();
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

    // While this panel beats — with a location — the app-wide keep-alive in
    // `usePartnerReceivingOffers` stands down, so the server hears exactly one
    // cadence wherever the Partner is.
    const releaseLease = claimRecurringHeartbeat();
    const beat = setInterval(() => void sendHeartbeatRef.current(sessionId), HEARTBEAT_INTERVAL_MS);
    // Advances the clock, so "connection lost" appears on its own rather than
    // waiting for the next successful beat to re-render the screen.
    const refresh = setInterval(() => setNow(Date.now()), 5_000);

    return () => {
      releaseLease();
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
      announceHeartbeat();
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
  const isOnline = sessionId !== null && (status === "online" || status === "stale");
  const selectedArea = reference.serviceAreas.find((area) => area.id === areaId);

  if (variant === "driver") {
    return (
      <>
        <DriverPresenceControls
          status={status}
          copy={copy}
          tone={TONE[status]}
          consentVersion={consentVersion}
          reference={reference}
          isRestoring={isRestoring}
          sessionId={sessionId}
          areaId={areaId}
          setAreaId={setAreaId}
          openAreaModal={openAreaModal}
          setOpenAreaModal={setOpenAreaModal}
          canGoOnline={canGoOnline}
          goOnline={goOnline}
          goOffline={goOffline}
          isOnline={isOnline}
          handleGoOnline={handleGoOnline}
          handleGoOffline={handleGoOffline}
        />
        <AreaPickerModal
          open={openAreaModal}
          onOpenChange={setOpenAreaModal}
          areas={reference.serviceAreas}
          selectedId={areaId}
          onSelect={setAreaId}
        />
      </>
    );
  }

  return (
    <>
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
            <AreaPickerButton
              areaName={selectedArea?.name}
              disabled={reference.isPending || reference.serviceAreas.length === 0}
              onClick={() => setOpenAreaModal(true)}
            />

            <Button
              onPointerDown={() => prepareBookingAlertsFromGesture()}
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

      <AreaPickerModal
        open={openAreaModal}
        onOpenChange={setOpenAreaModal}
        areas={reference.serviceAreas}
        selectedId={areaId}
        onSelect={setAreaId}
      />
    </>
  );
}

/**
 * Uber-inspired driver controls — area picker + large GO toggle.
 *
 * Layout-only variant of `PresencePanel`. All session logic stays in the parent;
 * this component only decides how the same state is drawn on the home screen.
 */
function DriverPresenceControls({
  copy,
  tone,
  consentVersion,
  reference,
  isRestoring,
  sessionId,
  areaId,
  setOpenAreaModal,
  canGoOnline,
  goOnline,
  goOffline,
  isOnline,
  handleGoOnline,
  handleGoOffline,
}: {
  status: PresenceStatus;
  copy: (typeof PRESENCE_COPY)[PresenceStatus];
  tone: (typeof TONE)[PresenceStatus];
  consentVersion: string | null;
  reference: ReturnType<typeof useApplicationReference>;
  isRestoring: boolean;
  sessionId: string | null;
  areaId: string;
  setAreaId: (value: string) => void;
  openAreaModal: boolean;
  setOpenAreaModal: (open: boolean) => void;
  canGoOnline: boolean;
  goOnline: ReturnType<typeof useGoOnline>;
  goOffline: ReturnType<typeof useGoOffline>;
  isOnline: boolean;
  handleGoOnline: () => Promise<void>;
  handleGoOffline: () => Promise<void>;
}) {
  const selectedArea = reference.serviceAreas.find((area) => area.id === areaId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-text-muted">
            Availability
          </p>
          <p role="status" className="mt-0.5 truncate text-sm font-medium text-text">
            {copy.detail}
          </p>
        </div>
        <Badge tone={tone} dot>
          {copy.label}
        </Badge>
      </div>

      {consentVersion === null ? (
        <p className="rounded-2xl border border-line bg-surface-sunken px-3 py-2.5 text-sm text-text-secondary">
          Accept the Partner agreements before going online.
        </p>
      ) : null}

      {reference.isError ? (
        <ErrorState
          inline
          title="We could not load your areas"
          message="You are not online. Check your connection and try again."
          actionLabel="Try again"
          onAction={reference.refetch}
        />
      ) : null}

      {goOnline.isError ? <GoOnlineFailure error={goOnline.error} /> : null}

      {isRestoring ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-text-secondary">
          <Spinner size="sm" />
          Checking your last session…
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          {sessionId === null ? (
            <AreaPickerButton
              areaName={selectedArea?.name}
              disabled={reference.isPending || reference.serviceAreas.length === 0}
              onClick={() => setOpenAreaModal(true)}
            />
          ) : null}

          <button
            type="button"
            aria-label={isOnline ? "Go offline" : "Go online"}
            disabled={
              isRestoring ||
              (sessionId === null && !canGoOnline) ||
              goOnline.isPending ||
              goOffline.isPending
            }
            onPointerDown={() => prepareBookingAlertsFromGesture()}
            onClick={() => void (sessionId === null ? handleGoOnline() : handleGoOffline())}
            className={cn(
              "relative grid size-[5.5rem] place-items-center rounded-full transition-all duration-300 ease-out",
              "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-action",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isOnline
                ? "bg-[linear-gradient(145deg,#ef4444_0%,#dc2626_100%)] shadow-[0_8px_32px_color-mix(in_oklab,#dc2626_45%,transparent)]"
                : "bg-[linear-gradient(145deg,var(--color-success-text)_0%,#15803d_100%)] shadow-[0_8px_32px_color-mix(in_oklab,var(--color-success-text)_45%,transparent)]",
            )}
          >
            {goOnline.isPending || goOffline.isPending ? (
              <Spinner size="md" className="text-surface" />
            ) : (
              <Power
                size={36}
                strokeWidth={2.5}
                className="text-surface"
                aria-hidden
              />
            )}
            {isOnline ? (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-red-500/30 animate-[vsh-ping_2.4s_ease-out_infinite] motion-reduce:animate-none"
              />
            ) : null}
          </button>

          <p className="text-center text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">
            {isOnline ? "Tap to go offline" : "Tap to go online"}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Clean button trigger for opening the area picker modal.
 */
function AreaPickerButton({
  areaName,
  disabled,
  onClick,
}: {
  areaName?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-12 w-full max-w-xs items-center justify-between rounded-2xl border border-line bg-surface px-4 text-sm font-semibold text-text shadow-xs transition-all",
        "hover:border-line-strong hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
    >
      <span className="flex items-center gap-2.5 min-w-0 truncate">
        <MapPin className="h-4 w-4 text-signal-600 shrink-0" />
        <span className={cn("truncate text-sm", areaName ? "font-bold text-navy-900" : "font-medium text-text-muted")}>
          {areaName ?? "Choose your area…"}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
    </button>
  );
}

/**
 * Interactive pop-up dialog modal for selecting operational service areas.
 */
function AreaPickerModal({
  open,
  onOpenChange,
  areas,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: readonly { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Choose Service Area"
      description="Select the operational area where you want to receive on-duty job offers."
    >
      <div className="flex flex-col gap-2 py-2 max-h-[60vh] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {areas.length === 0 ? (
          <p className="text-sm text-text-secondary py-6 text-center">No service areas available.</p>
        ) : (
          areas.map((area) => {
            const isSelected = area.id === selectedId;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => {
                  onSelect(area.id);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex items-center justify-between rounded-2xl p-3.5 text-left transition-all",
                  isSelected
                    ? "border-2 border-emerald-500 bg-emerald-50 text-navy-900 font-bold shadow-xs"
                    : "border border-line bg-surface hover:bg-surface-sunken text-text font-semibold"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-xl shrink-0",
                      isSelected ? "bg-emerald-600 text-white" : "bg-surface-sunken text-text-muted"
                    )}
                  >
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold leading-tight text-navy-900">{area.name}</p>
                    <p className="text-xs text-text-secondary mt-0.5">High booking demand</p>
                  </div>
                </div>
                {isSelected ? <Check className="h-5 w-5 text-emerald-600 shrink-0" /> : null}
              </button>
            );
          })
        )}
      </div>
    </Dialog>
  );
}
