import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Text } from "@vsolve/mobile-ui";
import { Calendar, CheckCircle2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { formatPaise, type StayReservation } from "../model";
import { formatReadableDate } from "../pickup-time";
import { canCancelStayReservation, cancelStayReservation } from "../queries";

interface StayReservationCardProps {
  reservation: StayReservation;
}

export function StayReservationCard({ reservation }: StayReservationCardProps) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const getBadgeTone = (): "success" | "warning" | "danger" | "neutral" => {
    switch (reservation.status) {
      case "CONFIRMED":
      case "CHECKED_IN":
      case "CHECKED_OUT":
        return "success";
      case "PAYMENT_PENDING":
        return "warning";
      case "CANCELLED":
      case "NO_SHOW":
        return "danger";
      default:
        return "neutral";
    }
  };

  const getLabel = () => {
    switch (reservation.status) {
      case "CONFIRMED":
        return "Confirmed";
      case "CHECKED_IN":
        return "Checked In";
      case "CHECKED_OUT":
        return "Checked Out";
      case "PAYMENT_PENDING":
        return "Payment Pending";
      case "CANCELLED":
        return "Cancelled";
      case "NO_SHOW":
        return "No Show";
      default:
        return (reservation.status ?? "Held").replace("_", " ");
    }
  };

  const cancellable = canCancelStayReservation(reservation.status);

  const cancel = useMutation({
    mutationFn: () => cancelStayReservation(reservation.id),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["my-stay-reservations"] });
    },
  });

  const propertyTitle = reservation.property_title || "Stay Property";
  const unitName = reservation.unit_name || "Standard room";
  const guestCount = reservation.guest_count ?? 1;

  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xs">
      {/* Top Header */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Badge tone={getBadgeTone()} className="self-start">
            <Text className="text-[10px] font-bold uppercase tracking-wide">
              {getLabel()}
            </Text>
          </Badge>

          <Text className="mt-1 text-base font-extrabold text-navy-900">
            {propertyTitle}
          </Text>

          <Text className="text-xs text-text-secondary">
            Room: <Text className="font-bold text-navy-900">{unitName}</Text> ·{" "}
            {guestCount} Guest{guestCount === 1 ? "" : "s"}
          </Text>
        </View>

        {/* Paid Amount */}
        <View className="items-end rounded-xl border border-line/60 bg-surface-sunken p-2.5 min-w-[90px]">
          <Text className="text-[10px] text-text-secondary">Paid Amount</Text>
          <Text className="text-sm font-black text-brand">
            {formatPaise(reservation.total_paise ?? 0)}
          </Text>
          <Text className="text-[10px] text-text-muted">
            {reservation.nights ?? 1} night{(reservation.nights ?? 1) === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      {/* Dates Section */}
      <View className="mt-3 flex-row flex-wrap items-center justify-between border-t border-line/60 pt-3 gap-2">
        <View className="flex-row items-center gap-1.5">
          <Calendar size={13} color="#ea580c" />
          <Text className="text-xs text-text-secondary">
            Stay:{" "}
            <Text className="font-bold text-navy-900">
              {formatReadableDate(reservation.check_in)}
            </Text>
            {reservation.check_out ? (
              <>
                {" to "}
                <Text className="font-bold text-navy-900">
                  {formatReadableDate(reservation.check_out)}
                </Text>
              </>
            ) : null}
          </Text>
        </View>

        <View className="flex-row items-center gap-1.5">
          <CheckCircle2 size={13} color="#059669" />
          <Text className="text-xs text-text-muted">
            Reserved:{" "}
            <Text className="font-medium text-navy-900">
              {reservation.created_at ? formatReadableDate(reservation.created_at) : "Recent"}
            </Text>
          </Text>
        </View>
      </View>

      {/* Cancellation section */}
      {cancellable ? (
        <View className="mt-3 border-t border-line/60 pt-3">
          {confirming ? (
            <View className="gap-2 rounded-xl bg-danger/5 p-3 border border-danger/20">
              <Text className="text-xs font-bold text-danger">
                Cancel before check-in?
              </Text>
              <Text className="text-[11px] text-text-secondary">
                If payment was captured, a full refund will be requested.
              </Text>
              <View className="flex-row gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={cancel.isPending}
                  onPress={() => setConfirming(false)}
                  className="flex-1 rounded-lg"
                >
                  Keep reservation
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={cancel.isPending}
                  onPress={() => cancel.mutate()}
                  className="flex-1 rounded-lg"
                >
                  {cancel.isPending ? "Cancelling…" : "Confirm cancel"}
                </Button>
              </View>
            </View>
          ) : (
            <View className="flex-row justify-end">
              <Button
                size="sm"
                variant="ghost"
                onPress={() => setConfirming(true)}
                className="text-danger"
              >
                Cancel reservation
              </Button>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
