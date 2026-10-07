// Ported from frontend/apps/customer/features/session/view/customer-login-modal.tsx
import { useAuthStore, useMobileOtpFlow } from "@vsolve/mobile-core";
import { BlurBackdrop, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Modal, View } from "react-native";

import { CustomerLoginExperience } from "./view/customer-login-experience";

export function CustomerLoginSheet({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const flow = useMobileOtpFlow();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const wasOpenRef = useRef(open);

  useEffect(() => {
    if (!open && wasOpenRef.current) {
      flow.reset();
    }
    wasOpenRef.current = open;
  }, [open, flow]);

  useEffect(() => {
    if (open && status === "signedIn") {
      onOpenChange(false);
      onSuccess?.();
    }
  }, [open, status, onOpenChange, onSuccess]);

  if (!open) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}
    >
      <View className="flex-1 items-center justify-center px-4">
        <BlurBackdrop
          onPress={() => onOpenChange(false)}
          accessibilityLabel="Close dialog backdrop"
        />
        <CustomerLoginExperience
          flow={flow}
          variant="modal"
          mobileFocused
          onClose={() => onOpenChange(false)}
          footer={
            <Text className="text-[13px] leading-relaxed text-text-secondary">
              New here?{" "}
              <Text
                onPress={() => {
                  onOpenChange(false);
                  router.push("/catalog");
                }}
                className="font-bold text-navy-900 underline"
              >
                Browse services
              </Text>
              {" "}— you can add to your basket before signing in.
            </Text>
          }
        />
      </View>
    </Modal>
  );
}
