// Ported from frontend/apps/customer/features/access/view/visit-detail-screen.tsx
import { canReadFullEstimates } from "@vsolve/query/native";
import { Badge, Button, ConfirmAction, EmptyState, Readout, Skeleton, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { calendarDay, formatVisitSlot, toVisitTrackerView, type VisitSlotRow } from "@/features/access/adapters";
import {
  useIssueVisitArrivalCode,
  useReportVendorNoShow,
  useVisitArrivalCode,
  useVisitPlan,
} from "@/features/access/queries";
import { AccessRefusal } from "@/features/access/view/access-refusal";
import { toQuoteListView } from "@/features/quotes/adapters";
import { useCustomerQuotes } from "@/features/quotes/queries";
import { requestEstimateHref, requestHref } from "@/lib/routes";

const STATE_BADGE = {
  awaiting: { label: "Waiting for a professional", tone: "neutral" },
  unmatched: { label: "No professional found", tone: "warning" },
  dropped: { label: "Dropped", tone: "neutral" },
  held: { label: "Holding a time for you", tone: "warning" },
  scheduled: { label: "Confirmed", tone: "success" },
  in_progress: { label: "On site", tone: "info" },
  completed: { label: "Visited", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  vendor_no_show: { label: "They did not come", tone: "danger" },
  customer_no_show: { label: "Nobody was on site", tone: "warning" },
} as const;

export function VisitDetail({ visitId }: { visitId: string }) {
  const params = useLocalSearchParams<{ requirementId?: string }>();
  const requirementId = typeof params.requirementId === "string" ? params.requirementId : null;
  const planQuery = useVisitPlan(requirementId);
  const codeQuery = useVisitArrivalCode(visitId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await planQuery.refetch();
    setRefreshing(false);
  };

  const tracker = planQuery.data === undefined ? null : toVisitTrackerView(planQuery.data);
  const row = tracker?.rows.find((candidate) => candidate.visitId === visitId) ?? null;

  if (requirementId === null) {
    return (
      <View className="flex-1 gap-3 bg-canvas px-4 py-6">
        <Text className="text-sm font-semibold text-text">Arrival code</Text>
        <Text className="text-4xl font-extrabold tracking-widest text-text">{codeQuery.data?.code ?? ""}</Text>
      </View>
    );
  }

  if (planQuery.isPending) {
    return (
      <View className="px-4 pb-28 pt-6">
        <Text className="sr-only">Loading this visit</Text>
        <Skeleton className="h-64 w-full" />
      </View>
    );
  }

  if (planQuery.error !== null && planQuery.error !== undefined) {
    return (
      <View className="px-4 pb-28 pt-6">
        <AccessRefusal
          error={planQuery.error}
          attempting="see this visit"
          onRetry={() => void planQuery.refetch()}
          inline={false}
        />
      </View>
    );
  }

  if (row === null) {
    return (
      <View className="px-4 pb-28 pt-6">
        <EmptyState
          title="We could not find that visit"
          description="It may have been cancelled, or the slot may have gone back. Your other visits are on the request."
          action={
            <Link href={requestHref(requirementId)} asChild>
              <Pressable className={buttonStyles({ variant: "outline" })}>
                <Text className="text-sm font-semibold text-text">Back to your request</Text>
              </Pressable>
            </Link>
          }
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pb-28 pt-6"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <VisitBreadcrumb requirementId={requirementId} position={row.position} planSize={tracker?.planSize ?? 1} />
      <VisitPrimary row={row} planSize={tracker?.planSize ?? 1} requirementId={requirementId} />
      <ArrivalCode visitId={visitId} enabled={row.state === "scheduled" || row.state === "in_progress"} />
      <NoShow row={row} requirementId={requirementId} />
    </ScrollView>
  );
}

function VisitBreadcrumb({
  requirementId,
  position,
  planSize,
}: {
  requirementId: string;
  position: number;
  planSize: number;
}) {
  const router = useRouter();
  return (
    <View className="mb-4 flex-row items-center gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/activity" as never);
          }
        }}
        className="size-9 items-center justify-center rounded-full border border-line bg-surface"
      >
        <ChevronLeft size={20} color="#00112e" />
      </Pressable>
      <Text className="flex-1 text-sm font-medium text-text-secondary">
        Bookings / Your request / <Text className="text-sm font-bold text-text">Visit {position} of {planSize}</Text>
      </Text>
      <Link href="/activity" asChild>
        <Pressable>
          <Text className="sr-only">Bookings</Text>
        </Pressable>
      </Link>
      <Link href={requestHref(requirementId)} asChild>
        <Pressable>
          <Text className="sr-only">Your request</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function VisitPrimary({
  row,
  planSize,
  requirementId,
}: {
  row: VisitSlotRow;
  planSize: number;
  requirementId: string;
}) {
  const planQuery = useVisitPlan(requirementId);
  const mayReadEstimates = planQuery.data !== undefined && canReadFullEstimates(planQuery.data);
  const estimatesQuery = useCustomerQuotes(requirementId, mayReadEstimates);
  const estimate =
    estimatesQuery.data === undefined
      ? null
      : (toQuoteListView(estimatesQuery.data).cards.find((card) => card.siteVisitId === row.visitId) ?? null);
  const badge = STATE_BADGE[row.state] ?? STATE_BADGE.awaiting;
  const when = formatVisitSlot(row.scheduledFor, row.timeZone);
  const day = calendarDay(row.scheduledFor, row.timeZone);

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-sm">
        {day === null ? null : (
          <View className="size-14 items-center justify-center rounded-control bg-action-secondary">
            <Text className="text-[0.625rem] font-bold uppercase text-action-secondary-text">{day.weekday}</Text>
            <Text className="text-2xl font-extrabold leading-none text-action-secondary-text">{day.dayOfMonth}</Text>
            <Text className="text-[0.625rem] font-bold uppercase text-action-secondary-text">{day.month}</Text>
          </View>
        )}
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-lg font-extrabold tracking-tight text-text">{when ?? "No time confirmed yet"}</Text>
          <Text className="text-sm font-medium text-text-secondary">
            Visit {row.position} of {planSize}
          </Text>
        </View>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </View>

      {row.vendor !== null ? (
        <View className="rounded-card border border-line bg-surface p-4">
          <Text className="text-sm font-semibold text-text">Who is coming</Text>
          <Text className="mt-3 text-base font-semibold text-text">{row.vendor.displayName ?? "Professional"}</Text>
          <Text className="mt-3 text-sm leading-6 text-text-secondary">
            You can reach them through us until the work is agreed. We pass messages on the same day.
          </Text>
        </View>
      ) : null}

      {estimate !== null ? (
        <View className="rounded-card border border-success-line bg-success-surface p-4">
          <Text className="text-xs font-bold uppercase tracking-wide text-success-text">Estimate ready</Text>
          <Text className="mt-1 text-lg font-extrabold text-text">{estimate.vendorName ?? "This professional"}</Text>
          <Text className="mt-1 text-sm text-text-secondary">
            {estimate.revision > 1 ? `Revision ${estimate.revision} · ` : ""}Written after this visit
          </Text>
          {estimate.isVerified ? <Badge tone="success">Verified</Badge> : null}
          <Text className="text-xl font-extrabold text-text">{estimate.payableLabel}</Text>
          <Link href={requestEstimateHref(requirementId, estimate.proposalId)} asChild>
            <Pressable className={buttonStyles({ variant: "outline", className: "mt-4 w-full justify-center" })}>
              <Text className="text-sm font-semibold text-text">Read this estimate in full</Text>
            </Pressable>
          </Link>
        </View>
      ) : mayReadEstimates && estimatesQuery.isPending && row.state === "completed" ? (
        <View>
          <Text className="sr-only">Loading the estimate from this visit</Text>
          <Skeleton className="h-40 w-full" />
        </View>
      ) : estimatesQuery.error !== null && row.state === "completed" ? (
        <AccessRefusal
          error={estimatesQuery.error}
          attempting="read the estimate from this visit"
          onRetry={() => void estimatesQuery.refetch()}
          inline={false}
        />
      ) : null}

      <View className="rounded-card border border-line bg-surface p-4 shadow-sm">
        <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-text-secondary">Held for this visit</Text>
        <Text className="mt-0.5 text-2xl font-extrabold text-text">{row.money.amountLabel}</Text>
      </View>
    </View>
  );
}

