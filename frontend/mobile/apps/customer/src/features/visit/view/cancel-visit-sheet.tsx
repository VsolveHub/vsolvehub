// Ported from frontend/apps/customer/features/visit/view/cancel-visit-sheet.tsx
import { Button, ErrorState, Sheet, Text, Textarea, formatMoney } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { describeCancelFailure } from "../reasons";
import { useCancelVisit, type Visit } from "../queries";

const CANCEL_REASONS = [
  "I no longer need this",
  "I booked the wrong service",
  "The timing does not work",
  "I found another option",
] as const;

const OTHER_REASON = "Something else";

function FeeSummary({ visit }: { visit: Visit }) {
  const preview = visit.cancellation_preview;

  if (!preview) {
    return (
      <Text className="text-sm leading-6 text-text-secondary">
        We could not price this cancellation. Nothing has been charged — try again in a moment.
      </Text>
    );
  }

  return (
    <View className="gap-2 rounded-control bg-surface-sunken p-4">
      <View className="flex-row items-baseline justify-between gap-4">
        <Text className="text-sm text-text-secondary">Cancellation fee</Text>
        <Text className="text-sm font-semibold text-text">
          {formatMoney(preview.fee_paise)}
        </Text>
      </View>
      <View className="flex-row items-baseline justify-between gap-4">
        <Text className="text-sm text-text-secondary">Back to you</Text>
        <Text className="text-sm font-semibold text-text">
          {formatMoney(preview.refund_paise)}
        </Text>
      </View>
      {preview.fee_waiver ? (
        <Text className="pt-1 text-sm leading-6 text-text-secondary">
          {preview.fee_waiver === "partner_released"
            ? "No fee — your professional stepped back, not you."
            : "No fee — your professional was running late."}
        </Text>
      ) : null}
      <Text className="pt-1 text-xs leading-5 text-text-secondary">
        Refunds go back to the way you paid, usually within 5–7 working days.
      </Text>
    </View>
  );
}

export function CancelVisitSheet({
  visit,
  open,
  onOpenChange,
}: {
  visit: Visit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelVisit();
  const [reason, setReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const chosen = reason === OTHER_REASON ? otherReason.trim() : (reason ?? "");
  const canContinue = chosen.length > 0;

  function close() {
    onOpenChange(false);
    setConfirming(false);
    setReason(null);
    setOtherReason("");
    cancel.reset();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={confirming ? "Cancel this visit?" : "Why are you cancelling?"}
      description={
        confirming
          ? "This cannot be undone. Here is what happens to your payment."
          : "This cancels only this visit. Anything else in your booking is unaffected."
      }
      dismissable={!cancel.isPending}
      footer={
        confirming ? (
          <View className="flex-row gap-2 justify-end w-full">
            <Button variant="ghost" disabled={cancel.isPending} onPress={() => setConfirming(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              loadingLabel="Cancelling"
              onPress={() =>
                cancel.mutate(
                  {
                    bookingId: visit.id,
                    expectedVersion: visit.version,
                    reason: chosen,
                  },
                  { onSuccess: close },
                )
              }
            >
              Cancel this visit
            </Button>
          </View>
        ) : (
          <View className="flex-row gap-2 justify-end w-full">
            <Button variant="ghost" onPress={close}>
              Keep it
            </Button>
            <Button disabled={!canContinue} onPress={() => setConfirming(true)}>
              Continue
            </Button>
          </View>
        )
      }
    >
      {cancel.isError ? (
        <ErrorState
          inline
          className="mb-4"
          title="We could not cancel this visit"
          message={describeCancelFailure(cancel.error)}
        />
      ) : null}

      {confirming ? (
        <FeeSummary visit={visit} />
      ) : (
        <View className="gap-2">
          {[...CANCEL_REASONS, OTHER_REASON].map((option) => {
            const isSelected = reason === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={option}
                aria-checked={isSelected}
                onPress={() => setReason(option)}
                className={`flex-row items-center gap-3 rounded-control border p-3 min-h-11 ${
                  isSelected
                    ? "border-action bg-surface-sunken"
                    : "border-line bg-surface active:bg-surface-hover"
                }`}
              >
                <View
                  className={`size-4 rounded-full border items-center justify-center ${
                    isSelected ? "border-action bg-action" : "border-line-strong"
                  }`}
                >
                  {isSelected ? <View className="size-2 rounded-full bg-white" /> : null}
                </View>
                <Text className="text-sm text-text">{option}</Text>
              </Pressable>
            );
          })}
          {reason === OTHER_REASON ? (
            <Textarea
              accessibilityLabel="Tell us what happened"
              className="mt-1"
              value={otherReason}
              onChangeText={setOtherReason}
              maxLength={240}
              placeholder="Tell us what happened"
            />
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

