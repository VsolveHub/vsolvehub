// Ported from frontend/apps/partner/features/earnings/view/earnings-chart.tsx
import { formatMoney, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { PartnerPerformance } from "../queries";

type ServerDailyPerformance = PartnerPerformance["daily"][number];

export interface DailyEarning {
  /** Local `YYYY-MM-DD`, used as the identity of a column. */
  date: string;
  label: string;
  netPaise: number;
}

/**
 * Adapts the server's daily series into columns.
 */
export function toDailyEarnings(daily: readonly ServerDailyPerformance[]): DailyEarning[] {
  return daily.map((row) => ({
    date: row.date,
    label: new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
    netPaise: row.net_paise,
  }));
}

export function EarningsChart({ days }: { days: readonly DailyEarning[] }) {
  const peak = Math.max(...days.map((day) => day.netPaise), 0);
  const total = days.reduce((sum, day) => sum + day.netPaise, 0);

  if (total === 0) {
    return (
      <View className="rounded-card border border-line bg-surface-sunken p-4">
        <Text className="text-sm text-text-secondary">
          No earnings in the last 7 days yet. Finished jobs show up here.
        </Text>
      </View>
    );
  }

  return (
    <View className="m-0">
      <Text className="text-sm text-text-secondary">
        Last 7 days ·{" "}
        <Text className="font-semibold text-text">
          {formatMoney(total)}
        </Text>{" "}
        earned
      </Text>

      <View
        className="mt-4 flex-row items-end gap-2"
        accessibilityRole="summary"
        accessibilityLabel="Earnings by day"
      >
        {days.map((day) => {
          const heightPercent = peak === 0 ? 0 : (day.netPaise / peak) * 100;
          const isPeak = day.netPaise === peak && peak > 0;

          return (
            <View
              key={day.date}
              className="flex-1 flex-col items-center gap-2"
              accessibilityLabel={`${day.label}: ${day.netPaise === 0 ? "nothing" : formatMoney(day.netPaise)}`}
            >
              {/* Only the best day carries a number */}
              <Text
                numberOfLines={1}
                className={`text-[10px] font-semibold ${isPeak ? "text-text" : "opacity-0"}`}
              >
                {formatMoney(day.netPaise)}
              </Text>

              <View className="h-28 w-full items-end justify-end rounded-t bg-surface-sunken overflow-hidden">
                <View
                  className="w-full rounded-t bg-navy-600"
                  style={{ height: `${Math.max(heightPercent, day.netPaise > 0 ? 6 : 2)}%` }}
                />
              </View>

              <Text className="text-[11px] text-text-secondary">
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
