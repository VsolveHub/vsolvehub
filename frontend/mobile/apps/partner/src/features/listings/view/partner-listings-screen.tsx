import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  EmptyState,
  ErrorState,
  ListingCardSkeleton,
  Text,
} from "@vsolve/mobile-ui";
import {
  Briefcase,
  Crown,
  Plus,
  Sparkles,
} from "lucide-react-native";

import { type PartnerListing } from "../model";
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
  { key: "ALL", label: "All listings" },
  { key: "ACTIVE", label: "Live on app" },
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

  // Filter listings by tab
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

  const activeCount = home?.active_listings ?? listings.filter((l) => (l.status ?? "").toUpperCase() === "ACTIVE" || (l.status ?? "").toUpperCase() === "PUBLISHED").length;
  const applicantsCount = home?.new_applications ?? listings.reduce((acc, c) => acc + (c.application_count ?? 0), 0);
  const planName = home?.subscription?.plan_name ?? "Enterprise Plan";

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pt-4 pb-36 gap-4"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* 1. Header Section */}
      <View className="gap-1.5">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-[#2563eb]">
          GROWING TEAM IN HYDERABAD
        </Text>
        <Text className="text-2xl font-bold text-[#071328]">Jobs & applicants</Text>
        <Text className="text-xs text-[#64748b] leading-relaxed">
          Post a role, see who applied, download resumes and hire. Applicants confirm their interview times.
        </Text>

        {/* 2 Top Action Buttons */}
        <View className="flex-row items-center gap-3 pt-2">
          {/* Choose Plan Button */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowSubscription(true)}
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 14,
            }}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-3 px-3 shadow-sm active:bg-slate-50"
          >
            <Crown size={15} color="#f87000" />
            <Text className="text-xs font-bold text-[#071328]">Choose plan</Text>
          </Pressable>

          {/* Post a Job Button */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/listings/post" as never)}
            style={{
              backgroundColor: "#f87000",
              borderRadius: 14,
            }}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-3 px-3 shadow-sm active:opacity-90"
          >
            <Plus size={16} color="#ffffff" strokeWidth={2.5} />
            <Text className="text-xs font-bold text-white">Post a job</Text>
          </Pressable>
        </View>
      </View>

      {/* 2. Top Metric Cards (3 Cards Row/Grid) */}
      <View className="gap-2.5">
        <View className="flex-row gap-2.5">
          {/* Card 1: Verified listings */}
          <View
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 18,
            }}
            className="flex-1 p-3.5 justify-between min-h-[96px]"
          >
            <Text className="text-[11px] font-medium text-[#64748b]">Verified listings</Text>
            <Text className="text-2xl font-black text-[#071328] mt-1">{activeCount || 6}</Text>
            <Text className="text-[11px] text-[#64748b] mt-0.5">1 hiring package</Text>
            <Text className="text-[11px] font-bold text-emerald-600 mt-1">Live on platform</Text>
          </View>

          {/* Card 2: Applicant pool */}
          <View
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 18,
            }}
            className="flex-1 p-3.5 justify-between min-h-[96px]"
          >
            <Text className="text-[11px] font-medium text-[#64748b]">Applicant pool</Text>
            <Text className="text-2xl font-black text-[#071328] mt-1">{applicantsCount || 2}</Text>
            <Text className="text-[11px] text-[#64748b] mt-0.5">12 all-time profiles</Text>
            <View className="h-4" />
          </View>
        </View>

        {/* Card 3: Active placement plan */}
        <View
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#e5e7eb",
            borderWidth: 1,
            borderRadius: 18,
          }}
          className="p-3.5"
        >
          <Text className="text-[11px] font-medium text-[#64748b]">Active placement plan</Text>
          <Text className="text-sm font-bold text-[#071328] mt-1">{planName}</Text>
          <Text className="text-[11px] text-[#64748b] mt-0.5">Renews 28/05/2026</Text>
        </View>
      </View>

      {/* 3. Filter Tabs (Pills) */}
      <View className="gap-2 pt-1">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="flex-row gap-2"
        >
          {WORKSPACE_TABS.map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="button"
                onPress={() => setActiveTab(tab.key)}
                style={{
                  backgroundColor: isSelected ? "#00112e" : "#ffffff",
                  borderColor: isSelected ? "#00112e" : "#e5e7eb",
                  borderWidth: 1,
                  borderRadius: 9999,
                }}
                className="px-4 py-2"
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? "text-white" : "text-[#071328]"
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text className="text-xs text-[#64748b] px-0.5">
          Showing {filteredListings.length} roles
        </Text>
      </View>

      {/* 4. Job Listings List */}
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
          actionLabel="Try again"
          onAction={onRefresh}
        />
      ) : filteredListings.length === 0 ? (
        <EmptyState
          title={activeTab === "ALL" ? "No job openings posted" : `No ${activeTab.toLowerCase()} openings`}
          description="Post full-time, part-time, or contract roles to recruit verified professionals and technicians."
        />
      ) : (
        <View className="gap-1">
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

      {/* Subscription Plans Modal */}
      <SubscriptionDialog
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        plans={plansQuery.data ?? []}
        currentPlanName={home?.subscription?.plan_name}
        onSubscribe={(planId) => subscribeMutation.mutate(planId)}
        isPending={subscribeMutation.isPending}
      />
    </ScrollView>
  );
}
