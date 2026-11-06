// Ported from frontend/apps/customer/features/project/view/handover-panel.tsx
import { isStageDisputed, isStageTransitionNotAllowed } from "@vsolve/query/native";
import { Badge, Button, ConfirmAction, ErrorState, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { DeliverableView, HandoverView } from "../adapters";
import { useAcceptHandover } from "../queries";

export interface HandoverPanelProps {
  engagementId: string;
  handover: HandoverView;
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
  onDone: () => void;
}

export function HandoverPanel({
  engagementId,
  handover,
  engagementNoun,
  onDone,
}: HandoverPanelProps) {
  const accept = useAcceptHandover();
  const [confirming, setConfirming] = useState(false);

  if (handover.phase === "none") return null;

  return (
    <View className="mt-8">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="text-lg font-semibold text-text">
          What the professional handed over
        </Text>
        {handover.phase === "accepted" ? (
          <Badge tone="success">You accepted this</Badge>
        ) : (
          <Badge tone="warning">Waiting for you</Badge>
        )}
      </View>

      {handover.submittedAt !== null ? (
        <Text className="mt-1 text-sm text-text-secondary">Delivered {handover.submittedAt}.</Text>
      ) : null}

      {handover.note !== null ? (
        <Text className="mt-2 text-sm leading-6 text-text">
          {handover.note}
        </Text>
      ) : null}

      {handover.deliverables.length === 0 ? (
        <Text className="mt-3 text-sm leading-6 text-text-secondary">
          This {engagementNoun} is marked as handed over, but we cannot see what
          was delivered. Do not accept it until you have — contact support with
          this {engagementNoun} and we will find out what happened.
        </Text>
      ) : (
        <View className="mt-3 gap-2">
          {handover.deliverables.map((deliverable) => (
            <DeliverableRow key={deliverable.deliverableId} deliverable={deliverable} />
          ))}
        </View>
      )}

      {handover.phase === "accepted" ? (
        <Text className="mt-3 text-sm leading-6 text-text-secondary">
          You accepted these{handover.acceptedAt === null ? "" : ` on ${handover.acceptedAt}`}. They
          stay on this {engagementNoun} for both of you.
        </Text>
      ) : (
        <>
          <Text className="mt-3 text-sm leading-6 text-text">
            Check what is here before you accept it. This {engagementNoun}{" "}
            <Text className="font-semibold text-text">cannot be closed until you do</Text>, which is
            deliberate — it is what keeps the delivery on this platform rather than in a private
            message. If something is missing or wrong, do not accept it: raise a problem on the
            stage it belongs to, which stops that stage&apos;s money while we look.
          </Text>

          {handover.deliverables.length > 0 ? (
            <View className="mt-3">
              <Button onPress={() => setConfirming(true)} disabled={accept.isPending}>
                Accept what was delivered
              </Button>
            </View>
          ) : null}

          <ConfirmAction
            open={confirming}
            onOpenChange={setConfirming}
            title="Accept these deliverables?"
            consequence={`This records that you accepted what is listed here, on this ${engagementNoun}, today. If this was the only thing outstanding it also closes the ${engagementNoun} — so do not accept it if anything is still to come.`}
            confirmLabel="Yes, I accept these"
            pending={accept.isPending}
            onConfirm={() =>
              accept.mutate(engagementId, {
                onSuccess: () => {
                  setConfirming(false);
                  onDone();
                },
              })
            }
          />
        </>
      )}

      <AcceptanceRefusal
        error={accept.error}
        engagementNoun={engagementNoun}
        onRefresh={onDone}
      />
    </View>
  );
}

function AcceptanceRefusal({
  error,
  engagementNoun,
  onRefresh,
}: {
  error: unknown;
  engagementNoun: string;
  onRefresh: () => void;
}) {
  if (error === null || error === undefined) return null;

  if (isStageDisputed(error)) {
    return (
      <View className="mt-3">
        <ErrorState
          title="A problem you raised is still open"
          message={`A stage on this ${engagementNoun} has a problem open on it, so nothing can be closed while we look at it. Your acceptance was not recorded — come back once that is settled.`}
          severity="warning"
          inline
        />
      </View>
    );
  }

  if (isStageTransitionNotAllowed(error)) {
    return (
      <View className="mt-3">
        <ErrorState
          title="Something on this project is still open"
          message={`Either there is nothing to accept, or a stage is still outstanding and this ${engagementNoun} cannot close around it. We have re-read it — what you see now is what is actually there.`}
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
      <AccessRefusal error={error} attempting="accept what was delivered" />
    </View>
  );
}

function DeliverableRow({ deliverable }: { deliverable: DeliverableView }) {
  return (
    <View className="rounded-card border border-line bg-surface p-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text className="font-medium text-text">{deliverable.title}</Text>
        {deliverable.submittedAt !== null ? (
          <Text className="text-xs text-text-secondary">{deliverable.submittedAt}</Text>
        ) : null}
      </View>
      {deliverable.milestoneLabel !== null ? (
        <Text className="mt-0.5 text-xs text-text-secondary">
          For {deliverable.milestoneLabel}
        </Text>
      ) : null}
      {deliverable.kind === "LINK" && deliverable.link !== null ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(deliverable.link!)}
          className="mt-1"
        >
          <Text className="text-sm font-semibold text-text-link underline">
            Open external link
          </Text>
        </Pressable>
      ) : deliverable.kind === "FILE" ? (
        <Text className="mt-1 text-sm text-text-secondary">
          {deliverable.fileRecordMissing
            ? "We cannot find this file on record."
            : deliverable.file?.scanStatus === "PENDING"
              ? "Scanning file for safety…"
              : "Checked and stored with Vsolve."}
        </Text>
      ) : null}
    </View>
  );
}
