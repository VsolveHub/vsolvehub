import { useQuery } from "@tanstack/react-query";
import { Text } from "@vsolve/mobile-ui";
import {
  BedDouble,
  Building2,
  CalendarClock,
  Lock,
  RotateCw,
  Star,
} from "lucide-react-native";
import { Pressable, View } from "react-native";

import { fetchPartnerStaySummary } from "../queries";

export function StaySummaryCards({
  onSelectTab,
}: {
  onSelectTab?: (tab: "enquiries" | "visits" | "bookings") => void;
}) {
  const summary = useQuery({
    queryKey: ["partner-stays", "summary"],
    queryFn: fetchPartnerStaySummary,
  });

  const data = summary.data;
  if (!data) return null;

  const ratingStr =
    data.average_rating != null ? ` · ★ ${data.average_rating}` : "";

  return (
    <View className="mb-4 gap-3">
      {/* 2-Column Grid of Metric Cards */}
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {/* Properties */}
        <View className="w-[48%] flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Properties
            </Text>
            <View className="size-8 items-center justify-center rounded-xl bg-navy-50">
              <Building2 size={16} color="#001a4e" />
            </View>
          </View>
          <Text className="mt-3 text-2xl font-black text-navy-900">
            {data.total_properties}
          </Text>
        </View>

        {/* Total Rooms */}
        <View className="w-[48%] flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Total rooms
            </Text>
            <View className="size-8 items-center justify-center rounded-xl bg-navy-50">
              <BedDouble size={16} color="#001a4e" />
            </View>
          </View>
          <Text className="mt-3 text-2xl font-black text-navy-900">
            {data.total_rooms}
          </Text>
        </View>

        {/* Available */}
        <View className="w-[48%] flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <View className="size-2 rounded-full bg-emerald-500" />
              <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Available
              </Text>
            </View>
            <View className="size-8 items-center justify-center rounded-xl bg-navy-50">
              <RotateCw size={15} color="#001a4e" />
            </View>
          </View>
          <Text className="mt-3 text-2xl font-black text-navy-900">
            {data.available_rooms}
          </Text>
        </View>

        {/* Booked */}
        <Pressable
          onPress={() => onSelectTab?.("bookings")}
          className="w-[48%] flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs active:bg-surface-hover"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <View className="size-2 rounded-full bg-rose-500" />
              <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Booked
              </Text>
            </View>
            <View className="size-8 items-center justify-center rounded-xl bg-navy-50">
              <Lock size={16} color="#001a4e" />
            </View>
          </View>
          <Text className="mt-3 text-2xl font-black text-navy-900">
            {data.booked_rooms}
          </Text>
        </Pressable>

        {/* Reviews */}
        <View className="w-[48%] flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Reviews
            </Text>
            <View className="size-8 items-center justify-center rounded-xl bg-navy-50">
              <Star size={16} color="#001a4e" />
            </View>
          </View>
          <Text className="mt-3 text-2xl font-black text-navy-900">
            {data.review_count}
            <Text className="text-xl font-bold text-navy-900">{ratingStr}</Text>
          </Text>
        </View>
      </View>

      {/* Action Notification Pills */}
      {data.new_enquiries > 0 ? (
        <Pressable
          onPress={() => onSelectTab?.("enquiries")}
          className="mt-1 self-start rounded-full bg-[#f87000] px-4 py-2 shadow-xs active:opacity-90"
        >
          <Text className="text-xs font-bold text-white">
            {data.new_enquiries} new enquir{data.new_enquiries === 1 ? "y" : "ies"} to call
          </Text>
        </Pressable>
      ) : null}

      {data.pending_visits > 0 ? (
        <Pressable
          onPress={() => onSelectTab?.("visits")}
          className="mt-1 flex-row items-center gap-1.5 self-start rounded-full border border-[#f87000] bg-surface px-4 py-2 shadow-xs active:bg-[#f87000]/10"
        >
          <CalendarClock size={14} color="#f87000" />
          <Text className="text-xs font-bold text-[#f87000]">
            {data.pending_visits} visit request{data.pending_visits === 1 ? "" : "s"} to answer
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

