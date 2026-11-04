import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Truck } from "lucide-react-native";
import { useState } from "react";
import { Alert, TextInput, View } from "react-native";

import { formatPaise, type RentalBooking } from "../model";
import { useCompleteOrOpenCheckout } from "@vsolve/mobile-core";
import { rentalTransportAction } from "../queries";

export const TRANSPORT_TRIP_LABELS: Record<string, string> = {
  ONE_WAY: "Drop only",
  ROUND_TRIP: "Drop and collect",
};

export function transportStepLabel(status: string | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "REQUESTED":
      return "Waiting for owner's price";
    case "QUOTED":
      return "Transport price received";
    case "ACCEPTED":
      return "Transport agreed";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERED":
      return "Delivered";
    case "DECLINED":
      return "Delivery declined";
    case "EXPIRED":
      return "Delivery request expired";
    case "CANCELLED":
      return "Delivery cancelled";
    default:
      return status ?? "";
  }
}

function formatDateTime(value: Date | string | number | undefined | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });
}

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
  const transport = booking.transport;
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const completeOrOpenCheckout = useCompleteOrOpenCheckout();
  const act = useMutation({
    mutationFn: ({ action, note: text }: { action: Action; note?: string }) =>
      rentalTransportAction(booking.id, action, text ?? ""),
    onSuccess: async (updated: any, { action }) => {
      setRejecting(false);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["my-rentals"] });
      if (action === "reject") {
        Alert.alert("Price Rejected", "Sent back to the owner. They can send a new price.");
        return;
      }
      const attemptId = updated?.deposit?.payment_attempt_id || booking.deposit?.payment_attempt_id;
      if (!attemptId) return;
      try {
        const result = await completeOrOpenCheckout(String(attemptId));
        if (result.mode === "pending") {
          Alert.alert("Payment Preparing", "Payment is still preparing — open My Rentals shortly to pay.");
        } else {
          Alert.alert("Payment Submitted", "Payment submitted. Waiting for Razorpay capture.");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not complete payment.");
      } finally {
        void qc.invalidateQueries({ queryKey: ["my-rentals"] });
      }
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to process transport request.");
    },
  });

  if (!transport) return null;
  const status = transport.status;
  const waitingForAnswer =
    booking.status === "AWAITING_TRANSPORT_QUOTE" && status === "QUOTED" && Boolean(transport.quote_paise);
  const ended =
    booking.status === "AWAITING_TRANSPORT_QUOTE" && (status === "DECLINED" || status === "EXPIRED");
  const quote = transport.quote_paise ?? 0;
  const totalWithTransport = (booking.amount_due_paise ?? 0) + quote;
  const address = booking.delivery_address as
    | { line?: string; area?: string; city?: string; pincode?: string; contact_phone?: string }
    | undefined;

  return (
    <View className="mt-3 rounded-xl border border-line bg-surface-sunken p-3.5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5">
          <Truck size={16} color={COLOR_TOKENS.action} />
          <Text className="text-xs font-bold text-navy-900">Delivery</Text>
        </View>
        <Badge tone={ended ? "danger" : status === "DELIVERED" ? "success" : "warning"}>
          {transportStepLabel(status)}
        </Badge>
      </View>

      {address?.line ? (
        <Text className="mt-1.5 text-xs text-text-secondary">
          To: {[address.line, address.area, address.city].filter(Boolean).join(", ")}
          {address.pincode ? ` ${address.pincode}` : ""}
        </Text>
      ) : null}

      {status === "REQUESTED" && booking.status === "AWAITING_TRANSPORT_QUOTE" ? (
        <Text className="mt-2 text-xs text-text-secondary leading-relaxed">
          The owner is checking your requirement and will send a transport price by{" "}
          <Text className="font-bold text-navy-900">{formatDateTime(transport.respond_by)}</Text>.
          Nothing is charged until you accept it.
          {transport.reject_note ? ` You asked: “${transport.reject_note}”.` : ""}
        </Text>
      ) : null}

      {quote > 0 && status !== "REQUESTED" ? (
        <View className="mt-2 flex-col gap-0.5">
          <Text className="text-xs text-navy-900">
            Transport price:{" "}
            <Text className="text-sm font-extrabold text-action tabular-nums">
              {formatPaise(quote)}
            </Text>
            {transport.trip ? ` · ${TRANSPORT_TRIP_LABELS[transport.trip] ?? transport.trip}` : ""}
          </Text>
          {transport.quote_note ? (
            <Text className="text-xs text-text-secondary">
              Owner&apos;s note: {transport.quote_note}
            </Text>
          ) : null}
        </View>
      ) : null}

      {waitingForAnswer ? (
        <View className="mt-3 flex-col gap-2">
          <Text className="text-xs text-text-secondary leading-relaxed">
            Accept to pay rent, deposit and transport together:{" "}
            <Text className="font-bold text-navy-900 tabular-nums">
              {formatPaise(totalWithTransport)}
            </Text>
            . Answer by {formatDateTime(transport.respond_by)}.
          </Text>

          {rejecting ? (
            <View className="flex-col gap-2">
              <TextInput
                accessibilityLabel="Tell the owner why"
                placeholder="Optional: tell the owner why (e.g. too high)"
                placeholderTextColor={COLOR_TOKENS.placeholderText}
                value={note}
                maxLength={480}
                onChangeText={setNote}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-xs text-navy-900"
              />
              <View className="flex-row items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => setRejecting(false)}
                  className="flex-1"
                >
                  <Text className="text-xs font-semibold text-text">Back</Text>
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={act.isPending}
                  onPress={() => act.mutate({ action: "reject", note })}
                  className="flex-1"
                >
                  <Text className="text-xs font-bold text-white">
                    {act.isPending ? "Rejecting…" : "Reject price"}
                  </Text>
                </Button>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={act.isPending}
                onPress={() => act.mutate({ action: "accept" })}
                className="flex-1"
              >
                <Text className="text-xs font-bold text-white tabular-nums">
                  {act.isPending ? "Opening payment…" : `Accept & pay ${formatPaise(totalWithTransport)}`}
                </Text>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={act.isPending}
                onPress={() => setRejecting(true)}
              >
                <Text className="text-xs font-semibold text-text">Reject</Text>
              </Button>
            </View>
          )}
        </View>
      ) : null}

      {ended ? (
        <View className="mt-3 flex-col gap-2">
          <Text className="text-xs text-text-secondary leading-relaxed">
            {status === "DECLINED"
              ? "The owner can’t arrange transport for this booking."
              : "The delivery request ran out of time."}
            {transport.decline_reason ? ` “${transport.decline_reason}”` : ""} You haven’t been
            charged. Collect it yourself instead, or cancel below.
          </Text>
          <Button
            size="sm"
            variant="primary"
            disabled={act.isPending}
            onPress={() => act.mutate({ action: "switch-to-pickup" })}
          >
            <Text className="text-xs font-bold text-white tabular-nums">
              {act.isPending
                ? "Opening payment…"
                : `Switch to self pickup & pay ${formatPaise(booking.amount_due_paise ?? 0)}`}
            </Text>
          </Button>
        </View>
      ) : null}

      {error ? <Text className="mt-2 text-xs text-rose-600">{error}</Text> : null}
    </View>
  );
}

