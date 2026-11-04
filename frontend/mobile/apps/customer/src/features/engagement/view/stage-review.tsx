// Ported from frontend/apps/customer/features/engagement/view/stage-review-screen.tsx
import {
  canRespondToAttendance,
  describeError,
  isStageDisputed,
  isStageTransitionNotAllowed,
  useServerCountdown,
  type EngagementCommercialMode,
  type StageDisputeReason,
} from "@vsolve/query/native";
import {
  Badge,
  Button,
  ConfirmAction,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Text,
} from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { formatBytes } from "@/features/requirement/model/upload";
import { toShiftDayView, type ShiftCrewMemberView, type ShiftDayView } from "@/features/shift-day/adapters";
import { useShiftDay } from "@/features/shift-day/queries";
import { NotRightSheet } from "@/features/shift-day/view/not-right-sheet";
import {
  toAmendmentsView,
  toEngagementView,
  toStandaloneStageView,
  type EvidenceView,
  type StageView,
} from "../adapters";
import {
  DISPUTE_REASONS,
  canSubmitCorrection,
  canSubmitDispute,
} from "../model/stage-review";
import {
  useApproveStage,
  useDisputeStage,
  useEngagement,
  useEngagementAmendments,
  useRequestCorrection,
  useStage,
} from "../queries";
import { TodayCard } from "./today-card";
import {
  StageKindBadge,
  StageStatusBadge,
  nounsFor,
  stageKindCopy,
  stageRowNoun,
  type ModeNouns,
} from "./engagement-status";

