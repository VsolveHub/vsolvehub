"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, ChoiceChips, Field, Input, formatDateTime, formatMoney, useT } from "@vsolve/ui";
import { Navigation, Phone, Truck } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  fetchTransportFeePercent,
  partnerRentalTransportAction,
  type PartnerRentalBooking,
  type TransportTrip,
} from "@/features/rentals/queries";

/** Catalogue keys — resolved with `t` at render time. */
const TRIP_LABELS: Record<string, string> = {
  ONE_WAY: "rentals.delivery.trip.oneWay",
  ROUND_TRIP: "rentals.delivery.trip.roundTrip",
};

/** Catalogue keys — resolved with `t` at render time. */
const STEP_LABELS: Record<string, string> = {
  REQUESTED: "rentals.delivery.step.requested",
  QUOTED: "rentals.delivery.step.quoted",
  ACCEPTED: "rentals.delivery.step.accepted",
  OUT_FOR_DELIVERY: "rentals.delivery.step.outForDelivery",
  DELIVERED: "rentals.delivery.step.delivered",
  DECLINED: "rentals.delivery.step.declined",
  EXPIRED: "rentals.delivery.step.expired",
  CANCELLED: "rentals.delivery.step.cancelled",
};

/** Puts `node` where `{slot}` sits in a translated sentence, so emphasis survives word order. */
function withSlot(text: string, slot: string, node: ReactNode): ReactNode {
  const [before, after = ""] = text.split(`{${slot}}`);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "").replace(/^₹\s*/u, "");
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const paise = Math.round(Number(trimmed) * 100);
  return paise > 0 ? paise : null;
}

/** What the owner keeps of a transport price. The rate comes from the server (0% today). */
export function transportPayout(quotePaise: number, feePercent: number): number {
  return quotePaise - Math.floor((quotePaise * feePercent) / 100);
}

type Address = { line?: string; area?: string; city?: string; pincode?: string; contact_phone?: string };

/**
 * The owner's side of a delivery request: where it goes, the price form, and the next step.
 *
 * The platform never prices transport. The owner checks the request, arranges a vehicle and
 * quotes; nothing is charged to the customer until they accept, and then rent, deposit and
 * transport are paid together. Transport carries no commission, which this panel says
 * wherever a transport amount appears.
 */
