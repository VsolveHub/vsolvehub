// Ported from frontend/apps/customer/features/project/view/warranty-panel.tsx
import { Badge, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { RetentionView } from "../adapters";

export interface WarrantyPanelProps {
  retention: RetentionView;
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
}

export function WarrantyPanel({ retention, engagementNoun }: WarrantyPanelProps) {
  if (retention.phase === "none") {
    return null;
  }

  if (retention.phase === "accruing") {
    return (
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">
          Milestone sign-off
        </Text>
        <Text className="mt-1 text-sm leading-6 text-text">
          You pay every stage in full. To confirm completion,{" "}
          <Text className="font-semibold text-text">{retention.targetLabel}</Text> of
          the final milestone payout is held until final stage approval.
        </Text>
        <View className="mt-3 rounded-card border border-line bg-surface overflow-hidden">
          <Row label="Held so far" value={retention.withheldLabel} />
          <Row label="Held at completion" value={retention.targetLabel} strong />
        </View>
      </View>
    );
  }

  if (retention.phase === "held") {
    return (
      <View className="mt-8">
        <View className="flex-row flex-wrap items-start justify-between gap-2">
          <Text className="text-lg font-semibold text-text">
            Milestone sign-off: final stage approved
          </Text>
          <Badge tone="success">{retention.withheldLabel} held</Badge>
        </View>
        <Text className="mt-1 text-sm leading-6 text-text">
          The work is finished and{" "}
          <Text className="font-semibold text-text">{retention.withheldLabel}</Text> of
          the milestone payout is held pending final release.
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-8">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="text-lg font-semibold text-text">
          Milestone sign-off completed
        </Text>
        <Badge tone="neutral">Closed</Badge>
      </View>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        The {retention.withheldLabel} held has been released and this {engagementNoun} is closed.
      </Text>
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 border-b border-line p-4 last:border-0">
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text className={strong ? "text-lg font-semibold text-text" : "text-text"}>{value}</Text>
    </View>
  );
}
