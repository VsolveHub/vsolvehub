import { Button, EmptyState, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { RefreshControl, ScrollView, View, Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Briefcase, Plus, Users } from "lucide-react-native";

import {
  type PartnerListing,
} from "../model";
import {
  fetchPartnerListings,
  runListingAction,
} from "../queries";
import { ListingCard } from "./listing-card";
import { PostListingSheet } from "./post-listing-sheet";

export function PartnerListingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<PartnerListing | null>(null);

  const listingsQuery = useQuery({
    queryKey: ["partner-listings"],
    queryFn: fetchPartnerListings,
  });

  const closeMutation = useMutation({
    mutationFn: (listingId: string) => runListingAction(listingId, "close"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
      Alert.alert("Success", "Job posting closed.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to close job posting.");
    },
  });

  const handleClose = (listing: PartnerListing) => {
    Alert.alert("Close Job", `Are you sure you want to close "${listing.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close Job",
        style: "destructive",
        onPress: () => closeMutation.mutate(listing.id),
      },
    ]);
  };

  const handleViewApplicants = (listing: PartnerListing) => {
    router.push(`/listings/${listing.id}` as never);
  };

  const listings = listingsQuery.data ?? [];
  const activeCount = listings.filter(
    (l) => (l.status ?? "").toUpperCase() === "ACTIVE",
  ).length;
  const totalApplicants = listings.reduce(
    (acc, cur) => acc + (cur.application_count ?? 0),
    0,
  );

  const isRefreshing = listingsQuery.isRefetching;
  const onRefresh = () => {
    void listingsQuery.refetch();
  };

  return (
    <View className="flex-1 bg-canvas">
      {/* Header Bar */}
      <View className="border-b border-line bg-surface px-4 pb-3 pt-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-extrabold text-text">Hiring & Jobs</Text>
            <Text className="text-xs text-text-muted">
              Post job openings and screen applicants
            </Text>
          </View>
          <Button
            variant="primary"
            size="sm"
            onPress={() => {
              setEditingListing(null);
              setSheetOpen(true);
            }}
            className="flex-row items-center gap-1 px-3"
          >
            <Plus size={15} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Post Job</Text>
          </Button>
        </View>

        {/* Quick Stats Grid */}
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-xl bg-surface-muted p-3">
            <View className="flex-row items-center gap-1.5">
              <Briefcase size={14} color="#f87000" />
              <Text className="text-[11px] font-semibold text-text-muted">Active Openings</Text>
            </View>
            <Text className="mt-1 text-lg font-black text-text">{activeCount}</Text>
          </View>

          <View className="flex-1 rounded-xl bg-surface-muted p-3">
            <View className="flex-row items-center gap-1.5">
              <Users size={14} color="#f87000" />
              <Text className="text-[11px] font-semibold text-text-muted">Total Applicants</Text>
            </View>
            <Text className="mt-1 text-lg font-black text-text">{totalApplicants}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 py-4"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        contentContainerClassName="flex-grow pb-16"
      >
        {listingsQuery.isPending ? (
          <View className="items-center py-12">
            <Spinner size="lg" />
            <Text className="mt-2 text-xs text-text-muted">Loading job openings...</Text>
          </View>
        ) : listingsQuery.isError ? (
          <ErrorState
            title="Failed to load job postings"
            message="Check connection and try again."
            actionLabel="Retry"
            onAction={() => void listingsQuery.refetch()}
          />
        ) : listings.length === 0 ? (
          <EmptyState
            title="No job openings posted"
            description="Post full-time, part-time, or contract roles to recruit verified professionals and technicians."
            action={
              <Button
                variant="primary"
                onPress={() => {
                  setEditingListing(null);
                  setSheetOpen(true);
                }}
              >
                <Text className="font-bold text-white">Post First Job</Text>
              </Button>
            }
          />
        ) : (
          <View className="flex-col gap-3">
            {listings.map((item) => (
              <ListingCard
                key={item.id}
                listing={item}
                onViewApplicants={handleViewApplicants}
                onClose={handleClose}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <PostListingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingListing={editingListing}
      />
    </View>
  );
}
