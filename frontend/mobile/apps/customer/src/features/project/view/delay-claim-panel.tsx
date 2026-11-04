// Ported from frontend/apps/customer/features/project/view/delay-claim-panel.tsx
import { isDelayClaimNotActionable, useServerCountdown } from "@vsolve/query/native";
import { Badge, Button, ConfirmAction, ErrorState, Field, Text, Textarea } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { DelayClaimView } from "../adapters";
import { useDecideDelayClaim } from "../queries";

export interface DelayClaimPanelProps {
  engagementId: string;
  claims: readonly DelayClaimView[];
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
  /** "stage" / "stages". */
  stageNoun: string;
  stagesNoun: string;
  onDone: () => void;
}

export function DelayClaimPanel({
  engagementId,
  claims,
  engagementNoun,
  stageNoun,
  stagesNoun,
  onDone,
}: DelayClaimPanelProps) {
  if (claims.length === 0) return null;

  const decidable = claims.filter((claim) => claim.isDecidable);
  const settled = claims.filter((claim) => !claim.isDecidable);

  return (
    <View className="mt-8">
      <Text className="text-lg font-semibold text-text">
        {decidable.length === 0
          ? "Requests for more time"
          : decidable.length === 1
            ? "The professional has asked for more time"
            : `The professional has asked for more time on ${String(decidable.length)} ${stagesNoun}`}
      </Text>

      {decidable.length > 0 ? (
        <Text className="mt-1 text-sm leading-6 text-text">
          Answering costs nothing either way — this is about dates, not money. If
          the delay means extra work, that is a separate change to the{" "}
          {engagementNoun} you would be asked to agree and pay for.
        </Text>
      ) : null}

      <View className="mt-3 gap-4">
        {decidable.map((claim) => (
          <LiveClaim
            key={claim.claimId}
            engagementId={engagementId}
            claim={claim}
            engagementNoun={engagementNoun}
            stageNoun={stageNoun}
            stagesNoun={stagesNoun}
            onDone={onDone}
          />
        ))}
        {settled.map((claim) => (
          <SettledClaim
            key={claim.claimId}
            claim={claim}
            stageNoun={stageNoun}
            stagesNoun={stagesNoun}
          />
        ))}
      </View>
    </View>
  );
}

