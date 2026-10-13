import { Button, EmptyState, ErrorState, Spinner, Text, cn } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, Sparkles, Users } from "lucide-react-native";

import {
  type PartnerApplication,
} from "../model";
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

const TABS = [
  { key: "ALL", label: "All" },
  { key: "NEW", label: "New" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "CONNECTED", label: "Connected" },
  { key: "CLOSED", label: "Closed" },
];

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
            <Text className="text-lg font-extrabold text-navy-900" numberOfLines={1}>
              {listingQuery.data?.title || "Role Candidates"}
            </Text>
            <Text className="text-xs text-text-muted">
              {applications.length} total applicant{applications.length === 1 ? "" : "s"} received
            </Text>
          </View>
        </View>

        {/* Section Segment (Applications vs Matching Candidates) */}
        <View className="mt-3 flex-row rounded-xl bg-surface-muted p-1">
          <Pressable
            onPress={() => setSection("APPLICATIONS")}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${
              section === "APPLICATIONS" ? "bg-white shadow-xs" : ""
            }`}
          >
            <Users size={14} color={section === "APPLICATIONS" ? "#00112e" : "#64748b"} />
            <Text
              className={`text-xs font-bold ${
                section === "APPLICATIONS" ? "text-navy-900" : "text-text-muted"
              }`}
            >
              Applicants ({applications.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSection("MATCHES")}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${
              section === "MATCHES" ? "bg-white shadow-xs" : ""
            }`}
          >
            <Sparkles size={14} color={section === "MATCHES" ? "#f59e0b" : "#64748b"} />
            <Text
              className={`text-xs font-bold ${
                section === "MATCHES" ? "text-navy-900" : "text-text-muted"
              }`}
            >
              Matching Talent
            </Text>
          </Pressable>
        </View>

        {/* Pipeline Stage Pills (Only shown in Applications view) */}
        {section === "APPLICATIONS" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3"
            contentContainerClassName="flex-row gap-2"
          >
            {TABS.map((tab) => {
              const count = applications.filter((app) => {
                const s = (app.status ?? "").toUpperCase();
                if (tab.key === "ALL") return true;
                if (tab.key === "NEW") return s === "SUBMITTED" || s === "UNDER_REVIEW";
                if (tab.key === "SHORTLISTED") return s === "SHORTLISTED";
                if (tab.key === "INTERVIEW") return s === "INTERVIEW";
                if (tab.key === "CONNECTED") return s === "CONNECTED" || s === "CONTACTED";
                if (tab.key === "CLOSED") return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(s);
                return s === tab.key;
              }).length;

              const isSelected = statusFilter === tab.key;
              return (
                <Button
                  key={tab.key}
                  variant="ghost"
                  size="sm"
                  onPress={() => setStatusFilter(tab.key)}
                  className={cn(
                    "h-7 rounded-full px-3",
                    isSelected ? "bg-navy-900" : "bg-surface-muted",
                  )}
                >
                  <Text
                    className={cn(
                      "text-[11px] font-bold",
                      isSelected ? "text-white" : "text-text-muted",
                    )}
                  >
                    {tab.label} {count > 0 ? `(${count})` : ""}
                  </Text>
                </Button>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        className="flex-1 px-4 py-4"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        contentContainerClassName="flex-grow pb-16"
      >
        {section === "APPLICATIONS" ? (
          applicantsQuery.isPending ? (
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
          )
        ) : (
          <JobMatches
            listingId={listingId}
            onOpenApplications={() => setSection("APPLICATIONS")}
            onOpenSubscription={() => setShowSubscription(true)}
          />
        )}
      </ScrollView>

      {/* Schedule Interview Modal Dialog */}
      <InterviewDialog
        open={interviewing !== null}
        candidateName={
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
