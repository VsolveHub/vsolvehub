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
  purchaseSubscription,
  reportApplicantApplication,
  revealApplicationContact,
  updateApplicationStatus,
} from "../queries";
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
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const subscribeMutation = useMutation({
    mutationFn: (planId: string) => purchaseSubscription(planId),
    onSuccess: () => {
      setShowSubscription(false);
      Alert.alert("Success", "Subscription plan upgraded successfully!");
      void queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-subscriptions"] });
    },
    onError: (err: any) => {
      Alert.alert("Subscription Error", err?.message || "Failed to upgrade subscription.");
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
      return s === "CONNECTED" || s === "CONTACTED";
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
    if (statusFilter === "CONNECTED") return s === "CONNECTED" || s === "CONTACTED";
    if (statusFilter === "CLOSED") return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(s);
    return s === statusFilter;
  });

  const isRefreshing = listingQuery.isRefetching || applicantsQuery.isRefetching;
  const onRefresh = () => {
    void listingQuery.refetch();
    void applicantsQuery.refetch();
  };

  const listingTitle = listingQuery.data?.title || "Cashier";
  const serviceSubtitle = `${
    listingQuery.data?.service_name || "Job listings (hiring partner)"
  } • ${applications.length} total applicant(s) received`;

  return (
    <View className="flex-1 bg-[#faf8f5]">
      {/* Main Content Area */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Back Link Breadcrumb */}
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center gap-1.5 self-start py-1"
        >
          <ArrowLeft size={14} color="#64748b" />
          <Text className="text-sm font-medium text-[#64748b]">
            Back to Listings Workspace
          </Text>
        </Pressable>

        {/* Job Title */}
        <Text className="mt-2 text-2xl font-bold tracking-tight text-[#071328]">
          {listingTitle}
        </Text>

        {/* Subtitle */}
        <Text className="mt-1 text-xs text-[#64748b]">
          {serviceSubtitle}
        </Text>

        {/* Live & Active Status Pill */}
        <View className="mt-2.5 w-full rounded-full border border-emerald-200 bg-emerald-50/70 px-3.5 py-1">
          <Text className="text-xs font-semibold text-emerald-800">
            Live & Active
          </Text>
        </View>

        {/* Segmented Control (Applications vs Matching candidates) */}
        <View className="mt-5 rounded-2xl bg-[#f4efe8] p-1.5 flex-row border border-[#e8e2d9]">
          <Pressable
            onPress={() => setSection("APPLICATIONS")}
            className={`flex-1 rounded-xl py-3 items-center justify-center ${
              section === "APPLICATIONS" ? "bg-white shadow-xs" : ""
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                section === "APPLICATIONS" ? "text-[#071328]" : "text-[#475569]"
              }`}
            >
              Applications ({applications.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSection("MATCHES")}
            className={`flex-1 rounded-xl py-3 items-center justify-center ${
              section === "MATCHES" ? "bg-white shadow-xs" : ""
            }`}
          >
            <Text
              className={`text-sm font-bold text-center ${
                section === "MATCHES" ? "text-[#071328]" : "text-[#475569]"
              }`}
            >
              Matching candidates
            </Text>
          </Pressable>
        </View>

        {section === "APPLICATIONS" ? (
          <>
            {/* Filter Pills Grid */}
            <View className="mt-5 flex-row flex-wrap gap-2">
              {FILTER_TABS.map((tab) => {
                const count = tabCounts[tab.key] ?? 0;
                const isSelected = statusFilter === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setStatusFilter(tab.key)}
                    className={`rounded-full px-3.5 py-1.5 flex-row items-center border ${
                      isSelected
                        ? "bg-[#071328] border-[#071328]"
                        : "bg-white border-[#e2e8f0]"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isSelected ? "text-white" : "text-[#334155]"
                      }`}
                    >
                      {tab.label}
                    </Text>
                    <View
                      className={`ml-1.5 rounded-full px-2 py-0.5 ${
                        isSelected ? "bg-[#1e293b]" : "bg-[#f1f5f9]"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          isSelected ? "text-white" : "text-[#64748b]"
                        }`}
                      >
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Applications List */}
            <View className="mt-4">
              {applicantsQuery.isPending ? (
                <View className="items-center py-16">
                  <Spinner size="lg" />
                  <Text className="mt-2 text-xs text-[#64748b]">Loading applicants...</Text>
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
                <View className="flex-col gap-4">
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
