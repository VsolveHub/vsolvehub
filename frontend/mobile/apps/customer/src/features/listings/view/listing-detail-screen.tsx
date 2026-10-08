import { useQuery } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Briefcase,
  Building,
  CheckCircle2,
  Clock,
  DollarSign,
  Heart,
  MapPin,
  Sparkles,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatFieldLabel } from "../model";
import { fetchListing, fetchMyApplications, type ListingDetail } from "../queries";
import { fetchMyJobProfile, fetchMyMatch } from "../seeker-queries";
import { ApplySheet } from "./apply-sheet";

export function ListingDetailScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [applyOpen, setApplyOpen] = useState(false);

  const {
    data: listing,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["listing", slug],
    queryFn: () => fetchListing(slug),
    enabled: Boolean(slug),
  });

  const profileQuery = useQuery({
    queryKey: ["my-job-profile"],
    queryFn: fetchMyJobProfile,
  });

  const applicationsQuery = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: fetchMyApplications,
  });

  const listingId = listing?.id ?? "";

  const matchQuery = useQuery({
    queryKey: ["my-job-match", listingId],
    queryFn: () => fetchMyMatch(listingId),
    enabled: Boolean(listingId && profileQuery.data),
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
      </View>
    );
  }

  if (error || !listing) {
    return (
      <View className="flex-1 bg-canvas p-6 justify-center">
        <ErrorState
          title="Job listing not found"
          message="This opportunity has expired or is no longer accepting applications."
          onAction={() => void refetch()}
        />
      </View>
    );
  }

  const payDisplay =
    listing.salary_display ||
    (listing.salary_min_paise && listing.salary_max_paise
      ? `₹${Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN")} - ₹${Math.round(listing.salary_max_paise / 100).toLocaleString("en-IN")}`
      : listing.salary_min_paise
        ? `From ₹${Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN")}`
        : null);

  const myApplications = (applicationsQuery.data as any[]) ?? [];
  const existingApplication = myApplications.find(
    (app) => app.listing === listing.id && app.status !== "WITHDRAWN" && app.status !== "EXPIRED"
  );

  const structuredFields = ((listing as any).structured_fields || {}) as Record<string, any>;
  const fieldEntries = Object.entries(structuredFields).filter(
    ([_, val]) => val !== undefined && val !== null && val !== ""
  );

  return (
    <View className="flex-1 bg-canvas">
      {/* Header Bar */}
      <View className="flex-row items-center justify-between border-b border-line bg-surface px-4 py-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="flex-row items-center gap-1.5"
        >
          <ArrowLeft size={16} color="#00112e" />
          <Text className="text-xs font-bold text-navy-900">All Jobs</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-6 p-5 pb-32">
        {/* Title & Employer */}
        <View className="gap-2">
          <Text className="text-2xl font-black text-navy-900">{listing.title}</Text>
          <View className="flex-row items-center gap-2">
            <Building size={14} color="#6B6560" />
            <Text className="text-sm font-bold text-text-secondary">
              {listing.partner?.company_name || listing.partner?.full_name || "Verified Employer"}
            </Text>
          </View>
          {listing.location_text ? (
            <View className="flex-row items-center gap-1.5">
              <MapPin size={12} color="#6B6560" />
              <Text className="text-xs text-text-secondary">{listing.location_text}</Text>
            </View>
          ) : null}
        </View>

        {/* Compensation Card */}
        {payDisplay ? (
          <View className="rounded-2xl border border-brand/20 bg-[#FFF9F5] p-4">
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-brand">
              Compensation / Pay
            </Text>
            <Text className="mt-1 text-2xl font-black text-navy-900">{payDisplay}</Text>
          </View>
        ) : null}

        {/* Profile Match Banner */}
        {matchQuery.data ? (
          <View className="flex-row items-center gap-2.5 rounded-2xl bg-emerald-500/10 p-3.5 border border-emerald-500/20">
            <Sparkles size={18} color="#059669" />
            <View className="flex-1">
              <Text className="text-xs font-extrabold text-emerald-900">
                Skills Matched with Your Profile
              </Text>
              <Text className="text-[11px] text-emerald-700">
                You match key requirements for this opening.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Job Parameters */}
        {fieldEntries.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sm font-extrabold text-navy-900">Role Details</Text>
            <View className="rounded-2xl border border-line bg-surface p-3 divide-y divide-line/60">
              {fieldEntries.map(([k, v]) => (
                <View key={k} className="flex-row justify-between py-2">
                  <Text className="text-xs text-text-secondary">{formatFieldLabel(k)}</Text>
                  <Text className="text-xs font-bold text-navy-900 capitalize">
                    {String(v).replaceAll("_", " ")}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Job Description */}
        {listing.description ? (
          <View className="gap-2">
            <Text className="text-sm font-extrabold text-navy-900">Job Description</Text>
            <Text className="text-xs leading-relaxed text-text-secondary">
              {listing.description}
            </Text>
          </View>
        ) : null}

        {/* Employer Card */}
        <View className="rounded-2xl border border-line bg-surface p-4">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            About the Hiring Company
          </Text>
          <Text className="mt-1 text-sm font-bold text-navy-900">
            {listing.partner?.company_name || listing.partner?.full_name || "Verified Employer"}
          </Text>
          <Text className="mt-1 text-xs text-text-secondary">
            Verified hiring vendor on VSolve Hub network.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky Bottom Apply Bar */}
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 pt-3 shadow-raised"
      >
        {existingApplication ? (
          <View className="flex-row items-center justify-between rounded-xl bg-canvas p-3 border border-line">
            <View className="flex-row items-center gap-2">
              <CheckCircle2 size={16} color="#16a34a" />
              <Text className="text-xs font-bold text-emerald-800">
                Application Submitted ({existingApplication.status})
              </Text>
            </View>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => router.push("/listings/my-applications" as never)}
            >
              View Status
            </Button>
          </View>
        ) : (
          <Button
            size="lg"
            variant="primary"
            onPress={() => setApplyOpen(true)}
            className="w-full rounded-xl py-3.5"
          >
            Apply for this Job
          </Button>
        )}
      </View>

      {/* Application Sheet */}
      <ApplySheet
        listing={listing}
        initialProfile={profileQuery.data}
        open={applyOpen}
        onOpenChange={setApplyOpen}
      />
    </View>
  );
}
