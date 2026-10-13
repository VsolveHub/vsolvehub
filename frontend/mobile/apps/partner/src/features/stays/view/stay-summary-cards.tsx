import { useQuery } from "@tanstack/react-query";
import { Text } from "@vsolve/mobile-ui";
import {
  BedDouble,
  Building2,
  CalendarClock,
  CheckCircle2,
  Lock,
  PhoneCall,
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
    <View className="gap-3">
      {/* 5 Metrics Grid */}
      <View className="flex-row flex-wrap gap-2.5">
        {/* Properties */}
        <View className="flex-1 min-w-[95px] rounded-2xl border border-line bg-surface p-3 shadow-xs">
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Properties
            </Text>
            <Building2 size={13} color="#6B6560" />
          </View>
          <Text className="mt-1 text-lg font-black text-navy-900">
            {data.total_properties}
          </Text>
        </View>

        {/* Total Rooms */}
        <View className="flex-1 min-w-[95px] rounded-2xl border border-line bg-surface p-3 shadow-xs">
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Total Rooms
            </Text>
            <BedDouble size={13} color="#6B6560" />
          </View>
          <Text className="mt-1 text-lg font-black text-navy-900">
            {data.total_rooms}
          </Text>
        </View>

        {/* Available */}
        <View className="flex-1 min-w-[95px] rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Available
            </Text>
            <CheckCircle2 size={13} color="#059669" />
          </View>
          <Text className="mt-1 text-lg font-black text-emerald-950">
            {data.available_rooms}
          </Text>
        </View>

        {/* Booked */}
        <Pressable
          onPress={() => onSelectTab?.("bookings")}
          className="flex-1 min-w-[95px] rounded-2xl border border-line bg-surface p-3 shadow-xs active:bg-surface-hover"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Booked
            </Text>
            <Lock size={13} color="#6B6560" />
          </View>
          <Text className="mt-1 text-lg font-black text-navy-900">
            {data.booked_rooms}
          </Text>
        </Pressable>

        {/* Reviews */}
        <View className="flex-1 min-w-[95px] rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-xs">
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Reviews
            </Text>
            <Star size={13} color="#d97706" />
          </View>
          <Text className="mt-1 text-base font-black text-amber-950">
            {data.review_count}
            <Text className="text-xs font-bold text-amber-700">{ratingStr}</Text>
          </Text>
        </View>
      </View>

      {/* Action Notification Pills */}
      {(data.new_enquiries > 0 || data.pending_visits > 0) ? (
        <View className="flex-row flex-wrap gap-2 pt-0.5">
          {data.new_enquiries > 0 ? (
            <Pressable
              onPress={() => onSelectTab?.("enquiries")}
              className="flex-row items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 shadow-xs active:opacity-90"
            >
              <PhoneCall size={13} color="#ffffff" />
              <Text className="text-xs font-bold text-white">
                {data.new_enquiries} new enquir{data.new_enquiries === 1 ? "y" : "ies"} to call
              </Text>
            </Pressable>
          ) : null}

          {data.pending_visits > 0 ? (
            <Pressable
              onPress={() => onSelectTab?.("visits")}
              className="flex-row items-center gap-1.5 rounded-full border border-brand bg-brand/10 px-3.5 py-2 active:bg-brand/20"
            >
              <CalendarClock size={13} color="#ea580c" />
              <Text className="text-xs font-bold text-brand">
                {data.pending_visits} visit request{data.pending_visits === 1 ? "" : "s"} to answer
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
