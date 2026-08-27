"use client";

import { request, serverClock } from "@vsolve/api-client";
import { describeError, m2QueryKeys, queryKeys, useServerCountdown } from "@vsolve/query";
import { Button, Dialog, ErrorState, Spinner, formatMoney } from "@vsolve/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createIdDeduper,
  createOfferDeduper,
  subscribeToPartnerStream,
  type NotificationCreatedPayload,
  type OfferCreatedPayload,
} from "@/features/offers/live-events";
import { useOfferCommand, usePartnerOffers, type Offer } from "@/features/offers/queries";
import { permissionsFor, isEnquiryClosed } from "@/features/enquiry/model/enquiry-state";
import { readEnquiryRecord } from "@/features/enquiry/model/wire";
import { useAcceptEnquiry, useDeclineEnquiry, usePartnerEnquiry } from "@/features/enquiry/queries";
import { DeclineDialog } from "@/features/enquiry/view/decline-dialog";
import { RequirementSummary } from "@/features/enquiry/view/requirement-summary";
import { getApiClient } from "@/lib/api/browser";

import { useBookingAlertSound } from "./use-booking-alert-sound";
import { stopBookingAlertLoop } from "./booking-alert-audio";

const LIVE_INVITATION_PURPOSE = "m2.invitation.received";
const LIVE_BOOKING_POLL_MS = 10_000;
/** Same-day offer window; also the fallback when no server deadline is published. */
const POPUP_RESPONSE_SECONDS = 45;

function usePopupDeadline(serverDeadline: string | null | undefined): string {
  const [fallback] = useState(() =>
    new Date(serverClock.now() + POPUP_RESPONSE_SECONDS * 1000).toISOString(),
  );
  return serverDeadline ?? fallback;
}

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
    notification.purpose === LIVE_INVITATION_PURPOSE &&
    notification.read_at === null &&
    typeof notification.target?.id === "string"
  );
}

type LiveBooking =
  | { kind: "offer"; offerId: string; payload: OfferCreatedPayload }
  | { kind: "invitation"; invitationId: string; title: string; body: string };