function LiveClaim({
  engagementId,
  claim,
  engagementNoun,
  stageNoun,
  stagesNoun,
  onDone,
}: {
  engagementId: string;
  claim: DelayClaimView;
  engagementNoun: string;
  stageNoun: string;
  stagesNoun: string;
  onDone: () => void;
}) {
  const decide = useDecideDelayClaim();
  const [confirming, setConfirming] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const countdown = useServerCountdown(claim.expiresAtIso, 60_000);

  if (!claim.isKnownStatus) {
    return (
      <View className="rounded-card border border-line bg-surface p-4">
        <Text className="text-base font-semibold text-text">We cannot describe this request</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          There is a request for more time on this {engagementNoun} and this app
          does not recognise the state it is in, so it is not going to guess.
          Nothing about your dates has changed. Please contact support.
        </Text>
      </View>
    );
  }

  const days = claim.extensionDays;
  const daysLabel = `${String(days)} ${days === 1 ? "day" : "days"}`;

  return (
    <View className="rounded-card border border-warning-line bg-warning-surface p-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="text-base font-semibold text-text">
          {daysLabel} more
          {claim.milestoneLabel === null ? "" : ` on ${claim.milestoneLabel}`}
        </Text>
        <Badge tone="warning">Asked for — not agreed</Badge>
      </View>

      {claim.description.trim() === "" ? (
        <Text className="mt-2 text-sm italic leading-6 text-text-secondary">
          The professional gave no explanation with this request. It is reasonable
          to ask for one before you answer.
        </Text>
      ) : (
        <Text className="mt-2 text-sm leading-6 text-text">
          {claim.description}
        </Text>
      )}

      {claim.reasonCode === null ? null : (
        <Text className="mt-1 text-xs text-text-secondary">Their reason: {claim.reasonCode}</Text>
      )}

      <ClaimEvidence claim={claim} />

      <View className="mt-3 rounded-card border border-line bg-surface p-4">
        <Text className="text-sm font-semibold text-text">What each answer does</Text>
        <View className="mt-2 gap-1">
          <Text className="text-sm leading-6 text-text-secondary">
            • <Text className="font-semibold text-text">Give the time:</Text> this{" "}
            {stageNoun} and <Text className="font-semibold text-text">every {stageNoun} after it</Text>{" "}
            move by {daysLabel}. A {stageNoun} that never had a date stays without
            one. The dates you originally agreed stay on record.
          </Text>
          <Text className="text-sm leading-6 text-text-secondary">
            • <Text className="font-semibold text-text">Turn it down:</Text> nothing
            changes. The dates you agreed stand. It does not cancel anything,
            penalise anybody, or move any money.
          </Text>
          <Text className="text-sm leading-6 text-text-secondary">
            • <Text className="font-semibold text-text">Either way, nothing is charged.</Text> If
            the delay means extra work, that comes to you separately as a change
            you agree and pay for.
          </Text>
        </View>
      </View>

      {countdown !== null && !countdown.isExpired && claim.expiresAt !== null ? (
        <Text className="mt-3 text-sm text-text">
          Waiting on you until {claim.expiresAt}.{" "}
          <Text className="text-text-secondary">
            If you do not answer, the request lapses and the dates you agreed
            stand — the professional can ask again.
          </Text>
        </Text>
      ) : (
        <Text className="mt-3 text-sm text-text-secondary">
          The time to answer this has run out. The dates you agreed stand.
        </Text>
      )}

      <DecisionRefusal
        error={decide.error}
        engagementNoun={engagementNoun}
        stagesNoun={stagesNoun}
        onRefresh={onDone}
      />

      <View className="mt-4 flex-row flex-wrap gap-2">
        <Button onPress={() => setConfirming("accept")} disabled={decide.isPending}>
          Give them {daysLabel}
        </Button>
        <Button
          variant="outline"
          onPress={() => setConfirming("reject")}
          disabled={decide.isPending}
        >
          Keep the dates we agreed
        </Button>
      </View>

      <ConfirmAction
        open={confirming === "accept"}
        onOpenChange={(open) => setConfirming(open ? "accept" : null)}
        title={`Move the dates by ${daysLabel}?`}
        consequence={`${
          claim.milestoneLabel === null ? `This ${stageNoun}` : claim.milestoneLabel
        } and every ${stageNoun} after it move by ${daysLabel}. Nothing is charged and no money moves. The dates you originally agreed stay on record, so the difference is always visible. This cannot be undone.`}
        confirmLabel={`Yes, give them ${daysLabel}`}
        pending={decide.isPending}
        onConfirm={() =>
          decide.mutate(
            {
              engagementId,
              delayClaimId: claim.claimId,
              accept: true,
              note: note.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(null);
                setNote("");
                onDone();
              },
            },
          )
        }
      >
        <Field
          label="Anything you want to add"
          description="Optional. The professional sees this with your answer."
        >
          <Textarea
            rows={3}
            value={note}
            onChangeText={setNote}
            maxLength={2000}
          />
        </Field>
      </ConfirmAction>

      <ConfirmAction
        open={confirming === "reject"}
        onOpenChange={(open) => setConfirming(open ? "reject" : null)}
        title="Keep the dates you agreed?"
        consequence={`Nothing changes: the ${stagesNoun}, the dates and the prices all stay exactly as they are. This does not cancel anything and does not move any money — it records that you did not agree to the extra time. The professional can ask again if something else comes up.`}
        confirmLabel="Yes, keep the dates"
        pending={decide.isPending}
        onConfirm={() =>
          decide.mutate(
            {
              engagementId,
              delayClaimId: claim.claimId,
              accept: false,
              note: note.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(null);
                setNote("");
                onDone();
              },
            },
          )
        }
      >
        <Field
          label="Why, if you would like to say"
          description="Optional, and it is not a complaint — it is what the professional sees with your answer."
        >
          <Textarea
            rows={3}
            value={note}
            onChangeText={setNote}
            maxLength={2000}
          />
        </Field>
      </ConfirmAction>
    </View>
  );
}