function ArrivalCode({ visitId, enabled }: { visitId: string; enabled: boolean }) {
  const codeQuery = useVisitArrivalCode(visitId, enabled);
  const issueCode = useIssueVisitArrivalCode();
  const [revealed, setRevealed] = useState(false);
  const code = codeQuery.data ?? null;
  if (code === null || (code.code === null && !code.can_issue)) return null;
  return (
    <View className="rounded-card border border-action-line bg-action-surface p-4">
      <Text className="text-sm font-semibold text-text">Arrival code</Text>
      {code.code !== null ? (
        revealed ? (
          <Readout
            label="Read this out when they arrive"
            value={code.code}
            spaced
            size="lg"
            announce={`Arrival code: ${code.code.split("").join(" ")}`}
            className="mt-2"
          />
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} className="mt-2 rounded-card border border-action-line bg-surface p-4">
            <Text className="text-xs font-bold uppercase tracking-[0.08em] text-text-secondary">Show only when they are with you</Text>
            <Text className="text-3xl font-bold tracking-[0.2em] text-warm-300">••••••</Text>
            <Text className="mt-2 self-start rounded-control bg-action px-4 py-2.5 text-sm font-extrabold text-action-text">Show code</Text>
          </Pressable>
        )
      ) : (
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          Your code has expired. Get a new one when the professional arrives — there is no rush to do it before then.
        </Text>
      )}
      {code.can_issue ? (
        <Button
          size="sm"
          variant="outline"
          onPress={() => issueCode.mutate({ siteVisitId: visitId })}
          loading={issueCode.isPending}
          loadingLabel="Getting a code"
        >
          {code.code === null ? "Get a code" : "Get a new code"}
        </Button>
      ) : null}
      <AccessRefusal error={issueCode.error} attempting="get an arrival code" />
    </View>
  );
}

function NoShow({
  row,
  requirementId,
}: {
  row: VisitSlotRow;
  requirementId: string;
}) {
  const noShow = useReportVendorNoShow();
  const [reporting, setReporting] = useState(false);
  if (row.visitId === null || !row.canReportNoShow) return null;
  return (
    <View>
      <Button variant="ghost" onPress={() => setReporting(true)}>
        They did not turn up
      </Button>
      <ConfirmAction
        open={reporting}
        onOpenChange={setReporting}
        title="Tell us they did not come?"
        consequence="This visit will not cost you anything, and we will either refund its share of the plan or send another professional free. It also counts against them, so only do this if nobody turned up."
        confirmLabel="Yes, nobody came"
        pending={noShow.isPending}
        onConfirm={() => {
          setReporting(false);
          if (row.visitId === null) return;
          noShow.mutate({ siteVisitId: row.visitId, requirementId, reasonCode: "VENDOR_DID_NOT_ARRIVE" });
        }}
      />
      <AccessRefusal error={noShow.error} attempting="update this visit" />
    </View>
  );
}
