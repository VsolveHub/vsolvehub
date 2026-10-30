"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { describeError } from "@vsolve/query";
import { Badge, Button, Input, formatDateTime, useToast } from "@vsolve/ui";

import { completeOrOpenCheckout } from "../../payment/standalone-handoff";
import { formatPaise, type RentalBooking } from "../model";
import { TRANSPORT_TRIP_LABELS, transportStepLabel } from "../pickup";
import { rentalTransportAction } from "../queries";

const BUSINESS_NAME = "Vsolve Hub";

type Action = "accept" | "reject" | "switch-to-pickup";

/**
 * The customer's side of a delivery request.
 *
 * Nothing has been charged until the customer accepts the owner's transport price; accepting
 * opens one payment for rent, platform fee, deposit and transport. A declined or expired request
 * leaves two ways forward: switch to self pickup (and pay the pickup amount) or cancel.
 */
export function DeliveryRequest({ booking }: { booking: RentalBooking }) {
  const qc = useQueryClient();
  const toast = useToast();
  const transport = booking.transport;
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: ({ action, note: text }: { action: Action; note?: string }) =>
      rentalTransportAction(booking.id, action, text ?? ""),
    onSuccess: async (updated, { action }) => {
      setRejecting(false);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["my-rentals"] });
      if (action === "reject") {
        toast.notify("Sent back to the owner. They can send a new price.");
        return;
      }
      const attemptId = updated.deposit?.payment_attempt_id;
      if (!attemptId) return;
      try {
        const result = await completeOrOpenCheckout(String(attemptId), {
          businessName: BUSINESS_NAME,
          onAwaitingCapture: () =>
            toast.notify("Complete payment in Razorpay. Booking stays Pending until capture."),
        });
        if (result.mode === "simulated") toast.notify("Payment recorded.");
        else if (result.mode === "pending")
          toast.notify("Payment is still preparing — use Pay Now on this booking in a moment.");
        else toast.notify("Payment submitted. Waiting for capture.");
      } catch (err) {
        setError(describeError(err, "mutation").message);
      } finally {
        void qc.invalidateQueries({ queryKey: ["my-rentals"] });
      }
    },
    onError: (err) => setError(describeError(err, "mutation").message),
  });

  if (!transport) return null;
  const status = transport.status;
  const waitingForAnswer =
    booking.status === "AWAITING_TRANSPORT_QUOTE" && status === "QUOTED" && transport.quote_paise;
  const ended =
    booking.status === "AWAITING_TRANSPORT_QUOTE" && (status === "DECLINED" || status === "EXPIRED");
  const quote = transport.quote_paise ?? 0;
  // Before accepting, amount_due_paise has no transport in it yet.
  const totalWithTransport = (booking.amount_due_paise ?? 0) + quote;
  const address = booking.delivery_address as
    | { line?: string; area?: string; city?: string; pincode?: string; contact_phone?: string }
    | undefined;

  return (
    <div
      className="mt-4 rounded-control border border-line bg-surface-sunken p-3.5 text-xs"
      data-testid="delivery-request"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-bold text-text">
          <Truck className="size-4 text-action" aria-hidden />
          Delivery
        </p>
        <Badge tone={ended ? "danger" : status === "DELIVERED" ? "success" : "warning"}>
          {transportStepLabel(status)}
        </Badge>
      </div>

      {address?.line ? (
        <p className="mt-1.5 text-text-secondary">
          To: {[address.line, address.area, address.city].filter(Boolean).join(", ")}
          {address.pincode ? ` ${address.pincode}` : ""}
        </p>
      ) : null}

      {status === "REQUESTED" && booking.status === "AWAITING_TRANSPORT_QUOTE" ? (
        <p className="mt-2 text-text-secondary">
          The owner is checking your requirement and will send a transport price by{" "}
          <strong className="text-text">{formatDateTime(transport.respond_by)}</strong>. Nothing is
          charged until you accept it.
          {transport.reject_note ? ` You asked: “${transport.reject_note}”.` : ""}
        </p>
      ) : null}

      {quote > 0 && status !== "REQUESTED" ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-text">
            Transport price:{" "}
            <strong className="text-base font-extrabold text-action">{formatPaise(quote)}</strong>
            {transport.trip ? ` · ${TRANSPORT_TRIP_LABELS[transport.trip] ?? transport.trip}` : ""}
          </p>
          {transport.quote_note ? (
            <p className="text-text-secondary">Owner&rsquo;s note: {transport.quote_note}</p>
          ) : null}
        </div>
      ) : null}

      {waitingForAnswer ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-text-secondary">
            Accept to pay rent, deposit and transport together:{" "}
            <strong className="text-text">{formatPaise(totalWithTransport)}</strong>. Answer by{" "}
            {formatDateTime(transport.respond_by)}.
          </p>
          {rejecting ? (
            <div className="flex flex-col gap-2">
              <Input
                aria-label="Tell the owner why"
                placeholder="Optional: tell the owner why (e.g. too high)"
                value={note}
                maxLength={480}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>
                  Back
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={act.isPending}
                  onClick={() => act.mutate({ action: "reject", note })}
                >
                  Reject price
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={act.isPending}
                loadingLabel="Opening payment…"
                onClick={() => act.mutate({ action: "accept" })}
              >
                Accept &amp; pay {formatPaise(totalWithTransport)}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={act.isPending}
                onClick={() => setRejecting(true)}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {ended ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-text-secondary">
            {status === "DECLINED"
              ? "The owner can’t arrange transport for this booking."
              : "The delivery request ran out of time."}
            {transport.decline_reason ? ` “${transport.decline_reason}”` : ""} You haven&rsquo;t been
            charged. Collect it yourself instead, or cancel below.
          </p>
          <Button
            size="sm"
            loading={act.isPending}
            loadingLabel="Opening payment…"
            onClick={() => act.mutate({ action: "switch-to-pickup" })}
          >
            Switch to self pickup &amp; pay {formatPaise(booking.amount_due_paise ?? 0)}
          </Button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-danger-text">{error}</p> : null}
    </div>
  );
}