export function DeliverySection({ booking }: { booking: PartnerRentalBooking }) {
  const t = useT();
  const qc = useQueryClient();
  const transport = booking.transport;
  const [amount, setAmount] = useState("");
  const [trip, setTrip] = useState<TransportTrip>("ONE_WAY");
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feePercent = useQuery({
    queryKey: ["partner-rentals", "transport-fee"],
    queryFn: fetchTransportFeePercent,
    staleTime: 60_000,
  });
  const percent = booking.transport_fee_percent ?? feePercent.data ?? 0;

  const act = useMutation({
    mutationFn: (input: { action: "quote" | "decline" | "out-for-delivery"; amount_paise?: number }) =>
      partnerRentalTransportAction(booking.id, input.action, {
        amount_paise: input.amount_paise,
        trip,
        note,
      }),
    onSuccess: () => {
      setAmount("");
      setNote("");
      setDeclining(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["partner-rentals"] });
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  if (!transport) return null;
  const address = (booking.delivery_address ?? {}) as Address;
  const status = transport.status;
  const canQuote = booking.status === "AWAITING_TRANSPORT_QUOTE" && status === "REQUESTED";
  const quotesLeft = transport.max_quotes - transport.quote_count;
  const typedPaise = rupeesToPaise(amount);
  const agreed = booking.transport_paise ?? 0;
  const tripLabel = (value: string) => (TRIP_LABELS[value] ? t(TRIP_LABELS[value]!) : value);
  const tripSuffix = transport.trip ? ` (${tripLabel(transport.trip)})` : "";

  return (
    <section className="flex flex-col gap-2" data-testid="delivery-section">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
          <Truck className="size-3.5" aria-hidden />
          {t("rentals.delivery.heading")}
        </h3>
        <Badge tone={status === "DECLINED" || status === "EXPIRED" ? "danger" : status === "DELIVERED" ? "success" : "warning"}>
          {STEP_LABELS[status] ? t(STEP_LABELS[status]!) : status}
        </Badge>
      </div>

      <div className="rounded-card border border-line bg-surface-sunken p-3 text-sm">
        <p className="font-semibold text-navy-900">{t("rentals.delivery.deliverTo")}</p>
        <p className="mt-0.5 text-text-secondary">
          {[address.line, address.area, address.city].filter(Boolean).join(", ")}
          {address.pincode ? ` ${address.pincode}` : ""}
        </p>
        {/* The server's route to the customer's pin: the maps app on a phone. Absent when the
            address has no pin, and then the text above is the destination. */}
        {booking.delivery_directions_url ? (
          <a
            href={booking.delivery_directions_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 mr-4 inline-flex items-center gap-1 text-xs font-semibold text-text-link"
          >
            <Navigation className="size-3.5" aria-hidden />
            {t("rentals.delivery.openRoute")}
          </a>
        ) : null}
        {address.contact_phone ? (
          <a
            href={`tel:${address.contact_phone}`}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-text-link"
          >
            <Phone className="size-3.5" aria-hidden />
            {address.contact_phone}
          </a>
        ) : null}
        {transport.customer_note ? (
          <p className="mt-1.5 text-xs text-text-secondary">{t("rentals.delivery.customerNote", { note: transport.customer_note })}</p>
        ) : null}
        {transport.reject_note && status === "REQUESTED" ? (
          <p className="mt-1.5 text-xs text-warning-text">
            {t("rentals.delivery.rejectNote", { note: transport.reject_note })}
          </p>
        ) : null}
      </div>

      {canQuote ? (
        <div className="flex flex-col gap-3 rounded-card border border-line p-3">
          <p className="text-xs text-text-secondary">
            {withSlot(
              t("rentals.delivery.quoteIntro"),
              "date",
              <strong className="text-navy-900">{formatDateTime(transport.respond_by)}</strong>,
            )}{" "}
            {quotesLeft < transport.max_quotes ? t("rentals.delivery.triesLeft", { count: quotesLeft }) : ""}
          </p>
          <Field label={t("rentals.delivery.priceLabel")} required>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
                ₹
              </span>
              <Input
                id={`transport-amount-${booking.id}`}
                className="pl-8"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("rentals.delivery.pricePlaceholder")}
              />
            </div>
          </Field>
          <p className="text-xs font-semibold text-success-text" data-testid="transport-commission">
            {t("rentals.delivery.commissionPrefix", { percent })}{" "}
            {typedPaise
              ? percent === 0
                ? t("rentals.delivery.receiveFull", { amount: formatMoney(typedPaise) })
                : t("rentals.delivery.receiveAmount", { amount: formatMoney(transportPayout(typedPaise, percent)) })
              : t("rentals.delivery.receiveFullPrice")}
          </p>
          <ChoiceChips
            label={t("rentals.delivery.tripQuestion")}
            name={`transport-trip-${booking.id}`}
            layout="bar"
            value={trip}
            onChange={(value) => setTrip(value === "ROUND_TRIP" ? "ROUND_TRIP" : "ONE_WAY")}
            options={[
              { value: "ONE_WAY", label: t("rentals.delivery.trip.oneWay") },
              { value: "ROUND_TRIP", label: t("rentals.delivery.trip.roundTrip") },
            ]}
          />
          <Field label={t("rentals.delivery.noteLabel")} showOptional={false}>
            <Input
              id={`transport-note-${booking.id}`}
              value={note}
              maxLength={480}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("rentals.delivery.notePlaceholder")}
            />
          </Field>
          {declining ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => setDeclining(false)}>
                {t("common.back")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "decline" })}
              >
                {t("rentals.delivery.decline")}
              </Button>
              <p className="w-full text-xs text-text-secondary">
                {t("rentals.delivery.declineHint")}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={act.isPending}
                onClick={() => {
                  if (!typedPaise) return setError(t("rentals.delivery.errorPrice"));
                  act.mutate({ action: "quote", amount_paise: typedPaise });
                }}
              >
                {t("rentals.delivery.sendPrice")}
              </Button>
              <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => setDeclining(true)}>
                {t("rentals.delivery.cantDeliver")}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {status === "QUOTED" && transport.quote_paise ? (
        <p className="text-sm text-text-secondary">
          {withSlot(
            t("rentals.delivery.quoted", { trip: tripSuffix, date: formatDateTime(transport.respond_by) }),
            "amount",
            <strong className="text-navy-900">{formatMoney(transport.quote_paise)}</strong>,
          )}
        </p>
      ) : null}

      {agreed > 0 ? (
        <p className="text-sm text-text-secondary" data-testid="transport-agreed">
          {withSlot(
            t("rentals.delivery.agreed", {
              trip: tripSuffix,
              percent: booking.transport_fee_percent ?? 0,
              payout: formatMoney(agreed - (booking.transport_fee_paise ?? 0)),
            }),
            "amount",
            <strong className="text-navy-900">{formatMoney(agreed)}</strong>,
          )}
        </p>
      ) : null}

      {booking.status === "CONFIRMED" && status === "ACCEPTED" ? (
        <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ action: "out-for-delivery" })}>
          {t("rentals.delivery.markOut")}
        </Button>
      ) : null}
      {booking.status === "CONFIRMED" && (status === "ACCEPTED" || status === "OUT_FOR_DELIVERY") ? (
        <p className="text-xs text-text-secondary">
          {t("rentals.delivery.atTheDoor")}
        </p>
      ) : null}
      {booking.status === "PENDING_PAYMENT" && status === "ACCEPTED" ? (
        <p className="text-xs text-text-secondary">{t("rentals.delivery.paying")}</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
