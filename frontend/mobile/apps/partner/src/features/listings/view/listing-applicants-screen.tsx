import { Button, EmptyState, ErrorState, Spinner, Text, cn } from "@vsolve/mobile-ui";
import { useState } from "react";
import { RefreshControl, ScrollView, View, Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, Users } from "lucide-react-native";

import {
  type PartnerApplication,
  type PartnerListing,
} from "../model";
import {
  fetchListingApplications,
  fetchPartnerListing,
  revealApplicationContact,
  updateApplicationStatus,
} from "../queries";
import { ApplicantCard } from "./applicant-card";

export function ListingApplicantsScreen({ listingId }: { listingId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const listingQuery = useQuery({
    queryKey: ["partner-listing", listingId],
    queryFn: () => fetchPartnerListing(listingId),
  });

  const applicantsQuery = useQuery({
    queryKey: ["partner-listing-applications", listingId],
    queryFn: () => fetchListingApplications(listingId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ appId, status }: { appId: string; status: string }) =>
      updateApplicationStatus(appId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["partner-listing-applications", listingId],
      });
      Alert.alert("Updated", "Applicant status updated.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to update status.");
    },
  });

  const revealMutation = useMutation({
    mutationFn: (appId: string) => revealApplicationContact(appId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["partner-listing-applications", listingId],
      });
      Alert.alert("Revealed", "Contact details are now visible.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to reveal contact.");
    },
  });

  const handleUpdateStatus = (app: PartnerApplication, newStatus: string) => {
    statusMutation.mutate({ appId: app.id, status: newStatus });
  };

  const handleRevealContact = (app: PartnerApplication) => {
    revealMutation.mutate(app.id);
  };

  const applications = applicantsQuery.data ?? [];
  const filteredApps =
    statusFilter === "ALL"
      ? applications
      : applications.filter(
          (app) => (app.status ?? "").toUpperCase() === statusFilter,
        );

  const isRefreshing = listingQuery.isRefetching || applicantsQuery.isRefetching;
  const onRefresh = () => {
    void listingQuery.refetch();
    void applicantsQuery.refetch();
  };

  return (
    <View className="flex-1 bg-canvas">
      {/* Top Bar */}
      <View className="border-b border-line bg-surface px-4 pb-3 pt-4">
        <View className="flex-row items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.back()}
            className="h-9 w-9 p-0 items-center justify-center rounded-full"
          >
            <ArrowLeft size={18} color="#071328" />
          </Button>
          <View className="flex-1">
            <Text className="text-lg font-extrabold text-text" numberOfLines={1}>
              {listingQuery.data?.title || "Role Candidates"}
            </Text>
            <Text className="text-xs text-text-muted">
              {applications.length} total applicant{applications.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerClassName="flex-row gap-2"
        >
          {["ALL", "SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "CONTACTED"].map((st) => (
            <Button
              key={st}
              variant="ghost"
              size="sm"
              onPress={() => setStatusFilter(st)}
              className={cn(
                "h-7 rounded-full px-3",
                statusFilter === st ? "bg-[#f87000]" : "bg-surface-muted",
              )}
            >
              <Text
                className={cn(
                  "text-[11px] font-bold",
                  statusFilter === st ? "text-white" : "text-text-muted",
                )}
              >
                {st === "ALL"
                  ? "All"
                  : st === "SUBMITTED"
                    ? "New"
                    : st === "UNDER_REVIEW"
                      ? "Reviewing"
                      : st === "SHORTLISTED"
                        ? "Shortlisted"
                        : "Contacted"}
              </Text>
            </Button>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1 px-4 py-4"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        contentContainerClassName="flex-grow pb-16"
      >
        {applicantsQuery.isPending ? (
          <View className="items-center py-12">
            <Spinner size="lg" />
            <Text className="mt-2 text-xs text-text-muted">Loading applicants...</Text>
          </View>
        ) : applicantsQuery.isError ? (
          <ErrorState
            title="Failed to load candidates"
            message="Check connection and try again."
            actionLabel="Retry"
            onAction={() => void applicantsQuery.refetch()}
          />
        ) : filteredApps.length === 0 ? (
          <EmptyState
            title={statusFilter === "ALL" ? "No applications yet" : "No candidates in this stage"}
            description="When candidates apply for this job opening, their profiles and resumes will appear here."
          />
        ) : (
          <View className="flex-col gap-3">
            {filteredApps.map((app) => (
              <ApplicantCard
                key={app.id}
                application={app}
                onUpdateStatus={handleUpdateStatus}
                onRevealContact={handleRevealContact}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
