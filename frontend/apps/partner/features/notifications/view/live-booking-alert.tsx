"use client";

import { request } from "@vsolve/api-client";
import { describeError, m2QueryKeys, queryKeys, useServerCountdown } from "@vsolve/query";
import { Button, Dialog, ErrorState, Spinner, formatMoney } from "@vsolve/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { isUnread } from "@/features/notifications/model/feed";
import {
  createIdDeduper,
  createOfferDeduper,
  subscribeToPartnerStream,
  type NotificationCreatedPayload,
} from "@/features/offers/live-events";
import { useOfferCommand, usePartnerOffers, type Offer } from "@/features/offers/queries";
import { permissionsFor, isEnquiryClosed } from "@/features/enquiry/model/enquiry-state";
import { readEnquiryRecord, type EnquiryRecord } from "@/features/enquiry/model/wire";
import { useAcceptEnquiry, useDeclineEnquiry, usePartnerEnquiry } from "@/features/enquiry/queries";
import { DeclineDialog } from "@/features/enquiry/view/decline-dialog";
import { RequirementSummary } from "@/features/enquiry/view/requirement-summary";
import { getApiClient } from "@/lib/api/browser";

import { useBookingAlertSound } from "./use-booking-alert-sound";
import { stopBookingAlertLoop } from "./booking-alert-audio";

const LIVE_INVITATION_PURPOSE = "m2.invitation.received";
/** The fixed-visit offer (1.52.0): a Customer-chosen time, first professional to take it wins. */
const LIVE_FIXED_VISIT_PURPOSE = "m2.fixed_visit_offer.received";
const LIVE_INVITATION_PURPOSES = new Set([LIVE_INVITATION_PURPOSE, LIVE_FIXED_VISIT_PURPOSE]);
const LIVE_BOOKING_POLL_MS = 10_000;