function formatWhen(instant: string | null | undefined): string {
  if (!instant) return "Time not given";
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
  onClose,
  onUserAction,
}: {
  booking: Extract<LiveBooking, { kind: "offer" }>;
  onClose: () => void;
  onUserAction: () => void;
}) {
  const offersQuery = usePartnerOffers(true);
  const command = useOfferCommand();
  const offer = findOffer(offersQuery.data?.pages, booking.offerId);
  const isBusy = command.isPending;
  const deadlineIso = usePopupDeadline(offer?.expires_at ?? booking.payload.expires_at);

  const serviceLabel =
    offer?.service_lines.map((line) => line.service_label).join(", ") ?? "New service booking";
  const area = offer?.approximate_area ?? "Your service area";
  const when = formatWhen(offer?.starts_at ?? booking.payload.requested_start);

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
        <BookingPopupTimer deadlineIso={deadlineIso} onExpired={handleDismiss} />

        <div className="flex items-start gap-3 rounded-card border border-warning-line bg-warning-surface p-4">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-warning-text" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-warning-text">Action needed now</p>
            <p className="mt-1 text-sm leading-6 text-warning-text/90">
              This offer expires soon. Another partner may take it if you wait.
            </p>
          </div>
        </div>

        {offersQuery.isPending && offer === undefined ? (
          <div className="flex items-center gap-2 py-4 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading service details…
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Service
              </p>
              <p className="mt-1 text-lg font-bold text-text">{serviceLabel}</p>
              <p className="mt-1 text-sm text-text-secondary">{area}</p>
            </div>

            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Clock size={16} aria-hidden />
              <time dateTime={booking.payload.requested_start}>{when}</time>
            </div>

            {offer?.estimated_net ? (
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

function InvitationBookingPopup({
  booking,
  onClose,
  onUserAction,
}: {
  booking: Extract<LiveBooking, { kind: "invitation" }>;
  onClose: () => void;
  onUserAction: () => void;
}) {
  const detailQuery = usePartnerEnquiry(booking.invitationId, true);
  const accept = useAcceptEnquiry(booking.invitationId);
  const decline = useDeclineEnquiry(booking.invitationId);
  const [declining, setDeclining] = useState(false);

  const enquiry = detailQuery.data ? readEnquiryRecord(detailQuery.data) : null;
  const permissions = enquiry ? permissionsFor(enquiry.status) : null;
  const inFlight = accept.isPending || decline.isPending;
  const closed = enquiry !== null && isEnquiryClosed(enquiry.status);
  const canAccept = permissions?.canAccept ?? !closed;
  const canDecline = permissions?.canDecline ?? !closed;
  const deadlineIso = usePopupDeadline(enquiry?.respondsBy ?? null);

  const errorMessage =
    accept.error || decline.error
      ? describeError(accept.error ?? decline.error, "mutation").message
      : null;

  const handleDismiss = () => {
    onUserAction();
    onClose();
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !inFlight) handleDismiss();
        }}
        title={booking.title}
        description="Review the service and respond before the timer runs out."
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
              Decline
            </Button>
            <Button
              onClick={() => {
                onUserAction();
                accept.mutate(undefined, { onSuccess: () => onClose() });
              }}
              loading={accept.isPending}
              loadingLabel="Accepting"
              disabled={!canAccept}
              {...bookingActionProps(onUserAction)}
            >
              Accept
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <BookingPopupTimer deadlineIso={deadlineIso} onExpired={handleDismiss} />

          <div className="flex items-start gap-3 rounded-card border border-warning-line bg-warning-surface p-4">
            <AlertTriangle className="mt-0.5 size-6 shrink-0 text-warning-text" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-warning-text">New customer enquiry</p>
              <p className="mt-1 text-sm leading-6 text-warning-text/90">
                Review the service below and accept to respond, or decline to release the slot.
              </p>
            </div>
          </div>

          {detailQuery.isPending ? (
            <div className="flex items-center gap-2 py-4 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading service details…
            </div>
          ) : enquiry ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Service
                </p>
                <p className="mt-1 text-lg font-bold text-text">{enquiry.serviceName}</p>
              </div>
              <RequirementSummary enquiry={enquiry} />
            </>
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
          decline.mutate({ reasonCode }, { onSuccess: () => onClose() });
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
  enabled,
}: {
  enabled: boolean;
  workspaceKeys?: readonly string[];
}) {
  const queryClient = useQueryClient();
  const [booking, setBooking] = useState<LiveBooking | null>(null);
  const [alertSound, setAlertSound] = useState(true);
  const offerDeduper = useRef(createOfferDeduper());
  const notificationDeduper = useRef(createIdDeduper("notification"));
  const seenOfferIds = useRef(new Set<string>());
  const seenNotificationIds = useRef(new Set<string>());
  const offersInitialized = useRef(false);
  const unreadInitialized = useRef(false);
  const prevUnread = useRef<number | null>(null);

  const showOffer = useCallback(
    (offerId: string, payload: OfferCreatedPayload) => {
      if (!offerDeduper.current(offerId)) return;
      setAlertSound(true);
      setBooking({ kind: "offer", offerId, payload });
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.offers() });
    },
    [queryClient],
  );

  const showInvitation = useCallback(
    (payload: NotificationCreatedPayload, invitationId: string) => {
      if (!notificationDeduper.current(payload.notification_id)) return;
      setAlertSound(true);
      setBooking({
        kind: "invitation",
        invitationId,
        title: payload.title,
        body: payload.body,
      });
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
    setBooking(null);
  }, [stopAlertSound]);

  useEffect(() => {
    if (enabled) return;
    closeBooking();
  }, [closeBooking, enabled]);

  useEffect(() => {
    if (!enabled) return;

    return subscribeToPartnerStream({
      onOfferCreated: (payload) => {
        showOffer(payload.offer_id, payload);
      },
      onNotificationCreated: (payload) => {
        if (payload.purpose !== LIVE_INVITATION_PURPOSE) return;
        const invitationId = payload.target_id;
        if (!invitationId) return;
        showInvitation(payload, invitationId);
      },
    });
  }, [enabled, showInvitation, showOffer]);

  const offersQuery = usePartnerOffers(enabled);

  useEffect(() => {
    if (!enabled || !offersQuery.isSuccess || !offersQuery.data) return;

    const liveOffers =
      offersQuery.data.pages[0]?.results.filter((offer) => offer.status === "OFFERED") ?? [];

    if (!offersInitialized.current) {
      offersInitialized.current = true;
      for (const offer of liveOffers) {
        seenOfferIds.current.add(offer.id);
      }
      return;
    }

    for (const offer of liveOffers) {
      if (seenOfferIds.current.has(offer.id)) continue;
      seenOfferIds.current.add(offer.id);
      showOffer(offer.id, {
        offer_id: offer.id,
        fulfilment_unit_id: offer.fulfilment_unit_id ?? "",
        requested_start: offer.starts_at ?? new Date().toISOString(),
        expires_at: offer.expires_at ?? new Date().toISOString(),
      });
      break;
    }
  }, [enabled, offersQuery.data, offersQuery.dataUpdatedAt, offersQuery.isSuccess, showOffer]);

  const unreadQuery = useQuery({
    queryKey: m2QueryKeys.notifications.unreadCount(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/notifications/unread-count/")),
    enabled,
    refetchInterval: enabled ? LIVE_BOOKING_POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!enabled || !unreadQuery.isSuccess || unreadQuery.data === undefined) return;

    const unread = unreadQuery.data.unread;

    const inspectFeed = (triggerPopup = true) => {
      void queryClient
        .fetchQuery({
          queryKey: m2QueryKeys.notifications.feed(),
          queryFn: () => request(() => getApiClient().GET("/api/v1/notifications/")),
        })
        .then((page) => {
          for (const notification of page.results) {
            if (isLiveBookingNotification(notification)) {
              if (seenNotificationIds.current.has(notification.id)) continue;
              seenNotificationIds.current.add(notification.id);
              if (triggerPopup) {
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
            }
            seenNotificationIds.current.add(notification.id);
          }
        })
        .catch(() => undefined);
    };

    if (!unreadInitialized.current) {
      unreadInitialized.current = true;
      prevUnread.current = unread;
      // Mark historical existing unread notices as seen without triggering popup
      if (unread > 0) inspectFeed(false);
      return;
    }

    if (prevUnread.current !== null && unread <= prevUnread.current) {
      prevUnread.current = unread;
      return;
    }
    prevUnread.current = unread;
    inspectFeed(true);
  }, [
    enabled,
    queryClient,
    showInvitation,
    unreadQuery.data,
    unreadQuery.dataUpdatedAt,
    unreadQuery.isSuccess,
  ]);

  if (booking === null) return null;

  return (
    <BookingPopupWithSound
      alertSound={alertSound}
      booking={booking}
      onClose={closeBooking}
      onStopSound={stopAlertSound}
    />
  );
}

function BookingPopupWithSound({
  alertSound,
  booking,
  onClose,
  onStopSound,
}: {
  alertSound: boolean;
  booking: LiveBooking;
  onClose: () => void;
  onStopSound: () => void;
}) {
  useBookingAlertSound(alertSound);

  const soundProps = {
    onUserAction: onStopSound,
    onClose,
  };

  if (booking.kind === "offer") {
    return <OfferBookingPopup booking={booking} {...soundProps} />;
  }

  return <InvitationBookingPopup booking={booking} {...soundProps} />;
}
