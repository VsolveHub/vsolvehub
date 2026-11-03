import { Badge, Text } from "@vsolve/mobile-ui";
import { Calendar, Zap } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { InstantView } from "@/features/booking/adapters/windows";

export type BookingMode = "INSTANT" | "SCHEDULED";

export interface BookingModeToggleProps {
  value: BookingMode;
  onChange: (mode: BookingMode) => void;
  instant?: InstantView | null;
  disabled?: boolean;
}

export function BookingModeToggle({
  value,
  onChange,
  instant,
  disabled = false,
}: BookingModeToggleProps) {
  const isInstantAvailable = instant?.isAvailable === true;

  const unavailableReasonText = (() => {
    if (isInstantAvailable) return null;
    switch (instant?.unavailableReason) {
      case "NO_ONLINE_PARTNERS":
        return "No professionals currently online. Schedule for later instead.";
      case "OUTSIDE_OPERATING_HOURS":
        return "Outside operating hours. Schedule for later instead.";
      case "NO_CAPACITY":
        return "No instant capacity available right now. Schedule for later instead.";
      default:
        return "Instant booking is unavailable right now. Schedule for later instead.";
    }
  })();

  return (
    <View className="flex-col gap-2">
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Booking mode"
        className="flex-row rounded-xl bg-surface-muted p-1 border border-line"
      >
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: value === "INSTANT", disabled: disabled || !isInstantAvailable }}
          accessibilityLabel="Instant booking"
          disabled={disabled || !isInstantAvailable}
          onPress={() => onChange("INSTANT")}
          className={`relative flex-1 flex-row items-center justify-center gap-1.5 rounded-lg px-3 py-2 ${
            value === "INSTANT"
              ? "bg-surface shadow-xs"
              : isInstantAvailable
                ? "bg-transparent active:bg-surface/50"
                : "bg-transparent opacity-50"
          }`}
        >
          <Zap
            size={13}
            color={
              value === "INSTANT"
                ? "#00112e"
                : isInstantAvailable
                  ? "#64748B"
                  : "#94A3B8"
            }
          />
          <Text
            className={`text-xs font-bold ${
              value === "INSTANT"
                ? "text-navy-900"
                : isInstantAvailable
                  ? "text-text-secondary"
                  : "text-text-muted"
            }`}
          >
            Instant
          </Text>
          {isInstantAvailable && instant?.etaMinutes ? (
            <Badge tone="success" className="px-1.5 py-0.5">
              <Text className="text-[10px] font-bold text-emerald-800">~{instant.etaMinutes}m</Text>
            </Badge>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: value === "SCHEDULED", disabled }}
          accessibilityLabel="Scheduled booking"
          disabled={disabled}
          onPress={() => onChange("SCHEDULED")}
          className={`relative flex-1 flex-row items-center justify-center gap-1.5 rounded-lg px-3 py-2 ${
            value === "SCHEDULED"
              ? "bg-surface shadow-xs"
              : "bg-transparent active:bg-surface/50"
          }`}
        >
          <Calendar
            size={13}
            color={value === "SCHEDULED" ? "#00112e" : "#64748B"}
          />
          <Text
            className={`text-xs font-bold ${
              value === "SCHEDULED" ? "text-navy-900" : "text-text-secondary"
            }`}
          >
            Schedule
          </Text>
        </Pressable>
      </View>

      {unavailableReasonText ? (
        <Text className="px-1 text-xs leading-relaxed text-text-muted">
          {unavailableReasonText}
        </Text>
      ) : null}
    </View>
  );
}
