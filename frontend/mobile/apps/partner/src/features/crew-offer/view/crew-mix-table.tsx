// Ported from frontend/apps/partner/features/crew-offer/view/crew-mix-table.tsx
import type { Schemas } from "@vsolve/api-client";
import { Card, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

export function CrewMixTable({
  lines,
  footnote,
}: {
  readonly lines: readonly Schemas["CrewMixLine"][];
  readonly footnote?: string;
}) {
  if (lines.length === 0) return null;
  const men = lines.reduce((sum, line) => sum + line.men, 0);
  const women = lines.reduce((sum, line) => sum + line.women, 0);
  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-base font-bold text-text">Who they need</Text>
        <Text className="text-sm font-bold text-text-secondary">
          {men} {men === 1 ? "man" : "men"} · {women} {women === 1 ? "woman" : "women"}
        </Text>
      </View>
      <View className="flex-row border-b border-line pb-2">
        <Text className="flex-1 text-sm font-semibold text-text-secondary">Role</Text>
        <Text className="w-12 text-right text-sm font-semibold text-text-secondary">Men</Text>
        <Text className="w-16 text-right text-sm font-semibold text-text-secondary">Women</Text>
        <Text className="w-12 text-right text-sm font-semibold text-text-secondary">Total</Text>
      </View>
      {lines.map((line) => (
        <View key={line.role_code} className="flex-row py-1">
          <Text className="flex-1 text-sm text-text">{line.role_label}</Text>
          <Text className="w-12 text-right text-sm text-text">{line.men}</Text>
          <Text className="w-16 text-right text-sm text-text">{line.women}</Text>
          <Text className="w-12 text-right text-sm font-semibold text-text">{line.total}</Text>
        </View>
      ))}
      {footnote ? <Text className="text-sm text-text-secondary">{footnote}</Text> : null}
    </Card>
  );
}
