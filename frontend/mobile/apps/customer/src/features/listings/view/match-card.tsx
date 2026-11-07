import { View } from "react-native";
import { Text } from "@vsolve/mobile-ui";
import { AlertTriangle } from "lucide-react-native";

import { MATCH_LOOK, type JobMatch } from "../seeker-queries";

export function MatchCard({ match }: { match: JobMatch }) {
  const look = MATCH_LOOK[match.level ?? "OTHER"] ?? MATCH_LOOK.OTHER;

  return (
    <View className="rounded-2xl border border-warm-200 bg-[#f9f7f4] p-4 gap-2.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-black text-navy-900">{match.score}% match</Text>
        <View className="rounded-full bg-warm-200 px-2.5 py-0.5">
          <Text className="text-xs font-semibold text-navy-900">
            {look?.label ?? "Match"}
          </Text>
        </View>
      </View>

      <View className="gap-1.5">
        {(match.matched ?? []).map((m) => (
          <Text key={m} className="text-xs font-semibold text-emerald-700">
            ✓ {m}
          </Text>
        ))}
        {(match.missing ?? []).map((m) => (
          <View key={m} className="flex-row items-center gap-1">
            <AlertTriangle size={11} color="#6B6560" />
            <Text className="text-xs text-text-secondary">{m}</Text>
          </View>
        ))}
      </View>

      <Text className="text-[11px] text-text-muted mt-1">
        Based on your profile and this job details. Please read the full job before applying.
      </Text>
    </View>
  );
}
