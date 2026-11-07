import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text, type ButtonProps } from "@vsolve/mobile-ui";
import Svg, { Circle, Path } from "react-native-svg";

export interface DetailRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: ButtonProps["variant"];
  isFirst?: boolean;
}

export function DetailRow({
  icon,
  label,
  children,
  actionLabel,
  onAction,
  actionVariant = "outline",
  isFirst = false,
}: DetailRowProps) {
  return (
    <View
      className={
        isFirst
          ? "flex-row items-start justify-between gap-3 p-5"
          : "flex-row items-start justify-between gap-3 border-t border-line/80 p-5"
      }
    >
      <View className="flex-row items-start gap-3.5 flex-1 min-w-0 pr-2">
        <View className="mt-0.5 shrink-0">{icon}</View>
        <View className="min-w-0 flex-1">
          <Text className="text-[17px] font-bold text-[#0B1B3D] leading-snug">{label}</Text>
          <View className="mt-1">{children}</View>
        </View>
      </View>
      {actionLabel !== undefined && onAction !== undefined ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          className="shrink-0 rounded-2xl border border-[#4A453E]/60 bg-white px-5 py-2.5 active:bg-[#F2EFE9]"
        >
          <Text className="text-sm font-semibold text-[#0B1B3D]">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PinIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#756C5E" strokeWidth={1.8}>
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" strokeLinejoin="round" />
      <Circle cx={12} cy={10} r={3} />
    </Svg>
  );
}

export function ClockIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#756C5E" strokeWidth={1.8}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PhoneIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#756C5E" strokeWidth={1.8}>
      <Path
        d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 4 5a2 2 0 0 1 2-2Z"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronLeftIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2}>
      <Path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
