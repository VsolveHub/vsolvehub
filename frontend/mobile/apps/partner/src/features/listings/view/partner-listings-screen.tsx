import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListingCardSkeleton,
  Text,
} from "@vsolve/mobile-ui";
import {
  Briefcase,
  Clock,
  Crown,
  Plus,
  Users,
} from "lucide-react-native";

import {
  type PartnerListing,
} from "../model";
import {
  fetchListingHome,
  fetchPartnerListings,
  fetchSubscriptionPlans,
  purchaseSubscription,
  runListingAction,
} from "../queries";
import { duplicateJob, publishJob } from "../jobs-queries";
import { ListingCard } from "./listing-card";
import { SubscriptionDialog } from "./subscription-dialog";

const WORKSPACE_TABS = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "DRAFT", label: "Drafts" },
  { key: "CLOSED", label: "Closed" },
];

export function PartnerListingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("ALL");
  const [showSubscription, setShowSubscription] = useState(false);

  const homeQuery = useQuery({
    queryKey: ["partner-listing-home"],
    queryFn: fetchListingHome,
  });

  const listingsQuery = useQuery({
    queryKey: ["partner-listings"],
    queryFn: fetchPartnerListings,
  });

  const plansQuery = useQuery({
    queryKey: ["vendor-subscription-plans"],
    queryFn: fetchSubscriptionPlans,
  });

  const refreshWorkspace = () => {
    void queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
  };

  const publishMutation = useMutation({
    mutationFn: (listingId: string) => publishJob(listingId),
    onSuccess: () => {
      refreshWorkspace();
      Alert.alert("Success", "Job opening is now live and published.");
    },
    onError: (err: any) => {
      const code = err?.code || "";
      const msg = err?.message || "";
      if (code === "listing_plan_cap" || msg.toLowerCase().includes("plan cap") || msg.toLowerCase().includes("limit")) {
        setShowSubscription(true);
      } else {
        Alert.alert("Publish Error", msg || "Could not publish job.");
      }
    },
  });

  const republishMutation = useMutation({
    mutationFn: (listingId: string) => runListingAction(listingId, "republish"),
    onSuccess: () => {
      refreshWorkspace();
      Alert.alert("Success", "Job opening republished.");
    },
    onError: (err: any) => {
      const code = err?.code || "";
      const msg = err?.message || "";
      if (code === "listing_plan_cap" || msg.toLowerCase().includes("plan cap")) {
        setShowSubscription(true);
      } else {
        Alert.alert("Republish Error", msg || "Could not republish job opening.");
      }
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (listingId: string) => duplicateJob(listingId),
    onSuccess: (newJob) => {
      refreshWorkspace();
      Alert.alert("Job Duplicated", "Opening copied to a new draft. Opening editor...", [
        {
          text: "Edit Draft",
          onPress: () => router.push(`/listings/post?edit=${newJob.id}` as never),
        },
      ]);
    },
    onError: (err: any) => {
      Alert.alert("Duplicate Error", err?.message || "Failed to duplicate job.");
    },
  });

  const closeMutation = useMutation({
    mutationFn: (listingId: string) => runListingAction(listingId, "close"),
    onSuccess: () => {
      refreshWorkspace();
      Alert.alert("Success", "Job posting closed.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to close job posting.");
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: (planId: string) => purchaseSubscription(planId),
    onSuccess: () => {
      setShowSubscription(false);
      Alert.alert("Success", "Subscription plan upgraded successfully!");
      refreshWorkspace();
    },
    onError: (err: any) => {
      Alert.alert("Subscription Error", err?.message || "Failed to upgrade subscription.");
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
  const home = homeQuery.data;

  // Filter listings by tab (W-104)
  const filteredListings = listings.filter((listing) => {
    const s = (listing.status ?? "").toUpperCase();
    if (activeTab === "ALL") return true;
    if (activeTab === "ACTIVE") return s === "ACTIVE" || s === "PUBLISHED";
    if (activeTab === "DRAFT") return s === "DRAFT" || s === "UNPUBLISHED";
    if (activeTab === "CLOSED") return s === "CLOSED" || s === "EXPIRED" || s === "ARCHIVED";
    return true;
  });

  const isRefreshing = listingsQuery.isRefetching || homeQuery.isRefetching;
  const onRefresh = () => {
    void listingsQuery.refetch();
    void homeQuery.refetch();
  };

  const isActionPending =
    publishMutation.isPending ||
    republishMutation.isPending ||
    duplicateMutation.isPending ||
    closeMutation.isPending;

  return (
    <View className="flex-1 bg-canvas">
      {/* Header Bar */}
      <View className="border-b border-line bg-surface px-4 pb-3 pt-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-extrabold text-navy-900">Hiring & Jobs</Text>
            <Text className="text-xs text-text-muted">
              Post job openings, screen candidates & schedule interviews
            </Text>
          </View>
          <Button
            variant="primary"
            size="sm"
            onPress={() => router.push("/listings/post" as never)}
            className="flex-row items-center gap-1 px-3"
          >
            <Plus size={15} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Post Job</Text>
          </Button>
        </View>

        {/* Subscription Plan Status Bar (W-100, W-117) */}
        <Pressable
          onPress={() => setShowSubscription(true)}
          className="mt-3 flex-row items-center justify-between rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2"
        >
          <View className="flex-row items-center gap-2">
            <Crown size={15} color="#d97706" />
            <Text className="text-xs font-bold text-amber-950">
              {home?.subscription?.plan_name ? `${home.subscription.plan_name} Plan` : "Free Hiring Plan"}
            </Text>
            {home?.plan_limit ? (
              <Badge tone="warning">
                {home.active_listings}/{home.plan_limit} Active
              </Badge>
            ) : null}
          </View>
          <Text className="text-xs font-bold text-amber-800">
            Upgrade Plans →
          </Text>
        </Pressable>

        {/* Home Stats Grid (W-100) */}
        <View className="mt-3 flex-row gap-2.5">
          <View className="flex-1 rounded-xl bg-surface-muted p-2.5">
            <View className="flex-row items-center gap-1">
              <Briefcase size={12} color="#f59e0b" />
              <Text className="text-[10px] font-semibold text-text-muted">Active</Text>
            </View>
            <Text className="mt-0.5 text-base font-black text-navy-900">
              {home?.active_listings ?? listings.filter((l) => (l.status ?? "").toUpperCase() === "ACTIVE").length}
            </Text>
          </View>

          <View className="flex-1 rounded-xl bg-surface-muted p-2.5">
            <View className="flex-row items-center gap-1">
              <Clock size={12} color="#f59e0b" />
              <Text className="text-[10px] font-semibold text-text-muted">In Review</Text>
            </View>
            <Text className="mt-0.5 text-base font-black text-navy-900">
              {home?.pending_moderation ?? 0}
            </Text>
          </View>

          <View className="flex-1 rounded-xl bg-surface-muted p-2.5">
            <View className="flex-row items-center gap-1">
              <Users size={12} color="#f59e0b" />
              <Text className="text-[10px] font-semibold text-text-muted">New Leads</Text>
            </View>
            <Text className="mt-0.5 text-base font-black text-navy-900">
              {home?.new_applications ?? listings.reduce((acc, c) => acc + (c.application_count ?? 0), 0)}
            </Text>
          </View>
        </View>

        {/* Filter Tabs (W-104) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerClassName="flex-row gap-2"
        >
          {WORKSPACE_TABS.map((tab) => {
            const count = listings.filter((l) => {
              const s = (l.status ?? "").toUpperCase();
              if (tab.key === "ALL") return true;
              if (tab.key === "ACTIVE") return s === "ACTIVE" || s === "PUBLISHED";
              if (tab.key === "DRAFT") return s === "DRAFT" || s === "UNPUBLISHED";
              if (tab.key === "CLOSED") return s === "CLOSED" || s === "EXPIRED" || s === "ARCHIVED";
              return true;
            }).length;

            const isSelected = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                variant="ghost"
                size="sm"
                onPress={() => setActiveTab(tab.key)}
                className={`h-7 rounded-full px-3.5 ${
                  isSelected ? "bg-navy-900" : "bg-surface-muted"
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
                    isSelected ? "text-white" : "text-text-muted"
                  }`}
                >
                  {tab.label} {count > 0 ? `(${count})` : ""}
                </Text>
              </Button>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1 px-4 py-4"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        contentContainerClassName="flex-grow pb-16"
      >
        {listingsQuery.isPending ? (
          <View className="gap-3">
            {[1, 2, 3].map((idx) => (
              <ListingCardSkeleton key={idx} />
            ))}
          </View>
        ) : listingsQuery.isError ? (
          <ErrorState
            title="Failed to load job postings"
            message="Check connection and try again."
            actionLabel="Retry"
            onAction={() => void listingsQuery.refetch()}
          />
        ) : filteredListings.length === 0 ? (
          <EmptyState
            title={activeTab === "ALL" ? "No job openings posted" : `No ${activeTab.toLowerCase()} openings`}
            description="Post full-time, part-time, or contract roles to recruit verified professionals and technicians."
            action={
              <Button
                variant="primary"
                onPress={() => router.push("/listings/post" as never)}
              >
                <Text className="font-bold text-white">Post Job Opening</Text>
              </Button>
            }
          />
        ) : (
          <View className="flex-col gap-3">
            {filteredListings.map((item) => (
              <ListingCard
                key={item.id}
                listing={item}
                onViewApplicants={handleViewApplicants}
                onClose={handleClose}
                onEdit={(listing) =>
                  router.push(`/listings/post?edit=${listing.id}` as never)
                }
                onPublishNow={(listing) => publishMutation.mutate(listing.id)}
                onRepublish={(listing) => republishMutation.mutate(listing.id)}
                onDuplicate={(listing) => duplicateMutation.mutate(listing.id)}
                isActionPending={isActionPending}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Subscription Plans Modal (W-117) */}
      <SubscriptionDialog
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        plans={plansQuery.data ?? []}
        currentPlanName={home?.subscription?.plan_name}
        onSubscribe={(planId) => subscribeMutation.mutate(planId)}
        isPending={subscribeMutation.isPending}
      />
    </View>
  );
}
