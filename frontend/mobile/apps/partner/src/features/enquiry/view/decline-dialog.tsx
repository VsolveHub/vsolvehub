// Ported from frontend/apps/partner/features/enquiry/view/decline-dialog.tsx
import { Button, Dialog, Field, Select, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import {
  DECLINE_REASONS,
  asDeclineReasonCode,
  findDeclineReason,
  type DeclineReasonCode,
} from "../model/decline-reasons";

export interface DeclineDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDecline: (reasonCode: DeclineReasonCode) => void;
  readonly pending: boolean;
  readonly error?: string | null;
}

export function DeclineDialog({ open, onOpenChange, onDecline, pending, error }: DeclineDialogProps) {
  const [reasonCode, setReasonCode] = useState("");
  const [touched, setTouched] = useState(false);
  const chosen = findDeclineReason(reasonCode);
  const missing = touched && reasonCode === "";

  const submit = () => {
    setTouched(true);
    const code = asDeclineReasonCode(reasonCode);
    if (code === null) return;
    onDecline(code);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Decline this enquiry"
      description="Your quote slot goes back to the pool and Vsolve invites another vendor. You cannot take this one back."
      dismissable
      footer={
        <>
          <Button variant="ghost" onPress={() => onOpenChange(false)} disabled={pending}>Keep it</Button>
          <Button variant="danger" onPress={submit} loading={pending} loadingLabel="Declining" disabled={pending}>Decline</Button>
        </>
      }
    >
      <View className="flex-col gap-3">
        <Field label="Why are you turning this down?" required error={missing ? "Pick a reason so we stop sending you work that does not fit." : undefined}>
          <Select
            placeholder="Choose a reason"
            value={reasonCode}
            options={DECLINE_REASONS.map((reason) => ({ value: reason.code, label: reason.label }))}
            onChange={(event) => {
              setReasonCode(event.target.value);
              setTouched(true);
            }}
            disabled={pending}
          />
        </Field>
        {chosen ? <Text className="text-sm leading-6 text-text-secondary">{chosen.consequence}</Text> : null}
        {error ? <Text accessibilityRole="alert" className="text-sm leading-6 text-danger-text">{error}</Text> : null}
      </View>
    </Dialog>
  );
}
