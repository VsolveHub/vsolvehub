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
    return (
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">
          After the work is finished
        </Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          Vsolve is not holding any money back on this {engagementNoun} against a
          warranty. That is not the same as saying there is no guarantee on the
          work — whatever the estimate you accepted says about that still stands
          between you and the professional. If something goes wrong, contact
          support and we will take it from there.
        </Text>
      </View>
    );
  }

  if (retention.phase === "accruing") {
    return (
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">
          Money held back for the warranty
        </Text>
        <Text className="mt-1 text-sm leading-6 text-text">
          You pay every stage in full, and{" "}
          <Text className="font-semibold text-text">{retention.targetLabel}</Text> of what
          the professional earns is held by Vsolve until the warranty period is
          over. It builds up as each stage is approved, and it is complete when
          the last one is.
        </Text>
        <View className="mt-3 rounded-card border border-line bg-surface overflow-hidden">
          <Row label="Held so far" value={retention.withheldLabel} />
          <Row label="Held by the end" value={retention.targetLabel} strong />
        </View>
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          The warranty has not started yet, so there is no release date to show.
          It begins when the work is finished and you confirm it.
        </Text>
      </View>
    );
  }

  if (retention.phase === "held") {
    return (
      <View className="mt-8">
        <View className="flex-row flex-wrap items-start justify-between gap-2">
          <Text className="text-lg font-semibold text-text">
            Your warranty is running
          </Text>
          <Badge tone="success">{retention.withheldLabel} held</Badge>
        </View>
        <Text className="mt-1 text-sm leading-6 text-text">
          The work is finished and{" "}
          <Text className="font-semibold text-text">{retention.withheldLabel}</Text> of
          what the professional earned is still held by Vsolve
          {retention.warrantyEndsAt === null ? (
            "."
          ) : (
            <>
              {" "}
              until <Text className="font-semibold text-text">{retention.warrantyEndsAt}</Text>.
            </>
          )}
          {" "}It is released to them when the warranty period ends, and this{" "}
          {engagementNoun} closes at the same moment.
        </Text>
        {retention.warrantyEndsAt === null ? (
          <Text className="mt-2 text-sm leading-6 text-text-secondary">
            We do not have an end date for this warranty on file, so we are not
            going to show you one. The money stays held until we do. Contact
            support and quote this {engagementNoun} if you need the date.
          </Text>
        ) : null}
        <FaultRoute engagementNoun={engagementNoun} />
      </View>
    );
  }

  return (
    <View className="mt-8">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="text-lg font-semibold text-text">
          The warranty period is over
        </Text>
        <Badge tone="neutral">Closed</Badge>
      </View>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        The {retention.withheldLabel} Vsolve was holding has been released to the
        professional and this {engagementNoun} is closed. Everything that
        happened on it stays readable for both of you. If something has gone
        wrong since, contact support — this closes the platform&apos;s side of it
        and gives up no legal right you have.
      </Text>
    </View>
  );
}

function FaultRoute({ engagementNoun }: { engagementNoun: string }) {
  return (
    <View className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
      <Text className="text-sm font-semibold text-text">If something goes wrong</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        Reporting a warranty fault is not something you can do from this screen —
        contact support with this {engagementNoun} and tell them what has
        happened. Do it before the warranty ends: after that date the money is
        released and there is nothing held to put right against.
      </Text>
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between border-b border-line p-3.5 last:border-b-0">
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text className={strong ? "text-base font-semibold text-text" : "text-sm text-text"}>
        {value}
      </Text>
    </View>
  );
}
