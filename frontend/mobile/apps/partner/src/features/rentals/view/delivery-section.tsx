import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, COLOR_TOKENS, Input, Text, useT } from "@vsolve/mobile-ui";
import { Navigation, Phone, Truck } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, View } from "react-native";

import {
  fetchTransportFeePercent,
  partnerRentalTransportAction,
} from "../queries";
import { formatPaise, type PartnerRentalBooking, type TransportTrip } from "../model";

const TRIP_LABELS: Record<string, string> = {
  ONE_WAY: "rentals.delivery.trip.oneWay",
  ROUND_TRIP: "rentals.delivery.trip.roundTrip",
};

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

function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "").replace(/^₹\s*/u, "");
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const paise = Math.round(Number(trimmed) * 100);
  return paise > 0 ? paise : null;
}

export function transportPayout(quotePaise: number, feePercent: number): number {
  return quotePaise - Math.floor((quotePaise * feePercent) / 100);
}

export function DeliverySection({ booking }: { booking: PartnerRentalBooking }) {
  const t = useT();
  const qc = useQueryClient();
  const transport = booking.transport;

  const [amount, setAmount] = useState("");
  const [trip, setTrip] = useState<TransportTrip>("ONE_WAY");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const feePercent = useQuery({
    queryKey: ["partner-rentals", "transport-fee"],
    queryFn: fetchTransportFeePercent,
    staleTime: 60_000,
  });
  const percent = booking.transport_fee_percent ?? feePercent.data ?? 0;

  const act = useMutation({
    mutationFn: (input: {
      action: "quote" | "decline" | "out-for-delivery";
      amount_paise?: number;
    }) =>
      partnerRentalTransportAction(booking.id, input.action, {
        amount_paise: input.amount_paise,
        trip,
        note,
      }),
    onSuccess: () => {
      setAmount("");
      setNote("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["partner-rental-bookings"] });
      void qc.invalidateQueries({ queryKey: ["partner-rentals"] });
      Alert.alert(t("common.success"), t("rentals.delivery.statusUpdated"));
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : t("rentals.delivery.actionFailed"));
    },
  });

  if (!transport) return null;

  const address = booking.delivery_address ?? {};
  const status = transport.status;
  const canQuote = booking.status === "AWAITING_TRANSPORT_QUOTE" && status === "REQUESTED";
  const quotesLeft = transport.max_quotes - transport.quote_count;
  const typedPaise = rupeesToPaise(amount);
  const agreed = booking.transport_paise ?? 0;
  const tripLabel = (value: string) => (TRIP_LABELS[value] ? t(TRIP_LABELS[value]!) : value);
  const tripSuffix = transport.trip ? ` (${tripLabel(transport.trip)})` : "";

  const handleOpenRoute = () => {
    if (booking.delivery_directions_url) {
      void Linking.openURL(booking.delivery_directions_url);
    }
  };

  const handleCall = () => {
    if (address.contact_phone) {
      void Linking.openURL(`tel:${address.contact_phone}`);
    }
  };

  const handleSendQuote = () => {
    setError(null);
    if (!typedPaise) {
      setError(t("rentals.delivery.priceRequired"));
      return;
    }
    act.mutate({ action: "quote", amount_paise: typedPaise });
  };

  const handleDecline = () => {
    Alert.alert(
      t("rentals.delivery.declineConfirmTitle"),
      t("rentals.delivery.declineConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("rentals.delivery.declineAction"),
          style: "destructive",
          onPress: () => act.mutate({ action: "decline" }),
        },
      ],
    );
  };

  return (
    <View className="gap-2.5 rounded-2xl border border-line bg-surface p-3.5 shadow-xs">
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Truck size={15} color={COLOR_TOKENS.action} />
          <Text className="text-xs font-bold uppercase tracking-wider text-navy-900">
            {t("rentals.delivery.heading")}
          </Text>
        </View>
        <Badge
          tone={
            status === "DECLINED" || status === "EXPIRED"
              ? "danger"
              : status === "DELIVERED"
                ? "success"
                : "warning"
          }
        >
          {STEP_LABELS[status] ? t(STEP_LABELS[status]!) : status}
        </Badge>
      </View>

      {/* Deliver To Details */}
      <View className="rounded-xl border border-line bg-surface-muted p-3 gap-1">
        <Text className="text-xs font-bold text-navy-900">{t("rentals.delivery.deliverTo")}</Text>
        <Text className="text-xs text-text-secondary">
          {[address.line, address.area, address.city].filter(Boolean).join(", ")}
          {address.pincode ? ` ${address.pincode}` : ""}
        </Text>

        <View className="flex-row flex-wrap items-center gap-3 pt-1.5">
          {booking.delivery_directions_url ? (
            <Pressable
              onPress={handleOpenRoute}
              className="flex-row items-center gap-1 rounded bg-brand/10 px-2 py-1"
            >
              <Navigation size={12} color={COLOR_TOKENS.action} />
              <Text className="text-xs font-semibold text-brand">
                {t("rentals.delivery.openRoute")}
              </Text>
            </Pressable>
          ) : null}

          {address.contact_phone ? (
            <Pressable
              onPress={handleCall}
              className="flex-row items-center gap-1 rounded bg-emerald-50 px-2 py-1 border border-emerald-200"
            >
              <Phone size={12} color={COLOR_TOKENS.success} />
              <Text className="text-xs font-semibold text-emerald-800">
                {address.contact_phone}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {transport.customer_note ? (
          <Text className="mt-1 text-[11px] text-text-muted italic">
            {t("rentals.delivery.customerNote", { note: transport.customer_note })}
          </Text>
        ) : null}

        {transport.reject_note && status === "REQUESTED" ? (
          <Text className="mt-1 text-[11px] font-semibold text-amber-800">
            {t("rentals.delivery.rejectNote", { note: transport.reject_note })}
          </Text>
        ) : null}
      </View>

      {/* Agreed amount if already accepted */}
      {agreed > 0 ? (
        <View className="flex-row items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
          <Text className="text-xs font-semibold text-emerald-900">
            {t("rentals.delivery.agreedPrice")}{tripSuffix}
          </Text>
          <Text className="text-xs font-bold text-emerald-950">
            {formatPaise(agreed)}
          </Text>
        </View>
      ) : null}

      {/* Out for delivery action */}
      {status === "ACCEPTED" ? (
        <Button
          variant="primary"
          disabled={act.isPending}
          onPress={() => act.mutate({ action: "out-for-delivery" })}
          className="mt-1 h-10"
        >
          {act.isPending ? (
            <ActivityIndicator size="small" color={COLOR_TOKENS.white} />
          ) : (
            <Text className="text-xs font-bold text-white">
              {t("rentals.delivery.outForDeliveryAction")}
            </Text>
          )}
        </Button>
      ) : null}

      {/* Quote Form */}
      {canQuote ? (
        <View className="gap-3 rounded-xl border border-line bg-surface p-3">
          <Text className="text-xs text-text-secondary">
            {t("rentals.delivery.quoteIntro")}{" "}
            {quotesLeft < transport.max_quotes
              ? t("rentals.delivery.triesLeft", { count: quotesLeft })
              : ""}
          </Text>

          {/* Amount Input */}
          <View className="gap-1">
            <Text className="text-xs font-bold text-navy-900">
              {t("rentals.delivery.priceLabel")} *
            </Text>
            <View className="relative">
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder={t("rentals.delivery.pricePlaceholder")}
                keyboardType="numeric"
                className="h-10 text-sm"
              />
            </View>
          </View>

          {/* 0% Commission Line */}
          <Text className="text-xs font-semibold text-emerald-700">
            {t("rentals.delivery.commissionPrefix", { percent })}{" "}
            {typedPaise
              ? percent === 0
                ? t("rentals.delivery.receiveFull", { amount: formatPaise(typedPaise) })
                : t("rentals.delivery.receiveAmount", {
                    amount: formatPaise(transportPayout(typedPaise, percent)),
                  })
              : t("rentals.delivery.receiveFullPrice")}
          </Text>

          {/* Trip Selector */}
          <View className="gap-1.5">
            <Text className="text-xs font-bold text-navy-900">
              {t("rentals.delivery.tripQuestion")}
            </Text>
            <View className="flex-row gap-2">
              {(["ONE_WAY", "ROUND_TRIP"] as const).map((mode) => {
                const on = trip === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setTrip(mode)}
                    className={`flex-1 items-center justify-center rounded-lg border py-2 ${
                      on
                        ? "border-navy-900 bg-navy-900"
                        : "border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        on ? "font-bold text-white" : "font-semibold text-navy-900"
                      }`}
                    >
                      {t(TRIP_LABELS[mode]!)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Optional Note */}
          <View className="gap-1">
            <Text className="text-xs font-bold text-navy-900">
              {t("rentals.delivery.noteLabel")}
            </Text>
            <Input
              value={note}
              onChangeText={setNote}
              placeholder={t("rentals.delivery.notePlaceholder")}
              className="h-9 text-xs"
            />
          </View>

          {error ? (
            <View className="rounded-lg bg-rose-50 border border-rose-200 p-2">
              <Text className="text-xs font-semibold text-rose-700">{error}</Text>
            </View>
          ) : null}

          {/* Action Buttons */}
          <View className="flex-row items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              disabled={act.isPending}
              onPress={handleDecline}
              className="h-9 px-3"
            >
              <Text className="text-xs font-bold text-rose-700">
                {t("rentals.delivery.declineAction")}
              </Text>
            </Button>
            <Button
              variant="primary"
              disabled={act.isPending}
              onPress={handleSendQuote}
              className="h-9 px-4 min-w-[100px] items-center justify-center"
            >
              {act.isPending ? (
                <ActivityIndicator size="small" color={COLOR_TOKENS.white} />
              ) : (
                <Text className="text-xs font-bold text-white">
                  {t("rentals.delivery.submitQuote")}
                </Text>
              )}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
