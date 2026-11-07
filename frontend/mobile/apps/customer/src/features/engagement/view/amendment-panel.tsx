// Ported from frontend/apps/customer/features/engagement/view/amendment-panel.tsx
import { describeError, isAmendmentNotActionable, useServerCountdown } from "@vsolve/query/native";
import { useCompleteOrOpenCheckout } from "@vsolve/mobile-core";
import { Badge, Button, Dialog, ErrorState, Skeleton, Text, formatMoney } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { toAmendmentsView, type AmendmentView, type EngagementView } from "../adapters";
import {
  useAcceptAmendment,
  useDeclineAmendment,
  useEngagementAmendments,
} from "../queries";
import type { ModeNouns } from "./engagement-status";

export interface AmendmentPanelProps {
  engagement: EngagementView;
  nouns: ModeNouns;
}

export function AmendmentPanel({ engagement, nouns }: AmendmentPanelProps) {
  const query = useEngagementAmendments(engagement.engagementId);
  const accept = useAcceptAmendment();
  const decline = useDeclineAmendment();
  const completeOrOpenCheckout = useCompleteOrOpenCheckout();
  const [confirming, setConfirming] = useState(false);
  const [isHandingOff, setIsHandingOff] = useState(false);

  const view = query.data === undefined ? null : toAmendmentsView(query.data);

  if (query.isPending) {
    return (
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">Changes to this job</Text>
        <Skeleton className="mt-3 h-24 w-full" />
      </View>
    );
  }

  if (view === null) {
    const presentation = describeError(query.error, "read");
    return (
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">Changes to this job</Text>
        <View className="mt-3">
          <ErrorState
            title={presentation.title}
            message={`${presentation.message} We do not know whether there is a change waiting for you, so please try again.`}
            severity={presentation.severity}
            actionLabel="Try again"
            onAction={() => void query.refetch()}
            reference={presentation.reference}
            inline
          />
        </View>
      </View>
    );
  }

  const live = view.live;

  const handleAccept = async () => {
    if (!live) return;
    try {
      const decision = await accept.mutateAsync({
        engagementId: engagement.engagementId,
        amendmentId: live.amendmentId,
      });
      setConfirming(false);
      const attemptId = decision.checkout?.payment_attempt_id ?? null;
      if (attemptId !== null) {
        setIsHandingOff(true);
        try {
          await completeOrOpenCheckout(String(attemptId));
        } finally {
          setIsHandingOff(false);
        }
      }
    } catch {
      // Mutation / handoff errors surface via accept.error / AccessRefusal.
    }
  };

  return (
    <View className="mt-8">
      <Text className="text-lg font-semibold text-text">Changes to this job</Text>

      {live === null ? (
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          Nothing is waiting for you. If the professional needs more time or the
          work changes, they send you a request here and{" "}
          <Text className="font-semibold text-text">nothing changes until you accept it.</Text>
        </Text>
      ) : (
        <LiveAmendment
          amendment={live}
          engagement={engagement}
          nouns={nouns}
          confirming={confirming}
          setConfirming={setConfirming}
          isAccepting={accept.isPending || isHandingOff}
          isDeclining={decline.isPending}
          onAccept={() => void handleAccept()}
          onDecline={() =>
            decline.mutate({
              engagementId: engagement.engagementId,
              amendmentId: live.amendmentId,
            })
          }
        />
      )}

      {isAmendmentNotActionable(accept.error ?? decline.error) ? (
        <View className="mt-3">
          <ErrorState
            title="That request has moved on"
            message="It expired, or somebody already answered it. We have re-read it — what you see now is what is actually there."
            severity="warning"
            actionLabel="Refresh"
            onAction={() => void query.refetch()}
            inline
          />
        </View>
      ) : (
        <View className="mt-3">
          <AccessRefusal error={accept.error ?? decline.error} attempting="answer this request" />
        </View>
      )}

      <PastRequests amendments={view.all} liveId={live?.amendmentId ?? null} />
    </View>
  );
}

