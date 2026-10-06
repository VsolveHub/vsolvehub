// Ported from frontend/apps/partner/features/visit/view/visit-now-card.tsx
import { Badge, Card, ErrorState, FactTile, Readout, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { timeOnlyInZone } from "@/features/visit/model/visit-clock";
import type { SiteVisitStatus } from "@/features/visit/model/visit-state";
import { Pictogram, type PictogramName } from "@/features/work-stack/view/pictogram";

import type { VisitDayControls } from "./use-visit-day";

function timeAgo(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date);
  return date.toDateString() === today.toDateString()
    ? `Today, ${time}`
    : `${new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date)}, ${time}`;
}

export function VisitNowCard({
  controls,
  enquiry,
  estimateSubmitted = false,
  isRefreshing = false,
}: {
  readonly controls: VisitDayControls;
  readonly enquiry: EnquiryRecord;
  readonly estimateSubmitted?: boolean;
  readonly isRefreshing?: boolean;
}) {
  const { visit, status, timing } = controls;
  return (
    <Card className="flex-col gap-4 p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-lg font-bold text-text">Your visit</Text>
        <Badge tone={TONE[status.tone]} dot>{status.label}</Badge>
      </View>
      <VisitProgress status={visit.status} />
      {visit.status === "REQUESTED" ? <HeldVisit approximateArea={enquiry.approximateArea} isRefreshing={isRefreshing} /> : null}
      {visit.status === "SCHEDULED" && timing ? (
        <View className="gap-3">
          <WhenBlock
            headline={`${timing.dayLabel}, ${timing.timeLabel}`}
            detail={[timing.fullLabel, timing.durationLabel].filter(Boolean).join(" · ")}
            note={timing.relative}
            tone={timing.isVisitDay ? "action" : "neutral"}
          />
          {timing.leaveBy ? (
            <Text className="text-sm leading-5 text-text-secondary">
              Set off by <Text className="font-bold text-text">{timing.leaveBy}</Text> to be there on time.
            </Text>
          ) : null}
          {controls.canStartArrival ? null : (
            <View className="flex-row flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface-sunken px-3 py-2.5">
              <Text className="text-xs leading-5 text-text-secondary">“I’ve arrived” opens on the day of the visit.</Text>
              {controls.overrideArrivalGate === null ? null : (
                <Pressable accessibilityRole="button" onPress={controls.overrideArrivalGate} className="rounded-control border border-dashed border-line px-2.5 py-1">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Open anyway · dev</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      ) : null}
      {visit.status === "IN_PROGRESS" ? (
        <View className="gap-3">
          <WhenBlock
            headline={visit.arrival_confirmed_at ? `On site since ${timeOnlyInZone(visit.arrival_confirmed_at, visit.timezone)}` : "On site"}
            detail={timing?.durationLabel ?? null}
            note={null}
            tone="action"
          />
          <Text className="text-sm leading-5 text-text-secondary">When you finish, the estimate timer starts.</Text>
        </View>
      ) : null}
      {visit.status === "COMPLETED" ? <CompletedVisit controls={controls} enquiry={enquiry} estimateSubmitted={estimateSubmitted} /> : null}
      {timing?.zoneUnsupported ? (
        <Text className="text-xs leading-5 text-text-muted">Check this time against the site’s timezone ({visit.timezone}).</Text>
      ) : null}
      {visit.cancellation_reason_code ? (
        <Text className="text-sm leading-6 text-text-secondary">Recorded reason: {visit.cancellation_reason_code.replace(/[_-]+/g, " ")}</Text>
      ) : null}
      {controls.failure ? (
        <ErrorState
          inline
          title={controls.failure.title}
          message={controls.failure.message}
          severity={controls.failure.severity}
          actionLabel="Try again"
          onAction={controls.resetFailure}
          reference={controls.failure.reference}
        />
      ) : null}
    </Card>
  );
}

const TONE = { action: "action", progress: "info", settled: "neutral", gone: "neutral" } as const;

function WhenBlock({ headline, detail, note, tone }: { readonly headline: string; readonly detail: string | null; readonly note: string | null; readonly tone: "action" | "neutral" }) {
  return (
    <View className={tone === "action" ? "items-center gap-1 rounded-card border border-action-line bg-action-surface px-4 py-4" : "items-center gap-1 rounded-card border border-line bg-surface-sunken px-4 py-4"}>
      <Text className="text-center text-xl font-extrabold tracking-[-0.02em] text-text">{headline}</Text>
      {detail === null || detail === "" ? null : <Text className="text-center text-sm font-semibold text-text-secondary">{detail}</Text>}
      {note === null ? null : <Text className="text-center text-sm font-bold text-action-secondary">{note}</Text>}
    </View>
  );
}

function CompletedVisit({ controls, enquiry, estimateSubmitted }: { readonly controls: VisitDayControls; readonly enquiry: EnquiryRecord; readonly estimateSubmitted: boolean }) {
  const { visit, estimateCountdown } = controls;
  return (
    <View className="flex-col gap-3">
      {estimateSubmitted ? (
        <Text className="text-sm font-semibold leading-5 text-success-text">Estimate submitted. The customer can review it now.</Text>
      ) : visit.estimate_due_at && estimateCountdown ? (
        <Readout
          label="Estimate due in"
          value={estimateCountdown.isExpired ? "Past due" : estimateCountdown.display}
          announce={estimateCountdown.isExpired ? "The estimate window has passed" : estimateCountdown.announce}
          tone={estimateCountdown.isExpired ? "danger" : "warning"}
          size="sm"
          caption={`Due ${timeAgo(visit.estimate_due_at)}`}
        />
      ) : null}
      <Text className="text-sm leading-5 text-text-secondary">
        {visit.completed_at ? `Visit closed ${timeAgo(visit.completed_at)}. ` : ""}
        {estimateSubmitted ? "You can revise it while the enquiry remains open." : "Send the estimate before the timer ends — it is what the customer paid for."}
      </Text>
      {enquiry.fixedVisitEarningPaise === null ? null : (
        <Text className="text-sm font-semibold text-text">{formatMoney(enquiry.fixedVisitEarningPaise)} visit fee earned</Text>
      )}
    </View>
  );
}

function HeldVisit({ approximateArea, isRefreshing }: { readonly approximateArea: string; readonly isRefreshing: boolean }) {
  return (
    <View accessibilityLiveRegion="polite" className="flex-col gap-3">
      <View className="items-center gap-1.5">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-success-surface">
          <Pictogram name="yes" size="lg" className="text-success-text" />
        </View>
        <Text className="text-lg font-extrabold tracking-[-0.02em] text-text">This visit is yours</Text>
      </View>
      <View className="flex-row gap-3 rounded-card border border-warning-line bg-warning-surface p-3.5">
        <Pictogram name="later" size="md" className="text-warning-text" />
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-extrabold tracking-[-0.015em] text-warning-text">Do not travel yet</Text>
          <Text className="mt-1 text-[12.5px] leading-[18px] text-warning-text">Waiting for customer payment. This page updates automatically.</Text>
        </View>
        {isRefreshing ? <Spinner size="sm" /> : null}
      </View>
      <FactTile locked icon={<Pictogram name="site" size="sm" className="text-text-muted" />} label="Exact address" value={approximateArea.trim() === "" ? "After payment" : `${approximateArea} — after payment`} />
      <FactTile locked icon={<Pictogram name="call" size="sm" className="text-text-muted" />} label="Customer phone" value="After payment" />
    </View>
  );
}

const PROGRESS_STEPS: readonly { readonly label: string; readonly icon: PictogramName; readonly statuses: readonly SiteVisitStatus[] }[] = [
  { label: "Visit", icon: "date", statuses: ["REQUESTED", "SCHEDULED"] },
  { label: "On site", icon: "site", statuses: ["IN_PROGRESS"] },
  { label: "Estimate", icon: "price", statuses: ["COMPLETED"] },
];

function VisitProgress({ status }: { readonly status: SiteVisitStatus }) {
  const active = Math.max(0, PROGRESS_STEPS.findIndex((step) => step.statuses.includes(status)));
  return (
    <View className="flex-row gap-2">
      {PROGRESS_STEPS.map((step, index) => (
        <View key={step.label} className="flex-1 items-center gap-1">
          <Pictogram name={step.icon} size="sm" className={index <= active ? "text-action-secondary" : "text-text-muted"} />
          <Text className={index <= active ? "text-[11px] font-bold text-action-secondary" : "text-[11px] font-bold text-text-muted"}>{step.label}</Text>
        </View>
      ))}
    </View>
  );
}
