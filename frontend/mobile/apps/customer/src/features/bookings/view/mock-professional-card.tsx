import { Badge, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

/**
 * Shown before payment while a professional is held for the visit. It states
 * only what is true at that point: someone is reserved, and their identity
 * unlocks after payment. No rating, experience or job count is shown, because
 * none is known for this person here.
 */
export function MockProfessionalCard({ serviceName }: { serviceName?: string }) {
  return (
    <View className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row items-center justify-between gap-2 border-b border-line/60 pb-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View className="size-2 rounded-full bg-success" />
          <Text className="flex-1 text-xs font-bold uppercase tracking-wider text-text">
            Professional reserved
          </Text>
        </View>
        <Badge tone="success">Verified partner</Badge>
      </View>

      <View className="mt-3 flex-row items-start gap-3.5">
        <View className="size-12 shrink-0 items-center justify-center rounded-full bg-navy-900">
          <Text className="text-lg">👨‍🔧</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-text">
            {serviceName ? `${serviceName} professional` : "Your professional"}
          </Text>
          <Text className="mt-1 text-xs leading-5 text-text-secondary">
            Name, photo and contact details unlock after payment.
          </Text>
        </View>
      </View>
    </View>
  );
}
