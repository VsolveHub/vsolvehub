// Ported from frontend/apps/customer/features/engagement/view/engagement-screen.tsx
import { describeError, isStageNotFundable, type StageKind } from "@vsolve/query/native";
import { Badge, Button, Dialog, EmptyState, ErrorState, Readout, Sheet, Skeleton, Text, Timeline, TimelineEvent, buttonStyles } from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import {
  toAmendmentsView,
  toEngagementEvents,
  toEngagementView,
  type EngagementView,
  type StageView,
} from "@/features/engagement/adapters";
import { leadOnlyHubPhase } from "@/features/engagement/model/booking-record";
import {
  isSimulatedCaptureUnavailable,
  useEngagement,
  useEngagementAmendments,
  useEngagementEvents,
  useFundStage,
  useSimulateStageCapture,
} from "@/features/engagement/queries";
import { AgreementHistory } from "@/features/engagement/view/agreement-history";
import { CompletionPanel } from "@/features/engagement/view/completion-panel";
import {
  EngagementStatusBadge,
  StageKindBadge,
  StageStatusBadge,
  nextActionCopy,
  nounsFor,
  stageKindCopy,
  type ModeNouns,
} from "@/features/engagement/view/engagement-status";
import { EngagementTimeline } from "@/features/engagement/view/engagement-timeline";
import { ProjectCompletionCodePanel } from "@/features/engagement/view/project-completion-code";
import { REQUESTS_HREF, bookCrewHref, engagementListHref, receiptHref, requestHref, stageHref } from "@/lib/routes";

