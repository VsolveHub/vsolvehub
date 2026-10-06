// Ported from frontend/apps/customer/features/session/view/customer-login-modal.tsx
import { useMobileOtpFlow } from "@vsolve/mobile-core";
import { OtpForm, Sheet } from "@vsolve/mobile-ui";

export function CustomerLoginSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const flow = useMobileOtpFlow();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log in to V Solve Hub"
      description="Verify your mobile number to view bookings and checkout"
    >
      <OtpForm {...flow} heading="Your mobile number" verifyLabel="Verify & continue" />
    </Sheet>
  );
}
