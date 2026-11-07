// Ported from frontend/apps/partner/features/work-stack/view/work-home.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { useServerCountdown, type Countdown } from "@vsolve/query/native";
import { Badge, ErrorState, Spinner, Text, cn, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useSyncExternalStore, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { ApplicationOverview } from "@/features/application/view/application-overview";
import { usePartnerApplication } from "@/features/application/queries";
import { usePartnerPerformance, type PartnerPerformance } from "@/features/earnings/queries";
import { readStoredSession, subscribeStoredSession } from "@/features/presence/model/stored-session";
import { PartnerPresence } from "@/features/presence/view/partner-presence";

import type { WorkItem } from "../model/work-item";
import { useWorkStack } from "../queries";
import { Pictogram, type PictogramName } from "./pictogram";
import { WaitingRadar } from "./waiting-radar";

function Home({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mx-auto w-full max-w-2xl px-4 py-6">
      <Text className="text-2xl font-bold text-text">{title}</Text>
      <View className="mt-5 flex-col gap-5">{children}</View>
    </View>
  );
}

export function WorkHome() {
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <View className="mx-auto w-full max-w-md px-4 py-6">
        <ApplicationOverview />
      </View>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <Home title="Your work">
        <ErrorState
          title="We could not load your account"
          message="Nothing you have saved is lost. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void query.refetch()}
        />
      </Home>
    );
  }

  if (isMissing || query.data === undefined || query.data.status !== "APPROVED") {
    return (
      <View className="mx-auto w-full max-w-md px-4 py-6">
        <ApplicationOverview />
      </View>
    );
  }

  return <WorkStack />;
}

function WorkStack() {
  const stack = useWorkStack();
  const performance = usePartnerPerformance();
  const needsYou = stack.items.filter(
    (item) => item.urgency === "live" || item.urgency === "needs_price" || item.urgency === "doing",
  );

  return (
    <ScrollView className="flex-1 bg-ink-900" contentContainerClassName="flex-grow">
      <Text className="sr-only">Your work</Text>
      <View className="relative shrink-0 flex-col px-4 pb-12 pt-6">
        <TodayPlate
          netPaise={performance.data?.today_net_paise ?? null}
          jobs={performance.data?.today_jobs ?? null}
        />
        <MonthStrip performance={performance.data ?? null} />
      </View>
      <View className="relative -mt-6 flex-1 flex-col rounded-t-[1.75rem] bg-surface">
        <View className="mx-auto mt-3 h-1 w-10 rounded-full bg-line" />
        <View className="px-4 pb-2 pt-4">
          <PartnerPresence variant="driver" />
        </View>
        <View className="flex-1 flex-col gap-3 px-4 pb-4 pt-2">
          <StackBody stack={stack} needsYou={needsYou} />
        </View>
      </View>
    </ScrollView>
  );
}

function MonthStrip({ performance }: { performance: PartnerPerformance | null }) {
  if (performance === null) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="relative z-10 mt-3" contentContainerClassName="flex-row gap-2 pb-1">
      <Metric label="This month" value={formatMoney(performance.month_net_paise)} />
      <Metric
        label={performance.month_jobs === 1 ? "Job done" : "Jobs done"}
        value={String(performance.month_jobs)}
      />
      <Metric label="Usual month" value={formatMoney(performance.average_monthly_net_paise)} />
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[7.5rem] shrink-0 flex-col gap-0.5 rounded-2xl border border-surface/10 bg-surface/8 px-3.5 py-2.5">
      <Text numberOfLines={1} className="text-[1.0625rem] font-extrabold leading-none tracking-[-0.02em] text-surface">
        {value}
      </Text>
      <Text numberOfLines={1} className="text-[0.6875rem] font-medium text-surface/55">
        {label}
      </Text>
    </View>
  );
}

function StackBody({
  stack,
  needsYou,
}: {
  stack: ReturnType<typeof useWorkStack>;
  needsYou: readonly WorkItem[];
}) {
  if (stack.isPending) {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2 py-16">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading your work…</Text>
      </View>
    );
  }

  if (stack.error) {
    return (
      <ErrorState
        title="We could not load your work"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => stack.refetch()}
      />
    );
  }

  if (needsYou.length === 0) return <WaitingForWork />;

  return (
    <View className="flex-col gap-2.5">
      <View className="flex-row items-baseline justify-between gap-3 px-0.5">
        <Text className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">Needs you</Text>
        <Text className="rounded-full bg-surface-sunken px-2 py-0.5 text-[0.6875rem] font-bold text-text-muted">
          {needsYou.length}
        </Text>
      </View>
      {needsYou.map((item) => (
        <WorkCard key={item.key} item={item} />
      ))}
    </View>
  );
}

