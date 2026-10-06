import { Button, Text, type ButtonProps } from "@vsolve/mobile-ui";
import type { ReactNode } from "react";
import { View } from "react-native";
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
          ? "flex-row items-start gap-3.5 p-4"
          : "flex-row items-start gap-3.5 border-t border-line/80 p-4"
      }
    >
      <View className="mt-0.5 shrink-0 text-text-muted">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-text">{label}</Text>
        <View className="mt-0.5">{children}</View>
      </View>
      {actionLabel !== undefined && onAction !== undefined ? (
        <Button size="sm" variant={actionVariant} className="shrink-0" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

export function PinIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#6B6560" strokeWidth={1.75}>
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" strokeLinejoin="round" />
      <Circle cx={12} cy={10} r={3} />
    </Svg>
  );
}

export function ClockIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#6B6560" strokeWidth={1.75}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PhoneIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#6B6560" strokeWidth={1.75}>
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