function SettledClaim({
  claim,
  stageNoun,
  stagesNoun,
}: {
  claim: DelayClaimView;
  stageNoun: string;
  stagesNoun: string;
}) {
  const asked = `${String(claim.extensionDays)} ${claim.extensionDays === 1 ? "day" : "days"}`;
  const applied = `${String(claim.appliedDays)} ${claim.appliedDays === 1 ? "day" : "days"}`;

  const outcome = claim.isApplied
    ? `You gave ${applied}, and the ${stagesNoun} from ${claim.milestoneLabel ?? `this ${stageNoun}`} onwards moved by that much.`
    : claim.status === "REJECTED"
      ? "You kept the dates you had agreed. Nothing moved."
      : claim.status === "EXPIRED"
        ? "Nobody answered in time, so the dates you agreed stood. Nothing moved."
        : claim.status === "WITHDRAWN"
          ? "The professional withdrew this request. Nothing moved."
          : "This app does not recognise how this request ended. Contact support if the dates matter.";

  return (
    <View className="rounded-card border border-line bg-surface p-4">
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text className="text-sm font-semibold text-text">
          {asked} asked for
          {claim.milestoneLabel === null ? "" : ` on ${claim.milestoneLabel}`}
        </Text>
        <Text className="text-xs text-text-secondary">
          {claim.decidedAt ?? claim.createdAt ?? ""}
        </Text>
      </View>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">{outcome}</Text>
      {claim.decisionNote === null ? null : (
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          You said: {claim.decisionNote}
        </Text>
      )}
    </View>
  );
}

function ClaimEvidence({ claim }: { claim: DelayClaimView }) {
  if (claim.evidence.length === 0 && claim.missingEvidenceCount === 0) return null;

  return (
    <View className="mt-3">
      <Text className="text-sm font-semibold text-text">What they sent with it</Text>
      <View className="mt-1 gap-1">
        {claim.evidence.map((evidence) => (
          <Text key={evidence.evidenceId} className="text-sm leading-6 text-text-secondary">
            {evidence.note ?? "A file"}
            {" — "}
            {evidence.scanStatus === "PENDING"
              ? "we are still checking this file is safe"
              : evidence.scanStatus === "INFECTED" || evidence.scanStatus === "FAILED"
                ? `we could not accept this file${evidence.failureReason === null ? "" : `: ${evidence.failureReason}`}`
                : evidence.isReadable
                  ? "checked and held by Vsolve; opening files from this screen is not available yet"
                  : "we cannot tell whether this file is safe to open, so we are not offering it"}
          </Text>
        ))}
        {claim.missingEvidenceCount > 0 ? (
          <Text className="text-sm leading-6 text-text-secondary">
            {claim.missingEvidenceCount === 1
              ? "One file was attached that we cannot find a record of on this project."
              : `${String(claim.missingEvidenceCount)} files were attached that we cannot find records of on this project.`}{" "}
            Do not take it on the strength of its name — ask the professional, or
            contact support.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function DecisionRefusal({
  error,
  engagementNoun,
  stagesNoun,
  onRefresh,
}: {
  error: unknown;
  engagementNoun: string;
  stagesNoun: string;
  onRefresh: () => void;
}) {
  if (error === null || error === undefined) return null;

  if (isDelayClaimNotActionable(error)) {
    return (
      <View className="mt-3">
        <ErrorState
          title="This request has already been settled"
          message={`It was answered somewhere else, or the time to answer it ran out while this page was open. Either way the ${stagesNoun} on this ${engagementNoun} are exactly as they were before you pressed anything — nothing moved. We have re-read it.`}
          severity="warning"
          actionLabel="Refresh"
          onAction={onRefresh}
          inline
        />
      </View>
    );
  }

  return (
    <View className="mt-3">
      <AccessRefusal error={error} attempting="answer this request for more time" />
    </View>
  );
}

