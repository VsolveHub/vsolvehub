import { useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { EmptyState, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { type PartnerApplication } from "../model";
import {
  fetchListingApplications,
  fetchPartnerListing,
  fetchSubscriptionPlans,
  reportApplicantApplication,
  revealApplicationContact,
  runListingAction,
  updateApplicationStatus,
} from "../queries";
import { usePlanPurchase } from "../use-plan-purchase";
import { proposeInterview } from "../jobs-queries";
import { ApplicantCard } from "./applicant-card";
import { InterviewDialog } from "./interview-dialog";
import { JobMatches } from "./job-matches";
import { ReportApplicantDialog } from "./report-applicant-dialog";
import { SubscriptionDialog } from "./subscription-dialog";

const FILTER_TABS = [
  { key: "ALL", label: "All Applicants" },
  { key: "NEW", label: "New / In Review" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "CONNECTED", label: "Connected" },
  { key: "CLOSED", label: "Closed / Withdrawn" },
] as const;

export function ListingApplicantsScreen({ listingId }: { listingId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [section, setSection] = useState<"APPLICATIONS" | "MATCHES">("APPLICATIONS");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [interviewing, setInterviewing] = useState<PartnerApplication | null>(null);
  const [reportingApp, setReportingApp] = useState<PartnerApplication | null>(null);
  const [reportReason, setReportReason] = useState("SPAM");
  const [reportDetail, setReportDetail] = useState("");
  const [showSubscription, setShowSubscription] = useState(false);

  const listingQuery = useQuery({
    queryKey: ["partner-listing", listingId],
    queryFn: () => fetchPartnerListing(listingId),
  });

  const applicantsQuery = useQuery({
    queryKey: ["partner-listing-applications", listingId],
    queryFn: () => fetchListingApplications(listingId),
  });

  const plansQuery = useQuery({
    queryKey: ["vendor-subscription-plans"],
    queryFn: fetchSubscriptionPlans,
  });

  const queryKey = ["partner-listing-applications", listingId];

  const statusMutation = useMutation({
    mutationFn: ({ appId, status }: { appId: string; status: string }) =>
      updateApplicationStatus(appId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["partner-listing", listingId] });
      Alert.alert("Updated", "Applicant stage updated.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to update stage.");
    },
  });

  const revealMutation = useMutation({
    mutationFn: (appId: string) => revealApplicationContact(appId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      Alert.alert("Revealed", "Contact details are now visible.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to reveal contact.");
    },
  });

  const interviewMutation = useMutation({
    mutationFn: (body: Parameters<typeof proposeInterview>[1]) => {
      if (!interviewing) throw new Error("No candidate selected for interview");
      return proposeInterview(interviewing.id, body);
    },
    onSuccess: () => {
      setInterviewing(null);
      void queryClient.invalidateQueries({ queryKey });
      Alert.alert("Success", "Interview invitation sent to candidate.");
    },
    onError: (err: any) => {
      Alert.alert("Interview Error", err?.message || "Failed to send interview invitation.");
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => {
      if (!reportingApp) throw new Error("No candidate selected to report");
      return reportApplicantApplication(reportingApp.id, reportReason, reportDetail);
    },
    onSuccess: () => {
      setReportingApp(null);
      setReportDetail("");
      Alert.alert("Report Submitted", "Your report has been received and will be reviewed.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: any) => {
      Alert.alert("Report Error", err?.message || "Failed to submit report.");
    },
  });

  const subscribeMutation = usePlanPurchase({
    beforeCheckout: () => setShowSubscription(false),
    onSettled: () => {
      setShowSubscription(false);
      void queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-subscriptions"] });
    },
  });

  const applications = applicantsQuery.data ?? [];

  const tabCounts = {
    ALL: applications.length,
    NEW: applications.filter((app) => {
      const s = (app.status ?? "").toUpperCase();
      return s === "SUBMITTED" || s === "UNDER_REVIEW";
    }).length,
    SHORTLISTED: applications.filter(
      (app) => (app.status ?? "").toUpperCase() === "SHORTLISTED",
    ).length,
    INTERVIEW: applications.filter(
      (app) => (app.status ?? "").toUpperCase() === "INTERVIEW",
    ).length,
    CONNECTED: applications.filter((app) => {
      const s = (app.status ?? "").toUpperCase();
      return s === "CONNECTED" || s === "CONTACTED" || s === "HIRED";
    }).length,
    CLOSED: applications.filter((app) => {
      const s = (app.status ?? "").toUpperCase();
      return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(s);
    }).length,
  };

  const filteredApps = applications.filter((app) => {
    const s = (app.status ?? "").toUpperCase();
    if (statusFilter === "ALL") return true;
    if (statusFilter === "NEW") return s === "SUBMITTED" || s === "UNDER_REVIEW";
    if (statusFilter === "SHORTLISTED") return s === "SHORTLISTED";
    if (statusFilter === "INTERVIEW") return s === "INTERVIEW";
    if (statusFilter === "CONNECTED") return s === "CONNECTED" || s === "CONTACTED" || s === "HIRED";
    if (statusFilter === "CLOSED") return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(s);
    return s === statusFilter;
  });

  const isRefreshing = listingQuery.isRefetching || applicantsQuery.isRefetching;
  const onRefresh = () => {
    void listingQuery.refetch();
    void applicantsQuery.refetch();
  };

  // The listing's own title; "Applicants" only until it loads, never a stand-in job title.
  // Hired for every vacancy: offer to close the job as filled (the server turns down the rest).
  const listing = listingQuery.data;
  const hiredCount = listing?.counts?.hired ?? 0;
  const isLive = listing?.status === "PUBLISHED";
  const offerFill = isLive && hiredCount > 0 && hiredCount >= (listing?.vacancies ?? 1);
  const fillMutation = useMutation({
    mutationFn: () => runListingAction(listingId, "fill"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-listing", listingId] });
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
      Alert.alert("Job closed", "Job closed as filled.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Could not close the job.");
    },
  });

  const listingTitle = listingQuery.data?.title || "Applicants";
  return (
    <View className="flex-1 bg-canvas">
      {/* Main Content Area */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* One back control: a small link above the summary, not a bar */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Listings Workspace"
          onPress={() => router.back()}
          hitSlop={8}
          className="mb-3 min-h-10 flex-row items-center gap-1.5 self-start rounded-full pr-3 active:opacity-70"
        >
          <ArrowLeft size={18} color="#071328" />
          <Text className="text-sm font-medium text-text">Back</Text>
        </Pressable>

        {/* Job summary: title, status, and the counts that matter */}
        <View className="overflow-hidden rounded-2xl border border-line bg-surface">
          <View className="p-4">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-xl font-bold tracking-tight text-text">{listingTitle}</Text>
              {/* Live pill: only while the job is actually live */}
              {isLive ? (
                <View className="flex-row items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1">
                  <View className="size-1.5 rounded-full bg-success" />
                  <Text className="text-xs font-semibold text-success-text">Live</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View className="flex-row border-t border-line">
            {[
              { label: "Applicants", value: applications.length },
              { label: "Shortlisted", value: listing?.counts?.shortlisted ?? 0 },
              { label: "Interviews", value: listing?.counts?.interviews ?? 0 },
              { label: "Views", value: listing?.counts?.views ?? 0 },
            ].map((stat, i) => (
              <View
                key={stat.label}
                className={`flex-1 items-center py-3 ${i > 0 ? "border-l border-line" : ""}`}
              >
                <Text className="text-lg font-bold text-text">{stat.value}</Text>
                <Text className="text-[11px] text-text-muted">{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {offerFill ? (
          <View className="mt-5 gap-3 rounded-2xl border border-success-line bg-success-surface p-4">
            <View className="gap-1">
              <Text className="text-sm font-semibold text-text">You have hired for this job</Text>
              <Text className="text-xs text-text-secondary">
                Close it as filled? Everyone still waiting will be told the position is filled.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={fillMutation.isPending}
              onPress={() => fillMutation.mutate()}
              className={`items-center rounded-xl bg-success py-2.5 active:opacity-90 ${
                fillMutation.isPending ? "opacity-60" : ""
              }`}
            >
              <Text className="text-sm font-semibold text-white">Close job as filled</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Segmented Control (Applications vs Matching candidates) */}
        <View className="mt-6 flex-row rounded-xl bg-surface-sunken p-1">
          <Pressable
            onPress={() => setSection("APPLICATIONS")}
            className={`flex-1 items-center justify-center rounded-lg py-2.5 ${
              section === "APPLICATIONS" ? "bg-white" : ""
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                section === "APPLICATIONS" ? "text-text" : "text-text-secondary"
              }`}
            >
              Applications ({applications.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSection("MATCHES")}
            className={`flex-1 items-center justify-center rounded-lg py-2.5 ${
              section === "MATCHES" ? "bg-white" : ""
            }`}
          >
            <Text
              className={`text-sm font-semibold text-center ${
                section === "MATCHES" ? "text-text" : "text-text-secondary"
              }`}
            >
              Matching candidates
            </Text>
          </Pressable>
        </View>

        {section === "APPLICATIONS" ? (
          <>
            {/* Filter Pills Grid */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-5 -mx-4"
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            >
              {FILTER_TABS.map((tab) => {
                const count = tabCounts[tab.key] ?? 0;
                const isSelected = statusFilter === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setStatusFilter(tab.key)}
                    className={`min-h-10 flex-row items-center rounded-full border px-4 ${
                      isSelected
                        ? "border-navy-900 bg-navy-900"
                        : "border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isSelected ? "text-white" : "text-text-secondary"
                      }`}
                    >
                      {tab.label}
                    </Text>
                    <View
                      className={`ml-1.5 rounded-full px-2 py-0.5 ${
                        isSelected ? "bg-white/20" : "bg-surface-sunken"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          isSelected ? "text-white" : "text-text-muted"
                        }`}
                      >
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Applications List */}
            <View className="mt-5">
              {applicantsQuery.isPending ? (
                <View className="items-center py-16">
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
                  title={
                    statusFilter === "ALL"
                      ? "No applications yet"
                      : "No candidates in this stage"
                  }
                  description={
                    statusFilter === "ALL"
                      ? "When candidates apply for this job opening, their profiles and resumes will appear here."
                      : "No candidates match the selected filter."
                  }
                />
              ) : (
                <View className="flex-col gap-3">
                  {filteredApps.map((app) => (
                    <ApplicantCard
                      key={app.id}
                      application={app}
                      onUpdateStatus={(target, newStatus) =>
                        statusMutation.mutate({ appId: target.id, status: newStatus })
                      }
                      onRevealContact={(target) => revealMutation.mutate(target.id)}
                      onScheduleInterview={(target) => setInterviewing(target)}
                      onReport={(target) => {
                        setReportingApp(target);
                        setReportReason("SPAM");
                        setReportDetail("");
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          /* Matching Candidates Section */
          <View className="mt-4">
            <JobMatches
              listingId={listingId}
              hiddenMatchCount={listingQuery.data?.counts?.matches ?? 0}
              onOpenApplications={() => setSection("APPLICATIONS")}
              onOpenSubscription={() => setShowSubscription(true)}
            />
          </View>
        )}
      </ScrollView>

      {/* Schedule Interview Modal Dialog */}
      <InterviewDialog
        open={interviewing !== null}
        candidateName={
          interviewing?.applicant_name ||
          interviewing?.candidate_name ||
          interviewing?.applicant_snapshot?.name ||
          "the candidate"
        }
        defaultLocation={listingQuery.data?.location_text || ""}
        isPending={interviewMutation.isPending}
        error={interviewMutation.error ? (interviewMutation.error as Error).message : null}
        onClose={() => setInterviewing(null)}
        onSubmit={(body) => interviewMutation.mutate(body)}
      />

      {/* Report Candidate Dialog */}
      <ReportApplicantDialog
        app={reportingApp}
        onClose={() => setReportingApp(null)}
        reason={reportReason}
        onReasonChange={setReportReason}
        detail={reportDetail}
        onDetailChange={setReportDetail}
        onSubmit={() => reportMutation.mutate()}
        isPending={reportMutation.isPending}
        error={reportMutation.error ? (reportMutation.error as Error).message : undefined}
      />

      {/* Hiring Subscription Plans Modal */}
      <SubscriptionDialog
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        plans={plansQuery.data ?? []}
        onSubscribe={(planId) => subscribeMutation.mutate(planId)}
        isPending={subscribeMutation.isPending}
      />
    </View>
  );
}