function WaitingForWork() {
  const storedSession = useSyncExternalStore(
    subscribeStoredSession,
    () => readStoredSession() !== null,
    () => false,
  );
  return <WaitingRadar isOnline={storedSession} />;
}

function TodayPlate({ netPaise, jobs }: { netPaise: number | null; jobs: number | null }) {
  return (
    <View className="relative z-10 flex-col gap-1 pt-2">
      <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-surface/50">Earned today</Text>
      <View className="min-w-0 flex-row items-end justify-between gap-3">
        <Text numberOfLines={1} className="min-w-0 text-[1.875rem] font-extrabold leading-none tracking-[-0.03em] text-surface">
          {netPaise === null ? "—" : formatMoney(netPaise)}
        </Text>
        {jobs === null ? null : (
          <Text className="mb-1 shrink-0 text-right text-sm font-medium leading-snug text-surface/55">
            {jobs === 0 ? "No jobs\nyet today" : `${jobs} ${jobs === 1 ? "job" : "jobs"}\nfinished`}
          </Text>
        )}
      </View>
    </View>
  );
}

export function WorkCard({ item }: { item: WorkItem }) {
  switch (item.urgency) {
    case "live":
      return <LiveOfferCard item={item} />;
    case "needs_price":
      return <NeedsPriceCard item={item} />;
    case "settled":
      return <SettledCard item={item} />;
    case "answered":
      return <AnsweredCard item={item} />;
    case "not_chosen":
      return <OutcomeCard item={item} />;
    case "closed":
      return <OutcomeCard item={item} />;
    case "doing":
      return <DoingCard item={item} />;
  }
}

const CARD = "min-h-14 flex-col gap-2.75 rounded-card p-3.5";
const TILE = "h-13 w-13 shrink-0 items-center justify-center rounded-[0.9375rem]";
const BAR = "h-14 flex-row items-center justify-center gap-2 rounded-[0.8125rem]";

function Fact({ name, label, children }: { name: PictogramName; label?: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Pictogram name={name} size="sm" className="shrink-0" />
      <View className="min-w-0 flex-col">
        {label === undefined ? null : (
          <Text className="text-[0.6875rem] font-semibold uppercase tracking-[0.04em] opacity-70">{label}</Text>
        )}
        <Text numberOfLines={1} className="text-[0.9375rem] font-bold">
          {children}
        </Text>
      </View>
    </View>
  );
}

