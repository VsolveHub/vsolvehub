// Ported from frontend/apps/partner/features/crew-offer/view/crew-offer-decline-dialog.tsx
import { Button, Dialog, Input, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import {
  CREW_OFFER_DECLINE_REASONS,
  asCrewOfferDeclineReasonCode,
  findCrewOfferDeclineReason,
  type CrewOfferDeclineReasonCode,
} from "../model/decline-reasons";

const NOTE_MAX = 500;

export function CrewOfferDeclineDialog({
  open,
  onOpenChange,
  onDecline,
  pending,
  error,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDecline: (input: { reasonCode: CrewOfferDeclineReasonCode; note: string }) => void;
  readonly pending: boolean;
  readonly error?: string | null;
}) {
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const chosen = findCrewOfferDeclineReason(reasonCode);
  const missing = touched && reasonCode === "";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pass on this job?"
      description="It goes to the next lead. No way back."
      footer={
        <>
          <Button variant="ghost" disabled={pending} onPress={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={pending}
            loadingLabel="Passing"
            onPress={() => {
              setTouched(true);
              const code = asCrewOfferDeclineReasonCode(reasonCode);
              if (code === null) return;
              onDecline({ reasonCode: code, note: note.trim().slice(0, NOTE_MAX) });
            }}
          >
            Pass
          </Button>
        </>
      }
    >
      <Text className="text-sm font-semibold text-text">Why?</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {CREW_OFFER_DECLINE_REASONS.map((reason) => {
          const selected = reason.code === reasonCode;
          return (
            <Pressable
              key={reason.code}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: pending }}
              disabled={pending}
              onPress={() => {
                setReasonCode(reason.code);
                setTouched(true);
              }}
              className={
                selected
                  ? "min-h-14 w-[48%] items-center justify-center rounded-2xl border border-selected bg-selected-surface px-3 py-2"
                  : "min-h-14 w-[48%] items-center justify-center rounded-2xl border border-line bg-surface px-3 py-2"
              }
            >
              <Text className="text-center text-sm font-semibold text-text">{reason.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {missing ? <Text className="mt-2 text-sm text-danger-text">Choose a reason.</Text> : null}
      {chosen ? <Text className="mt-2 text-sm text-text-secondary">{chosen.consequence}</Text> : null}
      <Input className="mt-3" value={note} onChangeText={setNote} maxLength={NOTE_MAX} placeholder="Note, if you want" />
      {error ? <Text className="mt-2 text-sm text-danger-text">{error}</Text> : null}
    </Dialog>
  );
}
