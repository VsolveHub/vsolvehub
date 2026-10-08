import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ArrowLeft, Briefcase, Building, Calendar, CheckCircle2, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { APPLICATION_STATUS_LABELS } from "../model";
import { formatReadableDate } from "../pickup-time";
import { fetchMyApplications, withdrawApplication, type ListingApplication } from "../queries";

const FILTER_TABS = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "In Progress" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "CLOSED", label: "Closed" },
];

export function MyApplicationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
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
  });

  const withdrawMutation = useMutation({
    mutationFn: (appId: string) => withdrawApplication(appId),
    onMutate: (appId) => setWithdrawingId(appId),
    onSuccess: () => {
      setWithdrawingId(null);
      void queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
    },
    onError: () => {
      setWithdrawingId(null);
    },
  });

  const filtered = applications.filter((app: any) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "ACTIVE")
      return ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "CONTACTED"].includes(app.status);
    if (activeTab === "SHORTLISTED") return app.status === "SHORTLISTED";
    if (activeTab === "CLOSED") return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status);
    return true;
  });

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-4 py-4 pb-12"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="flex-row items-center gap-1.5"
        >
          <ArrowLeft size={16} color="#00112e" />
          <Text className="text-sm font-bold text-navy-900">Explore Jobs</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listings" as never)}
          className="flex-row items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 active:bg-brand/20"
        >
          <Plus size={14} color="#EA580C" />
          <Text className="text-xs font-bold text-brand">Browse Jobs</Text>
        </Pressable>
      </View>

      <View className="gap-1">
        <Text className="text-2xl font-black text-navy-900">My Job Applications</Text>
        <Text className="text-xs text-text-secondary">
          Track employer review stages, shortlist status, and interviews
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row gap-2 border-b border-line pb-2">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === "ALL"
              ? applications.length
              : applications.filter((app: any) => {
                  if (tab.key === "ACTIVE")
                    return ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "CONTACTED"].includes(
                      app.status
                    );
                  if (tab.key === "SHORTLISTED") return app.status === "SHORTLISTED";
                  if (tab.key === "CLOSED")
                    return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status);
                  return true;
                }).length;

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
      </View>

      {/* Applications List */}
      {isLoading ? (
        <View className="gap-4">
          {[1, 2].map((idx) => (
            <View key={idx} className="h-36 rounded-2xl bg-surface-sunken" />
          ))}
        </View>
      ) : error ? (
        <ErrorState
          title="Could not load applications"
          message="Check your connection and try again."
          onAction={() => void refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No applications in this view"
          description="You haven't submitted any job applications under this filter."
          action={
            <Button
              variant="primary"
              size="sm"
              onPress={() => router.push("/listings" as never)}
              className="mt-2"
            >
              Explore Opportunities
            </Button>
          }
        />
      ) : (
        <View className="gap-4">
          {filtered.map((app: any) => {
            const statusLabel = APPLICATION_STATUS_LABELS[app.status] || app.status;
            const canWithdraw = app.status === "SUBMITTED" || app.status === "UNDER_REVIEW";

            return (
              <View
                key={app.id}
                className="overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xs gap-3"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 gap-1">
                    <Badge tone="brand" className="self-start">
                      <Text className="text-[10px] font-bold">{statusLabel}</Text>
                    </Badge>
                    <Text className="mt-1 text-base font-extrabold text-navy-900">
                      {app.listing?.title || "Role Application"}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      <Building size={12} color="#6B6560" />
                      <Text className="text-xs text-text-secondary">
                        {app.listing?.partner?.company_name ||
                          app.listing?.partner?.full_name ||
                          "Verified Employer"}
                      </Text>
                    </View>
                  </View>
                </View>

                {app.created_at ? (
                  <View className="flex-row items-center gap-1.5">
                    <Calendar size={12} color="#6B6560" />
                    <Text className="text-[11px] text-text-muted">
                      Applied on {formatReadableDate(app.created_at.slice(0, 10))}
                    </Text>
                  </View>
                ) : null}

                {canWithdraw ? (
                  <View className="border-t border-line/60 pt-2.5 flex-row justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={withdrawingId === app.id}
                      onPress={() => withdrawMutation.mutate(app.id)}
                      className="text-danger"
                    >
                      Withdraw Application
                    </Button>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