function BookingPopupTimer({
  deadlineIso,
  onExpired,
}: {
  deadlineIso: string;
  onExpired?: () => void;
}) {
  const countdown = useServerCountdown(deadlineIso, 1000);

  useEffect(() => {
    if (countdown?.isExpired) onExpired?.();
  }, [countdown?.isExpired, onExpired]);

  if (countdown === null) return null;

  return (
    <div
      className="flex flex-col items-center rounded-card border-2 border-warning-line bg-warning-surface px-4 py-4"
      role="timer"
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-warning-text">
        Time to respond
      </p>
      <p
        className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
          countdown.isExpired ? "text-text-muted" : "text-warning-text"
        }`}
      >
        <span aria-hidden>{countdown.isExpired ? "0:00" : countdown.display}</span>
        <span className="sr-only">{countdown.announce}</span>
      </p>
      <p className="mt-1 text-center text-xs leading-5 text-warning-text/90">
        {countdown.isExpired
          ? "This window has closed. The job may have moved on."
          : "Accept or decline before the timer runs out."}
      </p>
    </div>
  );
}

function isLiveBookingNotification(notification: {
  purpose: string;
  read_at: string | null;
  target?: { id?: string; kind?: string } | null;
}): boolean {
  return (
    LIVE_INVITATION_PURPOSES.has(notification.purpose) &&
    isUnread(notification) &&
    typeof notification.target?.id === "string"
  );
}

/**
 * What is known about an offer at the moment it interrupts, before its full
 * record has loaded. Every field is what the server actually said: an SSE
 * `offer_created` event carries both instants, the poll fallback carries
 * whatever the offer row holds — and a missing instant stays missing rather
 * than being invented, so the popup renders no timer and no time instead of a
 * fabricated one.
 */
interface LiveOfferSignal {
  offer_id: string;
  requested_start: string | null;
  expires_at: string | null;
}

type LiveBooking =
  | { kind: "offer"; offerId: string; payload: LiveOfferSignal }
  | { kind: "invitation"; invitationId: string; title: string; body: string };

function bookingKey(booking: LiveBooking): string {
  return booking.kind === "offer"
    ? `offer:${booking.offerId}`
    : `invitation:${booking.invitationId}`;
}

/**
 * One deck, never stacked dialogs. FIFO within a kind; offers ahead of
 * invitations — an A1 offer has 45 seconds and an invitation minutes at worst,
 * so showing the slow one first would spend the fast one's whole window behind
 * a dialog the Partner is reading.
 */
function enqueueBooking(queue: LiveBooking[], booking: LiveBooking): LiveBooking[] {
  if (queue.some((pending) => bookingKey(pending) === bookingKey(booking))) return queue;
  if (booking.kind === "invitation") return [...queue, booking];
  let lastOffer = -1;
  queue.forEach((pending, index) => {
    if (pending.kind === "offer") lastOffer = index;
  });
  return [...queue.slice(0, lastOffer + 1), booking, ...queue.slice(lastOffer + 1)];
}

function formatWhen(instant: string | null | undefined): string | null {
  if (!instant) return null;
  return new Date(instant).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function findOffer(pages: { results: Offer[] }[] | undefined, offerId: string): Offer | undefined {
  return pages?.flatMap((page) => page.results).find((offer) => offer.id === offerId);
}

function bookingActionProps(onUserAction: () => void) {
  return {
    "data-booking-alert-action": true,
    onPointerDown: () => onUserAction(),
  } as const;
}

function OfferBookingPopup({
  booking,
  waitingCount,
  onClose,
  onUserAction,
}: {
  booking: Extract<LiveBooking, { kind: "offer" }>;
  waitingCount: number;
  onClose: () => void;
  onUserAction: () => void;
}) {
  const offersQuery = usePartnerOffers(true);
  const command = useOfferCommand();
  const offer = findOffer(offersQuery.data?.pages, booking.offerId);
  const isBusy = command.isPending;
  /* Only a deadline the server actually published. No deadline, no timer —
     a countdown invented on the client is fake urgency over a real decision. */
  const deadlineIso = offer?.expires_at ?? booking.payload.expires_at;

  const serviceLabel = offer?.service_lines.map((line) => line.service_label).join(", ") ?? null;
  const area = offer?.approximate_area ?? null;
  const when = formatWhen(offer?.starts_at ?? booking.payload.requested_start);
  const detailsLoading = offer === undefined && offersQuery.isFetching;

  const handleCommand = (action: "accept" | "decline") => {
    onUserAction();
    command.mutate(
      { offerId: booking.offerId, action },
      { onSuccess: () => onClose() },
    );
  };

  const handleDismiss = () => {
    onUserAction();
    onClose();
  };

  const errorMessage = command.isError ? describeError(command.error, "mutation").message : null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) handleDismiss();
      }}
      title="New booking request"
      description="A customer just booked. Accept to take the job or decline to pass."
      dismissable={!isBusy}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => handleCommand("decline")}
            disabled={isBusy}
            {...bookingActionProps(onUserAction)}
          >
            Decline
          </Button>
          <Button
            onClick={() => handleCommand("accept")}
            loading={isBusy}
            loadingLabel="Accepting"
            {...bookingActionProps(onUserAction)}
          >
            Accept
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {waitingCount > 0 ? (
          <p aria-live="polite" className="text-xs font-semibold text-text-secondary">
            {waitingCount} more waiting — answering this opens the next.
          </p>
        ) : null}

        {deadlineIso ? (
          <BookingPopupTimer deadlineIso={deadlineIso} onExpired={handleDismiss} />
        ) : null}

        <div className="flex items-start gap-3 rounded-card border border-warning-line bg-warning-surface p-4">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-warning-text" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-warning-text">Action needed now</p>
            <p className="mt-1 text-sm leading-6 text-warning-text/90">
              This offer expires soon. Another partner may take it if you wait.
            </p>
          </div>
        </div>

        {detailsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading service details…
          </div>
        ) : offer === undefined ? (
          /* The list settled without this offer in it. Say so — a made-up
             service name here would be the mock request this popup replaced. */
          <p className="py-2 text-sm leading-6 text-text-secondary">
            We could not load the service details. You can still accept or
            decline, or open Work to see the full booking.
          </p>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Service
              </p>
              <p className="mt-1 text-lg font-bold text-text">{serviceLabel}</p>
              {area ? <p className="mt-1 text-sm text-text-secondary">{area}</p> : null}
            </div>

            {when ? (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Clock size={16} aria-hidden />
                <time dateTime={offer.starts_at ?? booking.payload.requested_start ?? undefined}>
                  {when}
                </time>
              </div>
            ) : null}

            {offer.estimated_net ? (
              <div className="rounded-card border border-line bg-surface-sunken p-3">
                <div className="flex justify-between gap-3 text-sm font-semibold text-text">
                  <span>You receive (est.)</span>
                  <span>{formatMoney(offer.estimated_net.amount_paise)}</span>
                </div>
              </div>
            ) : null}
          </>
        )}

        {errorMessage ? (
          <ErrorState inline title="Could not update this offer" message={errorMessage} />
        ) : null}
      </div>
    </Dialog>
  );
}

/** The interrupt body for a fixed-visit offer: the designed offer card, compact. */
function FixedVisitOfferSummary({ enquiry }: { readonly enquiry: EnquiryRecord }) {
  const when = formatWhen(enquiry.fixedVisitStart);
  const duration =
    enquiry.fixedVisitDurationMinutes !== null ? `${enquiry.fixedVisitDurationMinutes} min` : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] px-4 py-4 text-center shadow-raised">
        <p className="text-xs font-bold uppercase tracking-wide text-text/80">You receive</p>
        <p className="text-4xl font-extrabold text-text">
          {enquiry.fixedVisitEarningPaise !== null
            ? formatMoney(enquiry.fixedVisitEarningPaise)
            : "—"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FixedVisitFact label="Service" value={enquiry.serviceName} />
        <FixedVisitFact label="Area" value={enquiry.approximateArea} />
        <FixedVisitFact label="When" value={when ?? "—"} />
        <FixedVisitFact label="On site" value={duration ?? "—"} />
      </div>

      <p className="text-sm leading-6 text-text-secondary">
        The customer picked this time. Take it or pass — there is nothing to schedule.
      </p>
    </div>
  );
}

function FixedVisitFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold text-text">{value}</p>
    </div>
  );
}

function InvitationBookingPopup({
  booking,
  waitingCount,
  onClose,
  onUserAction,
}: {
  booking: Extract<LiveBooking, { kind: "invitation" }>;
  waitingCount: number;
  onClose: () => void;
  onUserAction: () => void;
}) {
  const detailQuery = usePartnerEnquiry(booking.invitationId, true);
  const accept = useAcceptEnquiry(booking.invitationId);
  const decline = useDeclineEnquiry(booking.invitationId);
  const [declining, setDeclining] = useState(false);

  const enquiry = detailQuery.data ? readEnquiryRecord(detailQuery.data) : null;
  /* A fixed-visit offer — the customer already picked the time — gets the
     designed offer body and take-or-pass wording; an open enquiry keeps the
     review-and-respond shape. Same accept command either way. */
  const isFixedVisit = enquiry !== null && enquiry.fixedVisitStart !== null;
  const permissions = enquiry ? permissionsFor(enquiry.status) : null;
  const inFlight = accept.isPending || decline.isPending;
  const closed = enquiry !== null && isEnquiryClosed(enquiry.status);
  const canAccept = permissions?.canAccept ?? !closed;
  const canDecline = permissions?.canDecline ?? !closed;
  /* Only the deadline the server set on the enquiry, if it set one. */
  const deadlineIso = enquiry?.respondsBy ?? null;

  const errorMessage =
    accept.error || decline.error
      ? describeError(accept.error ?? decline.error, "mutation").message
      : null;

  /* Closing advances the whole deck by one, so it has to happen exactly once per
     popup. Answering and auto-dismissing can otherwise both fire — an accept
     invalidates the enquiry, the refetched record says ACCEPTED, and the effect
     below would close a second time, silently skipping the next offer waiting
     behind this one. The component is keyed by booking, so the ref resets with it. */
  const dismissed = useRef(false);
  const handleDismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    onUserAction();
    onClose();
  }, [onClose, onUserAction]);

  /*
    An interrupt exists to be answered. Once the record loads and says this
    invitation is no longer open — already taken by this Partner, passed on, or
    lost to somebody faster — there is nothing left to interrupt about, and
    holding the dialog up runs a countdown over a disabled Accept button: the
    app telling a Partner they are racing for work they already hold.

    This is the client half of the same rule the stream enforces server-side in
    `_unanswerable_offer_intent_ids`. Both halves are needed: the stream fix
    stops a dead offer being *pushed*, and this stops one that reached the deck
    by any other route — the ten-second unread poll, a stale cache, a queued
    interrupt whose offer was taken while an earlier one was on screen.

    `isPending` matters: absent it, the popup would dismiss itself in the moment
    before the record arrives.
  */
  const unanswerable = !detailQuery.isPending && enquiry !== null && !canAccept;
  useEffect(() => {
    if (unanswerable && !inFlight) handleDismiss();
  }, [handleDismiss, inFlight, unanswerable]);

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !inFlight) handleDismiss();
        }}
        title={booking.title}
        description={
          isFixedVisit
            ? "A customer booked a visit time near you."
            : "A customer is waiting for your answer. Review the service and respond."
        }
        dismissable={!inFlight}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                onUserAction();
                setDeclining(true);
              }}
              disabled={inFlight || !canDecline}
              {...bookingActionProps(onUserAction)}
            >
              {isFixedVisit ? "Pass on this one" : "Decline"}
            </Button>
            <Button
              onClick={() => {
                onUserAction();
                accept.mutate(undefined, { onSuccess: handleDismiss });
              }}
              loading={accept.isPending}
              loadingLabel={isFixedVisit ? "Taking it" : "Accepting"}
              disabled={!canAccept}
              {...bookingActionProps(onUserAction)}
            >
              {isFixedVisit ? "Take this visit" : "Accept"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {waitingCount > 0 ? (
            <p aria-live="polite" className="text-xs font-semibold text-text-secondary">
              {waitingCount} more waiting — answering this opens the next.
            </p>
          ) : null}

          {deadlineIso ? (
            <BookingPopupTimer deadlineIso={deadlineIso} onExpired={handleDismiss} />
          ) : null}

          <div className="flex items-start gap-3 rounded-card border border-warning-line bg-warning-surface p-4">
            <AlertTriangle className="mt-0.5 size-6 shrink-0 text-warning-text" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-warning-text">
                {isFixedVisit ? "First to take it gets it" : "New customer enquiry"}
              </p>
              <p className="mt-1 text-sm leading-6 text-warning-text/90">
                {isFixedVisit
                  ? "This visit was offered to other professionals too. Answer before the timer runs out."
                  : "Review the service below and accept to respond, or decline to release the slot."}
              </p>
            </div>
          </div>

          {detailQuery.isPending ? (
            <div className="flex items-center gap-2 py-4 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading service details…
            </div>
          ) : enquiry ? (
            isFixedVisit ? (
              <FixedVisitOfferSummary enquiry={enquiry} />
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Service
                  </p>
                  <p className="mt-1 text-lg font-bold text-text">{enquiry.serviceName}</p>
                </div>
                <RequirementSummary enquiry={enquiry} />
              </>
            )
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                About the service
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{booking.body}</p>
            </div>
          )}

          {detailQuery.isError ? (
            <ErrorState
              inline
              title="Could not load full details"
              message="You can still accept or decline below. Open Work for the full enquiry if needed."
            />
          ) : null}
          {errorMessage ? (
            <ErrorState inline title="Could not update this enquiry" message={errorMessage} />
          ) : null}
        </div>
      </Dialog>

      <DeclineDialog
        open={declining}
        onOpenChange={setDeclining}
        pending={decline.isPending}
        error={decline.error ? describeError(decline.error, "mutation").message : null}
        onActionPointerDown={onUserAction}
        onDecline={(reasonCode) => {
          onUserAction();
          decline.mutate({ reasonCode }, { onSuccess: handleDismiss });
        }}
      />
    </>
  );
}

/**
 * Centre-screen booking popup with service details and Accept / Decline.
 *
 * SSE is the fast path when the stream connects; polling is the reliable fallback
 * so a booking still foregrounds even when the dev proxy or a dropped stream misses
 * an event.
 */
export function PartnerLiveDelivery({
  offersEnabled,
  invitationsEnabled,
}: {
  /** A1 same-day offers: gated on the Partner's go-online presence. */
  offersEnabled: boolean;
  /** M2 invitations and fixed-visit offers: any signed-in Partner, presence or not. */
  invitationsEnabled: boolean;
  workspaceKeys?: readonly string[];
}) {
  const enabled = offersEnabled || invitationsEnabled;
  const queryClient = useQueryClient();
  /** Pending interrupts, soonest-clock first; the head is the one on screen. */
  const [queue, setQueue] = useState<LiveBooking[]>([]);
  const booking = queue[0] ?? null;
  const [alertSound, setAlertSound] = useState(true);
  const offerDeduper = useRef(createOfferDeduper());
  const notificationDeduper = useRef(createIdDeduper("notification"));
  const seenOfferIds = useRef(new Set<string>());
  const seenNotificationIds = useRef(new Set<string>());
  const offersInitialized = useRef(false);
  const unreadInitialized = useRef(false);
  const prevUnread = useRef<number | null>(null);

  const showOffer = useCallback(
    (offerId: string, payload: LiveOfferSignal) => {
      if (!offerDeduper.current(offerId)) return;
      setAlertSound(true);
      setQueue((prev) => enqueueBooking(prev, { kind: "offer", offerId, payload }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.offers() });
    },
    [queryClient],
  );

  const showInvitation = useCallback(
    (payload: NotificationCreatedPayload, invitationId: string) => {
      if (!notificationDeduper.current(payload.notification_id)) return;
      setAlertSound(true);
      setQueue((prev) =>
        enqueueBooking(prev, {
          kind: "invitation",
          invitationId,
          title: payload.title,
          body: payload.body,
        }),
      );
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.notifications.unreadCount() });
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.invitations.all });
    },
    [queryClient],
  );

  const stopAlertSound = useCallback(() => {
    stopBookingAlertLoop();
    setAlertSound(false);
  }, []);

  const closeBooking = useCallback(() => {
    stopAlertSound();
    /* Answering or dismissing the head advances the deck to the next pending
       interrupt rather than discarding it — a second offer that landed while
       the first was on screen was never shown, so it cannot have been read. */
    setQueue((prev) => prev.slice(1));
  }, [stopAlertSound]);

  /**
   * When this delivery session started, or `null` while offline.
   *
   * The poll effects below baseline themselves against the first fetch that
   * completed *after* this instant. Comparing against `dataUpdatedAt` is what
   * keeps a re-enable honest: the cached pages from the previous online spell
   * are neither replayed nor trusted as a baseline — whatever arrived while
   * offline is inbox backlog, not a live booking.
   */
  const enabledAt = useRef<number | null>(null);

  useEffect(() => {
    if (enabled) {
      enabledAt.current ??= Date.now();
      return;
    }
    enabledAt.current = null;
    offersInitialized.current = false;
    unreadInitialized.current = false;
    prevUnread.current = null;
    /* Going offline must also silence the alert loop — an external system — so
       this cannot become a render-time derivation of `enabled`. The whole deck
       clears, not just the head: everything pending belonged to the online
       spell that just ended. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    stopAlertSound();
    setQueue([]);
  }, [enabled, stopAlertSound]);

  useEffect(() => {
    if (!enabled) return;

    return subscribeToPartnerStream({
      onOfferCreated: (payload) => {
        if (!offersEnabled) return;
        showOffer(payload.offer_id, payload);
      },
      onNotificationCreated: (payload) => {
        if (!invitationsEnabled) return;
        if (!LIVE_INVITATION_PURPOSES.has(payload.purpose)) return;
        const invitationId = payload.target_id;
        if (!invitationId) return;
        showInvitation(payload, invitationId);
      },
    });
  }, [enabled, invitationsEnabled, offersEnabled, showInvitation, showOffer]);

  const offersQuery = usePartnerOffers(offersEnabled);

  useEffect(() => {
    if (!offersEnabled || !offersQuery.isSuccess || !offersQuery.data) return;
    /* Cached pages from before this online spell: not a baseline, not news. */
    if (enabledAt.current === null || offersQuery.dataUpdatedAt < enabledAt.current) return;

    const liveOffers =
      offersQuery.data.pages[0]?.results.filter((offer) => offer.status === "OFFERED") ?? [];

    /*
      The first page after delivery starts is the baseline, never a popup.

      Anything already in it existed before this Partner came online — it is
      sitting in the Work inbox where it belongs, and replaying it here as
      "a customer just booked", with the alarm, is a fake live request. The
      popup announces arrivals; only an offer that appears after this baseline
      is an arrival.
    */
    if (!offersInitialized.current) {
      offersInitialized.current = true;
      for (const offer of liveOffers) seenOfferIds.current.add(offer.id);
      return;
    }

    for (const offer of liveOffers) {
      if (seenOfferIds.current.has(offer.id)) continue;
      seenOfferIds.current.add(offer.id);
      showOffer(offer.id, {
        offer_id: offer.id,
        requested_start: offer.starts_at ?? null,
        expires_at: offer.expires_at ?? null,
      });
      break;
    }
  }, [
    offersEnabled,
    offersQuery.data,
    offersQuery.dataUpdatedAt,
    offersQuery.isSuccess,
    showOffer,
  ]);

  const unreadQuery = useQuery({
    queryKey: m2QueryKeys.notifications.unreadCount(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/notifications/unread-count/")),
    enabled: invitationsEnabled,
    refetchInterval: invitationsEnabled ? LIVE_BOOKING_POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!invitationsEnabled || !unreadQuery.isSuccess || unreadQuery.data === undefined) return;
    /* Cached count from before this online spell: not a baseline, not news. */
    if (enabledAt.current === null || unreadQuery.dataUpdatedAt < enabledAt.current) return;

    const unread = unreadQuery.data.unread;

    const fetchFeed = () =>
      queryClient.fetchQuery({
        queryKey: m2QueryKeys.notifications.feed(),
        queryFn: () => request(() => getApiClient().GET("/api/v1/notifications/")),
      });

    const inspectFeed = () => {
      void fetchFeed()
        .then((page) => {
          for (const notification of page.results) {
            if (isLiveBookingNotification(notification)) {
              if (seenNotificationIds.current.has(notification.id)) continue;
              seenNotificationIds.current.add(notification.id);
              showInvitation(
                {
                  notification_id: notification.id,
                  purpose: notification.purpose,
                  title: notification.title,
                  body: notification.body,
                  target_id: notification.target!.id,
                },
                notification.target!.id,
              );
              return;
            }
            seenNotificationIds.current.add(notification.id);
          }
        })
        .catch(() => undefined);
    };

    /*
      First count after delivery starts: record the baseline and mark what is
      already in the feed as seen, without showing anything.

      An unread notice from before this Partner came online is inbox backlog —
      the bell badge already counts it. Popping it here with the alarm replays
      an old request as a live one. Marking the current feed seen is what lets
      the non-init path below treat "unseen" as "arrived while online".
    */
    if (!unreadInitialized.current) {
      unreadInitialized.current = true;
      prevUnread.current = unread;
      if (unread > 0) {
        void fetchFeed()
          .then((page) => {
            for (const notification of page.results) {
              seenNotificationIds.current.add(notification.id);
            }
          })
          .catch(() => undefined);
      }
      return;
    }

    if (prevUnread.current !== null && unread <= prevUnread.current) {
      prevUnread.current = unread;
      return;
    }
    prevUnread.current = unread;
    inspectFeed();
  }, [
    invitationsEnabled,
    queryClient,
    showInvitation,
    unreadQuery.data,
    unreadQuery.dataUpdatedAt,
    unreadQuery.isSuccess,
  ]);

  if (booking === null) return null;

  return (
    <BookingPopupWithSound
      key={bookingKey(booking)}
      alertSound={alertSound}
      booking={booking}
      waitingCount={queue.length - 1}
      onClose={closeBooking}
      onStopSound={stopAlertSound}
    />
  );
}

function BookingPopupWithSound({
  alertSound,
  booking,
  waitingCount,
  onClose,
  onStopSound,
}: {
  alertSound: boolean;
  booking: LiveBooking;
  waitingCount: number;
  onClose: () => void;
  onStopSound: () => void;
}) {
  useBookingAlertSound(alertSound);

  const soundProps = {
    onUserAction: onStopSound,
    onClose,
    waitingCount,
  };

  if (booking.kind === "offer") {
    return <OfferBookingPopup booking={booking} {...soundProps} />;
  }

  return <InvitationBookingPopup booking={booking} {...soundProps} />;
}