export function EngagementScreen({ engagementId }: { engagementId: string }) {
  const engagementQuery = useEngagement(engagementId);
  const amendmentsQuery = useEngagementAmendments(engagementId);
  const fund = useFundStage();
  const [fundingStageId, setFundingStageId] = useState<string | null>(null);
  const view = engagementQuery.data === undefined ? null : toEngagementView(engagementQuery.data);
  const amendments = amendmentsQuery.data === undefined ? null : toAmendmentsView(amendmentsQuery.data);
  const isProject = view?.mode === "managed";
  const requestLink = view === null ? REQUESTS_HREF : requestHref(view.requirementId);
  const nouns = nounsFor(view?.mode ?? "unknown");
  const fundingStage = view?.stages.find((stage) => stage.stageId === fundingStageId) ?? null;

  if (engagementQuery.isPending) {
    return (
      <View className="px-4 pb-16 pt-6">
        <Text className="sr-only">Loading your agreement</Text>
        <Skeleton className="h-64 w-full" />
      </View>
    );
  }

  if (view === null) {
    const presentation = describeError(engagementQuery.error, "read");
    return (
      <View className="gap-4 px-4 pb-16 pt-6">
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => void engagementQuery.refetch()}
          reference={presentation.reference}
        />
        <Link href={requestLink} asChild>
          <Pressable className={buttonStyles({ variant: "ghost" })}>
            <Text className="text-sm font-semibold text-text-link">Back to this request</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  const refetchAll = () => {
    void engagementQuery.refetch();
    void amendmentsQuery.refetch();
  };

  if (view.mode === "lead_only") {
    return (
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-16 pt-6">
        <LeadOnlyHub view={view} onRefresh={refetchAll} />
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-4 pb-16 pt-6">
      {isProject ? (
        <ProjectHero view={view} nouns={nouns} onFund={setFundingStageId} isFunding={fund.isPending} />
      ) : (
        <View>
          <View className="flex-row flex-wrap items-start justify-between gap-2">
            <View className="min-w-0">
              <Text className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">{nouns.engagementTitle}</Text>
              <Text className="mt-0.5 text-xl font-semibold text-text">{view.serviceName ?? nouns.engagementTitle}</Text>
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
              {view.isDisputed ? <Badge tone="danger">Problem raised</Badge> : null}
              <EngagementStatusBadge status={view.status} />
            </View>
          </View>
          {view.createdAt !== null ? <Text className="mt-1 text-sm text-text-secondary">Agreed on {view.createdAt}</Text> : null}
        </View>
      )}

      {isProject ? null : <ModePanel view={view} />}
      {isProject ? null : <ProgressPanel view={view} nouns={nouns} />}
      <AgreedWork view={view} nouns={nouns} quotesHref={`${requestLink}/quotes`} />
      {isProject ? <ProjectMoneyFlow view={view} /> : <Totals view={view} />}
      <StageList view={view} nouns={nouns} onFund={setFundingStageId} isFunding={fund.isPending} />
      {fundingStage === null ? null : (
        <FundStageDialog engagementId={engagementId} stage={fundingStage} nouns={nouns} onClose={() => setFundingStageId(null)} />
      )}
      {isStageNotFundable(fund.error) ? (
        <ErrorState
          title={`That ${nouns.stage} cannot be funded right now`}
          message="Either it is already funded, an earlier one is not, or this agreement is paid directly to the professional. We have re-read it — what you see now is what is actually there."
          severity="warning"
          inline
        />
      ) : (
        <AccessRefusal error={fund.error} attempting={`fund this ${nouns.stage}`} />
      )}
      {isProject ? <ProjectCompletionCodePanel engagementId={view.engagementId} status={view.status} /> : (
        <CompletionPanel engagement={view} nouns={nouns} onDone={refetchAll} />
      )}
      <View className={isProject ? "mt-6" : "mt-8"}>
        <Text className="text-lg font-semibold text-text">What was agreed, and how it changed</Text>
        {amendments === null ? (
          <Text className="mt-2 text-sm leading-6 text-text-secondary">
            We could not read the change history just now, so we are not going to show you a version of this agreement we cannot vouch for.
          </Text>
        ) : (
          <AgreementHistory
            engagement={view}
            amendments={amendments}
            originalTotalPaise={view.stagedTotalPaise - view.amendmentDeltaPaise}
          />
        )}
      </View>
      <EngagementTimeline engagementId={engagementId} />
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">The record</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          What you asked for, who was invited, what they quoted, when they visited and what you chose all stay on the request it came from, for both of you.
        </Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          <Link href={requestLink} asChild>
            <Pressable className={buttonStyles({ variant: "outline" })}>
              <Text className="text-sm font-semibold text-text">Open the full history</Text>
            </Pressable>
          </Link>
          {view.mode !== "unknown" ? (
            <Link href={engagementListHref(view.mode)} asChild>
              <Pressable className={buttonStyles({ variant: "ghost" })}>
                <Text className="text-sm font-semibold text-text-link">All your {nouns.engagement}s</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

function LeadOnlyHub({ view, onRefresh }: { view: EngagementView; onRefresh: () => void }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const phase = leadOnlyHubPhase(view.status);
  const isDone = phase === "done";
  const isCompleting = phase === "completion";
  const activeDay = isDone || isCompleting ? null : view.stages[0] ?? null;
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="text-xl font-semibold text-text">{view.serviceName ?? "Your booking"}</Text>
        <EngagementStatusBadge status={view.status} />
      </View>
      {view.partnerContact !== null ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3">
          <View className="min-w-0">
            <Text className="font-semibold text-text">👷 {view.partnerContact.name} · supervisor</Text>
            {view.partnerContact.phone !== "" ? (
              <Text className="mt-0.5 text-sm text-text-secondary">📞 {view.partnerContact.phone}</Text>
            ) : null}
          </View>
          {view.partnerContact.phone !== "" ? (
            <Button size="sm" onPress={() => void Linking.openURL(view.partnerContact!.telHref)}>
              Call
            </Button>
          ) : null}
        </View>
      ) : view.contactReleasedAt !== null ? (
        <Text className="text-sm text-text-secondary">You can contact each other from {view.contactReleasedAt}.</Text>
      ) : null}
      {isCompleting ? (
        <CompletionPanel engagement={view} nouns={nounsFor(view.mode)} onDone={onRefresh} embedded />
      ) : isDone ? (
        <DoneCard view={view} />
      ) : activeDay !== null ? (
        <View>
          <Text className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
            Today · {activeDay.scheduledOn ?? activeDay.label}
          </Text>
          <View className="rounded-card border border-line bg-surface p-4">
            <Text className="font-semibold text-text">{activeDay.label}</Text>
            <Text className="mt-1 text-sm text-text-secondary">{activeDay.amountLabel}</Text>
          </View>
        </View>
      ) : (
        <EmptyState title="Nothing due today" compact description="Check the days above for what is next." />
      )}
      {view.siteAddress !== null ? (
        <Text className="text-sm text-text-secondary">📍 {view.siteAddress.summary}</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-x-4 border-t border-line pt-4">
        <Link href={receiptHref(view.engagementId)} asChild>
          <Pressable>
            <Text className="text-sm font-semibold text-text-link underline">Payment record</Text>
          </Pressable>
        </Link>
        <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(true)}>
          <Text className="text-sm font-semibold text-text-link underline">History</Text>
        </Pressable>
      </View>
      <HistorySheet engagementId={view.engagementId} open={historyOpen} onOpenChange={setHistoryOpen} />
    </View>
  );
}

function DoneCard({ view }: { view: EngagementView }) {
  return (
    <View className="rounded-card border border-success-line bg-success-surface p-4">
      <Text className="font-semibold text-text">✅ Done · {view.serviceName ?? "Your booking"}</Text>
      {view.stages.map((stage) => (
        <View key={stage.stageId} className="mt-1 flex-row justify-between">
          <Text className="text-sm text-text">{stage.label}</Text>
          <Text className="text-sm text-text">{stage.shiftSummary?.chip.label ?? stage.amountLabel}</Text>
        </View>
      ))}
      {view.crewTerms !== null ? (
        <View className="mt-3 flex-row justify-between border-t border-success-line pt-3">
          <Text className="text-sm text-text">Paid to crew</Text>
          <Text className="text-sm font-semibold text-text">{view.crewTerms.leadReceiptLabel}</Text>
        </View>
      ) : null}
      {view.accessReceipt !== null ? (
        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-sm text-text">Booking fee (Vsolve)</Text>
          <Text className="text-sm font-semibold text-text">{view.accessReceipt.amountLabel}</Text>
        </View>
      ) : null}
      {view.serviceSlug !== null ? (
        <Link href={bookCrewHref(view.serviceSlug)} asChild>
          <Pressable className={buttonStyles({ variant: "outline", className: "mt-4 w-full justify-center" })}>
            <Text className="text-sm font-semibold text-text">Book {view.partnerContact?.name ?? "this crew"} again</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

function HistorySheet({
  engagementId,
  open,
  onOpenChange,
}: {
  engagementId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useEngagementEvents(open ? engagementId : null);
  const events = query.data === undefined ? null : toEngagementEvents(query.data);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="History">
      {query.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : events === null ? (
        <ErrorState
          title={describeError(query.error, "read").title}
          message={describeError(query.error, "read").message}
          severity={describeError(query.error, "read").severity}
          actionLabel="Try again"
          onAction={() => void query.refetch()}
          reference={describeError(query.error, "read").reference}
          inline
        />
      ) : events.length === 0 ? (
        <EmptyState title="Nothing has happened yet" compact description="Every step on this booking is recorded here as it happens." />
      ) : (
        <Timeline label="Everything that has happened on this booking">
          {events.map((event) => (
            <TimelineEvent
              key={event.eventId}
              title={event.title}
              timestamp={event.at ?? ""}
              actor={event.actorIsSystem ? "Automatic — no one had to do anything" : "Somebody decided this"}
            >
              {event.transition}
            </TimelineEvent>
          ))}
        </Timeline>
      )}
    </Sheet>
  );
}

function ModePanel({ view }: { view: EngagementView }) {
  if (view.mode === "managed") {
    return (
      <View className="mt-4 rounded-card border border-success-line bg-success-surface p-4">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 font-semibold text-text">You pay through Vsolve, one stage at a time</Text>
          <Badge tone="success">Staged funding</Badge>
        </View>
        <Text className="mt-2 text-sm leading-6 text-text">
          You are never asked for the whole project up front. Each stage is funded when it starts, and the money reaches the professional after you have approved what they did. If the work stops, only the unearned stages are at stake.
        </Text>
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          What you paid for the site visits is separate and is already spent — it paid the professionals who came out and wrote your estimates. It does not come off these stages.
        </Text>
        {view.workMayStartAt === null ? (
          <Text className="mt-2 text-sm text-text-secondary">Work starts once the first stage is funded.</Text>
        ) : null}
      </View>
    );
  }
  return (
    <View className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
      <Text className="font-semibold text-text">We cannot describe this agreement</Text>
      <Text className="mt-2 text-sm leading-6 text-text-secondary">
        This app does not recognise how this job is being paid for, so it is not going to guess. Nothing here is a promise about who holds your money.
      </Text>
    </View>
  );
}

function actionStageKind(view: EngagementView): StageKind | null {
  if (view.nextAction === "fund_stage") return view.nextFundableStageKind;
  if (view.nextAction !== "review_stage") return null;
  const reviewing = view.stagesAwaitingReviewIds[0] ?? null;
  if (reviewing === null) return null;
  return view.stages.find((stage) => stage.stageId === reviewing)?.kind ?? null;
}

function ProgressPanel({ view, nouns }: { view: EngagementView; nouns: ModeNouns }) {
  const { done, total } = view.progress;
  const active = view.stages.find((stage) => stage.stageId === view.activeStageId) ?? null;
  return (
    <View className="mt-6 rounded-card border border-line bg-surface p-4">
      <Text className="text-sm text-text-secondary">
        {done} of {total} {total === 1 ? nouns.stage : nouns.stages} done
      </Text>
      {active !== null ? (
        <Text className="mt-1 font-medium text-text">
          Now: {active.label}
          {active.scheduledOn !== null ? ` · ${active.scheduledOn}` : ""}
        </Text>
      ) : null}
      <Text className="mt-2 text-sm leading-6 text-text">{nextActionCopy(view.nextAction, nouns, actionStageKind(view))}</Text>
    </View>
  );
}

function AgreedWork({ view, nouns, quotesHref }: { view: EngagementView; nouns: ModeNouns; quotesHref: string }) {
  const contact = view.partnerContact;
  return (
    <View className="mt-6">
      <Text className="text-xs font-bold uppercase text-text-muted">{view.mode === "lead_only" ? "Your crew" : "Your professional"}</Text>
      <Text className="mt-1 text-xl font-extrabold text-text">
        {view.mode === "lead_only" ? "Who is coming" : "Who is doing the work"}
      </Text>
      <View className="mt-3 rounded-card border border-line bg-surface p-4 shadow-sm">
        <Text className="text-lg font-extrabold text-text">{contact?.name ?? "Professional details unavailable"}</Text>
        <Text className="mt-0.5 text-sm text-text-secondary">
          {contact === null
            ? view.contactReleasedAt === null
              ? "Name and number arrive once the booking fee is confirmed."
              : "Number not published for this booking."
            : contact.phone}
        </Text>
        {view.crewTerms !== null ? (
          <Text className="mt-2 text-sm text-text-secondary">
            {view.crewTerms.headcount} {view.crewTerms.headcount === 1 ? "person" : "people"} · {view.crewTerms.days}{" "}
            {view.crewTerms.days === 1 ? "day" : "days"} · {view.crewTerms.perWorkerDayLabel}/person/day
          </Text>
        ) : null}
        {view.siteAddress !== null ? <Text className="mt-2 text-sm text-text-secondary">{view.siteAddress.summary}</Text> : null}
        <Link href={quotesHref} asChild>
          <Pressable className="mt-3">
            <Text className="text-sm font-semibold text-text-link">Open quote</Text>
          </Pressable>
        </Link>
        <Text className="sr-only">{nouns.engagement}</Text>
      </View>
    </View>
  );
}

function Totals({ view }: { view: EngagementView }) {
  return (
    <View className="mt-6">
      <Text className="text-lg font-semibold text-text">What was agreed</Text>
      <View className="mt-3 rounded-card border border-line bg-surface">
        <MoneyRow label="Originally agreed" value={view.totalLabel} />
        {view.amendmentDeltaPaise !== 0 ? (
          <MoneyRow label={view.amendmentDeltaPaise < 0 ? "Changes took off" : "Changes added"} value={view.amendmentDeltaLabel} />
        ) : null}
        <MoneyRow label="Agreed now" value={view.stagedTotalLabel} strong />
        <MoneyRow label="Tax" value={view.taxLabel} />
        {view.mode === "managed" ? (
          <>
            <MoneyRow label="You have funded" value={view.fundedTotalLabel} />
            <MoneyRow label="Approved" value={view.approvedTotalLabel} />
            <MoneyRow label="Paid to the professional" value={view.releasedTotalLabel} />
            {view.hasRefund ? <MoneyRow label="Refunded to you" value={view.refundedTotalLabel} /> : null}
          </>
        ) : null}
        {view.commissionTreatment !== null ? <MoneyRow label="Commission" value={view.commissionTreatment} /> : null}
      </View>
    </View>
  );
}

function MoneyRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 border-b border-line p-4">
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text className={strong ? "text-lg font-semibold text-text" : "text-text"}>{value}</Text>
    </View>
  );
}

function ProjectHero({
  view,
  nouns,
  onFund,
  isFunding,
}: {
  view: EngagementView;
  nouns: ModeNouns;
  onFund: (stageId: string) => void;
  isFunding: boolean;
}) {
  const active = view.stages.find((stage) => stage.stageId === view.activeStageId) ?? null;
  const nextFundable = view.stages.find((stage) => stage.stageId === view.nextFundableStageId) ?? null;
  const reviewStage = view.stages.find((stage) => stage.stageId === view.stagesAwaitingReviewIds[0]) ?? null;
  const focus = reviewStage ?? nextFundable ?? active;
  const router = useRouter();
  return (
    <View className="overflow-hidden rounded-card border border-navy-700 bg-surface shadow-sm">
      <View className="bg-navy-900 px-5 py-5">
        <Text className="text-sm font-semibold text-navy-100">Your project</Text>
        <Text className="mt-1 text-3xl font-extrabold leading-tight text-white">
          {view.serviceName ?? focus?.label ?? "Project journey"}
        </Text>
        {view.serviceName !== null && focus !== null ? (
          <Text className="mt-1 text-sm font-semibold text-navy-100">{focus.label}</Text>
        ) : null}
        {view.createdAt !== null ? <Text className="mt-2 text-sm font-medium text-navy-100">Agreed {view.createdAt}</Text> : null}
        <View className="mt-3 flex-row flex-wrap gap-2">
          {view.isDisputed ? <Badge tone="danger">Problem raised</Badge> : null}
          <EngagementStatusBadge status={view.status} />
        </View>
      </View>
      <View className="gap-5 px-5 py-5">
        <View>
          <Text className="text-xs font-bold uppercase text-text-muted">What happens next</Text>
          <Text className="mt-1 text-lg font-extrabold leading-snug text-text">
            {nextActionCopy(view.nextAction, nouns, actionStageKind(view))}
          </Text>
          {focus?.scheduledOn !== null && focus?.scheduledOn !== undefined ? (
            <Text className="mt-1 text-sm font-medium text-text-secondary">{focus.scheduledOn}</Text>
          ) : null}
        </View>
        {view.nextAction === "review_stage" && reviewStage !== null ? (
          <Pressable className={buttonStyles({ size: "lg", className: "w-full" })} onPress={() => router.push(stageHref(view.engagementId, reviewStage.stageId) as never)}>
            <Text className="text-base font-bold text-action-text">Check this stage</Text>
          </Pressable>
        ) : null}
        {view.nextAction === "fund_stage" && nextFundable !== null ? (
          <Button size="lg" className="w-full" onPress={() => onFund(nextFundable.stageId)} loading={isFunding} loadingLabel="Opening payment">
            {`Fund ${nextFundable.amountLabel}`}
          </Button>
        ) : null}
        {view.nextAction === "accept_completion" ? (
          <Text className="text-base font-bold text-text">Show completion code</Text>
        ) : null}
      </View>
      <View className="border-t border-line px-5 py-5">
        <Text className="text-sm font-extrabold text-text">How stage payments protect you</Text>
        <Text className="mt-4 text-sm font-medium leading-6 text-text-secondary">
          You fund only the stage that is ready. Work money reaches the professional after you approve that stage. Site-visit fees remain separate from project work.
        </Text>
      </View>
    </View>
  );
}

function ProjectMoneyFlow({ view }: { view: EngagementView }) {
  const steps = [
    ["Agreed", view.stagedTotalLabel],
    ["Funded", view.fundedTotalLabel],
    ["Approved", view.approvedTotalLabel],
    ["Paid out", view.releasedTotalLabel],
  ] as const;
  const [open, setOpen] = useState(false);
  return (
    <View className="mt-6">
      <Text className="text-xs font-bold uppercase text-text-muted">Project money</Text>
      <Text className="mt-1 text-xl font-extrabold text-text">Follow every rupee</Text>
      {view.hasRefund ? <Badge tone="info">Refund recorded</Badge> : null}
      <View className="mt-3 overflow-hidden rounded-card border border-line bg-surface shadow-sm">
        <View className="flex-row bg-canvas px-2 py-5">
          {steps.map(([label, value]) => (
            <View key={label} className="w-[25%] items-center px-1">
              <Text className="text-xs font-bold text-text-secondary">{label}</Text>
              <Text className="mt-0.5 text-center text-sm font-extrabold text-text">{value}</Text>
            </View>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setOpen((current) => !current)} className="min-h-14 justify-center border-t border-line px-4">
          <Text className="text-sm font-extrabold text-text">Full money breakdown</Text>
        </Pressable>
        {open ? (
          <View className="border-t border-line bg-canvas">
            <MoneyRow label="Originally agreed" value={view.totalLabel} />
            {view.amendmentDeltaPaise !== 0 ? (
              <MoneyRow label={view.amendmentDeltaPaise < 0 ? "Changes took off" : "Changes added"} value={view.amendmentDeltaLabel} />
            ) : null}
            <MoneyRow label="Tax" value={view.taxLabel} />
            {view.hasRefund ? <MoneyRow label="Refunded to you" value={view.refundedTotalLabel} /> : null}
            {view.commissionTreatment !== null ? <MoneyRow label="Commission" value={view.commissionTreatment} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function StageList({
  view,
  nouns,
  onFund,
  isFunding,
}: {
  view: EngagementView;
  nouns: ModeNouns;
  onFund: (stageId: string) => void;
  isFunding: boolean;
}) {
  if (view.stages.length === 0) return null;
  return (
    <View className="mt-6">
      <Text className="text-xs font-bold uppercase text-text-muted">Project plan</Text>
      <Text className="mt-1 text-xl font-extrabold text-text">{nouns.stagesHeading}</Text>
      <View className="mt-4 gap-3">
        {view.stages.map((stage) => (
          <StageRow
            key={stage.stageId}
            stage={stage}
            mode={view.mode}
            nouns={nouns}
            reviewHref={stageHref(view.engagementId, stage.stageId)}
            onFund={onFund}
            isFunding={isFunding}
          />
        ))}
      </View>
    </View>
  );
}

function StageRow({
  stage,
  mode,
  nouns,
  reviewHref,
  onFund,
  isFunding,
}: {
  stage: StageView;
  mode: EngagementView["mode"];
  nouns: ModeNouns;
  reviewHref: string;
  onFund: (stageId: string) => void;
  isFunding: boolean;
}) {
  const kindCopy = stageKindCopy(stage.kind, nouns);
  const isMaterial = stage.kind === "material_advance";
  const [open, setOpen] = useState(false);
  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0">
          <Text className="font-extrabold text-text">{stage.label}</Text>
          {stage.scheduledOn !== null ? <Text className="mt-0.5 text-sm text-text-secondary">{stage.scheduledOn}</Text> : null}
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            <StageStatusBadge status={stage.status} />
            <StageKindBadge kind={stage.kind} nouns={nouns} />
          </View>
        </View>
        <Text className="shrink-0 text-lg font-extrabold text-text">{stage.amountLabel}</Text>
      </View>
      {stage.status !== "PENDING" ? (
        <Link href={reviewHref} asChild>
          <Pressable className={buttonStyles({ variant: stage.canApprove ? "primary" : "outline", className: "mt-4 w-full justify-center" })}>
            <Text className={`text-sm font-semibold ${stage.canApprove ? "text-action-text" : "text-text"}`}>
              {stage.canApprove
                ? isMaterial
                  ? "Check the materials"
                  : "Check the work"
                : isMaterial
                  ? "See this materials payment"
                  : `See this ${nouns.stage}`}
            </Text>
          </Pressable>
        </Link>
      ) : null}
      {stage.clock === "auto_approves" && stage.autoApprovalDeadlineLabel !== null ? (
        <Text className="mt-2 text-sm leading-6 text-warning-text">
          Approved automatically on {stage.autoApprovalDeadlineLabel} if you do not decide.
        </Text>
      ) : stage.clock === "no_deadline" ? (
        <Text className="mt-2 text-sm leading-6 text-text-secondary">No deadline is set, so nothing is approved automatically.</Text>
      ) : null}
      {stage.status === "CANCELLED" ? (
        <Text className="mt-3 text-sm leading-6 text-text-secondary">
          {isMaterial
            ? "These materials are no longer part of this project. What was already spent on them is shown above."
            : `This ${nouns.stage} is no longer part of this project and nobody is working on it. Nothing more will be asked of you for it.`}
        </Text>
      ) : mode !== "managed" ? null : stage.isFundingPending ? (
        <Text className="mt-3 text-sm leading-6 text-text-secondary">
          We are confirming your payment for this stage. Your bank or UPI app tells us the outcome and that can take a few minutes — do not pay again.
        </Text>
      ) : stage.fundingState === "FUNDED" ? (
        <Pressable onPress={() => setOpen((current) => !current)} className="mt-3 min-h-11 justify-center">
          <Text className="text-sm font-bold text-text">Funded</Text>
          {open ? (
            <Text className="text-sm text-text-secondary">
              {isMaterial ? "The professional buys the agreed materials with this money." : "This money is held until you approve the work."}
            </Text>
          ) : null}
        </Pressable>
      ) : stage.isNextToFund && stage.kind === "unknown" ? (
        <Text className="mt-3 text-sm text-text-secondary">{kindCopy.fundingPurpose}</Text>
      ) : stage.isNextToFund ? (
        <View className="mt-3">
          <Button className="w-full" onPress={() => onFund(stage.stageId)} loading={isFunding} loadingLabel="Starting your payment">
            {isMaterial ? `Pay for these materials — ${stage.amountLabel}` : `Fund this stage — ${stage.amountLabel}`}
          </Button>
          <Text className="mt-2 text-sm text-text-secondary">{kindCopy.fundingPurpose}</Text>
        </View>
      ) : stage.fundingState === "REQUIRED" ? (
        <Text className="mt-3 text-sm text-text-secondary">
          {isMaterial ? "You will be asked for this after the earlier work is done." : "You will be asked for this after the previous stage is done."}
        </Text>
      ) : null}
    </View>
  );
}

function FundStageDialog({
  engagementId,
  stage,
  nouns,
  onClose,
}: {
  engagementId: string;
  stage: StageView;
  nouns: ModeNouns;
  onClose: () => void;
}) {
  const fund = useFundStage();
  const capture = useSimulateStageCapture();
  const [settled, setSettled] = useState<"paid" | "awaiting-provider" | null>(null);
  const isWorking = fund.isPending || capture.isPending;
  const failure = fund.error ?? (isSimulatedCaptureUnavailable(capture.error) ? null : capture.error);

  async function pay() {
    const checkout = await fund.mutateAsync({ engagementId, stageId: stage.stageId });
    const attemptId = checkout?.payment_attempt_id ?? null;
    if (attemptId === null || checkout?.provider !== "fake") {
      setSettled("awaiting-provider");
      return;
    }
    try {
      await capture.mutateAsync({ engagementId, paymentAttemptId: attemptId });
      setSettled("paid");
    } catch (error) {
      if (isSimulatedCaptureUnavailable(error)) setSettled("awaiting-provider");
      else throw error;
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isWorking) onClose();
      }}
      title={settled === "paid" ? `${nouns.stage} funded` : `Fund this ${nouns.stage}?`}
      description={settled === "paid" ? undefined : `${stage.label} — the professional is told to start once this clears.`}
    >
      {settled === "paid" ? (
        <Text className="text-sm leading-6 text-text-secondary">
          {stage.amountLabel} is funded and held against this {nouns.stage}. It reaches the professional only after you accept the work — you are not paying them yet.
        </Text>
      ) : settled === "awaiting-provider" ? (
        <Text className="text-sm leading-6 text-text-secondary">
          The charge has been created and is with the payment provider. Your bank or UPI app tells us the outcome and that can take a few minutes — do not pay again.
        </Text>
      ) : (
        <View className="gap-3">
          <Readout label="Amount" value={stage.amountLabel} tone="active" />
          <Text className="text-sm leading-6 text-text-secondary">
            This money is held against this {nouns.stage}. It reaches the professional only after you have seen the work and accepted it, and it comes back to you if this {nouns.stage} is never delivered.
          </Text>
          {failure !== null && failure !== undefined ? (
            <Text className="text-sm text-danger-text">{describeError(failure, "mutation").message}</Text>
          ) : null}
          <View className="flex-row justify-end gap-2">
            <Button variant="ghost" onPress={onClose} disabled={isWorking}>
              Cancel
            </Button>
            <Button loading={isWorking} loadingLabel="Taking payment" onPress={() => void pay()}>
              {`Pay ${stage.amountLabel}`}
            </Button>
          </View>
        </View>
      )}
      {settled !== null ? <Button onPress={onClose}>Done</Button> : null}
    </Dialog>
  );
}
