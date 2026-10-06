// Ported from frontend/apps/customer/features/checkout/view/money.tsx
import type { Schemas } from "@vsolve/api-client";
import { Text, formatMoney } from "@vsolve/mobile-ui";

export function Money({
  value,
  className,
}: {
  value: Schemas["Money"];
  className?: string;
}) {
  if (value.currency !== "INR") {
    return (
      <Text className={className}>
        {value.currency} {value.amount_paise / 100}
      </Text>
    );
  }
  return <Text className={className}>{formatMoney(value.amount_paise)}</Text>;
}