export function StageReview({ engagementId, stageId }: { engagementId: string; stageId: string }) {
  const router = useRouter();
  const engagementQuery = useEngagement(engagementId);
  const stageQuery = useStage(engagementId, stageId);

  const engagement =
    engagementQuery.data === undefined ? null : toEngagementView(engagementQuery.data);
  const stage = stageQuery.data === undefined ? null : toStandaloneStageView(stageQuery.data);
  const nouns = nounsFor(engagement?.mode ?? "unknown");

  const isShiftDay = engagement?.mode === "lead_only";
  const shiftDayQuery = useShiftDay(engagementId, stageId, isShiftDay);
  const attendanceDecisionOpen =
    shiftDayQuery.data !== undefined && canRespondToAttendance(shiftDayQuery.data);

  const amendmentsQuery = useEngagementAmendments(isShiftDay ? engagementId : null);
  const amendments = amendmentsQuery.data === undefined ? null : toAmendmentsView(amendmentsQuery.data);
  const [notRightOpen, setNotRightOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      stageQuery.refetch(),
      engagementQuery.refetch(),
      ...(isShiftDay ? [shiftDayQuery.refetch(), amendmentsQuery.refetch()] : []),
    ]);
    setRefreshing(false);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push(`/engagements/${engagementId}` as never);
    }
  };

  if (stageQuery.isPending || engagementQuery.isPending) {
    return (
      <View className="px-4 py-6">
        <Skeleton className="h-64 w-full" />
      </View>
    );
  }

  if (stage === null) {
    const presentation = describeError(stageQuery.error, "read");
    return (
      <View className="gap-4 px-4 py-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          className="size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => void stageQuery.refetch()}
          reference={presentation.reference}
        />
      </View>
    );
  }

  // Day detail: on a workforce booking the stage is the shift-day
  if (isShiftDay && engagement !== null) {
    const pendingAmendment =
      amendments?.live !== null && amendments?.live !== undefined && amendments.live.stageId === stageId
        ? amendments.live
        : null;
    const shift = shiftDayQuery.data === undefined ? null : toShiftDayView(shiftDayQuery.data);

    return (
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="px-4 pb-16 pt-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
        }
      >
        <View className="mb-4 flex-row items-center gap-2.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={handleBack}
            className="size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
          >
            <ChevronLeft size={18} color="#00112e" />
          </Pressable>
          <View className="flex-1">
            <View className="flex-row flex-wrap items-start justify-between gap-2">
              <Text className="text-xl font-semibold text-text">{stage.label}</Text>
              <StageStatusBadge status={stage.status} />
            </View>
            {stage.scheduledOn !== null ? (
              <Text className="mt-1 text-sm text-text-secondary">{stage.scheduledOn}</Text>
            ) : null}
          </View>
        </View>

        <View className="mt-4">
          <TodayCard
            engagementId={engagementId}
            requirementId={engagement.requirementId}
            day={stage}
            pendingAmendment={pendingAmendment}
            onDone={onRefresh}
            onNotRight={() => setNotRightOpen(true)}
          />
        </View>

        {shift !== null ? <WhoCameList shift={shift} /> : null}

        {shift !== null ? (
          <NotRightSheet
            open={notRightOpen}
            onOpenChange={setNotRightOpen}
            engagementId={engagementId}
            day={shift}
            amendmentHref=""
            onDone={onRefresh}
          />
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pb-16 pt-6"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="mb-4 flex-row items-center gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          className="size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <View className="flex-1">
          <View className="flex-row flex-wrap items-start justify-between gap-2">
            <Text className="text-xl font-semibold text-text">{stage.label}</Text>
            <View className="flex-row flex-wrap items-center gap-2">
              <StageKindBadge kind={stage.kind} nouns={nouns} />
              <StageStatusBadge status={stage.status} />
            </View>
          </View>
          {stage.scheduledOn !== null ? (
            <Text className="mt-1 text-sm text-text-secondary">{stage.scheduledOn}</Text>
          ) : null}
        </View>
      </View>

      <ReviewClockPanel stage={stage} nouns={nouns} onRefresh={() => void stageQuery.refetch()} />

      <MoneyPanel stage={stage} mode={engagement?.mode ?? "unknown"} nouns={nouns} />

      {engagement === null ? (
        <View className="mt-4">
          <ErrorState
            title="We cannot tell you what approving does yet"
            message="We could not read the agreement this work belongs to, so we will not describe what happens to your money. Try again before you decide anything."
            severity="warning"
            actionLabel="Try again"
            onAction={() => void engagementQuery.refetch()}
            inline
          />
        </View>
      ) : null}

      <View className="mt-6">
        <Text className="text-lg font-semibold text-text">
          {stageKindCopy(stage.kind, nouns).evidenceHeading}
        </Text>
        <StageEvidenceList evidence={stage.evidence} stageNoun={nouns.stage} />
      </View>

      {stage.correctionNote !== null ? (
        <View className="mt-6 rounded-card border border-warning-line bg-warning-surface p-4">
          <Text className="font-semibold text-text">What you asked for</Text>
          <Text className="mt-1 text-sm leading-6 text-text">
            {stage.correctionNote}
          </Text>
        </View>
      ) : null}

      {stage.status === "DISPUTED" ? <DisputedPanel stage={stage} nouns={nouns} /> : null}

      <StageActions
        engagementId={engagementId}
        stage={stage}
        mode={engagement?.mode ?? "unknown"}
        commercialMode={engagement?.commercialMode ?? null}
        nouns={nouns}
        deferToShiftDay={attendanceDecisionOpen}
        onDone={onRefresh}
      />
    </ScrollView>
  );
}

function ReviewClockPanel({
  stage,
  nouns,
  onRefresh,
}: {
  stage: StageView;
  nouns: ModeNouns;
  onRefresh: () => void;
}) {
  const countdown = useServerCountdown(stage.autoApprovalDeadline, 30_000);
  const rowNoun = stageRowNoun(stage.kind, nouns);

  if (stage.clock === "not_running") return null;

  if (stage.clock === "stopped") {
    return (
      <View className="mt-4 rounded-card border border-danger-line bg-danger-surface p-4">
        <Text className="font-semibold text-text">The clock is stopped</Text>
        <Text className="mt-1 text-sm leading-6 text-text">
          You raised a problem on this {rowNoun}, so it will{" "}
          <Text className="font-semibold">not</Text> be approved automatically
          and no money moves on it while we look into it.
        </Text>
      </View>
    );
  }

  if (stage.clock === "no_deadline") {
    return (
      <View className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
        <Text className="font-semibold text-text">No deadline is set for this</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          Nothing is approved automatically. This {rowNoun} waits until you
          decide, however long that takes.
        </Text>
      </View>
    );
  }

  const expiredLocally = countdown?.isExpired === true;

  return (
    <View className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4">
      <Text className="font-semibold text-text">
        {expiredLocally ? "This review window has closed" : "If you do nothing, this is approved"}
      </Text>
      {expiredLocally ? (
        <>
          <Text className="mt-1 text-sm leading-6 text-text">
            By our clock the window has passed, so this {rowNoun} may already
            have been approved automatically. We have not assumed either way.
          </Text>
          <View className="mt-3">
            <Button variant="outline" onPress={onRefresh}>
              Check what happened
            </Button>
          </View>
        </>
      ) : (
        <>
          <Text className="mt-1 text-sm leading-6 text-text">
            This {rowNoun} is approved automatically on{" "}
            <Text className="font-semibold">{stage.autoApprovalDeadlineLabel}</Text> if
            you do not decide before then — and approving is what moves the money.
            Raising a problem is the only thing that stops it.
          </Text>
          {countdown !== null ? (
            <Text className="mt-2 text-sm text-text-secondary">
              {countdown.announce}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

function MoneyPanel({
  stage,
  mode,
  nouns,
}: {
  stage: StageView;
  mode: "lead_only" | "managed" | "unknown";
  nouns: ModeNouns;
}) {
  return (
    <View className="mt-6">
      <Text className="text-lg font-semibold text-text">
        The money on this {stageRowNoun(stage.kind, nouns)}
      </Text>

      <View className="mt-3 rounded-card border border-line bg-surface">
        <Row label="Agreed for this" value={stage.amountLabel} strong />
        {mode === "managed" ? (
          <>
            <Row label="You have funded" value={stage.fundedLabel} />
            <Row label="Approved" value={stage.approvedLabel} />
            <Row label="Paid to the professional" value={stage.releasedLabel} />
            {stage.hasRefund ? <Row label="Refunded to you" value={stage.refundedLabel} /> : null}
          </>
        ) : null}
      </View>

      {mode === "lead_only" ? (
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          You pay the professional directly for this work. Vsolve is not holding
          this money, so approving here records that the {nouns.stage} was done —
          it does not send anybody a payment.
        </Text>
      ) : null}

      {stage.kind === "material_advance" ? (
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          This is money for materials, not for work. Once the professional has
          spent it on goods it is not returned the way unfinished work is — if
          the job stops, the materials are dealt with as goods rather than
          refunded automatically.
        </Text>
      ) : null}

      {mode === "managed" && stage.payoutReleaseDeadlineLabel !== null ? (
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          Once approved, the money is held until {stage.payoutReleaseDeadlineLabel}{" "}
          before it reaches the professional.
        </Text>
      ) : null}
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 border-b border-line p-4 last:border-0">
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text className={strong ? "text-lg font-semibold text-text" : "text-text"}>{value}</Text>
    </View>
  );
}

function DisputedPanel({ stage, nouns }: { stage: StageView; nouns: ModeNouns }) {
  return (
    <View className="mt-6 rounded-card border border-danger-line bg-danger-surface p-4">
      <Text className="font-semibold text-text">
        You raised a problem on this {stageRowNoun(stage.kind, nouns)}
      </Text>
      <Text className="mt-1 text-sm leading-6 text-text">
        We are looking into it. This {stageRowNoun(stage.kind, nouns)}&apos;s money is on hold and
        nothing is approved automatically. The rest of the job carries on, and
        anything already paid out stays paid out.
      </Text>
      {stage.disputedAt !== null ? (
        <Text className="mt-2 text-sm text-text-secondary">Raised {stage.disputedAt}.</Text>
      ) : null}
    </View>
  );
}

const EVIDENCE_KIND_LABEL: Record<string, string> = {
  NOTE: "Note",
  PHOTO: "Photo",
  VIDEO: "Video",
  DOCUMENT: "Document",
};

function StageEvidenceList({ evidence, stageNoun }: { evidence: readonly EvidenceView[]; stageNoun: string }) {
  if (evidence.length === 0) {
    return (
      <View className="mt-3">
        <EmptyState
          title="Nothing has been submitted yet"
          compact
          description={`The professional shows their work for this ${stageNoun} here. Until they do, there is nothing for you to check.`}
        />
      </View>
    );
  }

  return (
    <View className="mt-3 gap-2">
      {evidence.map((item) => (
        <View key={item.evidenceId} className="rounded-card border border-line bg-surface p-3">
          <View className="flex-row flex-wrap items-baseline justify-between gap-2">
            <Text className="text-sm font-semibold text-text">{EVIDENCE_KIND_LABEL[item.kind] ?? item.kind}</Text>
            {item.submittedAt !== null ? (
              <Text className="text-xs text-text-muted">{item.submittedAt}</Text>
            ) : null}
          </View>
          {item.note !== null ? (
            <Text className="mt-1 text-sm leading-6 text-text">{item.note}</Text>
          ) : null}
          {item.sizeBytes !== null ? (
            <Text className="mt-1 text-xs text-text-secondary">
              {formatBytes(item.sizeBytes)}
              {item.contentType !== null ? ` · ${item.contentType}` : ""}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function WhoCameList({ shift }: { shift: ShiftDayView }) {
  return (
    <View className="mt-6">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="text-lg font-semibold text-text">Who came</Text>
        {shift.expectedCount !== null ? <Badge tone="neutral">{`${shift.expectedCount} booked`}</Badge> : null}
      </View>

      {!shift.hasCrew ? (
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          The supervisor names the crew before they arrive.
        </Text>
      ) : (
        <View className="mt-3 gap-2">
          {shift.crew.map((member) => (
            <WhoCameRow key={member.rowKey} member={member} />
          ))}
        </View>
      )}
    </View>
  );
}

function WhoCameRow({ member }: { member: ShiftCrewMemberView }) {
  return (
    <View className="flex-row items-start justify-between gap-3 rounded-card border border-line p-3">
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-text">{member.displayName}</Text>
        {member.phoneMasked !== null ? (
          <Text className="mt-0.5 text-sm text-text-secondary">{member.phoneMasked}</Text>
        ) : null}
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        {member.isSupervisor ? <Badge tone="info">Supervisor</Badge> : null}
        {member.isVerified ? <Badge tone="success">Documents checked</Badge> : null}
      </View>
    </View>
  );
}

const DISPUTE_REASON_LABEL: Record<StageDisputeReason, string> = {
  NOT_DONE: "The work was not done",
  PARTIALLY_DONE: "Only part of the work was done",
  POOR_QUALITY: "The work was done badly",
  WRONG_SCOPE: "This is not what we agreed",
  OTHER: "Something else",
};

function StageActions({
  engagementId,
  stage,
  mode,
  commercialMode: _commercialMode,
  nouns,
  deferToShiftDay,
  onDone,
}: {
  engagementId: string;
  stage: StageView;
  mode: "lead_only" | "managed" | "unknown";
  commercialMode: EngagementCommercialMode | null;
  nouns: ModeNouns;
  deferToShiftDay: boolean;
  onDone: () => void;
}) {
  const approve = useApproveStage();
  const correction = useRequestCorrection();
  const dispute = useDisputeStage();

  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [confirmingDispute, setConfirmingDispute] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [disputeReason, setDisputeReason] = useState<StageDisputeReason | null>(null);
  const [disputeNote, setDisputeNote] = useState("");

  const rowNoun = stageRowNoun(stage.kind, nouns);
  const isMaterial = stage.kind === "material_advance";

  const anyPending = approve.isPending || correction.isPending || dispute.isPending;
  const commandError = approve.error ?? correction.error ?? dispute.error;

  if (deferToShiftDay) {
    return (
      <View className="mt-6 rounded-card border border-warning-line bg-warning-surface p-4">
        <Text className="font-semibold text-text">Attendance confirmation needed</Text>
        <Text className="mt-1 text-sm leading-6 text-text">
          Please confirm the attendance and today&apos;s count above before approving this day.
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-6">
      <Text className="text-lg font-semibold text-text">Your decision</Text>

      {/* Approve */}
      {stage.canApprove ? (
        <View className="mt-3 rounded-card border border-line bg-surface p-4">
          <Text className="font-semibold text-text">
            {isMaterial ? "Everything is as agreed" : "The work is done properly"}
          </Text>
          <Text className="mt-1 text-sm leading-6 text-text-secondary">
            {mode === "managed"
              ? `Releases ${stage.amountLabel} on this ${rowNoun}. The money is held for a dispute window before reaching the professional.`
              : `Records that this ${rowNoun} was completed as agreed.`}
          </Text>
          <View className="mt-3">
            <Button
              disabled={anyPending}
              onPress={() => setConfirmingApproval(true)}
            >
              {isMaterial ? "Approve these materials" : "Approve this work"}
            </Button>
          </View>
          <ConfirmAction
            open={confirmingApproval}
            onOpenChange={setConfirmingApproval}
            title={isMaterial ? "Approve these materials?" : "Approve this work?"}
            consequence={
              mode === "managed"
                ? `This releases ${stage.amountLabel}. It is held until the dispute window closes, and then reaches the professional.`
                : "This confirms the work was completed as agreed."
            }
            confirmLabel="Yes, approve it"
            pending={approve.isPending}
            onConfirm={() => {
              approve.mutate(
                { engagementId, stageId: stage.stageId },
                {
                  onSuccess: () => {
                    setConfirmingApproval(false);
                    onDone();
                  },
                },
              );
            }}
          />
        </View>
      ) : null}

      {/* Correction */}
      {stage.canRequestCorrection ? (
        <View className="mt-3 rounded-card border border-line bg-surface p-4">
          <Text className="font-semibold text-text">Needs a change or correction</Text>
          <Text className="mt-1 text-sm leading-6 text-text-secondary">
            Sends this {rowNoun} back to the professional with your instruction. Moves no money.
          </Text>
          <Field label="What needs to be corrected" required className="mt-3">
            <Input
              value={correctionNote}
              onChangeText={setCorrectionNote}
              placeholder="Explain clearly what needs fixing"
            />
          </Field>
          <View className="mt-3">
            <Button
              variant="outline"
              disabled={!canSubmitCorrection(correctionNote) || anyPending}
              loading={correction.isPending}
              loadingLabel="Sending"
              onPress={() => {
                correction.mutate(
                  { engagementId, stageId: stage.stageId, note: correctionNote.trim() },
                  {
                    onSuccess: () => {
                      setCorrectionNote("");
                      onDone();
                    },
                  },
                );
              }}
            >
              Ask for it to be corrected
            </Button>
          </View>
        </View>
      ) : null}

      {/* Dispute */}
      {stage.canDispute ? (
        <View className="mt-3 rounded-card border border-danger-line bg-surface p-4">
          <Text className="font-semibold text-text">Something is wrong</Text>
          <Text className="mt-1 text-sm leading-6 text-text-secondary">
            {mode === "managed"
              ? `Holds ${stage.amountLabel} on this ${rowNoun} and asks us to look into it. `
              : `Records a problem on this ${rowNoun} and asks us to look into it. `}
            It stops <Text className="font-semibold">only this {rowNoun}</Text> —
            the rest of the job carries on and anything already paid out stays
            paid out. It is also the one thing that stops this being approved
            automatically.
          </Text>
          <Field label="What went wrong" required className="mt-3">
            <Select
              placeholder="Choose one"
              value={disputeReason ?? ""}
              options={DISPUTE_REASONS.map((reason) => ({
                value: reason,
                label: DISPUTE_REASON_LABEL[reason],
              }))}
              onChange={(event) =>
                setDisputeReason(
                  event.target.value === ""
                    ? null
                    : (event.target.value as StageDisputeReason),
                )
              }
            />
          </Field>
          <Field
            label="Tell us what happened"
            description={
              disputeReason === "OTHER"
                ? "Required — we cannot act on 'something else' with nothing after it."
                : "Optional, but it is what we and the professional read first."
            }
            required={disputeReason === "OTHER"}
            className="mt-3"
          >
            <Input
              value={disputeNote}
              onChangeText={setDisputeNote}
              placeholder="Describe what happened"
            />
          </Field>
          <View className="mt-3">
            <Button
              variant="danger"
              disabled={!canSubmitDispute(disputeReason, disputeNote) || anyPending}
              onPress={() => setConfirmingDispute(true)}
            >
              Raise a problem
            </Button>
          </View>
          <ConfirmAction
            open={confirmingDispute}
            onOpenChange={setConfirmingDispute}
            title={isMaterial ? "Raise a problem on these materials?" : "Raise a problem on this work?"}
            destructive
            consequence={
              mode === "managed"
                ? `${stage.amountLabel} stays where it is and does not reach the professional while we look into this. The rest of the job carries on. This ${rowNoun} will not be approved automatically.`
                : `We record the problem and look into it. Vsolve is not holding money for this job, so nothing is held back — but this ${rowNoun} will not be approved automatically.`
            }
            confirmLabel="Yes, raise it"
            pending={dispute.isPending}
            onConfirm={() => {
              if (disputeReason === null) return;
              dispute.mutate(
                {
                  engagementId,
                  stageId: stage.stageId,
                  reasonCode: disputeReason,
                  note: disputeNote.trim(),
                },
                {
                  onSuccess: () => {
                    setConfirmingDispute(false);
                    setDisputeNote("");
                    setDisputeReason(null);
                    onDone();
                  },
                },
              );
            }}
          />
        </View>
      ) : null}

      {isStageDisputed(commandError) ? (
        <View className="mt-4">
          <ErrorState
            title="This work is already disputed"
            message="A problem was raised on it, so it cannot be approved. We have re-read it — what you see now is what is actually there."
            severity="warning"
            actionLabel="Refresh"
            onAction={onDone}
            inline
          />
        </View>
      ) : isStageTransitionNotAllowed(commandError) ? (
        <View className="mt-4">
          <ErrorState
            title="That is not possible right now"
            message={`This ${nouns.stage} has moved on since this screen loaded. We have re-read it.`}
            severity="warning"
            actionLabel="Refresh"
            onAction={onDone}
            inline
          />
        </View>
      ) : (
        <View className="mt-4">
          <AccessRefusal error={commandError} attempting="do that" />
        </View>
      )}
    </View>
  );
}
