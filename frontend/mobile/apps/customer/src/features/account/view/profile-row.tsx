import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@vsolve/mobile-ui";
import Svg, { Path } from "react-native-svg";

export interface ProfileRowProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  accessory?: ReactNode;
  accessibilityLabel?: string;
}

export function ProfileRow({
  icon,
  title,
  subtitle,
  onPress,
  destructive = false,
  accessory,
  accessibilityLabel,
}: ProfileRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      className="flex-row items-center justify-between p-4 active:bg-surface-sunken"
    >
      <View className="flex-1 flex-row items-center gap-3 pr-2">
        {icon ? (
          <View className="size-9 shrink-0 items-center justify-center rounded-xl">
            {icon}
          </View>
        ) : null}
        <View className="min-w-0 flex-1">
          <Text
            className={`text-sm font-bold ${
              destructive ? "text-red-600" : "text-navy-900"
            }`}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {accessory ?? (
        <Svg
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="#6B6560"
          strokeWidth={2}
        >
          <Path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </Pressable>
  );
}
