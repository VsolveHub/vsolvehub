// Ported from frontend/apps/customer/features/engagement/view/agreement-history.tsx
import { Badge, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { toAgreementHistory, type AmendmentsView, type EngagementView } from "@/features/engagement/adapters";

export function AgreementHistory({
  engagement,
  amendments,
  originalTotalPaise,
}: {
  engagement: EngagementView;
  amendments: AmendmentsView;
  originalTotalPaise: number;
}) {
  const versions = toAgreementHistory(engagement, amendments, originalTotalPaise);
  if (versions.length === 1) {
    return (
      <Text className="mt-2 text-sm leading-6 text-text-secondary">What you agreed has not changed since it was signed.</Text>
    );
  }
  return (
    <View className="mt-3 gap-2">
      {versions.map((version) => (
        <View key={version.version} className="rounded-card border border-line bg-surface p-4">
          <View className="flex-row flex-wrap items-start justify-between gap-2">
            <View className="min-w-0">
              <Text className="font-semibold text-text">{version.title}</Text>
              {version.at !== null ? <Text className="mt-0.5 text-sm text-text-secondary">{version.at}</Text> : null}
            </View>
            <View className="flex-row items-center gap-2">
              {version.version === 0 ? (
                <Badge tone="neutral">Original</Badge>
              ) : (
                <Badge tone={version.removesScope ? "success" : "info"}>
                  {`${version.removesScope ? "−" : "+"}${version.changeLabel}`}
                </Badge>
              )}
              <Text className="font-semibold text-text">{version.totalLabel}</Text>
            </View>
          </View>
          {version.reason !== null ? <Text className="mt-2 text-sm leading-6 text-text-secondary">{version.reason}</Text> : null}
          {version.lines.length > 0 ? (
            <View className="mt-2 gap-1 border-t border-line pt-2">
              {version.lines.map((line) => (
                <View key={line.position} className="flex-row items-baseline justify-between gap-3">
                  <Text className="text-sm text-text-secondary">
                    {line.title}
                    {line.quantity !== 1 ? ` × ${line.quantity}` : ""}
                  </Text>
                  <Text className="text-sm text-text-secondary">
                    {line.removesScope ? "removes " : ""}
                    {line.amountLabel}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
