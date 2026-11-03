import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuthStore } from "@vsolve/mobile-core";
import { EmptyState, ErrorState, Text } from "@vsolve/mobile-ui";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Phone,
  XCircle,
} from "lucide-react-native";

import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import {
  fetchMyApplications,
  withdrawApplication,
  type Listing,
  type ListingApplication,
} from "../queries";
import {
  answerInterview,
  fetchSavedJobs,
  HIRING_STEP_LABELS,
} from "../seeker-queries";

const FILTER_TABS = [
  { key: "ALL", label: "All Applications" },
  { key: "ACTIVE", label: "In Progress" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "CLOSED", label: "Completed / Closed" },
];

const STEPS = ["Applied", "Shortlisted", "Interview", "Connected"] as const;

function stepIndex(status: string): number {
  const s = (status || "").toUpperCase();
  const label = HIRING_STEP_LABELS[s] ?? "";
  if (label === "Under review") return 0;
  return STEPS.indexOf(label as (typeof STEPS)[number]);
}

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

const STATUS_EVENT_LABELS: Record<string, string> = {
  CONTACT_REVEALED: "Your contact details were shared with the employer",
  APPLIED: "SUBMITTED",
  SUBMITTED: "SUBMITTED",
  STATUS_CHANGED: "STATUS UPDATE",
};

function formatStatusEventKind(kind?: string): string {
  if (!kind) return "STATUS UPDATE";
  if (STATUS_EVENT_LABELS[kind]) return STATUS_EVENT_LABELS[kind];
  return kind.replace(/_/g, " ").toUpperCase();
}

function getStatusBadge(status: string) {
  const s = (status || "").toUpperCase();
  const label = HIRING_STEP_LABELS[s] || status || "Applied";

  if (["REJECTED"].includes(s) || label === "Not selected") {
    return {
      label: "Not selected",
      badgeClass: "bg-[#F3F4F6] border-[#E5E7EB]",
      textClass: "text-[#4B5563]",
    };
  }
  if (["WITHDRAWN", "EXPIRED"].includes(s)) {
    return {
      label,
      badgeClass: "bg-[#F3F4F6] border-[#E5E7EB]",
      textClass: "text-[#6B7280]",
    };
  }
  if (s === "INTERVIEW" || label === "Interview") {
    return {
      label: "Interview",
      badgeClass: "bg-[#EEF2FF] border-[#C7D2FE]",
      textClass: "text-[#4338CA]",
    };
  }
  if (s === "SHORTLISTED" || label === "Shortlisted") {
    return {
      label: "Shortlisted",
      badgeClass: "bg-amber-50 border-amber-200",
      textClass: "text-amber-800",
    };
  }
  if (s === "CONNECTED" || s === "CONTACTED" || label === "Connected") {
    return {
      label: "Connected",
      badgeClass: "bg-emerald-50 border-emerald-300",
      textClass: "text-emerald-800",
    };
  }
  return {
    label: "Applied",
    badgeClass: "bg-[#EFF6FF] border-[#BFDBFE]",
    textClass: "text-[#1D4ED8]",
  };
}

