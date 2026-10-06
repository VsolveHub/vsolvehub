// Ported from frontend/apps/customer/features/crew/view/wage-line.tsx
import { Text } from "@vsolve/mobile-ui";

export function WageLine({ className = "" }: { className?: string }) {
  return (
    <Text className={`text-xs leading-5 text-text-secondary ${className}`.trim()}>
      Paid to the crew directly — Vsolve holds none of it.
    </Text>
  );
}
