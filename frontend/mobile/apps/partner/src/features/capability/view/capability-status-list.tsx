// Ported from frontend/apps/partner/features/capability/view/capability-status-list.tsx
import { Badge, Button, Card, cn, EmptyState, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { CapabilityPresentation } from "../adapters/capability-status";

export interface CapabilityStatusRow {
  readonly id: string;
  readonly variantName: string;
  readonly presentation: CapabilityPresentation;
}

export interface CapabilityStatusListProps {
  readonly state: AsyncState<readonly CapabilityStatusRow[]>;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function CapabilityStatusList({ state, onRetry, className }: CapabilityStatusListProps) {
  return (
    <AsyncSection
      state={state}
      label="Loading what you are approved for"
      onRetry={onRetry}
      isEmpty={(rows) => rows.length === 0}
      empty={
        <EmptyState
          title="You have not asked for any specialist work yet"
          description="Workforce and project work need approval before they switch on. Everything else on your account works as it does today."
        />
      }
    >
      {(rows) => (
        <View className={cn("flex-col gap-3", className)}>
          {rows.map((row) => (
            <CapabilityStatusCard key={row.id} row={row} />
          ))}
        </View>
      )}
    </AsyncSection>
  );
}

function CapabilityStatusCard({ row }: { row: CapabilityStatusRow }) {
  const { presentation } = row;
  return (
    <Card accessibilityLiveRegion={presentation.isWaiting ? "polite" : "assertive"} className="p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge tone={presentation.tone}>{presentation.label}</Badge>
        <Text className="text-sm font-semibold text-text">{row.variantName}</Text>
      </View>
      <Text className="mt-2 text-sm font-medium text-text">{presentation.headline}</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">{presentation.detail}</Text>
      <DecidedAt presentation={presentation} />
      <View className="flex-row flex-wrap items-center gap-3">
        <CapabilityActionControl presentation={presentation} />
        {presentation.secondaryAction ? (
          <CapabilityActionControl
            presentation={{ ...presentation, action: presentation.secondaryAction }}
            variant="secondary"
          />
        ) : null}
      </View>
    </Card>
  );
}

function DecidedAt({ presentation }: { presentation: CapabilityPresentation }) {
  if (presentation.decidedAt === null || presentation.isWaiting) return null;
  const parsed = Date.parse(presentation.decidedAt);
  if (Number.isNaN(parsed)) return null;
  return (
    <Text className="mt-2 text-xs text-text-muted">
      Decided{" "}
      {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(parsed)}
      {presentation.decisionReasonCode ? ` · reference ${presentation.decisionReasonCode}` : ""}
    </Text>
  );
}

function CapabilityActionControl({
  presentation,
  variant = "primary",
}: {
  presentation: CapabilityPresentation;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const action = presentation.action;

  switch (action.kind) {
    case "NONE":
      return null;
    case "WAIT":
      return (
        <Text className="mt-3 text-sm text-text-muted">
          Nothing to do right now. We will message you when this moves.
        </Text>
      );
    case "FIX":
    case "REQUEST_AGAIN":
      return (
        <Button
          variant={variant === "primary" ? "primary" : "ghost"}
          size="sm"
          className="mt-3"
          onPress={() => router.push(action.href as never)}
        >
          {action.label}
        </Button>
      );
    case "SUPPORT":
      return (
        <Button
          variant={variant === "primary" ? "secondary" : "ghost"}
          size="sm"
          className="mt-3"
          onPress={() => router.push("/profile" as never)}
        >
          {action.label}
        </Button>
      );
  }
}
