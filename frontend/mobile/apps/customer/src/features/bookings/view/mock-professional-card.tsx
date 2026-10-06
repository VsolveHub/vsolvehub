// Ported from frontend/apps/customer/features/bookings/view/mock-professional-card.tsx
import { Badge, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

export function MockProfessionalCard({ serviceName }: { serviceName?: string }) {
  return (
    <View className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row items-center justify-between gap-2 border-b border-line/60 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-2 rounded-full bg-success" />
          <Text className="text-xs font-bold uppercase tracking-wider text-text">
            Professional Held & Assigned
          </Text>
        </View>
        <Badge tone="success">Verified Pro</Badge>
      </View>

      <View className="mt-3 flex-row items-start gap-3.5">
        <View className="relative size-12 shrink-0 items-center justify-center rounded-full border-2 border-white bg-navy-900">
          <Text className="text-lg">👨‍🔧</Text>
          <View className="absolute -bottom-1 -right-1 size-5 items-center justify-center rounded-full bg-success">
            <Text className="text-[10px] font-bold text-white">✓</Text>
          </View>
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-bold text-text">Verified Professional</Text>
            <Text className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-600">
              ★ 4.9
            </Text>
          </View>
          <Text className="mt-0.5 text-xs text-text-secondary">
            {serviceName ? `${serviceName} Specialist · ` : ""}5+ yrs experience · 500+ jobs
          </Text>
          <View className="mt-2 flex-row items-center gap-1.5 rounded-md border border-line/50 bg-surface-sunken px-2 py-1">
            <Text className="text-xs">🔒</Text>
            <Text className="text-[11px] text-text-secondary" numberOfLines={1}>
              Full name, photo & direct contact unlock after payment
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