function LiveAmendment({
  amendment,
  engagement,
  nouns,
  confirming,
  setConfirming,
  isAccepting,
  isDeclining,
  onAccept,
  onDecline,
}: {
  amendment: AmendmentView;
  engagement: EngagementView;
  nouns: ModeNouns;
  confirming: boolean;
  setConfirming: (open: boolean) => void;
  isAccepting: boolean;
  isDeclining: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const countdown = useServerCountdown(
    amendment.isDecidable ? amendment.expiresAtIso : null,
    60_000,
  );

  if (!amendment.isKnownStatus) {
    return (
      <View className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
        <Text className="font-semibold text-text">We cannot describe this change request</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          This app does not recognise the state it is in, so it is not going to
          guess. Nothing about your agreement has changed. Please contact support.
        </Text>
      </View>
    );
  }

  if (amendment.isAwaitingPayment) {
    return (
      <View className="mt-3 rounded-card border border-warning-line bg-warning-surface p-4">
        <View className="flex-row flex-wrap items-start justify-between gap-2">
          <Text className="font-semibold text-text">Waiting for your payment to clear</Text>
          <Badge tone="warning">Not agreed yet</Badge>
        </View>
        <Text className="mt-1 text-sm leading-6 text-text">
          You accepted this change and we are confirming the extra{" "}
          {amendment.deltaLabel} with your bank or UPI app. That can take a few
          minutes — <Text className="font-semibold">do not pay again.</Text> The
          work does not change until the payment is confirmed.
        </Text>
      </View>
    );
  }

  const projectedTotalPaise = engagement.stagedTotalPaise + amendment.deltaPaise;

  const consequenceText =
    amendment.direction === "charge"
      ? engagement.mode === "lead_only"
        ? `You will owe the professional ${amendment.deltaLabel} more, paid directly to them. What was agreed changes as soon as you accept.`
        : `We will ask you to pay ${amendment.deltaLabel}. Nothing about the work changes until that payment is confirmed — accepting does not change it on its own.`
      : amendment.direction === "refund"
        ? engagement.mode === "lead_only"
          ? `You will owe the professional ${amendment.deltaLabel} less. What was agreed changes as soon as you accept.`
          : `We will refund ${amendment.deltaLabel} to you, and the work is reduced after the refund is issued.`
        : "What was agreed changes. No money moves.";

  return (
    <View className="mt-3 rounded-card border-2 border-warning-line bg-surface p-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="flex-1 font-semibold text-text">
          {amendment.kind === "TIME_EXTENSION"
            ? "The professional has asked for more time"
            : amendment.kind === "CHANGE_ORDER"
              ? "The professional has proposed a change to the work"
              : "The professional has asked for a change"}
        </Text>
        <Badge tone="warning">Requested — not agreed</Badge>
      </View>

      <Text className="mt-2 text-sm leading-6 text-text">{amendment.reason}</Text>

      {amendment.lines.length > 0 ? (
        <View className="mt-3 gap-1 border-t border-line pt-3">
          {amendment.lines.map((line) => (
            <View key={line.position} className="flex-row items-baseline justify-between gap-3">
              <Text className="text-sm text-text">
                {line.title}
                {line.quantity !== 1 ? ` × ${line.quantity}` : ""}
              </Text>
              <Text className={`text-sm ${line.removesScope ? "text-success-text" : "text-text"}`}>
                {line.removesScope ? "removes " : ""}
                {line.amountLabel}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-3 rounded-card border border-line bg-surface-sunken p-3">
        <Comparison label={`Agreed for this ${nouns.engagement} now`} value={engagement.stagedTotalLabel} />
        <Comparison
          label={amendment.direction === "refund" ? "This change takes off" : "This change adds"}
          value={amendment.deltaLabel}
          tone={amendment.direction === "refund" ? "credit" : "charge"}
        />
        <Comparison
          label="If you accept, it becomes"
          value={formatMoney(projectedTotalPaise)}
          strong
        />
      </View>

      <Text className="mt-3 text-sm leading-6 text-text-secondary">
        {amendment.direction === "charge"
          ? engagement.mode === "lead_only"
            ? `You pay this professional directly, so accepting adds ${amendment.deltaLabel} to what you owe them. Vsolve does not collect it.`
            : `Accepting takes you to a payment for the extra ${amendment.deltaLabel}. The work does not change until that payment is confirmed.`
          : amendment.direction === "refund"
            ? engagement.mode === "lead_only"
              ? `Accepting reduces what you owe the professional by ${amendment.deltaLabel}.`
              : `We refund ${amendment.deltaLabel} to you first, and the work is reduced after that — so you are never owed less work than you have paid for.`
            : "Accepting changes what was agreed. No money moves either way."}
      </Text>

      {countdown !== null && !countdown.isExpired ? (
        <Text className="mt-2 text-sm text-text-secondary">
          They need an answer by {amendment.expiresAt}.
        </Text>
      ) : null}

      {amendment.isDecidable ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
          <Button onPress={() => setConfirming(true)} disabled={isAccepting || isDeclining}>
            Accept this change
          </Button>
          <Button
            variant="outline"
            onPress={onDecline}
            loading={isDeclining}
            loadingLabel="Declining"
            disabled={isAccepting}
          >
            No, leave it as agreed
          </Button>
        </View>
      ) : (
        <Text className="mt-4 text-sm text-text-secondary">
          This is no longer yours to answer.
        </Text>
      )}

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !isAccepting) setConfirming(false);
        }}
        title="Accept this change?"
        description={consequenceText}
      >
        <View className="flex-row justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onPress={() => setConfirming(false)}
            disabled={isAccepting}
          >
            Cancel
          </Button>
          <Button
            loading={isAccepting}
            loadingLabel="Accepting"
            onPress={onAccept}
          >
            Yes, accept it
          </Button>
        </View>
      </Dialog>
    </View>
  );
}

function Comparison({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "charge" | "credit";
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1">
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text
        className={
          strong
            ? "font-semibold text-text"
            : tone === "credit"
              ? "text-success-text"
              : "text-text"
        }
      >
        {value}
      </Text>
    </View>
  );
}

function PastRequests({
  amendments,
  liveId,
}: {
  amendments: readonly AmendmentView[];
  liveId: string | null;
}) {
  const past = amendments.filter((amendment) => amendment.amendmentId !== liveId);
  if (past.length === 0) return null;

  return (
    <View className="mt-6">
      <Text className="text-sm font-semibold text-text-secondary">Earlier requests</Text>
      <View className="mt-2 gap-2">
        {past.map((amendment) => (
          <View key={amendment.amendmentId} className="rounded-card border border-line p-3">
            <View className="flex-row flex-wrap items-baseline justify-between gap-2">
              <Text className="text-sm text-text">{amendment.reason}</Text>
              <Text className="text-xs text-text-muted">
                {amendment.appliedAt ?? amendment.respondedAt ?? amendment.createdAt}
              </Text>
            </View>
            <Text className="mt-1 text-sm text-text-secondary">
              {amendment.isApplied
                ? `Agreed — ${amendment.direction === "refund" ? "took off" : "added"} ${amendment.deltaLabel}`
                : amendment.status === "CUSTOMER_DECLINED"
                  ? "You said no. Nothing changed."
                  : amendment.status === "EXPIRED"
                    ? "It ran out of time. Nothing changed."
                    : "Not agreed."}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

