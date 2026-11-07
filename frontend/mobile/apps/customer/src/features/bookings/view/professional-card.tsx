// Ported from frontend/apps/customer/features/bookings/view/professional-card.tsx
import type { Schemas } from "@vsolve/api-client";
import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

export function ProfessionalCard({
  professional,
  embedded = false,
}: {
  professional: Schemas["AssignedProfessional"];
  embedded?: boolean;
}) {
  const initial = professional.display_name.trim().charAt(0).toUpperCase() || "?";

  return (
    <View
      className={
        embedded
          ? "flex-row items-center gap-4"
          : "flex-row items-center gap-4 rounded-card border border-line bg-surface p-4"
      }
    >
      <Text className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-selected-surface text-center text-lg font-bold leading-[48px] text-text-link">
        {initial}
      </Text>
      <View className="min-w-0 flex-1">
        <Text className="font-semibold text-text" numberOfLines={1}>
          {professional.display_name}
        </Text>
        {professional.headline ? (
          <Text className="text-sm text-text-secondary" numberOfLines={1}>
            {professional.headline}
          </Text>
        ) : null}
        {professional.experience_years > 0 ? (
          <Text className="text-sm text-text-secondary">
            {professional.experience_years}{" "}
            {professional.experience_years === 1 ? "year" : "years"} of experience
          </Text>
        ) : null}
      </View>
    </View>
  );
}
