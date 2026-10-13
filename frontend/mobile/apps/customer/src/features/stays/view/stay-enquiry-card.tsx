import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  Calendar,
  Clock,
  MessageSquare,
  Phone,
} from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import {
  formatPaise,
  formatPhone,
  getEnquiryStatusBadge,
  pricePeriodOf,
  stayLengthLabel,
  type StayEnquiry,
} from "../model";
import { formatReadableDate } from "../pickup-time";
import { canCancelStayEnquiry, cancelStayEnquiry } from "../queries";

interface StayEnquiryCardProps {
  enquiry: StayEnquiry;
}

export function StayEnquiryCard({ enquiry }: StayEnquiryCardProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const statusInfo = getEnquiryStatusBadge(enquiry.status);
  const cancellable = canCancelStayEnquiry(enquiry.status);
  const propObj = typeof enquiry.property === "object" ? enquiry.property : undefined;
  const period = pricePeriodOf(enquiry.price_period || propObj?.price_period);

  const hostPhone =
    enquiry.host_phone ||
    propObj?.partner?.phone_number ||
    (propObj as any)?.partner?.phone;
  const hostName =
    enquiry.host_name ||
    propObj?.host_name ||
    propObj?.partner?.full_name ||
    "Host";

  const cancel = useMutation({
    mutationFn: () => cancelStayEnquiry(enquiry.id),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
    },
  });

  const propertyTitle =
    enquiry.property_title || propObj?.title || "Stay Property";
  const unitName =
    enquiry.unit_name || enquiry.unit?.name || "Standard room";
  const guestCount = enquiry.guest_count ?? 1;

  const durationStr = enquiry.stay_length
    ? stayLengthLabel(enquiry.stay_length, period)
    : `${enquiry.nights ?? enquiry.length ?? 1} ${(enquiry.nights ?? enquiry.length ?? 1) === 1 ? "night" : "nights"}`;

  const targetSlugOrId =
    enquiry.property_slug ||
    propObj?.slug ||
    (typeof enquiry.property === "string" ? enquiry.property : propObj?.id);

  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xs">
      {/* Top Header: Badge, Property Title, and Estimate Box */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Badge tone={statusInfo.tone} className="self-start">
            <Text className="text-[10px] font-bold">{statusInfo.label}</Text>
          </Badge>

          <Pressable
            onPress={() => {
              if (targetSlugOrId) {
                router.push(`/stays/${targetSlugOrId}` as never);
              }
            }}
          >
            <Text className="mt-1 text-base font-extrabold text-navy-900">
              {propertyTitle}
            </Text>
          </Pressable>

          <Text className="text-xs text-text-secondary">
            Room: <Text className="font-bold text-navy-900">{unitName}</Text> ·{" "}
            {guestCount} Guest{guestCount === 1 ? "" : "s"}
          </Text>
        </View>

        {/* Estimate Box */}
        <View className="items-end rounded-xl border border-line/60 bg-surface-sunken p-2.5 min-w-[90px]">
          <Text className="text-[10px] text-text-secondary">Estimate</Text>
          <Text className="text-sm font-black text-brand">
            {formatPaise(enquiry.total_quote_paise ?? 0)}
          </Text>
          <Text className="text-[10px] text-text-muted">{durationStr}</Text>
        </View>
      </View>

      {/* Dates Section */}
      <View className="mt-3 flex-row flex-wrap items-center justify-between border-t border-line/60 pt-3 gap-2">
        <View className="flex-row items-center gap-1.5">
          <Calendar size={13} color="#ea580c" />
          <Text className="text-xs text-text-secondary">
            Stay:{" "}
            <Text className="font-bold text-navy-900">
              {formatReadableDate(enquiry.check_in)}
            </Text>
            {enquiry.check_out ? (
              <>
                {" to "}
                <Text className="font-bold text-navy-900">
                  {formatReadableDate(enquiry.check_out)}
                </Text>
              </>
            ) : null}
          </Text>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Clock size={13} color="#6B6560" />
          <Text className="text-xs text-text-muted">
            Submitted:{" "}
            <Text className="font-medium text-navy-900">
              {enquiry.created_at ? formatReadableDate(enquiry.created_at) : "Recent"}
            </Text>
          </Text>
        </View>
      </View>

      {/* Guest Note */}
      {enquiry.message ? (
        <View className="mt-3 rounded-xl bg-surface-sunken p-2.5">
          <Text className="text-[11px] text-text-secondary">
            <Text className="font-semibold text-navy-900">Your note: </Text>
            {enquiry.message}
          </Text>
        </View>
      ) : null}

      {/* Host Response Message Banner */}
      {enquiry.host_response ? (
        <View className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3">
          <View className="flex-row items-center gap-1.5">
            <MessageSquare size={13} color="#059669" />
            <Text className="text-xs font-bold text-emerald-950">
              Host Message (
              {enquiry.responded_at
                ? formatReadableDate(enquiry.responded_at)
                : "Recently"}
              ):
            </Text>
          </View>
          <Text className="mt-1 text-xs leading-relaxed text-emerald-900">
            {enquiry.host_response}
          </Text>
        </View>
      ) : enquiry.status === "SUBMITTED" && !hostPhone ? (
        <View className="mt-3 flex-row items-center gap-1.5 rounded-xl bg-surface-sunken p-2.5">
          <Clock size={13} color="#6B6560" />
          <Text className="text-[11px] text-text-secondary">
            The owner will call you shortly to discuss availability.
          </Text>
        </View>
      ) : null}

      {/* Owner Contact Banner (Tap-to-call) */}
      {hostPhone ? (
        <View className="mt-3 rounded-xl border border-line bg-surface-sunken p-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-bold text-navy-900">{hostName}</Text>
              <Text className="text-[10px] text-text-secondary">Property Host</Text>
            </View>
            <Pressable
              onPress={() => Linking.openURL(`tel:${hostPhone}`)}
              className="flex-row items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 active:bg-emerald-700"
            >
              <Phone size={12} color="#ffffff" />
              <Text className="text-xs font-bold text-white">
                Call {formatPhone(hostPhone)}
              </Text>
            </Pressable>
          </View>
          <Text className="mt-2 text-[10px] text-text-muted">
            Direct owner contact · Discuss room, move-in, and deposits directly.
          </Text>
        </View>
      ) : null}

      {/* Two-step Cancellation / Withdraw */}
      {cancellable ? (
        <View className="mt-3 border-t border-line/60 pt-3">
          {confirming ? (
            <View className="gap-2 rounded-xl bg-danger/5 p-3 border border-danger/20">
              <Text className="text-xs font-bold text-danger">
                Withdraw this enquiry?
              </Text>
              <Text className="text-[11px] text-text-secondary">
                The host will be notified that you are no longer seeking this stay.
              </Text>
              <View className="flex-row gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={cancel.isPending}
                  onPress={() => setConfirming(false)}
                  className="flex-1 rounded-lg"
                >
                  Keep enquiry
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
                Withdraw enquiry
              </Button>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
