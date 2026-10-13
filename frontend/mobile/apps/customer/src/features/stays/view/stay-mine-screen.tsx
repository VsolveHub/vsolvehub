import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Plus } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import type { StayEnquiry, StayReservation, StayVisit } from "../model";
import {
  fetchMyStayEnquiries,
  fetchMyStayReservations,
  fetchMyStayVisits,
} from "../queries";
import { StayEnquiryCard } from "./stay-enquiry-card";
import { StayReservationCard } from "./stay-reservation-card";
import { StayVisitCard } from "./stay-visit-card";

type Tab = "enquiries" | "visits" | "reservations";

export function StayMineScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const requested = params?.tab;
  const activeTab: Tab =
    requested === "visits" || requested === "reservations" ? requested : "enquiries";

  const setTab = (next: Tab) => {
    router.setParams({ tab: next });
  };

  const enquiries = useQuery({
    queryKey: ["my-stay-enquiries"],
    queryFn: fetchMyStayEnquiries,
  });
  const visits = useQuery({
    queryKey: ["my-stay-visits"],
    queryFn: fetchMyStayVisits,
  });
  const reservations = useQuery({
    queryKey: ["my-stay-reservations"],
    queryFn: fetchMyStayReservations,
  });

  const enquiryRows = (enquiries.data as StayEnquiry[]) ?? [];
  const visitRows = (visits.data as StayVisit[]) ?? [];
  const reservationRows = (reservations.data as StayReservation[]) ?? [];

  // Match web tab counts: openVisits filters REQUESTED or ACCEPTED
  const openVisits = visitRows.filter(
    (v) => v.status === "REQUESTED" || v.status === "ACCEPTED",
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "enquiries", label: `Enquiries (${enquiryRows.length})` },
    { key: "visits", label: `Visits (${openVisits.length})` },
    ...(reservationRows.length > 0
      ? [
          {
            key: "reservations" as const,
            label: `Reservations (${reservationRows.length})`,
          },
        ]
      : []),
  ];

  const current =
    activeTab === "visits"
      ? visits
      : activeTab === "reservations"
        ? reservations
        : enquiries;

  const isRefreshing =
    enquiries.isRefetching || visits.isRefetching || reservations.isRefetching;

  const handleRefresh = () => {
    void enquiries.refetch();
    void visits.refetch();
    void reservations.refetch();
  };

  const exploreButton = (
    <Button
      variant="primary"
      size="sm"
      onPress={() => router.push("/stays" as never)}
      className="mt-2"
    >
      Explore Rooms & Stays
    </Button>
  );

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-4 py-4 pb-16"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Top Header */}
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/stays" as never);
            }
          }}
          className="flex-row items-center gap-1.5"
        >
          <ArrowLeft size={16} color="#00112e" />
          <Text className="text-xs font-bold text-navy-900">Back to Stays</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/stays" as never)}
          className="flex-row items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 active:bg-brand/20"
        >
          <Plus size={14} color="#EA580C" />
          <Text className="text-xs font-bold text-brand">Browse Stays</Text>
        </Pressable>
      </View>

      <View className="gap-1">
        <Text className="text-2xl font-black text-navy-900">My Stays</Text>
        <Text className="text-xs text-text-secondary">
          Your enquiries and visits, with the owner&apos;s number to call.
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row flex-wrap gap-2 border-b border-line pb-2">
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setTab(tab.key)}
              className={`rounded-full px-4 py-1.5 border ${
                isSelected
                  ? "border-navy-900 bg-navy-900"
                  : "border-line bg-surface active:bg-surface-hover"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  isSelected ? "text-white" : "text-text-secondary"
                }`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Loading Skeletons */}
      {current.isLoading ? (
        <View className="gap-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </View>
      ) : current.error ? (
        <ErrorState
          title="Could not load your stays"
          message={(current.error as Error).message}
          actionLabel="Retry"
          onAction={handleRefresh}
        />
      ) : activeTab === "visits" ? (
        visitRows.length === 0 ? (
          <EmptyState
            title="No visits yet"
            description="Open a property and choose “Schedule a visit” to see it in person."
            action={exploreButton}
          />
        ) : (
          <View className="gap-4">
            {visitRows.map((visit) => (
              <StayVisitCard key={visit.id} visit={visit} />
            ))}
          </View>
        )
      ) : activeTab === "reservations" ? (
        reservationRows.length === 0 ? (
          <EmptyState
            title="No reservations yet"
            description="Your confirmed bookings and payment history will appear here."
            action={exploreButton}
          />
        ) : (
          <View className="gap-4">
            {reservationRows.map((res) => (
              <StayReservationCard key={res.id} reservation={res} />
            ))}
          </View>
        )
      ) : enquiryRows.length === 0 ? (
        <EmptyState
          title="No enquiries yet"
          description="Enquire about a room and the owner's number appears here."
          action={exploreButton}
        />
      ) : (
        <View className="gap-4">
          {enquiryRows.map((enquiry) => (
            <StayEnquiryCard key={enquiry.id} enquiry={enquiry} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
