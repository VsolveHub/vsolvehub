import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { rentalMineBucket, type RentalMineTab } from "../model";
import { cancelRentalBooking, fetchMyRentals } from "../queries";
import { RentalBookingCard } from "./rental-booking-card";

const TABS: { key: RentalMineTab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "ONGOING", label: "Ongoing" },
  { key: "RETURNED", label: "Returned" },
  { key: "INACTIVE", label: "Cancelled" },
];

export function RentalMineScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<RentalMineTab>("ALL");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const {
    data: bookings = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["my-rentals"],
    queryFn: fetchMyRentals,
  });

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => cancelRentalBooking(bookingId),
    onMutate: (bookingId) => setCancellingId(bookingId),
    onSuccess: () => {
      setCancellingId(null);
      void queryClient.invalidateQueries({ queryKey: ["my-rentals"] });
    },
    onError: () => {
      setCancellingId(null);
    },
  });

  const filteredBookings = bookings.filter((b) => {
    const s = (b.status ?? "").toUpperCase();
    if (activeTab !== "ALL" && rentalMineBucket(s) !== activeTab) return false;
    return true;
  });

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-4 py-4 pb-12"
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
      }
    >
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="flex-row items-center gap-1.5"
        >
          <ArrowLeft size={16} color="#00112e" />
          <Text className="text-sm font-bold text-navy-900">Equipment Rentals</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/rentals" as never)}
          className="flex-row items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 active:bg-brand/20"
        >
          <Plus size={14} color="#EA580C" />
          <Text className="text-xs font-bold text-brand">Rent Gear</Text>
        </Pressable>
      </View>

      <View className="gap-1">
        <Text className="text-2xl font-black text-navy-900">My Rentals</Text>
        <Text className="text-xs text-text-secondary">
          Track active gear, pickup schedules, and security deposits
        </Text>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {TABS.map((tab) => {
          const count =
            tab.key === "ALL"
              ? bookings.length
              : bookings.filter((b) => rentalMineBucket(b.status) === tab.key).length;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`rounded-full px-3.5 py-1.5 border ${
                activeTab === tab.key
                  ? "border-brand bg-brand"
                  : "border-line bg-surface active:bg-surface-hover"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  activeTab === tab.key ? "text-white" : "text-text-secondary"
                }`}
              >
                {tab.label} {count > 0 ? `(${count})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Bookings List */}
      {isLoading ? (
        <View className="gap-4">
          {[1, 2].map((idx) => (
            <View key={idx} className="h-40 rounded-2xl bg-surface-sunken" />
          ))}
        </View>
      ) : error ? (
        <ErrorState
          title="Could not load your rentals"
          message="Check your connection and try again."
          onAction={() => void refetch()}
        />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title="No rentals in this tab"
          description="You haven't reserved any gear in this status category."
          action={
            <Button
              variant="primary"
              size="sm"
              onPress={() => router.push("/rentals" as never)}
              className="mt-2"
            >
              Browse Equipment
            </Button>
          }
        />
      ) : (
        <View className="gap-4">
          {filteredBookings.map((b) => (
            <RentalBookingCard
              key={b.id}
              booking={b}
              isCancelling={cancellingId === b.id}
              onCancel={(id) => cancelMutation.mutate(id)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