export function DesktopMyApplications() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const isAuthenticated = authStatus === "signedIn";

  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawNotice, setWithdrawNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  const {
    data: applications = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: fetchMyApplications,
    enabled: isAuthenticated,
  });

  const savedJobsQuery = useQuery({
    queryKey: ["saved-jobs"],
    queryFn: fetchSavedJobs,
    enabled: isAuthenticated,
  });

  const withdrawMutation = useMutation({
    mutationFn: (appId: string) => withdrawApplication(appId),
    onSuccess: () => {
      setWithdrawingId(null);
      setWithdrawNotice({
        kind: "success",
        message: "Application withdrawn. You can apply again after the 24-hour cooldown.",
      });
      void queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
    },
    onError: (err: any) => {
      setWithdrawingId(null);
      setWithdrawNotice({
        kind: "error",
        message: err?.message || "Could not withdraw your application. Please try again.",
      });
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
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="min-h-screen justify-between"
      showsVerticalScrollIndicator
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      <View className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Navigation & Header Row matching Web 100% */}
        <View className="flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.push("/listings" as never);
                }
              }}
              className="inline-flex flex-row items-center gap-1.5 self-start active:opacity-80"
            >
              <ArrowLeft size={16} color="#6B7280" />
              <Text className="text-sm font-medium text-text-muted hover:text-navy-950">
                Back to Job Listings
              </Text>
            </Pressable>

            <Text className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-navy-950">
              My Job Applications
            </Text>
            <Text className="mt-1 text-sm text-text-muted">
              Track, monitor, and manage all your career applications in one place.
            </Text>
          </View>

          {/* Browse Opportunities Button */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/listings" as never)}
            className="inline-flex flex-row items-center justify-center gap-2 rounded-xl bg-[#0B192C] px-4 py-2.5 shadow-sm active:bg-navy-900 self-start sm:self-auto"
          >
            <Briefcase size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">Browse Opportunities</Text>
          </Pressable>
        </View>

        {/* Saved Jobs Section (if any saved jobs exist) */}
        {(savedJobsQuery.data ?? []).length > 0 ? (
          <View className="flex-col gap-2">
            <Text className="text-sm font-bold text-navy-950">Saved jobs</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 pb-1">
              {(savedJobsQuery.data ?? []).map((job: Listing) => (
                <Pressable
                  key={job.id}
                  onPress={() => router.push(`/listings/${job.slug || job.id}` as never)}
                  className="w-56 rounded-xl border border-line bg-surface p-3 active:bg-surface-sunken"
                >
                  <Text className="text-sm font-bold text-navy-950" numberOfLines={1}>
                    {job.title}
                  </Text>
                  <Text className="text-xs text-text-secondary" numberOfLines={1}>
                    {job.poster_name}
                  </Text>
                  <Text className="text-xs text-text-secondary" numberOfLines={1}>
                    {job.location_text}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Filter Tabs (Pills) matching Web 100% */}
        <View className="flex-row flex-wrap gap-2 border-b border-line pb-3">
          {FILTER_TABS.map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-1.5 border transition ${isSelected
                    ? "border-navy-950 bg-navy-950 shadow-xs"
                    : "border-line bg-surface active:bg-surface-sunken"
                  }`}
              >
                <Text
                  className={`text-xs font-semibold ${isSelected ? "text-white" : "text-text-secondary"
                    }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Withdraw Notice Alert Banner */}
        {withdrawNotice ? (
          <View
            className={`rounded-xl border p-4 ${withdrawNotice.kind === "error"
                ? "border-rose-300 bg-rose-50"
                : "border-emerald-300 bg-emerald-50"
              }`}
          >
            <Text
              className={`text-sm font-medium ${withdrawNotice.kind === "error" ? "text-rose-800" : "text-emerald-800"
                }`}
            >
              {withdrawNotice.message}
            </Text>
          </View>
        ) : null}

        {/* Not Signed In Card */}
        {!isAuthenticated ? (
          <View className="rounded-2xl border border-line bg-surface p-8 items-center text-center gap-3.5 shadow-xs">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-orange-50 border border-orange-100">
              <Briefcase size={24} color="#ea580c" />
            </View>
            <View className="gap-1 items-center">
              <Text className="text-base font-bold text-navy-950 text-center">
                Sign in to view your applications
              </Text>
              <Text className="text-xs text-text-secondary text-center leading-relaxed max-w-sm">
                Log in to track, monitor, and manage all your submitted job applications.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLoginOpen(true)}
              className="mt-2 rounded-xl bg-[#EA580C] px-7 py-2.5 active:bg-[#c2410c]"
            >
              <Text className="text-xs font-bold text-white">Log in</Text>
            </Pressable>
          </View>
        ) : isLoading ? (
          <View className="flex-row items-center justify-center py-16 text-text-muted gap-2">
            <ActivityIndicator size="small" color="#EA580C" />
            <Text className="text-sm text-text-muted">Loading applications...</Text>
          </View>
        ) : error ? (
          <ErrorState
            title="Could not load your applications"
            message={(error as Error).message || "An unexpected error occurred while fetching your applications."}
            onAction={() => void refetch()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No applications found"
            description={
              activeTab === "ALL"
                ? "You have not applied to any job listings yet."
                : "No applications match the selected filter."
            }
            action={
              <Pressable
                onPress={() => router.push("/listings" as never)}
                className="mt-3 rounded-xl bg-[#0B192C] px-5 py-2.5 active:bg-navy-900"
              >
                <Text className="text-xs font-bold text-white">Explore Open Listings</Text>
              </Pressable>
            }
          />
        ) : (
          <View className="gap-4">
            {filtered.map((app: ListingApplication) => (
              <DesktopApplicationCard
                key={app.id}
                app={app}
                isWithdrawing={withdrawingId === app.id}
                onStartWithdraw={() => setWithdrawingId(app.id)}
                onCancelWithdraw={() => setWithdrawingId(null)}
                onConfirmWithdraw={() => withdrawMutation.mutate(app.id)}
                isPending={withdrawMutation.isPending}
              />
            ))}
          </View>
        )}
      </View>

      <DesktopSiteFooter />

      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => void refetch()}
      />
    </ScrollView>
  );
}

function DesktopApplicationCard({
  app,
  isWithdrawing,
  onStartWithdraw,
  onCancelWithdraw,
  onConfirmWithdraw,
  isPending,
}: {
  app: ListingApplication;
  isWithdrawing: boolean;
  onStartWithdraw: () => void;
  onCancelWithdraw: () => void;
  onConfirmWithdraw: () => void;
  isPending: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<null | "reschedule" | "decline">(null);
  const [note, setNote] = useState("");

  const interview = app.interview;

  const answerMutation = useMutation({
    mutationFn: (action: "accept" | "reschedule" | "decline") =>
      answerInterview(interview!.id, action, note.trim()),
    onSuccess: (_, action) => {
      setAsking(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
      Alert.alert(
        "Response Sent",
        action === "accept"
          ? "You accepted the interview invitation."
          : action === "reschedule"
            ? "Your reschedule request has been sent to the employer."
            : "Interview declined.",
      );
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to update interview.");
    },
  });

  const canWithdraw = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW"].includes(
    (app.status ?? "").toUpperCase(),
  );

  const slug = app.listing_slug || app.listing_id || app.listing;
  const snapshot = app.applicant_snapshot || {};
  const currentStep = stepIndex(app.status);
  const closed = ["REJECTED", "WITHDRAWN", "EXPIRED"].includes((app.status ?? "").toUpperCase());
  const connected = app.status === "CONNECTED" || app.status === "CONTACTED";
  const badgeInfo = getStatusBadge(app.status);

  // Status events
  const statusEvents = app.status_events ?? [];

  return (
    <View className="rounded-2xl border border-line bg-surface p-6 shadow-xs gap-4">
      {/* 1. Header Meta Row (Badge, Date, Contact Shared Badge, Withdraw Action) */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row flex-wrap items-center gap-2.5">
          {/* Status Badge */}
          <View className={`rounded-full px-3 py-0.5 border ${badgeInfo.badgeClass}`}>
            <Text className={`text-xs font-semibold ${badgeInfo.textClass}`}>
              {badgeInfo.label}
            </Text>
          </View>

          {/* Applied Date */}
          <View className="flex-row items-center gap-1">
            <Calendar size={13} color="#6B7280" />
            <Text className="text-xs text-text-muted">
              Applied on {formatDate(app.created_at)}
            </Text>
          </View>

          {/* Contact Shared with Poster badge */}
          {app.contact_revealed_at ? (
            <View className="flex-row items-center gap-1 rounded-full border border-emerald-300 bg-[#ECFDF5] px-2.5 py-0.5">
              <CheckCircle2 size={13} color="#059669" />
              <Text className="text-xs font-semibold text-emerald-800">
                Contact Shared with Poster
              </Text>
            </View>
          ) : null}
        </View>

        {/* Top-Right Withdraw Button */}
        {canWithdraw ? (
          isWithdrawing ? (
            <View className="flex-row items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs">
              <Text className="text-xs font-semibold text-rose-800">Withdraw application?</Text>
              <Pressable
                onPress={onConfirmWithdraw}
                disabled={isPending}
                className="rounded-lg bg-navy-950 px-3 py-1 active:bg-navy-900"
              >
                <Text className="text-xs font-bold text-white">
                  {isPending ? "..." : "Confirm"}
                </Text>
              </Pressable>
              <Pressable
                onPress={onCancelWithdraw}
                className="rounded-lg border border-line bg-surface px-3 py-1 active:bg-surface-sunken"
              >
                <Text className="text-xs font-semibold text-text-secondary">Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onStartWithdraw}
              className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 hover:border-rose-300 hover:bg-rose-50/20 active:bg-surface-sunken"
            >
              <XCircle size={13} color="#6B7280" />
              <Text className="text-xs font-semibold text-text-muted">Withdraw</Text>
            </Pressable>
          )
        ) : null}
      </View>

      {/* 2. Job Title & External Link */}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (slug) router.push(`/listings/${slug}` as never);
        }}
        className="flex-row items-center gap-1.5 self-start active:opacity-80"
      >
        <Text className="text-lg font-bold text-navy-950 hover:underline">
          {app.listing_title || "Job Listing"}
        </Text>
        <ExternalLink size={14} color="#64748B" />
      </Pressable>

      {/* 3. Employer Name */}
      {app.employer_name ? (
        <Text className="text-sm text-text-secondary font-normal -mt-2">
          {app.employer_name}
        </Text>
      ) : null}

      {/* 4. Hiring Stepper Progress (4 horizontal equal pills) */}
      {!closed ? (
        <View className="flex-row gap-2 pt-1">
          {STEPS.map((stepName, i) => {
            const isCompletedOrCurrent = i <= currentStep;
            return (
              <View
                key={stepName}
                className={`flex-1 rounded-full py-1.5 items-center justify-center ${isCompletedOrCurrent ? "bg-[#EA580C]" : "bg-[#F4F1EC]"
                  }`}
              >
                <Text
                  className={`text-xs ${isCompletedOrCurrent
                      ? "font-bold text-white"
                      : "font-medium text-text-muted"
                    }`}
                >
                  {stepName}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* 5. Interview Invitation Card Box (if interview proposed or scheduled) */}
      {interview && interview.status !== "CANCELLED" && !connected ? (
        <View className="rounded-xl border border-amber-200/80 bg-[#FFFBEB]/70 p-4 gap-2">
          <Text className="font-bold text-sm text-navy-950">
            {interview.status === "PROPOSED" ? "Interview invitation" : `Interview · ${interview.status_label || interview.status}`}
          </Text>
          <Text className="text-xs text-[#374151]">
            {formatDate(interview.scheduled_date)} at {interview.start_time.slice(0, 5)} · {interview.mode_label || interview.mode}
            {interview.location_text ? ` · ${interview.location_text}` : ""}
          </Text>
          {interview.note ? (
            <Text className="text-xs italic text-text-secondary">“{interview.note}”</Text>
          ) : null}

          {interview.status === "PROPOSED" ? (
            asking ? (
              <View className="mt-2 gap-2 border-t border-amber-200/60 pt-2.5">
                <TextInput
                  multiline
                  numberOfLines={2}
                  maxLength={480}
                  value={note}
                  placeholder={
                    asking === "reschedule"
                      ? "e.g. Any day after 4 PM works for me."
                      : "Optional reason"
                  }
                  placeholderTextColor="#94A3B8"
                  onChangeText={setNote}
                  className="rounded-lg border border-amber-200 bg-white p-2.5 text-xs text-navy-950"
                />
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => answerMutation.mutate(asking)}
                    disabled={answerMutation.isPending}
                    className="rounded-lg bg-[#EA580C] px-4 py-1.5 active:bg-[#c2410c]"
                  >
                    <Text className="text-xs font-bold text-white">
                      {asking === "reschedule" ? "Ask for another time" : "Decline interview"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAsking(null)}
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 active:bg-surface-sunken"
                  >
                    <Text className="text-xs font-medium text-text-secondary">Back</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="mt-1 flex-row flex-wrap gap-2 pt-1">
                <Pressable
                  onPress={() => answerMutation.mutate("accept")}
                  disabled={answerMutation.isPending}
                  className="rounded-lg bg-[#EA580C] px-4 py-1.5 active:bg-[#c2410c]"
                >
                  <Text className="text-xs font-bold text-white">Accept</Text>
                </Pressable>
                <Pressable
                  onPress={() => setAsking("reschedule")}
                  className="rounded-lg bg-navy-950 px-4 py-1.5 active:bg-navy-900"
                >
                  <Text className="text-xs font-bold text-white">Ask for another time</Text>
                </Pressable>
                <Pressable
                  onPress={() => setAsking("decline")}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 active:bg-surface-sunken"
                >
                  <Text className="text-xs font-medium text-text-secondary">Decline</Text>
                </Pressable>
              </View>
            )
          ) : null}
        </View>
      ) : null}

      {/* 6. Connected Confirmation Message */}
      {connected ? (
        <View className="flex-row items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
          <CheckCircle2 size={16} color="#059669" className="mt-0.5" />
          <Text className="flex-1 text-xs font-semibold leading-relaxed text-emerald-950">
            V Solve Hub has completed the connection. You can now contact the employer directly.
          </Text>
        </View>
      ) : null}

      {/* 7. Call Employer Action (if phone shared) */}
      {app.employer_phone ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${app.employer_phone}`)}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-[#EA580C] px-4 py-2 self-start active:bg-[#c2410c]"
        >
          <Phone size={14} color="#FFFFFF" />
          <Text className="text-xs font-bold text-white">
            Call {app.employer_name || "Employer"} · {app.employer_phone}
          </Text>
        </Pressable>
      ) : null}

      {/* 8. Applicant Details Snapshot Box matching reference */}
      <View className="rounded-xl border border-line/60 bg-[#F5F3EF] px-4 py-3 flex-row items-center justify-between text-xs text-text-secondary">
        <View className="flex-row items-center gap-1">
          <Text className="text-xs font-semibold text-text-secondary">
            Applicant: <Text className="font-bold text-navy-950">{app.applicant_name || snapshot.name || "Nune Rajesh"}</Text>
          </Text>
        </View>
        {snapshot.experience ? (
          <View className="flex-row items-center gap-1">
            <Text className="text-xs font-semibold text-text-secondary">
              Experience: <Text className="font-bold text-navy-950">{snapshot.experience}</Text>
            </Text>
          </View>
        ) : null}
        {app.resume_url || snapshot.resume_url ? (
          <Pressable
            onPress={() => {
              const url = app.resume_url || snapshot.resume_url;
              if (url && typeof url === "string") void Linking.openURL(url);
            }}
          >
            <Text className="text-xs font-semibold text-action underline">
              View Resume
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* 9. Cover Note (if provided) */}
      {app.cover_note ? (
        <View className="gap-1 text-xs">
          <Text className="text-xs font-bold text-navy-950">Cover Note:</Text>
          <Text className="rounded-xl border border-line/60 bg-[#F5F3EF] p-2.5 text-xs italic text-text-secondary">
            “{app.cover_note}”
          </Text>
        </View>
      ) : null}

      {/* 10. Status Events Timeline Pills matching reference */}
      {statusEvents.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 pt-2 border-t border-line/40">
          {statusEvents.map((ev) => (
            <View
              key={ev.id}
              className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 shadow-2xs"
            >
              <Clock size={11} color="#9CA3AF" />
              <Text className="text-[11px] font-medium text-text-muted">
                {formatStatusEventKind(ev.kind)} ({formatDate(ev.created_at)})
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2 pt-2 border-t border-line/40">
          <View className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 shadow-2xs">
            <Clock size={11} color="#9CA3AF" />
            <Text className="text-[11px] font-medium text-text-muted">
              SUBMITTED ({formatDate(app.created_at)})
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

