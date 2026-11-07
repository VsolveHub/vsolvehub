// Ported from frontend/packages/ui/src/confirm-action.tsx
import { useId, useState, type ReactNode } from "react";
import { TextInput, View } from "react-native";

import { Button } from "./button";
import { Dialog } from "./dialog";
import { Text } from "./text";

export interface ConfirmActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  pending?: boolean;
  destructive?: boolean;
  confirmPhrase?: string;
  children?: ReactNode;
}

export function ConfirmAction({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  onConfirm,
  cancelLabel = "Go back",
  pending = false,
  destructive = false,
  confirmPhrase,
  children,
}: ConfirmActionProps) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const unlocked = confirmPhrase === undefined || typed.trim() === confirmPhrase;
  const close = () => {
    setTyped("");
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={title}
      dismissable={!pending}
      footer={
        <>
          <Button variant="ghost" onPress={close} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onPress={onConfirm}
            disabled={!unlocked}
            loading={pending}
            loadingLabel="Working"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Text className="text-sm text-text-secondary">{consequence}</Text>
      {children ? <View className="mt-4">{children}</View> : null}
      {confirmPhrase !== undefined ? (
        <View className="mt-4">
          <Text nativeID={inputId} className="text-sm font-medium text-text">
            Type <Text className="font-bold">{confirmPhrase}</Text> to confirm
          </Text>
          <TextInput
            accessibilityLabelledBy={inputId}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            className="mt-1.5 h-12 w-full rounded-control border border-line bg-surface px-3 text-base text-text"
          />
        </View>
      ) : null}
    </Dialog>
  );
}
