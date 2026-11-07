// Ported from frontend/apps/customer/features/quotes/view/stage-mismatch-notice.tsx
import { formatMoney, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { QuoteCardView } from "../adapters";

export function StageMismatchNotice({
  card,
  driftPaise,
}: {
  card: QuoteCardView;
  driftPaise: number;
}) {
  const scheduled = card.stages.reduce((sum, stage) => sum + stage.totalDuePaise, 0);
  const short = driftPaise < 0;
  return (
    <View
      accessibilityRole="text"
      className="rounded-[14px] border border-warning-line bg-warning-surface px-4 py-3"
    >
      <Text className="text-sm font-bold text-text">The payment stages do not match the total</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        {card.stages.length === 1 ? "The stage adds" : `The ${card.stages.length} stages add`} up to{" "}
        <Text className="font-bold text-text">{formatMoney(scheduled)}</Text>
        {" — "}
        {formatMoney(Math.abs(driftPaise))} {short ? "less" : "more"} than the {card.payableLabel} total. Ask{" "}
        {card.vendorName ?? "the professional"} which figure is right before you choose.
      </Text>
      <Text className="mt-1 text-xs leading-5 text-text-muted">
        Nothing here has been adjusted. Both figures are shown exactly as they were sent.
      </Text>
    </View>
  );
}
