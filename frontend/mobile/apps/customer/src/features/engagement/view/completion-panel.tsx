// Ported from frontend/apps/customer/features/engagement/view/completion-panel.tsx
import { isStageDisputed, isStageTransitionNotAllowed } from "@vsolve/query/native";
import { Button, ConfirmAction, ErrorState, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { useAcceptCompletion } from "@/features/engagement/queries";
import type { EngagementView } from "@/features/engagement/adapters";
import type { ModeNouns } from "@/features/engagement/view/engagement-status";

export function CompletionPanel({
  engagement,
  nouns,
  onDone,
  embedded = false,
}: {
  engagement: EngagementView;
  nouns: ModeNouns;
  onDone: () => void;
  embedded?: boolean;
}) {
  const accept = useAcceptCompletion();
  const [confirming, setConfirming] = useState(false);

  if (engagement.status === "WARRANTY") {
    return (
      <View className="mt-8 rounded-card border border-success-line bg-success-surface p-4">
        <Text className="font-semibold text-text">You confirmed this is finished</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          {engagement.completedAt !== null ? `Confirmed ${engagement.completedAt}. ` : ""}
          The warranty period on this {nouns.engagement} is running — see below for what is still held and until when.
        </Text>
      </View>
    );
  }

  if (engagement.status === "COMPLETED" || engagement.status === "CLOSED") {
    return (
      <View className="mt-8 rounded-card border border-success-line bg-success-surface p-4">
        <Text className="font-semibold text-text">You confirmed this is finished</Text>
        {engagement.completedAt !== null ? (
          <Text className="mt-1 text-sm text-text-secondary">Confirmed {engagement.completedAt}.</Text>
        ) : null}
      </View>
    );
  }

  if (!engagement.canAcceptCompletion) return null;
  const blocker = engagement.completionBlocker;

  return (
    <View className={embedded ? "rounded-card border border-warning-line bg-warning-surface p-4" : "mt-8"}>
      <Text className="text-lg font-semibold text-text">Is this finished?</Text>
      {blocker === "disputed_stage" ? (
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          A problem you raised on one {nouns.stage} is still open, so this {nouns.engagement} cannot be closed yet — and it will not be closed around it. We settle that first, and then this comes back to you.
        </Text>
      ) : blocker === "open_stage" ? (
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          There is still a {nouns.stage} outstanding on this {nouns.engagement}. That can happen after a change is agreed — the new work keeps its own check, and confirming here would not sweep it through. It comes back to you once that {nouns.stage} is settled.
        </Text>
      ) : (
        <>
          <Text className="mt-1 text-sm leading-6 text-text-secondary">
            Every {nouns.stage} on this {nouns.engagement} has been approved and settled. Confirming closes the job and the request it came from. If something is still outstanding, do not confirm — raise a problem on the {nouns.stage} it is about instead, which stops that {nouns.stage}&apos;s money while we look.
          </Text>
          <Button className="mt-3 w-full" onPress={() => setConfirming(true)} disabled={accept.isPending}>
            Confirm it is finished
          </Button>
          <ConfirmAction
            open={confirming}
            onOpenChange={setConfirming}
            title="Confirm this job is finished?"
            consequence={`This closes the ${nouns.engagement} and the request it came from. You can still read everything that happened, and this does not give up any legal right you have — but the platform stops asking either of you for anything further.`}
            confirmLabel="Yes, it is finished"
            pending={accept.isPending}
            onConfirm={() =>
              accept.mutate(engagement.engagementId, {
                onSuccess: () => {
                  setConfirming(false);
                  onDone();
                },
              })
            }
          />
        </>
      )}
      {isStageDisputed(accept.error) ? (
        <ErrorState
          title="A problem is still open"
          message={`Somebody raised a problem on a ${nouns.stage} of this ${nouns.engagement}, so nothing can be closed while we look at it. We have re-read it — what you see now is what is actually there.`}
          severity="warning"
          actionLabel="Refresh"
          onAction={onDone}
          inline
        />
      ) : isStageTransitionNotAllowed(accept.error) ? (
        <ErrorState
          title="Something is still open"
          message={`Either a ${nouns.stage} is not settled yet, or a delivery is waiting for you to accept it, so this cannot be closed. We have re-read it — what you see now is what is actually there.`}
          severity="warning"
          actionLabel="Refresh"
          onAction={onDone}
          inline
        />
      ) : (
        <AccessRefusal error={accept.error} attempting="close this job" />
      )}
    </View>
  );
}
