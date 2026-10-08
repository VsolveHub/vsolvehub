import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  CalendarClock,
  Phone,
  ShieldCheck,
} from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import {
  formatPhone,
  getVisitStatusBadge,
  visitDayLabel,
  visitWindowLabel,
  type StayVisit,
} from "../model";
import { canCancelStayVisit, cancelStayVisit } from "../queries";

export function StayVisitCard({ visit }: { visit: StayVisit }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const badge = getVisitStatusBadge(visit.status);
  const propertyTitle =
    visit.property_title || visit.property?.title || "Property Visit";
  const unitName = visit.unit_name || (visit.property as any)?.units?.[0]?.name;

  const startTime = visit.start_time || visit.slot?.start_time || "";
  const endTime = visit.end_time || visit.slot?.end_time || "";

  const hostPhone =
    visit.host_phone ||
    visit.property?.partner?.phone_number ||
    (visit.property as any)?.partner?.phone;
  const hostName =
    visit.host_name ||
    visit.property?.host_name ||
    visit.property?.partner?.full_name ||
    "Host";

  const cancel = useMutation({
    mutationFn: () => cancelStayVisit(visit.id),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["my-stay-visits"] });
    },
  });

  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xs">
      {/* Top Header */}
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Badge tone={badge.tone} className="self-start">
            <Text className="text-[10px] font-bold">{badge.label}</Text>
          </Badge>

          <Pressable
            onPress={() => {
              if (visit.property_slug || visit.property?.slug || visit.property?.id) {
                router.push(
                  `/stays/${visit.property_slug || visit.property?.slug || visit.property?.id}` as never,
                );
              }
            }}
          >
            <Text className="mt-1 text-base font-extrabold text-navy-900">
              {propertyTitle}
            </Text>
          </Pressable>

          {unitName ? (
            <Text className="text-xs text-text-secondary">
              Room: <Text className="font-bold text-navy-900">{unitName}</Text>
            </Text>
          ) : null}
        </View>

        {/* Date / Time Slot badge */}
        <View className="flex-row items-center gap-1.5 rounded-xl border border-line/60 bg-surface-sunken px-2.5 py-1.5">
          <CalendarClock size={13} color="#ea580c" />
          <Text className="text-[11px] font-bold text-navy-900">
            {visitDayLabel(visit.visit_date)}
            {startTime ? ` · ${visitWindowLabel(startTime, endTime)}` : ""}
          </Text>
        </View>
      </View>

      {/* Status Details */}
      <View className="mt-3 border-t border-line/60 pt-3 gap-2.5">
        {visit.status === "REQUESTED" ? (
          <Text className="text-xs text-text-secondary">
            Waiting for the owner to accept. You&apos;ll be notified once confirmed.
          </Text>
        ) : null}

        {/* REVEAL HOST PHONE ONLY AFTER ACCEPTED (W-024) */}
        {visit.status === "ACCEPTED" ? (
          <View className="gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
            <Text className="text-xs font-bold text-emerald-950">
              Your visit has been accepted. See you there!
            </Text>
            {hostPhone ? (
              <View className="flex-row items-center justify-between pt-1">
                <View>
                  <Text className="text-xs font-bold text-emerald-950">{hostName}</Text>
                  <Text className="text-[10px] text-emerald-800">Owner Contact</Text>
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
            ) : null}
          </View>
        ) : null}

        {/* Decline Reason (W-024) */}
        {visit.status === "DECLINED" ? (
          <View className="rounded-xl border border-line bg-surface-sunken p-3">
            <Text className="text-xs text-text-secondary">
              The owner has not accepted your visit.
            </Text>
            {visit.reason_text ? (
              <Text className="mt-1 text-xs text-navy-900">
                Reason: <Text className="font-bold text-danger">{visit.reason_text}</Text>
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* User Note */}
        {visit.message ? (
          <View className="rounded-xl bg-surface-sunken p-2.5">
            <Text className="text-[11px] text-text-secondary">
              <Text className="font-semibold text-navy-900">Your note: </Text>
              {visit.message}
            </Text>
          </View>
        ) : null}

        {/* Two-step Cancellation */}
        {canCancelStayVisit(visit.status) ? (
          confirming ? (
            <View className="mt-1 gap-2 rounded-xl bg-danger/5 p-3 border border-danger/20">
              <Text className="text-xs font-bold text-danger">
                Cancel this visit?
              </Text>
              <Text className="text-[11px] text-text-secondary">
                The host will be informed that you cannot make it.
              </Text>
              <View className="flex-row gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={cancel.isPending}
                  onPress={() => setConfirming(false)}
                  className="flex-1 rounded-lg"
                >
                  Keep visit
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
            <View className="flex-row justify-end pt-1">
              <Button
                size="sm"
                variant="ghost"
                onPress={() => setConfirming(true)}
                className="text-danger"
              >
                Cancel visit
              </Button>
            </View>
          )
        ) : null}
      </View>
    </View>
  );
}
