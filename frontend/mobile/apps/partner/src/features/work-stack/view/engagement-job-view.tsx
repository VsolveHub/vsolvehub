// Ported from frontend/apps/partner/features/work-stack/view/engagement-job-view.tsx
import { isMaterialAdvance, orderedStages } from "@vsolve/query/native";
import { Badge, Text, buttonStyles, cn, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { HOW_DAY_HIRE_WORKS_HREF, overtimeLine } from "@/features/crew-offer/model/offer-state";
import {
  PROJECT_WORDING,
  WORKFORCE_WORDING,
  describeEngagementStatus,
  describeStageStatus,
  stageTitle,
  type StageWording,
  type StatusTone,
} from "@/features/engagement/model/engagement-copy";
import type { Engagement, EngagementStage } from "@/features/engagement/queries";

import {
  collectedDirectlyPaise,
  dayChipDate,
  describeShiftDay,
  nextCrewAction,
  type DayChipTone,
} from "../model/day-chip";
import { CompletionRating } from "./completion-rating";
import { Pictogram, type PictogramName } from "./pictogram";
import { ProblemSheet } from "./problem-sheet";

export function EngagementJobView({ engagement }: { readonly engagement: Engagement }) {
  if (engagement.commercial_mode === "LEAD_ONLY") {
    return isJobOver(engagement) ? <CrewJobSummary engagement={engagement} /> : <CrewJobHub engagement={engagement} />;
  }
  return <ProjectJobView engagement={engagement} />;
}

function isJobOver(engagement: Engagement): boolean {
  return ["COMPLETING", "COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status);
}

const STATUS_BADGE_TONE: Record<StatusTone, "action" | "info" | "neutral" | "warning" | "danger" | "success"> = {
  action: "action",
  info: "info",
  neutral: "neutral",
  warning: "warning",
  danger: "danger",
  success: "success",
};

function addressText(address: NonNullable<Engagement["site_address"]>): string {
  return [address.line1, address.line2, address.landmark, address.locality, address.city, address.state, address.postal_code]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(", ");
}

function mapHref(address: NonNullable<Engagement["site_address"]>): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText(address))}`;
}

function shortAddress(address: NonNullable<Engagement["site_address"]>): string {
  return [address.line1, address.line2, address.locality].map((part) => part.trim()).filter((part) => part !== "").join(", ");
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function CrewJobHub({ engagement }: { readonly engagement: Engagement }) {
  const router = useRouter();
  const [problemOpen, setProblemOpen] = useState(false);
  const status = describeEngagementStatus(engagement, WORKFORCE_WORDING);
  const stages = orderedStages(engagement).filter((stage) => stage.shift_summary !== null);
  const terms = engagement.crew_terms;
  const address = engagement.site_address;
  const customer = engagement.customer_contact;
  const next = nextCrewAction(stages);
  const overtime = terms ? overtimeLine(terms.overtime_hourly_paise, terms.standard_day_hours) : null;
  const inclusions = terms?.inclusions.filter((line) => line.trim() !== "") ?? [];
  const dayHref = (stageId: string) => `/work/jobs/${engagement.id}/days/${stageId}`;

  return (
    <>
      <ScrollView className="flex-1 bg-canvas" contentContainerClassName="pb-5">
        <HubHeader title={engagement.service_name || "Crew booking"} onBack={() => router.back()}>
          {status ? <Badge tone={STATUS_BADGE_TONE[status.tone]} dot>{status.label}</Badge> : null}
        </HubHeader>
        <View className="flex-col gap-2.5 px-4 pb-5 pt-4">
          {customer ? <Text className="text-xl font-bold leading-tight text-text">{customer.name}</Text> : null}
          {address ? (
            <ContactRow icon="distance" text={shortAddress(address)}>
              <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline", size: "sm" })} onPress={() => void Linking.openURL(mapHref(address))}>
                <Text className="text-xs font-semibold text-text">Map</Text>
              </Pressable>
            </ContactRow>
          ) : (
            <Text className="text-sm leading-5 text-text-secondary">Address and phone unlock once the booking fee is confirmed.</Text>
          )}
          {customer && customer.phone.trim() !== "" ? (
            <ContactRow icon="call" text={customer.name}>
              <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline", size: "sm" })} onPress={() => void Linking.openURL(`tel:${customer.phone}`)}>
                <Text className="text-xs font-semibold text-text">Call</Text>
              </Pressable>
            </ContactRow>
          ) : null}
          <View className="rounded-card border border-line bg-surface px-3.5 py-3">
            {terms ? (
              <>
                <Text className="text-lg font-extrabold leading-tight text-text">
                  {formatMoney(terms.lead_receipt_paise)} to you · {formatMoney(terms.per_worker_day_paise)}/head/day
                </Text>
                <Text className="mt-0.5 text-sm leading-5 text-text-secondary">Customer pays you each evening</Text>
              </>
            ) : (
              <Text className="text-lg font-extrabold leading-tight text-text">{formatMoney(engagement.staged_total_paise)} agreed</Text>
            )}
          </View>
          <DayChips stages={stages} hrefFor={dayHref} />
          {inclusions.length > 0 ? <Text className="text-sm font-semibold leading-5 text-text">{inclusions.join(" · ")}</Text> : null}
          {overtime ? <Text className="text-sm leading-5 text-text-secondary">{overtime}</Text> : null}
          {next ? (
            <Pressable accessibilityRole="button" onPress={() => router.push(dayHref(next.stageId) as never)} className="mt-2 h-16 flex-row items-center justify-center gap-2 rounded-2xl bg-action">
              <Text className="text-base font-bold text-action-text">{next.label}</Text>
              <Pictogram name="go" size="md" className="text-action-text" />
            </Pressable>
          ) : null}
          <View className="mt-1 flex-row items-center justify-between gap-3">
            <Pressable accessibilityRole="button" onPress={() => router.push(HOW_DAY_HIRE_WORKS_HREF as never)} className="flex-row items-center gap-1.5 py-1">
              <Text className="h-5 w-5 text-center text-xs text-action-secondary">i</Text>
              <Text className="text-sm font-semibold text-action-secondary">How day-hire works</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setProblemOpen(true)} className="min-h-11 flex-row items-center gap-1.5 rounded-control px-2">
              <Text className="text-sm font-bold text-warning-text">⚠ Problem</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <ProblemSheet
        engagementId={engagement.id}
        requirementId={engagement.requirement}
        stageId={next?.stageId}
        open={problemOpen}
        onOpenChange={setProblemOpen}
      />
    </>
  );
}

function DayChips({ stages, hrefFor }: { readonly stages: readonly EngagementStage[]; readonly hrefFor: (stageId: string) => string }) {
  const router = useRouter();
  if (stages.length === 0) return null;
  return (
    <View accessibilityLabel="Days">
      <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">Days</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 mt-1.5" contentContainerClassName="flex-row gap-2 px-4 pb-1">
        {stages.map((stage) => {
          const chip = describeShiftDay(stage.shift_summary!);
          const date = dayChipDate(stage.scheduled_on) ?? `Day ${stage.position}`;
          const cancelled = stage.status === "CANCELLED";
          return (
            <Pressable
              key={stage.id}
              accessibilityRole="button"
              accessibilityLabel={`${date}, ${cancelled ? "cancelled" : chip.label}`}
              onPress={() => router.push(hrefFor(stage.id) as never)}
              className={cn(
                "min-h-14 shrink-0 flex-col justify-center gap-0.5 rounded-2xl border px-3 py-2",
                cancelled ? "border-line bg-surface-sunken opacity-60" : DAY_CHIP_TONE[chip.tone],
              )}
            >
              <Text className="text-sm font-bold text-text">{date}</Text>
              <Text numberOfLines={1} className="max-w-[14ch] text-xs font-semibold">{cancelled ? "Cancelled" : chip.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const DAY_CHIP_TONE: Record<DayChipTone, string> = {
  action: "border-action-line bg-action-surface",
  info: "border-selected-line bg-selected-surface",
  neutral: "border-line bg-surface",
  warning: "border-warning-line bg-warning-surface",
  danger: "border-danger-line bg-danger-surface",
  success: "border-success-line bg-success-surface",
};

function ContactRow({ icon, text, children }: { readonly icon: PictogramName; readonly text: string; readonly children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-2.5">
      <Pictogram name={icon} size="md" className="shrink-0 text-action-secondary" />
      <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold text-text">{text}</Text>
      {children}
    </View>
  );
}

function HubHeader({ title, onBack, children }: { readonly title: string; readonly onBack: () => void; readonly children?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 bg-navy-900 px-4 pb-4 pt-4">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface/13">
        <Pictogram name="back" size="md" className="text-surface" />
      </Pressable>
      <Text numberOfLines={1} className="min-w-0 flex-1 text-lg font-bold leading-tight text-surface">{title}</Text>
      {children}
    </View>
  );
}

function CrewJobSummary({ engagement }: { readonly engagement: Engagement }) {
  const router = useRouter();
  const stages = orderedStages(engagement).filter((stage) => stage.shift_summary !== null);
  const collected = collectedDirectlyPaise(stages);
  const customer = engagement.customer_contact;
  const title = [engagement.service_name || "Crew booking", customer?.name ?? null].filter((part): part is string => part !== null).join(" · ");

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="pb-5">
      <HubHeader title={title} onBack={() => router.back()}>
        <Badge tone="success" dot>Job complete</Badge>
      </HubHeader>
      <View className="flex-col gap-2.5 px-4 pb-5 pt-4">
        {stages.length === 0 ? (
          <Text className="text-sm leading-5 text-text-secondary">No days on this booking.</Text>
        ) : (
          <View className="flex-col rounded-card border border-line bg-surface">
            {stages.map((stage) => {
              const summary = stage.shift_summary!;
              const settled = summary.settlement_status === "SETTLED";
              const count = summary.present_count === null ? "—" : `${summary.present_count} of ${summary.expected_count}`;
              return (
                <View key={stage.id} className="flex-row items-center gap-3 border-b border-line px-3.5 py-2.5">
                  <Text className="w-12 shrink-0 text-sm font-bold text-text">{dayChipDate(stage.scheduled_on) ?? `Day ${stage.position}`}</Text>
                  <Text className="min-w-0 flex-1 text-sm text-text-secondary">{count}</Text>
                  <Text className="shrink-0 text-sm font-bold text-text">
                    {summary.settlement_amount_paise === null ? "" : formatMoney(summary.settlement_amount_paise)}
                  </Text>
                  <Text className={cn("w-14 shrink-0 text-right text-xs font-bold", settled ? "text-success-text" : "text-text-muted")}>
                    {settled ? "Paid ✓" : stage.status === "CANCELLED" ? "Cancelled" : "Open"}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        {collected === null ? null : (
          <View className="flex-row items-baseline justify-between rounded-card border border-line bg-surface px-3.5 py-3">
            <Text className="text-sm font-semibold text-text">Collected directly</Text>
            <Text className="text-xl font-extrabold text-text">{formatMoney(collected)}</Text>
          </View>
        )}
      </View>
      <View className="bg-canvas px-4 pb-5">
        <CompletionRating subject="engagement" id={engagement.id} isComplete={["COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status)} />
      </View>
    </ScrollView>
  );
}

function ProjectJobView({ engagement }: { readonly engagement: Engagement }) {
  const router = useRouter();
  const wording: StageWording = PROJECT_WORDING;
  const status = describeEngagementStatus(engagement, wording);
  const stages = orderedStages(engagement);

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="pb-5">
      <Text className="sr-only">Your {wording.parent}{status ? ` — ${status.label}` : ""}</Text>
      <View className="flex-row items-center gap-3.5 bg-navy-900 px-4 pb-5 pt-4">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface/13">
          <Pictogram name="back" size="md" className="text-surface" />
        </Pressable>
        <View className="min-w-0 flex-1 flex-col gap-0.5">
          <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-navy-200">This {wording.parent} is agreed at</Text>
          <Text numberOfLines={1} className="text-[2.125rem] font-extrabold leading-none tracking-[-0.02em] text-surface">{formatMoney(engagement.staged_total_paise)}</Text>
        </View>
      </View>
      <View className="flex-col gap-2.5 px-4 pb-5 pt-4">
        {stages.length === 0 ? <EmptyStages wording={wording} /> : stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} wording={wording} href={isMaterialAdvance(stage) ? null : `/work/jobs/${engagement.id}/stages/${stage.id}`} />
        ))}
      </View>
      <View className="bg-canvas px-4 pb-5">
        <CompletionRating subject="engagement" id={engagement.id} isComplete={["COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status)} />
      </View>
    </ScrollView>
  );
}

function StageRow({ stage, wording, href }: { readonly stage: EngagementStage; readonly wording: StageWording; readonly href: string | null }) {
  const router = useRouter();
  const status = describeStageStatus(stage, wording);
  const scheduled = stage.scheduled_on;
  const label = [stageTitle(stage, wording), status?.label, scheduled ? shortDate(scheduled) : null, formatMoney(stage.amount_paise)]
    .filter((part): part is string => part !== null && part !== undefined)
    .join(", ");
  const body = (
    <>
      <View className={cn("h-13 w-13 shrink-0 items-center justify-center rounded-2xl border", status ? STAGE_TONE[status.tone] : STAGE_TONE.neutral)}>
        <Pictogram name={isMaterialAdvance(stage) ? "price" : STAGE_PICTOGRAM[stage.status]} size="lg" />
      </View>
      <View className="min-w-0 flex-1 flex-col gap-0.5">
        <Text numberOfLines={1} className="text-[0.9375rem] font-semibold leading-snug text-text">{stageTitle(stage, wording)}</Text>
        <Text className="text-xl font-extrabold leading-none tracking-[-0.02em] text-text">{formatMoney(stage.amount_paise)}</Text>
        <View className="min-w-0 flex-row items-center gap-3">
          {status ? <Text numberOfLines={1} className="text-xs font-bold uppercase tracking-[0.04em] text-text-muted">{status.label}</Text> : null}
          {scheduled ? (
            <View className="flex-row items-center gap-1.5">
              <Pictogram name="date" size="sm" className="shrink-0 text-action-secondary" />
              <Text numberOfLines={1} className="text-sm font-bold text-action-secondary">{shortDate(scheduled)}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {href ? <Pictogram name="go" size="md" className="shrink-0 text-action-secondary" /> : null}
    </>
  );
  const shell = "min-h-18 flex-row items-center gap-3 rounded-card border border-line bg-surface p-3.5";
  if (href === null) return <View className={shell}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href as never)} className={shell}>
      {body}
    </Pressable>
  );
}

function EmptyStages({ wording }: { readonly wording: StageWording }): ReactNode {
  return (
    <View className="flex-1 flex-col items-center justify-center py-16">
      <View className="h-42 w-42 items-center justify-center rounded-full bg-surface-sunken">
        <Pictogram name="papers" size="xl" className="text-warm-400" />
      </View>
      <Text className="mt-5 text-base font-semibold text-text-secondary">No {wording.many} on this {wording.parent} yet</Text>
    </View>
  );
}

const STAGE_PICTOGRAM: Record<EngagementStage["status"], PictogramName> = {
  PENDING: "time",
  IN_PROGRESS: "doing",
  AWAITING_REVIEW: "held",
  APPROVED: "done",
  CORRECTION_REQUESTED: "later",
  DISPUTED: "stopped",
  RELEASED: "money",
  CANCELLED: "no",
};

const STAGE_TONE: Record<StatusTone, string> = {
  action: "border-action-line bg-action-surface",
  info: "border-selected-line bg-selected-surface",
  neutral: "border-line bg-surface-sunken",
  warning: "border-warning-line bg-warning-surface",
  danger: "border-danger-line bg-danger-surface",
  success: "border-success-line bg-success-surface",
};