function whenLabel(item: WorkItem): string | null {
  if (item.whenIso === null) return null;
  const at = new Date(item.whenIso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", item.whenIsDay ? { day: "numeric", month: "short" } : { hour: "numeric", minute: "2-digit" }).format(at);
}

function dateLabel(item: WorkItem): string | null {
  if (item.whenIso === null) return null;
  const at = new Date(item.whenIso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(at);
}

function startTimeLabel(item: WorkItem): string | null {
  if (item.whenIso === null || item.whenIsDay) return null;
  const at = new Date(item.whenIso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(at);
}

function durationLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} ${hours === 1 ? "hr" : "hrs"}` : `${hours} hr ${remainder} min`;
}

function money(amountPaise: number | null): string {
  return amountPaise === null ? "₹ ?" : formatMoney(amountPaise);
}

function spokenAmount(item: WorkItem): string | null {
  if (item.amountPaise === null) return null;
  const amount = formatMoney(item.amountPaise);
  return item.amountLabel === null ? amount : `${item.amountLabel.toLowerCase()} ${amount}`;
}

function cardLabel(item: WorkItem): string {
  const facts = [item.accessibleName];
  const amount = spokenAmount(item);
  if (amount !== null) facts.push(amount);
  const date = dateLabel(item);
  const starts = startTimeLabel(item);
  const duration = durationLabel(item.durationMinutes);
  if (date !== null) facts.push(`date ${date}`);
  if (starts !== null) facts.push(`starts ${starts}`);
  if (duration !== null) facts.push(`duration ${duration}`);
  if (item.areaLabel !== null && item.areaLabel !== item.stateLabel) facts.push(`area ${item.areaLabel}`);
  return facts.join(", ");
}

function ScheduleFacts({ item }: { readonly item: WorkItem }) {
  const date = dateLabel(item);
  const starts = startTimeLabel(item);
  const duration = durationLabel(item.durationMinutes);
  if (date === null && starts === null && duration === null && item.areaLabel === null) return null;
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-2">
      {date === null ? null : (
        <View className="w-[48%]">
          <Fact name="date" label="Date">{date}</Fact>
        </View>
      )}
      {starts === null ? null : (
        <View className="w-[48%]">
          <Fact name="time" label="Starts">{starts}</Fact>
        </View>
      )}
      {duration === null ? null : (
        <View className="w-[48%]">
          <Fact name="time" label="Duration">{duration}</Fact>
        </View>
      )}
      {item.areaLabel === null ? null : (
        <View className="w-[48%]">
          <Fact name="distance" label="Area">{item.areaLabel}</Fact>
        </View>
      )}
    </View>
  );
}

function CardLink({ item, className, children }: { item: WorkItem; className: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(item)}
      onPress={() => router.push(item.href as never)}
      className={className}
    >
      {children}
    </Pressable>
  );
}

function LiveOfferCard({ item }: { item: WorkItem }) {
  const countdown = useServerCountdown(item.respondsBy, 1000);
  if (countdown?.isExpired) return null;
  return (
    <CardLink item={item} className={cn(CARD, "bg-action")}>
      <View className="flex-row items-center gap-2.75">
        <View className={cn(TILE, "bg-surface")}>
          <Pictogram name="now" size="lg" className="text-text" />
        </View>
        <View className="min-w-0 flex-1 flex-col gap-0.5">
          <CardTitle item={item} />
          <View className="flex-row items-baseline gap-2">
            <Text className="text-[1.875rem] font-extrabold leading-none tracking-[-0.02em] text-text">{money(item.amountPaise)}</Text>
            {item.amountLabel === null ? null : (
              <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-text opacity-70">{item.amountLabel}</Text>
            )}
          </View>
        </View>
        {countdown ? <CountdownDial countdown={countdown} /> : null}
      </View>
      <ScheduleFacts item={item} />
      <View className={cn(BAR, "bg-surface")}>
        <Pictogram name="yes" size="md" className="text-success-text" />
        <Text className="text-base font-bold text-text">Take this job</Text>
      </View>
    </CardLink>
  );
}

const STATE_TONE: Record<WorkItem["urgency"], "warning" | "action" | "info" | "neutral" | "success"> = {
  live: "warning",
  needs_price: "action",
  doing: "info",
  answered: "neutral",
  settled: "success",
  not_chosen: "neutral",
  closed: "neutral",
};

function CardTitle({ item }: { item: WorkItem }) {
  return (
    <View className="min-w-0 flex-col gap-1">
      <Text numberOfLines={1} className="text-base font-semibold leading-snug text-text">{item.title}</Text>
      {item.stateLabel === null ? null : (
        <Badge tone={STATE_TONE[item.urgency]} className="w-fit">{item.stateLabel}</Badge>
      )}
    </View>
  );
}

function CountdownDial({ countdown }: { countdown: Countdown }) {
  return (
    <View className="h-13.5 w-13.5 shrink-0 items-center justify-center rounded-full bg-text/13" accessibilityLabel={countdown.announce}>
      <Text className="text-sm font-extrabold tracking-[-0.02em] text-text">{countdown.display}</Text>
    </View>
  );
}

function NeedsPriceCard({ item }: { item: WorkItem }) {
  const at = whenLabel(item);
  return (
    <CardLink item={item} className={cn(CARD, "border border-line bg-surface")}>
      <View className="flex-row items-center gap-2.75">
        <View className={cn(TILE, "bg-surface-sunken")}>
          <Pictogram name="new" size="lg" className="text-signal-700" />
        </View>
        <View className="min-w-0 flex-1 flex-col gap-0.75">
          <CardTitle item={item} />
          <View className="flex-col gap-1">
            {item.areaLabel ? <Fact name="distance" label="Near">{item.areaLabel}</Fact> : null}
            {at ? <Fact name={item.whenIsDay ? "date" : "time"} label="Requested">{at}</Fact> : null}
          </View>
        </View>
      </View>
      <View className={cn(BAR, "bg-action")}>
        <Pictogram name="go" size="md" className="text-action-text" />
        <Text className="text-base font-bold text-action-text">{item.actionLabel ?? "Review request"}</Text>
      </View>
    </CardLink>
  );
}

function DoingCard({ item }: { item: WorkItem }) {
  return (
    <CardLink item={item} className={cn(CARD, "border border-line border-l-[6px] border-l-action-secondary bg-surface")}>
      <View className="flex-row items-center gap-2.75">
        <View className={cn(TILE, "bg-navy-500")}>
          <Pictogram name="doing" size="lg" className="text-surface" />
        </View>
        <View className="min-w-0 flex-1 flex-col gap-1">
          <CardTitle item={item} />
          {item.amountPaise === null ? null : (
            <View className="flex-row items-baseline gap-2">
              <Text className="text-[1.5rem] font-extrabold leading-none tracking-[-0.02em] text-text">{money(item.amountPaise)}</Text>
              {item.amountLabel === null ? null : (
                <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-text-muted">{item.amountLabel}</Text>
              )}
            </View>
          )}
        </View>
      </View>
      {item.whenIso !== null || item.durationMinutes !== null || item.areaLabel !== null ? (
        <View className="rounded-xl bg-surface-sunken px-3 py-2.5">
          <ScheduleFacts item={item} />
        </View>
      ) : null}
      <View className={cn(BAR, "bg-action-secondary")}>
        <Pictogram name="go" size="md" className="text-action-secondary-text" />
        <Text className="text-base font-bold text-action-secondary-text">Open this job</Text>
      </View>
    </CardLink>
  );
}

function SettledCard({ item }: { item: WorkItem }) {
  const date = dateLabel(item);
  const starts = startTimeLabel(item);
  const settlementCopy =
    item.kind === "engagement"
      ? item.amountLabel === "Collected directly"
        ? "Paid directly by customer"
        : "Work completed"
      : "Held until payout";
  return (
    <CardLink item={item} className="min-h-14 flex-row items-center gap-3 rounded-card border border-success-line bg-success-surface px-3.5 py-2.75">
      <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-text">
        <Pictogram name="done" size="md" className="text-surface" />
      </View>
      <View className="min-w-0 flex-1 flex-col gap-px">
        <Text numberOfLines={1} className="text-[0.9375rem] font-semibold leading-snug text-success-text">{item.title}</Text>
        {date === null ? null : (
          <View className="flex-row items-center gap-1">
            <Pictogram name="time" size="xs" className="shrink-0 text-success-text" />
            <Text numberOfLines={1} className="text-xs font-semibold text-success-text opacity-75">
              {starts === null ? date : `${date} · ${starts}`}
            </Text>
          </View>
        )}
        <View className="flex-row items-center gap-1">
          <Pictogram name="held" size="xs" className="shrink-0 text-success-text" />
          <Text className="text-xs font-semibold text-success-text opacity-75">{settlementCopy}</Text>
        </View>
      </View>
      {item.amountPaise === null ? null : (
        <Text className="text-[1.375rem] font-extrabold leading-none tracking-[-0.02em] text-success-text">{money(item.amountPaise)}</Text>
      )}
    </CardLink>
  );
}

function AnsweredCard({ item }: { item: WorkItem }) {
  return (
    <CardLink item={item} className="min-h-14 flex-row items-center gap-3 rounded-card border border-info-line bg-info-surface px-3.5 py-2.75">
      <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-info-text">
        <Pictogram name="price" size="md" className="text-surface" />
      </View>
      <View className="min-w-0 flex-1 flex-col gap-px">
        <Text numberOfLines={1} className="text-[0.9375rem] font-semibold leading-snug text-info-text">{item.title}</Text>
        <Text numberOfLines={1} className="text-xs font-semibold text-info-text opacity-75">{item.stateLabel}</Text>
      </View>
      <Pictogram name="go" size="sm" className="shrink-0 text-info-text" />
    </CardLink>
  );
}

function OutcomeCard({ item }: { item: WorkItem }) {
  return (
    <CardLink item={item} className="min-h-14 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-2.75">
      <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-sunken">
        <Pictogram name="no" size="md" className="text-text-muted" />
      </View>
      <View className="min-w-0 flex-1 flex-col gap-px">
        <Text numberOfLines={1} className="text-[0.9375rem] font-semibold leading-snug text-text">{item.title}</Text>
        <Text className="text-xs font-semibold text-text-muted">{item.stateLabel}</Text>
      </View>
      <Pictogram name="go" size="sm" className="shrink-0 text-text-muted" />
    </CardLink>
  );
}
