"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, ChoiceChips, Field, Input, formatDateTime, formatMoney } from "@vsolve/ui";
import { Phone, Truck } from "lucide-react";
import { useState } from "react";

import {
  fetchTransportFeePercent,
  partnerRentalTransportAction,
  type PartnerRentalBooking,
  type TransportTrip,
} from "@/features/rentals/queries";

const TRIP_LABELS: Record<string, string> = {
  ONE_WAY: "Drop only",
  ROUND_TRIP: "Drop and collect",
};

const STEP_LABELS: Record<string, string> = {
  REQUESTED: "Waiting for your price",
  QUOTED: "Price sent — waiting for the customer",
  ACCEPTED: "Price accepted",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

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

  return (
    <section className="flex flex-col gap-2" data-testid="delivery-section">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
          <Truck className="size-3.5" aria-hidden />
          Delivery request
        </h3>
        <Badge tone={status === "DECLINED" || status === "EXPIRED" ? "danger" : status === "DELIVERED" ? "success" : "warning"}>
          {STEP_LABELS[status] ?? status}
        </Badge>
      </div>

      <div className="rounded-card border border-line bg-surface-sunken p-3 text-sm">
        <p className="font-semibold text-navy-900">Deliver to</p>
        <p className="mt-0.5 text-text-secondary">
          {[address.line, address.area, address.city].filter(Boolean).join(", ")}
          {address.pincode ? ` ${address.pincode}` : ""}
        </p>
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
          <p className="mt-1.5 text-xs text-text-secondary">Customer&rsquo;s note: {transport.customer_note}</p>
        ) : null}
        {transport.reject_note && status === "REQUESTED" ? (
          <p className="mt-1.5 text-xs text-warning-text">
            The customer turned down your last price: &ldquo;{transport.reject_note}&rdquo;
          </p>
        ) : null}
      </div>

      {canQuote ? (
        <div className="flex flex-col gap-3 rounded-card border border-line p-3">
          <p className="text-xs text-text-secondary">
            Check the requirement, arrange a vehicle and send your transport price by{" "}
            <strong className="text-navy-900">{formatDateTime(transport.respond_by)}</strong>.{" "}
            {quotesLeft < transport.max_quotes ? `${quotesLeft} price ${quotesLeft === 1 ? "try" : "tries"} left.` : ""}
          </p>
          <Field label="Transport price" required>
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
                placeholder="e.g. 750"
              />
            </div>
          </Field>
          <p className="text-xs font-semibold text-success-text" data-testid="transport-commission">
            Transport commission: {percent}% —{" "}
            {typedPaise
              ? percent === 0
                ? `you receive the full ${formatMoney(typedPaise)}.`
                : `you receive ${formatMoney(transportPayout(typedPaise, percent))}.`
              : "you receive the full transport price."}
          </p>
          <ChoiceChips
            label="What does the price cover?"
            name={`transport-trip-${booking.id}`}
            layout="bar"
            value={trip}
            onChange={(value) => setTrip(value === "ROUND_TRIP" ? "ROUND_TRIP" : "ONE_WAY")}
            options={[
              { value: "ONE_WAY", label: "Drop only" },
              { value: "ROUND_TRIP", label: "Drop and collect" },
            ]}
          />
          <Field label="Note for the customer" showOptional={false}>
            <Input
              id={`transport-note-${booking.id}`}
              value={note}
              maxLength={480}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Tata Ace, delivered by 10 AM"
            />
          </Field>
          {declining ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => setDeclining(false)}>
                Back
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "decline" })}
              >
                Decline delivery
              </Button>
              <p className="w-full text-xs text-text-secondary">
                The customer isn&rsquo;t charged and can collect it themselves instead. The note above
                is sent as your reason.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={act.isPending}
                onClick={() => {
                  if (!typedPaise) return setError("Enter the transport price in rupees, for example 750.");
                  act.mutate({ action: "quote", amount_paise: typedPaise });
                }}
              >
                Send price
              </Button>
              <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => setDeclining(true)}>
                Can&rsquo;t deliver
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {status === "QUOTED" && transport.quote_paise ? (
        <p className="text-sm text-text-secondary">
          You quoted <strong className="text-navy-900">{formatMoney(transport.quote_paise)}</strong>
          {transport.trip ? ` (${TRIP_LABELS[transport.trip] ?? transport.trip})` : ""}. The customer
          has until {formatDateTime(transport.respond_by)} to accept. 0% commission on transport.
        </p>
      ) : null}

      {agreed > 0 ? (
        <p className="text-sm text-text-secondary" data-testid="transport-agreed">
          Agreed transport: <strong className="text-navy-900">{formatMoney(agreed)}</strong>
          {transport.trip ? ` (${TRIP_LABELS[transport.trip] ?? transport.trip})` : ""} · {booking.transport_fee_percent ?? 0}%
          commission — you receive {formatMoney(agreed - (booking.transport_fee_paise ?? 0))}.
        </p>
      ) : null}

      {booking.status === "CONFIRMED" && status === "ACCEPTED" ? (
        <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ action: "out-for-delivery" })}>
          Mark out for delivery
        </Button>
      ) : null}
      {booking.status === "CONFIRMED" && (status === "ACCEPTED" || status === "OUT_FOR_DELIVERY") ? (
        <p className="text-xs text-text-secondary">
          At the door, ask the customer for their handover PIN and use Handover. That starts the rental.
        </p>
      ) : null}
      {booking.status === "PENDING_PAYMENT" && status === "ACCEPTED" ? (
        <p className="text-xs text-text-secondary">The customer accepted your price and is paying now.</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
