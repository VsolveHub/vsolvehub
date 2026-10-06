// Ported from frontend/apps/partner/features/application/view/application-overview.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

import { progressSummary, stepProgress } from "../model/progress";
import { canSubmit, isEditable, rejectedDocuments } from "../model/readiness";
import { usePartnerApplication } from "../queries";
import { ApplicationStatusBanner } from "./status-banner";

const DOCUMENT_LABELS: Record<string, string> = {
  GOVERNMENT_ID: "Government photo ID",
  ADDRESS_PROOF: "Proof of address",
  TAX: "Tax document",
  BANK: "Bank document",
  BACKGROUND_CHECK: "Background check",
  OTHER: "Other document",
};

type Application = Schemas["PartnerApplication"];

export function ApplicationOverview() {
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <View accessibilityLabel="Loading your application" className="gap-4 px-4 py-4">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-14 w-full rounded-control" />
        <Skeleton className="h-40 w-full rounded-card" />
      </View>
    );
  }
  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="We could not load your application"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }
  if (isMissing || query.data === undefined) return <NotStarted />;
  return <Standing application={query.data} />;
}

function NotStarted() {
  const router = useRouter();
  return (
    <View className="gap-5 px-4 py-4">
      <View className="items-center gap-3 rounded-card bg-navy-900 px-5 py-7">
        <Text className="text-center text-[1.375rem] font-extrabold text-white">Start your application</Text>
        <Text className="text-center text-[0.9375rem] leading-relaxed text-white">
          About five minutes. You can stop and come back — nothing is sent for review until you choose to send it.
        </Text>
      </View>
      <Text className="text-[0.9375rem] text-text-secondary">You choose which areas you travel to</Text>
      <Text className="text-[0.9375rem] text-text-secondary">You choose the hours you work</Text>
      <Text className="text-[0.9375rem] text-text-secondary">Nothing is shared with customers until you are approved</Text>
      <Button onPress={() => router.push("/apply/about")}>Begin</Button>
    </View>
  );
}

function Standing({ application }: { application: Application }) {
  const router = useRouter();
  const steps = stepProgress(application).filter((step) => step.state !== "waypoint");
  const summary = progressSummary(application);
  const rejected = rejectedDocuments(application);
  const editable = isEditable(application);
  const ready = canSubmit(application);
  const percent = Math.round(summary.fraction * 100);
  const remaining = summary.total - summary.done;
  const nextHref = ready ? "/apply/review" : (summary.nextIncomplete?.href ?? "/apply/review");

  return (
    <ScrollView contentContainerClassName="gap-6 px-4 py-4 pb-20">
      <ApplicationStatusBanner application={application} />
      {rejected.length > 0 ? (
        <View className="gap-2 rounded-2xl border border-warning-line bg-warning-surface p-5">
          <Text className="text-sm font-bold text-warning-text">
            Action Required: Replace {rejected.length === 1 ? "this document" : "these documents"}
          </Text>
          {rejected.map((document) => (
            <View key={document.id} className="rounded-control border border-warning-line bg-surface p-3">
              <Text className="text-xs font-bold text-warning-text">{DOCUMENT_LABELS[document.kind] ?? document.kind}</Text>
              {document.review_reason ? <Text className="mt-1 text-xs text-text-secondary">{document.review_reason}</Text> : null}
            </View>
          ))}
          <Button onPress={() => router.push("/apply/documents")}>Upload Replacement Documents</Button>
        </View>
      ) : null}
      {editable ? (
        <View className="gap-4 rounded-3xl bg-navy-900 p-6">
          <Text className="text-xs font-bold uppercase text-white">Application Progress</Text>
          <Text className="text-xs font-bold text-white">
            {ready ? "All Required Steps Done" : `${summary.done} of ${summary.total} Completed`}
          </Text>
          <Text className="text-2xl font-bold text-white">
            {ready ? "Application Complete!" : `${remaining} ${remaining === 1 ? "step" : "steps"} remaining`}
          </Text>
          <Text className="text-sm text-white">
            {ready
              ? "All required steps are filled. Review your profile details and submit for verification."
              : `Next up: Complete your ${summary.nextIncomplete?.label.toLowerCase() ?? "documents"} to submit for fast 24h approval.`}
          </Text>
          <Text className="text-sm font-bold text-white">Overall Completion {percent}%</Text>
          <Button onPress={() => router.push(nextHref as never)}>
            {ready ? "Review & Submit Application" : `Continue to ${summary.nextIncomplete?.label ?? "Next Step"}`}
          </Button>
        </View>
      ) : null}
      <Text className="text-xs font-bold uppercase text-text">Application Checklist</Text>
      {steps.map((step) => (
        <Pressable key={step.href} onPress={() => router.push(step.href as never)} className="rounded-card border border-line bg-surface p-4">
          <Text className="text-sm font-bold text-text">{step.label}</Text>
          <Text className="mt-1 text-xs text-text-secondary">{step.state}</Text>
        </Pressable>
      ))}
      <View className="rounded-3xl border border-line bg-surface p-6">
        <Text className="text-base font-bold text-text">Contractor & Multi-Crew Supply</Text>
        <Text className="mt-1 text-xs text-text-secondary">
          Have a crew of 3+ technicians? Dispatch work teams and bid for custom corporate contracts.
        </Text>
        <Button variant="outline" onPress={() => router.push("/apply/capabilities")}>
          Explore Crew Rates
        </Button>
      </View>
    </ScrollView>
  );
}
