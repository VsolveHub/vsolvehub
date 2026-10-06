// Ported from frontend/packages/ui/src/readout.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

type Tone = "neutral" | "active" | "success" | "warning" | "danger";

const tones: Record<Tone, { plate: string; rule: string; value: string }> = {
  neutral: { plate: "bg-surface border-line", rule: "bg-line-strong", value: "text-text" },
  active: { plate: "bg-surface border-signal-200", rule: "bg-action", value: "text-text" },
  success: { plate: "bg-success-surface border-success-line", rule: "bg-success-text", value: "text-success-text" },
  warning: { plate: "bg-warning-surface border-warning-line", rule: "bg-warning-text", value: "text-warning-text" },
  danger: { plate: "bg-danger-surface border-danger-line", rule: "bg-danger-text", value: "text-danger-text" },
};

const sizes = {
  sm: { value: "text-xl", label: "text-[0.6875rem]", pad: "px-3 py-2" },
  md: { value: "text-3xl", label: "text-xs", pad: "px-4 py-3" },
  lg: { value: "text-5xl", label: "text-xs", pad: "px-5 py-4" },
} as const;

export interface ReadoutProps {
  label: string;
  value: string;
  tone?: Tone;
  size?: keyof typeof sizes;
  caption?: string;
  spaced?: boolean;
  announce?: string;
  trailing?: ReactNode;
  className?: string;
}

export function Readout({
  label,
  value,
  tone = "neutral",
  size = "md",
  caption,
  spaced = false,
  announce,
  trailing,
  className,
}: ReadoutProps) {
  const t = tones[tone];
  const s = sizes[size];
  return (
    <View className={cn("relative overflow-hidden rounded-plate border", t.plate, s.pad, className)}>
      <View className={cn("absolute bottom-0 left-0 top-0 w-1", t.rule)} />
      <View className="flex-row items-end justify-between gap-3 pl-2">
        <View className="min-w-0 flex-1">
          <Text className={cn("font-semibold uppercase text-text-secondary", s.label)}>{label}</Text>
          <Text
            accessibilityElementsHidden={announce ? true : undefined}
            className={cn("mt-0.5 font-bold tabular-nums", t.value, s.value, spaced && "tracking-widest")}
          >
            {value}
          </Text>
          {announce ? <Text className="sr-only">{announce}</Text> : null}
          {caption ? <Text className="mt-1.5 text-xs text-text-secondary">{caption}</Text> : null}
        </View>
        {trailing}
      </View>
    </View>
  );
}

export function formatMoney(amountPaise: number, options: { showPaise?: boolean } = {}): string {
  const rupees = amountPaise / 100;
  const hasPaise = amountPaise % 100 !== 0;
  const showPaise = options.showPaise ?? hasPaise;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(rupees);
}

export function formatDuration(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function describeDuration(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  if (totalSeconds === 0) return "No time remaining";
  if (totalSeconds < 60) return "Less than a minute remaining";
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `About ${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest === 0
    ? `About ${hourPart} remaining`
    : `About ${hourPart} ${rest} minute${rest === 1 ? "" : "s"} remaining`;
}
