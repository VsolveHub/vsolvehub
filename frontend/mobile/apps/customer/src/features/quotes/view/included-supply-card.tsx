// Ported from frontend/apps/customer/features/quotes/view/included-supply-card.tsx
import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { QuoteMaterialListRowView } from "../adapters";
import { MaterialListRows } from "./material-list-rows";

export function IncludedSupplyCard({ rows }: { rows: readonly QuoteMaterialListRowView[] }) {
  return (
    <View className="overflow-hidden rounded-[16px] border border-success-line bg-surface shadow-sm">
      <View className="flex-row gap-3 bg-success-surface px-4 py-4">
        <View className="size-10 shrink-0 items-center justify-center rounded-full bg-surface">
          <Text className="text-base text-success-text">✓</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-extrabold text-text">Materials & finish included</Text>
          <Text className="mt-1 text-sm leading-6 text-text-secondary">
            The decorator sources, delivers, installs and removes these. You do not need to buy or arrange décor materials.
          </Text>
        </View>
      </View>
      {rows.length > 0 ? (
        <View className="px-4 py-2">
          <MaterialListRows rows={rows} />
        </View>
      ) : (
        <Text className="px-4 py-3 text-sm text-text-secondary">
          The complete supply is included in the quoted work. Ask the decorator if you need a particular brand or finish recorded.
        </Text>
      )}
      <Text className="border-t border-line px-4 py-3 text-xs leading-5 text-text-muted">
        These are disclosure details, not extra charges. Their cost is already included in the estimate above.
      </Text>
    </View>
  );
}
