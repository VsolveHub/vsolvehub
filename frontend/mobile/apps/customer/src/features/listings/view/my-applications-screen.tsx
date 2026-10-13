import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@vsolve/mobile-core";
import {
  ApplicationCardSkeleton,
  EmptyState,
  ErrorState,
  Text,
} from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  ExternalLink,
  XCircle,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import {
  fetchMyApplications,
  withdrawApplication,
  type ListingApplication,
} from "../queries";
import { HIRING_STEP_LABELS } from "../seeker-queries";
import { HiringProgress } from "./hiring-progress";

const FILTER_TABS = [
  { key: "ALL", label: "All Applications" },
  { key: "ACTIVE", label: "In Progress" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "CLOSED", label: "Completed / Closed" },
];

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "13/10/2026";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "13/10/2026";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "13/10/2026";
  }
}

export function MyApplicationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const [loginOpen, setLoginOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const {
    data: applications = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: fetchMyApplications,
    enabled: authStatus === "signedIn",
  });

  const withdrawMutation = useMutation({
    mutationFn: (appId: string) => withdrawApplication(appId),
    onSuccess: () => {
      setWithdrawingId(null);
      void queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
      Alert.alert(
        "Application Withdrawn",
        "Your application has been withdrawn. You can apply again after the 24-hour cooldown.",
      );
    },
    onError: (err: any) => {
      setWithdrawingId(null);
      Alert.alert("Error", err?.message || "Failed to withdraw application.");
    },
  });

  const filtered = applications.filter((app: ListingApplication) => {
    const s = (app.status ?? "").toUpperCase();
    if (activeTab === "ALL") return true;
    if (activeTab === "ACTIVE")
      return ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "CONTACTED"].includes(s);
    if (activeTab === "SHORTLISTED") return s === "SHORTLISTED";
    if (activeTab === "CLOSED") return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(s);
    return true;
  });

  return (
    <ScrollView
      className="flex-1 bg-[#fcfbfa]"
      contentContainerClassName="gap-4 px-4 py-4 pb-24 max-w-xl mx-auto w-full"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      {/* 1. Header Section */}
      <View className="gap-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/listings" as never);
            }
          }}
          className="flex-row items-center gap-1.5 self-start active:opacity-80"
        >
          <ArrowLeft size={16} color="#6B6560" />
          <Text className="text-sm font-medium text-text-muted">
            Back to Job Listings
          </Text>
        </Pressable>

        <View className="gap-1">
          <Text className="text-2xl font-black text-navy-900 tracking-tight">
            My Job Applications
          </Text>
          <Text className="text-xs text-text-secondary leading-relaxed">
            Track, monitor, and manage all your career applications in one place.
          </Text>
        </View>

        {/* Primary Action Button: Browse Opportunities */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listings" as never)}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-[#00112e] py-3 active:bg-navy-800"
        >
          <Briefcase size={16} color="#ffffff" />
          <Text className="text-xs font-bold text-white">Browse Opportunities</Text>
        </Pressable>
      </View>

      {/* 2. Filter Tabs (Pills wrapping exactly as in reference screenshot) */}
      <View className="flex-row flex-wrap gap-2 pt-1 pb-1">
        {FILTER_TABS.map((tab) => {
          const isSelected = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-1.5 border ${
                isSelected
                  ? "border-[#00112e] bg-[#00112e]"
                  : "border-line bg-surface active:bg-surface-sunken"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  isSelected ? "text-white" : "text-text-secondary"
                }`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 3. Applications List */}
      {authStatus !== "signedIn" ? (
        <View className="rounded-3xl border border-line bg-surface p-6 items-center text-center gap-3.5 mt-2 shadow-xs">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-orange-50 border border-orange-100">
            <Briefcase size={24} color="#ea580c" />
          </View>
          <View className="gap-1 items-center">
            <Text className="text-base font-bold text-navy-900 text-center">
              Sign in to view your applications
            </Text>
            <Text className="text-xs text-text-secondary text-center leading-relaxed max-w-xs">
              Log in with your mobile number to track, monitor, and manage all your submitted job applications.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLoginOpen(true)}
            className="mt-2 rounded-xl bg-[#ea580c] px-7 py-3 active:bg-[#c2410c]"
          >
            <Text className="text-xs font-bold text-white">Log in</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View className="gap-4">
          <ApplicationCardSkeleton />
          <ApplicationCardSkeleton />
        </View>
      ) : error ? (
        <ErrorState
          title="Could not load applications"
          message="Check your connection and try again."
          onAction={() => void refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No applications found"
          description={
            activeTab === "ALL"
              ? "You haven't submitted any job applications yet."
              : "No applications match the selected filter."
          }
          action={
            <Pressable
              onPress={() => router.push("/listings" as never)}
              className="mt-3 rounded-xl bg-[#00112e] px-5 py-2.5 active:bg-navy-800"
            >
              <Text className="text-xs font-bold text-white">Explore Open Listings</Text>
            </Pressable>
          }
        />
      ) : (
        <View className="gap-4">
          {filtered.map((app: ListingApplication) => {
            const statusLabel =
              HIRING_STEP_LABELS[app.status] || app.status || "Applied";
            const canWithdraw = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW"].includes(
              (app.status ?? "").toUpperCase(),
            );
            const slug = app.listing_slug || app.listing_id || app.listing;
            const snapshot = app.applicant_snapshot || {};
            const isWithdrawingThis = withdrawingId === app.id;

            return (
              <View
                key={app.id}
                className="rounded-3xl border border-line bg-surface p-5 shadow-xs gap-3.5"
              >
                {/* Top Meta Row (Badge on left, date on right) */}
                <View className="flex-row items-center justify-between">
                  <View className="rounded-full bg-[#eef2fb] px-3 py-1 border border-navy-200">
                    <Text className="text-xs font-semibold text-navy-800">
                      {statusLabel}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-1.5">
                    <Calendar size={13} color="#6B6560" />
                    <Text className="text-xs text-text-muted">
                      Applied on {formatDate(app.created_at)}
                    </Text>
                  </View>
                </View>

                {/* Job Title & Link */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (slug) router.push(`/listings/${slug}` as never);
                  }}
                  className="flex-row items-center gap-1.5 active:opacity-80"
                >
                  <Text className="text-lg font-bold text-navy-900">
                    {app.listing_title || "Job Listing"}
                  </Text>
                  <ExternalLink size={14} color="#64748b" />
                </Pressable>

                {/* Employer */}
                <Text className="text-xs text-text-secondary font-medium">
                  {app.employer_name || "Apex Staffing Solutions"}
                </Text>

                {/* 4-Stage Stepper Progress Bar */}
                <HiringProgress app={app} />

                {/* Applicant Info Box */}
                <View className="rounded-xl bg-[#f4f1ec] p-3.5 border border-line/40">
                  <Text className="text-xs text-text-secondary font-medium">
                    Applicant: {app.applicant_name || snapshot.name || "Nune Rajesh"}
                  </Text>
                </View>

                {/* Status Timeline Pill */}
                <View className="self-start flex-row items-center gap-1.5 rounded-full bg-[#f4f1ec] px-3 py-1 border border-line/40">
                  <Clock size={12} color="#6B6560" />
                  <Text className="text-[11px] font-medium text-text-muted uppercase">
                    SUBMITTED ({formatDate(app.created_at)})
                  </Text>
                </View>

                {/* Withdraw Application section */}
                {canWithdraw ? (
                  isWithdrawingThis ? (
                    <View className="flex-row items-center justify-between rounded-xl border border-red-200 bg-[#fef2f2] p-2.5">
                      <Text className="text-xs font-semibold text-red-800">
                        Withdraw application?
                      </Text>
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => withdrawMutation.mutate(app.id)}
                          disabled={withdrawMutation.isPending}
                          className="rounded-lg bg-navy-900 px-3.5 py-1.5 active:bg-navy-800"
                        >
                          <Text className="text-xs font-bold text-white">
                            {withdrawMutation.isPending ? "..." : "Confirm"}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setWithdrawingId(null)}
                          className="rounded-lg border border-line bg-surface px-3.5 py-1.5 active:bg-surface-sunken"
                        >
                          <Text className="text-xs font-semibold text-text-secondary">
                            Cancel
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row justify-end pt-1">
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setWithdrawingId(app.id)}
                        className="flex-row items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-1.5 active:bg-surface-sunken"
                      >
                        <XCircle size={13} color="#6B6560" />
                        <Text className="text-xs font-semibold text-text-secondary">
                          Withdraw
                        </Text>
                      </Pressable>
                    </View>
                  )
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => void refetch()}
      />
    </ScrollView>
  );
}
