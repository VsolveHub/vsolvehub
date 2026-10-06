// Ported from frontend/apps/customer/features/session/view/customer-login-modal.tsx
import { useAuthStore, useMobileOtpFlow } from "@vsolve/mobile-core";
import { Dialog, Logo, OtpForm, Text } from "@vsolve/mobile-ui";
import { useEffect, useRef } from "react";
import { View } from "react-native";

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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log in to V Solve Hub"
      description="Verify your mobile number to view bookings and checkout"
    >
      <View className="mb-2">
        <Logo className="self-start" />
        <Text className="mt-3 text-xs leading-relaxed text-text-secondary">
          Use the mobile number you book with. We will text you a code — there is no password.
        </Text>
      </View>
      <OtpForm
        {...flow}
        heading="Your mobile number"
        description="We will text you a code. There is no password."
        verifyLabel="Verify & continue"
      />
    </Dialog>
  );
}
