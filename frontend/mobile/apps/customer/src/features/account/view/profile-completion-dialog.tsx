// Ported from frontend/apps/customer/features/account/view/profile-completion-dialog.tsx
import { describeError } from "@vsolve/query/native";
import { Button, Dialog, Field, Input, Text } from "@vsolve/mobile-ui";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import { useCustomerProfile, useUpdateCustomerProfile } from "@/features/account/queries";

type CompletionPurpose = "booking" | "payment";

export function useProfileCompletionGate(purpose: CompletionPurpose): {
  run: (action: () => void) => void;
  dialog: ReactNode;
} {
  const profile = useCustomerProfile();
  const pendingAction = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const knownName = profile.data?.display_name.trim() || profile.data?.full_name.trim() || null;

  const run = useCallback(
    (action: () => void) => {
      if (profile.isPending) return;
      if (knownName !== null) {
        action();
        return;
      }
      pendingAction.current = action;
      setOpen(true);
    },
    [knownName, profile.isPending],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) pendingAction.current = null;
  }

  function handleSaved() {
    const action = pendingAction.current;
    pendingAction.current = null;
    setOpen(false);
    action?.();
  }

  return {
    run,
    dialog: (
      <ProfileCompletionDialog
        open={open}
        onOpenChange={handleOpenChange}
        onSaved={handleSaved}
        purpose={purpose}
        initialName={profile.data?.full_name || profile.data?.display_name || ""}
      />
    ),
  };
}

function ProfileCompletionDialog({
  open,
  onOpenChange,
  onSaved,
  purpose,
  initialName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  purpose: CompletionPurpose;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const updateProfile = useUpdateCustomerProfile();
  const actionLabel = purpose === "booking" ? "Save and confirm booking" : "Save and continue";

  function handleSubmit() {
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (cleanName.length < 2) {
      setFieldError("Enter the name you want on this booking.");
      return;
    }
    setFieldError(undefined);
    updateProfile.mutate({ full_name: cleanName, display_name: cleanName }, { onSuccess: onSaved });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dismissable={!updateProfile.isPending}
      title="Put a name on your booking"
      description="One detail, collected when it becomes useful."
    >
      <View className="mb-5 flex-row items-center gap-3 rounded-card bg-action-surface p-3">
        <View className="flex-1">
          <Text className="text-sm font-extrabold text-text">Booking and receipt</Text>
          <Text className="mt-0.5 text-xs font-medium leading-5 text-text-secondary">
            We use this name to address you and print your payment receipt.
          </Text>
        </View>
      </View>
      <Field label="Your name" required error={fieldError}>
        <Input value={name} autoComplete="name" maxLength={150} onChangeText={setName} />
      </Field>
      {updateProfile.isError ? (
        <Text className="mt-3 text-sm font-medium text-danger-text">{describeError(updateProfile.error, "mutation").message}</Text>
      ) : null}
      <View className="mt-4">
        <Button block loading={updateProfile.isPending} loadingLabel="Saving your name" onPress={handleSubmit}>
          {actionLabel}
        </Button>
      </View>
    </Dialog>
  );
}