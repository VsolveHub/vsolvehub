// Ported from frontend/apps/customer/features/quotes/view/reject-quote-dialog.tsx
import type { RejectionReason } from "@vsolve/query/native";
import { Button, Dialog, Field, Text, Textarea } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

export interface RejectQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorName: string | null;
  replacementsRemaining: number | null;
  replacementKind: "quote" | "visit";
  onReject: (reason: RejectionReason, note: string) => void;
  isPending: boolean;
}

export function RejectQuoteDialog({
  open,
  onOpenChange,
  vendorName,
  replacementsRemaining,
  replacementKind,
  onReject,
  isPending,
}: RejectQuoteDialogProps) {
  const [note, setNote] = useState("");
  const who = vendorName ?? "this quote";
  const canReplace = replacementsRemaining !== null && replacementsRemaining > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Turn down ${who}?`}
      description="Pick the one that is true. They mean different things and only one of them gets you a replacement."
      footer={
        <Button variant="ghost" onPress={() => onOpenChange(false)}>
          Keep it for now
        </Button>
      }
    >
      <View className="gap-3">
        <Choice
          title="I would rather go with somebody else"
          body="Nothing happens to them and nothing changes on your request. You can still choose one of the others."
          actionLabel="Turn it down"
          isPending={isPending}
          onAction={() => onReject("NOT_CHOSEN", note)}
        />

        {canReplace ? (
          <Choice
            title="This ignores what I asked for"
            body={
              replacementKind === "visit"
                ? `We will send another professional to visit and estimate, free. You have ${replacementsRemaining} of these left.`
                : `We will open the slot for another professional to quote, at no extra charge. You have ${replacementsRemaining} of these left.`
            }
            actionLabel="Turn it down and replace it"
            isPending={isPending}
            onAction={() => onReject("NON_RESPONSIVE", note)}
          />
        ) : replacementsRemaining === 0 ? (
          <Text className="rounded-card border border-line bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
            You have used every free replacement on this request, so turning this one down will not bring another professional in. Talk to us if the quotes here are not usable.
          </Text>
        ) : (
          <Text className="rounded-card border border-line bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
            We cannot offer a free replacement on this request yet — we have not finished setting that rule. Turning this one down is still fine, and talk to us if none of the quotes work.
          </Text>
        )}

        <Field
          label="Anything you want to add"
          description="Optional. It goes to us, not straight to the professional."
        >
          <Textarea value={note} onChangeText={setNote} rows={3} maxLength={2000} />
        </Field>
      </View>
    </Dialog>
  );
}

function Choice({
  title,
  body,
  actionLabel,
  onAction,
  isPending,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  isPending: boolean;
}) {
  return (
    <View className="rounded-card border border-line p-3">
      <Text className="font-medium text-text">{title}</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">{body}</Text>
      <View className="mt-3">
        <Button size="sm" variant="outline" onPress={onAction} loading={isPending} loadingLabel="Sending">
          {actionLabel}
        </Button>
      </View>
    </View>
  );
}
